/* 08 · the grant application's behaviour.
   The rules this code follows:
     - a field is never validated before the user has left it;
     - one submit validates the whole step, and the summary at the top lists
       every problem as a link that puts the caret in the field;
     - the summary gets focus, not the first bad field: a screen-reader user
       hears the whole list, a sighted user sees the red box;
     - a revealed question is derived from an answer, and clearing that answer
       clears the reveal and its value;
     - the draft is saved on every change and restored only with consent;
     - nothing is sent: the last step is a receipt printed from the state. */
const STEPS = ["eligibility", "property", "works", "applicant", "review", "submitted"];
const KEY = "hea-frg-draft-v1";
const TODAY = "2024-12-03";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = { step: "eligibility", answers: {}, done: {}, touched: {}, errors: {}, started: Date.now() };
const form = $("#appForm");

/* ── fields ─────────────────────────────────────────────────────────── */
/* a "field" is a radio group (by name), a checkbox group (by name), or a single
   control inside a [data-field] box */
function fieldsIn(step, all = false) {
  const sec = $("#step-" + step);
  const out = [];
  const seen = new Set();
  for (const box of $$("[data-field]", sec)) {
    /* a field in a panel that is not on screen is not a question being asked: the
       manual address is behind "Enter the address manually", and a reveal is behind
       an answer. Validating them would block the form on questions nobody saw. */
    if (!all && (box.closest("[hidden]") || !box.getClientRects().length)) continue;
    const ctrl = box.matches(".fs") ? $$("input", box) : [box.querySelector("input, textarea")].filter(Boolean);
    if (!ctrl.length) continue;
    const name = ctrl[0].name || ctrl[0].id;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ box, ctrl, name, group: ctrl.length > 1 && ctrl[0].type === "checkbox" });
  }
  return out;
}

function labelOf(f) {
  const sec = f.box.matches("fieldset") ? f.box.querySelector("legend") : f.box.querySelector("label");
  return (sec && sec.textContent.trim()) || f.name;
}

function dym(box) {
  const g = (id) => (box.querySelector("#" + id) || {}).value || "";
  const d = g("when-day").trim(), m = g("when-month").trim(), y = g("when-year").trim();
  if (!d && !m && !y) return "";
  if (!/^[0-9]{1,2}$/.test(d) || !/^[0-9]{1,2}$/.test(m) || !/^[0-9]{4}$/.test(y)) return "broken";
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (dt.getDate() !== Number(d) || dt.getMonth() !== Number(m) - 1) return "broken";
  return dt.toISOString().slice(0, 10);
}
function valueOf(f) {
  if (f.box.dataset && f.box.dataset.date) return dym(f.box);
  if (f.ctrl[0].type === "radio") {
    const hit = f.ctrl.find((i) => i.checked);
    return hit ? hit.value : "";
  }
  if (f.ctrl[0].type === "checkbox" && f.group) return f.ctrl.filter((i) => i.checked).map((i) => i.value);
  if (f.ctrl[0].type === "checkbox") return f.ctrl[0].checked ? "yes" : "";
  if (f.ctrl[0].type === "file") return f.ctrl[0].dataset.chosen || "";
  return f.ctrl[0].value.trim();
}

/* a rule lives on the control, not in a JS table: the markup says what it needs */
function ruleFor(f) {
  const c = f.ctrl[0];
  const box = f.box;
  if (f.name === "consent") return { kind: "checked", msg: "Tick the declaration to submit" };
  if (f.group) return { kind: "some", msg: "Choose at least one item" };
  if (c.dataset.required) return { kind: "required", msg: c.dataset.required };
  if (c.type === "radio") return null;                       /* required radio groups declare data-required on the input */
  if (f.ctrl[0].type === "radio") return null;
  if (c.dataset.pattern) return { kind: "pattern", msg: c.dataset.msg || "Check this answer", re: new RegExp(c.dataset.pattern) };
  if (c.dataset.type === "email") return { kind: "pattern", msg: "Enter an email address like name@example.com", re: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i };
  if (f.box.dataset.date) return { kind: "dym", msg: f.box.dataset.msg || "Enter a real date", min: f.box.dataset.min };
  if (c.min) return { kind: "date", msg: c.dataset.msg || "Choose a date after today", min: c.min };
  if (c.type === "file" && c.dataset.max) return { kind: "file", msg: "The file is bigger than 10 MB", max: +c.dataset.max };
  if (box.dataset.required) return { kind: "required", msg: box.dataset.required };
  return null;
}

