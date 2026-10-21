import { ICONS, iconSvg as svgIcon } from "./icons.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const NAME = new Map(ICONS.map(([n, k, parts, drop]) => [n, { key: k, parts, drop }]));

const mark = (reduced = false) => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#m-mark-${reduced ? "reduced" : "glyph"}" width="48" height="48"/></svg>`;

/* every <span class="ic" data-ic="…"> in the markup */
function paintIcons(root = document) {
  for (const el of $$(".ic[data-ic]", root)) {
    const size = el.dataset.size ? +el.dataset.size : 24;
    el.innerHTML = svgIcon(el.dataset.ic, size);
  }
}

/* 03 · the size ladder, at 1:1 */
function ladder() {
  const sizes = [256, 96, 48, 32, 24, 16];
  $("#ladder").innerHTML = sizes.map((s) => `
    <div class="rung"><div class="box">${mark(s <= 16)}</div>
      <div class="cap"><b>${s} px</b>${s <= 16 ? "reduced" : s <= 32 ? "small" : s <= 96 ? "ui" : "display"}</div></div>`)
    .join("");
}

/* 04 · one colour */
function bits() {
  const ringSun = `<svg viewBox="0 0 48 48" class="sun-ring" aria-hidden="true">
      <path d="M7.7 33.6A18 18 0 1 1 40.3 33.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M2.4 30h43.2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M24 4.6 24 24" transform="rotate(15 24 24)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <circle cx="24" cy="30" r="5.4"/>
    </svg>`;
  const items = [
    ["ink", "On paper", "the default"],
    ["navy", "On sea", "workwear, hull"],
    ["onink", "On ink", "night chart"],
    ["brass", "Etched", "brass plate, 60 mm"],
    ["mono1", "1-bit", "screen print, 300 mm"],
    ["mono0", "1-bit", "stencil, 20 mm"],
    ["tint", "One tint", "form, stamp, seal"],
  ];
  $("#bits").innerHTML = items.map(([cls, b, cap]) =>
    `<div class="bit ${cls}">${cls === "mono0" || cls === "mono1" ? ringSun : mark()}<div class="cap"><b>${b}</b>${cap}</div></div>`)
    .join("") +
    `<div class="bit ink">${ringSun}<div class="cap"><b>Embroidery</b>sun becomes a ring: a solid dot fills in at 3 mm</div></div>`;
}

/* 05 · keylines with the grid on */
function keylines() {
  const grid = `<svg class="g" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 0v24M4 0v24M6 0v24M8 0v24M10 0v24M12 0v24M14 0v24M16 0v24M18 0v24M20 0v24M22 0v24M0 2h24M0 4h24M0 6h24M0 8h24M0 10h24M0 12h24M0 14h24M0 16h24M0 18h24M0 20h24M0 22h24M0 0h24M0 24h24M0 0v24M24 0v24"/>
    </svg>`;
  const show = ["compass", "tide"];
  $("#keylines").innerHTML = show.map((n) => `<div class="kl">${grid}
    <div class="live"></div>${svgIcon(n, 132, false)}<span class="lab">${n} · 24 box</span></div>`).join("") +
    `<div class="rule" style="max-width:34ch">The dashed square is the 20 px live area: nothing
      essential crosses it, and nothing stops short of it. The compass rose is drawn 0.25 px tall
      over centre — a true 24 circle reads small in a 24 box, and the eye, not the ruler, decides.</div>`;
}

/* 06 · the wall and the size rows */
function wall() {
  $("#wall").innerHTML = ICONS.map(([n, key]) =>
    `<div class="cell">${svgIcon(n, 24)}<span class="nm">${n}</span><span class="key">${key}</span></div>`).join("");
  const picks = ["compass", "chart", "tide", "waypoint", "search", "settings", "warning", "account"];
  $("#sizes").innerHTML =
    `<div class="r hd"><span class="nm">glyph</span><span class="hd">24 · 1.5</span><span class="hd">20 · 1.5</span><span class="hd">16 · 1.25</span><span class="hd">16 shrunk (wrong)</span></div>` +
    picks.map((n) => `<div class="r"><span class="nm">${n}</span>
      <span class="c">${svgIcon(n, 24)}</span><span class="c">${svgIcon(n, 20)}</span>
      <span class="c">${svgIcon(n, 16, true)}</span>
      <span class="c" style="opacity:.75">${svgIcon(n, 16, false)}</span></div>`).join("");
}

