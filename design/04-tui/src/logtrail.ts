#!/usr/bin/env node
// logtrail — a terminal log explorer for a fictional API gateway fleet.
//
//   node src/logtrail.ts                 # run it for real (raw mode, keys)
//   node src/logtrail.ts --frame stream  # print one frame and exit (for the capture)
//
// Everything is drawn into a grid of lines with 24-bit colour, box drawing and
// quarter-block bars. No dependencies, no React, no curses.

type Lvl = "trace" | "debug" | "info" | "warn" | "error";
type Rec = {
  t: string; ms: number; lvl: Lvl; svc: string; msg: string; ep: string;
  lat: number; trace: string; span: string; k: Record<string, string>;
};

/* ── deterministic data ───────────────────────────────────────────── */
let seed = 20261016;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const SERVICES = ["gateway", "ledger", "scheduler", "rider-api", "driver-matching", "notify"];
const ENDPOINTS = [
  "POST /v2/fares/quote", "GET /v2/rides/active", "POST /v2/driver/heartbeat",
  "GET /v2/rider/eta", "POST /v2/notify/push", "GET /v2/ledger/balance",
  "POST /v2/auth/token", "GET /v2/city/zones",
];
const MESSAGES: Record<string, string[]> = {
  info: ["quote priced", "ride attached to driver", "heartbeat accepted", "eta recomputed", "push dispatched", "balance read", "token issued", "zones served"],
  debug: ["cache hit", "pool lease returned", "shard routing", "trace propagated", "retry budget 3/3"],
  warn: ["slow response from ledger", "queue depth 1 812", "token near expiry", "pool saturated, queuing", "clock skew 340 ms"],
  error: ["upstream timeout after 2 000 ms", "502 from rider-api", "circuit open for 30 s", "push channel rejected by APNs"],
  trace: ["payload 1.9 kB", "span 12 children", "gzip 412 → 118 B"],
};

function build(): Rec[] {
  const out: Rec[] = [];
  let sec = 0;
  for (let i = 0; i < 420; i++) {
    sec += rnd() * 0.55;
    const d = new Date(Date.parse("2026-10-16T06:08:02Z") + sec * 1000);
    const r = rnd();
    const lvl: Lvl = r > 0.955 ? "error" : r > 0.87 ? "warn" : r > 0.62 ? "info" : r > 0.36 ? "debug" : "trace";
    const ep = pick(ENDPOINTS);
    const svc = ep.includes("notify") ? "notify" : ep.includes("auth") ? "gateway" : ep.includes("driver") ? "driver-matching" : ep.includes("ledger") ? "ledger" : ep.includes("rides") ? "rider-api" : pick(SERVICES);
    const lat = lvl === "error" ? 1200 + rnd() * 1600 : lvl === "warn" ? 320 + rnd() * 900 : 6 + rnd() * 180;
    out.push({
      t: d.toISOString().slice(11, 23), ms: d.getTime(), lvl, svc,
      msg: pick(MESSAGES[lvl]), ep, lat: Math.round(lat),
      trace: (0x1a2b3c + i * 7919).toString(16).padStart(16, "0"),
      span: (0x40 + i % 64).toString(16).padStart(8, "0"),
      k: { pod: `${svc}-7c${i % 5}-${(i * 137).toString(36)}`, node: `node-${1 + (i % 6)}`, region: pick(["eu-west-1", "eu-west-1", "eu-central-1"]), code: lvl === "error" ? "502" : lvl === "warn" ? "249" : "200" },
    });
  }
  return out;
}
const ALL = build();
const COUNTS = (() => {
  const c: Record<Lvl, number> = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 };
  for (const r of ALL) c[r.lvl]++;
  return c;
})();

