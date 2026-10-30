// grid — tui/5: an ops board. Service tiles along the top with a p95 sparkline each, the log stream
// in the middle, alerts down the side, and the filters in the status line.
//
// It is live: a new log line arrives on a timer, the sparklines advance, a service can be restarted
// and comes back up through "starting". Following is a mode, not a default you can forget — scroll
// up with j/k and the stream stops sticking to the bottom, exactly like the real tools.
import { createTUI, pad, pad0, clamp, rng } from "../shared/tui.js";

const PAL = {
  // dracula: a plum-black with a chalk ink and the neon sextet it is known for
  pageBg: "#1e1f29", screenBg: "#282a36", panel: "#313342", well: "#21222c", line: "#44475a",
  line2: "#6272a4", fg: "#f8f8f2", dim: "#bfc7dd", faint: "#7f89a8", accent: "#ff79c6",
  green: "#50fa7b", red: "#ff5555", yellow: "#f1fa8c", blue: "#8be9fd", purple: "#bd93f9",
  cyan: "#8be9fd", orange: "#ffb86c", track: "#343746",
};

const rand = rng(0x0ba5);

const SERVICES = [
  { name: "api-gw", team: "edge", qps: 840, p95: 62 },
  { name: "auth", team: "identity", qps: 410, p95: 38 },
  { name: "search", team: "discovery", qps: 262, p95: 121 },
  { name: "billing", team: "money", qps: 44, p95: 210 },
  { name: "ingest", team: "data", qps: 1180, p95: 88 },
  { name: "web", team: "front", qps: 620, p95: 51 },
];

const MSGS = {
  debug: [
    "cache lookup {key} → {ms}ms",
    "span {trace} sampled at {pct}%",
    "pool: {n} idle, {m} active",
    "config reload: {n} keys changed",
  ],
  info: [
    "GET /v1/{ep} {code} in {ms}ms ({n} rows)",
    "job {job} finished: {n} docs in {ms}ms",
    "accepted connection from 10.0.{n}.{m} (tls1.3)",
    "published {n} events to {job}",
  ],
  warn: [
    "retry {n}/3 upstream {ep} — {ms}ms > {ms}ms budget",
    "queue depth {n} above soft limit",
    "slow query on {ep}: {ms}ms, plan chose seq scan",
    "token cache thrashing: {n} misses in 10s",
  ],
  error: [
    "upstream {ep} returned 503 after {n} retries",
    "deadlock detected on table {job}, transaction rolled back",
    "connection reset by peer 10.0.{n}.{m} during handshake",
    "panic recovered in handler {ep}: index out of range",
  ],
};
const EPS = ["users", "sessions", "invoices", "orders", "search", "health", "tokens", "reports"];
const JOBS = ["reindex", "digest", "rollup", "sweeper", "backfill", "prune"];

const fmt = (tpl) => tpl
  .replace(/\{ep\}/g, () => EPS[Math.floor(rand() * EPS.length)])
  .replace(/\{job\}/g, () => JOBS[Math.floor(rand() * JOBS.length)])
  .replace(/\{key\}/g, () => "usr:" + Math.floor(rand() * 9999))
  .replace(/\{trace\}/g, () => Math.floor(rand() * 1e16).toString(16).padStart(16, "0"))
  .replace(/\{code\}/g, () => [200, 200, 200, 201, 204, 304, 400, 404][Math.floor(rand() * 8)])
  .replace(/\{pct\}/g, () => (rand() * 100).toFixed(1))
  .replace(/\{ms\}/g, () => Math.floor(4 + rand() * 480))
  .replace(/\{n\}/g, () => Math.floor(rand() * 400))
  .replace(/\{m\}/g, () => Math.floor(rand() * 250));

const LEVELS = ["debug", "info", "info", "info", "warn", "warn", "error"];
const LEVEL_COL = { debug: "faint", info: "cyan", warn: "yellow", error: "red" };

