// Experiment 4 — GPU flocking. Sixteen thousand boids live entirely on the GPU: two float
// textures (position, velocity) ping-ponged through three's GPUComputationRenderer, one instanced
// draw call reading those textures in the vertex shader. The flock avoids glowing obstacle
// spheres, flees a hawk that rides the pointer, and streaks through fog with an afterimage trail.
import * as THREE from "three";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { createLab, rand, skyDome } from "../shared/lab.js";
import { Flock } from "./flock.js";
import { createBoids } from "./boids.js";

const lab = createLab({
  title: "4 · GPU flock — 16k boids, hawk, obstacles, trails",
  camera: { position: [0, 5, 44], target: [0, 0, 0], fov: 50, near: 0.5, far: 400, minDistance: 8, maxDistance: 140 },
  bloom: { strength: 0.42, radius: 0.6, threshold: 0.95, scale: 0.4 },
  exposure: 1.05,
  background: null,
  shadow: false,
  hints: ["move the pointer — the hawk follows", "click = scatter", "H hawk mode", "T trails", "Space gust", "right-drag / wheel for the camera"],
  guiTitle: "flock",
});
const { renderer, scene, camera, gui, pointer, composer } = lab;
const orbit = lab.orbit;
scene.fog = new THREE.FogExp2(0xd8b58c, 0.011);

const dome = skyDome(scene, { top: 0x1d3f6e, horizon: 0xe8b982, ground: 0x2c3138, sun: { x: 0.55, y: 0.12, z: 0.75 }, sunSize: 0.02, glow: 0.75 });
const sunDir = new THREE.Vector3(0.55, 0.42, 0.72).normalize();
scene.add(new THREE.HemisphereLight(0xbcd6f2, 0x2c2a26, 0.65));
const key = new THREE.DirectionalLight(0xffd9a8, 1.2);
key.position.copy(sunDir).multiplyScalar(40);
scene.add(key);

// afterimage trails, inserted before bloom so the streaks glow
const trails = new AfterimagePass(0.88);
composer.insertPass(trails, 1);

const P = {
  count: 4096, taps: 40, sep: 2.7, ali: 1.35, coh: 1.15, perc: 2.7, sepR: 1.05,
  maxSpeed: 9.5, minSpeed: 3.4, jitter: 1.7, steer: 0.4, driftY: 0.1,
  hawkMode: "pointer", hawkR: 6.5, hawkK: 30, obsR: 3.4, obsK: 36, showObs: true,
  scale: 0.3, stretch: 2.4, colorMode: "heading", trails: true, damp: 0.88, boundK: 0.06,
};

// ---- obstacles (glowing spheres the flock streams around) --------------------------------------
const obsGroup = new THREE.Group();
const obsMat = new THREE.MeshStandardMaterial({ color: 0x12283a, roughness: 0.3, metalness: 0.55, emissive: 0x1f6ea8, emissiveIntensity: 0.55, flatShading: true });
const obsShell = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const OBS = [];
const obsVecs = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
for (let i = 0; i < 4; i++) {
  const r = rand(2.2, 3.6);
  const pos = new THREE.Vector3(Math.cos(i / 4 * Math.PI * 2 + 0.4) * rand(9, 15), rand(-5, 6), Math.sin(i / 4 * Math.PI * 2 + 0.4) * rand(9, 15));
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), obsMat.clone());
  m.position.copy(pos);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(r + P.obsR, 1), obsShell);
  shell.position.copy(pos);
  obsGroup.add(m, shell);
  OBS.push({ pos, r, shell, mesh: m });
}
scene.add(obsGroup);
const halo = new THREE.PointLight(0x6fc8ff, 30, 60, 2);
halo.position.set(0, 6, 6);
scene.add(halo);

// ---- the hawk ---------------------------------------------------------------------------------
const hawk = new THREE.Group();
const hawkBody = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 7),
  new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.5, metalness: 0.3, emissive: 0xff5a1e, emissiveIntensity: 0.75, flatShading: true }));
hawkBody.rotation.z = Math.PI / 2;
const hawkWings = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 5.2),
  new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.6, metalness: 0.2, flatShading: true }));
hawk.add(hawkBody, hawkWings);
const hawkGlow = new THREE.PointLight(0xff7a3a, 26, 26, 2);
hawk.add(hawkGlow);
hawk.position.set(0, 0, 40);
scene.add(hawk);
const hawkPos = new THREE.Vector3(0, 0, 40);
const hawkTarget = new THREE.Vector3(0, 0, 40);
const hawkVel = new THREE.Vector3();

// ---- simulation -------------------------------------------------------------------------------
let flock = null, boids = null;

