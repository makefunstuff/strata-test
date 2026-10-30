// The living part of the diorama: water that moves, smoke that rises, windows that wake up when the
// sun goes down, and small folk walking the streets. Everything here is one InstancedMesh or one
// Points object, animated on the GPU where possible so a phone can hold the frame rate.
import * as THREE from "three";
import { box, drum, gableRoof, plane, spire, mat, col, Batch } from "./geo.js";
import { Rng } from "./rng.js";

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

// ----------------------------------------------------------------------------------------------
// the river
// ----------------------------------------------------------------------------------------------

function buildWater(city) {
  const width = city.river.width;
  const g = new THREE.BufferGeometry();
  {
    // A ribbon of our own: the across-stream coordinate is normalised so the shader can find the
    // banks, and each vertex carries the along-stream direction so the wave normals are built in
    // world space. The channel is cut to a fixed cross-section (see layout.js), so the surface is a
    // known height and the ribbon a constant width just under the wall: the river reads as a river,
    // and neither pinches, floods the fields or hangs in the air.
    const pts = city.river.pts, pos = [], uvs = [], along = [];
    const half = city.river.half;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      // the model is cut off at its rim, and the river is cut with it rather than poured over it
      if (Math.hypot(a.x, a.z) > city.outline(Math.atan2(a.z, a.x)) - 6) continue;
      if (Math.hypot(b.x, b.z) > city.outline(Math.atan2(b.z, b.x)) - 6) continue;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1e-4;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const ya = city.waterY(a.x, a.z), yb = city.waterY(b.x, b.z);
      const u0 = i * 0.35, u1 = (i + 1) * 0.35;      // along-stream u must advance across the quad,
      const ring = (p, y, u, w, v) => {                // or every segment renders as one flat tile
        const x = p.x + nx * w, z = p.z + nz * w;
        pos.push(x, y, z);
        uvs.push(u, v);
        along.push(ux, 0, uz);
      };
      const quad = [[a, ya, u0, half, 0], [a, ya, u0, -half, 1], [b, yb, u1, half, 0],
                    [b, yb, u1, half, 0], [a, ya, u0, -half, 1], [b, yb, u1, -half, 1]];
      for (const q of quad) ring(q[0], q[1], q[2], q[3], q[4]);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 3));
  }
  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(0x2a7488) },
    uDeep: { value: new THREE.Color(0x07202b) },
    uFoam: { value: new THREE.Color(0xc9dedd) },
    uSky: { value: new THREE.Color(0x9dc4e0) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    uSunCol: { value: new THREE.Color(0xfff2d6) },
    uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 aAlong;
      varying vec2 vUv; varying vec3 vAlong; varying vec3 vView;
      void main() {
        vUv = uv; vAlong = aAlong;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vView = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vAlong; varying vec3 vView;
      uniform float uTime, uNight;
      uniform vec3 uShallow, uDeep, uFoam, uSky, uSunDir, uSunCol;

      // three travelling wave trains with an analytic gradient: the normal comes out of the same
      // sines, so the surface shimmers per pixel without a derivative extension or extra geometry
      void waves(vec2 p, float t, out float h, out vec2 grad) {
        float a1 = dot(p, vec2(3.1, 0.7)) + t * 1.6;
        float a2 = dot(p, vec2(1.4, 2.6)) - t * 1.1;
        float a3 = dot(p, vec2(6.3, -1.3)) + t * 2.4;
        h = 0.55 * sin(a1) + 0.30 * sin(a2) + 0.15 * sin(a3);
        grad = 0.55 * cos(a1) * vec2(3.1, 0.7)
             + 0.30 * cos(a2) * vec2(1.4, 2.6)
             + 0.15 * cos(a3) * vec2(6.3, -1.3);
      }

      void main() {
        float across = vUv.y;
        float bank = smoothstep(0.0, 0.16, across) * smoothstep(1.0, 0.84, across);
        vec3 v = normalize(vView);
        vec3 al = normalize(vAlong);
        vec3 ac = normalize(vec3(-al.z, 0.0, al.x));
        vec2 p = vUv * vec2(5.5, 3.4) + vec2(-uTime * 0.5, uTime * 0.04);   // drifts downstream
        float h; vec2 gr;
        waves(p, uTime, h, gr);
        gr *= 0.25 + 0.75 * bank;                                              // flat against the banks
        vec3 n = normalize(vec3(0.0, 1.0, 0.0) - al * (gr.x * 0.09) - ac * (gr.y * 0.09));

        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
        vec3 body = mix(uDeep, uShallow, clamp(0.25 + 0.75 * bank, 0.0, 1.0));
        vec3 col = mix(body, uSky, clamp(fres * 0.5, 0.0, 0.46));
        col += uSunCol * max(dot(n, uSunDir), 0.0) * 0.08;
        vec3 hv = normalize(uSunDir + v);
        col += uSunCol * pow(max(dot(n, hv), 0.0), 90.0) * (0.85 - uNight * 0.5);
        col += uFoam * smoothstep(0.7, 1.0, h) * bank * 0.14;                   // crests catching light
        float foam = (1.0 - smoothstep(0.0, 0.16, bank)) * (0.5 + 0.5 * h);
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.42);
        col *= mix(1.0, 0.3, uNight);
        col = mix(col, uSky * 0.25, uNight * 0.35);
        gl_FragColor = vec4(col, mix(0.55, 0.9, fres) * (0.72 + 0.28 * bank));
      }`,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.name = "river";
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}

// ----------------------------------------------------------------------------------------------
// chimney smoke: all on the GPU, one draw call for the whole town's hearths
// ----------------------------------------------------------------------------------------------

function buildSmoke(city, tex) {
  const chimneys = city.chimneys;
  const per = 22;
  const n = chimneys.length * per;
  const origin = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  let i = 0;
  const rng = new Rng(city.seed + "/smoke");
  for (const ch of chimneys) {
    for (let k = 0; k < per; k++, i++) {
      origin[i * 3] = ch.x + rng.f(-0.25, 0.25);
      origin[i * 3 + 1] = ch.y + 0.35;
      origin[i * 3 + 2] = ch.z + rng.f(-0.25, 0.25);
      seed[i] = rng.f(0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(origin, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uTime: { value: 0 },
    uMap: { value: tex.smoke },
    uWind: { value: new THREE.Vector2(0.5, 0.22) },
    uNight: { value: 0 },
    uScale: { value: 120 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uScale;
      uniform vec2 uWind;
      varying float vFade; varying float vSeed;
      void main() {
        float life = fract(uTime * 0.055 + aSeed);
        float rise = life * (5.5 + aSeed * 4.0);
        vec3 p = position;
        p.y += rise;
        p.x += uWind.x * rise * (0.5 + aSeed) + sin(life * 6.0 + aSeed * 30.0) * 0.5;
        p.z += uWind.y * rise * (0.5 + aSeed) + cos(life * 5.0 + aSeed * 21.0) * 0.5;
        vFade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.35, 1.0, life));
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.2 + life * 6.0) * uScale / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uNight;
      varying float vFade; varying float vSeed;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        vec3 tint = mix(vec3(0.86, 0.85, 0.83), vec3(0.32, 0.33, 0.40), uNight);
        gl_FragColor = vec4(tint, t.a * vFade * 0.5);
        if (gl_FragColor.a < 0.01) discard;
      }`,
  });
  const points = new THREE.Points(g, material);
  points.name = "smoke";
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, uniforms };
}

