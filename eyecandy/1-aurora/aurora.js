// The aurora itself: a night sky with procedural stars and a Milky Way, additive light curtains
// that wave and ray, a moon, silhouette ridgelines and pines, and a planar mirror — the lake
// samples a second render of the world from below, distorted by ripples and mixed with frost.
import * as THREE from "three";
import { GLSL, sparkleField } from "../shared/candy.js";

// -----------------------------------------------------------------------------------------------
// night sky: gradient + three star layers + a Milky Way band + the moon
// -----------------------------------------------------------------------------------------------
export function nightSky(scene, { radius = 320, moon = new THREE.Vector3(-0.42, 0.26, -0.87) } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color(0x03060f) },
      uMid: { value: new THREE.Color(0x061327) },
      uHorizon: { value: new THREE.Color(0x0a2a3c) },
      uStars: { value: 1 },
      uMilky: { value: 0.85 },
      uMoon: { value: moon.clone().normalize() },
      uMoonColor: { value: new THREE.Color(0xdfeaff) },
      uMoonSize: { value: 0.026 },
      uMoonGlow: { value: 0.5 },
      uBand: { value: new THREE.Vector3(0.35, 0.82, -0.45).normalize() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL + /* glsl */`
      precision highp float;
      uniform float uTime, uStars, uMilky, uMoonSize, uMoonGlow;
      uniform vec3 uZenith, uMid, uHorizon, uMoon, uMoonColor, uBand;
      varying vec3 vDir;

      // one star layer: cells on the projected hemisphere, hash decides who is a star
      float starLayer(vec2 p, float cell, float thr, float t, float seed){
        vec2 g = p / cell, i = floor(g), f = fract(g);
        float h = hash21(i + seed);
        if (h < thr) return 0.0;
        vec2 off = hash22(i + seed * 1.7);
        vec2 q = f - off;
        float d = length(q);
        float size = 0.012 + 0.16 * pow(hash21(i * 1.31 + seed), 5.0);
        float core = smoothstep(size, 0.0, d);
        float tw = 0.6 + 0.4 * sin(t * (0.9 + 3.0 * hash21(i * 2.7 + seed)) + h * TAU);
        float br = hash21(i * 5.3 + seed);
        // a four-point spike, but only on the brightest handful, and thin
        float spike = smoothstep(0.06, 0.0, abs(q.x)) * smoothstep(0.006, 0.0, abs(q.y))
                    + smoothstep(0.06, 0.0, abs(q.y)) * smoothstep(0.006, 0.0, abs(q.x));
        return (core * core * 1.35 + spike * 0.22 * step(0.985, br)) * tw * (0.35 + 0.65 * br);
      }

      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        vec3 c = mix(uMid, uZenith, pow(clamp(h, 0.0, 1.0), 0.62));
        c = mix(uHorizon, c, smoothstep(-0.02, 0.34, h));
        c += uHorizon * 0.30 * pow(clamp(1.0 - abs(h) * 3.4, 0.0, 1.0), 2.0);

        // stars, only above the horizon; stereographic projection keeps them round overhead
        if (h > 0.005) {
          vec2 p = d.xz / (d.y + 0.35);
          float s = 0.0;
          s += starLayer(p, 0.016, 0.955, uTime, 3.1) * 1.00;
          s += starLayer(p, 0.0075, 0.940, uTime, 7.7) * 0.55;
          s += starLayer(p, 0.0032, 0.915, uTime, 1.9) * 0.26;
          vec3 warm = mix(vec3(1.0, 0.86, 0.72), vec3(0.74, 0.86, 1.0), hash21(floor(p / 0.016) + 2.2));
          c += warm * s * uStars * smoothstep(0.0, 0.16, h) * 0.85;

          // the galaxy: a band along a tilted great circle, dust-noised
          float b = 1.0 - abs(dot(d, normalize(uBand)));
          float band = pow(clamp(b, 0.0, 1.0), 26.0);
          vec3 bp = d * 5.0 + vec3(0.0, uTime * 0.005, 0.0);
          float dust = fbm3(bp * 1.4) * 0.75 + 0.35;
          float rib = ridge2(vec2(atan(d.z, d.x) * 2.4, d.y * 3.0 - uTime * 0.01)) * 0.6 + 0.4;
          c += vec3(0.34, 0.40, 0.66) * band * dust * rib * uMilky * 0.55;
          c += vec3(0.9, 0.85, 1.0) * band * dust * uMilky
               * starLayer(p, 0.0055, 0.88, uTime, 5.5) * 0.7;
        }

        // the moon: a tight disc with limb darkening, a narrow halo and a very wide faint glow
        float sd = clamp(dot(d, normalize(uMoon)), -1.0, 1.0);
        float ang = acos(sd);
        float r = uMoonSize * 0.10;
        float disc = smoothstep(r * 1.30, r * 0.86, ang);
        float limb = smoothstep(0.0, r, r * 1.2 - ang) * 0.55;
        c += uMoonColor * disc * (0.95 - 0.45 * limb);
        c += uMoonColor * exp(-ang * 26.0) * 0.20 * uMoonGlow;
        c += uMoonColor * exp(-ang * 4.5) * 0.045 * uMoonGlow;
        c += uMoonColor * exp(-ang * 1.2) * 0.012 * uMoonGlow;

        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.name = "sky";
  mesh.renderOrder = -10;
  scene.add(mesh);
  return { mesh, material: mat, uniforms: mat.uniforms };
}

// -----------------------------------------------------------------------------------------------
// the curtains
// -----------------------------------------------------------------------------------------------
export const PALETTES = {
  "green veil": { foot: 0xff4f8e, low: 0x46ffa8, high: 0x1fd6ff, spill: 0x1c7f6a },
  "crimson rim": { foot: 0xff3355, low: 0xff8a4c, high: 0xffd166, spill: 0x8f2f3a },
  "violet corona": { foot: 0xb04dff, low: 0x6a7bff, high: 0x39e6ff, spill: 0x3a2f8f },
  "emerald fire": { foot: 0x2fff9e, low: 0xb6ff5c, high: 0xeaffff, spill: 0x1f7a4a },
  "ice blue": { foot: 0x36c8ff, low: 0x9be8ff, high: 0xffffff, spill: 0x1b5f8f },
};

export class Aurora {
  constructor(scene, { count = 7, radius = 150, height = 130, len = 260, palette = "green veil" } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "aurora";
    scene.add(this.group);
    this.P = {
      count, radius, height, len,
      activity: 1, flow: 0.055, rayFreq: 1, softness: 1.15, twist: 0.45,
      foot: 0.20, arc: 0.62, spread: 1, shimmer: 0.75, corona: 0.25,
    };
    this.paletteName = palette;
    this.setPalette(palette);
    this.build(count);
  }

  setPalette(name) {
    const p = PALETTES[name] ?? PALETTES["green veil"];
    this.paletteName = PALETTES[name] ? name : "green veil";
    const foot = new THREE.Color(p.foot), low = new THREE.Color(p.low), high = new THREE.Color(p.high);
    this.spill = new THREE.Color(p.spill);
    for (const c of this.curtains ?? []) {
      c.material.uniforms.uFoot.value.copy(foot);
      c.material.uniforms.uLow.value.copy(low);
      c.material.uniforms.uHigh.value.copy(high);
    }
    return this.spill;
  }

  build(count = this.P.count) {
    for (const c of this.curtains ?? []) {
      this.group.remove(c);
      c.geometry.dispose(); c.material.dispose();
    }
    this.P.count = count;
    this.curtains = [];
    const { len, height, radius } = this.P;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const az = -1.15 + t * 2.6 + (hash(i) - 0.5) * 0.35;
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, fog: false,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: hash(i) * 40 },
          uActivity: { value: 1 },
          uFlow: { value: 0.055 },
          uRayFreq: { value: 1 },
          uSoft: { value: 1.15 },
          uTwist: { value: 0.45 },
          uFoot: { value: new THREE.Color(0xff4f8e) },
          uLow: { value: new THREE.Color(0x46ffa8) },
          uHigh: { value: new THREE.Color(0x1fd6ff) },
          uArc: { value: 0.62 },
          uShimmer: { value: 0.75 },
          uCorona: { value: 0.25 },
        },
        vertexShader: GLSL + /* glsl */`
          uniform float uTime, uSeed, uFlow, uTwist;
          varying vec2 vUv; varying float vFlick;
          void main(){
            vUv = uv;
            vec3 p = position;
            float t = uTime * uFlow + uSeed;
            // the whole curtain breathes side to side and sways in and out of the page
            float w = sin(uv.x * 3.1 + t * 1.7 + uSeed) * 0.5 + sin(uv.x * 7.3 - t * 1.1) * 0.25;
            p.z += w * 16.0 * uv.y * uTwist;
            p.x += sin(t * 0.9 + uv.y * 2.0 + uSeed) * 6.0 * uTwist;
            p.y += sin(uv.x * 5.0 + t * 1.3) * 4.5 * uv.y;
            vFlick = 0.82 + 0.18 * sin(t * 6.0 + uv.x * 11.0 + uSeed);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: GLSL + /* glsl */`
          precision highp float;
          uniform float uTime, uSeed, uActivity, uFlow, uRayFreq, uSoft, uArc, uShimmer, uCorona;
          uniform vec3 uFoot, uLow, uHigh;
          varying vec2 vUv; varying float vFlick;
          void main(){
            float u = vUv.x, v = vUv.y;
            float t = uTime * uFlow + uSeed;

            // the rays ARE the curtain: thin, sharp in u, stretched in v
            float rays = ridge2(vec2(u * 34.0 * uRayFreq + t * 0.9, t * 0.5 - v * 0.7));
            rays = pow(clamp(rays, 0.0, 1.0), 2.3);
            // the body: domain-warped fbm drifting upward, thresholded so it breaks into arcs
            vec2 q = vec2(u * 4.6 + t * 0.6, v * 1.9 - t * 1.15);
            float body = fbm2(warp2(q, t * 0.4, 0.85));
            float band = smoothstep(0.34, 0.76, body);
            // feet bright and low, rays stretching up and thinning out
            float foot = smoothstep(0.0, 0.055, v) * pow(1.0 - v, 1.22);
            float leg = rays * smoothstep(0.02, 0.62, v) * pow(1.0 - v, 0.55);
            float a = band * foot * (0.42 + 1.45 * rays) + leg * band * 0.85;
            a *= smoothstep(0.0, 0.10, u) * smoothstep(0.0, 0.10, 1.0 - u);      // soft ends
            a *= 0.72 + 0.28 * (0.5 + 0.5 * sin(u * TAU * 3.1 + t * 2.1));       // beading
            a *= uActivity * vFlick;

            float hi = smoothstep(0.18, 0.92, v);
            vec3 c = mix(uFoot, uLow, smoothstep(0.0, 0.30, v));
            c = mix(c, uHigh, hi * hi);
            c *= 0.62 + 1.35 * a;
            // a thin hot line along the foot, and a faint high corona
            c += uLow * pow(smoothstep(0.11, 0.0, v) * band, 2.0) * 1.1;
            c += uHigh * uCorona * pow(smoothstep(0.62, 1.0, v) * rays, 2.0) * 0.7;

            a = pow(clamp(a, 0.0, 1.0), uSoft) * uArc;
            a *= 0.7 + 0.3 * (0.5 + 0.5 * sin(u * 40.0 + t * 8.0)) * uShimmer;
            if (a < 0.003) discard;
            gl_FragColor = vec4(softclip(c * a * 1.5), a);
          }`,
      });
      const geo = new THREE.PlaneGeometry(len * (0.7 + hash(i * 3.1) * 0.6), height * (0.72 + hash(i * 7.7) * 0.5), 72, 26);
      const m = new THREE.Mesh(geo, mat);
      const r = radius * (0.62 + hash(i * 2.3) * 0.7);
      m.position.set(Math.sin(az) * r, height * 0.30 + hash(i * 5.5) * 22, -Math.cos(az) * r * 0.92);
      m.rotation.y = az + (hash(i * 1.7) - 0.5) * 0.5;
      m.rotation.x = (hash(i * 4.4) - 0.5) * 0.10;
      m.renderOrder = 2 + i;
      m.frustumCulled = false;
      this.group.add(m);
      this.curtains.push(m);
    }
    // one shared fill pass keeps the sky lit under the arcs
    return this.curtains;
  }

  update(time, { activity = 1, flow, rayFreq, softness, twist, arc, shimmer, corona } = {}) {
    for (const c of this.curtains) {
      const u = c.material.uniforms;
      u.uTime.value = time;
      u.uActivity.value = this.P.activity * activity;
      if (flow !== undefined) u.uFlow.value = this.P.flow = flow;
      if (rayFreq !== undefined) u.uRayFreq.value = this.P.rayFreq = rayFreq;
      if (softness !== undefined) u.uSoft.value = this.P.softness = softness;
      if (twist !== undefined) u.uTwist.value = this.P.twist = twist;
      if (arc !== undefined) u.uArc.value = this.P.arc = arc;
      if (shimmer !== undefined) u.uShimmer.value = this.P.shimmer = shimmer;
      if (corona !== undefined) u.uCorona.value = this.P.corona = corona;
    }
  }
}

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// -----------------------------------------------------------------------------------------------
// the lake: a planar mirror rendered from below, then frost, cracks and moon glint on top
// -----------------------------------------------------------------------------------------------
export class IceLake {
  constructor(scene, { size = 900, res = 0.5 } = {}) {
    this.scene = scene;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true });
    this.mirrorCam = new THREE.PerspectiveCamera(52, 1, 0.1, 1200);
    this.enabled = true;
    this.scale = res;
    const mat = new THREE.ShaderMaterial({
      transparent: false, fog: false,
      uniforms: {
        tMirror: { value: this.rt.texture },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMirror: { value: 1 },
        uRipple: { value: 1 },
        uFrost: { value: 0.55 },
        uCrack: { value: 1 },
        uGlint: { value: 0.9 },
        uMoon: { value: new THREE.Vector3(-0.42, 0.26, -0.87).normalize() },
        uIce: { value: new THREE.Color(0x0d2233) },
        uDeep: { value: new THREE.Color(0x050c16) },
        uCam: { value: new THREE.Vector3() },
      },
      vertexShader: GLSL + /* glsl */`
        varying vec3 vW; varying vec4 vScr;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          gl_Position = projectionMatrix * mv;
          vScr = gl_Position;
        }`,
      fragmentShader: GLSL + /* glsl */`
        precision highp float;
        uniform sampler2D tMirror;
        uniform float uTime, uRes, uMirror, uRipple, uFrost, uCrack, uGlint;
        uniform vec3 uMoon, uIce, uDeep, uCam;
        varying vec3 vW; varying vec4 vScr;

        float voronoi(vec2 p){
          vec2 i = floor(p), f = fract(p), best = vec2(9.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 r = o + hash22(i + o) - f;
            if (dot(r, r) < dot(best, best)) best = r;
          }
          return length(best);
        }

        void main(){
          vec2 scr = (vScr.xy / vScr.w) * 0.5 + 0.5;
          float dist = length(vW.xz - uCam.xz);
          float grain = 1.0 / (1.0 + dist * 0.010);

          // ripples: two crossing fbm flows, stronger near the shore, sharper far away
          vec2 p = vW.xz * 0.018;
          float t = uTime * 0.06;
          vec2 rr = vec2(fbm2(p + vec2(t, -t * 0.7)) - 0.5, fbm2(p * 1.3 + vec2(-t * 0.8, t)) - 0.5);
          float swell = fbm2(p * 0.45 + t * 0.4);
          vec2 warp = rr * (0.020 + 0.030 * swell) * uRipple * (1.0 - 0.55 * grain);
          vec2 suv = clamp(scr + warp, vec2(0.001), vec2(0.999));
          vec3 refl = texture2D(tMirror, suv).rgb;

          // the ice body: pale blue over black depth, pressure cracks, frost blooms
          float cr = 1.0 - smoothstep(0.0, 0.055, voronoi(vW.xz * 0.035));
          cr += 0.6 * pow(1.0 - smoothstep(0.0, 0.02, voronoi(vW.xz * 0.11 + 4.0)), 3.0);
          float frost = smoothstep(0.42, 0.92, fbm2(vW.xz * 0.05 + 3.1)) * uFrost;
          vec3 body = mix(uDeep, uIce, 0.35 + 0.65 * fbm2(vW.xz * 0.02));
          body += vec3(0.30, 0.46, 0.62) * cr * 0.35 * uCrack;
          body += vec3(0.42, 0.56, 0.72) * frost * 0.28;

          // grazing angles take the mirror; straight down takes the ice
          vec3 v = normalize(uCam - vW);
          float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 3.2);
          vec3 c = mix(body, refl * uMirror, clamp(0.16 + fres * 1.25, 0.0, 1.0));

          // moon glint: a long specular path down the mirror, broken by the ripple field
          vec3 hv = normalize(normalize(uMoon) + v);
          float spec = pow(max(dot(vec3(0.0, 1.0, 0.0), hv), 0.0), 180.0);
          float path = exp(-pow(abs(dot(normalize(vec2(uMoon.x, uMoon.z)), normalize(vW.xz - uCam.xz + 1e-4))), 2.0) * 5.0);
          c += vec3(0.85, 0.92, 1.0) * spec * uGlint * 2.2 * (0.35 + 0.65 * frost) * path;
          float sparkle = pow(hash21(floor(vW.xz * 2.2) + floor(uTime * 6.0) * 0.37), 46.0);
          c += vec3(0.9, 0.97, 1.0) * sparkle * uGlint * 0.9 * (0.25 + frost);

          // the far shore dissolves into the horizon haze
          c = mix(c, vec3(0.035, 0.075, 0.115), smoothstep(120.0, 430.0, dist) * 0.85);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = "ice";
    scene.add(mesh);
    this.mesh = mesh;
    this.material = mat;
    this.uniforms = mat.uniforms;
  }

  setSize(w, h, dpr) {
    const W = Math.max(64, Math.round(w * this.scale * dpr)), H = Math.max(64, Math.round(h * this.scale * dpr));
    if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
    this.uniforms.uRes.value.set(W, H);
  }

  /** Reflect the camera in y=0 and re-render the world (minus the lake) into the mirror target. */
  renderMirror(renderer, scene, camera, hide = []) {
    if (!this.enabled) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); dir.y *= -1;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion); up.y *= -1;
    const mc = this.mirrorCam;
    mc.position.set(camera.position.x, -camera.position.y, camera.position.z);
    mc.up.copy(up);
    mc.near = camera.near; mc.far = camera.far; mc.fov = camera.fov; mc.aspect = camera.aspect;
    mc.updateProjectionMatrix();
    mc.lookAt(mc.position.clone().add(dir));
    mc.updateMatrixWorld();
    for (const o of hide) o.visible = false;
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, mc);
    renderer.setRenderTarget(target);
    for (const o of hide) o.visible = true;
    this.uniforms.tMirror.value = this.rt.texture;
  }
}

// -----------------------------------------------------------------------------------------------
// silhouettes: a jagged ridgeline and a few pines on the near shore — without them the picture
// has no scale and the reflection has nothing to hold
// -----------------------------------------------------------------------------------------------
export function ridgeline(scene, { radius = 175, height = 34, seed = 1, color = 0x050b14 } = {}) {
  const pts = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const a = -1.5 + (i / N) * 3.0;
    const r = radius * (1 + 0.12 * Math.sin(i * 0.7 + seed));
    const hump = Math.pow(Math.max(0, Math.sin((i / N) * Math.PI)), 0.6);
    const n = (hash(i * 1.37 + seed * 9.1) * 0.55 + hash(i * 3.71 + seed) * 0.45);
    const y = height * hump * (0.35 + 0.9 * Math.pow(n, 1.6)) * (1 + 0.5 * Math.sin(i * 0.19 + seed));
    pts.push(new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r));
    pts.push(new THREE.Vector3(Math.sin(a) * r, y, -Math.cos(a) * r));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const pos = geo.attributes.position.array;
  const idx = [];
  for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g2.setIndex(idx);
  const mesh = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color, fog: false }));
  mesh.name = "ridge";
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

export function pines(scene, { count = 14, dist = 46, arc = 2.5, offset = -1.25, color = 0x03070e, snow = 0x9fc4e8 } = {}) {
  const g = new THREE.Group();
  g.name = "pines";
  // groves: an array of {at, n} clusters, or one cluster across the whole arc
  const groves = Array.isArray(arguments[0]?.groves) ? arguments[0].groves : null;
  const trunkMat = new THREE.MeshBasicMaterial({ color, fog: false });
  const capMat = new THREE.MeshBasicMaterial({ color: 0x16283a, fog: false });
  for (let i = 0; i < count; i++) {
    const a = offset + (i / Math.max(1, count - 1)) * arc + (hash(i * 5.1) - 0.5) * 0.14;
    const d = dist * (0.72 + hash(i * 3.3) * 0.75);
    const h = 9 + hash(i * 2.2) * 13;
    const tree = new THREE.Group();
    const tiers = 3 + Math.floor(hash(i * 6.6) * 2);
    for (let t = 0; t < tiers; t++) {
      const k = t / tiers;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.30 - 0.19 * k) * 1.15, h * 0.42, 8), trunkMat);
      cone.position.y = h * (0.16 + 0.26 * t);
      tree.add(cone);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(h * (0.30 - 0.19 * k) * 0.86, h * 0.12, 8), capMat);
      cap.position.y = cone.position.y + h * 0.16;
      tree.add(cap);
    }
    tree.position.set(Math.sin(a) * d, -0.2, -Math.cos(a) * d);
    tree.rotation.y = hash(i) * 6.283;
    tree.userData.sway = hash(i * 9.9) * 6.283;
    g.add(tree);
  }
  scene.add(g);
  return g;
}

export function snowfall(scene, { count = 900, area = 90 } = {}) {
  const f = sparkleField({ count, radius: area * 0.5, size: [1.0, 2.6], cols: ["#ffffff", "#dceaff", "#bfe0ff"], drift: 1 });
  f.points.position.y = area * 0.28;
  f.points.name = "snow";
  scene.add(f.points);
  const pos = f.points.geometry.attributes.position;
  const vel = new Float32Array(count);
  for (let i = 0; i < count; i++) vel[i] = 0.5 + Math.random() * 1.6;
  let t = 0;
  return {
    points: f.points, material: f.material,
    set count(v) { f.points.geometry.setDrawRange(0, v); },
    get count() { return Math.min(f.count, count); },
    update(dt) {
      t += dt;
      const a = pos.array;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        a[k + 1] -= vel[i] * dt * 2.2;
        a[k] += Math.sin(t * 0.6 + i) * dt * 0.5;
        a[k + 2] += Math.cos(t * 0.5 + i * 1.3) * dt * 0.4;
        if (a[k + 1] < -area * 0.26) {
          a[k + 1] = area * 0.3;
          a[k] = (Math.random() - 0.5) * area;
          a[k + 2] = (Math.random() - 0.5) * area;
        }
      }
      pos.needsUpdate = true;
      f.material.uniforms.uTime.value = t;
    },
  };
}
