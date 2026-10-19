// On-screen touch controls for the five games. They are built once per game and only shown
// on a touch device (`.touch` on <body>, see shared/touch.css), so a keyboard player sees
// nothing at all.
//
//   import { addTouchControls } from "../shared/touch.js";
//   addTouchControls({
//     pad: { label: "TILT" },                                    // a virtual stick
//     buttons: [{ label: "◀", code: "ArrowLeft" },
//               { label: "JUMP", code: "Space", tap: true }],
//   });
//
// The controls synthesise keyboard events, so every game keeps its one input path — the
// arrows, WASD, Space, N and R the keyboard already uses. That is deliberate: a second,
// parallel control model is how a game ends up with two of everything that can disagree.
import { isTouch } from "./mobile.js";

// KeyboardEvent needs both `code` (games that switch on e.code) and `key` (games that
// switch on e.key). One table so both are always right.
const KEY_OF = {
  ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown",
  Space: " ", ShiftLeft: "Shift", ShiftRight: "Shift",
  KeyA: "a", KeyD: "d", KeyW: "w", KeyS: "s", KeyN: "n", KeyR: "r", KeyC: "c", KeyM: "m",
};

let down = new Set();
function synth(type, code) {
  const ev = new KeyboardEvent(type, {
    code, key: KEY_OF[code] ?? code, bubbles: true, cancelable: true,
  });
  window.dispatchEvent(ev);
}

/** Press (and remember) a key, or release it. Idempotent on both edges. */
export function touchKey(code, isDown) {
  if (isDown) {
    if (down.has(code)) return;
    down.add(code);
    synth("keydown", code);
  } else {
    if (!down.has(code)) return;
    down.delete(code);
    synth("keyup", code);
  }
}

/** A one-frame tap: down and straight back up. */
export function touchTap(code) {
  touchKey(code, true);
  touchKey(code, false);
}

const ARROWS = { x: ["ArrowLeft", "ArrowRight"], y: ["ArrowUp", "ArrowDown"] };

/**
 * The control layer for one game. Options:
 *   pad:     { label, side ("left"|"right"), dead (0..1), axes ("xy"|"x"|"y"), invertY }
 *            — a virtual stick; pushes synthesise the arrow keys with a dead zone.
 *   buttons: [{ label, code, tap, side, accent }] — tap/hold chips.
 *   drag:    { onMove(fx, fy), onEnd(), onTap(fx, fy) } — a drag-anywhere surface (the
 *            breakout paddle): position, not keys, is what matters there.
 */
export function addTouchControls({ pad, buttons = [], drag } = {}) {
  const layer = document.createElement("div");
  layer.className = "touch-layer";
  document.body.appendChild(layer);
  document.body.classList.add("touch");
  const active = isTouch();
  if (!active) layer.classList.add("no-touch");

  const clean = [];
  function listen(el, type, fn, opts) { el.addEventListener(type, fn, opts); clean.push([el, type, fn]); }

  // block double-tap zoom and panning on the controls themselves
  listen(layer, "touchstart", (e) => e.preventDefault(), { passive: false });
  listen(layer, "touchmove", (e) => e.preventDefault(), { passive: false });

  // ---- virtual stick
  if (pad) {
    const el = document.createElement("div");
    el.className = `touch-pad side-${pad.side ?? "left"}`;
    el.innerHTML = `<span class="touch-pad-ring"></span><span class="touch-pad-knob"></span>` +
      (pad.label ? `<span class="touch-pad-label">${pad.label}</span>` : "");
    layer.appendChild(el);
    const knob = el.querySelector(".touch-pad-knob");
    const axes = pad.axes ?? "xy";
    const dead = pad.dead ?? 0.3;
    let centre = null;

    function setAxis(dx, dy) {
      const [neg, pos] = ARROWS.x;
      const [up, dn] = ARROWS.y;
      if (axes !== "y") {
        touchKey(neg, dx < -dead);
        touchKey(pos, dx > dead);
      }
      if (axes !== "x") {
        const upPush = pad.invertY ? dy > dead : dy < -dead;
        const dnPush = pad.invertY ? dy < -dead : dy > dead;
        touchKey(up, upPush);
        touchKey(dn, dnPush);
      }
    }
    function release() {
      setAxis(0, 0);
      centre = null;
      knob.style.transform = "translate(0, 0)";
      el.classList.remove("live");
    }
    listen(el, "pointerdown", (e) => {
      const r = el.getBoundingClientRect();
      centre = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
      el.setPointerCapture?.(e.pointerId);
      el.classList.add("live");
      move(e);
    });
    function move(e) {
      if (!centre) return;
      let dx = (e.clientX - centre.x) / centre.r;
      let dy = (e.clientY - centre.y) / centre.r;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * centre.r * 0.62}px, ${dy * centre.r * 0.62}px)`;
      setAxis(dx, dy);
    }
    listen(el, "pointermove", move);
    listen(el, "pointerup", release);
    listen(el, "pointercancel", release);
  }

  // ---- buttons
  const row = document.createElement("div");
  row.className = "touch-row";
  layer.appendChild(row);
  for (const b of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `touch-btn${b.accent ? " accent" : ""}${b.side ? ` side-${b.side}` : ""}`;
    el.textContent = b.label;
    el.dataset.code = b.code;
    row.appendChild(el);
    listen(el, "pointerdown", (e) => {
      e.preventDefault();
      el.classList.add("down");
      if (b.tap) touchTap(b.code);
      else touchKey(b.code, true);
      el.setPointerCapture?.(e.pointerId);
    });
    const up = () => { el.classList.remove("down"); if (!b.tap) touchKey(b.code, false); };
    listen(el, "pointerup", up);
    listen(el, "pointercancel", up);
    listen(el, "pointerleave", up);
  }

  // ---- a drag-anywhere surface (paddle-style control)
  if (drag) {
    const el = document.createElement("div");
    el.className = "touch-drag";
    el.innerHTML = drag.label ? `<span class="touch-drag-hint">${drag.label}</span>` : "";
    layer.appendChild(el);
    let dragging = false;
    let started = 0;
    const fx = (e) => e.clientX / Math.max(1, window.innerWidth);
    const fy = (e) => e.clientY / Math.max(1, window.innerHeight);
    listen(el, "pointerdown", (e) => {
      dragging = true;
      started = performance.now();
      el.classList.add("live");
      el.setPointerCapture?.(e.pointerId);
      drag.onMove?.(fx(e), fy(e));
    });
    listen(el, "pointermove", (e) => { if (dragging) drag.onMove?.(fx(e), fy(e)); });
    const end = (e) => {
      el.classList.remove("live");
      if (dragging && performance.now() - started < 260) drag.onTap?.(fx(e), fy(e));
      dragging = false;
      drag.onEnd?.();
    };
    listen(el, "pointerup", end);
    listen(el, "pointercancel", end);
  }

  return {
    layer,
    get enabled() { return active; },
    show() { layer.classList.remove("no-touch"); },
    hide() { layer.classList.add("no-touch"); },
    destroy() { for (const [el, t, fn] of clean) el.removeEventListener(t, fn); layer.remove(); },
  };
}
