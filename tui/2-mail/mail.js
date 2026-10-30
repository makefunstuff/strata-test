// post — tui/2: a mutt/aerc-style mail reader.
//
// Three columns the way a terminal mail client has them: folders, a thread list, the reader. No
// borders here (the other pages have them): the panes are separated by rules and the focused one
// carries a colored gutter, which is how mutt says "the keys act here".
// Reply actually types, delete really moves the message to trash, / really filters, g really brings
// a new message in. All the mail is fictional; the strings are the ones a repo's CI would generate.
import { createTUI, pad, clamp, wrap, rng } from "../shared/tui.js";

const PAL = {
  // solarized dark: a warm ink on a teal-black, and no pure black anywhere
  pageBg: "#001d27", screenBg: "#00212b", panel: "#073642", well: "#002b36", line: "#0e4a5c",
  line2: "#2aa5c4", fg: "#93a1a1", bright: "#eee8d5", dim: "#657b83", faint: "#4c6270",
  accent: "#268bd2", yellow: "#b58900", orange: "#cb4b16", red: "#dc322f", magenta: "#d33682",
  violet: "#6c71c4", cyan: "#2aa198", green: "#859900", track: "#0b3947",
};

const rand = rng(0x5eed17);

const FOLDERS = [
  { name: "inbox", path: "INBOX" },
  { name: "sent", path: "Sent" },
  { name: "drafts", path: "Drafts" },
  { name: "list/dev", path: "lists/dev" },
  { name: "archive", path: "Archive" },
  { name: "trash", path: "Trash" },
];

const M = (folder, from, addr, subject, date, body, opts = {}) => ({
  folder, from, addr, subject, date, body,
  unread: opts.unread ?? true, starred: opts.starred ?? false,
  labels: opts.labels ?? [], attach: opts.attach ?? [],
  id: "m" + Math.floor(rand() * 1e6).toString(36),
});

