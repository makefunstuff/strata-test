// The moving parts of the diorama: the bay that moves, hearth smoke, street lanterns that wake at
// dusk, small folk on the cobbles, the market stalls that only appear in December, gulls over the
// harbour and flags on the hills. Each is one InstancedMesh or one Points, animated on the GPU
// where possible, so a phone holds the frame rate.
import * as THREE from "three";
import { box, drum, mat, col, Batch } from "../6-medieval-diorama/geo.js";
import { Rng } from "../6-medieval-diorama/rng.js";

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** walk a polyline at constant speed */
function sampler(pts) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    seg.push({ a, b, len, at: total });
    total += len;
  }
  return {
    total,
    at(d) {
      if (!total) return { x: pts[0].x, z: pts[0].z, ux: 1, uz: 0 };
      d = ((d % total) + total) % total;
      let s = seg[0];
      for (const g of seg) { if (d >= g.at && d <= g.at + g.len) { s = g; break; } }
      const t = (d - s.at) / s.len;
      return {
        x: s.a.x + (s.b.x - s.a.x) * t,
        z: s.a.z + (s.b.z - s.a.z) * t,
        ux: (s.b.x - s.a.x) / s.len,
        uz: (s.b.z - s.a.z) / s.len,
      };
    },
  };
}

// ================================================================================== the bay ====
/**
 * The sea is a grid over the water only, at sea level, with analytic waves: the normal comes out of
 * the same sines as the height, so the shimmer is per pixel with no extra geometry. Each vertex
 * carries the seabed depth under it, so the bay darkens as it deepens towards the harbour mouth.
 */
