// Ternmark: a nine-screen phone prototype in one page. The router is query-driven
// (?screen=log&step=2&state=offline) so the review board can embed each screen in an
// iframe, and the dev strip drives the same states.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

if (window.self !== window.top) document.body.classList.add("embedded");
if (new URLSearchParams(location.search).has("nobar")) $("#devbar").hidden = true;

/* ── content ───────────────────────────────────────────────────────── */
const bird = (d = "M8 24c5-1 8-4 13-4 4 0 6 2 8 4l6-2-8 7-4-2c-4 1-8 1-15-3z M21 20c4-7 11-9 16-8") =>
  `<svg viewBox="0 0 46 32" aria-hidden="true"><path d="${d}"/></svg>`;

const sightings = [
  { sp: "Wading warbler", n: 2, t: "07:20", place: "sluice pool", new: true, queue: true, d: "M8 24c5-1 8-4 13-4 4 0 6 2 8 4l6-2-8 7-4-2c-4 1-8 1-15-3z M21 20c4-7 11-9 16-8" },
  { sp: "Eurasian oystercatcher", n: 6, t: "06:51", place: "gate field", d: "M7 25c6 0 10-3 16-3 5 0 9 2 11 5l8-3-10 8-5-3c-5 0-10 1-20-4z" },
  { sp: "Redshank", n: 4, t: "06:51", place: "gate field", d: "M9 24c5-1 9-4 14-4 4 0 7 2 9 5l6-2-9 7-4-2c-4 0-9 1-16-4z M14 25l-2 5" },
  { sp: "Lapwing", n: 12, t: "06:47", place: "gate field", d: "M8 25c7-1 11-4 16-4 4 0 7 2 9 4l7-3-10 8-4-2c-5 0-10 1-18-3z M20 21c2-6 6-9 12-10" },
  { sp: "Cetti's warbler", n: 1, t: "06:33", place: "alder carr hide", d: "M10 26c6 0 9-3 13-3 4 0 7 2 9 4l5-2-7 6-4-1c-4 0-8 1-16-4z" },
  { sp: "Robin", n: 3, t: "06:33", place: "alder carr hide", d: "M12 26c5 0 8-3 12-3 3 0 6 2 8 4l4-2-6 6-4-1c-3 0-7 1-14-4z" },
  { sp: "Wren", n: 2, t: "06:31", place: "car park hedge", d: "M13 27c5 0 8-3 12-3 3 0 5 2 7 4l4-3-5 7-4-1c-3 0-7 1-14-4z M25 25c4-8 8-10 12-10" },
];

const suggest = [
  { sp: "Wading warbler", pct: 91, why: "white rump in both frames · bill shape · your patch in April" },
  { sp: "Marsh warbler", pct: 44, why: "same shape, but no white rump and the bill is heavier", low: true },
  { sp: "Lanceolated warbler", pct: 21, why: "shorter tail, and it is a migrant of the saltmarsh", low: true },
  { sp: "Common reed warbler", pct: 9, why: "the note rules it out: no plain brown bird", low: true },
].map((s) => ({ ...s, d: bird() }));

const list = [
  { fam: "Waders", rows: [
    { sp: "Pied avocet", n: 9, last: "12 Apr", rare: true }, { sp: "Eurasian oystercatcher", n: 41, last: "today" },
    { sp: "Redshank", n: 62, last: "today" }, { sp: "Lapwing", n: 34, last: "today" },
    { sp: "Black-tailed godwit", n: 3, last: "2 Mar", rare: true }, { sp: "Little ringed plover", n: 11, last: "28 Feb" },
    { sp: "Curlew", n: 4, last: "11 Jan", rare: true, notseen: false } ] },
  { fam: "Warblers and allies", rows: [
    { sp: "Wading warbler", n: 2, last: "today", added: true }, { sp: "Cetti's warbler", n: 27, last: "today" },
    { sp: "Whitethroat", n: 18, last: "today" }, { sp: "Reed warbler", n: 22, last: "9 Apr" },
    { sp: "Sedge warbler", n: 7, last: "5 Apr" }, { sp: "Marsh warbler", n: 1, last: "21 May 2023", rare: true } ] },
  { fam: "Raptors", rows: [
    { sp: "Western marsh harrier", n: 6, last: "6 Apr", rare: true }, { sp: "Kestrel", n: 19, last: "3 Apr" },
    { sp: "Hobby", n: 5, last: "28 Mar" }, { sp: "Red kite", n: 14, last: "22 Mar" } ] },
  { fam: "Ducks and geese", rows: [
    { sp: "Shoveler", n: 24, last: "10 Apr" }, { sp: "Teal", n: 31, last: "2 Apr" },
    { sp: "Gadwall", n: 12, last: "28 Mar" }, { sp: "Pink-footed goose", n: 6, last: "19 Feb", rare: true } ] },
  { fam: "Laridae and alcids", rows: [
    { sp: "Black-headed gull", n: 88, last: "today" }, { sp: "Common tern", n: 4, last: "2 Aug 2023", rare: true },
    { sp: "Little tern", n: 1, last: "18 Jul 2021", rare: true } ] },
];

