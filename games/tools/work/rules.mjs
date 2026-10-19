// Rule proofs for the games, driven through the verbs each one exposes on window.arcade.
// The smoke test can only see what the keyboard happens to reach; these call the game's own
// verbs (place a tower, warp the marble, put a gate in front of the plane) and read the HUD
// back, so the rules are checked, not assumed. One line per check.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, normalize } from "node:path";
import { chromium } from "playwright-core";

const gamesDir = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");   // .../games
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    const f = join(gamesDir, p);
    if (!f.startsWith(gamesDir)) throw 0;
    const data = await readFile(f);          // read first: writeHead-then-await-then-end double-sends
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end("no"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? resolve(gamesDir, "tools/chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});
const MAX = +(process.env.RULES_MAX_MS ?? 240000);
const timer = setTimeout(async () => {
  console.log("FAIL rules sweep timed out");
  await browser.close().catch(() => {});
  server.close();
  process.exit(1);
}, MAX);

// One page for the whole sweep: each Chromium start is ~300 MB in a scope capped at 220 MiB
// next to Strata, and on a tight machine the launches are what crash.
const results = [];
let page = null, errs = [];
async function open(game) {
  // One page for the whole sweep: in --single-process, closing the last page ends the browser,
  // and every fresh launch costs ~300 MB in a scope capped next to Strata. Navigate instead.
  if (!page) {
    page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on("pageerror", (e) => errs.push(String(e)));
  }
  errs = [];
  await page.goto(`${base}/${game}/index.html`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(4500);
  return errs;
}
async function check(game, label, fn, want, ms = 2200) {
  let errs = [];
  try {
    errs = await open(game);
    const got = await page.evaluate(fn);
    await page.waitForTimeout(ms);
    const hud = (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).slice(0, 120);
    const ok = want.test(hud) && !errs.length;
    results.push({ game, label, ok, got, hud });
    console.log(`${ok ? "ok  " : "FAIL"} ${game} ${label.padEnd(10)} ${JSON.stringify(got)} | ${hud}`);
  } catch (e) {
    results.push({ game, label, ok: false, got: String(e) });
    console.log(`FAIL ${game} ${label.padEnd(10)} ${String(e).slice(0, 90)}`);
    // a crashed page means the browser is gone; restart it once so the rest of the sweep runs
    if (/closed|crashed|timeout/i.test(String(e))) {
      await browser.close().catch(() => {});
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH ?? resolve(gamesDir, "tools/chromium-capped.sh"),
        headless: true,
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
               "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
      });
      page = null;
    }
  }
}

// marble maze: warp onto the goal, and into a hole
await check("3-marble-maze", "goal", () => {
  const at = window.arcade.warp("G");
  return { at, state: document.querySelector('[data-k="state"]')?.textContent };
}, /CLEAR|COMPLETE/);
await check("3-marble-maze", "hole", () => ({ at: window.arcade.warp("H") }), /FALLS 1/);

// tower defense: three towers and a wave
await check("4-tower-defense", "wave", () => {
  const a = window.arcade;
  return { built: [a.place(4, 4), a.place(5, 7), a.place(8, 5)], before: a.stats() };
}, /TOWERS 3/, 9000);

// flight: a gate moved in front of the plane scores; the ground kills
await check("5-flight", "ring", () => {
  const a = window.arcade, g = a.gates.gates[0], p = a.fly.pos;
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
  g.group.position.set(p.x, p.y, p.z - 110);
  g.taken = false;
  return { at: [p.x, p.y, p.z] };
}, /RINGS [1-9]/, 4000);
await check("5-flight", "crash", () => {
  window.arcade.fly.pos.y = 0.2;
  return { y: 0.2 };
}, /STATE DOWN|CLIPPED/, 1600);

clearTimeout(timer);
if (page) await page.close().catch(() => {});
await browser.close().catch(() => {});
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} rule proofs passed`);
process.exit(failed ? 1 : 0);
