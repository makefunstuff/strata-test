// All the static geometry of Tallinn, collected by Batch into one merged mesh per material —
// the whole city is a couple of dozen draw calls, which is what keeps a phone warm enough.
// Houses come from the baked OSM footprints; every landmark is built by hand at its surveyed spot.
//
// Convention: every helper returns geometry centred on the origin, "facing +Z". Placing it uses
// face(dx, dz) = atan2(dx, dz), which turns +Z to the outward direction (dx, dz).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  Batch, box, drum, gableRoof, hipRoof, place, mat, merlons,
  polarGrid, earthSide,
} from "../6-medieval-diorama/geo.js";
import { Rng } from "../6-medieval-diorama/rng.js";

const _m = new THREE.Matrix4();
const face = (dx, dz) => Math.atan2(dx, dz);

/** 1 = everything. The phone preset drops the pieces nobody can see from orbit: the dormers, the
 *  oriels, the wall gallery's timbers, half the merlons. The landmarks always get their full kit. */
let DETAIL = 1;

// ------------------------------------------------------------------ small geometry kit -------
/** a flat polygon in the XY plane, fan-triangulated from the middle of its bottom edge */
function polygonFan(pts, { twoSided = true } = {}) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const wSpan = x1 - x0 || 1, hSpan = y1 || 1, base = pts[0][1];
  const pivot = [(x0 + x1) / 2, base];
  const pos = [], uvs = [];
  const push = (p) => { pos.push(p[0], p[1], 0); uvs.push((p[0] - x0) / wSpan, (p[1] - base) / hSpan); };
  for (let i = 0; i < pts.length - 1; i++) { push(pivot); push(pts[i]); push(pts[i + 1]); }
  if (twoSided) {
    const n = pos.length / 3;
    for (let i = n - 3; i >= 0; i -= 3) {
      for (const k of [2, 1, 0]) {
        pos.push(pos[i * 3 + k * 3], pos[i * 3 + k * 3 + 1], pos[i * 3 + k * 3 + 2] - 0.02);
        uvs.push(uvs[(i + k) * 2], uvs[(i + k) * 2 + 1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** the gable end a Hanseatic house shows the street */
function gableShape(w, rise, kind) {
  const hw = w / 2;
  if (kind === "stepped") {
    const steps = 4, sw = hw / (steps + 0.4), sh = rise / (steps + 1.1);
    const pts = [[-hw, 0]];
    for (let i = 0; i < steps; i++) {
      const x = -hw + (i + 1) * sw, y = (i + 1) * sh;
      pts.push([x, y], [x, y + sh]);
    }
    pts.push([0, rise]);
    for (let i = steps - 1; i >= 0; i--) {
      const x = hw - (i + 1) * sw, y = (i + 1) * sh;
      pts.push([x, y + sh], [x, y]);
    }
    pts.push([hw, 0]);
    return pts;
  }
  if (kind === "pointed") return [[-hw, 0], [-hw, rise * 0.45], [0, rise], [hw, rise * 0.45], [hw, 0]];
  if (kind === "pediment") {
    const pts = [[-hw, 0], [-hw, rise * 0.52]];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, x = -hw + t * w;
      pts.push([x, rise * (0.52 + 0.48 * Math.pow(Math.sin(t * Math.PI), 0.65))]);
    }
    pts.push([hw, rise * 0.52], [hw, 0]);
    return pts;
  }
  return [[-hw, 0], [0, rise], [hw, 0]];
}

/** a lathe-turned profile (onion domes, bulbous caps) */
function lathe(profile, seg = 16, tile = 0.16) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y));
  const g = new THREE.LatheGeometry(pts, seg);
  const uv = g.attributes.uv;
  const h = pts[pts.length - 1].y - pts[0].y;
  const circ = 2 * Math.PI * Math.max(...pts.map((p) => p.x));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ * tile, uv.getY(i) * Math.max(0.2, h) * tile);
  uv.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

const ONION_PROFILE = [[0.02, 1.0], [0.26, 0.93], [0.5, 0.75], [0.63, 0.5], [0.56, 0.26], [0.33, 0.09], [0.22, 0.0]];

/** an onion dome with its finial and cross, centred on its base */
function onionDome(r, h) {
  const out = [];
  out.push(["onion", lathe(ONION_PROFILE.map(([x, y]) => [x * r, y * h]))]);
  const bulb = new THREE.SphereGeometry(Math.max(0.12, r * 0.15), 8, 6).toNonIndexed();
  place(bulb, 0, h + r * 0.12, 0);
  out.push(["gold", bulb]);
  const pole = box(Math.max(0.08, r * 0.05), r * 0.7, Math.max(0.08, r * 0.05), 1);
  place(pole, 0, h + r * 0.55, 0);
  out.push(["gold", pole]);
  const arm = box(r * 0.34, Math.max(0.08, r * 0.05), Math.max(0.08, r * 0.05), 1);
  place(arm, 0, h + r * 0.72, 0);
  out.push(["gold", arm]);
  return out;
}

/** a slim polygonal spire, base at y = 0 */
function needle(r, h, seg = 8, tile = 0.1) {
  const g = new THREE.ConeGeometry(Math.max(0.05, r), Math.max(0.2, h), seg, 1, false);
  g.setIndex(new THREE.BufferAttribute(g.index.array.slice(0, seg * 3), 1));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * r * 3.2 * tile, uv.getY(i) * h * tile);
  uv.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** a buttress pier with a sloped cap, base at y = 0 */
function buttressGeo(w, h, d) {
  const out = [];
  const b = box(w, h, d, 0.2); place(b, 0, h / 2, 0); out.push(b);
  const cap = new THREE.ConeGeometry(Math.max(0.2, w * 0.66), w * 1.6, 4).toNonIndexed();
  place(cap, 0, h + w * 0.8, 0, Math.PI / 4); out.push(cap);
  return out;
}

/** a window pane (rectangle or arched), centred on the origin, facing +Z, visible from both sides */
function pane(w, h, arch = false) {
  const hw = Math.max(0.12, w) / 2, hh = Math.max(0.12, h);
  let g;
  if (!arch) {
    g = new THREE.PlaneGeometry(Math.max(0.12, w), hh);
  } else {
    const s = new THREE.Shape();
    const r = hw, straight = Math.max(0.1, hh - r);
    s.moveTo(-hw, 0); s.lineTo(-hw, straight); s.absarc(0, straight, r, Math.PI, 0, true); s.lineTo(hw, 0); s.closePath();
    g = new THREE.ShapeGeometry(s, 7);
    g.translate(0, -hh / 2, 0);
  }
  const src = g.index ? g.index.array : null;
  const idx = src ? [...src] : Array.from({ length: g.attributes.position.count }, (_, i) => i);
  const n = idx.length;
  for (let i = 0; i < n; i += 3) idx.push(idx[i + 2], idx[i + 1], idx[i]);
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a course of stone, a cornice, a gate arch — anything that reads as a band on a wall */
const trimBox = (w, h, d) => box(Math.max(0.1, w), Math.max(0.06, h), Math.max(0.1, d), 0.2);

// ========================================================================= materials ==========
export function buildMaterials(tex) {
  const M = {};
  const snaps = new Map();
  const reg = (key, m, winter) => {
    M[key] = m;
    snaps.set(key, {
      summer: { map: m.map, emissiveMap: m.emissiveMap || null, color: m.color.clone(), emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity, roughness: m.roughness },
      winter: winter ? { map: winter.map ?? null, emissiveMap: winter.emissiveMap ?? (m.emissiveMap || null), color: (winter.color ?? m.color).clone(), emissive: (winter.emissive ?? m.emissive).clone(), emissiveIntensity: winter.emissiveIntensity ?? m.emissiveIntensity, roughness: winter.roughness ?? m.roughness } : null,
    });
    return m;
  };
  const bayOpts = { roughness: 0.95, side: THREE.FrontSide };
  for (let i = 0; i < 4; i++) {
    // the bays carry no painted windows, so night light comes from the sashes themselves, not a
    // glow map that would light rectangles the glass does not sit in
    reg(`wall${i}`, mat(tex.upper[i * 2], { ...bayOpts }),
      { color: new THREE.Color(0xeef3fb) });
    reg(`base${i}`, mat(tex.ground[i * 2], { ...bayOpts }),
      { color: new THREE.Color(0xeaf0f9) });
    reg(`gable${i}`, mat(tex.gables[i * 2], { color: 0xffffff, roughness: 0.94, side: THREE.DoubleSide }),
      { color: new THREE.Color(0xf6f8fc) });
  }
  reg("roof", mat(tex.roofTile, { roughness: 0.9 }), { map: tex.roofTileSnow });
  reg("roofDark", mat(tex.roofSlate, { roughness: 0.82 }), { map: tex.roofSlateSnow });
  reg("stone", mat(tex.stone[0], { roughness: 0.95 }), { map: tex.stoneSnow[0], color: new THREE.Color(0xf3f6fb) });
  reg("stoneDark", mat(tex.stone[1], { roughness: 0.95 }), { map: tex.stoneSnow[1], color: new THREE.Color(0xf0f4fa) });
  reg("brick", mat(tex.brick, { roughness: 0.93 }), { color: new THREE.Color(0xeef2f8) });
  reg("cobble", mat(tex.cobble, { roughness: 0.93 }), { map: tex.cobbleSnow, color: new THREE.Color(0xf6f8fc) });
  reg("cobbleFan", mat(tex.cobbleFan, { roughness: 0.93 }), { map: tex.cobbleSnow, color: new THREE.Color(0xf6f8fc) });
  reg("paving", mat(tex.paving, { roughness: 0.9 }), { map: tex.pavingSnow, color: new THREE.Color(0xf6f8fc) });
  reg("grass", mat(tex.grass, { roughness: 0.98 }), { map: tex.grassSnow });
  reg("wood", mat(tex.wood, { roughness: 0.9 }));
  reg("woodDark", mat(tex.woodDark, { roughness: 0.9 }));
  reg("stall", mat(tex.stall, { roughness: 0.88, emissive: 0xff9d4a, emissiveIntensity: 0 }),
    { emissive: new THREE.Color(0xff9d4a), emissiveIntensity: 0.5 });
  reg("onion", mat(tex.onion, { roughness: 0.4, metalness: 0.3 }));
  reg("gold", mat(null, { color: 0xffd257, roughness: 0.28, metalness: 0.72 }));
  reg("trim", mat(null, { color: 0xf3eee1, roughness: 0.9 }), { color: new THREE.Color(0xffffff) });
  reg("white", mat(tex.plasterPlain, { color: 0xf7f4ec, roughness: 0.94 }), { color: new THREE.Color(0xffffff) });
  reg("ochre", mat(tex.plasterPlain, { color: 0xd9bd82, roughness: 0.92 }), { color: new THREE.Color(0xe9ebf2) });
  reg("pink", mat(tex.plasterPlain, { color: 0xd79f8c, roughness: 0.92 }), { color: new THREE.Color(0xe6e8f0) });
  reg("green", mat(tex.roofSlate, { color: 0x40604f, roughness: 0.55, metalness: 0.2 }), { color: new THREE.Color(0x9db0ac) });
  reg("dark", mat(null, { color: 0x24282d, roughness: 0.66 }), { color: new THREE.Color(0x2b3037) });
  reg("window", mat(null, { color: 0x2a3038, roughness: 0.28, metalness: 0.35, side: THREE.DoubleSide, emissive: 0xffb469, emissiveIntensity: 0 }),
    // candles, not floods: a lit town at night is a hundred small warm squares, not one white glare
    { color: new THREE.Color(0x30373f), emissive: new THREE.Color(0xffb469), emissiveIntensity: 0.62 });
  reg("concrete", mat(null, { color: 0x9d9b95, roughness: 0.94 }), { color: new THREE.Color(0xb4bac2) });
  reg("block", mat(null, { color: 0xb9b1a3, roughness: 0.94 }), { color: new THREE.Color(0xc9cdd5) });
  reg("iron", mat(null, { color: 0x2c2f34, roughness: 0.55, metalness: 0.55 }));
  reg("canvas", mat(null, { color: 0xe9e1cd, roughness: 0.95 }));
  reg("hull", mat(tex.woodDark, { color: 0x77492c, roughness: 0.88 }));

  M.setSeason = (winter) => {
    for (const [k, m] of Object.entries(M)) {
      const s = snaps.get(k);
      if (!s) continue;
      const v = winter && s.winter ? s.winter : s.summer;
      m.map = v.map; m.emissiveMap = v.emissiveMap;
      m.color.copy(v.color); m.emissive.copy(v.emissive);
      m.emissiveIntensity = v.emissiveIntensity; m.roughness = v.roughness;
      m.needsUpdate = true;
    }
  };
  M.setNight = (v) => {
    for (let i = 0; i < 4; i++) {
      M[`wall${i}`].emissiveIntensity = v * 1.7;
      M[`base${i}`].emissiveIntensity = v * 1.2;
    }
    M.window.emissiveIntensity = v * 1.1;
  };
  return M;
}

// ========================================================================= houses =============
function addHouse(B, h) {
  const { x, z, y, w, d, rot, hWall, storeys } = h;
  const vi = h.facade % 4;
  const bayW = 2.6, bayH = 3.05;
  const rng = new Rng(`${x.toFixed(1)}:${z.toFixed(1)}`);

  // the shell: one box, UVs snapped so every bay of 2.6 m shows one painted window
  const shell = new THREE.BoxGeometry(w, hWall, d);
  {
    const uv = shell.attributes.uv;
    const ext = [[d, hWall], [d, hWall], [w, d], [w, d], [w, hWall], [w, hWall]];
    for (let f = 0; f < 6; f++) {
      const [eu, ev] = ext[f];
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * (eu / bayW), uv.getY(k) * (ev / bayH));
      }
    }
    uv.needsUpdate = true;
  }
  B.addAt(`wall${vi}`, shell, x, y + hWall / 2, z, rot);
  // the plinth the street wears its houses with
  B.addAt("stone", trimBox(w + 0.35, 1.6, d + 0.35), x, y + 0.8, z, rot);
  if (storeys > 2) B.addAt("trim", trimBox(w + 0.2, 0.28, d + 0.2), x, y + 3.5, z, rot);

  // the roof, ridge along the long axis, painted gable ends on the short ones
  const ridgeX = w >= d;
  const span = ridgeX ? d : w, length = ridgeX ? w : d;
  const rise = Math.max(2.0, span * (h.roofStyle === "hip" ? 0.4 : 0.58));
  const rrot = rot + (ridgeX ? Math.PI / 2 : 0);
  B.addAt("roof", h.roofStyle === "hip"
    ? hipRoof(span, length, rise, { overhang: 0.26, tile: 0.15 })
    : gableRoof(span, length, rise, { overhang: 0.26, tile: 0.15 }), x, y + hWall, z, rrot);

  const gGeo = polygonFan(gableShape(span, rise * 1.03, h.gable));
  for (const s of [-1, 1]) {
    const ox = ridgeX ? s * (w / 2 - 0.04) : 0;
    const oz = ridgeX ? 0 : s * (d / 2 - 0.04);
    const wx = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
    const wz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
    B.addAt(`gable${vi}`, gGeo, wx, y + hWall - 0.04, wz, rot + (ridgeX ? Math.PI / 2 : 0));
  }

  // chimney (or two), dormers, a porch, a door, an oriel, the odd corner turret
  if (h.chimney) {
    for (let i = 0; i < (DETAIL > 0.6 ? h.chimney : 1); i++) {
      const along = rng.f(-0.32, 0.32) * length;
      const ox = ridgeX ? along : rng.f(-0.25, 0.25) * span;
      const oz = ridgeX ? rng.f(-0.25, 0.25) * span : along;
      const cx = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
      const cz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
      const ch = rise * 0.7 + 1.8;
      B.addAt("stoneDark", trimBox(1.0, ch, 1.0), cx, y + hWall + rise * 0.42 + ch / 2 - 0.4, cz, rot);
      B.addAt("trim", trimBox(1.3, 0.25, 1.3), cx, y + hWall + rise * 0.42 + ch - 0.4, cz, rot);
      B.emitters = B.emitters || [];
      B.emitters.push([cx, y + hWall + rise * 0.42 + ch - 0.2, cz]);
    }
  }
  if (h.dormer && DETAIL > 0.6) {
    // one dormer per nine metres, and half of those are left out: a roof full of them reads as a
    // hedgehog, and the street only ever sees two or three
    const n = Math.max(1, Math.round(length / 9));
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.55)) continue;
      const t = (i + 0.5) / n - 0.5;
      const along = t * length;
      const side = rng.sign();
      const ox = ridgeX ? along : side * (span / 2 - 0.35);
      const oz = ridgeX ? side * (span / 2 - 0.35) : along;
      const dx = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
      const dz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
      B.addAt(`wall${vi}`, trimBox(1.45, 1.15, 1.1), dx, y + hWall + rise * 0.34, dz, rot + (ridgeX ? 0 : Math.PI / 2));
      B.addAt("roof", gableRoof(1.6, 1.5, 0.6, { overhang: 0.14, tile: 0.2 }), dx, y + hWall + rise * 0.34 + 0.6, dz, rot + (ridgeX ? Math.PI / 2 : 0));
      const nx = ridgeX ? 0 : side * Math.cos(rot) * 0;
      void nx;
    }
  }
  if (h.porch && DETAIL > 0.5) {
    const s = rng.sign();
    const ox = ridgeX ? s * (w / 2 + 0.7) : rng.f(-0.25, 0.25) * w;
    const oz = ridgeX ? rng.f(-0.25, 0.25) * d : s * (d / 2 + 0.7);
    const px = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
    const pz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
    const prot = face(Math.cos(rot) * (ridgeX ? s : 0) + Math.sin(rot) * (ridgeX ? 0 : s), Math.sin(rot) * (ridgeX ? s : 0) - Math.cos(rot) * (ridgeX ? 0 : s));
    B.addAt("trim", trimBox(3.0, 3.4, 1.9), px, y + 1.7, pz, prot);
    B.addAt("roof", gableRoof(2.2, 3.2, 1.3, { overhang: 0.22, tile: 0.2 }), px, y + 3.4, pz, prot + Math.PI / 2);
    B.addAt("woodDark", pane(1.5, 2.5, true), px, y + 1.3, pz + 0, prot);
  }
  if (h.shop) {
    const s = rng.sign();
    const ox = ridgeX ? s * (w / 2 + 0.08) : rng.f(-0.3, 0.3) * w;
    const oz = ridgeX ? rng.f(-0.3, 0.3) * d : s * (d / 2 + 0.08);
    const px = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
    const pz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
    const prot = face(Math.cos(rot) * s, Math.sin(rot) * s);
    B.addAt("woodDark", pane(1.6, 2.6, true), px, y + 1.4, pz, prot);
    if (rng.chance(0.5)) B.addAt("woodDark", pane(2.2, 1.6, false), px, y + 4.2, pz, prot);
  }
  if (h.bay && DETAIL > 0.6) {
    const s = rng.sign();
    const ox = ridgeX ? rng.f(-0.3, 0.3) * w : s * (d / 2 + 0.55);
    const oz = ridgeX ? s * (d / 2 + 0.55) : rng.f(-0.3, 0.3) * d;
    const px = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
    const pz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
    B.addAt(`wall${(vi + 1) % 4}`, trimBox(1.7, 2.6, 1.3), px, y + hWall * 0.62, pz, rot);
    B.addAt("trim", trimBox(2.0, 0.25, 1.6), px, y + hWall * 0.62 - 1.4, pz, rot);
  }
  if (h.tower && DETAIL > 0.6) {
    const ox = rng.f(-0.28, 0.28) * w, oz = rng.f(-0.28, 0.28) * d;
    const tx = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
    const tz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
    const th = hWall + rng.f(4, 9);
    B.addAt(`wall${vi}`, drum(1.6, 1.35, th, 10, 0.14, { top: false }), tx, y + th / 2, tz, rot);
    B.addAt("roofDark", needle(1.9, 3.6, 10, 0.18), tx, y + th, tz, rot);
  }
}

