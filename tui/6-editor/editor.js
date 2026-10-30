// quill — tui/6: a modal editor, the one page on the shelf with no borders at all. A real editor does
// not frame itself: it is a tab bar, a gutter, the buffer, a status line and a command line, and every
// one of those is load-bearing.
//
// Modes: normal, insert, visual (lines), search and ex. Motions: hjkl w b 0 $ gg G. Operators: d d,
// d d in visual, y y, p, P, x, D, > and < on a range, o/O/A/i/a. u and Ctrl-R undo and redo against
// whole-line snapshots. / searches and highlights every hit, n and N walk them. : w, q, wq, e <name>,
// :<number> jump. Click or tap places the cursor.
import { createTUI, pad, pad0, clamp } from "../shared/tui.js";

const PAL = {
  // catppuccin mocha: a deep indigo-black, a lavender ink, and pastels doing the traffic-light work
  pageBg: "#161622", screenBg: "#1e1e2e", panel: "#26263a", well: "#1e1e2e", line: "#313244",
  line2: "#45475a", fg: "#cdd6f4", dim: "#a6adc8", faint: "#6c7086", accent: "#89b4fa",
  green: "#a6e3a1", red: "#f38ba8", yellow: "#f9e2af", blue: "#89b4fa", magenta: "#f5c2e7",
  purple: "#cba6f7", cyan: "#94e2d5", orange: "#fab387", track: "#2a2a3d",
};

const PULSE_JS = `// pulse — the probe loop: read the machine, keep a ring, draw when told to.
import { readCpu, readMem, readNet } from "./sensors.js";
import { Ring } from "./ring.js";

const HIST = 96;

export function start({ interval = 250, sink = console.log } = {}) {
  const cpu = new Ring(HIST), mem = new Ring(HIST), net = new Ring(HIST);
  let timer = null;

  const tick = () => {
    const s = readAll();
    cpu.push(s.cpu); mem.push(s.mem); net.push(s.net);
    if (s.cpu > 92) sink("probe", "cpu pegged", s);
    return s;
  };

  const readAll = () => ({ cpu: readCpu(), mem: readMem(), net: readNet() });

  return {
    start() { timer = setInterval(tick, interval); return this; },
    stop() { clearInterval(timer); timer = null; return this; },
    history: () => ({ cpu: cpu.array(), mem: mem.array(), net: net.array() }),
    // the headline is the mean of the cores, not their sum: a 100 % machine is a 100 % machine
    load: () => cpu.array().reduce((a, b) => a + b, 0) / Math.max(1, cpu.length),
  };
}

/**
 * A ring with a fixed capacity: the grid is finite, so the history has to be too.
 * The oldest sample goes when the write pointer laps itself.
 */
export class Ring {
  constructor(capacity) {
    this.buf = new Float64Array(capacity);
    this.at = 0;
    this.full = false;
  }

  push(v) {
    this.buf[this.at] = v;
    this.at = (this.at + 1) % this.buf.length;
    if (this.at === 0) this.full = true;
    return this;
  }

  /** Oldest first — the way a sparkline wants to read it. */
  array() {
    if (!this.full) return Array.from(this.buf.subarray(0, this.at));
    return [...Array.from(this.buf.subarray(this.at)), ...Array.from(this.buf.subarray(0, this.at))];
  }

  get length() { return this.full ? this.buf.length : this.at; }
  get capacity() { return this.buf.length; }
}

/** p50/p95 off a sample window; the number a monitor should be quoting. */
export const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};`;

const THEME_CSS = `/* pulse — one stylesheet, six themes, no build step */
:root {
  --bg: #050810;
  --panel: #0b1120;
  --ink: #dceaf7;
  --accent: #5fe3c0;
  --line: #1c2b45;
  --cell: 7.8px;
}

.screen {
  background: var(--bg);
  color: var(--ink);
  font: 13px/1.22 "JetBrains Mono", ui-monospace, monospace;
  /* the grid is the layout: never let a child decide its own width */
  white-space: pre;
  tab-size: 4;
}

.bar { color: var(--accent); }
.bar--warn { color: #ffd166; }
.bar--crit { color: #ff6b7a; }

.panel {
  border: 1px solid var(--line);
  background: var(--panel);
}

.panel h2 {
  margin: 0 0 4px;
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

/* the key map doubles as the touch-target list on a phone */
.keybar {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

@media (prefers-reduced-motion: reduce) {
  .cursor { animation: none; }
}

/* a phone gets one pane at a time and a thumb-sized target */
@media (max-width: 560px) {
  :root { --cell: 9px; }
  .keybar button { min-height: 34px; }
}`;

