// Marble Maze: a cannon-es board-tilt maze on the shared arcade kit.
// The physics (bodies, tilt spring, hole/goal events) is the game; everything around it —
// wood and stone textures, PMREM chrome, bloom, the CRT and cabinet bezel, sparks, sound and
// the HUD — comes from ../shared/.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import * as L from "./level.js";

import { createPost, setupEnvironment } from "../shared/post.js";
import { quality, autoQuality } from "../shared/mobile.js";
import { addTouchControls } from "../shared/touch.js";
import { crtKey, PHOSPHORS } from "../shared/crt.js";
import { createAudio, audioKey } from "../shared/audio.js";
import { createSparks, createShatter, createRings, createImpactLight } from "../shared/effects.js";
import { createFps } from "../shared/fps.js";
import {
  woodTexture, stoneTexture, brushedMetal, noiseTexture, glowTexture, shadowTexture,
  stripesTexture, skyTexture, gridTexture,
} from "../shared/textures.js";

// ---------------------------------------------------------------- HUD
const nodes = {};
for (const n of document.querySelectorAll("[data-k]")) nodes[n.dataset.k] = n;
const set = (key, text) => { const n = nodes[key]; if (n && n.textContent !== text) n.textContent = text; };
const screen = nodes.title ? nodes.title.closest("#screen") : null;
const hint = document.getElementById("hint");
const fps = createFps(document.getElementById("fps"), { label: "FPS" });

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(quality({ pixelRatio: 2 }).pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = skyTexture("#101d30", "#04060b");
const FOG = { near: 4.2, far: 9.5 };   // the desktop framing; the portrait fit scales these
scene.fog = new THREE.Fog(0x0b1220, FOG.near, FOG.far);
setupEnvironment(renderer, scene, { intensity: 0.75 });

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 40);
const CAM = { x: 0, y: 2.28, z: 2.66 };
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
  exposure: 1.02,
  bloom: { strength: 0.55 * Q.bloomStrength, radius: 0.5, threshold: 1.0, scale: Q.bloomScale },
  crt: { look: "cabinet", overrides: Q.crt, phosphor: PHOSPHORS.p22,
         bezel: { label: "MARBLE MAZE", accent: "#ffcf5c" } },
});
// a phone that cannot hold the frame rate loses the shadow map and the bloom, once
const auto = autoQuality({ floor: 45, onDrop: () => {
  if (post.bloom) post.bloom.enabled = false;
  key.shadow.mapSize.set(256, 256);
} });

// lights: warm key over the table, cool rim from the arcade room
const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
key.position.set(1.8, 3.4, 1.7);
key.castShadow = true;
key.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 9 });
key.shadow.bias = -0.0008;
key.shadow.intensity = 0.55;   // the walls' own shadows at full strength blacken the maze floor
scene.add(key, key.target);
scene.add(new THREE.HemisphereLight(0x8fa8cc, 0x1b2430, 0.7));
const rim = new THREE.DirectionalLight(0x6fd8ff, 1.1);
rim.position.set(-2.2, 1.4, -2.4);
scene.add(rim);
const marbleLight = new THREE.PointLight(0xbfe6ff, 1.2, 1.4, 2);
scene.add(marbleLight);

// ---------------------------------------------------------------- level meshes
const boardGroup = new THREE.Group();
scene.add(boardGroup);
const level = L.parse();

const wood = woodTexture({ base: "#c09257", ring: "#875c31" });
wood.repeat.set(3, 2);
const woodRough = noiseTexture({ size: 256, octaves: 4, contrast: 1.1, base: 0.55 });
woodRough.repeat.set(3, 2);
const stone = stoneTexture({ base: "#556479" });
stone.repeat.set(2, 2);

// board: one merged mesh per floor run, so holes are real gaps
const boardGeoms = [];
for (const run of level.floor) {
  const c = L.local((run.col0 + run.col1) / 2, run.row);
  const g = new THREE.BoxGeometry((run.col1 - run.col0 + 1) * L.TILE, L.BOARD_T, L.TILE);
  g.translate(c.x, -L.BOARD_T / 2, c.z);
  boardGeoms.push(g);
}
const boardMesh = new THREE.Mesh(
  mergeGeometries(boardGeoms),
  new THREE.MeshStandardMaterial({
    color: 0xd8b183, map: wood, roughnessMap: woodRough, roughness: 0.7, metalness: 0.05,
    envMapIntensity: 0.5,
  }),
);
boardMesh.name = "board";
boardMesh.castShadow = true;
boardMesh.receiveShadow = true;
boardGroup.add(boardMesh);

