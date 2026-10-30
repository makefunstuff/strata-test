// A procedural medieval city, on a chunk of earth, in the style of a photographed model.
// One seed grows one town: the streets, the wall, the castle, the cathedral, the fields and every
// crooked house come from it, so ?seed=... is the whole save file.
import * as THREE from "three";
import { createLab, skyDome } from "../shared/lab.js";
import { Rng, clamp, lerp, smoothstep } from "./rng.js";
import { generateCity } from "./layout.js";
import { buildTextures } from "./textures.js";
import { buildStatic } from "./build.js";
import { buildLife } from "./life.js";
import { addTiltShift } from "./tiltshift.js";

// ----------------------------------------------------------------------------------------------
// the controls
// ----------------------------------------------------------------------------------------------

const q0 = new URLSearchParams(location.search).get("quality") || (/Mobi|Android/i.test(navigator.userAgent) ? "medium" : "high");

const P = {
  seed: new URLSearchParams(location.search).get("seed") || "BRAMWELL",
  time: 0.42,               // 0 dawn · 0.5 noon · 0.9 dusk · >1 night
  night: false,
  autoRotate: true,
  rotateSpeed: 0.4,
  sunAzimuth: 0.85,
  tilt: 0.75,               // 0..1, how much miniature
  focus: 0.5,
  saturation: 1.14,
  vignette: 0.3,
  exposure: 1.06,
  bloom: 0.32,
  shadows: true,
  showTrees: true,
  showFolk: true,
  showSmoke: true,
  showBanners: true,
  groundSize: 2048,
  quality: q0,
};

const QUALITY = {
  low: { pixelRatio: 0.75, shadowMap: 512, groundSize: 1024, birds: false },
  medium: { pixelRatio: 1, shadowMap: 1024, groundSize: 1536, birds: true },
  high: { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75), shadowMap: 2048, groundSize: 2048, birds: true },
};

// ----------------------------------------------------------------------------------------------
// the lab: renderer, camera, composer, panel
// ----------------------------------------------------------------------------------------------

const lab = createLab({
  title: "6 · Medieval city diorama — grown from a seed",
  camera: {
    fov: 38,
    position: [148, 108, 168],
    target: [0, 10, 0],
    near: 1, far: 1400,
    maxPolar: 1.44,
    minDistance: 34, maxDistance: 460,
  },
  bloom: { strength: 0.32, radius: 0.55, threshold: 0.92, scale: 0.5 },
  exposure: P.exposure,
  background: 0x0b1220,
  fog: { color: 0xcfdde4, near: 260, far: 760 },
  preset: P.quality,
  shadow: true,
  hints: [
    "drag to walk the wall · pinch or scroll to come closer",
    "the sun slider runs dawn to night · new city grows another town",
  ],
  guiTitle: "the diorama",
});

const { renderer, scene, camera, orbit, composer, gui } = lab;
const tiltPass = addTiltShift(composer, composer.passes[composer.passes.length - 1]);

// ----------------------------------------------------------------------------------------------
// lights and sky
// ----------------------------------------------------------------------------------------------

const root = new THREE.Group();
scene.add(root);

const sky = skyDome(scene, { radius: 620, top: 0x5a92c8, horizon: 0xdde7ec, ground: 0x5b5a48, sunColor: 0xfff1d4, sunSize: 0.028, glow: 0.5 });

const sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(0xbcd4ee, 0.5);
fill.position.set(-120, 70, -90);
scene.add(fill);

const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x5c5340, 0.9);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.16);
scene.add(ambient);

