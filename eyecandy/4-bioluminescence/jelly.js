// Eye candy 4 — Bioluminescence. Deep water and jellyfish. The bell is a lathe-built dome that
// contracts on a wave travelling from apex to margin (the animal swims by squeezing), the tentacles
// and frilly arms are ribbons placed entirely in the vertex shader, each segment lagging the one
// above it so the trail follows the pulse. Light comes from the rim and the radial canals, not from a
// lamp: fresnel on the bell, additive over the dark, with shafts from the surface and marine snow.
import * as THREE from "three";
import { GLSL, sparkleField } from "../shared/candy.js";

export const GLOWS = {
  abyss: { rim: "#5ef0ff", bell: "#1a3f8f", canal: "#9dfcff", arm: "#3fd8ff", ray: "#59c8ff" },
  amber: { rim: "#ffcf6f", bell: "#8f4a1a", canal: "#ffe9b0", arm: "#ff9f4f", ray: "#ffb95c" },
  rose: { rim: "#ff7ad0", bell: "#7a1a5f", canal: "#ffc0ee", arm: "#ff5e9e", ray: "#ff7ac0" },
  violet: { rim: "#b98cff", bell: "#3a1f8f", canal: "#dcc8ff", arm: "#8f6fff", ray: "#9f7aff" },
  verdant: { rim: "#7dffc8", bell: "#125f4a", canal: "#d6fff0", arm: "#4fe8a8", ray: "#5cffc0" },
};

