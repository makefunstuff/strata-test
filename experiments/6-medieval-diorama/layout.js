// The town generator. One seed decides everything: the relief, where the river runs, the shape of
// the wall, which gates it has, how the streets grow out of the market square, every house lot, the
// fields outside and who walks where. Nothing is hand-placed and nothing is random at runtime — the
// same seed grows the same city.
import { Rng, makeNoise, angularFn, clamp, lerp, smoothstep, randomSeed } from "./rng.js";

export const SIZE = {
  R: 112,            // diorama radius (metres)
  depth: 34,         // how thick the chunk of earth is
  wallR: 58,         // nominal wall radius
  bayW: 2.0,         // one timber bay, wide
  bayH: 2.2,         // ...and tall: house sizes are snapped to whole bays so windows land in place
};

const FREE = 0, ROAD = 1, BUILT = 2, WALL = 3, WATER = 4, BLOCK = 5, TREE = 6;
const BUILT_OK = new Set([BUILT, TREE]);   // a house may share a party wall, and a tree may stand in its yard
const HOUSE_ONLY = new Set([FREE, ROAD, WALL, WATER, BLOCK, TREE]); // ...but its rooms may not overlap another house

/** A coarse occupancy raster: what stops a house, a tree or a cart from sitting on something else. */
export class Grid {
  constructor(size, cell) {
    this.size = size; this.cell = cell;
    this.n = Math.ceil((size * 2) / cell);
    this.a = new Uint8Array(this.n * this.n);
  }
  idx(x, z) {
    const i = Math.floor((x + this.size) / this.cell);
    const j = Math.floor((z + this.size) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }
  get(x, z) { const i = this.idx(x, z); return i < 0 ? WALL : this.a[i]; }
  set(x, z, v) { const i = this.idx(x, z); if (i >= 0) this.a[i] = Math.max(this.a[i], v); }
  /** sample a rotated rectangle; with requireFree it reports a collision and marks nothing */
  rect(cx, cz, w, d, rot, v, { requireFree = false, margin = 0, ignore = null } = {}) {
    const step = this.cell * 0.9;
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = w / 2 + margin, hd = d / 2 + margin;
    const cells = [];
    for (let u = -hw; u <= hw + 1e-6; u += step) {
      for (let t = -hd; t <= hd + 1e-6; t += step) {
        const x = cx + u * c + t * s;
        const z = cz - u * s + t * c;
        if (requireFree) {
          const got = this.get(x, z);
          if (got !== FREE && !(ignore && ignore.has(got))) return false;
        }
        cells.push(x, z);
      }
    }
    if (v != null) for (let i = 0; i < cells.length; i += 2) this.set(cells[i], cells[i + 1], v);
    return true;
  }
  disc(cx, cz, r, v, { requireFree = false, ignore = null } = {}) {
    const step = this.cell * 0.9;
    const cells = [];
    for (let u = -r; u <= r; u += step) {
      for (let t = -r; t <= r; t += step) {
        if (u * u + t * t > r * r) continue;
        const x = cx + u, z = cz + t;
        if (requireFree) {
          const got = this.get(x, z);
          if (got !== FREE && !(ignore && ignore.has(got))) return false;
        }
        cells.push(x, z);
      }
    }
    if (v != null) for (let i = 0; i < cells.length; i += 2) this.set(cells[i], cells[i + 1], v);
    return true;
  }
  count(v) { let n = 0; for (let i = 0; i < this.a.length; i++) if (this.a[i] === v) n++; return n; }
}

/** distance to a polyline plus where along it the nearest point sits */
function polylineDistance(pts, x, z) {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return { d: best, i: bi, t: bt };
}

function polylineLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  return L;
}

/** walk a polyline by distance: where lots, walkers and bridges are measured from */
function makeSampler(pts, step = 1.2) {
  const rp = polylineResample(pts, step);
  const cum = [0];
  for (let i = 0; i < rp.length - 1; i++) cum.push(cum[i] + Math.hypot(rp[i + 1].x - rp[i].x, rp[i + 1].z - rp[i].z));
  const total = cum[cum.length - 1] || 1e-3;
  const at = (d) => {
    d = clamp(d, 0, total);
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < d) i++;
    const a = rp[i], b = rp[i + 1] ?? rp[i];
    const seg = (cum[i + 1] ?? cum[i]) - cum[i] || 1e-4;
    const t = (d - cum[i]) / seg;
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), ux: (b.x - a.x) / seg, uz: (b.z - a.z) / seg };
  };
  return { at, total, pts: rp };
}

/** points every `step` along a polyline (keeps the ends) */
function polylineResample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last.x - out[out.length - 1].x, last.z - out[out.length - 1].z) > step * 0.3) out.push(last);
  return out;
}

function jitterPath(rng, pts, amount, { keepFirst = false, keepLast = false } = {}) {
  return pts.map((p, i) => {
    if ((i === 0 && keepFirst) || (i === pts.length - 1 && keepLast)) return { ...p };
    return { x: p.x + rng.f(-amount, amount), z: p.z + rng.f(-amount, amount) };
  });
}

/** Catmull-Rom through the control points — how a road that was never surveyed looks. */
function curvePath(pts, perSeg = 6, closed = false) {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [a, b, c, d] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * b.x + (-a.x + c.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (-a.x + 3 * b.x - 3 * c.x + d.x) * t3),
        z: 0.5 * (2 * b.z + (-a.z + c.z) * t + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * t2 + (-a.z + 3 * b.z - 3 * c.z + d.z) * t3),
      });
    }
  }
  out.push(closed ? { ...out[0] } : { ...pts[pts.length - 1] });
  return out;
}

