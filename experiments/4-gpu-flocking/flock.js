// Experiment 4 — GPU flocking. Boid state lives in two float textures (position, velocity) run
// through three's GPUComputationRenderer: every boid samples a pseudo-random subset of the flock
// as its neighbourhood, so the cost is O(n · taps) instead of O(n²) and 16k boids stay cheap.
// Rendering reads the same textures in the vertex shader, so nothing ever comes back to the CPU
// except a 8x8 readback used to estimate the flock's centre for the hawk.
import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

const MAX_TAPS = 64;

const posFrag = /* glsl */`
uniform float uDt;
uniform float uBounds;
uniform float uBoundK;
uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec3 p = texture2D(position, uv).xyz;
  vec3 v = texture2D(velocity, uv).xyz;
  p += v * uDt;

  // soft spherical home: steer back when the flock drifts out of the play volume
  float r = length(p);
  if (r > uBounds) p -= normalize(p) * (r - uBounds) * uBoundK;
  if (p.y < -uBounds * 0.55) p.y += (sin(uTime * 0.7 + p.x * 0.3) + 1.0) * 0.02;

  gl_FragColor = vec4(p, 1.0);
}`;

const velFrag = /* glsl */`
uniform float uDt;
uniform float uSize;
uniform float uTaps;
uniform float uSeed;
uniform float uSep, uAli, uCoh;
uniform float uPerc, uSepR;
uniform float uMaxSpeed, uMinSpeed, uSteer;
uniform float uJitter;
uniform vec3 uHawk;
uniform float uHawkR, uHawkK;
uniform vec3 uDrift;
uniform vec4 uObs[4];
uniform float uObsR, uObsK;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec3 p = texture2D(position, uv).xyz;
  vec3 v = texture2D(velocity, uv).xyz;

  float n = uSize;
  vec3 sep = vec3(0.0), ali = vec3(0.0), coh = vec3(0.0);
  float cnt = 0.0, sepCnt = 0.0;
  float perc2 = uPerc * uPerc, sepR2 = uSepR * uSepR;

  // the neighbourhood is a pseudo-random sample of the flock: statistically the same rules,
  // and 16k boids cost 16k · taps texture reads instead of 16k · 16k
  float id = gl_FragCoord.x + gl_FragCoord.y * 37.0 + uSeed;
  float s = id * 1.13;
  for (int i = 0; i < ${MAX_TAPS}; i++) {
    if (float(i) >= uTaps) break;
    s = hash11(s + float(i) * 0.711);
    float f = s * n * n;
    ivec2 j = ivec2(mod(f, n), floor(f / n));
    if (j.x == int(gl_FragCoord.x) && j.y == int(gl_FragCoord.y)) continue;
    vec3 pj = texture2D(position, (vec2(j) + 0.5) / n).xyz;
    vec3 d = p - pj;
    float d2 = dot(d, d);
    if (d2 > perc2 || d2 < 1e-6) continue;
    coh += pj;
    ali += texture2D(velocity, (vec2(j) + 0.5) / n).xyz;
    cnt += 1.0;
    if (d2 < sepR2) { sep += d / d2; sepCnt += 1.0; }
  }

  vec3 acc = vec3(0.0);
  if (cnt > 0.0) {
    vec3 toCoh = coh / cnt - p;
    vec3 toAli = ali / cnt - v;
    acc += normalize(toCoh) * min(length(toCoh), 2.0) * uCoh;
    acc += toAli * uAli;
  }
  if (sepCnt > 0.0) acc += normalize(sep) * min(length(sep), 6.0) * uSep;

  // obstacles: hard repulsion, with a little push so boids skim around the sphere
  for (int k = 0; k < 4; k++) {
    vec3 od = p - uObs[k].xyz;
    float rr = uObs[k].w + uObsR;
    float od1 = length(od);
    if (od1 < rr && od1 > 1e-4) {
      float t = 1.0 - od1 / rr;
      acc += normalize(od) * t * t * uObsK + vec3(0.0, t * 0.4, 0.0);
    }
  }

  // the hawk: flee, and the flock closes the gap in its wake
  vec3 hd = p - uHawk;
  float hd1 = length(hd);
  if (hd1 < uHawkR && hd1 > 1e-4) {
    float t = 1.0 - hd1 / uHawkR;
    acc += normalize(hd) * t * t * uHawkK;
  }

  acc += uDrift;
  acc += vec3(hash11(s + 3.1), hash11(s + 7.7), hash11(s + 11.3)) * 2.0 - 1.0;
  acc *= uJitter;

  v += acc * uDt;

  // steer the speed into a band: flocking needs motion, and a ceiling keeps it readable
  float sp = length(v);
  if (sp > uMaxSpeed) v *= uMaxSpeed / sp;
  else if (sp < uMinSpeed) v *= uMinSpeed / max(sp, 1e-4);
  v += normalize(v) * (uMaxSpeed * 0.35) * uSteer * uDt;

  gl_FragColor = vec4(v, 1.0);
}`;