// ======================================================================== landmarks ==========
let G = 0;   // ground height under the landmark being built

/** a church body: nave, roof, gable ends, buttresses and tall arched windows */
function nave(B, x, z, rot, { w, d, h, roofRise, wall = "white", roof = "roofDark", buttresses = 0, windows = 0, gable = "pointed" }) {
  B.addAt(wall, box(w, h, d, 0.2), x, G + h / 2, z, rot);
  B.addAt("stone", trimBox(w + 0.4, 1.4, d + 0.4), x, G + 0.7, z, rot);
  B.addAt(roof, gableRoof(w, d, roofRise, { overhang: 0.6, tile: 0.13 }), x, G + h, z, rot + Math.PI / 2);
  const g = polygonFan(gableShape(w, roofRise * 1.03, gable));
  for (const s of [-1, 1]) {
    const ox = s * (d / 2 - 0.04);
    B.addAt(wall, g, x + Math.cos(rot) * ox, G + h, z + Math.sin(rot) * ox, rot);
  }
  for (let i = 0; i < buttresses; i++) {
    const t = (i + 0.5) / buttresses - 0.5;
    for (const side of [-1, 1]) {
      const ox = t * d, oz = side * (w / 2 + 0.55);
      const bx = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
      const bz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
      for (const geo of buttressGeo(1.5, h * 0.88, 1.8)) B.addAt(wall, geo, bx, G, bz, rot);
    }
  }
  for (let i = 0; i < windows; i++) {
    const t = (i + 0.5) / windows - 0.5;
    for (const side of [-1, 1]) {
      const ox = t * d, oz = side * (w / 2 + 0.09);
      const wx = x + Math.cos(rot) * ox - Math.sin(rot) * oz;
      const wz = z + Math.sin(rot) * ox + Math.cos(rot) * oz;
      B.addAt("window", pane(2.2, h * 0.52, true), wx, G + h * 0.48, wz, face(Math.sin(rot) * side, -Math.cos(rot) * side));
    }
  }
}

