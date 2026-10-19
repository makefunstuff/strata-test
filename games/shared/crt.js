// Shared CRT / arcade-monitor post shader for the five games: barrel "inflate" distortion,
// scanlines, an aperture-grille phosphor mask, chromatic aberration, a rolling beam,
// phosphor bleed, flicker, grime and a rounded glass tube edge.
//
//   import { attachCRT } from "../shared/crt.js";
//   const crt = attachCRT(composer, renderer, { look: "arcade" });
//   crt.setEnabled(false);            // C key in every game
//
// One full-screen pass; add it as the last pass before OutputPass. `look` presets the strength
// so an arcade game can be chunky while the terrain showcase stays almost clean.
import * as THREE from "three";
import { createBezel } from "./bezel.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export const CRTShader = {
  name: "CRTShader",
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCurvature: { value: 0.2 },
    uOverscan: { value: 1.04 },
    uTube: { value: new THREE.Vector2(0.94, 0.90) },
    uTubeR: { value: 0.14 },
    uScan: { value: 0.5 },
    uScanPitch: { value: 2.6 },
    uMask: { value: 0.45 },
    uMaskPitch: { value: 3.0 },
    uPixel: { value: 1.0 },
    uAberration: { value: 0.0016 },
    uGlow: { value: 0.35 },
    uVignette: { value: 0.55 },
    uBeam: { value: 0.05 },
    uFlicker: { value: 0.035 },
    uNoise: { value: 0.02 },
    uGain: { value: 1.6 },
    uGlowColor: { value: new THREE.Color(0x2a6ea8) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec3 uGlowColor;
    uniform float uTime, uCurvature, uOverscan, uScan, uScanPitch, uMask, uMaskPitch,
                  uPixel, uAberration, uGlow, uVignette, uBeam, uFlicker, uNoise, uGain;
    uniform vec2 uTube;
    uniform float uTubeR;
    varying vec2 vUv;

    // "inflate": the corners bow outward, the classic barrel warp of a tube.
    // r2 is normalised by the screen corner, so uCurvature is the corner scale factor.
    vec2 inflate(vec2 p, float corner2) {
      float r2 = dot(p, p) / max(0.0001, corner2);
      return p * (1.0 + uCurvature * r2);
    }

    // signed distance to a rounded rectangle (the picture tube)
    float roundedBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
    }

    vec3 sampleAb(vec2 uv, vec2 dir) {
      float a = uAberration * (0.2 + dot(dir, dir));
      vec3 c;
      c.r = texture2D(tDiffuse, uv + dir * a).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - dir * a).b;
      return c;
    }

    float band(float x, float c, float w) {
      float d = (x - c) / w;
      return exp(-d * d * 3.2);
    }

    void main() {
      float aspect = uResolution.x / max(1.0, uResolution.y);
      vec2 p = (vUv - 0.5) * 2.0;
      vec2 q = p * vec2(aspect, 1.0);
      vec2 qi = inflate(q * uOverscan, aspect * aspect + 1.0);
      vec2 suv = qi * 0.5 / vec2(aspect, 1.0) + 0.5;

      // chunky pixels: snap the sample point to a coarse grid before sampling
      vec2 grid = uResolution / max(1.0, uPixel);
      vec2 su = (floor(suv * grid) + 0.5) / grid;

      vec3 col = sampleAb(su, q);

      // phosphor bleed so bright pixels bloom on the glass
      vec2 px = 1.0 / grid;
      vec3 bleed = texture2D(tDiffuse, su + vec2(px.x, 0.0)).rgb
                 + texture2D(tDiffuse, su - vec2(px.x, 0.0)).rgb
                 + texture2D(tDiffuse, su + vec2(0.0, px.y)).rgb
                 + texture2D(tDiffuse, su - vec2(0.0, px.y)).rgb;
      col += bleed * 0.25 * uGlow + uGlowColor * dot(col, vec3(0.333)) * uGlow * 0.22;

      // scanlines, wider where the picture is bright (a beam, not a shutter)
      float sy = su.y * uResolution.y / max(1.0, uScanPitch);
      float scan = 0.5 + 0.5 * cos(sy * 6.28318);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col *= mix(1.0, mix(1.0 - uScan, 1.0, scan), clamp(0.35 + lum * 1.2, 0.0, 1.0));

      // aperture grille: one phosphor triad per emulated pixel
      float fx = fract(su.x * uResolution.x / (uMaskPitch * max(1.0, uPixel)));
      vec3 mask = vec3(band(fx, 1.0 / 6.0, 0.16), band(fx, 3.0 / 6.0, 0.16), band(fx, 5.0 / 6.0, 0.16));
      col *= mix(vec3(1.0), mask * 1.45, uMask);

      // Rolling beam: a wide soft brightening band. The phase is fract over one full screen
      // height, so the Gaussian has the same value at both ends and the wrap is continuous —
      // scaling su.y by 0.5 made the two ends differ and drew a hard bright line across the tube.
      float beamPhase = fract(su.y + uTime * 0.08);
      float beam = exp(-pow((beamPhase - 0.5) * 5.0, 2.0));
      col *= 1.0 + beam * uBeam * 4.0;
      col += uGlowColor * beam * uBeam * 0.9;
      col *= 1.0 + uFlicker * (0.6 * sin(uTime * 6.3) + 0.4 * sin(uTime * 91.0));
      float n = fract(sin(dot(su * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uNoise;

      // glass: vignette, then the rounded tube edge
      col *= mix(1.0, smoothstep(1.8, 0.35, length(q * vec2(0.9, 1.0))), uVignette);
      float inside = step(0.0, min(su.x, min(su.y, min(1.0 - su.x, 1.0 - su.y))));
      float d = roundedBox(p, uTube, uTubeR);
      float rim = 1.0 - smoothstep(-0.02, 0.06, d);
      float on = inside * rim;
      col = col * on + uGlowColor * 0.02 * (1.0 - on);
      col *= uGain;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

// look: "arcade" (chunky, heavy scanlines) | "cabinet" (medium) | "glass" (subtle)
export const CRT_PRESETS = {
  // Each preset darkens the picture by a known amount, so uGain puts the level back.
  arcade: { uCurvature: 0.13, uOverscan: 1.16, uTube: new THREE.Vector2(0.88, 0.82), uTubeR: 0.15, uGain: 1.85, uScan: 0.42, uScanPitch: 3.6, uMask: 0.34,
            uMaskPitch: 3.0, uPixel: 1.0, uAberration: 0.0016, uGlow: 0.4, uVignette: 0.42,
            uBeam: 0.035, uFlicker: 0.035, uNoise: 0.02 },
  cabinet: { uCurvature: 0.095, uOverscan: 1.12, uTube: new THREE.Vector2(0.90, 0.85), uTubeR: 0.14, uGain: 1.7, uScan: 0.3, uScanPitch: 3.2, uMask: 0.26,
             uMaskPitch: 3.0, uPixel: 1.0, uAberration: 0.0013, uGlow: 0.32, uVignette: 0.38,
             uBeam: 0.03, uFlicker: 0.03, uNoise: 0.016 },
  glass: { uCurvature: 0.055, uOverscan: 1.05, uTube: new THREE.Vector2(0.97, 0.94), uTubeR: 0.12, uGain: 1.45, uScan: 0.18, uScanPitch: 3.0, uMask: 0.15,
           uMaskPitch: 3.0, uPixel: 1.0, uAberration: 0.0008, uGlow: 0.24, uVignette: 0.32,
           uBeam: 0.02, uFlicker: 0.02, uNoise: 0.01 },
};

/** Aperture geometry for the cabinet bezel, in canvas fractions (must match the shader). */
export function tubeRect(tx = 0.94, ty = 0.90, r = 0.14) {
  return { x: (1 - tx) / 2, y: (1 - ty) / 2, w: tx, h: ty, rx: r / 2, ry: r / 2 };
}

/**
 * Adds the CRT pass to a composer (last, before OutputPass) and wires the glass overlay.
 * Returns { pass, setEnabled, toggle, setSize, update }.
 */
export function attachCRT(composer, renderer, { look = "cabinet", overrides = {}, overlay = true, bezel = {} } = {}) {
  const pass = new ShaderPass(CRTShader);
  const u = pass.uniforms;
  for (const [k, v] of Object.entries({ ...CRT_PRESETS[look], ...overrides })) {
    if (u[k]) u[k].value = v;
  }
  composer.addPass(pass);

  let glass = null;
  let tube = null;
  if (overlay) {
    glass = document.createElement("div");
    glass.className = "crt-glass";
    document.body.appendChild(glass);
    // the plastic cabinet around the tube, sharing the aperture geometry with the shader
    if (bezel) tube = createBezel({ ...bezel, rect: tubeRect(u.uTube.value.x, u.uTube.value.y, u.uTubeR.value) });
  }

  function setEnabled(on) {
    pass.enabled = on;
    if (glass) glass.classList.toggle("off", !on);
    if (tube) tube.setEnabled(on);
    document.body.classList.toggle("crt-off", !on);
  }
  function setSize(w, h, pixelRatio) {
    const pr = pixelRatio ?? renderer.getPixelRatio();
    u.uResolution.value.set(w * pr, h * pr);
    if (tube) tube.resize(w, h);
  }
  function update(elapsed) { u.uTime.value = elapsed; }

  setEnabled(true);
  return { pass, uniforms: u, setEnabled, toggle: () => setEnabled(!pass.enabled), setSize, update, glass, bezel: tube };
}

/** Binds the C key to turning the CRT on and off. Returns true when the key was ours. */
export function crtKey(code, crt) {
  if (code !== "KeyC") return false;
  crt.toggle();
  return true;
}
