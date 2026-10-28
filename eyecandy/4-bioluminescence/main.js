// Eye candy 4 — Bioluminescence. Jellyfish in deep water, lit by themselves. Each animal is a
// lathe-built bell that clamps shut on a wave travelling from apex to margin, a glowing subumbrella
// disc, five frilled oral arms and twenty tentacles — all ribbons placed in the vertex shader where
// every segment lags the one above it, so the trail follows the contraction. Shafts of sunlight fall
// from a surface far above, marine snow drifts down through them, and a click startles the swarm.
import * as THREE from "three";
import { createCandy, gradePass, snap } from "../shared/candy.js";
import { Jelly, lightShafts, waterDome, marineSnow, GLOWS } from "./jelly.js";

const lab = createCandy({
  title: "4 · Bioluminescence — jellyfish in the deep",
  camera: { position: [0, 2.5, 21], target: [0, -1, 0], fov: 52, near: 0.1, far: 400, minDistance: 4, maxDistance: 60 },
  bloom: { strength: 0.88, radius: 0.78, threshold: 0.48, scale: 0.5 },
  exposure: 1.12,
  background: 0x01040a,
  hints: ["drag to orbit", "wheel to swim in", "click = startle them", "G glow colour", "S surface light", "Space still water"],
  guiTitle: "the swarm",
  preset: "high",
});
const { scene, camera, gui, composer, renderer, pointer, orbit } = lab;

const dome = waterDome({ radius: 170, top: "#0b3352", mid: "#05141f", deep: "#01050b" });
scene.add(dome.mesh);
const shafts = lightShafts({ count: 7, width: 30, height: 74, color: GLOWS.abyss.ray });
scene.add(shafts.group);
const snow = marineSnow({ count: 750, area: 62 });
scene.add(snow.points);
const grade = gradePass(composer, { vignette: 1.22, grain: 0.05, tint: 0x5fb8ff, tintAmount: 0.07, saturation: 1.1 });

const P = {
  count: 6, glow: "abyss", pulse: 0.42, squeeze: 0.55, glowK: 0.85, wobble: 0.12,
  tentacles: 20, arms: 5, len: 4.6, drift: 0.35, shafts: 7, snow: 750, bloom: 1.05,
  depth: 0, still: false,
};

const swarm = [];
function buildSwarm(n) {
  for (const j of swarm) scene.remove(j.group);
  swarm.length = 0;
  for (let i = 0; i < n; i++) {
    const j = new Jelly({
      glow: P.glow,
      R: 0.9 + Math.random() * 1.05,
      arms: P.arms, tentacles: P.tentacles, tentacleLen: P.len,
    });
    const a = (i / n) * Math.PI * 2 + Math.random();
    const r = 4 + Math.random() * 11;
    j.group.position.set(Math.cos(a) * r, -5 + Math.random() * 11, Math.sin(a) * r - 3);
    j.group.userData = {
      home: j.group.position.clone(),
      phase: Math.random() * 6.283,
      speed: 0.5 + Math.random() * 0.8,
      dart: 0, dartDir: new THREE.Vector3(),
      spin: (Math.random() - 0.5) * 0.25,
      pulse: P.pulse * (0.8 + Math.random() * 0.5),
    };
    scene.add(j.group);
    swarm.push(j);
  }
}
buildSwarm(P.count);

const fSwarm = gui.addFolder("the animals");
fSwarm.add(P, "count", 1, 14, 1).name("jellyfish").onChange((v) => buildSwarm(v));
fSwarm.add(P, "glow", Object.keys(GLOWS)).name("glow").onChange((v) => swarm.forEach((j) => j.setGlow(v)));
fSwarm.add(P, "pulse", 0.05, 1.4, 0.01).name("pulse rate").onChange((v) => swarm.forEach((j) => j.userData.pulse = v * (0.8 + Math.random() * 0.5)));
fSwarm.add(P, "squeeze", 0, 1.2, 0.01).name("contraction");
fSwarm.add(P, "glowK", 0, 2.5, 0.01).name("bioluminescence");
fSwarm.add(P, "wobble", 0, 0.5, 0.005).name("bell wobble");
fSwarm.add(P, "tentacles", 0, 40, 1).name("tentacles").onChange((v) => swarm.forEach((j) => j.tentacles.setRibbons(v)));
fSwarm.add(P, "len", 1.2, 11, 0.1).name("tentacle length");
fSwarm.add(P, "drift", 0, 1.2, 0.01).name("drift");

const fWater = gui.addFolder("the water");
fWater.add(P, "shafts", 0, 10, 1).name("light shafts").onChange((v) => { shafts.count = v; });
fWater.add(P, "snow", 0, 1400, 20).name("marine snow").onChange((v) => { snow.count = v; });
fWater.add(P, "depth", 0, 1, 0.01).name("depth haze");
fWater.add(P, "bloom", 0, 2.4, 0.01).name("bloom").onChange((v) => { lab.bloomPass.strength = v; });
gui.add({ startle: () => startle() }, "startle").name("⚡ startle the swarm");