function check(f) {
  const r = ruleFor(f);
  if (!r) return null;
  const v = valueOf(f);
  if (r.kind === "required" && !v) return r.msg;
  if (r.kind === "some" && !v.length) return r.msg;
  if (r.kind === "checked" && v !== "yes") return r.msg;
  if (!v) return null;
  if (r.kind === "pattern" && !r.re.test(String(v).toUpperCase())) return r.msg;
  if (r.kind === "date" && v < r.min) return r.msg;
  if (r.kind === "dym") {
    if (!v) return "Enter a date: day, month and year";
    if (v === "broken") return "Enter a real date, like 15 1 2025";
    if (r.min && v < r.min) return r.msg;
  }
  if (r.kind === "file") {
    const sz = +(f.ctrl[0].dataset.size || 0);
    if (sz > r.max) return r.msg;
  }
  return null;
}

function paint(f, msg) {
  const box = f.box;
  const err = box.querySelector("[data-err]") || (box.parentElement && box.parentElement.querySelector("[data-err]"));
  const inp = f.ctrl[0];
  if (msg) {
    box.classList.add("bad");
    f.ctrl.forEach((i) => i.setAttribute("aria-invalid", "true"));
    const id = inp.id || inp.name;
    inp.setAttribute("aria-describedby", ((inp.getAttribute("aria-describedby") || "").split(" ").filter((t) => t && !t.endsWith("-err")).join(" ") + " " + id + "-err").trim());
    if (err) {
      err.id = id + "-err";
      err.textContent = msg;
      err.style.display = "block";
    }
    state.errors[f.name] = { msg, label: labelOf(f), id: inp.id || f.name };
  } else {
    box.classList.remove("bad");
    f.ctrl.forEach((i) => i.removeAttribute("aria-invalid"));
    if (err) { err.textContent = ""; err.style.display = "none" }
    delete state.errors[f.name];
  }
}

function validateStep(step, { show = true } = {}) {
  const bad = [];
  for (const f of fieldsIn(step)) {
    const msg = check(f);
    if (show) paint(f, msg);
    if (msg) bad.push({ ...f, msg });
  }
  return bad;
}

/* ── the summary at the top ─────────────────────────────────────────── */
function showSummary(bad, step) {
  const box = $("#summary");
  const list = $("#sumList");
  const blocker = blockerFor(step);
  list.innerHTML = "";
  const items = [];
  if (blocker) items.push({ id: blocker.id, label: blocker.label, msg: blocker.msg });
  for (const f of bad) items.push({ id: f.ctrl[0].id || f.name, label: labelOf(f), msg: f.msg });
  if (!items.length) { box.hidden = true; return false }
  for (const it of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#" + it.id;
    a.textContent = it.msg;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(it.id);
      if (t) { t.scrollIntoView({ block: "center" }); t.focus({ preventScroll: true }) }
    });
    li.append(a);
    list.append(li);
  }
  box.hidden = false;
  box.focus({ preventScroll: false });
  return true;
}

/* the tenant-without-permission answer stops the application: the panel is a
   heading, the summary names it, and the CTA stays enabled so the reason is
   reachable by keyboard */
function blockerFor(step) {
  if (step !== "eligibility") return null;
  if (live("owns") === "no") return { id: "block-owns", label: "Permission", msg: "You cannot apply as a tenant without the owner's written permission" };
  return null;
}

/* ── reveals ────────────────────────────────────────────────────────── */
/* the live answer for a name, read from the form: a reveal must follow what is
   on the screen right now, not the last autosave */