const state = {
  logs: [], seq: 0, sel: 0, follow: true, paused: false, level: "all", filter: "", searching: false,
  expanded: null, tab: 0, alerts: [], acks: 0, restarts: 0, linesIn: 0, svcSel: 0, alertSel: 0,
  clock: 1730246400000, acc: 0,
};

function ts(offset = 0) {
  const d = new Date(state.clock + offset);
  return `${pad0(d.getUTCHours(), 2)}:${pad0(d.getUTCMinutes(), 2)}:${pad0(d.getUTCSeconds(), 2)}.${pad0(d.getUTCMilliseconds(), 3)}`;
}

function makeLine() {
  const svc = SERVICES[Math.floor(rand() * SERVICES.length)];
  let level = LEVELS[Math.floor(rand() * LEVELS.length)];
  if (svc.status === "down") level = "error";
  const msg = fmt(MSGS[level][Math.floor(rand() * MSGS[level].length)]);
  return {
    id: ++state.seq, t: ts(state.seq * 380), level, svc: svc.name, msg,
    trace: Math.floor(rand() * 1e16).toString(16).padStart(16, "0"),
    dur: Math.floor(4 + rand() * 480),
    host: `node-${pad0(1 + Math.floor(rand() * 9), 2)}`,
  };
}

function boot() {
  for (const s of SERVICES) {
    s.status = "up"; s.restarts = Math.floor(rand() * 3);
    s.hist = Array.from({ length: 40 }, () => s.p95 * (0.6 + rand() * 0.9));
    s.qpsHist = Array.from({ length: 24 }, () => s.qps * (0.7 + rand() * 0.6));
  }
  SERVICES[2].status = "degraded";
  for (let i = 0; i < 40; i++) state.logs.push(makeLine());
  state.linesIn = state.logs.length;
  state.sel = state.logs.length - 1;
  state.alerts = [
    { id: "a1", sev: "crit", svc: "search", text: "p95 412ms above 250ms budget for 5m", ts: ts(0), acked: false },
    { id: "a2", sev: "warn", svc: "billing", text: "queue depth 812 above soft limit", ts: ts(40), acked: false },
    { id: "a3", sev: "warn", svc: "ingest", text: "consumer lag growing on partition 7", ts: ts(90), acked: false },
  ];
}

const shown = () => {
  const f = state.filter.toLowerCase();
  return state.logs.filter((l) =>
    (state.level === "all" || l.level === state.level) &&
    (!f || l.msg.toLowerCase().includes(f) || l.svc.includes(f)));
};

/* ------------------------------------------------------------------ drawing */

function drawTiles(t, r) {
  const per = 20, gap = 1;
  const n = Math.max(1, Math.min(SERVICES.length, Math.floor((r.w + gap) / (per + gap))));
  const w = Math.max(14, Math.floor((r.w - gap * (n - 1)) / n));
  const h = Math.min(r.h, 5);
  SERVICES.slice(0, n).forEach((s, i) => {
    const x = r.x + i * (w + gap);
    const col = s.status === "up" ? "green" : s.status === "degraded" ? "yellow" : "red";
    t.box(x, r.y, w, h, { title: s.name, sub: s.status === "up" ? "●" : s.status === "degraded" ? "◐" : "○", corners: "heavy", style: { fg: state.svcSel === i ? "line2" : "line" } });
    const inner = { x: x + 1, y: r.y + 1, w: w - 2, h: h - 2 };
    if (inner.w < 6 || inner.h < 2) return;
    t.spark(inner.x, inner.y, inner.w, Math.max(1, inner.h - 1), s.hist.slice(-inner.w), { fg: col });
    t.text(inner.x, r.y, pad(s.name, Math.max(0, w - 4)), t.attr({ fg: state.svcSel === i ? "accent" : "fg", b: true }));
    t.text(inner.x, inner.y + inner.h - 1, `${Math.round(s.qps)}q ${Math.round(s.p95)}ms`, t.attr({ fg: "faint" }));
    t.hit(x, r.y, w, h, () => { state.svcSel = i; state.tab = 0; }, "tile");
  });
}