function startle() {
  for (const j of swarm) {
    const u = j.group.userData;
    u.dart = 1;
    u.dartDir.copy(j.group.position).sub(camera.position).setY(j.group.position.y * 0.3).normalize();
    u.pulse = Math.min(1.4, P.pulse * 2.6);
  }
}
renderer.domElement.addEventListener("pointerup", (e) => {
  if (pointer.moved < 6 && e.button === 0) startle();
});
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "g") { const ks = Object.keys(GLOWS); P.glow = ks[(ks.indexOf(P.glow) + 1) % ks.length]; swarm.forEach((j) => j.setGlow(P.glow)); shafts.materials.forEach((m) => m.uniforms.uColor.value.set(GLOWS[P.glow].ray)); grade.uniforms.uTint.value.set(GLOWS[P.glow].ray); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (k === "s") { P.shafts = P.shafts > 0 ? 0 : 7; shafts.count = P.shafts; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (k === " ") { P.still = !P.still; e.preventDefault(); }
});

function applyQuality(q) {
  const n = q === "low" ? 3 : q === "medium" ? 5 : 7;
  P.count = n; buildSwarm(n);
  P.snow = q === "low" ? 250 : q === "medium" ? 500 : 750;
  snow.count = P.snow;
  P.shafts = q === "low" ? 4 : 7;
  shafts.count = P.shafts;
  gui.controllersRecursive().forEach((c) => c.updateDisplay?.());
}
lab.onQuality(applyQuality);
applyQuality("high");

const tmp = new THREE.Vector3();
let t = 0, hudT = 0;
function frame() {
  const dt = P.still ? 0 : lab.step();
  t += dt;
  dome.uniforms.uTime.value = t;
  shafts.update(t, 1 - P.depth * 0.7);
  snow.update(dt);
  snow.material.uniforms.uDim.value = 1 - P.depth * 0.5;

  for (const j of swarm) {
    const u = j.group.userData;
    u.pulse += (P.pulse * (0.85 + 0.3 * Math.sin(u.phase)) - u.pulse) * Math.min(1, dt * 1.6);
    if (u.dart > 0) {
      u.dart = Math.max(0, u.dart - dt * 0.55);
      j.group.position.addScaledVector(u.dartDir, u.dart * dt * 5.2);
    }
    // slow drift around home, plus a lift on every contraction
    const w = Math.sin(t * u.speed * P.drift + u.phase);
    tmp.copy(u.home).add(new THREE.Vector3(Math.sin(t * 0.22 + u.phase) * 2.2, Math.sin(t * 0.31 + u.phase * 1.7) * 1.4, Math.cos(t * 0.19 + u.phase) * 2.2));
    j.group.position.lerp(tmp, Math.min(1, dt * 0.35 * (0.4 + P.drift)));
    j.group.position.y += Math.sin(t * u.pulse * Math.PI * 2) * 0.012;
    j.group.rotation.y += u.spin * dt;
    j.group.rotation.z = Math.sin(t * 0.4 + u.phase) * 0.06;
    j.sync({
      uTime: t, uPulse: u.pulse, uSqueeze: P.squeeze, uWobble: P.wobble,
      uScale: 1, uGlow: P.glowK, len: P.len,
    });
  }
  grade.uniforms.uTime.value = t;
  if (lab.bloomPass) lab.bloomPass.strength = P.bloom;
  orbit.update();
  lab.render();
  lab.tickFps(dt);
  hudT += dt;
  if (hudT > 0.3) {
    hudT = 0;
    lab.setHud([
      ["jellyfish", swarm.length], ["glow", P.glow], ["pulse", P.pulse.toFixed(2) + " Hz"],
      ["contraction", P.squeeze.toFixed(2)], ["tentacles", P.tentacles], ["length", P.len.toFixed(1)],
      ["shafts", P.shafts], ["snow", snow.count], ["water", P.still ? "still" : "moving"],
    ]);
  }
}
renderer.setAnimationLoop(frame);

lab.expose({
  state: () => snap({
    fps: lab.fps.value, jellyfish: swarm.length, glow: P.glow, pulse: P.pulse, squeeze: P.squeeze,
    glowK: P.glowK, wobble: P.wobble, tentacles: P.tentacles, arms: P.arms, len: P.len,
    drift: P.drift, shafts: P.shafts, snow: snow.count, bloom: P.bloom, depth: P.depth,
    startled: swarm.some((j) => j.group.userData.dart > 0), quality: lab.q.quality,
  }),
  api: {
    params: P,
    set: (k, v) => {
      P[k] = v;
      if (k === "count") buildSwarm(v);
      if (k === "glow") { swarm.forEach((j) => j.setGlow(v)); shafts.materials.forEach((m) => m.uniforms.uColor.value.set(GLOWS[v].ray)); }
      if (k === "snow") snow.count = v;
      if (k === "shafts") shafts.count = v;
      if (k === "bloom" && lab.bloomPass) lab.bloomPass.strength = v;
      if (k === "pulse") swarm.forEach((j) => j.userData.pulse = v);
    },
    startle,
    setGlow: (v) => { P.glow = v; swarm.forEach((j) => j.setGlow(v)); },
    setCount: (n) => { P.count = n; buildSwarm(n); },
    setQuality: (q) => lab.setQuality(q),
    swarm: () => swarm,
  },
});
