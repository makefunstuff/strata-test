// Experiment 5 — volumetric fire and smoke. A raymarched density field (fBm carved teardrop flame
// + spreading plume) rendered at reduced resolution by a custom composer pass and composited over
// a stone circle at dusk, with embers, a flickering point light and bloom on the incandescent core.
import * as THREE from "three";
import { createLab, rand, skyDome } from "../shared/lab.js";
import { FireVolume, VolumetricPass, createEmbers } from "./volume.js";

const lab = createLab({
  preset: "medium",   // the heaviest page in the lab: the raymarch starts on medium
  title: "5 · Volumetric fire — raymarched flame and smoke",
  camera: { position: [7.5, 4.2, 11.5], target: [0, 3.4, 0], fov: 50, near: 0.3, far: 300, minDistance: 3.5, maxDistance: 60 },
  bloom: { strength: 0.42, radius: 0.55, threshold: 0.95, scale: 0.45 },
  exposure: 0.95,
  background: null,
  fog: null,
  shadow: false,
  hints: ["click to stoke the fire", "Space gust of wind", "D douse", "wind x/z and gust in the panel", "drag / wheel for the camera"],
  guiTitle: "fire",
});
const { renderer, scene, camera, gui, pointer, composer } = lab;
scene.fog = new THREE.FogExp2(0x0a0d14, 0.019);

// ---- dusk ---------------------------------------------------------------------------------------
skyDome(scene, { top: 0x060a16, horizon: 0x2a2334, ground: 0x0a0a0c, sun: { x: -0.85, y: 0.06, z: -0.5 }, sunColor: 0x9fb6d8, sunSize: 0.008, glow: 0.25 });
const moon = new THREE.DirectionalLight(0x9ab8e0, 0.28);
moon.position.set(-14, 12, -8);
scene.add(moon, new THREE.HemisphereLight(0x2a3550, 0x0c0b0a, 0.32));
const fireLight = new THREE.PointLight(0xff7a2a, 110, 46, 2);
fireLight.position.set(0, 1.8, 0);
scene.add(fireLight);
const fireLight2 = new THREE.PointLight(0xffc46a, 34, 22, 2);
fireLight2.position.set(0, 0.7, 0);
scene.add(fireLight2);