const NOTES_MD = `# notes for the release

Three things the monitor has to get right before anyone shows it to someone:

1. the headline and the per-core bars must agree — the average, always the average
2. a number that cannot change is a bug: every cell has a story or it is decoration
3. the theme is not a coat of paint: contrast is a property of the palette *and* the font

## done

- ring buffers with a fixed capacity
- eighth-block bars, so a bar can carry a value between two rows
- the process table sorts, filters and kills (it only ever kills its own children)
- the phone layout: one pane at a time, and the key map became buttons

## not done

- the network panel lies about connections when it is paused
- the disk panel has no iodepth, so one fat write looks like a burst

## what the grid cost us

The character cell is the whole layout. Anything that wants a pixel — a rounded
corner, a shadow, a gradient — is either a character or it does not exist. That
turned out to be most of the design: a bar is eight characters wide and you stop
wanting more. The place it hurts is typography: a grid wants one face, and a face
without box drawing falls back one glyph at a time and takes the columns with it.
Measure every glyph, or you are shipping a layout you have not looked at.

## release

Tag when the sweep is green on both widths, not when only the desktop one is. The
phone pass is the one that catches the layouts that only work when they are wide.`;

const BUFFERS = [
  { name: "pulse.js", kind: "js", lines: PULSE_JS.split("\n"), modified: false, savedLines: PULSE_JS.split("\n").length, signs: {} },
  { name: "theme.css", kind: "css", lines: THEME_CSS.split("\n"), modified: true, savedLines: THEME_CSS.split("\n").length, signs: { 18: "~" } },
  { name: "notes.md", kind: "md", lines: NOTES_MD.split("\n"), modified: false, savedLines: NOTES_MD.split("\n").length, signs: {} },
];

const DIAGNOSTICS = [
  { file: "pulse.js", line: 13, sev: "warn", text: "sink is called without awaiting; a slow console will drop probes" },
  { file: "pulse.js", line: 30, sev: "info", text: "load() divides by cpu.length — Ring.length is the capacity, not the fill" },
  { file: "theme.css", line: 19, sev: "error", text: "unknown property '--cell' is not used by any rule" },
];

const state = {
  buf: 0, mode: "normal", line: 0, col: 0, top: 0,
  anchor: null, pending: "", cmd: "", search: "", hits: [], hitAt: 0,
  yank: null, undo: [], redo: [], saves: 0, edits: 0, jumps: 0,
  msg: "", msgT: 0,
};

const B = () => BUFFERS[state.buf];
const lineAt = (i) => B().lines[i] ?? "";

/* ------------------------------------------------------------------ editing */

function snapshot() {
  state.undo.push({ line: state.line, col: state.col, lines: B().lines.slice() });
  if (state.undo.length > 80) state.undo.shift();
  state.redo.length = 0;
  state.edits++;
}
function markDirty() { B().modified = true; }

function setLine(i, text) {
  const b = B();
  b.lines[i] = text;
  b.signs[i] = b.signs[i] ?? "+";      // the gutter shows which lines have moved since the last save
  markDirty();
}
function delLines(i, n) {
  const b = B();
  state.yank = b.lines.slice(i, i + n);
  b.lines.splice(i, n);
  for (const k of Object.keys(b.signs)) if (+k >= i) delete b.signs[k];
  markDirty();
}
function insertLines(i, lines) {
  B().lines.splice(i, 0, ...lines);
  markDirty();
}
function undo() {
  const u = state.undo.pop();
  if (!u) { say("nothing to undo"); return; }
  state.redo.push({ line: state.line, col: state.col, lines: B().lines.slice() });
  B().lines = u.lines; state.line = u.line; state.col = u.col;
  say("undo");
}
function redo() {
  const r = state.redo.pop();
  if (!r) { say("nothing to redo"); return; }
  state.undo.push({ line: state.line, col: state.col, lines: B().lines.slice() });
  B().lines = r.lines; state.line = r.line; state.col = r.col;
  say("redo");
}
function say(msg) { state.msg = msg; state.msgT = performance.now(); }

function search(q) {
  state.search = q;
  state.hits = [];
  if (!q) return;
  const low = q.toLowerCase();
  B().lines.forEach((ln, i) => {
    let from = 0;
    for (;;) {
      const at = ln.toLowerCase().indexOf(low, from);
      if (at < 0) break;
      state.hits.push({ line: i, col: at });
      from = at + 1;
      if (state.hits.length > 400) return;
    }
  });
  state.hitAt = 0;
  if (state.hits.length) { state.line = state.hits[0].line; state.col = state.hits[0].col; state.jumps++; }
  say(state.hits.length ? `${state.hits.length} matches for “${q}”` : `no match: ${q}`);
}
function walkHits(d) {
  if (!state.hits.length) return;
  state.hitAt = (state.hitAt + d + state.hits.length) % state.hits.length;
  const h = state.hits[state.hitAt];
  state.line = h.line; state.col = h.col; state.jumps++;
}

function writeOut() {
  B().modified = false;
  B().savedLines = B().lines.length;
  state.saves++;
  say(`${B().lines.length} lines written to ${B().name}`);
}

/* ------------------------------------------------------------------ highlighting */

const JS_KW = /^(import|export|from|const|let|var|function|return|if|else|for|of|in|new|class|this|null|undefined|true|false|async|await|typeof|try|catch|throw)\b/;

