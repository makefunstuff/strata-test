// Flight: procedural terrain in recycled chunks, a bank-to-turn arcade jet, ring gates,
// an engine trail, sky + fog, and the shared arcade kit (bloom, CRT, cabinet, sound, HUD).
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

import { createPost, setupEnvironment } from "../shared/post.js";
import { quality, autoQuality } from "../shared/mobile.js";
import { addTouchControls } from "../shared/touch.js";
import { crtKey, PHOSPHORS } from "../shared/crt.js";
import { createAudio, audioKey } from "../shared/audio.js";
import { createSparks, createShatter, createRings, createImpactLight } from "../shared/effects.js";
import { createSpeedLines } from "../shared/speedlines.js";
import { createFps } from "../shared/fps.js";
import { createTerrain } from "./terrain.js";
import { createPlaneMesh } from "./plane.js";
import { createGates, RING_R } from "./rings.js";

const CRUISE = 52, BOOST = 86, PITCH = 1.15, ROLL = 2.1, TURN = 1.5;
const CEIL = 320, GROUND_CLEAR = 2.4;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260811);

// ---------------------------------------------------------------- HUD
const nodes = {};
for (const n of document.querySelectorAll("[data-k]")) nodes[n.dataset.k] = n;
const set = (key, text) => { const n = nodes[key]; if (n && n.textContent !== String(text)) n.textContent = text; };
const screen = nodes.title ? nodes.title.closest("#screen") : null;
const fps = createFps(document.getElementById("fps"), { label: "FPS" });

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(quality({ pixelRatio: 2 }).pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMappingExposure = 0.62;          // the Sky shader is HDR-bright; the kit sets ACES

const scene = new THREE.Scene();
setupEnvironment(renderer, scene, { intensity: 0.7 });
scene.fog = new THREE.Fog(0x9dc6e8, 150, 640);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2600);

const Q = quality({ pixelRatio: 2, bloomScale: 0.5, sparks: 1 });
const post = createPost(renderer, scene, camera, {
  // Was 0.62, which sat on top of a skydome that was clipping to white — see the sky block
  // below for the actual cause. The level here is only the ACES exposure now that the dome
  // writes raw HDR once; 0.55 measured the best terrain separation ([35,79,125] against the
  // sky) and above ~0.7 the height-banded flat shading starts flattening out.
  exposure: 0.6,
  bloom: { strength: 0.48 * Q.bloomStrength, radius: 0.5, threshold: 1.05, scale: Q.bloomScale },
  crt: { look: "cabinet", overrides: Q.crt, phosphor: PHOSPHORS.p4,
         bezel: { label: "FLIGHT", accent: "#8ee8ff" } },
});
const auto = autoQuality({ floor: 45, onDrop: () => { if (post.bloom) post.bloom.enabled = false; } });

// sky + sun
//
// The skydome is the reason this game looked like a white rectangle. three injects the
// renderer's ACES curve into every material *and* OutputPass applies it again, and Preetham
// radiance runs into the tens, so the dome clipped R, G and B to the ceiling — measured, not
// assumed: at that point the rendered sky was [255,255,255] and did not respond to rayleigh or
// to toneMappingExposure at all, because both were acting on already-clipped values. The fix is
// two-part: let the dome write raw HDR into the float composer target (toneMapped:false, graded
// once by OutputPass), and give the model an exposure of its own before it gets there.
//
// SKY_EXPOSURE was calibrated by sampling the rendered sky across a sweep of the uniform
// (zenith B−R dominance peaks around 0.09–0.2; below it the sky is night, above it the channels
// clip together again). It stays a uniform, and ?sky= sets it, so the calibration is repeatable
// from outside instead of a magic number someone has to trust.
//
// Patch Sky.SkyShader before constructing, not material.fragmentShader after: mutating a
// ShaderMaterial's source once it has been rendered invalidates three's program cache every
// frame, which cost this game 15 fps → 10 fps on the software renderer before it was caught.
const SKY_EXPOSURE = 0.2;
Sky.SkyShader.uniforms.uSkyExposure = { value: SKY_EXPOSURE };
Sky.SkyShader.fragmentShader = "uniform float uSkyExposure;\n" +
  Sky.SkyShader.fragmentShader.replace(
    "gl_FragColor = vec4( retColor, 1.0 );",
    "gl_FragColor = vec4( retColor * uSkyExposure, 1.0 );");