/** the light and sky at six points of the day, lerped between */
const DAY = [
  { t: 0.00, top: 0x3f5f8a, hor: 0xf0b884, gnd: 0x493f33, sunCol: 0xffb066, sunI: 1.5, hemiI: 0.42, amb: 0.2, fog: 0xd9b992, elev: 0.07, expo: 1.1, night: 0 },
  { t: 0.28, top: 0x4a83c4, hor: 0xd8e4e8, gnd: 0x5f5b47, sunCol: 0xfff2d6, sunI: 2.7, hemiI: 0.95, amb: 0.16, fog: 0xc4d5de, elev: 0.62, expo: 1.05, night: 0 },
  { t: 0.62, top: 0x4478b8, hor: 0xe2ddd0, gnd: 0x5d5944, sunCol: 0xfff0cc, sunI: 2.5, hemiI: 0.85, amb: 0.16, fog: 0xcfd6da, elev: 0.85, expo: 1.05, night: 0 },
  { t: 0.88, top: 0x3d5f92, hor: 0xe89a5c, gnd: 0x40342a, sunCol: 0xff9b4a, sunI: 1.7, hemiI: 0.5, amb: 0.2, fog: 0xcf9a72, elev: 0.1, expo: 1.12, night: 0 },
  { t: 1.02, top: 0x1a2b4e, hor: 0x6d5a72, gnd: 0x211d24, sunCol: 0xc98a7a, sunI: 0.5, hemiI: 0.24, amb: 0.22, fog: 0x3a3448, elev: 0.02, expo: 1.2, night: 0.65 },
    { t: 1.30, top: 0x070f24, hor: 0x182742, gnd: 0x0b0e16, sunCol: 0x9db4e6, sunI: 0.62, hemiI: 0.24, amb: 0.22, fog: 0x111a2c, elev: 0.42, expo: 1.34, night: 1 },
];

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function dayAt(t) {
  t = clamp(t, DAY[0].t, DAY[DAY.length - 1].t);
  let a = DAY[0], b = DAY[DAY.length - 1];
  for (let i = 0; i < DAY.length - 1; i++) {
    if (t >= DAY[i].t && t <= DAY[i + 1].t) { a = DAY[i]; b = DAY[i + 1]; break; }
  }
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const mix = (x, y) => lerp(x, y, k);
  const colMix = (x, y) => _c1.setHex(x).lerp(_c2.setHex(y), k).clone();
  return {
    top: colMix(a.top, b.top), hor: colMix(a.hor, b.hor), gnd: colMix(a.gnd, b.gnd),
    sunCol: colMix(a.sunCol, b.sunCol), fog: colMix(a.fog, b.fog),
    sunI: mix(a.sunI, b.sunI), hemiI: mix(a.hemiI, b.hemiI), amb: mix(a.amb, b.amb),
    elev: mix(a.elev, b.elev), expo: mix(a.expo, b.expo), night: mix(a.night, b.night),
  };
}

function applyLight() {
  const d = dayAt(P.time);
  const az = P.sunAzimuth;
  const el = clamp(d.elev, 0.015, 1) * 1.35;
  const r = 320;
  sun.position.set(Math.cos(az) * r * Math.cos(el), Math.sin(el) * r, Math.sin(az) * r * Math.cos(el));
  sun.target.position.set(0, 0, 0);
  sun.color.copy(d.sunCol);
  sun.intensity = d.sunI;
  hemi.color.copy(d.top).lerp(_c1.setHex(0xffffff), 0.25);
  hemi.groundColor.copy(d.gnd);
  hemi.intensity = d.hemiI;
  ambient.intensity = d.amb;
  fill.intensity = lerp(0.5, 0.14, d.night);
  fill.color.copy(d.top).lerp(_c1.setHex(0xffffff), 0.4);
  sky.uniforms.uTop.value.copy(d.top);
  sky.uniforms.uHorizon.value.copy(d.hor);
  sky.uniforms.uGround.value.copy(d.gnd);
  sky.uniforms.uSunColor.value.copy(d.sunCol);
  sky.uniforms.uSun.value.copy(sun.position).normalize();
  sky.uniforms.uGlow.value = lerp(0.55, 0.12, d.night);
  sky.uniforms.uSunSize.value = lerp(0.03, 0.012, d.night);
  scene.fog.color.copy(d.fog);
  scene.background.copy(d.fog).multiplyScalar(0.92);
  renderer.toneMappingExposure = P.exposure * d.expo;
  if (lab.bloomPass) {
    lab.bloomPass.strength = P.bloom * lerp(1, 2.1, d.night);
    lab.bloomPass.threshold = lerp(0.92, 0.35, d.night);
  }
  if (life) {
    life.setNight(d.night);
    life.setSun(sun.position, d.sunCol, d.sunI);
    life.setSky(d.hor);
  }
  return d;
}

// ----------------------------------------------------------------------------------------------
// growing a town
// ----------------------------------------------------------------------------------------------

let city = null, current = null, life = null;

function disposeCity() {
  if (!current) return;
  current.group.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (m) {
      for (const mm of Array.isArray(m) ? m : [m]) {
        if (mm.map && mm.map !== current.tex?.strata) mm.map.dispose?.();
        mm.dispose?.();
      }
    }
  });
  root.remove(current.group);
  if (current.tex) for (const v of Object.values(current.tex)) v?.dispose?.();
  current = null;
}

