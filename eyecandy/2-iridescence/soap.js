// Eye candy 2 — Iridescence. Soap bubbles as thin films: the colour is not a texture and not a
// gradient, it is interference. Optical path length through the film (which drains downward and
// swirls) divided by the wavelength per channel drives a cosine, so the same bubble shows different
// colours at different thicknesses and the classic black film appears where it thins out. Fresnel
// rim, refracted backdrop, a hot specular pair, wobble in the vertex shader, and a pop.
import * as THREE from "three";
import { GLSL, sparkleField } from "../shared/candy.js";

const ENV_FN = /* glsl */`
  // a painted backdrop the bubbles can refract and reflect: a deep room with three coloured lamps
  vec3 backdrop(vec3 d){
    float h = d.y;
    vec3 c = mix(vec3(0.012, 0.020, 0.036), vec3(0.045, 0.030, 0.075), smoothstep(-0.6, 0.9, h));
    c = mix(vec3(0.010, 0.014, 0.026), c, smoothstep(-1.0, -0.05, h));
    vec3 l1 = normalize(vec3(-0.62, 0.42, 0.66));
    vec3 l2 = normalize(vec3(0.74, 0.18, 0.42));
    vec3 l3 = normalize(vec3(0.05, -0.30, -0.9));
    c += vec3(0.55, 0.30, 0.85) * pow(max(dot(d, l1), 0.0), 26.0) * 0.55;
    c += vec3(0.20, 0.75, 0.85) * pow(max(dot(d, l2), 0.0), 22.0) * 0.55;
    c += vec3(0.95, 0.55, 0.25) * pow(max(dot(d, l3), 0.0), 14.0) * 0.30;
    c += vec3(0.35, 0.45, 0.70) * pow(max(h, 0.0), 3.0) * 0.12;
    return c;
  }`;

export const FILM_GLSL = /* glsl */`
  // Thin-film interference for air | film | air. d is the film thickness in nanometres and
  // cosT the cosine of the refracted angle inside the film. Three wavelengths, one cosine each.
  vec3 thinFilm(float d, float cosT){
    vec3 lambda = vec3(650.0, 510.0, 445.0);          // nm — R, G, B
    float opd = 2.0 * 1.333 * d * cosT;               // optical path difference
    vec3 ph = opd / lambda;                           // in wavelengths
    // two harmonics: the first order does the colouring, the second keeps the pastels honest
    vec3 i = 0.5 - 0.5 * cos(TAU * ph);
    vec3 i2 = 0.5 - 0.5 * cos(TAU * ph * 2.0 + 0.35);
    return clamp(i * 0.78 + i2 * 0.30, 0.0, 1.0);
  }`;

export class Bubbles {
  constructor(scene, { count = 14, radius = [0.7, 2.4], field = 16 } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "bubbles";
    scene.add(this.group);
    this.P = {
      thickness: 420, variance: 330, swirl: 0.9, drain: 0.55, irid: 1.5,
      rim: 1.0, refract: 1.0, spec: 1.0, wobble: 0.055, rise: 0.32, saturation: 1.1,
    };
    this.field = field;
    this.radius = radius;
    this.items = [];
    this.build(count);
  }