/** a freestanding tower: staged shaft, string courses, gallery and a chosen cap */
function tower(B, x, z, { r, h, stages = 3, cap = "spire", capMat = "green", wall = "white", gallery = false, seg = null, roofH = null } = {}) {
  const segs = seg ?? (r < 3 ? 12 : 8);
  const stageH = h / stages;
  for (let s = 0; s < stages; s++) {
    const rr = r * (1 - s * 0.12);
    B.addAt(wall, drum(rr, rr * 0.98, stageH, segs, 0.13, { top: false }), x, G + stageH * (s + 0.5), z, 0);
    const ring = new THREE.TorusGeometry(Math.max(0.2, rr * 1.02), 0.18, 5, Math.max(8, segs * 2)).toNonIndexed();
    ring.rotateX(Math.PI / 2);
    B.addAt("trim", ring, x, G + stageH * (s + 1) - 0.35, z, 0);
    const n = s === stages - 1 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.2;
      B.addAt("window", pane(rr * 0.44, stageH * 0.55, true), x + Math.cos(a) * rr * 1.02, G + stageH * s + stageH * 0.45, z + Math.sin(a) * rr * 1.02, face(Math.cos(a), Math.sin(a)));
    }
  }
  if (gallery) {
    const gal = new THREE.TorusGeometry(Math.max(0.3, r * 1.25), 0.36, 5, 20).toNonIndexed();
    gal.rotateX(Math.PI / 2);
    B.addAt("trim", gal, x, G + h + 0.1, z, 0);
  }
  const topR = r * (1 - (stages - 1) * 0.12);
  const rh = roofH ?? h * 0.5;
  if (cap === "spire") {
    B.addAt(capMat, needle(topR * 1.28, rh, 8, 0.1), x, G + h, z, 0);
    B.addAt("gold", trimBox(0.16, 2.0, 0.16), x, G + h + rh + 1, z, 0);
  } else if (cap === "onion") {
    for (const [k, geo] of onionDome(topR * 1.2, topR * 2.0)) B.add(k, geo, { matrix: new THREE.Matrix4().makeTranslation(x, G + h, z) });
  } else if (cap === "tent") {
    B.addAt(capMat, new THREE.ConeGeometry(topR * 1.3, rh, 8).toNonIndexed(), x, G + h + rh / 2, z, Math.PI / 8);
  } else if (cap === "flat") {
    const par = new THREE.CylinderGeometry(topR * 1.12, topR * 1.12, 1.1, Math.max(8, segs), 1, true).toNonIndexed();
    B.addAt("stone", par, x, G + h + 0.55, z, 0);
    for (const m of merlons({ radius: topR * 1.12, count: Math.max(8, segs + 4), w: 0.85, h: 1.05, d: 0.7, tile: 0.2 })) B.addAt("stone", m, x, G + h + 1.1, z, 0);
  }
}

