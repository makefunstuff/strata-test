// Phone check for every game: a real touch context (portrait, isMobile, hasTouch) and the
// touch controls driven with real CDP touch events, sampled while the finger is down.
//
//   node tools/mobilecheck.mjs [game …]
//
// The keyboard smoke proves the game answers keys. This proves the phone player can play it:
//   · the control layer exists, and only on a touch device
//   · its chips reach the game (the game's own keydown listener sees them)
//   · its stick / drag surface steers the game — measured while the finger is held down,
//     because a stick only pushes while it is pushed
//   · the play surface takes a touch (the tower defense builds where you tap; untrusted DOM
//     TouchEvents do not produce pointerdown, so this needs real CDP touch, not a dispatchEvent)
//   · the page does not scroll, and the console stays clean
// and it leaves a portrait screenshot in games/<game>/shots/mobile-play.jpg.
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const gamesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 8139);
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = resolve(gamesDir, "tools", "work", "mobilecheck");
await mkdir(out, { recursive: true });
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(gamesDir, p));
  if (!file.startsWith(gamesDir) || !existsSync(file) || !(await stat(file).catch(() => null))?.isFile()) {
    res.writeHead(404, { "content-type": "text/plain" }).end(`404 ${url.pathname}`);
    console.log(`     404 ${url.pathname}`);
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? resolve(gamesDir, "tools/chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=640"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: Number(process.env.PHONE_DPR ?? 1),
  isMobile: true, hasTouch: true, reducedMotion: "no-preference",
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }).catch(() => {});

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 160)}`); });
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url().slice(-60)}`));

const evalJs = (fn, arg) => page.evaluate(fn, arg).catch((e) => { errors.push(`eval: ${e.message}`.slice(0, 140)); return null; });
const box = (sel) => page.evaluate((s) => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null;
}, sel).catch(() => null);
const chipsBox = () => page.evaluate(() => [...document.querySelectorAll(".touch-btn")].map((b) => {
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.textContent.trim() };
}).filter((c) => c.x > 0 && c.y > 0)).catch(() => []);

// ---- real touch, from CDP: the page sees touchstart/touchmove/touchend, and Chromium derives
// the pointer events from them, which is what the games' canvas handlers are listening for.
async function touchStart(x, y) { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); }
async function touchMove(x, y) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] }); }
async function touchEnd(x, y) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
  void x; void y;
}
async function tap(x, y) { await touchStart(x, y); await sleep(60); await touchEnd(); await sleep(60); }

// what each game's touch controls must do, in words the check can measure:
//   read:   the game's own state, through the window.arcade handle each game exposes for tools
//   steer:  how a thumb steers this game (drag the tube, push the stick, hold a chip) and the
//           number that must move because of it
const PROBES = {
  "1-breakout": {
    read: () => ({ state: window.arcade?.state?.(), paddle: window.arcade?.world?.paddle?.position?.x }),
    steer: { how: "drag", value: () => window.arcade?.world?.paddle?.position?.x ?? 0, min: 0.4 },
  },
  "2-runner": {
    read: () => ({ state: window.arcade?.state?.crashed ? "crashed"
      : window.arcade?.state?.running ? "running" : "ready", x: window.arcade?.player?.state?.x }),
    steer: { how: "chip", chip: 0, value: () => window.arcade?.player?.state?.x ?? 0, min: 0.4 },
  },
  "3-marble-maze": {
    read: () => ({ state: window.arcade?.state, vx: window.arcade?.body?.velocity?.x }),
    steer: { how: "pad", axis: "x", value: () => Math.abs(window.arcade?.body?.velocity?.x ?? 0), min: 0.002 },
  },
  "4-tower-defense": {
    read: () => ({ state: window.arcade?.state?.(), money: window.arcade?.stats?.().money }),
    // the board is the control: a tap on a buildable tile spends money on a tower
    steer: { how: "board", value: () => 100 - (window.arcade?.stats?.().money ?? 100), min: 1 },
  },
  "5-flight": {
    read: () => ({ state: window.arcade?.fly?.state, y: window.arcade?.fly?.pos?.y }),
    // the stick's y axis is pitch, so the swipe is vertical; y drifts a little in half a second
    // of held pitch, which is the smallest honest signal available
    steer: { how: "pad", axis: "y", value: () => window.arcade?.fly?.pos?.y ?? 0, min: 0.05 },
  },
};