function build(count) {
  const n = Math.round(Math.sqrt(count));
  if (boids) { scene.remove(boids); boids.geometry.dispose(); boids.material.dispose(); }
  if (flock) flock.dispose();
  flock = new Flock(renderer, { n, bounds: 18 });
  boids = createBoids(flock, { scale: P.scale, stretch: P.stretch });
  scene.add(boids);
  P.count = n * n;
  return n * n;
}
build(P.count);

// ---- interaction ------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const plane = new THREE.Plane();
const hit = new THREE.Vector3();
let scatter = 0, t = 0, meanSpeed = 0, centroid = new THREE.Vector3(), readT = 0;

function pointerPoint() {
  ray.setFromCamera(pointer.ndc, camera);
  plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), centroid.lengthSq() > 1 ? centroid : new THREE.Vector3(0, 0, 0));
  return ray.ray.intersectPlane(plane, hit) ? hit.clone().sub(centroid).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0).add(centroid) : null;
}
renderer.domElement.addEventListener("pointerdown", () => { scatter = 1; });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); scatter = 1; }
  if (e.code === "KeyH") { const m = ["pointer", "chase", "off"]; P.hawkMode = m[(m.indexOf(P.hawkMode) + 1) % m.length]; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (e.code === "KeyT") { P.trails = !P.trails; trails.enabled = P.trails; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
});

// ---- control panel -----------------------------------------------------------------------------
const fB = gui.addFolder("boids");
fB.add(P, "count", [2304, 4096, 9216, 16384, 25600]).name("boids").onChange(build);
fB.add(P, "taps", 4, 64, 1).name("neighbour taps");
fB.add(P, "sep", 0, 8, 0.05).name("separation");
fB.add(P, "ali", 0, 5, 0.05).name("alignment");
fB.add(P, "coh", 0, 5, 0.05).name("cohesion");
fB.add(P, "perc", 0.8, 8, 0.05).name("perception radius");
fB.add(P, "sepR", 0.3, 4, 0.05).name("personal space");
fB.add(P, "maxSpeed", 2, 24, 0.1).name("max speed");
fB.add(P, "minSpeed", 0.5, 12, 0.1).name("cruise speed");
fB.add(P, "jitter", 0, 8, 0.1).name("turbulence");
fB.add(P, "steer", 0, 2, 0.05).name("cruise pull");
fB.add(P, "driftY", -2, 2, 0.02).name("thermal");
const fH = gui.addFolder("hawk & obstacles");
fH.add(P, "hawkMode", ["pointer", "chase", "off"]).name("hawk");
fH.add(P, "hawkR", 1, 20, 0.1).name("flee radius");
fH.add(P, "hawkK", 0, 120, 1).name("flee force");
fH.add(P, "obsR", 0, 10, 0.1).name("obstacle margin");
fH.add(P, "obsK", 0, 120, 1).name("obstacle force");
fH.add(P, "showObs").name("show obstacles").onChange((v) => { obsGroup.children.forEach((c) => (c.visible = v)); });
fH.add({ scatter: () => (scatter = 1) }, "scatter").name("scatter (Space)");
const fV = gui.addFolder("look");
fV.add(P, "scale", 0.05, 1.2, 0.01).name("boid size").onChange(() => { boids.material.uniforms.uScale.value = P.scale; });
fV.add(P, "stretch", 1, 6, 0.1).name("boid stretch").onChange(() => { boids.material.uniforms.uStretch.value = P.stretch; });
fV.add(P, "colorMode", ["speed", "heading", "height"]).name("colour by").onChange((v) => { boids.material.uniforms.uColorMode.value = ["speed", "heading", "height"].indexOf(v); });
fV.add(P, "trails").name("trails (T)").onChange((v) => { trails.enabled = v; });
fV.add(P, "damp", 0, 0.98, 0.005).name("trail persistence").onChange((v) => { trails.uniforms.damp.value = v; });
fV.add(P, "boundK", 0, 0.4, 0.005).name("home pull");
gui.add({ reshuffle: () => build(P.count) }, "reshuffle").name("re-seed flock");

lab.onQuality((q) => {
  lab.setPixelRatio(q === "low" ? 0.7 : q === "high" ? 1 : 0.85);
  build(q === "low" ? 2304 : q === "high" ? 16384 : 9216);
  P.trails = q !== "low";
  trails.enabled = P.trails;
});

