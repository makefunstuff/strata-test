// Tallinn's Old Town as a photographed model: the real street plan from OpenStreetMap, the landmarks
// put where they stand, and everything between them grown procedurally from the seed.
// The bay in the north, Toompea's limestone ridge in the west, the Town Hall square in the middle.
import * as THREE from "three";
import { createLab, skyDome } from "../shared/lab.js";
import { Rng, clamp, lerp, randomSeed } from "../6-medieval-diorama/rng.js";
import { generateTallinn } from "./layout.js";
import { buildTextures } from "./textures.js";
import { buildStatic } from "./build.js";
import { buildLife } from "./life.js";
import { addTiltShift } from "../6-medieval-diorama/tiltshift.js";

// ----------------------------------------------------------------------------------------------
// the controls
// ----------------------------------------------------------------------------------------------

const q0 = new URLSearchParams(location.search).get("quality") || (/Mobi|Android/i.test(navigator.userAgent) ? "medium" : "high");
const qParams = new URLSearchParams(location.search);

const P = {
  seed: qParams.get("seed") || "TALLINN",
  time: 0.42,               // 0 dawn · 0.5 noon · 0.9 dusk · >1 night
  night: false,
  winter: qParams.get("season") === "winter",
  autoRotate: true,
  rotateSpeed: 0.35,
  sunAzimuth: 1.15,
  tilt: 0.7,
  focus: 0.52,
  saturation: 1.12,
  vignette: 0.32,
  exposure: 1.05,
  bloom: 0.34,
  shadows: true,
  showTrees: true,
  showFolk: true,
  showSmoke: true,
  showMarket: true,
  showFlags: true,
  showSea: true,
  view: "hero",
  quality: q0,
};

const QUALITY = {
  low: { pixelRatio: 0.72, shadowMap: 512, birds: false, folk: 0.4 },
  medium: { pixelRatio: 1, shadowMap: 1024, birds: true, folk: 0.75 },
  high: { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75), shadowMap: 2048, birds: true, folk: 1 },
};

// ----------------------------------------------------------------------------------------------
// the lab: renderer, camera, composer, panel
// ----------------------------------------------------------------------------------------------

const lab = createLab({
  title: "7 · Tallinn Old Town diorama — the real plan, built by hand",
  camera: {
    fov: 36,
    position: [430, 285, 620],
    target: [-30, 18, -40],
    near: 1, far: 3600,
    maxPolar: 1.45,
    minDistance: 26, maxDistance: 1500,
  },
  bloom: { strength: 0.34, radius: 0.55, threshold: 0.9, scale: 0.5 },
  exposure: P.exposure,
  background: 0x0b1220,
  fog: { color: 0xcfdde4, near: 950, far: 2700 },
  preset: P.quality,
  shadow: true,
  hints: [
    "drag to walk the wall · pinch or scroll to come closer",
    "N night · C snow · V view · G panel — the hour slider runs dawn to night",
  ],
  guiTitle: "the diorama",
});

const { renderer, scene, camera, orbit, composer, gui } = lab;
const tiltPass = addTiltShift(composer, composer.passes[composer.passes.length - 1]);

/** one place that decides what a preset costs, so the first load and later changes agree */
function applyQuality(name) {
  const q = QUALITY[name] || QUALITY.high;
  P.quality = QUALITY[name] ? name : "high";
  lab.setPixelRatio(q.pixelRatio);
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  return q;
}

// ----------------------------------------------------------------------------------------------
// lights and sky
// ----------------------------------------------------------------------------------------------

const root = new THREE.Group();
scene.add(root);

const sky = skyDome(scene, { radius: 2400, top: 0x5a92c8, horizon: 0xdde7ec, ground: 0x5b5a48, sunColor: 0xfff1d4, sunSize: 0.028, glow: 0.5 });

const sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 40;
sun.shadow.camera.far = 2200;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.7;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(0xbcd4ee, 0.5);
fill.position.set(-420, 260, -320);
scene.add(fill);

