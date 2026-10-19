// Smoke-test a static game page in headless Chromium.
//   node smoke.ts <game-dir|url> [--out shot-prefix (default: $TMPDIR/smoke)] [--wait 4] [--keys "ArrowLeft:800,Space:100"] [--click x,y]
// Serves <game-dir> over a throwaway local HTTP server (or loads <url> as is), then:
//   1. waits --wait seconds, screenshots <prefix>-start.png, reads the page text;
//   2. plays the input (key:holdMs pairs, optional click at canvas-relative fractions), screenshots <prefix>-input.png;
//   3. prints console errors, page errors, failed requests, frame rate and the page text before/after input.
// Exit code 1 when there were errors. Chromium: CHROMIUM_PATH (default: tools/chromium-capped.sh, a RAM-capped
// /usr/bin/chromium); SMOKE_GPU=1 renders on the GPU at 1280x720 without the cap.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, basename, dirname } from "node:path";

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const target = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
if (!target) {
  console.error("usage: node smoke.ts <game-dir|url> [--out prefix] [--wait s] [--keys k:ms,...] [--click fx,fy]");
  process.exit(2);
}
const waitS = Number(opt("wait", "4"));
const out = opt("out", join(tmpdir(), "smoke"));
const keys = (opt("keys", "") as string).split(",").filter(Boolean).map((p) => {
  const [k, ms] = p.split(":");
  return { key: k, ms: Number(ms ?? 100) };
});
const clicks = (opt("click", "") as string).split(";").filter(Boolean).map((c) => c.split(",").map(Number));

const types: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".wasm": "application/wasm",
};

let url = target;
let server: ReturnType<typeof createServer> | undefined;
if (!/^https?:/.test(target)) {
  // Serve the game's parent folder: the games import shared modules with "../shared/…".
  const game = resolve(target);
  const root = resolve(dirname(game));
  server = createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      let file = join(root, p);
      if (!file.startsWith(root)) throw new Error("outside");
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  url = `http://127.0.0.1:${addr.port}/${basename(game)}/`;
}

const gpu = process.env.SMOKE_GPU === "1";
const browser = await chromium.launch({
  // Software mode runs beside Strata, so Chromium gets a RAM cap (chromium-capped.sh); GPU mode runs without it.
  executablePath: process.env.CHROMIUM_PATH ??
    (gpu ? "/usr/bin/chromium" : fileURLToPath(new URL("./chromium-capped.sh", import.meta.url))),
  headless: true,
  args: gpu
    ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"]
    // Lean software mode: it runs beside Strata, where RAM headroom is only ~1 GiB above the 8 GiB floor.
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
       "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
       "--disable-component-update", "--js-flags=--max-old-space-size=256"],
});
const view = gpu ? { width: 1280, height: 720 } : { width: 960, height: 540 };
const page = await browser.newPage({ viewport: view });
const errors: string[] = [];
const warnings: string[] = [];
page.on("console", (m) => {
  if (/favicon\.ico$/.test(m.location().url)) return;
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  else if (m.type() === "warning") warnings.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
await page.addInitScript(() => {
  const w = window as any;
  w.__frames = 0;
  const tick = () => { w.__frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

const text = () => page.evaluate(() => document.body?.innerText.replace(/\s+/g, " ").trim().slice(0, 400) ?? "");
const fps = async (ms: number) => {
  const a = await page.evaluate(() => (window as any).__frames);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => (window as any).__frames);
  return ((b - a) * 1000) / ms;
};

await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(waitS * 1000);
const canvases = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height}`));
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2");
  const ext = c?.getExtension("WEBGL_debug_renderer_info");
  return ext ? c!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c ? "webgl2 (renderer hidden)" : "no webgl2";
});
const fpsIdle = await fps(2000);
const before = await text();
await page.screenshot({ path: `${out}-start.png` });

const box = await page.locator("canvas").first().boundingBox().catch(() => null);
for (const [fx, fy] of clicks) {
  const b = box ?? { x: 0, y: 0, ...view };
  await page.mouse.click(b.x + fx * b.width, b.y + fy * b.height);
  await page.waitForTimeout(300);
}
for (const { key, ms } of keys) {
  if (key === "wait") { await page.waitForTimeout(ms); continue; }
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
const fpsPlay = await fps(2000);
const after = await text();
await page.screenshot({ path: `${out}-input.png` });

console.log(JSON.stringify({
  url, gpu, gl, canvases,
  fps_idle: Math.round(fpsIdle * 10) / 10,
  fps_play: Math.round(fpsPlay * 10) / 10,
  text_before: before, text_after: after,
  errors, warnings: warnings.slice(0, 10),
  screenshots: [`${out}-start.png`, `${out}-input.png`],
}, null, 2));
await browser.close();
server?.close();
process.exit(errors.length ? 1 : 0);