/**
 * On a phone there is no room for tiles side by side, so the same six services become a table:
 * one block of three rows each, with the p95 sparkline across the width. Same data, other shape.
 */
function drawTileList(t, r) {
  const inner = { x: r.x, y: r.y, w: r.w, h: r.h };
  SERVICES.forEach((s, i) => {
    const y = inner.y + i * 3;
    if (y + 2 > inner.y + inner.h) return;
    const col = s.status === "up" ? "green" : s.status === "degraded" ? "yellow" : "red";
    const on = state.svcSel === i;
    t.text(inner.x, y, `${on ? "▸" : " "} ${pad(s.name, 9)} ${s.status === "up" ? "●" : s.status === "degraded" ? "◐" : "○"} ${pad(s.team, 9)}`,
      t.attr({ fg: on ? "bg" : col, bg: on ? "accent" : null, b: true }));
    t.spark(inner.x, y + 1, Math.max(8, inner.w - 14), 1, s.hist.slice(-(inner.w - 14)), { fg: col });
    t.text(inner.x + Math.max(8, inner.w - 14) + 1, y + 1, `${Math.round(s.qps)}q ${Math.round(s.p95)}ms`, t.attr({ fg: on ? "bg" : "faint" }));
    t.text(inner.x + 2, y + 2, `restarts ${s.restarts} · p95 5m`, t.attr({ fg: on ? "bg" : "faint" }));
    t.hit(inner.x, y, inner.w, 3, () => { state.svcSel = i; }, "tile");
  });
  // the cluster rollup under the list: the number you actually want after six rows of detail
  const y0 = inner.y + SERVICES.length * 3 + 1;
  if (y0 + 4 <= inner.y + inner.h) {
    const qps = SERVICES.reduce((a, x) => a + x.qps, 0);
    const p95 = SERVICES.reduce((a, x) => a + x.p95, 0) / SERVICES.length;
    const healthy = SERVICES.filter((x) => x.status === "up").length;
    t.hline(inner.x, y0, inner.w, "─", t.attr({ fg: "line" }));
    t.text(inner.x, y0 + 1, "cluster", t.attr({ fg: "faint", b: true }));
    t.text(inner.x + 9, y0 + 1, `${(qps / 1000).toFixed(2)}k q/s · mean p95 ${Math.round(p95)}ms`, t.attr({ fg: "fg" }));
    t.text(inner.x, y0 + 2, "healthy", t.attr({ fg: "faint", b: true }));
    t.bar(inner.x + 9, y0 + 2, Math.max(8, inner.w - 16), healthy / SERVICES.length, { fg: healthy === SERVICES.length ? "green" : "yellow", track: "░", trackFg: "line" });
    t.text(inner.x + Math.max(8, inner.w - 16) + 10, y0 + 2, `${healthy}/${SERVICES.length}`, t.attr({ fg: healthy === SERVICES.length ? "green" : "yellow" }));
    const bad = SERVICES.filter((x) => x.status !== "up").map((x) => `${x.name} ${x.status}`);
    t.text(inner.x, y0 + 3, bad.length ? `alerting: ${bad.join(", ")}` : "no service alerting", t.attr({ fg: bad.length ? "yellow" : "green" }));
    t.text(inner.x, y0 + 4, `region prod-eu1 · 3 nodes · scrape 15s`, t.attr({ fg: "faint" }));
    // the rest of a phone screen shows the tail, so the tiles tab is not a dead end
    const y1 = y0 + 6;
    if (y1 + 2 <= inner.y + inner.h) {
      t.hline(inner.x, y1 - 1, inner.w, "─", t.attr({ fg: "line2" }));
      t.text(inner.x, y1, "last lines", t.attr({ fg: "faint", b: true }));
      const n = Math.max(1, inner.y + inner.h - y1 - 2);
      state.logs.slice(-n).forEach((e, i) => {
        t.text(inner.x, y1 + 1 + i, `${e.time} ${pad(e.svc, 8)} ${e.msg}`.slice(0, inner.w),
          t.attr({ fg: e.level === "error" ? "red" : e.level === "warn" ? "yellow" : "dim" }));
      });
    }
  }
}

