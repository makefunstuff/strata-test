// Experiment 5 — the volumetric part: a raymarched fire/smoke volume and the pass that renders it
// at reduced resolution and composites it over the scene (that is the cheap way to do volumetrics:
// the march is the expensive part, and a half-resolution volume is invisible to the eye).
import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { glslSimplex, glslFbm } from "../shared/noise.js";

const MAX_STEPS = 110;

const volVert = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const volFrag = /* glsl */`
precision highp float;
varying vec3 vWorld;
uniform vec3 uBoxMin, uBoxMax;
uniform float uTime, uSteps, uOct;
uniform float uFlameH, uFlameR, uFreq, uRise, uTurb, uIntensity, uEmiss, uAbsorbF, uAbsorbS;
uniform float uSmoke, uSmokeH, uSmokeR, uSmokeFreq, uGlow, uFlicker;
uniform vec2 uWind;
uniform vec3 uFireLight, uSmokeCol, uFireTint;

${glslSimplex}
${glslFbm}

float hash21(vec2 p) { p = fract(p * vec2(123.43, 456.55)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// teardrop flame body, sheared by the wind, carved by animated fBm: a vertical profile gives the
// shape, the noise carves tongues and licks out of it, the temperature ramp paints the core white
float fireDensity(vec3 p, out float temp) {
  float h = p.y / uFlameH;
  temp = 0.0;
  if (h < 0.0 || h > 1.2) return 0.0;
  vec2 lean = uWind * h * h * 1.1;
  vec3 q = vec3(p.x - lean.x, p.y, p.z - lean.y);
  float r = length(q.xz);
  float hc = clamp(h, 0.0, 1.0);
  float rad = uFlameR * (1.05 - 0.72 * hc) * (0.72 + 0.42 * sin(hc * 3.1));
  if (r > rad) return 0.0;
  vec3 w = vec3(fbm3(p * 0.55 + vec3(0.0, -uTime * 0.55, 0.0), 2), fbm3(p * 0.5 + vec3(9.7, -uTime * 0.46, 4.3), 2), 0.0);
  vec3 n = (p + w * uTurb * (0.4 + hc * 1.5)) * uFreq;
  n.y -= uTime * uRise;
  n.y *= 0.62;                       // vertically stretched noise cells: flames are taller than they are wide
  float f = fbm3(n, int(uOct)) + 0.42 * fbm3(n * 2.4 + vec3(0.0, -uTime * 2.2, 0.0), 2);
  float edge = 1.0 - smoothstep(rad * 0.25, rad, r);
  float profile = (0.9 - hc * 0.95) * edge;
  float carve = 0.42 + 0.95 * f;
  float d = max(profile * carve * 2.0 - 0.05, 0.0) * uIntensity;
  temp = clamp((1.02 - hc * 0.95) * (0.34 + d * 1.15), 0.0, 1.0);
  return d;
}

float smokeDensity(vec3 p) {
  float h = (p.y - uFlameH * 0.5) / uSmokeH;
  if (h < 0.0) return 0.0;
  vec2 lean = uWind * (0.5 * h * h + 0.35 * h);
  float spread = 0.75 + h * 3.1;
  float r = length(p.xz - lean) / (uSmokeR * spread);
  if (r > 1.0) return 0.0;
  vec3 n = p * uSmokeFreq;
  n.y -= uTime * (uRise * 0.45 + 0.35);
  float f = fbm3(n, 3);
  float fade = smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(0.25, 1.0, h));
  return max(f * 1.05 - 0.22, 0.0) * (1.0 - r * r) * fade * uSmoke;
}

// the fire is the only light down here: the plume glows near the flame and goes dark as it rises
float fireLight(vec3 p) {
  float d2 = max(dot(p - uFireLight, p - uFireLight), 0.0);
  float fl = 0.75 + 0.25 * sin(uTime * 11.0 + p.y * 2.0) * uFlicker;
  return uGlow * fl / (1.0 + d2 * 0.11);
}

vec3 ramp(float t) {
  vec3 c1 = vec3(1.0, 0.97, 0.85), c2 = vec3(1.0, 0.55, 0.16), c3 = vec3(0.55, 0.13, 0.04), c4 = vec3(0.07, 0.03, 0.03);
  t = clamp(t, 0.0, 1.0);
  return t > 0.66 ? mix(c2, c1, (t - 0.66) / 0.34) : t > 0.33 ? mix(c3, c2, (t - 0.33) / 0.33) : mix(c4, c3, t / 0.33);
}

vec2 hitBox(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  return vec2(max(tn, 0.0), max(tf, 0.0));
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - cameraPosition);
  vec2 hb = hitBox(ro, rd);
  float tn = hb.x, tf = hb.y;
  if (tf <= tn) { gl_FragColor = vec4(0.0); return; }

  float dt = (tf - tn) / uSteps;
  float t = tn + dt * hash21(gl_FragCoord.xy + fract(uTime) * 13.7);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float flick = 1.0 + 0.12 * sin(uTime * 17.0) * uFlicker + 0.07 * sin(uTime * 41.0) * uFlicker;

  for (int i = 0; i < ${MAX_STEPS}; i++) {
    if (float(i) >= uSteps || T < 0.004) break;
    vec3 p = ro + rd * t;
    float temp = 0.0;
    float f = fireDensity(p, temp) * flick;
    float s = smokeDensity(p);
    float den = f * uAbsorbF + s * uAbsorbS;
    if (den > 0.0035) {
      float lit = fireLight(p);
      vec3 col = ramp(temp) * f * uEmiss + (uSmokeCol * (0.14 + lit * 0.5) + uFireTint * lit) * s * 0.9;
      float a = clamp(den * dt, 0.0, 1.0);
      acc += T * col * a;
      T *= 1.0 - a;
    }
    t += dt;
  }
  gl_FragColor = vec4(acc, clamp(1.0 - T, 0.0, 1.0));
}`;

