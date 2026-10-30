// pulse — tui/1: a btop-style system monitor.
//
// The numbers are a simulation, but a coherent one: the machine has 8 cores, a fixed process set whose
// CPU shares wander, and the total load in the CPU panel is the sum of the process shares, so the top
// bar and the table can never disagree. Everything is drawn from a seed, so the same frame comes back
// after a reload and the harness can drive it.
//
//   keys: j/k select · Enter inspect · s sort · k kill · f filter · p pause · 1-4 panel · t theme · q quit
import { createTUI, pad, pad0, clamp, humanBytes, clock, rng } from "../shared/tui.js";

const CORES = 8, HIST = 96;
const rand = rng(20261030);

const THEMES = {
  midnight: {
    pageBg: "#050810", screenBg: "#080d18", panel: "#0b1120", well: "#0a0f1c", line: "#1c2b45",
    fg: "#dceaf7", dim: "#8ea6c2", faint: "#5b7292", accent: "#5fe3c0", track: "#182543",
    green: "#5fe3c0", cyan: "#57c7ff", blue: "#7c9cff", magenta: "#f47ad0", red: "#ff6b7a",
    yellow: "#ffd166", orange: "#ffa657", line2: "#26405f",
  },
  phosphor: {
    pageBg: "#070602", screenBg: "#0d0a03", panel: "#120e05", well: "#100c04", line: "#3d2f10",
    fg: "#ffcf8a", dim: "#c79b57", faint: "#8e6d3b", accent: "#ffb347", track: "#2a2109",
    green: "#9ee06a", cyan: "#ffd08a", blue: "#ff9e57", magenta: "#ff8f6a", red: "#ff6a4d",
    yellow: "#ffd166", orange: "#ffa657", line2: "#5a4418",
  },
  graphite: {
    pageBg: "#0c0d10", screenBg: "#101216", panel: "#14171d", well: "#12151a", line: "#2a2f3a",
    fg: "#e6e9ef", dim: "#9aa3b2", faint: "#6b7482", accent: "#8ab4ff", track: "#1e222b",
    green: "#7fd39a", cyan: "#7ad3e8", blue: "#8ab4ff", magenta: "#d99bff", red: "#ff8088",
    yellow: "#e8d78a", orange: "#f0b07a", line2: "#3a4150",
  },
};

const KINDS = [
  // [name, user, base cpu %, base RSS, threads, command line] — the shares sum to ~50 %, so the
  // machine idles around half loaded and the total bar has somewhere to go
  ["strata-server", "jpl", 21, 4.1e9, 24, "strata serve --model qwen3.8-flash-next --port 18097"],
  ["pi", "jpl", 6, 3.2e8, 9, "pi -p --mode json --model strata/qwen3.8-flash-next"],
  ["node", "jpl", 4, 2.4e8, 11, "node tui/tools/check.mjs 1-monitor"],
  ["hyprland", "jpl", 3.5, 5.1e8, 14, "/usr/bin/hyprland"],
  ["firefox", "jpl", 5, 1.9e9, 62, "firefox --profile release"],
  ["chromium", "jpl", 3, 1.1e9, 41, "chromium --headless --use-angle=swiftshader"],
  ["postgres", "postgres", 2.5, 6.4e8, 18, "postgres -D /var/lib/postgres/data"],
  ["pipewire", "jpl", 0.6, 4.1e7, 7, "/usr/bin/pipewire"],
  ["herdr", "jpl", 1.2, 8.8e7, 12, "herdr workspace open --space strata-test"],
  ["blender", "jpl", 2, 1.4e9, 16, "blender --background shot.blend"],
  ["systemd", "root", 0.3, 2.2e7, 3, "/usr/lib/systemd/systemd --system"],
  ["rss-guard", "root", 0.15, 9.4e6, 2, "/usr/local/bin/rss-guard --interval 30s"],
  ["ttfd", "root", 0.1, 6.1e6, 1, "/usr/lib/ttfd"],
  ["shepherdr", "jpl", 0.9, 1.2e8, 8, "shepherdr serve --port 7787"],
];