// walls: merged stone blocks
const wallGeoms = [];
for (const w of level.walls) {
  const c = L.local(w.col, w.row);
  const g = new THREE.BoxGeometry(L.TILE, L.WALL_H, L.TILE);
  g.translate(c.x, L.WALL_H / 2, c.z);
  wallGeoms.push(g);
}
const wallMesh = new THREE.Mesh(
  mergeGeometries(wallGeoms),
  new THREE.MeshStandardMaterial({ color: 0x4b5a6d, map: stone, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.8 }),
);
wallMesh.castShadow = true;
wallMesh.receiveShadow = true;
boardGroup.add(wallMesh);

// Wall caps: an etched neon rim around the top of every block, merged into one mesh. A filled
// glowing top (the first attempt) turned the whole maze into a blue rooftop — the rim is a
// hairline, so the stone reads as stone and the maze lines read on a small screen.
const capGeoms = [];
const cw = 0.014;
for (const w of level.walls) {
  const c = L.local(w.col, w.row);
  const t = L.TILE;
  capGeoms.push(
    new THREE.BoxGeometry(t, 0.006, cw).translate(c.x, L.WALL_H + 0.001, c.z - t / 2 + cw / 2),
    new THREE.BoxGeometry(t, 0.006, cw).translate(c.x, L.WALL_H + 0.001, c.z + t / 2 - cw / 2),
    new THREE.BoxGeometry(cw, 0.006, t).translate(c.x - t / 2 + cw / 2, L.WALL_H + 0.001, c.z),
    new THREE.BoxGeometry(cw, 0.006, t).translate(c.x + t / 2 - cw / 2, L.WALL_H + 0.001, c.z),
  );
}
const wallCaps = new THREE.Mesh(
  mergeGeometries(capGeoms),
  new THREE.MeshStandardMaterial({
    color: 0x0b1a26, emissive: 0x35c8ff, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.5,
  }),
);
wallCaps.name = "caps";
boardGroup.add(wallCaps);          // and deliberately not in the shadow pass: 360 hairlines

// frame around the board, so the ply edge is not a bare cut
const bw = L.COLS * L.TILE, bd = L.ROWS * L.TILE, ft = 0.035;
const frameGeoms = [
  new THREE.BoxGeometry(bw + ft * 2, L.BOARD_T * 1.6, ft).translate(0, -L.BOARD_T * 0.8, bd / 2 + ft / 2),
  new THREE.BoxGeometry(bw + ft * 2, L.BOARD_T * 1.6, ft).translate(0, -L.BOARD_T * 0.8, -bd / 2 - ft / 2),
  new THREE.BoxGeometry(ft, L.BOARD_T * 1.6, bd).translate(bw / 2 + ft / 2, -L.BOARD_T * 0.8, 0),
  new THREE.BoxGeometry(ft, L.BOARD_T * 1.6, bd).translate(-bw / 2 - ft / 2, -L.BOARD_T * 0.8, 0),
];
const frameMesh = new THREE.Mesh(
  mergeGeometries(frameGeoms),
  new THREE.MeshStandardMaterial({ color: 0x2b3a4c, map: brushedMetal({ top: "#3a4c62", bottom: "#1a2432" }), roughness: 0.35, metalness: 0.7, envMapIntensity: 1.1 }),
);
frameMesh.castShadow = true;
boardGroup.add(frameMesh);

