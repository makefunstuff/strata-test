// rendered.mjs — the *rendered* text of every page of a task, for a parity check.
//
//   node tools/rendered.mjs 11-styles        # writes <task>/rendered.json
//
// Same plumbing as shoot.mjs: a local static server (so modules and fetch behave as on
// GitHub Pages) and one Chromium, run through tools/chromium-capped.sh so the box keeps
// its memory. One page at a time, one context, closed at the end.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { chromium } from "playwright-core";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(toolsDir, "..");
const argv = process.argv.slice(2);
const task = argv.find((a) => !a.startsWith("-"));
if (!task) { console.error("usage: node tools/rendered.mjs <task-dir> [--only page,page]"); process.exit(2); }
const oi = argv.indexOf("--only");
const onlyList = oi < 0 ? null : String(argv[oi + 1]).split(",").map((x) => x.trim());

const manifest = JSON.parse(await readFile(join(toolsDir, "manifest.json"), "utf8"));
const entry = manifest.find((t) => t.task === task);
if (!entry) { console.error(`no such task: ${task}`); process.exit(1); }
const pages = [...new Set(entry.shots.map((s) => s.page))].filter((p) => !onlyList || onlyList.includes(p.replace(/\.html$/, "")));
if (!pages.length) { console.error(`no pages for ${task}`); process.exit(1); }

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  try {
    let f = join(designDir, rel);
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("404 " + rel); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb",
         "--font-render-hinting=none", "--hide-scrollbars", "--js-flags=--max-old-space-size=512"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const out = {};
try {
  for (const page of pages) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    p.on("requestfailed", (r) => errs.push("requestfailed: " + r.url().replace(origin + "/", "")));
    /* the font question the contrast audit never asked: did the pinned face arrive? */
    const fontFiles = new Set();
    p.on("response", (r) => { if (/\.woff2?(\?|$)/.test(r.url()) && r.status() < 400) fontFiles.add(r.url().split("/npm/")[1] || r.url()) });
    await p.goto(`${origin}/${task}/${page}`, { waitUntil: "load", timeout: 30000 });
    await p.waitForTimeout(1800);
    out[page] = await p.evaluate(() => {
      const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
      const h1 = document.querySelector("h1");
      const all = [...document.querySelectorAll("*")];
      const radii = all.map((el) => parseFloat(getComputedStyle(el).borderRadius) || 0).filter((n) => n > 0);
      const textEls = [...document.querySelectorAll("p,h1,h2,h3,h4,li,span,em,b,i,strong,label,button,a,dd,dt,figcaption,blockquote")]
        .filter((el) => (el.innerText || "").trim().length > 1);
      return {
        title: document.title,
        lang: document.documentElement.lang,
        text: document.body.innerText,
        words: document.body.innerText.split(/\s+/).filter(Boolean).length,
        h1: h1 ? h1.innerText.replace(/\s+/g, " ").trim() : null,
        h1font: cs(h1, "font-family"),
        h1weight: cs(h1, "font-weight"),
        h1size: cs(h1, "font-size"),
        h1tracking: cs(h1, "letter-spacing"),
        bodyfont: cs(document.body, "font-family"),
        bodysize: cs(document.body, "font-size"),
        bodyleading: cs(document.body, "line-height"),
        bodyBg: cs(document.body, "background-color"),
        htmlBg: cs(document.documentElement, "background-color"),
        headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
        links: document.querySelectorAll("a").length,
        forms: document.querySelectorAll("form").length,
        inputs: document.querySelectorAll("input,select,textarea").length,
        svg: document.querySelectorAll("svg").length,
        imgs: document.querySelectorAll("img").length,
        landmarks: [...document.querySelectorAll("header,main,footer,nav,aside,section[aria-labelledby],form")].length,
        animations: document.getAnimations().length,
        maxRadius: radii.length ? Math.max(...radii) : 0,
        inks: [...new Set(textEls.map((el) => getComputedStyle(el).color))].length,
        smallestText: Math.min(...textEls.map((el) => parseFloat(getComputedStyle(el).fontSize))),
        docWidth: document.documentElement.scrollWidth,
        fontsTotal: document.fonts.size,
        fontsLoaded: [...document.fonts].filter((f) => f.status === "loaded").length,
        fontFamilies: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))].sort(),
      };
    });
    out[page].fontFiles = [...fontFiles];
    if (errs.length) out[page].consoleErrors = errs;
    await p.close();
    console.log(`  ${page.padEnd(22)} words ${String(out[page].words).padStart(5)}  inks ${out[page].inks}  anim ${out[page].animations}  faces ${String(out[page].fontsLoaded).padStart(2)}/${String(out[page].fontsTotal).padStart(3)}  woff ${String(out[page].fontFiles.length).padStart(2)}  errs ${errs.length}`);
  }
} finally {
  await ctx.close();
  await browser.close();
  server.close();
}
const dest = join(designDir, task, "rendered.json");
await writeFile(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${task}/rendered.json — ${Object.keys(out).length} pages`);