function buildSea(terr, { R = 820 } = {}) {
  const pos = [], uvs = [], depth = [];
  const step = 17;
  const ring = (x, z, u, v, d) => { pos.push(x, 0, z); uvs.push(u, v); depth.push(d); };
  for (let x = -R; x < R; x += step) {
    for (let z = -R; z < 260; z += step) {
      const cx = x + step / 2, cz = z + step / 2;
      if (!terr.isSea(cx, cz)) continue;
      if (Math.hypot(cx, cz) > R * 1.02) continue;
      const d = Math.min(9, Math.max(0, 0.4 - terr.ground(cx, cz)));
      ring(x, z, 0, 0, d); ring(x + step, z, 1, 0, d); ring(x, z + step, 0, 1, d);
      ring(x, z + step, 0, 1, d); ring(x + step, z, 1, 0, d); ring(x + step, z + step, 1, 1, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uShallow: { value: new THREE.Color(0x2f7c86) },
    uDeep: { value: new THREE.Color(0x0a2733) },
    uSky: { value: new THREE.Color(0x9dc4e0) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    uSunCol: { value: new THREE.Color(0xfff2d6) },
    uWake: { value: new THREE.Vector3(130, 0, -700) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute float aDepth;
      varying vec2 vUv; varying float vDepth; varying vec3 vWorld;
      void main() {
        vUv = uv; vDepth = aDepth;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vDepth; varying vec3 vWorld;
      uniform float uTime, uNight;
      uniform vec3 uShallow, uDeep, uSky, uSunDir, uSunCol, uWake;

      void waves(vec2 p, float t, out float h, out vec2 grad) {
        float a1 = dot(p, vec2(1.9, 0.6)) + t * 1.15;
        float a2 = dot(p, vec2(0.9, 1.7)) - t * 0.8;
        float a3 = dot(p, vec2(4.4, -0.9)) + t * 1.9;
        h = 0.55 * sin(a1) + 0.3 * sin(a2) + 0.15 * sin(a3);
        grad = 0.55 * cos(a1) * vec2(1.9, 0.6) + 0.3 * cos(a2) * vec2(0.9, 1.7) + 0.15 * cos(a3) * vec2(4.4, -0.9);
      }

      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        vec2 p = vWorld.xz * 0.11 + vec2(-uTime * 0.16, uTime * 0.05);
        float h; vec2 gr;
        waves(p, uTime, h, gr);
        vec3 n = normalize(vec3(0.0, 1.0, 0.0) - vec3(gr.x * 0.05, 0.0, gr.y * 0.05));
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.2);
        vec3 body = mix(uShallow, uDeep, clamp(vDepth / 6.0, 0.0, 1.0));
        vec3 col = mix(body, uSky, clamp(fres * 0.62, 0.0, 0.55));
        col += uSunCol * max(dot(n, uSunDir), 0.0) * 0.06;
        vec3 hv = normalize(uSunDir + v);
        col += uSunCol * pow(max(dot(n, hv), 0.0), 120.0) * (0.9 - uNight * 0.6);
        // the harbour lights, reflected as a broken column of warmth at night
        float near = exp(-length(vWorld.xz - uWake.xz) / 210.0);
        col += vec3(1.0, 0.66, 0.3) * near * (0.35 + 0.65 * max(h, 0.0)) * uNight * 0.5;
        col += uSky * smoothstep(0.72, 1.0, h) * 0.06;
        col *= mix(1.0, 0.26, uNight);
        col = mix(col, uSky * 0.16, uNight * 0.4);
        gl_FragColor = vec4(col, 0.94);
      }`,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.name = "sea";
  mesh.position.y = 0.32;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ===================================================================== hearth smoke ============
/** every chimney breathes on the GPU: one draw call for the whole town's hearths */
function buildSmoke(emitters, tex, seed) {
  const per = 16;
  const n = Math.max(1, emitters.length * per);
  const origin = new Float32Array(n * 3);
  const sd = new Float32Array(n);
  const rng = new Rng(seed + "/smoke");
  let i = 0;
  for (const [ex, ey, ez] of emitters) {
    for (let k = 0; k < per; k++, i++) {
      origin[i * 3] = ex + rng.f(-0.3, 0.3);
      origin[i * 3 + 1] = ey + 0.3;
      origin[i * 3 + 2] = ez + rng.f(-0.3, 0.3);
      sd[i] = rng.f(0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(origin.subarray(0, i * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(sd.subarray(0, i), 1));
  const uniforms = {
    uTime: { value: 0 }, uMap: { value: tex.smoke }, uNight: { value: 0 },
    uScale: { value: 130 }, uDensity: { value: 1 }, uWind: { value: new THREE.Vector2(0.55, 0.24) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uScale;
      uniform vec2 uWind;
      varying float vFade; varying float vSeed;
      void main() {
        float life = fract(uTime * 0.05 + aSeed);
        float rise = life * (6.0 + aSeed * 5.0);
        vec3 p = position;
        p.y += rise;
        p.x += uWind.x * rise * (0.5 + aSeed) + sin(life * 6.0 + aSeed * 30.0) * 0.6;
        p.z += uWind.y * rise * (0.5 + aSeed) + cos(life * 5.0 + aSeed * 21.0) * 0.6;
        vFade = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.3, 1.0, life));
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.3 + life * 6.5) * uScale / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uNight, uDensity;
      varying float vFade; varying float vSeed;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        vec3 tint = mix(vec3(0.87, 0.86, 0.84), vec3(0.3, 0.32, 0.4), uNight);
        gl_FragColor = vec4(tint, t.a * vFade * 0.5 * uDensity);
        if (gl_FragColor.a < 0.01) discard;
      }`,
  });
  const points = new THREE.Points(g, material);
  points.name = "smoke";
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, uniforms };
}

// ================================================================== lanterns and glow =========
/**
 * Street lanterns: a cast-iron post on the paving with a warm head that only shows after dark, plus
 * the halo over each square where the lamps pool their light.
 */
function buildLanterns(city, tex) {
  const rng = new Rng("tallinn/lanterns");
  const posts = [];
  const halos = [];
  for (const q of city.squares) {
    const gy = city.terr.ground(q.x, q.z);
    if (gy < 1) continue;
    const n = Math.max(4, Math.round((q.w + q.d) / 22));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const along = rng.chance(0.5);
      const ox = along ? t * q.w : rng.f(-0.42, 0.42) * q.w;
      const oz = along ? rng.f(-0.42, 0.42) * q.d : t * q.d;
      const x = q.x + Math.cos(q.rot) * ox - Math.sin(q.rot) * oz;
      const z = q.z + Math.sin(q.rot) * ox + Math.cos(q.rot) * oz;
      posts.push({ x, y: city.terr.ground(x, z), z, h: 4.6 });
      halos.push({ x, y: city.terr.ground(x, z) + 4.5, z, s: 5.5 });
    }
    halos.push({ x: q.x, y: gy + 1.4, z: q.z, s: Math.min(q.w, q.d) * 0.7 });
  }
  // the main streets get a lamp every ~34 m
  for (const r of city.roads) {
    if (!r.main) continue;
    const path = sampler(r.pts);
    const n = Math.max(1, Math.round(path.total / 34));
    for (let i = 0; i < n; i++) {
      const p = path.at((i + 0.5) / n * path.total);
      const side = i % 2 ? 1 : -1;
      const x = p.x - p.uz * side * (r.width / 2 + 1.1);
      const z = p.z + p.ux * side * (r.width / 2 + 1.1);
      if (city.terr.isSea(x, z)) continue;
      const y = city.terr.ground(x, z);
      if (y < 1) continue;
      posts.push({ x, y, z, h: 4.2 });
      halos.push({ x, y: y + 4.1, z, s: 4.4 });
    }
  }
  for (const g of city.gates) {
    const gy = city.terr.ground(g.x, g.z);
    for (const side of [-1, 1]) {
      const x = g.x - Math.sin(g.rot) * side * (g.w / 2 + 3.6);
      const z = g.z + Math.cos(g.rot) * side * (g.w / 2 + 3.6);
      posts.push({ x, y: city.terr.ground(x, z), z, h: 5.0 });
      halos.push({ x, y: city.terr.ground(x, z) + 4.9, z, s: 6 });
    }
  }

  // the post: a tapered pole, a crossbar, a lantern box
  const B = new Batch();
  const pole = drum(0.14, 0.1, 4.0, 7, 0.3, { top: false }); placeAt(pole, 0, 2.0, 0);
  B.add("iron", pole, { color: col(0x24272c, 1) });
  const baseGeo = drum(0.34, 0.26, 0.5, 8, 0.3, { top: false }); placeAt(baseGeo, 0, 0.25, 0);
  B.add("iron", baseGeo, { color: col(0x24272c, 1) });
  const head = box(0.55, 0.75, 0.55, 0.6); placeAt(head, 0, 4.3, 0);
  B.add("iron", head, { color: col(0x2b2f34, 1) });
  const cap = drum(0.44, 0.1, 0.36, 8, 0.4, { top: true }); placeAt(cap, 0, 4.85, 0);
  B.add("iron", cap, { color: col(0x22262a, 1) });
  const postGeo = B.merged("iron");

  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.5, vertexColors: true });
  const postMesh = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  postMesh.name = "lanterns";
  postMesh.castShadow = false;
  posts.forEach((p, i) => {
    _q.setFromAxisAngle(UP, rng.f(-0.4, 0.4));
    _v.set(p.x, p.y - 0.05, p.z); _s.set(1, 1, 1);
    postMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
  });
  postMesh.instanceMatrix.needsUpdate = true;

  const haloGeo = new THREE.PlaneGeometry(1, 1);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    map: tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  });
  const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, halos.length);
  haloMesh.name = "lanternglow";
  haloMesh.renderOrder = 4;
  haloMesh.frustumCulled = false;
  halos.forEach((p, i) => {
    _q.identity(); _v.set(p.x, p.y, p.z); _s.set(p.s, p.s, p.s);
    haloMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    const heat = 0.9 + (i % 4) * 0.1;
    haloMesh.setColorAt(i, _c.setRGB(1 * heat, 0.66 * heat, 0.34 * heat));
  });
  haloMesh.instanceMatrix.needsUpdate = true;
  if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "lanterns";
  group.add(postMesh, haloMesh);
  return { group, haloMat, count: posts.length };
}