function addLandmarks(B, city) {
  for (const l of city.landmarks) {
    G = city.terr.ground(l.x, l.z);
    const g = G;
    const rng = new Rng("lm" + l.id);
    switch (l.kind) {
      // ------------------------------------------------------------------ the Town Hall ----
      case "townhall": {
        const w = 38, d = 15, h = 12.5;
        // lime-washed ashlar, red tile: the Town Hall is pale against the square, not salmon
        B.addAt("white", box(w, h, d, 0.22), l.x, g + h / 2, l.z, l.rot);
        B.addAt("stone", trimBox(w + 0.5, 2.2, d + 0.5), l.x, g + 1.1, l.z, l.rot);
        B.addAt("trim", trimBox(w + 0.3, 0.4, d + 0.3), l.x, g + 4.1, l.z, l.rot);
        B.addAt("roof", gableRoof(d, w, 6.6, { overhang: 0.6, tile: 0.13 }), l.x, g + h, l.z, l.rot + Math.PI / 2);
        const gg = polygonFan(gableShape(d, 6.7, "stepped"));
        for (const s of [-1, 1]) {
          const ox = s * (w / 2 - 0.04);
          B.addAt("white", gg, l.x + Math.cos(l.rot) * ox, g + h, l.z + Math.sin(l.rot) * ox, l.rot + Math.PI / 2);
        }
        for (const side of [-1, 1]) {
          for (let i = 0; i < 9; i++) {
            const t = (i + 0.5) / 9 - 0.5;
            const ox = t * w, oz = side * (d / 2 + 0.09);
            const wx = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
            const wz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
            const ang = face(-Math.sin(l.rot) * side, Math.cos(l.rot) * side);
            B.addAt("window", pane(1.9, 3.6, true), wx, g + 6.6, wz, ang);
            B.addAt("window", pane(1.9, 2.4, true), wx, g + 2.4, wz, ang);
          }
        }
        // the arcade along the south side
        for (let i = 0; i < 6; i++) {
          const t = (i + 0.5) / 6 - 0.5;
          const ox = t * w * 0.9, oz = d / 2 + 1.2;
          const px = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
          const pz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
          B.addAt("stone", trimBox(1.1, 4.6, 1.1), px, g + 2.3, pz, l.rot);
        }
        const mx = l.x + Math.sin(l.rot) * (d / 2 + 1.2), mz = l.z + Math.cos(l.rot) * (d / 2 + 1.2);
        B.addAt("roofDark", gableRoof(3.2, w * 0.94, 1.9, { overhang: 0.35, tile: 0.16 }), mx, g + 4.7, mz, l.rot + Math.PI / 2);
        // the tower in the middle of the ridge, and Old Thomas above everything
        const tx = l.x, tz = l.z;
        G = g + h;
        tower(B, tx, tz, { r: 3.5, h: 25, stages: 4, cap: "spire", capMat: "green", wall: "white", gallery: true, roofH: 16 });
        G = g;
        const ty = g + h + 25 + 16 + 2;
        B.addAt("gold", trimBox(0.55, 0.5, 0.55), tx, ty + 0.4, tz, 0);
        B.addAt("gold", trimBox(0.5, 1.6, 0.4), tx, ty + 1.4, tz, 0);
        B.addAt("gold", new THREE.SphereGeometry(0.38, 8, 6).toNonIndexed(), tx, ty + 2.5, tz, 0);
        B.addAt("gold", trimBox(0.14, 2.4, 0.14), tx + 0.55, ty + 2.0, tz, 0.35);
        B.addAt("gold", trimBox(1.9, 0.12, 0.12), tx, ty + 3.3, tz, 0);
        for (let i = 0; i < 5; i++) {   // the dormers on the hall's long roof
          const t = (i + 0.5) / 5 - 0.5;
          const ox = t * w * 0.8, oz = 0;
          const px = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
          const pz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
          if (Math.abs(ox) < 5) continue;
          B.addAt("roofDark", needle(1.5, 2.2, 4, 0.2), px, g + h + 5.4, pz, l.rot);
        }
        break;
      }
      // ------------------------------------------- Alexander Nevsky's onion domes ----
      case "nevski": {
        const w = 26, d = 32, h = 16;
        B.addAt("ochre", box(w, h, d, 0.22), l.x, g + h / 2, l.z, l.rot);
        B.addAt("trim", trimBox(w + 0.4, 0.8, d + 0.4), l.x, g + h * 0.55, l.z, l.rot);
        B.addAt("trim", trimBox(w + 0.4, 0.9, d + 0.4), l.x, g + h - 0.5, l.z, l.rot);
        B.addAt("stone", trimBox(w + 0.5, 1.6, d + 0.5), l.x, g + 0.8, l.z, l.rot);
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const t = (i + 0.5) / 4 - 0.5;
            const ox = t * d, oz = side * (w / 2 + 0.09);
            const wx = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
            const wz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
            B.addAt("window", pane(2.3, 7.0, true), wx, g + 7.4, wz, face(-Math.sin(l.rot) * side, Math.cos(l.rot) * side));
          }
          for (let i = 0; i < 4; i++) {
            const t = (i + 0.5) / 4 - 0.5;
            const ox = t * w, oz = side * (d / 2 + 0.09);
            const wx = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
            const wz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
            B.addAt("window", pane(2.3, 7.0, true), wx, g + 7.4, wz, face(Math.cos(l.rot) * side, Math.sin(l.rot) * side));
          }
        }
        const drumH = 5.4;
        for (const [ox, oz, r, dh] of [[0, 0, 5.6, 12], [0, 12, 3.6, 8], [0, -12, 3.6, 8], [-9.5, 0, 3.6, 8], [9.5, 0, 3.6, 8]]) {
          const px = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
          const pz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
          G = g + h;
          B.addAt("ochre", drum(r * 0.9, r * 0.84, drumH, 14, 0.14, { top: false }), px, G + drumH / 2, pz, 0);
          const ring = new THREE.TorusGeometry(Math.max(0.3, r * 0.95), 0.3, 5, 18).toNonIndexed();
          ring.rotateX(Math.PI / 2);
          B.addAt("trim", ring, px, G + drumH - 0.25, pz, 0);
          G = g + h + drumH;
          for (const [k, geo] of onionDome(r * 1.15, dh)) B.add(k, geo, { matrix: new THREE.Matrix4().makeTranslation(px, G, pz) });
        }
        // the bell tower over the entrance, tent-roofed
        const bx = l.x - Math.sin(l.rot) * 21, bz = l.z + Math.cos(l.rot) * 21;
        G = g;
        B.addAt("ochre", box(9, 6, 9, 0.2), bx, g + 3, bz, l.rot);
        tower(B, bx, bz, { r: 4.3, h: 28, stages: 4, cap: "tent", capMat: "green", wall: "ochre", gallery: true, roofH: 9 });
        G = g;
        break;
      }
      // ------------------------------------------------------- Toomkirik, the Dome ----
      case "toomkirik": {
        nave(B, l.x, l.z, l.rot, { w: 19, d: 44, h: 15, roofRise: 6.6, buttresses: 6, windows: 6 });
        const tx = l.x + Math.cos(l.rot) * (22 - 2), tz = l.z + Math.sin(l.rot) * (22 - 2);
        G = g;
        tower(B, tx, tz, { r: 4.2, h: 24, stages: 3, cap: "onion", wall: "white", roofH: 10 });
        G = g;
        break;
      }
      // ------------------------------------------------- St Olaf's, the tall spire ----
      case "oleviste": {
        nave(B, l.x, l.z, l.rot, { w: 20, d: 32, h: 13, roofRise: 5.8, buttresses: 5, windows: 5 });
        const tx = l.x - Math.cos(l.rot) * (16 + 1), tz = l.z - Math.sin(l.rot) * (16 + 1);
        G = g;
        tower(B, tx, tz, { r: 5.1, h: 56, stages: 5, cap: "spire", capMat: "dark", wall: "white", gallery: true, roofH: 46, seg: 8 });
        G = g;
        break;
      }
      // ------------------------------------------------------ St Nicholas' church ----
      case "niguliste": {
        nave(B, l.x, l.z, l.rot, { w: 20, d: 32, h: 15.5, roofRise: 6.2, buttresses: 5, windows: 5 });
        const tx = l.x - Math.cos(l.rot) * 16, tz = l.z - Math.sin(l.rot) * 16;
        G = g;
        tower(B, tx, tz, { r: 5, h: 28, stages: 4, cap: "tent", capMat: "dark", wall: "white", roofH: 13 });
        G = g;
        break;
      }
      // ------------------------------------- Holy Spirit: baroque front, two needles ----
      case "puhavaimu": {
        nave(B, l.x, l.z, l.rot, { w: 16, d: 26, h: 12, roofRise: 5.2, buttresses: 3, windows: 4 });
        const fx = l.x + Math.cos(l.rot) * 13, fz = l.z + Math.sin(l.rot) * 13;
        G = g;
        B.addAt("white", trimBox(17, 14, 2.2), fx, g + 7, fz, l.rot);
        for (const s of [-1, 1]) {
          const px = fx + Math.cos(l.rot) * 0 - Math.sin(l.rot) * (s * 7);
          const pz = fz + Math.sin(l.rot) * 0 + Math.cos(l.rot) * (s * 7);
          tower(B, px, pz, { r: 2.1, h: 18, stages: 3, cap: "spire", capMat: "green", wall: "white", roofH: 8 });
          B.addAt("window", pane(1.6, 2.6, true), px, g + 6, pz, face(Math.sin(l.rot), -Math.cos(l.rot)));
        }
        tower(B, fx, fz, { r: 2.9, h: 22, stages: 3, cap: "spire", capMat: "green", wall: "white", roofH: 9 });
        const dial = new THREE.CircleGeometry(1.2, 16).toNonIndexed();
        B.addAt("trim", dial, fx, g + 15, fz, l.rot);
        B.addAt("iron", trimBox(0.12, 0.8, 0.12), fx, g + 15.3, fz + 0.06, l.rot);
        G = g;
        break;
      }
      // --------------------------------------------------- Kiek in de Kök, the fat ----
      case "kiek": {
        const r = 8.6, h = 33;
        B.addAt("white", drum(r, r * 0.96, h, 20, 0.1, { top: false }), l.x, g + h / 2, l.z, 0);
        const base = new THREE.TorusGeometry(r * 1.03, 0.55, 5, 28).toNonIndexed(); base.rotateX(Math.PI / 2);
        B.addAt("stone", base, l.x, g + 2.4, l.z, 0);
        for (const hy of [10, 19, 27]) {
          const ring = new THREE.TorusGeometry(r * 1.03, 0.32, 5, 28).toNonIndexed(); ring.rotateX(Math.PI / 2);
          B.addAt("trim", ring, l.x, g + hy, l.z, 0);
        }
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          B.addAt("window", pane(0.9, 1.9, false), l.x + Math.cos(a) * r * 1.01, g + 13 + (k % 3) * 7, l.z + Math.sin(a) * r * 1.01, face(Math.cos(a), Math.sin(a)));
        }
        B.addAt("roofDark", new THREE.ConeGeometry(r * 1.06, 7.5, 20).toNonIndexed(), l.x, g + h + 3.7, l.z, 0);
        B.addAt("white", drum(1.95, 1.75, 5.4, 12, 0.14, { top: false }), l.x, g + h + 6.8, l.z, 0);
        B.addAt("green", new THREE.ConeGeometry(2.4, 3.6, 12).toNonIndexed(), l.x, g + h + 11.3, l.z, 0);
        B.addAt("gold", trimBox(0.16, 2.2, 0.16), l.x, g + h + 14.2, l.z, 0);
        break;
      }
      // ---------------------------------------------- Fat Margaret at the harbour ----
      case "margareeta": {
        const r = 12.5, h = 19;
        B.addAt("white", drum(r, r * 0.99, h, 24, 0.09, { top: false }), l.x, g + h / 2, l.z, 0);
        for (const hy of [1.8, 7.5, 13.5]) {
          const ring = new THREE.TorusGeometry(r * 1.02, 0.45, 5, 30).toNonIndexed(); ring.rotateX(Math.PI / 2);
          B.addAt("stone", ring, l.x, g + hy, l.z, 0);
        }
        const par = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 1.7, 24, 1, true).toNonIndexed();
        B.addAt("stone", par, l.x, g + h + 0.85, l.z, 0);
        for (const m of merlons({ radius: r * 1.03, count: 22, w: 1.1, h: 1.25, d: 0.8, tile: 0.2 })) B.addAt("stone", m, l.x, g + h + 1.7, l.z, 0);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          B.addAt("window", pane(1.4, 2.4, false), l.x + Math.cos(a) * r * 1.0, g + 10.5, l.z + Math.sin(a) * r * 1.0, face(Math.cos(a), Math.sin(a)));
        }
        // the gate into the harbour, with its arch
        const gx = l.x + Math.cos(l.rot + Math.PI) * (r + 3), gz = l.z + Math.sin(l.rot + Math.PI) * (r + 3);
        B.addAt("stone", trimBox(8, 7.5, 4), gx, g + 3.6, gz, l.rot);
        B.addAt("woodDark", pane(5.4, 5.6, true), gx, g + 2.9, gz + 0, face(-Math.cos(l.rot), -Math.sin(l.rot)));
        B.addAt("iron", trimBox(0.5, 0.5, 3.2), l.x + Math.cos(l.rot) * (r * 0.6), g + h + 2.6, l.z + Math.sin(l.rot) * (r * 0.6), 0.4);
        break;
      }
      // ----------------------------------------------------- the twin Viru towers ----
      case "viru": {
        const road = l.rot;
        const ux = Math.cos(road), uz = Math.sin(road);       // along the road
        const nx = -uz, nz = ux;                                // across it
        for (const s of [-1, 1]) {
          const px = l.x + nx * (s * 8.5), pz = l.z + nz * (s * 8.5);
          const h = 21;
          B.addAt("stone", drum(3.9, 3.7, h, 16, 0.11, { top: false }), px, g + h / 2 - 0.5, pz, 0);
          for (const hy of [1.5, 8, 15]) {
            const ring = new THREE.TorusGeometry(4.0, 0.34, 5, 22).toNonIndexed(); ring.rotateX(Math.PI / 2);
            B.addAt("trim", ring, px, g + hy, pz, 0);
          }
          const par = new THREE.CylinderGeometry(4.4, 4.4, 1.3, 16, 1, true).toNonIndexed();
          B.addAt("stone", par, px, g + h + 0.7, pz, 0);
          B.addAt("roof", new THREE.ConeGeometry(4.6, 6.6, 16).toNonIndexed(), px, g + h + 4.6, pz, 0);
          B.addAt("iron", needle(0.4, 2.6, 6, 0.2), px, g + h + 8.4, pz, 0);
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + 0.3;
            B.addAt("window", pane(0.85, 1.7, false), px + Math.cos(a) * 4.0, g + 6.5 + (k % 2) * 6, pz + Math.sin(a) * 4.0, face(Math.cos(a), Math.sin(a)));
          }
        }
        B.addAt("stone", trimBox(6.4, 1.5, 17.5), l.x, g + 13.0, l.z, road);
        B.addAt("stone", trimBox(6.4, 1.6, 17.5), l.x, g + 14.5, l.z, road);
        for (let i = 0; i < 7; i++) {
          const t = (i + 0.5) / 7 - 0.5;
          for (const s of [-1, 1]) {
            B.addAt("window", pane(0.95, 1.4, false), l.x + ux * (t * 15) + nx * (s * 3.2), g + 15.6, l.z + uz * (t * 15) + nz * (s * 3.2), face(nx * s, nz * s));
          }
        }
        break;
      }
      // ------------------------------------------------------- Toompea Castle ----
      case "castle": {
        const rngC = new Rng("castle");
        const P = (ox, oz) => [l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz, l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz];
        const runs = [[-38, -32, 76, "x"], [38, -32, 76, "x"], [0, -70, 64, "z"], [0, 6, 64, "z"]];
        for (const [ox, oz, L, axis] of runs) {
          const [px, pz] = P(ox, oz);
          const rot = axis === "x" ? l.rot : l.rot + Math.PI / 2;
          B.addAt("stone", box(L, 13.5, 2.6, 0.16), px, g + 6.2, pz, rot);
          B.addAt("cobble", box(L, 0.24, 3.6, 0.2), px, g + 12.4, pz, rot);
          for (const m of merlons({ length: L, w: 1.0, h: 1.3, d: 0.9, tile: 0.2 })) B.addAt("stone", m, px, g + 12.6, pz, rot);
        }
        for (const [ox, oz, r] of [[-38, -70, 5.6], [38, -70, 5.6], [-38, 6, 5.2], [38, 6, 5.2], [0, -70, 4.6], [0, 6, 4.6]]) {
          const [px, pz] = P(ox, oz);
          const h = 19 + rngC.f(-1.5, 3);
          B.addAt("stone", drum(r, r * 0.95, h, 14, 0.12, { top: false }), px, g + h / 2, pz, 0);
          B.addAt("roofDark", new THREE.ConeGeometry(r * 1.12, 4.6, 14).toNonIndexed(), px, g + h + 2.3, pz, 0);
        }
        const range = (ox, oz, w, d, h, key, roofH = 4.8) => {
          const [px, pz] = P(ox, oz);
          B.addAt(key, box(w, h, d, 0.22), px, g + h / 2, pz, l.rot);
          B.addAt("roofDark", gableRoof(d, w, roofH, { overhang: 0.5, tile: 0.14 }), px, g + h, pz, l.rot + Math.PI / 2);
          B.addAt("stone", trimBox(w + 0.3, 1.3, d + 0.3), px, g + 0.7, pz, l.rot);
          const n = Math.max(3, Math.round(w / 7));
          for (const side of [-1, 1]) {
            for (let i = 0; i < n; i++) {
              const t = (i + 0.5) / n - 0.5;
              const ox2 = t * w, oz2 = side * (d / 2 + 0.09);
              const wx = px + Math.cos(l.rot) * ox2 - Math.sin(l.rot) * oz2;
              const wz = pz + Math.sin(l.rot) * ox2 + Math.cos(l.rot) * oz2;
              const ang = face(-Math.sin(l.rot) * side, Math.cos(l.rot) * side);
              B.addAt("window", pane(1.8, 2.8, false), wx, g + h * 0.62, wz, ang);
              B.addAt("window", pane(1.8, 2.2, false), wx, g + h * 0.26, wz, ang);
            }
          }
        };
        range(-18, 2, 62, 17, 12.5, "pink");
        range(-18, -22, 54, 13, 10.5, "ochre");
        range(20, -14, 30, 26, 11, "white");
        range(20, 22, 26, 16, 9.5, "pink");
        break;
      }
      // --------------------------------------------------------- Tall Hermann ----
      case "hermann": {
        const w = 11.5, h = 44;
        B.addAt("brick", box(w, h, w, 0.2), l.x, g + h / 2, l.z, l.rot);
        for (let s = 0; s < 5; s++) {
          B.addAt("trim", trimBox(w + 0.6, 0.7, w + 0.6), l.x, g + 7.5 + s * 7.6, l.z, l.rot);
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
            B.addAt("window", pane(1.1, 2.1, false), l.x + Math.cos(a + l.rot) * (w / 2 + 0.08), g + 8.8 + s * 7.6, l.z + Math.sin(a + l.rot) * (w / 2 + 0.08), face(Math.cos(a + l.rot), Math.sin(a + l.rot)));
          }
        }
        B.addAt("trim", trimBox(w + 2.8, 1.2, w + 2.8), l.x, g + h - 3.2, l.z, l.rot);
        for (const m of merlons({ length: w + 2.6, w: 0.8, h: 1.1, d: 0.7, tile: 0.2 })) {
          for (const s of [-1, 1]) B.addAt("trim", m, l.x, g + h - 2.1, l.z + s * ((w + 2.6) / 2 - 0.35), l.rot);
        }
        B.addAt("trim", box(w * 0.84, 4.8, w * 0.84, 0.2), l.x, g + h + 2.4, l.z, l.rot);
        B.addAt("green", needle(w * 0.62, 13, 8, 0.1), l.x, g + h + 4.8, l.z, 0);
        B.addAt("gold", trimBox(0.22, 2.6, 0.22), l.x, g + h + 4.8 + 13 + 1.2, l.z, 0);
        B.addAt("gold", trimBox(2.7, 3.3, 0.3), l.x, g + h + 3.2, l.z - (w * 0.62 + 0.12), l.rot);
        break;
      }
      // ------------------------------------------ St Catherine's, roofless nave ----
      case "katariina": {
        nave(B, l.x, l.z, l.rot, { w: 17, d: 30, h: 13.5, roofRise: 3.2, wall: "stone", buttresses: 6, windows: 4, gable: "plain" });
        G = g;
        tower(B, l.x + Math.cos(l.rot) * 16, l.z + Math.sin(l.rot) * 16, { r: 3.4, h: 11, stages: 2, cap: "flat", wall: "stone" });
        G = g;
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5 - 0.5;
          const ox = t * 30;
          const ax = l.x + Math.cos(l.rot) * ox, az = l.z + Math.sin(l.rot) * ox;
          for (const s of [-1, 1]) B.addAt("stone", trimBox(0.9, 3.4, 0.9), ax - Math.sin(l.rot) * s * 3.2, g + 14.5, az + Math.cos(l.rot) * s * 3.2, l.rot);
          B.addAt("stone", trimBox(7.4, 0.9, 1.0), ax, g + 16.2, az, l.rot);
        }
        break;
      }
      // ------------------------------------------------ St John's outside the wall ----
      case "jaani": {
        nave(B, l.x, l.z, l.rot, { w: 14, d: 26, h: 10.5, roofRise: 4.4, wall: "stone", buttresses: 4, windows: 4 });
        G = g;
        tower(B, l.x - Math.cos(l.rot) * 13, l.z - Math.sin(l.rot) * 13, { r: 3.2, h: 14, stages: 2, cap: "tent", capMat: "green", wall: "stone", roofH: 7 });
        G = g;
        for (let i = 0; i < 30; i++) {
          const a = rng.f(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 27;
          const sx = l.x + Math.cos(a) * r, sz = l.z + 30 + Math.sin(a) * r * 0.65;
          B.addAt("stone", trimBox(1.1, rng.f(0.7, 1.6), 0.5), sx, city.terr.ground(sx, sz) + 0.15, sz, rng.f(-0.35, 0.35));
        }
        break;
      }
      // --------------------------------------------------- the Great Guild Hall ----
      case "guild": {
        const w = 14, d = 24, h = 12;
        B.addAt("stone", box(w, h, d, 0.2), l.x, g + h / 2, l.z, l.rot);
        B.addAt("roofDark", gableRoof(w, d, 5.6, { overhang: 0.5, tile: 0.14 }), l.x, g + h, l.z, l.rot + Math.PI / 2);
        const geo = polygonFan(gableShape(w, 5.7, "stepped"));
        B.addAt("stone", geo, l.x + Math.cos(l.rot) * (d / 2 - 0.04), g + h, l.z + Math.sin(l.rot) * (d / 2 - 0.04), l.rot);
        for (let i = 0; i < 4; i++) {
          const t = (i + 0.5) / 4 - 0.5;
          const ox = t * d, oz = w / 2 + 0.09;
          const wx = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
          const wz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
          B.addAt("window", pane(2.0, 3.8, true), wx, g + 6.4, wz, face(-Math.sin(l.rot), Math.cos(l.rot)));
        }
        B.addAt("woodDark", pane(3.6, 4.6, true), l.x + Math.cos(l.rot) * (d / 2 + 0.1), g + 2.4, l.z + Math.sin(l.rot) * (d / 2 + 0.1), face(Math.cos(l.rot), Math.sin(l.rot)));
        G = g;
        tower(B, l.x - Math.cos(l.rot) * 11, l.z - Math.sin(l.rot) * 11, { r: 2.4, h: 15, stages: 3, cap: "spire", capMat: "green", wall: "stone", roofH: 6 });
        G = g;
        break;
      }
      // --------------------------------------------- Linnahall, the concrete slab ----
      case "linnahall": {
        const w = 190, d = 74, h = 21;
        B.addAt("concrete", box(w, h, d, 0.1), l.x, g + h / 2 - 1, l.z, l.rot);
        B.addAt("concrete", box(w * 0.7, 9, d * 0.62, 0.1), l.x, g + h + 3.5, l.z, l.rot);
        B.addAt("concrete", box(w * 1.02, 1.4, d * 1.06, 0.1), l.x, g + 1.2, l.z, l.rot);
        for (let i = 0; i < 32; i++) {
          const t = (i + 0.5) / 32 - 0.5;
          const ox = t * w, oz = d / 2 + 0.07;
          const wx = l.x + Math.cos(l.rot) * ox - Math.sin(l.rot) * oz;
          const wz = l.z + Math.sin(l.rot) * ox + Math.cos(l.rot) * oz;
          B.addAt("window", pane(3.6, 2.1, false), wx, g + 8.5, wz, face(-Math.sin(l.rot), Math.cos(l.rot)));
        }
        for (const s of [-1, 1]) {
          const px = l.x + Math.cos(l.rot) * (s * w * 0.42), pz = l.z + Math.sin(l.rot) * (s * w * 0.42);
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            B.addAt("iron", trimBox(0.5, 30, 0.5), px + Math.cos(a) * 4, g + 26, pz + Math.sin(a) * 4, 0);
          }
        }
        break;
      }
      default:
        break;   // squares are ground, not buildings
    }
  }
}