// ---- loop ---------------------------------------------------------------------------------------
let hudT = 0;
function frame() {
  const dt = Math.min(lab.step(), 1 / 30);
  t += dt;
  scatter = Math.max(0, scatter - dt * 0.7);

  // hawk target: the pointer, the flock's coarse centroid, or hidden far away
  if (P.hawkMode === "pointer") {
    const p = pointerPoint();
    if (p) hawkTarget.copy(p);
  } else if (P.hawkMode === "chase") {
    hawkTarget.copy(centroid);
  } else {
    hawkTarget.set(0, 0, 999);
  }
  const seek = P.hawkMode === "off" ? 0.4 : 3.2;
  hawkVel.addScaledVector(hawkTarget.clone().sub(hawkPos), seek * dt);
  hawkVel.multiplyScalar(0.9);
  hawkPos.addScaledVector(hawkVel, dt * 2.2);
  hawk.position.copy(hawkPos);
  const dir = hawkTarget.clone().sub(hawkPos);
  if (dir.lengthSq() > 1e-4) hawk.lookAt(hawkTarget);
  hawk.visible = P.hawkMode !== "off";
  hawkGlow.intensity = 18 + scatter * 40;

  // obstacles breathe a little so the streams keep changing
  OBS.forEach((o, i) => {
    const y = o.pos.y + Math.sin(t * 0.5 + i) * 0.01;
    o.pos.y = y;
    o.mesh.position.y = y;
    o.shell.position.y = y;
    o.shell.scale.setScalar(1 + Math.sin(t * 1.3 + i * 2) * 0.03);
    obsVecs[i].set(o.pos.x, o.pos.y, o.pos.z, o.r);
  });
  obsGroup.visible = P.showObs;

  const jitter = P.jitter * (1 + scatter * 6);
  flock.compute(dt, {
    time: t, taps: P.taps, sep: P.sep * (1 + scatter * 0.4), ali: P.ali, coh: P.coh * (1 - scatter * 0.5),
    perc: P.perc, sepR: P.sepR, maxSpeed: P.maxSpeed * (1 + scatter * 0.7), minSpeed: P.minSpeed,
    steer: P.steer, jitter, hawk: P.hawkMode === "off" ? FAR : hawkPos, hawkR: P.hawkR * (1 + scatter * 0.5),
    hawkK: P.hawkK * (1 + scatter * 2), driftX: Math.sin(t * 0.13) * 0.35, driftY: P.driftY, driftZ: Math.cos(t * 0.11) * 0.35,
    obs: obsVecs, obsR: P.obsR, obsK: P.obsK, boundK: P.boundK,
  });
  boids.sync();

  readT += dt;
  if (readT > 0.25) {
    readT = 0;
    const r = flock.readback();
    if (r) { meanSpeed = r.meanSpeed; centroid.copy(r.centroid); }
  }

  orbit.update();
  lab.render();
  lab.tickFps(dt);

  hudT += dt;
  if (hudT > 0.35) {
    hudT = 0;
    lab.setHud([["boids", P.count], ["taps", P.taps], ["speed", meanSpeed.toFixed(1)],
      ["perception", P.perc.toFixed(1)], ["hawk", P.hawkMode], ["scatter", scatter > 0.02 ? Math.round(scatter * 100) + "%" : "—"],
      ["trails", P.trails ? P.damp.toFixed(2) : "off"], ["centre", `${centroid.x.toFixed(0)},${centroid.y.toFixed(0)},${centroid.z.toFixed(0)}`]]);
  }
}
const FAR = new THREE.Vector3(0, 0, 999);
lab.renderer.setAnimationLoop(frame);

lab.expose({
  state: () => ({
    fps: lab.fps.value, boids: P.count, taps: P.taps, sep: P.sep, ali: P.ali, coh: P.coh,
    perc: P.perc, sepR: P.sepR, maxSpeed: P.maxSpeed, minSpeed: P.minSpeed, jitter: P.jitter,
    hawkMode: P.hawkMode, hawkR: P.hawkR, hawkK: P.hawkK, obsR: P.obsR, obsK: P.obsK,
    trails: P.trails, damp: P.damp, colorMode: P.colorMode, scale: P.scale, stretch: P.stretch,
    meanSpeed: Math.round(meanSpeed * 100) / 100,
    centroid: [centroid.x, centroid.y, centroid.z].map((v) => Math.round(v * 10) / 10),
    scatter: Math.round(scatter * 100) / 100,
  }),
  api: {
    params: P,
    set: (k, v) => { P[k] = v; },
    build,
    scatter: () => (scatter = 1),
    setHawkMode: (m) => { P.hawkMode = m; },
    hawkTo: (x, y, z) => { hawkTarget.set(x, y, z); },
    setTrails: (v, d) => { P.trails = v; trails.enabled = v; if (d !== undefined) { P.damp = d; trails.uniforms.damp.value = d; } },
    setCount: (c) => build(c),
  },
});