let MSGS = [
  M("inbox", "Nadia Kerr", "nadia@example.dev", "Re: the shelf pages 404 on Pages", "Mon 09:14",
    "The manifest lived under tools/ and the workflow rsyncs with --exclude tools/, so the fetch 404s\nin production while every local check stays green.\n\nTwo fixes: copy the one file the page actually loads, and make the checker serve the repo root\nthe way Pages does. Otherwise we keep measuring a site that does not exist.\n\n> On Sun, Kim wrote:\n> I ran the sweep three times and it was green all three. I do not think the checker is wrong,\n> I think it is checking somewhere else.\n\n-- \nNadia Kerr · infrastructure · example\n\u201cthe check that never fails has never run\u201d",
    { attach: ["pages.yml.diff"], labels: ["pages"], starred: true }),
  M("inbox", "CI bot", "ci@strata.example", "build #212 passed — tui/1-monitor", "Mon 08:52",
    "42 checks, 0 errors, 0 failures.\n  desktop 1280x800  ok\n  phone    390x844  ok\n  glyphs            ok (74 distinct, no fallback)\n\nTotal 21.4s. Artifacts kept under shots/.",
    { unread: false }),
  M("inbox", "Kim", "juri@example.dev", "the monitor looks wrong on the phone", "Sun 22:41",
    "Not the layout — the numbers. The per-core bars never leave the bottom third while the headline\nsays 58%. Either the headline is the sum of the cores or it is the average, and right now I think\nit is neither.",
    { labels: ["bug"] }),
  M("inbox", "Nadia Kerr", "nadia@example.dev", "fonts: audit or it did not happen", "Sun 20:03",
    "A webfont that a face does not carry falls back silently and your columns are gone. Measure the\nadvance width of every glyph you draw and fail the build on the odd one out. It costs 20 lines.",
    { starred: true }),
  M("inbox", "RSS: lwn.net", "rss@feeds.example", "The state of terminal UIs in 2026", "Sun 18:20",
    "Character-cell rendering is having a moment: ratatui, bubbletea and a dozen browser kits. The\ninteresting part is not the widgets, it is how little you need when you have a grid and a font.",
    { unread: false }),
  M("inbox", "Patch Series", "b4@lists.example", "[tui 1/6] pulse: per-core load", "Sun 16:58",
    "Signed-off-by: Nadia Kerr <nadia@example.dev>\n---\n tui/1-monitor/monitor.js | 42 ++++++++++++++++++++++\n 1 file changed, 42 insertions(+)",
    { attach: ["0001-pulse-per-core.patch"] }),
  M("inbox", "Hosting", "noreply@pages.example", "Deployment 1183 succeeded", "Sun 15:11",
    "Your site was deployed. 6 files changed, 41.2 KiB.\nhttps://example.invalid/strata-test/tui/", { unread: false }),
  M("inbox", "Kim", "juri@example.dev", "what did Strata actually get right?", "Sun 11:02",
    "For the README verdict: I want one paragraph on what the small model did well and one on what it\ngot wrong, with the file names in it. Not a score.",
    { labels: ["readme"] }),
  M("sent", "me", "dev@example.com", "Re: the shelf pages 404 on Pages", "Mon 09:31",
    "Agreed. Fixing the workflow to copy the manifest explicitly, and the checker to mirror the URL.\nI will run the sweep again after both.", {}),
  M("sent", "me", "dev@example.com", "tui shelf: six designs", "Sat 19:02",
    "Six terminal apps, six different jobs, one kit. Each page gets a keyboard map, a phone tap map\nand a headless check that drives the keys and reads the state back.", { unread: false }),
  M("drafts", "me", "dev@example.com", "draft: verdict on the model", "Sat 18:40",
    "It got the boring things right and the visible things wrong: the buffer, the key map and the\nchecks were solid, the bars needed three passes because the numbers had no shape.", {}),
  M("list/dev", "Blender list", "users@blender.example", "EEVEE next notes", "Sun 12:00",
    "The volumetric pipeline now renders at half res with a temporal filter; the artefacts moved from\nthe edges into the interior, which is a trade I can live with.", { unread: false }),
  M("list/dev", "Hyprland list", "github@hypr.example", "Re: fractional scaling and gaps", "Sat 21:14",
    "Gaps are computed in logical pixels after the scale, so at 1.25 you get the gap you asked for\nmultiplied by the rounding of the layout, not the one you typed.", {}),
  M("archive", "CI bot", "ci@strata.example", "build #211 failed — design/04-tui", "Fri 23:55",
    "1 check failed: contrast 3.1:1 on .dim text (needs 4.5:1).", { unread: false }),
  M("archive", "Nadia Kerr", "nadia@example.dev", "the check harness needs a watchdog", "Fri 22:10",
    "Every path out of the harness must close Chromium, including the timeout. Otherwise the sweep\nleaves a browser per failed page and the box swaps.", { unread: false }),
];

const NEW_MAIL = [
  M("inbox", "CI bot", "ci@strata.example", "build #213 passed — tui/5-ops", "now",
    "44 checks, 0 errors. The log stream advanced 61 lines while the harness pressed keys.", {}),
  M("inbox", "Nadia Kerr", "nadia@example.dev", "review: the seek bar must be tappable", "now",
    "On a phone there is no arrow key. The seek bar is a hit region, not decoration.", {}),
  M("inbox", "Kim", "juri@example.dev", "one more design, please", "now",
    "Six is a good number for a shelf. Make the seventh the one you were afraid to attempt.", {}),
];

const state = {
  folder: 0, focus: "list",              // folders | list | reader
  sel: 0, open: null, readerTop: 0,
  query: "", searching: false,
  composing: null,                        // {to, subject, lines, caret}
  deleted: null, syncs: 0, sentCount: 0, newCount: 0, lastSync: "never",
  showFolders: true,
};

// a mail client does not open on an empty reader: restore the newest message the way mutt restores
// the last one it had open
state.open = MSGS[0].id;
MSGS[0].unread = false;

const inFolder = () => MSGS.filter((m) => m.folder === FOLDERS[state.folder].name);
const visible = () => {
  const q = state.query.toLowerCase();
  return inFolder().filter((m) => !q || m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q) || m.body.toLowerCase().includes(q));
};
const unreadCount = (name) => MSGS.filter((m) => m.folder === name && m.unread).length;
const at = () => visible()[state.sel] ?? null;

