// Ad-hoc proof for game 5's scoring and crash paths, driven through window.arcade.fly:
// fly the plane straight into a gate, then into the ground, and read the HUD back.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = resolve("games");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    const f = join(root, p);
    if (!f.startsWith(root)) throw 0;
    const d = await readFile(f);
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(d);
  } catch { res.writeHead(404).end("no"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? resolve("games/tools/chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${base}/5-flight/index.html`);
await page.waitForTimeout(5000);
const hud = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 150));
console.log("start  ", await hud());

// 1. line the plane up with a gate and let it fly in
await page.evaluate(() => {
  const a = window.arcade, g = a.gates.gates[0], p = a.fly.pos;
  g.group.position.set(p.x, p.y, p.z - 120);          // straight ahead
  g.taken = false;
});
await page.waitForTimeout(4000);
console.log("gate   ", await hud());

// 2. put the plane on the ground
await page.evaluate(() => { window.arcade.fly.pos.y = 0.2; });
await page.waitForTimeout(1500);
console.log("ground ", await hud());
await page.waitForTimeout(3000);
console.log("respawn", await hud());
console.log("errors ", errs.filter((e) => !/favicon|autoplay/.test(e)).slice(0, 3));
await browser.close();
server.close();
