// Tower Defense on the shared arcade kit: a 12x12 field, BFS lanes, click/keys to place
// towers, waves that re-route around them, and an arcade cabinet around the whole thing.
import * as THREE from "three";
import { createPost, setupEnvironment } from "../shared/post.js";
import { quality, autoQuality } from "../shared/mobile.js";
import { addTouchControls } from "../shared/touch.js";
import { crtKey, PHOSPHORS } from "../shared/crt.js";
import { createAudio, audioKey } from "../shared/audio.js";
import { createSparks, createShatter, createRings, createImpactLight } from "../shared/effects.js";
import { createFps } from "../shared/fps.js";
import { skyTexture } from "../shared/textures.js";
import { createGrid, COST, START_MONEY, RANGE, N, world, ENTRANCE, EXIT } from "./grid.js";
import { createEnemies } from "./enemies.js";
import { createTowers } from "./towers.js";

const START_LIVES = 10;
const BUILD_TIME = 12;

// ---------------------------------------------------------------- HUD
const nodes = {};
for (const n of document.querySelectorAll("[data-k]")) nodes[n.dataset.k] = n;
const set = (key, text) => { const n = nodes[key]; if (n && n.textContent !== String(text)) n.textContent = text; };
const screen = nodes.title ? nodes.title.closest("#screen") : null;
const fps = createFps(document.getElementById("fps"), { label: "FPS" });
const waveBtn = document.getElementById("wave-btn");

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(quality({ pixelRatio: 2 }).pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = skyTexture("#16324f", "#05070d", "#3f6a96", 0.66);
const FOG = { near: 20, far: 48 };   // the desktop framing; the portrait fit scales these
scene.fog = new THREE.Fog(0x0b1220, FOG.near, FOG.far);
setupEnvironment(renderer, scene, { intensity: 0.55 });

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 90);
const CAM = { x: 0, y: 10.3, z: 10.7 };
// Portrait: the board has to fit SIDEWAYS, and three's fov is vertical - a tall viewport
// narrows the horizontal view (horizontal = fov x aspect), which crops the maze. Widening
// the vertical fov does not help: the horizontal is still the narrow one. The camera pulls
// back by the ratio of the reference desktop aspect to this one, which frames exactly the
// same world width as the desktop shot. The tube keeps its surround above and below. The fog
// is a distance, so it moves with the camera: at the portrait distance the desktop fog buries
// the whole board (measured: the first portrait frame of the maze was pure fog, board gone).
let fitK = 1;
const fitPull = () => {
  // 0.8 fills the tube and leaves a margin, rather than matching the desktop width exactly
  const k = Math.min(4.2, Math.max(1, 0.8 * (16 / 9) / Math.max(0.2, camera.aspect)));
  scene.fog.near = FOG.near * k;
  scene.fog.far = FOG.far * k;
  return k;
};
fitK = fitPull();

camera.position.set(CAM.x, CAM.y, CAM.z);
camera.lookAt(0, 0, 0);

const Q = quality({ pixelRatio: 2, bloomScale: 0.5, shadowMap: 1024, sparks: 1 });
const post = createPost(renderer, scene, camera, {
  exposure: 1.0,
  bloom: { strength: 0.62 * Q.bloomStrength, radius: 0.5, threshold: 1.0, scale: Q.bloomScale },
  crt: { look: "arcade", overrides: Q.crt, phosphor: PHOSPHORS.p43,
         bezel: { label: "TOWER DEFENSE", accent: "#ff3fa4" } },
});
const auto = autoQuality({ floor: 45, onDrop: () => {
  if (post.bloom) post.bloom.enabled = false;
  key.shadow.mapSize.set(256, 256);
} });

const key = new THREE.DirectionalLight(0xfff4de, 2.6);
key.position.set(7, 14, 5);
key.castShadow = true;
key.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 2, far: 34 });
key.shadow.bias = -0.0012;
// Shadows at full strength on a bright lawn read as holes punched in the board: the tower
// discs came up black. three's shadow intensity (r168+) takes the opacity out, not the shape.
key.shadow.intensity = 0.5;
scene.add(key, key.target);
scene.add(new THREE.HemisphereLight(0x92b4d8, 0x22301f, 0.75));
const rim = new THREE.DirectionalLight(0x63c8ff, 1.0);
rim.position.set(-9, 6, -10);
scene.add(rim);

// effects + audio
const fx = {
  sparks: createSparks(scene, { gravity: -7, drag: 1.5 }),
  shards: createShatter(scene, { count: 220 }),
  rings: createRings(scene, { slots: 12, inner: 0.2, outer: 0.28 }),
  impact: createImpactLight(scene, { distance: 9, decay: 2 }),
};
const audio = createAudio({ master: 0.42, delayMix: 0.12 });
const sfx = audio.sfx;