// ----------------------------------------------------------------------------------------------
// windows, torches and other things that only show up after dark
// ----------------------------------------------------------------------------------------------

function buildGlow(city, tex) {
  const group = new THREE.Group();
  group.name = "glow";
  const quads = [];
  for (const w of city.windows) quads.push({ x: w.x, y: w.y, z: w.z, rot: w.rot, s: 1, warm: 1 });
  // torches at the gates and the market cross
  const torches = [];
  for (const g of city.gates) { torches.push({ x: g.x, y: g.z, z: 0 }); }
  const gateQuads = [];
  for (const g of city.gates) {
    const a = g.a;
    for (const side of [-1, 1]) {
      gateQuads.push({
        x: g.x + Math.cos(a + Math.PI / 2) * side * (g.road ? g.road.width / 2 + 1.2 : 3.2),
        y: city.height(g.x, g.z) + 4.4,
        z: g.z - Math.sin(a + Math.PI / 2) * side * (g.road ? g.road.width / 2 + 1.2 : 3.2),
        rot: a + Math.PI / 2, s: 1.9, warm: 0.6,
      });
    }
  }
  for (const t of gateQuads) quads.push(t);
  void torches;

  const geo = new THREE.PlaneGeometry(1.5, 1.6);
  const material = new THREE.MeshBasicMaterial({
    map: tex.glow, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, opacity: 0,
  });
  const mesh = new THREE.InstancedMesh(geo, material, quads.length);
  mesh.name = "glow:windows";
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  quads.forEach((w, i) => {
    _q.setFromEuler(new THREE.Euler(0, w.rot, 0));
    _s.set(w.s, w.s, w.s);
    mesh.setMatrixAt(i, _m.compose(_v.set(w.x, w.y, w.z), _q, _s));
    const heat = 0.9 + (i % 5) * 0.14;
    mesh.setColorAt(i, _c.setRGB(1 * heat, 0.62 * heat, 0.3 * heat));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
  return { group, material, count: quads.length };
}

// ----------------------------------------------------------------------------------------------
// small folk, carts and birds
// ----------------------------------------------------------------------------------------------

const CLOTH = [0x8c4a3c, 0x4a5f7a, 0x6a7a4a, 0x8a7a52, 0x5a4a6a, 0x9a6a3a, 0x3f5c50, 0x76424a];

function villagerGeo() {
  const B = new Batch();
  B.add("v", box(0.52, 1.05, 0.36, 0.5), { matrix: _m.compose(_v.set(0, 0.62, 0), _q.identity(), _s.set(1, 1, 1)), color: col(0xffffff, 1) });
  B.add("v", box(0.42, 0.5, 0.32, 0.5), { matrix: _m.compose(_v.set(0, 1.36, 0), _q.identity(), _s.set(1, 1, 1)), color: col(0xffffff, 0.72) });
  B.add("v", new THREE.SphereGeometry(0.2, 6, 4), { matrix: _m.compose(_v.set(0, 1.72, 0), _q.identity(), _s.set(1, 1, 1)), color: col(0xd8b184, 1) });
  B.add("v", drum(0.3, 0.24, 0.16, 7, 0.5), { matrix: _m.compose(_v.set(0, 1.9, 0), _q.identity(), _s.set(1, 1, 1)), color: col(0x4a3a28, 1) });
  return B.merged("v");
}

function buildFolk(city, mats) {
  const rng = new Rng(city.seed + "/folk");
  // folk keep to the diorama: a road that runs off the edge of the chunk would send them walking
  // down the cliff face, which reads as confetti rather than as citizens
  const onTop = (p) => Math.hypot(p.x, p.z) < city.outline(Math.atan2(p.z, p.x)) * 0.94;
  const paths = city.walkerPaths.map((w) => sampler(w.pts.filter(onTop))).filter((p) => p.total > 12);
  if (!paths.length) return null;
  const count = Math.min(120, Math.max(30, Math.round(city.houses.length * 1.6)));
  const geo = villagerGeo();
  const mesh = new THREE.InstancedMesh(geo, mats.cloth, count);
  mesh.castShadow = true;
  mesh.name = "folk";
  const folk = [];
  for (let i = 0; i < count; i++) {
    folk.push({
      path: paths[rng.i(0, paths.length - 1)],
      d: rng.f(0, 1) * 1000,
      speed: rng.f(0.9, 1.8) * (rng.chance(0.5) ? 1 : -1),
      side: rng.f(-1.1, 1.1),
      bob: rng.f(0, 6.28),
      gait: rng.f(4.5, 6.5),
      c: col(rng.pick(CLOTH), rng.f(0.8, 1.15)),
    });
    mesh.setColorAt(i, _c.setRGB(folk[i].c[0], folk[i].c[1], folk[i].c[2]));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // carts
  const cartPaths = city.cartPaths.map((c) => sampler(c.pts.filter(onTop))).filter((p) => p.total > 30);
  const carts = [];
  let cartMesh = null;
  if (cartPaths.length) {
    const B = new Batch();
    B.add("cart", box(2.2, 0.9, 1.5, 0.4), { matrix: _m.compose(_v.set(0, 1.0, 0), _q.identity(), _s.set(1, 1, 1)), color: col(0x6a4c30, 1) });
    B.add("cart", box(2.4, 0.22, 0.3, 0.4), { matrix: _m.compose(_v.set(-1.5, 1.15, 0), _q.identity(), _s.set(1, 1, 1)), color: col(0x53412c, 1) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = new THREE.TorusGeometry(0.5, 0.11, 4, 9);
      w.rotateY(Math.PI / 2);
      B.add("cart", w, { matrix: _m.compose(_v.set(sx * 0.7, 0.5, sz * 0.72), _q.identity(), _s.set(1, 1, 1)), color: col(0x3b2c1c, 1) });
    }
    const cg = B.merged("cart");
    const n = Math.min(6, cartPaths.length * 2);
    cartMesh = new THREE.InstancedMesh(cg, mats.wood0, n);
    cartMesh.castShadow = true;
    cartMesh.name = "carts";
    for (let i = 0; i < n; i++) {
      carts.push({ path: cartPaths[i % cartPaths.length], d: rng.f(0, 1) * 1000, speed: rng.f(1.6, 2.6) * (rng.chance(0.5) ? 1 : -1) });
    }
  }

  // birds
  const birdGeo = (() => {
    const B = new Batch();
    const wing = new THREE.BufferGeometry();
    wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1.1, 0.25, -0.35, 1.1, 0.25, 0.35, 0, 0, 0, -1.1, 0.25, -0.35, -1.1, 0.25, 0.35], 3));
    wing.computeVertexNormals();
    B.add("bird", wing, { color: col(0x2b2f38, 1) });
    return B.merged("bird");
  })();
  const nBirds = 26;
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 1, side: THREE.DoubleSide }), nBirds);
  birds.name = "birds";
  const flock = [];
  for (let i = 0; i < nBirds; i++) {
    flock.push({ r: rng.f(38, city.R * 0.85), a: rng.f(0, 6.28), y: rng.f(24, 52), w: rng.f(0.06, 0.16) * (rng.chance(0.5) ? 1 : -1), ph: rng.f(0, 6.28), s: rng.f(0.45, 0.8) });
  }

  return {
    mesh, folk, cartMesh, carts, birds, flock,
    update(dt, t) {
      for (let i = 0; i < folk.length; i++) {
        const f = folk[i];
        f.d += f.speed * dt;
        const p = f.path.at(f.d);
        const off = f.side;
        const x = p.x - p.uz * off, z = p.z + p.ux * off;
        const y = city.height(x, z);
        const bobY = Math.abs(Math.sin(t * f.gait * 0.5 + f.bob)) * 0.09;
        _q.setFromAxisAngle(UP, Math.atan2(p.ux * Math.sign(f.speed), p.uz * Math.sign(f.speed)));
        _v.set(x, y + bobY - 0.05, z);
        _s.set(1, 1, 1);
        mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (cartMesh) {
        for (let i = 0; i < carts.length; i++) {
          const c = carts[i];
          c.d += c.speed * dt;
          const p = c.path.at(c.d);
          const y = city.height(p.x, p.z);
          _q.setFromAxisAngle(UP, Math.atan2(p.ux * Math.sign(c.speed), p.uz * Math.sign(c.speed)));
          _v.set(p.x, y - 0.05, p.z);
          _s.set(1, 1, 1);
          cartMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
        }
        cartMesh.instanceMatrix.needsUpdate = true;
      }
      if (birds.visible) {
        for (let i = 0; i < flock.length; i++) {
          const b = flock[i];
          b.a += b.w * dt;
          const flap = Math.sin(t * 7 + b.ph) * 0.5;
          _e.set(flap * 0.6, b.a + Math.PI / 2, Math.sin(b.a * 2) * 0.25 + flap * 0.4, "YXZ");
          _q.setFromEuler(_e);
          _v.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.6 + b.ph) * 2.5, Math.sin(b.a) * b.r);
          _s.set(b.s, b.s, b.s);
          birds.setMatrixAt(i, _m.compose(_v, _q, _s));
        }
        birds.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// ----------------------------------------------------------------------------------------------
// banners: cloth that will not stop moving in the wind
// ----------------------------------------------------------------------------------------------

function buildBanners(city, tex) {
  const spots = [];
  const rng = new Rng(city.seed + "/banner");
  const BANNER = [0x9c3b34, 0x2f5a7c, 0x3f6a44, 0x8a6a2f, 0x6a3f6a];
  for (const g of city.gates) {
    const a = g.a;
    for (const side of [-1, 1]) {
      spots.push({
        x: g.x + Math.cos(a + Math.PI / 2) * side * (g.road ? g.road.width / 2 + 2.6 : 4),
        y: city.height(g.x, g.z) + 9.4,
        z: g.z - Math.sin(a + Math.PI / 2) * side * (g.road ? g.road.width / 2 + 2.6 : 4),
        rot: a, w: 1.5, h: 3.4, c: rng.pick(BANNER),
      });
    }
  }
  for (const h of city.houses) {
    if (!rng.chance(0.13)) continue;
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    spots.push({
      x: h.x - s * (h.d / 2 + 0.28) + (rng.f(-1, 1)) * c,
      y: h.y + h.floors * 2.2 + 0.5,
      z: h.z + c * (h.d / 2 + 0.28) + (rng.f(-1, 1)) * s,
      rot: h.rot, w: rng.f(0.7, 1.1), h: rng.f(1.6, 2.6), c: rng.pick(BANNER),
    });
  }
  if (!spots.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1, 3, 7);
  geo.translate(0, -0.5, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  mesh.castShadow = true;
  mesh.name = "banners";
  const seeds = new Float32Array(spots.length);
  spots.forEach((b, i) => {
    _q.setFromEuler(new THREE.Euler(0, b.rot, 0));
    _v.set(b.x, b.y, b.z);
    _s.set(b.w, b.h, 1);
    mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    mesh.setColorAt(i, _c.set(...col(b.c, rng.f(0.85, 1.1))));
    seeds[i] = rng.f(0, 6.28);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  const uniforms = { uTime: { value: 0 } };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = "attribute float aSeed; uniform float uTime;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float ph = position.y * 2.2 + uTime * 2.4 + aSeed;
       transformed.z += sin(ph) * 0.13 * (0.35 - position.y) * 1.6;
       transformed.x += sin(ph * 0.7) * 0.05 * (0.4 - position.y);`);
  };
  material.customProgramCacheKey = () => "banner";
  return { mesh, uniforms };
}

// ----------------------------------------------------------------------------------------------

export function buildLife(city, tex, mats) {
  const _wc = new THREE.Color();
  const water = buildWater(city);
  const smoke = buildSmoke(city, tex);
  const glow = buildGlow(city, tex);
  const folk = buildFolk(city, mats);
  const banners = buildBanners(city, tex);
  const group = new THREE.Group();
  group.name = "life";
  group.add(water.mesh, smoke.points, glow.group);
  if (folk) { group.add(folk.mesh); if (folk.cartMesh) group.add(folk.cartMesh); group.add(folk.birds); }
  if (banners) group.add(banners.mesh);
  return {
    group, folk,
    setNight(v) {
      glow.material.opacity = v;
      glow.group.visible = v > 0.02;
      smoke.uniforms.uNight.value = v;
      water.uniforms.uNight.value = v;
    },
    // the river is lit by the same sun as everything else, and mirrors the sky it is under
    setSun(dir, colour, intensity) {
      water.uniforms.uSunDir.value.copy(dir).normalize();
      water.uniforms.uSunCol.value.copy(colour).multiplyScalar(Math.min(1, intensity / 2.4));
    },
    setSky(colour) { water.uniforms.uSky.value.copy(colour).lerp(_wc.setHex(0xffffff), 0.15); },
    update(dt, t) {
      water.uniforms.uTime.value = t;
      smoke.uniforms.uTime.value = t;
      if (banners) banners.uniforms.uTime.value = t;
      if (folk) folk.update(dt, t);
    },
  };
}