/* ── renderers ────────────────────────────────────────────────────── */
function renderToday(state) {
  const ul = $("#todayRows");
  if (state === "empty") { ul.hidden = true; $("#emptyToday").hidden = false; return; }
  ul.hidden = false; $("#emptyToday").hidden = true;
  if (state === "loading") {
    ul.innerHTML = `<li class="skel"><i></i><i></i><i></i></li>`.repeat(4);
    return;
  }
  ul.innerHTML = sightings.map((s) => `<li data-open-detail tabindex="0" role="button"
      aria-label="${s.sp}, ${s.n} birds at ${s.place}, ${s.t}">
    <span class="th">${bird(s.d)}</span>
    <span class="who"><b>${s.sp}</b><small>${s.t} · ${s.place}</small></span>
    <span style="display:flex;align-items:center;gap:8px">${s.new ? '<span class="new">new</span>' : ""}
      ${s.queue ? '<span class="queue" title="queued for sync"></span>' : ""}<span class="qty">${s.n}</span></span>
  </li>`).join("");
  $$("li[data-open-detail]", ul).forEach((li) => li.addEventListener("click", () => show("detail")));
}

function renderBanners(state) {
  const b = $("#bannerToday");
  if (state === "offline") {
    b.hidden = false;
    b.innerHTML = `<span class="b-ico"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3l14 14M7.6 8.3A6 6 0 0 1 16 6M4.2 6.2A9 9 0 0 0 2 8.5M17.6 9.6a9 9 0 0 0-2-1.8M10 13.5a3 3 0 0 1 2.4-1.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>
      <p><b>Offline for 3 h 12 m.</b> 1 sighting is queued and will sync when you reach
        signal. The marsh map is on the phone, so the map and your list still work.</p>`;
  } else if (state === "denied") {
    b.hidden = false;
    b.innerHTML = `<span class="b-ico"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17s-6-4.6-6-9.6A6 6 0 0 1 16 7.4c0 5-6 9.6-6 9.6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 4l12 12" stroke="currentColor" stroke-width="1.6"/></svg></span>
      <p><b>No location permission.</b> Sightings are saved without a place, and maps are
        blank. Tap <b>Allow while logging</b> in Settings, or tap the patch in by hand.</p>`;
  } else b.hidden = true;
  document.title = state === "offline" ? "Ternmark — offline state" : document.title;
}

function renderSuggest() {
  $("#suggest").innerHTML = suggest.map((s, i) => `<li role="button" tabindex="0" aria-pressed="${i === 0}">
    <span class="th">${s.d}</span>
    <span class="who"><b>${s.sp}</b><small>${s.why}</small></span>
    <span class="pct ${s.low ? "low" : ""}">${s.pct} %</span></li>`).join("");
  const pick = (li) => {
    for (const o of $$("#suggest li")) o.setAttribute("aria-pressed", "false");
    li.setAttribute("aria-pressed", "true");
    const sp = li.querySelector("b").textContent, pct = li.querySelector(".pct").textContent;
    const btn = $("#useSpecies");
    btn.innerHTML = `Use ${sp}<small>${pct} · photo match</small>`;
    btn.disabled = false;
  };
  for (const li of $$("#suggest li")) li.addEventListener("click", () => pick(li));
  // the top candidate is pre-selected, so "use it" is already armed
  const first = $("#suggest li");
  if (first) {
    const btn = $("#useSpecies");
    btn.innerHTML = `Use ${suggest[0].sp}<small>${suggest[0].pct} % · photo match</small>`;
    btn.disabled = false;
  }
}

let listSort = "recent";
function renderList() {
  const q = $("#listSearch").value.trim().toLowerCase();
  const fam = $(".quick [aria-pressed=true]").textContent.trim().toLowerCase();
  const body = $("#listBody");
  const groups = list
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !q || (r.sp + " " + g.fam).toLowerCase().includes(q)) }))
    .filter((g) => (fam === "all" || g.fam.toLowerCase() === fam || g.fam.toLowerCase().includes(fam)) && g.rows.length);
  if (listSort === "alpha") groups.forEach((g) => g.rows.sort((a, b) => a.sp.localeCompare(b.sp)));
  if (!groups.length) {
    body.innerHTML = `<div class="empty"><svg viewBox="0 0 120 90" aria-hidden="true">
        <circle cx="52" cy="40" r="22" class="ln"/><path d="M68 56 92 78" class="ln"/><path d="M14 84h92" class="ground"/></svg>
        <h2>Nothing called &ldquo;${q}&rdquo; here</h2><p>Check the spelling, search a family
        (waders, warblers), or search a patch name.</p></div>`;
    return;
  }
  body.innerHTML = groups.map((g) => `<div class="grp"><h3>${g.fam}</h3><ul>${g.rows.map((r) => `
    <li class="${r.added ? "added" : ""} ${r.notseen ? "notseen" : ""}">
      ${r.rare ? '<span class="mark" title="rare in the county"></span>' : '<span style="width:7px"></span>'}
      <span>${r.sp}</span><span class="seen">${r.last}</span><span class="n">${r.n}</span></li>`).join("")}</ul></div>`).join("");
}

