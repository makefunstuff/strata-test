// eurorack/js/app.js — the instrument: state, toolbar, module browser, keyboards, MIDI,
// patch save/load/share/record, and the boot sequence.

import { DEFS, CATS, defaultParams, validate, initPatch, CABLE_COLORS } from "./defs.js";
import { Engine } from "./engine.js";
import { Rack } from "./rack.js";
import { PRESETS, PRESET_NAMES, getPreset } from "./presets.js";

const LS_PATCH = "eurorack.patch";
const LS_PATCHES = "eurorack.patches";
const LS_HELP = "eurorack.help.seen";

const $ = (s) => document.querySelector(s);
let uidN = 1;
const uid = (p) => `${p}${(uidN++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const app = {
  state: { patch: null, sel: null, zoom: 1 },
  engine: new Engine(),
  rack: null,
  midiOn: false,
};

// ---------- patch plumbing ----------

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_PATCH, JSON.stringify(app.state.patch)); } catch { /* private mode */ }
  }, 400);
}

function structuralChange() {
  app.rack.rebuild();
  app.engine.setPatch(app.state.patch);
  saveSoon();
}

app.patchChanged = (structural = true) => {
  if (structural) structuralChange(); else saveSoon();
};

app.addModule = (type, row = null, col = null) => {
  const p = app.state.patch;
  const d = DEFS[type];
  if (!d) return null;
  let r = row ?? 0, c = col;
  if (c == null) {
    r = 0;
    c = app.rack.findGap(r, d.hp);
    if (c < 0) { r = 1; c = app.rack.findGap(r, d.hp); }
    if (c < 0) { r = (p.modules.at(-1)?.row ?? 0); c = Math.min((p.modules.at(-1)?.col ?? 0) + DEFS[p.modules.at(-1).type].hp + 1, 96 - d.hp); }
  }
  const m = { id: uid("m"), type, row: r, col: c, params: {} };
  p.modules.push(m);
  structuralChange();
  return m;
};

app.removeModule = (id) => {
  const p = app.state.patch;
  p.modules = p.modules.filter((m) => m.id !== id);
  p.cables = p.cables.filter((c) => c.src.m !== id && c.dst.m !== id);
  structuralChange();
};

app.addCable = (src, dst) => {
  const p = app.state.patch;
  const dupe = p.cables.some((c) => c.src.m === src.m && c.src.j === src.j && c.dst.m === dst.m && c.dst.j === dst.j);
  if (dupe) return;
  const color = p.cables.length % CABLE_COLORS.length;
  p.cables.push({ id: uid("c"), src, dst, color });
  structuralChange();
};

app.removeCable = (id) => {
  const p = app.state.patch;
  p.cables = p.cables.filter((c) => c.id !== id);
  structuralChange();
};

app.loadPatch = (patch, { save = true } = {}) => {
  const errs = validate(patch);
  if (errs.length) { toast("patch rejected: " + errs[0]); return false; }
  app.state.patch = patch;
  app.rack.rebuild();
  app.engine.setPatch(patch);
  $("#bpm").value = patch.bpm ?? 104;
  if (save) saveSoon();
  return true;
};

// ---------- URL hash ----------

function b64urlEncode(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
}

export function compactPatch(patch) {
  const c = { v: 1, name: patch.name, bpm: patch.bpm, modules: [], cables: [] };
  for (const m of patch.modules) {
    const defs = defaultParams(m.type);
    const params = {};
    for (const [k, v] of Object.entries(m.params || {})) if (Math.abs((defs[k] ?? 0) - v) > 1e-4) params[k] = Math.round(v * 1000) / 1000;
    c.modules.push({ id: m.id, type: m.type, row: m.row, col: m.col, ...(Object.keys(params).length ? { params } : {}) });
  }
  for (const cb of patch.cables) c.cables.push({ src: cb.src, dst: cb.dst, color: cb.color });
  return c;
}

function shareURL() {
  const json = JSON.stringify(compactPatch(app.state.patch));
  return `${location.origin}${location.pathname}#p=${b64urlEncode(json)}`;
}