const sky = new Sky();
sky.scale.setScalar(6000);
sky.material.toneMapped = false;
const skyQ = Number(new URLSearchParams(location.search).get("sky"));
if (skyQ > 0) sky.material.uniforms.uSkyExposure.value = skyQ;
scene.add(sky);
const sunDir = new THREE.Vector3();
{
  const u = sky.material.uniforms;
  // The first version of the frame was a pale grey-blue wash: at turbidity 9 and rayleigh 1.9
  // the whole sky is scattering close to white, and a jet at floor+95 has nothing in frame but
  // sky. Deeper scattering, tighter sun: the sky reads as sky and the horizon has a place.
  // Low turbidity matters more than a high rayleigh number, which is the opposite of what the
  // numbers suggest: turbidity is the aerosol term that scatters the whole sky toward white,
  // while raising rayleigh brightens all three channels together and *shrinks* the B-R gap.
  // Swept on the rendered frame (B-R summed over zenith and two upper-band samples):
  //   turb 3.2/mie .004/ray 3.2 -> 46 · turb 2.0/.003/3.2 -> 43 · 1.0/.0015/4.0 -> 27
  //   turb 1.5/.002/2.6 -> 58 (kept)
  u.turbidity.value = 1.5;
  u.rayleigh.value = 2.6;
  u.mieCoefficient.value = 0.002;
  u.mieDirectionalG.value = 0.9;
  const elev = 15, azim = 118;
  const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim);
  sunDir.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);
}
const sun = new THREE.DirectionalLight(0xfff0d4, 3.1);
sun.position.copy(sunDir).multiplyScalar(400);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbcd8f2, 0x2c3a2a, 1.0));

// world
const terrain = createTerrain(scene);
const jet = createPlaneMesh(scene);
const gates = createGates(scene, { count: 6, floor: terrain.floor });

const fx = {
  sparks: createSparks(scene, { gravity: -0.9, drag: 0.7 }),
  trail: createSparks(scene, { gravity: -0.25, drag: 1.1 }),
  shards: createShatter(scene, { count: 220, color: 0xffb347 }),
  rings: createRings(scene, { slots: 12, inner: 2.4, outer: 3.2 }),
  impact: createImpactLight(scene, { distance: 120, decay: 1.6 }),
};
const lines = createSpeedLines(scene, { count: 34, spread: 26, minY: -10, maxY: 16, near: 34, far: -230 });
const lineRig = new THREE.Group();
scene.add(lineRig);
lineRig.add(lines.mesh);

const audio = createAudio({ master: 0.4, delayMix: 0.16 });
const sfx = audio.sfx;

// ---------------------------------------------------------------- flight state
const pos = new THREE.Vector3(0, 110, 0);
const camPos = new THREE.Vector3(0, 118, 34);
const UP = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3();
const lift = new THREE.Vector3();
const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();
const tip = new THREE.Vector3();

let speed = CRUISE, target = CRUISE, state = "flying", crashTimer = 0;
let score = 0, passed = 0, best = 0, last = "airborne", rollSign = 0, pitchSign = 0, gForce = 1;
const keys = {};

function headingFromQuat(out) {
  out.set(0, 0, -1).applyQuaternion(jet.group.quaternion);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
  return out.normalize();
}

function reset(full) {
  if (full) { score = 0; passed = 0; }
  speed = CRUISE; target = CRUISE;
  const h = headingFromQuat(scratch2);
  pos.set(pos.x, terrain.floor(pos.x, pos.z) + 95, pos.z);
  jet.group.quaternion.setFromAxisAngle(UP, Math.atan2(-h.x, -h.z));   // wings level, same heading
  state = "flying";
  crashTimer = 0;
  jet.group.visible = true;
  last = "airborne";
  if (screen) screen.hidden = true;
  sfx.power();
}