/* ------------------------------------------------------------------ drawing */

function gutter(t, r, on, col = "accent") {
  if (!on) return;
  t.vline(r.x, r.y, r.h, "▏", t.attr({ fg: col }));
}

function drawFolders(t, r, focused) {
  t.text(r.x, r.y - 1, " FOLDERS ", t.attr({ fg: focused ? "accent" : "faint", b: focused }));
  gutter(t, { ...r, y: r.y - 1, h: r.h + 1 }, focused);
  FOLDERS.forEach((f, i) => {
    const y = r.y + i;
    if (y >= r.y + r.h) return;
    const un = unreadCount(f.name);
    const on = i === state.folder;
    const base = { fg: on ? "bg" : un ? "bright" : "dim", bg: on ? "accent" : null, b: on || !!un };
    t.text(r.x + 1, y, pad(f.name, r.w - 8), t.attr(base));
    t.text(r.x + r.w - 6, y, un ? pad(un, 4, true) + " " : "     ", t.attr({ ...base, fg: on ? "bg" : "yellow" }));
    t.hit(r.x, y, r.w, 1, () => { state.folder = i; state.sel = 0; state.open = null; state.focus = "list"; }, "folder");
  });
  const y = r.y + FOLDERS.length + 1;
  if (y + 6 < r.y + r.h) {
    t.text(r.x + 1, y, "maildir", t.attr({ fg: "faint" }));
    const starred = MSGS.filter((m) => m.starred).length;
    t.text(r.x + 1, y + 1, `* ${starred} starred`, t.attr({ fg: "yellow" }));
    t.text(r.x + 1, y + 2, `del ${state.deleted ? 1 : 0} undoable`, t.attr({ fg: "dim" }));
    t.text(r.x + 1, y + 3, `${state.newCount} arrived`, t.attr({ fg: "green" }));
    // the quota: how full the mailbox is, in the same units the server quotes
    const used = MSGS.length + state.newCount;
    const total = Math.max(used + 8, 32);
    t.text(r.x + 1, y + 5, `${used}/${total} msgs`, t.attr({ fg: "faint" }));
    t.bar(r.x + 1, y + 6, r.w - 3, used / total, { fg: used / total > 0.8 ? "yellow" : "accent", track: "░", trackFg: "line" });
    t.text(r.x + 1, y + 7, `synced ${state.syncs ? state.lastSync + " ago" : "never"}`, t.attr({ fg: "faint" }));
  }
}

/** Messages that share a subject once "Re:" is stripped, in any folder — mutt's thread idea. */
function threadOf(m) {
  if (!m) return [];
  const base = (s) => s.replace(/^(re|fwd?):\s*/i, "").toLowerCase().trim();
  const root = base(m.subject);
  return MSGS.filter((x) => base(x.subject) === root);
}