function drawLogs(t, r, focused) {
  const list = shown();
  t.box(r.x, r.y, r.w, r.h, {
    title: `logs ${list.length}/${state.logs.length}`,
    sub: `${state.level === "all" ? "all levels" : state.level}${state.filter ? ` · “${state.filter}”` : ""}${state.follow ? " · follow" : " · held"}${state.paused ? " · PAUSED" : ""}`,
    corners: "heavy", style: { fg: focused ? "line2" : "line" },
  });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 2) return;
  const top = state.follow ? Math.max(0, list.length - inner.h) : clamp(state.sel - Math.floor(inner.h / 2), 0, Math.max(0, list.length - inner.h));
  for (let i = 0; i < inner.h; i++) {
    const l = list[top + i];
    const y = inner.y + i;
    if (!l) continue;
    const sel = state.follow ? false : top + i === state.sel;
    const bg = sel ? "line2" : null;
    const put = (x, s, col, extra = {}) => t.text(x, y, s, t.attr(sel ? { fg: "bg", bg: "line2", b: true } : { fg: col, ...extra }));
    put(inner.x, l.t, bg ? "bg" : "faint");
    put(inner.x + 12, pad(l.level, 5), bg ? "bg" : LEVEL_COL[l.level], { b: l.level === "error" });
    put(inner.x + 18, pad(l.svc, 8), bg ? "bg" : "purple");
    const bodyX = inner.x + 27;
    if (l.level === "error") put(bodyX, l.msg.slice(0, inner.w - 27), bg ? "bg" : "red");
    else if (l.level === "warn") put(bodyX, l.msg.slice(0, inner.w - 27), bg ? "bg" : "yellow");
    else put(bodyX, l.msg.slice(0, inner.w - 27), bg ? "bg" : "fg");
    t.hit(inner.x, y, inner.w, 1, () => { state.follow = false; state.sel = top + i; state.expanded = state.sel === top + i ? state.expanded : null; }, "log");
  }
  state.sel = clamp(state.sel, 0, Math.max(0, list.length - 1));

  const l = list[state.sel];
  if (state.expanded != null && l) {
    const w = Math.min(inner.w, 56), h = Math.min(inner.h - 2, 6);
    const bx = inner.x + 1, by = inner.y + 1;
    t.box(bx, by, w, h, { title: `${l.svc} · ${l.level}`, sub: l.t, corners: "heavy", style: { fg: "accent" } });
    const lines = [
      `{ "ts": "${l.t}",`,
      `  "svc": "${l.svc}", "host": "${l.host}",`,
      `  "level": "${l.level}", "dur_ms": ${l.dur},`,
      `  "trace": "${l.trace}",`,
      `  "msg": "${l.msg}" }`,
    ];
    lines.slice(0, h - 2).forEach((ln, i) => t.text(bx + 2, by + 1 + i, ln.slice(0, w - 4), t.attr({ fg: i === 4 ? "green" : "cyan" })));
  }
}