function crash() {
  state = "crashed";
  crashTimer = 2.4;
  jet.group.visible = false;
  best = Math.max(best, score);
  fx.shards.burst(pos, { n: 26, color: 0xffb347, speed: 12, scale: 1.6 });
  fx.sparks.spawn(pos, { n: 46, speed: 16, spread: 1.5, size: 1.1, life: 1.1, color: 0xffc45c });
  fx.rings.burst(pos, { color: 0xff9f4a, from: 3, to: 46, dur: 0.7 });
  fx.impact.flash(pos, { color: 0xff9f4a, power: 320, dur: 0.6 });
  sfx.explode();
  sfx.gameOver();
  last = "clipped the ground";
  if (nodes.title) nodes.title.textContent = "down";
  if (nodes.msg) nodes.msg.textContent = `${score} points · ${passed} rings · climbing again in a moment`;
  if (screen) screen.hidden = false;
}

// ---------------------------------------------------------------- input
const AXES = {
  ArrowUp: ["pitch", 1], KeyW: ["pitch", 1], ArrowDown: ["pitch", -1], KeyS: ["pitch", -1],
  ArrowLeft: ["roll", 1], KeyA: ["roll", 1], ArrowRight: ["roll", -1], KeyD: ["roll", -1],
};
const held = { pitch: 0, roll: 0 };
window.addEventListener("keydown", (e) => {
  if (audioKey(e.code, audio) || crtKey(e.code, post.crt)) return;
  if (e.code === "KeyR") { reset(true); return; }
  const a = AXES[e.code];
  if (a) { e.preventDefault(); held[a[0]] = a[1]; keys[a[0]] = true; firstGesture(); return; }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") { target = BOOST; firstGesture(); }
});
window.addEventListener("keyup", (e) => {
  const a = AXES[e.code];
  if (a) { held[a[0]] = 0; keys[a[0]] = false; return; }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") target = CRUISE;
});
let musicOn = false;
function firstGesture() {
  if (musicOn) return;
  musicOn = true;
  audio.startMusic({
    bpm: 148, bass: [0, 0, 3, 5], lead: [12, 19, 24, 19, 22, 15],
    leadGain: 0.04, bassGain: 0.08, kick: true,
  });
}
window.addEventListener("pointerdown", () => { audio.ensure(); }, { once: true });

