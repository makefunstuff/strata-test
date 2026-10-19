// Shared fps readout for the HUD.
export function createFps(el, { every = 0.5, label = "fps" } = {}) {
  let frames = 0, acc = 0, value = "—";
  return {
    tick(dt) {
      frames++;
      acc += dt;
      if (acc >= every) {
        value = Math.round(frames / acc);
        if (el) el.textContent = `${value} ${label}`;
        frames = 0;
        acc = 0;
      }
    },
    get value() { return value; },
  };
}