function hashPatch() {
  const m = location.hash.match(/[#&]p=([A-Za-z0-9\-_]+)/);
  if (!m) return null;
  try { return JSON.parse(b64urlDecode(m[1])); } catch { return null; }
}

// ---------- UI bits ----------

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function openModal(title, bodyEl, actions) {
  const root = $("#modal");
  root.innerHTML = "";
  const card = document.createElement("div");
  card.className = "mcard";
  card.innerHTML = `<h3>${title}</h3>`;
  card.appendChild(bodyEl);
  const row = document.createElement("div");
  row.className = "mrow";
  for (const [label, fn, prim] of actions) {
    const b = document.createElement("button");
    b.textContent = label;
    if (prim) b.className = "prim";
    b.onclick = () => { if (fn() !== false) closeModal(); };
    row.appendChild(b);
  }
  card.appendChild(row);
  root.appendChild(card);
  root.classList.add("open");
}
function closeModal() { $("#modal").classList.remove("open"); $("#modal").innerHTML = ""; }
$("#modal")?.addEventListener("pointerdown", (e) => { if (e.target.id === "modal") closeModal(); });

// ---------- module browser ----------

function buildBrowser() {
  const grid = $("#browserGrid");
  grid.innerHTML = "";
  for (const [cat, label] of CATS) {
    const types = Object.entries(DEFS).filter(([, d]) => d.cat === cat);
    if (!types.length) continue;
    const sec = document.createElement("div");
    sec.className = "bsec";
    sec.innerHTML = `<h4>${label}</h4>`;
    const row = document.createElement("div");
    row.className = "brow";
    for (const [type, d] of types) {
      const it = document.createElement("div");
      it.className = "bitem";
      it.innerHTML = `<div class="bname">${d.name}</div><div class="bhp">${d.hp}HP</div><div class="bblurb">${d.blurb}</div>`;
      let drag = null;
      it.addEventListener("pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY, moved: false };
        it.setPointerCapture(e.pointerId);
      });
      it.addEventListener("pointermove", (e) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
          drag.moved = true;
          it.classList.add("ghost");
        }
        if (drag.moved) {
          it.style.position = "fixed";
          it.style.left = `${e.clientX - 50}px`;
          it.style.top = `${e.clientY - 20}px`;
          it.style.zIndex = 90;
        }
      });
      it.addEventListener("pointerup", (e) => {
        it.classList.remove("ghost");
        it.style.position = ""; it.style.left = ""; it.style.top = ""; it.style.zIndex = "";
        if (drag?.moved) {
          const rail = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".rail");
          if (rail) {
            const r = +rail.dataset.row;
            const rect = rail.getBoundingClientRect();
            const col = Math.max(0, Math.min(96 - DEFS[type].hp, Math.round((e.clientX - rect.left) / app.rack.hpw)));
            app.addModule(type, r, app.rack.findGap(r, DEFS[type].hp) >= 0 && col === 0 ? undefined : col);
          } else app.addModule(type);
        } else {
          app.addModule(type);                                  // click drops it in the first gap
        }
        drag = null;
      });
      row.appendChild(it);
    }
    sec.appendChild(row);
    grid.appendChild(sec);
  }
}

// ---------- computer + on-screen keyboard ----------

const KEYMAP = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyC: 3, KeyV: 4, KeyG: 5, KeyB: 6, KeyH: 7, KeyN: 8, KeyJ: 9, KeyM: 10, Comma: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
};
let kbOctave = 4;

function noteOnRel(semi, vel = 100) {
  const note = kbOctave * 12 + semi;
  app.engine.note(true, note, vel);
  $("#kbd").querySelectorAll(`[data-note="${note}"]`).forEach((k) => k.classList.add("down"));
}
function noteOffRel(semi) {
  app.engine.note(false, kbOctave * 12 + semi, 0);
  $("#kbd").querySelectorAll(`[data-note="${kbOctave * 12 + semi}"]`).forEach((k) => k.classList.remove("down"));
}

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,textarea") || $("#modal").classList.contains("open")) return;
  if (e.code in KEYMAP && !e.repeat) { e.preventDefault(); noteOnRel(KEYMAP[e.code]); }
  else if (e.code === "ArrowDown" && !e.repeat) kbOctave = Math.max(1, kbOctave - 1), updateKbd();
  else if (e.code === "ArrowUp" && !e.repeat) kbOctave = Math.min(7, kbOctave + 1), updateKbd();
  else if (e.code === "Delete") { if (app.state.sel) app.removeModule(app.state.sel); }
  audioKick();
});
document.addEventListener("keyup", (e) => {
  if (e.code in KEYMAP) noteOffRel(KEYMAP[e.code]);
});

