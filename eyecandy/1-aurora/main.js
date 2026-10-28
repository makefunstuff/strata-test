// Eye candy 1 — Aurora. A night sky with three procedural star layers and a dust-noised Milky Way,
// seven additive light curtains that wave, ray and shimmer, a moon, silhouette ridgelines and pines,
// drifting snow, and a frozen lake that mirrors the whole sky with a real second render from below —
// rippled, frosted, cracked, with a specular path from the moon down the middle of it.
import * as THREE from "three";
import { createCandy, gradePass, snap } from "../shared/candy.js";
import { nightSky, Aurora, IceLake, ridgeline, pines, snowfall, PALETTES } from "./aurora.js";

const lab = createCandy({
  title: "1 · Aurora — light curtains over a mirrored frozen lake",
  camera: {
    position: [5, 4.6, 74], target: [0, 25, -78], fov: 55, near: 0.5, far: 1400,
    minDistance: 10, maxDistance: 260, maxPolar: Math.PI * 0.492,
  },
  bloom: { strength: 0.62, radius: 0.66, threshold: 0.74, scale: 0.5 },
  exposure: 1.14,
  background: null,
  hints: ["drag to look around", "wheel to move in", "click = solar flare", "C palette", "M moon", "Space calm sky"],
  guiTitle: "aurora",
  preset: "high",
});
const { scene, camera, gui, composer, renderer, pointer, orbit } = lab;
orbit.target.set(0, 25, -78);
orbit.update();

const MOON = new THREE.Vector3(-0.42, 0.26, -0.87).normalize();
const sky = nightSky(scene, { moon: MOON });
const aurora = new Aurora(scene, { count: 7, palette: "green veil" });
const ice = new IceLake(scene, { size: 1400, res: 0.5 });
ice.uniforms.uMoon.value.copy(MOON);
const ridgeFar = ridgeline(scene, { radius: 250, height: 46, seed: 3.1, color: 0x060d18 });
const ridgeNear = ridgeline(scene, { radius: 150, height: 30, seed: 8.7, color: 0x03070e });
// two side groves, so the centre of the lake stays open water and can mirror the curtains
const forest = new THREE.Group();
forest.name = "forest";
const groveA = pines(forest, { count: 6, dist: 58, arc: 0.34, offset: -0.86 });
const groveB = pines(forest, { count: 5, dist: 66, arc: 0.30, offset: 0.62 });
const groveC = pines(forest, { count: 4, dist: 92, arc: 0.22, offset: -0.10 });
scene.add(forest);
const snow = snowfall(scene, { count: 900, area: 110 });
const grade = gradePass(composer, { vignette: 1.02, grain: 0.05, tint: 0x8fd8ff, tintAmount: 0.05, saturation: 1.14 });

const P = {
  activity: 1.3, flow: 0.055, rayFreq: 1, softness: 1.25, twist: 0.45, arc: 0.95, shimmer: 0.75, corona: 0.22,
  palette: "green veil", stars: 1, milky: 0.85, moon: 0.5, snow: 1100,
  mirror: true, mirrorScale: 0.5, mirrorMix: 1, ripple: 1, frost: 0.55, cracks: 1, glint: 0.9,
  bloom: 0.62, wind: 0.35, haze: 0.0,
};

// ---- quality presets -------------------------------------------------------------------------
// The mirror pass is a whole second render, so it is what the presets really trade.
function applyQuality(q) {
  const n = q === "low" ? 5 : q === "medium" ? 8 : 11;
  aurora.build(n);
  aurora.setPalette(P.palette);
  ice.scale = q === "low" ? 0.32 : q === "medium" ? 0.45 : 0.55;
  ice.enabled = P.mirror;
  ice.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
  snow.count = q === "low" ? 300 : q === "medium" ? 600 : 900;
  P.snow = snow.count;
}
lab.onQuality(applyQuality);
applyQuality("high");

// ---- gui -------------------------------------------------------------------------------------
const fSky = gui.addFolder("sky");
fSky.add(P, "stars", 0, 2, 0.01).name("stars");
fSky.add(P, "milky", 0, 1.6, 0.01).name("milky way");
fSky.add(P, "moon", 0, 1.4, 0.01).name("moon glow");
fSky.add(P, "haze", 0, 1, 0.01).name("horizon haze");

const fAur = gui.addFolder("curtains");
fAur.add(P, "palette", Object.keys(PALETTES)).name("palette").onChange((v) => { aurora.setPalette(v); tintSpill(); });
fAur.add(P, "activity", 0, 2.2, 0.01).name("activity");
fAur.add(P, "flow", 0, 0.2, 0.001).name("flow");
fAur.add(P, "rayFreq", 0.3, 2.4, 0.01).name("ray density");
fAur.add(P, "softness", 0.5, 2.2, 0.01).name("softness");
fAur.add(P, "twist", 0, 1.4, 0.01).name("sway");
fAur.add(P, "arc", 0.2, 1.4, 0.01).name("brightness");
fAur.add(P, "shimmer", 0, 1.5, 0.01).name("shimmer");
fAur.add(P, "corona", 0, 1, 0.01).name("corona");
fAur.add(P, "wind", 0, 1.5, 0.01).name("wind");

const fIce = gui.addFolder("the lake");
fIce.add(P, "mirror").name("mirror").onChange((v) => { ice.enabled = v; });
fIce.add(P, "mirrorMix", 0, 1.6, 0.01).name("reflection");
fIce.add(P, "ripple", 0, 2.5, 0.01).name("ripple");
fIce.add(P, "frost", 0, 1.2, 0.01).name("frost");
fIce.add(P, "cracks", 0, 2, 0.01).name("cracks");
fIce.add(P, "glint", 0, 2, 0.01).name("moon glint");

