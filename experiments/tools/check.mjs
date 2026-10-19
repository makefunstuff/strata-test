// Headless check for one experiment (the games harness pattern: RAM-capped software Chromium,
// one page, hard deadline, browser always closed).
//
//   node experiments/tools/check.mjs 1-water [--wait 5] [--shot-dir experiments/1-water/shots]
//        [--drag fx,fy:dx,dy:ms]... [--click fx,fy]... [--eval "js"]... [--label tag]
//
// Coordinates are canvas fractions. --eval runs in the page (window.experiment is the hook each
// experiment exposes) and its return value is recorded. Prints JSON, exit 1 on any console error,
// page error, failed request or missing window.experiment.
import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, dirname, basename } from "node:path";

const { chromium } = pw;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const all = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
const target = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
if (!target) { console.error("usage: node check.mjs <experiment-dir> [--drag fx,fy:dx,dy:ms] [--click fx,fy] [--eval js]"); process.exit(2); }

const waitS = +opt("wait", 5);
const root = resolve(dirname(target));
const outDir = opt("shot-dir", join(target, "shots"));
const label = opt("label", "check");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm" };

const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${basename(target)}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../../games/tools/chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
    "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
    "--js-flags=--max-old-space-size=256"],
});
const MAX_MS = +(process.env.CHECK_MAX_MS ?? 150000);
async function stop(code, why) {
  console.error(`check: ${why}`);
  await browser.close().catch(() => {});
  server.close();
  process.exit(code);
}
const deadline = setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(4, sig));

const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on("console", (m) => {
  if (/favicon\.ico$/.test(m.location().url)) return;
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
await page.addInitScript(() => {
  window.__frames = 0;
  const tick = () => { window.__frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

await page.goto(url, { waitUntil: "load", timeout: 40000 }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(waitS * 1000);

const box = await page.locator("canvas").first().boundingBox().catch(() => null);
const pt = (fx, fy) => ({ x: (box?.x ?? 0) + fx * (box?.width ?? 1000), y: (box?.y ?? 0) + fy * (box?.height ?? 600) });
async function fps(ms) {
  const a = await page.evaluate(() => window.__frames);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => window.__frames);
  return Math.round(((b - a) * 1000) / ms * 10) / 10;
}
const shots = [];
const state = async () => page.evaluate(() => {
  const e = window.experiment;
  if (!e?.state) return null;
  try { const s = e.state(); return JSON.parse(JSON.stringify(s)); } catch { return "unserializable"; }
}).catch(() => null);
const shot = async (tag) => {
  const p = join(outDir, `${label}-${tag}.jpg`);
  await page.screenshot({ path: p, type: "jpeg", quality: 72 });
  shots.push(p);
};

const fpsIdle = await fps(2500);
const s0 = await state();
await shot("start");

const log = [];
for (const spec of all("click")) {
  const [fx, fy] = spec.split(",").map(Number);
  const p = pt(fx, fy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  log.push(`click ${spec}`);
}
for (const spec of all("drag")) {
  const [a, b, ms] = spec.split(":");
  const [fx, fy] = a.split(",").map(Number);
  const [dx, dy] = b.split(",").map(Number);
  const from = pt(fx, fy), to = pt(fx + dx, fy + dy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * (i / 8), from.y + (to.y - from.y) * (i / 8));
    await page.waitForTimeout((+ms || 600) / 8);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  log.push(`drag ${spec}`);
}
for (const js of all("eval")) {
  const r = await page.evaluate(`(async () => { const f = eval(${JSON.stringify(js)}); return typeof f === "function" ? f() : f; })()`).catch((e) => `eval error: ${e.message}`);
  log.push(`eval ${js} -> ${JSON.stringify(r)}`);
}
await page.waitForTimeout(700);
const fpsPlay = await fps(2500);
const s1 = await state();
await shot("after");

const gl = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2");
  const ext = c?.getExtension("WEBGL_debug_renderer_info");
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c ? "webgl2" : "no webgl2";
}).catch(() => "?");

await mkdir(outDir, { recursive: true });
console.log(JSON.stringify({
  label, url, gl, fps_idle: fpsIdle, fps_play: fpsPlay, interaction: log,
  state_start: s0, state_after: s1, shots, errors,
}, null, 2));
clearTimeout(deadline);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
