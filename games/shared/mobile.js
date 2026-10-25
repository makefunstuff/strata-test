// Device detection and a quality preset for phones.
//
//   import { quality } from "../shared/mobile.js";
//   const Q = quality({ pixelRatio: 2, bloomScale: 0.5, shadow: 1024 });
//   renderer.setPixelRatio(Q.pixelRatio);
//   createPost(..., { bloom: { scale: Q.bloomScale }, crt: { overrides: Q.crt } })
//
// The rule is: touch and a small viewport means a phone, and a phone pays for the CRT's
// extra texture fetches, the bloom resolution, the shadow map and the particle pools.
// Nothing here changes gameplay — it changes cost. Look is preserved on the desktop.
export function isTouch() {
  return (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ||
    (navigator.maxTouchPoints ?? 0) > 0;
}

/** A phone: touch, and the short edge is phone-sized. Rotation-safe (uses min of the edges). */
export function isPhone() {
  const short = Math.min(window.innerWidth, window.innerHeight);
  return isTouch() && short < 640;
}

/**
 * A quality preset. `lite` is what the games check to drop the most expensive cosmetics.
 * `crt` is a set of CRTShader uniform overrides (see shared/crt.js) — on a phone the phosphor
 * bleed (four texture fetches per pixel), the rolling beam, the grain and the flicker go away;
 * the curvature, scanlines, grille and tube edge, which are the CRT's identity, stay.
 */
export function quality({ pixelRatio = 2, bloomScale = 0.5, shadow = 1024, sparks = 1 } = {}) {
  const coarse = isTouch();
  const phone = isPhone();
  const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : pixelRatio);
  return {
    coarse,
    phone,
    lite: phone,
    pixelRatio: Math.max(1, dpr),
    bloomScale: phone ? Math.min(0.34, bloomScale) : bloomScale,
    bloomStrength: phone ? 0.78 : 1,          // multiplier on the game's own strength
    shadowMap: phone ? Math.min(512, shadow) : shadow,
    sparks: phone ? Math.max(0.35, sparks * 0.55) : sparks,
    crt: phone
      // No phosphor bleed (4 fetches/pixel), no rolling beam, no flicker, no grain. uGlow is
      // kept small but non-zero: it also carries the phosphor's colour, and zeroing it made the
      // phone picture the colourless one.
      ? { uGlow: 0.06, uNoise: 0, uBeam: 0, uFlicker: 0, uPixel: 1.25, uSat: 1.1, uGain: 1.5, uFilm: 0 }
      : {},
  };
}

/** Cheap frame-time watchdog: if the game cannot hold 45 fps, drop to the light tier.
 *  Call tick(dt) every frame; `onDrop` fires once, when the step is taken. */
export function autoQuality({ floor = 45, seconds = 2.5, onDrop = () => {} } = {}) {
  let acc = 0, frames = 0, dropped = false;
  return {
    tick(dt) {
      if (dropped || dt <= 0) return;
      acc += dt; frames++;
      if (acc < seconds) return;
      const fps = frames / acc;
      acc = 0; frames = 0;
      if (fps < floor) { dropped = true; onDrop(fps); }
    },
    get dropped() { return dropped; },
  };
}