// world
const grid = createGrid(scene);
let shake = 0;
const enemies = createEnemies(scene, {
  camera, grid, fx, audio,
  onLeak() {
    lives--;
    leaked++;
    shake = 0.5;
    sfx.die();
    last = "leak";
    if (lives <= 0) gameOver();
  },
  onKill(e) {
    kills++;
    money += e.reward;
    last = `kill +${e.reward}`;
    sfx.coin();
  },
});
const towers = createTowers(scene, { camera, enemies, fx, audio });

// a low wall around the field so the board reads as a diorama, not an infinite plane
const skirt = new THREE.Mesh(
  new THREE.BoxGeometry(N + 0.6, 0.5, N + 0.6),
  new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.6, metalness: 0.4, envMapIntensity: 0.6 }),
);
skirt.position.y = -0.3;
skirt.receiveShadow = true;
scene.add(skirt);

// ---------------------------------------------------------------- state
let money = START_MONEY;
let lives = START_LIVES;
let state = "build";            // build | wave | over
let last = "start";
let countdown = BUILD_TIME;
const wave = { n: 0, queue: 0, count: 0, timer: 0, interval: 0.6 };
let kills = 0, leaked = 0, musicOn = false;
const cursorTile = { col: Math.floor(N / 2), row: Math.floor(N / 2), visible: false };

function firstGesture() {
  if (musicOn) return;
  musicOn = true;
  audio.startMusic({
    bpm: 132, bass: [0, 0, 5, 3], lead: [12, 15, 19, 22, 19, 15],
    leadGain: 0.045, bassGain: 0.085, kick: true,
  });
}

function startWave() {
  if (state === "over") return;
  if (state === "wave") return;
  firstGesture();
  wave.n++;
  wave.count = 5 + wave.n * 2;
  wave.queue = wave.count;
  wave.interval = Math.max(0.3, 0.8 - wave.n * 0.03);
  wave.timer = 0;
  state = "wave";
  last = "wave " + wave.n;
  sfx.start();
}

function gameOver() {
  state = "over";
  last = "game over";
  audio.stopMusic();
  sfx.gameOver();
  fx.impact.flash(new THREE.Vector3(0, 0.5, 0), { color: 0xff3040, power: 30, dur: 0.6 });
  if (nodes.title) nodes.title.textContent = "the lane broke";
  if (nodes.msg) nodes.msg.textContent = `wave ${wave.n} · ${kills} kills · ${leaked} leaked · press R to rebuild`;
  if (screen) screen.hidden = false;
}

function restart() {
  money = START_MONEY;
  lives = START_LIVES;
  state = "build";
  countdown = BUILD_TIME;
  wave.n = 0; wave.queue = 0; wave.count = 0;
  kills = 0; leaked = 0; last = "restart";
  enemies.clear();
  towers.clear();
  for (const k of [...grid.towers]) grid.towers.delete(k);
  grid.paint();
  if (screen) screen.hidden = true;
  sfx.select();
}

function tryPlace(c, r) {
  if (state === "over") return;
  firstGesture();
  const v = grid.canPlace(c, r);
  if (!v.ok) { last = v.why; sfx.wall(0.25); return; }
  if (money < COST) { last = `need $${COST}`; sfx.wall(0.25); return; }
  money -= COST;
  const t = towers.build(c, r);
  grid.place(c, r);
  enemies.reroute();
  t.show = 1;
  t.hideAt = clock.getElapsedTime() + 1.6;
  const p = world(c, r);
  fx.rings.burst(new THREE.Vector3(p.x, 0.12, p.z), { color: 0x7fd7ff, from: 0.4, to: 3.4, dur: 0.45 });
  fx.sparks.spawn(new THREE.Vector3(p.x, 0.3, p.z), { n: 12, speed: 2.6, spread: 1.2, size: 0.45, life: 0.4, color: 0x9fe8ff });
  sfx.power();
  last = `tower ${c},${r}`;
}

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickTile(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return grid.pick(ray);
}

renderer.domElement.addEventListener("pointermove", (ev) => {
  const t = pickTile(ev);
  if (!t) { grid.hide(); cursorTile.visible = false; return; }
  cursorTile.col = t.col; cursorTile.row = t.row; cursorTile.visible = true;
  grid.show(t.col, t.row, money >= COST && grid.canPlace(t.col, t.row).ok);
});
renderer.domElement.addEventListener("pointerleave", () => { grid.hide(); cursorTile.visible = false; });
renderer.domElement.addEventListener("pointerdown", (ev) => {
  const t = pickTile(ev);
  if (t) tryPlace(t.col, t.row);
});
waveBtn?.addEventListener("click", (e) => { e.preventDefault(); startWave(); });

const MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};
window.addEventListener("keydown", (e) => {
  if (audioKey(e.code, audio) || crtKey(e.code, post.crt)) return;
  if (e.code === "KeyR") { restart(); return; }
  if (e.code === "KeyN" || e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (e.code === "KeyN") startWave();
    else { firstGesture(); tryPlace(cursorTile.col, cursorTile.row); }
    return;
  }
  const m = MOVE[e.code];
  if (!m) return;
  e.preventDefault();
  firstGesture();
  cursorTile.col = Math.max(0, Math.min(N - 1, cursorTile.col + m[0]));
  cursorTile.row = Math.max(0, Math.min(N - 1, cursorTile.row + m[1]));
  cursorTile.visible = true;
  grid.show(cursorTile.col, cursorTile.row, money >= COST && grid.canPlace(cursorTile.col, cursorTile.row).ok);
  sfx.tick();
});
window.addEventListener("pointerdown", () => { audio.ensure(); }, { once: true });

