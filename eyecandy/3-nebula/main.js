// Eye candy 3 — Nebula. A cloud of up to 300 000 additive points of dust, all positioned in the
// vertex shader from a per-particle seed: shell distribution → three preferred azimuths (spiral arms)
// → differential spin → three value-noise taps that pull it into filaments → cosine palette by radius
// and density. A core star blooms in the middle, distant stars sit behind it, and a click fires a
// shockwave ring through the dust.
import * as THREE from "three";
import { createCandy, gradePass, snap } from "../shared/candy.js";
import { nebula, coreStar, fieldStars, THEMES } from "./dust.js";

const lab = createCandy({
  title: "3 · Nebula — 300 000 points of dust on the GPU",
  camera: { position: [0, 30, 54], target: [0, 0, 0], fov: 52, near: 0.5, far: 900, minDistance: 8, maxDistance: 300 },
  bloom: { strength: 0.72, radius: 0.7, threshold: 0.62, scale: 0.45 },
  exposure: 1.1,
  background: 0x02030a,
  hints: ["drag to orbit", "wheel to fly in", "click = shockwave", "T theme", "R reset view", "Space spin"],
  guiTitle: "nebula",
  preset: "high",
});
const { scene, camera, gui, composer, renderer, pointer, orbit } = lab;
orbit.autoRotate = true;
orbit.autoRotateSpeed = 0.22;

const dust = nebula({ count: 200000, spread: 34, theme: "orion" });
scene.add(dust.points);
const star = coreStar({ color: THEMES.orion.core, size: 6.5 });
scene.add(star.mesh);
const field = fieldStars({ count: 1500, radius: 300 });
scene.add(field.points);
const grade = gradePass(composer, { vignette: 1.12, grain: 0.05, tint: 0x9fc8ff, tintAmount: 0.045, saturation: 1.15 });

const P = {
  count: 200000, spread: 34, flow: 0.055, freq: 0.115, amp: 14.5, spin: 0.16,
  theme: "orion", hue: 0, size: 1.7, bright: 0.3, filament: 1.15, twinkle: 0.5,
  star: 0.55, stars: 1500, bloom: 0.72, autorotate: true,
};

const fDust = gui.addFolder("dust");
fDust.add(P, "count", 5000, 300000, 5000).name("particles").onChange((v) => { dust.count = v; });
fDust.add(P, "spread", 8, 80, 0.5).name("spread").onChange((v) => { dust.uniforms.uSpread.value = v; });
fDust.add(P, "amp", 0, 30, 0.1).name("turbulence").onChange((v) => { dust.uniforms.uAmp.value = v; });
fDust.add(P, "freq", 0.005, 0.2, 0.001).name("noise scale").onChange((v) => { dust.uniforms.uFreq.value = v; });
fDust.add(P, "flow", 0, 0.3, 0.001).name("flow").onChange((v) => { dust.uniforms.uFlow.value = v; });
fDust.add(P, "spin", -0.6, 0.6, 0.005).name("spin").onChange((v) => { dust.uniforms.uSpin.value = v; });
fDust.add(P, "filament", 0, 2, 0.01).name("filaments").onChange((v) => { dust.uniforms.uFilament.value = v; });

const fCol = gui.addFolder("colour");
fCol.add(P, "theme", Object.keys(THEMES)).name("palette").onChange(setTheme);
fCol.add(P, "hue", -0.5, 0.5, 0.005).name("hue shift").onChange((v) => { dust.uniforms.uHue.value = v; });
fCol.add(P, "bright", 0, 3, 0.01).name("brightness").onChange((v) => { dust.uniforms.uBright.value = v; });
fCol.add(P, "size", 0.3, 8, 0.05).name("grain").onChange((v) => { dust.uniforms.uSize.value = v; });
fCol.add(P, "twinkle", 0, 1, 0.01).name("twinkle").onChange((v) => { dust.uniforms.uTwinkle.value = v; });

const fScene = gui.addFolder("scene");
fScene.add(P, "star", 0, 3, 0.01).name("core star").onChange((v) => { star.uniforms.uPulse.value = v; star.mesh.visible = v > 0.01; });
fScene.add(P, "stars", 0, 3000, 50).name("field stars").onChange((v) => { field.points.geometry.setDrawRange(0, v); });
fScene.add(P, "bloom", 0, 2.4, 0.01).name("bloom").onChange((v) => { lab.bloomPass.strength = v; });
fScene.add(P, "autorotate").name("auto-orbit").onChange((v) => { orbit.autoRotate = v; });
gui.add({ blast: () => blast() }, "blast").name("✷ shockwave");