const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x5c5340, 0.9);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.16);
scene.add(ambient);

/** the light and sky at six points of the day, lerped between: a Baltic day, low and silver */
const DAY = [
  { t: 0.00, top: 0x3f5f8a, hor: 0xf0b884, gnd: 0x493f33, sunCol: 0xffb066, sunI: 1.5, hemiI: 0.45, amb: 0.2, fog: 0xd9b992, elev: 0.07, expo: 1.1, night: 0 },
  { t: 0.26, top: 0x4a83c4, hor: 0xdae6ea, gnd: 0x5f5b47, sunCol: 0xfff2d6, sunI: 2.7, hemiI: 0.95, amb: 0.16, fog: 0xc4d5de, elev: 0.6, expo: 1.05, night: 0 },
  { t: 0.58, top: 0x4478b8, hor: 0xe4dfd2, gnd: 0x5d5944, sunCol: 0xfff4dc, sunI: 2.6, hemiI: 0.9, amb: 0.16, fog: 0xcfd6da, elev: 0.82, expo: 1.05, night: 0 },
  { t: 0.86, top: 0x3d5f92, hor: 0xe89a5c, gnd: 0x40342a, sunCol: 0xff9b4a, sunI: 1.8, hemiI: 0.52, amb: 0.2, fog: 0xcf9a72, elev: 0.11, expo: 1.12, night: 0 },
  { t: 1.02, top: 0x1a2b4e, hor: 0x6d5a72, gnd: 0x211d24, sunCol: 0xc98a7a, sunI: 0.46, hemiI: 0.19, amb: 0.17, fog: 0x2c2838, elev: 0.02, expo: 1.16, night: 0.6 },
  { t: 1.30, top: 0x070f24, hor: 0x182742, gnd: 0x0b0e16, sunCol: 0x9db4e6, sunI: 0.5, hemiI: 0.17, amb: 0.15, fog: 0x0e1526, elev: 0.4, expo: 1.24, night: 1 },
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
  const el = clamp(d.elev, 0.015, 1) * 1.3;
  const r = 1100;
  sun.position.set(Math.cos(az) * r * Math.cos(el), Math.sin(el) * r, Math.sin(az) * r * Math.cos(el));
  sun.target.position.set(-40, 0, -40);
  sun.color.copy(d.sunCol);
  sun.intensity = d.sunI * (P.winter ? 0.86 : 1);
  hemi.color.copy(d.top).lerp(_c1.setHex(0xffffff), 0.25);
  hemi.groundColor.copy(d.gnd);
  hemi.intensity = d.hemiI * (P.winter ? 1.15 : 1);
  ambient.intensity = d.amb * (P.winter ? 1.2 : 1);
  fill.intensity = lerp(0.5, 0.14, d.night);
  fill.color.copy(d.top).lerp(_c1.setHex(0xffffff), 0.4);
  sky.uniforms.uTop.value.copy(d.top);
  sky.uniforms.uHorizon.value.copy(d.hor);
  sky.uniforms.uGround.value.copy(d.gnd);
  sky.uniforms.uSunColor.value.copy(d.sunCol);
  sky.uniforms.uSun.value.copy(sun.position).normalize();
  sky.uniforms.uGlow.value = lerp(0.55, 0.12, d.night);
  sky.uniforms.uSunSize.value = lerp(0.03, 0.012, d.night);
  scene.fog.color.copy(d.fog).lerp(_c1.setHex(0xdfe7ef), P.winter ? 0.3 : 0);
  scene.background.copy(scene.fog.color).multiplyScalar(0.92);
  renderer.toneMappingExposure = P.exposure * d.expo;
  if (lab.bloomPass) {
    lab.bloomPass.strength = P.bloom * lerp(1, 2.1, d.night);
    lab.bloomPass.threshold = lerp(0.9, 0.34, d.night);
  }
  if (current) current.mats.setNight(d.night);
  if (life) {
    life.setNight(d.night);
    life.setSun(sun.position, d.sunCol, d.sunI);
    life.setSky(d.hor);
  }
  return d;
}

