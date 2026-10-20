// Water wave fields for experiment 1.
//  - WaveSim: GPU height-field wave equation, ping-ponged between two float render targets
//    (r = height, g = velocity, b = foam), with additive splat passes for clicks, drags, rain.
//  - CpuWave: the same equation on a coarse CPU grid, so floating bodies can bob on the waves
//    and trade energy with them without reading pixels back.
import * as THREE from "three";

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);

function makeTarget(size) {
  const t = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false,
  });
  return t;
}

export class WaveSim {
  constructor(renderer, { size = 256, speed = 6.0, damping = 0.996, flow = 0 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.speed = speed; this.damping = damping; this.flow = flow; this.cap = 0.55;
    this.a = makeTarget(size);
    this.b = makeTarget(size);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(quadGeo, this.stepMaterial());
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.splatScene = new THREE.Scene();
    this.splatMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.splatMaterial());
    this.splatMesh.frustumCulled = false;
    this.splatScene.add(this.splatMesh);
    this.state = this.a;
    this._savedTarget = null;
  }

  stepMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uState: { value: null },
        uTexel: { value: 1 },
        uK: { value: 0.32 },
        uCap: { value: 0.55 },
        uDamp: { value: 0.9965 },
        uFlow: { value: 0 },
      },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D uState; uniform float uTexel, uK, uCap, uDamp, uFlow;
        varying vec2 vUv;
        void main(){
          vec4 c = texture2D(uState, vUv);
          float l = texture2D(uState, vUv - vec2(uTexel,0.0)).r;
          float r = texture2D(uState, vUv + vec2(uTexel,0.0)).r;
          float d = texture2D(uState, vUv - vec2(0.0,uTexel)).r;
          float u = texture2D(uState, vUv + vec2(0.0,uTexel)).r;
          float lap = (l + r + u + d) * 0.25 - c.r;
          // leapfrog in texture units: stable for uK <= 1 (we stay under 0.5)
          float v = (c.g + lap * uK) * uDamp;
          float h = (c.r + v) * 0.999;
          h = clamp(h, -uCap, uCap);
          v = clamp(v, -0.5, 0.5);
          // foam is born where the water moves fast, decays when it calms down
          float s = abs(v) + abs(lap) * 2.0;
          float f = max(c.b * 0.980, smoothstep(0.16, 0.62, s) * 0.8);
          gl_FragColor = vec4(h, v, clamp(f, 0.0, 1.0), 1.0);
        }`,
    });
  }

  splatMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 }, uFoam: { value: 0 }, uCore: { value: 1 }, uRing: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false, depthWrite: false,
      vertexShader: /* glsl */`
        varying vec2 vQ;
        void main(){ vQ = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uStrength, uFoam, uCore, uRing;
        varying vec2 vQ;
        void main(){
          float d = length(vQ - 0.5) * 2.0;
          float core = -exp(-d * d * 6.0) * uCore;          // the dent a body leaves
          float rim = exp(-pow((d - 0.72) * 4.0, 2.0)) * uRing;  // the ring that runs off
          float g = (core + rim) * uStrength;
          float f = (exp(-d * d * 4.0) * uCore + rim) * uFoam;
          gl_FragColor = vec4(g, -g * 0.35, f, 0.0);
        }`,
    });
  }

  /** u,v in texture space [0,1]; radius and strength in world units of the pool. */
  splat(u, v, radiusWorld, poolSize, { strength = 1, foam = 0.6, core = 1, ring = 0 } = {}) {
    const r = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.state);
    this.renderer.autoClear = false;
    const s = this.splatMesh.material.uniforms;
    s.uStrength.value = strength;
    s.uFoam.value = foam;
    s.uCore.value = core;
    s.uRing.value = ring;
    this.splatMesh.position.set(u * 2 - 1, v * 2 - 1, 0);
    const d = (radiusWorld / poolSize) * 2;
    this.splatMesh.scale.set(d, d, 1);
    this.renderer.render(this.splatScene, quadCam);
    this.renderer.autoClear = true;
    this.renderer.setRenderTarget(r);
  }

  /** GUI "wave speed" (1..12) -> stable Courant number K, wave c ~ sqrt(K)/2 cells/step. */
  knot() { return Math.min(0.48, 0.035 * this.speed); }

  step(dt) {
    const src = this.state, dst = src === this.a ? this.b : this.a;
    const m = this.quad.material.uniforms;
    m.uState.value = src.texture;
    m.uTexel.value = 1 / this.size;
    m.uK.value = this.knot();
    m.uCap.value = this.cap;
    m.uDamp.value = this.damping;
    m.uFlow.value = this.flow;
    const r = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.quadScene, quadCam);
    this.renderer.setRenderTarget(r);
    this.state = dst;
    return dst;
  }

  setSize(size) {
    this.a.setSize(size, size);
    this.b.setSize(size, size);
    this.size = size;
  }

  reset() {
    const r = this.renderer.getRenderTarget();
    for (const t of [this.a, this.b]) {
      this.renderer.setRenderTarget(t);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(r);
  }

  dispose() { this.a.dispose(); this.b.dispose(); }
}

/** Coarse CPU copy of the same equation: h'' = c^2 lap(h). */
export class CpuWave {
  constructor(n = 64, size = 1) {
    this.n = n; this.size = size;
    this.h = new Float32Array(n * n);
    this.v = new Float32Array(n * n);
  }
  idx(x, y) { return y * this.n + x; }
  /** Fixed-step ripple update (stable for K <= 0.5); wave speed ~ sqrt(K)/2 cells per step. */
  step(K = 0.25, damp = 0.9965, cap = 0.45) {
    const n = this.n, h = this.h, v = this.v;
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        const lap = (h[i - 1] + h[i + 1] + h[i - n] + h[i + n]) * 0.25 - h[i];
        v[i] = (v[i] + lap * K) * damp;
        let hi = (h[i] + v[i]) * 0.999;
        if (hi > cap) { hi = cap; v[i] *= 0.5; } else if (hi < -cap) { hi = -cap; v[i] *= 0.5; }
        h[i] = hi;
      }
    }
  }
  /** world x,z in [-size/2, size/2] */
  splat(x, z, radius, strength) {
    const n = this.n, s = this.size;
    const cx = ((x / s) + 0.5) * n, cz = ((z / s) + 0.5) * n;
    const r = Math.max(1, (radius / s) * n);
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(n - 2, Math.ceil(cx + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(n - 2, Math.ceil(cz + r));
    for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cz) / r;
      if (d > 1) continue;
      const f = (1 - d * d) * (1 - d * d);
      const i = y * n + x;
      this.h[i] += strength * f;
    }
  }
  sample(x, z) {
    const n = this.n, s = this.size;
    const fx = Math.min(n - 1.001, Math.max(0, ((x / s) + 0.5) * n));
    const fz = Math.min(n - 1.001, Math.max(0, ((z / s) + 0.5) * n));
    const x0 = fx | 0, y0 = fz | 0, tx = fx - x0, ty = fz - y0;
    const i = y0 * n + x0;
    const a = this.h[i], b = this.h[i + 1], c = this.h[i + n], d = this.h[i + n + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  /** finite-difference slope, for the pitch/roll of floating bodies */
  slope(x, z, e = 0.6) {
    const hx = (this.sample(x + e, z) - this.sample(x - e, z)) / (2 * e);
    const hz = (this.sample(x, z + e) - this.sample(x, z - e)) / (2 * e);
    return { x: hx, z: hz };
  }
}
