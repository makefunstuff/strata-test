// Find every element whose box edge lands on a given screen row band — the "what is that line"
// detector. Prints computed styles for the edges so the paint can be attributed.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, basename, dirname } from "node:path";

const game = resolve(process.argv[2]);
const band = (process.argv[3] ?? "200,212").split(",").map(Number);
const root = resolve(dirname(game));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    const file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../tools/chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${basename(game)}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const out = await page.evaluate(([a, b]) => {
    const rows = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hits = [];
      if (r.width > 200 && r.height > 0) {
        if (r.top >= a - 2 && r.top <= b + 2) hits.push("top");
        if (r.bottom >= a - 2 && r.bottom <= b + 2) hits.push("bottom");
      }
      const pes = ["::before", "::after"].filter((p) => {
        const s = getComputedStyle(el, p);
        return s.content !== "none" && s.content !== "normal";
      });
      const paint = [
        cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? "bg=" + cs.backgroundColor : null,
        cs.backgroundImage !== "none" ? "img=" + cs.backgroundImage.slice(0, 120) : null,
        cs.boxShadow !== "none" ? "shadow=" + cs.boxShadow.slice(0, 80) : null,
        cs.borderTopWidth !== "0px" ? "bt=" + cs.borderTopWidth + " " + cs.borderTopColor : null,
        cs.borderBottomWidth !== "0px" ? "bb=" + cs.borderBottomWidth + " " + cs.borderBottomColor : null,
        cs.outlineStyle !== "none" ? "outline=" + cs.outlineWidth + " " + cs.outlineColor : null,
        cs.mixBlendMode !== "normal" ? "blend=" + cs.mixBlendMode : null,
        cs.filter !== "none" ? "filter=" + cs.filter.slice(0, 60) : null,
      ].filter(Boolean);
      if ((hits.length && paint.length) || pes.length) {
        rows.push({
          tag: el.tagName, cls: el.className?.toString?.().slice(0, 30) || null, id: el.id || null,
          rect: [Math.round(r.x), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          edges: hits, pseudo: pes, paint,
          z: cs.zIndex, display: cs.display, opacity: cs.opacity, transform: cs.transform.slice(0, 40),
        });
      }
    }
    return { dpr: window.devicePixelRatio, canvas: (() => { const c = document.querySelector("canvas"); const r = c.getBoundingClientRect(); return { css: [r.width, r.height], buf: [c.width, c.height], style: getComputedStyle(c).width + " x " + getComputedStyle(c).height }; })(), rows };
  }, band);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close().catch(() => {});
  server.close();
}
