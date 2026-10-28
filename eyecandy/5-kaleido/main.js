// Eye candy 5 — Kaleidoscope. A generator feeding a feedback loop, mirrored n-fold. The buffer is
// stored in wedge space, so "rotate the picture" and "zoom the picture" — the two things a kaleidoscope
// does to its own afterimage — are a texture lookup: shift the angle, scale the radius, multiply by a
// fade, then add this frame's domain-warped plasma, voronoi facets and sparks. Drag to steer the folds
// and the zoom, click to inject a ring of fresh light.
import * as THREE from "three";
import { createCandy, gradePass, snap } from "../shared/candy.js";
import { kaleidoscope, PALETTES } from "./kaleido.js";

const lab = createCandy({
  title: "5 · Kaleidoscope — symmetry fed back on itself",
  camera: { position: [0, 0, 5], target: [0, 0, 0], fov: 50, near: 0.1, far: 50 },
  bloom: { strength: 0.8, radius: 0.72, threshold: 0.62, scale: 0.45 },
  exposure: 1.06,
  background: 0x02030a,
  controls: false,
  hints: ["drag: folds ↔ and zoom ↕", "click = inject light", "C palette", "F freeze the loop", "R clear"],
  guiTitle: "kaleidoscope",
  preset: "high",
});
const { scene, gui, renderer, pointer, composer } = lab;

const kaleido = kaleidoscope({ size: 1024, palette: "peacock" });
const { P } = kaleido;
scene.add(kaleido.mesh);
const grade = gradePass(composer, { vignette: 1.0, grain: 0.035, tint: 0xbfd8ff, tintAmount: 0.03, saturation: 1.1 });

const fLoop = gui.addFolder("the loop");
fLoop.add(P, "folds", 1, 40, 1).name("folds").onChange((v) => { kaleido.display.uniforms.uFolds.value = v; });
fLoop.add(P, "spin", -0.6, 0.6, 0.001).name("spin").onChange((v) => { kaleido.feedback.uniforms.uSpin.value = v; });
fLoop.add(P, "zoom", 0.96, 1.05, 0.0005).name("zoom").onChange((v) => { kaleido.feedback.uniforms.uZoom.value = v; });
fLoop.add(P, "damp", 0.8, 0.999, 0.001).name("afterimage").onChange((v) => { kaleido.feedback.uniforms.uDamp.value = v; });
fLoop.add(P, "sourceMix", 0.01, 0.6, 0.005).name("fresh light").onChange((v) => { kaleido.feedback.uniforms.uSourceMix.value = v; });

const fSrc = gui.addFolder("the generator");
fSrc.add(P, "scale", 0.2, 3.2, 0.01).name("scale").onChange((v) => { kaleido.feedback.uniforms.uScale.value = v; });
fSrc.add(P, "warp", 0, 2.5, 0.01).name("warp").onChange((v) => { kaleido.feedback.uniforms.uWarp.value = v; });
fSrc.add(P, "shards", 0, 1.6, 0.01).name("shards").onChange((v) => { kaleido.feedback.uniforms.uShards.value = v; });
fSrc.add(P, "speed", 0, 3, 0.01).name("speed").onChange((v) => { kaleido.feedback.uniforms.uSpeed.value = v; });
fSrc.add(P, "hue", -1, 1, 0.005).name("hue").onChange((v) => { kaleido.feedback.uniforms.uHue.value = v; });

const fLook = gui.addFolder("the glass");
fLook.add(P, "palette", Object.keys(PALETTES)).name("palette").onChange((v) => kaleido.setPalette(v));
fLook.add(P, "exposure", 0.3, 2.2, 0.01).name("exposure").onChange((v) => { kaleido.display.uniforms.uExposure.value = v; });
fLook.add(P, "bloom", 0, 2, 0.01).name("bloom").onChange((v) => { lab.bloomPass.strength = v; });
fLook.add(P, "curve", 0, 1, 0.01).name("lens curve").onChange((v) => { kaleido.display.uniforms.uCurved.value = v; });
gui.add({ inject: () => inject() }, "inject").name("✷ inject light");
gui.add({ clear: () => kaleido.clear(renderer) }, "clear").name("⌫ clear buffer");

let pulse = 0, pulseAt = -99, frozen = false, rot = 0;
function inject() { pulse = 1; pulseAt = t; kaleido.feedback.uniforms.uPulseAt.value = t; }