// hole rims: a glowing ring around every hole, so a gap is visible before it is a fall
const rimGeoms = [];
for (const h of level.holes) {
  const c = L.local(h.col, h.row);
  const g = new THREE.RingGeometry(L.TILE * 0.30, L.TILE * 0.46, 24);
  g.rotateX(-Math.PI / 2);
  g.translate(c.x, 0.002, c.z);
  rimGeoms.push(g);
}
const holeRims = new THREE.Mesh(
  mergeGeometries(rimGeoms),
  new THREE.MeshBasicMaterial({ color: 0xff5a6e, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
);
boardGroup.add(holeRims);

// edge opening: hazard stripes where the board ends, so "off the board" is signposted
for (const g0 of level.gaps) {
  const c = L.local(g0.col, g0.row);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(L.TILE, L.TILE),
    new THREE.MeshStandardMaterial({
      map: stripesTexture({ a: "#ff5a5a", b: "#2a1218", bands: 5 }),
      emissive: 0xff3040, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide,
    }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(c.x, 0.002, c.z);
  boardGroup.add(plate);
}

function pad(col, row, color, emissive, intensity = 0.9) {
  const c = L.local(col, row);
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(L.TILE * 0.42, 40),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(c.x, 0.001, c.z);
  m.receiveShadow = true;
  boardGroup.add(m);
  return m;
}
pad(L.START[0], L.START[1], 0x2f6f7c, 0x18d6ff, 0.7);
const goalPad = pad(L.GOAL[0], L.GOAL[1], 0x2f8f5f, 0x37ff86, 0.7);
const gc = L.local(L.GOAL[0], L.GOAL[1]);

// goal beacon: a soft column of light, readable from across the board. Kept narrow and dim:
// at the camera's grazing angle a wide additive column blooms into a green streak across the
// whole left of the tube, which reads as an artefact and not as a goal
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(L.TILE * 0.26, L.TILE * 0.16, 0.62, 20, 1, true),
  new THREE.MeshBasicMaterial({
    map: glowTexture(), color: 0x4dff9a, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
    depthWrite: false, toneMapped: true,   // normal blending, tone mapped: the column is the shape of a
                                          // goal marker, not a light source, so the bloom leaves it alone
  }),
);
beacon.position.set(gc.x, 0.31, gc.z);
boardGroup.add(beacon);

// table under the board. Tiled grids are line magnets at a distance (see the notes in
// 1-breakout/js/entities.js), so the grid fades out radially with an alphaMap.
const tableTex = gridTexture({ base: "#0c1420", line: "rgba(80,170,240,0.14)", major: "rgba(120,210,255,0.2)", pool: null }).clone();
tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping;
tableTex.repeat.set(10, 7);
const table = new THREE.Mesh(
  new THREE.PlaneGeometry(11, 8),
  new THREE.MeshStandardMaterial({
    color: 0x0c1420, map: tableTex, roughness: 0.5, metalness: 0.45, envMapIntensity: 0.8,
    alphaMap: glowTexture(), transparent: true, depthWrite: false,
  }),
);
table.rotation.x = -Math.PI / 2;
table.position.y = -0.42;
table.receiveShadow = true;
scene.add(table);

// marble: chrome that reflects the room, plus a contact shadow that lives on the board
const marbleMesh = new THREE.Mesh(
  new THREE.SphereGeometry(L.MARBLE_R, 32, 24),
  new THREE.MeshPhysicalMaterial({
    color: 0xe6eefc, metalness: 1, roughness: 0.1, envMapIntensity: 2.2,
    clearcoat: 0.7, clearcoatRoughness: 0.15, emissive: 0x101a26, emissiveIntensity: 0.4,
  }),
);
marbleMesh.castShadow = true;
scene.add(marbleMesh);

// a bloom partner: chrome has no glow of its own, so at 9 cm it disappears on a small screen
const marbleGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), color: 0xa8dcff, transparent: true, opacity: 0.26,
  blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
}));
marbleGlow.scale.setScalar(L.MARBLE_R * 2.6);
scene.add(marbleGlow);

const marbleShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(L.MARBLE_R * 4.5, L.MARBLE_R * 4.5),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
);
marbleShadow.rotation.x = -Math.PI / 2;
boardGroup.add(marbleShadow);

// effects
const sparks = createSparks(scene, { gravity: -3.2, drag: 1.8 });
const shards = createShatter(scene, { count: 120, color: 0xff6a78 });
const rings = createRings(scene, { slots: 8, inner: 0.06, outer: 0.09 });
const impact = createImpactLight(scene, { distance: 3.2 });

// audio
const audio = createAudio({ master: 0.4, delayMix: 0.12 });
const sfx = audio.sfx;

// ---------------------------------------------------------------- physics
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;

const boardMat = new CANNON.Material("board");
const marbleMat = new CANNON.Material("marble");
world.addContactMaterial(new CANNON.ContactMaterial(boardMat, marbleMat, {
  friction: 0.2, restitution: 0.05, contactEquationStiffness: 1e7, contactEquationRelaxation: 3,
}));

