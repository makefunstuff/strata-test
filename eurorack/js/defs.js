// eurorack/js/defs.js — the module catalogue.
//
// Every module is described here once: its panel width in HP, its knobs, its jacks and its
// defaults. The worklet (js/worklet.js) instantiates a DSP unit per module type; the UI
// (js/rack.js) builds the panel from the same definition. Params live in 0..1 space and
// each knob carries the display mapping used for its value readout.

export const HPW = 10;            // CSS px per HP at zoom 1
export const ROW_H = 264;         // panel height (a 3U-ish rail)
export const RACK_HP = 96;        // usable width of one rail in HP

// knob value formats: fmt(v) -> label; v stays 0..1 on the wire
const F = {
  hz: (v) => `${(20 * Math.pow(1200, v)).toFixed(v < 0.3 ? 1 : 0)} Hz`,
  ms: (v) => `${(0.5 * Math.pow(6000, v)).toFixed(v < 0.4 ? 1 : 0)} ms`,
  pc: (v) => `${Math.round(v * 100)}%`,
  pcB: (v) => `${Math.round((v * 2 - 1) * 100) >= 0 ? "+" : ""}${Math.round((v * 2 - 1) * 100)}%`,
  oct: (v) => `${(v * 4 - 2).toFixed(1)} oct`,
  semi: (v) => `${(v * 48 - 24).toFixed(1)} st`,
  fine: (v) => `${((v - 0.5) * 100).toFixed(0)} cent`,
  q: (v) => `Q ${(0.4 + v * v * 18).toFixed(1)}`,
  fb: (v) => `${Math.round(v * 92)}%`,
  sec: (v) => `${(0.05 + v * v * 9).toFixed(2)} s`,
  n: (v, n0 = 0, n1 = 1) => `${(n0 + v * (n1 - n0)).toFixed(1)}`,
  x: (v) => `×${(v * 4).toFixed(2)}`,
  off: (v) => `${((v - 0.5) * 2).toFixed(2)} V`,
  bool: (v) => (v > 0.5 ? "on" : "off"),
  plain: (v) => v.toFixed(2),
};

