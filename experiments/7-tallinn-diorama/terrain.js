// The ground under Tallinn: a limestone ridge (Toompea) with a steep escarpment, the Lower Town
// platform rising from the quay, and the sea in the north. One height function answers for
// everything — houses, cobbles, trees, the market, the shadow box — so nothing floats.
//
// Local metres, origin at the Town Hall: +x east, +z south, so -z is north and the harbour side.
import { Rng, makeNoise, smoothstep, clamp } from "../6-medieval-diorama/rng.js";

export const SEA_Y = 0.35;

/** the shoreline, west to east; everything on the -z side of it is water */
export const COAST = [
  [-820, -430], [-640, -500], [-470, -560], [-300, -606], [-150, -628], [0, -642],
  [140, -640], [250, -622], [330, -672], [430, -742], [560, -800], [700, -850], [900, -900],
];

/** Toompea: the ridge, NNW to SSE, ~620 m long and ~250 m across */
export const TOOMP = [
  [-452, -276], [-384, -254], [-322, -190], [-276, -100], [-248, -4], [-230, 96], [-226, 178],
  [-244, 250], [-282, 306], [-336, 348], [-398, 336], [-448, 284], [-482, 216], [-500, 130],
  [-516, 26], [-536, -78], [-542, -180], [-510, -244],
];

/** the horseshoe of town wall around the Lower Town (the hill's escarpment closes the west side) */
export const WALL_PATH = [
  [-170, -620], [-186, -462], [-198, -330], [-202, -190], [-198, -60], [-204, 62], [-214, 172],
  [-228, 262], [-142, 308], [-20, 332], [92, 300], [172, 240], [232, 172], [258, 92],
  [268, -20], [258, -142], [252, -262], [256, -382], [240, -482], [238, -562],
  [150, -630], [30, -646], [-80, -642],
];

const HILL_Y = 41;        // the plateau, in metres above the sea
const CLIFF_IN = 26;      // how far inside the outline the top is reached
const CLIFF_OUT = 14;     // and how far outside the foot of the cliff is

export function polyDist(poly, x, z) {
  let inside = false, best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, z1] = poly[j], [x2, z2] = poly[i];
    if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) inside = !inside;
    // distance to the segment
    const dx = x2 - x1, dz = z2 - z1;
    const L2 = dx * dx + dz * dz;
    let t = L2 ? ((x - x1) * dx + (z - z1) * dz) / L2 : 0;
    t = clamp(t, 0, 1);
    const d = Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

/** z of the shoreline at a given x (the coast polyline, extended past its ends) */
export function coastZ(x) {
  const c = COAST;
  if (x <= c[0][0]) return c[0][1];
  if (x >= c[c.length - 1][0]) return c[c.length - 1][1];
  for (let i = 0; i < c.length - 1; i++) {
    if (x >= c[i][0] && x <= c[i + 1][0]) {
      const t = (x - c[i][0]) / (c[i + 1][0] - c[i][0] || 1);
      return c[i][1] + (c[i + 1][1] - c[i][1]) * t;
    }
  }
  return c[c.length - 1][1];
}

export function makeTerrain(seed = "tallinn") {
  const rng = new Rng(seed + "/terrain");
  const noise = makeNoise(rng);
  const n2 = (x, z) => noise.fbm(x, z, 3, 2.03, 0.5);

  /** the Lower Town platform: rising from the quay in the north to the south gate */
  function base(x, z) {
    let y = 2.6 + 22 * smoothstep(-660, 360, z);
    y += (n2(x * 0.0045, z * 0.0045) - 0.5) * 3.4;
    // the quay peninsula and the harbour shelf in the north stay flat and low
    if (z < -520) y = Math.min(y, 5.2 + (n2(x * 0.01, z * 0.01) - 0.5) * 0.8);
    // the ridge road outside the hill's west face keeps a shelf
    return y;
  }

  /** 0 at the foot of the escarpment, 1 on the plateau */
  function hillFactor(x, z) {
    const d = polyDist(TOOMP, x, z);
    return smoothstep(-CLIFF_OUT, CLIFF_IN, d);
  }

  function ground(x, z) {
    const cz = coastZ(x);
    if (z < cz - 24) return -7;                                     // seabed
    const shore = smoothstep(cz - 22, cz + 16, z);                  // 0 in the water, 1 on land
    let y = base(x, z) + (n2(x * 0.02, z * 0.02) - 0.5) * 0.9;
    const hf = hillFactor(x, z);
    // the plateau itself is nearly flat with a gentle crown to the NW, where the castle stands
    const crown = 3.6 * smoothstep(300, -260, z) * smoothstep(-300, -520, x);
    y = y * (1 - hf) + (HILL_Y + crown + (n2(x * 0.012, z * 0.012) - 0.5) * 1.6) * hf;
    // the beach falls away into the bay
    return -1.6 * (1 - shore) + y * shore;
  }

  function slope(x, z) {
    const d = 2.2;
    const gx = ground(x + d, z) - ground(x - d, z);
    const gz = ground(x, z + d) - ground(x, z - d);
    return Math.hypot(gx, gz) / (2 * d);
  }

  const isSea = (x, z) => z < coastZ(x) - 6;
  const onHill = (x, z) => hillFactor(x, z) > 0.55;

  return { ground, slope, isSea, onHill, hillFactor, coastZ, rng, noise, TOOMP, COAST, WALL_PATH, SEA_Y };
}
