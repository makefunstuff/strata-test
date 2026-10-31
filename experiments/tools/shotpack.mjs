#!/usr/bin/env node
/*
 * shotpack.mjs — one page load, many frames: the visual-review loop for a big scene.
 *
 *   node experiments/tools/shotpack.mjs experiments/7-tallinn-diorama --spec experiments/tools/frames-tallinn.json [--out dir] [--width 1000] [--height 600]
 *
 * The experiment directory is spelled from the repo root, as with check.mjs: the folder *above* it is
 * what gets served, so a bare `7-tallinn-diorama` asks for /7-tallinn-diorama/ and gets a 404.
 *
 * --spec is a JSON file holding an array of frames:
 *   { "name": "hero", "wait": 2500, "eval": "async () => { ... window.experiment ... }",
 *     "width": 390, "height": 780 }
 * Each frame runs its eval in the page (window.experiment is the page's hook), waits, then writes
 * <out>/<name>.jpg. Screenshots are the evidence, so the file also prints the page's state() after
 * every frame and any console error, and exits non-zero on an error — a pack of pretty pictures from
 * a broken page is worse than no pictures.
 */
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, resolve, dirname, basename } from "node:path";
import pw from "playwright-core";

const { chromium } = pw;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const target = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
if (!target) { console.error("usage: node shotpack.mjs <experiment-dir> --spec frames.json [--out dir] [--width px] [--height px] [--quality 72]"); process.exit(2); }
const specFile = resolve(opt("spec", "frames.json"));
const outDir = resolve(opt("out", join(target, "shots")));
const W0 = +opt("width", 1000), H0 = +opt("height", 600);
const quality = +opt("quality", 78);
const frames = JSON.parse(await readFile(specFile, "utf8"));

const root = resolve(dirname(target));
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try {
    let p = join(root, normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)));
    if (!p.startsWith(root)) throw new Error("outside");
    if ((await stat(p)).isDirectory()) p = join(p, "index.html");
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
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
const MAX_MS = +(process.env.CHECK_MAX_MS ?? 420000);
async function stop(code, why) {
  console.error(`shotpack: ${why}`);
  await browser.close().catch(() => {});
  server.close();
  process.exit(code);
}
const deadline = setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(4, sig));

const page = await browser.newPage({ viewport: { width: W0, height: H0 } });
const errors = [];
page.on("console", (m) => { if (!/favicon\.ico$/.test(m.location().url) && m.type() === "error") errors.push(`console.error: ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

await page.goto(url, { waitUntil: "load", timeout: 60000 }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(+(opt("boot", 9)) * 1000);
await mkdir(outDir, { recursive: true });

const report = [];
for (const f of frames) {
  if (f.width || f.height) await page.setViewportSize({ width: f.width ?? W0, height: f.height ?? H0 });
  let result = null;
  if (f.eval) {
    result = await page.evaluate(`(async () => { const f = eval(${JSON.stringify(f.eval)}); return typeof f === "function" ? await f() : f; })()`)
      .catch((e) => `eval error: ${e.message}`);
  }
  await page.waitForTimeout(f.wait ?? 2200);
  const state = await page.evaluate(() => {
    const e = window.experiment;
    try { return e?.state ? JSON.parse(JSON.stringify(e.state())) : null; } catch { return "unserializable"; }
  }).catch(() => null);
  const p = join(outDir, `${f.name}.jpg`);
  const buf = await page.screenshot({ path: p, type: "jpeg", quality });
  const mean = await page.evaluate(async (b64) => {
    // a frame that is one flat colour is a bug, not a look: report the spread of the picture.
    // readback of a live WebGL canvas is black, so the saved JPEG is decoded instead
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/jpeg;base64,${b64}`; });
    const cv = document.createElement("canvas");
    cv.width = 80; cv.height = 48;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0, 80, 48);
    const d = g.getImageData(0, 0, 80, 48).data;
    let sum = 0, sum2 = 0, n = 0, bright = 0;
    const hist = new Array(8).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += l; sum2 += l * l; n++;
      if (l > 245) bright++;
      hist[Math.min(7, (l / 32) | 0)]++;
    }
    const mean = sum / n;
    return { mean: +mean.toFixed(1), sd: +Math.sqrt(sum2 / n - mean * mean).toFixed(1), blown: +(bright / n).toFixed(3), hist: hist.map((v) => +(v / n).toFixed(2)) };
  }, buf.toString("base64")).catch(() => null);
  report.push({ frame: f.name, file: p, exposure: mean, state, evalResult: typeof result === "string" && result.length > 4000 ? result.slice(0, 4000) + "…" : result });
  console.log(`shot ${f.name} → ${p} ${mean ? `mean ${mean.mean} sd ${mean.sd} blown ${mean.blown}` : ""}`);
}
// the evidence sidecar goes to the temp dir, not next to the shots: the shots folder is committed
await writeFile(join(tmpdir(), `${basename(outDir)}-pack.json`), JSON.stringify({ url, frames: report, errors }, null, 2));
console.log(JSON.stringify({ frames: report.map((r) => ({ f: r.frame, ...r.exposure })), errors }, null, 2));
clearTimeout(deadline);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
