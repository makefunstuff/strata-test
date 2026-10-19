// Experiment 1 — water. A GPU height-field wave equation in a pool, a surface shader with planar
// reflection, screen-space refraction, Fresnel, sun glint and foam, caustics focused by the waves
// on the tiled floor, floating bodies that bob on the field and kick ripples back, click/drag
// ripples, rain, and dropped stones that splash.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { createLab, rand, roomEnvironment } from "../shared/lab.js";
import { WaveSim, CpuWave } from "./sim.js";
import { createWater, createFloor, mirrorCamera } from "./water.js";
import { createFloaters, createSpray } from "./floaters.js";

const POOL = { w: 24, d: 24, level: 0, floorY: -2.9 };
const PRESET = {
  low: { sim: 128, refl: 256, seg: 96, pr: 0.75, rainMax: 60 },
  medium: { sim: 256, refl: 384, seg: 140, pr: 1.0, rainMax: 90 },
  high: { sim: 512, refl: 512, seg: 200, pr: 1.0, rainMax: 130 },
};

const lab = createLab({
  title: "1 · Water — GPU waves, reflection, caustics",
  camera: { position: [9.5, 7.4, 13.5], target: [0, -0.3, 0], fov: 48, near: 0.4, far: 900, minDistance: 3, maxDistance: 70 },
  bloom: { strength: 0.42, radius: 0.6, threshold: 0.9, scale: 0.4 },
  exposure: 0.4,
  background: null,
  fog: { color: 0xa9c2d2, near: 34, far: 150 },
  controls: true,
  hints: ["click or drag the water for ripples", "Space drops a stone", "R rain", "right-drag / wheel to fly the camera", "Q preset"],
  guiTitle: "water",
});
const { renderer, scene, camera, gui, pointer } = lab;

// left-drag belongs to the water, not the camera
const orbit = lab.orbit;
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
orbit.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