const statics = [];
function addStatic(center, half, mat) {
  const body = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)) });
  const local = new CANNON.Vec3(center.x, center.y, center.z);
  body.position.copy(local);
  body.updateAABB();
  world.addBody(body);
  statics.push({ body, local });
  return body;
}

for (const run of level.floor) {
  const c = L.local((run.col0 + run.col1) / 2, run.row);
  addStatic({ x: c.x, y: -L.BOARD_T / 2, z: c.z }, { x: ((run.col1 - run.col0 + 1) * L.TILE) / 2, y: L.BOARD_T / 2, z: L.TILE / 2 }, boardMat);
}
for (const w of level.walls) {
  const c = L.local(w.col, w.row);
  addStatic({ x: c.x, y: L.WALL_H / 2, z: c.z }, { x: L.TILE / 2, y: L.WALL_H / 2, z: L.TILE / 2 }, boardMat);
}

const marbleBody = new CANNON.Body({
  mass: 0.03, material: marbleMat, shape: new CANNON.Sphere(L.MARBLE_R),
  linearDamping: 0.06, angularDamping: 0.05,
});
world.addBody(marbleBody);

// wall thwacks: the impact velocity decides the pitch, with a floor on the rate
let lastClack = 0;
marbleBody.addEventListener("collide", (e) => {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
  const now = performance.now();
  if (v < 0.35 || now - lastClack < 70) return;
  lastClack = now;
  sfx.wall(Math.min(1, v * 2));
  const p = marbleMesh.position;
  sparks.spawn(p, { n: 4, speed: 1.1, spread: 1, size: 0.35, life: 0.22, color: 0xffe6a8, up: 0.3 });
  shake = Math.min(0.05, shake + v * 0.02);
});

// ---------------------------------------------------------------- tilt
const tilt = { x: 0, z: 0, vx: 0, vz: 0 };
const target = { x: 0, z: 0 };
const keys = { up: false, down: false, left: false, right: false };
const q3 = new THREE.Quaternion();
const qc = new CANNON.Quaternion();
const qInv = new CANNON.Quaternion();
const tmp = new CANNON.Vec3();
const localPos = new CANNON.Vec3();
const SPRING = 16, DAMP = 2 * Math.sqrt(SPRING);
let shake = 0;

function updateTarget() {
  // Camera looks from +z, so "up" on screen is the far edge (+z). A positive tilt about x
  // lifts the far edge and the marble rolls away from the camera; positive tilt about z
  // lifts the right edge and the marble rolls left.
  target.x = ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * L.MAX_TILT;
  target.z = ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * L.MAX_TILT;
}

function stepTilt(dt) {
  tilt.vx += ((target.x - tilt.x) * SPRING - DAMP * tilt.vx) * dt;
  tilt.x += tilt.vx * dt;
  tilt.vz += ((target.z - tilt.z) * SPRING - DAMP * tilt.vz) * dt;
  tilt.z += tilt.vz * dt;
  q3.setFromEuler(new THREE.Euler(tilt.x, 0, tilt.z, "XYZ"));
  qc.set(q3.x, q3.y, q3.z, q3.w);
  boardGroup.quaternion.copy(q3);
  for (const s of statics) {
    qc.vmult(s.local, tmp);
    s.body.position.copy(tmp);
    s.body.quaternion.copy(qc);
    s.body.updateAABB();
  }
}

// ---------------------------------------------------------------- game state
let state = "ready";          // ready | rolling | complete
let running = false;
let timer = 0, falls = 0, lastEvent = "start", best = null, keyCount = 0, musicOn = false;

function placeMarble() {
  const c = L.local(L.START[0], L.START[1]);
  marbleBody.position.set(c.x, L.MARBLE_R, c.z);
  marbleBody.velocity.set(0, 0, 0);
  marbleBody.angularVelocity.set(0, 0, 0);
  marbleBody.quaternion.set(0, 0, 0, 1);
  marbleBody.updateAABB();
  marbleMesh.position.copy(marbleBody.position);
  marbleMesh.quaternion.copy(marbleBody.quaternion);
}

function begin() {
  if (state !== "ready") return;
  state = "rolling";
  running = true;
  if (hint) hint.style.visibility = "hidden";
  sfx.start();
  if (!musicOn) {
    musicOn = true;
    audio.startMusic({ bpm: 104, bass: [0, 0, 7, 5], lead: [12, 15, 19, 15], leadGain: 0.05, bassGain: 0.09 });
  }
}