const state = {
  t: 0, acc: 0, paused: false, theme: "midnight",
  panel: 0,                       // 0 cpu 1 mem 2 net 3 proc (also the phone tab)
  sort: "cpu", filter: "", filtering: false,
  sel: 0, inspect: null,
  cores: Array.from({ length: CORES }, (_, i) => ({
    hist: new Array(HIST).fill(6 + rand() * 20),
    drift: rand() * 6.28, bias: 4 + rand() * 10,
  })),
  mem: { used: new Array(HIST).fill(0), cache: 3.1e9, total: 1.28e11, swap: 1.1e9, swapTotal: 1.7e10, buf: 0.9e9 },
  net: { down: new Array(HIST).fill(0), up: new Array(HIST).fill(0), rx: 4.1e9, tx: 3.8e8, conns: 42 },
  disk: { read: new Array(HIST).fill(0), write: new Array(HIST).fill(0), rTot: 1.4e11, wTot: 6.2e10, busy: 0 },
  procs: [],
  peak: 0, killed: 0, uptime: 3 * 86400 + 4 * 3600 + 7 * 60 + 12,
  probe: 0,
};

function boot() {
  state.procs = KINDS.map(([name, user, cpu, rss, threads, cmd], i) => ({
    pid: 412 + Math.floor(rand() * 89000), name, user, threads, cmd,
    cpu, mem: rss, cpuBase: cpu, memBase: rss, state: "S", started: 30 + Math.floor(rand() * 86400 * 3),
    born: i,
  }));
  for (let i = 0; i < HIST; i++) step(0.25, i);
}

/** One 250 ms probe: everything that moves, moves here, and only here. */
function step(dt, n = 0) {
  state.t += dt; state.probe++;
  const wobble = (base, i, amp, speed = 1) => {
    const s = Math.sin(state.t * speed + i * 1.7) * 0.6 + Math.sin(state.t * speed * 0.31 + i) * 0.4;
    return clamp(base * (1 + s * amp) + (rand() - 0.5) * base * amp * 0.6, 0, 1e12);
  };
  for (const p of state.procs) {
    p.cpu = wobble(p.cpuBase, p.pid % 97, 0.55, 0.7);
    p.mem = wobble(p.memBase, p.pid % 61, 0.09, 0.12);
  }
  const totalCpu = clamp(state.procs.reduce((a, p) => a + p.cpu, 0) + 2 + rand() * 4, 0, 100);
  state.peak = Math.max(state.peak, totalCpu);
  for (let c = 0; c < CORES; c++) {
    const core = state.cores[c];
    // the machine's total is spread over the cores with each core's own bias and phase
    // each core wobbles around the machine total (a busy core reads busy), which is what a
    // per-core column means; averaging the column back gives the headline load
    const v = clamp(totalCpu + (core.bias - 9) * 4 + Math.sin(state.t * 1.6 + core.drift) * 12 + (rand() - 0.5) * 9, 0, 100);
    core.hist.push(v); core.hist.shift();
  }
  state.cpuTotal = totalCpu;
  const used = 3.6e10 + Math.sin(state.t * 0.18) * 4e9 + rand() * 1.2e9;
  state.mem.used.push(used); state.mem.used.shift();
  state.mem.cache = wobble(3.2e9, 3, 0.2, 0.1);
  const down = wobble(6.4e6, 1, 0.9, 1.1) * (Math.sin(state.t * 0.4) > -0.7 ? 1 : 0.05);
  const up = wobble(7.1e5, 2, 0.9, 1.4);
  state.net.down.push(down); state.net.down.shift();
  state.net.up.push(up); state.net.up.shift();
  state.net.rx += down * dt; state.net.tx += up * dt;
  state.net.conns = Math.round(clamp(state.net.conns + (rand() - 0.5) * 6, 12, 240));
  state.disk.read.push(wobble(1.1e6, 5, 1.2, 2.1)); state.disk.read.shift();
  state.disk.write.push(wobble(4.4e5, 7, 1.4, 1.7)); state.disk.write.shift();
  state.disk.rTot += state.disk.read.at(-1) * dt; state.disk.wTot += state.disk.write.at(-1) * dt;
  state.disk.busy = clamp(state.disk.busy + (rand() - 0.48) * 0.2, 0, 1);
  state.uptime += dt;
}