function drawList(t, r, focused) {
  const list = visible();
  const f = FOLDERS[state.folder];
  t.text(r.x, r.y - 1, ` ${f.path} ${list.length}/${inFolder().length}${state.query ? ` · “${state.query}”` : ""} `, t.attr({ fg: focused ? "accent" : "faint", b: focused }));
  gutter(t, { ...r, y: r.y - 1, h: r.h + 1 }, focused);
  const top = clamp(state.sel - Math.floor(r.h / 2), 0, Math.max(0, list.length - r.h));
  for (let i = 0; i < r.h; i++) {
    const m = list[top + i];
    const y = r.y + i;
    if (!m) continue;
    const on = state.open === m.id;
    const sel = top + i === state.sel;
    const mark = `${m.starred ? "*" : " "}${m.unread ? "!" : " "}`;
    const from = pad(m.from.length > 12 ? m.from.slice(0, 11) + "…" : m.from, 12);
    // the subject is clipped to leave the date column clear — printing over it is how these lists rot
    const line = `${mark} ${from} ${m.subject}`.slice(0, r.w - 13);
    const bg = sel ? "accent" : on ? "line" : null;
    t.text(r.x + 1, y, pad(line, r.w - 13), t.attr({ fg: bg ? "bg" : m.unread ? "bright" : "dim", bg, b: m.unread && !sel }));
    t.text(r.x + r.w - 11, y, pad(m.date, 10), t.attr({ fg: bg ? "bg" : "faint" }));
    t.hit(r.x, y, r.w, 1, () => { state.sel = top + i; state.open = m.id; state.readerTop = 0; m.unread = false; state.focus = "list"; }, "msg");
  }
  state.sel = clamp(state.sel, 0, Math.max(0, list.length - 1));

  // the thread under the list: a mail reader that cannot show who replied to whom is a list viewer
  const open = MSGS.find((x) => x.id === state.open) ?? list[state.sel];
  const thread = threadOf(open);
  const ty0 = r.y + Math.min(list.length, r.h) + 1;
  if (thread.length > 1 && ty0 + 2 < r.y + r.h) {
    t.text(r.x + 1, ty0, `thread · ${thread.length}`, t.attr({ fg: "faint", b: true }));
    thread.slice(0, Math.max(1, r.y + r.h - ty0 - 1)).forEach((x, i) => {
      const y = ty0 + 1 + i;
      const on = x.id === state.open;
      t.text(r.x + 2, y, (i === 0 ? "├─ " : "└─ ") + pad(x.from, 12) + " " + x.subject.replace(/^(re|fwd?):\s*/i, ""),
        t.attr({ fg: on ? "accent" : "dim", b: on }));
      t.hit(r.x, y, r.w, 1, () => { state.open = x.id; state.readerTop = 0; x.unread = false; state.sel = Math.max(0, list.findIndex((z) => z.id === x.id)); }, "thread");
    });
  }
}

function drawReader(t, r, focused) {
  const m = MSGS.find((x) => x.id === state.open);
  if (state.composing) return drawCompose(t, r);
  t.text(r.x, r.y - 1, " READER ", t.attr({ fg: focused ? "accent" : "faint", b: focused }));
  gutter(t, { ...r, y: r.y - 1, h: r.h + 1 }, focused);
  if (!m) {
    t.text(r.x + 2, r.y + 1, "no message selected — j/k to walk the list, Enter to open", t.attr({ fg: "faint", i: true }));
    t.text(r.x + 2, r.y + 3, "r replies to what is open · / filters this folder · g syncs", t.attr({ fg: "faint", i: true }));
    return;
  }
  let y = r.y;
  const head = (k, v, col) => {
    t.text(r.x + 2, y, pad(k + ":", 8), t.attr({ fg: "faint" }));
    t.text(r.x + 11, y, v, t.attr({ fg: col ?? "bright", b: k === "Subject" }));
    y++;
  };
  head("From", `${m.from} <${m.addr}>`);
  head("To", "me <dev@example.com>", "dim");
  head("Date", m.date + " 2026", "dim");
  if (m.labels.length) head("Labels", m.labels.join(", "), "cyan");
  head("Subject", m.subject, "accent");
  t.hline(r.x + 1, y, r.w - 2, "─", t.attr({ fg: "line" }));
  y++;
  const bodyW = Math.max(20, r.w - 5);
  const lines = wrap(m.body, bodyW);
  const shown = lines.slice(state.readerTop, state.readerTop + Math.max(1, r.y + r.h - y - (m.attach.length ? 2 : 1)));
  for (const ln of shown) {
    if (ln.startsWith("  ") || /^\s{2,}/.test(ln)) t.text(r.x + 3, y, ln, t.attr({ fg: "cyan" }));
    else if (/^(Signed-off-by|https?:)/.test(ln)) t.text(r.x + 3, y, ln, t.attr({ fg: "violet", u: true }));
    else t.text(r.x + 3, y, ln, t.attr({ fg: "fg" }));
    y++;
  }
  if (m.attach.length) {
    t.text(r.x + 2, y, "└ " + m.attach.map((a) => `[${a}]`).join(" "), t.attr({ fg: "orange" }));
    y += 2;                                  // the envelope starts under the attachment, not on it
  }
  // the envelope: where this message came from, in the fields the headers actually carry
  const ey = Math.min(y + 1, r.y + r.h - 6);
  if (ey + 5 < r.y + r.h) {
    t.hline(r.x + 1, ey, r.w - 3, "─", t.attr({ fg: "line" }));
    const bytes = 412 + m.body.length * 3 + m.subject.length * 7;
    const mid = `<${m.id}.${Date.parse("2026-10-28T09:14:00Z") + m.id.length}@strata.example>`;
    const row = (k, v, col = "dim") => {
      t.text(r.x + 2, ey + 1 + row.n, pad(k, 12), t.attr({ fg: "faint" }));
      t.text(r.x + 15, ey + 1 + row.n, String(v).slice(0, Math.max(4, r.w - 17)), t.attr({ fg: col }));
      row.n++;
    };
    row.n = 0;
    row("Message-Id", mid, "dim");
    row("X-Maildir", `${FOLDERS[state.folder].path.toLowerCase()}/cur/${m.id}:2,${m.unread ? "F" : ""}`);
    row("Size", `${bytes} bytes · ${m.body.split("\n").length} lines of body`);
    row("Received", `from smtp.strata.example (203.0.113.7) by mail.strata.example; ${m.date}, 28 Oct 2026`, "dim");
    row("List-Id", m.addr.endsWith(".example") ? "dev <dev.strata.example>" : "—", "faint");
  }
  state.readerTop = clamp(state.readerTop, 0, Math.max(0, lines.length - 4));
  t.hit(r.x, r.y, r.w, r.h, () => {
    state.readerTop += Math.max(1, Math.floor(r.h / 2));
    if (state.readerTop > Math.max(0, lines.length - 4)) state.readerTop = 0;
  }, "page");
}

