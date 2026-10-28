// Hero shots for the eye-candy shelf: serve the shelf, open one page, wait for the scene to settle,
// run an optional pose (JS evaluated in the page, against window.experiment.api), screenshot, repeat
// for a second and third pose. Writes <piece>/shots/hero.jpg, alt1.jpg, alt2.jpg — the three the
// gallery card shows.
//
//   node eyecandy/tools/hero.mjs 1-aurora [--view 1600x900] [--wait 9] [--quality 82]
//        [--pose "api.flare()"] [--pose2 "..."] [--pose3 "..."] [--settle 2.5]
import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, dirname, basename } from "node:path";

const { chromium } = pw;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const target = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
if (!target) { console.error('usage: node hero.mjs <piece-dir> [--view 1600x900] [--pose "js"]...'); process.exit(2); }

const [vw, vh] = (opt("view", "1600x900")).split("x").map(Number);
const waitS = +opt("wait", 9);
const settle = +opt("settle", 2.5);
const quality = +opt("quality", 84);
// serve from the repo root, the way GitHub Pages does: a piece at eyecandy/<n>/ can
// reach ../shared/ and ../../experiments/shared/ with the same relative paths it has in git
const root = resolve(dirname(target), "..");
const outDir = opt("shot-dir", join(target, "shots"));
const poses = ["pose", "pose2", "pose3"].map((p) => opt(p, null)).filter(Boolean);
const names = ["hero", "alt1", "alt2"];

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${normalize(target).replace(/^\.\/+/, "")}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../../games/tools/chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
    "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
    "--js-flags=--max-old-space-size=512"],
});
const MAX_MS = +(process.env.HERO_MAX_MS ?? 240000);
async function stop(code, why) {
  console.error(`hero: ${why}`);
  await browser.close().catch(() => {});
  server.close();
  process.exit(code);
}
const deadline = setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(4, sig));

const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.location?.url ?? "")) errors.push(`console.error: ${m.text()}`); });
page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errors.push(`requestfailed: ${r.url()}`); });

await page.goto(url, { waitUntil: "load", timeout: 60000 }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(waitS * 1000);
await mkdir(outDir, { recursive: true });

const shots = [];
for (let i = 0; i < 3; i++) {
  const pose = poses[i];
  if (pose) {
    const r = await page.evaluate(`(async () => { const e = window.experiment; const f = eval(${JSON.stringify(pose)}); return typeof f === "function" ? await f() : f; })()`)
      .catch((e) => `pose error: ${e.message}`);
    if (String(r).startsWith("pose error")) errors.push(String(r) + " for " + pose);
    await page.waitForTimeout(settle * 1000);
  }
  const p = join(outDir, `${names[i]}.jpg`);
  await page.screenshot({ path: p, type: "jpeg", quality });
  shots.push(p);
}
const state = await page.evaluate(() => { try { return window.experiment?.state?.() ?? null; } catch { return null; } }).catch(() => null);
console.log(JSON.stringify({ piece: target, url, view: [vw, vh], shots, state, errors }, null, 2));
clearTimeout(deadline);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
