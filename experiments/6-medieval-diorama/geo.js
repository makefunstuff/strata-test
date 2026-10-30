// The geometry kit: primitives that carry world-scaled UVs (so one texture tiles at a fixed
// metres-per-repeat on every face), and a Batch that collects hundreds of placed pieces into one
// merged, vertex-coloured mesh per material. The whole town is a dozen draw calls this way.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();

/** Transform a fresh geometry in place and return it. */
export function place(geo, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, rotY, 0);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _m.compose(_v, _q, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

/** Rewrite a BoxGeometry's per-face 0..1 UVs to world-scaled ones (tile = metres per repeat). */
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const ext = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px, nx, py, ny, pz, nz
  for (let f = 0; f < 6; f++) {
    const [eu, ev] = ext[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * eu * tile, uv.getY(k) * ev * tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** A box whose six faces tile their texture at `tile` repeats per metre. */
export function box(w, h, d, tile = 0.25) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleBoxUV(g, w, h, d, tile);
}

/** A box built from bays: the four wall faces snap to whole bays of `bayW` x `bayH` metres. */
export function bayBox(w, h, d, bayW = 2, bayH = 2.2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const ext = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const bays = [[bayW, bayH], [bayW, bayH], [bayW, bayH], [bayW, bayH], [bayW, bayH], [bayW, bayH]];
  for (let f = 0; f < 6; f++) {
    const [eu, ev] = ext[f];
    const [bw, bh] = bays[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * (eu / bw), uv.getY(k) * (ev / bh));
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function plane(w, h, tile = 0.25) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) * w * tile, uv.getY(i) * h * tile);
  uv.needsUpdate = true;
  return g;
}

/** Stone drum / tower. UVs scale with circumference and height so courses stay square. */
export function drum(rBottom, rTop, h, seg = 16, tile = 0.12, caps = { bottom: false, top: true }) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, false, 0, Math.PI * 2);
  // strip caps if not wanted
  const keep = [];
  const idx = g.index.array;
  const perCap = seg; // triangles per cap fan
  const sideCount = seg * 2 * 3;
  const total = idx.length;
  const side = idx.slice(0, sideCount);
  const bottom = idx.slice(sideCount, sideCount + perCap * 3);
  const top = idx.slice(sideCount + perCap * 3, sideCount + perCap * 6);
  const out = [...side];
  if (caps.bottom) out.push(...bottom);
  if (caps.top) out.push(...top);
  g.setIndex(out);
  const uv = g.attributes.uv;
  const circ = Math.PI * (rBottom + rTop);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u * circ * tile, v * h * tile);
  }
  uv.needsUpdate = true;
  return g;
}

export function spire(r, h, seg = 12, tile = 0.14) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, false);
  const idx = g.index.array.slice(0, seg * 3); // sides only
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r * tile, uv.getY(i) * h * tile);
  uv.needsUpdate = true;
  return g;
}

/**
 * A gable roof as a solid prism: ridge along Z, slopes facing +/-X.
 * `span` is the width it covers (X), `length` the ridge length (Z); `rise` is the height of the
 * ridge over the eaves. Steep by default — that is what reads as medieval.
 */
export function gableRoof(span, length, rise, { overhang = 0.35, tile = 0.16 } = {}) {
  const hw = span / 2 + overhang, hl = length / 2 + overhang;
  const P = [
    [-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl],   // eave ring A B C D
    [0, rise, -hl], [0, rise, hl],                              // ridge E F
  ];
  // explicit winding (outward normals): front slope, back slope, underside
  const tris = [
    [1, 2, 5], [1, 5, 4],       // +X
    [3, 0, 4], [3, 4, 5],       // -X
    [0, 1, 2], [0, 2, 3],       // underside
  ];
  const pos = [];
  const uvw = [];
  const slope = Math.hypot(rise, hw);
  for (const t of tris) {
    for (const vi of t) {
      const p = P[vi];
      pos.push(p[0], p[1], p[2]);
      // u along the ridge, v up the slope (underside gets a flat v, invisible anyway)
      const u = p[2];
      const v = p[1] > 0 ? slope : Math.hypot(p[0], p[2]) * 0.2;
      uvw.push(u * tile, v * tile);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvw, 2));
  g.computeVertexNormals();
  return g;
}

