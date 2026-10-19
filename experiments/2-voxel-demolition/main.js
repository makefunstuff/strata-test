// Experiment 2 — voxel demolition. A wall, a house, a siege tower and an arch, each built out of
// up to ~1300 boxes with a Rapier rigid body each (asleep until disturbed), drawn as one
// InstancedMesh. Shots are charged by holding the mouse: they shatter blocks into chips, kick up
// dust, wake the structure above the impact and shake the camera.
import * as THREE from "three";
import { createLab, rand, skyDome } from "../shared/lab.js";
import { makePhysics, buildBlocks, makeVoxelField, STRUCTURES } from "./voxel.js";
import { makeDebris, makeDust, makeShake } from "./bits.js";

const lab = createLab({
  title: "2 · Voxel demolition — Rapier rigid bodies",
  camera: { position: [17, 10, 25], target: [0, 4.5, 0], fov: 50, near: 0.2, far: 500, minDistance: 5, maxDistance: 90 },
  bloom: { strength: 0.3, radius: 0.5, threshold: 0.95, scale: 0.4 },
  exposure: 1.0,
  background: null,
  fog: { color: 0xbfa88e, near: 60, far: 260 },
  shadow: true,
  controls: true,
  hints: ["click to shoot, hold to charge", "1 wall 2 house 3 tower 4 arch", "R rebuild", "right-drag / wheel to move the camera"],
  guiTitle: "demolition",
});
const { renderer, scene, camera, gui, pointer } = lab;
const orbit = lab.orbit;
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
orbit.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

// ---- dusk sky, sun, ground ----------------------------------------------------------------
const dome = skyDome(scene, { top: 0x2c4a7a, horizon: 0xe6b98a, ground: 0x4a3a2c, sun: { x: 0.55, y: 0.30, z: 0.78 }, sunSize: 0.02, glow: 0.65 });
const sunDir = new THREE.Vector3(0.55, 0.42, 0.78).normalize();
const key = new THREE.DirectionalLight(0xffd9a8, 3.1);
key.position.copy(sunDir).multiplyScalar(46);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -26; key.shadow.camera.right = 26;
key.shadow.camera.top = 26; key.shadow.camera.bottom = -22;
key.shadow.camera.near = 8; key.shadow.camera.far = 120;
key.shadow.bias = -0.0007;
scene.add(key, new THREE.HemisphereLight(0xbcd6f0, 0x4a3a28, 0.85));

function groundTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#8d7c62"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = rand(0.45, 1.0);
    g.fillStyle = `rgba(${120 * v | 0},${104 * v | 0},${78 * v | 0},${0.05 + Math.random() * 0.14})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 7), rand(1, 4));
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(70,60,44,${0.05 + Math.random() * 0.1})`;
    g.lineWidth = rand(0.5, 2.5);
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, rand(6, 40), 0, 6.3); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(34, 34);
  t.anisotropy = 4;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96, metalness: 0, color: 0xa89878 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- effects ------------------------------------------------------------------------------
const debris = makeDebris(scene, { count: 900, gravity: -22 });
const dust = makeDust(scene, { count: 2200 });
const shakeBase = new THREE.Vector3();
const shake = makeShake(camera, shakeBase);
const flash = new THREE.PointLight(0xffb060, 0, 26, 2);
scene.add(flash);

// ---- physics (WASM, loaded once) -----------------------------------------------------------
lab.setHud([["physics", "loading rapier…"]]);
const { RAPIER, world } = await makePhysics({ gravity: -22 });
const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0);
world.createRigidBody(groundDesc);
world.createCollider(RAPIER.ColliderDesc.cuboid(160, 1, 160).setFriction(1.2).setRestitution(0.02));
const events = new RAPIER.EventQueue(true);