function restart() {
  state = "ready"; running = false; timer = 0; falls = 0; lastEvent = "start";
  tilt.x = tilt.z = tilt.vx = tilt.vz = 0;
  keys.up = keys.down = keys.left = keys.right = false;
  if (screen) screen.hidden = true;
  if (hint) hint.style.visibility = "";
  sparks.clear(); shards.clear(); rings.clear(); impact.clear();
  placeMarble();
  refresh();
}

function fell(reason) {
  falls++;
  lastEvent = reason;
  const p = marbleMesh.position.clone();
  sfx.crack();
  sfx.die();
  shards.burst(p, { n: 16, color: 0xff6a78, speed: 2.4, scale: 0.6 });
  sparks.spawn(p, { n: 16, speed: 2.2, spread: 1.2, size: 0.5, life: 0.5, color: 0xff8a5c });
  rings.burst(p, { color: 0xff5a6e, from: 0.4, to: 4, dur: 0.5 });
  impact.flash(p, { color: 0xff5a6e, power: 12, dur: 0.3 });
  shake = 0.14;
  placeMarble();
  refresh();
}

function complete() {
  state = "complete";
  running = false;
  if (best === null || timer < best) best = timer;
  const p = new THREE.Vector3(gc.x, 0.05, gc.z);
  sfx.win();
  sfx.coin();
  rings.burst(p, { color: 0x4dff9a, from: 0.5, to: 7, dur: 0.7 });
  rings.burst(p, { color: 0xffffff, from: 0.3, to: 5, dur: 0.5 });
  sparks.spawn(p, { n: 40, speed: 3.2, spread: 1.4, size: 0.6, life: 0.9, color: 0x8dffc4 });
  impact.flash(p, { color: 0x4dff9a, power: 20, dur: 0.5 });
  shake = 0.08;
  if (nodes.title) nodes.title.textContent = "course clear";
  if (nodes.msg) nodes.msg.textContent = `${timer.toFixed(2)} s · ${falls} fall${falls === 1 ? "" : "s"} · press R to run it again`;
  if (screen) screen.hidden = false;
  refresh();
}

const deg = (r) => (r * 180 / Math.PI).toFixed(1);
function refresh() {
  const p = boardLocal();
  const t = tileAt(p);
  set("time", timer.toFixed(2));
  set("falls", String(falls));
  set("best", best === null ? "--" : best.toFixed(2));
  set("tile", `${t.col},${t.row}`);
  set("tilt", `${deg(tilt.x)} / ${deg(tilt.z)}`);
  set("state", state === "complete" ? "clear" : state === "ready" ? "ready" : "rolling");
  document.body.classList.toggle("playing", state === "rolling");
  set("last", lastEvent);
}

// ---------------------------------------------------------------- input
const MAP_KEY = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
};
window.addEventListener("keydown", (e) => {
  keyCount++;
  if (e.code === "KeyR") { restart(); sfx.select(); return; }
  if (audioKey(e.code, audio) || crtKey(e.code, post.crt)) return;
  const k = MAP_KEY[e.code];
  if (!k) return;
  e.preventDefault();
  if (!keys[k]) { keys[k] = true; updateTarget(); begin(); }
});
window.addEventListener("keyup", (e) => {
  const k = MAP_KEY[e.code];
  if (!k) return;
  keys[k] = false;
  updateTarget();
});
window.addEventListener("pointerdown", () => { audio.ensure(); }, { once: true });