  makeMaterial() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uThickness: { value: 380 },
        uVariance: { value: 240 },
        uSwirl: { value: 0.9 },
        uDrain: { value: 0.55 },
        uIrid: { value: 1.15 },
        uRim: { value: 1 },
        uRefract: { value: 1 },
        uSpec: { value: 1 },
        uWobble: { value: 0.055 },
        uSat: { value: 1.1 },
        uPop: { value: -0.001 },
        uKey: { value: new THREE.Vector3(-0.55, 0.62, 0.56).normalize() },
        uFill: { value: new THREE.Vector3(0.7, 0.12, 0.5).normalize() },
      },
      vertexShader: GLSL + /* glsl */`
        uniform float uTime, uSeed, uWobble;
        varying vec3 vN, vW, vUvw;
        void main(){
          vec3 p = position;
          // the film breathes: low-order wobble along the sphere, no two bubbles in phase
          float w = vnoise3(position * 1.7 + vec3(uSeed, uTime * 0.35, -uTime * 0.22)) - 0.5
                  + 0.55 * (sin(position.y * 2.6 + uTime * 1.1 + uSeed) * 0.5
                          + sin(position.x * 3.1 - uTime * 0.8 + uSeed * 1.7) * 0.5);
          p += normal * w * uWobble;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vW = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          vUvw = position;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: GLSL + ENV_FN + FILM_GLSL + /* glsl */`
        precision highp float;
        uniform float uTime, uSeed, uThickness, uVariance, uSwirl, uDrain, uIrid, uRim, uRefract, uSpec, uSat, uPop;
        uniform vec3 uKey, uFill;
        varying vec3 vN, vW, vUvw;
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          float NoV = clamp(dot(N, V), 0.0, 1.0);

          // rupture: a hole grows from a seed point and the rest of the film thins to nothing
          if (uPop > 0.0) {
            vec3 seed = normalize(hash33(vec3(3.1, uSeed, 1.7)) * 2.0 - 1.0);
            float dd = distance(normalize(vUvw), seed);
            if (dd < uPop * 1.9) discard;
          }

          // the film drains: thick at the bottom, thin at the top, with marbled swirls on top
          float y = vUvw.y * 0.5 + 0.5;
          vec2 sp = vec2(atan(vUvw.z, vUvw.x) * 0.6, vUvw.y);
          vec2 flow = vec2(uTime * 0.045 * uSwirl, uTime * 0.11 * uDrain);
          float marble = fbm2(sp * 2.4 + flow) * 0.7 + fbm2(sp * 6.5 - flow * 1.7) * 0.3;
          float streak = fbm2(vec2(sp.x * 9.0, sp.y * 1.4 - uTime * 0.25 * uDrain));
          float d = uThickness
                  + (marble - 0.5) * 2.0 * uVariance
                  + (y - 0.5) * uVariance * 1.6 * uDrain
                  + (streak - 0.5) * uVariance * 0.55;
          // grazing light travels further through the film than head-on light
          float cosT = sqrt(max(0.0, 1.0 - (1.0 - NoV * NoV) / (1.333 * 1.333)));
          vec3 film = pow(thinFilm(max(0.0, d), max(0.08, cosT)), vec3(0.85));

          // Fresnel: a soap bubble is a mirror at the rim and almost invisible face-on
          float F = pow(1.0 - NoV, 3.4) * 0.92 + 0.03;
          vec3 R = reflect(-V, N);
          vec3 refr = refract(-V, N, 1.0 / 1.333);
          vec3 envR = backdrop(R);
          vec3 envT = backdrop(refract(V, -N, 1.0 / 1.333));
          // the far side of the sphere focuses the light into a bright spot behind the bubble
          float back = pow(max(dot(normalize(-refr), -V), 0.0), 6.0);
          // the film is lit by the room, not hidden by it: ambient plus the three coloured lamps,
          // and it shows face-on as well as at the rim (a real bubble is mostly its own colour)
          vec3 lightSum = vec3(0.42) + envR * 3.2;
          vec3 col = film * uIrid * lightSum * (0.50 + 1.30 * F)
                   + envT * (1.0 - F) * 0.55 * uRefract
                   + film * back * 0.60;

          // two highlights: a tight key and a broad fill, both shifted by the wobble
          vec3 H = normalize(uKey + V);
          col += vec3(1.0, 0.98, 0.95) * pow(max(dot(N, H), 0.0), 900.0) * 6.5 * uSpec;
          vec3 H2 = normalize(uFill + V);
          col += vec3(0.75, 0.85, 1.0) * pow(max(dot(N, H2), 0.0), 26.0) * 0.28 * uSpec;

          // rim halo, then desaturate toward the black film where it has drained thin
          col += film * pow(1.0 - NoV, 5.0) * uRim * 0.85;
          float lum = sat(col);
          col = mix(vec3(lum), col, uSat);
          float a = clamp(lum * 1.25 + F * 0.55, 0.0, 1.0);
          if (uPop > 0.0) a *= smoothstep(0.0, 0.55, uPop) * (1.0 - uPop * 0.75);
          if (a < 0.004) discard;
          gl_FragColor = vec4(softclip(col), a);
        }`,
    });
    return mat;
  }

  build(count = this.items.length) {
    for (const b of this.items) {
      this.group.remove(b.mesh);
      b.mesh.geometry.dispose(); b.mesh.material.dispose();
    }
    this.items = [];
    const geo = new THREE.SphereGeometry(1, 56, 40);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, this.makeMaterial());
      const r = this.radius[0] + Math.random() * (this.radius[1] - this.radius[0]);
      mesh.scale.setScalar(r);
      const b = {
        mesh, r,
        x: (Math.random() - 0.5) * this.field * 1.6,
        y: (Math.random() - 0.5) * this.field,
        z: (Math.random() - 0.5) * this.field * 0.8,
        vy: 0.25 + Math.random() * 0.6,
        phase: Math.random() * 6.283,
        spin: (Math.random() - 0.5) * 0.4,
        pop: -0.001, popping: false,
      };
      mesh.position.set(b.x, b.y, b.z);
      mesh.userData.bubble = b;
      this.group.add(mesh);
      this.items.push(b);
    }
    return this.items;
  }

  update(dt, t) {
    const P = this.P;
    const top = this.field * 0.62, bottom = -this.field * 0.7;
    for (const b of this.items) {
      const u = b.mesh.material.uniforms;
      u.uTime.value = t;
      u.uThickness.value = P.thickness;
      u.uVariance.value = P.variance;
      u.uSwirl.value = P.swirl;
      u.uDrain.value = P.drain;
      u.uIrid.value = P.irid;
      u.uRim.value = P.rim;
      u.uRefract.value = P.refract;
      u.uSpec.value = P.spec;
      u.uWobble.value = P.wobble;
      u.uSat.value = P.saturation;

      if (b.popping) {
        b.pop = Math.min(1, b.pop + dt * 2.6);
        u.uPop.value = b.pop;
        if (b.pop >= 1) { b.popping = false; b.pop = -0.001; u.uPop.value = -0.001; this.reset(b); }
      } else {
        b.y += P.rise * b.vy * dt;
        if (b.y > top) { b.y = bottom; }
        b.mesh.position.set(
          b.x + Math.sin(t * 0.42 + b.phase) * 0.9,
          b.y,
          b.z + Math.cos(t * 0.33 + b.phase * 1.3) * 0.7);
        b.mesh.rotation.y += b.spin * dt * 0.35;
      }
    }
  }

  reset(b) {
    b.x = (Math.random() - 0.5) * this.field * 1.6;
    b.z = (Math.random() - 0.5) * this.field * 0.8;
    b.y = -this.field * 0.7;
    b.phase = Math.random() * 6.283;
    b.vy = 0.25 + Math.random() * 0.6;
  }

  pop(b) { if (b && !b.popping) { b.popping = true; b.pop = 0.0001; } }
}

/** Soft out-of-focus lights behind the bubbles: gives the picture depth and something to bokeh. */
export function bokeh(scene, { count = 26, spread = 44 } = {}) {
  const f = sparkleField({
    count, radius: spread * 0.5, size: [26, 96],
    cols: ["#5a3fa8", "#2e7f9e", "#a8552e", "#7a3f8f", "#2f6f6a", "#8f7a2f"], drift: 0,
  });
  f.points.position.z = -26;
  f.points.name = "bokeh";
  scene.add(f.points);
  return f;
}
