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
    node.connect(ctx.destination);
    const buf = await ctx.startRendering();
    // Chromium leaks the worklet side of an OfflineAudioContext until the context is closed
    // (a pile of preset renders or WAV exports takes the renderer down without this).
    try { await ctx.close(); } catch { /* older builds */ }
    return { sampleRate, left: buf.getChannelData(0), right: buf.getChannelData(1) };
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
}
