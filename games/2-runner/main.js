import * as THREE from "three";
import { makeRng } from "./rng.js";
import { createHud } from "./hud.js";
import { createTrack } from "./track.js";
import { createPlayer } from "./player.js";
import { createSpawner } from "./spawner.js";
import { createGame } from "./game.js";

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

const BG = 0x101418;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.012);

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 220);
camera.position.set(0, 3.1, 9);

scene.add(new THREE.HemisphereLight(0x9db8d6, 0x141a22, 0.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(6, 14, 8);
scene.add(keyLight);

const rng = makeRng(1);
const track = createTrack(scene);
const player = createPlayer(scene);
const spawner = createSpawner(scene, rng);
const game = createGame({ hud, player, spawner, track, camera, canvas, rng });

function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  renderer.render(scene, camera);
});
