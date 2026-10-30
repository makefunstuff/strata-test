// Headless check for the tui/ shelf — the same harness shape as the other shelves' checkers
// (RAM-capped Chromium on the software renderer, one browser, a hard deadline, always closed), plus
// the three things a character-grid app can get wrong that a canvas page cannot:
//
//   • a glyph the chosen font does not carry silently falls back to another face and breaks the grid
//     columns → every distinct glyph drawn is measured against the font's advance width
//   • a phone is a narrow terminal: the grid must reflow, and the document must not scroll sideways
//   • a keyboard app that does not answer the keyboard is a picture → keys are driven from the
//     harness and the page's own window.tui.state() must differ afterwards
//
//   node tui/tools/check.mjs 1-monitor [--key j] [--tap x,y] [--pose "js"] [--label tag]
//        [--view 1280x800] [--phone 390x844] [--wait 3] [--shot-dir tui/1-monitor/shots] [--out name]
//   node tui/tools/check.mjs --all                 # every page, its own scenario, the table in README.md
//
// Prints JSON per page. Exit 1 on any console/page/network error, a missing hook, a blank grid, a
// fallback glyph, sideways overflow, or keys that changed nothing.
import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, dirname } from "node:path";

const { chromium } = pw;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");   // the repo root, as Pages serves it
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};

export function serve(root = ROOT) {
  const server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      let file = join(root, p);
      if (!file.startsWith(root)) throw new Error("outside");
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

export async function launch() {
  // Chromium runs in a RAM-capped systemd scope (the model server holds the GPUs and most of the RAM)
  process.env.SMOKE_MEM_HIGH ??= "900M";
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../../games/tools/chromium-capped.sh", import.meta.url)),
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
      "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
      "--js-flags=--max-old-space-size=256"],
  });
}

/* ------------------------------------------------------------------ the six scenarios */

export const SCENARIOS = {
  "1-monitor": { keys: ["j", "j", "j", "s", "Enter", "K", "3", "t"], taps: ["40,20"], poses: ["window.tui.api.pause(true)"] },
  "2-mail": { keys: ["j", "j", "Enter", "r", "h", "e", "l", "l", "o", "Esc", "d"], taps: [], poses: ["window.tui.api.sync()"] },
  "3-files": { keys: ["j", "j", "l", "Space", "c", "f", "i", "x", ".", "m", "i", "t", "Enter"], taps: [], poses: ["window.tui.api.checkout('main')"] },
  "4-player": { keys: ["Space", "l", "l", "j", "Enter", "v", "s"], taps: [], poses: ["window.tui.api.select(3)", "window.tui.api.play(true)"] },
  "5-ops": { keys: ["j", "j", "Enter", "2", "A", "r", "/"], taps: [], poses: ["window.tui.api.search('timeout')", "window.tui.api.pause(true)"] },
  "6-editor": { keys: ["j", "j", "w", "i", "x", "Esc", "u", ":", "w", "Enter", "/"], taps: [], poses: ["window.tui.api.find('ring')", "window.tui.api.ex('e notes.md')"] },
};

const ALL = Object.keys(SCENARIOS);