function drawCompose(t, r) {
  const c = state.composing;
  t.text(r.x, r.y - 1, " COMPOSE — new message ", t.attr({ fg: "green", b: true }));
  gutter(t, { ...r, y: r.y - 1, h: r.h + 1 }, true, "green");
  let y = r.y;
  t.text(r.x + 2, y, "To:      " + c.to, t.attr({ fg: "dim" })); y++;
  t.text(r.x + 2, y, "Subject: " + c.subject, t.attr({ fg: "bright", b: true })); y++;
  t.hline(r.x + 1, y, r.w - 2, "─", t.attr({ fg: "line" })); y++;
  const bodyW = Math.max(16, r.w - 5);
  const lines = [];
  for (const para of c.lines) lines.push(...(para ? wrap(para, bodyW) : [""]));
  for (const ln of lines.slice(0, Math.max(1, r.y + r.h - y - 1))) {
    t.text(r.x + 3, y, ln, t.attr({ fg: "fg" })); y++;
  }
  // the caret: one cell after the last character of the draft
  const lastLine = lines.length ? lines.length - 1 : 0;
  const cx = r.x + 3 + (lines[lastLine]?.length ?? 0) % bodyW;
  const cy = r.y + 2 + 1 + Math.min(lines.length - 1 || 0, Math.max(1, r.y + r.h - y - 1)) - 1;
  t.cell(clamp(cx, r.x + 3, r.x + r.w - 2), clamp(cy, r.y + 3, r.y + r.h - 1), "▌", t.attr({ fg: "green", cur: true }));
  t.text(r.x + 2, r.y + r.h - 1, "^X send · esc discard · enter newline", t.attr({ fg: "faint" }));
}

