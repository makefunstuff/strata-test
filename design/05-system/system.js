/* Halyard — the documentation page's own code: the switchers, the live contrast
 * measurement, the component demos, and the patterns. The *system* is system.css;
 * this file only demonstrates it. */
const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── colour maths: measure, do not declare ─────────────────────────── */
const probe = document.createElement("span");
probe.setAttribute("aria-hidden", "true");
probe.style.cssText = "position:absolute;left:-9999px;top:0";
document.body.appendChild(probe);
const resolve = (token) => {
  probe.style.color = `var(${token})`;
  const c = getComputedStyle(probe).color;
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
};
const parseRGB = (s) => { const m = (s || "").match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; };
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, bg) => { const [r, g, b, al] = fg; return al == null ? fg : [r * al + bg[0] * (1 - al), g * al + bg[1] * (1 - al), b * al + bg[2] * (1 - al)]; };
const bgOf = (el) => {
  let n = el, out = [255, 255, 255], stack = [];
  while (n) {
    const c = getComputedStyle(n).backgroundColor;
    const m = (c || "").match(/[\d.]+/g);
    if (m) {
      const v = m.map(Number);
      const col = v.length > 3 && v[3] === 0 ? null : v;
      if (col) stack.push(col);
      if (v.length < 4 || v[3] > 0.98) break;
    }
    n = n.parentElement;
  }
  for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
  return out;
};
const measured = (fgToken, bgToken) => ratio(resolve(fgToken), resolve(bgToken));

/* ── the switchers ─────────────────────────────────────────────────── */
/* The switches are per-visit on purpose: a documentation page that remembers your
   theme in local storage is a documentation page whose next screenshot is in a
   language nobody asked for. Nothing here is persisted. */
const SWITCHERS = [["themes", "theme"], ["density", "density"], ["sizes", "size"], ["motions", "motion"]];
const syncSwitchers = () => {
  for (const [id, key] of SWITCHERS) {
    const v = root.getAttribute("data-" + key);
    for (const b of $$("#" + id + " button")) b.setAttribute("aria-pressed", String(b.dataset.set === v));
  }
};
for (const [id, key] of SWITCHERS) {
  const host = document.getElementById(id);
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-set]");
    if (!b) return;
    root.setAttribute("data-" + key, b.dataset.set);
    syncSwitchers(); measure();
  });
}
syncSwitchers();

/* ── colour section ────────────────────────────────────────────────── */
/* The contract, as checks. A colour role is never measured against "the page"
 * when it is used as a background: a soft fill is judged by the text that sits on it. */
const CHECKS = [
  ["--ink", "primary text on the page", "--surface", 4.5],
  ["--ink", "text on a card", "--surface-2", 4.5],
  ["--ink-2", "secondary text", "--surface", 4.5],
  ["--ink-3", "captions, section labels", "--surface", 4.5],
  ["--ink-3", "a caption on a card", "--surface-2", 4.5],
  ["--accent-ink", "the label on a primary button", "--accent", 4.5],
  ["--accent", "a link on the page", "--surface", 4.5],
  ["--accent", "a link on a card", "--surface-2", 4.5],
  ["--ink", "text on a quiet selected fill", "--accent-soft", 4.5],
  ["--ok", "a status word on its own fill", "--ok-soft", 4.5],
  ["--warn", "a status word on its own fill", "--warn-soft", 4.5],
  ["--danger", "a status word on its own fill", "--danger-soft", 4.5],
  ["--info", "a status word on its own fill", "--info-soft", 4.5],
  ["--line-strong", "an input's boundary", "--surface", 3],
  ["--focus", "the focus ring", "--surface", 3],
  ["--line", "a hairline between rows", "--surface", 1.3],
  /* A tone step nobody can see is not elevation. WCAG does not grade a card's
     background; this does, at the smallest step an eye picks up on this surface. */
  ["--surface-2", "a card against the page", "--surface", 1.05],
  ["--surface-3", "a hover fill", "--surface", 1.05],
  ["--data-1", "a 24 px series swatch", "--surface", 3],
  ["--data-2", "a 24 px series swatch", "--surface", 3],
  ["--data-3", "a 24 px series swatch", "--surface", 3],
  ["--data-4", "a 24 px series swatch", "--surface", 3],
];
function swatches() {
  const host = $("#swatches");
  host.innerHTML = CHECKS.map(([fg, label, bg, need]) => {
    const r = measured(fg, bg);
    const pass = r >= need;
    /* Text pairs show "Aa" in the real foreground on the real background. Graphical
     * pairs (a boundary, a focus ring, a series swatch) show the object itself — the
     * audit must not read a rule as body copy, and nobody should have to. */
    const chip = need >= 4.5
      ? `<span class="aa">Aa</span>`
      : `<span class="bar"></span>`;
    return `<div class="sw" title="${fg} on ${bg}: ${label}">
      <i style="background:var(${bg});color:var(${fg})">${chip}</i>
      <div class="l"><b>${fg.replace("--", "")} on ${bg.replace("--", "")}</b><span>${label}</span>
        <span class="cr" data-pass="${pass ? "yes" : "no"}">${r.toFixed(2)}:1 · need ${need}</span>
      </div></div>`;
  }).join("");
  const fails = CHECKS.filter(([fg, , bg, need]) => measured(fg, bg) < need);
  $("#sw-theme").textContent = root.getAttribute("data-theme");
  $("#sw-summary").innerHTML = fails.length
    ? `<span style="color:var(--danger)">${fails.length} of ${CHECKS.length} checks under the contract:</span> ` + fails.map(([f, , b]) => `<span class="mono">${f} on ${b}</span>`).join(", ")
    : `all ${CHECKS.length} checks pass in the <b>${root.getAttribute("data-theme")}</b> theme — measured in the browser, not declared`;
}
function dataLegend() {
  const host = $("#data-legend");
  const vals = [72, 54, 38, 21];
  host.innerHTML = vals.map((v, i) =>
    `<div class="r"><span class="mono" style="font-size:11.5px">data-${i + 1}</span>
      <span class="t"><i style="width:${v}%;background:var(--data-${i + 1})"></i></span>
      <span class="v">${v}%</span></div>`).join("") +
    `<div class="note">Four series stay separable by luminance as well as hue — check the deck theme, where they sit on near-black.</div>`;
}