function grow(seedText) {
  disposeCity();
  P.seed = seedText;
  const built = generateCity(seedText);
  city = built;
  const tex = buildTextures(new Rng(seedText + "/tex"));
  const stat = buildStatic(built, tex, { groundSize: P.groundSize });
  const lf = buildLife(built, tex, stat.mats);
  stat.group.add(lf.group);
  root.add(stat.group);
  current = { group: stat.group, mats: stat.mats, tex, stats: stat.stats };
  life = lf;
  // the shadow box should hug the diorama, not the world
  const span = built.R * 1.15;
  const cam = sun.shadow.camera;
  cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
  cam.near = 20; cam.far = 900;
  cam.updateProjectionMatrix();
  applyLight();
  applyVisibility();
  try { history.replaceState(null, "", `?seed=${encodeURIComponent(seedText)}&quality=${P.quality}`); } catch { /* file:// */ }
  updateHud();
  lab.stats = stat.stats;
  return stat.stats;
}

function applyVisibility() {
  if (!current) return;
  current.group.traverse((o) => {
    if (!o.name) return;
    if (o.name.startsWith("trees")) o.visible = P.showTrees;
    else if (o.name === "smoke") o.visible = P.showSmoke;
    else if (o.name === "banners") o.visible = P.showBanners;
    else if (o.name === "folk" || o.name === "carts" || o.name === "birds") o.visible = P.showFolk;
  });
}

function updateHud() {
  const s = current?.stats || {};
  lab.setHud([
    ["seed", P.seed],
    ["houses", city ? city.houses.length : 0],
    ["pieces", s.pieces ?? 0],
    ["tris", s.tris ? (s.tris / 1000).toFixed(0) + "k" : 0],
    ["draws", s.drawCalls ?? 0],
  ]);
}

const SYL_A = ["Bram", "Thorn", "Mouth", "Kings", "Elm", "Fen", "Dun", "Low", "Ash", "Marsh", "Stan", "Wold", "Ald", "Craw", "Bar", "Mel", "Whit", "Har", "Lin", "Crom"];
const SYL_B = ["well", "field", "ford", "mere", "holt", "bury", "caster", "wick", "stead", "gham", "ridge", "moor", "ton", "burgh", "dale", "haven", "port", "fell", "bridge", "stead"];
function randomSeed() {
  const r = new Rng(String(Date.now()) + Math.random());
  return `${r.pick(SYL_A)}${r.pick(SYL_B)}${r.chance(0.3) ? r.i(2, 99) : ""}`;
}

// ----------------------------------------------------------------------------------------------
// the panel
// ----------------------------------------------------------------------------------------------

const fCity = gui.addFolder("town");
fCity.add(P, "seed").name("seed").onFinishChange((v) => grow(v || randomSeed()));
fCity.add({ n: () => grow(randomSeed()) }, "n").name("⚄ new city");
fCity.add({ r: () => grow(P.seed) }, "r").name("↺ regrow this seed");
fCity.add(P, "autoRotate").name("orbit").onChange((v) => { orbit.autoRotate = v; });
fCity.add(P, "rotateSpeed", 0.05, 2, 0.05).name("orbit speed").onChange((v) => { orbit.autoRotateSpeed = v; });

const fSun = gui.addFolder("light");
fSun.add(P, "time", 0, 1.3, 0.005).name("hour of the day").onChange((v) => { P.night = v > 1.05; applyLight(); });
fSun.add({ d: () => { P.time = 0.45; P.night = false; gui.controllersRecursive().forEach((c) => c.updateDisplay()); applyLight(); } }, "d").name("☀ day");
fSun.add({ n: () => { P.time = 1.22; P.night = true; gui.controllersRecursive().forEach((c) => c.updateDisplay()); applyLight(); } }, "n").name("☾ night");
fSun.add(P, "sunAzimuth", 0, 6.28, 0.01).name("sun azimuth").onChange(applyLight);
fSun.add(P, "exposure", 0.6, 1.8, 0.01).name("exposure").onChange(applyLight);
fSun.add(P, "bloom", 0, 1.2, 0.01).name("bloom").onChange(applyLight);
fSun.add(P, "shadows").name("shadows").onChange((v) => {
  renderer.shadowMap.enabled = v;
  sun.castShadow = v;
  root.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
});

const fLook = gui.addFolder("miniature");
fLook.add(P, "tilt", 0, 2, 0.01).name("tilt-shift").onChange(syncLook);
fLook.add(P, "focus", 0.2, 0.85, 0.01).name("focus height").onChange(syncLook);
fLook.add(P, "saturation", 0.7, 1.7, 0.01).name("saturation").onChange(syncLook);
fLook.add(P, "vignette", 0, 0.8, 0.01).name("vignette").onChange(syncLook);
function syncLook() {
  const u = tiltPass.uniforms;
  u.uAmount.value = 0.011 * P.tilt;
  u.uFocus.value = P.focus;
  u.uSaturation.value = P.saturation;
  u.uVignette.value = P.vignette;
  u.uPower.value = 0.9 + P.tilt * 0.4;
}
syncLook();

