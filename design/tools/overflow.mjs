// node tools/overflow.mjs <page> [width] — list the elements wider than the viewport
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
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end("404 " + rel); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const W = +(process.argv[3] || 390);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: 844 } });
const p = await ctx.newPage();
await p.goto(`${origin}/${process.argv[2]}`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
const out = await p.evaluate((W) => {
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 2) continue;
    if (r.right > W + 1 || r.left < -1) {
      const cs = getComputedStyle(el);
      bad.push({
        tag: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/).join(".") : ""),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        pos: cs.position, ovf: cs.overflowX, w100: cs.width,
        txt: (el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  return { docW: document.documentElement.scrollWidth, innerW: innerWidth, bad: bad.sort((a,b)=>b.right-a.right).slice(0, 12) };
}, W);
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
