// Smoke-test a static game page in headless Chromium.
//   node smoke.ts <game-dir|url> [--out shot-prefix (default: $TMPDIR/smoke)] [--wait 4] [--keys "ArrowLeft:800,Space:100"] [--click x,y]
// Serves <game-dir> over a throwaway local HTTP server (or loads <url> as is), then:
//   1. waits --wait seconds, screenshots <prefix>-start.png, reads the page text;
//   2. plays the input (key:holdMs pairs, optional click at canvas-relative fractions), screenshots <prefix>-play.png
//      (also written as <prefix>-input.png, the name the older checks use);
//   3. with --overjs "<js>" (run through window.arcade) and --overwait s, screenshots <prefix>-over.png;
//   4. prints console errors, page errors, failed requests, frame rate and the page text before/after input.
// Exit code 1 when there were errors. --phone runs a 390x844 touch context (mobile metrics, DPR 1) so the
// games' touch controls come up; PHONE_MODE=landscape runs it sideways at 844x390, PHONE_DPR=2 is a
// GPU-box option. Chromium: CHROMIUM_PATH (default: tools/chromium-capped.sh, a RAM-capped
// /usr/bin/chromium); SMOKE_GPU=1 renders on the GPU at 1280x720 without the cap.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { copyFile, readFile, stat } from "node:fs/promises";
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
const overjs = opt("overjs", "");
const overWaitS = Number(opt("overwait", "1.6"));
// --eval "<js>": run an expression against the page and print its JSON result next to the
// measurements. It is how "is that white the skydome or the clear colour?" gets answered with a
// number instead of a guess. --evalshot additionally screenshots the frame after it, so a live
// uniform toggle can be shot without editing the game (the post-chain bisection the CRT bug of
// 2026-10-19 needed, made a flag).
const evalJs = opt("eval", "");
const evalShot = args.includes("--evalshot");
const phone = args.includes("--phone");   // a flag: no value (an option that swallows the next argument is how --phone silently became "--tap")
const shotType = args.includes("--jpeg") ? "jpeg" : "png";
const shotExt = shotType === "jpeg" ? "jpg" : "png";   // a 3D frame at quality 82 is ~1/8 the bytes of a PNG

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
// Watchdog: the RAM-capped single-process Chromium can stall on a loaded machine, and a hung
// browser is a stuck review and stolen RAM at the same time. Never outlive your own deadline,
// and never leave the browser open when the board kills this process.
const MAX_MS = +(process.env.SMOKE_MAX_MS ?? 180000);
async function stop(code: number, why: string): Promise<never> {
  console.error(`smoke: ${why}`);
  await browser.close().catch(() => {});
  server?.close();
  process.exit(code);
}
const deadline = setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms (SMOKE_MAX_MS)`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void stop(4, `caught ${sig}`));
// The --phone viewport: a Pixel-sized portrait by default, sideways with PHONE_MODE=landscape
// (844x390) — a real way to hold a phone, and the layout the landscape rules in touch.css have to
// survive. An environment variable, not an option value: an option that swallows the next argument
// is how "--phone landscape" ate the game name.
const view = phone
  ? process.env.PHONE_MODE === "landscape"
    ? { width: 844, height: 390 }
    : { width: 390, height: 844 }
  : gpu
  ? { width: 1280, height: 720 }
  : { width: 960, height: 540 };
// --phone: a Pixel-sized portrait viewport with touch, which is what turns the games' touch
// controls and phone layout on. The touch flags have to be set on the browser context (newPage's
// own options do not reach them in this Chromium build), and the context must be created before
// the page. deviceScaleFactor is 1 by default: at 2 the software rasteriser plus the RAM cap
// kills the browser, so PHONE_DPR=2 is a GPU-box option, not a sweep option.
const ctx = await browser.newContext({
  viewport: view,
  ...(phone
    ? { deviceScaleFactor: Number(process.env.PHONE_DPR ?? 1), isMobile: true, hasTouch: true }
    : {}),
});
const page = await ctx.newPage();
const taps = (opt("tap", "") as string).split(";").filter(Boolean).map((c) => c.split(",").map(Number));
// Touch in this Chromium (software, --single-process) does not come from Playwright's hasTouch,
// so the CDP Emulation domain turns it on and taps are dispatched as real touch events.
let cdp: any = null;
if (phone) {
  cdp = await ctx.newCDPSession(page).catch((e) => { console.error("cdp session: " + String(e).slice(0, 140)); return null; });
  if (cdp) await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }).catch(() => {});
}
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
const shot = (path: string) => page.screenshot(
  shotType === "jpeg" ? { path, type: "jpeg", quality: 82 } : { path });
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
await shot(`${out}-start.${shotExt}`);

const box = await page.locator("canvas").first().boundingBox().catch(() => null);
for (const [fx, fy] of taps) {
  const b = box ?? { x: 0, y: 0, ...view };
  const x = Math.round(b.x + fx * b.width), y = Math.round(b.y + fy * b.height);
  const tap = cdp
    ? cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
        .then(() => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }))
    : page.touchscreen.tap(x, y);
  await tap.catch((e: any) => errors.push(`tap: ${String(e.message ?? e).slice(0, 120)}`));
  await page.waitForTimeout(320);
}
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
let evalResult: unknown = null;
if (evalJs) {
  evalResult = await page.evaluate(evalJs).catch((e) => ({ error: e.message }));
  if (evalShot) await shot(`${out}-eval.${shotExt}`);
}
const playShot = `${out}-play.${shotExt}`;
await shot(playShot);
await copyFile(playShot, `${out}-input.${shotExt}`).catch(() => {});

// the end screen: drive the game's own end verb through window.arcade, then shoot what the player sees
let overText = "";
let fpsOver = 0;
const overShots = [];
if (overjs) {
  const shotOver = `${out}-over.${shotExt}`;
  overShots.push(shotOver);
  await page.evaluate(overjs).catch((e) => errors.push(`overjs: ${e.message}`));
  await page.waitForTimeout(overWaitS * 1000);
  overText = await text();
  fpsOver = await fps(1500);
  await shot(shotOver);
}

console.log(JSON.stringify({
  url, gpu, gl, canvases,
  eval: evalResult,
  fps_idle: Math.round(fpsIdle * 10) / 10,
  fps_play: Math.round(fpsPlay * 10) / 10,
  fps_over: Math.round(fpsOver * 10) / 10,
  text_before: before, text_after: after, text_over: overText,
  errors, warnings: warnings.slice(0, 10),
  screenshots: [`${out}-start.${shotExt}`, playShot, ...overShots],
}, null, 2));
clearTimeout(deadline);
await browser.close();
server?.close();
process.exit(errors.length ? 1 : 0);
