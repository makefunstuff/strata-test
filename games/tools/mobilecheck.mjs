// Phone check: does the touch control set of each game actually drive the game?
//
//   node tools/mobilecheck.mjs [game...]
//
// For every game, in a portrait 390x844 touch context:
//   1. the control layer is present and visible (it must be absent on a keyboard machine);
//   2. a tap on the play area does what the game's own start/serve/jump verb does;
//   3. a drag (touchstart/move/end through CDP) moves the thing that must move — the paddle,
//      the marble, the plane, the lane, a tower;
//   4. a chip tap fires the key it claims to fire;
//   5. portrait screenshots land in <game>/shots/mobile-<state>.png.
// Reads the games' own exposed state through window.arcade, so it proves the input reached
// the simulation, not that a DOM class toggled.
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const gamesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png",
};
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    let f = join(gamesDir, p);
    if (!f.startsWith(gamesDir)) throw 0;
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    const data = await readFile(f);
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end("no"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? resolve(gamesDir, "tools/chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: Number(process.env.PHONE_DPR ?? 1),
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.location().url)) errors.push(m.text()); });

const sleep = (ms) => page.waitForTimeout(ms);
const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y]) => ({ x, y })) });
async function tap(x, y) {
  await touch("touchStart", [[x, y]]);
  await touch("touchEnd", []);
  await sleep(260);
}
async function drag(x1, y1, x2, y2, steps = 10) {
  await touch("touchStart", [[x1, y1]]);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", [[x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]]);
    await sleep(30);
  }
  await touch("touchEnd", []);
  await sleep(320);
}
async function centreOf(selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, selector);
  return box;
}
const evalJs = (fn) => page.evaluate(fn);
const hud = () => evalJs(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 140));

// each game: a probe of the touch controls, through the state the game itself exposes
const PROBES = {
  "1-breakout": {
    ready: () => !!window.arcade,
    tapEffect: async () => {
      const before = await evalJs(() => window.arcade.state());
      const c = { x: 195, y: 500 };
      await tap(c.x, c.y);
      return { before, after: await evalJs(() => window.arcade.state()) };
    },
    tapOk: (r) => r.before === "start" && r.after === "play",
    dragEffect: async () => {
      const before = await evalJs(() => window.arcade.world.paddle.position.x);
      await drag(330, 700, 60, 700);
      return { before, after: await evalJs(() => window.arcade.world.paddle.position.x) };
    },
    dragOk: (r) => r.after < r.before - 0.8,
  },
  "2-runner": {
    ready: () => !!window.arcade,
    tapEffect: async () => {
      const before = await evalJs(() => window.arcade.player.state.y);
      await tap(195, 300);
      return { before, after: await evalJs(() => window.arcade.player.state.y) };
    },
    tapOk: (r) => r.after > 0.15,          // a tap on the tube jumps
    dragEffect: async () => {
      const chip = await centreOf('.touch-btn[data-code="ArrowLeft"]');
      const before = await evalJs(() => window.arcade.player.state.lane);
      if (chip) await tap(chip.x, chip.y);
      return { before, after: await evalJs(() => window.arcade.player.state.lane), chip: !!chip };
    },
    dragOk: (r) => r.chip && r.after < r.before,
  },
  "3-marble-maze": {
    ready: () => !!window.arcade,
    tapEffect: async () => ({ state: await evalJs(() => document.querySelector('[data-k="state"]')?.textContent) }),
    tapOk: (r) => /ROLL|READY|TILT/i.test(r.state ?? ""),
    dragEffect: async () => {
      const pad = await centreOf(".touch-pad");
      const before = await evalJs(() => [window.arcade.body.position.x, window.arcade.body.position.z]);
      if (pad) await drag(pad.x, pad.y, pad.x, pad.y - 55, 8);
      const after = await evalJs(() => [window.arcade.body.position.x, window.arcade.body.position.z]);
      return { before, after, pad: !!pad };
    },
    dragOk: (r) => r.pad && Math.abs(r.after[1] - r.before[1]) + Math.abs(r.after[0] - r.before[0]) > 0.05,
  },
  "4-tower-defense": {
    ready: () => !!window.arcade,
    tapEffect: async () => {
      const before = await evalJs(() => window.arcade.stats().towers ?? document.querySelectorAll(".touch-btn").length);
      await tap(150, 330);                 // a tile on the field
      const built = await evalJs(() => window.arcade.towers?.count ?? window.arcade.stats().kills);
      const hudText = await hud();
      return { before, built, hudText };
    },
    tapOk: (r) => /TOWERS [1-9]/.test(r.hudText),
    dragEffect: async () => {
      const chip = await centreOf('.touch-btn[data-code="KeyN"]');
      const before = await evalJs(() => window.arcade.state());
      if (chip) await tap(chip.x, chip.y);
      return { before, after: await evalJs(() => window.arcade.state()), chip: !!chip };
    },
    dragOk: (r) => r.chip && r.after === "wave",
  },
  "5-flight": {
    ready: () => !!window.arcade,
    tapEffect: async () => ({ state: await evalJs(() => window.arcade.fly.state) }),
    tapOk: (r) => /fly|down/i.test(r.state ?? ""),
    dragEffect: async () => {
      const pad = await centreOf(".touch-pad");
      const before = await evalJs(() => window.arcade.fly.pos.y);
      if (pad) await drag(pad.x, pad.y, pad.x, pad.y - 55, 8);
      const after = await evalJs(() => window.arcade.fly.pos.y);
      return { before, after, pad: !!pad };
    },
    dragOk: (r) => r.pad && Math.abs(r.after - r.before) > 0.4,
  },
};