const ROOFS = [
  { key: "roofTile", tint: [1.0, 0.95, 0.9] },
  { key: "roofTile", tint: [0.86, 0.76, 0.68] },
  { key: "roofSlate", tint: [1.0, 1.0, 1.06] },
  { key: "roofSlate", tint: [0.8, 0.84, 0.9] },
  { key: "roofThatch", tint: [1.0, 0.96, 0.88] },
  { key: "roofThatch", tint: [0.84, 0.78, 0.66] },
];

export const PALETTES = {
  cloth: [0xb2352c, 0x2f5a8c, 0x3f7048, 0xc8a23a, 0x6a3a6e, 0xd8d2c0],
  clothes: [0x6b4a34, 0x7d5a3c, 0x465a6b, 0x6e4048, 0x55603f, 0x8a7a5e, 0x3a3f46],
};

export function generateCity(seedIn) {
  const seed = String(seedIn ?? randomSeed());
  const rng = new Rng(seed);
  const noise = makeNoise(new Rng(seed + "/n"));
  const { R, depth, wallR } = SIZE;

  // ---- the outline of the earth chunk ---------------------------------------------------------
  const outlineWobble = angularFn(new Rng(seed + "/ow"), { harmonics: [2, 3, 5, 8], amp: 0.05 });
  const outline = (a) => R * (1 + outlineWobble(a));
  const outlineAt = (x, z) => outline(Math.atan2(z, x));

  // ---- the river: a meander right across the chunk -------------------------------------------
  const riverFlow = rng.f(0, Math.PI * 2);
  const riverDir = { x: Math.cos(riverFlow), z: Math.sin(riverFlow) };
  const riverPerp = { x: -riverDir.z, z: riverDir.x };
  // the river stays out in the fields: it passes to one side of the town, and the road goes to it
  const riverOffset = rng.sign() * rng.f(wallR + 10, R * 0.78);
  const riverMeander = rng.f(7, 14);
  const riverW = rng.f(10.5, 14);
  const riverDepth = rng.f(3.4, 4.6);
  // channel cross-section, fixed per seed: a flat bed of this half-width and a wall that reaches the
  // fields at wallHalf. Keeping these in metres (not fractions of riverW) is what lets the water be
  // a constant width, which is what makes a model river read as a river.
  const riverBed = rng.f(4.2, 6.2);
  const riverWall = riverBed + rng.f(3.6, 5.2);
  const riverPts = (() => {
    const pts = [];
    const span = R * 1.25, n = 13;
    const wave = rng.f(2.1, 3.4), phase = rng.f(0, 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const along = lerp(-span, span, t);
      const across = riverOffset
        + Math.sin(t * wave * Math.PI + phase) * riverMeander
        + (noise.n2(t * 4 + 3, 7.5) - 0.5) * 10;
      pts.push({ x: riverDir.x * along + riverPerp.x * across, z: riverDir.z * along + riverPerp.z * across });
    }
    return curvePath(pts, 5);
  })();
  const riverQuery = (x, z) => polylineDistance(riverPts, x, z);

  // ---- terrain -------------------------------------------------------------------------------
  const relief = (x, z) => (noise.fbm(x * 0.0125, z * 0.0125, 4) - 0.5) * 7.4
    + (noise.fbm(x * 0.05 + 13, z * 0.05 - 7, 3) - 0.5) * 1.5;
  const hillLift = rng.f(0, Math.PI * 2);
  // the keep stands on a motte, decided before height() is ever called
  const mound = (() => {
    const a = rng.f(0, Math.PI * 2);
    const rad = wallR * rng.f(0.4, 0.6);
    return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, r: wallR * rng.f(0.22, 0.28), h: rng.f(5, 7.5) };
  })();

  // the land before the river is cut: everything height() does except the channel
  function naturalTerrain(x, z) {
    const d = Math.hypot(x, z);
    let h = relief(x, z);
    h += Math.sin(x * 0.018 * Math.cos(hillLift) + z * 0.018 * Math.sin(hillLift)) * 1.6;
    // inside the walls the town has been graded flat
    const flat = 1 - smoothstep(wallR * 1.0, wallR * 1.42, d);
    h = lerp(h, (noise.fbm(x * 0.035, z * 0.035, 2) - 0.5) * 0.8 + 0.2, flat);
    const md = Math.hypot(x - mound.x, z - mound.z);
    h += mound.h * (1 - smoothstep(mound.r * 0.5, mound.r * 1.2, md));
    const od = outlineAt(x, z) - d;
    if (od < 11) h -= (11 - od) * 0.16 * (1 - od / 11);
    return h;
  }

  // the ground the river runs in, sampled along its length: the channel is cut a fixed depth below
  // this, so bed, wall and surface all share one datum
  const riverSamplesH = riverPts.map((p) => naturalTerrain(p.x, p.z));
  const riverBaseAt = (q) => lerp(riverSamplesH[q.i], riverSamplesH[q.i + 1] ?? riverSamplesH[q.i], q.t);

  function height(x, z) {
    const nat = naturalTerrain(x, z);
    const q = riverQuery(x, z);
    if (q.d >= riverWall) return nat;
    // a trapezoid cut into the local ground: flat bed out to riverBed, then a wall rising exactly
    // riverDepth to the fields. Because the rise is the same everywhere, the water surface crosses it
    // at the same distance everywhere — a constant-width ribbon that neither pinches nor floods
    const w = 1 - smoothstep(riverBed, riverWall, q.d);
    return lerp(nat, nat - riverDepth, w);
  }
  // the surface sits 0.28 of the depth under the fields, which is where the wall crosses it
  const waterY = (x, z) => riverBaseAt(riverQuery(x, z)) - riverDepth * 0.28;
  // where the wall crosses the surface (smoothstep 0.72 of the way up), plus a little overlap so the
  // ribbon tucks under the bank instead of leaving a dry ledge of bed along the edge
  const waterHalf = riverBed + (riverWall - riverBed) * 0.7;

  // ---- the wall ------------------------------------------------------------------------------
  const wallNoise = angularFn(new Rng(seed + "/w"), { harmonics: [1, 2, 3, 4, 6, 9], amp: 0.1 });
  const wallVertexCount = rng.i(18, 22);
  const wallVerts = [];
  for (let i = 0; i < wallVertexCount; i++) {
    const a = (i / wallVertexCount) * Math.PI * 2;
    const r = wallR * (1 + wallNoise(a));
    wallVerts.push({ a, r, x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  const wallRadiusAt = (a) => {
    const t = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const f = (t / (Math.PI * 2)) * wallVertexCount;
    const i0 = Math.floor(f) % wallVertexCount;
    const i1 = (i0 + 1) % wallVertexCount;
    return lerp(wallVerts[i0].r, wallVerts[i1].r, f - Math.floor(f));
  };
  const insideWall = (x, z) => Math.hypot(x, z) < wallRadiusAt(Math.atan2(z, x)) - 1.2;

  const grid = new Grid(R, 1.0);
  for (let s = 0; s < 900; s++) {                       // the wall band
    const a = (s / 900) * Math.PI * 2, r = wallRadiusAt(a);
    for (let k = -3; k <= 3; k++) grid.set(Math.cos(a) * (r + k), Math.sin(a) * (r + k), WALL);
  }
  for (let s = 0; s < 900; s++) {                       // nothing builds on the rim
    const a = (s / 900) * Math.PI * 2, r0 = outline(a) * 0.93;
    for (let k = 0; k < 6; k++) grid.set(Math.cos(a) * (r0 + k * 1.2), Math.sin(a) * (r0 + k * 1.2), BLOCK);
  }
  for (let s = 0; s < 1500; s++) {                      // nor in the water
    const p = riverPts[Math.floor((s / 1500) * (riverPts.length - 1))];
    grid.disc(p.x, p.z, riverW * 0.8, WATER);
  }

  // ---- gates: one faces the bridge, the others face the fields -------------------------------
  let nearest = riverPts[0], nd = Infinity;
  for (const p of riverPts) { const d = Math.hypot(p.x, p.z); if (d < nd) { nd = d; nearest = p; } }
  const bridgePoint = { ...nearest };
  const gateAngles = [Math.atan2(bridgePoint.z, bridgePoint.x)];
  while (gateAngles.length < 3) {
    const a = rng.f(0, Math.PI * 2);
    if (gateAngles.every((g) => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 1.15)) gateAngles.push(a);
  }
  const gates = gateAngles.map((a) => {
    let bi = 0, bd = Infinity;
    wallVerts.forEach((v, i) => {
      const d = Math.abs(((v.a - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bd) { bd = d; bi = i; }
    });
    const v = wallVerts[bi];
    return { i: bi, a: v.a, x: v.x, z: v.z, road: null };
  });
  const gateIdx = new Set(gates.map((g) => g.i));
  const nearGate = (x, z) => gates.some((g) => Math.hypot(x - g.x, z - g.z) < 7);

  // ---- the great houses, reserved before the streets so no road cuts through them -------------
  const castle = {
    x: mound.x, z: mound.z, r: mound.r * 1.05,
    keep: { w: rng.f(7.5, 9.5), d: rng.f(7.5, 9.5), h: rng.f(15, 19), rot: rng.f(-0.3, 0.3) },
    hall: { w: rng.f(7, 8.5), d: rng.f(12, 15), h: rng.f(7, 8.5), rot: rng.f(0, 6.283) },
    tower: { a: rng.f(0, 6.283), r: rng.f(3.6, 4.3), h: rng.f(13, 16), roof: rng.chance(0.5) },
  };
  grid.disc(castle.x, castle.z, castle.r + 1, BLOCK);

  const cathedral = (() => {
    const moundA = Math.atan2(mound.z, mound.x);
    const spec = {
      nave: { w: rng.f(10, 12), d: rng.f(17, 23), h: rng.f(10.5, 12.5) },
      aisle: { h: rng.f(5.8, 7) },
      tower: { w: rng.f(5, 6), h: rng.f(18, 23), spire: rng.f(10, 14) },
      transept: { w: rng.f(16, 20), d: rng.f(5.5, 7) },
    };
    for (let tries = 0; tries < 120; tries++) {
      const a = moundA + rng.sign() * rng.f(1.7, 4.5);
      const r = rng.f(12, wallR * 0.58);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!insideWall(x, z)) continue;
      const rot = a + Math.PI / 2 + rng.f(-0.35, 0.35);       // long axis tangential, so it sits along a street
      const free = grid.rect(x, z, spec.transept.w + 3, spec.nave.d + 5, rot, null, { requireFree: true, margin: 0.5 });
      if (!free) continue;
      if (Math.hypot(x - mound.x, z - mound.z) < castle.r + 9) continue;
      grid.rect(x, z, spec.transept.w + 3, spec.nave.d + 5, rot, BLOCK, { margin: 0 });
      return { x, z, rot, ...spec };
    }
    return null;
  })();

  const blockedForRoad = (x, z) => {
    if (nearGate(x, z)) return false;
    if (!insideWall(x, z)) return false;
    if (Math.hypot(x - castle.x, z - castle.z) < castle.r + 3) return true;
    if (cathedral && grid.get(x, z) === BLOCK) return true;
    return false;
  };

  // ---- streets -------------------------------------------------------------------------------
  const streets = [];
  const prox = new Grid(R, 1.0);                    // "not another road crawling alongside me"
  const proxClear = (x, z) => prox.get(x, z) === 0;
  const market = { x: 0, z: 0, r: rng.f(7, 9) };

  function addStreet(pts, width, kind, { tries = 6, bend = 0, spacing = 12 } = {}) {
    // grow a few variants of the same road and keep the one that respects the reserved ground and
    // does not run alongside a street that already exists
    let chosen = pts, penalty = Infinity;
    for (let t = 0; t < tries; t++) {
      const cand = t === 0 ? pts : curvePath(jitterPath(new Rng(seed + "/s" + t + kind), pts, bend || 2.2, { keepFirst: true, keepLast: true }), 6);
      let bad = 0;
      for (let i = 0; i < cand.length; i++) {
        const p = cand[i];
        if (blockedForRoad(p.x, p.z)) bad += 3;
        if (t > 0 && i > 1 && i < cand.length - 2 && !proxClear(p.x, p.z)) bad += 1;
      }
      if (bad < penalty) { penalty = bad; chosen = cand; }
      if (bad === 0) break;
    }
    const s = { pts: chosen, width, kind, len: polylineLength(chosen) };
    for (const p of s.pts) prox.disc(p.x, p.z, spacing, 1);
    streets.push(s);
    return s;
  }

  const mainPts = (() => {
    const g0 = gates[0], far = gates[1];
    const mid = { x: (g0.x + far.x) * 0.5, z: (g0.z + far.z) * 0.5 };
    const bend = rng.f(3, 7);
    return [
      { x: g0.x * 1.95, z: g0.z * 1.95 },
      { x: bridgePoint.x * 1.16, z: bridgePoint.z * 1.16 },
      { x: g0.x * 1.1, z: g0.z * 1.1 },
      { x: g0.x * 0.62, z: g0.z * 0.62 },
      { x: lerp(g0.x, far.x, 0.38) + rng.f(-bend, bend), z: lerp(g0.z, far.z, 0.38) + rng.f(-bend, bend) },
      { x: mid.x + rng.f(-bend, bend) * 0.5, z: mid.z + rng.f(-bend, bend) * 0.5 },
      { x: far.x * 0.55 + rng.f(-3, 3), z: far.z * 0.55 + rng.f(-3, 3) },
      { x: far.x * 1.1, z: far.z * 1.1 },
      { x: far.x * 1.9, z: far.z * 1.9 },
    ];
  })();
  const main = addStreet(curvePath(mainPts, 7), rng.f(4.0, 4.8), "main", { tries: 8, bend: 3.5 });
  gates[0].road = main; gates[1].road = main;
  {
    // the square goes where the main street is furthest from the great houses
    let best = null, bestScore = -Infinity;
    for (const p of main.pts) {
      const d = Math.hypot(p.x, p.z);
      if (d > wallR - 8 || d < wallR * 0.18) continue;
      let score = Math.min(Math.hypot(p.x - castle.x, p.z - castle.z) - castle.r, 26);
      if (cathedral) score = Math.min(score, Math.hypot(p.x - cathedral.x, p.z - cathedral.z) - 13);
      score += rng.f(0, 3);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) { market.x = best.x; market.z = best.z; }
    else { const p = main.pts[Math.floor(main.pts.length * 0.45)]; market.x = p.x; market.z = p.z; }
  }
  {
    const g2 = gates[2];
    const pts = [
      { x: g2.x * 1.85, z: g2.z * 1.85 },
      { x: g2.x * 1.1, z: g2.z * 1.1 },
      { x: g2.x * 0.5 + rng.f(-3, 3), z: g2.z * 0.5 + rng.f(-3, 3) },
      { x: market.x * 0.4 + g2.x * 0.25 + rng.f(-4, 4), z: market.z * 0.4 + g2.z * 0.25 + rng.f(-4, 4) },
      { x: -g2.x * 0.45 + rng.f(-4, 4), z: -g2.z * 0.45 + rng.f(-4, 4) },
      { x: -g2.x * 0.95, z: -g2.z * 0.95 },
    ];
    gates[2].road = addStreet(curvePath(pts, 6), rng.f(3.0, 3.8), "street", { tries: 6, bend: 2.6 });
  }
  {
    const pts = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = wallRadiusAt(a) * rng.f(0.7, 0.8);
      pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    addStreet(curvePath(pts, 6, false), rng.f(2.8, 3.4), "ring", { tries: 6, bend: 2.5 });
  }
  {
    // an inner street, part of the way round, half-way out from the square
    const a0 = rng.f(0, Math.PI * 2), sweep = rng.f(1.2, 2.4);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (sweep * i) / 10;
      const r = wallR * rng.f(0.36, 0.52);
      pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    addStreet(curvePath(pts, 6), rng.f(2.6, 3.2), "ring", { tries: 5, bend: 2 });
  }
  {
    const laneCount = rng.i(8, 11);
    const step = rng.f(9, 12);
    for (let k = 0; k < laneCount; k++) {
      const parent = streets[rng.i(0, streets.length - 1)];
      const ps = makeSampler(parent.pts, 3);
      let start = null, startA = 0;
      for (let t = 0; t < 16; t++) {
        const p = ps.at(rng.f(0, ps.total));
        const r = Math.hypot(p.x, p.z);
        if (r < 4 || r > wallRadiusAt(Math.atan2(p.z, p.x)) - 8) continue;
        if (blockedForRoad(p.x, p.z)) continue;
        // lanes leave their parent broadside: that is what fills the blocks between the big roads
        start = p;
        startA = Math.atan2(p.uz, p.ux) + (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) + rng.f(-0.35, 0.35);
        break;
      }
      if (!start) continue;
      let a = startA;
      const want = rng.i(3, 5);
      const pts = [{ ...start }];
      const spacing = 10;
      let travelled = 0;
      let guard = 0;
      while (pts.length < want + 1 && guard++ < 12) {
        const p = pts[pts.length - 1];
        const nx = p.x + Math.cos(a) * step, nz = p.z + Math.sin(a) * step;
        const crowded = pts.length > 2 && travelled > 15 && !proxClear(nx, nz);
        if (Math.hypot(nx, nz) > wallRadiusAt(Math.atan2(nz, nx)) - 4 || blockedForRoad(nx, nz) || riverQuery(nx, nz).d < riverW || crowded) {
          a += rng.f(0.6, 1.3);            // turn aside rather than die on the obstacle
          continue;
        }
        pts.push({ x: nx, z: nz });
        travelled += step;
        a += rng.f(-0.42, 0.42);
      }
      if (pts.length < 3) continue;
      addStreet(curvePath(pts, 5), rng.f(2.4, 3.0), "lane", { tries: 1 });
    }
    for (const g of gates) {
      if (!rng.chance(0.75)) continue;
      const a = g.a + rng.f(-0.5, 0.5);
      const r0 = outline(a) * rng.f(0.6, 0.85);
      const pts = [
        { x: Math.cos(a) * (wallR * 0.96), z: Math.sin(a) * (wallR * 0.96) },
        { x: Math.cos(a) * r0 * 0.78 + rng.f(-4, 4), z: Math.sin(a) * r0 * 0.78 + rng.f(-4, 4) },
        { x: Math.cos(a) * r0 + rng.f(-5, 5), z: Math.sin(a) * r0 + rng.f(-5, 5) },
      ];
      addStreet(curvePath(pts, 6), rng.f(2.4, 3.2), "suburb", { tries: 3 });
    }
  }
  for (const s of streets) for (const p of s.pts) grid.disc(p.x, p.z, s.width * 0.5 + 0.45, ROAD);
  grid.disc(market.x, market.z, market.r + 1.2, BLOCK);

  // ---- houses -------------------------------------------------------------------------------
  const houses = [];
  const chimneys = [];
  const windows = [];

  function houseSpec(w, d, floors, opts = {}) {
    const roofPal = rng.chance(0.42) ? ROOFS[rng.i(0, 1)]
      : rng.chance(0.55) ? ROOFS[rng.i(2, 3)] : ROOFS[rng.i(4, 5)];
    return {
      w, d, floors,
      bay: rng.i(0, 5),
      roof: roofPal,
      ridge: opts.ridge ?? (rng.chance(0.62) ? "z" : "x"),
      jetty: opts.jetty ?? (floors > 1 && rng.chance(0.62) ? rng.f(0.35, 0.7) : 0),
      rise: rng.f(0.9, 1.5),
      chimneySide: rng.sign(),
      chimney: opts.chimney ?? rng.chance(0.74),
      porch: opts.porch ?? rng.chance(0.3),
      workshop: rng.chance(0.22),
      garden: rng.chance(0.55),
      tilt: rng.f(-0.012, 0.012),
      // where the windows go, in the house's own metres: the street gable always has them, the
      // other three faces only sometimes, which is how a real terrace ends up uneven
      win: (() => {
        const list = [];
        const nb = Math.max(1, Math.round(w / SIZE.bayW));
        const nd = Math.max(1, Math.round(d / SIZE.bayW));
        const row = (axis, faceSign, count, doIt) => {
          if (!doIt) return;
          for (let b = 0; b < count; b++) for (let fy = 0; fy < floors; fy++) list.push({ axis, faceSign, b, fy });
        };
        row("x", 1, nb, true);
        row("x", -1, nb, rng.chance(0.8));
        row("z", 1, nd, rng.chance(0.55));
        row("z", -1, nd, rng.chance(0.45));
        return list;
      })(),
      ...opts,
    };
  }

  function pushHouse(h) {
    houses.push(h);
    grid.rect(h.x, h.z, h.w + 0.5, h.d + 0.5, h.rot, BUILT);
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    const wallH = h.floors * SIZE.bayH;
    const rise = (h.w + h.d) * 0.28 * h.rise;
    if (h.chimney) {
      const lx = h.ridge === "z" ? h.chimneySide * (h.w * 0.3) : 0;
      const lz = h.ridge === "z" ? 0 : h.chimneySide * (h.d * 0.3);
      chimneys.push({ x: h.x + lx * c + lz * s, y: h.y + wallH + rise * 0.75 + 1.1, z: h.z - lx * s + lz * c, big: h.floors > 2 });
    }
    const row = (axis, faceSign, count) => {
      for (const wd of h.win) {
        if (wd.axis !== axis || wd.faceSign !== faceSign || wd.b >= count) continue;
        const y = h.y + wd.fy * SIZE.bayH + SIZE.bayH * 0.62;
        const lx = axis === "x" ? -h.w / 2 + SIZE.bayW * (wd.b + 0.5) : faceSign * (h.w / 2 + 0.14);
        const lz = axis === "x" ? faceSign * (h.d / 2 + 0.14) : -h.d / 2 + SIZE.bayW * (wd.b + 0.5);
        windows.push({
          x: h.x + lx * c + lz * s, y, z: h.z - lx * s + lz * c,
          rot: h.rot + (axis === "x" ? (faceSign > 0 ? 0 : Math.PI) : (faceSign > 0 ? Math.PI / 2 : -Math.PI / 2)),
        });
      }
    };
    const nb = Math.max(1, Math.round(h.w / SIZE.bayW));
    const nd = Math.max(1, Math.round(h.d / SIZE.bayW));
    row("x", 1, nb);
    if (rng.chance(0.8)) row("x", -1, nb);
    if (rng.chance(0.55)) row("z", 1, nd);
    if (rng.chance(0.45)) row("z", -1, nd);
  }

  /** the lot shapes a medieval plot comes in: whole bays wide, whole bays deep */
  const LOT_SIZES = [];
  for (const w of [6, 8, 10]) for (const dLot of [6, 8, 10, 12, 14]) LOT_SIZES.push([w, dLot]);

  /** can a house of this footprint stand here? it may share a party wall, but not a room */
  function lotFits(cx, cz, w, dLot, rot) {
    if (!grid.rect(cx, cz, w + 0.4, dLot + 0.4, rot, null, { requireFree: true, margin: 0.1, ignore: BUILT_OK })) return false;
    return grid.rect(cx, cz, Math.max(2, w - 1), Math.max(2, dLot - 1), rot, null, { requireFree: true, ignore: HOUSE_ONLY });
  }

  /** walk a street by distance and pack lots against both kerbs — this is what makes it look grown */
  function lineHouses(street, { insideOnly = true, density = 1, emptyChance = 0.12 } = {}) {
    const { at, total } = makeSampler(street.pts, 1.3);
    if (total < 9) return;
    for (const side of [-1, 1]) {
      let d = rng.f(0.5, 3);
      let guard = 0;
      while (d < total - 3 && guard++ < 240) {
        if (rng.chance(emptyChance)) { d += rng.f(3, 7); continue; }
        const p = at(Math.min(total, d + 4));
        const nx = -p.uz * side, nz = p.ux * side;      // into the lot on this side
        const rot = Math.atan2(nx, nz);                 // the house's +Z runs away from the street
        // try the shapes this plot could take, nearest the kerb first, and take the first that fits
        let placed = 0, usedD = 0, usedBack = 0;
        for (const [w, dLot] of rng.shuffle(LOT_SIZES)) {
          if (d + w > total - 0.3) continue;
          const backs = street.kind === "lane" ? [1.0, 2.0, 3.0] : [1.2, 2.2, 3.5, 4.5];
          let done = false;
          for (const back of backs) {
            const cx = p.x + nx * (street.width * 0.5 + dLot / 2 + back);
            const cz = p.z + nz * (street.width * 0.5 + dLot / 2 + back);
            if (insideOnly && !insideWall(cx, cz)) continue;
            if (!insideOnly && Math.hypot(cx, cz) > outline(Math.atan2(cz, cx)) * 0.9) continue;
            if (Math.hypot(cx, cz) < 2) continue;
            if (!lotFits(cx, cz, w, dLot, rot)) continue;
            const floors = rng.weighted([[1, 3], [2, 6], [3, 2.2], [4, 0.4]]);
            pushHouse({ ...houseSpec(w, dLot, floors), x: cx, z: cz, y: height(cx, cz), rot });
            placed = w; usedD = dLot; usedBack = back;
            done = true;
            break;
          }
          if (done) break;
        }
        if (!placed) { d += rng.f(2.5, 5); continue; }
        d += placed + rng.f(0.05, 0.5);
        if (rng.chance(1 - density)) d += rng.f(0.5, 3);

        // then keep building away from the street while the block runs deep: the back tofts,
        // the yards behind the frontage where the town actually packed itself
        const p2 = at(Math.min(total, d - placed / 2));
        let wall = street.width * 0.5 + usedD / 2 + usedBack;
        for (let row = 0; row < 3; row++) {
          if (!rng.chance(row === 0 ? 0.74 : row === 1 ? 0.5 : 0.3)) break;
          let got = false;
          for (const [w2, d2] of rng.shuffle(LOT_SIZES)) {
            const cx2 = p2.x + nx * (wall + d2 / 2 + 0.7);
            const cz2 = p2.z + nz * (wall + d2 / 2 + 0.7);
            if (insideOnly && !insideWall(cx2, cz2)) continue;
            if (Math.hypot(cx2, cz2) < 2 || Math.hypot(cx2, cz2) > outline(Math.atan2(cz2, cx2)) * 0.9) continue;
            if (!lotFits(cx2, cz2, w2, d2, rot + (rng.chance(0.3) ? Math.PI : 0))) continue;
            pushHouse({ ...houseSpec(w2, d2, rng.weighted([[1, 5], [2, 4], [3, 1]])), x: cx2, z: cz2, y: height(cx2, cz2), rot: rot + (rng.chance(0.3) ? Math.PI : 0) });
            wall += d2 / 2 + 0.7;
            got = true;
            break;
          }
          if (!got) break;
        }
      }
    }
  }

  /**
   * Fill what the streets could not reach: crooked plots wedged into the interiors of blocks,
   * lined on the town's own grain rather than on any road.
   */
  function infillHouses(tries = 1100) {
    for (let i = 0; i < tries; i++) {
      const a = rng.f(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * (wallR - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!insideWall(x, z) || Math.hypot(x, z) < 3) continue;
      const rot = a + Math.PI / 2 + rng.f(-0.14, 0.14) + (rng.chance(0.24) ? Math.PI / 2 : 0);
      for (const [w, dLot] of rng.shuffle(LOT_SIZES)) {
        if (!lotFits(x, z, w, dLot, rot)) continue;
        pushHouse({ ...houseSpec(w, dLot, rng.weighted([[1, 5], [2, 5], [3, 2]])), x, z, y: height(x, z), rot });
        break;
      }
    }
  }
  for (const s of streets) if (s.kind !== "suburb") lineHouses(s, { insideOnly: true, density: rng.f(0.82, 1) });
  infillHouses(rng.i(900, 1400));
  for (const s of streets) if (s.kind === "suburb") lineHouses(s, { insideOnly: false, density: rng.f(0.5, 0.85), emptyChance: 0.34 });

  // houses facing the square
  {
    const n = rng.i(7, 10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.f(-0.12, 0.12);
      const w = rng.pick([6, 8, 8, 10]), d = rng.pick([6, 8]);
      const floors = rng.weighted([[1, 2], [2, 5], [3, 3]]);
      const rr = market.r + d / 2 + rng.f(0.9, 2.4);
      const x = market.x + Math.cos(a) * rr, z = market.z + Math.sin(a) * rr;
      if (!insideWall(x, z)) continue;
      const rot = Math.atan2(-Math.cos(a), -Math.sin(a));
      if (!grid.rect(x, z, w + 0.4, d + 0.4, rot, null, { requireFree: true, margin: 0.2 })) continue;
      pushHouse({ ...houseSpec(w, d, floors, { porch: rng.chance(0.55) }), x, z, y: height(x, z), rot });
    }
  }

  // ---- fields, trees, hedges and props outside -------------------------------------------------
  const fields = [];
  {
    const angBreaks = [];
    let a = rng.f(0, 1);
    for (let i = 0; i < rng.i(7, 10); i++) { a += rng.f(0.06, 0.19); angBreaks.push(a % 1); }
    angBreaks.sort((p, q) => p - q);
    const radBreaks = [];
    let r = wallR * 1.12;
    while (r < R * 0.92) { r += rng.f(8, 15); radBreaks.push(Math.min(r, R * 0.93)); }
    const covers = [["wheat", 3], ["pasture", 2.4], ["fallow", 1.5], ["meadow", 2.2], ["forest", 1.7], ["orchard", 1.1]];
    for (let i = 0; i < angBreaks.length; i++) {
      const a0 = angBreaks[i] * Math.PI * 2;
      const a1 = angBreaks[(i + 1) % angBreaks.length] * Math.PI * 2;
      for (let j = 0; j < radBreaks.length; j++) {
        const r0 = j === 0 ? wallR * 1.1 : radBreaks[j - 1];
        const r1 = radBreaks[j];
        if (r1 - r0 < 3.2) continue;
        if (rng.chance(0.13)) continue;
        fields.push({ a0, a1: a1 <= a0 ? a0 + Math.PI * 2 : a1, r0, r1, cover: rng.weighted(covers), hue: rng.f(-0.5, 0.5), furrow: rng.f(0, Math.PI) });
      }
    }
  }
  const angle01 = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const fieldAt = (x, z) => {
    const d = Math.hypot(x, z);
    if (d < wallR * 1.03) return null;
    const a = angle01(Math.atan2(z, x));
    for (const f of fields) {
      const a1 = f.a1 <= f.a0 ? f.a1 + Math.PI * 2 : f.a1;
      const aa = a < f.a0 ? a + Math.PI * 2 : a;
      if (aa >= f.a0 && aa < a1 && d >= f.r0 && d < f.r1) return f;
    }
    return null;
  };

  const trees = [];
  function addTree(x, z, kind = "oak", scale = 1) {
    if (grid.get(x, z) !== FREE) return false;
    if (Math.hypot(x, z) > outline(Math.atan2(z, x)) * 0.95) return false;
    if (height(x, z) < waterY(x, z) + 0.5) return false;
    grid.disc(x, z, 1.25 * scale, TREE);
    trees.push({ x, z, y: height(x, z), kind, s: scale, rot: rng.f(0, 6.283), tint: rng.f(0.82, 1.16) });
    return true;
  }
  {
    for (const f of fields) {
      const area = (f.a1 - f.a0) * (f.r1 * f.r1 - f.r0 * f.r0) / 2;
      if (f.cover === "forest") {
        for (let i = 0, n = Math.round(area / 32); i < n; i++) {
          const a = rng.f(f.a0, f.a1), r = Math.sqrt(rng.f(f.r0 * f.r0, f.r1 * f.r1));
          addTree(Math.cos(a) * r, Math.sin(a) * r, "pine", rng.f(0.85, 1.5));
        }
      } else if (f.cover === "orchard") {
        for (let i = 0, n = Math.round(area / 80); i < n; i++) {
          const a = rng.f(f.a0, f.a1), r = Math.sqrt(rng.f(f.r0 * f.r0, f.r1 * f.r1));
          addTree(Math.cos(a) * r, Math.sin(a) * r, "apple", rng.f(0.6, 0.9));
        }
      }
    }
    for (let i = 0; i < 700; i++) {
      const a = rng.f(0, Math.PI * 2), r = Math.sqrt(rng.f((wallR * 1.06) ** 2, (R * 0.94) ** 2));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const f = fieldAt(x, z);
      if (f && f.cover === "forest") continue;
      if (f && (f.cover === "wheat" || f.cover === "orchard") && rng.chance(0.8)) continue;
      addTree(x, z, rng.chance(0.3) ? "pine" : "oak", rng.f(0.7, 1.4));
    }
    for (let i = 0; i < 190; i++) {                 // elms and courtyards inside the walls
      const a = rng.f(0, Math.PI * 2), r = rng.f(3, wallR * 0.95);
      addTree(Math.cos(a) * r, Math.sin(a) * r, "oak", rng.f(0.5, 0.9));
    }
    for (let i = 0; i < 110; i++) {                 // alders and willows on the bank
      const p = riverPts[Math.floor(rng.f(0, riverPts.length - 1))];
      const off = rng.sign() * rng.f(riverW * 0.9, riverW * 1.6);
      addTree(p.x + riverPerp.x * off, p.z + riverPerp.z * off, rng.chance(0.5) ? "willow" : "oak", rng.f(0.7, 1.15));
    }
  }

  // ---- bridges, but only where a road genuinely crosses the water -----------------------------
  // A road that runs along the bank comes within the river's half-width too; those used to be given
  // a bridge, which put a stone deck sitting in a field. A crossing has to have its centre in the
  // water and go across the flow, and if no road does that, one road is made to.
  const bridges = [];
  const nearBridge = (x, z, m) => bridges.some((b) => Math.hypot(b.x - x, b.z - z) < m);
  const tryBridges = (dMax, alignMax, spacing) => {
    for (const s of streets) {
      const { at, total } = makeSampler(s.pts, 1.5);
      let lastD = -60;
      for (let d = 4; d < total - 4; d += 2) {
        const p = at(d);
        const q = riverQuery(p.x, p.z);
        if (q.d > dMax) continue;
        if (d - lastD < spacing) continue;
        if (nearBridge(p.x, p.z, 18)) continue;
        const a = at(d - 4), b = at(d + 4);
        const rdx = b.x - a.x, rdz = b.z - a.z, rl = Math.hypot(rdx, rdz) || 1;
        const i1 = Math.min(q.i + 1, riverPts.length - 1);
        const fdx = riverPts[i1].x - riverPts[q.i].x, fdz = riverPts[i1].z - riverPts[q.i].z;
        const fl = Math.hypot(fdx, fdz) || 1;
        if (Math.abs((rdx * fdx + rdz * fdz) / (rl * fl)) > alignMax) continue;
        lastD = d;
        bridges.push({
          x: p.x, z: p.z,
          span: (riverWall + 1.6) * 2, width: Math.max(3.6, s.width + 1.2),
          flow: Math.atan2(fdz, fdx),
          deck: waterY(p.x, p.z) + rng.f(1.6, 2.1),
        });
      }
    }
  };
  tryBridges(riverW * 0.45, 0.6, 30);
  if (!bridges.length) tryBridges(riverW * 0.8, 0.85, 40);      // a town needs at least one crossing

  // ---- the market furniture --------------------------------------------------------------------
  const stalls = [];
  {
    const n = rng.i(7, 11);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.f(-0.2, 0.2);
      const r = market.r * rng.f(0.42, 0.88);
      const x = market.x + Math.cos(a) * r, z = market.z + Math.sin(a) * r;
      stalls.push({ x, z, y: height(x, z), rot: a + Math.PI / 2 + rng.f(-0.35, 0.35), cloth: rng.pick(PALETTES.cloth), w: rng.f(2.0, 2.9) });
    }
  }
  const marketCross = { x: market.x, z: market.z, y: height(market.x, market.z), h: rng.f(5.5, 7.5) };

  // ---- props: barns, haystacks, hedges, the mill on the hill ---------------------------------
  const props = { barns: [], haystacks: [], stocks: [], windmill: null };
  {
    for (let i = 0; i < 6; i++) {
      const a = rng.f(0, Math.PI * 2), r = rng.f(wallR * 1.2, R * 0.82);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (grid.get(x, z) !== FREE) continue;
      const w = rng.f(5, 7), d = rng.f(8, 12), rot = rng.f(0, Math.PI);
      if (!grid.rect(x, z, w + 2, d + 2, rot, null, { requireFree: true })) continue;
      grid.rect(x, z, w + 2, d + 2, rot, BUILT);
      props.barns.push({ x, z, y: height(x, z), w, d, h: rng.f(4.2, 5.6), rot, roof: rng.chance(0.5) ? ROOFS[4] : ROOFS[2] });
    }
    for (let i = 0; i < 10; i++) {
      const a = rng.f(0, Math.PI * 2), r = rng.f(wallR * 1.15, R * 0.86);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (grid.get(x, z) !== FREE) continue;
      grid.disc(x, z, 1.5, BUILT);
      props.haystacks.push({ x, z, y: height(x, z), r: rng.f(1.0, 1.8), rot: rng.f(0, 6.3) });
    }
    let best = null;
    for (let i = 0; i < 260; i++) {
      const a = rng.f(0, Math.PI * 2), r = rng.f(wallR * 1.25, R * 0.86);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (grid.get(x, z) !== FREE) continue;
      if (riverQuery(x, z).d < riverW * 2.2) continue;
      const h = height(x, z);
      if (!best || h > best.h) best = { x, z, h };
    }
    if (best) {
      grid.disc(best.x, best.z, 4.5, BUILT);
      props.windmill = { x: best.x, z: best.z, y: best.h, rot: rng.f(0, 6.3), h: rng.f(6.5, 8.5), r: rng.f(3.6, 4.6) };
    }
    for (const f of fields) {
      if (f.cover === "forest") continue;
      if (rng.chance(0.5)) {
        const pts = [];
        for (let s = 0; s <= 14; s++) {
          const a = lerp(f.a0, f.a1, s / 14), r = f.r1;
          pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
        }
        props.stocks.push({ pts, kind: "hedge" });
      }
      if (rng.chance(0.55)) {
        const pts = [];
        for (let s = 0; s <= 8; s++) {
          const a = f.a0, r = lerp(f.r0, f.r1, s / 8);
          pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
        }
        props.stocks.push({ pts, kind: rng.chance(0.55) ? "hedge" : "fence" });
      }
    }
  }

  // ---- who walks and who drives ---------------------------------------------------------------
  const walkerPaths = streets.filter((s) => s.len > 16)
    .map((s) => ({ pts: polylineResample(s.pts, 1.5), kind: s.kind }));
  const cartPaths = streets.filter((s) => s.kind === "main" || s.kind === "street" || s.kind === "suburb")
    .slice(0, 3).map((s) => ({ pts: polylineResample(s.pts, 2.4) }));

  return {
    seed, R, depth, wallR,
    outline, outlineAt, height, waterY, insideWall, wallRadiusAt, wallVerts, grid,
    river: { pts: riverPts, width: riverW, depth: riverDepth, dir: riverDir, perp: riverPerp, angle: riverFlow, bed: riverBed, wall: riverWall, half: waterHalf },
    streets, gates, market, castle, cathedral, houses, chimneys, windows,
    fields, fieldAt, trees, props, stalls, marketCross, bridges,
    walkerPaths, cartPaths,
    counts: {}
  };
}