function drawAlerts(t, r, focused) {
  t.box(r.x, r.y, r.w, r.h, { title: "alerts", sub: `${state.alerts.filter((a) => !a.acked).length} open`, corners: "heavy", style: { fg: focused ? "line2" : "line" } });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 1) return;
  state.alerts.forEach((a, i) => {
    const y = inner.y + i * 3;
    if (y + 2 > inner.y + inner.h) return;
    const col = a.acked ? "faint" : a.sev === "crit" ? "red" : "yellow";
    const on = focused && state.alertSel === i;
    t.text(inner.x, y, `${a.acked ? "✓" : "!"} ${pad(a.sev, 4)} ${a.svc}`, t.attr({ fg: on ? "bg" : col, bg: on ? "accent" : null, b: !a.acked }));
    const words = a.text.split(" ");
    let line = "", ly = y + 1;
    for (const wd of words) {
      if ((line + " " + wd).trim().length > inner.w - 2) { t.text(inner.x + 2, ly++, line, t.attr({ fg: on ? "bg" : "dim" })); line = wd; }
      else line = (line + " " + wd).trim();
      if (ly > inner.y + inner.h - 1) break;
    }
    if (line && ly <= inner.y + inner.h - 1) t.text(inner.x + 2, ly, line, t.attr({ fg: on ? "bg" : "dim" }));
    t.hit(inner.x, y, inner.w, 3, () => { state.alertSel = i; state.tab = 2; }, "alert");
  });
}

function draw(t, dt) {
  t.clear();
  if (!state.paused) {
    state.acc += dt;
    while (state.acc > 0.42) {
      state.acc -= 0.42;
      state.logs.push(makeLine());
      state.linesIn++;
      if (state.logs.length > 900) state.logs.shift();
      for (const s of SERVICES) {
        const drift = (rand() - 0.48) * (s.status === "up" ? 14 : 40);
        s.p95 = clamp(s.p95 + drift, 8, 900);
        s.qps = clamp(s.qps + (rand() - 0.5) * s.qps * 0.16, 1, 4000);
        s.hist.push(s.p95); s.hist.shift();
        s.qpsHist.push(s.qps); s.qpsHist.shift();
      }
      if (rand() < 0.03) {
        const s = SERVICES[Math.floor(rand() * SERVICES.length)];
        if (s.status === "up" && rand() < 0.4) s.status = "degraded";
        else if (s.status === "degraded" && rand() < 0.5) s.status = "up";
      }
      if (rand() < 0.02 && state.alerts.length < 9) {
        const s = SERVICES[Math.floor(rand() * SERVICES.length)];
        state.alerts.push({ id: "a" + state.alerts.length + "_" + state.seq, sev: rand() < 0.3 ? "crit" : "warn", svc: s.name, text: fmt(MSGS.warn[Math.floor(rand() * MSGS.warn.length)]), ts: ts(state.seq * 380), acked: false });
      }
    }
  }

  const compact = t.cols < 96;
  const body = { x: 0, y: 1, w: t.cols - 1, h: t.rows - 2 };
  if (compact) {
    const tabs = ["tiles", "logs", "alerts"];
    let x = 1;
    tabs.forEach((label, i) => {
      const w = label.length + 4;
      const on = state.tab === i;
      t.text(x, 0, ` ${i + 1}:${label} `, t.attr({ fg: on ? "bg" : "dim", bg: on ? "accent" : null, b: on }));
      t.hit(x, 0, w, 1, () => (state.tab = i), "tab");
      x += w + 1;
    });
    t.text(0, 1, "─".repeat(t.cols), t.attr({ fg: "line" }));
    const r = { x: 0, y: 2, w: t.cols - 2, h: body.h - 1 };
    if (state.tab === 0) drawTileList(t, r);
    else if (state.tab === 1) drawLogs(t, r, true);
    else drawAlerts(t, r, true);
  } else {
    drawTiles(t, { x: 0, y: 1, w: t.cols - 1, h: 5 });
    const aw = Math.max(24, Math.min(38, Math.round(t.cols * 0.26)));
    drawLogs(t, { x: 0, y: 7, w: t.cols - aw - 2, h: body.h - 6 }, state.tab === 1);
    drawAlerts(t, { x: t.cols - aw - 1, y: 7, w: aw, h: body.h - 6 }, state.tab === 2);
  }

  const y = t.rows - 1;
  const down = SERVICES.filter((s) => s.status !== "up").length;
  t.status(y, state.searching ? [`search “${state.filter}▌”  esc clears`] : [
    `grid · ${SERVICES.length} services`,
    down ? `${down} not ok` : "all nominal",
    `${state.linesIn} lines`,
    state.paused ? "STREAM PAUSED" : state.follow ? "following" : "held",
    `filter ${state.level}${state.filter ? ` “${state.filter}”` : ""}`,
    `${state.alerts.filter((a) => !a.acked).length} alerts`,
  ], state.searching ? [] : ["j/k line · Enter json · f follow · 1-4 level · / search · A ack · r restart · p pause"],
  { bg: "line2", fg: "bg" });
}