function buildKbd() {
  const kbd = $("#kbd .keys");
  kbd.innerHTML = "";
  for (let o = 0; o < 2; o++) {
    for (let s = 0; s < 12; s++) {
      const note = (kbOctave + o) * 12 + s;
      const black = [1, 3, 6, 8, 10].includes(s);
      const k = document.createElement("div");
      k.className = `key ${black ? "bk" : "wk"}`;
      k.dataset.note = note;
      if (s === 0) k.innerHTML = `<span>C${kbOctave + o}</span>`;
      k.addEventListener("pointerdown", (e) => { e.preventDefault(); app.engine.note(true, note, 100); k.classList.add("down"); audioKick(); });
      const off = () => { app.engine.note(false, note, 0); k.classList.remove("down"); };
      k.addEventListener("pointerup", off);
      k.addEventListener("pointerleave", off);
      kbd.appendChild(k);
    }
  }
}
function updateKbd() { buildKbd(); $("#octave").textContent = `C${kbOctave}`; }

// ---------- MIDI ----------

async function initMIDI() {
  if (!navigator.requestMIDIAccess) return;
  try {
    const acc = await navigator.requestMIDIAccess();
    const wire = () => {
      let any = false;
      for (const inp of acc.inputs.values()) {
        if (!inp._wired) {
          inp._wired = true;
          inp.onmidimessage = (ev) => {
            const [st, d1, d2] = ev.data;
            if ((st & 0xf0) === 0x90 && d2 > 0) { app.engine.note(true, d1, d2); flashMidi(true); }
            else if ((st & 0xf0) === 0x80 || ((st & 0xf0) === 0x90 && d2 === 0)) { app.engine.note(false, d1, 0); flashMidi(true); }
          };
        }
        any = true;
      }
      app.midiOn = any;
      $("#midiDot").classList.toggle("on", any);
    };
    acc.onstatechange = wire;
    wire();
  } catch { /* no MIDI */ }
}
let midiTimer = null;
function flashMidi() {
  $("#midiDot").classList.add("act");
  clearTimeout(midiTimer);
  midiTimer = setTimeout(() => $("#midiDot").classList.remove("act"), 120);
}

// ---------- audio lifecycle ----------

let audioStarted = false;
async function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    await app.engine.start(app.state.patch);
    $("#audChip").classList.add("live");
  } catch (e) {
    $("#audChip").classList.add("dead");
    console.warn("audio engine failed to start:", e);
  }
}
function audioKick() {
  startAudio().then(() => app.engine.resume());
}
window.addEventListener("pointerdown", audioKick, { capture: true });
window.addEventListener("keydown", audioKick, { capture: true });

// ---------- toolbar ----------

