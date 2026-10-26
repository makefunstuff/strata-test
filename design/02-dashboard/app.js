// Gridwatch control tower: filters drive the charts and the table from one state object.
// Charts are hand-drawn SVG — no chart library, no build step.
import { DEPOTS, loadSeries, week, metrics, rows, alerts, fmt } from "./data.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = {
  day: "today",
  depots: new Set(DEPOTS.map((d) => d.id)),
  compare: "last Sunday",
  q: "",
  sort: { key: "load", dir: "desc" },
};

/* ── theme ──────────────────────────────────────────────────────────── */
const themeBtn = $("#theme");
const setTheme = (t) => {
  document.documentElement.dataset.theme = t;
  themeBtn.setAttribute("aria-pressed", String(t === "dark"));
  themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  try { localStorage.setItem("gridwatch-theme", t); } catch { /* private mode */ }
  drawCharts();
};
// the first theme is applied without a redraw: the charts are not built yet at this point
const storedTheme = (() => {
  try { return localStorage.getItem("gridwatch-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
  catch { return "light"; }
})();
document.documentElement.dataset.theme = storedTheme;
themeBtn.setAttribute("aria-pressed", String(storedTheme === "dark"));
themeBtn.setAttribute("aria-label", storedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme");
themeBtn.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

/* ── data for the selected day ─────────────────────────────────────── */
const DAY = {
  today: { energy: 412.6, cost: 61890, eff: 1.31, fleet: 466, co2: 11.2, scale: 1, label: "Sunday 19 October" },
  yesterday: { energy: 398.4, cost: 59940, eff: 1.3, fleet: 471, co2: 10.6, scale: 0.96, label: "Saturday 18 October" },
  week: { energy: 406.1, cost: 59746, eff: 1.3, fleet: 468, co2: 10.9, scale: 0.98, label: "week of 13–19 October" },
};
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function series() {
  const base = loadSeries(5);
  const s = DAY[state.day].scale;
  if (state.day !== "week") {
    return { xs: HOURS, stacks: base.map((b) => ({ depot: b.depot, v: b.kw.map((k) => Math.round(k * s)) })) };
  }
  return {
    xs: DAYS,
    stacks: base.map((b) => ({
      depot: b.depot,
      v: DAYS.map((_, i) => Math.round(b.kw.reduce((a, c) => a + c, 0) / 24 * [1.02, .99, .96, 1.05, 1.08, .88, 1][i] * s)),
    })),
  };
}
const visible = () => series().stacks.filter((s) => state.depots.has(s.depot.id));

/* the comparison curve: the same 24 hours of the day named in the header control, drawn over the
   current one. Its shape comes from a fixed seed and its area is normalised to that day's energy,
   so the curve and the headline figures cannot disagree. The depot filters apply to it too — a
   comparison that ignores the filter is a second chart wearing the first one's clothes. */
function compareTotals(xs, shown, nowTot) {
  if (!state.compare || !metrics.compare[state.compare]) return null;
  const c = metrics.compare[state.compare];
  const base = loadSeries(c.seed);
  const ids = new Set(shown.map((s) => s.depot.id));
  const per = xs.map((_, i) => base.filter((b) => ids.has(b.depot.id)).reduce((a, b) => a + b.kw[i % 24], 0));
  const shapeSum = per.reduce((a, v) => a + v, 0) || 1;
  const nowSum = nowTot.reduce((a, v) => a + v, 0) || 1;
  /* Scale the comparison *shape* into the current chart's own units by the day-over-day energy
     ratio. The absolute energy figures in this app are headline numbers and do not integrate to
     the hourly curve (412.6 MWh against a curve that sums to ~67 MWh), so normalising the ghost to
     the headline would draw a curve five times the size of the one it is compared with — which is
     exactly what the first version did, and the tooltip showed 13,072 kW beside 2,427 kW. Scaling
     by the ratio keeps the curve, the delta and the KPI rail's "3.1 % vs last Sunday" the same
     story. The underlying unit inconsistency is logged in NOTES.md as an open defect. */
  const k = (nowSum / shapeSum) * (c.energyMwh / metrics.energyMwh);
  return { label: c.label, v: per.map((v) => Math.round(v * k)) };
}

function matches(r) {
  const q = state.q.trim().toLowerCase();
  if (!state.depots.has(r.depot.id)) return false;
  if (!q) return true;
  return (r.depot.name + " " + r.depot.code + " " + r.note).toLowerCase().includes(q);
}

/* ── load chart: stacked hourly columns ────────────────────────────────
 * Stacked *areas* were the old drawing: six saturated series, alpha-overlapped, so the
 * bands blended into a sixth colour and the middle of the chart was unreadable. The quantity
 * is one quantity (kW by depot), so it is drawn as stacked columns in a single-hue sequential
 * ramp with surface-coloured separators: every band has a hard edge, and the total is a line
 * the eye can follow. The contract ceiling is drawn because a control room reads a load chart
 * against the ceiling — that is what the ceiling is for.
 */
const AH = 300, PAD = { t: 18, r: 18, b: 26, l: 52 };

function areaChart() {
  // a fresh node each draw: the crosshair listeners must not pile up on a resize redraw
  const old = $("#area");
  old.replaceWith(old.cloneNode(false));
  const svg = $("#area");
  const AW = Math.max(560, Math.round(svg.getBoundingClientRect().width) || 980);
  const { xs, stacks } = series();
  const shown = stacks.filter((s) => state.depots.has(s.depot.id));
  const tot = xs.map((_, i) => shown.reduce((a, s) => a + s.v[i], 0));
  // the scale must include the ceiling, or the one reference line that matters sits off-chart
  const max = Math.max(1, ...tot, metrics.ceilingKw) * 1.07;
  const x = (i) => PAD.l + ((i + 0.5) / xs.length) * (AW - PAD.l - PAD.r);
  const y = (v) => AH - PAD.b - (v / max) * (AH - PAD.t - PAD.b);
  const slot = (AW - PAD.l - PAD.r) / xs.length;
  const bw = Math.max(3, slot * 0.62);

  const grid = [];
  const step = max > 6000 ? 2000 : 1000;
  for (let v = 0; v <= max; v += step)
    grid.push(`<line x1="${PAD.l}" x2="${AW - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/>` +
      `<text x="${PAD.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="tick">${v / 1000}k</text>`);
  const xlab = xs.map((lab, i) => (xs.length > 12 ? i % 3 === 0 : true)
    ? `<text x="${x(i).toFixed(1)}" y="${AH - 8}" text-anchor="middle" class="tick">${lab}</text>` : "").join("");

  /* stacked segments, bottom depot first. `class="band"` carries a 1px stroke in the panel
     colour: that separator is what keeps adjacent ramp steps distinguishable without hue play. */
  let segs = "", acc = xs.map(() => 0);
  for (const s of [...shown].reverse()) {
    const idx = DEPOTS.findIndex((d) => d.id === s.depot.id);
    for (let i = 0; i < xs.length; i++) {
      const y0 = y(acc[i]), y1 = y(acc[i] + s.v[i]);
      if (y0 - y1 < 0.4) continue;
      segs += `<rect class="band" x="${(x(i) - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - y1).toFixed(1)}" style="fill:${s.depot.color}"/>`;
    }
    acc = acc.map((v, i) => v + s.v[i]);
  }
  const totalLine = `<polyline class="total" points="${tot.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`;
  const cmp = compareTotals(xs, shown, tot);
  const ghost = cmp
    ? `<polyline class="ghost" points="${cmp.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>` : "";

  const ceiling = `<line class="ceiling" x1="${PAD.l}" x2="${AW - PAD.r}" y1="${y(metrics.ceilingKw).toFixed(1)}" y2="${y(metrics.ceilingKw).toFixed(1)}"/>
    <text class="ceiling-label" x="${PAD.l + 4}" y="${(y(metrics.ceilingKw) - 6).toFixed(1)}" text-anchor="start">contract ceiling ${(metrics.ceilingKw / 1000).toFixed(2)} MW</text>`;
  // a y axis earns its place once there is something to read against
  const axis = `<line class="axis" x1="${PAD.l}" x2="${PAD.l}" y1="${PAD.t}" y2="${AH - PAD.b}"/>`;

  const peakIdx = tot.indexOf(Math.max(...tot));
  /* Annotations get the panel colour as a halo (paint-order: stroke), because they land on top of
     the bands: text placed over a chart without a halo is legible by luck. They are also placed
     with the ceiling label in mind — the top-left is the label's, so the peak sits above its
     column and the anomaly below its marker, and no two notes share a line. */
  const halo = 'paint-order:stroke;stroke:var(--surface);stroke-width:3.5px;stroke-linejoin:round';
  const anomaly = state.day !== "week" && state.depots.has("wfp")
    ? `<g><circle cx="${x(19)}" cy="${y(tot[19])}" r="4" class="marker"/>
       <text x="${x(19) + 9}" y="${(y(tot[19]) + 26).toFixed(1)}" text-anchor="start" class="anno" style="${halo}">bank 3 offline 19:00</text></g>` : "";
  const peak = `<g><line x1="${x(peakIdx)}" x2="${x(peakIdx)}" y1="${(y(tot[peakIdx]) - 26).toFixed(1)}" y2="${(AH - PAD.b).toFixed(1)}" class="peakline"/>
     <text x="${x(peakIdx).toFixed(1)}" y="${(y(tot[peakIdx]) - 30).toFixed(1)}" text-anchor="middle" class="anno" style="${halo}">peak ${(tot[peakIdx] / 1000).toFixed(2)} MW at ${xs[peakIdx]}:00</text></g>`;

  svg.setAttribute("viewBox", `0 0 ${AW} ${AH}`);
  // the readouts the operator actually quotes: peak, ceiling, headroom
  const meta = $("#chartMeta");
  if (meta) {
    const bits = [`peak ${(tot[peakIdx] / 1000).toFixed(2)} MW at ${xs[peakIdx]}:00`,
      `ceiling ${(metrics.ceilingKw / 1000).toFixed(2)} MW`,
      `headroom ${((metrics.ceilingKw - tot[peakIdx]) / 1000).toFixed(2)} MW`];
    if (cmp) {
      const now = tot.reduce((a, v) => a + v, 0), then = cmp.v.reduce((a, v) => a + v, 0);
      const d = ((now - then) / then) * 100;
      bits.push(`${cmp.label} dashed, ${d >= 0 ? "+" : ""}${d.toFixed(1)} %`);
    }
    meta.textContent = bits.join(" · ");
  }

  svg.innerHTML = `<g>${grid.join("")}${xlab}${axis}</g>${ceiling}${segs}${ghost}${totalLine}${peak}${anomaly}
    <line id="hair" x1="0" x2="0" y1="${PAD.t}" y2="${AH - PAD.b}" class="hair" hidden/>`;

  // hover crosshair + tooltip
  const plot = $("#plot"), tip = $("#tip"), hair = svg.querySelector("#hair");
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX ?? ev.touches?.[0]?.clientX ?? 0) - r.left) / r.width * AW;
    if (px < PAD.l - 10 || px > AW - PAD.r + 10) { hide(); return; }
    const i = Math.max(0, Math.min(xs.length - 1, Math.round((px - PAD.l) / (AW - PAD.l - PAD.r) * xs.length - 0.5)));
    hair.hidden = false;
    hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i));
    tip.hidden = false;
    tip.innerHTML = `<b>${xs.length > 12 ? xs[i] + ":00" : xs[i]}</b>`
      + shown.map((s) => `<span><i style="--c:${s.depot.color}"></i>${s.depot.code}<span>${fmt.num(s.v[i])} kW</span></span>`).join("")
      + (cmp ? `<span class="tcmp">${cmp.label}<span>${fmt.num(cmp.v[i])} kW</span></span>` : "")
      + `<span class="tsum">total<span>${fmt.num(tot[i])} kW</span></span>`;
    const tw = 170;
    tip.style.left = Math.max(0, Math.min(r.width - tw, (x(i) / AW) * r.width - tw / 2)) + "px";
    tip.style.top = Math.max(0, (y(tot[i]) / AH) * r.height - 12) + "px";
  };
  const hide = () => { tip.hidden = true; hair.hidden = true };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", hide);
}

