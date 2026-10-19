import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import * as L from "./level.js";

// ---------------------------------------------------------------- HUD
const el = (id) => document.getElementById(id);
const hud = {
  time: el("time"), state: el("state"), marble: el("marble"),
  tilt: el("tilt"), meta: el("meta"), panel: el("panel"), score: el("score"),
};
const set = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 6, 12);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 30);
camera.position.set(0, 2.35, 2.7);
camera.lookAt(0, 0, 0);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(1.8, 3.4, 1.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
Object.assign(keyLight.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 9 });
keyLight.shadow.bias = -0.0008;
scene.add(keyLight, keyLight.target);
scene.add(new THREE.HemisphereLight(0x7f93b5, 0x1b2430, 0.8));

// ---------------------------------------------------------------- level meshes
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const level = L.parse();

// board: one merged mesh per floor run (holes = missing tiles = real gaps)
const boardGeoms = [];
for (const run of level.floor) {
  const c = L.local((run.col0 + run.col1) / 2, run.row);
  const g = new THREE.BoxGeometry((run.col1 - run.col0 + 1) * L.TILE, L.BOARD_T, L.TILE);
  g.translate(c.x, -L.BOARD_T / 2, c.z);
  boardGeoms.push(g);
}
const boardMesh = new THREE.Mesh(
  mergeGeometries(boardGeoms),
  new THREE.MeshStandardMaterial({ color: 0xc2a075, roughness: 0.75, metalness: 0.05 })
);
boardMesh.castShadow = true;
boardMesh.receiveShadow = true;
boardGroup.add(boardMesh);

// walls
const wallGeoms = [];
for (const w of level.walls) {
  const c = L.local(w.col, w.row);
  const g = new THREE.BoxGeometry(L.TILE, L.WALL_H, L.TILE);
  g.translate(c.x, L.WALL_H / 2, c.z);
  wallGeoms.push(g);
}
const wallMesh = new THREE.Mesh(
  mergeGeometries(wallGeoms),
  new THREE.MeshStandardMaterial({ color: 0x394654, roughness: 0.5, metalness: 0.2 })
);
wallMesh.castShadow = true;
wallMesh.receiveShadow = true;
boardGroup.add(wallMesh);

// pads
function pad(col, row, color, emissive) {
  const c = L.local(col, row);
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.075, 40),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.6, roughness: 0.4 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(c.x, 0.001, c.z);
  m.receiveShadow = true;
  boardGroup.add(m);
  return m;
}
pad(L.START[0], L.START[1], 0x2f6f7c, 0x0d3a42);
const goalPad = pad(L.GOAL[0], L.GOAL[1], 0x2f8f5f, 0x11402a);

// table under the board (catches the shadows)
const table = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 7),
  new THREE.MeshStandardMaterial({ color: 0x151b24, roughness: 0.9 })
);
table.rotation.x = -Math.PI / 2;
table.position.y = -0.4;
table.receiveShadow = true;
scene.add(table);

// marble
const marbleMesh = new THREE.Mesh(
  new THREE.SphereGeometry(L.MARBLE_R, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xd6dde8, roughness: 0.25, metalness: 0.85 })
);
marbleMesh.castShadow = true;
scene.add(marbleMesh);

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

let keyCount = 0;

function updateTarget() {
  // Camera looks from +z, so "up" on screen is the far edge (+z). A positive tilt
  // about the x axis lifts the far edge and the marble rolls away from the camera;
  // a positive tilt about the z axis lifts the right edge and the marble rolls left.
  target.x = ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * L.MAX_TILT;
  target.z = ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * L.MAX_TILT;
}

function stepTilt(dt) {
  // critically damped spring: eases back to flat when the keys are released
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
let timer = 0, falls = 0, lastEvent = "start", best = null;

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

function restart() {
  state = "ready"; running = false; timer = 0; falls = 0; lastEvent = "start";
  tilt.x = tilt.z = tilt.vx = tilt.vz = 0;
  keys.up = keys.down = keys.left = keys.right = false;
  hud.panel.classList.remove("show");
  placeMarble();
  refresh();
}

function fell(reason) {
  falls++;
  lastEvent = reason;
  placeMarble();
  refresh();
}

function complete() {
  state = "complete";
  running = false;
  if (best === null || timer < best) best = timer;
  hud.score.textContent = `Level complete in ${timer.toFixed(2)} s`;
  hud.panel.classList.add("show");
  refresh();
}

const deg = (r) => (r * 180 / Math.PI).toFixed(1);
function refresh() {
  const p = boardLocal();
  const t = tileAt(p);
  set(hud.time, `Time ${timer.toFixed(1)} s`);
  set(hud.state, state === "complete"
    ? `Level complete in ${timer.toFixed(2)} s (last: ${lastEvent})`
    : `${state === "ready" ? "Ready" : "Rolling"} — last: ${lastEvent}`);
  set(hud.marble, `Marble ${t.col},${t.row} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  set(hud.tilt, `Tilt ${deg(tilt.x)}° / ${deg(tilt.z)}°`);
  set(hud.meta, `Falls ${falls} · Best ${best === null ? "—" : best.toFixed(2) + " s"} · Keys ${keyCount}`);
}

// ---------------------------------------------------------------- input
const MAP_KEY = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
};
window.addEventListener("keydown", (e) => {
  keyCount++;
  if (e.code === "KeyR") { restart(); return; }
  const k = MAP_KEY[e.code];
  if (!k) return;
  e.preventDefault();
  if (!keys[k]) { keys[k] = true; updateTarget(); if (state === "ready") { state = "rolling"; running = true; } }
});
window.addEventListener("keyup", (e) => {
  const k = MAP_KEY[e.code];
  if (!k) return;
  keys[k] = false; updateTarget();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
    // the marble is below the board surface: it can only be there over a hole,
    // through the opening in the edge wall, or outside the board
    if (t.ch === "H") fell("fell through a hole");
    else fell("fell off the board");
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

  hudTick += dt;
  if (hudTick > 0.1) { hudTick = 0; refresh(); }

  goalPad.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(now / 400);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

placeMarble();
refresh();
requestAnimationFrame(frame);