/* ── router ───────────────────────────────────────────────────────── */
const SCREENS = ["today", "list", "trip", "detail", "onboard"];
function show(name) {
  const on = SCREENS.includes(name) ? name : "today";
  $$(".screen").forEach((s) => s.classList.toggle("is-on", s.id === "s-" + on));
  document.body.classList.toggle("tab-off", on === "detail" || on === "onboard");
  $$(".tabbar a[data-goto]").forEach((a) => {
    if (a.dataset.goto === on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const el = $("#s-" + on);
  el.querySelector(".scroll")?.scrollTo(0, 0);
  el.focus({ preventScroll: true });
}

$$("[data-goto]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  show(a.dataset.goto);
  history.replaceState(null, "", "#s-" + a.dataset.goto);
}));

/* ── the log sheet ────────────────────────────────────────────────── */
const sheet = $("#sheet");
const setStep = (n) => {
  sheet.dataset.step = String(n);
  $("#stepLabel").textContent = `step ${n} of 3 · ${["capture", "identify", "count and place"][n - 1]}`;
  $("#sheetTitle").textContent = ["What did you see?", "Which bird is it?", "How many, where?"][n - 1];
  $$(".steps i").forEach((i, k) => i.classList.toggle("on", k < n));
  sheet.querySelector(".step[data-step='" + n + "']").scrollIntoView({ block: "start" });
  $("#sheetBack").disabled = n === 1;
  $("#sheetBack").setAttribute("aria-hidden", String(n === 1));
};
const openSheet = (step = 1) => { setStep(step); sheet.classList.add("is-open"); sheet.setAttribute("aria-hidden", "false"); $("#sheetClose").focus(); };
const closeSheet = () => {
  sheet.classList.remove("is-open"); sheet.setAttribute("aria-hidden", "true");
  show("today"); $("#fab").focus();
};
$("#fab").addEventListener("click", (e) => { e.preventDefault(); openSheet(1); });
$("#sheetClose").addEventListener("click", closeSheet);
$("#sheetBack").addEventListener("click", () => setStep(Math.max(1, +sheet.dataset.step - 1)));
$$(".sheet [data-next]").forEach((b) => b.addEventListener("click", () => setStep(Math.min(3, +sheet.dataset.step + 1))));
$("#notThis").addEventListener("click", () => toast("None of these: the record goes to a human reviewer at the county office"));
$("#heardOnly").addEventListener("click", () => toast("Saved as a call record, outside the count"));
$$(".stepper .count button").forEach((b) => b.addEventListener("click", () => {
  const el = $("#countVal");
  const v = +el.textContent + (b.textContent.trim() === "+" ? 1 : -1);
  el.textContent = String(Math.max(1, v));
}));
$("#saveSighting").addEventListener("click", () => {
  closeSheet();
  toast("Wading warbler (2) saved. Queued — you have no signal.");
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet.classList.contains("is-open")) closeSheet(); });

let toastT;
function toast(msg) {
  const t = $("#toast");
  $("#toastText").textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 3200);
}
$$("[data-promote]").forEach((b) => b.addEventListener("click", () => { openSheet(2); toast("The 4 s recording is attached to the new sighting"); }));

/* ── life list controls ──────────────────────────────────────────── */
$("#listSearch").addEventListener("input", renderList);
$("#sortList").addEventListener("click", (e) => {
  listSort = listSort === "recent" ? "alpha" : "recent";
  e.currentTarget.textContent = "sort: " + listSort;
  renderList();
});
$$(".quick button").forEach((b) => b.addEventListener("click", () => {
  $$(".quick button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  renderList();
}));

/* ── states ───────────────────────────────────────────────────────── */
function setState(state) {
  $$("#devbar button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.state === state)));
  renderToday(state);
  renderBanners(state);
}
$$("#devbar button").forEach((b) => b.addEventListener("click", () => { setState(b.dataset.state); history.replaceState(null, "", `?screen=today&state=${b.dataset.state}`); }));
$("#allowLoc")?.addEventListener("click", () => { show("today"); setState("normal"); toast("Location is used while logging only. The marsh map is on the phone."); });

/* ── boot from the query string ──────────────────────────────────── */
const q = new URLSearchParams(location.search);
const screen = q.get("screen") || "today";
setState(q.get("state") || "normal");
renderSuggest();
renderList();
show(screen === "log" ? "today" : screen);
if (screen === "log") openSheet(+(q.get("step") || 1));
if (q.get("state") === "empty") show("today");