/** Four-sided hip roof: two trapezoid slopes and two triangular ends, ridge shortened by ` inset`. */
export function hipRoof(span, length, rise, { overhang = 0.35, tile = 0.16, inset = 0.32 } = {}) {
  const hw = span / 2 + overhang, hl = length / 2 + overhang;
  const ri = Math.max(0.01, length / 2 - span / 2) * (1 - inset) + 0.4;
  const P = [
    [-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl],
    [0, rise, -ri], [0, rise, ri],
  ];
  const tris = [
    [1, 2, 5], [1, 5, 4],
    [3, 0, 4], [3, 4, 5],
    [0, 1, 4], [2, 3, 5],
    [0, 1, 2], [0, 2, 3],
  ];
  const pos = [], uvw = [];
  const slope = Math.hypot(rise, hw);
  for (const t of tris) {
    for (const vi of t) {
      const p = P[vi];
      pos.push(p[0], p[1], p[2]);
      uvw.push(p[2] * tile, (p[1] > 0 ? slope : Math.hypot(p[0], p[2]) * 0.2) * tile);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvw, 2));
  g.computeVertexNormals();
  return g;
}

/** The triangle that closes a gable end (ridge along Z): sits in the plane z = +/- length/2. */
export function gableTriangle(span, rise, { tile = 0.12 } = {}) {
  const hw = span / 2;
  const tris = [[0, 1, 2]];
  const P = [[-hw, 0, 0], [hw, 0, 0], [0, rise, 0]];
  const pos = [], uvw = [];
  for (const t of tris) for (const vi of t) { pos.push(...P[vi]); uvw.push(P[vi][0] * tile, P[vi][1] * tile); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvw, 2));
  g.computeVertexNormals();
  return g;
}

/** A row of merlons (crenellations) along a straight wall top or around a circular one. */
export function merlons({ length = null, radius = null, count = 8, w = 0.9, h = 1.1, d = 0.9, tile = 0.2 } = {}) {
  const geos = [];
  const n = count;
  if (radius != null) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = box(w, h, d, tile);
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      // stand on the ring, facing outward
      place(b, x, h / 2, z, -a + Math.PI / 2);
      geos.push(b.toNonIndexed());
    }
  } else {
    const step = length / n;
    for (let i = 0; i < n; i++) {
      const b = box(w, h, d, tile);
      place(b, -length / 2 + step * (i + 0.5), h / 2, 0);
      geos.push(b.toNonIndexed());
    }
  }
  return geos;
}

/**
 * A quad ribbon along a polyline, lifted off the ground by `lift`, following heightFn.
 * Used for roads, the river surface and hedgerow bases.
 */
export function ribbon(points, width, { heightFn = () => 0, lift = 0.05, tile = 0.15, closed = false, taper = null } = {}) {
  const pts = closed ? [...points, points[0]] : points;
  const pos = [], uvw = [], norm = [];
  const half = width / 2;
  let dist = 0;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1e-4;
    const nx = -dz / len, nz = dx / len;
    const wA = taper ? taper(dist) : 1;
    const wB = taper ? taper(dist + len) : 1;
    const p = [
      [a.x + nx * half * wA, heightFn(a.x + nx * half * wA, a.z + nz * half * wA) + lift, a.z + nz * half * wA],
      [a.x - nx * half * wA, heightFn(a.x - nx * half * wA, a.z - nz * half * wA) + lift, a.z - nz * half * wA],
      [b.x + nx * half * wB, heightFn(b.x + nx * half * wB, b.z + nz * half * wB) + lift, b.z + nz * half * wB],
      [b.x - nx * half * wB, heightFn(b.x - nx * half * wB, b.z - nz * half * wB) + lift, b.z - nz * half * wB],
    ];
    const d0 = dist, d1 = dist + len;
    const tri = [[0, 1, 2], [2, 1, 3]];
    const uvv = [[d0, 0], [d0, width], [d1, 0], [d1, width]];
    for (const t of tri) {
      for (const vi of t) {
        pos.push(...p[vi]);
        uvw.push(uvv[vi][0] * tile, uvv[vi][1] * tile);
      }
    }
    void up;
    dist += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvw, 2));
  g.computeVertexNormals();
  void norm;
  return g;
}

/**
 * The diorama's top: a polar grid (rings x sectors) whose radius follows the outline and whose
 * height comes from the terrain, with planar UVs so one painted canvas maps over the whole disc.
 */
export function polarGrid({ rings, sectors, radiusFn, heightFn, size }) {
  const pos = [], uvs = [], idxs = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const rad = radiusFn(a) * t;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      pos.push(x, heightFn(x, z), z);
      uvs.push((x / size + 0.5), (z / size + 0.5));
    }
  }
  const stride = sectors;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a0 = r * stride + s;
      const a1 = r * stride + ((s + 1) % stride);
      const b0 = (r + 1) * stride + s;
      const b1 = (r + 1) * stride + ((s + 1) % stride);
      if (r === 0) { idxs.push(b0, b1, a0); } else { idxs.push(a0, a1, b0, b0, a1, b1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idxs);
  g.computeVertexNormals();
  return g;
}

/**
 * The cut-away side of the earth chunk: a tapered band from the rim down to a smaller base,
 * plus a rough bottom cap. UVs run around the circumference and down the height.
 */
