// eurorack/js/rack.js — the rack: rails, panels, knobs, jacks, patch cables and the browser.
//
// Panels are built from js/defs.js descriptions. Cables live in one SVG layer over the
// rack content: cubic beziers that sag with distance, swing once when you plug them in,
// and come out again when you click them. Coordinates are plain CSS pixels (zoom changes
// px-per-HP and reflows, so no transform maths is involved in cable geometry).

import { DEFS, HPW, ROW_H, RACK_HP, CABLE_COLORS, paramSpec } from "./defs.js";

const SAG = (d) => Math.min(110, 14 + d * 0.22);

function el(cls, parent, html) {
  const e = document.createElement("div");
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

function capture(el_, id) { try { el_.setPointerCapture(id); } catch { /* synthetic or already-gone pointers */ } }

// ---- knobs ---------------------------------------------------------------------

export function makeKnob(def, value, onInput, opts = {}) {
  const size = opts.size || 34;
  const wrap = el("knob");
  wrap.style.setProperty("--ks", `${size}px`);
  if (def.p) wrap.dataset.p = def.p;                    // identity for tests and a11y
  if (def.seg) wrap.dataset.seg = "1";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.innerHTML = `
    <path class="trk" d="M 8.5 31.5 A 17 17 0 1 1 31.5 31.5" />
    <path class="val" d="M 8.5 31.5 A 17 17 0 1 1 31.5 31.5" pathLength="100" />
    <circle class="cap" cx="20" cy="20" r="11.5" />
    <line class="ind" x1="20" y1="20" x2="20" y2="9.5" />`;
  wrap.appendChild(svg);
  const lab = el("klab");
  lab.textContent = def.label;
  const val = el("kval");
  wrap.appendChild(lab); wrap.appendChild(val);

  const set = (v, fire = true) => {
    v = Math.max(0, Math.min(1, v));
    svg.querySelector(".val").style.strokeDasharray = `${(v * 100).toFixed(1)} 100`;
    svg.querySelector(".ind").setAttribute("transform", `rotate(${-135 + v * 270} 20 20)`);
    val.textContent = def.fmt ? def.fmt(v) : v.toFixed(2);
    wrap.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    wrap.setAttribute("aria-valuetext", val.textContent);
    if (fire) onInput(v);
  };
  set(value, false);

  let dragging = null;
  wrap.addEventListener("pointerdown", (e) => {
    if (def.seg) {                                          // segmented: click cycles
      const n = def.seg.length;
      const cur = Math.round(value * (n - 1));
      value = ((cur + 1) % n) / (n - 1);
      set(value);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    dragging = { y: e.clientY, v: value, moved: false };
    capture(wrap, e.pointerId);
    e.preventDefault(); e.stopPropagation();
  });
  wrap.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = dragging.y - e.clientY;
    if (Math.abs(dy) > 1) dragging.moved = true;
    value = dragging.v + dy / (e.shiftKey ? 900 : 170);
    set(Math.max(0, Math.min(1, value)));
  });
  wrap.addEventListener("pointerup", (e) => { dragging = null; e.stopPropagation(); });
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    value = Math.max(0, Math.min(1, value - Math.sign(e.deltaY) * (e.shiftKey ? 0.004 : 0.025)));
    set(value);
  }, { passive: false });
  wrap.addEventListener("dblclick", (e) => { e.stopPropagation(); set(def.def ?? 0.5); });

  // the knob is operable without a pointer: focusable slider, arrows to turn
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "slider");
  wrap.setAttribute("aria-label", `${def.label || def.p || "parameter"} knob`);
  wrap.setAttribute("aria-valuemin", "0");
  wrap.setAttribute("aria-valuemax", "100");
  wrap.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.005 : 0.03;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") value = Math.min(1, value + step);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") value = Math.max(0, value - step);
    else if (e.key === "Home") value = 0;
    else if (e.key === "End") value = 1;
    else return;
    e.preventDefault(); e.stopPropagation();       // arrows must not reach the octave shortcuts
    set(value);
  });

  return { el: wrap, set: (v) => set(v, false) };
}

// ---- rack ----------------------------------------------------------------------