const fPost = gui.addFolder("post");
fPost.add(P, "bloom", 0, 2, 0.01).name("bloom").onChange((v) => { lab.bloomPass.strength = v; });
fPost.add(P, "snow", 0, 1600, 10).name("snow").onChange((v) => { snow.count = v; });
gui.add({ flare: () => doFlare() }, "flare").name("⚡ solar flare");

// the horizon takes the colour of the curtains, so the sky reads as lit by them
let spill = new THREE.Color(0x1c7f6a);
function tintSpill() { spill = aurora.setPalette(P.palette) ?? spill; }
tintSpill();

// ---- interaction ------------------------------------------------------------------------------
let flare = 0, calm = 0;
renderer.domElement.addEventListener("pointerup", (e) => {
  if (pointer.moved < 6 && e.button === 0) doFlare();
});
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "c") { const ks = Object.keys(PALETTES); P.palette = ks[(ks.indexOf(P.palette) + 1) % ks.length]; aurora.setPalette(P.palette); tintSpill(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (k === "m") { P.moon = P.moon > 0.1 ? 0 : 0.5; lab.gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (k === " ") { calm = calm > 0.5 ? 0 : 1; e.preventDefault(); }
});
function doFlare() { flare = 1; }

// ---- loop --------------------------------------------------------------------------------------
const clock = lab.clock;
let t = 0, hudT = 0;
function frame() {
  const dt = lab.step();
  t += dt;
  flare *= Math.pow(0.22, dt);
  const activity = P.activity * (calm > 0.5 ? 0.16 : 1) * (1 + flare * 1.9);

  sky.uniforms.uTime.value = t;
  sky.uniforms.uStars.value = P.stars;
  sky.uniforms.uMilky.value = P.milky;
  sky.uniforms.uMoonGlow.value = P.moon * (1 + flare * 0.6);
  sky.uniforms.uHorizon.value.copy(spill).multiplyScalar(0.30 + P.haze * 0.9);

  aurora.update(t, {
    activity, flow: P.flow, rayFreq: P.rayFreq * (1 + flare * 0.4), softness: P.softness,
    twist: P.twist * (1 + P.wind * 0.8), arc: P.arc * (1 + flare * 0.5), shimmer: P.shimmer, corona: P.corona,
  });

  ice.uniforms.uTime.value = t;
  ice.uniforms.uCam.value.copy(camera.position);
  ice.uniforms.uMirror.value = P.mirrorMix * (1 - calm * 0.4);
  ice.uniforms.uRipple.value = P.ripple * (1 + P.wind * 0.5);
  ice.uniforms.uFrost.value = P.frost;
  ice.uniforms.uCrack.value = P.cracks;
  ice.uniforms.uGlint.value = P.glint;
  if (P.mirror) ice.renderMirror(renderer, scene, camera, [ice.mesh, snow.points]);

  snow.update(dt);
  snow.material.uniforms.uDim.value = 1;
  forest.children.forEach((grove) => grove.children.forEach((tree) => {
    tree.rotation.z = Math.sin(t * 0.7 + tree.userData.sway) * 0.006 * P.wind * (1 + flare);
  }));
  if (lab.bloomPass) lab.bloomPass.strength = P.bloom * (1 + flare * 0.45);
  grade.uniforms.uTime.value = t;
  grade.uniforms.uVig.value = 1.02 - flare * 0.18;

  orbit.update();
  lab.render();
  lab.tickFps(dt);

  hudT += dt;
  if (hudT > 0.3) {
    hudT = 0;
    lab.setHud([
      ["curtains", aurora.curtains.length], ["activity", (activity).toFixed(2)],
      ["palette", P.palette], ["mirror", P.mirror ? `${ice.rt.width}×${ice.rt.height}` : "off"],
      ["stars", P.stars.toFixed(2)], ["snow", snow.count], ["wind", P.wind.toFixed(2)],
      ["flare", flare > 0.02 ? Math.round(flare * 100) + "%" : "—"],
    ]);
  }
}
renderer.setAnimationLoop(frame);

lab.expose({
  state: () => snap({
    fps: lab.fps.value, curtains: aurora.curtains.length, activity: P.activity,
    effectiveActivity: P.activity * (calm > 0.5 ? 0.16 : 1) * (1 + flare * 1.9),
    palette: P.palette, flow: P.flow, rayFreq: P.rayFreq, arc: P.arc, twist: P.twist,
    shimmer: P.shimmer, corona: P.corona, stars: P.stars, milky: P.milky, moon: P.moon,
    mirror: P.mirror, mirrorRes: [ice.rt.width, ice.rt.height], mirrorMix: P.mirrorMix,
    ripple: P.ripple, frost: P.frost, cracks: P.cracks, glint: P.glint,
    snow: snow.count, wind: P.wind, bloom: P.bloom, quality: lab.q.quality,
    flare: flare, calm: calm > 0.5,
  }),
  api: {
    params: P,
    set: (k, v) => { P[k] = v; if (k === "palette") { aurora.setPalette(v); tintSpill(); } if (k === "bloom" && lab.bloomPass) lab.bloomPass.strength = v; },
    flare: () => { flare = 1; },
    setPalette: (v) => { P.palette = v; aurora.setPalette(v); tintSpill(); },
    setCurtains: (n) => { aurora.build(n); aurora.setPalette(P.palette); },
    setMirror: (v) => { P.mirror = !!v; ice.enabled = !!v; },
    setQuality: (q) => lab.setQuality(q),
    sky: () => sky.uniforms,
    aurora: () => aurora,
    ice: () => ice,
  },
});