function live(name) {
  const ins = [...document.querySelectorAll('[name="' + name + '"]')];
  if (!ins.length) { const el = document.getElementById(name); return el ? el.value.trim() : "" }
  if (ins[0].type === "radio") { const h = ins.find((i) => i.checked); return h ? h.value : "" }
  if (ins[0].type === "checkbox") return ins.filter((i) => i.checked).length ? "yes" : "";
  return ins[0].value.trim();
}
function syncReveals() {
  for (const r of document.querySelectorAll(".reveal")) {
    /* "quotes:one quotes:none" — any pair opens the panel */
    const pairs = r.dataset.show.trim().split(/\s+/).map((t) => t.split(":"));
    const on = pairs.some(([n, v]) => live(n) === v);
    r.hidden = !on;
    r.setAttribute("data-live", on ? "1" : "0");
    if (!on) {
      /* clearing the answer that opened a panel clears what was typed in it */
      for (const inp of $$("input, textarea", r)) {
        if (inp.type === "radio" || inp.type === "checkbox") inp.checked = false;
        else inp.value = "";
        if (inp.type === "file") { inp.value = ""; delete inp.dataset.chosen; delete inp.dataset.size }
      }
      for (const box of $$("[data-field]", r)) paint({ box, ctrl: $$("input, textarea", box) }, null);
    }
  }
  const stop = blockerFor(state.step);
  $("#step-eligibility .actions .btn").classList.toggle("blocked", !!stop);
}

/* ── the step machine ───────────────────────────────────────────────── */
function go(step, { focus = true } = {}) {
  state.step = step;
  for (const s of STEPS) $("#step-" + s).hidden = s !== step;
  document.body.dataset.step = step;
  const i = STEPS.indexOf(step);
  $("#progress").children[0].textContent = "Step " + (i + 1) + " of " + STEPS.length;
  $("#progress .fill").style.width = Math.round(((i + 1) / STEPS.length) * 100) + "%";
  $("#summary").hidden = true;
  if (step === "review") renderReview();
  for (const li of $$("#rail li")) {
    const key = li.dataset.go;
    const k = STEPS.indexOf(key);
    let st = "todo";
    if (state.errors[__nameFor(key)] && state.done[key] === false) st = "error";
    if (state.done[key]) st = "done";
    if (key === step) st = step === "submitted" ? "done" : "current";
    li.dataset.state = st;
    const badge = li.querySelector("[data-st]");
    badge.textContent = st === "done" ? "Done" : st === "current" ? "Now" : st === "error" ? "Check" : "";
    const a = li.querySelector("a");
    a.setAttribute("aria-current", st === "current" ? "step" : "false");
  }
  if (focus) {
    const h = $("#step-" + step + " .h");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: false }) }
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  history.replaceState(null, "", "#" + step);
  syncReveals();
  drawFiles();
}
const __nameFor = (key) => key;

function gotoFromRail(key) {
  const i = STEPS.indexOf(key), cur = STEPS.indexOf(state.step);
  if (i <= cur || state.done[key]) { go(key); return }
  /* forward: validate every step in between, land on the first that fails */
  for (let k = cur; k < i; k++) {
    const bad = validateStep(STEPS[k]);
    const blocker = blockerFor(STEPS[k]);
    if (bad.length || blocker) { showSummary(bad, STEPS[k]); go(STEPS[k], { focus: false }); $("#summary").focus(); return }
    state.done[STEPS[k]] = true;
  }
  go(key);
}

/* ── save ───────────────────────────────────────────────────────────── */
let saveTimer, barTimer;
function collect() {
  const a = {};
  /* every field, visible or not: the receipt has to repeat the answers, and the
     steps are hidden the moment the person moves on */
  for (const s of STEPS.slice(0, 4)) for (const f of fieldsIn(s, true)) a[f.box.dataset.date ? f.box.dataset.field : f.name] = valueOf(f);
  a.address = state.answers.address || null;
  return a;
}
function save(silent) {
  state.answers = collect();
  $("#saveState").textContent = "Saving…";
  $("#saveState").className = "mast-save saving";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const at = new Date();
    const stamp = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: at.toISOString(), step: state.step, answers: state.answers, done: state.done }));
    } catch (e) { /* a private window: the form still works, the banner says so */ }
    $("#saveState").textContent = "Saved " + stamp;
    $("#saveState").className = "mast-save saved";
    if (!silent) {
      $("#savebarTxt").textContent = "Answers saved at " + stamp;
      $("#savebar").classList.add("show");
      clearTimeout(barTimer);
      barTimer = setTimeout(() => $("#savebar").classList.remove("show"), 1800);
    }
  }, 260);
}

