// Gridwatch control tower: filters drive the charts and the table from one state object.
// Charts are hand-drawn SVG — no chart library, no build step.
import { DEPOTS, loadSeries, week, metrics, rows, alerts, fmt } from "./data.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = {
  day: "today",
  depots: new Set(DEPOTS.map((d) => d.id)),
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

function matches(r) {
  const q = state.q.trim().toLowerCase();
  if (!state.depots.has(r.depot.id)) return false;
  if (!q) return true;
  return (r.depot.name + " " + r.depot.code + " " + r.note).toLowerCase().includes(q);
}

/* ── area chart ─────────────────────────────────────────────────────── */
const AH = 300, PAD = { t: 16, r: 18, b: 26, l: 52 };

// the depot colours are chosen for paper; on the dark theme they are lifted towards white
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  return "#" + [r1, g1, b1].map((v, i) => Math.round(v + (p(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const band = (c) => document.documentElement.dataset.theme === "dark" ? mix(c, "#ffffff", 0.26) : c;

function areaChart() {
  // a fresh node each draw: the crosshair listeners must not pile up on a resize redraw
  const old = $("#area");
  old.replaceWith(old.cloneNode(false));
  const svg = $("#area");
  const AW = Math.max(560, Math.round(svg.getBoundingClientRect().width) || 980);
  const { xs, stacks } = series();
  const shown = stacks.filter((s) => state.depots.has(s.depot.id));
  const tot = xs.map((_, i) => shown.reduce((a, s) => a + s.v[i], 0));
  const max = Math.max(1, ...tot) * 1.08;
  const x = (i) => PAD.l + (i / (xs.length - 1)) * (AW - PAD.l - PAD.r);
  const y = (v) => AH - PAD.b - (v / max) * (AH - PAD.t - PAD.b);
  const grid = [];
  const step = max > 6000 ? 2000 : 1000;
  for (let v = 0; v <= max; v += step) grid.push(`<line x1="${PAD.l}" x2="${AW - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${PAD.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="tick">${v / 1000}k</text>`);
  const xlab = xs.map((lab, i) => (xs.length > 12 ? i % 3 === 0 : true)
    ? `<text x="${x(i).toFixed(1)}" y="${AH - 8}" text-anchor="middle" class="tick">${lab}</text>` : "").join("");

  // stacked bands, bottom depot first
  let bands = "", acc = xs.map(() => 0);
  for (const s of [...shown].reverse()) {
    const top = s.v.map((v, i) => acc[i] + v);
    const up = top.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    const down = acc.map((v, i) => `L${x(xs.length - 1 - i).toFixed(1)} ${y(acc[xs.length - 1 - i]).toFixed(1)}`).join("");
    bands += `<path d="${up}${down}Z" fill="${band(s.depot.color)}" fill-opacity="0.78"/>`;
    bands += `<path d="${up}" fill="none" stroke="${band(s.depot.color)}" stroke-width="1.4"/>`;
    acc = top;
  }
  const peakIdx = tot.indexOf(Math.max(...tot));
  const anomaly = state.day !== "week" && state.depots.has("wfp")
    ? `<g><circle cx="${x(19)}" cy="${y(tot[19])}" r="4.5" class="marker"/>
       <text x="${x(19) - 10}" y="${y(tot[19]) + 18}" text-anchor="end" class="anno">bank 3 offline 19:00</text></g>` : "";
  const peak = `<g><line x1="${x(peakIdx)}" x2="${x(peakIdx)}" y1="${PAD.t}" y2="${AH - PAD.b}" class="peakline"/>
     <text x="${x(peakIdx) - 9}" y="${PAD.t + 12}" text-anchor="end" class="anno">peak ${fmt.num(Math.round(tot[peakIdx] / 100) / 10)} MW</text></g>`;

  svg.setAttribute("viewBox", `0 0 ${AW} ${AH}`);
  svg.innerHTML = `<g>${grid.join("")}${xlab}</g>${bands}${peak}${anomaly}
    <line id="hair" x1="0" x2="0" y1="${PAD.t}" y2="${AH - PAD.b}" class="hair" hidden/>`;

  // hover crosshair + tooltip
  const plot = $("#plot"), tip = $("#tip"), hair = svg.querySelector("#hair");
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX ?? ev.touches?.[0]?.clientX ?? 0) - r.left) / r.width * AW;
    if (px < PAD.l - 10 || px > AW - PAD.r + 10) { hide(); return; }
    const i = Math.max(0, Math.min(xs.length - 1, Math.round((px - PAD.l) / (AW - PAD.l - PAD.r) * (xs.length - 1))));
    hair.hidden = false;
    hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i));
    tip.hidden = false;
    tip.innerHTML = `<b>${xs.length > 12 ? xs[i] + ":00" : xs[i]}</b>`
      + shown.map((s) => `<span><i style="--c:${s.depot.color}"></i>${s.depot.code}<span>${fmt.num(s.v[i])} kW</span></span>`).join("")
      + `<span class="tsum">total<span>${fmt.num(tot[i])} kW</span></span>`;
    const tw = 170;
    tip.style.left = Math.max(0, Math.min(r.width - tw, (x(i) / AW) * r.width - tw / 2)) + "px";
    tip.style.top = Math.max(0, (y(tot[i]) / AH) * r.height - 12) + "px";
  };
  const hide = () => { tip.hidden = true; hair.hidden = true };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", hide);
}