// knob: {p, label, def, fmt, seg?}   seg: click cycles these labels (stored as 0..1 index)
// jack: {j, label, dir:"in"|"out", kind:"cv"|"audio"|"gate"}
export const DEFS = {
  vco: {
    name: "VCO-1", cat: "osc", hp: 14, blurb: "sine / tri / saw / pulse, 1V/oct, linear FM",
    knobs: [
      { p: "oct", label: "OCT", def: 0.5, fmt: F.oct },
      { p: "coarse", label: "SEMI", def: 0.5, fmt: F.semi },
      { p: "fine", label: "FINE", def: 0.5, fmt: F.fine },
      { p: "pw", label: "PW", def: 0.5, fmt: F.pc },
      { p: "fmd", label: "FM", def: 0, fmt: F.pc },
      { p: "wave", label: "WAVE", def: 0.375, fmt: F.plain, seg: ["sine", "tri", "saw", "pulse"] },
    ],
    jacks: [
      { j: "v", label: "V/OCT", dir: "in", kind: "cv" },
      { j: "fm", label: "FM", dir: "in", kind: "audio" },
      { j: "sync", label: "SYN", dir: "in", kind: "gate" },
      { j: "saw", label: "SAW", dir: "out", kind: "audio" },
      { j: "tri", label: "TRI", dir: "out", kind: "audio" },
      { j: "sqr", label: "PLS", dir: "out", kind: "audio" },
      { j: "sin", label: "SIN", dir: "out", kind: "audio" },
    ],
  },
  lfo: {
    name: "LFO", cat: "mod", hp: 8, blurb: "0.02 Hz to 60 Hz, five shapes",
    knobs: [
      { p: "rate", label: "RATE", def: 0.35, fmt: F.hz },
      { p: "shape", label: "SHAPE", def: 0, fmt: F.plain, seg: ["sine", "tri", "saw", "sqr", "rnd"] },
    ],
    jacks: [
      { j: "rate", label: "RATE", dir: "in", kind: "cv" },
      { j: "out", label: "OUT", dir: "out", kind: "cv" },
    ],
  },
  adsr: {
    name: "ADSR", cat: "mod", hp: 10, blurb: "attack / decay / sustain / release envelope",
    knobs: [
      { p: "a", label: "A", def: 0.15, fmt: F.ms },
      { p: "d", label: "D", def: 0.35, fmt: F.ms },
      { p: "s", label: "S", def: 0.6, fmt: F.pc },
      { p: "r", label: "R", def: 0.4, fmt: F.ms },
    ],
    jacks: [
      { j: "g", label: "GATE", dir: "in", kind: "gate" },
      { j: "e", label: "ENV", dir: "out", kind: "cv" },
      { j: "inv", label: "INV", dir: "out", kind: "cv" },
    ],
  },
  vca: {
    name: "VCA", cat: "util", hp: 6, blurb: "voltage controlled amplifier",
    knobs: [{ p: "gain", label: "GAIN", def: 0.6, fmt: F.pc }],
    jacks: [
      { j: "in", label: "IN", dir: "in", kind: "audio" },
      { j: "cv", label: "CV", dir: "in", kind: "cv" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  filter: {
    name: "VC FILTER", cat: "filter", hp: 12, blurb: "multimode state-variable, LP/BP/HP + resonance",
    knobs: [
      { p: "cut", label: "CUT", def: 0.55, fmt: F.hz },
      { p: "res", label: "RES", def: 0.3, fmt: F.q },
      { p: "cvamt", label: "CV", def: 0.5, fmt: F.pcB },
      { p: "mode", label: "MODE", def: 0, fmt: F.plain, seg: ["LP", "BP", "HP"] },
    ],
    jacks: [
      { j: "in", label: "IN", dir: "in", kind: "audio" },
      { j: "cv", label: "CV", dir: "in", kind: "cv" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  noise: {
    name: "NOISE", cat: "mod", hp: 4, blurb: "white + pink noise (seeded, deterministic)",
    knobs: [],
    jacks: [
      { j: "w", label: "WHT", dir: "out", kind: "audio" },
      { j: "p", label: "PNK", dir: "out", kind: "audio" },
    ],
  },
  sha: {
    name: "S&H", cat: "mod", hp: 8, blurb: "sample & hold on a trigger",
    knobs: [],
    jacks: [
      { j: "trig", label: "TRIG", dir: "in", kind: "gate" },
      { j: "in", label: "IN", dir: "in", kind: "audio" },
      { j: "out", label: "OUT", dir: "out", kind: "cv" },
    ],
  },
  seq: {
    name: "SEQ-16", cat: "seq", hp: 24, blurb: "16-step pitch + gate sequencer, clock in, glide",
    knobs: [
      { p: "glide", label: "GLIDE", def: 0.2, fmt: F.ms },
      { p: "len", label: "LEN", def: 0, fmt: F.plain, seg: ["8", "16"] },
    ],
    jacks: [
      { j: "clk", label: "CLK", dir: "in", kind: "gate" },
      { j: "rst", label: "RST", dir: "in", kind: "gate" },
      { j: "pitch", label: "PITCH", dir: "out", kind: "cv" },
      { j: "gate", label: "GATE", dir: "out", kind: "gate" },
    ],
    stepCount: 16,
  },
  clock: {
    name: "CLOCK", cat: "seq", hp: 8, blurb: "master tempo pulses: 1/16, beat, bar",
    knobs: [],
    jacks: [
      { j: "t16", label: "16", dir: "out", kind: "gate" },
      { j: "b", label: "BT", dir: "out", kind: "gate" },
      { j: "bar", label: "BAR", dir: "out", kind: "gate" },
    ],
  },
  quant: {
    name: "QUANT", cat: "seq", hp: 8, blurb: "quantise pitch CV to a scale",
    knobs: [
      { p: "scale", label: "SCALE", def: 0, fmt: F.plain, seg: ["chrom", "major", "minor", "dorian", "mixo", "pentM", "pentm", "blues", "japan"] },
    ],
    jacks: [
      { j: "in", label: "IN", dir: "in", kind: "cv" },
      { j: "out", label: "OUT", dir: "out", kind: "cv" },
    ],
  },
  mixer: {
    name: "MIX-4", cat: "util", hp: 12, blurb: "four-channel mixer",
    knobs: [
      { p: "g1", label: "1", def: 0.7, fmt: F.pc },
      { p: "g2", label: "2", def: 0.7, fmt: F.pc },
      { p: "g3", label: "3", def: 0.7, fmt: F.pc },
      { p: "g4", label: "4", def: 0.7, fmt: F.pc },
    ],
    jacks: [
      { j: "i1", label: "1", dir: "in", kind: "audio" },
      { j: "i2", label: "2", dir: "in", kind: "audio" },
      { j: "i3", label: "3", dir: "in", kind: "audio" },
      { j: "i4", label: "4", dir: "in", kind: "audio" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  delay: {
    name: "DELAY", cat: "fx", hp: 12, blurb: "damped feedback delay",
    knobs: [
      { p: "time", label: "TIME", def: 0.55, fmt: F.ms },
      { p: "fb", label: "FB", def: 0.5, fmt: F.fb },
      { p: "damp", label: "DAMP", def: 0.45, fmt: F.pc },
      { p: "mix", label: "MIX", def: 0.35, fmt: F.pc },
    ],
    jacks: [
      { j: "in", label: "IN", dir: "in", kind: "audio" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  reverb: {
    name: "REVERB", cat: "fx", hp: 14, blurb: "four-comb Schroeder reverb",
    knobs: [
      { p: "size", label: "SIZE", def: 0.6, fmt: F.pc },
      { p: "decay", label: "DECAY", def: 0.55, fmt: F.sec },
      { p: "damp", label: "DAMP", def: 0.5, fmt: F.pc },
      { p: "mix", label: "MIX", def: 0.4, fmt: F.pc },
    ],
    jacks: [
      { j: "in", label: "IN", dir: "in", kind: "audio" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  kick: {
    name: "KICK", cat: "drums", hp: 10, blurb: "analogue kick: swept sine + click",
    knobs: [
      { p: "tune", label: "TUNE", def: 0.45, fmt: F.pc },
      { p: "decay", label: "DECAY", def: 0.45, fmt: F.ms },
      { p: "level", label: "LVL", def: 0.85, fmt: F.pc },
    ],
    jacks: [
      { j: "trig", label: "TRIG", dir: "in", kind: "gate" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  hat: {
    name: "HAT", cat: "drums", hp: 6, blurb: "resonant noise hi-hat",
    knobs: [
      { p: "decay", label: "DECAY", def: 0.25, fmt: F.ms },
      { p: "tone", label: "TONE", def: 0.6, fmt: F.pc },
      { p: "level", label: "LVL", def: 0.6, fmt: F.pc },
    ],
    jacks: [
      { j: "trig", label: "TRIG", dir: "in", kind: "gate" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  snare: {
    name: "SNARE", cat: "drums", hp: 8, blurb: "noise + tone snare",
    knobs: [
      { p: "tune", label: "TUNE", def: 0.5, fmt: F.pc },
      { p: "decay", label: "DECAY", def: 0.4, fmt: F.ms },
      { p: "level", label: "LVL", def: 0.7, fmt: F.pc },
    ],
    jacks: [
      { j: "trig", label: "TRIG", dir: "in", kind: "gate" },
      { j: "out", label: "OUT", dir: "out", kind: "audio" },
    ],
  },
  att: {
    name: "ATT/MULT", cat: "util", hp: 6, blurb: "attenuverter + three-way mult",
    knobs: [
      { p: "att", label: "ATT", def: 0.5, fmt: F.x },
      { p: "off", label: "OFF", def: 0.5, fmt: F.off },
    ],
    jacks: [
      { j: "in", label: "IN", dir: "in", kind: "cv" },
      { j: "out", label: "OUT", dir: "out", kind: "cv" },
      { j: "m", label: "THRU", dir: "in", kind: "cv" },
      { j: "m1", label: "1", dir: "out", kind: "cv" },
      { j: "m2", label: "2", dir: "out", kind: "cv" },
    ],
  },
  midicv: {
    name: "MIDI-CV", cat: "seq", hp: 10, blurb: "keyboard / MIDI to pitch, gate, velocity CV",
    knobs: [
      { p: "oct", label: "OCT", def: 0.5, fmt: F.oct },
      { p: "vel", label: "VEL", def: 0.75, fmt: F.pc },
    ],
    jacks: [
      { j: "p", label: "PITCH", dir: "out", kind: "cv" },
      { j: "g", label: "GATE", dir: "out", kind: "gate" },
      { j: "v", label: "VEL", dir: "out", kind: "cv" },
    ],
  },
  out: {
    name: "OUTPUT", cat: "util", hp: 16, blurb: "master level, stereo limiter + scope",
    knobs: [
      { p: "level", label: "LEVEL", def: 0.72, fmt: F.pc },
    ],
    jacks: [
      { j: "l", label: "L", dir: "in", kind: "audio" },
      { j: "r", label: "R", dir: "in", kind: "audio" },
    ],
    scope: true,
  },
};

export const CATS = [
  ["osc", "OSCILLATORS"], ["mod", "MODULATION"], ["filter", "FILTERS"],
  ["seq", "SEQUENCING"], ["drums", "DRUMS"], ["fx", "FX"], ["util", "UTILITY"],
];

// CV conventions shared by the worklet and the UI:
// pitch CV 0..1 spans 6 octaves from C1 (32.7 Hz); gate threshold 0.5.
export const NOTES_SPAN = 72;
export const F_C1 = 32.70319566;

// scales as semitone sets within one octave
export const SCALES = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],  // chromatic
  [0, 2, 4, 5, 7, 9, 11],                    // major
  [0, 2, 3, 5, 7, 8, 10],                    // minor
  [0, 2, 3, 5, 7, 9, 10],                    // dorian
  [0, 2, 4, 5, 7, 9, 10],                    // mixolydian
  [0, 2, 4, 7, 9],                           // pentatonic major
  [0, 3, 5, 7, 10],                          // pentatonic minor
  [0, 3, 5, 6, 7, 10],                       // blues
  [0, 2, 3, 7, 8],                           // hirajoshi
];

export function defOf(type) { return DEFS[type]; }

// param list in wire order, with defaults — the worklet reads params by index
export function paramSpec(type) {
  const d = DEFS[type];
  if (!d) return [];
  const out = d.knobs.map((k) => ({ p: k.p, def: k.def ?? 0 }));
  if (type === "seq") {
    for (let i = 0; i < 16; i++) out.push({ p: `p${i}`, def: 0.5 }, { p: `g${i}`, def: i % 2 ? 0 : 1 });
  }
  return out;
}

export function defaultParams(type) {
  const o = {};
  for (const { p, def } of paramSpec(type)) o[p] = def;
  return o;
}

export const CABLE_COLORS = ["#ff3fa4", "#8ee8ff", "#ffb45c", "#7dff9e", "#c792ff", "#ff6b5e", "#ffe066", "#5ec8ff"];

// a small playable place to start: two oscillators through a filter, an envelope, a VCA,
// the master — so the very first note already sounds like something
export function initPatch() {
  return {
    v: 1, name: "Init", bpm: 104,
    modules: [
      { id: "m1", type: "midicv", row: 0, col: 0, params: {} },
      { id: "m2", type: "vco", row: 0, col: 14, params: { wave: 0.25, coarse: 0.4 } },
      { id: "m3", type: "vco", row: 0, col: 28, params: { wave: 0.625, coarse: 0.5, fine: 0.53, pw: 0.35 } },
      { id: "m4", type: "filter", row: 0, col: 42, params: { cut: 0.5, res: 0.35 } },
      { id: "m5", type: "adsr", row: 0, col: 54, params: {} },
      { id: "m6", type: "vca", row: 0, col: 64, params: {} },
      { id: "m7", type: "out", row: 0, col: 70, params: {} },
    ],
    cables: [
      { id: "c1", src: { m: "m1", j: "p" }, dst: { m: "m2", j: "v" }, color: 0 },
      { id: "c2", src: { m: "m1", j: "p" }, dst: { m: "m3", j: "v" }, color: 1 },
      { id: "c3", src: { m: "m1", j: "g" }, dst: { m: "m5", j: "g" }, color: 2 },
      { id: "c4", src: { m: "m2", j: "saw" }, dst: { m: "m4", j: "in" }, color: 3 },
      { id: "c5", src: { m: "m3", j: "sqr" }, dst: { m: "m4", j: "in" }, color: 4 },
      { id: "c6", src: { m: "m4", j: "out" }, dst: { m: "m6", j: "in" }, color: 5 },
      { id: "c7", src: { m: "m5", j: "e" }, dst: { m: "m6", j: "cv" }, color: 6 },
      { id: "c8", src: { m: "m6", j: "out" }, dst: { m: "m7", j: "l" }, color: 7 },
      { id: "c9", src: { m: "m6", j: "out" }, dst: { m: "m7", j: "r" }, color: 0 },
    ],
  };
}

export function validate(patch) {
  const errs = [];
  const ids = new Set();
  for (const m of patch.modules ?? []) {
    if (!DEFS[m.type]) { errs.push(`unknown module type ${m.type}`); continue; }
    if (ids.has(m.id)) errs.push(`duplicate module id ${m.id}`);
    ids.add(m.id);
  }
  for (const c of patch.cables ?? []) {
    const mm = (id) => patch.modules.find((x) => x.id === id);
    for (const [end, dir] of [["src", "out"], ["dst", "in"]]) {
      const m = mm(c[end]?.m);
      if (!m) { errs.push(`cable ${c.id} ${end} points at missing module ${c[end]?.m}`); continue; }
      const d = DEFS[m.type];
      const j = d.jacks.find((x) => x.j === c[end].j);
      if (!j) errs.push(`cable ${c.id} ${end} points at missing jack ${m.type}.${c[end]?.j}`);
      else if (j.dir !== dir) errs.push(`cable ${c.id} ${end} uses ${m.type}.${c[end].j} as ${dir}, it is ${j.dir}`);
    }
  }
  return errs;
}