// ============================================================================= walls ==========
function addWall(B, city) {
  const path = city.wallPath;
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, z1] = path[i], [x2, z2] = path[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const rot = Math.atan2(-dz, dx);
    const gy = city.terr.ground(mx, mz);
    const H = 12.5;
    B.addAt("stone", box(L, H, 2.4, 0.16), mx, gy + H / 2 - 0.6, mz, rot);
    B.addAt("cobble", box(L, 0.24, 3.6, 0.2), mx, gy + H - 0.5, mz, rot);
    for (const m of merlons({ length: L, w: 1.0, h: 1.25, d: 0.8, tile: 0.2 })) B.addAt("stone", m, mx, gy + H, mz, rot);
    // the townward gallery on timbers
    const nx = -Math.sin(rot) * 2.1, nz = Math.cos(rot) * 2.1;
    B.addAt("woodDark", box(L, 0.2, 1.6, 0.2), mx + nx, gy + 9.4, mz + nz, rot);
    const nPost = DETAIL > 0.6 ? Math.max(2, Math.round(L / 6)) : 0;
    for (let k = 0; k < nPost; k++) {
      const t = (k + 0.5) / nPost - 0.5;
      B.addAt("woodDark", box(0.3, 3.4, 0.3, 0.2), mx - Math.cos(rot) * (t * L) + nx * 1.15, gy + 7.9, mz - Math.sin(rot) * (t * L) + nz * 1.15, rot);
    }
    for (let k = 0; k < (DETAIL > 0.6 ? Math.max(2, Math.round(L / 9)) : 1); k++) {
      const t = (k + 0.5) / (DETAIL > 0.6 ? Math.max(2, Math.round(L / 9)) : 1) - 0.5;
      const px = mx - Math.cos(rot) * (t * L), pz = mz - Math.sin(rot) * (t * L);
      B.addAt("window", pane(0.7, 2.1, false), px - nx, gy + 6.6, pz - nz, face(-nx, -nz));
    }
  }
  for (const t of city.towers) {
    const gy = city.terr.ground(t.x, t.z);
    const seg = t.kind === "round" || t.kind === "margareeta" || t.kind === "kiek" ? 14 : t.kind === "hex" ? 6 : 4;
    const rotY = seg === 4 ? Math.PI / 4 : 0;
    B.addAt("stone", drum(t.r, t.r * 0.94, t.h, seg, 0.11, { top: false }), t.x, gy + t.h / 2 - 0.5, t.z, rotY);
    const ring = new THREE.TorusGeometry(Math.max(0.3, t.r * 1.03), 0.3, 5, Math.max(8, seg * 2)).toNonIndexed();
    ring.rotateX(Math.PI / 2);
    B.addAt("trim", ring, t.x, gy + t.h * 0.55, t.z, 0);
    const par = new THREE.CylinderGeometry(t.r * 1.12, t.r * 1.12, 1.4, Math.max(8, seg), 1, true).toNonIndexed();
    B.addAt("stone", par, t.x, gy + t.h + 0.2, t.z, rotY);
    for (const m of merlons({ radius: t.r * 1.12, count: Math.max(8, seg + 4), w: 0.9, h: 1.15, d: 0.7, tile: 0.2 })) B.addAt("stone", m, t.x, gy + t.h + 0.9, t.z, rotY);
    if (t.kind !== "square") B.addAt("roof", new THREE.ConeGeometry(t.r * 1.16, Math.max(2.5, t.r * 1.5), seg, 1).toNonIndexed(), t.x, gy + t.h + 2.4, t.z, rotY);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      B.addAt("window", pane(0.7, 1.8, false), t.x + Math.cos(a) * t.r, gy + 5 + (k % 2) * 5, t.z + Math.sin(a) * t.r, face(Math.cos(a), Math.sin(a)));
    }
    if (t.kind === "square") {
      B.addAt("iron", trimBox(0.5, 0.5, 2.6), t.x, gy + t.h + 1.6, t.z, 0.4);
      B.addAt("woodDark", trimBox(1.2, 0.8, 1.6), t.x, gy + t.h + 1.1, t.z, 0.4);
    }
  }
  for (const gt of city.gates) {
    const gy = city.terr.ground(gt.x, gt.z);
    const nx = -Math.sin(gt.rot), nz = Math.cos(gt.rot);
    for (const s of [-1, 1]) {
      const px = gt.x + nx * (s * (gt.w / 2 + 2.4)), pz = gt.z + nz * (s * (gt.w / 2 + 2.4));
      const h = 17;
      B.addAt("stone", drum(3.2, 3.0, h, 12, 0.12, { top: false }), px, gy + h / 2 - 0.5, pz, 0);
      B.addAt("roof", new THREE.ConeGeometry(3.8, 5.4, 12).toNonIndexed(), px, gy + h + 2.4, pz, 0);
    }
    B.addAt("stone", trimBox(gt.w + 4, 1.5, 3.4), gt.x, gy + 7.8, gt.z, gt.rot);
    B.addAt("woodDark", pane(gt.w, 6.6, true), gt.x, gy + 3.4, gt.z, face(Math.cos(gt.rot), Math.sin(gt.rot)));
  }
  for (const b of city.bastions) {
    const gy = city.terr.ground(b.x, b.z);
    const ux = Math.cos(b.rot), uz = Math.sin(b.rot);
    B.addAt("brick", box(b.w, 7.5, 1.8, 0.18), b.x, gy + 3.3, b.z, b.rot);
    for (const s of [-1, 1]) B.addAt("brick", box(1.8, 7.5, b.d * 0.62, 0.18), b.x + ux * (s * b.w / 2), gy + 3.3, b.z + uz * (s * b.w / 2), b.rot);
    B.addAt("grass", box(b.w, 0.5, b.d * 0.8, 0.2), b.x - Math.sin(b.rot) * (b.d * 0.36), gy + 5.6, b.z + Math.cos(b.rot) * (b.d * 0.36), b.rot);
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3 - 0.5;
      const px = b.x + ux * (t * b.w) - uz * 1.3, pz = b.z + uz * (t * b.w) + ux * 1.3;
      B.addAt("iron", trimBox(0.45, 0.45, 2.7), px, gy + 6.6, pz, b.rot + 0.12);
      B.addAt("woodDark", trimBox(1.2, 0.8, 1.6), px, gy + 6.0, pz, b.rot);
    }
  }
}

