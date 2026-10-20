// node tools/names.mjs <page> — list controls the harness audit calls unnamed
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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${origin}/${process.argv[2]}`, { waitUntil: "networkidle" });
await p.waitForTimeout(800);
const out = await p.evaluate(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && +s.opacity > 0.05 };
  const accName = (el) => (el.getAttribute("aria-label") || "").trim()
    || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((i) => document.getElementById(i)?.textContent).join(" ").trim()
    || (el.labels && el.labels.length ? [...el.labels].map((l) => l.textContent).join(" ").trim() : "")
    || (/^(a|button|summary)$/.test(el.tagName.toLowerCase()) ? el.textContent.trim() : "");
  const short = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/).join(".") : "") + " → “" + (el.textContent || "").trim().slice(0, 60) + "”";
  const ctrls = [...document.querySelectorAll("a[href],button,input,select,textarea,summary,label,iframe")].filter(visible);
  const bad = ctrls.filter((el) => {
    const t = el.tagName.toLowerCase();
    if (t === "input" && /^(hidden|submit|button|reset)$/.test(el.type)) return false;
    return accName(el).length < 2;
  });
  return {
    total: ctrls.length,
    bad: bad.map(short),
    small: ctrls.filter((el) => el.getBoundingClientRect().height < 34).map(short).slice(0, 45),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