// ---- touch: a stick for pitch and roll, boost held with a thumb, launch/restart on a chip.
// The stick pushes the arrow keys the flight model already reads.
addTouchControls({
  pad: { label: "fly" },
  buttons: [
    { label: "boost", code: "ShiftLeft", accent: true },
    { label: "R", code: "KeyR", tap: true, side: "right" },
  ],
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // three's fov is vertical: in portrait the sideways view narrows and the rings come in at the
  // edge of the tube, so the chase camera opens up
  camera.fov = camera.aspect < 1 ? 74 : 58;
  camera.updateProjectionMatrix();
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let hudTick = 0, trailAcc = 0, tickAcc = 0;

function refresh() {
  set("score", score);
  set("rings", passed);
  set("speed", Math.round(speed));
  set("alt", Math.round(pos.y));
  set("ground", Math.round(terrain.floor(pos.x, pos.z)));
  set("best", best);
  set("state", state === "flying" ? (target > CRUISE ? "boost" : "flying") : "down");
  document.body.classList.toggle("playing", state === "flying");
  set("last", last);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  if (state === "flying") {
    speed += (target - speed) * Math.min(1, dt * 1.4);

    pitchSign = held.pitch;
    rollSign = held.roll;
    jet.group.rotateX(PITCH * pitchSign * dt);
    jet.group.rotateZ(ROLL * rollSign * dt);

    fwd.set(0, 0, -1).applyQuaternion(jet.group.quaternion);
    lift.set(0, 1, 0).applyQuaternion(jet.group.quaternion);
    // bank turns you: the lift vector tilts, and the plane follows it around the vertical
    const cross = fwd.z * lift.x - fwd.x * lift.z;
    if (Math.abs(cross) > 1e-4) jet.group.rotateOnWorldAxis(UP, TURN * cross * dt * 1.7);

    pos.addScaledVector(fwd, speed * dt);
    gForce = 1 + Math.abs(cross) * 6 + Math.abs(pitchSign) * 1.6;

    terrain.update(pos.x, pos.z);

    const ground = terrain.floor(pos.x, pos.z);
    if (pos.y < ground + GROUND_CLEAR) crash();

    const gate = gates.check(pos);
    if (gate) {
      passed++;
      score += 10 + Math.round(speed / 8);
      last = `ring +${10 + Math.round(speed / 8)}`;
      fx.sparks.spawn(gate.group.position, { n: 26, speed: 16, spread: 1.4, size: 0.9, life: 0.6, color: 0xffd27a });
      fx.rings.burst(gate.group.position, { color: 0xffd27a, from: 4, to: 34, dur: 0.5 });
      fx.impact.flash(gate.group.position, { color: 0xffd27a, power: 140, dur: 0.35 });
      sfx.coin();
      sfx.power();
      gates.place(gate, pos, fwd, rng);
    }
  } else {
    crashTimer -= dt;
    if (crashTimer <= 0) reset(false);
  }

  gates.update(dt, elapsed);
  if (state === "flying") gates.recycle(pos, fwd, rng);

  // engine trail at the wingtips, denser when boosting
  jet.group.updateMatrixWorld();
  trailAcc += dt;
  const trailEvery = target > CRUISE ? 0.012 : 0.03;
  while (trailAcc > trailEvery) {
    trailAcc -= trailEvery;
    jet.tipL.getWorldPosition(tip);
    fx.trail.spawn(tip, { n: 1, speed: 0.7, spread: 0.5, size: 0.85, life: 1.3, color: 0xdfeaff, up: 0 });
    jet.tipR.getWorldPosition(tip);
    fx.trail.spawn(tip, { n: 1, speed: 0.7, spread: 0.5, size: 0.85, life: 1.3, color: 0xdfeaff, up: 0 });
  }

  jet.prop.rotation.z += dt * (10 + speed * 0.35);
  jet.exhaust.opacity = 0.28 + (speed - CRUISE) / (BOOST - CRUISE) * 0.5;
  fx.sparks.update(dt); fx.trail.update(dt); fx.shards.update(dt); fx.rings.update(dt); fx.impact.update(dt);

  jet.group.position.copy(pos);
  lineRig.position.copy(pos);
  lineRig.quaternion.copy(jet.group.quaternion);
  lines.update(dt, speed, state === "flying");

  // chase camera: behind and above, smoothed, looking down the nose
  scratch.set(0, 7.5, 27).applyQuaternion(jet.group.quaternion).add(pos);
  const k = 1 - Math.exp(-dt * 3.4);
  camPos.lerp(scratch, k);
  camera.position.copy(camPos);
  scratch2.copy(fwd).multiplyScalar(30).add(pos);
  // A level aim puts the whole frame in the sky — for any aspect, not just portrait: the play
  // frame was a pale empty field with a coin-sized jet in it. Four metres of downward aim
  // (seven in portrait, where the tube is tall and narrow) keeps the horizon high and puts the
  // terrain and the ring gates in shot, which is the actual content of the game.
  scratch2.y -= camera.aspect < 1 ? 7 : 4;
  camera.lookAt(scratch2);

  hudTick += dt;
  if (hudTick > 0.1) { hudTick = 0; refresh(); }
  auto.tick(dt);
  fps.tick(dt);

  // a soft warning tick as the ground rush builds
  tickAcc += dt;
  const clearance = pos.y - terrain.floor(pos.x, pos.z);
  if (state === "flying" && clearance < 18 && tickAcc > Math.max(0.09, clearance / 60)) {
    tickAcc = 0;
    sfx.tick();
  }

  post.update(elapsed);
  post.render();
  requestAnimationFrame(frame);
}

// exposed for the headless tools (tools/smoke.ts, tools/audiotest.ts, tools/linescan.mjs)
window.arcade = {
  post, scene, camera, renderer, audio, terrain, gates, jet,
  fly: { get pos() { return pos; }, get speed() { return speed; }, get state() { return state; }, get score() { return score; }, reset },
};
window.arcadeAudio = audio;

terrain.update(pos.x, pos.z);
for (const g of gates.gates) gates.place(g, pos, new THREE.Vector3(0, 0, -1), rng);
refresh();
post.setSize(window.innerWidth, window.innerHeight);
requestAnimationFrame(frame);
