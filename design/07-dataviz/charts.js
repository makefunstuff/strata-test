/* A hand-drawn SVG chart kit: scales, axes, marks, a shared tooltip, a keyboard
   cursor, and a table for every figure. No chart library — the axes, the ticks
   and the empty space are the design, and a library owns none of them. */

const NS = "http://www.w3.org/2000/svg";
/* el(parent, tag, attrs) for marks inside a parent, el(tag, attrs) for a root svg */
export const el = (a, b, c = {}) => {
  const parent = a instanceof Node ? a : null;
  const tag = parent ? b : a;
  const attrs = parent ? c : b;
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
export const txt = (parent, x, y, s, attrs = {}) => {
  const n = el(parent, "text", { x, y, ...attrs });
  n.textContent = s;
  return n;
};

/* ── scales ─────────────────────────────────────────────────────────── */
export const sc = (d0, d1, r0, r1) => scaleLinear(d0, d1, r0, r1);
export const ln = (pts) => path(pts);
export const U = { unit: "m", name: "metres" };
export const setUnit = (unit, name) => { U.unit = unit; U.name = name; };
export const scaleLinear = (d0, d1, r0, r1) => {
  const s = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  s.invert = (v) => d0 + ((v - r0) / (r1 - r0)) * (d1 - d0);
  s.domain = [d0, d1]; s.range = [r0, r1];
  return s;
};
export const ticks = ([d0, d1], count = 5) => {
  const span = d1 - d0, raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || mag * 10;
  const out = [];
  for (let v = Math.ceil(d0 / step) * step; v <= d1 + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
};
const fmt = (v, unit = "") => (v == null ? "—" : (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 100) / 100) + (unit ? " " + unit : ""));
const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${monthShort[d.getUTCMonth()]}`; };

/* ── axes ───────────────────────────────────────────────────────────── */
function axisY(g, y, w, { unit = U.unit, grid = true, label = "" } = {}) {
  for (const t of ticks(y.domain, 6)) {
    const yy = y(t);
    if (grid) el(g, "line", { class: "grid", x1: 0, x2: w, y1: yy, y2: yy });
    txt(g, -8, yy + 3.5, fmt(t, unit), { class: "tick", "text-anchor": "end" });
  }
  el(g, "line", { class: "axis", x1: 0, x2: w, y1: y(y.domain[1]), y2: y(y.domain[1]) });
  if (label) {
    const n = txt(g, -34, (y.range[0] + y.range[1]) / 2, label, { class: "axis-label", "text-anchor": "middle" });
    n.setAttribute("transform", `rotate(-90 ${-34} ${(y.range[0] + y.range[1]) / 2})`);
  }
}
function axisX(g, x, h, marks, { format = (v) => v, grid = false, rotate = false } = {}) {
  for (const m of marks) {
    const xx = x(m);
    if (grid) el(g, "line", { class: "grid", x1: xx, x2: xx, y1: 0, y2: h });
    const t = txt(g, xx, h + 15, format(m), { class: "tick", "text-anchor": rotate ? "end" : "middle" });
    if (rotate) t.setAttribute("transform", `rotate(-38 ${xx} ${h + 15})`);
  }
}
export const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

/* ── shared tooltip + live region ───────────────────────────────────── */
const tip = document.createElement("div");
tip.className = "tip"; tip.setAttribute("role", "status"); tip.setAttribute("aria-live", "polite");
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tip));
const status = document.createElement("div");
status.className = "sr"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(status));

function showTip(host, x, y, html) {
  const box = host.getBoundingClientRect();
  tip.innerHTML = html;
  tip.style.left = `${box.left + window.scrollX + x + 14}px`;
  tip.style.top = `${box.top + window.scrollY + y - 10}px`;
  tip.style.opacity = "1";
  tip.style.transform = "translateY(0)";
}
const hideTip = () => { tip.style.opacity = "0"; tip.style.transform = "translateY(4px)"; };

/* a keyboard cursor over an index axis: arrows move it, Home/End jump, Esc hides.
   The pointer and the keyboard share one code path, so the spoken value and the
   painted value can never disagree. */
function cursor(svg, host, n, onMove, { onLeave = hideTip } = {}) {
  let i = -1;
  const set = (k) => { i = Math.max(0, Math.min(n - 1, k)); onMove(i); };
  svg.setAttribute("tabindex", "0");
  svg.addEventListener("pointermove", (e) => {
    const b = svg.getBoundingClientRect();
    const f = (e.clientX - b.left) / b.width;
    set(Math.round(f * (n - 1)));
  });
  svg.addEventListener("pointerleave", () => { onLeave(); svg.classList.remove("tracking"); });
  svg.addEventListener("blur", () => { onLeave(); svg.classList.remove("tracking"); });
  svg.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowLeft" || k === "Home" || k === "End" || k === "PageUp" || k === "PageDown") e.preventDefault();
    if (k === "ArrowRight") set(i + 1);
    else if (k === "ArrowLeft") set(i - 1);
    else if (k === "Home") set(0);
    else if (k === "End") set(n - 1);
    else if (k === "PageUp") set(i + 5);
    else if (k === "PageDown") set(i - 5);
    else if (k === "Escape") { i = -1; onLeave(); svg.classList.remove("tracking"); }
    if (i >= 0) svg.classList.add("tracking");
  });
  svg.__cursor = { set, get: () => i };
  return svg.__cursor;
}

/* ── 01 · the claim: a line chart with annotations ───────────────────────── */
export function drawClaim(host, data, trendLine, opts = {}) {
  const W = host.clientWidth || 900, H = 300, m = { t: 26, r: 74, b: 30, l: U.unit === "ft" ? 56 : 46 };
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const x = scaleLinear(data[0].year, data[data.length - 1].year, 0, w);
  const ext = [Math.min(...data.map((d) => d.level)) - 0.15, Math.max(...data.map((d) => d.level)) + 0.2];
  const y = scaleLinear(ext[0], ext[1], h, 0);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart", "aria-label":
    `Line chart: highest spring tide each year from ${data[0].year} to ${data[data.length - 1].year}, ${U.name} above datum. ` +
    `Rose from about ${fmt(data[0].level, U.unit)} to ${fmt(data[data.length - 1].level, U.unit)}. A 2011 datum change steps the series down.` });
  host.appendChild(svg);
  const g = el(svg, "g", { transform: `translate(${m.l},${m.t})` });
  axisY(g, y, w, { label: `${U.name} above datum` });
  axisX(g, x, h, [1994, 2000, 2005, 2011, 2016, 2020, 2024], { format: (v) => v });

  // the datum change: a rule and a note, so the step in the series is not read as a fall
  const dx = x(2010.5);
  el(g, "line", { class: "datum-rule", x1: dx, x2: dx, y1: -8, y2: h });
  txt(g, dx + 6, 8, "2011 datum change", { class: "note-strong" });
  txt(g, dx + 6, 21, "OD −1.9 m → CD: the series steps, the sea does not", { class: "note" });

  // the trend, drawn on the CD segment only, where it is meaningful
  const cd = data.filter((d) => d.datum === "CD");
  el(g, "line", {
    class: "trend", x1: x(cd[0].year), y1: y(trendLine.a + trendLine.b * (cd[0].year - 1994)),
    x2: x(cd[cd.length - 1].year), y2: y(trendLine.a + trendLine.b * (cd[cd.length - 1].year - 1994)),
  });
  txt(g, x(cd[cd.length - 1].year) + 4, y(trendLine.a + trendLine.b * (cd[cd.length - 1].year - 1994)) + 4,
    `${trendLine.b > 0 ? "+" : ""}${(U.unit === "ft" ? (trendLine.b * 120).toFixed(0) + " in" : (trendLine.b * 1000).toFixed(0) + " cm")}/decade`, { class: "trend-label" });

  el(g, "path", { class: "line", d: path(data.map((d) => [x(d.year), y(d.level)])) });
  for (const d of data) el(g, "circle", { class: "dot" + (d.spike ? " spike" : ""), cx: x(d.year), cy: y(d.level), r: d.spike ? 4 : 2.6 });

  const cross = el(g, "line", { class: "cross", y1: 0, y2: h, opacity: 0 });
  const knob = el(g, "circle", { class: "knob", r: 5, opacity: 0 });
  cursor(svg, host, data.length, (i) => {
    const d = data[i];
    cross.setAttribute("x1", x(d.year)); cross.setAttribute("x2", x(d.year)); cross.setAttribute("opacity", 1);
    knob.setAttribute("cx", x(d.year)); knob.setAttribute("cy", y(d.level)); knob.setAttribute("opacity", 1);
    showTip(host, m.l + x(d.year), m.t + y(d.level),
      `<b>${d.year}</b><span>${fmt(d.level, U.unit)} above ${d.datum}</span>${d.spike ? '<em class="s">storm year</em>' : ""}<small>arrows move, Home/End jump, Esc clears</small>`);
    status.textContent = `${d.year}: ${fmt(d.level, U.unit)} above ${d.datum}${d.spike ? ", storm year" : ""}`;
  });
  return { svg, x, y, g, m, w, h };
}

/* ── 02 · small multiples: twelve gauges, one season ─────────────────────── */
export function drawGauges(host, gauges, floodLine) {
  const W = host.clientWidth || 900;
  const cols = W > 780 ? 4 : W > 520 ? 3 : 2;
  const cw = Math.floor(W / cols), ch = 96, pad = { t: 14, r: 8, b: 18, l: 30 };
  const rows = Math.ceil(gauges.length / cols);
  const H = rows * ch;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart sm", "aria-label":
    `Twelve small charts, one per gauge, daily maximum water level over 60 days from 1 November to 31 December 2024, in ${U.name}. ` +
    `A surge arrives at the mouth first and travels up the estuary, peaking later at each gauge upstream.` });
  host.appendChild(svg);
  const all = gauges.flatMap((s) => s.series.map((p) => p.level)).filter((v) => v != null);
  let readDay = () => {};
  const y = scaleLinear(0, Math.max(...all) * 1.04, ch - pad.t - pad.b, 0);
  const n = gauges[0].series.length;
  const x = scaleLinear(0, n - 1, cw - pad.l - pad.r, 0);
  gauges.forEach((s, gi) => {
    const cx = (gi % cols) * cw, cy = Math.floor(gi / cols) * ch;
    const g = el(svg, "g", { transform: `translate(${cx + pad.l},${cy + pad.t})`, class: "cell" });
    for (const t of ticks([0, y.domain[1]], 3)) {
      el(g, "line", { class: "grid", x1: 0, x2: x(n - 1), y1: y(t), y2: y(t) });
      if (gi % cols === 0) txt(g, -6, y(t) + 3, fmt(t), { class: "tick", "text-anchor": "end" });
    }
    el(g, "line", { class: "flood", x1: 0, x2: x(n - 1), y1: y(floodLine), y2: y(floodLine) });
    // the line breaks at the holes: two gauges went dark mid-season, and inventing a
    // line across a gap is the one thing a chart may never do
    const runs = [];
    let last = -2;
    for (let i = 0; i < s.series.length; i++) {
      const p = s.series[i];
      if (p.level == null) { last = -2; continue; }
      if (i !== last + 1) runs.push([]);
      runs[runs.length - 1].push([x(i), y(p.level)]);
      last = i;
    }
    for (const run of runs) {
      el(g, "path", { class: "sm-area", d: path([[run[0][0], y(0)], ...run, [run[run.length - 1][0], y(0)]]) });
      el(g, "path", { class: "sm-line", d: path(run) });
    }
    if (s.peak) { const pk = s.series.indexOf(s.peak); el(g, "circle", { class: "peak", cx: x(pk), cy: y(s.peak.level), r: 3 }); }
    // one label per cell: the code and its peak day on the same line, so neighbours
    // cannot collide inside a 245 px cell
    txt(g, 0, ch - pad.t - pad.b + 14, s.peak ? `${s.code} · peak ${dayLabel(s.peak.date)}` : `${s.code} · no record`, { class: "tick b" });
    txt(g, 0, -4, s.name, { class: "cell-title" });
    el(g, "rect", { x: 0, y: 0, width: x(n - 1), height: y(0), fill: "transparent", class: "hit" });
  });
  // one crosshair across all cells, so a season can be read as one event
  const rails = gauges.map((s, gi) => ({ gi, cx: (gi % cols) * cw + pad.l, cy: Math.floor(gi / cols) * ch + pad.t }));
  const bars = rails.map((r) => el(svg, "line", { class: "sm-cross", y1: r.cy, y2: r.cy + y(0), opacity: 0 }));
  const at = (i, px) => {
    const col = Math.min(cols - 1, Math.floor(px / cw));
    bars.forEach((bar, gi) => { if (gi % cols === col) { bar.setAttribute("x1", rails[gi].cx + x(i)); bar.setAttribute("x2", rails[gi].cx + x(i)); bar.setAttribute("opacity", 1); } else bar.setAttribute("opacity", 0); });
    readDay(i);
  };
  svg.__hover = (i) => at(Math.max(0, Math.min(n - 1, i)), (Math.min(cols - 1, Math.floor((i / n) * cols)) + 0.5) * cw);
  svg.addEventListener("pointermove", (e) => {
    const b = svg.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    const rel = px - Math.min(cols - 1, Math.floor(px / cw)) * cw - pad.l;
    at(Math.max(0, Math.min(n - 1, Math.round(x.invert(rel)))), px);
    status.textContent = `${dayLabel(gauges[0].series[i].date)}: ${gauges.map((s) => s.code + " " + fmt(s.series[i].level, U.unit)).join(", ")}`;
  });
  svg.addEventListener("pointerleave", () => { bars.forEach((b) => b.setAttribute("opacity", 0)); });
  // A twelve-series hover does not fit in a tooltip: the readout is a strip above the
  // grid, so the numbers stay put, all twelve are visible at once, and the grid stays clear.
  const ro = document.createElement("div");
  ro.className = "readout";
  ro.setAttribute("role", "status");
  ro.setAttribute("aria-live", "polite");
  ro.innerHTML = `<span class="d">1 Nov – 31 Dec 2024</span>` + gauges.map((s) =>
    `<span class="k" data-c="${s.code}" title="${s.name}">${s.code} <b>–</b></span>`).join("");
  host.parentNode.insertBefore(ro, host);
  const keys = [...ro.querySelectorAll(".k")];
  const dayEl = ro.querySelector(".d");
  readDay = (i) => {
    dayEl.textContent = dayLabel(gauges[0].series[i].date);
    keys.forEach((k, gi) => {
      const v = gauges[gi].series[i].level;
      k.querySelector("b").textContent = fmt(v, U.unit);
      k.classList.toggle("over", v != null && v >= floodLine);
      k.classList.toggle("dark", v == null);
    });
    status.textContent = `${dayLabel(gauges[0].series[i].date)}: ${gauges.map((s) => s.code + " " + fmt(s.series[i].level, U.unit)).join(", ")}`;
  };
  // a resting state that carries information: the readout opens on the mouth's highest day
  const i0 = gauges[0].series.reduce((b, p, i, arr) => (p.level != null && (arr[b].level == null || p.level > arr[b].level) ? i : b), 0);
  readDay(i0);
}

/* ── 03 · distribution: box plots with the raw points ────────────────────── */
export function drawBoxes(host, months, floodLine) {
  const W = host.clientWidth || 900, H = 320, m = { t: 22, r: 16, b: 30, l: U.unit === "ft" ? 56 : 46 };
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const y = scaleLinear(0, Math.max(...months.map((d) => d.max)) * 1.06, h, 0);
  const bw = w / months.length;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart", "aria-label":
    "Box plots of daily maximum water level for each month of 2024, in ${U.name}, with the raw daily points. The boxes rise and spread in the winter months." });
  host.appendChild(svg);
  const g = el(svg, "g", { transform: `translate(${m.l},${m.t})` });
  axisY(g, y, w, { label: `${U.name} above CD` });
  el(g, "line", { class: "flood", x1: 0, x2: w, y1: y(floodLine), y2: y(floodLine) });
  txt(g, w, y(floodLine) - 6, `flood line ${fmt(floodLine, U.unit)}`, { class: "note-strong", "text-anchor": "end" });
  const r = (() => { let s = 2024; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  months.forEach((d, i) => {
    const cx = i * bw + bw / 2, bwid = Math.min(30, bw * 0.42);
    const gg = el(g, "g", { class: "box" });
    // the raw points, jittered: the distribution before the summary
    for (const v of d.points) el(gg, "circle", { class: "pt", cx: cx + (r() - 0.5) * bwid * 1.5, cy: y(v), r: 1.6 });
    el(gg, "line", { class: "whisk", x1: cx, x2: cx, y1: y(d.lo), y2: y(d.hi) });
    el(gg, "line", { class: "whisk-cap", x1: cx - bwid / 3, x2: cx + bwid / 3, y1: y(d.hi), y2: y(d.hi) });
    el(gg, "line", { class: "whisk-cap", x1: cx - bwid / 3, x2: cx + bwid / 3, y1: y(d.lo), y2: y(d.lo) });
    el(gg, "rect", { class: "box-rect", x: cx - bwid / 2, y: y(d.q3), width: bwid, height: Math.max(1, y(d.q1) - y(d.q3)), rx: 2 });
    el(gg, "line", { class: "median", x1: cx - bwid / 2, x2: cx + bwid / 2, y1: y(d.med), y2: y(d.med) });
    txt(g, cx, h + 15, d.name, { class: "tick", "text-anchor": "middle" });
    el(gg, "rect", { class: "hit", x: i * bw, y: 0, width: bw, height: h, fill: "transparent" });
  });
  cursor(svg, host, months.length, (i) => {
    const d = months[i];
    showTip(host, m.l + i * bw + bw / 2, m.t + y(d.q3),
      `<b>${d.name}</b><span>median ${fmt(d.med, U.unit)} · IQR ${fmt(d.q1, U.unit)}–${fmt(d.q3, U.unit)}</span><span>whiskers ${fmt(d.lo, U.unit)}–${fmt(d.hi, U.unit)} · max ${fmt(d.max, U.unit)} · n=${d.n}</span>`);
    status.textContent = `${d.name}: median ${fmt(d.med, U.unit)}, interquartile ${fmt(d.q1, U.unit)} to ${fmt(d.q3, U.unit)}, maximum ${fmt(d.max, U.unit)}`;
  });
}

/* ── 04 · stacked area: additive hours by band ───────────────────────────── */
export function drawStack(host, rows, keys, colours) {
  const W = host.clientWidth || 900, H = 300, m = { t: 30, r: 92, b: 30, l: U.unit === "ft" ? 56 : 46 };
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const n = rows.length;
  const x = scaleLinear(0, n - 1, 0, w);
  const maxTotal = Math.max(...rows.map((r) => r.total));
  const y = scaleLinear(0, maxTotal * 1.05, h, 0);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart", "aria-label":
    "Stacked area chart of hours above each height band per month of 2024, in hours. The bands add up, so the stack is honest: the top edge is total hours of flooding." });
  host.appendChild(svg);
  const g = el(svg, "g", { transform: `translate(${m.l},${m.t})` });
  axisY(g, y, w, { unit: "h", label: "hours above CD" });
  axisX(g, x, h, rows.map((_, i) => i), { format: (i) => rows[i].name });
  const layers = keys.map((k, bi) => {
    const base = rows.map((r) => r.values.slice(0, bi).reduce((a, v) => a + v, 0));
    const top = rows.map((r, i) => base[i] + r.values[bi]);
    const d = path(rows.map((_, i) => [x(i), y(top[i])])) + "L" + rows.map((_, i) => `${x(n - 1 - i).toFixed(1)},${y(base[n - 1 - i]).toFixed(1)}`).join("L") + "Z";
    const p = el(g, "path", { class: `band b${bi + 1}`, d, fill: colours[bi] });
    // direct label on the band with room for it, so the legend is not the only route
    const mid = Math.floor(n / 2);
    const yc = (y(top[mid]) + y(base[mid])) / 2;
    if (y(top[mid]) - y(base[mid]) > 15) txt(g, x(mid), yc + 4, `${k} ${U.unit}`, { class: "band-lab", "text-anchor": "middle" });
    return { p, top, base };
  });
  const cross = el(g, "line", { class: "cross", y1: 0, y2: h, opacity: 0 });
  cursor(svg, host, n, (i) => {
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
    const r = rows[i];
    showTip(host, m.l + x(i), m.t + y(r.total),
      `<b>${r.name}</b>${keys.map((k, bi) => `<span><i class="sw b${bi + 1}" style="background:${colours[bi]}"></i>${k} ${U.unit} · ${r.values[bi]} h</span>`).join("")}<span><b>${r.total} h</b> total hours above CD</span>`);
    status.textContent = `${r.name}: ${keys.map((k, bi) => k + " " + r.values[bi] + " hours").join(", ")}; total ${r.total} hours`;
  });
}

/* ── 05 · then and now: a slope chart, one line per place ────────────────── */
export function drawSlope(host, towns) {
  const W = host.clientWidth || 900, H = 44 + towns.length * 34, m = { t: 26, r: 96, b: 26, l: 132 };
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const all = towns.flatMap((t) => [t.then, t.now]);
  const x = scaleLinear(Math.min(...all) - 0.1, Math.max(...all) + 0.1, 0, w);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart", "aria-label":
    `Slope chart: the one-in-fifty-year water level for ${towns.length} places in 1994 on the left and 2024 on the right, in ${U.name}. Every line rises; the labels give the rise.` });
  host.appendChild(svg);
  const g = el(svg, "g", { transform: `translate(${m.l},${m.t})` });
  for (const t of ticks(x.domain, 6)) {
    el(g, "line", { class: "grid", x1: x(t), x2: x(t), y1: -6, y2: h });
    txt(g, x(t), h + 16, fmt(t, U.unit), { class: "tick" });
  }
  txt(g, 0, -12, "1994", { class: "note-strong" });
  txt(g, w, -12, "2024", { class: "note-strong", "text-anchor": "end" });
  towns.forEach((t, i) => {
    const yy = i * 34 + 12;
    const gg = el(g, "g", { class: "slope" });
    el(gg, "line", { class: "slope-line", x1: x(t.then), x2: x(t.now), y1: yy, y2: yy });
    el(gg, "circle", { class: "then", cx: x(t.then), cy: yy, r: 4 });
    el(gg, "circle", { class: "now", cx: x(t.now), cy: yy, r: 4.6 });
    txt(gg, -10, yy + 4, t.name, { class: "row-lab", "text-anchor": "end" });
    txt(gg, x(t.then) - 8, yy + 4, fmt(t.then), { class: "val", "text-anchor": "end" });
    txt(gg, x(t.now) + 9, yy + 4, fmt(t.now), { class: "val b" });
    txt(gg, x(t.now) + 42, yy + 4, `+${t.rise.toFixed(2)} ${U.unit}`, { class: "rise" });
    el(gg, "rect", { class: "hit", x: 0, y: yy - 15, width: w, height: 30, fill: "transparent" });
    gg.addEventListener("pointerenter", () => {
      showTip(host, m.l + x(t.now), m.t + yy, `<b>${t.name}</b><span>1994 ${fmt(t.then, U.unit)} → 2024 ${fmt(t.now, U.unit)}</span><span>rise ${t.rise.toFixed(2)} ${U.unit} · population ${t.pop.toLocaleString()}</span>`);
    });
    gg.addEventListener("pointerleave", hideTip);
  });
}

/* ── 06 · a calendar of days, week × weekday ──────────────────────────────── */
export function drawCalendar(host, days, floodLine, stats) {
  const W = host.clientWidth || 900;
  const weeks = Math.ceil(days.length / 7);
  const cell = Math.floor((W - 46) / weeks), H = 7 * cell + 40;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart", "aria-label":
    `Heat map of every day of 2024, weeks across and weekdays down, coloured by the maximum water level at the mouth, in ${U.name}. ${stats.over} days reached the flood line of ${fmt(floodLine, U.unit)}; the highest day reached ${fmt(stats.max, U.unit)}.` });
  host.appendChild(svg);
  const g = el(svg, "g", { transform: `translate(46,22)` });
  const cmax = stats.max;
  const ramp = (v) => {
    const t = Math.max(0, Math.min(1, v / cmax));
    const stops = [[214, 226, 231], [143, 188, 199], [63, 139, 155], [11, 107, 120], [8, 62, 74]];
    const f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), k = f - i;
    const c = stops[i].map((s, j) => Math.round(s + (stops[i + 1][j] - s) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const wd = ["M", "T", "W", "T", "F", "S", "S"];
  wd.forEach((d, i) => txt(g, -8, i * cell + cell / 2 + 4, d, { class: "tick", "text-anchor": "end" }));
  const first = new Date(days[0].date).getUTCDay();
  const offset = (first + 6) % 7;
  days.forEach((d, i) => {
    const w = Math.floor((i + offset) / 7), r = (i + offset) % 7;
    const over = d.level >= floodLine;
    const n = el(g, "rect", {
      class: "day" + (over ? " over" : ""), x: w * cell + 1, y: r * cell + 1, width: cell - 2, height: cell - 2, rx: 2,
      fill: ramp(d.level),
    });
    n.addEventListener("pointerenter", () => {
      showTip(host, 46 + w * cell, 22 + r * cell, `<b>${dayLabel(d.date)}</b><span>${fmt(d.level, U.unit)} above CD</span>${over ? '<em class="s">over the flood line</em>' : ""}`);
      status.textContent = `${dayLabel(d.date)}: ${fmt(d.level, U.unit)}${over ? ", over the flood line" : ""}`;
    });
    n.addEventListener("pointerleave", hideTip);
  });
  // month rules along the top
  let lastMonth = -1;
  days.forEach((d, i) => {
    const mth = new Date(d.date).getUTCMonth();
    const w = Math.floor((i + offset) / 7);
    if (mth !== lastMonth) { lastMonth = mth; txt(g, w * cell, -8, monthShort[mth], { class: "tick b" }); }
  });
  const leg = el(svg, "g", { transform: `translate(46,${H - 14})` });
  for (let i = 0; i < 5; i++) el(leg, "rect", { x: i * 26, y: 0, width: 24, height: 10, rx: 2, fill: ramp(cmax * (i + 1) / 5) });
  txt(leg, 0, 24, `0 → ${fmt(cmax, U.unit)}`, { class: "tick", "text-anchor": "start" });
  txt(leg, 150, 8, `days over ${fmt(floodLine, U.unit)} are ringed: ${stats.over} of ${stats.n}`, { class: "note" });
}

/* ── every figure gets its numbers, on the page ──────────────────────────── */
export function tableFor(host, rows, cols) {
  host.innerHTML = "";   // a redraw must not stack a second table on the first
  const t = document.createElement("table");
  t.className = "numbers";
  t.innerHTML = `<thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  host.appendChild(t);
  return t;
}