function restore(d) {
  for (const [k, v] of Object.entries(d.answers || {})) {
    const ins = $$('[name="' + k + '"]');
    if (!ins.length) { const el = document.getElementById(k); if (el && typeof v === "string") el.value = v; continue }
    if (ins[0].type === "radio") ins.forEach((i) => (i.checked = i.value === v));
    else if (ins[0].type === "checkbox") {
      const list = Array.isArray(v) ? v : (v === "yes" ? [ins[0].value] : []);
      ins.forEach((i) => (i.checked = list.includes(i.value)));
    } else { const el = document.getElementById(k); if (el && typeof v === "string") el.value = v }
  }
  state.answers = d.answers || {};
  state.done = d.done || {};
  state.answers.address = (d.answers && d.answers.address) || null;
  syncSelection();
  syncReveals();
  go(d.step && STEPS.includes(d.step) && d.step !== "submitted" ? d.step : "eligibility", { focus: false });
}

/* ── review ─────────────────────────────────────────────────────────── */
const REVIEWS = [
  { step: "eligibility", title: "Eligibility", fields: [["owns", "Ownership"], ["flooded", "Flooded in the last 5 years"], ["zone", "In a mapped flood zone"], ["zoneRef", "Flood zone reference"]] },
  { step: "property", title: "The property", fields: [["addressLine", "Address"], ["grid", "Grid reference"]] },
  { step: "works", title: "The works", fields: [["itemsList", "Works chosen"], ["cost", "Estimated cost"], ["quotes", "Quotes"], ["files", "Files uploaded"], ["when", "Earliest start"]] },
  { step: "applicant", title: "Your details", fields: [["name", "Full name"], ["email", "Email"], ["phone", "Phone"], ["contact", "Best contact"], ["postal", "Postal address"]] },
];

function derived() {
  const a = collect();
  /* the review prints what the person read on the screen, not the value
     attribute: "No, I rent it and the owner agrees", not "owner-permission" */
  const lab = (name, val) => {
    if (!val) return "";
    const i = document.querySelector('[name="' + name + '"][value="' + val + '"]');
    if (!i) return val;
    const row = i.closest(".opt");
    const t = row ? row.querySelector("span") : null;
    return t ? t.textContent.replace(/£[0-9,]+\s*$/, "").trim() : val;
  };
  const items = (a.items || []).filter(Boolean);
  const cost = items.reduce((s, v) => s + (+$('[name="items"][value="' + v + '"]').dataset.cost || 0), 0);
  return {
    owns: lab("owns", a.owns), flooded: lab("flooded", a.flooded), zone: lab("zone", a.zone), zoneRef: a.zoneRef,
    addressLine: a.address === "manual"
      ? [a.line1, a.town, a.postcode].filter(Boolean).join(", ")
      : (a.lookup || ""),
    grid: a.grid,
    itemsList: items.join(", "),
    cost: cost ? "£" + cost.toLocaleString("en-GB") : "",
    quotes: lab("quotes", a.quotes),
    files: (state.files || []).map((f) => f.name).join(", "),
    when: a.when ? new Date(a.when + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
    name: a.name, email: a.email, phone: a.phone, contact: lab("contact", a.contact), postal: a.postal,
  };
}

function renderReview() {
  const d = derived();
  const host = $("#review");
  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "rev";
  for (const sec of REVIEWS) {
    const box = document.createElement("section");
    box.className = "rev-sec";
    const h = document.createElement("div");
    h.className = "rev-h";
    const t = document.createElement("h2");
    t.textContent = sec.title;
    const chg = document.createElement("button");
    chg.type = "button";
    chg.className = "chg";
    chg.textContent = "Change";
    chg.setAttribute("aria-label", "Change " + sec.title.toLowerCase());
    chg.addEventListener("click", () => go(sec.step));
    h.append(t, chg);
    const dl = document.createElement("dl");
    for (const [k, label] of sec.fields) {
      const v = d[k];
      if (!v && (k === "zoneRef" || k === "grid" || k === "postal" || k === "files")) continue;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = v || "Not answered";
      if (!v) dd.className = "miss";
      dl.append(dt, dd);
    }
    box.append(h, dl);
    wrap.append(box);
  }
  host.append(wrap);
}

/* ── address lookup ─────────────────────────────────────────────────── */
const ADDRESSES = [
  ["2 Quay Wall, Harrow Town", "HA1 4QT", "zone HZ-4128, tidal"],
  ["17 Wear Street, Harrow Town", "HA1 4RA", "zone HZ-4131, tidal"],
  ["Tidcombe Mill, Tidcombe", "HA2 7LB", "zone HZ-3307, river"],
];
function runLookup() {
  const q = $("#lookup").value.trim();
  const msg = $("#lookup-msg");
  const list = $("#results");
  if (!q) { msg.textContent = "Type a street or a house number first."; msg.className = "msg bad"; $("#lookup").focus(); return }
  msg.textContent = "Searching the address index…";
  msg.className = "msg load";
  list.hidden = true;
  list.innerHTML = "";
  setTimeout(() => {
    const hits = ADDRESSES.filter((a) => a[0].toLowerCase().includes(q.toLowerCase()));
    if (!hits.length) {
      msg.textContent = "No match. Use the manual entry below.";
      msg.className = "msg bad";
      $("#manualBtn").focus();
      return;
    }
    msg.className = "msg";
    msg.textContent = hits.length + " match" + (hits.length > 1 ? "es" : "") + ". Choose one.";
    for (const [line, pc, zone] of hits) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", "false");
      b.innerHTML = "<span>" + line + " · " + pc + "</span><span class=\"zone\">" + zone + "</span>";
      b.addEventListener("click", () => {
        $$("#results button").forEach((x) => x.setAttribute("aria-selected", "false"));
        b.setAttribute("aria-selected", "true");
        $("#lookup").value = line;
        state.answers.address = "lookup";
        $("#lookup").name = "addressLine";
        msg.textContent = "Chosen. The flood zone was filled in from the index.";
        msg.className = "msg good";
        const zi = $("#zoneRef");
        zi.value = zone.match(/[A-Z]{2}-[0-9]{4}/)[0];
        const zr = $$('[name="zone"]');
        zr.forEach((i) => (i.checked = i.value === "yes"));
        syncSelection();
        syncReveals();
        save();
      });
      li.append(b);
      list.append(li);
    }
    list.hidden = false;
  }, 420);
}

