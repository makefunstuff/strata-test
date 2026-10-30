// The tui/ kit: a character-cell screen buffer with box drawing, bars and sparklines, a key map that
// doubles as a tappable chip bar for phones, tap hit-regions, a toast, a help overlay and the window
// chrome. A page describes an app; the kit owns the grid, the input and the loop.
//
//   createTUI({
//     name, title, sub,                 // chrome text
//     palette: {…}, font, size, lh,     // theme (written to CSS custom properties)
//     fps = 9, keys = [ {k,l} | 'sep' ],// redraw rate, the key map shown as chips
//     draw(t, dt), onKey(k, t), onTap(x, y, t), state(), api
//   })
//
// The harness drives a page through window.tui: press(key), tap(x, y), state(), auditGlyphs(), frame.
// Colours are always passed to t.attr() as palette *tokens* ('fg', 'accent', 'red') or literal CSS
// colours, so a page's whole theme lives in its palette object.

const EIGHTHS = " ▏▎▍▌▋▊▉█";
const BARS = " ▁▂▃▄▅▆▇█";
const SHADES = " ░▒▓█";

export const BOXES = {
  light: ["┌", "┐", "└", "┘", "─", "│", "┬", "┴", "├", "┤"],
  round: ["╭", "╮", "╰", "╯", "─", "│", "┬", "┴", "├", "┤"],
  heavy: ["┏", "┓", "┗", "┛", "━", "┃", "┳", "┻", "┣", "┫"],
  double: ["╔", "╗", "╚", "╝", "═", "║", "╦", "╩", "╠", "╣"],
  ascii: ["+", "+", "+", "+", "-", "|", "+", "+", "+", "+"],
  dashed: ["┌", "┐", "└", "┘", "┄", "╎", "┬", "┴", "├", "┤"],
  none: [" ", " ", " ", " ", " ", " ", " ", " ", " ", " "],
};

export const EIGHTH_BLOCKS = EIGHTHS;
export const BAR_BLOCKS = BARS;
export const SHADES_BLOCKS = SHADES;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad = (s, w, right, fill = " ") => {
  s = String(s);
  if (s.length >= w) return s.slice(0, w);
  const gap = fill.repeat(w - s.length);
  return right ? gap + s : s + gap;
};
/** Right-aligned with leading zeros — the column a terminal table wants for numbers. */
const pad0 = (n, w) => pad(n, w, true, "0");
export { pad, pad0, clamp };