// ---- sky, sun, lights --------------------------------------------------------
const sky = new Sky();
sky.scale.setScalar(320);
sky.material.uniforms.turbidity.value = 4.5;
sky.material.uniforms.rayleigh.value = 2.2;
sky.material.uniforms.mieCoefficient.value = 0.005;
sky.material.uniforms.mieDirectionalG.value = 0.84;
scene.add(sky);
const sunDir = new THREE.Vector3();
const sun = { elevation: 26, azimuth: 122 };
function placeSun() {
  const phi = THREE.MathUtils.degToRad(90 - sun.elevation);
  const theta = THREE.MathUtils.degToRad(sun.azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  key.position.copy(sunDir).multiplyScalar(60);
  water.uniforms.uSun.value.copy(sunDir).normalize();
}
const key = new THREE.DirectionalLight(0xffe6c4, 2.6);
scene.add(key, new THREE.HemisphereLight(0xa8cbf0, 0x2a2620, 1.5));

// ---- water, floor, basin -----------------------------------------------------
const sim = new WaveSim(renderer, { size: PRESET.medium.sim });
const cpu = new CpuWave(64, POOL.w);
const water = createWater(renderer, { width: POOL.w, depth: POOL.d, level: POOL.level, segments: PRESET.medium.seg, state: sim.state.texture });
scene.add(water.mesh);

const floor = createFloor(renderer, { width: POOL.w, depth: POOL.d, y: POOL.floorY, state: sim.state.texture });
floor.mesh.layers.set(1);           // seen by the main camera, not by the mirror camera
scene.add(floor.mesh);
camera.layers.enable(1);

function tileTexture(rep = 8) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#123039"; g.fillRect(0, 0, 256, 256);
  const n = 4, s = 256 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = 0.5 + Math.random() * 0.5;
    g.fillStyle = `rgb(${20 + t * 30 | 0},${60 + t * 60 | 0},${70 + t * 60 | 0})`;
    g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  return t;
}
function deckTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#6a6459"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 0.4 + Math.random() * 0.6;
    g.fillStyle = `rgba(${v * 190 | 0},${v * 180 | 0},${v * 165 | 0},${0.05 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 8, 1 + Math.random() * 5);
  }
  g.strokeStyle = "rgba(30,28,25,0.55)"; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { const y = i * 64; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  return t;
}

const tiles = tileTexture(6);
const wallMat = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.5, metalness: 0.05, color: 0x9ecbd6 });
for (const [x, z, ry, len] of [[0, -POOL.d / 2, 0, POOL.w], [0, POOL.d / 2, 0, POOL.w], [-POOL.w / 2, 0, Math.PI / 2, POOL.d], [POOL.w / 2, 0, Math.PI / 2, POOL.d]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, -POOL.floorY), wallMat);
  m.position.set(x, POOL.floorY / 2, z);
  m.lookAt(0, POOL.floorY / 2, 0);
  m.layers.set(1);
  scene.add(m);
}
// the deck is a apron around the pool: the pool opening must stay open, the water is at y=0
const deckMat = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.88, color: 0x9a9385 });
const out = POOL.w / 2 + 0.95, span = 90;
for (const [x, z, w, d] of [
  [0, (span + out) / 2, span, span - out], [0, -(span + out) / 2, span, span - out],
  [(span + out) / 2, 0, span - out, out * 2], [-(span + out) / 2, 0, span - out, out * 2]]) {
  const m2 = new THREE.Mesh(new THREE.PlaneGeometry(w, d), deckMat);
  m2.rotation.x = -Math.PI / 2;
  m2.position.set(x, 0.02, z);
  scene.add(m2);
}
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.55, metalness: 0.05 });
for (const [x, z, w, d] of [[0, -POOL.d / 2 - 0.45, POOL.w + 1.8, 0.9], [0, POOL.d / 2 + 0.45, POOL.w + 1.8, 0.9], [-POOL.w / 2 - 0.45, 0, 0.9, POOL.d], [POOL.w / 2 + 0.45, 0, 0.9, POOL.d]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, d), rimMat);
  m.position.set(x, 0.18, z);
  scene.add(m);
}

roomEnvironment(renderer, scene, { intensity: 0.4 });

// cypress silhouettes around the basin: scale, and something dark for the reflection to catch
const cypress = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 6, 9),
  new THREE.MeshStandardMaterial({ color: 0x1b2f22, roughness: 0.95, fog: true }), 20);
{
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 0.3, r = 26 + rand(0, 22);
    p.set(Math.cos(a) * r, 3.0 * (0.9 + rand(0, 0.5)), Math.sin(a) * r);
    const k = 1.0 + rand(0, 1.1);
    s.set(k * 0.7, k * 1.5, k * 0.7);
    mtx.compose(p, q, s);
    cypress.setMatrixAt(i, mtx);
  }
  cypress.instanceMatrix.needsUpdate = true;
}
scene.add(cypress);

// ---- offscreen passes: refraction (same camera, water hidden) and planar reflection ----------
const refrRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType });
const reflRT = new THREE.WebGLRenderTarget(384, 384, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType });
const mirror = new THREE.PerspectiveCamera();
function sizePasses() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  refrRT.setSize(Math.max(2, Math.round(s.x * 0.5)), Math.max(2, Math.round(s.y * 0.5)));
}
sizePasses();
lab.setSize2 = sizePasses;
window.addEventListener("resize", sizePasses);

function updateMirror() {
  const t = orbit.target;
  mirror.fov = camera.fov; mirror.aspect = camera.aspect; mirror.near = camera.near; mirror.far = camera.far;
  mirror.position.set(camera.position.x, 2 * POOL.level - camera.position.y, camera.position.z);
  mirror.up.set(0, 1, 0);
  mirror.lookAt(t.x, 2 * POOL.level - t.y, t.z);
  mirror.updateProjectionMatrix();
  mirror.updateMatrixWorld(true);
}
const vp = (cam, out) => out.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
const m4a = new THREE.Matrix4(), m4b = new THREE.Matrix4();

// ---- bodies, spray, stones, rain -------------------------------------------------------------
const floaters = createFloaters(scene, { wave: cpu, sim, pool: POOL, count: 7 });
const spray = createSpray(scene, { count: 2600, color: 0xcfeeff, size: 0.11 });
const stoneGeo = new THREE.IcosahedronGeometry(0.28, 1);
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.9, flatShading: true });
const stones = [];
function dropStone(x, z, y = 7) {
  const m = new THREE.Mesh(stoneGeo, stoneMat);
  m.position.set(x, y, z);
  m.scale.setScalar(rand(0.7, 1.35));
  scene.add(m);
  stones.push({ mesh: m, vy: -2, spin: rand(-3, 3) });
  return stones.length;
}
const rainGeo = new THREE.BufferGeometry();
let rainCount = 0;
const rainPos = new Float32Array(400 * 3);
const rainVel = new Float32Array(400);
for (let i = 0; i < 400; i++) { rainPos[i * 3 + 1] = 999; rainVel[i] = rand(16, 26); }
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0.65, 0.8, 0.95) }, uLen: { value: 0.55 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uLen; varying float vFade;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1.0, 900.0 / max(0.001, -mv.z) * 0.06);
      vFade = clamp(1.0 - position.y / 12.0, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float; uniform vec3 uColor; varying float vFade;
    void main(){
      float d = length((gl_PointCoord - 0.5) * vec2(1.0, 0.35));
      if (d > 0.5) discard;
      gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * vFade * 0.55);
    }`,
});
const rain = new THREE.Points(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);

