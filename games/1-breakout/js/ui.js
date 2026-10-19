import { POINTS_PER_BRICK } from "./config.js";

const els = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  bricks: document.getElementById("bricks"),
  message: document.getElementById("message"),
  hint: document.getElementById("hint"),
  fps: document.getElementById("fps"),
};

export const ui = {
  score: 0,
  lives: 3,
  bricksLeft: 0,
  message: "",
  hint: "",
  fps: "",

  set(key, value) {
    if (els[key]) els[key].textContent = value;
  },

  sync() {
    this.set("score", this.score);
    this.set("lives", "◑".repeat(this.lives) || "-");
    this.set("bricks", this.bricksLeft);
    this.set("message", this.message);
    this.set("hint", this.hint);
  },

  addScore(points) {
    this.score += points;
    this.set("score", this.score);
  },

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.set("lives", "◑".repeat(this.lives) || "-");
  },
};