const views = ["cpu", "mem", "net", "proc"];
const sortedProcs = () => {
  const f = state.filter.toLowerCase();
  let list = state.procs.filter((p) => !f || p.name.includes(f) || p.user.includes(f) || String(p.pid).includes(f));
  const key = state.sort === "cpu" ? (p) => -p.cpu : state.sort === "mem" ? (p) => -p.mem : state.sort === "pid" ? (p) => p.pid : (p) => p.name;
  return list.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return typeof ka === "string" ? ka.localeCompare(kb) : ka - kb;
  });
};

const last = (a, n) => a.slice(-n);

/* ------------------------------------------------------------------ the panels */

function titleBar(t, x, y, w, label, right, focus) {
  const fg = focus ? "accent" : "dim";
  t.text(x, y, ` ${label} `, t.attr({ fg: focus ? "bg" : "fg", bg: focus ? "accent" : "line", b: true }));
  if (right) t.text(x + w - right.length - 1, y, right, t.attr({ fg, d: true }));
}

function drawCpu(t, r, focus) {
  t.box(r.x, r.y, r.w, r.h, { title: "cpu", sub: `load ${state.cpuTotal.toFixed(1)}%`, corners: "round", style: { fg: focus ? "line2" : "line" } });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 4 || inner.w < 18) return;
  // one average sparkline across the top, then one eighth-block bar per core, right-aligned percent
  const sparkH = clamp(inner.h - CORES - 2, 2, 3);
  const gw = Math.max(8, inner.w - 16);
  t.spark(inner.x, inner.y, gw, sparkH, last(avgHistory(state.cores.map((c) => c.hist)), 60), { fg: "cyan", max: 100 });
  t.text(inner.x + gw + 2, inner.y, `${state.cpuTotal.toFixed(0)}%`, t.attr({ fg: "cyan", b: true }));
  t.text(inner.x + gw + 2, inner.y + 1, `pk ${state.peak.toFixed(0)}%`, t.attr({ fg: "faint" }));

  const idxW = 2, numW = 4;
  const barX = inner.x + idxW + 1;
  const barW = Math.max(4, inner.w - idxW - numW - 3);
  for (let c = 0; c < CORES; c++) {
    const y = inner.y + sparkH + 1 + c;
    if (y > inner.y + inner.h - 1) break;
    const v = state.cores[c].hist.at(-1);
    const col = v > 85 ? "red" : v > 60 ? "magenta" : v > 30 ? "green" : "blue";
    t.text(barX - idxW, y, pad0(c, 2) + " ", t.attr({ fg: "faint" }));
    t.bar(barX, y, barW, v / 100, { fg: col, track: "░", trackFg: "track" });
    t.text(inner.x + inner.w - numW, y, pad0(Math.round(v), numW - 1) + "%", t.attr({ fg: v > 60 ? col : "dim" }));
  }
  // what the load is made of, and the rest of the /proc/stat line — the rows a phone screen has
  // room for and a wide layout puts in other panels
  const by = inner.y + sparkH + 1 + CORES + 1;
  if (by + 4 <= inner.y + inner.h) {
    const tot = state.cpuTotal;
    const parts = [["user", tot * 0.62, "cyan"], ["sys", tot * 0.22, "magenta"], ["io", tot * 0.09, "yellow"], ["irq", tot * 0.03, "red"]];
    t.hline(inner.x, by - 1, inner.w, "─", t.attr({ fg: "line2" }));
    t.text(inner.x, by, "breakdown", t.attr({ fg: "faint", b: true }));
    let bx = inner.x + 11;
    for (const [name, v, col] of parts) {
      const w = Math.max(0, Math.round((v / 100) * (inner.w - 12)));
      t.bar(bx, by, w, 1, { fg: col });
      t.text(bx, by + 1, `${name} ${v.toFixed(1)}%`, t.attr({ fg: col }));
      bx += w + 1;
    }
    t.bar(bx, by, Math.max(0, inner.x + inner.w - bx - 6), 0, { track: "░", trackFg: "track" });
    t.text(inner.x + inner.w - 5, by, `${(100 - tot).toFixed(0)}%`, t.attr({ fg: "faint" }));
    t.text(inner.x, by + 2, `idle ${(100 - tot).toFixed(1)}% · steal ${(tot * 0.02).toFixed(1)}% · guest 0.0%`, t.attr({ fg: "dim" }));
    t.text(inner.x, by + 3, `load 1m ${state.cpuTotal.toFixed(1)} · 5m ${(state.cpuTotal * 0.93).toFixed(1)} · 15m ${(state.cpuTotal * 0.81).toFixed(1)}`, t.attr({ fg: "dim" }));
    t.text(inner.x, by + 4, `freq 3.42GHz · temp ${Math.round(38 + tot * 0.35)}°C · gov schedutil`, t.attr({ fg: "faint" }));
  }
}

