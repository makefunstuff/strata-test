#!/usr/bin/env node
/* 04-tui/measure.mjs — the terminal's claims against the bytes it prints.

   The page shows captures that ARE the program's output (capture/*.ansi, written by
   tools/capture.sh). So the frames can be interrogated as data: the box rules' colour, the
   histogram's bucket count, the key table, the time labels. This instrument asks the bytes and the
   source, not the screenshot:

     1. the palette table in src/logtrail.ts, the mirror in index.html and the swatch strip in the
        rendered page are one table, key for key;
     2. every colour in that table does a job in the program (a violet and a panel fill did not);
     3. every printed contrast ratio is the true ratio, on the ground that palette sits on, and
        clears its bar — 4.5:1 for type, 3:1 for rules and bars (WCAG 1.4.11);
     4. in the captured bytes, the rule colour clears 3:1 on its theme's ground;
     5. the keys: what the app binds, what the overlay lists, what the overlay prints as a count,
        what the status bar repeats, and what the landing page's legend claims — one set;
     6. the histogram: 60 buckets, the printed bucket seconds equal to the captured window divided
        by 60, and the printed window equal to the tail's first and last row;
     7. the latency strip: its bar count, its printed count and its printed span agree;
     8. every captured row fits its declared width, and the page has no sideways scroll at 390 px.

   Run from the design folder:  node 04-tui/measure.mjs [--url <page>] [--out <file>]
*/
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, statSync } from "node:fs";

/* The first version imported `stat` from fs, which is the callback form: called with no callback it
   throws "The cb argument must be of type function", the handler caught it and answered 404 for
   every request — the instrument then reported the page as a 4-byte "nope" document with no
   scripts in it. A server that answers 404 for the page it is serving is not measuring the page. */
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(HERE, "..");
const { chromium } = createRequire(join(DESIGN, "tools", "noop.cjs"))("playwright-core");

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve(arg("--url", HERE));
const OUT = arg("--out", join(HERE, "measure.md"));

/* The frames are iframes over relative paths and the audit serves over HTTP, so this instrument
   does too: file:// and http:// disagree about what a stylesheet did. */
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".ansi": "text/plain", ".jpg": "image/jpeg" };
async function serve(root) {
  const srv = createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    const file = join(root, p === "/" ? "index.html" : p);
    try {
      if (!statSync(file).isFile()) throw 0;
      res.setHeader("content-type", TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
      res.end(readFileSync(file));
    } catch { res.statusCode = 404; res.end("nope"); }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { origin: "http://127.0.0.1:" + srv.address().port, close: () => srv.close() };
}
const SITE = await serve(ROOT);
const URL_PAGE = SITE.origin + "/index.html";

const src = readFileSync(join(HERE, "src/logtrail.ts"), "utf8");
const page = readFileSync(join(HERE, "index.html"), "utf8");

/* ── colour maths ───────────────────────────────────────────────────────── */
const hexToRgb = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16));
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgbStr = (s) => s.replace(/;+/g, ";").split(";").map(Number);
/* SGR colours and OSC sequences: the trace link is OSC 8, and stripping only colours leaves its
   33 control bytes standing in the text, which is how the frame read as 177 columns wide in a
   148-column terminal. The app's own vis() had the same hole and looped forever on it — the
   instrument inherits the lesson, not the bug. */
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const strip = (s) => s.replace(OSC_RE, "").replace(/\x1b\[[0-9;]*m/g, "");

/* ── 1. the palette tables ──────────────────────────────────────────────── */
const palFrom = (text, name) => {
  const m = text.match(new RegExp("const " + name + ": Pal = \\{([\\s\\S]*?)\\n\\};"));
  if (!m) throw new Error("no " + name + " palette in the source");
  const out = {};
  for (const kv of m[1].matchAll(/(\w+):\s*"([0-9a-fA-F]{6})"/g)) out[kv[1]] = kv[2].toLowerCase();
  return out;
};
const APP = { dark: palFrom(src, "DARK"), light: palFrom(src, "LIGHT") };
const mirror = page.match(/const PALETTES = \{([\s\S]*?)\n\};/);
const MIRROR = { dark: {}, light: {} };
if (mirror) {
  let theme = "dark";
  for (const line of mirror[1].split("\n")) {
    const t = line.match(/^\s*(dark|light):\s*\{/); if (t) theme = t[1];
    for (const kv of line.matchAll(/(\w+):\s*"([0-9a-fA-F]{6})"/g)) MIRROR[theme][kv[1]] = kv[2].toLowerCase();
  }
}

/* ── 2. the captures as data ────────────────────────────────────────────── */
// utf8, not latin1: the rules (│ ─ ┌) and the histogram bars (▁-█) are multibyte, and reading
// them as latin1 turns 60 bars into 180 bytes and hides every glyph from the patterns below
const ansi = (name) => strip(readFileSync(join(HERE, "capture", name + ".ansi"), "utf8"));
const fgCodes = (text) => [...text.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)].map((m) => [+m[1], +m[2], +m[3]]);
const streamRaw = readFileSync(join(HERE, "capture/stream.ansi"), "utf8");
const help = ansi("help");
const stream = ansi("stream");
const endpoints = ansi("endpoints");
const lightFrame = ansi("light");

const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass, detail });