function draw(t, dt) {
  t.clear();
  const statusH = 1;
  const wide = t.cols >= 96;
  const body = { x: 0, y: 1, w: t.cols - 1, h: t.rows - statusH - 1 };

  if (wide) {
    const fw = 18, lw = Math.min(46, Math.max(30, Math.round(t.cols * 0.32)));
    drawFolders(t, { x: 0, y: body.y + 1, w: fw, h: body.h - 1 }, state.focus === "folders");
    drawList(t, { x: fw + 1, y: body.y + 1, w: lw, h: body.h - 1 }, state.focus === "list");
    drawReader(t, { x: fw + lw + 2, y: body.y + 1, w: t.cols - fw - lw - 4, h: body.h - 1 }, state.focus === "reader");
  } else {
    // a phone is a narrow terminal: one pane at a time, the folder names become the tab strip
    let x = 1, shownTabs = 0;
    FOLDERS.forEach((f, i) => {
      const w = f.name.length + 2;
      if (x + w > t.cols - 5) return;                 // leave the strip's tail for the +N marker
      shownTabs++;
      const on = i === state.folder;
      t.text(x, 0, `${f.name}${unreadCount(f.name) ? "!" : ""}`.slice(0, w), t.attr({ fg: on ? "bg" : "dim", bg: on ? "accent" : null, b: on }));
      t.hit(x, 0, w, 1, () => { state.folder = i; state.sel = 0; state.open = null; }, "tab");
      x += w + 1;
    });
    if (shownTabs < FOLDERS.length) {
      // the strip cannot hold six folders at 45 columns; say what is off-screen and let a tap cycle
      const more = ` +${FOLDERS.length - shownTabs} `;
      t.text(Math.min(x, t.cols - more.length), 0, more, t.attr({ fg: "dim", b: true }));
      t.hit(Math.min(x, t.cols - more.length), 0, more.length, 1, () => {
        state.folder = (state.folder + 1) % FOLDERS.length; state.sel = 0; state.open = null;
      }, "more");
    }
    t.text(0, 1, "─".repeat(t.cols), t.attr({ fg: "line" }));
    const r = { x: 0, y: body.y + 1, w: t.cols - 2, h: body.h - 1 };
    if (state.composing) drawCompose(t, r);          // was: the list, so a reply typed blind
    else if (state.open) drawReader(t, r, true);
    else drawList(t, r, true);
  }

  // status line
  const y = t.rows - 1;
  const m = at();
  const left = state.composing ? ["COMPOSE", "^X send · esc discard"]
    : state.searching ? ["SEARCH", `“${state.query}▌”`]
    : [`post · ${FOLDERS[state.folder].path}`, `${visible().length}/${inFolder().length}`, `${unreadCount(FOLDERS[state.folder].name)} unread`];
  const right = state.composing ? [] : m
    ? [m.from, t.cols >= 96 ? (m.attach.length ? `${m.attach.length} attach` : "no attach") : "esc → list"]
    : ["j/k move · Enter open · r reply · d delete · / search · g sync"];
  t.status(y, left, right, { bg: "accent", fg: "bg" });
}

/* ------------------------------------------------------------------ input */

function isTyping() { return !!(state.composing || state.searching); }