export function earthSide({ rings, sectors, radiusFn, topFn, depth, baseScale, wobble }) {
  const pos = [], uvs = [], idxs = [], cols = [];
  const band = [0, 0.16, 0.34, 0.55, 0.74, 0.9, 1];   // ring t values: soil -> rock
  for (let r = 0; r < band.length; r++) {
    const t = band[r];
    const rr = 1 - t * (1 - baseScale);
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const rad = radiusFn(a) * rr * (1 + wobble(a, t));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const y = topFn(x, z) - depth * t;
      pos.push(x, y, z);
      uvs.push((s / sectors) * 9, t);
      cols.push(1, 1, 1);
    }
  }
  const stride = sectors;
  for (let r = 0; r < band.length - 1; r++) {
    for (let s = 0; s < sectors; s++) {
      const a0 = r * stride + s, a1 = r * stride + ((s + 1) % stride);
      const b0 = (r + 1) * stride + s, b1 = (r + 1) * stride + ((s + 1) % stride);
      // outward-facing winding (seen from outside the disc)
      idxs.push(a0, a1, b0, b1, b0, a1);
    }
  }
  // bottom cap: its own ring of vertices, so it can carry a plain dark UV of its own instead of
  // inheriting the strata strip from the wall (which smeared the whole base into one swirl)
  const capRing = pos.length / 3;
  for (let s = 0; s < sectors; s++) {
    const a = (s / sectors) * Math.PI * 2;
    const rad = radiusFn(a) * baseScale * (1 + wobble(a, 1));
    pos.push(Math.cos(a) * rad, -depth, Math.sin(a) * rad);
    uvs.push(0.5, 0.93);
    cols.push(0.34, 0.31, 0.27);
  }
  const centre = pos.length / 3;
  pos.push(0, -depth, 0); uvs.push(0.5, 0.93); cols.push(0.26, 0.24, 0.21);
  for (let s = 0; s < sectors; s++) {
    const a0 = capRing + s, a1 = capRing + ((s + 1) % sectors);
    idxs.push(centre, a0, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idxs);
  g.computeVertexNormals();
  return g;
}

/**
 * Collects placed geometries per material key and merges each bucket into one mesh.
 * Every piece carries a vertex colour, so one material can still show many tints.
 */
export class Batch {
  constructor() { this.buckets = new Map(); this.stats = { pieces: 0, tris: 0 }; }
  add(matKey, geo, { color = null, matrix = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      const c = new Float32Array(n * 3);
      const col = color ?? [1, 1, 1];
      for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
      g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    }
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const arr = this.buckets.get(matKey) || [];
    arr.push(g);
    this.buckets.set(matKey, arr);
    this.stats.pieces++;
    this.stats.tris += n / 3;
    return g;
  }

  addAt(matKey, geo, x, y, z, rotY = 0, opts = {}) {
    return this.add(matKey, geo, { ...opts, matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rotX ?? 0, rotY, opts.rotZ ?? 0)),
      new THREE.Vector3(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1),
    ) });
  }

  /** the merged geometry of one bucket, for building an InstancedMesh out of it */
  merged(matKey) {
    const geos = this.buckets.get(matKey) || [];
    return geos.length ? mergeGeometries(geos, false) : null;
  }

  /** One mesh per material key; returns a group holding them. */
  build({ materials, shadow = true, shadowCast = null, name = "batch" } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, geos] of this.buckets) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      const mat = materials[key];
      if (!mat) { console.warn("batch: no material for", key); continue; }
      const mesh = new THREE.Mesh(merged, mat);
      const cast = shadowCast != null ? shadowCast[key] !== false : shadow;
      mesh.castShadow = cast !== false;
      mesh.receiveShadow = true;
      mesh.name = `${name}:${key}`;
      group.add(mesh);
      for (const g of geos) g.dispose?.();
    }
    return group;
  }
}

/** A MeshStandardMaterial tuned for this palette: matte, vertex-tinted, unlit by env specular. */
export function mat(map, { color = 0xffffff, roughness = 0.94, metalness = 0, side = THREE.FrontSide, flatShading = false, emissive = 0x000000, emissiveIntensity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    map, color, roughness, metalness, side, flatShading, vertexColors: true,
    emissive, emissiveIntensity,
  });
}

/**
 * A vertex colour out of a hex, in the renderer's linear working space, scaled by a number or an
 * [r,g,b] tint. Vertex colour attributes are read as already-linear, so a raw hex would glow too bright.
 */
export function col(hex, tint = 1) {
  const c = new THREE.Color(hex);
  if (typeof tint === "number") return [c.r * tint, c.g * tint, c.b * tint];
  return [c.r * tint[0], c.g * tint[1], c.b * tint[2]];
}
