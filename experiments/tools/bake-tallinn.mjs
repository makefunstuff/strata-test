#!/usr/bin/env node
/*
 * bake-tallinn.mjs — turn OpenStreetMap extracts into the baked plan the Tallinn diorama reads.
 *
 *   node experiments/tools/bake-tallinn.mjs [--in /tmp/tln] [--out experiments/7-tallinn-diorama/osm.js]
 *
 * Input: Overpass JSON dumps (buildings.json, streets.json, wall.json) in --in. The generated
 * osm.js is committed (it is the diorama's ground truth); this tool is not published to Pages.
 *
 * What it does: reprojects WGS84 to local metres around the Town Hall, reduces each building
 * footprint to an oriented box (min-area rect over the convex hull) with a real storey count,
 * simplifies the named street polylines, and keeps the wall / tower fragments. Numbers are
 * rounded hard: the file is a plan, not a survey.
 *
 * Data: © OpenStreetMap contributors, ODbL.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const IN = resolve(opt("in", "/tmp/tln"));
const OUT = resolve(opt("out", "experiments/7-tallinn-diorama/osm.js"));

// Town Hall (Raekoja plats 1). +x = east, +z = south (so -z = north, the harbour side).
const LAT0 = 59.4372, LON0 = 24.7453;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const X = (lon) => (lon - LON0) * M_PER_DEG_LON;
const Z = (lat) => -(lat - LAT0) * M_PER_DEG_LAT;
const r1 = (v) => Math.round(v * 10) / 10;

const read = (f) => JSON.parse(readFileSync(resolve(IN, f), "utf8")).elements || [];
const buildings = read("buildings.json");
const streets = read("streets.json");
const wall = read("wall2.json");

// ---------------------------------------------------------------- hull + oriented box ----
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
const polyArea = (pts) => { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const j = (i + 1) % n; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; } return Math.abs(a) / 2; };

/** smallest-area enclosing rectangle: [cx, cz, w, d, rot] with w along the rot direction */
function orientedBox(pts) {
  const h = convexHull(pts);
  if (h.length < 3) return null;
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / len, uz = dz / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of h) {
      const u = p[0] * ux + p[1] * uz;
      const v = -p[0] * uz + p[1] * ux;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      best = { area, w: maxU - minU, d: maxV - minV, cx: cu * ux - cv * uz, cz: cu * uz + cv * ux, rot: Math.atan2(-uz, ux) };
    }
  }
  if (!best || best.w < 2 || best.d < 2) return null;
  // keep w the long side, so a house always faces its street with the gable end on it
  if (best.d > best.w) { const t = best.w; best.w = best.d; best.d = t; best.rot += Math.PI / 2; }
  return best;
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  // Douglas–Peucker, iterative
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ------------------------------------------------------------------ old-town containment ---
// The walled town plus Toompea: hand-traced around the OSM wall fragments (x east, z south).
// Everything inside gets full Hanseatic treatment; outside gets the modern fringe.
const OLD_TOWN = [
  [-580, -80], [-480, -165], [-330, -185], [-185, -330], [-40, -580], [120, -665], [300, -665],
  [350, -520], [332, -260], [322, 60], [300, 182], [230, 272], [80, 342], [-80, 362],
  [-230, 332], [-380, 322], [-520, 262], [-600, 120],
];
function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// landmark outlines get their own hand-built geometry; they must not also be generated as houses
const LANDMARK_NAMES = [
  "raekoda", "niguliste", "toomkirik", "nevski", "toompea loss", "hermann", "kiek",
  "oleviste", "pühavaimu", "püha vaimu", "margareeta", "rannavärav", "viru värav", "jaani",
  "katariina", "peeter-pauli", "muutmise", "mihkli", "gild", "linnahall", "nelipühi",
  "rootsi-mihkli", "risti", "püha vaim",
];
const isLandmark = (t) => {
  const n = (t.name || t["name:et"] || "").toLowerCase();
  return n && LANDMARK_NAMES.some((k) => n.includes(k));
};

const storeys = (t) => {
  const h = parseFloat(t.height);
  const lv = parseFloat(t["building:levels"]);
  if (!Number.isNaN(lv)) return Math.max(1, Math.min(9, Math.round(lv)));
  if (!Number.isNaN(h)) return Math.max(1, Math.min(9, Math.round(h / 3.1)));
  return 0;
};