/* ── files ──────────────────────────────────────────────────────────── */
state.files = [];
function addFiles(list) {
  const max = +$("#file").dataset.max;
  const msg = $("#file-msg");
  for (const f of list) {
    if (f.size > max) {
      msg.textContent = f.name + " is " + (f.size / 1048576).toFixed(1) + " MB. The limit is 10 MB.";
      msg.className = "msg bad";
      continue;
    }
    const rec = { name: f.name, size: f.size, pct: 0, id: Math.random().toString(36).slice(2, 8) };
    state.files.push(rec);
    msg.textContent = "Uploading " + f.name + "…";
    msg.className = "msg load";
    const tick = setInterval(() => {
      rec.pct = Math.min(100, rec.pct + 12 + Math.random() * 22);
      if (rec.pct >= 100) {
        clearInterval(tick);
        msg.textContent = f.name + " uploaded.";
        msg.className = "msg good";
        $("#file").dataset.chosen = f.name;
        $("#file").dataset.size = String(f.size);
        save();
      }
      drawFiles();
    }, 120);
  }
  drawFiles();
}
function drawFiles() {
  const ul = $("#fileList");
  if (!ul) return;
  ul.innerHTML = "";
  for (const f of state.files) {
    const li = document.createElement("li");
    li.className = f.pct >= 100 ? "done" : "";
    li.innerHTML = '<span class="nm"></span><span class="sz"></span><span class="bar"><i></i></span>';
    li.querySelector(".nm").textContent = f.name;
    li.querySelector(".sz").textContent = (f.size / 1024).toFixed(0) + " KB";
    li.querySelector(".bar i").style.width = f.pct + "%";
    if (f.pct >= 100) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "rm";
      rm.textContent = "Remove";
      rm.setAttribute("aria-label", "Remove " + f.name);
      rm.addEventListener("click", () => {
        state.files = state.files.filter((x) => x.id !== f.id);
        delete $("#file").dataset.chosen;
        $("#file-msg").textContent = "";
        drawFiles();
        save();
      });
      li.append(rm);
    }
    ul.append(li);
  }
  $("#fileName").textContent = state.files.length ? state.files.length + " file" + (state.files.length > 1 ? "s" : "") + " ready" : "No file chosen";
}

