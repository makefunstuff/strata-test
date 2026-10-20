/* Six figures, one unit toggle, one numbers toggle, and four small counter-examples.
   Every table is built from the same array as the marks it belongs to, so the number
   a reader hears and the pixel a reader sees cannot drift apart. */
import { springs, trend, fitAcrossDatum, stormYears, peakYear, season, FLOOD_LINE, months, bands, stacked, towns, calendar, calStats } from "./data.js";
import { drawClaim, drawGauges, drawBoxes, drawStack, drawSlope, drawCalendar, tableFor, setUnit, el, txt, sc, ticks, ln } from "./charts.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FT = 3.28084;
const r2 = (v) => +v.toFixed(2);
const inFeet = () => document.body.dataset.unit === "ft";
const cv = (v) => (v == null ? null : (inFeet() ? r2(v * FT) : v));

/* data, converted for display; the source arrays are never mutated */
const claimData = () => springs.map((d) => ({ ...d, level: cv(d.level) }));
const seasonData = () => season.map((g) => ({ ...g, series: g.series.map((p) => ({ ...p, level: cv(p.level) })), peak: { ...g.peak, level: cv(g.peak.level) } }));
const boxData = () => months.map((m) => ({ ...m, points: m.points.map(cv), lo: cv(m.lo), q1: cv(m.q1), med: cv(m.med), q3: cv(m.q3), hi: cv(m.hi), min: cv(m.min), max: cv(m.max) }));
const slopeData = () => towns.map((t) => ({ ...t, then: cv(t.then), now: cv(t.now), rise: cv(t.rise) }));
const calData = () => calendar.map((d) => ({ ...d, level: cv(d.level) }));
const calStatData = () => ({ ...calStats, max: cv(calStats.max), med: cv(calStats.med) });
const trendData = () => ({ ...trend, b: inFeet() ? trend.b * FT : trend.b });
const line = () => (inFeet() ? r2(FLOOD_LINE * FT) : FLOOD_LINE);
const fmtLevel = (v) => cv(v) + (inFeet() ? " ft" : " m");
/* the bands are heights: in feet they are re-labelled, not re-measured */
const bandKeys = () => (inFeet() ? ["0-1.6", "1.6-3.3", "3.3-4.9", "4.9+"] : bands.keys);

const hosts = { claim: "#claim", gauges: "#gauges", boxes: "#boxes", stack: "#stack", slope: "#slope", calendar: "#calendar" };
const cleared = (sel) => { const h = $(sel); h.innerHTML = ""; return h; };

function tables() {
  const u = inFeet() ? "ft" : "m";
  const T = (sel, rows, cols) => tableFor($(sel), rows, cols);
  T('[data-table="claim"]', claimData().map((d) => ({ Year: d.year, [u]: d.level, Datum: d.datum, storm: d.spike ? "storm year" : "" })), ["Year", u, "Datum", "storm"]);
  T('[data-table="gauges"]', seasonData().map((g) => ({ Gauge: g.name, Code: g.code, [`Peak ${u}`]: g.peak ? g.peak.level : "no record", "Peak date": g.peak ? g.peak.date : "—", "Days over the line": g.series.filter((p) => p.level != null && p.level >= line()).length, "Days with no record": g.series.filter((p) => p.level == null).length })),
    ["Gauge", "Code", `Peak ${u}`, "Peak date", "Days over the line", "Days with no record"]);
  T('[data-table="boxes"]', boxData().map((m) => ({ Month: m.name, n: m.n, [`min ${u}`]: m.min, [`low ${u}`]: m.lo, [`q1 ${u}`]: m.q1, [`median ${u}`]: m.med, [`q3 ${u}`]: m.q3, [`high ${u}`]: m.hi, [`max ${u}`]: m.max })),
    ["Month", "n", `min ${u}`, `low ${u}`, `q1 ${u}`, `median ${u}`, `q3 ${u}`, `high ${u}`, `max ${u}`]);
  T('[data-table="stack"]', stacked.map((s) => { const o = { Month: s.name }; bandKeys().forEach((k, i) => { o[`${k} ${u}`] = s.values[i]; }); o["total h"] = s.total; return o; }),
    ["Month", ...bandKeys().map((k) => `${k} ${u}`), "total h"]);
  T('[data-table="slope"]', slopeData().map((t) => ({ Place: t.name, ["1994 " + u]: t.then, ["2024 " + u]: t.now, ["rise " + u]: t.rise, population: t.pop })),
    ["Place", "1994 " + u, "2024 " + u, "rise " + u, "population"]);
  T('[data-table="calendar"]', calStats.byMonth.map((m) => ({ Month: m.name, days: m.n, ["over the line"]: m.over })), ["Month", "days", "over the line"]);
}