/** A dome: rings from the apex (u=0) to the margin (u=1), around by v. */
export function bellGeometry({ rings = 26, radial = 48, R = 1.5, H = 1.15, bell = 0.9 } = {}) {
  const pos = [], uv = [], norm = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const rr = R * Math.pow(Math.sin(u * Math.PI * 0.5), 0.72);
    const yy = H * Math.cos(u * Math.PI * 0.5) * bell;
    for (let j = 0; j <= radial; j++) {
      const v = j / radial, a = v * Math.PI * 2;
      const nx = Math.sin(u * Math.PI * 0.5) * Math.cos(a);
      const ny = Math.cos(u * Math.PI * 0.5);
      const nz = Math.sin(u * Math.PI * 0.5) * Math.sin(a);
      pos.push(rr * Math.cos(a), yy, rr * Math.sin(a));
      norm.push(nx, ny, nz);
      uv.push(u, v);
    }
  }
  const cols = radial + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const BELL_VERT = GLSL + /* glsl */`
  uniform float uTime, uPulse, uSqueeze, uWobble, uScale;
  attribute float aU;
  varying vec3 vN, vW; varying float vU;
  void main(){
    vec3 p = position * uScale;
    float u = uv.x;
    // a contraction wave from apex to margin: the bell clamps shut, then opens
    float w = sin(uTime * uPulse * TAU - u * 2.6);
    float clamp_ = 0.5 + 0.5 * w;
    p.xz *= 1.0 - uSqueeze * clamp_ * (0.25 + 0.75 * u);
    p.y *= 1.0 + uSqueeze * clamp_ * 0.22;
    p.y -= uSqueeze * clamp_ * 0.10 * uScale;
    p.xz += vec2(vnoise3(p * 1.6 + vec3(uTime * 0.3)), vnoise3(p * 1.6 + 17.0 - uTime * 0.25) - 0.5) * uWobble * u;
    vU = u;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

export class Jelly {
  constructor({ glow = "abyss", R = 1.5, arms = 5, tentacles = 20, tentacleLen = 4.6 } = {}) {
    this.group = new THREE.Group();
    this.group.name = "jelly";
    this.R = R;
    this.glowName = glow;
    this.setGlow(glow);

    const bellGeo = bellGeometry({ R, H: R * 1.22, rings: 30, radial: 56, bell: 1.0 });
    this.bell = new THREE.Mesh(bellGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: Object.assign(this.sharedUniforms(), {
        uRim: { value: new THREE.Color(this.glow.rim) },
        uBell: { value: new THREE.Color(this.glow.bell) },
        uCanal: { value: new THREE.Color(this.glow.canal) },
        uCanalK: { value: 1 },
        uVeins: { value: 9 },
      }),
      vertexShader: BELL_VERT,
      fragmentShader: GLSL + /* glsl */`
        precision highp float;
        uniform float uTime, uGlow, uCanalK, uVeins;
        uniform vec3 uRim, uBell, uCanal;
        varying vec3 vN, vW; varying float vU;
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          float f = pow(1.0 - abs(dot(N, V)), 2.1);
          // the margin glows brightest; the dome is a cold translucent bell
          float margin = smoothstep(0.55, 1.0, vU);
          float apex = 1.0 - smoothstep(0.0, 0.7, vU);
          // radial canals: thin bright vessels running from the middle out to the ring
          float ang = fract(vU * 0.0);
          float canals = pow(abs(sin(gl_FragCoord.x * 0.0 + atan(vW.z - vW.x * 0.0, vW.x) * uVeins)), 14.0);
          canals = mix(canals, pow(vnoise2(vec2(atan(vN.z, vN.x) * uVeins, vU * 6.0 + uTime * 0.1)), 6.0), 0.55);
          vec3 c = mix(uBell, uRim, margin) * (0.35 + 1.5 * f);
          c += uRim * pow(margin, 3.0) * 0.72;
          c += uCanal * canals * uCanalK * (0.25 + 0.95 * (1.0 - apex)) * (0.35 + 0.65 * margin);
          c += uCanal * apex * 0.18;
          float a = clamp(f * 0.85 + margin * 0.55 + canals * 0.35 * uCanalK, 0.0, 1.0) * uGlow;
          if (a < 0.004) discard;
          gl_FragColor = vec4(softclip(c * a * 1.45), a);
        }`,
    }));
    this.bell.renderOrder = 3;
    this.group.add(this.bell);

    // under-bell: the subumbrella glow that reads when you look up into the animal
    this.glowDisc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 40), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: Object.assign(this.sharedUniforms(), { uColor: { value: new THREE.Color(this.glow.canal) } }),
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: GLSL + /* glsl */`
        precision highp float;
        uniform vec3 uColor; uniform float uTime, uGlow, uPulse;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p);
          float pulse = 0.65 + 0.35 * sin(uTime * uPulse * TAU - 1.0);
          float ring = exp(-pow((d - 0.72) * 5.5, 2.0));
          float core = exp(-d * d * 4.0) * 0.5;
          float veins = pow(abs(sin(atan(p.y, p.x) * 8.0 + uTime * 0.4)), 8.0) * 0.5;
          float a = (ring + core + ring * veins) * uGlow * (0.55 + 0.55 * pulse);
          if (a < 0.004) discard;
          gl_FragColor = vec4(softclip(uColor * a * 1.6), a);
        }`,
    }));
    this.glowDisc.rotation.x = Math.PI / 2;
    this.glowDisc.position.y = this.R * 0.16;
    this.glowDisc.renderOrder = 4;
    this.group.add(this.glowDisc);

    this.tentacles = this.makeRibbon({ count: tentacles, segs: 26, width: 0.035, taper: 0.15, len: tentacleLen, kind: "thin" });
    this.arms = this.makeRibbon({ count: arms, segs: 22, width: 0.30, taper: 0.55, len: tentacleLen * 0.62, kind: "arm" });
    this.group.add(this.tentacles.mesh, this.arms.mesh);
  }

  sharedUniforms() {
    return {
      uTime: { value: 0 },
      uPulse: { value: 0.42 },
      uSqueeze: { value: 0.55 },
      uWobble: { value: 0.12 },
      uScale: { value: 1 },
      uGlow: { value: 1 },
    };
  }

  setGlow(name) {
    this.glowName = GLOWS[name] ? name : "abyss";
    this.glow = GLOWS[this.glowName];
    const b = this.bell?.material.uniforms;
    if (b) { b.uRim.value.set(this.glow.rim); b.uBell.value.set(this.glow.bell); b.uCanal.value.set(this.glow.canal); }
    this.glowDisc?.material.uniforms.uColor.value.set(this.glow.canal);
    this.tentacles?.material.uniforms.uColor.value.set(this.glow.arm);
    this.arms?.material.uniforms.uColor.value.set(this.glow.rim);
  }

  /** Ribbons hung from the bell margin: quads along a spine, all motion in the vertex shader. */
  makeRibbon({ count, segs, width, taper, len, kind }) {
    const vertsPer = (segs + 1) * 2;
    const total = count * vertsPer;
    const pos = new Float32Array(total * 3);
    const aT = new Float32Array(total), aS = new Float32Array(total), aSide = new Float32Array(total), aRnd = new Float32Array(total);
    const idx = [];
    let o = 0;
    for (let c = 0; c < count; c++) {
      const rnd = (Math.sin(c * 91.7 + 17.3) * 43758.5453) % 1;
      for (let s = 0; s <= segs; s++) {
        for (let side = -1; side <= 1; side += 2) {
          const i = o++;
          aT[i] = c / count; aS[i] = s / segs; aSide[i] = side; aRnd[i] = rnd;
        }
      }
      for (let s = 0; s < segs; s++) {
        const a = (c * vertsPer) + s * 2, b = a + 1, cc = a + 2, d = a + 3;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    g.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
    g.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
    g.setAttribute("aRnd", new THREE.BufferAttribute(aRnd, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -len * 0.5, 0), len * 2.2);

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: Object.assign(this.sharedUniforms(), {
        uColor: { value: new THREE.Color(this.glow.arm) },
        uLen: { value: len },
        uWidth: { value: width },
        uTaper: { value: taper },
        uSegs: { value: segs },
        uArm: { value: kind === "arm" ? 1 : 0 },
        uR: { value: this.R },
      }),
      vertexShader: GLSL + /* glsl */`
        attribute float aT, aS, aSide, aRnd;
        uniform float uTime, uPulse, uSqueeze, uLen, uWidth, uTaper, uArm, uR, uScale;
        varying float vS, vGlow; varying vec2 vUvw;
        void main(){
          float seg = aS;
          // hang from the margin; the margin itself clamps shut with the bell
          float w = sin(uTime * uPulse * TAU - 2.6);
          float clamp_ = 0.5 + 0.5 * w;
          float rootR = uR * uScale * (0.92 - 0.20 * clamp_);
          float ang = aT * TAU + (uArm > 0.5 ? 0.4 : 0.0) + aRnd * 0.25 + uTime * 0.05;
          vec3 root = vec3(cos(ang) * rootR, -0.02 * uScale, sin(ang) * rootR);

          float L = uLen * uScale * (0.75 + 0.55 * aRnd);
          // each segment lags the one above: the delay is what makes a tentacle trail
          float lag = seg * 2.9 - uTime * uPulse * TAU;
          float sway = 0.30 + 0.85 * seg;
          float push = uSqueeze * 0.5 * sin(seg * 3.4 - uTime * uPulse * TAU + 1.0) * seg;

          vec3 tangent = vec3(
            sin(lag) * 0.30 * sway + cos(ang) * push,
            -1.0,
            cos(lag) * 0.30 * sway + sin(ang) * push);
          vec3 p = root + normalize(tangent) * (seg * L);

          // width across, tapering; arms are frilled along their edge
          vec3 across = normalize(cross(tangent, vec3(cos(ang), 0.0, sin(ang)) + vec3(1e-4)));
          float half_ = uWidth * (1.0 - uTaper * seg) * (0.6 + 0.6 * aRnd);
          if (uArm > 0.5) half_ *= 0.75 + 0.45 * sin(seg * 22.0 + uTime * 1.6 + aT * TAU);
          p += across * aSide * half_;
          p += vec3(sin(seg * 9.0 + uTime + aT * 20.0), 0.0, cos(seg * 8.0 - uTime * 0.8)) * 0.04 * seg * (uArm > 0.5 ? 2.2 : 1.0);

          vS = seg; vUvw = vec2(aSide * 0.5 + 0.5, seg);
          vGlow = 1.0 - seg;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: GLSL + /* glsl */`
        precision highp float;
        uniform vec3 uColor; uniform float uTime, uGlow, uArm;
        varying float vS, vGlow; varying vec2 vUvw;
        void main(){
          float edge = 1.0 - abs(vUvw.x - 0.5) * 2.0;
          float a = pow(clamp(edge, 0.0, 1.0), 1.2) * (1.0 - pow(vS, 1.5)) * uGlow;
          vec3 c = uColor * (0.55 + 1.35 * vGlow);
          c += uColor * pow(1.0 - vS, 8.0) * 1.4;            // bright where it leaves the bell
          float bead = 0.75 + 0.35 * sin(vS * 40.0 - uTime * 3.0);
          a *= mix(bead, 1.0, 0.45);
          if (a < 0.004) discard;
          gl_FragColor = vec4(softclip(c * a * 1.5), a);
        }`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.name = kind === "arm" ? "arms" : "tentacles";
    return {
      mesh, material: mat, geometry: g, segs, ribbons: count,
      /** show only the first n ribbons (each is segs quads of 6 indices) */
      setRibbons(n) { g.setDrawRange(0, Math.max(0, Math.min(n, count)) * segs * 6); },
    };
  }

  set count(v) {
    this.tentacles.setRibbons(v);
  }

  sync(u) {
    for (const m of [this.bell.material, this.glowDisc.material, this.tentacles.material, this.arms.material]) {
      for (const k of ["uTime", "uPulse", "uSqueeze", "uWobble", "uScale", "uGlow"]) {
        if (m.uniforms[k] && u[k] !== undefined) m.uniforms[k].value = u[k];
      }
    }
    if (u.len !== undefined) this.tentacles.material.uniforms.uLen.value = u.len;
    if (u.arms !== undefined) this.arms.setRibbons(u.arms);
  }
}