function wireToolbar() {
  $("#addBtn").onclick = () => $("#drawer").classList.toggle("open");
  $("#presetSel").innerHTML = `<option value="">presets…</option>` + PRESET_NAMES.map((n) => `<option>${n}</option>`).join("");
  $("#presetSel").onchange = (e) => {
    const p = getPreset(e.target.value);
    if (p) { app.loadPatch(p); toast(`loaded ${e.target.value}`); }
    e.target.value = "";
  };
  $("#bpm").oninput = (e) => {
    const v = Math.max(30, Math.min(260, +e.target.value || 104));
    app.state.patch.bpm = v;
    app.engine.setBpm(v);
    saveSoon();
  };
  $("#saveBtn").onclick = () => {
    const inp = document.createElement("input");
    inp.id = "pname";
    inp.placeholder = app.state.patch.name || "my patch";
    openModal("Save patch", inp, [
      ["Save", () => {
        const name = ($("#pname").value || "patch").trim();
        const all = JSON.parse(localStorage.getItem(LS_PATCHES) || "{}");
        all[name] = compactPatch({ ...app.state.patch, name });
        try { localStorage.setItem(LS_PATCHES, JSON.stringify(all)); toast(`saved “${name}”`); } catch { toast("storage full"); return false; }
      }, true],
      ["Cancel", () => {}],
    ]);
  };
  $("#loadBtn").onclick = () => {
    const all = JSON.parse(localStorage.getItem(LS_PATCHES) || "{}");
    const box = document.createElement("div");
    box.className = "plist";
    const names = Object.keys(all);
    if (!names.length) box.innerHTML = "<p class=dim>no saved patches yet</p>";
    for (const n of names) {
      const row = document.createElement("div");
      row.className = "prow";
      row.innerHTML = `<span>${n}</span>`;
      const ld = document.createElement("button"); ld.textContent = "load"; ld.className = "prim";
      ld.onclick = () => { if (app.loadPatch(JSON.parse(JSON.stringify(all[n])))) { closeModal(); toast(`loaded “${n}”`); } };
      const dl = document.createElement("button"); dl.textContent = "del";
      dl.onclick = () => { delete all[n]; localStorage.setItem(LS_PATCHES, JSON.stringify(all)); box.remove(); $("#loadBtn").onclick(); };
      row.appendChild(ld); row.appendChild(dl);
      box.appendChild(row);
    }
    openModal("Patches", box, [["Close", () => {}]]);
  };
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(compactPatch(app.state.patch), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(app.state.patch.name || "patch").replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#importFile").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (!app.loadPatch(p)) toast("invalid patch");
    } catch { toast("not a patch file"); }
    e.target.value = "";
  };
  $("#shareBtn").onclick = async () => {
    const url = shareURL();
    history.replaceState(null, "", url.slice(url.indexOf("#")));
    try { await navigator.clipboard.writeText(url); toast("link copied"); }
    catch { prompt("copy this link:", url); }
  };
  $("#recBtn").onclick = async () => {
    const secs = +$("#recLen").value;
    $("#recBtn").classList.add("busy");
    $("#recBtn").textContent = `rec ${secs}s…`;
    try {
      const { left, right, sampleRate } = await Engine.renderOffline(app.state.patch, secs);
      const blob = Engine.wav(left, right, sampleRate);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(app.state.patch.name || "eurorack").replace(/\W+/g, "-").toLowerCase()}-${secs}s.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`recorded ${secs}s`);
    } catch (e) {
      toast("record failed: " + e.message);
    }
    $("#recBtn").classList.remove("busy");
    $("#recBtn").textContent = "● rec";
  };
  $("#kbdBtn").onclick = () => $("#kbd").classList.toggle("open");
  $("#helpBtn").onclick = () => $("#help").classList.add("open");
  $("#helpClose").onclick = () => { $("#help").classList.remove("open"); localStorage.setItem(LS_HELP, "1"); };
  $("#zoomOut").onclick = () => setZoom(app.state.zoom - 0.15);
  $("#zoomIn").onclick = () => setZoom(app.state.zoom + 0.15);
  $("#octDown").onclick = () => { kbOctave = Math.max(1, kbOctave - 1); updateKbd(); };
  $("#octUp").onclick = () => { kbOctave = Math.min(7, kbOctave + 1); updateKbd(); };
}

function setZoom(z) {
  app.state.zoom = Math.max(0.6, Math.min(1.4, Math.round(z * 100) / 100));
  app.rack.setZoom(app.state.zoom);
}

// ---------- boot ----------

const booted = (async () => {
  const hash = hashPatch();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_PATCH) || "null"); } catch { return null; } })();
  app.state.patch = hash || saved || initPatch();
  if (validate(app.state.patch).length) app.state.patch = initPatch();

  app.rack = new Rack($("#rackScroll"), app);
  app.rack.rebuild();
  app.engine.onLevels = (d) => app.rack.applyTelemetry(d);
  buildBrowser();
  buildKbd();
  wireToolbar();
  $("#bpm").value = app.state.patch.bpm ?? 104;

  await startAudio();                                    // suspended is fine; gesture resumes
  initMIDI();

  if (!localStorage.getItem(LS_HELP)) $("#help").classList.add("open");
  $("#audChip").addEventListener("click", audioKick);

  return true;
})();

// ---------- the testing hook (used by tools/check.mjs and curious humans) ----------

window.eurorack = {
  booted,
  app,
  get patch() { return app.state.patch; },
  loadPatch: (p) => app.loadPatch(p),
  loadPreset: (name) => { const p = getPreset(name); return p ? app.loadPatch(p) : false; },
  addModule: (t) => app.addModule(t),
  addCable: (s, d) => app.addCable(s, d),
  removeCable: (id) => app.removeCable(id),
  presets: PRESET_NAMES,
  validate: (p) => validate(p || app.state.patch),
  setBpm: (v) => { app.state.patch.bpm = v; app.engine.setBpm(v); },
  note: (on, n, v) => app.engine.note(on, n, v),
  async renderOffline(presetOrPatch, secs = 4) {
    const p = typeof presetOrPatch === "string" ? getPreset(presetOrPatch)
      : presetOrPatch ?? app.state.patch;
    const r = await Engine.renderOffline(p, secs);
    return { ...Engine.levels(r.left, r.right), length: r.left.length, sampleRate: r.sampleRate };
  },
  compactPatch: () => JSON.stringify(compactPatch(app.state.patch)),
};