/* ── the visible selection state on every option row ────────────────── */
function syncSelection() {
  for (const inp of $$("input[type=radio], input[type=checkbox]")) {
    const row = inp.closest(".opt");
    if (row) row.classList.toggle("on", inp.checked);
  }
  const items = $$('[name="items"]').filter((i) => i.checked);
  const cost = items.reduce((s, i) => s + (+i.dataset.cost || 0), 0);
  const tot = $("#total");
  if (tot) {
    const over = cost > 5000;
    tot.className = "total" + (over ? " over" : "");
    tot.innerHTML = items.length
      ? items.length + " item" + (items.length > 1 ? "s" : "") + " · <b>£" + cost.toLocaleString("en-GB") + "</b>" +
        (over ? " · over the £5,000 cap, we will pay £5,000" : " · the grant pays up to £5,000")
      : "Nothing chosen yet.";
  }
}

/* ── wiring ─────────────────────────────────────────────────────────── */
for (const li of $$("#rail li")) {
  li.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); gotoFromRail(li.dataset.go) });
}
for (const b of $$("[data-back]")) b.addEventListener("click", () => go(b.dataset.back));
$("[data-save]").addEventListener("click", () => { save(); showSaveCode() });
$("#saveForm").addEventListener("submit", (e) => { e.preventDefault(); save(); showSaveCode() });
function showSaveCode() {
  const code = "HEA-DRAFT-" + (1000 + (state.answers.name || "").length * 7 + (state.answers.phone || "").length * 3);
  const p = $("#saveCode");
  p.hidden = false;
  p.textContent = "Code " + code + " — type it on the “come back” page to resume on another device.";
}

$("#lookupBtn").addEventListener("click", runLookup);
$("#manualBtn").addEventListener("click", () => {
  $("#manual").hidden = false;
  state.answers.address = "manual";
  $("#line1").focus();
  save();
});
$("#file").addEventListener("change", (e) => addFiles([...e.target.files]));
const drop = $("#fileDrop");
for (const ev of ["dragover", "dragenter"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag") });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag") });
drop.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));

/* one listener for every field: mark touched, re-validate that field, save */
form.addEventListener("input", (e) => {
  syncSelection();
  if (e.target.matches("input, textarea")) {
    const f = fieldFor(e.target);
    if (f && state.touched[f.name]) paint(f, check(f));
    if (e.target.type === "radio" || e.target.type === "checkbox") {
      const g = fieldFor(e.target);
      if (g) { state.touched[g.name] = true; paint(g, check(g)) }
    }
  }
  syncReveals();
  save();
});
form.addEventListener("focusout", (e) => {
  const f = fieldFor(e.target);
  if (!f) return;
  state.touched[f.name] = true;
  paint(f, check(f));
});
function fieldFor(el) {
  const box = el.closest("[data-field]");
  if (!box) return null;
  const sec = el.closest(".step");
  return fieldsIn(sec.id.replace("step-", "")).find((f) => f.ctrl.includes(el)) || null;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const btn = e.submitter || {};
  const next = btn.dataset ? btn.dataset.next : null;
  if (!next) return;
  if (next === "submitted") { submit(); return }
  for (const s of STEPS.slice(0, 4)) state.touched[s] = true;
  const bad = validateStep(state.step);
  for (const f of fieldsIn(state.step)) state.touched[f.name] = true;
  if (bad.length || blockerFor(state.step)) { showSummary(bad, state.step); return }
  state.done[state.step] = true;
  save(true);
  go(next);
});

function submit() {
  /* submitting re-checks everything: the review step is not a bypass */
  const firstBad = STEPS.slice(0, 4).find((s) => validateStep(s).length || blockerFor(s));
  if (firstBad) {
    const bad = validateStep(firstBad);
    go(firstBad, { focus: false });
    showSummary(bad, firstBad);
    return;
  }
  const btn = $('#step-review .btn.big');
  btn.setAttribute("aria-busy", "true");
  const label = btn.textContent;
  btn.textContent = "Submitting…";
  setTimeout(() => {
    btn.removeAttribute("aria-busy");
    btn.textContent = label;
    const d = derived();
    const n = 1000 + ((d.name || "").length * 37 + (d.phone || "").length * 11) % 8000;
    $("#refNo").textContent = "HEA-" + n + "-" + TODAY.slice(0, 4);
    $("#doneEmail").textContent = d.email || "you";
    const box = $("#doneSummary");
    box.innerHTML = "";
    const h = document.createElement("h2");
    h.className = "p-h";
    h.textContent = "What you told us";
    const dl = document.createElement("dl");
    dl.className = "rev-dl";
    for (const sec of REVIEWS) {
      for (const [k, label2] of sec.fields) {
        const v = d[k];
        if (!v) continue;
        const dt = document.createElement("dt");
        dt.textContent = label2;
        const dd = document.createElement("dd");
        dd.textContent = v;
        dl.append(dt, dd);
      }
    }
    box.append(h, dl);
    state.done = { eligibility: true, property: true, works: true, applicant: true, review: true };
    try { localStorage.removeItem(KEY) } catch (e) { }
    go("submitted");
  }, 700);
}