function highlight(t, x, y, line, kind) {
  if (kind === "md") {
    if (/^#{1,3} /.test(line)) return t.text(x, y, line, t.attr({ fg: "accent", b: true }));
    if (/^\s*[-*\d]+[.)]?\s/.test(line)) return t.text(x, y, line, t.attr({ fg: "green" }));
    if (/^```/.test(line)) return t.text(x, y, line, t.attr({ fg: "purple" }));
    return t.text(x, y, line, t.attr({ fg: "fg" }));
  }
  if (kind === "css") {
    if (/^\s*(\/\*|\*|\*\/)/.test(line)) return t.text(x, y, line, t.attr({ fg: "faint", i: true }));
    const m = line.match(/^(\s*)(--[\w-]+|[\w-]+)(\s*:\s*)(.*?)(;?)$/);
    if (m) {
      t.text(x, y, m[1] + m[2], t.attr({ fg: m[2].startsWith("--") ? "purple" : "cyan" }));
      t.text(x + m[1].length + m[2].length, y, m[3], t.attr({ fg: "dim" }));
      t.text(x + m[1].length + m[2].length + m[3].length, y, m[4], t.attr({ fg: "green" }));
      return t.text(x + line.length - 1, y, m[5], t.attr({ fg: "dim" }));
    }
    if (/[{}]$/.test(line.trim())) return t.text(x, y, line, t.attr({ fg: "yellow" }));
    return t.text(x, y, line, t.attr({ fg: "orange" }));
  }
  // js: comment, string, keyword, number, type-ish, property
  const cmt = line.indexOf("//");
  const code = cmt >= 0 ? line.slice(0, cmt) : line;
  let i = 0;
  const push = (txt, col) => { t.text(x + i, y, txt, t.attr({ fg: col })); i += txt.length; };
  const parts = code.split(/(\s+|[(){}[\];,.:=+\-*/<>!?&|]+)/);
  for (const p of parts) {
    if (!p) continue;
    if (/^["'`]/.test(p)) push(p, "green");
    else if (JS_KW.test(p)) push(p, "purple");
    else if (/^\d+(\.\d+)?$/.test(p)) push(p, "orange");
    else if (/^[A-Z][A-Za-z0-9_]*$/.test(p)) push(p, "yellow");
    else if (/^[a-zA-Z_$][\w$]*$/.test(p)) push(p, "fg");
    else push(p, "dim");
  }
  if (cmt >= 0) t.text(x + cmt, y, line.slice(cmt), t.attr({ fg: "faint", i: true }));
}

/* ------------------------------------------------------------------ drawing */