function onKey(k) {
  if (state.composing) return composeKey(k);
  if (state.searching) {
    if (k === "Esc") { state.searching = false; state.query = ""; return true; }
    if (k === "Enter") { state.searching = false; return true; }
    if (k === "Backspace") { state.query = state.query.slice(0, -1); state.sel = 0; return true; }
    if (k.length === 1) { state.query += k; state.sel = 0; return true; }
    return true;
  }
  const list = visible();
  const m = at();
  switch (k) {
    case "j": case "ArrowDown": state.sel = clamp(state.sel + 1, 0, list.length - 1); state.focus = "list"; return true;
    case "k": case "ArrowUp": state.sel = clamp(state.sel - 1, 0, list.length - 1); state.focus = "list"; return true;
    case "J": state.folder = clamp(state.folder + 1, 0, FOLDERS.length - 1); state.sel = 0; state.open = null; return true;
    case "K": state.folder = clamp(state.folder - 1, 0, FOLDERS.length - 1); state.sel = 0; state.open = null; return true;
    case "Home": case "gg": state.sel = 0; return true;   // "g" alone is sync, below
    case "G": state.sel = Math.max(0, list.length - 1); return true;
    case "n": {
      const i = list.findIndex((x, ix) => ix > state.sel && x.unread);
      state.sel = i < 0 ? 0 : i;
      return true;
    }
    case "Enter": case "o":
      if (m) { state.open = m.id; m.unread = false; state.readerTop = 0; state.focus = "reader"; }
      return true;
    case "Esc":
      if (state.open) { state.open = null; state.focus = "list"; return true; }
      if (state.query) { state.query = ""; return true; }
      return true;
    case "r": case "R": startCompose(m, k === "R"); return true;
    case "y":
      if (!state.open) { window.tui.toast("nothing to save"); return true; }
      {
        const src = MSGS.find((x) => x.id === state.open);
        MSGS.push(M("drafts", "me", "dev@example.com", "Re: " + src.subject, "now", "> " + src.body.split("\n").join("\n> "), { unread: false }));
        window.tui.toast("saved to drafts");
      }
      return true;
    case "d": {
      if (!m) return true;
      const was = m.folder;
      m.folder = "trash"; m.unread = false;
      state.deleted = { id: m.id, was };
      state.open = null;
      window.tui.toast(`moved “${m.subject.slice(0, 28)}” to trash`);
      return true;
    }
    case "u":
      if (!state.deleted) { window.tui.toast("nothing to undo"); return true; }
      {
        const msg = MSGS.find((x) => x.id === state.deleted.id);
        if (msg) msg.folder = state.deleted.was;
        state.deleted = null;
        window.tui.toast("restored");
      }
      return true;
    case "*": case "!":
      if (m) { m.starred = !m.starred; window.tui.toast(m.starred ? "starred" : "unstarred"); }
      return true;
    case "/":
      state.searching = true; state.query = "";
      if (window.tui.compact) window.tui.prompt("search this folder", state.query, (v) => {
        state.searching = false;
        if (v !== null) { state.query = v; state.sel = 0; }
      });
      return true;
    case "g": {
      state.syncs++;
      state.lastSync = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const next = NEW_MAIL[state.syncs % NEW_MAIL.length];
      window.tui.toast("checking " + FOLDERS[state.folder].path + "…");
      setTimeout(() => {
        MSGS.unshift({ ...next, id: "m" + Math.floor(rand() * 1e6).toString(36), date: "now", unread: true });
        state.newCount++;
        window.tui.toast(`1 new message in ${FOLDERS[state.folder].name}`);
      }, 900);
      return true;
    }
    case "Tab": {
      const order = ["folders", "list", "reader"];
      state.focus = order[(order.indexOf(state.focus) + 1) % order.length];
      return true;
    }
    case "q":
      window.tui.quit({ command: "post", line: `${state.syncs} sync${state.syncs === 1 ? "" : "s"} · ${state.newCount} message${state.newCount === 1 ? "" : "s"} received · ${MSGS.filter((x) => x.starred).length} starred` });
      return true;
    default: return false;
  }
}

const KEYS = [
  { k: "j", l: "down" }, { k: "k", l: "up" }, { k: "Enter", l: "open" }, { k: "Esc", l: "back" }, "sep",
  { k: "r", l: "reply" }, { k: "y", l: "draft" }, { k: "d", l: "delete" }, { k: "u", l: "undo" }, "sep",
  { k: "*", l: "star" }, { k: "/", l: "search" }, { k: "g", l: "sync" }, { k: "Tab", l: "focus" }, { k: "q", l: "quit" },
];
const COMPOSE_KEYS = [
  { k: "Enter", l: "newline" }, { k: "Tab", l: "tab" }, { k: "C-x", l: "send" }, { k: "Esc", l: "discard" },
];

function startCompose(m, all) {
  state.composing = {
    // reply-all is not reply-to-the-sender: the list the message came from is copied in as well
    to: all ? [m?.addr ?? "someone@example.dev", m?.folder?.startsWith("list") ? "dev@example.dev" : "list@example.dev"].join(", ")
      : m?.addr ?? "someone@example.dev",
    subject: m ? (m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject) : "(no subject)",
    lines: m ? ["", `On ${m.date}, ${m.from} wrote:`, ...m.body.split("\n").map((l) => "> " + l)] : [""],
  };
  window.tui.setKeys(COMPOSE_KEYS);
  // a phone's keymap has no letters in it, so the draft is written in a real field: the soft
  // keyboard only appears for an editable element, and the grid is not one
  if (window.tui.compact) {
    const c = state.composing;
    window.tui.prompt("reply to " + c.to, c.lines.join("\n"), (v) => {
      if (v !== null) c.lines = v.split("\n");
    }, { multiline: true, hint: "ok keeps the draft · C-x sends" });
  }
  return true;
}