const compositeFrag = /* glsl */`
precision highp float;
uniform sampler2D tRead, tFire;
varying vec2 vUv;
void main() {
  vec4 f = texture2D(tFire, vUv);
  vec3 r = texture2D(tRead, vUv).rgb;
  gl_FragColor = vec4(r * (1.0 - f.a) + f.rgb, 1.0);
}`;

const compositeVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FireVolume {
  constructor({ size = [14, 30, 14], base = 0.0 } = {}) {
    this.box = new THREE.BoxGeometry(size[0], size[1], size[2]);
    this.base = base;
    this.uniforms = {
      uTime: { value: 0 }, uSteps: { value: 64 }, uOct: { value: 3 },
      uBoxMin: { value: new THREE.Vector3(-size[0] / 2, base, -size[2] / 2) },
      uBoxMax: { value: new THREE.Vector3(size[0] / 2, base + size[1], size[2] / 2) },
      uFlameH: { value: 5.4 }, uFlameR: { value: 1.6 }, uFreq: { value: 0.7 }, uRise: { value: 1.7 },
      uTurb: { value: 0.55 }, uIntensity: { value: 1.0 }, uEmiss: { value: 3.2 },
      uAbsorbF: { value: 1.5 }, uAbsorbS: { value: 2.6 },
      uSmoke: { value: 0.85 }, uSmokeH: { value: 17 }, uSmokeR: { value: 1.4 }, uSmokeFreq: { value: 0.3 },
      uGlow: { value: 1.5 }, uFlicker: { value: 1.0 },
      uWind: { value: new THREE.Vector2(0.3, 0.1) },
      uFireLight: { value: new THREE.Vector3(0, 1.6, 0) },
      uSmokeCol: { value: new THREE.Color(0.34, 0.33, 0.36) },
      uFireTint: { value: new THREE.Color(1.0, 0.42, 0.12) },
    };
    const mesh = new THREE.Mesh(this.box, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: volVert, fragmentShader: volFrag,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
      // the march accumulates premultiplied light, so the volume blends as premultiplied-over
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    }));
    mesh.position.y = base + size[1] / 2;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.size = size;
  }

  set(u, v) {
    const t = this.uniforms[u];
    if (!t) return;
    if (v instanceof THREE.Vector2 || v instanceof THREE.Vector3) t.value.copy(v);
    else if (v && v.isColor) t.value.copy(v);
    else t.value = v;
  }
}