/* ── source of the day: a 100% part-whole bar ─────────────────────────
 * Three categories do not need a ring. A donut asks the eye to compare arc lengths around a
 * circle to read 71/17/12; a single bar states the same thing in one glance and leaves room for
 * the figures that matter, which go in the list below it, aligned, tabular.
 */
function donut() {
  const parts = [
    { k: "Grid import", v: metrics.gridImportPct, c: "var(--d2)", m: "293 MWh · band C" },
    { k: "On-site solar", v: metrics.solarPct, c: "var(--warn)", m: "70 MWh · 6 depots" },
    { k: "Battery discharge", v: metrics.batteryPct, c: "var(--info)", m: "50 MWh · 17:00\u201320:00" },
  ];
  const W = 320, H = 34, BH = 20, GAP = 3, r = 3;
  const total = parts.reduce((a, p) => a + p.v, 0);
  const usable = W - GAP * (parts.length - 1);
  let x = 0, i = 0;
  const segs = parts.map((p) => {
    const w = (p.v / total) * usable;
    const rect = `<rect x="${x.toFixed(1)}" y="4" width="${w.toFixed(1)}" height="${BH}" rx="${i === 0 || i === parts.length - 1 ? r : 0}" style="fill:${p.c}"/>`;
    x += w + GAP; i++;
    return rect;
  }).join("");
  // a 100% bar needs its ends named, or the proportions are free to mean anything
  const ends = `<text x="0" y="${BH + 13}" class="tick">0 %</text>
    <text x="${W}" y="${BH + 13}" text-anchor="end" class="tick">100 %</text>`;
  $("#donut").innerHTML = segs + ends;
  $("#donutKeys").innerHTML = parts.map((p) =>
    `<li style="--c:${p.c}"><i></i>${p.k}<b>${p.v} %</b></li><li class="small">${p.m}</li>`).join("");
}

