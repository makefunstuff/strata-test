// node tools/dump.mjs <task-relative page> <selector> [more selectors...]
// Prints the text of matching elements after load. One capped Chromium, closed at the end.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(toolsDir, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".json": "application/json", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  try {
    let f = join(designDir, rel);
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    const body = await readFile(f);
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("404 " + rel); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const argv = process.argv.slice(2);
const page = argv[0];
const want = argv.slice(1).filter((s) => s !== "--phone");
const phone = argv.includes("--phone");
const reduce = argv.includes("--reduce");
const sels = want.filter((s) => s !== "--reduce");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb", "--hide-scrollbars"],
});
const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, reducedMotion: reduce ? "reduce" : "no-preference" });
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("[console error]", m.text()); });
p.on("pageerror", (e) => console.log("[page error]", e.message));
await p.goto(`${origin}/${page}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
if (argv.includes("--build")) console.log("### window.__build\n" + JSON.stringify(await p.evaluate("window.__build")));
if (argv.includes("--frames")) console.log("### frame ms labels\n" + await p.evaluate("[...document.querySelectorAll('.frame-h .t')].map(x => x.textContent).join(' ')"));
for (const s of sels) {
  const t = await p.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    return els.map((e) => e.innerText).join("\n----\n");
  }, s);
  console.log(`### ${s}\n${t}`);
}
await browser.close();
server.close();