// ============================================================================ ground ==========

/**
 * The ground inside the wall is paved, not grass: yards, back lanes and the strips between houses
 * are one continuous cobble floor that follows the terrain, so the Old Town reads as a town from
 * above instead of a village in a field. A coarse grid (one quad per ~13 m, tilted to the ground's
 * own corners) keeps it to a few thousand triangles under 660 houses.
 */
function townFloor(B, city) {
  const ring = city.wallPath;
  if (!ring || ring.length < 3) return;
  const inside = (x, z) => {
    let inp = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inp = !inp;
    }
    return inp;
  };
  const step = 13, k = 1 / 11;
  const pos = [], uvs = [], idx = [];
  for (let gx = -560, ix = 0; gx < 470; gx += step, ix++) {
    for (let gz = -660, iz = 0; gz < 420; gz += step, iz++) {
      const cx = gx + step / 2, cz = gz + step / 2;
      if (!inside(cx, cz) || city.terr.isSea(cx, cz)) continue;
      const base = pos.length / 3;
      for (let c = 0; c < 4; c++) {
        const lx = cx + (c === 1 || c === 2 ? step / 2 : -step / 2);
        const lz = cz + (c >= 2 ? step / 2 : -step / 2);
        pos.push(lx, city.terr.ground(lx, lz) + 0.02, lz);
        uvs.push(lx * k, lz * k);
      }
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  B.add("paving", g);
}

function addGround(B, city) {
  const { terr } = city;
  townFloor(B, city);
  for (const r of city.roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const gy = terr.ground(mx, mz);
      if (gy < 0.6) continue;
      const rot = Math.atan2(-dz, dx);
      B.addAt(r.main ? "cobbleFan" : "cobble", box(L + 0.5, 0.24, r.width, 0.14), mx, gy + 0.03, mz, rot);
      if (r.main) {
        for (const s of [-1, 1]) {
          const nx = -Math.sin(rot) * (r.width / 2 + 0.55) * s, nz = Math.cos(rot) * (r.width / 2 + 0.55) * s;
          B.addAt("stone", box(L + 0.5, 0.34, 0.75, 0.2), mx + nx, gy + 0.08, mz + nz, rot);
        }
      }
    }
  }
  for (const q of city.squares) {
    const gy = terr.ground(q.x, q.z);
    const key = q.surface === "grass" ? "grass" : q.surface === "paving" ? "paving" : "cobbleFan";
    B.addAt(key, box(q.w, 0.28, q.d, 0.12), q.x, gy + 0.05, q.z, q.rot);
    if (q.surface !== "grass") {   // a kerb so the square reads as laid ground
      const cx = Math.cos(q.rot), sz = Math.sin(q.rot);
      for (const s of [-1, 1]) {
        B.addAt("stone", box(q.w + 1, 0.5, 0.7, 0.2), q.x - sz * (s * q.d / 2), gy + 0.16, q.z + cx * (s * q.d / 2), q.rot);
        B.addAt("stone", box(0.7, 0.5, q.d + 1, 0.2), q.x + cx * (s * q.w / 2), gy + 0.16, q.z + sz * (s * q.w / 2), q.rot);
      }
    }
  }
  // quay wall and promenade along the harbour
  for (let x = -560; x < 470; x += 14) {
    const cz = terr.coastZ(x);
    const gy = terr.ground(x, cz + 12);
    B.addAt("stone", box(14.5, 6.5, 2.4, 0.16), x, gy - 2.2, cz + 9.5, 0.05);
    B.addAt("paving", box(14.5, 0.26, 10, 0.12), x, gy + 0.12, cz + 16, 0.05);
  }
}

