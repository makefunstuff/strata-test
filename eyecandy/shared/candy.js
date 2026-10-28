// Shared kit for the eye-candy shelf. Every piece here is a *look*, not a simulation, so what they
// share is the render pipeline (renderer, ACES tonemap, bloom, composer), the page furniture (fps,
// HUD, hint card, lil-gui) and one box of GLSL: hash/value/fBm/curl noise, cosine palettes, and the
// full-screen pass helpers. The renderer half is the experiments' own lab kit — same three.js, same
// pinned CDN importmap, same window.experiment hook the headless checks drive — wrapped here with
// candy defaults: stronger bloom, black sky, no shadow maps.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createLab } from "../../experiments/shared/lab.js";

export * from "../../experiments/shared/lab.js";

/** createLab with the eye-candy defaults: heavy bloom, dark, unlit unless a page asks otherwise. */
export function createCandy(opts = {}) {
  return createLab({
    bloom: { strength: 0.9, radius: 0.72, threshold: 0.62, scale: 0.5 },
    exposure: 1.12,
    background: 0x03050a,
    ...opts,
  });
}

// -----------------------------------------------------------------------------------------------
// GLSL. One dialect for the whole shelf: GLSL1 as three.js compiles it under WebGL2 (varying /
// gl_FragColor / texture2D all work — three injects the 300-es compatibility defines).
// -----------------------------------------------------------------------------------------------
export const GLSL = /* glsl */`
  #define PI 3.141592653589793
  #define TAU 6.283185307179586

  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33);
                       return fract((p3.xx + p3.yz) * p3.zy); }
  vec3  hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33);
                       return fract((p.xxy + p.yxx) * p.zyx); }
  float hash31(vec3 p){ vec3 p3 = fract(p * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33);
                       return fract((p3.x + p3.y) * p3.z); }

  // smooth value noise, 2D and 3D — cheap, isotropic enough for clouds, curtains and film
  float vnoise2(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x),
               mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
  }
  float vnoise3(vec3 p){
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i), n100 = hash31(i + vec3(1,0,0));
    float n010 = hash31(i + vec3(0,1,0)), n110 = hash31(i + vec3(1,1,0));
    float n001 = hash31(i + vec3(0,0,1)), n101 = hash31(i + vec3(1,0,1));
    float n011 = hash31(i + vec3(0,1,1)), n111 = hash31(i + vec3(1,1,1));
    return mix(mix(mix(n000,n100,u.x), mix(n010,n110,u.x), u.y),
               mix(mix(n001,n101,u.x), mix(n011,n111,u.x), u.y), u.z);
  }

  float fbm2(vec2 p){
    float s = 0.0, a = 0.5, norm = 0.0;
    for (int i = 0; i < 5; i++){ s += a * vnoise2(p); norm += a; p = p * 2.07 + vec2(13.1, 7.3); a *= 0.5; }
    return s / norm;
  }
  float fbm3(vec3 p){
    float s = 0.0, a = 0.5, norm = 0.0;
    for (int i = 0; i < 5; i++){ s += a * vnoise3(p); norm += a; p = p * 2.03 + vec3(9.7, 3.1, 5.3); a *= 0.5; }
    return s / norm;
  }
  // ridged fbm: sharp crests instead of soft blobs — aurora rays, frost, caustic veins
  float ridge2(vec2 p){
    float s = 0.0, a = 0.5, norm = 0.0;
    for (int i = 0; i < 5; i++){
      float n = 1.0 - abs(vnoise2(p) * 2.0 - 1.0);
      s += a * n * n; norm += a; p = p * 2.03 + vec2(3.7, 11.3); a *= 0.5;
    }
    return s / norm;
  }
  // domain warp — the difference between a noise pattern and a fluid one
  vec2 warp2(vec2 p, float t, float k){
    vec2 q = vec2(fbm2(p + vec2(0.0, t)), fbm2(p + vec2(5.2, 1.3) - t * 0.7));
    return p + k * q;
  }

  // Inigo Quilez cosine palette: a,b set the colours, c the frequency, d the phase per channel
  vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(TAU * (c * t + d)); }

  // filmic-ish soft knee so hand-authored neon does not clip to white under bloom
  vec3 softclip(vec3 c){ return c / (1.0 + max(vec3(0.0), c - 0.82)); }
  float sat(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 grade(vec3 c, float s, float lift, float gain){ return (c * gain + lift) * mix(vec3(1.0), vec3(sat(c)), s); }
`;

