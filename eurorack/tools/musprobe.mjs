import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, dirname } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); if (p === "/") p = "/index.html";
    res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
    res.end(await readFile(resolve(root, "." + p)));
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await pw.chromium.launch({
  executablePath: fileURLToPath(new URL("./chromium-capped.sh", import.meta.url)),
  headless: true, args: ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage","--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForFunction("window.eurorack && window.eurorack.booted === true", null, { timeout: 30000 });
for (const n of await page.evaluate("eurorack.presets")) {
  const r = await page.evaluate(async (x) => { eurorack.loadPreset(x); return await eurorack.renderOffline(x, 4); }, n);
  const seqs = new Set((r.steps||[]).map(s=>s.split(":")[0]));
  const maxSteps = Math.max(0, ...[...seqs].map(id => r.steps.filter(s=>s.startsWith(id+":")).length));
  console.log(`${n.padEnd(14)} peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(4)} onsets ${String(r.onsets).padStart(3)} tele ${r.teleN} seqs ${seqs.size} maxSteps ${maxSteps}`);
}
await browser.close(); server.close();
