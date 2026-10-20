#!/usr/bin/env node
/*
 * clothtest.mjs — the grab-and-pull regression test for experiment 3.
 *
 *   node experiments/tools/clothtest.mjs [--modes flag,curtain] [--keep-shots]
 *
 * The mechanic under test is the one the hint card advertises: "drag the cloth to grab and pull —
 * a hard pull rags it". So this drives **real mouse events** (mouse.move/down/stepped move/up),
 * not the page's own scripted API, grabs the middle of the sheet, yanks it a long way, holds the
 * pull, releases, and reads `torn`/`quads` back from `window.experiment.state()`.
 *
 * It also runs a control: no interaction at all, on the same settings, must NOT tear — wind alone
 * is not allowed to shred the sheet.
 *
 * One line per scenario, exit 1 if any yank failed to tear or the control tore on its own.
 */
import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, dirname, basename } from "node:path";

const { chromium } = pw;
const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "3-cloth-tearing");
const root = dirname(dir);
// the two setups the reviewer tested: the flag (pinned to a pole) and a curtain (pinned along a top rail)
const CASES = [
  { label: "flag", mode: "flag", fabric: "flag" },
  { label: "curtain", mode: "top", fabric: "plaid" },
];
const FOLDER = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? join(dir, "shots");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg" };

const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch {
    if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${basename(dir)}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../../games/tools/chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
    "--disable-dev-shm-usage", "--disable-extensions", "--js-flags=--max-old-space-size=256"],
});
const MAX_MS = +(process.env.CHECK_MAX_MS ?? 240000);
async function stop(code, why) { console.error(`clothtest: ${why}`); await browser.close().catch(() => {}); server.close(); process.exit(code); }
setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(4, sig));

const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on("console", (m) => { if (!/favicon\.ico$/.test(m.location().url) && m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
await page.goto(url, { waitUntil: "load", timeout: 40000 });
await page.waitForTimeout(6000);
await page.evaluate(() => window.experiment?.lab?.gui?.close?.());

const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.experiment.state())));
const box = await page.locator("canvas").first().boundingBox();

/** one real-mouse yank: find the sheet's middle, grab it, drag, hold, release */
async function yank(tag, dx, dy, holdMs = 1200, fresh) {
  if (fresh) {   // a clean sheet per scenario, so each number stands on its own
    await page.evaluate(`window.experiment.api.setMode(${JSON.stringify(fresh)}); window.experiment.lab.gui.close();`);
    await page.waitForTimeout(2500);
  }
  const mid = await page.evaluate(() => window.experiment.api.mid());
  const x0 = box.x + mid[0] * box.width, y0 = box.y + mid[1] * box.height;
  const before = await state();
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps, { steps: 2 });
    await page.waitForTimeout(26);
  }
  await page.waitForTimeout(holdMs);                 // hold the pull: the load has to be sustained
  const held = await state();
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const after = await state();
  await page.screenshot({ path: join(FOLDER, `grab-${tag}.jpg`), type: "jpeg", quality: 70 });
  return { tag, grabbed: held.grabbed, torn0: before.torn, tornHeld: held.torn, torn: after.torn,
    quads: after.quads, of: after.totalQuads, grabbedAfter: after.grabbed };
}

const rows = [];
const controls = [];
for (const { label, mode, fabric } of CASES) {
  await page.evaluate(`window.experiment.api.setFabric(${JSON.stringify(fabric)}); window.experiment.api.setMode(${JSON.stringify(mode)}); window.experiment.lab.gui.close();`);
  await page.waitForTimeout(3000);

  // control: leave it alone; the wind must not shred it
  const idle = await state();
  await page.waitForTimeout(4000);
  const idle2 = await state();
  controls.push({ mode: label, torn0: idle.torn, torn: idle2.torn, quads: idle2.quads });

  const far = Math.round(box.width * 0.42);
  rows.push(await yank(`${label}-right`, far, 0, 1200, mode));
  rows.push(await yank(`${label}-downleft`, -far, Math.round(box.height * 0.34), 1200, mode));
  rows.push(await yank(`${label}-up`, 0, -Math.round(box.height * 0.42), 1200, mode));
}

await browser.close();
server.close();

let fail = 0;
console.log("mode / yank            grabbed  torn before pull → held → after release   quads");
for (const r of rows) {
  const ok = r.torn > r.torn0;
  if (!ok) fail++;
  console.log(`${(r.tag + " " + r.tag).padEnd(22)} ${String(r.grabbed).padStart(4)}    ${String(r.torn0).padStart(4)} → ${String(r.tornHeld).padStart(4)} → ${String(r.torn).padStart(4)}  ${r.quads}/${r.of}  ${ok ? "TORN ✓" : "NO TEAR ✗"}`);
}
console.log("control (no interaction, must not tear):");
for (const c of controls) {
  const ok = c.torn === c.torn0;
  if (!ok) fail++;
  console.log(`  ${c.mode.padEnd(10)} torn ${c.torn0} → ${c.torn}  ${ok ? "stable ✓" : "SELF-TEARED ✗"}`);
}
if (errors.length) { fail++; console.log("console/page errors:", errors.slice(0, 4)); }
console.log(fail ? `FAIL ${fail}` : "PASS — every yank tore, the idle sheet did not");
process.exit(fail ? 1 : 0);
