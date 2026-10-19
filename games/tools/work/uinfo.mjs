import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const gamesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try { let f = join(gamesDir, p); if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end("no"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const b = await chromium.launch({
  executablePath: resolve(gamesDir, "tools/chromium-capped.sh"), headless: true,
  args: ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--single-process","--no-zygote","--disable-dev-shm-usage","--js-flags=--max-old-space-size=256"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/1-breakout/index.html`, { waitUntil: "load" });
await page.waitForTimeout(3500);
console.log(await page.evaluate(() => {
  const u = window.arcade.post.crt.pass.uniforms;
  return JSON.stringify({
    keys: Object.keys(u).length,
    entries: Object.entries(u).map(([k, v]) => `${k}:${v === undefined ? "UNDEF" : typeof v.value}`),
    res: [u.uResolution.value.x, u.uResolution.value.y],
    canvas: [document.querySelector("canvas").width, document.querySelector("canvas").height],
  });
}));
await b.close(); server.close();
