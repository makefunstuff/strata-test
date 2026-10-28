// Eye candy 3 — Nebula. Two hundred thousand points of glowing dust, positioned entirely on the GPU
// from a per-particle seed: a shell distribution, differential spin (the inside turns faster, so the
// dust shears into spiral arms), a three-tap value-noise displacement that pulls it into filaments,
// and a cosine palette driven by radius and density. Nothing is updated on the CPU except time.
import * as THREE from "three";
import { GLSL, createCandy, gradePass, snap } from "../shared/candy.js";

export const THEMES = {
  orion: { a: [0.12, 0.22, 0.38], b: [0.45, 0.42, 0.35], c: [1.0, 1.0, 0.9], d: [0.00, 0.15, 0.35], core: "#fff2d0", halo: "#3fd0ff" },
  rose: { a: [0.30, 0.10, 0.22], b: [0.52, 0.34, 0.38], c: [1.0, 0.9, 0.8], d: [0.10, 0.62, 0.32], core: "#ffe3f2", halo: "#ff5ea8" },
  emerald: { a: [0.06, 0.24, 0.20], b: [0.34, 0.52, 0.42], c: [1.0, 1.0, 0.8], d: [0.00, 0.28, 0.62], core: "#eaffe8", halo: "#43ffc0" },
  ember: { a: [0.32, 0.10, 0.04], b: [0.58, 0.38, 0.22], c: [1.0, 0.85, 0.6], d: [0.02, 0.14, 0.28], core: "#fff0d8", halo: "#ff7a2f" },
  ice: { a: [0.08, 0.14, 0.30], b: [0.40, 0.46, 0.60], c: [0.9, 1.0, 1.0], d: [0.20, 0.38, 0.58], core: "#f0faff", halo: "#7fd8ff" },
  violet: { a: [0.22, 0.07, 0.34], b: [0.48, 0.34, 0.58], c: [1.0, 0.95, 0.85], d: [0.30, 0.05, 0.55], core: "#f6e8ff", halo: "#b45cff" },
};

const MAX = 300000;

export function nebula({ count = 180000, spread = 34, theme = "orion" } = {}) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(MAX * 4), rnd = new Float32Array(MAX * 4);
  for (let i = 0; i < MAX; i++) {
    // a shell that is dense in the middle and thin at the edge, flattened into a disc
    const u = Math.random(), v = Math.random(), w = Math.random(), q = Math.random();
    const th = u * Math.PI * 2, cp = Math.acos(2 * v - 1);
    const arm = Math.floor(q * 3) / 3;                        // three preferred azimuths → arms
    const th2 = q < 0.72 ? arm * Math.PI * 2 / 3 + (w - 0.5) * 0.42 : th;
    seed[i * 4] = Math.sin(cp) * Math.cos(th2);
    seed[i * 4 + 1] = Math.cos(cp) * 0.42;                     // squash the sphere into a disc
    seed[i * 4 + 2] = Math.sin(cp) * Math.sin(th2);
    seed[i * 4 + 3] = Math.pow(v, 0.55);                       // radius factor
    rnd[i * 4] = w; rnd[i * 4 + 1] = Math.random(); rnd[i * 4 + 2] = Math.random(); rnd[i * 4 + 3] = Math.random();
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); // unused, but three wants it
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  g.setDrawRange(0, count);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

  const t0 = THEMES[theme];
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSpread: { value: spread },
      uFlow: { value: 0.055 },
      uFreq: { value: 0.055 },
      uAmp: { value: 9 },
      uSpin: { value: 0.16 },
      uSize: { value: 2.4 },
      uBright: { value: 1 },
      uFilament: { value: 0.8 },
      uCore: { value: new THREE.Color(t0.core) },
      uHalo: { value: new THREE.Color(t0.halo) },
      uPalA: { value: new THREE.Vector3(...t0.a) },
      uPalB: { value: new THREE.Vector3(...t0.b) },
      uPalC: { value: new THREE.Vector3(...t0.c) },
      uPalD: { value: new THREE.Vector3(...t0.d) },
      uHue: { value: 0 },
      uBlastT: { value: -99 },
      uBlastK: { value: 1 },
      uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) },
      uTwinkle: { value: 0.5 },
    },
    vertexShader: GLSL + /* glsl */`
      attribute vec4 aSeed, aRnd;
      uniform float uTime, uSpread, uFlow, uFreq, uAmp, uSpin, uSize, uBright, uFilament, uBlastT, uBlastK, uPixelRatio, uTwinkle, uHue;
      uniform vec3 uCore, uHalo, uPalA, uPalB, uPalC, uPalD;
      varying vec3 vCol; varying float vA;

      void main(){
        vec3 dir = aSeed.xyz;
        float rf = aSeed.w;
        vec3 p = dir * rf * uSpread;

        // differential spin: inner dust overtakes the outer, which is what shears arms
        float r = length(p.xz) + 1e-3;
        float ang = uTime * uSpin * (0.30 + 2.6 / (3.0 + r)) + aRnd.x * 0.25;
        float ca = cos(ang), sa = sin(ang);
        p = vec3(p.x * ca - p.z * sa, p.y, p.x * sa + p.z * ca);

        // turbulence: three decorrelated value-noise taps push the dust into filaments
        vec3 q = p * uFreq + vec3(0.0, -uTime * uFlow, uTime * uFlow * 0.6);
        float n1 = vnoise3(q);
        float n2 = vnoise3(q + vec3(19.3, 7.1, 3.7));
        float n3 = vnoise3(q * 0.7 + vec3(37.7, 21.1, 11.3));
        vec3 disp = (vec3(n1, n2, n3) - 0.5) * uAmp * (0.55 + 0.9 * rf);
        p += disp;
        p.y += (vnoise3(p * uFreq * 1.6 + 5.0) - 0.5) * uAmp * 0.35;

        // the shockwave: a ring of pushed dust that expands and decays
        float bt = uTime - uBlastT;
        if (bt < 6.0) {
          float rr = length(p);
          float ring = bt * 15.0;
          float band = exp(-pow((rr - ring) / 5.5, 2.0)) * exp(-bt * 0.75) * uBlastK;
          p += normalize(p + vec3(1e-4)) * band * 6.5;
        }

        float dens = smoothstep(0.16, 0.78, 0.5 + 0.5 * (n1 + n2 + n3) / 1.5);   // dark lanes carved out
        // three arms, wound by the differential spin: dense where the seed angle sits on an arm
        float a0 = atan(dir.z, dir.x);
        float seg = TAU / 3.0;
        float da = abs(mod(a0 + seg * 0.5, seg) - seg * 0.5);
        float arm = 0.42 + 1.15 * exp(-pow(da / 0.46, 2.0));
        float fil = pow(1.0 - abs(n3 * 2.0 - 1.0), 3.2);
        float rn = length(p) / uSpread;

        float tt = mix(rn * 0.75, dens, 0.42) + uHue + aRnd.y * 0.05;
        vec3 tint = palette(tt, uPalA, uPalB, uPalC, uPalD);
        vec3 hot = mix(uHalo, uCore, pow(clamp(1.0 - rn, 0.0, 1.0), 2.2));
        vCol = mix(tint, hot, pow(clamp(1.0 - rn, 0.0, 1.0), 3.2) * 0.55)
             * (0.35 + 1.25 * dens) * (0.45 + 0.85 * fil * uFilament) * arm;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = max(1.0, -mv.z);
        float tw = 0.7 + 0.3 * sin(uTime * (1.4 + aRnd.z * 3.0) + aRnd.w * TAU);
        vA = uBright * (0.14 + 0.55 * aRnd.y) * mix(1.0, tw, uTwinkle)
           * smoothstep(220.0, 40.0, depth) * (0.18 + 0.95 * (1.0 - rn * 0.72))
           * (0.25 + 0.9 * dens) * (0.4 + 0.85 * fil * uFilament) * arm;
        gl_PointSize = uSize * uPixelRatio * (150.0 / depth) * (0.45 + 1.35 * aRnd.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: GLSL + /* glsl */`
      precision highp float;
      varying vec3 vCol; varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        float a = exp(-r2 * 11.0) * vA;
        float core = exp(-r2 * 60.0);
        vec3 c = vCol * (a + core * 0.55 * vA);
        if (a < 0.002) discard;
        gl_FragColor = vec4(softclip(c), a);
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.name = "nebula";
  return { points, geometry: g, material: mat, uniforms: mat.uniforms,
    get count() { return g.drawRange.count; },
    set count(v) { g.setDrawRange(0, Math.min(MAX, v)); } };
}