function avgHistory(hists) {
  const n = hists[0].length;
  return Array.from({ length: n }, (_, i) => hists.reduce((a, h) => a + h[i], 0) / hists.length);
}

function drawMem(t, r, focus) {
  t.box(r.x, r.y, r.w, r.h, { title: "memory", sub: `${(state.mem.total / 1e9).toFixed(0)} G`, corners: "round", style: { fg: focus ? "line2" : "line" } });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 3 || inner.w < 14) return;
  const used = state.mem.used.at(-1), pct = used / state.mem.total;
  const w = Math.min(inner.w - 1, 34);
  t.text(inner.x, inner.y, "used ", t.attr({ fg: "dim" }));
  t.bar(inner.x + 5, inner.y, w, pct, { fg: pct > 0.9 ? "red" : "green", track: "░", trackFg: "track" });
  t.text(inner.x + w + 7, inner.y, `${humanBytes(used)} (${(pct * 100).toFixed(0)}%)`, t.attr({ fg: "fg" }));
  const rows = [
    ["cache", state.mem.cache, state.mem.total, "cyan"],
    ["buff", state.mem.buf, state.mem.total, "blue"],
    ["swap", state.mem.swap, state.mem.swapTotal, "magenta"],
  ];
  rows.forEach(([label, v, tot, col], i) => {
    const y = inner.y + 2 + i;
    if (y > inner.y + inner.h - 2) return;
    t.text(inner.x, y, pad(label, 5) + " ", t.attr({ fg: "dim" }));
    t.bar(inner.x + 6, y, w, v / tot, { fg: col, track: "░", trackFg: "track" });
    t.text(inner.x + w + 8, y, humanBytes(v), t.attr({ fg: "dim" }));
  });
  const sy = inner.y + 2 + rows.length;
  if (sy + 2 <= inner.y + inner.h - 1) {
    t.spark(inner.x, sy, inner.w, Math.max(2, inner.y + inner.h - 1 - sy), last(state.mem.used, 60), { fg: "green", max: state.mem.total });
  }
}

function drawNet(t, r, focus) {
  t.box(r.x, r.y, r.w, r.h, { title: "network", sub: `wlan0 · ${state.net.conns} conns`, corners: "round", style: { fg: focus ? "line2" : "line" } });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 3 || inner.w < 14) return;
  const half = Math.max(2, Math.floor((inner.h - 2) / 2));
  const label = (y, v, col) => t.text(inner.x + inner.w - 11, y, pad(humanBytes(v) + "/s", 11, true), t.attr({ fg: col }));
  t.text(inner.x, inner.y, " ↓ down", t.attr({ fg: "cyan" }));
  label(inner.y, state.net.down.at(-1), "cyan");
  t.spark(inner.x, inner.y + 1, inner.w, half, last(state.net.down, 60), { fg: "cyan" });
  const uy = inner.y + 1 + half;
  t.text(inner.x, uy, " ↑ up", t.attr({ fg: "magenta" }));
  label(uy, state.net.up.at(-1), "magenta");
  t.spark(inner.x, uy + 1, inner.w, Math.max(1, inner.h - half - 3), last(state.net.up, 60), { fg: "magenta" });
  t.text(inner.x, inner.y + inner.h - 1, `rx ${humanBytes(state.net.rx)}  tx ${humanBytes(state.net.tx)}`, t.attr({ fg: "faint" }));
}