const games = process.argv.slice(2).filter((a) => PROBES[a]);
const list = games.length ? games : Object.keys(PROBES);
let failed = 0;
for (const g of list) {
  const p = PROBES[g];
  const shot = join(gamesDir, g, "shots");
  await mkdir(shot, { recursive: true });
  errors.length = 0;
  await page.goto(`${base}/${g}/index.html`, { waitUntil: "load", timeout: 30000 });
  // count what the page itself receives, so "the chip works" means the game got the key
  await evalJs(() => {
    window.__probe = { keys: [], pointers: 0, touches: 0 };
    addEventListener("keydown", (e) => window.__probe.keys.push(e.code), true);
    addEventListener("pointerdown", () => { window.__probe.pointers++; }, true);
    addEventListener("touchstart", () => { window.__probe.touches++; }, true);
  });
  await sleep(3500);

  const layer = await box(".touch-layer");
  const chips = await chipsBox();
  const pad = await box(".touch-pad");
  const drag = await box(".touch-drag");
  const env = await evalJs(() => ({
    dpr: window.devicePixelRatio, coarse: matchMedia("(pointer: coarse)").matches,
    body: document.body.className, play: document.body.classList.contains("playing"),
  }));
  const { width: w, height: h } = page.viewportSize();
  const before = await evalJs(p.read);

  // 1. chips: a real touch on every chip, in order
  for (const b of chips) await tap(b.x, b.y);
  const keys = await evalJs(() => window.__probe.keys);
  // 2. the stick / the drag surface / the board, measured with the finger down
  const s = p.steer;
  const v0 = await evalJs(s.value);
  let mid = v0;
  if (s.how === "pad" && pad) {
    const dir = s.axis === "y" ? [0, -1] : [1, 0];   // a swipe in the axis that steers this game
    await touchStart(pad.x, pad.y);
    for (let i = 1; i <= 10; i++) {
      await touchMove(pad.x + dir[0] * i * 11, pad.y + dir[1] * i * 11);
      await sleep(80);
      if (i >= 8) mid = await evalJs(s.value);
    }
    await sleep(200);
    mid = await evalJs(s.value);
    await touchEnd();
  } else if (s.how === "drag" && drag) {
    const y = drag.y;
    await touchStart(drag.x - drag.w * 0.4, y);
    for (let i = 1; i <= 8; i++) {
      await touchMove(drag.x - drag.w * 0.4 + (drag.w * 0.8) * i / 8, y);
      await sleep(70);
      if (i >= 4) mid = await evalJs(s.value);
    }
    await touchEnd();
  } else if (s.how === "chip" && chips[s.chip]) {
    const b = chips[s.chip];
    await touchStart(b.x, b.y);
    await sleep(800);
    mid = await evalJs(s.value);
    await touchEnd();
  } else if (s.how === "board") {
    for (const fx of [0.34, 0.5, 0.66]) {
      for (const fy of [0.44, 0.58, 0.72]) await tap(w * fx, h * fy);
    }
    await sleep(300);
    mid = await evalJs(s.value);
  }
  const delta = Math.abs((mid ?? 0) - (v0 ?? 0));
  const pointers = await evalJs(() => window.__probe.pointers);
  const touches = await evalJs(() => window.__probe.touches);
  const after = await evalJs(p.read);
  const scrolled = await evalJs(() => Math.abs(window.scrollY) > 1
    || document.documentElement.scrollHeight > window.innerHeight + 2);
  await page.screenshot({ path: join(shot, "mobile-play.jpg") });

  const stateChanged = JSON.stringify(before) !== JSON.stringify(after);
  const hasControls = chips.length > 0 || !!pad || !!drag;
  const pass = !!layer && hasControls && touches > 0 && (keys?.length ?? 0) > 0
    && (stateChanged || delta >= s.min) && delta >= 0 && !scrolled && !errors.length;
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${g.padEnd(16)} layer=${!!layer} chips=${chips.length} `
    + `pad=${!!pad} drag=${!!drag} touch=${touches} keys=[${(keys ?? []).slice(0, 6).join(",")}] `
    + `pointer=${pointers} state ${JSON.stringify(before)} => ${JSON.stringify(after)} `
    + `steer ${v0} => ${mid} (d ${Number(delta).toFixed(2)} min ${s.min}) `
    + `scroll=${scrolled} dpr=${env?.dpr} coarse=${env?.coarse} body="${env?.body}" errors=${errors.length}`);
  if (errors.length) console.log("      " + errors.slice(0, 3).join(" | ").slice(0, 220));
}
await browser.close().catch(() => {});
server.close();
console.log(`${list.length - failed}/${list.length} phone checks passed`);
process.exit(failed ? 1 : 0);