/* 07 · in use */
function inUse() {
  const tools = [["chart", "Chart", true], ["soundings", "Soundings", false], ["tide", "Tide", false],
    ["waypoint", "Pin", false], ["measure", "Measure", false], ["layers", "Layers", true],
    ["download", "Offline", false], ["share", "Share", false], ["settings", "Tools", false]];
  $("#toolbar").innerHTML = tools.map(([ic, lb, on]) =>
    `<button class="tb" type="button" aria-pressed="${on}" data-tool="${lb}">
      <span class="ic" data-ic="${ic}" data-size="18"></span><span class="lb">${lb}</span></button>`).join("");
  $("#toolbar").addEventListener("click", (e) => {
    const b = e.target.closest(".tb"); if (!b) return;
    b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
    $("#toolStatus").innerHTML = `${b.dataset.tool} · <span class="mono">${b.getAttribute("aria-pressed") === "true" ? "on" : "off"}</span> — 40 m`;
  });

  const charts = [
    ["chart", "Chart 214", "Porthcadew to Brest", "1:18 000", "ed. 41"],
    ["tide", "Tide tables", "Porthcadew · HW +0120", "90 d", ""],
    ["warning", "Notices to mariners", "2 new in this sheet", "weekly", "new"],
    ["layers", "Raster underlay", "Satellite, 2 m", "offline", ""],
    ["waypoint", "Pins on this sheet", "17 pins, 3 routes", "synced", ""],
  ];
  $("#chartlist").innerHTML = charts.map(([ic, t, s, r, tag]) => `<li>
    <span class="ic" data-ic="${ic}" data-size="20"></span>
    <span><span class="t">${t}</span><br><span class="s">${s}</span></span>
    <span class="r">${r}${tag ? ` <span class="pill new">${tag}</span>` : ""}</span></li>`).join("");

  const apps = [[64, ""], [48, ""], [32, ""], [48, "dark"]];
  $("#apps").innerHTML = apps.map(([s, v]) =>
    `<div class="app a${s} ${v}"><div class="tile">${mark()}</div><div class="cap">${s} px${v ? " · sea" : ""}</div></div>`).join("");
}

/* 08 · misuse, shown as the mark with one crime done to it */
function misuse() {
  const rows = [
    ["", "st-stretch", "Stretched", "The ring becomes an egg. The mark is a square: scale both axes, never one."],
    ["", "st-rotate", "Rotated", "The horizon is the horizon. A tilted horizon is a boat in a storm, not a logo."],
    ["crowd", "", "Crowded", "Text inside the clear space. One sun-diameter, measured from the ring."],
    ["", "st-shadow", "Decorated", "A drop shadow in the signal red. The mark has two strokes and one dot; it needs no help."],
    ["", "st-thin", "Thinned", "Stroke 1.1 at 54 px: the ring dies at 16 px. The weight is part of the drawing."],
    ["sun", "", "Recoloured", "The sun in sea blue. Red is the signal: one dot, one meaning, never a decoration."],
  ];
  $("#misuse-grid").innerHTML = rows.map(([kind, cls, b, cap]) => {
    const good = mark();
    let bad = mark();
    if (cls) bad = bad.replace("<svg ", `<svg class="${cls}" `);
    if (kind === "sun") bad = bad.replace("<svg ", '<svg class="fill-sun" ');
    return `<div class="mis"><div class="stage">
        <span class="ok">${good}</span>
        ${kind === "crowd"
          ? `<span class="st-crowd">${mark()}</span><span class="crowd-word">Meridian</span><span class="crowd-rule" aria-hidden="true"></span>`
          : `<span>${bad}</span>`}
      </div><div class="cap"><b class="no">Don't · ${b}</b>${cap}</div></div>`;
  }).join("");
}

/* nav: the current section */
function nav() {
  const links = $$(".nav a[href^='#']");
  const secs = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => {
    const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!vis[0]) return;
    links.forEach((a) => a.getAttribute("href") === "#" + vis[0].target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"));
  }, { rootMargin: "-70px 0px -62% 0px", threshold: [0, .2, .6] });
  secs.forEach((s) => io.observe(s));
}

paintIcons();
ladder(); bits(); keylines(); wall(); inUse(); misuse(); nav();