// ----------------------------------------------------------------------------------------------
// building the town
// ----------------------------------------------------------------------------------------------

let city = null, current = null, life = null;

function disposeCity() {
  if (!current) return;
  current.group.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (m) for (const mm of Array.isArray(m) ? m : [m]) { mm.map?.dispose?.(); mm.dispose?.(); }
  });
  root.remove(current.group);
  if (current.tex) for (const v of Object.values(current.tex)) v?.dispose?.();
  current = null; life = null;
}

function build(seedText) {
  disposeCity();
  P.seed = seedText;
  city = generateTallinn(seedText);
  const tex = buildTextures(new Rng(seedText + "/tex"));
  const stat = buildStatic(city, tex, { quality: P.quality });
  life = buildLife(city, tex, stat.mats, { emitters: stat.emitters, quality: P.quality, winter: P.winter });
  stat.group.add(life.group);
  root.add(stat.group);
  current = { group: stat.group, mats: stat.mats, tex, stats: stat.stats };
  // the shadow box should hug the diorama, not the world
  const span = city.bounds.R * 0.95;
  const cam = sun.shadow.camera;
  cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
  cam.near = 40; cam.far = 2200;
  cam.updateProjectionMatrix();
  applySeason();
  applyLight();
  applyVisibility();
  applyShadows(P.shadows, true);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  try { history.replaceState(null, "", `?seed=${encodeURIComponent(seedText)}&quality=${P.quality}${P.winter ? "&season=winter" : ""}`); } catch { /* file:// */ }
  updateHud();
  lab.stats = stat.stats;
  return stat.stats;
}

/** one path for shadows: turning them off changes every material's program, so both the panel and
    the scripted API have to mark the materials or the town keeps its old shadows */
function applyShadows(v, quiet = false) {
  P.shadows = !!v;
  renderer.shadowMap.enabled = P.shadows;
  sun.castShadow = P.shadows;
  if (current) current.group.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  if (!quiet) gui.controllersRecursive().forEach((c) => c.updateDisplay());
  return P.shadows;
}

function applySeason() {
  if (current) current.mats.setSeason(P.winter);
  if (life) life.setWinter(P.winter);
  return P.winter;
}

function applyVisibility() {
  if (!current) return;
  current.group.traverse((o) => {
    if (!o.name) return;
    if (o.name.startsWith("trees")) o.visible = P.showTrees;
    else if (o.name === "smoke") o.visible = P.showSmoke;
    else if (o.name === "flags" || o.name === "flagpoles") o.visible = P.showFlags;
    else if (o.name === "folk" || o.name === "carts") o.visible = P.showFolk;
    else if (o.name === "birds") o.visible = P.showFolk && QUALITY[P.quality].birds;
    else if (o.name === "market" || o.name === "markettree") o.visible = P.showMarket && P.winter;
    else if (o.name === "sea") o.visible = P.showSea;
  });
}

function updateHud() {
  const s = current?.stats || {};
  lab.setHud([
    ["plan", "OpenStreetMap"],
    ["houses", city ? city.houses.length : 0],
    ["landmarks", city ? city.landmarks.length : 0],
    ["towers", city ? city.towers.length : 0],
    ["pieces", s.pieces ?? 0],
    ["tris", s.tris ? (s.tris / 1000).toFixed(0) + "k" : 0],
    ["draws", s.draws ?? 0],
    ["season", P.winter ? "December" : "summer"],
  ]);
}

// ----------------------------------------------------------------------------------------------
// the panel
// ----------------------------------------------------------------------------------------------

const fTown = gui.addFolder("town");
fTown.add(P, "seed").name("seed").onFinishChange((v) => build(v || randomSeed()));
fTown.add({ r: () => build(P.seed) }, "r").name("↺ rebuild this seed");
fTown.add(P, "autoRotate").name("orbit").onChange((v) => { orbit.autoRotate = v; });
fTown.add(P, "rotateSpeed", 0.05, 2, 0.05).name("orbit speed").onChange((v) => { orbit.autoRotateSpeed = v; });

