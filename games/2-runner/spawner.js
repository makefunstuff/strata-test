import * as THREE from "three";
import { LANE_X, PLAYER_Z } from "./player.js";
import { stripesTexture } from "../shared/textures.js";

const SPAWN_Z = -70;
const DESPAWN_Z = 14;
const POOL = 24;

const CRATE = { height: 1.9, depth: 1.3, jumpable: false };   // must be dodged
const HURDLE = { height: 0.65, depth: 1.0, jumpable: true };  // must be jumped

// Obstacles are hazard-striped blocks with a glowing cap, so the two kinds are told apart
// at distance: red and tall means dodge, amber and low means jump.
export function createSpawner(scene, rng) {
  const crateBody = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: stripesTexture({ a: "#ff5566", b: "#2a0d14" }),
    roughness: 0.55, metalness: 0.35, envMapIntensity: 0.9,
  });
  const hurdleBody = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: stripesTexture({ a: "#ffd166", b: "#33230a", bands: 5 }),
    roughness: 0.5, metalness: 0.35, envMapIntensity: 0.9,
  });
  const crateCap = new THREE.MeshBasicMaterial({ color: 0xff6b6b, toneMapped: false });
  const hurdleCap = new THREE.MeshBasicMaterial({ color: 0xffd166, toneMapped: false });

  const crateGeo = new THREE.BoxGeometry(1.7, CRATE.height, CRATE.depth);
  const hurdleGeo = new THREE.BoxGeometry(1.8, HURDLE.height, HURDLE.depth);
  const capGeo = new THREE.BoxGeometry(1.85, 0.1, 1.45);

  const list = [];
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(crateGeo, crateBody);
    const cap = new THREE.Mesh(capGeo, crateCap);
    g.add(body, cap);
    g.visible = false;
    scene.add(g);
    list.push({ mesh: g, body, cap, active: false, lane: 0, height: 0, depth: 0, jumpable: false, passed: false });
  }
  let nextSpawnAt = 18; // metres travelled before the first obstacle
  let passedCount = 0;

  function reset() {
    for (const o of list) {
      o.active = false;
      o.mesh.visible = false;
    }
    nextSpawnAt = 18;
    passedCount = 0;
  }

  function take() {
    for (const o of list) if (!o.active) return o;
    return null;
  }

  function place(o, lane, kind) {
    o.active = true;
    o.passed = false;
    o.lane = lane;
    o.height = kind.height;
    o.depth = kind.depth;
    o.jumpable = kind.jumpable;
    const isHurdle = kind === HURDLE;
    o.body.geometry = isHurdle ? hurdleGeo : crateGeo;
    o.body.material = isHurdle ? hurdleBody : crateBody;
    o.cap.material = isHurdle ? hurdleCap : crateCap;
    o.cap.position.y = kind.height / 2 + 0.06;
    o.cap.scale.set(isHurdle ? 1.05 : 0.95, 1, isHurdle ? 0.9 : 1.05);
    o.mesh.position.set(LANE_X[lane], kind.height / 2, SPAWN_Z);
    o.mesh.visible = true;
  }

  function spawnPattern(speed) {
    const lanes = [0, 1, 2];
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const difficulty = Math.min(1, Math.max(0, (speed - 9) / (30 - 9)));
    let count = 1;
    if (difficulty > 0.3 && rng.next() < 0.45) count = 2;
    if (difficulty > 0.65 && rng.next() < 0.25) count = 3;

    for (let i = 0; i < count; i++) {
      const o = take();
      if (!o) break;
      // If all three lanes are occupied they must all be jumpable hurdles,
      // so a pattern is never impossible to pass.
      const kind = count >= 3 ? HURDLE : (rng.next() < 0.35 + 0.3 * difficulty ? HURDLE : CRATE);
      place(o, lanes[i], kind);
    }
  }

  // Distance the world moved this frame.
  function update(dt, speed, running) {
    const move = running ? speed * dt : 0;
    for (const o of list) {
      if (!o.active) continue;
      o.mesh.position.z += move;
      if (o.mesh.position.z > DESPAWN_Z) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      if (!o.passed && o.mesh.position.z > PLAYER_Z + 1) {
        o.passed = true;
        passedCount++;
      }
    }
    return move;
  }

  function maybeSpawn(distance, speed, running) {
    if (running && distance >= nextSpawnAt) {
      spawnPattern(speed);
      // Time-based gap: the player always gets room to react.
      nextSpawnAt = distance + Math.max(12, speed * (1.3 - 0.35 * Math.min(1, speed / 30)));
    }
  }

  return { list, passed: () => passedCount, maybeSpawn, update, reset };
}
