import * as THREE from "three";
import { makeRng } from "./rng.js";
import { createHud } from "./hud.js";
import { createTrack } from "./track.js";
import { createPlayer } from "./player.js";
import { createSpawner } from "./spawner.js";
import { createGame } from "./game.js";
import { createPost, setupEnvironment } from "../shared/post.js";
import { crtKey } from "../shared/crt.js";
import { createAudio, audioKey } from "../shared/audio.js";
import { createFps } from "../shared/fps.js";
import { createSpeedLines } from "../shared/speedlines.js";
import { skyTexture, glowTexture } from "../shared/textures.js";
import { quality, autoQuality } from "../shared/mobile.js";
import { addTouchControls } from "../shared/touch.js";
import { createSparks, createShatter, createRings, createImpactLight, createScreenFlash } from "../shared/effects.js";

const canvas = document.getElementById("game");
const hud = createHud(document.getElementById("hud"));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
} catch (e) {
  hud.showScreen("no WebGL", `three.js could not create a WebGL context: ${e.message}`);
  throw e;
}
renderer.setPixelRatio(quality({ pixelRatio: 2 }).pixelRatio);

// haze horizon: the fog colour is the sky's horizon band, so the road dissolves into it
// instead of ending on a hard line. Dusk, not noon: the first version fogged to a light
// blue-grey, which lifted the whole frame to a flat daytime wash and killed the neon -
// the edge strips, the lane lines and the hazard stripes all read as pale grey.
const HAZE = 0x10203a;
const scene = new THREE.Scene();
scene.background = skyTexture("#0a1428", "#04070e", "#2c4f78", 0.55);
scene.fog = new THREE.Fog(HAZE, 20, 74);

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 260);
camera.position.set(0, 3.1, 9);

// the PMREM room is what makes chrome read as chrome; at 0.7 it also lit the whole ground
// plane, which is why the desert glowed. The kit is a night arcade: keep the reflections,
// take the general brightening out.
setupEnvironment(renderer, scene, { intensity: 0.35 });
scene.add(new THREE.HemisphereLight(0x5f7f9e, 0x070b12, 0.35));
const keyLight = new THREE.DirectionalLight(0xffd9a8, 1.15);
keyLight.position.set(6, 14, 8);
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0x59f8ff, 1.6);
rim.position.set(-4, 5, -14);
scene.add(rim);

const rng = makeRng(1);
const track = createTrack(scene);
const player = createPlayer(scene);
const spawner = createSpawner(scene, rng);

const Q = quality({ pixelRatio: 2, bloomScale: 0.5, sparks: 1 });
const glow = glowTexture();
const fx = {
  sparks: createSparks(scene, { texture: glow, count: Math.round(500 * Q.sparks) }),
  shards: createShatter(scene, { count: Math.round(140 * Q.sparks), geometry: new THREE.BoxGeometry(0.45, 0.45, 0.45) }),
  rings: createRings(scene, { slots: 8 }),
  impact: createImpactLight(scene, { distance: 11 }),
  flash: createScreenFlash({ max: 0.5 }),
};
const streaks = createSpeedLines(scene, { count: 30, spread: 7.5, minY: 0.06, maxY: 4.5 });
const audio = createAudio({ master: 0.42, delayMix: 0.14 });
const sfx = audio.sfx;
window.arcadeAudio = audio;   // exposed for tools/audiotest.ts
// exposed for the harness: state for the rule checks, and the game's own crash path so a
// game-over screen can be shot (tools/smoke.ts --overjs) without faking one.
// exposed for the harness: state for the rule checks, and the game's own crash path so a
// game-over screen can be shot (tools/smoke.ts --overjs) without faking one. Getters, because
// `game` and `post` are built below.
window.arcade = {
  scene, camera, renderer, audio, player, spawner, streaks, fx,
  get post() { return post; },
  get state() { return game.state; },
  score: () => Math.floor(game.state.distance),
  crash: () => game.crash(spawner.list.find((o) => o.active) ?? { mesh: player.group, jumpable: false }),
};

// ---- touch: tap anywhere on the tube to jump, chips for the lanes and for a restart.
// The chips synthesise the keys the game already handles, so there is one input path.
addTouchControls({
  buttons: [
    { label: "\u25c0", code: "ArrowLeft" },
    { label: "jump", code: "Space", tap: true, accent: true },
    { label: "\u25b6", code: "ArrowRight" },
    { label: "R", code: "KeyR", tap: true, side: "right" },
  ],
});

const game = createGame({ hud, player, spawner, track, camera, canvas, rng, fx, audio, sfx });

const post = createPost(renderer, scene, camera, {
  exposure: 1.12,
  bloom: { strength: 0.55 * Q.bloomStrength, radius: 0.5, threshold: 0.9, scale: Q.bloomScale },
  crt: { look: "cabinet", overrides: Q.crt, bezel: { label: "RUNNER", accent: "#ffb45c" } },
});
const auto = autoQuality({
  floor: 45,
  onDrop: () => { if (post.bloom) post.bloom.enabled = false; streaks.setVisible?.(false); },
});
const fps = createFps(document.getElementById("fps"));
window.addEventListener("keydown", (e) => {
  if (crtKey(e.code, post.crt)) { sfx.select(); e.preventDefault(); return; }
  if (audioKey(e.code, audio)) e.preventDefault();
});

function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h);
}
// Portrait: three's fov is vertical, so a tall viewport narrows the view sideways and the
// three lanes do not fit. game.js sets the fov every frame; this is the multiplier it applies.
camera.portraitFit = () => (camera.aspect < 1 ? 1.34 : 1);
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  fx.sparks.update(dt);
  fx.shards.update(dt);
  fx.rings.update(dt);
  fx.impact.update(dt);
  streaks.update(dt, game.state.speed, game.state.running);
  fx.flash.update(dt);
  auto.tick(dt);
  post.update(clock.getElapsedTime());
  post.render();
  fps.tick(dt);
});