// ----------------------------------------------------------------------------- buildings ----
const oldTown = [], fringe = [];
const seen = new Set();
for (const e of buildings) {
  if (e.type !== "way" || !e.geometry) continue;
  const t = e.tags || {};
  const kind = t.building || "yes";
  if (/^(roof|garage|garages|shed|shed|construction|ruins|greenhouse|tent|roof)$/.test(kind)) continue;
  const pts = e.geometry.map((g) => [X(g.lon), Z(g.lat)]);
  let box = orientedBox(pts);
  if (!box) continue;
  const { w, d, cx, cz, rot } = box;
  const area = polyArea(pts);
  if (area < 60 || w < 3.4 || d < 3.4) continue;               // sheds, Extensions, annexes
  if (Math.abs(cx) > 950 || Math.abs(cz) > 900) continue;
  const key = `${Math.round(cx)},${Math.round(cz)},${Math.round(w)},${Math.round(d)}`;
  if (seen.has(key)) continue;                                   // duplicated entrances
  seen.add(key);
  const name = t.name || t["name:et"] || t["addr:street"] || "";
  const landmark = isLandmark(t);
  const lv = storeys(t) || (inPoly(OLD_TOWN, cx, cz) ? 3 : 4);
  const fill = Math.min(1, area / (w * d));
  const rec = {
    x: r1(cx), z: r1(cz), w: r1(w), d: r1(d), rot: +(((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).toFixed(3),
    lv, fill: +fill.toFixed(2), area: Math.round(area),
    k: kind === "yes" ? "" : kind, n: landmark ? name : "",
  };
  if (landmark) continue;                                        // built by hand in layout.js
  if (inPoly(OLD_TOWN, cx, cz)) oldTown.push(rec);
  else if (area > 260 && lv >= 2) fringe.push(rec);
}
oldTown.sort((a, b) => (a.z - b.z) || (a.x - b.x));
fringe.sort((a, b) => (b.area - a.area));
const fringeKeep = fringe.slice(0, 260);

// ------------------------------------------------------------------------------- streets ----
const MAIN = new Set(["pikk", "lai", "viru", "rüütli", "müürivahe", "oleviste", "suur-karja",
  "väike-karja", "pühavaimu", "pikk jalg", "lühike jalg", "lossi", "toom-kooli", "toompiimari",
  "kiriku", "vene", "aia", "tolli", "katenauk", "rataskaevu", "omu", "kuke", "suluri", "hobujaama",
  "suurgild", "väikegild", "kloostri", "suur-kloostri", "väike-kloostri", "poska", "karja", "dunkri",
  "viimistluse", "laboratooriumi", "ratuse", "pliku", "josepsi", "gonsi", "viisiku", "arabiana",
  "viinari", "munamäe", "kuura", "viinamäe", "vabaduse väljak", "lossi plats", "raekoja plats",
  "kohtu", "lauk", "nunna", "ultra", "pagari", "müürivahe", "ettevõtja", "ahtri"]);
const W_BY_TYPE = { pedestrian: 8, primary: 13, secondary: 11, tertiary: 9, residential: 6.5, unclassified: 7, service: 5, footway: 2.6 };
const outStreets = [];
const sname = (t) => t.name || t["name:et"] || "";
for (const e of streets) {
  if (e.type !== "way" || !e.geometry) continue;
  const t = e.tags || {};
  const hw = t.highway, n = sname(t);
  if (!hw || !(hw in W_BY_TYPE)) continue;
  if (/bridge|tunnel|construction|proposed/.test(`${t.bridge||""}${t.tunnel||""}`)) continue;
  const pts = e.geometry.map((g) => [X(g.lon), Z(g.lat)]);
  const mid = pts[Math.floor(pts.length / 2)];
  if (!inPoly(OLD_TOWN, mid[0], mid[1]) && Math.hypot(mid[0], mid[1]) > 620) continue;
  const len = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  if (len < 14) continue;
  const simp = simplify(pts, 3);
  if (simp.length < 2) continue;
  const main = MAIN.has(n.toLowerCase());
  let width = W_BY_TYPE[hw] + (main ? 1.5 : 0);
  if (/square|plats|väljak|turg/i.test(n)) width = Math.max(width, 16);
  outStreets.push({
    n, hw, main, w: r1(width),
    pts: simp.map((p) => [r1(p[0]), r1(p[1])]),
  });
}
outStreets.sort((a, b) => (b.main - a.main) || a.n.localeCompare(b.n));

// ------------------------------------------------------------------------------- the wall ----
const wallSegs = [], towers = [];
for (const e of wall) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const isTower = (t["tower:type"] === "defensive" || t.man_made === "tower");
  if (e.type === "way" && e.geometry && !isTower) {
    const pts = e.geometry.map((g) => [X(g.lon), Z(g.lat)]);
    if (pts.length > 1) wallSegs.push(simplify(pts, 2).map((p) => [r1(p[0]), r1(p[1])]));
  }
  if (isTower && lat != null) {
    towers.push({ x: r1(X(lon)), z: r1(Z(lat)), name: t.name || "", h: parseFloat(t.height) || 0, r: 0 });
  }
}

// ----------------------------------------------------------------------------- emit file ----
const q = (v) => JSON.stringify(v);
const num = (v) => (typeof v === "number" ? (Number.isFinite(v) ? v : 0) : 0);
const houseRows = oldTown.map((b) => `  [${b.x},${b.z},${b.w},${b.d},${b.rot},${b.lv},${b.fill}${b.k ? "," + q(b.k) : ""}],`).join("\n");
const fringeRows = fringeKeep.map((b) => `  [${b.x},${b.z},${b.w},${b.d},${b.rot},${b.lv}],`).join("\n");
const streetRows = outStreets.map((s) => `  ${q({ n: s.n, w: s.w, m: s.main ? 1 : 0, p: s.pts })},`).join("\n");
const wallRows = wallSegs.map((w) => `  ${JSON.stringify(w.flat())},`).join("\n");
const towerRows = towers.map((t) => `  [${t.x},${t.z}],`).join("\n");

const out = `// The plan of Tallinn, baked from OpenStreetMap by tools/bake-tallinn.mjs — do not hand-edit.
// Local metres, origin at the Town Hall: +x east, +z south (-z is north, the harbour side).
// Buildings are oriented boxes (min-area rect of the real footprint); streets are simplified
// centre-lines; the wall is the surviving OSM fragments. Data: © OpenStreetMap contributors, ODbL.
/* eslint-disable */

/** [x, z, width, depth, rotation(rad), storeys, footprintFill, kind?] — inside the old-town ring */
export const HOUSES = [
${houseRows}
];

/** [x, z, width, depth, rotation(rad), storeys] — the modern city around the walled core */
export const FRINGE = [
${fringeRows}
];

/** { n: name, w: carriageway width, m: 1 on a famous street, p: [x,z,...] centre-line } */
export const STREETS = [
${streetRows}
];

/** surviving town-wall fragments, [x,z,...] */
export const WALL_SEGMENTS = [
${wallRows}
];

/** named defensive towers from OSM [x, z] */
export const WALL_TOWERS_OSM = [
${towerRows}
];

/** the hand-traced ring the generator calls the old town (also metres) */
export const OLD_TOWN_RING = ${JSON.stringify(OLD_TOWN.map(([x, z]) => [r1(x), r1(z)]))};

export const ORIGIN = ${q({ lat: LAT0, lon: LON0 })};
export const BAKED_AT = ${q(new Date().toISOString().slice(0, 10))};
`;
writeFileSync(OUT, out);
console.log(`${oldTown.length} old-town houses, ${fringeKeep.length} fringe blocks, ${outStreets.length} streets (${outStreets.filter((s) => s.main).length} main), ${wallSegs.length} wall segments, ${towers.length} towers`);
console.log(`wrote ${OUT} (${(out.length / 1024).toFixed(0)} KB)`);
const names = {};
for (const s of outStreets) names[s.n.toLowerCase()] = (names[s.n.toLowerCase()] || 0) + 1;
console.log("main streets:", outStreets.filter((s) => s.main).map((s) => s.n).filter((v, i, a) => a.indexOf(v) === i).join(", "));