/* the elapsed clock in the rail */
setInterval(() => {
  const s = Math.floor((Date.now() - state.started) / 1000);
  $("#elapsed").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}, 1000);

$("#printBtn").addEventListener("click", () => window.print());
$("#againBtn").addEventListener("click", () => {
  try { localStorage.removeItem(KEY) } catch (e) { }
  location.reload();
});

/* ── boot ───────────────────────────────────────────────────────────── */
syncSelection();
drawFiles();
let draft = null;
try { draft = JSON.parse(localStorage.getItem(KEY) || "null") } catch (e) { }
if (draft && draft.answers && Object.values(draft.answers).some((v) => (Array.isArray(v) ? v.length : v && v !== "manual"))) {
  const at = new Date(draft.at);
  $("#draftMeta").textContent = "Saved at " + at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
    " on " + at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) +
    ", at step “" + ($("#step-" + draft.step) ? $("#step-" + draft.step).dataset.title : draft.step) + "”.";
  $("#draft").hidden = false;
  $("#draftGo").addEventListener("click", () => { $("#draft").hidden = true; restore(draft) });
  $("#draftNew").addEventListener("click", () => {
    try { localStorage.removeItem(KEY) } catch (e) { }
    $("#draft").hidden = true;
  });
}
/* Demo affordances. A person reaches the review, the receipt and the upload
   states by typing; ?demo=fill&go=review reaches them from the outside, so the
   screenshots show real states and not painted mock-ups. Nothing is sent. */
const Q = new URLSearchParams(location.search);
const DEMO = Q.get("demo");
const set = (n, v) => document.querySelectorAll('[name="' + n + '"]').forEach((i) => (i.checked = i.value === v));
function fillAll() {
  set("owns", "owner-permission"); set("flooded", "yes"); set("zone", "yes");
  $("#zoneRef").value = "HZ-4128";
  $("#lookup").value = "2 Quay Wall, Harrow Town · HA1 4QT";
  $("#grid").value = "592104 131820";
  document.querySelectorAll('[name="items"]').forEach((i) => (i.checked = ["Flood door", "Air-brick covers", "Non-return valve"].includes(i.value)));
  set("quotes", "yes");
  $("#when-day").value = "15"; $("#when-month").value = "1"; $("#when-year").value = "2025";
  $("#name").value = "Maren Whitlock";
  $("#email").value = "maren.whitlock@example.net";
  $("#phone").value = "07700 900118";
  set("contact", "phone");
  $('[name="consent"]').checked = true;
  state.answers.address = "lookup";
  syncSelection(); syncReveals();
}
function fakeFiles() {
  set("quotes", "one"); syncReveals();
  state.files = [
    { name: "quay-wall-quote-meridian-glazing.pdf", size: 486000, pct: 100, id: "a1" },
    { name: "quote-2-saltco-floor.pdf", size: 41200, pct: 62, id: "a2" },
  ];
  $("#file").dataset.chosen = "quay-wall-quote-meridian-glazing.pdf";
  $("#file").dataset.size = "486000";
  $("#file-msg").textContent = "saltco-measure-12.pdf is 12.4 MB. The limit is 10 MB. Photograph page 1 only, or send it by post.";
  $("#file-msg").className = "msg bad";
  drawFiles();
}
if (DEMO === "fill") fillAll();
if (DEMO === "file") fakeFiles();
/* the hash is read and never obeyed: a deep link into step 5 would let a person
   skip validation, and a shared link is no promise that the earlier answers
   exist on this device. ?go= is the demo door, and it is documented. */
const startStep = Q.get("go") && STEPS.includes(Q.get("go")) && Q.get("go") !== "submitted" ? Q.get("go") : "eligibility";
go(startStep, { focus: false });