/** the diorama: the ground disc and the cut-away strata beneath it */

/**
 * The land painted per vertex, so one grass material still shows meadow, limestone scree, shore
 * sand and the dark earth under the town. polarGrid gives UVs across the whole disc, which would
 * stretch one grass tile over two kilometres, so they are rescaled to a tile every ~13 m here.
 */
function paintLand(terr, g, size) {
  const pos = g.attributes.position, uv = g.attributes.uv;
  const cols = new Float32Array(pos.count * 3);
  const k = size / 13;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const sl = terr.slope(x, z), h = terr.ground(x, z);
    let hex = 0x8b9a5e;                                       // grass, the texture doing the work
    if (terr.isSea(x, z) || h < 1.4) hex = 0xa9a08a;          // shore
    else if (sl > 0.62) hex = 0xc0b8a6;                       // the escarpment's limestone scree
    else if (sl > 0.34) hex = 0x9c9d76;                       // scrub on the hillside
    else if (h > 34) hex = 0x7a8c52;                          // the plateau's lawns
    c.setHex(hex).convertSRGBToLinear();
    const n = 0.9 + 0.24 * terr.noise.fbm(x * 0.013, z * 0.013, 3);
    cols[i * 3] = c.r * n; cols[i * 3 + 1] = c.g * n * (h > 30 ? 1 : 1.02); cols[i * 3 + 2] = c.b * n;
    uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
}

export function buildBase(terr, { radius = 860, depth = 122 } = {}) {
  const outline = (a) => radius * (1 + 0.14 * Math.cos(a) * Math.cos(a) - 0.05 * Math.sin(a))
    * (0.94 + 0.05 * Math.sin(a * 3 + 0.7) + 0.03 * Math.sin(a * 5 + 2.1));
  const topFn = (x, z) => terr.ground(x, z);
  const top = polarGrid({ rings: 46, sectors: 104, radiusFn: outline, heightFn: topFn, size: radius * 2.3 });
  paintLand(terr, top, radius * 2.3);
  const side = earthSide({
    rings: 7, sectors: 104, radiusFn: outline, topFn, depth, baseScale: 0.7,
    wobble: (a, t) => 0.02 * Math.sin(a * 4 + t * 3) + 0.014 * Math.sin(a * 9 - t * 5),
  });
  return { top, side, outline };
}

// ======================================================================= trees, fringe ==========
function treeParts(kind) {
  const trunk = (r, h) => { const g = drum(r, r * 0.7, h, 6, 0.1, { top: false }); place(g, 0, h / 2, 0); return g.toNonIndexed(); };
  const blob = (x, y, z, r, squash = 1) => { const g = new THREE.IcosahedronGeometry(Math.max(0.2, r), 0).toNonIndexed(); place(g, x, y, z, 0, 1, squash, 1); return g; };
  if (kind === "pine") {
    const out = [["trunk", trunk(0.32, 3.2)]];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.ConeGeometry(Math.max(0.3, 2.7 - i * 0.55), 2.7, 7).toNonIndexed();
      place(g, 0, 3.5 + i * 1.75, 0);
      out.push(["leaf", g]);
    }
    return out;
  }
  if (kind === "oak") return [["trunk", trunk(0.45, 2.6)], ["leaf", blob(0, 4.4, 0, 2.9, 0.85)], ["leaf", blob(-1.8, 3.6, 0.6, 1.9, 0.9)], ["leaf", blob(1.7, 4.1, -0.7, 2.1, 0.9)]];
  if (kind === "elm") return [["trunk", trunk(0.34, 2.4)], ["leaf", blob(0, 4.7, 0, 2.1, 1.5)], ["leaf", blob(0.5, 6.4, 0.2, 1.4, 1.3)]];
  return [["trunk", trunk(0.3, 2.2)], ["leaf", blob(0, 4.9, 0, 2.15, 1.45)], ["leaf", blob(0, 6.7, 0, 1.45, 1.25)]];
}