export class VolumetricPass extends Pass {
  constructor(volume, camera, scale = 0.5) {
    super();
    this.volume = volume;
    this.camera = camera;
    this.scale = scale;
    this.scene = new THREE.Scene();
    this.scene.add(volume.mesh);
    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.HalfFloatType });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tRead: { value: null }, tFire: { value: null } },
      vertexShader: compositeVert, fragmentShader: compositeFrag,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this._color = new THREE.Color();
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(4, Math.round(w * this.scale)), Math.max(4, Math.round(h * this.scale)));
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.getClearColor(this._color);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rt);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    this.mat.uniforms.tRead.value = readBuffer.texture;
    this.mat.uniforms.tFire.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    renderer.setClearColor(this._color, alpha);
  }

  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}

/** embers: sparks torn off the fire, rising with the plume and blown by the wind */
export function createEmbers(count = 600, { radius = 1.0, height = 4.5, wind = [0.3, 0.1] } = {}) {
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4); // age, life, seed, size
  const spawn = (i) => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 0.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
    data[i * 4] = 0;
    data[i * 4 + 1] = 1.4 + Math.random() * 2.6;
    data[i * 4 + 2] = Math.random();
    data[i * 4 + 3] = 0.5 + Math.random() * 1.6;
  };
  for (let i = 0; i < count; i++) { spawn(i); data[i * 4] = Math.random() * data[i * 4 + 1]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aEmber", new THREE.BufferAttribute(data, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uHeight: { value: height }, uWind: { value: new THREE.Vector2(wind[0], wind[1]) },
      uIntensity: { value: 1 }, uPixelRatio: { value: 1 }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec4 aEmber;
      uniform float uHeight, uPixelRatio, uIntensity, uTime;
      uniform vec2 uWind;
      varying float vLife;
      varying float vSeed;
      void main() {
        float life = aEmber.y, age = aEmber.x;
        vLife = clamp(age / life, 0.0, 1.0);
        vSeed = aEmber.z;
        float w = sin(uTime * 2.4 + aEmber.z * 30.0) * 0.5 + cos(uTime * 1.3 + aEmber.z * 11.0) * 0.4;
        vec3 p = position;
        p.x += uWind.x * vLife * vLife * 2.6 + w * 0.5 * vLife;
        p.z += uWind.y * vLife * vLife * 2.6 + cos(uTime * 1.9 + aEmber.z * 21.0) * 0.45 * vLife;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * 22.0 + aEmber.z * 40.0);
        gl_PointSize = aEmber.w * uPixelRatio * (14.0 + 10.0 * tw) * uIntensity / max(-mv.z, 0.4);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vLife;
      varying float vSeed;
      uniform float uIntensity;
      void main() {
        vec2 d = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(d, d);
        if (r2 > 1.0) discard;
        float core = exp(-r2 * 3.4);
        float fade = (1.0 - vLife) * core;
        vec3 hot = vec3(1.0, 0.72, 0.30), cool = vec3(0.85, 0.20, 0.06);
        vec3 c = mix(hot, cool, smoothstep(0.15, 0.85, vLife));
        gl_FragColor = vec4(c * fade * 2.6 * uIntensity, fade * 0.9);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.geo = geo;
  points.mat = mat;
  points.pos = pos;
  points.data = data;
  points.spawn = spawn;
  points.count = count;
  points.update = (dt, intensity, windX, windZ, rise) => {
    const g = 1.6 + 2.6 * intensity;
    for (let i = 0; i < count; i++) {
      const k = i * 4;
      data[k] += dt * (0.55 + 0.5 * intensity);
      if (data[k] > data[k + 1]) { spawn(i); continue; }
      const p = i * 3;
      const life = data[k] / data[k + 1];
      pos[p] += (windX * 1.6 * life + Math.sin(life * 9 + data[k + 2] * 20) * 0.35) * dt;
      pos[p + 1] += (rise * (1.1 - life * 0.55) + data[k + 3] * 0.3) * dt * (0.7 + 0.6 * intensity);
      pos[p + 2] += (windZ * 1.6 * life + Math.cos(life * 7 + data[k + 2] * 13) * 0.3) * dt;
      if (pos[p + 1] > height * 3.4) spawn(i);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aEmber.needsUpdate = true;
    mat.uniforms.uWind.value.set(windX, windZ);
    mat.uniforms.uIntensity.value = intensity;
    mat.uniforms.uHeight.value = height;
  };
  return points;
}