function composeKey(k) {
  const c = state.composing;
  if (k === "Esc") { state.composing = null; window.tui.setKeys(KEYS); window.tui.toast("draft discarded"); return true; }
  if (k === "C-x" || k === "C-s") {
    MSGS.unshift(M("sent", "me", "dev@example.com", c.subject, "now", c.lines.join("\n"), { unread: false }));
    state.composing = null; state.sentCount++; window.tui.setKeys(KEYS);
    window.tui.toast(`sent “${c.subject.slice(0, 30)}”`);
    return true;
  }
  if (k === "Enter") { c.lines.push(""); return true; }
  if (k === "Backspace") {
    const last = c.lines.length - 1;
    if (c.lines[last].length) c.lines[last] = c.lines[last].slice(0, -1);
    else if (c.lines.length > 1) c.lines.pop();
    return true;
  }
  if (k === "Tab") { c.lines[c.lines.length - 1] += "    "; return true; }
  if (k.length === 1) { c.lines[c.lines.length - 1] += k; return true; }
  return true;
}

function onTap(x, y, tui) {
  if (tui.cols >= 96) {
    // tapping a column header area moves the focus there
    if (y === 0) return false;
  }
  return false;   // folders, rows and the reader own their hit regions
}

createTUI({
  name: "post",
  sub: "— mail reader · 6 folders",
  font: '"IBM Plex Mono", ui-monospace, "DejaVu Sans Mono", monospace',
  size: 13.5, lh: 1.3, fps: 9, minCols: 34, compactAt: 96,
  palette: PAL,
  isTyping,
  keys: KEYS,
  help: [
    ["j / k, ↑ ↓", "walk the message list (tap a row on a phone)"],
    ["J / K", "next / previous folder"],
    ["Enter or o", "open the selected message; tap the reader to page it"],
    ["Esc", "back to the list, or clear the search"],
    ["r / R", "reply to the sender / reply to all — it types for real, ^X sends"],
    ["y", "save a reply draft to Drafts"],
    ["d / u", "move to Trash / undo the move"],
    ["* or !", "star the message"],
    ["/", "filter this folder by subject, sender or body"],
    ["g", "sync: a new message arrives"],
    ["Tab", "move the focus between folders, list and reader"],
    ["n, g, G", "next unread, top, bottom"],
    ["q", "quit to the exit panel"],
  ],
  draw, onKey, onTap,
  pills: () => ({
    a: `${unreadCount("inbox")} unread`,
    b: state.composing ? "composing" : state.searching ? "search" : null,
  }),
  state: () => ({
    folder: FOLDERS[state.folder].name, focus: state.focus,
    shown: visible().length, total: inFolder().length,
    sel: state.sel, open: state.open, unreadInbox: unreadCount("inbox"),
    unreadTotal: MSGS.filter((m) => m.unread).length,
    starred: MSGS.filter((m) => m.starred).length,
    query: state.query, composing: !!state.composing, sent: state.sentCount,
    deleted: state.deleted?.id ?? null, syncs: state.syncs, total_mail: MSGS.length,
    readerTop: state.readerTop,
  }),
  api: {
    openFolder: (i) => { state.folder = clamp(+i, 0, FOLDERS.length - 1); state.sel = 0; state.open = null; return FOLDERS[state.folder].name; },
    select: (i) => { state.sel = clamp(+i, 0, visible().length - 1); },
    open: () => onKey("Enter"),
    reply: () => onKey("r"),
    type: (s) => { if (state.composing) for (const ch of String(s)) composeKey(ch); return state.composing?.lines.join("\n"); },
    send: () => { if (state.composing) composeKey("C-x"); return state.sentCount; },
    del: () => onKey("d"),
    undo: () => onKey("u"),
    search: (s) => { state.query = String(s ?? ""); state.sel = 0; return visible().length; },
    sync: () => { onKey("g"); return state.syncs + 1; },
    focus: (f) => { if (["folders", "list", "reader"].includes(f)) state.focus = f; return state.focus; },
    quit: () => onKey("q"),
    resume: () => window.tui.resume(),
  },
});
