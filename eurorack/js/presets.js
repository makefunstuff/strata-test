// eurorack/js/presets.js — five patches that make real music out of the box.
//
// Data only: modules on rails with tuned params plus the cables between them. Pitch CV is
// 0..1 over six octaves from C1, so 0.5 ≈ middle C. Cutoffs and times are given in the
// same normalised space the knobs use (see js/defs.js formatters for the physical units).

const M = (id, type, row, col, params = {}) => ({ id, type, row, col, params });
const C = (id, sm, sj, dm, dj, color) => ({ id, src: { m: sm, j: sj }, dst: { m: dm, j: dj }, color: color ?? 0 });

// normalised helpers for readability
const hz = (f) => Math.log(f / 20) / Math.log(1200);          // filter/knob cutoff space
const ms = (t) => Math.log(t / 0.5) / Math.log(6000);          // delay time space


export const PRESETS = {
  "Acid Groove": {
    v: 1, name: "Acid Groove", bpm: 126,
    modules: [
      M("clk", "clock", 0, 0),
      M("sqA", "seq", 0, 8, {
        glide: 0.32, len: 1,
        p0: 0.25, p1: 0.25, p2: 0.27, p3: 0.25, p4: 0.33, p5: 0.25, p6: 0.29, p7: 0.25,
        p8: 0.25, p9: 0.25, p10: 0.38, p11: 0.25, p12: 0.35, p13: 0.25, p14: 0.27, p15: 0.31,
        g0: 1, g1: 0, g2: 1, g3: 1, g4: 1, g5: 0, g6: 1, g7: 0,
        g8: 1, g9: 0, g10: 1, g11: 1, g12: 1, g13: 0, g14: 1, g15: 1,
      }),
      M("q1", "quant", 0, 32, { scale: 0 }),
      M("vco", "vco", 0, 40, { oct: 0.66, coarse: 0.5, fine: 0.5, pw: 0.3, fmd: 0 }),
      M("flt", "filter", 0, 54, { cut: 0.17, res: 0.58, cvamt: 0.95, mode: 0 }),
      M("env", "adsr", 0, 66, { a: 0.02, d: 0.28, s: 0.18, r: 0.22 }),
      M("vca", "vca", 0, 76, { gain: 0.32 }),
      M("dly", "delay", 1, 0, { time: ms(166), fb: 0.6, damp: 0.5, mix: 0.42 }),
      M("kik", "kick", 1, 12, { tune: 0.42, decay: 0.36, level: 0.95 }),
      M("hat", "hat", 1, 22, { decay: 0.16, tone: 0.62, level: 0.5 }),
      M("rvt", "reverb", 1, 28, { size: 0.5, decay: 0.3, damp: 0.55, mix: 0.35 }),
      M("out", "out", 1, 42, { level: 0.78 }),
    ],
    cables: [
      C("k1", "clk", "t16", "sqA", "clk", 0),
      C("k2", "sqA", "pitch", "q1", "in", 1),
      C("k3", "q1", "out", "vco", "v", 1),
      C("k4", "sqA", "gate", "env", "g", 2),
      C("k5", "vco", "saw", "flt", "in", 3),
      C("k6", "env", "e", "flt", "cv", 4),
      C("k7", "env", "e", "vca", "cv", 4),
      C("k8", "flt", "out", "vca", "in", 5),
      C("k9", "vca", "out", "dly", "in", 6),
      C("k10", "clk", "b", "kik", "trig", 7),
      C("k11", "clk", "b", "hat", "trig", 0),
      C("k12", "dly", "out", "out", "l", 1),
      C("k13", "vca", "out", "out", "r", 2),
      C("k14", "kik", "out", "out", "l", 3),
      C("k15", "hat", "out", "out", "r", 4),
      C("k16", "dly", "out", "rvt", "in", 5),
      C("k17", "rvt", "out", "out", "r", 6),
    ],
  },

  "Pluck & Space": {
    v: 1, name: "Pluck & Space", bpm: 120,
    modules: [
      M("clk", "clock", 0, 0),
      M("sq", "seq", 0, 8, {
        glide: 0.05, len: 1,
        p0: 0.46, p1: 0.56, p2: 0.43, p3: 0.6, p4: 0.46, p5: 0.7, p6: 0.56, p7: 0.53,
        p8: 0.43, p9: 0.46, p10: 0.6, p11: 0.41, p12: 0.56, p13: 0.65, p14: 0.53, p15: 0.46,
        g0: 1, g1: 1, g2: 0, g3: 1, g4: 0, g5: 1, g6: 1, g7: 0,
        g8: 1, g9: 0, g10: 1, g11: 1, g12: 0, g13: 1, g14: 0, g15: 1,
      }),
      M("q1", "quant", 0, 32, { scale: 6 }),           // pentatonic minor
      M("vco", "vco", 0, 40, { oct: 0.62, coarse: 0.5, fine: 0.5, pw: 0.28, fmd: 0.07 }),
      M("lfo", "lfo", 0, 54, { rate: 0.52, shape: 0 }),
      M("flt", "filter", 0, 62, { cut: 0.5, res: 0.42, cvamt: 0.9, mode: 0 }),
      M("env", "adsr", 0, 74, { a: 0.02, d: 0.2, s: 0.0, r: 0.3 }),
      M("vca", "vca", 0, 84, { gain: 0.3 }),
      M("dly", "delay", 1, 0, { time: ms(375), fb: 0.62, damp: 0.55, mix: 0.5 }),
      M("rvt", "reverb", 1, 12, { size: 0.72, decay: 0.62, damp: 0.5, mix: 0.55 }),
      M("kik", "kick", 1, 26, { tune: 0.35, decay: 0.3, level: 0.55 }),
      M("out", "out", 1, 36, { level: 0.8 }),
    ],
    cables: [
      C("p1", "clk", "t16", "sq", "clk", 0),
      C("p2", "sq", "pitch", "q1", "in", 1),
      C("p3", "q1", "out", "vco", "v", 1),
      C("p4", "sq", "gate", "env", "g", 2),
      C("p5", "vco", "sqr", "flt", "in", 3),
      C("p6", "lfo", "out", "vco", "fm", 4),
      C("p7", "env", "e", "flt", "cv", 5),
      C("p8", "env", "e", "vca", "cv", 5),
      C("p9", "flt", "out", "vca", "in", 6),
      C("p10", "vca", "out", "dly", "in", 7),
      C("p11", "dly", "out", "rvt", "in", 0),
      C("p12", "dly", "out", "out", "l", 1),
      C("p13", "rvt", "out", "out", "r", 2),
      C("p14", "vca", "out", "out", "l", 3),
      C("p15", "clk", "b", "kik", "trig", 4),
      C("p16", "kik", "out", "out", "l", 5),
    ],
  },

  "Deep Drone": {
    v: 1, name: "Deep Drone", bpm: 70,
    modules: [
      M("vcoA", "vco", 0, 0, { oct: 0.34, coarse: 0.5, fine: 0.505, pw: 0.45, fmd: 0 }),
      M("vcoB", "vco", 0, 14, { oct: 0.59, coarse: 0.5, fine: 0.492, pw: 0.5, fmd: 0 }),
      M("lfoA", "lfo", 0, 28, { rate: 0.16, shape: 0 }),
      M("lfoB", "lfo", 0, 36, { rate: 0.1, shape: 1 }),
      M("flt", "filter", 0, 44, { cut: 0.34, res: 0.3, cvamt: 0.75, mode: 0 }),
      M("vca", "vca", 0, 56, { gain: 0.34 }),
      M("noi", "noise", 0, 62),
      M("qf", "filter", 0, 66, { cut: 0.7, res: 0.5, cvamt: 0.4, mode: 1 }),
      M("qv", "vca", 0, 78, { gain: 0.16 }),
      M("rvt", "reverb", 1, 0, { size: 0.85, decay: 0.7, damp: 0.6, mix: 0.8 }),
      M("dly", "delay", 1, 14, { time: ms(480), fb: 0.45, damp: 0.7, mix: 0.35 }),
      M("out", "out", 1, 26, { level: 0.85 }),
    ],
    cables: [
      C("d1", "vcoA", "saw", "flt", "in", 0),
      C("d2", "vcoB", "tri", "flt", "in", 1),
      C("d3", "lfoA", "out", "flt", "cv", 2),
      C("d4", "flt", "out", "vca", "in", 3),
      C("d5", "lfoB", "out", "vca", "cv", 4),
      C("d6", "vca", "out", "dly", "in", 5),
      C("d7", "dly", "out", "rvt", "in", 6),
      C("d8", "vca", "out", "rvt", "in", 6),
      C("d9", "rvt", "out", "out", "r", 7),
      C("d10", "dly", "out", "out", "l", 0),
      C("d11", "noi", "p", "qf", "in", 1),
      C("d12", "qf", "out", "qv", "in", 2),
      C("d13", "lfoB", "out", "qv", "cv", 3),
      C("d14", "qv", "out", "rvt", "in", 4),
    ],
  },

  "Ambient Garden": {
    v: 1, name: "Ambient Garden", bpm: 88,
    modules: [
      M("lfoA", "lfo", 0, 0, { rate: 0.3, shape: 3 }),        // slow square: the note clock
      M("noi", "noise", 0, 8),
      M("sha1", "sha", 0, 12),
      M("sha2", "sha", 0, 20),
      M("q1", "quant", 0, 28, { scale: 8 }),                  // hirajoshi
      M("vcoA", "vco", 0, 36, { oct: 0.62, coarse: 0.5, fine: 0.5, pw: 0.5, fmd: 0 }),
      M("vcoB", "vco", 0, 50, { oct: 0.87, coarse: 0.5, fine: 0.51, pw: 0.5, fmd: 0.12 }),
      M("flt", "filter", 0, 64, { cut: 0.52, res: 0.3, cvamt: 0.5, mode: 0 }),
      M("env", "adsr", 0, 76, { a: 0.55, d: 0.5, s: 0.55, r: 0.75 }),
      M("vca", "vca", 0, 86, { gain: 0.34 }),
      M("lfoB", "lfo", 1, 0, { rate: 0.14, shape: 0 }),
      M("dly", "delay", 1, 8, { time: ms(560), fb: 0.55, damp: 0.6, mix: 0.45 }),
      M("rvt", "reverb", 1, 20, { size: 0.9, decay: 0.75, damp: 0.55, mix: 0.7 }),
      M("out", "out", 1, 34, { level: 0.85 }),
    ],
    cables: [
      C("a1", "lfoA", "out", "sha1", "trig", 0),
      C("a2", "lfoA", "out", "sha2", "trig", 0),
      C("a3", "noi", "w", "sha1", "in", 1),
      C("a4", "noi", "p", "sha2", "in", 2),
      C("a5", "sha1", "out", "q1", "in", 3),
      C("a6", "q1", "out", "vcoA", "v", 4),
      C("a7", "q1", "out", "vcoB", "v", 4),
      C("a8", "sha2", "out", "flt", "cv", 5),
      C("a9", "lfoA", "out", "env", "g", 6),
      C("a10", "vcoA", "tri", "flt", "in", 7),
      C("a11", "vcoB", "sin", "flt", "in", 7),
      C("a12", "lfoB", "out", "vcoB", "fm", 0),
      C("a13", "flt", "out", "vca", "in", 1),
      C("a14", "env", "e", "vca", "cv", 2),
      C("a15", "vca", "out", "dly", "in", 3),
      C("a16", "dly", "out", "rvt", "in", 4),
      C("a17", "vca", "out", "rvt", "in", 4),
      C("a18", "rvt", "out", "out", "l", 5),
      C("a19", "rvt", "out", "out", "r", 5),
      C("a20", "dly", "out", "out", "r", 6),
    ],
  },

  "Kraut Motor": {
    v: 1, name: "Kraut Motor", bpm: 138,
    modules: [
      M("clk", "clock", 0, 0),
      M("sq", "seq", 0, 8, {
        glide: 0.08, len: 0,
        p0: 0.25, p1: 0.25, p2: 0.32, p3: 0.25, p4: 0.25, p5: 0.37, p6: 0.25, p7: 0.3,
        g0: 1, g1: 1, g2: 1, g3: 1, g4: 1, g5: 1, g6: 1, g7: 1,
      }),
      M("vco", "vco", 0, 32, { oct: 0.4, coarse: 0.5, fine: 0.5, pw: 0.5, fmd: 0.05 }),
      M("lfo", "lfo", 0, 46, { rate: 0.42, shape: 1 }),
      M("flt", "filter", 0, 54, { cut: 0.42, res: 0.45, cvamt: 0.6, mode: 0 }),
      M("vca", "vca", 0, 66, { gain: 0.3 }),
      M("dly", "delay", 0, 72, { time: ms(130), fb: 0.5, damp: 0.45, mix: 0.3 }),
      M("kik", "kick", 1, 0, { tune: 0.5, decay: 0.3, level: 0.95 }),
      M("hat", "hat", 1, 10, { decay: 0.12, tone: 0.7, level: 0.45 }),
      M("snr", "snare", 1, 16, { tune: 0.5, decay: 0.3, level: 0.6 }),
      M("noi", "noise", 1, 24),
      M("sv", "vca", 1, 28, { gain: 0.1 }),
      M("sf", "filter", 1, 34, { cut: 0.6, res: 0.7, cvamt: 0.8, mode: 1 }),
      M("lfo2", "lfo", 1, 46, { rate: 0.28, shape: 0 }),
      M("out", "out", 1, 54, { level: 0.8 }),
    ],
    cables: [
      C("m1", "clk", "t16", "sq", "clk", 0),
      C("m2", "sq", "pitch", "vco", "v", 1),
      C("m3", "sq", "gate", "vca", "cv", 2),
      C("m4", "vco", "saw", "flt", "in", 3),
      C("m5", "lfo", "out", "flt", "cv", 4),
      C("m6", "flt", "out", "vca", "in", 5),
      C("m7", "vca", "out", "dly", "in", 6),
      C("m8", "dly", "out", "out", "r", 7),
      C("m9", "vca", "out", "out", "l", 0),
      C("m10", "clk", "b", "kik", "trig", 1),
      C("m11", "kik", "out", "out", "l", 2),
      C("m12", "clk", "t16", "hat", "trig", 3),
      C("m13", "hat", "out", "out", "r", 4),
      C("m14", "clk", "bar", "snr", "trig", 5),
      C("m15", "snr", "out", "out", "r", 6),
      C("m16", "noi", "w", "sf", "in", 7),
      C("m17", "lfo2", "out", "sf", "cv", 0),
      C("m18", "sf", "out", "sv", "in", 1),
      C("m19", "lfo2", "out", "sv", "cv", 2),
      C("m20", "sv", "out", "out", "r", 3),
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

export function getPreset(name) {
  const p = PRESETS[name];
  if (!p) return null;
  return JSON.parse(JSON.stringify(p));                   // fresh copy, never shared state
}