/* ------------------------------------------------------------------ cli */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const all = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
  const target = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
  const norm = (d) => (/^tui(\/|$)/.test(d) ? d : `tui/${d.replace(/^\.?\/+/, "")}`);
  const pages = argv.includes("--all") ? ALL.map(norm) : target ? [norm(target)] : null;
  if (!pages) { console.error("usage: node tui/tools/check.mjs <page-dir> | --all [--key j] [--tap x,y] [--pose js] [--view WxH] [--phone WxH]"); process.exit(2); }

  const server = await serve();
  const port = server.address().port;
  const live = new Set();                       // every Chromium we have launched, so the watchdog can close them
  const launchOne = async () => { const b = await launch(); live.add(b); b.on("disconnected", () => live.delete(b)); return b; };
  const MAX_MS = +(process.env.CHECK_MAX_MS ?? 300000);
  const stop = async (code, why) => {
    if (why) console.error(`check: ${why}`);
    for (const b of live) await b.close().catch(() => {});
    server.close();
    process.exit(code);
  };
  const deadline = setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms`), MAX_MS);
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(4, sig));

  const results = [];
  for (const dir of pages) {
    const sc = SCENARIOS[dir.replace(/^tui\//, "")] ?? {};
    const keys = all("key").length ? all("key") : (sc.keys ?? []);
    const taps = all("tap").length ? all("tap") : (sc.taps ?? []);
    const poses = all("pose").length ? all("pose") : (sc.poses ?? []);
    const label = opt("label", dir.split("/").pop());
    const shotDir = opt("shot-dir", join(ROOT, norm(dir), "shots"));
    const base = { dir, wait: +opt("wait", 3), keys, taps, poses, label, out: opt("out", null), clip: opt("clip", null), shotDir: opt("no-shots", null) ? null : resolve(shotDir) };
    // one browser per pass: this Chromium runs --single-process, so closing a page can take the
    // browser with it — a fresh launch per pass costs a second and never dies mid-sweep
    const run = async (opts) => {
      const b = await launchOne();
      try { return await checkPage(b, port, { ...opts, close: true }); }
      catch (e) { return { page: opts.dir, view: opts.view, tag: opts.tag, errors: [`harness: ${e.message}`] }; }
      finally { await b.close().catch(() => {}); }
    };
    results.push(await run({ ...base, view: opt("view", "1280x800"), tag: "desktop" }));
    if (!argv.includes("--skip-phone")) {
      results.push(await run({ ...base, view: opt("phone", "390x844"), tag: "phone", out: opt("out", `${label}-phone.jpg`), keys: [], taps: [], poses: [] }));
    }
  }
  const failed = results.filter((r) => r.errors.length);
  console.log(JSON.stringify({ ok: !failed.length, results }, null, 2));
  clearTimeout(deadline);
  await stop(failed.length ? 1 : 0, failed.length ? `${failed.length} check(s) failed` : null);
}

async function checkPage(browser, port, { dir, close = false, ...rest }) {
  const [vw, vh] = (rest.view ?? "1280x800").split("x").map(Number);
  const p = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const errors = [];
  p.on("console", (m) => {
    if (/favicon\.ico$/.test(m.location().url)) return;
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message} @@ ${(e.stack || "").split("\n").slice(1, 4).join(" | ")}`));
  p.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  p.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

  const url = `http://127.0.0.1:${port}/${normalize(dir).replace(/^\.\/+/, "")}/index.html`;
  await p.goto(url, { waitUntil: "load", timeout: 40000 }).catch((e) => errors.push(`goto: ${e.message}`));
  await p.waitForTimeout((rest.wait ?? 3) * 1000);

  const read = () => p.evaluate(() => {
    const t = window.tui?.term;
    if (!t) return null;
    let ink = 0; const seen = new Set();
    for (let i = 0; i < t.ch.length; i++) if (t.ch[i] !== 32) { ink++; seen.add(t.ch[i]); }
    return { cols: t.cols, rows: t.rows, cells: t.ch.length, ink, glyphs: seen.size };
  });
  const hook = await p.evaluate(() => !!window.tui && typeof window.tui.state === "function");
  if (!hook) errors.push("missing window.tui hook (state)");
  const grid = await read();
  if (!grid) errors.push("no screen buffer to read");
  else {
    if (grid.ink < grid.cells * 0.06) errors.push(`blank grid: ${grid.ink}/${grid.cells} cells drawn`);
    if (grid.glyphs < 18) errors.push(`only ${grid.glyphs} distinct glyphs on screen`);
  }
  const glyphs = await p.evaluate(() => window.tui?.auditGlyphs?.() ?? []).catch(() => [{ ch: "?", w: 0, cellW: 0 }]);
  if (glyphs.length) errors.push(`font fallback breaks the grid: ${glyphs.map((g) => `${JSON.stringify(g.ch)}=${g.w}px vs ${g.cellW}px`).join(", ")}`);

  const s0 = await p.evaluate(() => window.tui?.state?.() ?? null).catch(() => null);
  for (const k of rest.keys ?? []) {
    if (k.startsWith("C-")) await p.keyboard.press("Control+" + k.slice(2));
    else if (k === "Space") await p.keyboard.press("Space");
    else if (k === "Esc") await p.keyboard.press("Escape");
    else if (/^[A-Z]$/.test(k)) { await p.keyboard.down("Shift"); await p.keyboard.press(k); await p.keyboard.up("Shift"); }
    else await p.keyboard.press(k);
    await p.waitForTimeout(110);
  }
  for (const spec of rest.taps ?? []) {
    const [gx, gy] = spec.split(",").map(Number);
    const box = await p.locator("pre.screen").boundingBox().catch(() => null);
    if (!box) { errors.push("no <pre.screen> to tap"); break; }
    const cw = await p.evaluate(() => window.tui.cellW());
    const chh = await p.evaluate(() => window.tui.cellH());
    await p.mouse.click(box.x + (gx + 0.5) * cw, box.y + (gy + 0.5) * chh);
    await p.waitForTimeout(160);
  }
  const poseLog = [];
  for (const js of rest.poses ?? []) {
    const r = await p.evaluate(`(async () => { const f = eval(${JSON.stringify(js)}); return typeof f === "function" ? f() : f; })()`)
      .catch((e) => `pose error: ${e.message}`);
    poseLog.push(`${js} -> ${JSON.stringify(r)}`);
  }
  await p.waitForTimeout(500);
  const s1 = await p.evaluate(() => window.tui?.state?.() ?? null).catch(() => null);

  const overflow = await p.evaluate(() => {
    const k = document.querySelector(".keybar");
    const pre = document.querySelector("pre.screen");
    return {
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      keybar: k ? { scrollW: k.scrollWidth, clientW: k.clientWidth, scrollable: k.scrollWidth > k.clientWidth } : null,
      gridRight: pre ? Math.round(pre.getBoundingClientRect().right) : null,
      gridBottom: pre ? Math.round(pre.getBoundingClientRect().bottom) : null,
      innerH: window.innerHeight,
    };
  });
  if (overflow.scrollW > overflow.clientW + 1) errors.push(`sideways overflow: document ${overflow.scrollW}px wide in a ${overflow.clientW}px viewport`);
  if (overflow.gridBottom != null && overflow.gridBottom > overflow.innerH + 2) errors.push(`grid taller than the viewport: bottom ${overflow.gridBottom} > ${overflow.innerH}`);

  const shots = [];
  if (rest.shotDir) {
    await mkdir(rest.shotDir, { recursive: true });
    const file = join(rest.shotDir, rest.out ?? `${rest.label}-${rest.tag}.jpg`);
    const c = rest.clip ? rest.clip.split(",").map(Number) : null;
    const opts = { path: file, type: "jpeg", quality: 82 };
    if (c) opts.clip = { x: c[0], y: c[1], width: c[2], height: c[3] };
    await p.screenshot(opts);
    shots.push(file);
  }
  const drove = (rest.keys ?? []).length + (rest.taps ?? []).length + (rest.poses ?? []).length;
  const changed = JSON.stringify(s0) !== JSON.stringify(s1);
  if (drove && !changed) errors.push(`driving ${drove} input(s) changed nothing in state()`);

  // a --single-process Chromium dies when its last page closes, so pages are left open and the
  // caller shuts the browser down at the end
  if (close) await p.close();
  return {
    page: dir, view: rest.view, tag: rest.tag, hook, grid, glyphs_bad: glyphs,
    keys: rest.keys ?? [], taps: rest.taps ?? [], pose: poseLog,
    state_start: s0, state_after: s1, changed, overflow, shots, errors,
  };
}