/* 1. palette parity */
for (const theme of ["dark", "light"]) {
  const a = APP[theme], m = MIRROR[theme];
  const keys = new Set([...Object.keys(a), ...Object.keys(m)]);
  const bad = [...keys].filter((k) => a[k] !== m[k]);
  add(`palette mirror equals the source (${theme})`, bad.length === 0,
    `${Object.keys(a).length} colours in src/logtrail.ts, ${Object.keys(m).length} in the page` +
    (bad.length ? `; drift: ${bad.map((k) => `${k} ${a[k] || "—"} vs ${m[k] || "—"}`).join(", ")}` : "; drift: none"));
}

/* 2. every colour does a job */
const jobs = {};
for (const k of new Set([...Object.keys(APP.dark), ...Object.keys(APP.light)])) {
  const uses = (src.match(new RegExp("pal\\." + k + "\\b", "g")) || []).length;
  jobs[k] = uses;
}
const dead = Object.entries(jobs).filter(([, n]) => n === 0).map(([k]) => k);
add("every colour in the palette is used by the program", dead.length === 0,
  `${Object.keys(jobs).length} colours, uses: ` + Object.entries(jobs).map(([k, n]) => `${k} ${n}`).join(", ") +
  (dead.length ? `; DEAD: ${dead.join(", ")}` : "; dead: none (a violet and a panel fill were removed)"));

/* 3. the swatch strip's printed ratios, in the rendered page */
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? join(DESIGN, "tools", "chromium-capped.sh"),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
const errors = [];
pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
pg.on("pageerror", (e) => errors.push(String(e)));
await pg.goto(URL_PAGE, { waitUntil: "load" });
await pg.waitForTimeout(1200);