// ---- touch: a stick for the tilt, one chip to restart. The stick pushes the arrow keys the
// game already reads, so tilting with a thumb and tilting with the keys are the same code path.
addTouchControls({
  pad: { label: "tilt" },
  buttons: [{ label: "R", code: "KeyR", tap: true, side: "right" }],
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // three's fov is vertical, so a tall viewport crops the board sideways: in portrait the fov
  // opens up and the whole board is in frame again
  camera.updateProjectionMatrix();
  fitK = fitPull();   // in portrait the camera pulls back so the board fits sideways
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- helpers
function boardLocal() {
  qInv.set(-qc.x, -qc.y, -qc.z, qc.w);
  qInv.vmult(marbleBody.position, localPos);
  return localPos;
}

function tileAt(p) {
  const col = Math.round(p.x / L.TILE + (L.COLS - 1) / 2);
  const row = Math.round(p.z / L.TILE + (L.ROWS - 1) / 2);
  return { col, row, ch: L.charAt(col, row) };
}

function checkEvents() {
  const p = boardLocal();
  const t = tileAt(p);
  if (p.y < -0.02) {
    // below the board surface: only a hole, the edge opening, or outside the board gets you here
    fell(t.ch === "H" ? "hole" : "off the edge");
    return;
  }
  if (t.col === L.GOAL[0] && t.row === L.GOAL[1]) {
    const c = L.local(t.col, t.row);
    if (Math.hypot(p.x - c.x, p.z - c.z) < 0.09 && state !== "complete") complete();
  }
}

// ---------------------------------------------------------------- loop
const FIXED = 1 / 60;
let last = performance.now();
let hudTick = 0;
const clock = new THREE.Clock();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  updateTarget();
  stepTilt(dt);
  world.step(FIXED, dt, 5);

  marbleMesh.position.copy(marbleBody.position);
  marbleMesh.quaternion.copy(marbleBody.quaternion);

  if (running) timer += dt;
  checkEvents();

  // the marble's own light and its contact shadow on the board
  marbleLight.position.copy(marbleMesh.position).add(new THREE.Vector3(0, 0.05, 0));
  marbleGlow.position.copy(marbleMesh.position).add(new THREE.Vector3(0, 0.01, 0));
  const lp = boardLocal();
  marbleShadow.position.set(lp.x, Math.max(0.004, lp.y + 0.004), lp.z);
  const air = THREE.MathUtils.clamp(1 - (lp.y - L.MARBLE_R) * 12, 0.15, 1);
  marbleShadow.scale.setScalar(air);
  marbleShadow.material.opacity = 0.5 * air;

  goalPad.material.emissiveIntensity = 0.8 + 0.45 * Math.sin(now / 380);
  beacon.material.opacity = 0.2 + 0.12 * Math.sin(now / 380);
  holeRims.material.opacity = 0.55 + 0.3 * Math.sin(now / 700);

  sparks.update(dt); shards.update(dt); rings.update(dt); impact.update(dt);

  // the camera leans with the board and shakes on impact
  shake = Math.max(0, shake - dt * 0.6);
  const e = clock.getElapsedTime();
  camera.position.set(
    CAM.x * fitK + tilt.z * 1.1 + (Math.random() - 0.5) * shake,
    CAM.y * fitK + Math.sin(e * 0.5) * 0.02 + (Math.random() - 0.5) * shake,
    CAM.z * fitK - tilt.x * 0.5,
  );
  camera.lookAt(tilt.z * 0.4, 0, -tilt.x * 0.4);

  hudTick += dt;
  if (hudTick > 0.1) { hudTick = 0; refresh(); }
  auto.tick(dt);
  fps.tick(dt);

  post.update(e);
  post.render();
  requestAnimationFrame(frame);
}

// exposed for the headless tools (tools/smoke.ts, tools/audiotest.ts, tools/linescan.mjs,
// tools/verify.mjs). warp(kind) teleports the marble onto the first tile of that kind — a
// hole, the goal, plain floor — so the tools can prove the fall, the win and the counters
// run, without scripting a full solve through the maze.
function warp(kind) {
  for (let row = 0; row < L.ROWS; row++) {
    for (let col = 0; col < L.COLS; col++) {
      if (L.charAt(col, row) !== kind) continue;
      const c = L.local(col, row);
      const w = qc.vmult(new CANNON.Vec3(c.x, 0.07, c.z));
      marbleBody.position.set(w.x, w.y, w.z);
      marbleBody.velocity.set(0, 0, 0);
      marbleBody.angularVelocity.set(0, 0, 0);
      for (const b of world.bodies) if (b.type === CANNON.Body.STATIC) b.updateAABB();
      if (state === "ready") begin();
      return col + "," + row;
    }
  }
  return null;
}
window.arcade = { post, scene, camera, renderer, audio, body: marbleBody, fell, level: L, warp,
  get state() { return state; } };
window.arcadeAudio = audio;

placeMarble();
refresh();
post.setSize(window.innerWidth, window.innerHeight);
requestAnimationFrame(frame);