const LEAF = { linden: 0x6d8a3a, oak: 0x607d3a, pine: 0x365438, elm: 0x66853f };

function buildTrees(city, quality, M) {
  const group = new THREE.Group();
  group.name = "trees";
  const kinds = ["linden", "oak", "pine", "elm"];
  const byKind = new Map(kinds.map((k) => [k, []]));
  for (const t of city.trees) (byKind.get(t.kind) || byKind.get("linden")).push(t);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, flatShading: true, vertexColors: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, vertexColors: true });
  for (const k of kinds) {
    const list = byKind.get(k);
    if (!list.length) continue;
    const buckets = new Map();
    for (const [key, geo] of treeParts(k)) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(geo);
    }
    for (const [key, geos] of buckets) {
      const merged = key === "leaf" && geos.length > 1 ? mergeAll(geos) : geos[0];
      const inst = new THREE.InstancedMesh(merged, key === "leaf" ? leafMat : trunkMat, list.length);
      const c = new THREE.Color();
      const rng = new Rng("trees" + k);
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        _m.compose(new THREE.Vector3(t.x, t.y - 0.25, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i * 2.399) % 6.283, 0)), new THREE.Vector3(t.s, t.s * rng.f(0.85, 1.2), t.s));
        inst.setMatrixAt(i, _m);
        const hex = key === "trunk" ? 0x53412c : LEAF[k];
        const tint = rng.f(0.8, 1.06);
        c.setHex(hex).convertSRGBToLinear().multiplyScalar(tint);
        if (key === "leaf" && (k === "pine" || k === "elm")) c.multiplyScalar(0.82);
        inst.setColorAt(i, c);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.castShadow = quality !== "low";
      inst.receiveShadow = false;
      inst.name = `trees:${k}:${key}`;
      group.add(inst);
    }
  }
  void M;
  return group;
}

function mergeAll(geos) {
  const prepared = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    delete n.userData.color;
    n.deleteAttribute("color");
    return n;
  });
  const merged = mergeGeometries(prepared, false);
  if (merged) return merged;
  console.warn("tree merge failed, using first part");
  return prepared[0];
}

function addFringe(B, city) {
  for (const b of city.blocks) {
    const gy = city.terr.ground(b.x, b.z);
    if (gy < 0.8) continue;
    const c = new THREE.Color(b.col);
    B.addAt("block", box(b.w, b.h, b.d, 0.12), b.x, gy + b.h / 2, b.z, b.rot, { color: [c.r * 1.7, c.g * 1.7, c.b * 1.7] });
    B.addAt("roofDark", box(b.w * 0.98, 0.6, b.d * 0.98, 0.1), b.x, gy + b.h + 0.2, b.z, b.rot);
    const floors = Math.min(DETAIL > 0.6 ? 7 : 3, b.storeys);
    for (let f = 0; f < floors; f++) {
      for (const s of [-1, 1]) {
        const ox = 0, oz = s * (b.d / 2 + 0.07);
        const wx = b.x + Math.cos(b.rot) * ox - Math.sin(b.rot) * oz;
        const wz = b.z + Math.sin(b.rot) * ox + Math.cos(b.rot) * oz;
        B.addAt("window", box(b.w * 0.84, 1.15, 0.16, 0.1), wx, gy + 3.6 + f * 2.95, wz, b.rot);
      }
    }
  }
}

// ========================================================================= harbour ==========
function addHarbour(B, city) {
  const { terr } = city;
  const rng = new Rng("harbour");
  const ships = [
    { x: 130, z: -700, rot: 0.1, masts: 3, len: 34 },
    { x: -70, z: -690, rot: -0.05, masts: 2, len: 26 },
    { x: 300, z: -742, rot: 0.25, masts: 3, len: 40 },
  ];
  for (const s of ships) {
    B.addAt("hull", box(s.len, 5.5, 8.5, 0.14), s.x, 0.6, s.z, s.rot);
    B.addAt("trim", box(s.len * 0.96, 0.8, 8.8, 0.1), s.x, 2.6, s.z, s.rot);
    B.addAt("woodDark", box(s.len * 0.45, 2.4, 7.6, 0.14), s.x + s.len * 0.22, 4.6, s.z, s.rot);
    for (let i = 0; i < s.masts; i++) {
      const t = s.masts === 1 ? 0 : (i / (s.masts - 1) - 0.5) * s.len * 0.7;
      const mx = s.x + Math.cos(s.rot) * t, mz = s.z + Math.sin(s.rot) * t;
      const mh = 19 + (i === 1 ? 4 : 0);
      B.addAt("wood", drum(0.36, 0.22, mh, 6, 0.12, { top: false }), mx, 3 + mh / 2, mz, 0);
      for (let k = 1; k <= 2; k++) {
        const yl = mh * (0.34 + k * 0.24);
        B.addAt("wood", box(0.3, 0.3, 9.5 - k * 2.2, 0.2), mx, 3 + yl, mz, s.rot);
        B.addAt("canvas", box(0.18, 3.6, 8.5 - k * 2.2, 0.06), mx, 3 + yl - 1.9, mz, s.rot);
      }
    }
    for (let i = 0; i < 7; i++) {
      const t = rng.f(-0.45, 0.45);
      B.addAt("iron", box(0.09, 0.09, s.len * 0.85, 0.1), s.x + Math.cos(s.rot) * (t * s.len), 7 + rng.f(0, 8), s.z + Math.sin(s.rot) * (t * s.len), s.rot);
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = -300 + i * 62 + rng.f(-12, 12);
    const z = terr.coastZ(x) + 32 + rng.f(-9, 9);
    const gy = terr.ground(x, z);
    if (gy < 1) continue;
    const w = rng.f(13, 22), d = rng.f(9, 14), h = rng.f(6, 10), rot = rng.f(-0.2, 0.2);
    B.addAt("stone", box(w, h, d, 0.18), x, gy + h / 2, z, rot);
    B.addAt("roofDark", gableRoof(d, w, 3.4, { overhang: 0.4, tile: 0.15 }), x, gy + h, z, rot + Math.PI / 2);
    B.addAt("woodDark", box(w * 0.7, 1.0, 0.4, 0.2), x, gy + h * 0.6, z + d / 2, rot);
  }
  const cx = 205, cz = terr.coastZ(205) + 24, cy = terr.ground(cx, cz);
  B.addAt("iron", trimBox(1.2, 14, 1.2), cx, cy + 7, cz, 0);
  B.addAt("iron", trimBox(9, 0.8, 0.8), cx + 3, cy + 13.6, cz, 0.3);
  B.addAt("iron", trimBox(0.22, 5, 0.22), cx + 7.2, cy + 10.8, cz, 0);
  B.addAt("wood", trimBox(2.4, 1.4, 2.4), cx, cy + 0.7, cz, 0);
}

// ============================================================================== entry ==========
/**
 * Everything that does not move. One Batch, one merged mesh per material, plus the tree
 * instances and the two meshes of the diorama base.
 */
export function buildStatic(city, tex, { quality = "high" } = {}) {
  G = 0;
  DETAIL = quality === "low" ? 0.4 : 1;
  const M = buildMaterials(tex);
  const B = new Batch();
  const group = new THREE.Group();
  group.name = "tallinn";

  const base = buildBase(city.terr, { radius: city.bounds.R });
  const groundMesh = new THREE.Mesh(base.top, M.grass);
  groundMesh.receiveShadow = true;
  groundMesh.name = "ground";
  group.add(groundMesh);
  const strataMat = new THREE.MeshStandardMaterial({ map: tex.strata, roughness: 0.96, metalness: 0, vertexColors: true });
  const strataMesh = new THREE.Mesh(base.side, strataMat);
  strataMesh.receiveShadow = true;
  strataMesh.name = "strata";
  group.add(strataMesh);

  addGround(B, city);
  for (const h of city.houses) addHouse(B, h);
  addFringe(B, city);
  addLandmarks(B, city);
  addWall(B, city);
  addHarbour(B, city);

  const built = B.build({ materials: M, name: "statics" });
  group.add(built);
  group.add(buildTrees(city, quality, M));

  const stats = {
    pieces: B.stats.pieces,
    tris: Math.round(B.stats.tris + base.top.attributes.position.count / 2 + city.trees.length * 46),
    draws: 2 + built.children.length + group.getObjectByName("trees").children.length,
    houses: city.houses.length,
  };
  return { group, mats: M, stats, base, strataMat, emitters: B.emitters || [] };
}
