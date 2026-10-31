// The overlay: a rail of landmarks to fly to, the card that tells you what you are looking at, and
// a dock with the hour, the season and the guided tour. Everything here is DOM and CSS; the scene
// stays in main.js, which hands over the callbacks and gets the camera work done through `fly`.
import * as THREE from "three";
import { clamp } from "../6-medieval-diorama/rng.js";

const TOUR_DWELL = 7.2;      // seconds a stop holds before the tour walks on
const FLY_TIME = 1.5;        // seconds of camera flight per hop

/** "08:20" from the day parameter the lab runs on (0 = dawn, 0.58 ≈ noon, 1.3 = deep night) */
export function hourLabel(t) {
  const h = (4.5 + clamp(t, 0, 1.3) * 15) % 24;
  const m = Math.round((h % 1) * 60);
  const hh = Math.floor(h);
  return `${String(hh).padStart(2, "0")}:${String(m === 60 ? 0 : m).padStart(2, "0")}`;
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * @param opts.landmarks  the LANDMARKS array (id, name, et, year, blurb, x, z, w, d, stop)
 * @param opts.terr       the terrain, so a framing cannot bury itself in the hill
 * @param opts.frames     id -> {pos, target} hand-kept framings, used where they exist
 * @param opts.host       { fly, setHour, setDay, setNight, toggleWinter, togglePanel, winter, view }
 */
export function createUI({ landmarks, terr, frames = {}, host }) {
  // -------------------------------------------------------------------------------- the rail ----
  const rail = document.createElement("nav");
  rail.className = "rail";
  rail.setAttribute("aria-label", "landmarks");
  const head = document.createElement("div");
  head.className = "rail-h";
  head.textContent = "landmarks";
  rail.appendChild(head);
  const chips = new Map();
  for (const lm of landmarks) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<span class="nm"></span><span class="yr"></span>`;
    b.querySelector(".nm").textContent = lm.name;
    b.querySelector(".yr").textContent = lm.year;
    b.title = `${lm.et} · ${lm.year}`;
    b.addEventListener("click", () => open(lm.id));
    rail.appendChild(b);
    chips.set(lm.id, b);
  }

  // ----------------------------------------------------------------------------- the card ----
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="c-top"><span class="c-name"></span><span class="c-year"></span>` +
    `<button class="c-close" type="button" aria-label="close">×</button></div>` +
    `<i class="c-et"></i><span class="c-text"></span>`;
  card.querySelector(".c-close").addEventListener("click", () => { close(); stopTour(); });
  let openId = null;

  // ----------------------------------------------------------------------------- the dock ----
  const dock = document.createElement("div");
  dock.className = "dock";
  dock.innerHTML = `<div class="hour"><span class="h-lab"></span>` +
    `<input type="range" min="0" max="1.3" step="0.005" aria-label="hour of the day"></div>` +
    `<div class="btns">` +
    `<button data-act="day" type="button" title="day">☀</button>` +
    `<button data-act="night" type="button" title="night">☾</button>` +
    `<button data-act="winter" type="button" title="winter">❄</button>` +
    `<button data-act="tour" class="wide" type="button" title="guided tour">▶ tour</button>` +
    `<button data-act="panel" type="button" title="the full panel">⚙</button></div>`;
  const hourInput = dock.querySelector("input");
  const hourLab = dock.querySelector(".h-lab");
  hourInput.addEventListener("input", () => host.setHour(+hourInput.value));
  dock.addEventListener("click", (e) => {
    const act = e.target.getAttribute("data-act");
    if (!act) return;
    if (act === "day") host.setDay();
    else if (act === "night") host.setNight();
    else if (act === "winter") host.toggleWinter();
    else if (act === "tour") toggleTour();
    else if (act === "panel") host.togglePanel();
  });

  // ------------------------------------------------------------------ where the camera goes ----
  /** a framing for a landmark: the hand-kept one if there is one, otherwise a distance off its size */
  function frameFor(lm) {
    if (frames[lm.id]) return frames[lm.id];
    const size = Math.max(lm.w, lm.d);
    const dist = clamp(size * 2.6 + 50, 100, 340);
    let dx = lm.x, dz = lm.z;
    if (Math.hypot(dx, dz) < 80) { dx = 0.35; dz = -1; }        // in the middle of the town: see it from the square
    const len = Math.hypot(dx, dz) || 1;
    const px = lm.x + (dx / len) * dist;
    const pz = lm.z + (dz / len) * dist;
    const ty = terr.ground(lm.x, lm.z) + Math.max(14, size * 0.7);
    // look down at it, not through the neighbour's gable: a house nearby is up to 18 m tall
    const py = Math.max(terr.ground(px, pz) + 9, ty + dist * 0.45);
    return { pos: [px, py, pz], target: [lm.x, ty, lm.z] };
  }

  // --------------------------------------------------------------------- the camera flight ----
  let flight = null;
  function flyTo(f) {
    flight = {
      p0: host.camera.position.clone(), t0: host.orbit.target.clone(),
      p1: new THREE.Vector3(...f.pos), t1: new THREE.Vector3(...f.target),
      from: performance.now(),
    };
    host.orbit.autoRotate = false;
  }

  // --------------------------------------------------------------------------------- tour ----
  const order = [...landmarks].sort((a, b) => (a.stop || 99) - (b.stop || 99) || landmarks.indexOf(a) - landmarks.indexOf(b));
  let tour = null;      // { i, until }
  function startTour() {
    tour = { i: -1, until: 0 };
    dock.dataset.tour = "on";
    dock.querySelector('[data-act="tour"]').textContent = "■ tour";
    nextStop();
  }
  function stopTour() {
    if (!tour) return;
    tour = null;
    delete dock.dataset.tour;
    dock.querySelector('[data-act="tour"]').textContent = "▶ tour";
  }
  function toggleTour() { if (tour) stopTour(); else startTour(); }
  function nextStop() {
    if (!tour) return;
    tour.i = (tour.i + 1) % order.length;
    tour.until = performance.now() + TOUR_DWELL * 1000;
    open(order[tour.i].id, true);
  }

  // ---------------------------------------------------------------------------- open/close ----
  function open(id, quiet) {
    const lm = landmarks.find((l) => l.id === id);
    if (!lm) return null;
    openId = id;
    card.querySelector(".c-name").textContent = lm.name;
    card.querySelector(".c-year").textContent = lm.year;
    card.querySelector(".c-et").textContent = lm.et;
    card.querySelector(".c-text").textContent = lm.blurb;
    card.classList.add("show");
    for (const [k, b] of chips) b.classList.toggle("on", k === id);
    flyTo(frameFor(lm));
    host.view(id);
    if (host.arrive) host.arrive(lm);
    if (!quiet) stopTour();
    return lm;
  }
  function close() {
    openId = null;
    card.classList.remove("show");
    for (const b of chips.values()) b.classList.remove("on");
  }

  // a touch on the town is the end of the tour and of a flight in progress
  const canvas = document.getElementById("stage-canvas");
  canvas.addEventListener("pointerdown", () => { stopTour(); flight = null; }, { passive: true });

  // --------------------------------------------------------------------------------- sync ----
  function sync(state) {
    hourInput.value = state.time;
    hourLab.textContent = hourLabel(state.time);
    dock.querySelector('[data-act="winter"]').classList.toggle("on", !!state.winter);
    dock.querySelector('[data-act="night"]').classList.toggle("on", !!state.night);
    dock.querySelector('[data-act="day"]').classList.toggle("on", !state.night);
  }

  return {
    el: { rail, card, dock },
    sync,
    show: (on) => { for (const el of [rail, card, dock]) el.style.display = on ? "" : "none"; },
    /** called from the frame loop: advances the flight and the tour clock */
    tick() {
      // wall clock, not the frame's dt: the lab clamps dt to 1/20 so the town stays stable at any
      // frame rate, and a fly-to driven by that clock could crawl for ten seconds under a headless
      // load and then keep dragging the camera back after the check had moved it elsewhere
      if (flight) {
        const k0 = Math.min(1, (performance.now() - flight.from) / (FLY_TIME * 1000));
        const k = ease(k0);
        host.camera.position.lerpVectors(flight.p0, flight.p1, k);
        host.orbit.target.lerpVectors(flight.t0, flight.t1, k);
        if (k0 >= 1) flight = null;
      }
      if (tour && performance.now() >= tour.until) nextStop();
    },
    flying: () => !!flight,
    /** stop the camera and the tour at once — anything that moves the camera by script uses this */
    stop() { flight = null; stopTour(); },
    open, close, startTour, stopTour, toggleTour,
    touring: () => !!tour,
    current: () => openId,
  };
}