export class Flock {
  constructor(renderer, { n = 128, bounds = 24 } = {}) {
    this.renderer = renderer;
    this.n = n;
    this.bounds = bounds;
    this.gpu = new GPUComputationRenderer(n, n, renderer);
    const dtPos = this.gpu.createTexture();
    const dtVel = this.gpu.createTexture();
    this.seed(dtPos, dtVel);

    const posVar = this.gpu.addVariable("position", posFrag, dtPos);
    const velVar = this.gpu.addVariable("velocity", velFrag, dtVel);
    this.gpu.setVariableDependencies(posVar, [posVar, velVar]);
    this.gpu.setVariableDependencies(velVar, [posVar, velVar]);
    const posMat = posVar.material, velMat = velVar.material;
    Object.assign(posMat.uniforms, {
      uDt: { value: 0.016 }, uBounds: { value: bounds }, uBoundK: { value: 0.06 }, uTime: { value: 0 },
    });
    Object.assign(velMat.uniforms, {
      uDt: { value: 0.016 }, uSize: { value: n }, uTaps: { value: 40 }, uSeed: { value: 0 },
      uSep: { value: 2.6 }, uAli: { value: 1.3 }, uCoh: { value: 1.1 },
      uPerc: { value: 2.6 }, uSepR: { value: 1.0 },
      uMaxSpeed: { value: 9.5 }, uMinSpeed: { value: 3.2 }, uSteer: { value: 0.4 },
      uJitter: { value: 1.6 }, uHawk: { value: new THREE.Vector3(999, 999, 999) },
      uHawkR: { value: 6 }, uHawkK: { value: 26 }, uDrift: { value: new THREE.Vector3(0, 0.1, 0) },
      uObs: { value: [new THREE.Vector4(999, 999, 999, 0.1), new THREE.Vector4(999, 999, 999, 0.1), new THREE.Vector4(999, 999, 999, 0.1), new THREE.Vector4(999, 999, 999, 0.1)] },
      uObsR: { value: 3.2 }, uObsK: { value: 34 },
    });
    const err = this.gpu.init();
    if (err) throw new Error("GPUComputationRenderer: " + err);
    this.posVar = posVar; this.velVar = velVar;
    this.posMat = posMat; this.velMat = velMat;

    this.samples = new Float32Array(8 * 8 * 4);
    this.velSamples = new Float32Array(8 * 8 * 4);
    this.centroid = new THREE.Vector3();
    this.meanSpeed = 0;
  }