/** Shafts of light from the surface far above: additive quads with an animated fBm mask. */
export function lightShafts({ count = 6, width = 26, height = 70, color = "#59c8ff" } = {}) {
  const group = new THREE.Group();
  group.name = "shafts";
  const mats = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: i * 7.3 }, uColor: { value: new THREE.Color(color) },
        uStrength: { value: 1 }, uWidthK: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: GLSL + /* glsl */`
        precision highp float;
        uniform float uTime, uSeed, uStrength, uWidthK;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main(){
          float v = vUv.y;                       // 0 at depth, 1 at the surface
          float u = vUv.x;
          float sway = (fbm2(vec2(u * 2.2 + uSeed, v * 0.6 - uTime * 0.045)) - 0.5) * 0.32;
          float core = smoothstep(0.5 + 0.16 * uWidthK, 0.0, abs(u - 0.5 + sway));
          float tex = fbm2(vec2(u * 9.0 + uSeed * 2.0, v * 3.0 - uTime * 0.22)) * 0.85 + 0.25;
          float fall = pow(v, 1.55);
          float shimmer = 0.7 + 0.3 * sin(uTime * 0.8 + uSeed + v * 6.0);
          float a = core * tex * fall * shimmer * uStrength * 0.30;
          if (a < 0.003) discard;
          gl_FragColor = vec4(softclip(uColor * a * 2.1), a);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width * (0.5 + ((i * 37) % 11) / 11), height), mat);
    const a = (i / count) * Math.PI * 2 + 0.4;
    m.position.set(Math.cos(a) * (14 + (i % 3) * 9), height * 0.42, Math.sin(a) * (14 + (i % 4) * 8) - 6);
    m.rotation.z = (i % 2 ? 1 : -1) * 0.07;
    group.add(m);
    mats.push(mat);
  }
  return {
    group, materials: mats,
    set count(v) { group.children.forEach((c, i) => { c.visible = i < v; }); },
    update(t, strength) {
      for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.uStrength.value = strength; }
    },
  };
}

/** The near-surface: a shimmering ceiling seen from below, and the deep gradient around everything. */
export function waterDome({ radius = 180, top = "#0a2c46", mid = "#04121f", deep = "#01050c", surface = 46 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) },
      uDeep: { value: new THREE.Color(deep) }, uSurface: { value: surface },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: GLSL + /* glsl */`
      precision highp float;
      uniform float uTime, uSurface;
      uniform vec3 uTop, uMid, uDeep;
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 c = mix(uDeep, uMid, smoothstep(-0.55, 0.05, h));
        c = mix(c, uTop, smoothstep(0.02, 0.75, h));
        // the underside of the surface: caustic-ish ripples, brightest overhead
        float up = smoothstep(0.35, 0.95, h);
        float caustic = pow(vnoise2(d.xz / max(0.08, (1.0 - h)) * 1.6 + uTime * 0.05), 3.0);
        float caustic2 = pow(vnoise2(d.xz / max(0.08, (1.0 - h)) * 3.4 - uTime * 0.08), 4.0);
        c += uTop * up * (caustic * 1.6 + caustic2 * 1.1) * 0.55;
        // suspended particles catching the light, denser near the surface
        float motes = pow(vnoise3(d * 40.0 + vec3(0.0, uTime * 0.05, 0.0)), 22.0) * 0.6;
        c += uTop * motes * (0.2 + 0.8 * up);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), mat);
  mesh.frustumCulled = false;
  mesh.name = "waterDome";
  mesh.renderOrder = -10;
  return { mesh, material: mat, uniforms: mat.uniforms };
}

export function marineSnow({ count = 700, area = 60 } = {}) {
  const f = sparkleField({ count, radius: area * 0.5, size: [0.35, 1.5], cols: ["#bfe0ff", "#8fc8f0", "#e8f6ff"], drift: 1 });
  const pos = f.points.geometry.attributes.position;
  const vel = new Float32Array(count);
  for (let i = 0; i < count; i++) vel[i] = 0.15 + Math.random() * 0.5;
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
        a[k + 1] -= vel[i] * dt;
        a[k] += Math.sin(t * 0.3 + i) * dt * 0.12;
        if (a[k + 1] < -area * 0.4) { a[k + 1] = area * 0.45; a[k] = (Math.random() - 0.5) * area; a[k + 2] = (Math.random() - 0.5) * area; }
      }
      pos.needsUpdate = true;
      f.material.uniforms.uTime.value = t;
    },
  };
}
