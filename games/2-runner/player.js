import * as THREE from "three";
import { glowTexture, shadowTexture } from "../shared/textures.js";

export const LANE_X = [-2.2, 0, 2.2];
export const PLAYER_Z = 0;

const SLIDE_TIME = 0.18;   // quick lane slide
const GRAVITY = 26;
const JUMP_V = 9.2;        // apex ~1.6 m, so 1.9 m crates cannot be jumped

// A chrome runner with a lit visor: metal that catches the track lights, a core that
// glows, a contact shadow that shrinks as it jumps, and a trail that stretches with speed.
export function createPlayer(scene) {
  const group = new THREE.Group();

  const shell = new THREE.MeshStandardMaterial({
    color: 0x8fd4ff, roughness: 0.24, metalness: 0.85, envMapIntensity: 1.4,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x16202e, roughness: 0.45, metalness: 0.6, envMapIntensity: 1.0,
  });
  const neon = new THREE.MeshBasicMaterial({ color: 0x59f8ff, toneMapped: false });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.45), shell);
  torso.position.y = 1.05;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), neon);
  core.position.set(0, 1.16, -0.24);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), dark);
  head.position.y = 1.66;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.06), neon);
  visor.position.set(0, 1.7, -0.24);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.14), shell);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.14), shell);
  armL.position.set(-0.42, 1.06, 0);
  armR.position.set(0.42, 1.06, 0);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), dark);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), dark);
  legL.position.set(-0.18, 0.3, 0);
  legR.position.set(0.18, 0.3, 0);
  group.add(torso, core, head, visor, armL, armR, legL, legR);
  group.position.z = PLAYER_Z;
  scene.add(group);

  // contact shadow, so the runner stays attached to the road
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.75 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.02, PLAYER_Z);
  scene.add(shadow);

  // the runner carries a light: the road and pylons respond as it moves
  const lamp = new THREE.PointLight(0x8fe8ff, 4, 7, 2);
  lamp.position.set(0, 1.2, 0);
  group.add(lamp);

  // glow trail: quads recycled behind the runner, longer the faster it goes
  const glow = glowTexture();
  const DOTS = 12;
  const dots = [];
  for (let i = 0; i < DOTS; i++) {
    const d = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0x7fe3ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    d.userData.base = 0.9 * (1 - i / DOTS);
    d.scale.setScalar(0.1);
    scene.add(d);
    dots.push(d);
  }
  const trail = [];

  const state = {
    lane: 1, x: LANE_X[1], y: 0, vy: 0, grounded: true,
    from: LANE_X[1], to: LANE_X[1], t: 1, phase: 0,
  };

  function reset() {
    state.lane = 1;
    state.x = LANE_X[1];
    state.from = state.to = LANE_X[1];
    state.t = 1;
    state.y = 0;
    state.vy = 0;
    state.grounded = true;
    state.phase = 0;
    group.position.set(state.x, 0, PLAYER_Z);
    group.rotation.set(0, 0, 0);
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);
    armL.rotation.set(0, 0, 0);
    armR.rotation.set(0, 0, 0);
    for (const d of dots) d.material.opacity = 0;
    trail.length = 0;
  }

  function setLane(lane) {
    lane = Math.max(0, Math.min(2, lane));
    if (lane === state.lane) return false;
    state.lane = lane;
    state.from = state.x;
    state.to = LANE_X[lane];
    state.t = 0;
    return true;
  }

  function jump() {
    if (!state.grounded) return false;
    state.vy = JUMP_V;
    state.grounded = false;
    return true;
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function update(dt, speed, running) {
    if (state.t < 1) {
      state.t = Math.min(1, state.t + dt / SLIDE_TIME);
      state.x = state.from + (state.to - state.from) * ease(state.t);
    }
    if (running) {
      if (!state.grounded) {
        state.vy -= GRAVITY * dt;
        state.y += state.vy * dt;
        if (state.y <= 0) {
          state.y = 0;
          state.vy = 0;
          state.grounded = true;
        }
      } else {
        state.phase += dt * (4 + speed * 0.5);
      }
    }

    const swing = state.grounded ? Math.sin(state.phase) * 0.55 : -0.4;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;

    group.position.set(state.x, state.y, PLAYER_Z);
    group.rotation.z = (state.to - state.x) * 0.18;
    group.rotation.x = state.grounded ? 0 : THREE.MathUtils.clamp(-state.vy * 0.02, -0.25, 0.25);
    torso.position.y = 1.05 + (state.grounded ? Math.abs(Math.sin(state.phase)) * 0.05 : 0);
    core.position.y = torso.position.y + 0.11;

    const lift = THREE.MathUtils.clamp(1 - state.y * 0.35, 0.25, 1);
    shadow.position.x = state.x;
    shadow.scale.setScalar(lift);
    shadow.material.opacity = 0.75 * lift;

    // trail follows the runner and stretches behind it with speed
    if (trail.length === 0) for (let i = 0; i < DOTS; i++) trail.push(new THREE.Vector3(state.x, 1, PLAYER_Z));
    for (let i = trail.length - 1; i > 0; i--) trail[i].copy(trail[i - 1]);
    trail[0].set(state.x, state.y + 1.05, PLAYER_Z);
    const stretch = THREE.MathUtils.clamp(speed / 30, 0, 1);
    for (let i = 0; i < DOTS; i++) {
      const d = dots[i];
      const p = trail[i];
      d.position.set(p.x, p.y, p.z - i * (0.18 + stretch * 0.5));
      const s = d.userData.base * (0.5 + stretch * 1.4);
      d.scale.set(s, s, 1);
      d.material.opacity = running ? 0.1 + stretch * 0.35 : 0;
    }
  }

  return { group, state, reset, setLane, jump, update, shadow, lamp, neon, shell, dark };
}
