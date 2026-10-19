// Keyboard input: paddle movement + Space to start/restart.
const movement = new Set(["ArrowLeft", "ArrowRight", "KeyA", "KeyD"]);

export function createInput(onAction) {
  const keys = new Set();
  let action = null;

  window.addEventListener("keydown", (e) => {
    if (movement.has(e.code)) {
      keys.add(e.code);
      e.preventDefault();
      return;
    }
    if (e.code === "Space") {
      if (!e.repeat && !action) action = "press";
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  return {
    axis() {
      return ((keys.has("ArrowRight") || keys.has("KeyD")) ? 1 : 0) -
             ((keys.has("ArrowLeft") || keys.has("KeyA")) ? 1 : 0);
    },
    consumeAction() {
      if (action !== "press") return false;
      action = null;
      if (onAction) onAction();
      return true;
    },
  };
}