function draw(t, dt) {
  t.clear();
  const b = B();
  const compact = t.cols < 84;
  const tabH = 1, statusH = 1, cmdH = state.mode === "ex" || state.mode === "search" ? 1 : 0;
  const sideW = compact ? 0 : Math.max(20, Math.min(34, Math.round(t.cols * 0.24)));
  const bufW = t.cols - sideW - 1;
  const numW = String(b.lines.length).length + 1;
  const view = { x: 0, y: tabH, w: bufW - numW - 1, h: t.rows - tabH - statusH - cmdH };

  // tab bar: every buffer, the modified ones with their dot
  let x = 0;
  BUFFERS.forEach((buf, i) => {
    const label = ` ${i + 1}:${buf.name}${buf.modified ? " ●" : ""} `;
    const on = i === state.buf;
    t.text(x, 0, pad(label, Math.max(label.length, 12)), t.attr({ fg: on ? "bg" : "dim", bg: on ? "accent" : null, b: on }));
    t.hit(x, 0, label.length, 1, () => { state.buf = i; state.line = clamp(state.line, 0, buf.lines.length - 1); state.col = 0; state.top = 0; }, "tab");
    x += Math.max(label.length, 12);
  });
  const branch = "work/7-quill";
  const right = `${branch} · ${b.lines.length} lines`;
  if (x + right.length < t.cols) t.text(t.cols - right.length, 0, right, t.attr({ fg: "faint" }));

  // the gutter: line numbers and a change sign, and the diagnostics as a sidebar when there is room
  state.top = clamp(state.top, 0, Math.max(0, b.lines.length - view.h));
  for (let i = 0; i < view.h; i++) {
    const li = state.top + i;
    const y = view.y + i;
    if (li >= b.lines.length) break;
    const isCur = li === state.line;
    t.text(0, y, pad(li + 1, numW), t.attr({ fg: isCur ? "accent" : "faint", b: isCur }));
    t.cell(numW, y, b.signs[li] === "~" ? "~" : b.signs[li] === "+" ? "+" : " ", t.attr({ fg: b.signs[li] === "~" ? "yellow" : "green" }));
    const line = lineAt(li);
    const hitOnLine = state.hits.find((h) => h.line === li);
    highlight(t, numW + 1, y, line.slice(0, view.w), b.kind);
    if (hitOnLine && state.search) {
      // every hit on the line gets an underline, not just the one the cursor is on
      const low = line.toLowerCase(), q = state.search.toLowerCase();
      let from = 0;
      for (;;) {
        const at = low.indexOf(q, from);
        if (at < 0 || at > view.w) break;
        for (let c = 0; c < q.length; c++) t.cell(numW + 1 + at + c, y, line[at + c], t.attr({ fg: "bg", bg: "yellow", u: true }));
        from = at + 1;
      }
    }
    if (state.mode === "visual" && state.anchor != null && li >= Math.min(state.anchor, state.line) && li <= Math.max(state.anchor, state.line)) {
      // a selected line loses its colours and gains a background — which is exactly what a real
      // editor does, and cheaper than blending the syntax palette with the selection colour
      const sel = t.attr({ fg: "bg", bg: "line2" });
      t.text(numW + 1, y, pad(line.slice(0, view.w), Math.min(view.w, Math.max(line.length, 0))), sel);
    }
  }

  // the cursor
  const curY = state.line - state.top + view.y;
  const curX = numW + 1 + Math.min(state.col, view.w - 1);
  if (curY >= view.y && curY < view.y + view.h && state.mode !== "ex") {
    const ch = lineAt(state.line)[state.col] ?? " ";
    const block = state.mode === "normal" || state.mode === "visual";
    t.cell(clamp(curX, numW + 1, t.cols - 1), curY, ch,
      block ? t.attr({ fg: "bg", bg: "accent", b: true }) : t.attr({ fg: "accent", cur: true, b: true }));
  }

  if (sideW) {
    const sx = bufW + 1;
    t.text(sx, tabH, " DIAGNOSTICS ", t.attr({ fg: "purple", b: true }));
    const diags = DIAGNOSTICS.filter((d) => d.file === b.name);
    diags.forEach((d, i) => {
      const y = tabH + 1 + i * 4;
      if (y + 3 > t.rows - statusH) return;
      const col = d.sev === "error" ? "red" : d.sev === "warn" ? "yellow" : "blue";
      t.text(sx, y, `${d.sev === "error" ? "✕" : d.sev === "warn" ? "▲" : "●"} ${d.sev} · line ${d.line}`, t.attr({ fg: col, b: true }));
      const words = d.text.split(" ");
      let ln = "", yy = y + 1;
      for (const wd of words) {
        if ((ln + " " + wd).trim().length > sideW - 2) { t.text(sx + 2, yy++, ln, t.attr({ fg: "dim" })); ln = wd; }
        else ln = (ln + " " + wd).trim();
      }
      if (ln) t.text(sx + 2, yy, ln, t.attr({ fg: "dim" }));
      t.hit(sx, y, sideW, 3, () => { state.line = clamp(d.line - 1, 0, b.lines.length - 1); state.col = 0; state.jumps++; }, "diag");
    });
    const y2 = tabH + 1 + Math.max(1, diags.length) * 4 + 1;
    // a buffer with nothing to complain about gets its outline instead: the side of an editor is a
    // list of the places you might want to be, and an empty column is a wasted column
    const outline = [];
    b.lines.forEach((ln, i) => {
      if (/^#{1,3} /.test(ln)) outline.push({ i, label: ln.replace(/^#+ /, ""), kind: "#" });
      else if (/^export (function|class) /.test(ln)) outline.push({ i, label: ln.replace(/^export (function|class) /, "").replace(/[({].*$/, ""), kind: "fn" });
      else if (/^\.[\w-]+ \{|^:root \{|^@media/.test(ln)) outline.push({ i, label: ln.replace(/ \{.*$/, ""), kind: "css" });
    });
    if (!diags.length && outline.length) {
      t.text(sx, tabH + 1, " OUTLINE ", t.attr({ fg: "faint", b: true }));
      outline.slice(0, Math.max(1, t.rows - statusH - tabH - 9)).forEach((o, k) => {
        const y = tabH + 2 + k;
        const on = o.i === state.line;
        t.text(sx, y, `${pad0(o.i + 1, 3)} ${o.kind} ${pad(o.label, sideW - 8)}`, t.attr({ fg: on ? "accent" : "dim", b: on }));
        t.hit(sx, y, sideW, 1, () => { moveTo({ line: o.i, col: 0 }); state.jumps++; }, "outline");
      });
    }
    if (y2 + 5 < t.rows - statusH) {
      t.text(sx, y2, " UNDO ", t.attr({ fg: "faint", b: true }));
      t.text(sx, y2 + 1, `${state.undo.length} undo · ${state.redo.length} redo`, t.attr({ fg: "dim" }));
      t.text(sx, y2 + 2, state.yank ? `yank: ${state.yank.length} line(s)` : "yank: empty", t.attr({ fg: "dim" }));
      t.text(sx, y2 + 3, `${state.saves} saved · ${state.edits} edits`, t.attr({ fg: "dim" }));
      t.text(sx, y2 + 4, state.search ? `“${state.search}” ×${state.hits.length}` : "no search", t.attr({ fg: "dim" }));
    }
  }

  // status line, then the command line only when something is being typed
  const sy = t.rows - 1 - cmdH;
  const modeLabel = { normal: "NORMAL", insert: "INSERT", visual: "VISUAL LINE", ex: "COMMAND", search: "SEARCH" }[state.mode];
  const modeCol = { normal: "accent", insert: "green", visual: "purple", ex: "yellow", search: "yellow" }[state.mode];
  t.fill(0, sy, t.cols, 1, " ", t.attr({ fg: "bg", bg: modeCol }));
  // one line, four fields, laid out left to right with the message clipped to whatever is left —
  // a status line that prints over itself is the classic TUI bug
  const rightBlock = `${pad0(Math.round(((state.line + 1) / b.lines.length) * 100), 3)}%  ${b.kind}`;
  let sx2 = 1;
  const put = (s, extra = {}) => { if (sx2 + s.length > t.cols - rightBlock.length - 2) return false; t.text(sx2, sy, s, t.attr({ fg: "bg", ...extra })); sx2 += s.length + 2; return true; };
  put(`-- ${modeLabel} --`, { b: true });
  put(`${b.name}${b.modified ? " [+]" : ""}`);
  put(`${state.line + 1}:${state.col + 1}`);
  if (state.pending) put(`pending “${state.pending}…”`);
  if (state.search) put(`/${state.search} ${state.hits.length}`);
  if (state.msg && performance.now() - state.msgT < 2600) put(state.msg, { b: true });
  t.text(t.cols - rightBlock.length, sy, rightBlock, t.attr({ fg: "bg" }));
  if (cmdH) {
    const cy = t.rows - 1;
    t.text(0, cy, (state.mode === "ex" ? ":" : "/") + (state.mode === "ex" ? state.cmd : state.search) + "▌", t.attr({ fg: "yellow", b: true }));
    const hint = state.mode === "ex" ? "w · q · wq · e <name> · <number>" : "type a pattern · enter finds · n/N walk";
    t.text(t.cols - hint.length - 1, cy, hint, t.attr({ fg: "faint" }));
  }
}

/* ------------------------------------------------------------------ input */

const wordForward = (i) => {
  const ln = lineAt(i);
  let c = state.col;
  while (c < ln.length && /\s/.test(ln[c])) c++;
  while (c < ln.length && /[^\s]/.test(ln[c])) c++;
  if (c >= ln.length && i < B().lines.length - 1) return { line: i + 1, col: 0 };
  return { line: i, col: c };
};
const wordBack = (i) => {
  const ln = lineAt(i);
  let c = Math.min(state.col, ln.length);
  if (c > 0) c--;
  while (c > 0 && /\s/.test(ln[c])) c--;
  while (c > 0 && /[^\s]/.test(ln[c - 1])) c--;
  return { line: i, col: c };
};
const moveTo = (pos) => {
  state.line = clamp(pos.line, 0, B().lines.length - 1);
  state.col = clamp(pos.col, 0, Math.max(0, lineAt(state.line).length));
  if (state.line < state.top) state.top = state.line;
  if (state.line >= state.top + (window.tui.rows - 4)) state.top = Math.max(0, state.line - (window.tui.rows - 5));
};

// the kit asks this before it steals "?" for the help screen: in insert, search and ex a "?" is a
// character the user means to put in the file
function isTyping() { return state.mode === "insert" || state.mode === "search" || state.mode === "ex"; }

/** A phone has no letters on its keymap, so text goes into a real field over the grid. */
function typeLine(label, initial, done) {
  if (!window.tui.compact) return false;
  window.tui.prompt(label, initial, (v) => { if (v !== null) done(v); }, { hint: "ok applies" });
  return true;
}

function onKey(k) {
  if (state.mode === "search") {
    if (k === "Esc") { state.mode = "normal"; state.search = ""; state.hits = []; return true; }
    if (k === "Enter") { state.mode = "normal"; search(state.search); return true; }
    if (k === "Backspace") { if (!state.search) { state.mode = "normal"; return true; } state.search = state.search.slice(0, -1); return true; }
    if (k.length === 1) { state.search += k; return true; }
    return true;
  }
  if (state.mode === "ex") {
    if (k === "Esc") { state.mode = "normal"; state.cmd = ""; return true; }
    if (k === "Enter") {
      const c = state.cmd.trim();
      state.cmd = ""; state.mode = "normal";
      if (!c) return true;
      if (/^\d+$/.test(c)) { moveTo({ line: +c - 1, col: 0 }); say(`jumped to line ${c}`); return true; }
      if (c === "w") { writeOut(); return true; }
      if (c === "q") {
        if (B().modified) { say(`${B().name} is modified — :wq writes first`); return true; }
        if (BUFFERS.length === 1) { window.tui.quit({ command: "quill", line: "last buffer closed" }); return true; }
        BUFFERS.splice(state.buf, 1); state.buf = clamp(state.buf, 0, BUFFERS.length - 1);
        say("buffer closed"); return true;
      }
      if (c === "wq" || c === "x") { writeOut(); onKey(":"); onKey("q"); onKey("Enter"); return true; }
      if (/^e\s+\S+$/.test(c)) {
        const name = c.slice(2).trim();
        let idx = BUFFERS.findIndex((b) => b.name === name);
        if (idx < 0) { BUFFERS.push({ name, kind: name.endsWith(".css") ? "css" : name.endsWith(".md") ? "md" : "js", lines: [`// ${name}`, ""], modified: true, savedLines: 0, signs: {} }); idx = BUFFERS.length - 1; }
        state.buf = idx; state.line = 0; state.col = 0; state.top = 0;
        say(`opened ${name}`); return true;
      }
      if (c === "u" || c === "undo") { undo(); return true; }
      if (c === "redo") { redo(); return true; }
      say(`not an editor command: :${c}`);
      return true;
    }
    if (k === "Backspace") { if (!state.cmd) { state.mode = "normal"; return true; } state.cmd = state.cmd.slice(0, -1); return true; }
    if (k.length === 1) { state.cmd += k; return true; }
    return true;
  }

  if (state.mode === "insert") {
    if (k === "Esc") { state.mode = "normal"; state.col = clamp(state.col - 1, 0, lineAt(state.line).length); return true; }
    if (k === "Enter") {
      snapshot();
      const ln = lineAt(state.line);
      const indent = (ln.match(/^\s*/) ?? [""])[0];
      const head = ln.slice(0, state.col);
      const tail = ln.slice(state.col);
      setLine(state.line, head);
      insertLines(state.line + 1, [indent + tail]);
      state.line++; state.col = indent.length;
      return true;
    }
    if (k === "Tab") {
      snapshot();
      const ln = lineAt(state.line);
      setLine(state.line, ln.slice(0, state.col) + "  " + ln.slice(state.col));
      state.col += 2;
      return true;
    }
    if (k === "Backspace") {
      if (state.col > 0) {
        snapshot();
        const ln = lineAt(state.line);
        setLine(state.line, ln.slice(0, state.col - 1) + ln.slice(state.col));
        state.col--;
      } else if (state.line > 0) {
        snapshot();
        const prev = lineAt(state.line - 1);
        const cur = lineAt(state.line);
        delLines(state.line, 1);
        setLine(state.line - 1, prev + cur);
        state.line--; state.col = prev.length;
      }
      return true;
    }
    if (k === "C-w") {
      snapshot();
      const ln = lineAt(state.line);
      const cut = ln.slice(0, state.col).replace(/\S*\s*$/, "").length;
      setLine(state.line, ln.slice(cut) + ln.slice(state.col));
      state.col = cut;
      return true;
    }
    if (k.length === 1) {
      if (state.col === (lineAt(state.line).length ?? 0) || !state._typing) { if (!state._typing) { snapshot(); state._typing = true; } }
      const ln = lineAt(state.line);
      setLine(state.line, ln.slice(0, state.col) + k + ln.slice(state.col));
      state.col++;
      return true;
    }
    if (k.startsWith("Arrow")) {
      const map = { ArrowLeft: "h", ArrowRight: "l", ArrowUp: "k", ArrowDown: "j" };
      state.mode = "normal"; return onKey(map[k]);
    }
    return true;
  }

  // ---- normal / visual -------------------------------------------------
  if (state.pending) {
    const combo = state.pending + k;
    state.pending = "";
    const b = B();
    if (state.mode === "visual" && combo === "dd") {
      const a = Math.min(state.anchor ?? state.line, state.line);
      const z = Math.max(state.anchor ?? state.line, state.line);
      snapshot(); delLines(a, z - a + 1); state.mode = "normal"; state.anchor = null;
      state.line = clamp(a, 0, b.lines.length - 1);
      say(`deleted ${z - a + 1} line(s)`);
      return true;
    }
    if (state.mode === "visual" && combo === "yy") {
      const a = Math.min(state.anchor ?? state.line, state.line);
      const z = Math.max(state.anchor ?? state.line, state.line);
      state.yank = b.lines.slice(a, z + 1); state.mode = "normal"; state.anchor = null;
      say(`yanked ${z - a + 1} line(s)`);
      return true;
    }
    if (combo === "dd") { snapshot(); delLines(state.line, 1); state.line = clamp(state.line, 0, b.lines.length - 1); say(`deleted 1 line (yanked ${state.yank?.length ?? 0})`); return true; }
    if (combo === "yy") { state.yank = [lineAt(state.line)]; say("yanked 1 line"); return true; }
    if (combo === "gg") { moveTo({ line: 0, col: 0 }); return true; }
    if (combo === "dw") { snapshot(); const ln = lineAt(state.line); const to = wordForward(state.line); const end = to.line === state.line ? to.col : ln.length; setLine(state.line, ln.slice(0, state.col) + ln.slice(end)); state.yank = [ln.slice(state.col, end)]; say("deleted word"); return true; }
    if (combo === ">>") { snapshot(); setLine(state.line, "  " + lineAt(state.line)); say("indent"); return true; }
    if (combo === "<<") { snapshot(); setLine(state.line, lineAt(state.line).replace(/^ {1,2}/, "")); say("unindent"); return true; }
    if (combo[0] === "y") { say("yank what? (yy)"); return true; }
    if (combo[0] === "d") { say(`operator d wants a motion, got “${k}”`); return true; }
    say(`unknown: ${combo}`);
    return true;
  }

  switch (k) {
    case "h": case "ArrowLeft": state.col = Math.max(0, state.col - 1); return true;
    case "l": case "ArrowRight": state.col = Math.min(Math.max(0, lineAt(state.line).length), state.col + 1); return true;
    case "j": case "ArrowDown": state.line = Math.min(B().lines.length - 1, state.line + 1); state.col = clamp(state.col, 0, lineAt(state.line).length); state._typing = false; return true;
    case "k": case "ArrowUp": state.line = Math.max(0, state.line - 1); state.col = clamp(state.col, 0, lineAt(state.line).length); state._typing = false; return true;
    case "0": state.col = 0; return true;
    case "$": state.col = lineAt(state.line).length; return true;
    case "^": state.col = (lineAt(state.line).match(/^\s*/) ?? [""])[0].length; return true;
    case "w": moveTo(wordForward(state.line)); return true;
    case "b": moveTo(wordBack(state.line)); return true;
    case "G": moveTo({ line: B().lines.length - 1, col: 0 }); return true;
    case "g": state.pending = "g"; return true;
    case "d": state.pending = "d"; return true;
    case "y": state.pending = "y"; return true;
    case ">": state.pending = ">"; return true;
    case "<": state.pending = "<"; return true;
    case "x": {
      snapshot();
      const ln = lineAt(state.line);
      if (!ln.length) { delLines(state.line, 1); return true; }
      state.yank = [ln.slice(state.col, state.col + 1)];
      setLine(state.line, ln.slice(0, state.col) + ln.slice(state.col + 1));
      state.col = clamp(state.col, 0, Math.max(0, lineAt(state.line).length));
      return true;
    }
    case "D": {
      snapshot();
      const ln = lineAt(state.line);
      state.yank = [ln.slice(state.col)];
      setLine(state.line, ln.slice(0, state.col));
      return true;
    }
    case "p": {
      if (!state.yank) { say("nothing yanked"); return true; }
      snapshot();
      insertLines(state.line + 1, state.yank.slice());
      state.line++; state.col = 0;
      say(`put ${state.yank.length} line(s) below`);
      return true;
    }
    case "P": {
      if (!state.yank) { say("nothing yanked"); return true; }
      snapshot();
      insertLines(state.line, state.yank.slice());
      say(`put ${state.yank.length} line(s) above`);
      return true;
    }
    case "i":
      state.mode = "insert"; state._typing = false;
      typeLine(`line ${state.line + 1}`, lineAt(state.line), (v) => { snapshot(); setLine(state.line, v); state.mode = "normal"; state.col = v.length; });
      return true;
    case "a": state.mode = "insert"; state.col = Math.min(lineAt(state.line).length, state.col + 1); state._typing = false; return true;
    case "I": state.mode = "insert"; state.col = (lineAt(state.line).match(/^\s*/) ?? [""])[0].length; state._typing = false; return true;
    case "A": state.mode = "insert"; state.col = lineAt(state.line).length; state._typing = false; return true;
    case "o": {
      snapshot();
      insertLines(state.line + 1, [""]);
      state.line++; state.col = 0; state.mode = "insert"; state._typing = false;
      return true;
    }
    case "O": {
      snapshot();
      insertLines(state.line, [""]);
      state.col = 0; state.mode = "insert"; state._typing = false;
      return true;
    }
    case "V": case "v": state.mode = state.mode === "visual" ? "normal" : "visual"; state.anchor = state.line; return true;
    case "u": undo(); return true;
    case "C-r": redo(); return true;
    case "/":
      state.mode = "search"; state.search = "";
      typeLine("find", "", (v) => { state.mode = "normal"; state.search = v; search(v); });
      return true;
    case "n": walkHits(1); return true;
    case "N": walkHits(-1); return true;
    case "*": {
      const word = (lineAt(state.line).slice(state.col).match(/^[A-Za-z_$][\w$]*/) ?? [""])[0];
      if (word) search(word);
      return true;
    }
    case ":":
      state.mode = "ex"; state.cmd = "";
      typeLine("ex command", "", (v) => {
        // drive the same path a keyboard Enter takes, so there is one ex parser and not two
        state.mode = "ex"; state.cmd = v; onKey("Enter");
      });
      return true;
    case "S": case ";": return true;
    case "q":
      window.tui.quit({ command: "quill", line: `${state.saves} save${state.saves === 1 ? "" : "s"} · ${state.edits} edit${state.edits === 1 ? "" : "s"} · ${state.undo.length} undo steps · ${state.jumps} jumps` });
      return true;
    default: return false;
  }
}

function onTap(x, y, tui) {
  const numW = String(B().lines.length).length + 1;
  const tabH = 1;
  const row = y - tabH;
  if (row < 0) return false;                        // the tab bar has its own regions
  const line = state.top + row;
  if (line >= B().lines.length) return false;
  moveTo({ line, col: Math.max(0, x - numW - 1) });
  state.jumps++;
  return true;
}

createTUI({
  name: "quill",
  sub: "— modal editor · 3 buffers",
  font: '"Anonymous Pro", ui-monospace, "DejaVu Sans Mono", monospace',
  size: 14.5, lh: 1.22, fps: 12, minCols: 34, compactAt: 84,
  palette: PAL,
  isTyping,
  keys: [
    { k: "j", l: "down" }, { k: "k", l: "up" }, { k: "w", l: "word" }, { k: "b", l: "word-" }, "sep",
    { k: "i", l: "insert" }, { k: "a", l: "append" }, { k: "o", l: "open↓" }, { k: "Esc", l: "normal" }, "sep",
    { k: "x", l: "del" }, { k: "d", l: "d…" }, { k: "y", l: "y…" }, { k: "p", l: "put" }, { k: "u", l: "undo" }, "sep",
    { k: "/", l: "find" }, { k: "n", l: "next" }, { k: ":", l: "cmd" }, { k: "Enter", l: "line↓" }, { k: "q", l: "quit" },
  ],
  help: [
    ["h j k l, ←↓→↑", "move; 0 ^ $ w b jump within and across lines"],
    ["i a I A o O", "insert / append / line-start / line-end / open a line below / above"],
    ["Esc", "back to normal — always the way out of a mode"],
    ["x D dw dd yy p P", "delete char, to end of line, a word, a line; yank; put below and above"],
    ["> < >> <<", "indent and unindent the line"],
    ["u, Ctrl-R", "undo, redo (whole-line snapshots, 80 deep)"],
    ["V", "visual-line selection (it paints, and d deletes the selection)"],
    ["/, n, N, *", "search with every hit underlined; next, previous, find word under the cursor"],
    [":w :q :wq", "write, quit (refuses a modified buffer), both"],
    [":e <name>", "open a buffer, creating it if it does not exist; :<number> jumps"],
    ["click or tap", "place the cursor; the tab bar switches buffers, the diagnostics jump to their line"],
    ["q", "quit to the exit panel"],
  ],
  draw, onKey, onTap,
  pills: () => ({ a: `-- ${state.mode.toUpperCase()} --`, b: B().modified ? `${B().name} [+]` : B().name }),
  state: () => ({
    mode: state.mode, buf: B().name, kind: B().kind,
    line: state.line + 1, col: state.col + 1, top: state.top,
    lines: B().lines.length, modified: B().modified,
    buffers: BUFFERS.map((b) => `${b.name}${b.modified ? "*" : ""}`),
    pending: state.pending || null, cmd: state.cmd || null,
    search: state.search || null, hits: state.hits.length, hitAt: state.hitAt,
    yank: state.yank?.length ?? 0, undo: state.undo.length, redo: state.redo.length,
    saves: state.saves, edits: state.edits, jumps: state.jumps, msg: state.msg || null,
  }),
  api: {
    open: (name) => { const i = BUFFERS.findIndex((b) => b.name === name); if (i >= 0) { state.buf = i; state.line = 0; state.col = 0; } return B().name; },
    buffers: () => BUFFERS.map((b) => b.name),
    goto: (n, col = 0) => { moveTo({ line: clamp(+n - 1, 0, B().lines.length - 1), col }); return state.line + 1; },
    insert: (text) => { state.mode = "insert"; for (const ch of String(text)) onKey(ch); state.mode = "normal"; return lineAt(state.line); },
    type: (text) => { state.mode = "insert"; for (const ch of String(text)) onKey(ch); return lineAt(state.line); },
    stop: () => { state.mode = "normal"; return state.mode; },
    del: () => { state.pending = "d"; onKey("d"); return B().lines.length; },
    yank: () => { state.pending = "y"; onKey("y"); return state.yank?.length ?? 0; },
    put: () => onKey("p"),
    undo: () => { undo(); return B().lines.length; },
    redo: () => { redo(); return B().lines.length; },
    find: (q) => { search(String(q ?? "")); return state.hits.length; },
    next: (d = 1) => { walkHits(d); return state.line + 1; },
    ex: (c) => { state.mode = "ex"; state.cmd = String(c); onKey("Enter"); return state.msg; },
    save: () => { writeOut(); return B().modified; },
    lines: () => B().lines.slice(),
    quit: () => onKey("q"),
    resume: () => window.tui.resume(),
  },
});