  seed(dtPos, dtVel) {
    const n = this.n, R = this.bounds;
    const dp = dtPos.image.data, dv = dtVel.image.data;
    for (let i = 0; i < n * n; i++) {
      // start in a shell of clusters so the flock forms visible streams straight away
      const cl = Math.floor(Math.random() * 5);
      const cx = (Math.random() - 0.5) * R * 1.2, cy = (Math.random() - 0.5) * R * 0.5, cz = (Math.random() - 0.5) * R * 1.2;
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = Math.cbrt(Math.random()) * R * 0.22;
      const k = i * 4;
      dp[k] = cx * 0.6 + Math.sin(a) * Math.cos(b) * r + (cl - 2) * 2.0;
      dp[k + 1] = cy * 0.6 + Math.sin(a) * Math.sin(b) * r;
      dp[k + 2] = cz * 0.6 + Math.cos(a) * r;
      const sp = 3 + Math.random() * 4;
      dv[k] = Math.sin(a) * sp; dv[k + 1] = (Math.random() - 0.5) * sp * 0.4; dv[k + 2] = Math.cos(a) * sp;
      dp[k + 3] = 1; dv[k + 3] = 1;
    }
  }

  get positionTexture() { return this.gpu.getCurrentRenderTarget(this.posVar).texture; }
  get velocityTexture() { return this.gpu.getCurrentRenderTarget(this.velVar).texture; }
  get count() { return this.n * this.n; }

  compute(dt, p) {
    const u = this.velMat.uniforms, pu = this.posMat.uniforms;
    const d = Math.min(dt, 1 / 30);
    pu.uDt.value = d; pu.uTime.value = p.time ?? 0;
    pu.uBounds.value = this.bounds; pu.uBoundK.value = p.boundK ?? 0.06;
    u.uDt.value = d;
    u.uTaps.value = p.taps;
    u.uSeed.value = (u.uSeed.value + 0.137) % 997;
    u.uSep.value = p.sep; u.uAli.value = p.ali; u.uCoh.value = p.coh;
    u.uPerc.value = p.perc; u.uSepR.value = p.sepR;
    u.uMaxSpeed.value = p.maxSpeed; u.uMinSpeed.value = Math.min(p.minSpeed, p.maxSpeed * 0.9);
    u.uSteer.value = p.steer ?? 0.4;
    u.uJitter.value = p.jitter;
    u.uHawk.value.copy(p.hawk);
    u.uHawkR.value = p.hawkR; u.uHawkK.value = p.hawkK;
    u.uDrift.value.set(p.driftX ?? 0, p.driftY ?? 0.1, p.driftZ ?? 0);
    for (let i = 0; i < 4; i++) u.uObs.value[i].copy(p.obs[i]);
    u.uObsR.value = p.obsR; u.uObsK.value = p.obsK;
    this.gpu.compute();
  }

  /** 8x8 corner readback of both textures: coarse centroid and mean speed for the hawk's target */
  readback() {
    const gl = this.renderer.getContext();
    const target = this.gpu.getCurrentRenderTarget(this.posVar);
    try {
      this.renderer.readRenderTargetPixels(target, 0, 0, 8, 8, this.samples);
      this.renderer.readRenderTargetPixels(this.gpu.getCurrentRenderTarget(this.velVar), 0, 0, 8, 8, this.velSamples);
    } catch (e) { return null; }
    if (gl.getError && gl.getError()) return null;
    let x = 0, y = 0, z = 0, sp = 0, c = 0;
    for (let i = 0; i < 64; i++) {
      const k = i * 4;
      if (!Number.isFinite(this.samples[k])) continue;
      x += this.samples[k]; y += this.samples[k + 1]; z += this.samples[k + 2];
      sp += Math.hypot(this.velSamples[k], this.velSamples[k + 1], this.velSamples[k + 2]);
      c++;
    }
    if (!c) return null;
    this.centroid.set(x / c, y / c, z / c);
    this.meanSpeed = sp / c;
    return { centroid: this.centroid, meanSpeed: this.meanSpeed };
  }

  dispose() {
    for (const rt of [...this.posVar.renderTargets, ...this.velVar.renderTargets]) rt.dispose();
    this.posMat.dispose(); this.velMat.dispose();
  }
}