const fLight = gui.addFolder("light & season");
fLight.add(P, "time", 0, 1.3, 0.005).name("hour of the day").onChange((v) => { P.night = v > 1.05; applyLight(); });
fLight.add({ d: () => { P.time = 0.45; P.night = false; syncPanel(); applyLight(); } }, "d").name("☀ day");
fLight.add({ n: () => { P.time = 1.22; P.night = true; syncPanel(); applyLight(); } }, "n").name("☾ night");
fLight.add(P, "winter").name("❄ winter").onChange((v) => { P.winter = !!v; applySeason(); applyVisibility(); syncPanel(); updateHud(); });
fLight.add(P, "sunAzimuth", 0, 6.28, 0.01).name("sun azimuth").onChange(applyLight);
fLight.add(P, "exposure", 0.6, 1.8, 0.01).name("exposure").onChange(applyLight);
fLight.add(P, "bloom", 0, 1.2, 0.01).name("bloom").onChange(applyLight);
fLight.add(P, "shadows").name("shadows").onChange((v) => applyShadows(v));

const fLook = gui.addFolder("miniature");
fLook.add(P, "tilt", 0, 2, 0.01).name("tilt-shift").onChange(syncLook);
fLook.add(P, "focus", 0.2, 0.85, 0.01).name("focus height").onChange(syncLook);
fLook.add(P, "saturation", 0.7, 1.7, 0.01).name("saturation").onChange(syncLook);
fLook.add(P, "vignette", 0, 0.8, 0.1).name("vignette").onChange(syncLook);
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
fShow.add(P, "showMarket").name("market stalls").onChange(applyVisibility);
fShow.add(P, "showFlags").name("flags").onChange(applyVisibility);
fShow.add(P, "showSea").name("the bay").onChange(applyVisibility);

const fView = gui.addFolder("view");
const VIEWS = {
  hero: { pos: [430, 285, 620], target: [-30, 18, -40] },
  square: { pos: [-96, 40, -96], target: [8, 9, 16] },
  townhall: { pos: [6, 14, -32], target: [1, 13, 24] },
  market: { pos: [-14, 7.5, -34], target: [2, 9, 26] },
  toompea: { pos: [14, 74, 262], target: [-392, 52, 168] },
  hermann: { pos: [-186, 66, 322], target: [-474, 46, 236] },
  harbour: { pos: [250, 96, -306], target: [220, 10, -620] },
  oleviste: { pos: [268, 82, -286], target: [147, 44, -457] },
  viru: { pos: [392, 44, 190], target: [282, 14, 71] },
  birdseye: { pos: [60, 900, 120], target: [0, 0, -60] },
  chunk: { pos: [760, 330, 840], target: [0, -24, 0] },
  low: { pos: [96, 12, 128], target: [-6, 10, -18] },
};
for (const name of Object.keys(VIEWS)) fView.add({ v: () => setView(name) }, "v").name(name);
function setView(name) {
  const v = VIEWS[name] || VIEWS.hero;
  P.view = name;
  // the lower town falls 22 m from the wall to the quay, so a named view that is written for one
  // height can end up under the cobbles at another: no view is allowed below the ground it frames
  const [px, py, pz] = v.pos;
  const floorY = city ? city.terr.ground(px, pz) + 2.6 : py;
  camera.position.set(px, Math.max(py, floorY), pz);
  orbit.target.set(...v.target);
  orbit.update();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  return name;
}

function syncPanel() { gui.controllersRecursive().forEach((c) => c.updateDisplay()); }

// the quality folder came with the lab; hook its presets up to the things that cost money
lab.onQuality((name) => { applyQuality(name); build(P.seed); });
applyQuality(P.quality);
orbit.autoRotate = P.autoRotate;
orbit.autoRotateSpeed = P.rotateSpeed;

// on a phone the panel would cover most of the town, so it starts shut (G opens it)
if (window.innerWidth < 640) gui.close();

