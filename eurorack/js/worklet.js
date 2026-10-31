// eurorack/js/worklet.js — the synth engine: one AudioWorkletProcessor that hosts the whole
// patch. The main thread (js/engine.js) serialises the rack into a graph description; this
// file interprets it in 128-sample blocks, so CV and audio are both patchable at full rate
// and the whole instrument renders identically in an OfflineAudioContext (presets, WAV
// export and the headless level checks all rely on that).
//
// Block contract: every jack owns a Float32Array(128). A unit reads its input jack buffers
// (ins[name][i]) and writes its output jack buffers (outs[name][i]) for the block. Cables
// pass the previous block, shifted one sample, so any patch — including feedback loops —
// is stable without topological sorting.
//
// Conventions: audio around ±1; CV 0..1; pitch CV 0..1 spans 6 octaves from C1; gates
// trigger above 0.5. Classic script (addModule): no imports; the two constants below
// mirror js/defs.js — they are the wire format.

(() => {
  const NOTES_SPAN = 72;
  const F_C1 = 32.70319566;
  const SCALES = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 2, 4, 5, 7, 9, 11],
    [0, 2, 3, 5, 7, 8, 10],
    [0, 2, 3, 5, 7, 9, 10],
    [0, 2, 4, 5, 7, 9, 10],
    [0, 2, 4, 7, 9],
    [0, 3, 5, 7, 10],
    [0, 3, 5, 6, 7, 10],
    [0, 2, 3, 7, 8],
  ];

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lp = (a, b, v) => a * Math.pow(b / a, clamp(v, 0, 1));
  const TAU = Math.PI * 2;

  // deterministic per-module RNG so offline renders (WAV export, checks) are reproducible
  function mulberry(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- DSP units ---------------------------------------------------------------
  // Each unit implements setParams(p, ctx) and process(ins, outs) over one 128-block.
  // ins / outs map jack names to Float32Array(128).

  class VCO {
    constructor() { this.ph = 0; this.prevSync = 0; this.os = 2; }
    setParams(p) {
      this.oct = p.oct * 4 - 2;
      this.semi = p.coarse * 48 - 24;
      this.fine = (p.fine - 0.5) * 100;                       // centi-semitones for the cv sum
      this.pw = 0.05 + 0.9 * p.pw;
      this.fmd = p.fmd;
    }
    process(ins, outs) {
      const sr = sampleRate, os = this.os, inv = 1 / (sr * os);
      let { ph, prevSync } = this;
      const saw = outs.saw, tri = outs.tri, sqr = outs.sqr, sinw = outs.sin;
      for (let i = 0; i < 128; i++) {
        // CV convention (shared with MIDI-CV): 1.0 spans NOTES_SPAN=72 semitones.
        // Panel offsets are octaves/semitones/cents — convert, do NOT add raw (that was 6x).
        const cv = (ins.v ? ins.v[i] : 0) + (this.oct * 12 + this.semi + this.fine) / 72;
        const base = F_C1 * Math.pow(2, (cv * NOTES_SPAN) / 12);
        const f = clamp(base * (1 + this.fmd * (ins.fm ? ins.fm[i] : 0)), 0.002, sr / 4.5);
        const sync = ins.sync && ins.sync[i] > 0.5 ? 1 : 0;
        if (sync && !prevSync) ph = 0;
        prevSync = sync;
        let acc = 0;
        for (let o = 0; o < os; o++) { ph += f * inv; if (ph >= 1) ph -= 1; acc += 2 * ph - 1; }
        const s = acc / os;                                   // oversampled plain saw
        saw[i] = s;
        tri[i] = ph < 0.5 ? -1 + 4 * ph : 3 - 4 * ph;
        sqr[i] = ph < this.pw ? 0.55 : -0.55;
        sinw[i] = Math.sin(TAU * ph);
      }
      this.ph = ph; this.prevSync = prevSync;
    }
  }

  class LFO {
    constructor() { this.ph = 0; this.rnd = 0; this.nextRnd = 0; }
    setParams(p) { this.shape = Math.round(p.shape * 4); this.rate = p.rate; }
    process(ins, outs) {
      const sr = sampleRate;
      const rate = clamp(lp(0.02, 60, this.rate) * Math.pow(2, (ins.rate ? ins.rate[0] : 0) * 2), 0.0005, sr / 4);
      const st = rate / sr;
      let { ph, rnd, nextRnd } = this;
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        ph += st;
        if (ph >= 1) { ph -= 1; rnd = nextRnd; nextRnd = this.rng(); }
        let v;
        switch (this.shape) {
          case 0: v = Math.sin(TAU * ph); break;
          case 1: v = ph < 0.5 ? -1 + 4 * ph : 3 - 4 * ph; break;
          case 2: v = 2 * ph - 1; break;
          case 3: v = ph < 0.5 ? 1 : -1; break;
          default: v = rnd;
        }
        out[i] = v;
      }
      this.ph = ph; this.rnd = rnd; this.nextRnd = nextRnd;
    }
  }

  class ADSR {
    constructor() { this.env = 0; this.st = 0; this.prev = 0; }
    setParams(p) {
      this.a = lp(0.0008, 6, p.a);
      this.d = lp(0.002, 10, p.d);
      this.s = p.s;
      this.r = lp(0.01, 12, p.r);
    }
    process(ins, outs) {
      const sr = sampleRate;
      const kA = this.a <= 0.0005 ? 1 : Math.min(1, 0.9 / (this.a * sr) + 0.02);
      const kD = 1 - Math.exp(-1 / (this.d * sr));
      const kR = 1 - Math.exp(-1 / (this.r * sr));
      let { env, st, prev } = this;
      const e = outs.e, inv = outs.inv;
      for (let i = 0; i < 128; i++) {
        const g = ins.g[i] > 0.5 ? 1 : 0;
        if (g && !prev) st = 1;                         // rising edge -> attack
        if (!g && prev && st !== 3) st = 3;             // falling edge -> release
        prev = g;
        if (st === 1) {                                  // linear attack: click-free retrigger
          env += kA;
          if (env >= 1) { env = 1; st = 2; }
        } else if (st === 2) {                           // exponential decay to sustain
          env += (this.s - env) * kD;
          if (Math.abs(env - this.s) < 0.0015) env = this.s;
        } else if (st === 3) {                           // exponential release to silence
          env -= env * kR + kR * 0.02;                        // floor scales with R (a fixed one faked ~10 ms minimum)
          if (env <= 0.001) { env = 0; st = 0; }
        }
        e[i] = env; inv[i] = 1 - env;
      }
      this.env = env; this.st = st; this.prev = prev;
    }
  }

  class VCA {
    constructor() { this.g = 0; }
    setParams(p) { this.gain = p.gain; }
    process(ins, outs) {
      const k = 1 - Math.exp(-1 / (0.004 * sampleRate));   // ~4 ms — kills zipper noise
      let g = this.g;
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        const want = clamp(this.gain * 0.65 + (ins.cv ? ins.cv[i] : 0), 0, 1.3);
        g += (want - g) * k;
        out[i] = ins.in[i] * g;
      }
      this.g = g;
    }
  }

  class FILTER {
    constructor() { this.lo = 0; this.band = 0; this.smoothCut = 0.5; }
    setParams(p) { this.cut = p.cut; this.res = p.res; this.cvam = p.cvamt * 2 - 1; this.mode = p.mode * 2; this.modeSm = this.modeSm ?? this.mode; }
    process(ins, outs) {
      const sr = sampleRate;
      let { lo, band } = this;
      let mode = this.modeSm;
      const mk = 1 - Math.exp(-1 / (0.006 * sr));           // mode crossfade is smoothed
      const ck = 1 - Math.exp(-1 / (0.003 * sr));           // cutoff slew: no clicks on knob jumps
      let cutSm = this.smoothCut;
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        const want = clamp(this.cut + this.cvam * (ins.cv ? ins.cv[i] : 0) * 0.65, 0.004, 0.985);
        cutSm += (want - cutSm) * ck;
        const f = Math.min(lp(24, 15500, cutSm), sr * 0.46);
        const a = 2 * Math.sin(Math.PI * f / sr);
        const Q = 0.4 + this.res * this.res * 16;
        // Chamberlin two-integrator loop is only stable for damp < min(1, (2-a)/2);
        // clamping there (instead of letting 1/Q exceed it) is what stops high-Q runaway.
        const d = Math.min(1 / Q, 0.98, (2 - a) / 2 - 0.01);
        lo += a * band;
        const hi = ins.in[i] - lo - d * band;
        band += a * hi;
        lo = Math.tanh(lo * 0.9) / 0.9;                     // keeps near-stability-limit Q self-limiting
        band = Math.tanh(band * 0.9) / 0.9;
        mode += (this.mode - mode) * mk;
        const m = clamp(mode, 0, 2);
        out[i] = m <= 1 ? lo * (1 - m) + band * m : band * (2 - m) + hi * (m - 1);
      }
      this.lo = lo; this.band = band; this.modeSm = mode; this.smoothCut = cutSm;
    }
  }

  class NOISE {
    constructor() { this.b = new Float32Array(7); }
    process(ins, outs) {
      // Paul Kellet's pink filter over a deterministic white source
      const b = this.b, w_ = outs.w, p_ = outs.p;
      for (let i = 0; i < 128; i++) {
        const w = this.rng() * 2 - 1;
        b[0] = 0.99886 * b[0] + w * 0.0555179;
        b[1] = 0.99332 * b[1] + w * 0.0750759;
        b[2] = 0.969 * b[2] + w * 0.153852;
        b[3] = 0.8665 * b[3] + w * 0.3104856;
        b[4] = 0.55 * b[4] + w * 0.5329522;
        b[5] = -0.7616 * b[5] - w * 0.016898;
        p_[i] = clamp((b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11, -1, 1);
        b[6] = w * 0.115926;
        w_[i] = w;
      }
    }
  }

  class SHA {
    constructor() { this.h = 0; this.prev = 0; }
    process(ins, outs) {
      let { h, prev } = this;
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        const t = ins.trig[i] > 0.5 ? 1 : 0;
        if (t && !prev) h = clamp(ins.in[i], -1, 1);
        prev = t;
        out[i] = h;
      }
      this.h = h; this.prev = prev;
    }
  }

  class SEQ {
    constructor() { this.step = 0; this.played = 0; this.prevClk = 0; this.prevRst = 0; this.pitch = 0.5; this.gate = 0; this.tick = 0; }
    setParams(p, c) {
      this.freeRun = c && c.freeRun;
      this.glide = lp(0.5, 220, p.glide) / 1000;
      this.len = p.len > 0.5 ? 16 : 8;
      for (let i = 0; i < 16; i++) { this[`p${i}`] = p[`p${i}`]; this[`g${i}`] = p[`g${i}`] > 0.5 ? 1 : 0; }
    }
    process(ins, outs) {
      const sr = sampleRate;
      const kg = this.glide <= 0.001 ? 1 : 1 - Math.exp(-1 / (this.glide * sr));
      let { step, prevClk, prevRst, pitch, gate, tick } = this;
      const pitch_ = outs.pitch, gate_ = outs.gate;
      for (let i = 0; i < 128; i++) {
        let clk;
        if (this.freeRun) {                                  // internal 1/16 clock at patch tempo
          tick += this.t16;
          clk = tick >= 1 ? 1 : 0;                            // pulse on wrap (was: unreachable test)
          if (tick >= 1) tick -= 1;
        } else clk = ins.clk[i] > 0.5 ? 1 : 0;
        const rst = ins.rst[i] > 0.5 ? 1 : 0;
        if (rst && !prevRst) { step = 0; this.played = 0; }
        prevRst = rst;
        if (clk && !prevClk) { gate = this[`g${step}`]; this.played = step; step = (step + 1) % this.len; }
        prevClk = clk;
        pitch += (this[`p${this.played}`] - pitch) * kg;
        pitch_[i] = pitch;
        gate_[i] = gate;
      }
      this.step = step; this.prevClk = prevClk; this.prevRst = prevRst;
      this.pitch = pitch; this.gate = gate; this.tick = tick;
    }
  }

  class CLOCK {
    constructor() { this.tick = 0; this.c16 = 0; this.p16 = 0; this.pb = 0; this.pbar = 0; }
    process(ins, outs) {
      const dur = Math.max(64, Math.min(0.04 * sampleRate, 0.4 / this.t16));   // pulses always fall
      let { tick, c16, p16, pb, pbar } = this;
      const t16 = outs.t16, b = outs.b, bar = outs.bar;
      for (let i = 0; i < 128; i++) {
        tick += this.t16;
        if (tick >= 1) {
          tick -= 1; c16 = (c16 + 1) % 16;
          p16 = dur;
          if (c16 % 4 === 0) pb = dur;
          if (c16 === 0) pbar = dur;
        }
        p16 = Math.max(0, p16 - 1); pb = Math.max(0, pb - 1); pbar = Math.max(0, pbar - 1);
        t16[i] = p16 > 0 ? 1 : 0;
        b[i] = pb > 0 ? 1 : 0;
        bar[i] = pbar > 0 ? 1 : 0;
      }
      this.tick = tick; this.c16 = c16; this.p16 = p16; this.pb = pb; this.pbar = pbar;
    }
  }

  class QUANT {
    setParams(p) { this.scale = SCALES[clamp(Math.round(p.scale * (SCALES.length - 1)), 0, SCALES.length - 1)]; }
    process(ins, outs) {
      const sc = this.scale, out = outs.out;
      for (let i = 0; i < 128; i++) {
        let x = ins.in[i];                                     // 0..1 is pitch space; bipolar sources FOLD into it
        if (x < 0) x = -x; else if (x > 1) x = 2 - x;
        const st = clamp(x, 0, 0.9999) * NOTES_SPAN;            // 0..72 semitones over 6 octaves
        const oct = Math.floor(st / 12);
        const within = st - oct * 12;
        let best = sc[0], bd = 99;
        for (const s of sc) { const d = Math.abs(s - within); if (d < bd) { bd = d; best = s; } }
        out[i] = Math.max(0, oct * 12 + best) / NOTES_SPAN;
      }
    }
  }

  class MIXER {
    setParams(p) { this.g = [p.g1, p.g2, p.g3, p.g4].map((v) => v * 1.15); }
    process(ins, outs) {
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        out[i] = ins.i1[i] * this.g[0] + ins.i2[i] * this.g[1] + ins.i3[i] * this.g[2] + ins.i4[i] * this.g[3];
      }
    }
  }

  class DELAY {
    constructor() { this.buf = null; this.w = 0; this.lpState = 0; }
    setParams(p) {
      const sr = sampleRate;
      if (!this.buf) this.buf = new Float32Array(Math.ceil(sr * 2));
      const tTgt = lp(12, 1500, p.time) / 1000 * sr;
      if (this.t === undefined || this.t > 2 * sr) this.t = tTgt; else this.tTgt = tTgt;
      this.fb = p.fb * 0.92;
      this.damp = 1 - Math.exp(-1 / (lp(0.3, 24, p.damp) * sr));   // one-pole in the loop
      this.mix = p.mix;
    }
    process(ins, outs) {
      const buf = this.buf, L = buf.length;
      let { w, lpState } = this;
      const in_ = ins.in, out = outs.out;
      if (this.tTgt !== undefined) this.t += (this.tTgt - this.t) * 0.01;   // ~70 ms glide, no read-pointer jumps
      const d = this.t, di = Math.floor(d), fr = d - di;
      for (let i = 0; i < 128; i++) {
        buf[w] = in_[i] + lpState * this.fb;
        const a = buf[(w - di + 2 * L) % L];
        const b = buf[(w - di - 1 + 2 * L) % L];
        const dl = a + (b - a) * fr;
        lpState += (dl - lpState) * this.damp;
        w = (w + 1) % L;
        out[i] = in_[i] * (1 - this.mix) + dl * this.mix;
      }
      this.w = w; this.lpState = lpState;
    }
  }

  class REVERB {
    constructor() { this.combs = null; this.hpX = 0; this.hpY = 0; }
    setParams(p) {
      const sr = sampleRate;
      const scale = 48000 / sr;
      const sizeQ = Math.ceil((0.55 + p.size * 1.9) * 6) / 6;   // 6 buckets: wiping the combs on every wiggle audibly kills the tail
      const lens = [1557, 1617, 1491, 1422].map((l) => Math.max(16, Math.round(l * scale * sizeQ)));
      const t60 = 0.15 + p.decay * p.decay * 9;
      const k = 1 - Math.exp(-1 / (lp(0.25, 24, p.damp) * sr));
      if (!this.combs) this.combs = lens.map((l) => ({ buf: new Float32Array(l), i: 0, lp: 0 }));
      for (let c = 0; c < 4; c++) {
        if (this.combs[c].buf.length !== lens[c]) this.combs[c] = { buf: new Float32Array(lens[c]), i: 0, lp: 0 };
        const L = lens[c];
        this.combs[c].g = Math.pow(0.001, L / (t60 * sr));
        this.combs[c].k = k;
      }
      if (!this.ap) this.ap = [225, 555].map((l) => { const L = Math.max(16, Math.round(l * scale)); return { buf: new Float32Array(L), i: 0 }; });
      this.mix = p.mix;
    }
    process(ins, outs) {
      const in_ = ins.in, out = outs.out;
      // pre high-pass ~90 Hz, as every real reverb has: a kick's 40 Hz fundamental
      // fed into a 3 s tail is a subsonic cloud, not a space
      const a = 1 / (1 + 2 * Math.PI * 90 / sampleRate);
      let { hpX, hpY } = this;
      for (let i = 0; i < 128; i++) {
        const x = in_[i];
        hpY = a * (hpY + x - hpX); hpX = x;
        let sum = 0;
        for (const c of this.combs) {
          const o = c.buf[c.i];
          c.lp += (o - c.lp) * c.k;
          c.buf[c.i] = hpY + c.lp * c.g;
          c.i = (c.i + 1) % c.buf.length;
          sum += o;
        }
        sum *= 0.25;
        for (const a of this.ap) {
          const g = 0.5;
          const bufout = a.buf[a.i];
          const v = sum - g * bufout;
          sum = bufout + g * v;
          a.buf[a.i] = v;
          a.i = (a.i + 1) % a.buf.length;
        }
        out[i] = in_[i] * (1 - this.mix * 0.85) + sum * this.mix * 1.7;
      }
      this.hpX = hpX; this.hpY = hpY;
    }
  }

  class KICK {
    constructor() { this.t = 1e9; this.ph = 0; this.prev = 0; }
    setParams(p) { this.tune = p.tune; this.dec = lp(0.05, 1.4, p.decay); this.lvl = p.level; }
    process(ins, outs) {
      const sr = sampleRate;
      let { t, ph, prev } = this;
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        const tr = ins.trig[i] > 0.5 ? 1 : 0;
        if (tr && !prev) { t = 0; ph = 0; }
        prev = tr;
        t += 1 / sr;
        const f = 44 + this.tune * 190 * Math.exp(-t / (this.dec * 0.25));
        ph += f / sr;
        const env = Math.exp(-t / this.dec);
        const click = (this.rng() * 2 - 1) * Math.exp(-t / 0.0018) * 0.5;
        out[i] = Math.tanh(Math.sin(TAU * ph) * env * 1.25 * this.lvl + click * this.lvl) * 0.9;
      }
      this.t = t; this.ph = ph; this.prev = prev;
    }
  }

  class HAT {
    constructor() { this.t = 1e9; this.prev = 0; this.x1 = 0; this.y1 = 0; this.lo = 0; this.band = 0; }
    setParams(p) { this.dec = lp(0.008, 0.6, p.decay); this.tone = p.tone; this.lvl = p.level; }
    process(ins, outs) {
      const sr = sampleRate;
      let { t, prev, x1, y1, lo, band } = this;
      const f = 2400 + this.tone * 5200;
      const a = 2 * Math.sin(Math.PI * f / sr);
      const d = Math.min(0.45, (2 - a) / 2 - 0.01);           // stable bandpass damping
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        const tr = ins.trig[i] > 0.5 ? 1 : 0;
        if (tr && !prev) t = 0;
        prev = tr;
        t += 1 / sr;
        const n = this.rng() * 2 - 1;
        const src = n * Math.exp(-t / this.dec);
        const dc = src - x1 + 0.995 * y1; x1 = src; y1 = dc;  // DC blocker
        lo += a * band;                                        // state-variable bandpass
        const hi = dc - lo - d * band;
        band += a * hi;
        out[i] = Math.tanh(band * 1.4) * this.lvl * 0.8;
      }
      this.t = t; this.prev = prev; this.x1 = x1; this.y1 = y1; this.lo = lo; this.band = band;
    }
  }

  class SNARE {
    constructor() { this.t = 1e9; this.prev = 0; this.ph = 0; this.x1 = 0; this.y1 = 0; }
    setParams(p) { this.tune = p.tune; this.dec = lp(0.03, 0.5, p.decay); this.lvl = p.level; }
    process(ins, outs) {
      const sr = sampleRate;
      let { t, prev, ph, x1, y1 } = this;
      const f = 120 + this.tune * 160;
      const out = outs.out;
      for (let i = 0; i < 128; i++) {
        const tr = ins.trig[i] > 0.5 ? 1 : 0;
        if (tr && !prev) { t = 0; ph = 0; }
        prev = tr;
        t += 1 / sr;
        const src = (this.rng() * 2 - 1) * Math.exp(-t / this.dec);
        const dc = src - x1 + 0.99 * y1; x1 = src; y1 = dc;
        ph += f / sr;
        const tone = Math.sin(TAU * ph) * Math.exp(-t / (this.dec * 0.5));
        out[i] = Math.tanh(dc * 0.99 + tone * 0.8) * this.lvl * 0.8;
      }
      this.t = t; this.prev = prev; this.ph = ph; this.x1 = x1; this.y1 = y1;
    }
  }

  class ATT {
    setParams(p) { this.att = p.att * 4; this.off = (p.off - 0.5) * 2; }
    process(ins, outs) {
      const out = outs.out, m1 = outs.m1, m2 = outs.m2;
      const in_ = ins.in, m = ins.m;
      for (let i = 0; i < 128; i++) {
        out[i] = clamp(in_[i] * this.att + this.off, -2, 2);
        m1[i] = m[i]; m2[i] = m[i];
      }
    }
  }

  class MIDICV {
    constructor() { this.note = 60; this.gate = 0; this.vel = 0; this.stack = []; }
    setParams(p) { this.oct = Math.round(p.oct * 4 - 2); this.vAmt = 0.3 + p.vel * 0.7; }
    noteEvent(on, note, vel) {
      if (on) { this.stack = this.stack.filter((n) => n !== note); this.stack.push(note); this.note = note; this.vel = vel / 127; this.gate = 1; }
      else {
        this.stack = this.stack.filter((n) => n !== note);
        if (this.stack.length) this.note = this.stack[this.stack.length - 1];
        else this.gate = 0;
      }
    }
    process(ins, outs) {
      const p = clamp((this.note + this.oct * 12 - 24) / NOTES_SPAN, 0, 1);
      const g = this.gate, v = this.gate ? this.vel * this.vAmt : 0;
      const p_ = outs.p, g_ = outs.g, v_ = outs.v;
      for (let i = 0; i < 128; i++) { p_[i] = p; g_[i] = g; v_[i] = v; }
    }
  }

  const UNITS = {
    vco: VCO, lfo: LFO, adsr: ADSR, vca: VCA, filter: FILTER, noise: NOISE, sha: SHA,
    seq: SEQ, clock: CLOCK, quant: QUANT, mixer: MIXER, delay: DELAY, reverb: REVERB,
    kick: KICK, hat: HAT, snare: SNARE, att: ATT, midicv: MIDICV,
  };
  const OUTS = {                                   // output jack names, in panel order
    vco: ["saw", "tri", "sqr", "sin"], lfo: ["out"], adsr: ["e", "inv"], vca: ["out"],
    filter: ["out"], noise: ["w", "p"], sha: ["out"], seq: ["pitch", "gate"],
    clock: ["t16", "b", "bar"], quant: ["out"], mixer: ["out"], delay: ["out"],
    reverb: ["out"], kick: ["out"], hat: ["out"], snare: ["out"], att: ["out", "m1", "m2"],
    midicv: ["p", "g", "v"],
  };
  const INS = {                                    // input jack names, in panel order
    vco: ["v", "fm", "sync"], lfo: ["rate"], adsr: ["g"], vca: ["in", "cv"],
    filter: ["in", "cv"], noise: [], sha: ["trig", "in"], seq: ["clk", "rst"],
    clock: [], quant: ["in"], mixer: ["i1", "i2", "i3", "i4"], delay: ["in"],
    reverb: ["in"], kick: ["trig"], hat: ["trig"], snare: ["trig"], att: ["in", "m"],
    midicv: [], out: ["l", "r"],
  };

  class EurorackProcessor extends AudioWorkletProcessor {
    constructor(opts) {
      super();
      this.nodes = []; this.cables = []; this.outNode = null; this.byId = new Map();
      this.lv = new Float32Array(0); this.jackMap = [];
      this.frame = 0; this.limiterPeak = 0; this.errs = 0;
      this.scopeBuf = new Float32Array(512); this.scopeSign = new Int8Array(512).fill(1); this.scopeW = 0;
      const po = opts && opts.processorOptions;
      this.build((po && po.patch) || { modules: [], cables: [] });
      this.port.onmessage = (e) => {
        const m = e.data;
        try { this._message(m); } catch (err) { this._err(err); }
      };
    }
    _message(m) {
        if (m.t === "patch") this.build(m.patch);
        else if (m.t === "param") {
          const n = this.byId.get(m.m);
          const v = m.v;
          if (n && m.p in n.tp && Number.isFinite(v)) { n.tp[m.p] = v < 0 ? 0 : v > 1 ? 1 : v; }   // one NaN in a smoothing loop is permanent
        } else if (m.t === "bpm") { this.bpm = clamp(m.v, 30, 260); this._applyT16(); }
        else if (m.t === "note") {
          for (const n of this.nodes) if (n.type === "midicv") n.unit.noteEvent(m.on, m.note, m.vel ?? 100);
        } else if (m.t === "reset") this.build(this.lastPatch || { modules: [], cables: [] });
    }

    // patch = {modules:[{id,type}], params:{id:{p:v}}, cables:[{src:{m,j},dst:{m,j}}], bpm, seed, paramSpec}
    build(patch) {
      this.lastPatch = patch;
      this.rngSeed = patch.seed ?? 0x9e3779b9;
      this.bpm = patch.bpm ?? 104;
      const oldById = this.byId;                     // same id+type ⇒ reuse the unit object: plugging one cable must not rewind the transport
      this.nodes = []; this.cables = []; this.outNode = null;
      this.byId = new Map();
      const spec = patch.paramSpec || {};
      for (const m of patch.modules) {
        const isOut = m.type === "out";
        const n = {
          id: m.id, type: m.type,
          p: {}, tp: {},
          outs: {}, prevOuts: {}, inBuf: {},
          outNames: OUTS[m.type] || [],
          inNames: INS[m.type] || [],
          unit: isOut ? null
            : (oldById.get(m.id)?.type === m.type && oldById.get(m.id).unit) || new UNITS[m.type](),
        };
        for (const o of n.outNames) { n.outs[o] = new Float32Array(128); n.prevOuts[o] = new Float32Array(128); }
        for (const j of n.inNames) n.inBuf[j] = new Float32Array(128);
        for (const { p } of spec[m.type] || []) {
          const v = (patch.params && patch.params[m.id] && patch.params[m.id][p]) || 0;
          n.p[p] = v; n.tp[p] = v;
        }
        if (n.unit) {
          if (!n.unit.rng) {                          // a reused unit keeps its noise/track state too
            let h = 2166136261;
            for (let i = 0; i < m.id.length; i++) h = Math.imul(h ^ m.id.charCodeAt(i), 16777619);
            n.unit.rng = mulberry((h ^ this.rngSeed) >>> 0);
          }
          if (m.type === "seq") n.freeRun = !(patch.cables || []).some((c) => c.dst.m === m.id && c.dst.j === "clk");
          try { n.unit.setParams(n.p, { freeRun: n.freeRun }); } catch { /* a unit with no params */ }
        }
        this.byId.set(m.id, n);
        if (isOut) this.outNode = n;
        this.nodes.push(n);
      }
      if (!this.outNode) {
        this.outNode = { id: "_out", type: "out", p: { level: 0.7 }, tp: {}, outs: {}, prevOuts: {}, inBuf: { l: new Float32Array(128), r: new Float32Array(128) }, outNames: [], inNames: ["l", "r"], unit: null };
        this.nodes.push(this.outNode);
      }
      for (const c of patch.cables || []) {
        const sn = this.byId.get(c.src.m), dn = this.byId.get(c.dst.m);
        if (!sn || !dn) continue;
        if (!sn.outNames.includes(c.src.j) || !dn.inNames.includes(c.dst.j)) continue;
        this.cables.push({ sn, sj: c.src.j, dn, dj: c.dst.j, carry: 0 });
      }
      this.jackMap = [];
      for (const n of this.nodes) for (const o of n.outNames) this.jackMap.push(`${n.id}.${o}`);
      this.lv = new Float32Array(this.jackMap.length);
      this.lvIdx = new Map(this.jackMap.map((k, i) => [k, i]));
      this.frame = 0;
      this.limiterPeak = 0;
    }

    _applyT16() {
      const r = this.bpm / (15 * sampleRate);          // per-sample 1/16-note rate
      for (const n of this.nodes) if (n.unit && (n.type === "seq" || n.type === "clock")) n.unit.t16 = r;
    }

    _err(e) {                                  // report a fault, once-ish: a catch that posts
      if (this.errs++ >= 5) return;             // every block is 18k console lines a second
      this.port.postMessage({ t: "err", msg: String(e && e.stack || e) });
    }
    process(inputs, outputs, config) {
      try { return this._process(inputs, outputs, config); }
      catch (e) {
        this._err(e);
        for (const ch of outputs[0] || []) if (ch) ch.fill(0);   // silence, never stale buffers
        return true;
      }
    }

    _process(inputs, outputs, config) {
      const L = outputs[0][0], R = outputs[0][1] || outputs[0][0];
      const sr = sampleRate;
      // roll smoothed params towards their targets
      for (const n of this.nodes) {
        let moved = false;
        for (const k in n.tp) {
          const d = n.tp[k] - n.p[k];
          if (Math.abs(d) > 1e-5) { n.p[k] += d * 0.35; moved = true; }
          else if (n.p[k] !== n.tp[k]) { n.p[k] = n.tp[k]; moved = true; }
        }
        if (moved && n.unit && n.unit.setParams) {
          try { n.unit.setParams(n.p, { freeRun: n.freeRun }); } catch { /* no params */ }
        }
        if (n.unit && (n.type === "seq" || n.type === "clock")) n.unit.t16 = this.bpm / (15 * sampleRate);   // per-sample 1/16 rate: one wrap per 60/bpm/4 s
      }
      // rotate output blocks: prevOuts becomes last block for cable reads
      for (const n of this.nodes) for (const o of n.outNames) { const t = n.prevOuts[o]; n.prevOuts[o] = n.outs[o]; n.outs[o] = t; }
      // mix cables: dst[i] += src[i-1] of the previous block (carry from block before)
      for (const n of this.nodes) for (const j of n.inNames) n.inBuf[j].fill(0);
      for (const c of this.cables) {
        const src = c.sn.prevOuts[c.sj], dst = c.dn.inBuf[c.dj];
        dst[0] += c.carry;
        for (let i = 1; i < 128; i++) dst[i] += src[i - 1];
        c.carry = src[127];
      }
      // units
      for (const n of this.nodes) if (n.unit) {
        n.unit.process(n.inBuf, n.outs);
        // one bad feedback patch must not poison a whole performance: clamp every unit's
        // outputs to a sane audio/CV range and kill non-finite states where they appear
        for (const o of n.outNames) {
          const a = n.outs[o];
          for (let i = 0; i < 128; i++) {
            const v = a[i];
            if (!(v >= -8 && v <= 8)) a[i] = v > 8 ? 8 : v < -8 ? -8 : 0;   // NaN/±Inf → 0
          }
        }
      }
      // master: OUTPUT module level -> soft saturation -> peak limiter
      const out = this.outNode;
      const lvl = out.p.level ?? 0.7;
      const inL = out.inBuf.l, inR = out.inBuf.r;
      const a = 1 - Math.exp(-1 / (0.003 * sr)), rel = 1 - Math.exp(-1 / (0.09 * sr));
      for (let i = 0; i < 128; i++) {
        const satL = Math.tanh(inL[i] * lvl * 1.35) * 0.86;
        const satR = Math.tanh(inR[i] * lvl * 1.35) * 0.86;
        const abs = Math.max(Math.abs(satL), Math.abs(satR));   // one limiter, both channels
        this.limiterPeak += abs > this.limiterPeak ? (abs - this.limiterPeak) * a : -(this.limiterPeak - abs) * rel;
        const g = this.limiterPeak > 0.89 ? 0.89 / this.limiterPeak : 1;
        const oL = Math.max(-0.999, Math.min(0.999, satL * g));
        const oR = Math.max(-0.999, Math.min(0.999, satR * g));
        L[i] = oL; R[i] = oR;
        const o = (oL + oR) * 0.5;
        this.scopeBuf[this.scopeW] = Math.abs(o);
        this.scopeSign[this.scopeW] = o < 0 ? -1 : 1;
        this.scopeW = (this.scopeW + 1) % 512;
      }
      // meters + telemetry at ~24 Hz
      for (let j = 0; j < this.jackMap.length; j++) {
        const k = this.jackMap[j], dot = k.indexOf(".");
        const n = this.byId.get(k.slice(0, dot));
        const arr = n && n.outs[k.slice(dot + 1)];
        let pk = 0;
        if (arr) for (let i = 0; i < 128; i++) { const v = Math.abs(arr[i]); if (v > pk) pk = v; }
        this.lv[j] = Math.max(pk, this.lv[j] * 0.86);
      }
      this.frame = (this.frame + 1) % 12;
      if (this.frame === 0) {
        const seq = {};
        for (const n of this.nodes) if (n.type === "seq") seq[n.id] = n.unit.played;
        const scope = new Array(512);
        for (let i = 0; i < 512; i++) {
          const k = (this.scopeW + i) % 512;
          scope[i] = Math.round(this.scopeBuf[k] * this.scopeSign[k] * 512) / 512;
        }
        this.port.postMessage({
          t: "lv",
          lv: Array.from(this.lv, (v) => Math.round(v * 512) / 512),
          k: this.jackMap,                       // keys, so meters survive any re-sort the UI does
          scope: Array.from(scope, (v) => Math.round(v * 512) / 512),
          seq,
        });
      }
      return true;
    }
  }
  registerProcessor("eurorack", EurorackProcessor);
})();