function setTheme(name) {
  const t = THEMES[name] ?? THEMES.orion;
  P.theme = name;
  dust.uniforms.uPalA.value.set(...t.a);
  dust.uniforms.uPalB.value.set(...t.b);
  dust.uniforms.uPalC.value.set(...t.c);
  dust.uniforms.uPalD.value.set(...t.d);
  dust.uniforms.uCore.value.set(t.core);
  dust.uniforms.uHalo.value.set(t.halo);
  star.uniforms.uColor.value.set(t.core);
  grade.uniforms.uTint.value.set(t.halo);
}
setTheme(P.theme);

let blastT = -99;
function blast() { blastT = t; dust.uniforms.uBlastT.value = t; }
renderer.domElement.addEventListener("pointerup", (e) => { if (pointer.moved < 6 && e.button === 0) blast(); });
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "t") { const ks = Object.keys(THEMES); setTheme(ks[(ks.indexOf(P.theme) + 1) % ks.length]); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (k === "r") { camera.position.set(0, 30, 54); orbit.target.set(0, 0, 0); orbit.update(); }
  if (k === " ") { P.spin = P.spin === 0 ? 0.16 : 0; dust.uniforms.uSpin.value = P.spin; e.preventDefault(); }
});

function applyQuality(q) {
  const n = q === "low" ? 30000 : q === "medium" ? 110000 : 200000;
  P.count = n; dust.count = n;
  field.points.geometry.setDrawRange(0, q === "low" ? 500 : q === "medium" ? 1000 : 1500);
  P.stars = field.points.geometry.drawRange.count;
  gui.controllersRecursive().forEach((c) => c.updateDisplay?.());
}
lab.onQuality(applyQuality);
applyQuality("high");

let t = 0, hudT = 0;
function frame() {
  const dt = lab.step();
  t += dt;
  dust.uniforms.uTime.value = t;
  field.material.uniforms.uTime.value = t;
  star.uniforms.uTime.value = t;
  star.mesh.quaternion.copy(camera.quaternion);
  const since = t - blastT;
  grade.uniforms.uTime.value = t;
  grade.uniforms.uGain.value = 1 + (since < 1.2 ? Math.exp(-since * 4.5) * 0.5 : 0);
  if (lab.bloomPass) lab.bloomPass.strength = P.bloom * (since < 1.5 ? 1 + Math.exp(-since * 3) * 0.8 : 1);
  orbit.update();
  lab.render();
  lab.tickFps(dt);
  hudT += dt;
  if (hudT > 0.3) {
    hudT = 0;
    lab.setHud([
      ["dust", dust.count.toLocaleString()], ["spread", P.spread.toFixed(0)],
      ["palette", P.theme], ["turbulence", P.amp.toFixed(1)], ["spin", P.spin.toFixed(2)],
      ["grain", P.size.toFixed(2)], ["shock", since < 6 ? (since).toFixed(1) + "s" : "—"],
    ]);
  }
}
renderer.setAnimationLoop(frame);

lab.expose({
  state: () => snap({
    fps: lab.fps.value, particles: dust.count, spread: P.spread, amp: P.amp, freq: P.freq,
    flow: P.flow, spin: P.spin, theme: P.theme, hue: P.hue, bright: P.bright, size: P.size,
    filament: P.filament, twinkle: P.twinkle, star: P.star, fieldStars: P.stars, bloom: P.bloom,
    shockwave: t - blastT < 6 ? Math.round((t - blastT) * 10) / 10 : null, quality: lab.q.quality,
  }),
  api: {
    params: P,
    set: (k, v) => {
      P[k] = v;
      const u = dust.uniforms;
      if (k === "count") dust.count = v;
      if (k === "stars") field.points.geometry.setDrawRange(0, v);
      if (k === "bloom" && lab.bloomPass) lab.bloomPass.strength = v;
      if (k === "star") { star.uniforms.uPulse.value = v; star.mesh.visible = v > 0.01; }
      if (k === "theme") setTheme(v);
      if (u[`u${k[0].toUpperCase()}${k.slice(1)}`]) u[`u${k[0].toUpperCase()}${k.slice(1)}`].value = v;
    },
    blast,
    setTheme,
    setCount: (n) => { P.count = n; dust.count = n; },
    setQuality: (q) => lab.setQuality(q),
    dust: () => dust,
  },
});
