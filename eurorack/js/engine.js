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
    this.lastError = null;
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
      const d = e.data;
      if (d?.t === "lv" && this.onLevels) this.onLevels(d);
      else if (d?.t === "err") { this.lastError = d.msg; console.error("[worklet]", d.msg); }
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
    // (spectrum/onsets are computed from left by the caller — Engine.spectrum/Engine.onsets)
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
    // every metric is two-channel: a preset patched entirely to R used to be
    // measured from the silent L — peak, rms, spectrum and onsets all said "quiet"
    let peak = 0, sum = 0, clipped = 0;
    let sLL = 0, sRR = 0, sLR = 0, meanL = 0, meanR = 0;
    for (let i = 0; i < left.length; i++) {
      const l = left[i], rr = right ? (right[i] ?? l) : l;
      const m = Math.max(Math.abs(l), Math.abs(rr));
      if (m > peak) peak = m;
      if (m > 0.985) clipped++;
      sum += m * m;
      meanL += l; meanR += rr;
    }
    meanL /= left.length; meanR /= left.length;
    for (let i = 0; i < left.length; i++) {
      const l = left[i] - meanL, rr = (right ? (right[i] ?? left[i]) : left[i]) - meanR;
      sLL += l * l; sRR += rr * rr; sLR += l * rr;
    }
    const denom = Math.sqrt(sLL * sRR);
    const corr = denom > 1e-12 ? sLR / denom : 1;   // 1.0 = dual mono
    return { peak, rms: Math.sqrt(sum / left.length), clippedFrac: clipped / left.length, corr };
  }

  // Band energy of a rendered buffer: bass (<125 Hz) vs playable band (125 Hz–4 kHz).
  // Loudness alone cannot tell a preset from a subsonic rumble — this can.
  static spectrumStereo(left, right, sampleRate) {          // average of both channels' band splits
    const a = Engine.spectrum(left, sampleRate);
    if (!right) return a;
    const b = Engine.spectrum(right, sampleRate);
    return {
      bassFrac: (a.bassFrac + b.bassFrac) / 2,
      midFrac: (a.midFrac + b.midFrac) / 2,
      subFrac: (a.subFrac + b.subFrac) / 2,
    };
  }

  static spectrum(left, sampleRate) {
    const N = 2048, hop = 1024;
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const re = new Float64Array(N), im = new Float64Array(N);
    const bits = Math.log2(N) | 0;
    const bitrev = (x) => { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((x >> b) & 1); return r; };
    let bass = 0, mid = 0, sub = 0, total = 0;
    for (let off = 0; off + N <= left.length; off += hop) {
      for (let i = 0; i < N; i++) { re[i] = left[off + i] * win[i]; im[i] = 0; }
      for (let i = 0; i < N; i++) { const j = bitrev(i); if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
          let cwr = 1, cwi = 0;
          for (let k = 0; k < len / 2; k++) {
            const ar = re[i + k], ai = im[i + k];
            const br = re[i + k + len / 2], bi = im[i + k + len / 2];
            const xr = br * cwr - bi * cwi, xi = br * cwi + bi * cwr;
            re[i + k] = ar + xr; im[i + k] = ai + xi;
            re[i + k + len / 2] = ar - xr; im[i + k + len / 2] = ai - xi;
            const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
          }
        }
      }
      for (let b = 1; b < N / 2; b++) {
        const pw = re[b] * re[b] + im[b] * im[b];
        const f = (b * sampleRate) / N;
        total += pw;
        if (f < 30) sub += pw;
        if (f < 125) bass += pw;
        else if (f <= 4000) mid += pw;
      }
    }
    return { bassFrac: total ? bass / total : 0, midFrac: total ? mid / total : 0, subFrac: total ? sub / total : 0 };
  }

  // Energy onsets: local peaks of a 10 ms RMS envelope standing above a 250 ms moving
  // average — a cheap stand-in for "something keeps happening", which loudness alone
  // cannot prove (a frozen gate is loud too, and delay tails never go quiet).
  static onsets(left, sampleRate, right) {
    const win = Math.max(1, Math.floor(0.01 * sampleRate));
    const env = new Float32Array(Math.ceil(left.length / win));
    for (let w = 0; w < env.length; w++) {
      let s = 0;
      for (let k = 0; k < win && w * win + k < left.length; k++) {
        const i = w * win + k;
        const m = Math.max(Math.abs(left[i]), right ? Math.abs(right[i]) : 0);   // both channels count
        s += m * m;
      }
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
