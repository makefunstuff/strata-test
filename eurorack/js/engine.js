// eurorack/js/engine.js — main-thread side of the synth.
//
// Owns the AudioContext + one 'eurorack' AudioWorkletNode, serialises the rack into the
// worklet's graph format (params merged with their defaults, so the worklet needs no
// catalogue), forwards knob/patch/note messages, and renders patches offline — the same
// path serves WAV export and the headless level checks, so what you hear is what is tested.

import { defaultParams, paramSpec } from "./defs.js";

const WORKLET_URL = new URL("./worklet.js", import.meta.url);

export function toWorkletPatch(patch) {
  const params = {};
  const spec = {};
  for (const m of patch.modules) {
    params[m.id] = { ...defaultParams(m.type), ...(m.params || {}) };
    spec[m.type] = paramSpec(m.type);
  }
  return {
    modules: patch.modules.map(({ id, type }) => ({ id, type })),
    params,
    cables: (patch.cables || []).map(({ src, dst }) => ({ src, dst })),
    bpm: patch.bpm ?? 104,
    seed: 0x51ed270b,                                  // fixed: renders are reproducible
    paramSpec: spec,
  };
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.ready = false;
    this.onLevels = null;      // ({lv:number[], scope:number[], seq:{id:step}}) => void
    this._pendingPatch = null;
  }

  async start(patch) {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    await this.ctx.audioWorklet.addModule(WORKLET_URL);
    this.node = new AudioWorkletNode(this.ctx, "eurorack", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { patch: toWorkletPatch(patch) },
    });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.node.connect(this.gain).connect(this.ctx.destination);
    this.node.port.onmessage = (e) => {
      if (e.data?.t === "lv" && this.onLevels) this.onLevels(e.data);
    };
    this.ready = true;
    if (this._pendingPatch) {                           // edits made before audio started are not dropped
      this.node.port.postMessage({ t: "patch", patch: toWorkletPatch(this._pendingPatch) });
      this._pendingPatch = null;
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state !== "running") { try { await this.ctx.resume(); } catch { /* autoplay policy */ } }
  }

  setPatch(patch) {
    if (this.node) this.node.port.postMessage({ t: "patch", patch: toWorkletPatch(patch) });
    else this._pendingPatch = patch;
  }
  setParam(m, p, v) { this.node?.port.postMessage({ t: "param", m, p, v }); }
  setBpm(v) { this.node?.port.postMessage({ t: "bpm", v }); }
  note(on, note, vel) { this.node?.port.postMessage({ t: "note", on, note, vel }); }

  // Render a patch offline: the same worklet graph, deterministic seed, so presets,
  // WAV export and the headless checks all measure exactly the audio you hear.
  static async renderOffline(patch, seconds = 4, sampleRate = 48000) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
    await ctx.audioWorklet.addModule(WORKLET_URL);
    const node = new AudioWorkletNode(ctx, "eurorack", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { patch: toWorkletPatch(patch) },
    });
    // collect the worklet's own telemetry during the render: the proof uses it to see
    // whether sequencers actually walked their steps, not just whether it was loud
    const steps = new Set();
    let teleN = 0;
    node.port.onmessage = (e) => {
      const d = e.data;
      if (d?.t !== "lv") return;
      teleN++;
      if (d.seq) for (const id in d.seq) steps.add(`${id}:${d.seq[id]}`);
    };
    node.connect(ctx.destination);
    const buf = await ctx.startRendering();
    // Chromium leaks the worklet side of an OfflineAudioContext until the context is closed
    // (a pile of preset renders or WAV exports takes the renderer down without this).
    try { await ctx.close(); } catch { /* older builds */ }
    return { sampleRate, left: buf.getChannelData(0), right: buf.getChannelData(1), steps: [...steps], teleN };
  }

  static wav(left, right, sampleRate) {
    const n = left.length;
    const bytes = 44 + n * 2 * 2;
    const ab = new ArrayBuffer(bytes);
    const dv = new DataView(ab);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, "RIFF"); dv.setUint32(4, bytes - 8, true); wstr(8, "WAVE");
    wstr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 4, true);
    dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
    wstr(36, "data"); dv.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      const l = Math.max(-1, Math.min(1, left[i]));
      const r = Math.max(-1, Math.min(1, right[i]));
      dv.setInt16(o, l * 32767, true); dv.setInt16(o + 2, r * 32767, true); o += 4;
    }
    return new Blob([ab], { type: "audio/wav" });
  }

  static levels(left, right) {
    let peak = 0, sum = 0, clipped = 0;
    for (let i = 0; i < left.length; i++) {
      const a = Math.abs(left[i]), b = Math.abs(right[i] ?? left[i]);
      const m = Math.max(a, b);
      if (m > peak) peak = m;
      if (m > 0.985) clipped++;
      sum += a * a;
    }
    return { peak, rms: Math.sqrt(sum / left.length), clippedFrac: clipped / left.length };
  }

  // Energy onsets: local peaks of a 10 ms RMS envelope standing above a 250 ms moving
  // average — a cheap stand-in for "something keeps happening", which loudness alone
  // cannot prove (a frozen gate is loud too, and delay tails never go quiet).
  static onsets(left, sampleRate) {
    const win = Math.max(1, Math.floor(0.01 * sampleRate));
    const env = new Float32Array(Math.ceil(left.length / win));
    for (let w = 0; w < env.length; w++) {
      let s = 0;
      for (let k = 0; k < win && w * win + k < left.length; k++) s += left[w * win + k] * left[w * win + k];
      env[w] = Math.sqrt(s / win);
    }
    const avgWin = Math.max(1, Math.floor(0.25 * sampleRate / win));   // 250 ms context
    const refr = Math.max(1, Math.floor(0.05 * sampleRate / win));     // 50 ms refractory
    let n = 0, last = -refr - 1;
    for (let w = 1; w < env.length - 1; w++) {
      let avg = 0;
      for (let k = Math.max(0, w - avgWin); k < Math.min(env.length, w + avgWin); k++) avg += env[k];
      avg /= Math.min(env.length, w + avgWin) - Math.max(0, w - avgWin);
      if (env[w] > env[w - 1] && env[w] >= env[w + 1] && env[w] > avg * 1.6 + 0.02 && w - last >= refr) {
        n++; last = w;
      }
    }
    return n;
  }
}