const fShow = gui.addFolder("shown");
fShow.add(P, "showTrees").name("trees").onChange(applyVisibility);
fShow.add(P, "showFolk").name("folk & carts").onChange(applyVisibility);
fShow.add(P, "showSmoke").name("hearth smoke").onChange(applyVisibility);
fShow.add(P, "showBanners").name("banners").onChange(applyVisibility);

const fView = gui.addFolder("view");
const VIEWS = {
  hero: { pos: [132, 92, 156], target: [0, 10, 0] },
  close: { pos: [62, 34, 74], target: [4, 9, -4] },
  birdseye: { pos: [18, 268, 26], target: [0, 0, 0] },
  chunk: { pos: [168, 104, 196], target: [0, -6, 0] },
  gate: { pos: [128, 30, 40], target: [56, 8, 4] },
  low: { pos: [104, 16, 96], target: [0, 6, 0] },
};
for (const [name, v] of Object.entries(VIEWS)) {
  fView.add({ v: () => setView(name) }, "v").name(name);
}
function setView(name) {
  const v = VIEWS[name] || VIEWS.hero;
  camera.position.set(...v.pos);
  orbit.target.set(...v.target);
  orbit.update();
  return name;
}

// the quality folder came with the lab; hook its presets up to the things that cost money
lab.onQuality((name) => {
  const q = QUALITY[name] || QUALITY.high;
  P.quality = name;
  P.groundSize = q.groundSize;
  lab.setPixelRatio(q.pixelRatio);
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  grow(P.seed);
});
{
  const q = QUALITY[P.quality] || QUALITY.high;
  lab.setPixelRatio(q.pixelRatio);
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
}
orbit.autoRotate = P.autoRotate;
orbit.autoRotateSpeed = P.rotateSpeed;

// ----------------------------------------------------------------------------------------------
// the loop
// ----------------------------------------------------------------------------------------------

grow(P.seed);
setView("hero");

let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = lab.step();
  elapsed += dt;
  if (life) life.update(dt, elapsed);
  orbit.update();
  lab.tickFps(dt);
  lab.render();
}
frame();

// ----------------------------------------------------------------------------------------------
// the hook the headless checks drive
// ----------------------------------------------------------------------------------------------

lab.expose({
  state: () => ({
    seed: P.seed,
    houses: city ? city.houses.length : 0,
    streets: city ? city.streets.length : 0,
    trees: city ? city.trees.length : 0,
    walkers: life?.folk?.folk?.length ?? 0,
    pieces: current?.stats?.pieces ?? 0,
    tris: current?.stats?.tris ?? 0,
    drawCalls: current?.stats?.drawCalls ?? 0,
    time: +P.time.toFixed(3),
    night: P.night,
    tilt: P.tilt,
    quality: P.quality,
    shadows: renderer.shadowMap.enabled,
    autoRotate: P.autoRotate,
    camera: camera.position.toArray().map((v) => +v.toFixed(1)),
    fps: lab.fps.value,
  }),
  setSeed: (s) => { grow(String(s)); return P.seed; },
  newCity: () => { grow(randomSeed()); return P.seed; },
  setNight: (v = 1) => { P.night = !!v; P.time = v > 0.5 ? 1.22 : 0.45; applyLight(); return P.time; },
  setTime: (v) => { P.time = clamp(v, 0, 1.3); applyLight(); return P.time; },
  setTilt: (v) => { P.tilt = v; syncLook(); return P.tilt; },
  setView: (n) => setView(n),
  /** hide the panel and the text for a clean frame (the shelf card wants the diorama, not the UI) */
  setChrome: (v = true) => {
    const on = !!v;
    gui.domElement.style.display = on ? "" : "none";
    for (const id of ["hud", "fps", "hint"]) { const el = document.getElementById(id); if (el) el.style.opacity = on ? "" : "0"; }
    const t = document.querySelector(".title"); if (t) t.style.opacity = on ? "" : "0";
    return on;
  },
  setAutoRotate: (v) => { P.autoRotate = !!v; orbit.autoRotate = P.autoRotate; return P.autoRotate; },
  setShadows: (v) => { P.shadows = !!v; renderer.shadowMap.enabled = P.shadows; sun.castShadow = P.shadows; return P.shadows; },
  setQuality: (n) => { lab.setQuality(QUALITY[n] ? n : "high"); return P.quality; },
  getCity: () => city,
  lab,
});