function drawAll() {
  const u = inFeet() ? "ft" : "m";
  setUnit(u, inFeet() ? "feet" : "metres");
  drawClaim(cleared(hosts.claim), claimData(), trendData());
  drawGauges(cleared(hosts.gauges), seasonData(), line());
  drawBoxes(cleared(hosts.boxes), boxData(), line());
  drawStack(cleared(hosts.stack), stacked, bandKeys(), PALETTE_BANDS);
  drawSlope(cleared(hosts.slope), slopeData());
  drawCalendar(cleared(hosts.calendar), calData(), line(), calStatData());
  tables();
  $("#unit-note").textContent = inFeet() ? "feet above CD" : "metres above CD";
  const cm = (b) => (inFeet() ? Math.round(b * 120) + " in" : Math.round(b * 1000) + " cm");
  $("#coRise").textContent = "+" + cm(trend.b);
  $("#coAll").textContent = (inFeet() ? (fitAcrossDatum.b * 120).toFixed(1) : (fitAcrossDatum.b * 1000).toFixed(1));
  $("#coStep").textContent = "−" + (inFeet() ? Math.round(0.28 * FT * 12) + " in" : "28 cm");
  $("#coPeakYear").textContent = peakYear.year;
  $("#coPeakLevel").textContent = fmtLevel(peakYear.level);
  $("#coStorm").textContent = stormYears;
  $("#coYears").textContent = springs.length;
}
const PALETTE_BANDS = ["#cfe0e6", "#8fbcc7", "#3f8b9b", "#0b6b78"];