/* ── bars ───────────────────────────────────────────────────────────── */
function bars() {
  const data = [
    { code: "AWL", v: 1.28, prev: 1.26 }, { code: "KGN", v: 1.24, prev: 1.27 },
    { code: "WFP", v: 1.33, prev: 1.31 }, { code: "BRP", v: 1.41, prev: 1.38 },
    { code: "NGM", v: 1.46, prev: 1.44 }, { code: "STK", v: 1.19, prev: 1.22 },
  ];
  const W = 560, H = 230, P = { t: 12, r: 12, b: 34, l: 36 };
  const max = 1.6, bw = (W - P.l - P.r) / data.length;
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const barsHtml = data.map((d, i) => {
    const bx = P.l + i * bw + bw * 0.24, w = bw * 0.52;
    const over = d.v > metrics.targetKWhPerKm;
    // the bar is the depot (neutral ink), the overage is the alarm: a red wall of six bars says
    // nothing when four of them are over by 0.04
    return `<g><rect class="bar" x="${bx.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - P.b - y(d.v)).toFixed(1)}" rx="3"/>
      ${over ? `<rect class="overcap" x="${bx.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${w.toFixed(1)}" height="3"/>` : ""}
      <line x1="${(bx + w + 4).toFixed(1)}" x2="${(bx + w + 12).toFixed(1)}" y1="${y(d.prev).toFixed(1)}" y2="${y(d.prev).toFixed(1)}" class="prev"/>
      <text class="val${over ? " over" : ""}" x="${(bx + w / 2).toFixed(1)}" y="${(y(d.v) - 6).toFixed(1)}" text-anchor="middle">${d.v.toFixed(2)}</text>
      <text x="${(bx + w / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle">${d.code}</text></g>`;
  }).join("");
  const gridY = [0.4, 0.8, 1.2, 1.6].map((v) =>
    `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${v.toFixed(1)}</text>`).join("");
  $("#bars").innerHTML = `${gridY}
    <line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>
    <line class="target" x1="${P.l}" x2="${W - P.r}" y1="${y(metrics.targetKWhPerKm)}" y2="${y(metrics.targetKWhPerKm)}"/>
    ${barsHtml}`;
}