// ----------------------------------------------------------------------------------------------
// keys, as the shelf card promises: N night, C snow, V view, G panel
// ----------------------------------------------------------------------------------------------

const VIEW_NAMES = Object.keys(VIEWS);
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;   // typing a seed
  if (e.code === "KeyN") {
    P.time = P.night ? 0.45 : 1.22; P.night = !P.night; applyLight(); syncPanel();
  } else if (e.code === "KeyC") {
    P.winter = !P.winter; applySeason(); applyVisibility(); syncPanel(); updateHud();
  } else if (e.code === "KeyV") {
    setView(VIEW_NAMES[(VIEW_NAMES.indexOf(P.view) + 1) % VIEW_NAMES.length]);
  } else if (e.code === "KeyG") {
    // ask the panel whether it is open rather than tracking it here: clicking its title would
    // otherwise leave a local flag stale and the next G press looking like it did nothing
    const tl = gui.domElement.querySelector(":scope > .title");
    const open = !tl || tl.getAttribute("aria-expanded") !== "false";
    if (open) gui.close(); else gui.open();
  } else return;
  e.preventDefault();
});

// ----------------------------------------------------------------------------------------------
// the loop
// ----------------------------------------------------------------------------------------------

build(P.seed);
setView(qParams.get("view") || "hero");

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
    landmarks: city ? city.landmarks.length : 0,
    towers: city ? city.towers.length : 0,
    trees: city ? city.trees.length : 0,
    walkers: life?.folkCount ?? 0,
    pieces: current?.stats?.pieces ?? 0,
    tris: current?.stats?.tris ?? 0,
    drawCalls: current?.stats?.draws ?? 0,
    time: +P.time.toFixed(3),
    night: P.night,
    winter: P.winter,
    view: P.view,
    tilt: P.tilt,
    quality: P.quality,
    shadows: renderer.shadowMap.enabled,
    autoRotate: P.autoRotate,
    camera: camera.position.toArray().map((v) => +v.toFixed(1)),
    fps: lab.fps.value,
  }),
  setSeed: (s) => { build(String(s)); return P.seed; },
  rebuild: () => { build(P.seed); return P.seed; },
  setNight: (v = 1) => { P.night = !!v; P.time = v > 0.5 ? 1.22 : 0.45; applyLight(); return P.time; },
  setTime: (v) => { P.time = clamp(v, 0, 1.3); P.night = P.time > 1.05; applyLight(); return P.time; },
  setWinter: (v = 1) => { P.winter = !!v; applySeason(); applyVisibility(); syncPanel(); updateHud(); return P.winter; },
  setSeason: (v) => { P.winter = String(v) === "winter"; applySeason(); applyVisibility(); syncPanel(); updateHud(); return P.winter; },
  setTilt: (v) => { P.tilt = v; syncLook(); return P.tilt; },
  setFocus: (v) => { P.focus = clamp(v, 0.05, 0.95); syncLook(); return P.focus; },
  setView: (n) => setView(n),
  /** hide the panel and the text for a clean frame (the shelf card wants the diorama, not the UI) */
  setChrome: (v = true) => {
    const on = !!v;
    gui.domElement.style.display = on ? "" : "none";
    for (const id of ["hud", "fps", "hint"]) { const el = document.getElementById(id); if (el) el.style.opacity = on ? "" : "0"; }
    const t = document.querySelector(".title"); if (t) t.style.opacity = on ? "" : "0";
    const back = document.querySelector("a.back"); if (back) back.style.opacity = on ? "" : "0";
    return on;
  },
  setAutoRotate: (v) => { P.autoRotate = !!v; orbit.autoRotate = P.autoRotate; return P.autoRotate; },
  setShadows: (v) => applyShadows(!!v),
  setQuality: (n) => { lab.setQuality(QUALITY[n] ? n : "high"); return P.quality; },
  setShow: (k, v) => { if (k in P) { P[k] = !!v; applyVisibility(); } return P[k]; },
  getCity: () => city,
  lab,
});