// ---- ground, stone circle, logs -----------------------------------------------------------------
function groundTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#20211f"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = rand(0.35, 1.25);
    g.fillStyle = `rgba(${44 * v | 0},${42 * v | 0},${36 * v | 0},${0.06 + Math.random() * 0.2})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 5), rand(1, 4));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 14);
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.98, color: 0x6a655c }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6d6a63, roughness: 0.92, metalness: 0.03, flatShading: true });
const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.62, 0), stoneMat, 18);
{
  const o = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand(-0.06, 0.06);
    const r = 2.7 + rand(-0.25, 0.3);
    o.position.set(Math.cos(a) * r, rand(0.12, 0.34), Math.sin(a) * r);
    o.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    o.scale.set(rand(0.6, 1.25), rand(0.5, 1.5), rand(0.6, 1.25));
    o.updateMatrix();
    stones.setMatrixAt(i, o.matrix);
  }
}
scene.add(stones);

const logMat = new THREE.MeshStandardMaterial({ color: 0x40261a, roughness: 0.88, metalness: 0.02, emissive: 0x2a0a00, emissiveIntensity: 0.6, flatShading: true });
const logs = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.3;
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 2.5, 7), logMat);
  log.position.set(Math.cos(a) * 0.55, 1.05, Math.sin(a) * 0.55);
  // a teepee: tilt each log outward about its tangential axis
  log.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), 0.62);
  logs.add(log);
}
// a base ring of kindling
for (let i = 0; i < 5; i++) {
  const k = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6), logMat);
  k.position.set(Math.cos(i * 1.3) * 0.5, 0.07, Math.sin(i * 1.3) * 0.5);
  k.rotation.set(Math.PI / 2, 0, i * 1.3);
  logs.add(k);
}
scene.add(logs);

// ---- volumetric fire -----------------------------------------------------------------------------
const volume = new FireVolume({ size: [13, 24, 13], base: 0 });
const volPass = new VolumetricPass(volume, camera, 0.5);
composer.insertPass(volPass, 1);

const embers = createEmbers(520, { radius: 0.9, height: 5 });
embers.mat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
scene.add(embers);

const P = {
  intensity: 1.0, flameH: 6.4, flameR: 1.3, freq: 0.9, rise: 1.9, turb: 0.75, emiss: 2.1,
  octaves: 3, steps: 64, smoke: 0.85, smokeH: 17, smokeR: 1.4, smokeFreq: 0.3, glow: 1.6,
  windX: 0.35, windZ: 0.12, flicker: 1.0, embers: true, volScale: 0.5, absorbF: 1.5, absorbS: 2.6,
};
const U = volume.uniforms;
function sync() {
  U.uFlameH.value = P.flameH; U.uFlameR.value = P.flameR; U.uFreq.value = P.freq;
  U.uRise.value = P.rise; U.uTurb.value = P.turb; U.uEmiss.value = P.emiss; U.uOct.value = P.octaves;
  U.uSteps.value = P.steps; U.uSmoke.value = P.smoke; U.uSmokeH.value = P.smokeH;
  U.uSmokeR.value = P.smokeR; U.uSmokeFreq.value = P.smokeFreq; U.uGlow.value = P.glow;
  U.uFlicker.value = P.flicker; U.uAbsorbF.value = P.absorbF; U.uAbsorbS.value = P.absorbS;
  embers.visible = P.embers;
}
sync();

// ---- interaction -----------------------------------------------------------------------------------
let flare = 0, gust = 0, gustDir = new THREE.Vector2(1, 0.3);
renderer.domElement.addEventListener("pointerdown", () => { flare = 1; });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); gust = 1; }
  if (e.code === "KeyD") flare = -0.62;
});

// ---- control panel ---------------------------------------------------------------------------------
const fF = gui.addFolder("fire");
fF.add(P, "intensity", 0.15, 3, 0.01).name("intensity");
fF.add(P, "flameH", 1.5, 12, 0.05).name("flame height");
fF.add(P, "flameR", 0.4, 4, 0.02).name("flame girth");
fF.add(P, "freq", 0.2, 2, 0.01).name("noise scale");
fF.add(P, "rise", 0.2, 5, 0.02).name("rise speed");
fF.add(P, "turb", 0, 2.5, 0.02).name("turbulence");
fF.add(P, "emiss", 0.5, 9, 0.05).name("incandescence");
fF.add(P, "octaves", 1, 6, 1).name("octaves").onChange(() => { U.uOct.value = P.octaves; });
fF.add(P, "absorbF", 0.2, 5, 0.05).name("flame density");
const fS = gui.addFolder("smoke");
fS.add(P, "smoke", 0, 3, 0.02).name("smoke");
fS.add(P, "smokeH", 4, 40, 0.5).name("plume height");
fS.add(P, "smokeR", 0.5, 6, 0.05).name("plume girth");
fS.add(P, "smokeFreq", 0.05, 1.2, 0.01).name("smoke scale");
fS.add(P, "glow", 0, 6, 0.05).name("fire glow on smoke");
fS.add(P, "absorbS", 0.2, 8, 0.05).name("smoke density");
const fW = gui.addFolder("wind");
fW.add(P, "windX", -3, 3, 0.02).name("wind x");
fW.add(P, "windZ", -3, 3, 0.02).name("wind z");
fW.add({ gust: () => (gust = 1) }, "gust").name("gust (Space)");
fW.add({ stoke: () => (flare = 1) }, "stoke").name("stoke (click)");
fW.add({ douse: () => (flare = -0.62) }, "douse").name("douse (D)");
const fQ = gui.addFolder("quality & look");
fQ.add(P, "steps", 24, 110, 1).name("march steps");
fQ.add(P, "volScale", 0.25, 1, 0.01).name("volume resolution").onChange((v) => { volPass.scale = v; const s = lab.renderer.getSize(new THREE.Vector3()); volPass.setSize(s.x, s.y); });
fQ.add(P, "embers").name("embers");
fQ.add(P, "flicker", 0, 2, 0.02).name("flicker");

function applyQuality(q) {
  P.steps = q === "low" ? 34 : q === "high" ? 88 : 60;
  P.volScale = q === "low" ? 0.3 : q === "high" ? 0.55 : 0.42;
  volPass.scale = P.volScale;
  const s = lab.renderer.getSize(new THREE.Vector3());
  volPass.setSize(s.x, s.y);
  lab.setPixelRatio(q === "low" ? 0.7 : 1);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
lab.onQuality(applyQuality);
lab.setSize();
// a raymarch is the heaviest thing on this page, so it starts on medium, not on the kit's high
lab.setQuality("medium");
const size = lab.renderer.getSize(new THREE.Vector3());
volPass.setSize(size.x, size.y);
window.addEventListener("resize", () => { const s = renderer.getSize(new THREE.Vector3()); volPass.setSize(s.x, s.y); });

// ---- loop ------------------------------------------------------------------------------------------
let t = 0, hudT = 0, eff = 1;
const wind = new THREE.Vector2();
function frame() {
  const dt = Math.min(lab.step(), 1 / 30);
  t += dt;
  flare = flare > 0 ? Math.max(0, flare - dt * 0.75) : Math.min(0, flare + dt * 0.55);
  gust = Math.max(0, gust - dt * 0.6);

  const target = P.intensity * (1 + flare * 1.8);
  eff += (target - eff) * Math.min(1, dt * (flare > 0 ? 9 : 2.4));

  wind.set(P.windX + gustDir.x * gust * 2.4, P.windZ + gustDir.y * gust * 2.4);
  U.uTime.value = t;
  U.uIntensity.value = eff;
  U.uWind.value.copy(wind);
  sync();

  const flick = 0.85 + 0.18 * Math.sin(t * 13.1) + 0.1 * Math.sin(t * 27.3) + 0.06 * Math.sin(t * 51.7);
  const glow = eff * flick * (1 + gust * 0.5);
  fireLight.intensity = 88 * glow;
  fireLight.position.set(wind.x * 0.35, 1.6 + eff * 0.5, wind.y * 0.35);
  fireLight2.intensity = 32 * glow;
  logMat.emissiveIntensity = 0.35 + glow * 0.9;

  embers.update(dt, eff, wind.x, wind.y, P.rise);
  embers.mat.uniforms.uTime.value = t;
  embers.mat.uniforms.uPixelRatio.value = renderer.getPixelRatio();

  orbitUpdate();
  lab.render();
  lab.tickFps(dt);

  hudT += dt;
  if (hudT > 0.35) {
    hudT = 0;
    lab.setHud([["steps", P.steps], ["volume", `${Math.round(P.volScale * 100)}%`],
      ["fire", eff.toFixed(2)], ["wind", `${wind.x.toFixed(2)},${wind.y.toFixed(2)}`],
      ["smoke", P.smoke.toFixed(2)], ["glow", Math.round(fireLight.intensity)],
      ["flare", flare > 0.02 ? `+${Math.round(flare * 100)}%` : flare < -0.02 ? `${Math.round(flare * 100)}%` : "—"]]);
  }
}
const orbitUpdate = () => lab.orbit.update();
lab.renderer.setAnimationLoop(frame);

lab.expose({
  state: () => ({
    fps: lab.fps.value, steps: P.steps, volScale: P.volScale, octaves: P.octaves,
    intensity: P.intensity, effective: Math.round(eff * 100) / 100, flare: Math.round(flare * 100) / 100,
    flameH: P.flameH, flameR: P.flameR, freq: P.freq, rise: P.rise, turb: P.turb, emiss: P.emiss,
    smoke: P.smoke, smokeH: P.smokeH, glow: P.glow, windX: P.windX, windZ: P.windZ,
    gust: Math.round(gust * 100) / 100, embers: P.embers, light: Math.round(fireLight.intensity),
  }),
  api: {
    params: P, volume,
    set: (k, v) => { P[k] = v; if (k === "volScale") { volPass.scale = v; const s = lab.renderer.getSize(new THREE.Vector3()); volPass.setSize(s.x, s.y); } },
    stoke: (a = 1) => (flare = Math.max(0, a)),
    douse: (a = 0.62) => (flare = -Math.abs(a)),
    gust: (x = 1, z = 0.3) => { gust = 1; gustDir.set(x, z).normalize(); },
    setWind: (x, z) => { P.windX = x; P.windZ = z; },
    setQuality: (steps, volScale) => { P.steps = steps; P.volScale = volScale; volPass.scale = volScale; const s = lab.renderer.getSize(new THREE.Vector3()); volPass.setSize(s.x, s.y); },
  },
});
