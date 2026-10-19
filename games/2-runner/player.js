import * as THREE from "three";

export const LANE_X = [-2.2, 0, 2.2];
export const PLAYER_Z = 0;

const SLIDE_TIME = 0.18;   // quick lane slide
const GRAVITY = 26;
const JUMP_V = 9.2;        // apex ~1.6 m, so 1.9 m crates cannot be jumped

export function createPlayer(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6cb6ff });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2f7bd0 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.45), bodyMat);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), darkMat);
  head.position.y = 1.66;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), darkMat);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), darkMat);
  legL.position.set(-0.18, 0.3, 0);
  legR.position.set(0.18, 0.3, 0);
  group.add(torso, head, legL, legR);
  group.position.z = PLAYER_Z;
  scene.add(group);

  const state = {
    lane: 1,
    x: LANE_X[1],
    y: 0,
    vy: 0,
    grounded: true,
    from: LANE_X[1],
    to: LANE_X[1],
    t: 1,
    phase: 0,
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
  }

  // Returns true when the lane actually changed.
  function setLane(lane) {
    lane = Math.max(0, Math.min(2, lane));
    if (lane === state.lane) return false;
    state.lane = lane;
    state.from = state.x;
    state.to = LANE_X[lane];
    state.t = 0;
    return true;
  }

  // Returns true when a jump actually started.
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

    group.position.set(state.x, state.y, PLAYER_Z);
    group.rotation.z = (state.to - state.x) * 0.18;
    torso.position.y = 1.05 + (state.grounded ? Math.abs(Math.sin(state.phase)) * 0.05 : 0);
  }

  return { group, state, reset, setLane, jump, update };
}