const swatches = await pg.evaluate(() => {
  const out = [];
  for (const panel of document.querySelectorAll(".pal")) {
    const ground = panel.dataset.ground, theme = panel.dataset.theme;
    for (const sw of panel.querySelectorAll(".sw")) {
      const meta = sw.querySelector(".meta")?.textContent || "";
      const job = sw.querySelector(".job")?.textContent || "";
      out.push({
        theme, ground,
        name: sw.querySelector(".nm")?.textContent.trim(),
        hex: (meta.match(/#[0-9a-f]{6}/) || [""])[0].toLowerCase(),
        on: (meta.match(/on (#[0-9a-f]{6})/i) || ["", ""])[1].toLowerCase(),
        printed: +(meta.match(/·\s*([0-9.]+):1/) || [0, 0])[1],
        need: +(meta.match(/\/\s*([0-9.]+)/) || [0, 0])[1],
        kind: job.split(" · ")[0],
        bar: getComputedStyle(sw.querySelector(".bar")).backgroundColor,
      });
    }
  }
  return out;
});

let ratioBad = 0, barBad = 0, swatchFail = [];
for (const s of swatches) {
  const truth = ratio(hexToRgb(s.hex), hexToRgb(s.on));
  if (Math.abs(truth - s.printed) > 0.06) { ratioBad++; swatchFail.push(`${s.theme}/${s.name} printed ${s.printed}, true ${truth.toFixed(2)}`); }
  if (truth < s.need - 1e-9) { barBad++; swatchFail.push(`${s.theme}/${s.name} ${truth.toFixed(2)} under ${s.need}`); }
  const painted = rgbStr(s.bar);
  if (Math.max(...painted.map((v, i) => Math.abs(v - hexToRgb(s.hex)[i]))) > 2) swatchFail.push(`${s.theme}/${s.name} swatch painted ${s.bar} not ${s.hex}`);
}
add("the strip prints the true ratio for every colour", ratioBad === 0,
  `${swatches.length} swatches (2 palettes), worst print error ${Math.max(0, ...swatches.map((s) => Math.abs(ratio(hexToRgb(s.hex), hexToRgb(s.on)) - s.printed))).toFixed(3)}; mismatches ${ratioBad}`);
add("every colour clears its own bar (4.5 type, 3.0 rules and bars)", barBad === 0,
  swatchFail.length ? swatchFail.join("; ") : `min text ratio ${Math.min(...swatches.filter((s) => s.kind === "text").map((s) => ratio(hexToRgb(s.hex), hexToRgb(s.on)))).toFixed(2)}:1, min graphic ${Math.min(...swatches.filter((s) => s.kind !== "text").map((s) => ratio(hexToRgb(s.hex), hexToRgb(s.on)))).toFixed(2)}:1`);

/* 4. the rule colour inside the captured bytes */
for (const [theme, ground, text] of [["dark", "#10161c", stream], ["light", "#ffffff", lightFrame], ["dark", "#10161c", help]]) {
  const want = hexToRgb(APP[theme].line);
  const raw = theme === "light" ? readFileSync(join(HERE, "capture/light.ansi"), "utf8") : (text === help ? readFileSync(join(HERE, "capture/help.ansi"), "utf8") : streamRaw);
  const codes = fgCodes(raw);
  const hits = codes.filter((c) => c.join() === want.join()).length;
  add(`the rule colour in the ${theme} captures clears 3:1`, ratio(want, hexToRgb(ground)) >= 3 && hits > 0,
    `${want.join(",")} on ${ground} = ${ratio(want, hexToRgb(ground)).toFixed(2)}:1, ${hits} rule glyphs in the bytes`);
}

/* 5. the keys, one set */
const keyTokens = (label) => label.split(/\s+/).filter(Boolean).flatMap((t) => (t === "/" ? ["/"] : t.split("/").filter(Boolean)));
const BIND = new Set((src.match(/k === "([^"]{1,4})"/g) || []).map((m) => m.match(/"([^"]+)"/)[1])
  .filter((k) => !["lvl", "svc", "ep", "code"].includes(k)));
const overlayRows = [...help.matchAll(/^\s{16,}│\s{1,3}(.{1,10}?)\s{2,}(\S.*?)\s*│\s*$/gm)]
  .map((m) => m[1].trim())
  .filter((k) => k && !/^[─┌┐└┘├┤│]+$/.test(k) && !/keys$/.test(k));
const overlayKeys = overlayRows.flatMap(keyTokens);
const header = (help.match(/(\d+) keys, no mouse — the bar repeats (\d+) of them/) || []).slice(1).map(Number);
const barLine = stream.trimEnd().split("\n").at(-1);
// only the BAR_KEYS literal, not the help table, which is the same shape of pair
const barBlock = src.slice(src.indexOf("const BAR_KEYS"), src.indexOf("const barKeyCount"));
const BAR_TABLE = [...barBlock.matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)];
const barKeys = BAR_TABLE.flatMap((m) => keyTokens(m[1]));
const barLabels = BAR_TABLE.map((m) => m[1]).filter((k) => barLine.includes(k));
const footerKeys = /\? toggles this panel/.test(help) ? ["?"] : [];
const legend = await pg.evaluate(() => [...document.querySelectorAll("#keys-panel .keys b")].map((b) => b.textContent.trim()));
const legendKeys = legend.flatMap(keyTokens);

add("the overlay's printed counts are its own counts",
  header[0] === overlayKeys.length && header[1] === barKeys.length,
  `printed "${header[0]} keys … repeats ${header[1]}"; table lists ${overlayKeys.length} (${overlayKeys.join(" ")}); bar lists ${barKeys.length}`);
add("the status bar repeats keys the overlay lists",
  barKeys.length > 0 && barLabels.length === BAR_TABLE.length &&
  barKeys.every((k) => overlayKeys.includes(k) || footerKeys.includes(k)),
  `BAR_KEYS table: ${BAR_TABLE.map((m) => m[1]).join(" ")}; every label appears in the drawn bar: ${barLabels.length}/${BAR_TABLE.length}; keys outside the overlay: ${barKeys.filter((k) => !overlayKeys.includes(k)).join(" ") || "none"}`);
add("the page's legend is the overlay's set plus the footer's",
  JSON.stringify([...new Set(legendKeys)].sort()) === JSON.stringify([...new Set([...overlayKeys, ...footerKeys])].sort()),
  `legend ${legendKeys.length}: ${legendKeys.join(" ")} | overlay+footer ${new Set([...overlayKeys, ...footerKeys]).size}: ${[...new Set([...overlayKeys, ...footerKeys])].join(" ")}`);
add("every key the page lists is bound in the program",
  legendKeys.every((k) => BIND.has(k) || { "↑": "\u001b[B", "↓": "\u001b[A", Esc: "\u001b", enter: "\r" }[k]),
  `bindings in source: ${[...BIND].join(" ")}; unbound in the legend: ${legendKeys.filter((k) => !BIND.has(k) && !["↑", "↓", "Esc", "enter"].includes(k)).join(" ") || "none"}`);
add("the page's caption states the same counts the program prints",
  new RegExp(`listing all ${overlayKeys.length} keys[\\s\\S]{0,80}repeats ${barKeys.length}`).test(page),
  `caption: ${(page.match(/the help overlay[^"]{0,160}/) || [""])[0]}`);

/* 6. the histogram: 60 buckets, and the printed seconds are the window's */
const glyph = (line) => (line.match(/[▁-█]/g) || []).length;
const volLine = stream.split("\n").find((l) => /volume/.test(l)) || "";
const sevLine = stream.split("\n").find((l) => /severity/.test(l)) || "";
/* The tail rows the frame draws are a window on the buffer, and their stamps are "HH:MM:SS"
   (the pane's time field carries milliseconds, the list does not). */
const stamp = (l) => (l.match(/(\d{2}:\d{2}:\d{2})\s/) || [0, ""])[1];
const rowLvl = (l) => (l.match(/\d{2}:\d{2}:\d{2}\s+(trace|debug|info|warn|error)\s/) || [0, ""])[1];
const tail = stream.split("\n").filter((l) => /│\s*\d{2}:\d{2}:\d{2}\s\S/.test(l));
const at = (hms) => Date.parse("2026-10-16T" + hms + "Z") / 1000;
const first = tail.map(stamp).filter(Boolean).at(0) || "";
const last = tail.map(stamp).filter(Boolean).at(-1) || "";
const printedSec = +(volLine.match(/lines per (\d+) s/) || [0, 0])[1];
const windowLabel = (volLine.match(/·\s*(\d{2}:\d{2}) → (\d{2}:\d{2})/) || []).slice(1);
// the label's window is the whole buffer at minute resolution; the drawn tail ends where the
// buffer ends, so the bucket width times 60 must land on the span the bytes show, to the minute
const bufSpan = at(last) - Date.parse("2026-10-16T" + (windowLabel[0] || "00:00") + ":00Z") / 1000;
add("the volume strip is 60 buckets, and severity the same",
  glyph(volLine) === 60 && glyph(sevLine) === 60,
  `${glyph(volLine)} volume glyphs, ${glyph(sevLine)} severity glyphs`);
add("the printed bucket seconds match the window the bytes show",
  printedSec > 0 && Math.abs(printedSec * 60 - bufSpan) <= 60,
  `printed "lines per ${printedSec} s" over 60 buckets = ${printedSec * 60} s; the label's window starts ${windowLabel[0]} and the buffer's last drawn row is ${last} = ${bufSpan.toFixed(0)} s. The label used to say 10 s, which is 600 s: six minutes beside a two-minute window`);
add("the drawn tail sits inside the printed window",
  first.slice(0, 5) >= windowLabel[0] && last.slice(0, 5) <= windowLabel[1],
  `${tail.length} tail rows drawn, ${first} → ${last}, inside the label's ${windowLabel.join(" → ")}`);
add("the severity line counts match the levels in the window",
  (() => {
    const m = sevLine.match(/(\d+) w (\d+) e/) || [0, -1, -1];
    const w = +m[1], e = +m[2];
    const wc = tail.filter((l) => rowLvl(l) === "warn").length, ec = tail.filter((l) => rowLvl(l) === "error").length;
    // the counters are the whole buffer; the frame draws a window, so the drawn counts must not
    // exceed them — equality would mean the window is the buffer, which it is not
    return w >= wc && e >= ec && wc + ec > 0;
  })(),
  (() => {
    const m = sevLine.match(/(\d+) w (\d+) e/) || [0, 0, 0];
    const wc = tail.filter((l) => rowLvl(l) === "warn").length, ec = tail.filter((l) => rowLvl(l) === "error").length;
    return `printed ${m[1]} w ${m[2]} e for the buffer; the ${tail.length} rows this frame draws hold ${wc} warn ${ec} error — the counters are buffer-wide by design, and the frame is a window on it`;
  })());

/* 7. the latency strip in the detail pane */
// the detail pane is the right-hand columns of the frame; its rules and borders stay in the slice,
// so find the strip by its glyph count rather than by an anchored pattern
const pane = stream.split("\n").map((l) => l.slice(104));
const iLat = pane.findIndex((l) => /latency, last/.test(l));
const paneWin = pane.slice(Math.max(0, iLat), iLat + 5);
const lastN = +(((paneWin.find((l) => /latency, last/.test(l)) || "").match(/last (\d+)/) || [0, 0])[1]);
const reqLine = paneWin.find((l) => /· \d+ req/.test(l)) || "";
const reqN = +((reqLine.match(/· (\d+) req/) || [0, 0])[1]);
const spanLabel = reqLine.match(/(\d{2}:\d{2}:\d{2}) → (\d{2}:\d{2}:\d{2})/) || [];
const stripBars = (((paneWin.find((l) => (l.match(/[▁-█]/g) || []).length >= 8) || "").match(/[▁-█]/g)) || []).length;
// in the endpoint table a row carries two strips: the share bar (all █) and the latency strip
// (varied heights). A run with more than one glyph in it is the latency strip.
const latRun = (l) => (l.match(/[▁-█]{8,}/g) || []).filter((r) => new Set(r).size > 1).map((r) => r.length);
add("the latency strip: bars, printed count and printed span agree",
  stripBars === lastN && reqN === lastN && spanLabel.length === 3,
  `${stripBars} bars, "latency, last ${lastN}", "${reqN} req", span ${spanLabel[1]} → ${spanLabel[2]} (the label used to be the typed "06:11:58 → 06:12:44" for every selection)`);
const latRows = endpoints.split("\n").filter((l) => /(GET|POST|PUT|DELETE) \//.test(l) && /[▁-█]{8,}/.test(l));
const latLens = latRows.flatMap(latRun);
const hdrN = +((endpoints.split("\n").find((l) => /the last (\d+) requests/.test(l)) || "").match(/the last (\d+) requests/) || [0, 0])[1];
add("the endpoint table's strip is the last 20 requests its header names",
  hdrN === 20 && latLens.length > 0 && latLens.every((n) => n === 20),
  `header names ${hdrN}, the slice is -20; ${latRows.length} rows draw a varied strip of ${[...new Set(latLens)].join("/")} bars (the share bar, all one glyph, is not counted)`);

/* 8. the grid, and the phone */
const grid = (text, cols) => Math.max(...text.split("\n").map((l) => l.length));
const terms = [...src.matchAll(/const FILTER_TERMS = \[([^\]]+)\]/g)].map((m) => m[1].match(/"([^"]+)"/g).map((x) => x.replace(/"/g, "")));
const parserTerms = [...src.matchAll(/k === "(lvl|svc|ep|code)"/g)].map((m) => m[1]);
add("the filter's terms are one list: parser, key, help text",
  terms.length === 1 && terms[0].every((t) => parserTerms.includes(t.slice(0, -1))) &&
  terms[0].every((t) => help.includes(t)) && /insert the next filter term/.test(help),
  `FILTER_TERMS ${terms[0] ? terms[0].join(" ") : "—"}; the parser reads ${parserTerms.join(" ")}; the overlay names ${terms[0] && terms[0].every((t) => help.includes(t)) ? "all of them" : "not all"}`);
const frames = Object.fromEntries([...src.matchAll(/^  (\w+): \{ state:[^}]*\}, cols: (\d+), rows: (\d+) \}/gm)].map((m) => [m[1], [+m[2], +m[3]]]));
const content = (name) => { const l = ansi(name).split("\n"); if (l.at(-1) === "") l.pop(); return l; };
const rowCounts = Object.entries(frames).map(([name, [c, r]]) =>
  `${name} ${content(name).length}/${r - 1} rows ${Math.max(...content(name).map((l) => l.length))}/${c} cols`);