/* ── palettes ─────────────────────────────────────────────────────── */
type Pal = Record<string, string>;
const DARK: Pal = {
  ink: "dfe7ee", dim: "94a2ae", faint: "7d8b96", line: "4d6170", accent: "6fd4b8",
  accentDim: "4f9c88", gold: "e3b05c", red: "ef7d6b", blue: "7fa9e8", violet: "b693e6",
  sel: "1c3b36", selInk: "e9f5f1", panel: "151d24", chip: "24313a",
};
const LIGHT: Pal = {
  ink: "1d2831", dim: "5c6a75", faint: "5f6c77", line: "8f9ca6", accent: "0f6b57",
  accentDim: "4b8a78", gold: "8a5c07", red: "a63a27", blue: "2a5aa8", violet: "6b3fa0",
  sel: "d7e9e3", selInk: "10221d", panel: "ffffff", chip: "eef2f5",
};
const LEVEL: Record<Lvl, keyof Pal> = { trace: "faint", debug: "blue", info: "accent", warn: "gold", error: "red" };

/* ── small ANSI helpers ───────────────────────────────────────────── */
const rgb = (h: string) => h.match(/../g)!.map((x) => parseInt(x, 16)).join(";");
const fg = (h: string) => `\x1b[38;2;${rgb(h)}m`;
const bg = (h: string) => `\x1b[48;2;${rgb(h)}m`;
const RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m", REV = "\x1b[7m", ITAL = "\x1b[3m";
const vis = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").replace(/[‘’]/g, "'");
const clip = (s: string, n: number) => {
  const plain = vis(s);
  if (plain.length <= n) return s + " ".repeat(n - plain.length);
  // cut the visible text, keep the colour codes: walk the string, count visible chars
  let out = "", seen = 0, i = 0;
  while (i < s.length && seen < n - 1) {
    if (s[i] === "\x1b") { const j = s.indexOf("m", i); out += s.slice(i, j + 1); i = j + 1; continue; }
    out += s[i++]; seen++;
  }
  return out + "…";
};
const pad = (s: string, n: number, right = false) => {
  const p = vis(s);
  return right ? " ".repeat(Math.max(0, n - p.length)) + s : s + " ".repeat(Math.max(0, n - p.length));
};

/* ── widgets ──────────────────────────────────────────────────────── */
const BARS = "▁▂▃▄▅▆▇█";
/* two strips: volume in a teal ramp, severity as ticks on a dotted baseline */
function histogram(pal: Pal, sel: number): [string, string] {
  const buckets = new Array(60).fill(0);
  const warn = new Array(60).fill(false);
  const err = new Array(60).fill(false);
  const t0 = ALL[0].ms, span = (ALL.at(-1)!.ms - t0) / 60;
  for (const r of ALL) {
    const b = Math.min(59, Math.floor((r.ms - t0) / span));
    buckets[b]++;
    if (r.lvl === "error") err[b] = true;
    if (r.lvl === "warn") warn[b] = true;
  }
  const max = Math.max(...buckets);
  const top = buckets.map((v, i) => {
    const h = Math.max(1, Math.round((v / max) * 7));
    const live = i >= 54;
    const body = fg(live ? pal.accent : pal.accentDim) + BARS[h];
    return i === sel ? bg(pal.chip) + fg(pal.ink) + BARS[h] + RESET : body;
  }).join("") + RESET;
  const se = buckets.map((_, i) => (warn[i] ? 1 : 0) + (err[i] ? 2 : 0));
  const counts = new Array(60).fill(0);
  for (const r of ALL) { const b = Math.min(59, Math.floor((r.ms - t0) / span)); if (r.lvl === "warn" || r.lvl === "error") counts[b]++; }
  const maxSE = Math.max(...counts);
  const RAMP2 = "▁▂▃▄▅";
  const base = counts.map((v, i) => {
    const h = Math.max(1, Math.round((v / maxSE) * 4));
    return err[i] ? fg(pal.red) + BOLD + RAMP2[h] : warn[i] ? fg(pal.gold) + RAMP2[h] : fg(pal.line) + "▁";
  }).join("") + RESET;
  return [top, base];
}

const lvlChip = (lvl: Lvl, pal: Pal) => {
  const c: Record<Lvl, string> = { trace: pal.faint, debug: pal.blue, info: pal.accent, warn: pal.gold, error: pal.red };
  const ch: Record<Lvl, string> = { trace: "·", debug: "d", info: "i", warn: "!", error: "E" };
  return fg(c[lvl]) + BOLD + pad(ch[lvl], 1) + RESET;
};

const boxTop = (w: number, title: string, pal: Pal, right = "") => {
  const T = vis(title).length, R = vis(right).length;
  const d = Math.max(0, w - 5 - T - (right ? R + 1 : -1));
  return clip(fg(pal.line) + "┌" + fg(pal.faint) + BOLD + " " + title + " " + RESET + fg(pal.line) + "─".repeat(d) + (right ? fg(pal.faint) + " " + right + " " : "") + RESET + fg(pal.line) + "┐", w);
};
const boxBot = (w: number, pal: Pal, left = "") => {
  const L2 = vis(left).length;
  const d = Math.max(0, w - 5 - L2 - (left ? 0 : -1));
  return clip(fg(pal.line) + "└" + (left ? fg(pal.faint) + " " + left + " " : "") + RESET + fg(pal.line) + "─".repeat(d) + "┘", w);
};
const boxMid = (w: number, pal: Pal) => fg(pal.line) + "├" + "─".repeat(w - 2) + "┤" + RESET;

/* ── the view model ───────────────────────────────────────────────── */
type View = "stream" | "endpoints" | "help";
type SortKey = "n" | "p50" | "p95" | "err" | "ep";
type State = { view: View; sel: number; filter: string; theme: keyof typeof themes; frozen: boolean; histSel: number; q: string; sort: SortKey; dir: 1 | -1 };
const themes = { dark: DARK, light: LIGHT };

function filtered(st: State): Rec[] {
  const toks = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return ALL.filter(() => !st.filter.includes("0="));
  return ALL.filter((r) => toks.every((t) => {
    if (t.includes("=")) { const [k, v] = t.split("=", 2); const val = k === "lvl" ? r.lvl : k === "svc" ? r.svc : k === "ep" ? r.ep : k === "code" ? r.k.code : ""; return val.toLowerCase().includes(v); }
    return (r.msg + " " + r.ep + " " + r.svc + " " + r.trace).toLowerCase().includes(t);
  }));
}

/* ── the frame ────────────────────────────────────────────────────── */
function frame(input: State, colsIn: number, rowsIn: number): string {
  const st = input;
  const cols = Math.max(48, Math.round(colsIn || 148)), rows = Math.max(12, Math.round(rowsIn || 40));
  const pal = themes[st.theme];
  const L: string[] = [];
  const rowsShown = Math.max(6, rows - 6);
  const list = filtered(st);
  const sel = Math.min(st.sel, Math.max(0, list.length - 1));
  const wide = cols >= 128;
  const detailW = wide ? 44 : 0;
  const listW = cols - (wide ? detailW + 1 : 0);
  const compact = cols < 100;

  /* app bar */
  const tabs: [View, string][] = [["stream", "1 stream"], ["endpoints", "2 endpoints"], ["help", "3 help"]];
  const tabsLine = tabs.map(([v, label]) => (v === st.view ? bg(pal.accent) + fg(st.theme === "dark" ? "08201a" : "ffffff") + BOLD + " " + label + " " + RESET : fg(pal.dim) + " " + label + " " + RESET)).join(" ");
  const clock = st.frozen ? fg(pal.gold) + BOLD + "FROZEN 06:12:44" + RESET : fg(pal.accent) + "● live" + RESET;
  const tabsSm = tabs.map(([v, label]) => {
    const short = label.split(" ")[1] === "stream" ? "tail" : label.split(" ")[1] === "endpoints" ? "routes" : "help";
    return v === st.view ? bg(pal.accent) + fg(st.theme === "dark" ? "08201a" : "ffffff") + BOLD + " " + short + " " + RESET : fg(pal.dim) + " " + short + " " + RESET;
  }).join(" ");
  const bar1 =
    bg(pal.accent) + fg(st.theme === "dark" ? "08201a" : "ffffff") + BOLD + " logtrail " + RESET +
    " " + fg(pal.ink) + BOLD + "harbour-gateway" + RESET + (compact ? "" : " " + fg(pal.faint) + "· 6 services · eu-west-1" + RESET) +
    "  " + (compact ? tabsSm : tabsLine) + "  " + " ".repeat(Math.max(0, cols - 34 - 66 - 12)) + clock + (compact ? "" : fg(pal.faint) + "  1 284 ln/min" + RESET);
  L.push(clip(bar1, cols));

  /* filter line */
  const counts = ["trace", "debug", "info", "warn", "error"].map((k) => {
    const n = COUNTS[k as Lvl];
    return fg(pal[LEVEL[k as Lvl]]) + k[0] + " " + n + RESET;
  }).join(" " + fg(pal.line) + "│" + RESET + " ");
  const filterLine = fg(pal.accent) + "/" + RESET + " " + fg(pal.ink) + (st.q || fg(pal.faint) + "filter: lvl=warn svc=gateway  substring" + RESET) +
    "  " + fg(pal.dim) + list.length + " of " + ALL.length + " lines" + RESET + (compact ? "" : "  " + counts);
  L.push(clip(filterLine, cols));

  if (st.view === "endpoints") {
    L.push(...endpointsView(st, list, cols, rowsShown, pal));
  } else {
    const w = { time: 9, lvl: 5, svc: 15, ep: 24, ms: 6 };
    const start = Math.max(0, Math.min(sel - Math.floor((rowsShown - 3) / 2), list.length - (rowsShown - 3)));

    /* list pane, exactly rowsShown lines of exactly listW visible cells */
    const P: string[] = [];
    P.push(boxTop(listW, "tail", pal, st.frozen ? "" : "10 s buckets"));
    P.push(clip(fg(pal.line) + "│" + RESET + fg(pal.faint) + " " + (compact ? pad("time", w.time) + " " + pad("level", w.lvl) + " " + pad("service", w.svc) + " message" : pad("time", w.time) + " " + pad("level", w.lvl) + " " + pad("service", w.svc) + " " + pad("endpoint", w.ep) + " " + pad("ms", w.ms, true) + "  message") + RESET, listW - 1) + fg(pal.line) + "│");
    P.push(clip(fg(pal.line) + "├" + "─".repeat(Math.max(0, listW - 2)) + "┤", listW));
    for (let i = 0; i < rowsShown - 4; i++) {
      const r = list[start + i];
      if (!r) {
        P.push(clip(fg(pal.line) + "│" + RESET + (i === 0 && !list.length
          ? fg(pal.gold) + BOLD + " ∅ no line matches " + RESET + fg(pal.ink) + "“" + st.q + "”" + RESET + fg(pal.dim) + "   press / to edit, Esc to clear" + RESET
          : i === 1 && !list.length ? fg(pal.faint) + "   levels in this window: warn " + COUNTS.warn + ", error " + COUNTS.error + RESET : ""), listW - 1) + fg(pal.line) + "│");
        continue;
      }
      const on = start + i === sel;
      const s = (c: string, txt: string) => (on ? bg(pal.sel) + fg(c) + BOLD : fg(c)) + txt + RESET;
      const row =
        fg(pal.line) + "│" + RESET + (on ? bg(pal.sel) : "") + " " +
        (on ? fg(pal.selInk) + BOLD : fg(pal.faint)) + r.t.slice(0, 8) + RESET + " " +
        (r.lvl === "error" ? s(pal.red, pad(r.lvl, w.lvl)) : r.lvl === "warn" ? s(pal.gold, pad(r.lvl, w.lvl)) : r.lvl === "debug" ? s(pal.blue, pad(r.lvl, w.lvl)) : r.lvl === "trace" ? s(pal.faint, pad(r.lvl, w.lvl)) : s(pal.accent, pad(r.lvl, w.lvl))) + " " +
        s(on ? pal.selInk : pal.dim, pad(r.svc, w.svc)) + " " +
        (compact
          ? s(on ? pal.selInk : pal.ink, clip(r.msg, listW - 39))
          : s(on ? pal.selInk : pal.ink, pad(r.ep, w.ep)) + " " +
            (on ? bg(pal.sel) : "") + (r.lat > 900 ? fg(pal.red) : r.lat > 300 ? fg(pal.gold) : fg(pal.dim)) + pad(String(r.lat), w.ms, true) + RESET + "  " +
            s(on ? pal.selInk : pal.dim, clip(r.msg, listW - 74)));
      P.push(clip(row, listW - 1) + fg(pal.line) + "│");
    }
    const pct = list.length ? Math.round(((sel + 1) / list.length) * 100) : 0;
    P.push(clip(fg(pal.line) + "│" + RESET + fg(pal.faint) + " " + (sel + 1) + "/" + list.length + "  " + pct + "%  " + (st.frozen ? "tail frozen, buffer filling" : "following") + RESET, listW - 1) + fg(pal.line) + "│");
    P.push(boxBot(listW, pal, st.frozen ? "f" : "j k / f t ?"));

    const D = wide ? detailPane(list[sel], detailW, rowsShown, pal) : [];
    for (let i = 0; i < rowsShown; i++) L.push(clip((P[i] ?? "") + (wide ? (D[i] ?? "") : ""), cols));
  }

  /* volume + status */
  const [vol, sev] = histogram(pal, st.histSel);
  const nWarn = warnCount(), nErr = ALL.filter((r) => r.lvl === "error").length;
  L.push(clip(fg(pal.faint) + " volume" + RESET + " " + vol + (compact ? "" : fg(pal.faint) + "  lines per 10 s · 06:08 → 06:12" + RESET), cols));
  L.push(clip(fg(pal.faint) + " severity" + RESET + " " + sev + (compact ? "" : fg(pal.faint) + "  warn+error per 10 s · " + RESET + fg(pal.red) + BOLD + "red" + RESET + fg(pal.faint) + " = the bucket holds an error · " + nWarn + " w " + nErr + " e in the window" + RESET), cols));
  const keys = st.view === "help"
    ? fg(pal.gold) + "esc: close help" + RESET
    : fg(pal.dim) + "j/k" + RESET + fg(pal.faint) + " move  " + RESET + fg(pal.dim) + "g/G" + RESET + fg(pal.faint) + " jump  " + RESET + fg(pal.dim) + "/" + RESET + fg(pal.faint) + " filter  " + RESET + fg(pal.dim) + "f" + RESET + fg(pal.faint) + " freeze  " + RESET + fg(pal.dim) + "t" + RESET + fg(pal.faint) + " theme  " + RESET + fg(pal.dim) + "?" + RESET + fg(pal.faint) + " help  " + RESET + fg(pal.dim) + "q" + RESET + fg(pal.faint) + " quit" + RESET;
  L.push(clip(bg(pal.chip) + fg(pal.ink) + " " + keys + RESET, cols));

  if (st.view === "help") {
    const box = helpOverlay(cols, rowsShown, pal);
    for (let i = 0; i < box.length; i++) if (box[i]) L[3 + i] = clip(box[i], cols);
  }
  return L.join("\n");
}

const warnCount = () => ALL.filter((r) => r.lvl === "warn").length;

/* the right-hand pane: the selected line, decomposed */
function detailPane(r: Rec | undefined, w: number, rowsShown: number, pal: Pal): string[] {
  const D: string[] = [];
  const cell = (body: string) => " " + pad(body, w - 3) + fg(pal.line) + "│" + RESET;   // the list pane draws the shared left rule
  const rule = () => " " + fg(pal.line) + "├" + "─".repeat(Math.max(0, w - 3)) + "┤" + RESET;
  D.push(" " + boxTop(w - 1, "line", pal, r ? r.lvl : ""));
  if (!r) {
    D.push(cell(fg(pal.dim) + "  nothing selected" + RESET));
    for (let i = 1; i < rowsShown - 3; i++) D.push(cell(""));
    D.push(boxBot(w, pal, "enter copy"));
    return D;
  }
  const kv: [string, string][] = [
    ["time", r.t], ["level", r.lvl], ["service", r.svc], ["endpoint", r.ep],
    ["status", r.k.code], ["latency", r.lat + " ms"], ["trace", r.trace], ["span", r.span],
    ["pod", r.k.pod], ["node", r.k.node], ["region", r.k.region],
  ];
  D.push(cell(bg(pal.chip) + fg(pal.ink) + BOLD + " " + clip(r.msg, w - 3) + RESET));
  D.push(cell(fg(pal.dim) + "  " + r.ep + RESET));
  D.push(rule());
  for (const [k, v] of kv) D.push(cell(fg(pal.faint) + "  " + pad(k, 9) + RESET + fg(pal.ink) + clip(v, w - 14)));
  D.push(clip(fg(pal.line) + "├" + "─".repeat(w - 2) + "┤", w));
  const lat = ALL.filter((x) => x.ep === r.ep).slice(-26).map((x) => x.lat);
  const mx = Math.max(...lat);
  D.push(cell(pad(fg(pal.faint) + "  latency, last " + lat.length + RESET, w - 12 - String(mx).length) + fg(pal.dim) + "max " + mx + RESET));
  D.push(cell("  " + lat.map((v) => (v > 900 ? fg(pal.red) : v > 300 ? fg(pal.gold) : fg(pal.accent)) + BARS[Math.max(1, Math.round((v / mx) * 7))]).join("") + RESET));
  D.push(cell(fg(pal.faint) + "  06:11:58 → 06:12:44" + RESET));
  D.push(clip(fg(pal.line) + "├" + "─".repeat(w - 2) + "┤", w));
  const json = [`{ "ep": "${r.ep.split(" ")[1]}",`, `  "lat": ${r.lat}, "code": ${r.k.code},`, `  "trace": "${r.trace}" }`];
  for (const j of json) D.push(cell(fg(pal.faint) + "  " + j + RESET));
  for (let i = D.length; i < rowsShown - 2; i++) D.push(cell(""));
  D.push(cell(fg(pal.accent) + "  o" + RESET + fg(pal.faint) + " open trace · " + RESET + fg(pal.accent) + "enter" + RESET + fg(pal.faint) + " copy line" + RESET));
  D.push(" " + boxBot(w - 1, pal, "esc clears"));
  return D;
}

function endpointsView(st: State, list: Rec[], cols: number, rowsShown: number, pal: Pal): string[] {
  const by = new Map<string, { n: number; err: number; warn: number; lat: number[]; svc: string }>();
  for (const r of list) {
    const e = by.get(r.ep) ?? { n: 0, err: 0, warn: 0, lat: [], svc: r.svc };
    e.n++; e.lat.push(r.lat); if (r.lvl === "error") e.err++; if (r.lvl === "warn") e.warn++;
    by.set(r.ep, e);
  }
  const rows = [...by.entries()].map(([ep, e]) => {
    const q = e.lat.slice().sort((a, b) => a - b);
    return { ep, svc: e.svc, n: e.n, err: e.err, warn: e.warn, p50: q[Math.floor(q.length / 2)], p95: q[Math.floor(q.length * 0.95)], max: q.at(-1)!, last: e.lat.slice(-20) };
  });
  const key = st.sort, dir = st.dir;
  rows.sort((a, b) => (key === "ep" ? String(a.ep).localeCompare(String(b.ep)) : (a[key] as number) - (b[key] as number)) * dir);
  const maxN = Math.max(...rows.map((r) => r.n));
  const mark = (k: SortKey, label: string) => (k === key ? fg(pal.accent) + BOLD + label + (dir < 0 ? "▼" : "▲") + RESET : fg(pal.faint) + label + RESET);
  const head = boxTop(cols, "endpoints", pal, `${rows.length} routes · 4 min · s cycles the sort, S reverses`);
  const hdr = mark("ep", "endpoint") + fg(pal.faint) + " " + pad("service", 15) + " " + mark("n", pad("n", 5, true)) + "  " + mark("p50", pad("p50", 5, true)) + " " + mark("p95", pad("p95", 5, true)) + " " + pad("max", 6, true) + "  " + pad("warn", 5, true) + " " + mark("err", pad("err", 4, true)) + "  share" + "  the last 20 requests on this route";
  const out = [head, clip(fg(pal.line) + "│" + RESET + fg(pal.faint) + " " + hdr + RESET, Math.max(2, cols - 1)) + fg(pal.line) + "│", clip(fg(pal.line) + "├" + "─".repeat(Math.max(0, cols - 2)) + "┤", cols)];
  rows.forEach((r, i) => {
    const on = i === Math.min(st.sel, rows.length - 1);
    const bar = "█".repeat(Math.max(1, Math.round((r.n / maxN) * 18)));
    const line =
      (on ? bg(pal.sel) : "") + fg(pal.line) + "│" + RESET + (on ? bg(pal.sel) + fg(pal.selInk) + BOLD : fg(pal.ink)) + " " + pad(r.ep, 24) + RESET + " " +
      (on ? bg(pal.sel) + fg(pal.selInk) : fg(pal.dim)) + pad(r.svc, 15) + RESET + " " +
      (on ? bg(pal.sel) : "") + fg(pal.ink) + pad(String(r.n), 5, true) + RESET + "  " +
      (r.p50 > 300 ? fg(pal.gold) : fg(pal.dim)) + pad(String(r.p50), 5, true) + RESET + " " +
      (r.p95 > 900 ? fg(pal.red) : fg(pal.gold)) + pad(String(r.p95), 5, true) + RESET + " " +
      fg(pal.dim) + pad(String(r.max), 6, true) + RESET + "  " +
      fg(r.warn ? pal.gold : pal.faint) + pad(String(r.warn), 5, true) + RESET + " " +
      fg(r.err ? pal.red : pal.faint) + pad(String(r.err), 4, true) + RESET + "  " +
      fg(pal.accent) + bar + RESET + "  " +
      (() => { const mx = Math.max(...r.last); return r.last.map((v) => (v > 900 ? fg(pal.red) : v > 300 ? fg(pal.gold) : fg(on ? pal.selInk : pal.accentDim)) + BARS[Math.max(1, Math.round((v / mx) * 7))]).join("") + RESET; })() + (on ? RESET : "");
    out.push(clip(line, cols - 1) + fg(pal.line) + "│");
  });
  for (let i = rows.length; i < rowsShown - 3; i++) out.push(clip(fg(pal.line) + "│" + RESET + (i === rows.length
    ? fg(pal.faint) + " colour is the signal: p95 over 900 ms is red, over 300 ms is amber" + RESET
    : i === rows.length + 1 ? fg(pal.faint) + " the filter on the line above applies here too — try lvl=error" + RESET : ""), cols - 1) + fg(pal.line) + "│");
  out.push(boxBot(cols, pal, "s: sort · S: reverse · enter: copy route"));
  return out;
}

function helpOverlay(cols: number, rowsShown: number, pal: Pal): string[] {
  const W = Math.min(72, cols - 2), H = 15;
  const keys: [string, string][] = [
    ["j k ↑ ↓", "move the selection one line"],
    ["g G", "jump to the oldest / newest line"],
    ["/", "edit the filter: lvl=warn svc=gateway, or a substring"],
    ["Esc", "clear the filter, close overlays"],
    ["f", "freeze the tail (the buffer keeps filling)"],
    ["t", "light / dark palette, for a bright terminal"],
    ["1 2 3", "stream · endpoints · help"],
    ["s S", "cycle the sort column in endpoints, reverse the order"],
    ["enter", "copy the selected line to the clipboard"],
    ["o", "open the trace id in the trace viewer"],
    ["q", "quit"],
  ];
  const x = Math.floor((cols - W) / 2);
  const left = " ".repeat(x);
  const row = (body: string) => left + clip(fg(pal.line) + "│" + RESET + body + fg(pal.line) + "│", W);
  const out: string[] = [];
  out.push(left + boxTop(W, "keys", pal, "logtrail 0.9.2"));
  out.push(row(fg(pal.faint) + " nine keys, no mouse — the bottom bar repeats them" + RESET));
  out.push(left + clip(fg(pal.line) + "├" + "─".repeat(Math.max(0, W - 2)) + "┤", W));
  for (const [k, v] of keys) out.push(row(fg(pal.accent) + BOLD + " " + pad(k, 10) + RESET + fg(pal.ink) + clip(v, W - 14)));
  out.push(left + boxBot(W, pal, "? toggles this panel"));
  const merged: string[] = [];
  for (let i = 0; i < rowsShown; i++) merged.push(out[i] ?? "");
  return merged;
}

/* ── frames for the capture ───────────────────────────────────────── */
const FRAMES: Record<string, { state: Partial<State>; cols: number; rows: number }> = {
  stream: { state: { view: "stream", sel: 268 }, cols: 148, rows: 40 },
  endpoints: { state: { view: "endpoints", sel: 2 }, cols: 148, rows: 22 },
  help: { state: { view: "help", sel: 210 }, cols: 148, rows: 34 },
  filtered: { state: { view: "stream", sel: 3, q: "lvl=warn svc=ledger" }, cols: 148, rows: 30 },
  empty: { state: { view: "stream", sel: 0, q: "lvl=error svc=scheduler" }, cols: 148, rows: 26 },
  light: { state: { view: "stream", sel: 140, theme: "light" }, cols: 148, rows: 34 },
  narrow: { state: { view: "stream", sel: 60 }, cols: 80, rows: 24 },
  frozen: { state: { view: "stream", sel: 300, frozen: true, histSel: 58 }, cols: 148, rows: 34 },
};

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
if (arg("frame")) {
  const name = arg("frame")!;
  const f = FRAMES[name] ?? FRAMES.stream;
  const st: State = { view: "stream", sel: 0, filter: "", theme: "dark", frozen: false, histSel: -1, q: "", sort: "n", dir: -1, ...f.state };
  const cols = +(arg("cols") ?? f.cols), rows = +(arg("rows") ?? f.rows);
  process.stdout.write(frame(st, cols, rows) + "\n");
  process.exit(0);
}

/* ── run it live ──────────────────────────────────────────────────── */
const st: State = { view: "stream", sel: ALL.length - 12, filter: "", theme: "dark", frozen: false, histSel: -1, q: "", sort: "n", dir: -1 };
const draw = () => {
  const [cols, rows] = [process.stdout.columns || 148, process.stdout.rows || 40];
  process.stdout.write("\x1b[H\x1b[2J" + frame(st, cols, rows) + "\n");
};
if (!process.stdin.isTTY) { draw(); process.exit(0); }
process.stdin.setRawMode(true);
process.stdout.write("\x1b[?1049h\x1b[?25l");
draw();
const iv = setInterval(() => { if (!st.frozen) st.histSel = (st.histSel + 1) % 60; draw(); }, 900);
process.stdin.on("data", (b) => {
  const k = b.toString();
  const list = filtered(st);
  if (k === "q" || k === "\x03") { process.stdout.write("\x1b[?25h\x1b[?1049l\x1b[0m\n"); clearInterval(iv); process.exit(0); }
  if (k === "j" || k === "\x1b[B") st.sel = Math.min(list.length - 1, st.sel + 1);
  if (k === "k" || k === "\x1b[A") st.sel = Math.max(0, st.sel - 1);
  if (k === "G") st.sel = list.length - 1;
  if (k === "g") st.sel = 0;
  if (k === "1") st.view = "stream";
  if (k === "2") st.view = "endpoints";
  if (k === "3") st.view = "help";
  if (k === "?") st.view = st.view === "help" ? "stream" : "help";
  if (k === "t") st.theme = st.theme === "dark" ? "light" : "dark";
  if (k === "f") st.frozen = !st.frozen;
  if (k === "s") { const order: SortKey[] = ["n", "p95", "p50", "err", "ep"]; st.sort = order[(order.indexOf(st.sort) + 1) % order.length]; }
  if (k === "S") st.dir = st.dir === -1 ? 1 : -1;
  if (k === "\x1b") { st.q = ""; st.view = "stream"; }
  if (k === "\x7f") st.q = st.q.slice(0, -1);
  if (k === "\r") st.view = st.view === "help" ? "stream" : st.view;
  if (k.length === 1 && k >= " " && k !== "q" && k !== "j" && k !== "k" && k !== "g" && k !== "G" && k !== "t" && k !== "f" && k !== "?" && k !== "1" && k !== "2" && k !== "3") st.q += k;
  draw();
});
