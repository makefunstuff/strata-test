import { createGame } from "./js/game.js";

const canvas = document.createElement("canvas");
canvas.id = "scene";
document.getElementById("stage").appendChild(canvas);

let game;
try {
  game = createGame(canvas);
} catch (err) {
  document.getElementById("message").textContent = "Could not create a WebGL renderer";
  document.getElementById("hint").textContent = String(err && err.message ? err.message : err);
  throw err;
}

let frames = 0;
let lastFpsAt = performance.now();

function loop() {
  game.step();
  game.render();

  frames++;
  const now = performance.now();
  if (now - lastFpsAt >= 1000) {
    const fps = Math.round((frames * 1000) / (now - lastFpsAt));
    frames = 0;
    lastFpsAt = now;
    const el = document.getElementById("fps");
    if (el) el.textContent = `${fps} fps`;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