/** A mesh that fills the viewport and ignores the camera — the base of every pure-shader piece. */
export function fullscreenQuad(fragment, uniforms = {}, { vertex, name = "quad" } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false, depthWrite: false,
    vertexShader: vertex ?? /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL + "\n" + fragment,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.name = name;
  return { mesh, material: mat, uniforms: mat.uniforms };
}

/**
 * An ortho scene rendered by its own camera on top of the composer — used for the vignette/grain
 * grade and for anything that must sit over the picture regardless of the 3D camera.
 */
export function overlayPass(composer, fragment, uniforms = {}, { name = "overlay" } = {}) {
  const pass = new ShaderPass({
    uniforms: Object.assign({ tDiffuse: { value: null } }, uniforms),
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL + "\n" + fragment,
  });
  pass.name = name;
  composer.addPass(pass);
  return pass;
}

/** The shelf's house grade: vignette, grain, a touch of bleed at the corners. Every page ends with it. */
export function gradePass(composer, { vignette = 1.05, grain = 0.055, tint = 0x9fd8ff, tintAmount = 0.05, saturation = 1.12, gain = 1.0 } = {}) {
  return overlayPass(composer, /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uRes; uniform float uTime, uVig, uGrain, uSat, uGain, uTintAmt; uniform vec3 uTint;
    varying vec2 vUv;
    void main(){
      vec4 tx = texture2D(tDiffuse, vUv);
      vec3 c = tx.rgb;
      vec2 d = vUv - 0.5;
      float v = 1.0 - uVig * pow(length(d) * 1.32, 2.4);
      c *= clamp(v, 0.0, 1.0);
      float g = hash21(vUv * uRes + fract(uTime) * 91.7);
      c += (g - 0.5) * uGrain * (1.15 - 0.65 * sat(c));
      c = mix(c, c * (uTint * 0.55 + 0.55), uTintAmt);
      c = grade(c, uSat, 0.012, uGain);
      gl_FragColor = vec4(softclip(c), tx.a);
    }`, {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVig: { value: vignette },
    uGrain: { value: grain },
    uSat: { value: saturation },
    uGain: { value: gain },
    uTint: { value: new THREE.Color(tint) },
    uTintAmt: { value: tintAmount },
  }, { name: "grade" });
}

/** A Points field of soft round sprites with per-point size, colour and twinkle phase. */
export function sparkleField({ count = 400, radius = 30, size = [2, 7], cols = ["#ffffff", "#bfe9ff"], drift = 0.15, additive = true }) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const sz = new Float32Array(count), ph = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = radius * Math.cbrt(Math.random()), th = Math.random() * Math.PI * 2, cp = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(cp) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(cp) * (drift > 0 ? 0.55 : 1);
    pos[i * 3 + 2] = r * Math.sin(cp) * Math.sin(th);
    c.set(cols[(Math.random() * cols.length) | 0]);
    col.set([c.r, c.g, c.b], i * 3);
    sz[i] = size[0] + Math.random() * (size[1] - size[0]);
    ph[i] = Math.random();
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) }, uDim: { value: 1 } },
    vertexShader: GLSL + /* glsl */`
      attribute vec3 aColor; attribute float aSize, aPhase;
      uniform float uTime, uPixelRatio, uDim;
      varying vec3 vCol; varying float vTw;
      void main(){
        vCol = aColor;
        vTw = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * (1.1 + aPhase * 2.6) + aPhase * TAU), 2.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (260.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: GLSL + /* glsl */`
      precision highp float;
      uniform float uDim;
      varying vec3 vCol; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        a *= a * vTw * uDim;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vCol * (0.6 + 0.9 * vTw) * a, a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.name = "sparkles";
  return { points: pts, material: mat, set count(v) { g.setDrawRange(0, v); }, get count() { return g.drawRange.count; } };
}

/** The little things the harness reads back: a rounded snapshot helper pages hand to lab.expose. */
export const snap = (o) => JSON.parse(JSON.stringify(o, (_, v) =>
  typeof v === "number" ? Math.round(v * 1000) / 1000 : v));