function drawProc(t, r, focus) {
  const list = sortedProcs();
  state.sel = clamp(state.sel, 0, Math.max(0, list.length - 1));
  t.box(r.x, r.y, r.w, r.h, {
    title: `processes ${list.length}/${state.procs.length}`,
    sub: `sort ${state.sort}${state.filter ? ` · “${state.filter}”` : ""}${state.paused ? " · PAUSED" : ""}`,
    corners: "round", style: { fg: focus ? "line2" : "line" },
  });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 3) return;

  // [header, width (0 = takes what is left), align, sort key]
  const cols = state.compact
    ? [["pid", 5, "l", "pid"], ["cpu%", 6, "r", "cpu"], ["mem", 7, "r", "mem"], ["name", 0, "l", "name"]]
    : [["pid", 6, "l", "pid"], ["user", 8, "l", ""], ["cpu%", 6, "r", "cpu"], ["mem", 8, "r", "mem"],
       ["thr", 4, "r", ""], ["up", 8, "r", ""], ["command", 0, "l", "name"]];
  const gap = 1;
  const fixed = cols.reduce((a, c) => a + c[1], 0) + gap * (cols.length - 1);
  const flexCol = cols.find((c) => c[1] === 0);
  flexCol[1] = Math.max(6, inner.w - fixed);
  // a panel too narrow for the wide table loses its least informative columns rather than clipping
  while (cols.length > 4 && cols.reduce((a, c) => a + c[1], 0) + gap * (cols.length - 1) > inner.w) {
    const drop = cols.findIndex((c) => c[1] > 0 && ["thr", "up", "user"].includes(c[0]));
    if (drop < 0) break;
    cols.splice(drop, 1);
    flexCol[1] = Math.max(6, inner.w - (cols.reduce((a, c) => a + c[1], 0) + gap * (cols.length - 1)));
  }

  let x = inner.x;
  for (const [label, w, align, sortKey] of cols) {
    const active = sortKey && state.sort === sortKey;
    t.text(x, inner.y, pad(label, w, align === "r"), t.attr({ fg: active ? "accent" : "faint", b: active, u: active }));
    if (sortKey) t.hit(x, inner.y, w, 1, () => { state.sort = sortKey; state.sel = 0; }, "sort");
    x += w + gap;
  }
  t.hline(inner.x, inner.y + 1, inner.w, "─", t.attr({ fg: "line" }));

  const bodyY = inner.y + 2, bodyH = inner.h - 2;
  const top = clamp(state.sel - Math.floor(bodyH / 2), 0, Math.max(0, list.length - bodyH));
  for (let i = 0; i < bodyH; i++) {
    const p = list[top + i];
    const y = bodyY + i;
    if (y > inner.y + inner.h - 1) break;
    if (!p) continue;
    const selected = top + i === state.sel;
    const cells = state.compact
      ? [String(p.pid), p.cpu.toFixed(1), humanBytes(p.mem), p.name]
      : [String(p.pid), p.user, p.cpu.toFixed(1), humanBytes(p.mem), String(p.threads),
         clock(p.started), `${p.name} ${p.cmd.replace(p.name, "").trim()}`].slice(0, cols.length);
    let cx = inner.x;
    cols.forEach(([, w, align, , ], ci) => {
      const val = cells[ci] ?? "";
      const col = selected ? null
        : ci === 0 ? "dim"
        : cols[ci][0] === "cpu%" ? (p.cpu > 30 ? "red" : p.cpu > 10 ? "magenta" : "green")
        : cols[ci][0] === "mem" ? "cyan"
        : cols[ci][0] === "command" || cols[ci][0] === "name" ? (p.cpu > 10 ? "fg" : "dim")
        : "dim";
      t.text(cx, y, pad(val, w, align === "r"), t.attr(selected ? { fg: "bg", bg: "accent", b: true } : { fg: col }));
      cx += w + gap;
    });
    t.hit(inner.x, y, inner.w, 1, () => {
      if (state.sel === top + i) state.inspect = state.inspect === p.pid ? null : p.pid;
      else { state.sel = top + i; state.inspect = null; }
    }, "proc");
  }

  if (state.inspect != null) {
    const p = state.procs.find((q) => q.pid === state.inspect);
    if (p) {
      const w = clamp(p.cmd.length + 6, 30, inner.w), h = 3;
      const bx = inner.x, by = inner.y + inner.h - h;
      t.box(bx, by, w, h, { title: `pid ${p.pid}`, sub: `thr ${p.threads} · state ${p.state}`, corners: "round", style: { fg: "accent" } });
      t.text(bx + 2, by + 1, p.cmd.slice(0, w - 4), t.attr({ fg: "fg" }));
    }
  }
}