renderer.domElement.addEventListener("pointerup", (e) => { if (pointer.moved < 6 && e.button === 0) inject(); });
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  P.folds = Math.max(1, Math.min(40, Math.round(P.folds + Math.sign(e.deltaY))));
  kaleido.display.uniforms.uFolds.value = P.folds;
  gui.controllersRecursive().forEach((c) => c.updateDisplay?.());
}, { passive: false });
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "c") { const ks = Object.keys(PALETTES); kaleido.setPalette(ks[(ks.indexOf(P.palette) + 1) % ks.length]); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  if (k === "f") frozen = !frozen;
  if (k === "r") kaleido.clear(renderer);
});

function applyQuality(q) {
  // the buffer is square; on the low preset the loop runs at half resolution
  kaleido.display.uniforms.uFolds.value = P.folds;
  lab.bloomPass.strength = P.bloom;
}
lab.onQuality(applyQuality);

let t = 0, hudT = 0;
function frame() {
  const dt = lab.step();
  const adt = frozen ? 0 : dt;
  t += adt;

  // steering: drag right/left for folds, up/down for the zoom
  if (pointer.down) {
    P.folds = Math.max(1, Math.min(40, Math.round(pointer.ndc.x * 20 + 20)));
    P.zoom = Math.max(0.96, Math.min(1.05, 1.0 + pointer.ndc.y * 0.05));
    kaleido.display.uniforms.uFolds.value = P.folds;
    kaleido.feedback.uniforms.uZoom.value = P.zoom;
  }
  pulse *= Math.pow(0.1, adt);
  kaleido.feedback.uniforms.uTime.value = t;
  kaleido.feedback.uniforms.uPulse.value = pulse;
  rot += adt * 0.03;
  kaleido.display.uniforms.uTime.value = t;
  kaleido.display.uniforms.uRot.value = rot;

  kaleido.step(renderer, frozen ? 0 : dt);
  grade.uniforms.uTime.value = t;
  if (lab.bloomPass) lab.bloomPass.strength = P.bloom;
  lab.render();
  lab.tickFps(dt);
  hudT += dt;
  if (hudT > 0.3) {
    hudT = 0;
    lab.setHud([
      ["folds", P.folds], ["spin", P.spin.toFixed(3)], ["zoom", P.zoom.toFixed(4)],
      ["afterimage", P.damp.toFixed(3)], ["fresh", P.sourceMix.toFixed(2)],
      ["palette", P.palette], ["buffer", `${kaleido.display.uniforms.tBuf.value.image?.width ?? 1024}²`],
      ["loop", frozen ? "frozen" : "running"],
    ]);
  }
}
renderer.setAnimationLoop(frame);
addEventListener("resize", () => kaleido.setSize(innerWidth, innerHeight));
kaleido.setSize(innerWidth, innerHeight);
kaleido.clear(renderer);

lab.expose({
  state: () => snap({
    fps: lab.fps.value, folds: P.folds, spin: P.spin, zoom: P.zoom, damp: P.damp,
    sourceMix: P.sourceMix, scale: P.scale, warp: P.warp, shards: P.shards, speed: P.speed,
    hue: P.hue, palette: P.palette, exposure: P.exposure, bloom: P.bloom, curve: P.curve,
    frozen, injection: t - pulseAt < 2.4 ? Math.round((t - pulseAt) * 10) / 10 : null,
    quality: lab.q.quality,
  }),
  api: {
    params: P,
    set: (k, v) => {
      P[k] = v;
      const f = kaleido.feedback.uniforms, d = kaleido.display.uniforms;
      if (k === "folds") d.uFolds.value = v;
      if (k === "exposure") d.uExposure.value = v;
      if (k === "curve") d.uCurved.value = v;
      if (k === "palette") kaleido.setPalette(v);
      if (k === "bloom" && lab.bloomPass) lab.bloomPass.strength = v;
      if (f[`u${k[0].toUpperCase()}${k.slice(1)}`]) f[`u${k[0].toUpperCase()}${k.slice(1)}`].value = v;
    },
    inject,
    setFolds: (n) => { P.folds = n; kaleido.display.uniforms.uFolds.value = n; },
    setPalette: (p) => kaleido.setPalette(p),
    clear: () => kaleido.clear(renderer),
    freeze: (v) => { frozen = !!v; },
    setQuality: (q) => lab.setQuality(q),
    kaleido: () => kaleido,
  },
});