/** Format bytes the way a status line does: 940 B, 12.4 K, 3.11 M, 1.02 G. */
export function humanBytes(n) {
  const u = ["B", "K", "M", "G", "T"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1024; i++; }
  return (n >= 100 || i === 0 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + u[i];
}

/** mm:ss or h:mm:ss from seconds. */
export function clock(total) {
  total = Math.max(0, Math.round(total));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${pad0(m, 2)}:${pad0(s, 2)}` : `${pad0(m, 2)}:${pad0(s, 2)}`;
}

/** A small deterministic pseudo-random: every page's fake data is reproducible from a seed. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Word wrap to a cell width, hard-breaking words that cannot fit — the reader panes need it. */
export function wrap(text, w) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!line.length) line = word;
      else if (line.length + 1 + word.length <= w) line += " " + word;
      else { out.push(line); line = word; }
      while (line.length > w) { out.push(line.slice(0, w)); line = line.slice(w); }
    }
    if (line.length) out.push(line);
  }
  return out;
}

/* ------------------------------------------------------------------ the screen */

export class Term {
  constructor(opts = {}) {
    this.pal = opts.palette ?? {};
    this.cols = 80; this.rows = 24;
    this.styles = [null];            // id -> style object (0 = default)
    this.styleIds = new Map();
    this.hits = [];
    this.alloc();
  }
  alloc() {
    const n = this.cols * this.rows;
    this.ch = new Uint16Array(n);
    this.st = new Int32Array(n);
    for (let i = 0; i < n; i++) this.ch[i] = 32;
  }
  resize(cols, rows) {
    cols = clamp(cols | 0, 16, 400); rows = clamp(rows | 0, 6, 240);
    if (cols === this.cols && rows === this.rows) return false;
    this.cols = cols; this.rows = rows; this.alloc(); return true;
  }
  clear() { this.ch.fill(32); this.st.fill(0); this.hits.length = 0; }

  /** Register (or look up) a style; tokens resolve through the palette. */
  setPalette(p) {
    this.pal = p;
    this.styles.length = 1; this.styles[0] = null;
    this.styleIds.clear();
    this.onStyle?.(null);       // null = the shell clears its generated stylesheet
  }

  attr(s = {}) {
    const c = (v) => (v ? (this.pal[v] ?? v) : null);
    const key = [c(s.fg), c(s.bg), s.b ? 1 : 0, s.i ? 1 : 0, s.u ? 1 : 0, s.d ? 1 : 0, s.cur ? 1 : 0].join("|");
    let id = this.styleIds.get(key);
    if (id !== undefined) return id;
    id = this.styles.length;
    const st = { fg: c(s.fg), bg: c(s.bg), b: !!s.b, i: !!s.i, u: !!s.u, d: !!s.d, cur: !!s.cur };
    st.cls = "tk" + id;
    this.styles.push(st);
    this.styleIds.set(key, id);
    this.onStyle?.(st);        // the shell owns the stylesheet: one .tkN rule per style, ever
    return id;
  }

  cell(x, y, ch, style) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.ch[i] = (ch || " ").codePointAt(0);
    this.st[i] = style ?? 0;
  }
  /** Write a string at (x,y); anything past the right edge is clipped like a real terminal. */
  text(x, y, s, style, { clip = true } = {}) {
    s = String(s);
    if (clip && x + s.length > this.cols) s = s.slice(0, Math.max(0, this.cols - x));
    for (let i = 0; i < s.length; i++) this.cell(x + i, y, s[i], style);
    return x + s.length;
  }
  row(y, s, style) { return this.text(0, y, pad(s, this.cols), style); }
  fill(x, y, w, h, ch = " ", style) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.cell(x + i, y + j, ch, style);
  }
  hline(x, y, w, ch = "─", style) { for (let i = 0; i < w; i++) this.cell(x + i, y, ch, style); }
  vline(x, y, h, ch = "│", style) { for (let j = 0; j < h; j++) this.cell(x, y + j, ch, style); }

  /** A bordered panel. Returns the inner rect {x,y,w,h} (the box minus its border). */
  box(x, y, w, h, { title = "", sub = "", style, titleStyle, subStyle, corners = "light", fill = true, cornersOnly = false } = {}) {
    const b = BOXES[corners] ?? BOXES.light;
    const st = this.attr(style ?? { fg: "line2" });
    const inner = fill ? this.attr({ fg: "fg", bg: "well" }) : 0;
    if (cornersOnly) {
      this.cell(x, y, b[0], st); this.cell(x + w - 1, y, b[1], st);
      this.cell(x, y + h - 1, b[2], st); this.cell(x + w - 1, y + h - 1, b[3], st);
    } else {
      if (fill) this.fill(x + 1, y + 1, w - 2, h - 2, " ", inner);
      this.hline(x + 1, y, w - 2, b[4], st);
      this.hline(x + 1, y + h - 1, w - 2, b[4], st);
      this.vline(x, y + 1, h - 2, b[5], st);
      this.vline(x + w - 1, y + 1, h - 2, b[5], st);
      this.cell(x, y, b[0], st); this.cell(x + w - 1, y, b[1], st);
      this.cell(x, y + h - 1, b[2], st); this.cell(x + w - 1, y + h - 1, b[3], st);
    }
    if (title) {
      const t = ` ${title} `.slice(0, Math.max(0, w - 2));
      this.text(x + 1, y, t, this.attr(titleStyle ?? { fg: "accent", b: true }));
    }
    if (sub) {
      const s = ` ${sub} `.slice(0, Math.max(0, w - 2));
      this.text(x + w - 1 - s.length, y, s, this.attr(subStyle ?? { fg: "faint" }));
    }
    return { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
  }

  /** A fractional bar drawn with eighth blocks: [██████▌    ] */
  bar(x, y, w, frac, { fg = "accent", bg = null, track = " ", trackFg = null, head = null, right = false } = {}) {
    frac = clamp(frac ?? 0, 0, 1);
    const fId = this.attr({ fg }), tId = this.attr(trackFg ? { fg: trackFg } : bg ? { fg: bg } : {});
    const filled = frac * w;
    const whole = Math.floor(filled);
    const rest = filled - whole;
    const headAt = head == null ? -1 : clamp(Math.round(filled) - 1, 0, w - 1);
    for (let pos = 0; pos < w; pos++) {
      let ch = track, id = tId;
      if (pos < whole) { ch = "█"; id = fId; }
      else if (pos === whole && rest > 0) { ch = EIGHTHS[Math.round(rest * 8)] || " "; id = fId; }
      if (pos === headAt) { ch = head; id = fId; }
      this.cell(x + (right ? w - 1 - pos : pos), y, ch, id);
    }
  }

  /** A sparkline in a w×h cell rect, one column per value, blocks from the bottom up. */
  spark(x, y, w, h, values, { fg = "accent", bg = null, max, mid = false } = {}) {
    if (!values || !values.length) return;
    const hi = max ?? Math.max(1e-6, ...values);
    const fId = this.attr({ fg }), bId = this.attr(bg ? { fg: bg } : {});
    for (let i = 0; i < w; i++) {
      const v = values[Math.min(values.length - 1, Math.floor((i / w) * values.length))] ?? 0;
      const f = clamp(v / hi, 0, 1);
      const total = f * h * 8;
      for (let j = 0; j < h; j++) {
        const fromBottom = h - 1 - j;
        let ch = " ", id = bId;
        if (total >= (fromBottom + 1) * 8) { ch = "█"; id = fId; }
        else if (total > fromBottom * 8) { ch = BARS[8 - Math.round(total - fromBottom * 8)]; id = fId; }
        this.cell(x + i, y + j, ch, id);
      }
    }
  }

  /** A tap target in grid coordinates; checked top-down against pointer taps. */
  hit(x, y, w, h, fn, tag = "") { this.hits.push({ x, y, w, h, fn, tag }); }

  /**
   * A status line that cannot overlap itself. Bits print from x=1 — a bare string in the status
   * colour, or [text, colour] for a coloured field — and the right side is flush right, dropped
   * whole when there is no room for it rather than printed over the left. The usual symptom of a
   * status line built from hand-counted x positions is exactly that overlap.
   */
  status(y, leftBits, rightBits = [], { bg = "line2", fg = "bg", rightFg = null } = {}) {
    const norm = (bits) => bits.filter((b) => b !== null && b !== undefined && b !== "")
      .map((b) => (Array.isArray(b) ? { text: String(b[0]), col: b[1] } : { text: String(b), col: null }));
    const left = norm(leftBits), right0 = norm(rightBits);
    this.fill(0, y, this.cols, 1, " ", this.attr({ fg, bg }));
    // the right-hand hint is decoration, the left-hand state is not: on a narrow screen the hint is
    // dropped whole rather than eating the fields that matter
    let right = right0;
    let rightW = right.reduce((a, b) => a + b.text.length + 2, 0);
    if (rightW > Math.floor(this.cols * 0.55)) { right = []; rightW = 0; }
    let x = 1;
    for (const b of left) {
      if (x + b.text.length > this.cols - rightW - 2) break;
      this.text(x, y, b.text, this.attr({ fg: b.col ?? fg, b: true }));
      x += b.text.length + 2;
    }
    let rx = this.cols - rightW;
    for (const b of right) {
      if (rx < x) break;
      this.text(rx, y, b.text, this.attr({ fg: b.col ?? rightFg ?? fg }));
      rx += b.text.length + 2;
    }
    return x;
  }

  /** The grid as HTML: runs of equal style collapse into one span that points at a generated class. */
  toHTML() {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      let html = "", run = "", runId = -1;
      const flush = () => {
        if (!run) return;
        const s = this.styles[runId];
        html += s ? `<span class="${s.cls}">${esc(run)}</span>` : esc(run);
        run = "";
      };
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const id = this.st[i];
        if (id !== runId) { flush(); runId = id; }
        run += String.fromCharCode(this.ch[i]);
      }
      flush();
      out.push(html || " ");
    }
    return out.join("\n");
  }
}

function cssRule(s) {
  const p = [];
  if (s.fg) p.push(`color:${s.fg}`);
  if (s.bg) p.push(`background-color:${s.bg}`);
  if (s.b) p.push("font-weight:700");
  if (s.i) p.push("font-style:italic");
  if (s.u) p.push("text-decoration:underline;text-underline-offset:2px");
  if (s.d) p.push("opacity:.6");
  if (s.cur) p.push("animation:tk-blink 1.05s steps(1,end) infinite");
  return `.${s.cls}{${p.join(";")}}`;
}

/* ------------------------------------------------------------------ the app shell */

export function createTUI(app) {
  const pal = app.palette ?? {};
  const mount = document.getElementById("term");
  mount.classList.add("term-mount");
  const fps = app.fps ?? 9;

  mount.style.setProperty("--page-bg", pal.pageBg ?? pal.bg ?? "#08090c");
  mount.style.setProperty("--screen-bg", pal.screenBg ?? pal.bg ?? "#0b0d12");
  mount.style.setProperty("--panel", pal.panel ?? "#11131a");
  mount.style.setProperty("--well", pal.well ?? pal.panel ?? "#151823");
  mount.style.setProperty("--line", pal.line ?? "#232838");
  mount.style.setProperty("--fg", pal.fg ?? "#d8dee9");
  mount.style.setProperty("--dim", pal.dim ?? "#8b98ab");
  mount.style.setProperty("--faint", pal.faint ?? "#5f6b7f");
  mount.style.setProperty("--accent", pal.accent ?? "#88c0d0");
  for (const k of ["red", "green", "yellow", "blue", "magenta", "cyan", "orange"]) {
    if (pal[k]) mount.style.setProperty(`--${k}`, pal[k]);
  }
  mount.style.setProperty("--font", app.font ?? 'ui-monospace, "DejaVu Sans Mono", monospace');
  mount.style.setProperty("--size", (app.size ?? 13) + "px");
  mount.style.setProperty("--lh", String(app.lh ?? 1.25));
  if (app.glow) mount.style.setProperty("--glow", `0 0 ${app.glow}px ${pal.accentGlow ?? pal.accent ?? "#88c0d0"}`);
  if (app.scan) mount.style.setProperty("--scan", String(app.scan));
  if (app.vignette) mount.style.setProperty("--vignette", String(app.vignette));

  mount.innerHTML = `
    <div class="chrome">
      <span class="dots"><i></i><i></i><i></i></span>
      <span class="name"></span>
      <span class="sub"></span>
      <span class="grow"></span>
      <span class="pill pill-a"></span>
      <span class="pill pill-b"></span>
      <span class="pill"><a href="../index.html">← tui/</a></span>
    </div>
    <div class="grid-wrap">
      <pre class="screen" aria-label="${esc(app.name ?? "terminal")}"></pre>
      <div class="toast"></div>
      <div class="help"><div class="box"><button class="close" type="button">esc</button>
        <h3>${esc(app.name ?? "keys")}</h3><dl></dl></div></div>
    </div>
    <div class="keybar" role="toolbar" aria-label="keys"></div>`;

  const el = {
    name: mount.querySelector(".chrome .name"),
    sub: mount.querySelector(".chrome .sub"),
    a: mount.querySelector(".pill-a"),
    b: mount.querySelector(".pill-b"),
    wrap: mount.querySelector(".grid-wrap"),
    pre: mount.querySelector("pre.screen"),
    toast: mount.querySelector(".toast"),
    help: mount.querySelector(".help"),
    helpList: mount.querySelector(".help dl"),
    keybar: mount.querySelector(".keybar"),
  };
  el.name.textContent = app.name ?? "";
  el.sub.textContent = app.sub ?? "";

  const term = new Term({ palette: pal });
  // the app's THEMES object must survive theme switching untouched: Object.assign into a shared
  // object leaves the last theme's keys behind, so "midnight" came back tinted with phosphor
  term.pal = { ...pal };
  const livePal = term.pal;
  // one generated stylesheet: attr() adds a .tkN rule once, so the grid's HTML stays short and the
  // per-frame innerHTML does not carry the whole colour table inline
  const styleEl = document.createElement("style");
  styleEl.textContent = "@keyframes tk-blink{0%,49%{opacity:1}50%,100%{opacity:0}}";
  mount.appendChild(styleEl);
  term.onStyle = (s) => {
    if (!s) { styleEl.textContent = "@keyframes tk-blink{0%,49%{opacity:1}50%,100%{opacity:0}}"; return; }
    styleEl.append(cssRule(s));
  };
  const state = { size: app.size ?? 13, cellW: 8, cellH: 16, frame: 0, keys: 0, taps: 0, help: false, quit: null, lastKey: "" };
  let activePrompt = null;   // a field the app opened with prompt(); it owns the keyboard while open
  let measureCanvas = null;

  function measureCell() {
    // the real advance width and line height of the loaded face, not the 0.6em guess:
    // one probe block of 40 identical rows and 40 identical columns, both divided by 40
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;top:0;left:-9999px;visibility:hidden;white-space:pre;`
      + `font:${state.size}px ${app.font ?? "monospace"};line-height:${app.lh ?? 1.25}`;
    probe.textContent = "M".repeat(40) + "\n".repeat(39) + "M".repeat(40);
    mount.appendChild(probe);
    const r = probe.getBoundingClientRect();
    mount.removeChild(probe);
    state.cellW = clamp(r.width / 40, 2, 60);
    state.cellH = clamp(r.height / 40, 3, 200);
  }

  function fit() {
    const cs = getComputedStyle(el.wrap);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.min(6000, Math.max(80, el.wrap.clientWidth - padX));
    const availH = Math.min(4000, Math.max(60, el.wrap.clientHeight - padY));
    let size = app.size ?? 13;
    for (let guard = 0; guard < 6; guard++) {
      state.size = size;
      mount.style.setProperty("--size", size + "px");
      measureCell();
      const cols = Math.floor(availW / state.cellW);
      const rows = Math.floor(availH / state.cellH);
      if (cols >= (app.minCols ?? 44) || size <= (app.minSize ?? 9)) {
        term.resize(cols, rows);
        return;
      }
      size -= 1;
    }
    mount.style.setProperty("--size", size + "px");
    measureCell();
    term.resize(Math.floor(availW / state.cellW), Math.floor(availH / state.cellH));
  }

  /* ---- input ---- */
  const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Process", "Dead"]);

  function keyName(e) {
    // a space is " ", not "Space": the pages match the character they mean to type, and a real
    // terminal gives its app the character too. The chip and the checker may spell it either way,
    // so press() folds the alias, keyName does not invent one.
    let k = e.key;
    if (k === "Escape" || k === "Esc") k = "Esc";
    if (e.ctrlKey) return "C-" + k.toLowerCase();
    if (e.altKey) return "M-" + k.toLowerCase();
    return k;
  }
  const BLOCK_DEFAULT = new Set([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Home", "End", "PageUp", "PageDown", "/", "F1"]);
  // keys the browser wants for itself and that a terminal app must take back, or the page goes away
  // under the user: Ctrl-R reloads, Ctrl-S saves the page, Ctrl-P/Q walk the tab strip
  const STEAL = /^C-[rswpoqijt]$/i;

  function press(key) {
    const k = key === "Space" ? " " : key;
    state.keys++; state.lastKey = k;
    if (state.quit) {
      if (k === "r" || k === "R" || k === "Enter" || k === "?" || k === "F1") { state.quit = null; draw(); }
      return;
    }
    if (state.help && k !== "?" && k !== "F1") { setHelp(false); }
    // "?" is a character a reply, a buffer or a search can contain: while the app is taking text it
    // belongs to the app, and the help screen is what the chip and the F1 key are for
    const typing = !!(app.isTyping && app.isTyping(tui));
    if (!typing && (k === "?" || k === "F1")) { setHelp(!state.help); return; }
    let handled = true;
    try { handled = app.onKey ? app.onKey(k, tui) !== false : true; }
    catch (err) { console.error(`onKey(${k}) threw:`, err); }
    draw();
    return handled;
  }

  window.addEventListener("keydown", (e) => {
    if (e.metaKey) return;
    if (MODIFIERS.has(e.key)) return;            // Shift alone is not a key the app asked for
    if (activePrompt) return;                     // the prompt owns its field, including the soft keyboard
    const k = keyName(e);
    const declared = (app.keys ?? []).some((d) => d && (d.k === k || (d.k === "Space" && k === " ")));
    // stop the browser scrolling, completing the tab order, reloading or saving the page under a
    // terminal that owns the keys
    if (BLOCK_DEFAULT.has(k) || declared || STEAL.test(k) || e.ctrlKey || state.quit || state.help) e.preventDefault();
    press(k);
  });

  el.pre.addEventListener("pointerdown", (e) => {
    const r = el.pre.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / state.cellW);
    const y = Math.floor((e.clientY - r.top) / state.cellH);
    tap(x, y);
  });

  function tap(x, y) {
    state.taps++;
    if (state.quit) { press("r"); return; }
    for (let i = term.hits.length - 1; i >= 0; i--) {
      const h = term.hits[i];
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) {
        try { h.fn(x - h.x, y - h.y, tui); } catch (err) { console.error("hit() threw:", err); }
        draw();
        return true;
      }
    }
    let used = false;
    try { used = app.onTap ? !!app.onTap(x, y, tui) : false; } catch (err) { console.error("onTap threw:", err); }
    draw();
    return used;
  }

  /* ---- chrome: key chips, toast, help, quit ---- */
  /**
   * A real text field, for the one thing a grid of cells cannot do: take text from a phone's soft
   * keyboard. The grid draws a terminal; this opens over it with a genuine <input>/<textarea>, so
   * Android shows a keyboard and the character actually arrives. onDone(null) means cancelled.
   */
  function prompt(label, initial, onDone, { multiline = false, hint = "" } = {}) {
    closePrompt();
    const veil = document.createElement("div");
    veil.className = "prompt on";
    const box = document.createElement("div"); box.className = "box";
    const h = document.createElement("h3"); h.textContent = label;
    const field = document.createElement(multiline ? "textarea" : "input");
    field.value = initial ?? "";
    field.setAttribute("aria-label", label);
    field.spellcheck = false;
    if (!multiline) field.setAttribute("enterkeyhint", "done");
    const row = document.createElement("div"); row.className = "row";
    const ok = document.createElement("button"); ok.type = "button"; ok.textContent = "ok";
    const no = document.createElement("button"); no.type = "button"; no.textContent = "esc";
    if (hint) { const s = document.createElement("span"); s.className = "hint"; s.textContent = hint; row.appendChild(s); }
    row.append(ok, no);
    const finish = (v) => { closePrompt(); onDone(v); draw(); };
    ok.addEventListener("click", () => finish(field.value));
    no.addEventListener("click", () => finish(null));
    // the grid's own key handler sits on window: stop the event here so the field is the only thing
    // that sees the keystroke, and Enter/Esc mean submit/cancel rather than the app's own keys
    field.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (!multiline || e.ctrlKey)) { e.preventDefault(); finish(field.value); }
      else if (e.key === "Escape") { e.preventDefault(); finish(null); }
    });
    field.addEventListener("keyup", (e) => e.stopPropagation());
    box.append(h, field, row);
    veil.appendChild(box);
    el.wrap.appendChild(veil);
    activePrompt = { veil, field };
    field.focus();
    if (field.select) field.select();
    return field;
  }

  function closePrompt() {
    if (!activePrompt) return;
    activePrompt.veil.remove();
    activePrompt = null;
  }

  function buildKeybar() {
    el.keybar.textContent = "";
    for (const d of app.keys ?? []) {
      if (d === "sep") { const s = document.createElement("span"); s.className = "sep"; el.keybar.appendChild(s); continue; }
      const b = document.createElement("button");
      b.type = "button";
      if (d.wide) b.className = "wide";
      b.innerHTML = `<span class="k">${esc(d.k === "Space" ? "␣" : d.k)}</span><span class="l">${esc(d.l ?? "")}</span>`;
      b.setAttribute("aria-label", `${d.k}: ${d.l ?? ""}`);
      b.addEventListener("click", () => press(d.k));
      el.keybar.appendChild(b);
    }
    const help = document.createElement("button");
    help.type = "button";
    help.innerHTML = `<span class="k">?</span><span class="l">help</span>`;
    help.addEventListener("click", () => press("?"));
    el.keybar.appendChild(help);
  }
  function buildHelp() {
    el.helpList.textContent = "";
    const rows = app.help ?? (app.keys ?? []).filter((d) => d && d.l).map((d) => [d.k, d.l]);
    for (const [k, l] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = l;
      el.helpList.append(dt, dd);
    }
  }
  function setHelp(on) {
    state.help = !!on;
    el.help.classList.toggle("on", state.help);
    draw();
  }
  el.help.querySelector(".close").addEventListener("click", () => setHelp(false));

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("on"), 1800);
  }

  /* ---- draw loop ---- */
  let dirty = true, last = performance.now(), acc = 0, raf = 0, lastHTML = "";
  function draw() { dirty = true; }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    acc += dt;
    const step = 1 / fps;
    if (!dirty && acc < step) return;
    const d = acc; acc = 0; dirty = false;
    if (document.hidden) return;
    if (state.quit) {
      app.quit ? app.quit(term, state.quit) : defaultQuit(term, state.quit);
    } else if (app.draw) {
      try { app.draw(term, d, tui); } catch (err) { console.error("draw() threw:", err); }
    }
    const html = term.toHTML();
    if (html !== lastHTML) { el.pre.innerHTML = html; lastHTML = html; }
    state.frame++;
    if (app.pills) {
      const p = app.pills(tui) ?? {};
      el.a.textContent = p.a ?? ""; el.b.textContent = p.b ?? "";
      el.a.style.display = p.a ? "" : "none";
      el.b.style.display = p.b ? "" : "none";
    }
  }

  function defaultQuit(t, info) {
    t.clear();
    t.text(1, 1, `${info.command ?? "process"} exited`, t.attr({ fg: "fg", b: true }));
    if (info.line) t.text(1, 2, info.line, t.attr({ fg: "dim" }));
    t.text(1, 4, "press r to start it again, ? for the keys", t.attr({ fg: "faint" }));
  }

  /* ---- glyph audit: a fallback font silently breaks the grid, so measure every glyph used ---- */
  function auditGlyphs() {
    measureCanvas = measureCanvas ?? document.createElement("canvas").getContext("2d");
    const fontSpec = `${state.size}px ${app.font ?? "monospace"}`;
    measureCanvas.font = fontSpec;
    // re-measure the cell first: document.fonts.ready can resolve before a CDN face has been
    // requested at all, which would leave cellW from the fallback and every glyph “wrong” by
    // exactly the difference between the two faces
    measureCell();
    const seen = new Set();
    for (let i = 0; i < term.ch.length; i++) if (term.ch[i] !== 32) seen.add(term.ch[i]);
    const bad = [];
    for (const code of seen) {
      const ch = String.fromCodePoint(code);
      const w = measureCanvas.measureText(ch).width;
      if (Math.abs(w - state.cellW) > Math.max(0.6, state.cellW * 0.12)) bad.push({ ch, w: +w.toFixed(2), cellW: +state.cellW.toFixed(2) });
    }
    return bad;
  }

  const ro = new ResizeObserver(() => { fit(); draw(); });
  ro.observe(el.wrap);
  // ask for the faces by name and wait: document.fonts.ready resolves early when nothing has asked
  // for a face yet, and the first fit would then be measured against the fallback font
  (async () => {
    if (document.fonts?.load) {
      const families = String(app.font ?? "monospace").split(",").map((f) => f.trim());
      try {
        await Promise.all(families.map((f) => document.fonts.load(`${state.size}px ${f}`, "MW0123 ·─│▏▕▍▎▁▂▃▄▅▆▇█░▒▓╭╮╰╯┏┓┗┛═║▶❙✕✓★")));
        await document.fonts.ready;
      } catch { /* no FontFaceSet: the fallback metrics are what they are */ }
      fit(); draw();
    }
  })();

  const tui = {
    term, palette: pal, app,
    get cols() { return term.cols; },
    get rows() { return term.rows; },
    get compact() { return term.cols < (app.compactAt ?? 76); },
    get frame() { return state.frame; },
    get keysPressed() { return state.keys; },
    get tapsMade() { return state.taps; },
    cellW: () => state.cellW,
    cellH: () => state.cellH,
    press, tap, draw, toast,
    quit: (info = {}) => { state.quit = typeof info === "string" ? { line: info } : info; draw(); },
    resume: () => { state.quit = null; draw(); },
    helpOpen: () => state.help,
    setHelp,
    setKeys(list) { app.keys = list; buildKeybar(); },
    setPalette(p) {
      // replace, never merge: a theme is a whole palette, and a merged one keeps the old colours for
      // whatever keys the new theme does not name
      for (const k of Object.keys(livePal)) delete livePal[k];
      Object.assign(livePal, p);
      term.setPalette(livePal);
      for (const k of ["pageBg", "screenBg", "panel", "well", "line", "fg", "dim", "faint", "accent"]) {
        if (livePal[k]) mount.style.setProperty(`--${k === "pageBg" ? "page-bg" : k === "screenBg" ? "screen-bg" : k}`, livePal[k]);
      }
      for (const k of ["red", "green", "yellow", "blue", "magenta", "cyan", "orange"]) {
        if (livePal[k]) mount.style.setProperty(`--${k}`, livePal[k]);
      }
      draw();
    },
    prompt,
    auditGlyphs,
    fit,
    state() {
      const base = { cols: term.cols, rows: term.rows, frame: state.frame, keys: state.keys, taps: state.taps, help: state.help, quit: !!state.quit, lastKey: state.lastKey };
      try { return Object.assign(base, app.state ? app.state(tui) : {}); }
      catch (e) { base.stateError = String((e && e.message) ?? e); return base; }
    },
    api: app.api ?? {},
  };

  buildKeybar(); buildHelp(); fit();
  raf = requestAnimationFrame(frame);
  window.tui = tui;
  return tui;
}
