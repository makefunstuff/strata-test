/* design/tools/chain-probe.mjs <page> [width] — print the ancestor chain of every element
 * that crosses the right edge, with each box's width, scroll width and computed track. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const toolsDir = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(toolsDir, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  try { let f = join(designDir, rel); if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end("404") }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const W = Number(process.argv[3] || 390);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"), args: ["--disable-gpu", "--font-render-hinting=none"] });
const p = await b.newPage({ viewport: { width: W, height: 844 } });
await p.goto(`http://127.0.0.1:${server.address().port}/${process.argv[2]}`, { waitUntil: "load" });
await p.waitForTimeout(1000);
console.log(await p.evaluate((W) => {
  const out = [];
  const over = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > W + 0.5);
  const seen = new Set();
  for (const el of over.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 3)) {
    let n = el, chain = [];
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n), r = n.getBoundingClientRect();
      chain.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\s+/).join(".") : ""} w=${Math.round(r.width)} r=${Math.round(r.right)} sw=${n.scrollWidth} grid=${cs.gridTemplateColumns} ovfX=${cs.overflowX} minW=${cs.minWidth}`);
      n = n.parentElement;
    }
    const key = chain[0];
    if (seen.has(key)) continue; seen.add(key);
    out.push(chain.slice(0, 6).join("\n  "));
  }
  return `docW ${document.documentElement.scrollWidth} (innerW ${innerWidth})\n\n` + out.join("\n───\n");
}, W));
await b.close(); server.close(); process.exit(0);