// ---- splash: the one entry point everything uses ---------------------------------------------
const uvOf = (x, z) => [x / POOL.w + 0.5, 0.5 - z / POOL.d];
let splats = 0;
function splash(x, z, { strength = 0.42, radius = 1.3, foam = 0.5, ring = 0, drops = 0, wave = 0.16 } = {}) {
  const [u, v] = uvOf(x, z);
  if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) return 0;
  sim.splat(u, v, radius, POOL.w, { strength, foam, core: 1, ring });
  cpu.splat(x, z, radius, wave);
  if (drops > 0) spray.burst(new THREE.Vector3(x, POOL.level, z), Math.round(drops), 2.2, radius * 0.35, 2.6);
  splats++;
  return splats;
}

// ---- interaction -----------------------------------------------------------------------------
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -POOL.level);
const ray = new THREE.Raycaster();
const hit = new THREE.Vector3();
let lastSplat = null, held = 0;
function waterHit() {
  ray.setFromCamera(pointer.ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? hit : null;
}
renderer.domElement.addEventListener("pointerdown", () => {
  const p = waterHit();
  if (!p) return;
  held = 0;
  lastSplat = p.clone();
  splash(p.x, p.z, { strength: 0.2, radius: 0.95, foam: 0.25, ring: 0.6, drops: 10, wave: 0.08 });
});
renderer.domElement.addEventListener("pointerup", () => {
  if (lastSplat && held < 0.16) splash(lastSplat.x, lastSplat.z, { strength: 0.36, radius: 1.5, foam: 0.8, ring: 1, drops: 26, wave: 0.2 });
  lastSplat = null;
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); dropStone(pointer.ndc ? (waterHit()?.x ?? rand(-6, 6)) : 0, waterHit()?.z ?? 0); }
  if (e.code === "KeyR") P.rain = !P.rain;
  if (e.code === "KeyQ") { const k = Object.keys(PRESET); P.preset = k[(k.indexOf(P.preset) + 1) % k.length]; applyPreset(P.preset); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
});