/* ── sparklines ─────────────────────────────────────────────────────── */
function spark(el, vals, cls = "") {
  const w = 120, h = 34, min = Math.min(...vals), max = Math.max(...vals);
  const x = (i) => (i / (vals.length - 1)) * (w - 4) + 2;
  const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
  el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  el.setAttribute("preserveAspectRatio", "none");
  if (cls) el.classList.add(cls);
  el.innerHTML = `<path class="base" d="M0 ${y(vals[0]).toFixed(1)}H${w}"/>
    <path d="${vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("")}"/>`;
}

/* ── table ─────────────────────────────────────────────────────────── */
const LABEL = { name: "Depot", load: "load", target: "target", delta: "Δ", buses: "buses", chargers: "chargers", soc: "state of charge", state: "status" };
function renderTable() {
  const list = rows.filter(matches);
  const key = state.sort.key, dir = state.sort.dir === "asc" ? 1 : -1;
  const val = (r) => key === "name" ? r.depot.name : key === "delta" ? r.load - r.target : r[key] ?? r.depot[r.key];
  list.sort((a, b) => (String(val(a)).localeCompare(String(val(b)), undefined, { numeric: true })) * dir);

  $("#tbody").innerHTML = list.map((r) => {
    const d = r.load - r.target;
    const socCls = r.soc < 65 ? "crit" : r.soc < 80 ? "low" : "";
    const min = Math.min(...r.trend), max = Math.max(...r.trend);
    const pts = r.trend.map((v, i) => `${i ? "L" : "M"}${(i / 6 * 60 + 2).toFixed(1)} ${(20 - (v - min) / (max - min || 1) * 16).toFixed(1)}`).join("");
    return `<tr>
      <td data-label="Depot"><span class="depot"><b>${r.depot.name}</b><small>${r.depot.code} · ${r.note}</small></span></td>
      <td class="num" data-label="Load"><b>${fmt.num(r.load)}</b></td>
      <td class="num" data-label="Target"><b>${fmt.num(r.target)}</b></td>
      <td class="num" data-label="Δ"><span class="${d > 0 ? "delta-bad" : "delta-good"}">${d > 0 ? "+" : ""}${fmt.num(d)}</span></td>
      <td class="num" data-label="Buses"><b>${r.buses}</b><span class="dimnum">/${r.depot.buses}</span></td>
      <td class="num" data-label="Chargers"><b>${r.chargers}</b><span class="dimnum">/${r.depot.charger}</span></td>
      <td data-label="State of charge"><span class="soc"><span class="track"><span class="fill ${socCls}" style="width:${r.soc}%"></span></span><span>${r.soc} %</span></span></td>
      <td class="spark-cell" data-label="7-day"><svg viewBox="0 0 64 22" role="img" aria-label="7-day load trend">${`<path class="${r.state === "fault" ? "hot" : ""}" d="${pts}"/>`}</svg></td>
      <td data-label="Status"><span class="pill-state st-${r.state}">${r.state}</span></td>
    </tr>`;
  }).join("");

  const n = list.length;
  $("#rowCount").textContent = n;
  $("#count").textContent = `${DEPOTS.filter((d) => state.depots.has(d.id)).length} of ${DEPOTS.length} depots`;
  $("#sortLabel").textContent = `${LABEL[key]}, ${state.sort.dir === "desc" ? "highest first" : "lowest first"}`;
  $$("th button.sort").forEach((b) => {
    const th = b.closest("th");
    const on = b.dataset.key === key;
    th.setAttribute("aria-sort", on ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
    b.removeAttribute("aria-current");
    if (on) b.setAttribute("aria-current", "true");
  });
  const empty = n === 0;
  $("#empty").hidden = !empty;
  $(".table-scroll").hidden = empty;
  $("#emptyWhy").textContent = DEPOTS.filter((d) => state.depots.has(d.id)).length === 0
    ? "Every depot is unchecked. Turn one on, or reset the filters."
    : `Nothing matches “${state.q}” in the ${DEPOTS.filter((d) => state.depots.has(d.id)).length} selected depots.`;
}

/* ── filters ────────────────────────────────────────────────────────── */
$("#depotChecks").innerHTML = DEPOTS.map((d) =>
  `<label><input type="checkbox" checked value="${d.id}"><span class="dot" style="--c:${d.color}"></span>${d.code}<span class="code">${d.buses} buses</span></label>`).join("");
$("#arealegend").innerHTML = DEPOTS.map((d) =>
  `<button type="button" data-depot="${d.id}" aria-pressed="true" style="--c:${d.color}"><i></i>${d.code}</button>`).join("");

function syncChecks() {
  $$("#depotChecks input").forEach((i) => { i.checked = state.depots.has(i.value); });
  $$("#arealegend button").forEach((b) => b.setAttribute("aria-pressed", String(state.depots.has(b.dataset.depot))));
}
$("#depotChecks").addEventListener("change", (e) => {
  const id = e.target.value;
  e.target.checked ? state.depots.add(id) : state.depots.delete(id);
  syncChecks(); drawCharts(); renderTable();
});
$("#arealegend").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-depot]");
  if (!b) return;
  const id = b.dataset.depot;
  state.depots.has(id) ? state.depots.delete(id) : state.depots.add(id);
  syncChecks(); drawCharts(); renderTable();
});
$("#allDepots").addEventListener("click", () => { DEPOTS.forEach((d) => state.depots.add(d.id)); syncChecks(); drawCharts(); renderTable(); });
$("#peakOnly").addEventListener("click", () => {
  state.depots = new Set(DEPOTS.filter((d) => d.charger >= 18).map((d) => d.id));
  syncChecks(); drawCharts(); renderTable();
});
$("#q").addEventListener("input", (e) => { state.q = e.target.value; renderTable(); });
$("#filters").addEventListener("reset", () => {
  state.depots = new Set(DEPOTS.map((d) => d.id)); state.q = ""; state.day = "today";
  $("#q").value = "";
  $$(".btn-seg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.day === "today")));
  syncChecks(); drawCharts(); renderTable(); toast("Filters reset");
});
$("#compare").addEventListener("change", (e) => {
  const v = e.target.value.replace(/^compare:\s*/, "");
  state.compare = v.startsWith("no") ? null : v;
  drawCharts();
  toast(v.startsWith("no") ? "Comparison off" : "Comparing with " + v);
});
$$(".btn-seg").forEach((b) => b.addEventListener("click", () => {
  state.day = b.dataset.day;
  $$(".btn-seg").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  $("h1 .dim").textContent = "— " + DAY[state.day].label;
  drawCharts(); renderTable();
}));
$("#emptyReset").addEventListener("click", () => $("#filters").dispatchEvent(new Event("reset")));

/* ── sorting ────────────────────────────────────────────────────────── */
$$("th button.sort").forEach((b) => b.addEventListener("click", () => {
  const key = b.dataset.key;
  state.sort = { key, dir: state.sort.key === key && state.sort.dir === "desc" ? "asc" : "desc" };
  renderTable();
}));
$("#density").addEventListener("click", (e) => {
  const on = $("#grid").classList.toggle("compact");
  e.currentTarget.setAttribute("aria-pressed", String(on));
});

/* ── drawer ─────────────────────────────────────────────────────────── */
const drawer = $("#drawer");
const setDrawer = (open) => {
  document.body.classList.toggle("drawer", open);
  drawer.setAttribute("aria-expanded", String(open));
};
drawer.addEventListener("click", () => setDrawer(!document.body.classList.contains("drawer")));
$("#drawerClose")?.addEventListener("click", () => { setDrawer(false); drawer.focus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setDrawer(false); });
document.addEventListener("click", (e) => {
  if (document.body.classList.contains("drawer") && !e.target.closest("#side") && !e.target.closest("#drawer")) setDrawer(false);
});

/* ── toast ──────────────────────────────────────────────────────────── */
let toastEl;
function toast(msg) {
  toastEl ??= Object.assign(document.createElement("div"), { className: "toast", role: "status" });
  document.body.append(toastEl);
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove("show"), 2600);
}
$("#export").addEventListener("click", () => toast("gridwatch-19-october.csv · 6 depots · 18 KB prepared"));
$("#csv2").addEventListener("click", () => {
  const tsv = "Depot\tLoad kW\tTarget\tΔ\n" + rows.filter(matches)
    .map((r) => `${r.depot.code}\t${r.load}\t${r.target}\t${r.load - r.target}`).join("\n");
  try { navigator.clipboard?.writeText(tsv); toast("Table copied — 6 rows"); }
  catch { toast("Copy is blocked in this browser"); }
});