/* ── donut ──────────────────────────────────────────────────────────── */
function donut() {
  const parts = [
    { k: "Grid import", v: metrics.gridImportPct, c: "var(--teal)", m: "293 MWh · band C" },
    { k: "On-site solar", v: metrics.solarPct, c: "var(--amber)", m: "70 MWh · 6 depots" },
    { k: "Battery discharge", v: metrics.batteryPct, c: "var(--blue)", m: "50 MWh · 17:00–20:00" },
  ];
  const R = 62, C = 2 * Math.PI * R, cx = 80, cy = 80;
  let off = 0;
  const arcs = parts.map((p) => {
    const len = (p.v / 100) * C;
    const s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${p.c}" stroke-width="22"
      stroke-dasharray="${len - 3} ${C - len + 3}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
    off += len;
    return s;
  }).join("");
  $("#donut").innerHTML = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--line)" stroke-width="22"/>${arcs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="dnum">412.6</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="dsub">MWh today</text>`;
  $("#donutKeys").innerHTML = parts.map((p) =>
    `<li style="--c:${p.c}"><i></i>${p.k}<b>${p.v} %</b></li><li class="small" style="padding-left:18px">${p.m}</li>`).join("");
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
    return `<g><rect class="${over ? "over" : "bar"}" x="${bx.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - P.b - y(d.v)).toFixed(1)}" rx="3"/>
      <line x1="${(bx + w + 4).toFixed(1)}" x2="${(bx + w + 12).toFixed(1)}" y1="${y(d.prev).toFixed(1)}" y2="${y(d.prev).toFixed(1)}" class="prev"/>
      <text class="val" x="${(bx + w / 2).toFixed(1)}" y="${(y(d.v) - 6).toFixed(1)}" text-anchor="middle">${d.v.toFixed(2)}</text>
      <text x="${(bx + w / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle">${d.code}</text></g>`;
  }).join("");
  const gridY = [0.4, 0.8, 1.2, 1.6].map((v) =>
    `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${v.toFixed(1)}</text>`).join("");
  $("#bars").innerHTML = `${gridY}
    <line class="target" x1="${P.l}" x2="${W - P.r}" y1="${y(metrics.targetKWhPerKm)}" y2="${y(metrics.targetKWhPerKm)}"/>
    <text x="${W - P.r}" y="${y(metrics.targetKWhPerKm) - 7}" text-anchor="end" class="tlabel">target 1.24</text>
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