// ---- control panel ---------------------------------------------------------------------------
const P = {
  preset: "medium", waveSpeed: 5.4, damping: 0.9955, amplitude: 1.35, detail: 0.5,
  wind: 0.25, rain: false, rainAmount: 90, foam: 1.0, reflection: 1.0, refraction: 1.0,
  caustic: 1.9, buoy: 26, sunElev: 26, sunAzim: 122, autoRotate: false,
};
const fWave = gui.addFolder("waves");
fWave.add(P, "waveSpeed", 1, 12, 0.1).name("wave speed").onChange((v) => (sim.speed = v));
fWave.add(P, "damping", 0.98, 1.0, 0.0001).name("persistence").onChange((v) => (sim.damping = v));
fWave.add(P, "amplitude", 0.2, 2.5, 0.05).name("wave height").onChange((v) => (water.uniforms.uAmp.value = v));
fWave.add(P, "detail", 0, 3, 0.05).name("wind chop").onChange((v) => (water.uniforms.uDetail.value = v));
fWave.add(P, "wind", 0, 1, 0.01).name("wind");
fWave.add(P, "rain").name("rain");
fWave.add(P, "rainAmount", 0, 300, 5).name("rain drops");
const fLook = gui.addFolder("look");
fLook.add(P, "foam", 0, 2, 0.05).name("foam").onChange((v) => (water.uniforms.uFoam.value = v));
fLook.add(P, "reflection", 0, 1.6, 0.05).name("reflection").onChange((v) => (water.uniforms.uReflAmt.value = v));
fLook.add(P, "refraction", 0, 3, 0.05).name("refraction").onChange((v) => (water.uniforms.uRefrAmt.value = v));
fLook.add(P, "caustic", 0, 3, 0.05).name("caustics").onChange((v) => (floor.uniforms.uCaustic.value = v));
fLook.add(P, "sunElev", -5, 80, 1).name("sun elevation").onChange(placeSun);
fLook.add(P, "sunAzim", 0, 360, 1).name("sun azimuth").onChange(placeSun);
fLook.add(P, "autoRotate").name("orbit drift").onChange((v) => (orbit.autoRotate = v, orbit.autoRotateSpeed = 0.35));
fWave.add({ drop: () => dropStone(rand(-8, 8), rand(-8, 8)) }, "drop").name("drop a stone");
fWave.add({ clear: () => { sim.reset(); } }, "clear").name("calm the water");

function applyPreset(name) {
  const p = PRESET[name] ?? PRESET.medium;
  sim.setSize(p.sim);
  water.uniforms.uTexel.value = 1 / p.sim;
  floor.uniforms.uTexel.value = 1 / p.sim;
  reflRT.setSize(p.refl, p.refl);
  const g = new THREE.PlaneGeometry(POOL.w, POOL.d, p.seg, p.seg);
  g.rotateX(-Math.PI / 2);
  water.mesh.geometry.dispose();
  water.mesh.geometry = g;
  lab.setPixelRatio(p.pr);
  sim.reset();
}
sim.speed = P.waveSpeed; sim.damping = P.damping;
const knotOf = (v) => Math.min(0.48, 0.035 * v);
applyPreset(P.preset);
lab.onQuality(applyPreset);

// ---- loop --------------------------------------------------------------------------------------
const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -POOL.level);
const energy = () => { let e = 0; for (let i = 0; i < cpu.h.length; i += 4) e += Math.abs(cpu.h[i]); return Math.round(e * 100) / 100; };
let t = 0, hudT = 0, sprayAlive = 0;
placeSun();