/* ------------------------------------------------------------------ input */

function onKey(k) {
  if (state.searching) {
    if (k === "Esc") { state.searching = false; state.filter = ""; return true; }
    if (k === "Enter") { state.searching = false; return true; }
    if (k === "Backspace") { state.filter = state.filter.slice(0, -1); return true; }
    if (k.length === 1) { state.filter += k; state.follow = false; return true; }
    return true;
  }
  const list = shown();
  switch (k) {
    case "j": case "ArrowDown": state.follow = false; state.sel = clamp(state.sel + 1, 0, list.length - 1); state.tab = 1; return true;
    case "k": case "ArrowUp": state.follow = false; state.sel = clamp(state.sel - 1, 0, list.length - 1); state.tab = 1; return true;
    case "G": state.sel = list.length - 1; state.follow = true; return true;
    case "g": state.sel = 0; state.follow = false; return true;
    case "f": state.follow = !state.follow; window.tui.toast(state.follow ? "following the stream" : "stream held"); return true;
    case "p": state.paused = !state.paused; window.tui.toast(state.paused ? "stream paused" : "stream running"); return true;
    case "1": if (window.tui?.compact) { state.tab = 0; return true; } state.level = "debug"; state.sel = 0; return true;
    case "2": if (window.tui?.compact) { state.tab = 1; return true; } state.level = "info"; state.sel = 0; return true;
    case "3": if (window.tui?.compact) { state.tab = 2; return true; } state.level = "warn"; state.sel = 0; return true;
    case "4": state.level = "error"; state.sel = 0; return true;
    case "0": state.level = "all"; state.sel = 0; return true;
    case "Enter": {
      const l = list[state.sel];
      if (l) { state.expanded = state.expanded === l.id ? null : l.id; window.tui.toast(`trace ${l.trace.slice(0, 8)}… · ${l.host} · ${l.dur}ms`); }
      return true;
    }
    case "A": case "x": {
      const open = state.alerts.filter((a) => !a.acked);
      if (!open.length) { window.tui.toast("nothing to ack"); return true; }
      const a = open[Math.min(state.alertSel, open.length - 1)];
      a.acked = true; state.acks++;
      window.tui.toast(`acked ${a.sev} on ${a.svc}`);
      return true;
    }
    case "r": {
      const s = SERVICES[state.svcSel];
      s.status = "starting"; s.restarts++; state.restarts++;
      window.tui.toast(`restarting ${s.name}…`);
      setTimeout(() => {
        s.status = "up"; s.p95 = 20 + rand() * 40;
        state.logs.push({ id: ++state.seq, t: ts(state.seq * 380), level: "info", svc: s.name, msg: `started, listening on :8080 (pid ${1000 + Math.floor(rand() * 9000)})`, trace: "—", dur: 0, host: "node-01" });
        state.linesIn++;
      }, 1200);
      return true;
    }
    case "Tab": {
      state.tab = (state.tab + 1) % 3;
      return true;
    }
    case "/": state.searching = true; state.filter = ""; return true;
    case "q":
      window.tui.quit({ command: "grid", line: `${state.linesIn} log lines · ${state.acks} alert${state.acks === 1 ? "" : "s"} acked · ${state.restarts} restart${state.restarts === 1 ? "" : "s"}` });
      return true;
    default: return false;
  }
}