// rows - 1, not rows: the last line of a terminal belongs to the cursor
add("every capture fills rows - 1 and fits the declared width",
  Object.entries(frames).every(([name, [c, r]]) =>
    content(name).length === r - 1 && content(name).every((l) => l.length <= c)),
  rowCounts.join(" · "));

add("no captured row exceeds its declared width",
  grid(stream, 148) <= 148 && grid(endpoints, 148) <= 148 && grid(help, 148) <= 148 && grid(ansi("narrow"), 80) <= 80,
  `stream ${grid(stream)} cols, endpoints ${grid(endpoints)}, help ${grid(help)}, narrow ${grid(ansi("narrow"))} (declared 148/148/148/80)`);
add("the footer's line count is the buffer's",
  (page.match(/(\d+) lines of a fictional gateway fleet/) || [0, 0])[1] === (stream.match(/(\d+) of (\d+) lines/) || [0, 0])[1],
  `footer ${(page.match(/(\d+) lines of a fictional/) || [0, 0])[1]}, filter line ${(stream.match(/(\d+) of \d+ lines/) || [0, 0])[1]}, source ${(src.match(/for \(let i = 0; i < (\d+); i\+\+\)/) || [0, 0])[1]}`);

const phone = await ctx.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(URL_PAGE, { waitUntil: "load" });
await phone.waitForTimeout(900);
const over = await phone.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
add("the page does not scroll sideways at 390 px", over === 0, `sideways overflow ${over} px`);
add("no console errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean");

await browser.close();
SITE.close();

/* ── report ─────────────────────────────────────────────────────────────── */
const fails = checks.filter((c) => !c.pass);
const md = ["# 04-tui — the terminal's claims against its own bytes", "",
  `Page: \`${URL_PAGE}\` · ${checks.length} checks · **${fails.length} failing**`, "",
  "| check | |", "| --- | --- |"];
for (const c of checks) md.push(`| ${c.name} | ${c.pass ? "ok" : "**FAIL**"} — ${c.detail} |`);
md.push("", "_Bucket seconds, the key counts, the rule contrast and the grid widths are all read from `capture/*.ansi`, the program's own output. A label that disagrees with the bytes it sits next to fails here._", "");
writeFileSync(OUT, md.join("\n"));
console.log(md.slice(0, 4 + checks.length + 2).join("\n"));
process.exit(fails.length ? 1 : 0);
