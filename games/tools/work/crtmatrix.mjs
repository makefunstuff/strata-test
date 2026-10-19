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
for (const vp of [[390, 844], [960, 540]]) {
  const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1, isMobile: vp[0] < 500, hasTouch: vp[0] < 500 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/1-breakout/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const steps = {
    all: {},
    nogain: { uGain: 1.0 },
    noscan: { uScan: 0 },
    nomask: { uMask: 0 },
    nocurv: { uCurvature: 0, uOverscan: 1.0 },
    noglow: { uGlow: 0 },
    nograde: { uSat: 1, uContrast: 1, uLift: 0 },
    nouv: { uAberration: 0 },
  };
  for (const [name, set] of Object.entries(steps)) {
    await page.evaluate((s) => {
      const u = window.arcade.post.crt.pass.uniforms;
      if (!window.__base) window.__base = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value]));
      for (const [k, v] of Object.entries(u)) if (k in window.__base) v.value = window.__base[k];
      for (const [k, v] of Object.entries(s)) u[k].value = v;
    }, set);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/crt-${vp[0]}-${name}.png` });
  }
  await ctx.close();
}
console.log("done");
await b.close(); server.close();
