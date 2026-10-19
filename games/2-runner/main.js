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
import { createSparks, createShatter, createRings, createImpactLight } from "../shared/effects.js";

const canvas = document.getElementById("game");
const hud = createHud(document.getElementById("hud"));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
} catch (e) {
  hud.showScreen("no WebGL", `three.js could not create a WebGL context: ${e.message}`);
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

// haze horizon: the fog colour is the sky's horizon band, so the road dissolves into it
// instead of ending on a hard line
const HAZE = 0x2f5780;
const scene = new THREE.Scene();
scene.background = skyTexture("#16324f", "#070d16", "#8fc4ef", 0.5);
scene.fog = new THREE.Fog(HAZE, 26, 112);

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 220);
camera.position.set(0, 3.1, 9);

setupEnvironment(renderer, scene, { intensity: 0.7 });
scene.add(new THREE.HemisphereLight(0x9db8d6, 0x0b1018, 0.55));
const keyLight = new THREE.DirectionalLight(0xfff2d8, 1.5);
keyLight.position.set(6, 14, 8);
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0x59f8ff, 1.0);
rim.position.set(-4, 5, -14);
scene.add(rim);

const rng = makeRng(1);
const track = createTrack(scene);
const player = createPlayer(scene);
const spawner = createSpawner(scene, rng);

const glow = glowTexture();
const fx = {
  sparks: createSparks(scene, { texture: glow, count: 500 }),
  shards: createShatter(scene, { count: 140, geometry: new THREE.BoxGeometry(0.45, 0.45, 0.45) }),
  rings: createRings(scene, { slots: 8 }),
  impact: createImpactLight(scene, { distance: 11 }),
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

const game = createGame({ hud, player, spawner, track, camera, canvas, rng, fx, audio, sfx });

const post = createPost(renderer, scene, camera, {
  exposure: 1.06,
  bloom: { strength: 0.55, radius: 0.5, threshold: 0.85, scale: 0.5 },
  crt: { look: "cabinet", bezel: { label: "RUNNER", accent: "#ffb45c" } },
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
  post.update(clock.getElapsedTime());
  post.render();
  fps.tick(dt);
});