/* ------------------------------------------------------------------ layout */

/** One layout, used by the draw and by the tap handler so they can never disagree. */
function layout(t) {
  const body = { x: 0, y: 0, w: t.cols, h: t.rows - 1 };
  if (t.cols < 84) {
    const r = { x: 0, y: 2, w: t.cols - 1, h: body.h - 2 };
    return { compact: true, panels: [r, r, r, r, r], tabRow: 0 };
  }
  const leftW = Math.round(t.cols * 0.52);
  const cpuH = Math.min(14, Math.max(8, Math.round(body.h * 0.42)));
  const rx = leftW + 1, rw = t.cols - leftW - 1;
  const right = Math.max(3, Math.floor((body.h - 2) / 3));
  return {
    compact: false,
    panels: [
      { x: 0, y: 0, w: leftW, h: cpuH },                         // cpu
      { x: rx, y: 0, w: rw, h: right },                           // mem
      { x: rx, y: right, w: rw, h: right },                       // net
      { x: 0, y: cpuH, w: leftW, h: body.h - cpuH },              // proc
      { x: rx, y: right * 2, w: rw, h: body.h - right * 2 },      // disk
    ],
  };
}

function draw(t, dt) {
  t.clear();
  if (!state.paused) {
    state.acc += dt;
    while (state.acc >= 0.25) { step(0.25); state.acc -= 0.25; }
  }
  const L = layout(t);
  state.compact = L.compact;

  if (L.compact) {
    const labels = ["cpu", "mem", "net", "proc"];
    let x = 1;
    labels.forEach((l, i) => {
      const w = l.length + 4;
      const on = state.panel === i;
      t.text(x, 0, ` ${i + 1}:${l} `, t.attr({ fg: on ? "bg" : "dim", bg: on ? "accent" : null, b: on }));
      t.hit(x, 0, w, 1, () => (state.panel = i), "tab");
      x += w + 1;
    });
    t.text(0, 1, "─".repeat(t.cols), t.attr({ fg: "line" }));
    [drawCpu, drawMem, drawNet, drawProc][state.panel](t, L.panels[state.panel], true);
  } else {
    // panel focus regions go in first: taps check regions last-registered-first, so the process
    // rows (registered inside drawProc) win over the panel underneath them
    L.panels.forEach((r, i) => t.hit(r.x, r.y, r.w, r.h, () => (state.panel = i), "panel"));
    drawCpu(t, L.panels[0], state.panel === 0);
    drawProc(t, L.panels[3], state.panel === 3);
    drawMem(t, L.panels[1], state.panel === 1);
    drawNet(t, L.panels[2], state.panel === 2);
    drawDisk(t, L.panels[4], state.panel === 4);
  }

  // status line: what the app thinks it is, plus the keys that matter on a phone
  const y = t.rows - 1;
  t.status(y, [
    ["pulse", "accent"], [views[state.panel], "fg"], [`${t.cols}×${t.rows}`, "faint"],
    [`up ${clock(state.uptime)}`, "dim"], [`cpu ${state.cpuTotal.toFixed(0)}%`, "green"],
    [`mem ${(state.mem.used.at(-1) / 1e9).toFixed(1)}G`, "cyan"], [`pids ${state.procs.length}`, "dim"],
    [state.paused ? "PAUSED" : "live", state.paused ? "yellow" : "green"],
  ], state.filtering ? [`filter “${state.filter}${state.filter ? "" : "▌"}”  esc to clear`]
    : ["j/k select · Enter inspect · s sort · K kill · f filter · p pause · 1-4 panel · t theme · q quit"],
  { bg: "panel", fg: "fg", rightFg: "faint" });
}

