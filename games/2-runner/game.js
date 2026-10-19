import { LANE_X, PLAYER_Z } from "./player.js";
import { makeRng } from "./rng.js";

const BASE_SPEED = 9;
const MAX_SPEED = 30;
const ACCEL = 0.35;          // speed rises with time
const BEST_KEY = "runner.best";

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* storage may be blocked */ }
}

export function createGame({ hud, player, spawner, track, camera, canvas, rng }) {
  let runNumber = 0;
  let best = loadBest();
  const state = {
    running: false,
    crashed: false,
    time: 0,
    distance: 0,
    speed: BASE_SPEED,
    shake: 0,
    last: "start",
  };

  function start() {
    runNumber++;
    rng.seed(1 + runNumber * 7919); // run 1 is reproducible
    spawner.reset();
    player.reset();
    state.running = true;
    state.crashed = false;
    state.time = 0;
    state.distance = 0;
    state.speed = BASE_SPEED;
    state.shake = 0;
    state.last = "start";
    hud.hideScreen();
  }

  function crash(obstacle) {
    state.running = false;
    state.crashed = true;
    state.shake = 0.45;
    state.last = obstacle.jumpable ? "hit hurdle" : "hit crate";
    const score = Math.floor(state.distance);
    if (score > best) {
      best = score;
      saveBest(best);
    }
    hud.showScreen("game over", `score ${score} · best ${best} · passed ${spawner.passed()} — press Space or R to run again`);
  }

  function changeLane(delta) {
    if (!state.running) return;
    if (player.setLane(player.state.lane + delta)) {
      state.last = delta < 0 ? "slide left" : "slide right";
    }
  }

  function jump() {
    if (!state.running) { start(); return; }
    if (player.jump()) state.last = "jump";
  }

  function checkHit() {
    for (const o of spawner.list) {
      if (!o.active) continue;
      if (Math.abs(o.mesh.position.z - PLAYER_Z) > o.depth / 2 + 0.35) continue;
      if (Math.abs(player.state.x - LANE_X[o.lane]) > 0.95) continue;
      if (player.state.y < o.height - 0.05) return o;
    }
    return null;
  }

  // Input
  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === " " || k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp") e.preventDefault();
    if (e.repeat) return;
    if (k === "r" || k === "R") { start(); state.last = "restart"; return; }
    if (k === "ArrowLeft" || k === "a" || k === "A") changeLane(-1);
    else if (k === "ArrowRight" || k === "d" || k === "D") changeLane(1);
    else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") jump();
  });
  canvas.addEventListener("pointerdown", () => {
    if (state.crashed) start();
    else jump();
  });

  function renderHud() {
    hud.set("score", String(Math.floor(state.distance)));
    hud.set("speed", state.speed.toFixed(1));
    hud.set("best", String(best));
    hud.set("lane", String(player.state.lane + 1));
    hud.set("passed", String(spawner.passed()));
    hud.set("state", state.crashed ? "crashed" : player.state.grounded ? (player.state.t < 1 ? "sliding" : "running") : "airborne");
    hud.set("last", state.last);
  }

  function update(dt) {
    if (state.running) {
      state.time += dt;
      state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.time * ACCEL);
      state.distance += state.speed * dt;
    }

    const move = spawner.update(dt, state.speed, state.running);
    spawner.maybeSpawn(state.distance, state.speed, state.running);
    track.update(move);
    player.update(dt, state.speed, state.running);

    if (state.running) {
      const hit = checkHit();
      if (hit) crash(hit);
    }

    camera.position.x = player.state.x * 0.45;
    camera.position.y = 3.1 + player.state.y * 0.3;
    camera.position.z = 9;
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - dt);
      const k = state.shake * 0.5;
      camera.position.x += (rng.next() - 0.5) * k;
      camera.position.y += (rng.next() - 0.5) * k;
    }
    camera.lookAt(player.state.x * 0.5, 1.1, -12);

    renderHud();
  }

  start();

  return { update, state };
}