/* ── four ways this page could have lied ─────────────────────────────────── */
function lies() {
  const host = $("#lied");
  host.innerHTML = "";
  const mk = (title, why) => {
    const box = document.createElement("div");
    box.className = "lie";
    const svg = el("svg", { viewBox: "0 0 220 96", role: "img", "aria-label": `${title}: ${why}` });
    box.appendChild(svg);
    const h = document.createElement("p");
    h.className = "lie-lab"; h.textContent = title;
    const p = document.createElement("p"); p.textContent = why;
    box.appendChild(h); box.appendChild(p);
    host.appendChild(box);
    return svg;
  };

  // 1 · bars with a baseline at the series minimum
  {
    const s = springs;
    const svg = mk("Bars that start at the minimum", "The same 31 years as section 01, drawn as bars from 3.4 m. The baseline is the data's floor, not zero, so 31 cm of rise reads as a wall.");
    const y = sc(3.4, 4.9, 76, 4), x = sc(0, s.length - 1, 6, 214);
    for (const t of ticks([3.4, 4.9], 3)) { el(svg, "line", { x1: 6, x2: 214, y1: y(t), y2: y(t), stroke: "#d9d3c7" }); txt(svg, 8, y(t) + 3, t, { class: "tick", "text-anchor": "start" }); }
    s.forEach((d, i) => el(svg, "rect", { x: x(i) + 0.5, width: (208 / s.length) - 1, y: y(d.level), height: 80 - y(d.level), fill: "#c8402f", opacity: .85 }));
  }
  // 2 · a pie of a time series
  {
    const svg = mk("A pie chart of a time series", "Thirty-one years sliced into wedges: the order is the argument, and a pie destroys it. Angles and colours do a job that years and numbers should do.");
    const cx = 46, cy = 48, r = 34, cols = ["#0b6b78", "#c8402f", "#e0a338", "#3a5f8a", "#8a6f3f", "#20857a"];
    const vals = springs.map((d) => d.level - 3.4);
    const tot = vals.reduce((a, b) => a + b, 0);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / tot) * Math.PI * 2;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      el(svg, "path", { d: `M${cx},${cy}L${(cx + r * Math.cos(a0)).toFixed(1)},${(cy + r * Math.sin(a0)).toFixed(1)}A${r},${r} 0 ${big},1 ${(cx + r * Math.cos(a1)).toFixed(1)},${(cy + r * Math.sin(a1)).toFixed(1)}Z`, fill: cols[i % cols.length], stroke: "#f7f4ee", "stroke-width": 1 });
      a0 = a1;
    });
    const lg = el(svg, "g", { transform: "translate(96,16)" });
    springs.slice(0, 6).forEach((d, i) => {
      el(lg, "rect", { x: 0, y: i * 12, width: 8, height: 8, fill: cols[i] });
      txt(lg, 12, i * 12 + 7, `${d.year} ${(v => v)(d.level)}`, { class: "tick" });
    });
    txt(lg, 0, 84, "…25 more slices", { class: "tick" });
  }
  // 3 · twin axes
  {
    const svg = mk("Two axes, chosen to agree", "Sea level on the left axis, oystercatcher counts on the right. Both axes are stretched to the same height, so the two lines cross in the middle and look like one story.");
    const a = springs.map((d) => d.level), b = springs.map((d, i) => 320 - i * 4.1 + Math.sin(i) * 22);
    const ya = sc(Math.min(...a) - .1, Math.max(...a) + .1, 76, 6), yb = sc(Math.min(...b) - 8, Math.max(...b) + 8, 76, 6);
    el(svg, "line", { x1: 18, x2: 200, y1: 80, y2: 80, stroke: "#c3bcae" });
    el(svg, "path", { d: ln(a.map((v, i) => [18 + i * (182 / (a.length - 1)), ya(v)])), fill: "none", stroke: "#0b6b78", "stroke-width": 1.8 });
    el(svg, "path", { d: ln(b.map((v, i) => [18 + i * (182 / (b.length - 1)), yb(v)])), fill: "none", stroke: "#c8402f", "stroke-width": 1.8, "stroke-dasharray": "4 3" });
    txt(svg, 2, 10, "4.9", { class: "tick" }); txt(svg, 2, 76, "3.4", { class: "tick" });
    txt(svg, 218, 10, "340", { class: "tick", "text-anchor": "end" }); txt(svg, 218, 76, "190", { class: "tick", "text-anchor": "end" });
  }
  // 4 · a rainbow, an arrow, and no units
  {
    const svg = mk("A rainbow, an arrow, and no unit", "A red-to-green gradient encodes severity with no legend, the axis has no unit, and the annotation carries the claim the data does not.");
    const defs = el(svg, "defs");
    const grad = el(defs, "linearGradient", { id: "lie-grad", x1: "0", x2: "1" });
    [["0", "#2e8b57"], ["0.5", "#e0a338"], ["1", "#c8402f"]].forEach(([o, c]) => el(grad, "stop", { offset: o, "stop-color": c }));
    const s = springs;
    const y = sc(3.4, 4.9, 70, 8), x = sc(0, s.length - 1, 8, 212);
    s.forEach((d, i) => el(svg, "rect", { x: x(i), y: y(d.level), width: 208 / s.length - 1, height: 70 - y(d.level), fill: "url(#lie-grad)" }));
    el(svg, "line", { x1: 8, x2: 212, y1: 70, y2: 70, stroke: "#c3bcae" });
    el(svg, "path", { d: "M40,26 L96,12", stroke: "#16181c", "stroke-width": 1.4, fill: "none" });
    el(svg, "path", { d: "M96,12 l-8,1 l4,-6 z", fill: "#16181c" });
    txt(svg, 100, 12, "climate collapse", { class: "note-strong" });
    txt(svg, 8, 84, "years →", { class: "tick" });
  }
}

/* ── controls ───────────────────────────────────────────────────────── */
function wire() {
  const seg = (sel, onPick) => $$(sel + " button").forEach((b) => b.addEventListener("click", () => {
    $$(sel + " button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    onPick(b);
  }));
  seg("#units", (b) => { document.body.dataset.unit = b.dataset.unit; drawAll(); });
  seg("#nums", (b) => { document.body.dataset.nums = b.dataset.set; });
  seg("#motion", (b) => { document.body.dataset.motion = b.dataset.set; });
  $$("#motion button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === document.body.dataset.motion)));

  // redraw when the plot width changes; height moves with the tables and must not loop
  let t = 0, w = $(".page").clientWidth;
  new ResizeObserver(() => {
    const nw = $(".page").clientWidth;
    if (nw === w) return;
    w = nw; clearTimeout(t); t = setTimeout(drawAll, 140);
  }).observe($(".page"));
}

document.documentElement.dataset.js = "1";
document.body.dataset.unit = "m";
document.body.dataset.nums = "charts";
document.body.dataset.motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
drawAll();
lies();
wire();
