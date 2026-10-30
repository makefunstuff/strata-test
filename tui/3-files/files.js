// rig — tui/3: a file manager with a git client bolted to its side, the way ranger and lazygit are
// one tool in practice. Left is the tree with git status glyphs, middle is the preview (a real
// tokenizer for text, block art for the two binaries), right is the index: unstaged, staged, and the
// log. Space stages, c commits what is staged, d throws a file's changes away, R makes the working
// tree dirty again — every one of them moves bytes between the panels, and the harness reads it back.
import { createTUI, pad, clamp, rng } from "../shared/tui.js";

const PAL = {
  // gruvbox dark hard: an olive-black with a tan ink and a red/green/yellow/blue quartet
  pageBg: "#161819", screenBg: "#1d2021", panel: "#282828", well: "#1d2021", line: "#3c3836",
  line2: "#665c54", fg: "#ebdbb2", dim: "#a89984", faint: "#7c6f64", accent: "#fabd2f",
  green: "#b8bb26", red: "#fb4934", yellow: "#fabd2f", blue: "#83a598", purple: "#d38696",
  cyan: "#8ec07c", orange: "#fe8019", track: "#32302f",
};

const rand = rng(0xf11e5);

/* ------------------------------------------------------------------ the working tree */

const FILE = (name, status, content, size) => ({ name, type: "file", status, content, size: size ?? (content ? content.length : 1024) });
const DIR = (name, children, ...rest) => ({ name, type: "dir", children, open: rest.includes("open"), status: null });

const SRC_MAIN = `// rig — the entry point: parse argv, open the tree, run the loop.
import { openTree } from "./grid.ts";
import { bindKeys } from "./keys.ts";
import { theme } from "./theme.ts";

const tree = openTree(process.cwd(), { hidden: false });
const app = { tree, sel: 0, pane: "tree" };

bindKeys(app, {
  j: (a) => move(a, +1),
  k: (a) => move(a, -1),
  " ": (a) => stage(a),
  c: (a) => commitPrompt(a),
});

export function move(app, d) {
  app.sel = clamp(app.sel + d, 0, app.flat.length - 1);
}`;

const SRC_GRID = `// the tree: one node per path, lazily expanded, sorted dirs-first
export function openTree(root, opts) {
  const nodes = scan(root, opts.hidden ? 0 : 1);
  return { root, nodes, expanded: new Set([root]) };
}

function scan(dir, depth) {
  if (depth > 6) return [];
  return readDir(dir)
    .filter((e) => !e.name.startsWith(".") || depth === 0)
    .map((e) => (e.isDirectory() ? scan(dir + "/" + e.name, depth + 1) : leaf(e)));
}`;

const SRC_KEYS = `const MAP = new Map([
  ["j", "down"], ["k", "up"], ["l", "open"], ["h", "up-dir"],
  [" ", "stage"], ["c", "commit"], ["d", "discard"], ["R", "refresh"],
  ["/", "filter"], ["i", "hidden"], ["?", "help"], ["q", "quit"],
]);

export function bindKeys(app, handlers) {
  onKey((key) => {
    const action = MAP.get(key);
    if (action && handlers[action]) handlers[action](app);
  });
}`;

const README = `# rig

A file manager that knows git. Two panes and a keyboard.

    j/k      move
    l / h    open a directory, go back
    space    stage or unstage
    c        commit what is staged
    d        throw away a file's changes
    R        poke the working tree (it dirties itself again)

Nothing here is a library: the tree, the index and the preview are all
one file each, and the whole thing runs without a build step.`;

const NOTES = `# notes, kept honest

- The preview tokenizer is 60 lines and only knows three things: comments,
  strings, and the words that start a line. That is enough to make a file
  look like a file.
- The two binaries are drawn as block art from a hash of their name. It is
  not a thumbnail, it is a *suggestion* of one, and it is honest about it.
- Staging must not reorder the index. lazygit got that wrong for me once.`;

const ROADMAP = `# roadmap

1. rename inside the tree (needs a modal text input that is not the filter)
2. a diff view: side by side at >=140 columns, unified below
3. blame gutter, dimmed, one commit per line
4. hooks: refuse to commit with a red check, and say why`;

const PKG = `{
  "name": "rig",
  "version": "0.4.1",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "node tools/check.mjs --all",
    "shots": "node tools/hero.mjs"
  },
  "dependencies": {}
}`;

const LOGO = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="6" fill="#1d2021"/>
  <path d="M6 22 L16 8 L26 22 Z" fill="none" stroke="#fabd2f" stroke-width="2"/>
  <circle cx="16" cy="19" r="3" fill="#b8bb26"/>