export class Rack {
  constructor(root, app) {
    this.root = root;              // .rack-scroll element (scrolls horizontally)
    this.app = app;                // {state, onPatchChanged, engine}
    this.content = root.querySelector("#rackContent");
    this.svg = root.querySelector("#cables");
    this.hpw = HPW;
    this.jackEls = new Map();      // "m.j" -> element
    this.outJackEls = [];          // flat, in worklet meter order (fallback)
    this.scopeCanvases = [];       // every OUTPUT panel's scope (a rack may hold more than one)
    this.seqEls = new Map();       // module id -> {steps:[{led,bar}], last:-1}
    this.scopeCanvas = null;
    this.cableEls = new Map();     // cable id -> {path, hit}
    this.anims = new Map();        // cable id -> start time (swing)
    this.sel = null;
    this.pending = null;           // {src, pathEl}
    this._bindCableLayer();
  }

  // ---------- layout ----------

  rebuild() {
    const { patch } = this.app.state;
    // keep patch.modules in rail order so UI meter slots match the worklet's jackMap order
    patch.modules.sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0));
    this.content.querySelectorAll(".rail").forEach((r) => r.remove());
    this.jackEls.clear(); this.outJackEls = []; this.seqEls.clear(); this.cableEls.clear();
    const rows = Math.max(2, ...patch.modules.map((m) => (m.row ?? 0) + 1));
    for (let r = 0; r < rows; r++) {
      const rail = el("rail", this.content);
      rail.dataset.row = r;
      rail.style.height = `${ROW_H + 26}px`;
      const inner = el("row", rail);
      inner.style.width = `${RACK_HP * this.hpw}px`;
      inner.dataset.row = r;
      for (const m of patch.modules.filter((x) => (x.row ?? 0) === r)) inner.appendChild(this._panel(m));
    }
    this._drawAllCables();
    this._sizeSvg();
  }

  setZoom(z) {
    this.hpw = HPW * z;
    this.root.style.setProperty("--hpw", `${this.hpw}px`);   // the rail stripe scales with the grid, at any zoom
    this.rebuild();
  }

  _sizeSvg() {
    const w = this.content.scrollWidth, h = this.content.scrollHeight;
    this.svg.setAttribute("width", w); this.svg.setAttribute("height", h);
    this.svg.style.width = `${w}px`; this.svg.style.height = `${h}px`;
  }

  _panel(mod) {
    const d = DEFS[mod.type];
    const p = el("panel");
    p.style.width = `${d.hp * this.hpw}px`;
    p.style.height = `${ROW_H}px`;
    p.style.left = `${(mod.col ?? 0) * this.hpw}px`;
    p.dataset.id = mod.id;
    p.style.setProperty("--pcol", d.col || "#212b38");
    const head = el("phead", p, `<span class="pname">${d.name}</span><button class="px" title="remove">✕</button>`);
    head.querySelector(".px").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.app.removeModule(mod.id); });
    head.addEventListener("pointerdown", (e) => this._startMove(e, mod));
    const body = el("pbody", p);
    const knobs = el("krow", body);
    for (const k of d.knobs) {
      const spec = paramSpec(mod.type).find((s) => s.p === k.p);
      const v = mod.params?.[k.p] ?? spec?.def ?? 0.5;
      const kn = makeKnob(k, v, (val) => {
        mod.params = mod.params || {}; mod.params[k.p] = val;
        this.app.engine.setParam(mod.id, k.p, val);
        this.app.patchChanged(false);
      });
      knobs.appendChild(kn.el);
    }
    if (mod.type === "seq") this._seqGrid(body, mod);
    const jacks = el("jrow", body);
    for (const j of d.jacks) {
      const cell = el(`jackcell ${j.dir}`, jacks);
      const lab = el("jlab", cell, j.label);
      const jk = el(`jack ${j.kind} ${j.dir}`, cell);
      jk.dataset.m = mod.id; jk.dataset.j = j.j; jk.dataset.dir = j.dir;
      this.jackEls.set(`${mod.id}.${j.j}`, jk);
      if (j.dir === "out") this.outJackEls.push(jk);   // index fallback only; telemetry maps by key
      jk.addEventListener("pointerdown", (e) => this._startPatch(e, mod.id, j.j, j.dir));
    }
    if (d.scope) {
      const cv = document.createElement("canvas");
      cv.width = 240; cv.height = 84;
      cv.className = "scope";
      body.appendChild(cv);
      const g0 = cv.getContext("2d");
      g0.fillStyle = "#071520"; g0.fillRect(0, 0, cv.width, cv.height);
      g0.strokeStyle = "rgba(142,232,255,.18)";
      g0.beginPath(); g0.moveTo(0, cv.height / 2); g0.lineTo(cv.width, cv.height / 2); g0.stroke();
      this.scopeCanvas = cv; this.scopeCanvases.push(cv);
    }
    p.addEventListener("pointerdown", (e) => {
      this.app.state.sel = mod.id;
      p.classList.add("sel");
      this.root.querySelectorAll(".panel.sel").forEach((x) => { if (x !== p) x.classList.remove("sel"); });
    });
    return p;
  }

  _seqGrid(body, mod) {
    const grid = el("seqgrid", body);
    const steps = [];
    for (let i = 0; i < 16; i++) {
      const cell = el("step", grid);
      const led = el("sled", cell);
      const bar = el("sbar", cell);
      const fill = el("sfill", bar);
      const spec = paramSpec("seq").find((s) => s.p === `p${i}`);
      let pv = mod.params?.[`p${i}`] ?? spec?.def ?? 0.5;
      let gv = mod.params?.[`g${i}`] ?? (i % 2 ? 0 : 1);
      fill.style.height = `${pv * 100}%`;
      cell.classList.toggle("on", gv > 0.5);
      const upd = () => {
        mod.params = mod.params || {};
        mod.params[`p${i}`] = pv; mod.params[`g${i}`] = gv;
        this.app.engine.setParam(mod.id, `p${i}`, pv);
        this.app.engine.setParam(mod.id, `g${i}`, gv);
        this.app.patchChanged(false);
      };
      let dr = null;
      cell.addEventListener("pointerdown", (e) => {
        dr = { y: e.clientY, v: pv, moved: false };
        capture(cell, e.pointerId);
        e.preventDefault();
      });
      cell.addEventListener("pointermove", (e) => {
        if (!dr) return;
        const rect = cell.getBoundingClientRect();
        const ny = 1 - (e.clientY - rect.top) / rect.height;
        if (Math.abs(e.clientY - dr.y) > 2) dr.moved = true;
        pv = Math.max(0, Math.min(1, ny));
        fill.style.height = `${pv * 100}%`;
      });
      cell.addEventListener("pointerup", (e) => {
        if (dr && !dr.moved) gv = gv > 0.5 ? 0 : 1;         // click toggles the gate
        cell.classList.toggle("on", gv > 0.5);
        dr = null; upd();
      });
      steps.push({ led, cell, i });
    }
    this.seqEls.set(mod.id, { steps });
  }

  // ---------- patch cables ----------

  _jackXY(el_) {
    const cRect = this.content.getBoundingClientRect();
    const r = el_.getBoundingClientRect();
    return { x: r.left - cRect.left + r.width / 2, y: r.top - cRect.top + r.height / 2 };
  }

  _cablePath(a, b, swing = 0, t = 0) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const sag = SAG(dist) * (1 + swing * Math.sin(t * 22) * 0.35);
    const cx = Math.abs(dx) * 0.18 + 18;
    return `M ${a.x} ${a.y} C ${a.x - cx} ${a.y + sag}, ${b.x + cx} ${b.y + sag}, ${b.x} ${b.y}`;
  }

  _mkCableEls(cable, idx) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "cable");
    path.setAttribute("stroke", CABLE_COLORS[(Number.isFinite(cable.color) ? cable.color : 0) % CABLE_COLORS.length] ?? CABLE_COLORS[0]);
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("class", "cable-hit");
    hit.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.app.removeCable(cable.id);
    });
    g.appendChild(path); g.appendChild(hit);
    this.svg.appendChild(g);
    this.cableEls.set(cable.id, { g, path, hit });
    return { g, path, hit };
  }

  _drawAllCables() {
    this.svg.querySelectorAll("g").forEach((g) => g.remove());
    this.cableEls.clear();
    (this.app.state.patch.cables || []).forEach((c, i) => {
      const els = this._mkCableEls(c, i);
      const a = this.jackEls.get(`${c.src.m}.${c.src.j}`);
      const b = this.jackEls.get(`${c.dst.m}.${c.dst.j}`);
      if (!a || !b) return;
      const d = this._cablePath(this._jackXY(a), this._jackXY(b));
      els.path.setAttribute("d", d); els.hit.setAttribute("d", d);
    });
  }

  redrawCables() { this._drawAllCables(); this._sizeSvg(); }

  _startPatch(e, mid, jack, dir) {
    e.stopPropagation(); e.preventDefault();
    if (this.pending && this.pending._cancel) this.pending._cancel();   // a second pointerdown must not orphan the first live cable
    const srcEl = this.jackEls.get(`${mid}.${jack}`);
    const from = this._jackXY(srcEl);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "cable pending");
    path.setAttribute("stroke", "#8ee8ff");
    this.svg.appendChild(path);
    const st = { from, dir, mid, jack, path, t0: performance.now() };
    this.pending = st;
    const move = (ev) => {
      const cRect = this.content.getBoundingClientRect();
      const to = { x: ev.clientX - cRect.left, y: ev.clientY - cRect.top };
      const a = dir === "out" ? from : to, b = dir === "out" ? to : from;
      path.setAttribute("d", this._cablePath(a, b));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      path.remove();
      if (this.pending === st) this.pending = null;
    };
    st._cancel = cleanup;
    const cancel = () => cleanup();
    const up = (ev) => {
      cleanup();
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const jk = hit?.closest?.(".jack");
      if (!jk) return;
      const other = { mid: jk.dataset.m, jack: jk.dataset.j, dir: jk.dataset.dir };
      if (other.dir === dir || (other.mid === mid && other.jack === jack)) return;
      const src = dir === "out" ? { m: mid, j: jack } : { m: other.mid, j: other.jack };
      const dst = dir === "out" ? { m: other.mid, j: other.jack } : { m: mid, j: jack };
      this.app.addCable(src, dst);
      const id = this.app.state.patch.cables.at(-1)?.id;
      if (id) { this.anims.set(id, performance.now()); this.startAnim(); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  _animLoop = () => {
    const now = performance.now();
    for (const [id, t0] of [...this.anims]) {
      const t = (now - t0) / 1000;
      if (t > 0.9) { this.anims.delete(id); this.redrawOne(id); continue; }
      const c = this.app.state.patch.cables.find((x) => x.id === id);
      const els = this.cableEls.get(id);
      if (c && els) {
        const a = this.jackEls.get(`${c.src.m}.${c.src.j}`);
        const b = this.jackEls.get(`${c.dst.m}.${c.dst.j}`);
        if (a && b) {
          const d = this._cablePath(this._jackXY(a), this._jackXY(b), Math.exp(-t * 5) * 1.2, t);
          els.path.setAttribute("d", d); els.hit.setAttribute("d", d);
        }
      }
    }
    if (this.anims.size) requestAnimationFrame(this._animLoop);   // demand-only: no frames when idle
    else this._animRunning = false;
  };
  startAnim() {
    if (!this._animRunning) { this._animRunning = true; requestAnimationFrame(this._animLoop); }
  }
  redrawOne(id) {
    const c = this.app.state.patch.cables.find((x) => x.id === id);
    const els = this.cableEls.get(id);
    if (!c || !els) return;
    const a = this.jackEls.get(`${c.src.m}.${c.src.j}`);
    const b = this.jackEls.get(`${c.dst.m}.${c.dst.j}`);
    if (a && b) { const d = this._cablePath(this._jackXY(a), this._jackXY(b)); els.path.setAttribute("d", d); els.hit.setAttribute("d", d); }
  }

  _bindCableLayer() { /* anim loop starts on demand (startAnim) */ }

  // ---------- moving modules ----------

  _startMove(e, mod) {
    if (e.button != null && e.button !== 0) return;
    const panel = this.content.querySelector(`.panel[data-id="${mod.id}"]`);
    if (!panel) return;
    const d = DEFS[mod.type];
    const start = { x: e.clientX, y: e.clientY, col: mod.col ?? 0, row: mod.row ?? 0 };
    let moved = false;
    panel.classList.add("drag");
    const move = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      panel.style.pointerEvents = "none";        // let the rail under the cursor be hit-testable
      const newCol = Math.max(0, Math.round(start.col + dx / this.hpw));
      const railUnder = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".rail");
      const newRow = railUnder ? +railUnder.dataset.row : start.row;
      mod.col = Math.min(newCol, RACK_HP - d.hp);
      mod.row = newRow;
      this.redrawCables();                          // cables track the module while it flies (the README promised swing)
      panel.style.position = "fixed";
      panel.style.left = `${ev.clientX - 60}px`;
      panel.style.top = `${ev.clientY - 18}px`;
      panel.style.zIndex = 50;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      panel.style.pointerEvents = "";
      panel.classList.remove("drag");
      if (moved) {
        panel.style.position = ""; panel.style.left = ""; panel.style.top = ""; panel.style.zIndex = "";
        this._resolveOverlap(mod);
        this.rebuild();
        this.app.patchChanged(false);
      } else {
        panel.style.position = ""; panel.style.left = ""; panel.style.top = ""; panel.style.zIndex = "";
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  _resolveOverlap(mod) {
    const d = DEFS[mod.type];
    const same = this.app.state.patch.modules.filter((x) => x !== mod && (x.row ?? 0) === (mod.row ?? 0)).sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
    let col = mod.col ?? 0;
    const hitAt = (c) => same.some((x) => c < (x.col ?? 0) + DEFS[x.type].hp && c + d.hp > (x.col ?? 0));
    let guard = 0;
    while (hitAt(col) && guard++ < 200) col += 1;
    mod.col = Math.min(col, RACK_HP - d.hp);
  }

  findGap(row, hp) {
    const mods = this.app.state.patch.modules.filter((x) => (x.row ?? 0) === row).sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
    let c = 0;
    for (const m of mods) {
      if ((m.col ?? 0) - c >= hp) return c;
      c = Math.max(c, (m.col ?? 0) + DEFS[m.type].hp + 1);
    }
    return c + hp <= RACK_HP ? c : -1;
  }

  // ---------- telemetry ----------

  applyTelemetry({ lv, k, scope, seq }) {
    if (!this._lastLv || this._lastLv.length !== lv.length) this._lastLv = new Float32Array(lv.length);   // modules added mid-session grow jackMap
    for (let i = 0; i < lv.length; i++) {
      // map by the worklet's own jack key: the UI may sort/rebuild panels in any
      // order, and a positional zip between two independently-ordered arrays is
      // how meters once started showing another jack's level after plain editing
      const el_ = (k && k[i]) ? this.jackEls.get(k[i]) : this.outJackEls[i];
      if (!el_) continue;
      const v = Math.min(1, lv[i] * 1.6);
      if (Math.abs(v - this._lastLv[i]) > 0.02) {          // style writes only on visible change
        el_.style.setProperty("--led", v.toFixed(2));
        this._lastLv[i] = v;
      }
    }
    this._seqCur = this._seqCur || new Map();
    for (const [id, { steps }] of this.seqEls) {
      const cur = seq?.[id];
      if (this._seqCur.get(id) === cur) continue;
      this._seqCur.set(id, cur);
      for (const s of steps) s.led.classList.toggle("lit", cur === s.i);
    }
    const now = performance.now();
    if (this.scopeCanvas && this.scopeCanvases.length && now - (this._scopeAt ?? 0) > 55) {   // ≤ ~18 fps: paint cost, not message cost
      this._scopeAt = now;
      for (const cv of this.scopeCanvases) {
      const g = cv.getContext("2d");
      const w = cv.width, h = cv.height;
      g.fillStyle = "#071520"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(142,232,255,.13)"; g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= w; x += w / 8) { g.moveTo(x, 0); g.lineTo(x, h); }
      for (let y = 0; y <= h; y += h / 4) { g.moveTo(0, y); g.lineTo(w, y); }
      g.stroke();
      g.strokeStyle = "rgba(142,232,255,.3)";
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      g.strokeStyle = "#8ee8ff"; g.lineWidth = 1.8; g.shadowColor = "#8ee8ff"; g.shadowBlur = 7;
      g.beginPath();
      const n = scope.length;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w, y = h / 2 - scope[i] * h * 0.46;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke(); g.shadowBlur = 0;
      }
    }
  }
}