function placeAt(g, x, y, z) { g.translate(x, y, z); return g; }

// ============================================================ small folk, carts and gulls ======
const COAT = [0x3b4a5e, 0x5a3b3b, 0x3f5545, 0x6a5a3c, 0x463f52, 0x2f4550, 0x704a44, 0x50545c];
const MUFFLED = [0xd9d3c6, 0xb8483f, 0x2f3a4a, 0x6d5b46, 0x8c8577, 0x94303a, 0x39505c, 0xd4a63c];

function personGeo() {
  const B = new Batch();
  const legs = box(0.44, 0.78, 0.3, 0.5); placeAt(legs, 0, 0.39, 0);
  B.add("p", legs, { color: col(0x2e3138, 1) });
  const coat = box(0.52, 0.78, 0.36, 0.5); placeAt(coat, 0, 1.16, 0);
  B.add("p", coat, { color: col(0xffffff, 1) });
  const head = new THREE.SphereGeometry(0.19, 7, 5).toNonIndexed(); placeAt(head, 0, 1.72, 0);
  B.add("p", head, { color: col(0xd9b48b, 1) });
  const hat = drum(0.24, 0.2, 0.2, 8, 0.4, { top: true }); placeAt(hat, 0, 1.9, 0);
  B.add("p", hat, { color: col(0x30281f, 1) });
  return B.merged("p");
}