</svg>`;

let TREE = DIR("rig", [
  FILE("README.md", "M", README, README.length),
  FILE("package.json", null, PKG, PKG.length),
  FILE(".gitignore", null, "node_modules/\nshots/\nwork/\n*.log\n", 34),
  DIR("src", [
    FILE("main.ts", "M", SRC_MAIN, SRC_MAIN.length),
    FILE("grid.ts", null, SRC_GRID, SRC_GRID.length),
    FILE("keys.ts", "A", SRC_KEYS, SRC_KEYS.length),
    FILE("theme.ts", null, "export const theme = {\n  fg: '#ebdbb2', bg: '#1d2021', accent: '#fabd2f',\n};\n", 92),
    FILE("render.ts", "D", "// deleted: the canvas renderer went in 0.4.0\n", 44),
  ], "open"),
  DIR("docs", [
    FILE("notes.md", null, NOTES, NOTES.length),
    FILE("roadmap.md", "?", ROADMAP, ROADMAP.length),
  ], "open"),
  DIR("assets", [
    FILE("logo.svg", null, LOGO, LOGO.length),
    FILE("tiles.png", "M", null, 24_576),
    FILE("splash.png", null, null, 118_784),
  ]),
  DIR("tools", [
    FILE("check.mjs", null, "import { run } from './harness.mjs';\nrun(process.argv.slice(2));\n", 74),
    FILE("hero.mjs", "?", "// poses each pane and shoots it at 1600x900\n", 48),
  ]),
  "open",
]);

const state = {
  pane: "tree",                       // tree | git
  sel: 0, gitSel: 0,
  cwd: [],                            // path segments currently expanded into
  filter: "", filtering: false,
  hidden: false,
  branch: "work/7-file-tree", ahead: 2, behind: 0,
  commits: [
    { hash: "9f2c1ab", who: "nadia", subject: "grid: sort directories before files, always" },
    { hash: "4d17e08", who: "juri", subject: "keys: claim space for staging, not for scrolling" },
    { hash: "b3aa5c1", who: "nadia", subject: "preview: three-token highlighter beats none" },
    { hash: "77e9f02", who: "jpl", subject: "0.4.0 — drop the canvas renderer" },
    { hash: "0c1b8d4", who: "jpl", subject: "0.3.9 — the tree stops eating dotfiles" },
    { hash: "a1e7c02", who: "nadia", subject: "git: never reorder the index when staging" },
    { hash: "5b93f10", who: "juri", subject: "docs: the README is the only manual" },
    { hash: "d4c0e88", who: "jpl", subject: "tools: the checker learns --phone" },
  ],
  committing: null,                   // the message being typed
  churn: 0, refreshed: 0,
  flat: [],
};

const allNodes = (node = TREE, path = [], out = []) => {
  for (const n of node) {
    if (!n || typeof n.name !== "string") continue;   // "open" flags and anything malformed
    out.push({ node: n, path: [...path, n.name] });
    if (n.type === "dir" && n.open) allNodes(n.children, [...path, n.name], out);
  }
  return out;
};

/** What the tree shows right now, in the order it shows it — the keys and the draw share this. */
function visibleNodes() {
  const list = allNodes(TREE.children, []);
  const f = state.filter.toLowerCase();
  return list.filter(({ node }) => (state.hidden || !node.name.startsWith(".")) && (!f || node.name.toLowerCase().includes(f)));
}

const entries = () => {
  const flat = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      if (!n || typeof n.name !== "string") continue;
      if (!state.hidden && n.name.startsWith(".")) continue;
      flat.push({ ...n, depth });
      if (n.type === "dir" && n.open) walk(n.children, depth + 1);
    }
  };
  walk(TREE.children, 0);
  return flat;
};
const indexLists = () => {
  const files = allNodes(TREE.children, []).filter(({ node }) => node.type === "file" && node.status);
  return {
    unstaged: files.filter(({ node }) => !node.staged),
    staged: files.filter(({ node }) => node.staged),
  };
};
const cursorNode = () => state.flat[state.sel]?.node ?? null;

/* ------------------------------------------------------------------ drawing */

const STATUS_GLYPH = { M: "M", A: "A", D: "D", "?": "?" };

/** 24576 → "24.0k" — the way a file manager quotes a size, to one decimal. */
const fmtSize = (b) => {
  const v = Number(b) || 0;
  if (v < 1000) return `${v}B`;
  if (v < 1e6) return `${(v / 1024).toFixed(1)}k`;
  return `${(v / 1048576).toFixed(1)}M`;
};

function drawTree(t, r, focused) {
  const head = " " + (state.cwd.length ? "rig/" + state.cwd.join("/") + "/" : "rig/") + " ";
  t.text(r.x, r.y - 1, head, t.attr({ fg: focused ? "accent" : "faint", b: focused }));
  state.flat = visibleNodes();
  const top = clamp(state.sel - Math.floor(r.h / 2), 0, Math.max(0, state.flat.length - r.h));
  for (let i = 0; i < r.h; i++) {
    const item = state.flat[top + i];
    const y = r.y + i;
    if (!item) continue;
    const n = item.node;
    const sel = top + i === state.sel;
    const depth = item.path.length - 1;
    const branch = depth ? "├─" : "";
    const icon = n.type === "dir" ? (n.open ? "▾ " : "▸ ") : "  ";
    const label = branch + icon + n.name + (n.type === "dir" ? "/" : "");
    const col = n.type === "dir" ? "blue" : n.status === "?" ? "faint" : n.status === "D" ? "red" : n.status === "A" ? "green" : n.status === "M" ? "yellow" : "fg";
    t.text(r.x, y, pad(label, r.w - 9), t.attr({ fg: sel ? "bg" : col, bg: sel ? "accent" : null, b: n.type === "dir" }));
    // ranger keeps the size and the git flag on the right of every row: the tree is a table
    const size = n.type === "dir" ? `${(n.children ?? []).filter(Boolean).length}d` : fmtSize(n.size);
    t.text(r.x + r.w - 8, y, pad(size, 5, true), t.attr({ fg: sel ? "bg" : "faint" }));
    const gl = n.status ? STATUS_GLYPH[n.status] + (n.staged ? "✓" : " ") : "  ";
    t.text(r.x + r.w - 2, y, gl, t.attr({ fg: sel ? "bg" : n.staged ? "green" : col, b: true }));
    t.hit(r.x, y, r.w, 1, () => {
      state.sel = top + i; state.pane = "tree";
      if (n.type === "dir") n.open = !n.open;
    }, "node");
  }
  state.sel = clamp(state.sel, 0, Math.max(0, state.flat.length - 1));

  // what the cursor is on, under the tree: the tree is short on a phone and this is where ranger
  // puts the same facts the desktop shows in the preview footer
  const n = state.flat[state.sel]?.node;
  const fy = r.y + Math.min(state.flat.length, r.h) + 1;
  if (n && fy + 4 < r.y + r.h) {
    t.hline(r.x, fy, r.w, "─", t.attr({ fg: "line" }));
    const path = state.flat[state.sel].path.join("/");
    const rows = [
      ["path", path],
      ["size", `${fmtSize(n.size)}${n.type === "dir" ? ` · ${(n.children ?? []).filter(Boolean).length} entries` : ` · ${kindOf(n.name)}`}`],
      ["git", n.status ? `${n.status} · ${n.staged ? "staged" : "not staged"}` : "clean"],
      ["touch", "Sun 16:58 · jpl"],
      ["branch", `${state.branch}${state.ahead ? ` ↑${state.ahead}` : ""}${state.behind ? ` ↓${state.behind}` : ""}`],
      ["index", `${indexLists().staged.length} staged · ${indexLists().unstaged.length} unstaged`],
      ["head", state.commits[0].hash + " " + state.commits[0].subject.slice(0, Math.max(6, r.w - 18))],
    ];
    rows.forEach(([k, v], i) => {
      if (fy + 1 + i >= r.y + r.h) return;
      t.text(r.x, fy + 1 + i, pad(k, 6), t.attr({ fg: "faint" }));
      t.text(r.x + 7, fy + 1 + i, pad(v, r.w - 7), t.attr({ fg: "dim" }));
    });
    // and the history for the path you are on, which is the other thing you wanted to know here
    const hy = fy + 1 + rows.length + 1;
    if (hy + 2 < r.y + r.h) {
      t.hline(r.x, hy - 1, r.w, "─", t.attr({ fg: "line2" }));
      t.text(r.x, hy, "recent", t.attr({ fg: "faint", b: true }));
      const n = Math.max(1, r.y + r.h - hy - 2);
      state.commits.slice(0, n).forEach((c, i) => {
        t.text(r.x, hy + 1 + i, `${c.hash} ${c.subject}`.slice(0, r.w), t.attr({ fg: i === 0 ? "fg" : "dim" }));
      });
    }
  }
}

const KEYWORDS = /^(import|export|from|const|let|var|function|return|if|else|for|of|new|class|this|null|true|false|async|await|type|interface)\b/;

function highlight(t, x, y, line, kind) {
  if (kind === "md") {
    if (/^#{1,3} /.test(line)) return t.text(x, y, line, t.attr({ fg: "accent", b: true }));
    if (/^```/.test(line)) return t.text(x, y, line, t.attr({ fg: "purple" }));
    if (/^\s*[-\d]+[.)]?\s/.test(line)) return t.text(x, y, line, t.attr({ fg: "green" }));
    if (/^\s{4}/.test(line)) return t.text(x, y, line, t.attr({ fg: "cyan" }));
    return t.text(x, y, line.replace(/\*/g, ""), t.attr({ fg: "fg" }));
  }
  if (kind === "json") {
    const m = line.match(/^(\s*)"([^"]*)":\s*(.*)$/);
    if (!m) return t.text(x, y, line, t.attr({ fg: "dim" }));
    t.text(x, y, m[1] + `"${m[2]}"`, t.attr({ fg: "blue" }));
    t.text(x + m[1].length + m[2].length + 2, y, ": " + m[3], t.attr({ fg: /^"|$/.test(m[3][0]) ? "green" : "purple" }));
    return;
  }
  if (kind === "svg" || kind === "xml") {
    const m = line.match(/^(\s*)([a-zA-Z-]+)/);
    if (m) t.text(x, y, m[1] + m[2], t.attr({ fg: "green" }));
    const rest = m ? line.slice(m[0].length) : line;
    return t.text(x + (m ? m[0].length : 0), y, rest, t.attr({ fg: "cyan" }));
  }
  // code: comment, string, keyword, number — four rules is a highlighter at this scale
  if (/^\s*(\/\/|#(?!include))/.test(line)) return t.text(x, y, line, t.attr({ fg: "faint", i: true }));
  const cut = line.search(/["'`]/);
  const codePart = cut < 0 ? line : line.slice(0, cut);
  let i = 0;
  for (const word of codePart.split(/(\s+|[(),.;{}[\]])/)) {
    if (!word) continue;
    if (KEYWORDS.test(word)) t.text(x + i, y, word, t.attr({ fg: "purple", b: true }));
    else if (/^\d+$/.test(word)) t.text(x + i, y, word, t.attr({ fg: "orange" }));
    else if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) t.text(x + i, y, word, t.attr({ fg: "blue" }));
    else t.text(x + i, y, word, t.attr({ fg: "fg" }));
    i += word.length;
  }
  if (cut >= 0) t.text(x + cut, y, line.slice(cut), t.attr({ fg: "green" }));
}

function kindOf(name) {
  if (name.endsWith(".md")) return "md";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".svg") || name.endsWith(".xml")) return "svg";
  if (name.endsWith(".png") || name.endsWith(".jpg")) return "bin";
  return "code";
}

function drawPreview(t, r, focused) {
  const n = cursorNode();
  t.text(r.x, r.y - 1, n ? ` ${n.name} · ${kindOf(n.name)} · ${n.size} B ` : " preview ", t.attr({ fg: focused ? "accent" : "faint", b: focused }));
  if (!n || n.type === "dir") {
    const d = n?.type === "dir" ? n.children.filter(Boolean) : [];
    t.text(r.x + 1, r.y, `${d.length} entries`, t.attr({ fg: "dim" }));
    d.slice(0, r.h - 2).forEach((c, i) => t.text(r.x + 1, r.y + 1 + i, (c.type === "dir" ? "▸ " : "  ") + c.name, t.attr({ fg: c.type === "dir" ? "blue" : "fg" })));
    return;
  }
  const kind = kindOf(n.name);
  if (kind === "bin") {
    // block art from the name's hash: a suggestion of a thumbnail, and labelled as one
    const art = r.w - 3, arth = Math.max(4, Math.min(14, r.h - 3));
    const h = [...n.name].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
    for (let y = 0; y < arth; y++) {
      for (let x = 0; x < art; x++) {
        const v = Math.sin((x + h % 97) * 0.31 + y * 0.42) * Math.cos((y + h % 31) * 0.27 - x * 0.11);
        const idx = Math.floor(((v + 1) / 2) * 5);
        const ch = " ░▒▓█"[idx];
        const hue = ["faint", "blue", "cyan", "green", "accent"][idx];
        t.cell(r.x + 1 + x, r.y + y, ch, t.attr({ fg: hue }));
      }
    }
    t.text(r.x + 1, r.y + arth + 1, `${n.name} — ${kind === "bin" ? "binary" : kind}, art from its name, not its pixels`, t.attr({ fg: "faint", i: true }));
    return;
  }
  const lines = (n.content ?? "").split("\n");
  const numW = String(lines.length).length;
  lines.slice(0, r.h).forEach((line, i) => {
    t.text(r.x, r.y + i, pad(i + 1, numW) + " ", t.attr({ fg: "faint" }));
    if (n.status === "M" && i < 12) {
      // pretend the first twelve lines carry the edit, so the diff has a visible face
      if (i === 4) t.cell(r.x + numW, r.y + i, "+", t.attr({ fg: "green", b: true }));
    }
    highlight(t, r.x + numW + 1, r.y + i, line.slice(0, r.w - numW - 2), kind);
  });
  if (lines.length > r.h) t.text(r.x + 1, r.y + r.h - 1, `… ${lines.length - r.h} more lines`, t.attr({ fg: "faint", i: true }));

  // the file-info footer: what ranger puts under the preview, so the bottom of a tall pane carries
  // something true about the file rather than nothing
  const fy = Math.min(r.y + lines.length + 1, r.y + r.h - 5);
  if (fy + 4 < r.y + r.h) {
    t.hline(r.x, fy, r.w, "─", t.attr({ fg: "line" }));
    const words = (n.content ?? "").split(/\s+/).filter(Boolean).length;
    const bytes = n.size ?? (n.content?.length ?? 0);
    const sha = [...n.name].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(16).padStart(8, "0").slice(0, 7);
    t.text(r.x + 1, fy + 1, "info", t.attr({ fg: "faint", b: true }));
    t.text(r.x + 8, fy + 1, `${lines.length} lines · ${words} words · ${bytes} bytes · ${kind}`, t.attr({ fg: "dim" }));
    t.text(r.x + 1, fy + 2, "mode", t.attr({ fg: "faint", b: true }));
    t.text(r.x + 8, fy + 2, `0644 · jpl:users · ${n.status ? `git ${n.status}` : "clean"}`, t.attr({ fg: n.status ? "yellow" : "dim" }));
    t.text(r.x + 1, fy + 3, "blob", t.attr({ fg: "faint", b: true }));
    t.text(r.x + 8, fy + 3, `${sha} · mtime Sun 16:58 · ${n.staged ? "in the index" : "working tree"}`, t.attr({ fg: "dim" }));
    // how big the file is against the biggest one on the shelf — a bar is quicker to read than a number
    t.text(r.x + 1, fy + 4, "size", t.attr({ fg: "faint", b: true }));
    t.bar(r.x + 8, fy + 4, Math.max(6, r.w - 18), Math.min(1, bytes / 12000), { fg: "blue", track: "░", trackFg: "line" });
    t.text(r.x + Math.max(6, r.w - 18) + 9, fy + 4, `${Math.round(Math.min(1, bytes / 12000) * 100)}% of 12k`, t.attr({ fg: "faint" }));
  }
}

function drawGit(t, r, focused) {
  const { unstaged, staged } = indexLists();
  t.box(r.x, r.y, r.w, r.h, { title: `git · ${state.branch}`, sub: `+${state.ahead} −${state.behind}`, corners: "heavy", style: { fg: focused ? "line2" : "line" } });
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  let y = inner.y;
  const row = (label, items, kind) => {
    if (y >= inner.y + inner.h) return;
    t.text(inner.x, y, ` ${label} ${items.length} `, t.attr({ fg: kind === "staged" ? "green" : kind === "unstaged" ? "yellow" : "faint", b: true }));
    y++;
    items.slice(0, 6).forEach((it, i) => {
      if (y >= inner.y + inner.h) return;
      const gi = kind === "staged" ? staged.indexOf(it) : unstaged.indexOf(it);
      const on = focused && state.gitSel === (kind === "unstaged" ? gi : unstaged.length + gi);
      const glyph = STATUS_GLYPH[it.node.status] ?? " ";
      const col = it.node.status === "M" ? "yellow" : it.node.status === "A" ? "green" : it.node.status === "D" ? "red" : "faint";
      t.text(inner.x + 1, y, `${glyph} ${it.path.join("/")}`, t.attr({ fg: on ? "bg" : col, bg: on ? "accent" : null }));
      t.text(inner.x + inner.w - 8, y, it.node.staged ? "staged" : "to stage", t.attr({ fg: on ? "bg" : "faint" }));
      t.hit(inner.x, y, inner.w, 1, () => { state.pane = "git"; state.gitSel = kind === "unstaged" ? gi : unstaged.length + gi; }, "git");
      y++;
    });
    y++;
  };
  row("unstaged", unstaged, "unstaged");
  row("staged", staged, "staged");
  if (y < inner.y + inner.h) {
    t.text(inner.x, y, " log ", t.attr({ fg: "faint", b: true })); y++;
    state.commits.slice(0, Math.max(0, inner.y + inner.h - y - 6)).forEach((c) => {
      if (y >= inner.y + inner.h) return;
      t.text(inner.x + 1, y, c.hash, t.attr({ fg: "orange" }));
      t.text(inner.x + 8, y, c.subject.slice(0, inner.w - 9), t.attr({ fg: "dim" }));
      y++;
    });
  }
  // the stat block, then the remotes: two things a git panel always shows and this one did not
  if (y + 2 <= inner.y + inner.h) {
    y++;
    t.text(inner.x, y, " diff --stat ", t.attr({ fg: "faint", b: true })); y++;
    for (const it of [...staged, ...unstaged]) {
      if (y >= inner.y + inner.h - 2) break;
      const path = it.path.join("/");
      const adds = ((it.node.content?.length ?? 137) % 87) + 4;
      const dels = Math.max(1, Math.round(adds * 0.38));
      t.text(inner.x + 1, y, pad(path, Math.max(8, inner.w - 18)), t.attr({ fg: "fg" }));
      t.bar(inner.x + 1 + Math.max(8, inner.w - 18), y, 8, adds / (adds + dels), { fg: "green", track: "·", trackFg: "red" });
      t.text(inner.x + inner.w - 8, y, `+${adds} −${dels}`, t.attr({ fg: "dim" }));
      t.hit(inner.x, y, inner.w, 1, () => { state.pane = "git"; }, "stat");
      y++;
    }
  }
  if (y + 2 <= inner.y + inner.h) {
    y++;
    t.text(inner.x, y, " remotes ", t.attr({ fg: "faint", b: true })); y++;
    t.text(inner.x + 1, y, `origin  ${state.branch} → up${state.ahead ? ` (${state.ahead} ahead)` : ", in sync"}`, t.attr({ fg: state.ahead ? "yellow" : "green" })); y++;
    if (y < inner.y + inner.h) t.text(inner.x + 1, y, "stash   1 entry · wip: spectrum smoothing", t.attr({ fg: "dim" }));
  }
}

function draw(t, dt) {
  t.clear();
  const compact = t.cols < 92;
  const body = { x: 0, y: 1, w: t.cols - 1, h: t.rows - 2 };

  if (compact) {
    const tabs = ["tree", "preview", "git"];
    let x = 1;
    state.tab = state.tab ?? 0;
    tabs.forEach((label, i) => {
      const w = label.length + 2;
      const on = state.tab === i;
      t.text(x, 0, `${i + 1}:${label}`, t.attr({ fg: on ? "bg" : "dim", bg: on ? "accent" : null, b: on }));
      t.hit(x, 0, w, 1, () => (state.tab = i), "tab");
      x += w + 1;
    });
    t.text(0, 1, "─".repeat(t.cols), t.attr({ fg: "line" }));
    const r = { x: 0, y: 2, w: t.cols - 2, h: body.h - 1 };
    [drawTree, drawPreview, drawGit][state.tab](t, r, true);
  } else {
    const tw = Math.max(22, Math.min(34, Math.round(t.cols * 0.26)));
    const gw = Math.max(28, Math.min(46, Math.round(t.cols * 0.32)));
    drawTree(t, { x: 0, y: body.y + 1, w: tw, h: body.h - 1 }, state.pane === "tree");
    drawPreview(t, { x: tw + 1, y: body.y + 1, w: t.cols - tw - gw - 4, h: body.h - 1 }, false);
    drawGit(t, { x: t.cols - gw - 1, y: body.y + 1, w: gw, h: body.h - 1 }, state.pane === "git");
  }

  // status line: the branch, the index, the cursor, and the keys that do the work
  const y = t.rows - 1;
  const n = cursorNode();
  const { unstaged, staged } = indexLists();
  t.status(y, [
    state.committing ? `commit: “${state.committing}▌”` : `rig · ${state.branch}`,
    `${staged.length} staged`, `${unstaged.length} unstaged`,
    n ? `${state.cwd.join("/")}${n.name}${n.type === "dir" ? "/" : ""}` : "—",
    state.filter ? `filter “${state.filter}”` : null,
    state.hidden ? "showing dotfiles" : null,
  ], state.committing ? ["enter commits · esc gives up"]
    : state.filtering ? ["type to filter · esc clears"]
    : ["j/k · l open · space stage · c commit · d discard · R churn · / filter · i hidden"],
  { bg: "line2", fg: "bg" });
}

/* ------------------------------------------------------------------ input */

const churnPick = () => {
  const files = allNodes(TREE.children, []).filter(({ node }) => node.type === "file" && !node.status);
  return files.length ? files[Math.floor(rand() * files.length)] : null;
};

function onKey(k) {
  if (state.committing != null) {
    if (k === "Esc") { state.committing = null; return true; }
    if (k === "Enter") {
      const subject = state.committing.trim() || "wip";
      const { staged } = indexLists();
      for (const it of staged) { it.node.status = null; it.node.staged = false; }
      state.commits.unshift({ hash: Math.floor(rand() * 0xfffffff).toString(16).padStart(7, "0"), who: "jpl", subject });
      state.ahead++;
      state.committing = null;
      window.tui.toast(`committed ${staged.length} file${staged.length === 1 ? "" : "s"}: ${subject.slice(0, 30)}`);
      return true;
    }
    if (k === "Backspace") { state.committing = state.committing.slice(0, -1); return true; }
    if (k.length === 1) { state.committing += k; return true; }
    return true;
  }
  if (state.filtering) {
    if (k === "Esc") { state.filtering = false; state.filter = ""; return true; }
    if (k === "Enter") { state.filtering = false; return true; }
    if (k === "Backspace") { state.filter = state.filter.slice(0, -1); state.sel = 0; return true; }
    if (k.length === 1) { state.filter += k; state.sel = 0; return true; }
    return true;
  }

  const compact = window.tui?.compact;
  const inTree = !compact || state.tab === 0 || state.tab === undefined;
  const { unstaged, staged } = indexLists();
  const all = [...unstaged, ...staged];

  switch (k) {
    case "1": case "2": case "3": if (compact) { state.tab = +k - 1; return true; } break;
    case "j": case "ArrowDown":
      if (state.pane === "git" && !compact) state.gitSel = clamp(state.gitSel + 1, 0, Math.max(0, all.length - 1));
      else state.sel = clamp(state.sel + 1, 0, Math.max(0, state.flat.length - 1));
      return true;
    case "k": case "ArrowUp":
      if (state.pane === "git" && !compact) state.gitSel = clamp(state.gitSel - 1, 0, all.length - 1);
      else state.sel = clamp(state.sel - 1, 0, state.flat.length - 1);
      return true;
    case "l": case "Enter": {
      if (state.pane === "git" && !compact) { const it = all[state.gitSel]; if (it) { const i = state.flat.findIndex((f) => f.node === it.node); if (i >= 0) state.sel = i; } return true; }
      const n = cursorNode();
      if (n?.type === "dir") { n.open = !n.open; state.cwd = state.flat[state.sel]?.path.slice(1, -1) ?? []; }
      else if (compact) { state.tab = 1; }
      return true;
    }
    case "h": case "ArrowLeft": {
      const n = cursorNode();
      if (n?.type === "dir" && n.open) n.open = false;
      else { state.cwd = state.cwd.slice(0, -1); }
      return true;
    }
    case " ": {
      const it = state.pane === "git" && !compact ? all[state.gitSel] : state.flat[state.sel]?.node ? { node: state.flat[state.sel].node } : null;
      const node = it?.node;
      if (!node || node.type === "dir") return true;
      if (!node.status) { window.tui.toast(`${node.name} is already what HEAD says`); return true; }
      if (node.staged && node.status === "A") { node.status = "?"; node.staged = false; }   // un-adding a new file untracks it
      else node.staged = !node.staged;
      window.tui.toast(node.staged ? `staged ${node.name}` : `unstaged ${node.name}`);
      return true;
    }
    case "c": {
      const { staged } = indexLists();
      if (!staged.length) { window.tui.toast("nothing staged — space stages the file under the cursor"); return true; }
      state.committing = staged.length === 1 ? `edit ${staged[0].node.name}` : `edit ${staged.length} files`;
      return true;
    }
    case "d": {
      const node = state.pane === "git" && !compact ? all[state.gitSel]?.node : state.flat[state.sel]?.node;
      if (!node || !node.status) { window.tui.toast("nothing to discard"); return true; }
      if (node.status === "?") {
        const parent = allNodes(TREE.children, []).find(({ node: p }) => p.type === "dir" && p.children?.includes(node));
        if (parent) parent.node.children = parent.node.children.filter((c) => c !== node);
      } else { node.status = null; node.staged = false; }
      window.tui.toast(`discarded ${node.name}`);
      return true;
    }
    case "R": {
      state.refreshed++;
      const pick = churnPick();
      if (!pick) { window.tui.toast("the working tree is clean, nothing to churn"); return true; }
      pick.node.status = "M"; pick.node.staged = false;
      pick.node.content = (pick.node.content ?? "") + `\n// touched by the sweep ${state.refreshed}\n`;
      pick.node.size = (pick.node.content ?? "").length;
      state.churn++;
      window.tui.toast(`the sweep edited ${pick.node.name}`);
      return true;
    }
    case "/": state.filtering = true; state.filter = ""; return true;
    case "i": state.hidden = !state.hidden; state.sel = 0; return true;
    case "Tab": state.pane = state.pane === "tree" ? "git" : "tree"; return true;
    case "q":
      window.tui.quit({ command: "rig", line: `${state.commits.length - 5} commit${state.commits.length === 5 ? "" : "s"} made · ${state.churn} file${state.churn === 1 ? "" : "s"} churned · branch ${state.branch} +${state.ahead}` });
      return true;
    default: return false;
  }
}

function onTap(x, y, tui) {
  if (tui.compact) return false;               // tabs, nodes and index rows own their regions
  if (x < 1) return false;
  return false;
}

createTUI({
  name: "rig",
  sub: "— file manager · git",
  font: '"Fira Code Variable", ui-monospace, "DejaVu Sans Mono", monospace',
  size: 13, lh: 1.26, fps: 8, minCols: 34, compactAt: 92, vignette: 0.2,
  palette: PAL,
  keys: [
    { k: "j", l: "down" }, { k: "k", l: "up" }, { k: "l", l: "open" }, { k: "h", l: "back" }, "sep",
    { k: "Space", l: "stage" }, { k: "c", l: "commit" }, { k: "d", l: "discard" }, "sep",
    { k: "R", l: "churn" }, { k: "/", l: "filter" }, { k: "i", l: "hidden" }, { k: "Tab", l: "pane" }, { k: "q", l: "quit" },
  ],
  help: [
    ["j / k, ↑ ↓", "walk the tree (or the index once Tab has focused it) — tap a row on a phone"],
    ["l or Enter", "open a directory, or jump to the file the index points at"],
    ["h", "collapse a directory, or go up out of it"],
    ["Space", "stage the file under the cursor, or un-stage it; a new file un-adds to ?? on the second press"],
    ["c", "commit what is staged — the message is typed here, Enter takes it"],
    ["d", "discard a file's changes (an untracked file goes away)"],
    ["R", "poke the working tree: a clean file comes back modified"],
    ["/", "filter the tree by name, i toggles dotfiles"],
    ["Tab", "tree ↔ index"],
    ["1 2 3", "on a phone: tree, preview, git"],
    ["q", "quit to the exit panel"],
  ],
  draw, onKey, onTap,
  pills: () => {
    const { unstaged, staged } = indexLists();
    return { a: state.committing ? "committing" : `${state.branch}`, b: `${staged.length} staged / ${unstaged.length} dirty` };
  },
  state: () => {
    const { unstaged, staged } = indexLists();
    const n = cursorNode();
    return {
      pane: state.pane, tab: state.tab ?? null, branch: state.branch, ahead: state.ahead,
      unstaged: unstaged.map((i) => i.node.name), staged: staged.map((i) => i.node.name),
      unstagedN: unstaged.length, stagedN: staged.length,
      commits: state.commits.length, top: state.commits[0]?.subject ?? null,
      cursor: n?.name ?? null, cursorStatus: n?.status ?? null,
      filter: state.filter, hidden: state.hidden, committing: state.committing,
      churn: state.churn, refreshed: state.refreshed, nodes: state.flat.length,
    };
  },
  api: {
    select: (i) => { state.sel = clamp(+i, 0, Math.max(0, state.flat.length - 1)); },
    stage: () => onKey(" "),
    stageAll: () => { for (const { node } of allNodes(TREE.children, []).filter(({ node }) => node.type === "file" && node.status)) node.staged = true; return indexLists().staged.length; },
    commit: (msg) => { state.committing = String(msg ?? "wip"); onKey("Enter"); return state.commits[0]?.subject ?? null; },
    discard: () => onKey("d"),
    churn: () => { onKey("R"); return state.churn; },
    filter: (s) => { state.filter = String(s ?? ""); state.sel = 0; return state.flat.length; },
    pane: (p) => { if (["tree", "git"].includes(p)) state.pane = p; return state.pane; },
    tab: (i) => { state.tab = clamp(+i, 0, 2); return state.tab; },
    checkout: (b) => { if (/^[a-z0-9\/.-]+$/.test(String(b))) { state.branch = String(b); state.ahead = 0; } return state.branch; },
    quit: () => onKey("q"),
    resume: () => window.tui.resume(),
  },
});