/* ── type / space / shape ──────────────────────────────────────────── */
function typeset() {
  const cs = getComputedStyle(root);
  const r = parseFloat(cs.getPropertyValue("--ratio"));
  $("#scale-ratio").textContent = `ratio ${r}`;
  const steps = [["h1", "display · 4 steps", 4], ["h2", "section", 3], ["h3", "card title", 2], ["h4", "group", 1], ["body", "text role", 0]];
  $("#typeset").innerHTML = steps.map(([n, use, k]) => {
    const size = 15 * r ** k;
    return `<div class="row"><div class="meta">${n}<br>${size.toFixed(1)} px</div>
      <div style="font-family:${n === "body" ? "var(--font-text)" : "var(--font-display)"};font-size:${size}px;line-height:1.16;font-weight:${n === "h1" ? 700 : 600};letter-spacing:-.015em">Harbour Depot 3</div></div>`;
  }).join("") +
    `<div class="row"><div class="meta">mono<br>15 px</div><div class="num" style="font-size:15px">06:12:44 · 1 284 ln/min · 41.2 kW</div></div>
     <div class="row"><div class="meta">roles</div><div class="meta" style="font-size:11px;line-height:1.5">${cs.getPropertyValue("--font-display").split(",")[0]} · ${cs.getPropertyValue("--font-text").split(",")[0]} · ${cs.getPropertyValue("--font-mono").split(",")[0]}</div></div>`;
}
function rulers() {
  $("#ruler").innerHTML = [4, 8, 12, 16, 24, 32, 48, 64].map((v) =>
    `<div class="u"><i style="height:${v / 4}px;width:${v}px"></i><span>${v} px</span></div>`).join("");
  $("#radii").innerHTML = [["--r-xs", "chip"], ["--r-sm", "input"], ["--r-md", "button, card"], ["--r-lg", "panel"], ["--r-xl", "sheet"], ["--r-pill", "pill"]]
    .map(([t, use]) => `<div class="u"><i style="height:34px;width:34px;border-radius:var(${t})"></i><span>${t.replace("--r-", "")} · ${use}</span></div>`).join("");
  $("#pad-val").textContent = getComputedStyle(root).getPropertyValue("--pad").trim() || "1";
}