function buildFolk(city, quality) {
  const rng = new Rng("tallinn/folk");
  const inside = (p) => !city.terr.isSea(p.x, p.z) && Math.hypot(p.x, p.z) < 760 && city.terr.ground(p.x, p.z) > 1;
  const paths = city.roads.map((r) => sampler(r.pts.filter(inside))).filter((p) => p.total > 24);
  // the square is where the people actually are: several loops around its edge
  for (const q of city.squares) {
    if (city.terr.ground(q.x, q.z) < 1) continue;
    const ringPts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rx = q.w * 0.42, rz = q.d * 0.42;
      const ox = Math.cos(a) * rx, oz = Math.sin(a) * rz;
      ringPts.push({ x: q.x + Math.cos(q.rot) * ox - Math.sin(q.rot) * oz, z: q.z + Math.sin(q.rot) * ox + Math.cos(q.rot) * oz });
    }
    paths.push(sampler(ringPts));
  }
  if (!paths.length) return null;
  const count = Math.min(quality === "low" ? 60 : 190, Math.max(50, Math.round(city.houses.length * 0.3)));
  const geo = personGeo();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, cloth, count);
  mesh.name = "folk";
  mesh.castShadow = quality !== "low";
  const folk = [];
  for (let i = 0; i < count; i++) {
    folk.push({
      path: paths[rng.i(0, paths.length - 1)],
      d: rng.f(0, 1) * 1000,
      speed: rng.f(0.8, 1.7) * (rng.chance(0.5) ? 1 : -1),
      side: rng.f(-1.4, 1.4),
      bob: rng.f(0, 6.28),
      gait: rng.f(4.4, 6.6),
      summer: col(rng.pick(COAT), rng.f(0.8, 1.1)),
      winter: col(rng.pick(MUFFLED), rng.f(0.8, 1.1)),
    });
    mesh.setColorAt(i, _c.setRGB(folk[i].summer[0], folk[i].summer[1], folk[i].summer[2]));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // a horse cart on the wide streets, and the trading carts at the market
  const cartPaths = paths.filter((p) => p.total > 120);
  let cartMesh = null;
  const carts = [];
  if (cartPaths.length) {
    const B = new Batch();
    const bed = box(2.6, 0.28, 1.7, 0.4); placeAt(bed, 0, 1.0, 0);
    B.add("c", bed, { color: col(0x5b4128, 1) });
    for (const s of [-1, 1]) {
      const wall = box(2.6, 0.62, 0.16, 0.4); placeAt(wall, 0, 1.45, s * 0.8);
      B.add("c", wall, { color: col(0x6a4c30, 1) });
    }
    const front = box(0.2, 0.7, 0.24, 0.4); placeAt(front, 1.7, 1.1, 0);
    B.add("c", front, { color: col(0x40301e, 1) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = new THREE.TorusGeometry(0.55, 0.1, 4, 10).toNonIndexed();
      wheel.rotateY(Math.PI / 2);
      placeAt(wheel, sx * 0.85, 0.55, sz * 0.78);
      B.add("c", wheel, { color: col(0x33261a, 1) });
    }
    // the horse
    const body = box(1.9, 0.9, 0.8, 0.4); placeAt(body, 2.9, 1.5, 0);
    B.add("c", body, { color: col(0x513724, 1) });
    const neck = box(0.5, 1.0, 0.5, 0.4); placeAt(neck, 3.7, 2.1, 0);
    B.add("c", neck, { color: col(0x513724, 1) });
    const head = box(0.8, 0.4, 0.42, 0.4); placeAt(head, 4.2, 2.5, 0);
    B.add("c", head, { color: col(0x4a3220, 1) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.2, 1.1, 0.2, 0.4); placeAt(leg, 2.9 + sx * 0.7, 0.55, sz * 0.3);
      B.add("c", leg, { color: col(0x3d2a1a, 1) });
    }
    const cartGeo = B.merged("c");
    const cartMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true });
    const n = Math.min(7, cartPaths.length);
    cartMesh = new THREE.InstancedMesh(cartGeo, cartMat, n);
    cartMesh.name = "carts";
    cartMesh.castShadow = quality !== "low";
    for (let i = 0; i < n; i++) carts.push({ path: cartPaths[i % cartPaths.length], d: rng.f(0, 1) * 1000, speed: rng.f(1.7, 2.8) * (rng.chance(0.5) ? 1 : -1) });
  }

  // gulls over the harbour, and crows over the hill
  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.Float32BufferAttribute(
    [0, 0, 0, 1.1, 0.22, -0.34, 1.1, 0.22, 0.34, 0, 0, 0, -1.1, 0.22, -0.34, -1.1, 0.22, 0.34], 3));
  wing.computeVertexNormals();
  const nBird = quality === "low" ? 12 : 30;
  const birds = new THREE.InstancedMesh(wing, new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 1, side: THREE.DoubleSide }), nBird);
  birds.name = "birds";
  const flock = [];
  for (let i = 0; i < nBird; i++) {
    const harbour = i % 3 !== 2;
    flock.push({
      cx: harbour ? rng.f(-160, 260) : -320, cz: harbour ? -640 : 200,
      r: rng.f(26, 110), a: rng.f(0, 6.28), y: rng.f(harbour ? 22 : 52, harbour ? 46 : 74),
      w: rng.f(0.07, 0.18) * (rng.chance(0.5) ? 1 : -1), ph: rng.f(0, 6.28), s: rng.f(0.5, 0.9),
      dark: !harbour,
    });
  }
  birds.setColorAt(0, _c.setRGB(1, 1, 1));
  for (let i = 0; i < nBird; i++) {
    const f = flock[i];
    if (f.dark) _c.setRGB(0.11, 0.11, 0.13); else _c.setRGB(0.93, 0.93, 0.9);
    birds.setColorAt(i, _c);
  }
  if (birds.instanceColor) birds.instanceColor.needsUpdate = true;

  return {
    mesh, folk, cartMesh, carts, birds, flock, cloth,
    setWinter(v) {
      folk.forEach((f, i) => {
        const c = v ? f.winter : f.summer;
        mesh.setColorAt(i, _c.setRGB(c[0], c[1], c[2]));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt, t) {
      for (let i = 0; i < folk.length; i++) {
        const f = folk[i];
        f.d += f.speed * dt;
        const p = f.path.at(f.d);
        const x = p.x - p.uz * f.side, z = p.z + p.ux * f.side;
        const y = city.terr.ground(x, z);
        if (y < 0.2) continue;
        const bobY = Math.abs(Math.sin(t * f.gait * 0.5 + f.bob)) * 0.085;
        _q.setFromAxisAngle(UP, Math.atan2(p.ux * Math.sign(f.speed), p.uz * Math.sign(f.speed)));
        _v.set(x, y + bobY - 0.06, z); _s.set(1, 1, 1);
        mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (cartMesh) {
        for (let i = 0; i < carts.length; i++) {
          const c = carts[i];
          c.d += c.speed * dt;
          const p = c.path.at(c.d);
          const y = city.terr.ground(p.x, p.z);
          if (y < 0.2) continue;
          _q.setFromAxisAngle(UP, Math.atan2(p.ux * Math.sign(c.speed), p.uz * Math.sign(c.speed)));
          _v.set(p.x, y - 0.06, p.z); _s.set(1, 1, 1);
          cartMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
        }
        cartMesh.instanceMatrix.needsUpdate = true;
      }
      if (birds.visible) {
        for (let i = 0; i < flock.length; i++) {
          const b = flock[i];
          b.a += b.w * dt;
          const flap = Math.sin(t * 6.5 + b.ph) * 0.55;
          _e.set(flap * 0.55, b.a + Math.PI / 2, Math.sin(b.a * 2) * 0.22 + flap * 0.4, "YXZ");
          _q.setFromEuler(_e);
          _v.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.6 + b.ph) * 2.6, b.cz + Math.sin(b.a) * b.r);
          _s.set(b.s, b.s, b.s);
          birds.setMatrixAt(i, _m.compose(_v, _q, _s));
        }
        birds.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// ======================================================================= the market ============
/**
 * Raekoja plats in December: a grid of timber stalls with striped awnings, candles in the windows
 * and the tree in the middle. In summer the same square gets café umbrellas instead.
 */
function buildMarket(city, tex, winter = true) {
  const rng = new Rng("tallinn/market");
  const spots = [];
  for (const q of city.squares) {
    if (!q.market) continue;
    const gy = city.terr.ground(q.x, q.z);
    if (gy < 1) continue;
    const cols = Math.max(2, Math.round(q.w / 9)), rows = Math.max(2, Math.round(q.d / 9));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rng.chance(0.28)) continue;
        const ox = (i / (cols - 1) - 0.5) * q.w * 0.78;
        const oz = (j / (rows - 1) - 0.5) * q.d * 0.78;
        if (Math.hypot(ox, oz) < 9) continue;                    // the tree keeps the middle
        const x = q.x + Math.cos(q.rot) * ox - Math.sin(q.rot) * oz;
        const z = q.z + Math.sin(q.rot) * ox + Math.cos(q.rot) * oz;
        spots.push({ x, y: city.terr.ground(x, z), z, rot: q.rot + rng.f(-0.14, 0.14) });
      }
    }
  }
  if (!spots.length) return null;

  const B = new Batch();
  const counter = box(3.0, 1.05, 1.9, 0.35); placeAt(counter, 0, 0.52, 0);
  B.add("wood", counter, { color: col(0x7a5533, 1) });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.16, 2.3, 0.16, 0.4); placeAt(post, sx * 1.4, 1.15, sz * 0.85);
    B.add("wood", post, { color: col(0x5c3f24, 1) });
  }
  const goods = box(2.5, 0.4, 1.5, 0.35); placeAt(goods, 0, 1.28, 0);
  B.add("stall", goods, { color: col(0xffffff, 1) });
  const roof = box(3.5, 0.16, 2.5, 0.35); placeAt(roof, 0, 2.4, 0);
  B.add("stall", roof, { color: col(0xffffff, 1) });
  const stallGeo = B.merged("wood");
  const stallMat = new THREE.MeshStandardMaterial({ map: tex.stall, color: 0xffffff, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });

  const mesh = new THREE.InstancedMesh(stallGeo, stallMat, spots.length);
  mesh.name = "market";
  mesh.castShadow = true;
  const candleGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const candleMat = new THREE.MeshBasicMaterial({ map: tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const candles = new THREE.InstancedMesh(candleGeo, candleMat, spots.length);
  candles.name = "marketglow";
  candles.renderOrder = 4;
  candles.frustumCulled = false;
  spots.forEach((sp, i) => {
    _q.setFromEuler(new THREE.Euler(0, sp.rot, 0));
    _v.set(sp.x, sp.y - 0.04, sp.z); _s.set(1, 1, 1);
    mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    const warm = rng.chance(0.5) ? [1, 0.35, 0.3] : [0.9, 0.8, 0.75];
    mesh.setColorAt(i, _c.setRGB(warm[0], warm[1], warm[2]));
    _v.set(sp.x, sp.y + 2.0, sp.z); _s.set(3.4, 3.4, 3.4);
    candles.setMatrixAt(i, _m.compose(_v, _q, _s));
    candles.setColorAt(i, _c.setRGB(1, 0.62, 0.3));
  });
  mesh.instanceMatrix.needsUpdate = true;
  candles.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (candles.instanceColor) candles.instanceColor.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "market";
  group.add(mesh, candles);

  // the Christmas tree on the Town Hall square, with its star
  const tree = new THREE.Group();
  tree.name = "markettree";
  const main = city.squares.find((q) => q.market && city.terr.ground(q.x, q.z) > 1);
  if (main) {
    const ty = city.terr.ground(main.x, main.z);
    const trunk = drum(0.7, 0.55, 1.6, 8, 0.25, { top: false });
    group.add(new THREE.Mesh(trunk, new THREE.MeshStandardMaterial({ color: 0x53381f, roughness: 0.95 })));
    trunk.translate(main.x, ty + 0.8, main.z);
    const layers = 6, H = 22;
    const tierGeo = new THREE.ConeGeometry(1, 1, 12).toNonIndexed();
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x2f5735, roughness: 0.95, flatShading: true });
    const tiers = new THREE.InstancedMesh(tierGeo, tierMat, layers);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const r = 7.4 * (1 - t * 0.86), hh = 5.2 * (1 - t * 0.45);
      _q.setFromAxisAngle(UP, t * 1.2);
      _v.set(main.x, ty + 1.8 + t * (H - 5) + hh / 2, main.z);
      _s.set(r, hh, r);
      tiers.setMatrixAt(i, _m.compose(_v, _q, _s));
      _c.setRGB(0.13 + t * 0.06, 0.3 + t * 0.12, 0.16 + t * 0.05);
      tiers.setColorAt(i, _c);
    }
    tiers.instanceMatrix.needsUpdate = true;
    if (tiers.instanceColor) tiers.instanceColor.needsUpdate = true;
    tree.add(tiers);
    // the baubles, as glow points that only wake after dark
    const nB = 90;
    const bp = new Float32Array(nB * 3);
    for (let i = 0; i < nB; i++) {
      const t = Math.sqrt(rng.next());
      const a = rng.f(0, 6.28), rr = 7.0 * (1 - t) * rng.f(0.5, 1.0);
      bp[i * 3] = main.x + Math.cos(a) * rr;
      bp[i * 3 + 1] = ty + 2.2 + t * (H - 4);
      bp[i * 3 + 2] = main.z + Math.sin(a) * rr;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    const baubles = new THREE.Points(bg, new THREE.PointsMaterial({
      map: tex.glow, size: 1.7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xffd27a, opacity: 0, sizeAttenuation: true,
    }));
    baubles.name = "treebaubles";
    baubles.frustumCulled = false;
    tree.add(baubles);
    const starGeo = new THREE.OctahedronGeometry(1.5, 0).toNonIndexed();
    const star = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    star.position.set(main.x, ty + H + 1.6, main.z);
    star.name = "treestar";
    tree.add(star);
  }
  group.add(tree);
  group.userData.candleMat = candleMat;
  group.userData.baubles = tree.children.find((c) => c.name === "treebaubles");
  group.userData.star = tree.children.find((c) => c.name === "treestar");
  return { group, mesh, candles, candleMat };
}