const P = {
  structure: "wall", power: 46, chargeTime: 0.85, shotSize: 0.42, shotMass: 9,
  gravity: 22, friction: 1.0, restitution: 0.02, shatter: 22, debris: 1.0, dust: 1.0,
  shake: 1.0, slowmo: 1.0, shadows: true, autoRecover: true,
};
let field = null;
let shotsFired = 0, chipCount = 0, destroyed = 0, lastImpact = 0, contacts = 0, contactsHit = 0, maxImpact = 0;
const impactLog = [];
const shots = [];
const shotByHandle = new Map();
const shotGeo = new THREE.SphereGeometry(1, 18, 12);
const shotMat = new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.3, metalness: 0.85, emissive: 0xff6a1e, emissiveIntensity: 2.6 });
function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,210,150,0.95)");
  grd.addColorStop(0.35, "rgba(255,140,50,0.42)");
  grd.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = glowTexture();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 });

function build(kind = P.structure) {
  for (const s of shots) { world.removeRigidBody(s.body); scene.remove(s.mesh); scene.remove(s.glow); }
  shots.length = 0; shotByHandle.clear();
  if (field) field.dispose();
  const blocks = buildBlocks(kind);
  field = makeVoxelField(scene, { RAPIER, world, blocks, friction: P.friction, restitution: P.restitution, density: 1.5 });
  destroyed = 0;
  lab.setHud([["blocks", field.count], ["structure", kind]]);
  return field.count;
}
build(P.structure);

// ---- shooting ---------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const aimDir = new THREE.Vector3();
let charge = 0, aiming = false, lastAimAt = 0;

function fire(power = 1) {
  ray.setFromCamera(pointer.ndc, camera);
  aimDir.copy(ray.ray.direction).normalize();
  const origin = camera.position.clone().addScaledVector(aimDir, 1.6);
  const speed = P.power * (0.4 + 0.6 * Math.min(1, Math.max(0.08, power)));
  const r = P.shotSize;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true).setLinearDamping(0.01));
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(r).setDensity(P.shotMass / ((4 / 3) * Math.PI * r * r * r))
      .setFriction(0.8).setRestitution(0.28).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  body.setLinvel({ x: aimDir.x * speed, y: aimDir.y * speed, z: aimDir.z * speed }, true);
  const mesh = new THREE.Mesh(shotGeo, shotMat);
  mesh.scale.setScalar(r);
  mesh.castShadow = true;
  scene.add(mesh);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(r * 5.4);
  scene.add(glow);
  const shot = { body, collider, mesh, glow, age: 0, lastSpeed: speed, power };
  shots.push(shot);
  shotByHandle.set(collider.handle, shot);
  shotsFired++;
  shake.add(0.16);
  dust.puff(origin, 6, { color: 0xf0e0c0, speed: 3.2, size: 0.5, rise: 0.4, life: 0.5, spread: 0.2 });
  if (shots.length > 16) retire(shots[0]);
  return shotsFired;
}
function retire(s) {
  const i = shots.indexOf(s);
  if (i >= 0) shots.splice(i, 1);
  shotByHandle.delete(s.collider.handle);
  world.removeRigidBody(s.body);
  scene.remove(s.mesh);
  scene.remove(s.glow);
}

function onContact(h1, h2) {
  const s = shotByHandle.get(h1) ?? shotByHandle.get(h2);
  if (!s) return;                                    // block-on-block contacts are noise
  contacts++;
  impactLog.push(Math.round(s.lastSpeed));
  if (s.lastSpeed > maxImpact) maxImpact = s.lastSpeed;
  const other = field.byHandle.get(h1 === s.collider.handle ? h2 : h1);
  if (other) contactsHit++;
  const impact = s.lastSpeed;
  const p = s.mesh.position;
  const e = Math.min(1.3, impact / 42);
  lastImpact = impact;
  shake.add(e * P.shake);
  flash.position.copy(p);
  flash.intensity = 26 * e;
  dust.puff(p, Math.round((9 + impact * 0.4) * P.dust), { color: 0xdcc9a8, speed: 2.8, size: 0.9, rise: 1.5, life: 1.5, spread: 0.35 });
  const color = other ? `#${other.color.getHexString()}` : "#b6543a";
  const n = Math.round(Math.min(18, 3 + impact * 0.24) * P.debris);
  debris.spawn(p, n, { color, speed: Math.min(10, impact * 0.3), size: 0.17, spread: 0.32 });
  chipCount += n;
  if (other && !other.dead && impact > P.shatter) {
    destroyed++;
    field.destroy(other);
    debris.spawn(p, Math.round(12 * P.debris), { color, speed: 6.5, size: 0.26, spread: 0.5 });
    dust.puff(p, Math.round(14 * P.dust), { color: 0xe0d3bb, speed: 3.4, size: 1.1, rise: 1.9, life: 1.8, spread: 0.5 });
  }
  field.wakeNear(p, 2.8);
}