// ---- touch: the board is already pointer-driven, so a tap on a tile is the whole control -
// touch events drive pointerdown in Chromium, and the tile under the finger is built. Two
// chips carry the keys a thumb cannot press: start the wave, restart. The arrows are there too
// for a thumb at the edge of the tube.
addTouchControls({
  buttons: [
    { label: "◀", code: "ArrowLeft" },
    { label: "build", code: "Space", tap: true, accent: true },
    { label: "\u25b6", code: "ArrowRight" },
    { label: "wave", code: "KeyN", tap: true, side: "right" },
    { label: "R", code: "KeyR", tap: true, side: "right" },
  ],
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // three's fov is vertical, so a tall viewport crops the board sideways: in portrait the fov
  // opens up and the whole lane is in frame again
  camera.updateProjectionMatrix();
  fitK = fitPull();   // in portrait the camera pulls back so the whole lane fits sideways
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let hudTick = 0;

function refresh() {
  set("money", money);
  set("lives", lives);
  set("wave", wave.n);
  set("left", state === "wave" ? wave.queue + enemies.count : 0);
  set("towers", towers.list.length);
  set("cost", COST);
  set("range", RANGE.toFixed(1));
  set("state", state === "build" ? `build ${Math.ceil(countdown)}s` : state === "wave" ? "wave" : "over");
  document.body.classList.toggle("playing", state === "wave");
  set("last", last);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  if (state === "build") {
    countdown -= dt;
    if (countdown <= 0) startWave();
  } else if (state === "wave") {
    if (wave.queue > 0) {
      wave.timer -= dt;
      if (wave.timer <= 0) {
        wave.timer = wave.interval;
        const e = enemies.spawn(wave.n);
        if (e) {
          wave.queue--;
          const p = world(...ENTRANCE);
          fx.rings.burst(new THREE.Vector3(p.x, 0.2, p.z), { color: 0xff3fa4, from: 0.3, to: 1.6, dur: 0.3 });
        }
      }
    } else if (enemies.count === 0) {
      const bonus = 10 + wave.n * 2;
      money += bonus;
      state = "build";
      countdown = BUILD_TIME;
      last = `wave ${wave.n} clear +$${bonus}`;
      sfx.win();
      const p = world(...EXIT);
      fx.rings.burst(new THREE.Vector3(p.x, 0.3, p.z), { color: 0x3dff8b, from: 0.5, to: 4.5, dur: 0.6 });
    }
  }

  enemies.update(dt, elapsed);
  towers.update(dt, elapsed);
  fx.sparks.update(dt); fx.shards.update(dt); fx.rings.update(dt); fx.impact.update(dt);

  // gates breathe; the cursor blinks with the build clock
  const pulse = 0.3 + 0.18 * Math.sin(elapsed * 2.4);
  grid.entrance.halo.opacity = pulse + (state === "wave" ? 0.2 : 0);
  grid.exitGate.halo.opacity = pulse;
  grid.entrance.arch.emissiveIntensity = 1.2 + 0.6 * Math.sin(elapsed * 3.1);
  grid.exitGate.arch.emissiveIntensity = 1.2 + 0.6 * Math.sin(elapsed * 2.2 + 1);
  if (cursorTile.visible) grid.show(cursorTile.col, cursorTile.row, money >= COST && grid.canPlace(cursorTile.col, cursorTile.row).ok);

  shake = Math.max(0, shake - dt * 1.6);
  const drift = Math.sin(elapsed * 0.14) * 0.5;
  camera.position.set(
    CAM.x * fitK + drift + (Math.random() - 0.5) * shake,
    CAM.y * fitK + (Math.random() - 0.5) * shake,
    CAM.z * fitK - drift * 0.35,
  );
  camera.lookAt(drift * 0.2, 0, 0);

  hudTick += dt;
  if (hudTick > 0.1) { hudTick = 0; refresh(); }
  auto.tick(dt);
  fps.tick(dt);

  post.update(elapsed);
  post.render();
  requestAnimationFrame(frame);
}

// exposed for the headless tools (tools/smoke.ts, tools/audiotest.ts, tools/linescan.mjs)
// place/money expose the game's own rules to the headless tools, so a tower can be placed and
// the kill/leak accounting read back without scripting the mouse through a software renderer.
window.arcade = { post, scene, camera, renderer, audio, grid, towers, enemies, wave, place: tryPlace, state: () => state, stats: () => ({ money, lives, kills, leaked }), over: gameOver, restart };
window.arcadeAudio = audio;

grid.show(cursorTile.col, cursorTile.row, true);
refresh();
post.setSize(window.innerWidth, window.innerHeight);
requestAnimationFrame(frame);