/* ── the kit ───────────────────────────────────────────────────────── */
const KIT = [
  ["Button", ".btn", `
    <div class="states"><button class="btn" type="button">Export</button>
      <button class="btn ghost" type="button">Cancel</button>
      <button class="btn quiet" type="button">More</button>
      <button class="btn danger" type="button">Delete</button></div>
    <div class="states"><button class="btn sm" type="button">Small</button>
      <button class="btn busy" type="button" aria-busy="true">Saving</button>
      <button class="btn" type="button" disabled>Disabled</button>
      <button class="btn ghost sm" type="button" aria-pressed="true">Pressed state</button></div>`,
    "<b>Use</b> one primary per view; ghost for the secondary; quiet for tools; danger only for loss. <b>Never</b> two primaries side by side.",
    "Every button is a real <code>&lt;button&gt;</code> with a text label; the busy state keeps the label in the accessible name and sets <code>aria-busy</code>."],
  ["Icon button", ".iconbtn", `
    <div class="states"><button class="iconbtn" type="button" aria-label="Search"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.4"/><path d="M10.5 10.5 14 14"/></svg></button>
      <button class="iconbtn" type="button" aria-label="Filter"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 4h12M4 8h8M6 12h4"/></svg></button>
      <span class="tip"><span class="bub" role="tooltip" id="tip1">Density (d)</span><button class="iconbtn" type="button" aria-describedby="tip1" aria-label="Density"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M3 8h10M3 12h10"/></svg></button></span>
      <span class="hint">34 × 34 px, 44 px on a phone</span></div>`,
    "<b>Use</b> where the icon is the whole action and the label is supplied by <code>aria-label</code>.",
    "The SVG is <code>aria-hidden</code>; the button carries the name; the tooltip is also reachable on focus, not only on hover."],
  ["Input", ".inp", `
    <div class="field"><label class="lb" for="d1">Email</label>
      <input class="inp" id="d1" type="email" placeholder="you@operator.example" aria-describedby="d1-help">
      <span class="help" id="d1-help">We only send the weekly sheet.</span></div>
    <div class="field"><label class="lb" for="d2">Depot code</label>
      <input class="inp" id="d2" value="DP-3" aria-invalid="true" aria-describedby="d2-err">
      <span class="err" id="d2-err">Depot code 3 was closed in March.</span></div>
    <div class="field"><label class="lb" for="d3">Read-only</label><input class="inp" id="d3" value="1 284 ln/min" readonly>
      <span class="help">Copy it; do not type into it.</span></div>
    <div class="field"><label class="lb" for="d4">Disabled</label><input class="inp" id="d4" disabled placeholder="unavailable"></div>`,
    "<b>Label above, never a placeholder as the label.</b> Help text is a fact; the error names the fix.",
    "<code>aria-invalid</code> plus <code>aria-describedby</code> to the message; the message is not colour-only (a word and an icon)."],
  ["Textarea", ".inp", `
    <div class="field"><label class="lb" for="d5">Note</label>
      <textarea class="inp" id="d5" maxlength="180" placeholder="What the recorder needs to know" aria-describedby="d5-count"></textarea>
      <span class="count" id="d5-count" aria-live="polite">0/180</span></div>`,
    "<b>Use</b> for prose with a hard limit; show the limit as a count, not a rule.",
    "The counter is a polite live region; <code>maxlength</code> is enforced in the DOM, not by a validation surprise."],
  ["Select", ".inp", `
    <div class="field"><label class="lb" for="d6">Compare range</label>
      <select class="inp" id="d6"><option>Previous day</option><option>Same day last week</option><option>7-day average</option></select></div>
    <div class="field"><label class="lb" for="d7">Many options</label>
      <select class="inp" id="d7"><optgroup label="North"><option>Depot 1 — Harbour</option><option>Depot 3 — Salt Quay</option></optgroup><optgroup label="South"><option>Depot 5 — North Gate</option></optgroup></select></div>`,
    "<b>Under ~7 options</b> a select; above that, a list with search. Group when the groups are real.",
    "Native control: keyboard, screen readers and mobile pickers come free. Never a div styled as a select."],
  ["Checkbox", ".check", `
    <div style="display:grid;gap:8px">
      <label class="check"><input type="checkbox" checked> Show peak sites only</label>
      <label class="check"><input type="checkbox"> Include the closed depots</label>
      <label class="check"><input type="checkbox" aria-invalid="true"> A required agreement</label></div>`,
    "<b>Independent switches</b>, not an either/or. A single checkbox is a statement being agreed to.",
    "The input and the label are one <code>&lt;label&gt;</code>; the checked state is a glyph plus the fill."],
  ["Radio", ".radio", `
    <fieldset style="border:0;padding:0;margin:0"><legend class="label">Night mode</legend>
      <div style="display:grid;gap:8px;margin-top:6px">
        <label class="radio"><input type="radio" name="r1" checked> Follow the sun</label>
        <label class="radio"><input type="radio" name="r1"> Always deck</label>
        <label class="radio"><input type="radio" name="r1"> Always paper</label></div></fieldset>`,
    "<b>Two to five mutually exclusive choices</b> where showing all of them helps.",
    "A real <code>fieldset</code> with a <code>legend</code>: the group is announced before the options."],
  ["Switch", ".switch", `
    <div style="display:grid;gap:9px;justify-items:start">
      <label class="switch"><input type="checkbox" role="switch" checked> Live tail</label>
      <label class="switch"><input type="checkbox" role="switch"> Dense tables</label>
      <label class="switch"><input type="checkbox" role="switch" disabled> Offline sync (unavailable)</label></div>`,
    "<b>An instant setting</b> with no save step. Anything that needs submitting is a checkbox.",
    "<code>role=switch</code> + <code>aria-checked</code> from the input; the label is the setting's name, not the state."],
  ["Slider", ".slider", `
    <div class="slider"><label class="lb" for="d8" style="font-size:13px;font-weight:600">Sampling window</label>
      <input id="d8" type="range" min="1" max="60" value="10" aria-describedby="d8-out"><div class="ends"><span>1 s</span><output id="d8-out" class="num" for="d8">10 s</output><span>60 s</span></div></div>`,
    "<b>Continuous values with an obvious range.</b> Discrete settings are a segmented control.",
    "The current value is an <code>&lt;output&gt;</code>, not only the thumb; the track is keyboard-operable by default."],
  ["Tabs", ".tabs", `
    <div class="tabs" role="tablist" aria-label="Demo tabs">
      <button role="tab" aria-selected="true" aria-controls="tp1" id="tb1" tabindex="0" type="button">Load</button>
      <button role="tab" aria-selected="false" aria-controls="tp2" id="tb2" tabindex="-1" type="button">State of charge</button>
      <button role="tab" aria-selected="false" aria-controls="tp3" id="tb3" tabindex="-1" type="button">Alerts</button></div>
    <div class="tabpanel" role="tabpanel" id="tp1" aria-labelledby="tb1">Night peak <b class="num">41.2 kW</b> over target.</div>
    <div class="tabpanel" role="tabpanel" id="tp2" aria-labelledby="tb2" hidden>Median state of charge <b class="num">62 %</b> at 06:12.</div>
    <div class="tabpanel" role="tabpanel" id="tp3" aria-labelledby="tb3" hidden><b>3</b> open alerts, one is red.</div>`,
    "<b>Same object, different views of it.</b> Never a wizard, never a filter.",
    "Full tab semantics: <code>role=tablist/tab/tabpanel</code>, <code>aria-selected</code>, <code>aria-controls</code>, roving <code>tabindex</code>, ← → keys."],
  ["Accordion", ".acc", `
    <div class="acc"><button class="t" type="button" aria-expanded="true" aria-controls="ap1">Which clocks are trusted? <i aria-hidden="true">+</i></button>
      <div class="p" id="ap1">Ledger time comes from the depot's NTP pair, not the browser.</div></div>
    <div class="acc"><button class="t" type="button" aria-expanded="false" aria-controls="ap2">Why is the 06:11 spike red? <i aria-hidden="true">+</i></button>
      <div class="p" id="ap2" hidden>Because it exceeds the depot's contracted peak, not the fleet's.</div></div>`,
    "<b>Answers to optional, scannable questions.</b> Never hide a primary action inside one.",
    "<code>aria-expanded</code> + <code>aria-controls</code> on a real button; the panel is <code>hidden</code>, not painted off-screen."],
  ["Menu", ".menu", `
    <div class="menu"><button class="btn ghost sm" type="button" id="mbtn" aria-haspopup="menu" aria-expanded="false" aria-controls="mlist">Row actions</button>
      <ul class="list" id="mlist" role="menu" aria-labelledby="mbtn" hidden>
        <li><button type="button" role="menuitem">Copy the row</button></li>
        <li><button type="button" role="menuitem">Filter to this depot</button></li>
        <li><button type="button" role="menuitem">Pin to the top</button></li>
        <li><div class="sep" role="separator"></div></li>
        <li><button type="button" role="menuitem" class="danger">Archive the depot</button></li></ul></div>`,
    "<b>Three or more actions on one object</b> where the labels cannot all be shown.",
    "<code>role=menu/menuitem</code>, <code>aria-expanded</code>, Escape closes, ↑ ↓ move, the trigger regains focus on close."],
  ["Table", ".tbl", `
    <table class="tbl"><caption>Depot night peak · click a header to sort</caption>
      <thead><tr><th scope="col">Depot</th><th scope="col">Load</th><th scope="col">kWh/km</th><th scope="col">State</th></tr></thead>
      <tbody><tr><td>Salt Quay</td><td class="num">412 kW</td><td class="num">1.42</td><td><span class="pill warn">over</span></td></tr>
        <tr><td>Harbour</td><td class="num">268 kW</td><td class="num">1.11</td><td><span class="pill ok">ok</span></td></tr>
        <tr><td>North Gate</td><td class="num">196 kW</td><td class="num">0.98</td><td><span class="pill">idle</span></td></tr></tbody></table>`,
    "<b>Rows are records; columns are fields.</b> Numbers are right-aligned in the mono role; state is a word.",
    "<code>caption</code> names the table, <code>scope=col</code>, header buttons carry <code>aria-sort</code>; on a phone the table becomes cards with the header names kept as data-labels (see task 02)."],
  ["Pills and tags", ".pill", `
    <div class="states"><span class="pill">neutral</span><span class="pill on">selected</span><span class="pill ok">ok</span>
      <span class="pill warn">queued</span><span class="pill danger">fault</span><span class="pill info">info</span>
      <button class="pill" type="button" aria-pressed="false">filter chip</button></div>`,
    "<b>State, not decoration.</b> If it is a button it toggles and says so; if it is a tag it does nothing.",
    "The role is carried by a word inside the pill, never by its colour alone."],
  ["Avatar", ".avatar", `
    <div class="states"><span class="avatar" aria-hidden="true">RK</span><span class="avatar lg" aria-hidden="true">AM</span>
      <span class="avatar stack"><span class="avatar" aria-hidden="true">JK</span><span class="avatar" aria-hidden="true">TQ</span><span class="avatar" aria-hidden="true">+7</span></span>
      <span class="hint">initials, never a photo of a person</span></div>`,
    "<b>Identity in a list</b> where names repeat. Initials only: no faces, no stock photography.",
    "The avatar is decorative; the person's name is in the row's text."],
  ["Progress", ".progress", `
    <div style="display:grid;gap:9px"><div class="progress" role="progressbar" aria-valuenow="62" aria-valuemin="0" aria-valuemax="100" aria-label="Upload"><i style="width:62%"></i></div>
      <div class="progress"><i style="width:34%;animation:sh 1.1s infinite alternate"></i></div>
      <div class="note">determinate 62 % · indeterminate (the bar has no known end)</div></div>`,
    "<b>A known duration</b> gets a number; an unknown one gets an indeterminate bar and a sentence.",
    "<code>role=progressbar</code> with <code>aria-valuenow</code> on the determinate one; the indeterminate bar has no fake value."],
  ["Skeleton", ".skel", `
    <div style="display:grid;gap:8px;max-width:320px"><div class="skel" style="height:12px;width:60%"></div>
      <div class="skel" style="height:34px"></div><div class="skel" style="height:12px;width:82%"></div></div>`,
    "<b>Only when the shape of the content is known.</b> Otherwise use a spinner with a sentence.",
    "Skeletons are <code>aria-hidden</code>; the loading state is announced once, by a live region, not by the shimmer."],
  ["Empty state", ".empty", `
    <div class="empty"><div class="g" aria-hidden="true">∅</div><b>No sightings in this window</b>
      <p>You left the phone in the car. The queue is empty and the map is downloaded.</p>
      <button class="btn sm" type="button">Log a sighting</button></div>`,
    "<b>Name what is missing and the cause</b>, then offer the one action that changes it.",
    "The empty state is a labelled region with a real button, not a shrug in grey text."],
  ["Breadcrumbs", ".crumbs", `
    <ol class="crumbs"><li><a href="#overview">Depots</a></li><li><a href="#overview">Salt Quay</a></li><li aria-current="page">Night peak</li></ol>`,
    "<b>Three levels deep or more.</b> Above two levels a back button is enough.",
    "An ordered list; the current page is <code>aria-current=page</code> and not a link."],
  ["Pagination", ".pager", `
    <div class="pager"><button type="button" disabled aria-label="Previous page">‹</button>
      <button type="button" aria-current="page">1</button><button type="button">2</button><button type="button">3</button>
      <span aria-hidden="true">…</span><button type="button">14</button><button type="button" aria-label="Next page">›</button>
      <span class="hint">68 rows</span></div>`,
    "<b>Pages you can quote.</b> A long scrolling list should scroll and count, not paginate.",
    "The current page is <code>aria-current</code>; the arrows have names; the count tells you what the pages are made of."],
  ["Toast", ".toast", `
    <div style="display:grid;gap:8px">
      <div class="toast"><span class="dot" aria-hidden="true"></span><span><b>Saved</b><span>3 records queued; they will send at the car park.</span></span></div>
      <div class="toast warn"><span class="dot" aria-hidden="true"></span><span><b>Offline</b><span>Records are kept on the phone.</span></span></div></div>`,
    "<b>A short, non-blocking fact after an action.</b> It never contains the only way forward.",
    "Posted into a <code>role=status</code> live region; dismissal is by timeout with a pause on focus/hover; the text is the message."],
  ["Alert", ".alert", `
    <div style="display:grid;gap:8px"><div class="alert"><span class="g" aria-hidden="true">i</span><span>Two depots report clock skew over 300 ms.</span></div>
      <div class="alert danger"><span class="g" aria-hidden="true">×</span><span>The export failed. Nothing was sent.</span></div></div>`,
    "<b>A condition the user did not cause.</b> Toasts follow actions; alerts describe the world.",
    "The dangerous one is <code>role=alert</code>; the informational one is static text, so it does not interrupt."],
  ["Tooltip", ".tip", `
    <div class="states"><span class="tip"><span class="bub" role="tooltip" id="tip2">Freeze the tail (f)</span><button class="btn ghost sm" type="button" aria-describedby="tip2">Hover or focus me</button></span>
      <span class="hint">tooltips never hold the only copy of a fact</span></div>`,
    "<b>A short label for a control whose icon is not obvious.</b> Never a paragraph, never a required instruction.",
    "<code>role=tooltip</code> wired with <code>aria-describedby</code>, shown on focus as well as hover, dismissed by Escape."],
  ["Dialog", ".modal", `
    <div><button class="btn sm" type="button" id="open-modal2">Open a dialog</button></div>
    <div class="note">Focus moves in, is trapped, returns to the trigger; Escape closes; the destructive action is last.</div>`,
    "<b>Two questions, one irreversible action, a blocking choice.</b> A page, not a dialog, for anything else.",
    "<code>role=dialog aria-modal=true</code>, labelled by its title, focus ring trapped inside, background inert."],
];
function renderKit() {
  $("#kit").innerHTML = KIT.map(([name, sel, demo, usage, a11y]) => `
    <div class="card spec"><div class="hd"><b>${name}</b><span class="grow"></span><span class="tag">${sel}</span></div>
      <div class="bd">${demo}
        <div class="usage"><span>${usage}</span><span><b>Accessibility</b> ${a11y}</span></div></div></div>`).join("");
  wireKit();
}
function wireKit() {
  /* tabs */
  $$(".tabs").forEach((tabs) => {
    const list = $$("[role=tab]", tabs);
    tabs.addEventListener("keydown", (e) => {
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      const n = e.key === "ArrowRight" ? (i + 1) % list.length : e.key === "ArrowLeft" ? (i - 1 + list.length) % list.length : -1;
      if (n < 0) return;
      e.preventDefault(); pick(n);
    });
    const pick = (n) => {
      list.forEach((t, i) => {
        t.setAttribute("aria-selected", String(i === n));
        t.tabIndex = i === n ? 0 : -1;
        const p = document.getElementById(t.getAttribute("aria-controls"));
        if (p) p.hidden = i !== n;
      });
      list[n].focus();
    };
    list.forEach((t, i) => t.addEventListener("click", () => pick(i)));
  });
  /* accordion */
  $$(".acc > .t").forEach((b) => b.addEventListener("click", () => {
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    const p = document.getElementById(b.getAttribute("aria-controls"));
    if (p) p.hidden = open;
  }));
  /* menu */
  $$(".menu").forEach((m) => {
    const btn = $(".btn", m), list = $(".list", m);
    const items = () => $$("[role=menuitem]", list);
    const close = (back) => { list.hidden = true; btn.setAttribute("aria-expanded", "false"); if (back) btn.focus(); };
    const open = () => { list.hidden = false; btn.setAttribute("aria-expanded", "true"); items()[0]?.focus(); };
    btn.addEventListener("click", () => (list.hidden ? open() : close(true)));
    m.addEventListener("keydown", (e) => {
      const it = items(), i = it.indexOf(document.activeElement);
      if (e.key === "Escape") close(true);
      if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) open(); else it[(i + 1) % it.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); if (!list.hidden) it[(i - 1 + it.length) % it.length].focus(); }
      if (e.key === "Tab" && !list.hidden) close(false);
    });
    m.addEventListener("focusout", (e) => { if (!list.hidden && !m.contains(e.relatedTarget)) close(false); });
    $$("[role=menuitem]", list).forEach((it) => it.addEventListener("click", () => close(true)));
  });
  /* slider output */
  $$('input[type=range]').forEach((r) => {
    const out = document.getElementById(r.getAttribute("aria-describedby"));
    const upd = () => { if (out) out.textContent = r.value + " s"; };
    r.addEventListener("input", upd); upd();
  });
  /* counters */
  $$("textarea[maxlength]").forEach((t) => {
    const out = document.getElementById(t.getAttribute("aria-describedby"));
    const upd = () => { if (out) out.textContent = `${t.value.length}/${t.maxLength}`; };
    t.addEventListener("input", upd); upd();
  });
  /* modal triggers inside the kit */
  $("#open-modal2")?.addEventListener("click", () => openModal({
    title: "Delete 412 records?",
    body: "These are the queued records from 16 October. They have not been sent. Deleting them cannot be undone, and the depot's night total will drop by 412 kWh.",
    confirm: "Delete 412 records", danger: true,
  }));
  /* toasts inside the kit */
  $$("#kit .toast").forEach(() => { /* demo toasts are static, by design */ });
}