const reticle = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 28),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
scene.add(reticle);
function aimPoint() {
  ray.setFromCamera(pointer.ndc, camera);
  const hit = field ? ray.intersectObject(field.mesh, false) : [];
  if (hit.length) return { point: hit[0].point, normal: hit[0].face ? hit[0].face.normal : null };
  return { point: ray.ray.origin.clone().addScaledVector(ray.ray.direction, 45), normal: null };
}

renderer.domElement.addEventListener("pointerdown", () => { aiming = true; charge = 0; });
renderer.domElement.addEventListener("pointerup", () => {
  if (aiming) fire(charge);
  aiming = false; charge = 0;
});
window.addEventListener("keydown", (e) => {
  const kinds = Object.keys(STRUCTURES);
  if (e.code.startsWith("Digit")) {
    const k = kinds[+e.code.slice(5) - 1];
    if (k) { P.structure = k; build(k); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  }
  if (e.code === "KeyR") build(P.structure);
  if (e.code === "Space") { e.preventDefault(); fire(1); }
});

// ---- control panel -----------------------------------------------------------------------------
const fShot = gui.addFolder("shot");
fShot.add(P, "power", 8, 120, 1).name("muzzle speed");
fShot.add(P, "chargeTime", 0.2, 2.5, 0.05).name("charge time");
fShot.add(P, "shotSize", 0.12, 1.4, 0.02).name("shell size");
fShot.add(P, "shotMass", 1, 40, 0.5).name("shell mass");
fShot.add(P, "shatter", 4, 80, 1).name("shatter at (m/s)");
fShot.add({ fire: () => fire(1) }, "fire").name("fire a shell");
const fWorld = gui.addFolder("world");
fWorld.add(P, "structure", Object.keys(STRUCTURES)).name("structure").onChange(build);
fWorld.add({ rebuild: () => build(P.structure) }, "rebuild").name("rebuild structure");
fWorld.add(P, "gravity", 1, 45, 0.5).name("gravity").onChange((v) => { world.gravity.y = -v; });
fWorld.add(P, "friction", 0.05, 3, 0.05).name("block friction").onChange(() => build(P.structure));
fWorld.add(P, "restitution", 0, 0.7, 0.01).name("bounciness").onChange(() => build(P.structure));
fWorld.add(P, "slowmo", 0.15, 1, 0.05).name("time scale");
const fFx = gui.addFolder("effects");
fFx.add(P, "debris", 0, 2.5, 0.05).name("chip spray");
fFx.add(P, "dust", 0, 2.5, 0.05).name("dust");
fFx.add(P, "shake", 0, 2, 0.05).name("camera shake");
fFx.add(P, "shadows").name("shadows").onChange((v) => { renderer.shadowMap.enabled = v; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); });