function drawDisk(t, r, focus) {
  t.box(r.x, r.y, r.w, r.h, { title: "disk", sub: "nvme0n1", corners: "round", style: { fg: focus ? "line2" : "line" } });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  if (inner.h < 2 || inner.w < 12) return;
  const h = Math.max(1, Math.floor((inner.h - 1) / 2));
  t.text(inner.x, inner.y, " r", t.attr({ fg: "yellow" }));
  t.text(inner.x + 3, inner.y, pad(humanBytes(state.disk.read.at(-1)) + "/s", 11), t.attr({ fg: "dim" }));
  t.spark(inner.x, inner.y + 1, inner.w, h, last(state.disk.read, 40), { fg: "yellow" });
  const wy = inner.y + 1 + h;
  t.text(inner.x, wy, " w", t.attr({ fg: "orange" }));
  t.text(inner.x + 3, wy, pad(humanBytes(state.disk.write.at(-1)) + "/s", 11), t.attr({ fg: "dim" }));
  t.spark(inner.x, wy + 1, inner.w, Math.max(1, inner.h - h - 3), last(state.disk.write, 40), { fg: "orange" });
}

/* ------------------------------------------------------------------ input */

function onKey(k) {
  const list = sortedProcs();
  if (state.filtering) {
    if (k === "Esc") { state.filtering = false; state.filter = ""; return true; }
    if (k === "Enter") { state.filtering = false; return true; }
    if (k === "Backspace") { state.filter = state.filter.slice(0, -1); state.sel = 0; return true; }
    if (k.length === 1) { state.filter += k.toLowerCase(); state.sel = 0; return true; }
    return true;
  }
  switch (k) {
    case "j": case "ArrowDown": state.sel = clamp(state.sel + 1, 0, list.length - 1); state.inspect = null; return true;
    case "k": case "ArrowUp": state.sel = clamp(state.sel - 1, 0, list.length - 1); state.inspect = null; return true;
    case "Home": state.sel = 0; return true;
    case "End": state.sel = list.length - 1; return true;
    case "PageDown": state.sel = clamp(state.sel + 10, 0, list.length - 1); return true;
    case "PageUp": state.sel = clamp(state.sel - 10, 0, list.length - 1); return true;
    case "Enter": {
      const p = list[state.sel];
      if (p) { state.inspect = state.inspect === p.pid ? null : p.pid; window.tui?.toast(`pid ${p.pid} · ${p.threads} threads · ${p.cpu.toFixed(1)}% cpu`); }
      return true;
    }
    case "s": {
      const order = ["cpu", "mem", "pid", "name"];
      state.sort = order[(order.indexOf(state.sort) + 1) % order.length];
      state.sel = 0;
      window.tui?.toast(`sorted by ${state.sort}`);
      return true;
    }
    case "d": {
      const order = ["cpu", "mem", "pid", "name"];
      state.sort = order[(order.indexOf(state.sort) - 1 + order.length) % order.length];
      return true;
    }
    case "K": case "x": {
      const p = list[state.sel];
      if (!p) return true;
      if (p.user === "root") { window.tui?.toast(`kill ${p.pid} refused: ${p.user} owns it`); return true; }
      state.procs = state.procs.filter((q) => q.pid !== p.pid);
      state.killed++; state.inspect = null;
      state.sel = clamp(state.sel, 0, Math.max(0, list.length - 2));
      window.tui?.toast(`SIGTERM → ${p.name} (${p.pid})`);
      return true;
    }
    case "f": state.filtering = true; state.filter = ""; state.sel = 0; return true;
    case "p":
      state.paused = !state.paused;
      window.tui?.toast(state.paused ? "probes paused" : "probes running");
      return true;
    case "1": case "2": case "3": case "4": state.panel = +k - 1; state.inspect = null; return true;
    case "t": {
      const names = Object.keys(THEMES);
      state.theme = names[(names.indexOf(state.theme) + 1) % names.length];
      window.tui.setPalette(THEMES[state.theme]);
      window.tui.toast(`theme: ${state.theme}`);
      return true;
    }
    case "q":
      window.tui.quit({
        command: "pulse",
        line: `${state.probe} probes drawn · peak cpu ${state.peak.toFixed(0)}% · ${state.killed} process${state.killed === 1 ? "" : "es"} signalled · up ${clock(state.uptime)}`,
      });
      return true;
    default: return false;
  }
}