/* ── modal ─────────────────────────────────────────────────────────── */
let lastFocus = null;
function openModal({ title, body, confirm, danger }) {
  const host = $("#modal-host");
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="md-t" aria-describedby="md-b">
    <div class="hd"><h3 id="md-t">${title}</h3></div>
    <div class="bd" id="md-b">${body}</div>
    <div class="ft"><button class="btn quiet" type="button" data-x>Cancel</button>
      <button class="btn ${danger ? "danger" : ""}" type="button" data-ok>${confirm}</button></div></div>`;
  host.appendChild(scrim);
  const box = $(".modal", scrim);
  lastFocus = document.activeElement;
  const focusables = () => $$("button", box);
  focusables()[0].focus();
  const off = (e) => {
    if (e.key === "Escape") done();
    if (e.key !== "Tab") return;
    const f = focusables(), i = f.indexOf(document.activeElement);
    const n = e.shiftKey ? (i - 1 + f.length) % f.length : (i + 1) % f.length;
    e.preventDefault(); f[n].focus();
  };
  const done = () => { document.removeEventListener("keydown", off, true); scrim.remove(); lastFocus?.focus(); };
  document.addEventListener("keydown", off, true);
  scrim.addEventListener("click", (e) => { if (e.target === scrim || e.target.hasAttribute("data-x")) done(); });
  $("[data-ok]", scrim).addEventListener("click", () => { done(); toast(danger ? "Deleted" : "Done", danger ? "412 records removed from the queue." : "Nothing was sent.", danger ? "danger" : "ok"); });
}
function toast(title, msg, kind = "ok") {
  const host = $("#toaster");
  const t = document.createElement("div");
  t.className = "toast" + (kind === "ok" ? "" : " " + kind);
  t.innerHTML = `<span class="dot" aria-hidden="true"></span><span><b>${title}</b><span>${msg}</span></span>`;
  host.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ── patterns ──────────────────────────────────────────────────────── */
const DEPOTS = [
  { name: "Salt Quay", load: 412, kwh: 1.42, state: "over", buses: 38 },
  { name: "Harbour", load: 268, kwh: 1.11, state: "ok", buses: 24 },
  { name: "North Gate", load: 196, kwh: 0.98, state: "idle", buses: 12 },
  { name: "Dry Dock", load: 341, kwh: 1.33, state: "over", buses: 30 },
  { name: "Ferry Road", load: 122, kwh: 0.87, state: "ok", buses: 9 },
  { name: "Mars Yard", load: 88, kwh: 0.74, state: "charging", buses: 7 },
];
let sortKey = "load", sortDir = -1;
function table() {
  const q = ($("#pat-search")?.value || "").trim().toLowerCase();
  const rows = DEPOTS.filter((d) => d.name.toLowerCase().includes(q)).sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * sortDir;
  });
  const body = $("#pat-body");
  body.innerHTML = rows.map((d) => `<tr><th scope="row" style="font-weight:600;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)">${d.name}</th>
    <td class="num">${d.load} kW</td><td class="num">${d.kwh.toFixed(2)}</td>
    <td><span class="pill ${d.state === "over" ? "warn" : d.state === "ok" ? "ok" : d.state === "charging" ? "info" : ""}">${d.state}</span></td>
    <td class="num">${d.buses}</td></tr>`).join("");
  $("#pat-empty").hidden = rows.length > 0;
  $("#pat-table").hidden = rows.length === 0;
  if (!rows.length) $("#pat-empty-q").textContent = `No depot name contains “${q}”.`;
  $("#pat-sortname").textContent = sortKey;
  $$("#pat-table th button").forEach((b) => {
    const th = b.closest("th"), on = b.dataset.key === sortKey;
    if (on) th.setAttribute("aria-sort", sortDir < 0 ? "descending" : "ascending"); else th.removeAttribute("aria-sort");
  });
  const shown = rows.length;
  const cc = $("#chip-count");
  if (cc) cc.textContent = `${$$("#chips .pill[aria-pressed=true]").length} filters · ${shown} of ${DEPOTS.length} depots`;
}
function patterns() {
  $("#pat-search")?.addEventListener("input", table);
  $$("#pat-table th button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.key === sortKey) sortDir = -sortDir; else { sortKey = b.dataset.key; sortDir = b.dataset.key === "name" ? 1 : -1; }
    table();
  }));
  $("#pat-clear")?.addEventListener("click", () => { $("#pat-search").value = ""; table(); $("#pat-search").focus(); });
  $("#pat-reset")?.addEventListener("click", () => {
    $$("#chips .pill").forEach((p) => p.setAttribute("aria-pressed", "false"));
    $("#pat-search").value = ""; table(); toast("Filters cleared", "All 9 depots are in view.");
  });
  $$("#chips .pill").forEach((p) => p.addEventListener("click", () => {
    p.setAttribute("aria-pressed", p.getAttribute("aria-pressed") === "true" ? "false" : "true");
    table();
  }));
  $$(".seg[aria-label=Range] button").forEach((b) => b.addEventListener("click", () => {
    $$(".seg[aria-label=Range] button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    table();
  }));
  $("#open-modal")?.addEventListener("click", () => openModal({
    title: "Delete 412 records?",
    body: "These are the queued records from 16 October. They have not been sent to the depot. Deleting them cannot be undone, and the night total drops by 412 kWh.",
    confirm: "Delete 412 records", danger: true,
  }));
  $("#toast-ok")?.addEventListener("click", () => toast("Saved", "3 records written to the depot log."));
  $("#toast-warn")?.addEventListener("click", () => toast("Queued", "Offline. 3 records will send at the car park.", "warn"));
  $("#toast-bad")?.addEventListener("click", () => toast("Failed", "The export did not run. Nothing was sent.", "danger"));
  form();
  table();
}
function form() {
  const f = $("#pat-form");
  if (!f) return;
  const rules = {
    email: (v) => (!v.trim() ? "A work email is needed to grant access." : !/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(v) ? "That is not an email address — check for a missing dot." : ""),
    site: (v) => (!v ? "Choose the depot you work at." : ""),
  };
  const check = (name, show = true) => {
    const el = f.elements[name];
    const msg = rules[name] ? rules[name](el.value) : "";
    const err = document.getElementById(`f-${name}-err`);
    if (err) { err.textContent = msg; err.hidden = !msg; }
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    if (!msg) el.removeAttribute("aria-invalid");
    el.setAttribute("aria-describedby", document.getElementById(`f-${name}-help`) ? `f-${name}-help f-${name}-err` : `f-${name}-err`);
    return { name, msg, el };
  };
  ["email", "site"].forEach((n) => {
    const el = f.elements[n];
    el.addEventListener("blur", () => check(n));
    el.addEventListener("input", () => { if (el.getAttribute("aria-invalid") === "true") check(n); });
  });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const bad = ["email", "site"].map((n) => check(n)).filter((r) => r.msg);
    const sum = $("#f-summary");
    if (bad.length) {
      sum.hidden = false;
      $("#f-summary-text").innerHTML = `<b>${bad.length} field${bad.length > 1 ? "s" : ""} need attention:</b> ` + bad.map((b) => b.msg).join(" ");
      bad[0].el.focus();
      return;
    }
    sum.hidden = true;
    const btn = $("#f-submit");
    btn.classList.add("busy"); btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-disabled", "true");
    setTimeout(() => { btn.classList.remove("busy"); btn.removeAttribute("aria-busy"); btn.removeAttribute("aria-disabled"); toast("Request sent", "The depot's operations lead approves access."); }, 1100);
  });
  f.addEventListener("reset", () => {
    ["email", "site"].forEach((n) => { const e = document.getElementById(`f-${n}-err`); if (e) e.hidden = true; f.elements[n].removeAttribute("aria-invalid"); });
    $("#f-summary").hidden = true;
  });
}

/* ── rules ─────────────────────────────────────────────────────────── */
const RULES = [
  ["Colour is never the only signal",
    `<span class="pill warn">over target</span> <span class="hint">a colour carrying the meaning</span>`,
    `<span class="pill warn">! over target</span> <span class="hint">the word carries it, the colour speeds it up</span>`],
  ["A control's label is its own",
    `<input class="inp" placeholder="Search" aria-label="Search"> <span class="hint">placeholder-only label: it disappears when it matters</span>`,
    `<div class="field" style="max-width:none"><label class="lb" for="rl">Search depots</label><input class="inp" id="rl" placeholder="name, code or note"></div>`],
  ["Focus is always visible",
    `<button class="btn" style="outline:none" type="button">This button has outline: none</button>`,
    `<button class="btn" type="button">Tab to me: a 2 px ring, 2 px offset, in --focus</button>`],
  ["Touch targets are 44 px on a phone",
    `<div class="states"><button class="btn sm" type="button">30 px</button><span class="hint">fine on a desk, a coin toss on a phone</span></div>`,
    `<button class="btn" type="button">36 px here, 44 px in the phone app</button>`],
  ["Numbers are tabular, always in the mono role",
    `<div class="lbl">1 l / 11 / 111 / 1 111</div><span class="hint">proportional figures: a column that shifts as it filters</span>`,
    `<div class="num">1 l / 11 / 111 / 1 111</div><span class="hint">tabular: the column holds its shape</span>`],
  ["A disabled control explains itself, a busy one says what it is doing",
    `<div class="states"><button class="btn" type="button" disabled>Submit</button><span class="hint">disabled and silent — why?</span></div>`,
    `<div class="states"><button class="btn busy" type="button" aria-busy="true">Submitting</button><span class="hint">busy</span>
      <button class="btn" type="button" aria-disabled="true">Submit</button><span class="hint">disabled + a sentence next to the field</span></div>`],
];
function rules() {
  $("#rules-list").innerHTML = RULES.map(([title, no, yes]) => `<div class="rule">
    <div class="no"><div class="k">Don't</div>${no}</div>
    <div class="yes"><div class="k">Do</div>${yes}</div>
    <div style="grid-column:1/-1;padding:0 14px 12px;font-size:13px;color:var(--ink-3)"><b style="color:var(--ink-2)">${title}</b></div>
  </div>`).join("");
}

/* ── the contract table ────────────────────────────────────────────── */
function tokens() {
  const body = $("#token-table tbody");
  const rows = CHECKS.map(([t, role, against, need]) => {
    const val = `rgb(${resolve(t).map(Math.round).join(", ")})`;
    const r = measured(t, against);
    const ok = r >= need;
    return `<tr><td class="v"><i style="background:var(${t})"></i>${t}</td><td>${role}</td><td class="v">${val}</td>
      <td>${against ? `<i style="background:var(${against})"></i>${against}` : "—"}</td>
      <td class="v" style="${ok ? "" : "color:var(--danger)"}">${r === null ? "—" : r.toFixed(2) + ":1"}</td>
      <td>${need}</td></tr>`;
  }).join("");
  body.innerHTML = rows;
  const fails = CHECKS.filter(([t, , against, need]) => measured(t, against) < need).length;
  $("#tok-theme").textContent = root.getAttribute("data-theme");
  $("#tok-pass").innerHTML = fails ? `<span style="color:var(--danger)">${fails} of ${CHECKS.length} under contract</span>` : `all ${CHECKS.length} checks pass`;
}

/* ── measure everything, on every theme change ─────────────────────── */
function measure() { swatches(); dataLegend(); typeset(); rulers(); motionLabels(); tokens(); }

/* the motion card prints the theme's own durations: a theme that changes motion
   changes these numbers, and nothing here is typed by hand */
function motionLabels() {
  const rows = [["#m1", "in", "--dur-2"], ["#m2", "out", "--dur-1"], ["#m3", "sheet", "--dur-3"], ["#m4", "page", "--dur-4"]];
  for (const [sel, name, tok] of rows) {
    const el = $(sel);
    if (el) el.textContent = name + " · " + (getComputedStyle(root).getPropertyValue(tok).trim() || "unset");
  }
  const t = $("#motion-theme");
  if (t) t.textContent = root.getAttribute("data-theme");
}

/* ── nav: current section ──────────────────────────────────────────── */
function nav() {
  const links = $$(".nav a[href^='#']");
  const secs = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
  const set = (id) => links.forEach((a) => {
    if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
  });
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => {
    const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (vis[0]) set(vis[0].target.id);
  }, { rootMargin: "-72px 0px -60% 0px", threshold: [0, 0.2, 0.6] });
  secs.forEach((s) => io.observe(s));
}

measure(); renderKit(); patterns(); rules(); tokens(); nav();
