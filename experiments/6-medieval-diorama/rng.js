// Seeded randomness for the town generator: one string seed drives everything, so the same seed
// always grows the same city. Also the small value-noise / angular-Fourier helpers the terrain,
// the wall outline and the river are cut from.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A short pronounceable place-name, for the "new city" button and the ?seed= link. */
const SYL_A = ["Bram", "Thorn", "Mouth", "Kings", "Elm", "Fen", "Dun", "Low", "Ash", "Marsh", "Stan", "Wold", "Ald", "Craw", "Bar", "Mel", "Whit", "Har", "Lin", "Crom"];
const SYL_B = ["well", "field", "ford", "mere", "holt", "bury", "caster", "wick", "stead", "gham", "ridge", "moor", "ton", "burgh", "dale", "haven", "port", "fell", "bridge"];
export function randomSeed(rnd = Math.random) {
  const r = new Rng(`${Date.now()}:${rnd()}`);
  return `${r.pick(SYL_A)}${r.pick(SYL_B)}${r.chance(0.3) ? r.i(2, 99) : ""}`;
}

export class Rng {
  constructor(seed) {
    this.seed = String(seed);
    this.next = mulberry32(hashString(this.seed));
  }
  /** float in [a,b) */
  f(a = 0, b = 1) { return a + (b - a) * this.next(); }
  /** integer in [a,b] */
  i(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  range(n) { return Array.from({ length: n }, (_, i) => i); }
  /** weighted pick from [[value, weight], ...] */
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.next() * total;
    for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
    return pairs[pairs.length - 1][0];
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Smooth 2D value noise (period 256) plus fBm, seeded. */
export function makeNoise(rng) {
  const size = 256, mask = size - 1;
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const sm = (t) => t * t * (3 - 2 * t);
  const at = (a, b) => g[((b & mask) << 8) | (a & mask)];
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = sm(x - xi), v = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n2(x * freq, y * freq);
      norm += amp; amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }
  return { n2, fbm };
}

/**
 * A smooth periodic function of the angle: a random Fourier series over integer harmonics.
 * Used for the walled town's outline and the diorama's irregular rim, where periodicity matters.
 */
export function angularFn(rng, { harmonics = [1, 2, 3, 5, 7], amp = 1, phaseAmp = 1 } = {}) {
  const terms = harmonics.map((k) => ({
    k,
    a: rng.f(-amp, amp) / Math.sqrt(k),
    b: rng.f(-amp, amp) / Math.sqrt(k),
  }));
  const ph = rng.range(harmonics.length).map(() => rng.f(0, Math.PI * 2) * phaseAmp);
  return (angle) => {
    let s = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      s += t.a * Math.cos(t.k * angle + ph[i]) + t.b * Math.sin(t.k * angle - ph[i]);
    }
    return s;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