/* ── render ─────────────────────────────────────────────────────────── */
function drawCharts() { areaChart(); donut(); bars(); }
function renderKpis() {
  const d = DAY[state.day];
  $("#k-energy").textContent = d.energy.toFixed(1);
  $("#k-cost").textContent = fmt.gbp(d.cost);
  $("#k-eff").textContent = d.eff.toFixed(2);
  $("#k-fleet").textContent = d.fleet;
  $("#k-co2").textContent = d.co2.toFixed(1);
  spark($("#spark1"), week.map((w) => w.kwh * 312), "");
  spark($("#spark2"), week.map((w) => w.cost), "");
  spark($("#spark3"), week.map((w) => w.kwh), "warn");
  spark($("#spark4"), [452, 461, 468, 474, 470, 481, d.fleet], "");
  spark($("#spark5"), week.map((w) => 22 - w.kwh * 4.4), "");
}
$("#alertList").innerHTML = alerts.map((a) =>
  `<li><time>${a.t}</time><span><span class="tag ${a.kind}">${a.kind}</span>${a.text}</span></li>`).join("");

syncChecks();
renderKpis();
drawCharts();
renderTable();

let rsz;
new ResizeObserver(() => { clearTimeout(rsz); rsz = setTimeout(drawCharts, 140); }).observe($("#plot"));