// ========================================================================== the flags ==========
/**
 * Cloth on a pole: the Estonian tricolour over Toompea, a long flag on the Town Hall spire and
 * wall flags at the gates, all moved by the same wind in the vertex shader.
 */
function buildFlags(city) {
  const spots = [];
  const rng = new Rng("tallinn/flags");
  const FLAG = { est: [0x2c5faa, 0x1b1b1d, 0xf4f4f2], hanse: [0xb4392f, 0xf0ece0] };
  for (const l of city.landmarks) {
    if (l.kind === "hermann") {
      const gy = city.terr.ground(l.x, l.z);
      spots.push({ x: l.x, y: gy + 63, z: l.z, rot: l.rot, w: 5.2, h: 3.4, c: FLAG.est, pole: 0 });
    } else if (l.kind === "castle") {
      const gy = city.terr.ground(l.x, l.z);
      spots.push({ x: l.x + 20, y: gy + 22, z: l.z - 40, rot: l.rot, w: 4.4, h: 2.9, c: FLAG.est, pole: 4 });
    } else if (l.kind === "townhall") {
      const gy = city.terr.ground(l.x, l.z);
      spots.push({ x: l.x, y: gy + 58, z: l.z, rot: l.rot, w: 3.4, h: 2.2, c: FLAG.hanse, pole: 0 });
    }
  }
  for (const g of city.gates) {
    const gy = city.terr.ground(g.x, g.z);
    for (const side of [-1, 1]) {
      spots.push({
        x: g.x - Math.sin(g.rot) * side * (g.w / 2 + 4.6), y: gy + 8.4,
        z: g.z + Math.cos(g.rot) * side * (g.w / 2 + 4.6),
        rot: g.rot + Math.PI / 2, w: 1.5, h: 3.2, c: FLAG.hanse, pole: 3.2,
      });
    }
  }
  if (!spots.length) return null;

  const geo = new THREE.PlaneGeometry(1, 1, 4, 9);
  geo.translate(0, -0.5, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  mesh.name = "flags";
  mesh.castShadow = false;
  const seeds = new Float32Array(spots.length);
  const colours = [];
  spots.forEach((f, i) => {
    _q.setFromEuler(new THREE.Euler(0, f.rot, 0));
    _v.set(f.x, f.y, f.z); _s.set(f.w, f.h, 1);
    mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    seeds[i] = rng.f(0, 6.28);
    colours.push(f.c);
  });
  // the tricolour: paint the bands as vertex colours by row
  const rows = 10, per = 5;
  const base = geo.attributes.position.count;
  const cc = new Float32Array(base * 3);
  for (let row = 0; row < rows; row++) {
    for (let colI = 0; colI < per + 1; colI++) {
      const i = row * (per + 1) + colI;
      if (i >= base) break;
      const pal = colours[0];
      const band = pal[Math.min(pal.length - 1, Math.floor((row / rows) * pal.length))];
      _c.setHex(band);
      cc[i * 3] = _c.r; cc[i * 3 + 1] = _c.g; cc[i * 3 + 2] = _c.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  // per-instance tint instead of per-vertex rows would flatten the bands, so paint each flag's
  // instance white and let the shared vertex rows carry the first palette; the Hanseatic flags
  // get their own two-band geometry
  spots.forEach((f, i) => mesh.setColorAt(i, _c.setRGB(1, 1, 1)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const second = spots.some((f, i) => i > 0 && f.c !== spots[0].c);
  let mesh2 = null;
  if (second) {
    const geo2 = geo.clone();
    const cc2 = new Float32Array(geo2.attributes.position.count * 3);
    const pal = spots.find((f) => f.c !== spots[0].c).c;
    for (let row = 0; row < rows; row++) {
      for (let colI = 0; colI < per + 1; colI++) {
        const i = row * (per + 1) + colI;
        if (i >= cc2.length / 3) break;
        _c.setHex(pal[Math.min(pal.length - 1, Math.floor((row / rows) * pal.length))]);
        cc2[i * 3] = _c.r; cc2[i * 3 + 1] = _c.g; cc2[i * 3 + 2] = _c.b;
      }
    }
    geo2.setAttribute("color", new THREE.BufferAttribute(cc2, 3));
    mesh2 = new THREE.InstancedMesh(geo2, material.clone(), spots.length);
    mesh2.name = "flags2";
    let k = 0;
    spots.forEach((f, i) => {
      if (f.c === spots[0].c) return;
      _q.setFromEuler(new THREE.Euler(0, f.rot, 0));
      _v.set(f.x, f.y, f.z); _s.set(f.w, f.h, 1);
      mesh2.setMatrixAt(k++, _m.compose(_v, _q, _s));
    });
    mesh2.count = k;
    mesh2.instanceMatrix.needsUpdate = true;
  }

  const uniforms = { uTime: { value: 0 } };
  const rig = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float ph = position.y * 3.0 + uTime * 3.1;
         transformed.z += sin(ph) * 0.12 * (0.5 - position.y) * 1.4;
         transformed.x += sin(ph * 0.8 + 1.0) * 0.04;`);
    };
    m.customProgramCacheKey = () => "flag";
  };
  rig(material);

  const group = new THREE.Group();
  group.name = "flags";
  group.add(mesh);
  if (mesh2) { rig(mesh2.material); group.add(mesh2); }
  // the poles
  const PB = new Batch();
  const pole = drum(0.09, 0.07, 1, 6, 0.3, { top: false });
  const poleMesh = new THREE.InstancedMesh(PB.add("iron", pole, { color: col(0x2a2d31, 1) }) && PB.merged("iron"),
    new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.6, metalness: 0.4 }), spots.length);
  poleMesh.name = "flagpoles";
  spots.forEach((f, i) => {
    const ph = Math.max(0.6, f.pole || 1.2);
    _q.identity();
    _v.set(f.x - Math.sin(f.rot) * 0.05, f.y - ph / 2 + 0.2, f.z + Math.cos(f.rot) * 0.05);
    _s.set(1, ph, 1);
    poleMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  group.add(poleMesh);
  void seeds;
  return { group, uniforms };
}

// ============================================================================== assembly ======
/**
 * Everything that moves or lights up. `emitters` are the chimney tops collected while the houses
 * were built, so the smoke comes out of the fireplaces rather than out of the roofs.
 */
export function buildLife(city, tex, mats, { emitters = [], quality = "high", winter = false } = {}) {
  const _wc = new THREE.Color();
  const sea = buildSea(city.terr, { R: city.bounds.R });
  const smoke = buildSmoke(emitters.length ? emitters : [[0, 40, 0]], tex, "tallinn");
  const lanterns = buildLanterns(city, tex);
  const folk = buildFolk(city, quality);
  const market = buildMarket(city, tex, winter);
  const flags = buildFlags(city);

  const group = new THREE.Group();
  group.name = "life";
  group.add(sea.mesh, smoke.points, lanterns.group);
  if (folk) { group.add(folk.mesh); if (folk.cartMesh) group.add(folk.cartMesh); group.add(folk.birds); }
  if (market) group.add(market.group);
  if (flags) group.add(flags.group);

  let night = 0;
  return {
    group, folk, market, sea, smoke, lanterns, flags,
    get folkCount() { return folk?.folk.length ?? 0; },
    setNight(v) {
      night = v;
      sea.uniforms.uNight.value = v;
      smoke.uniforms.uNight.value = v;
      lanterns.haloMat.opacity = Math.min(1, v * 1.25);
      lanterns.group.visible = v > 0.02 || true;
      if (market) {
        market.candleMat.opacity = Math.min(1, v * 1.3);
        const b = market.group.userData.baubles;
        if (b) b.material.opacity = Math.min(1, v * 1.4);
        const star = market.group.userData.star;
        if (star) star.material.color.setRGB(1, 0.88 * Math.max(0.35, v), 0.5 * Math.max(0.3, v));
      }
      void mats;
    },
    setWinter(v) {
      if (folk) folk.setWinter(v);
      smoke.uniforms.uDensity.value = v ? 1.5 : 1;
      if (market) market.group.visible = !!v;
    },
    setSun(dir, colour, intensity) {
      sea.uniforms.uSunDir.value.copy(dir).normalize();
      sea.uniforms.uSunCol.value.copy(colour).multiplyScalar(Math.min(1, intensity / 2.4));
    },
    setSky(colour) { sea.uniforms.uSky.value.copy(colour).lerp(_wc.setHex(0xffffff), 0.18); },
    update(dt, t) {
      sea.uniforms.uTime.value = t;
      smoke.uniforms.uTime.value = t;
      if (flags) flags.uniforms.uTime.value = t;
      if (folk) folk.update(dt, t);
      void night;
    },
  };
}