function onTap(x, y, tui) {
  // wide mode: a tap focuses the panel under the finger; compact mode: the tab strip and the
  // process rows already own hit regions, so nothing is decided here
  if (tui.cols < 84) return false;
  const L = layout(tui.term);
  for (let i = L.panels.length - 1; i >= 0; i--) {
    const r = L.panels[i];
    if (i === 4 && r.h < 3) continue;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { state.panel = i; return true; }
  }
  return false;
}

boot();

const KEYS = [
  { k: "j", l: "down" }, { k: "k", l: "up" }, { k: "Enter", l: "inspect" }, "sep",
  { k: "s", l: "sort" }, { k: "K", l: "kill" }, { k: "f", l: "filter" }, "sep",
  { k: "1", l: "cpu" }, { k: "2", l: "mem" }, { k: "3", l: "net" }, { k: "4", l: "proc" }, "sep",
  { k: "p", l: "pause" }, { k: "t", l: "theme" }, { k: "q", l: "quit" },
];

createTUI({
  name: "pulse",
  sub: "— system monitor · 8 cores · 128 G",
  font: '"JetBrains Mono Variable", ui-monospace, "DejaVu Sans Mono", monospace',
  size: 13, lh: 1.22, fps: 8, glow: 6, scan: 0.28, vignette: 0.35, minCols: 40, compactAt: 84,
  palette: THEMES.midnight,
  keys: KEYS,
  help: [
    ["j / k, ↑ ↓", "move the process selection (tap a row on a phone)"],
    ["Enter / tap twice", "inspect the selected process: threads, state, full command line"],
    ["s / d", "sort by cpu, mem, pid, name — forward / back"],
    ["K or x", "SIGTERM the selected process (root-owned ones refuse)"],
    ["f", "filter the table — type to search, esc clears"],
    ["p", "pause the probes"],
    ["1 2 3 4", "cpu · memory · network · processes (on a phone this is the only way to see them all)"],
    ["t", "theme: midnight → phosphor → graphite"],
    ["q / r", "quit to the exit panel, r starts it again"],
    ["?", "this list"],
  ],
  draw, onKey, onTap,
  pills: () => ({ a: state.paused ? "paused" : `cpu ${state.cpuTotal.toFixed(0)}%`, b: `up ${clock(state.uptime)}` }),
  state: () => ({
    panel: views[state.panel], paused: state.paused, sort: state.sort, filter: state.filter,
    theme: state.theme, procs: state.procs.length, shown: sortedProcs().length,
    selPid: sortedProcs()[state.sel]?.pid ?? null, inspect: state.inspect,
    cpuTotal: +(state.cpuTotal ?? 0).toFixed(2), peak: +state.peak.toFixed(1),
    memUsedG: +(state.mem.used.at(-1) / 1e9).toFixed(2), netDown: Math.round(state.net.down.at(-1)),
    diskWrite: Math.round(state.disk.write.at(-1)), killed: state.killed, probes: state.probe,
  }),
  api: {
    select: (i) => { state.sel = i; },
    panel: (i) => { state.panel = clamp(+i, 0, 3); },
    sort: (s) => { if (["cpu", "mem", "pid", "name"].includes(s)) state.sort = s; return state.sort; },
    filter: (s) => { state.filter = String(s ?? ""); state.sel = 0; return state.filter; },
    kill: () => onKey("K"),
    pause: (v) => { state.paused = v === undefined ? !state.paused : !!v; return state.paused; },
    theme: (name) => { if (THEMES[name]) { state.theme = name; window.tui.setPalette(THEMES[name]); } return state.theme; },
    quit: () => onKey("q"),
    resume: () => window.tui.resume(),
    tick: (n = 4) => { for (let i = 0; i < n; i++) step(0.25); return state.probe; },
  },
});
