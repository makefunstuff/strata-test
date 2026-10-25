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
    uGainPre: { value: 1.0 },
    uSat: { value: 1.16 },
    uContrast: { value: 1.05 },
    uLift: { value: 0.012 },
    uTint: { value: 0.06 },
    uShadowTint: { value: new THREE.Color(0x2a3550) },
    uHiTint: { value: new THREE.Color(0xfff2d8) },
    uFilm: { value: 0.0 },
    uVigColor: { value: new THREE.Color(0x000000) },
    uGlowColor: { value: new THREE.Color(0x2a6ea8) },
    uAmbient: { value: new THREE.Color(0x10151f) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec3 uGlowColor;
    uniform vec3 uAmbient;
    uniform float uTime, uCurvature, uOverscan, uScan, uScanPitch, uMask, uMaskPitch,
                  uPixel, uAberration, uGlow, uVignette, uBeam, uFlicker, uNoise, uGain,
                  uGainPre, uSat, uContrast, uLift, uTint, uFilm;
    uniform vec3 uShadowTint, uHiTint, uVigColor;
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

      // --- the signal, before the glass: this is the part that used to sit after the
      // phosphor and before ACES, which is what made all five games read as one flat,
      // milky picture. A real chain is electronics-then-tube: grade the signal first, in
      // display terms, and only then let the phosphor multiply it. The contrast S-curve and
      // the saturation now land before tone mapping instead of being re-crushed by it, and
      // uGain is split: uGainPre is a linear exposure (safe before ACES), the creative level
      // comes back afterwards as uGain.
      col *= uGainPre;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSat);
      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
      // split-tone: the phosphor's own warm/cool bias, shadows one way, highlights the other.
      // This is the axis that gave every game the same blue cast: they all used one glowColor.
      float wl = clamp(luma, 0.0, 1.0);
      vec3 tint = mix(uShadowTint, uHiTint, smoothstep(0.18, 0.86, wl));
      col *= mix(vec3(1.0), tint, uTint);

      // --- the glass: phosphor bleed, scanlines, aperture grille
      vec2 px = 1.0 / grid;
      vec3 bleed = texture2D(tDiffuse, su + vec2(px.x, 0.0)).rgb
                 + texture2D(tDiffuse, su - vec2(px.x, 0.0)).rgb
                 + texture2D(tDiffuse, su + vec2(0.0, px.y)).rgb
                 + texture2D(tDiffuse, su - vec2(0.0, px.y)).rgb;
      // The phosphor tints the light that comes OFF the glass, but only lightly: bleed is a
      // physical smear of whatever is already there, and tinting it hard (uGlowColor at full
      // chroma) painted a saturated green/blue halo around every bright object the moment the
      // bloom pass happened to be enabled — the fps watchdog turns bloom off on this box, which
      // is what hid it. Kept near-white on purpose; the family's colour lives in the black lift.
      col += bleed * (0.25 + uGlowColor * 0.18) * uGlow;

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
      col += uGlowColor * beam * uBeam * 0.25;
      col *= 1.0 + uFlicker * (0.6 * sin(uTime * 6.3) + 0.4 * sin(uTime * 91.0));
      float n = fract(sin(dot(su * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uNoise;
      // fine film grain, ~1/2 pixel: a little tooth in the flats instead of a painted look
      if (uFilm > 0.0) {
        float fn = fract(sin(dot(gl_FragCoord.xy * 0.5 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (fn - 0.5) * uFilm * (1.0 - 0.7 * clamp(luma, 0.0, 1.0));
      }

      // glass: vignette (tinted, not crushed to neutral black), then the rounded tube edge
      col *= mix(1.0, smoothstep(1.8, 0.35, length(q * vec2(0.9, 1.0))), uVignette);
      col = mix(col, uVigColor, uVignette * 0.18 * smoothstep(0.45, 1.35, length(q * vec2(0.9, 1.0))));
      float inside = step(0.0, min(su.x, min(su.y, min(1.0 - su.x, 1.0 - su.y))));
      float d = roundedBox(p, uTube, uTubeR);
      float rim = 1.0 - smoothstep(-0.02, 0.06, d);
      float on = inside * rim;
      col = col * on + uGlowColor * 0.02 * (1.0 - on);

      // Level and black lift come back AFTER the glass and after the tube mask: the grille and
      // the scanlines multiply the picture flat, so the neon is restored here — and the lift
      // only applies to lit glass, so the bezel outside the aperture stays black instead of
      // turning into a grey rectangle (which is what a pre-mask lift did).
      col = max(col, 0.0) * uGain;
      // a lit tube never shows true black — the lift carries the phosphor's own colour
      col += uLift * on * (vec3(1.0) + uAmbient) * 0.5;
      col = max(col, 0.0);

      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Phosphor families. A tube's phosphor decides its colour identity more than anything else in
 * the chain, and until now every game used the same one (0x2a6ea8), which is most of why the
 * five pages look like one page. `base` is the unpowered glass, `glow` the lit phosphor, and
 * `shadow/hi` the split-tone bias the grade pulls toward. Pass one to attachCRT as `phosphor`.
 */
export const PHOSPHORS = {
  p22: { base: 0x101a14, glow: 0x3f8f5a, shadow: 0x1e3a33, hi: 0xfff0da },   // green arcade
  p31: { base: 0x1a1712, glow: 0xb08a4a, shadow: 0x3a2c1e, hi: 0xffe6bd },   // warm white / amber
  p4:  { base: 0x12151f, glow: 0x3f74b8, shadow: 0x24304e, hi: 0xe8f3ff },   // blue, the old house look
  p43: { base: 0x1a1216, glow: 0xa8506e, shadow: 0x3c1e2a, hi: 0xffe0d0 },   // magenta/rose
};

// look: "arcade" (chunky, heavy scanlines) | "cabinet" (medium) | "glass" (subtle)
export const CRT_PRESETS = {
  // Each preset darkens the picture by a known amount, so uGain puts the level back.
  // The grade moved in front of the phosphor, so the picture arrives at the glass already
  // contrasted: less gain is needed to hold the level than the old flat version demanded.
  arcade: { uCurvature: 0.13, uOverscan: 1.16, uTube: new THREE.Vector2(0.88, 0.82), uTubeR: 0.15, uGain: 1.44, uGainPre: 1.1,
            uScan: 0.34, uScanPitch: 3.6, uMask: 0.22, uMaskPitch: 3.0, uPixel: 1.0, uAberration: 0.0016,
            uGlow: 0.14, uVignette: 0.46, uBeam: 0.03, uFlicker: 0.024, uNoise: 0.014,
            uSat: 1.14, uContrast: 1.12, uLift: 0.016, uTint: 0.045, uFilm: 0.012 },
  cabinet: { uCurvature: 0.095, uOverscan: 1.12, uTube: new THREE.Vector2(0.90, 0.85), uTubeR: 0.14, uGain: 1.34, uGainPre: 1.08,
             uScan: 0.24, uScanPitch: 3.2, uMask: 0.17, uMaskPitch: 3.0, uPixel: 1.0, uAberration: 0.0013,
             uGlow: 0.11, uVignette: 0.4, uBeam: 0.026, uFlicker: 0.02, uNoise: 0.011,
             uSat: 1.12, uContrast: 1.1, uLift: 0.014, uTint: 0.035, uFilm: 0.008 },
  glass: { uCurvature: 0.055, uOverscan: 1.05, uTube: new THREE.Vector2(0.97, 0.94), uTubeR: 0.12, uGain: 1.18, uGainPre: 1.05,
           uScan: 0.14, uScanPitch: 3.0, uMask: 0.1, uMaskPitch: 3.0, uPixel: 1.0, uAberration: 0.0008,
           uGlow: 0.08, uVignette: 0.34, uBeam: 0.018, uFlicker: 0.014, uNoise: 0.006,
           uSat: 1.08, uContrast: 1.07, uLift: 0.011, uTint: 0.025, uFilm: 0.004 },
};

/** Aperture geometry for the cabinet bezel, in canvas fractions (must match the shader). */
export function tubeRect(tx = 0.94, ty = 0.90, r = 0.14) {
  return { x: (1 - tx) / 2, y: (1 - ty) / 2, w: tx, h: ty, rx: r / 2, ry: r / 2 };
}

/**
 * Adds the CRT pass to a composer (last, before OutputPass) and wires the glass overlay.
 * Returns { pass, setEnabled, toggle, setSize, update }.
 */
export function attachCRT(composer, renderer, { look = "cabinet", overrides = {}, overlay = true, bezel = {}, phosphor = null } = {}) {
  const pass = new ShaderPass(CRTShader);
  const u = pass.uniforms;
  // A uniform the shader declares and the material does not provide silently defaults to 0 in
  // WebGL — which is how a saturation grade (uSat 0) turned the whole tube flat grey for four
  // sweeps without one console message. Say it out loud instead.
  const declared = (CRTShader.fragmentShader.match(/uniform\s+\w+\s+([^;]+);/g) ?? [])
    .flatMap((d) => d.replace(/uniform\s+\w+\s+/, "").split(",").map((s) => s.trim().replace(/;.*/, "").replace(/\[.*/, "")))
    .filter((n) => n && !/^(t[A-Z]|sampler)/.test(n)); // samplers are wired by ShaderPass, not presets
  const missing = declared.filter((n) => !(n in u));
  if (missing.length) console.warn(`CRTShader: uniforms declared in GLSL but not provided: ${missing.join(", ")}`);
  for (const [k, v] of Object.entries({ ...CRT_PRESETS[look], ...overrides })) {
    if (!u[k] && declared.includes(k)) console.warn(`CRTShader: preset sets ${k}, which the shader does not declare`);
    if (u[k]) u[k].value = v;
  }

  // Phosphor identity: a named family, and/or the cabinet's own accent colour mixed into it so
  // the tube, the label plate and the picture agree. Runs after the preset/overrides, then every
  // colour uniform is normalised back to a THREE.Color — an override that assigned a hex number
  // or a CSS string would otherwise reach WebGL as a scalar and silently read as vec3(0).
  const ph = typeof phosphor === "string" ? (PHOSPHORS[phosphor] ?? PHOSPHORS.p4)
    : (phosphor && typeof phosphor === "object" ? phosphor : null);
  const accent = bezel && typeof bezel.accent === "string" ? new THREE.Color(bezel.accent) : null;
  const glow = (ph ? new THREE.Color(ph.glow) : new THREE.Color(0x2a6ea8)).clone();
  if (accent) glow.lerp(accent, 0.35);
  u.uGlowColor.value.copy(glow).lerp(new THREE.Color(0xffffff), 0.6);   // tint, not a flood
  u.uAmbient.value.copy(ph ? new THREE.Color(ph.base) : glow.clone().multiplyScalar(0.12));
  if (ph) {
    u.uShadowTint.value.set(ph.shadow);
    u.uHiTint.value.set(ph.hi);
  } else if (accent) {
    u.uGlowColor.value.copy(new THREE.Color(0x2a6ea8).lerp(accent, 0.45));
  }
  for (const name of ["uGlowColor", "uAmbient", "uShadowTint", "uHiTint", "uVigColor"]) {
    const v = u[name].value;
    // THREE.Color.setHex/setStyle already convert sRGB hex to working (linear) space when
    // ColorManagement is on, so no extra convertSRGBToLinear() here — that would double it.
    u[name].value = v instanceof THREE.Color ? v : new THREE.Color(0xffffff);
  }
  // the vignette falls off toward the phosphor's own unpowered glass, not neutral black
  u.uVigColor.value.copy(u.uShadowTint.value).multiplyScalar(0.55);
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