function onTap(x, y, tui) { return false; }

boot();

createTUI({
  name: "grid",
  sub: "— services & logs · prod-eu",
  font: '"Roboto Mono", ui-monospace, "DejaVu Sans Mono", monospace',
  size: 12.5, lh: 1.24, fps: 10, minCols: 34, compactAt: 96, scan: 0.14,
  palette: PAL,
  keys: [
    { k: "j", l: "down" }, { k: "k", l: "up" }, { k: "Enter", l: "json" }, "sep",
    { k: "f", l: "follow" }, { k: "p", l: "pause" }, { k: "2", l: "info" }, { k: "4", l: "err" }, { k: "0", l: "all" }, "sep",
    { k: "A", l: "ack" }, { k: "r", l: "restart" }, { k: "/", l: "search" }, { k: "Tab", l: "pane" }, { k: "q", l: "quit" },
  ],
  help: [
    ["j / k, ↑ ↓", "walk the log (this also stops the stream following the tail)"],
    ["g / G", "top of the buffer / back to the tail"],
    ["Enter", "expand the selected line as JSON: trace id, host, duration"],
    ["f / p", "follow on or off · pause the stream entirely"],
    ["1 2 3 4 0", "filter by level: debug, info, warn, error, all (on a phone 1-3 switch panes)"],
    ["/", "search the message and the service name"],
    ["A or x", "ack the selected alert"],
    ["r", "restart the selected service tile — it comes back through “starting”"],
    ["Tab", "tiles → logs → alerts"],
    ["q", "quit to the exit panel"],
  ],
  draw, onKey, onTap,
  pills: () => {
    const down = SERVICES.filter((s) => s.status !== "up").length;
    return { a: state.paused ? "paused" : `${state.linesIn} lines`, b: down ? `${down} not ok` : "nominal" };
  },
  state: () => ({
    lines: state.logs.length, shownLines: shown().length, level: state.level, filter: state.filter,
    follow: state.follow, paused: state.paused, sel: state.sel,
    selId: shown()[state.sel]?.id ?? null, expanded: state.expanded,
    alerts: state.alerts.length, open: state.alerts.filter((a) => !a.acked).length, acks: state.acks,
    restarts: state.restarts, notOk: SERVICES.filter((s) => s.status !== "up").length,
    svc: SERVICES[state.svcSel]?.name, svcStatus: SERVICES[state.svcSel]?.status,
    tab: state.tab, linesIn: state.linesIn,
  }),
  api: {
    level: (l) => { if (["all", "debug", "info", "warn", "error"].includes(l)) { state.level = l; state.sel = 0; } return state.level; },
    search: (s) => { state.filter = String(s ?? ""); state.follow = false; return shown().length; },
    follow: (v) => { state.follow = v === undefined ? !state.follow : !!v; return state.follow; },
    pause: (v) => { state.paused = v === undefined ? !state.paused : !!v; return state.paused; },
    select: (i) => { state.sel = clamp(+i, 0, Math.max(0, shown().length - 1)); state.follow = false; },
    expand: () => onKey("Enter"),
    ack: () => { onKey("A"); return state.acks; },
    restart: (i) => { if (i !== undefined) state.svcSel = clamp(+i, 0, SERVICES.length - 1); onKey("r"); return SERVICES[state.svcSel].status; },
    tab: (i) => { state.tab = clamp(+i, 0, 2); return state.tab; },
    feed: (n = 20) => { for (let i = 0; i < n; i++) { state.logs.push(makeLine()); state.linesIn++; } return state.logs.length; },
    quit: () => onKey("q"),
    resume: () => window.tui.resume(),
  },
});