function applyPreset(name) {
  const cfg = { low: { pr: 0.7, shadow: false, d: 300, dust: 900 }, medium: { pr: 1, shadow: true, d: 700, dust: 1600 }, high: { pr: 1, shadow: true, d: 1200, dust: 2600 } }[name] ?? {};
  if (cfg.pr) lab.setPixelRatio(cfg.pr);
  P.shadows = !!cfg.shadow;
  renderer.shadowMap.enabled = P.shadows;
  key.castShadow = P.shadows;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
lab.onQuality(applyPreset);
applyPreset(lab.q.quality);

// ---- loop -----------------------------------------------------------------------------------------
const tmpM = new THREE.Matrix4();
let t = 0, hudT = 0, moved = 0, awake = 0;
world.gravity.y = -P.gravity;

function frame() {
  const dt = lab.step();
  t += dt;
  if (aiming) charge = Math.min(1, charge + dt / P.chargeTime);

  for (const s of shots) {
    const v = s.body.linvel();
    s.lastSpeed = Math.hypot(v.x, v.y, v.z);
  }
  world.timestep = (1 / 60) * P.slowmo;
  world.step(events);
  events.drainCollisionEvents((h1, h2, started) => { if (started) onContact(h1, h2); });

  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    const tr = s.body.translation();
    s.mesh.position.set(tr.x, tr.y, tr.z);
    s.glow.position.copy(s.mesh.position);
    s.age += dt;
    if (s.lastSpeed > 6) dust.puff(s.mesh.position, 1, { color: 0xcfc9c0, speed: 0.4, size: 0.42, rise: 0.15, life: 0.75, spread: 0.1 });
    if (s.age > 9 || tr.y < -6) retire(s);
  }

  [moved, awake] = field.sync();
  debris.update(dt, { floor: 0 });
  dust.update(dt, { x: 0.3, z: 0.15 });
  flash.intensity *= Math.exp(-dt * 9);

  const aim = aimPoint();
  reticle.position.copy(aim.point);
  reticle.lookAt(camera.position);
  reticle.scale.setScalar(1 + (aiming ? charge * 0.9 : 0) + (aim.normal ? 0 : 0.6));

  orbit.update();
  shakeBase.copy(camera.position);
  shake.update(dt, t);
  lab.render();
  lab.tickFps(dt);

  hudT += dt;
  if (hudT > 0.4) {
    hudT = 0;
    lab.setHud([["blocks", field.items.filter((i) => !i.dead).length], ["displaced", moved], ["awake bodies", awake],
      ["shells", shots.length], ["fired", shotsFired], ["shattered", destroyed], ["chips", debris.alive],
      ["dust", dust.alive], ["power", aiming ? `${Math.round(charge * 100)}%` : "ready"],
      ["last hit", `${Math.round(lastImpact)} m/s`]]);
  }
}
lab.renderer.setAnimationLoop(frame);

lab.expose({
  state: () => ({
    fps: lab.fps.value, structure: P.structure, blocks: field.items.filter((i) => !i.dead).length,
    built: field.count, displaced: moved, awake, shells: shots.length, fired: shotsFired,
    shattered: destroyed, chips: debris.alive, dust: dust.alive, lastImpact: Math.round(lastImpact), contacts, contactsHit, maxImpact: Math.round(maxImpact), impactLog: impactLog.slice(-14),
    gravity: world.gravity.y, power: P.power, timeScale: P.slowmo, shadows: P.shadows,
  }),
  api: { fire, build, params: P, world, RAPIER, field: () => field, shots, debris, dust, shake,
    setStructure: (k) => { P.structure = k; return build(k); },
    aimAt: (fx, fy) => pointer.ndc.set(fx * 2 - 1, -(fy * 2 - 1)),
    // headless checks: fire at a world point, force a shatter, read the numbers the HUD shows
    fireAt: (point) => {
      const pos = new THREE.Vector3(0, 1.6, 12);
      const target = new THREE.Vector3(point.x, point.y, point.z);
      shots.fire(pos, target.sub(pos).normalize());
    },
    shatterAt: (point, r) => impacts.shatter(new THREE.Vector3(point.x, point.y, point.z), r || 2),
    stats: () => ({
      blocks: field.count, built: field.count, displaced: field.displaced(), awake: field.awake(),
      shells: shots.live.length, fired: shots.fired, shattered: impacts.shattered,
      chips: debris.count, dust: dust.count, lastImpact: +lastImpact.toFixed(0),
      contacts: contacts.length, contactsHit: contactsHits, maxImpact: +maxImpact.toFixed(0),
    }) },
});