/** The star in the middle: a soft bloom disc with four diffraction spikes. */
export function coreStar({ color = "#fff2d0", size = 9 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, depthTest: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uPulse: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `
      uniform float uSize; varying vec2 vUv;
      void main(){ vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL + /* glsl */`
      precision highp float;
      uniform vec3 uColor; uniform float uSize, uPulse, uTime;
      varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p);
        float disc = exp(-d * d * 16.0) * 1.15;
        float cross_ = exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 3.0)
                     + exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 3.0);
        float rays = exp(-d * 3.2) * 0.12;
        float th = atan(p.y, p.x);
        float spokes = pow(abs(cos(th * 2.0)), 26.0) * exp(-d * 3.0) * 0.5;
        float pulse = 0.9 + 0.1 * sin(uTime * 1.3) + 0.05 * sin(uTime * 3.7);
        float a = (disc + cross_ * 0.85 + rays + spokes) * uPulse * pulse;
        if (a < 0.004) discard;
        gl_FragColor = vec4(softclip(uColor * a * 1.7), clamp(a, 0.0, 1.0));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), mat);
  mesh.name = "coreStar";
  mesh.renderOrder = 5;
  return { mesh, material: mat, uniforms: mat.uniforms };
}

/** Distant fixed stars so the nebula sits in a field rather than in a void. */
export function fieldStars({ count = 1400, radius = 260 } = {}) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count), col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const th = Math.random() * 6.283, cp = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = radius * Math.sin(cp) * Math.cos(th);
    pos[i * 3 + 1] = radius * Math.cos(cp);
    pos[i * 3 + 2] = radius * Math.sin(cp) * Math.sin(th);
    sz[i] = 0.6 + Math.pow(Math.random(), 4) * 5;
    ph[i] = Math.random();
    c.setHSL(0.55 + (Math.random() - 0.5) * 0.22, 0.35, 0.72 + Math.random() * 0.25);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio || 1, 2) }, uDim: { value: 1 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize, aPhase; uniform float uTime, uPR;
      varying vec3 vC; varying float vT;
      void main(){ vC = aColor;
        vT = 0.6 + 0.4 * sin(uTime * (0.6 + aPhase * 2.0) + aPhase * 6.283);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec3 vC; varying float vT; uniform float uDim;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vT * uDim;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * a * 1.3, a);
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.name = "fieldStars";
  return { points, material: mat };
}
