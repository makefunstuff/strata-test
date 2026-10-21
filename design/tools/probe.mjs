/* design/tools/probe.mjs — one page, one Chromium: what fonts did the browser load
 * and what does it report drawing them? A diagnostic, not part of the audit.
 *   node design/tools/probe.mjs 11-styles s03-editorial.html
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const designDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const task = process.argv[2] || "11-styles";
const page = process.argv[3] || "index.html";
const root = join(designDir, task);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
const srv = createServer(async (req, res) => {
  const p = normalize(join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "")));
  try {
    const buf = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nope") }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(designDir, "tools", "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb",
         "--font-render-hinting=none", "--hide-scrollbars", "--js-flags=--max-old-space-size=512"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const reqs = [];
p.on("response", (r) => { if (/fontsource|jsdelivr/.test(r.url())) reqs.push(`${r.status()} ${r.url().split("/npm/")[1] || r.url()}`) });
p.on("requestfailed", (r) => reqs.push(`FAILED ${r.url()} ${r.failure()?.errorText}`));
await p.goto(`${base}/${page}`, { waitUntil: "load" });
await p.waitForTimeout(2500);
const out = await p.evaluate(async () => {
  const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
  const first = (list) => (list || "").split(",")[0].trim().replace(/["']/g, "");
  const h1 = document.querySelector("h1");
  const bodyFam = cs(document.body, "font-family"), h1Fam = cs(h1, "font-family");
  /* The question the contrast audit never asked: is the family the page asks for the
     family the browser loaded? check() on the first name in each stack, with a real
     sample of the page's own text. */
  const sample = (document.body.innerText || "").slice(0, 200);
  const ok = (fam, size) => fam ? document.fonts.check(`${size} "${fam}"`, sample) : null;
  return {
    body: { stack: bodyFam, first: first(bodyFam), loaded: ok(first(bodyFam), cs(document.body, "font-size")) },
    h1: { stack: h1Fam, first: first(h1Fam), loaded: ok(first(h1Fam), cs(h1, "font-size")) },
    faces: { total: document.fonts.size, loaded: [...document.fonts].filter((f) => f.status === "loaded").length, status: document.fonts.status }
  };
});
console.log(JSON.stringify(out, null, 1));
console.log("network:", reqs.slice(0, 10).join("\n  "));
await b.close(); srv.close();
