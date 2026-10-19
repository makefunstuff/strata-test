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
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const a = window.arcade, r = a.renderer, cam = a.camera;
  return { size: [innerWidth, innerHeight], dpr: devicePixelRatio, pr: r.getPixelRatio(),
    camY: +cam.position.y.toFixed(1), camZ: +cam.position.z.toFixed(1), fov: cam.fov, aspect: +cam.aspect.toFixed(2),
    bg: !!a.scene.background, fog: !!a.scene.fog, info: r.info.render, tone: r.toneMapping, exposure: r.toneMappingExposure };
});
console.log(JSON.stringify(info));
// sample the canvas pixels (the compositor output, not the DOM overlay)
const sample = async (label) => {
  const v = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const w = c.width, h = c.height;
    const px = new Uint8Array(4 * 9);
    let out = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      gl.readPixels(Math.floor((w * (j + 0.5)) / 3), Math.floor((h * (i + 0.5)) / 3), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    return null;
  });
  await page.screenshot({ path: `/tmp/iso-${label}.png` });
};
await page.evaluate(() => { window.arcade.scene.background = null; });
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/iso-nobg.png" });
await page.evaluate(() => { window.arcade.post.crt.pass.enabled = false; });
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/iso-nocrt.png" });
await page.evaluate(() => { document.querySelectorAll(".crt-glass,.crt-bezel,#hud,#hint,.hud-controls,.touch-layer").forEach(e => e.style.display = "none"); });
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/iso-nodom.png" });
console.log("shots: /tmp/iso-nobg.png /tmp/iso-nocrt.png /tmp/iso-nodom.png");
await b.close(); server.close();