function frame() {
  const dt = lab.step();
  t += dt;

  sim.step(dt);
  cpu.step();

  // wind chop: scattered little splats, stronger wind = busier surface and taller fine ripples
  if (P.wind > 0 && Math.random() < P.wind * 0.85) {
    splash(rand(-POOL.w / 2 + 1, POOL.w / 2 - 1), rand(-POOL.d / 2 + 1, POOL.d / 2 - 1),
      { strength: 0.03 + P.wind * 0.07, radius: rand(0.5, 1.1), foam: 0.04, ring: 0.35, wave: 0.015 });
  }

  // rain: falling drops, each one a splat where it lands
  const want = P.rain ? Math.min(400, Math.round(P.rainAmount)) : 0;
  rainCount = want;
  for (let i = 0; i < want; i++) {
    rainPos[i * 3 + 1] -= rainVel[i] * dt;
    if (rainPos[i * 3 + 1] <= POOL.level) {
      splash(rainPos[i * 3], rainPos[i * 3 + 2], { strength: 0.085, radius: 0.75, foam: 0.12, ring: 0.7, drops: 3, wave: 0.035 });
      rainPos[i * 3] = rand(-POOL.w / 2 + 0.5, POOL.w / 2 - 0.5);
      rainPos[i * 3 + 2] = rand(-POOL.d / 2 + 0.5, POOL.d / 2 - 0.5);
      rainPos[i * 3 + 1] = rand(7, 12);
    }
  }
  for (let i = want; i < 400; i++) rainPos[i * 3 + 1] = 999;
  rainGeo.attributes.position.needsUpdate = true;

  // drag: continuous ripples under the pointer, scaled by how fast it moves
  if (pointer.down && lastSplat) {
    held += dt;
    const p = waterHit();
    if (p && p.distanceTo(lastSplat) > 0.16) {
      const speed = Math.min(3, p.distanceTo(lastSplat) / Math.max(dt, 1 / 120));
      splash(p.x, p.z, { strength: 0.07 + speed * 0.03, radius: 0.85, foam: 0.1, ring: 0.5, drops: speed > 1.6 ? 3 : 0, wave: 0.04 + speed * 0.014 });
      lastSplat.copy(p);
    }
  }

  // stones fall, then splash for real
  for (let i = stones.length - 1; i >= 0; i--) {
    const s = stones[i];
    s.vy -= 11 * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.rotation.x += s.spin * dt;
    if (s.mesh.position.y <= POOL.level + 0.1) {
      const v = Math.abs(s.vy);
      splash(s.mesh.position.x, s.mesh.position.z, { strength: 0.24 + v * 0.03, radius: 1.4 + s.mesh.scale.x * 0.7, foam: 0.9 + v * 0.05, ring: 1, drops: 26 + v * 4, wave: 0.15 + v * 0.02 });
      scene.remove(s.mesh);
      stones.splice(i, 1);
    }
  }

  floaters.update(dt, { buoy: P.buoy, surge: 0.35 + P.wind * 0.5 });
  sprayAlive = spray.update(dt);

  // uniforms
  const u = water.uniforms;
  u.uState.value = sim.state.texture;
  u.uTime.value = t;
  u.uCamPos.value.copy(camera.position);
  floor.uniforms.uState.value = sim.state.texture;
  floor.uniforms.uTime.value = t;
  camera.updateMatrixWorld(true);
  vp(camera, m4a);
  u.uMainVP.value.copy(m4a);

  // refraction: the world under the surface, water hidden
  water.mesh.visible = false;
  renderer.setRenderTarget(refrRT);
  renderer.render(scene, camera);
  u.uRefr.value = refrRT.texture;

  // planar reflection: mirrored camera, clipped at the water line, underwater layer excluded
  if (P.reflection > 0) {
    updateMirror();
    vp(mirror, m4b);
    u.uMirrorVP.value.copy(m4b);
    renderer.clippingPlanes = [clip];
    renderer.setRenderTarget(reflRT);
    renderer.render(scene, mirror);
    renderer.clippingPlanes = [];
  }
  water.mesh.visible = true;
  u.uRefl.value = reflRT.texture;

  if (orbit.autoRotate) orbit.update();
  else orbit.update();
  lab.render();
  lab.tickFps(dt);

  hudT += dt;
  if (hudT > 0.5) {
    hudT = 0;
    lab.setHud([["sim", `${sim.size}²`], ["splats", splats], ["energy", energy()], ["bodies", floaters.bodies.length],
      ["spray", sprayAlive], ["rain", P.rain ? rainCount : 0], ["refl", `${reflRT.width}²`]]);
  }
}
lab.renderer.setAnimationLoop(frame);

lab.expose({
  state: () => ({
    fps: lab.fps.value, preset: P.preset, sim: sim.size, splats, energy: energy(),
    bodies: floaters.bodies.length, stones: stones.length, rain: P.rain ? rainCount : 0,
    spray: sprayAlive, wind: P.wind, reflection: P.reflection, reflRT: reflRT.width,
  }),
  api: { splash, dropStone, params: P, applyPreset, wave: cpu, sim, pool: POOL, water, floor },
});