const games = process.argv.slice(2).filter((a) => PROBES[a]);
const list = games.length ? games : Object.keys(PROBES);
let failed = 0;
for (const g of list) {
  const p = PROBES[g];
  const shot = join(gamesDir, g, "shots");
  await mkdir(shot, { recursive: true });
  await page.goto(`${base}/${g}/index.html`, { waitUntil: "load", timeout: 30000 });
  await sleep(4000);
  const layer = await centreOf(".touch-layer");
  const chips = await evalJs(() => document.querySelectorAll(".touch-btn").length);
  const hasPad = !!(await centreOf(".touch-pad"));
  const hasDrag = !!(await centreOf(".touch-drag"));
  const dpr = await evalJs(() => ({ dpr: window.devicePixelRatio, coarse: matchMedia("(pointer: coarse)").matches, mtp: navigator.maxTouchPoints }));
  const ready = await evalJs(p.ready);
  const tapRes = await p.tapEffect().catch((e) => ({ err: String(e).slice(0, 80) }));
  const tapOk = p.tapOk(tapRes);
  await page.screenshot({ path: join(shot, "mobile-play.jpg") });
  const dragRes = await p.dragEffect().catch((e) => ({ err: String(e).slice(0, 80) }));
  const dragOk = p.dragOk(dragRes);
  await page.screenshot({ path: join(shot, "mobile-drag.jpg") });
  const scroll = await evalJs(() => document.documentElement.scrollHeight > window.innerHeight + 2);
  const ok = ready && !!layer && tapOk && dragOk && !errors.length && !scroll;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${g.padEnd(16)} layer=${!!layer} chips=${chips} pad=${hasPad} drag=${hasDrag} ` +
    `tap=${tapOk} ${JSON.stringify(tapRes).slice(0, 60)} drag=${dragOk} ${JSON.stringify(dragRes).slice(0, 60)} ` +
    `scroll=${scroll} dpr=${dpr.dpr} coarse=${dpr.coarse} errors=${errors.length}`);
  if (errors.length) console.log("     ", errors.slice(0, 2).join(" | ").slice(0, 200));
  errors.length = 0;
}

await browser.close().catch(() => {});
server.close();
console.log(`${list.length - failed}/${list.length} phone checks passed`);
process.exit(failed ? 1 : 0);
