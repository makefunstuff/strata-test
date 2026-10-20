// Screenshot harness for the design gallery.
//
//   node tools/shoot.mjs                     # every task in the manifest
//   node tools/shoot.mjs 01-landing          # one task
//   node tools/shoot.mjs 01-landing --only hero
//
// Reads tools/manifest.json: one entry per task, each with pages and shots.
// For every shot it opens the page in headless Chromium (in a RAM-capped systemd
// scope, so Strata keeps its memory), runs the actions, screenshots it, re-encodes
// the PNG to JPEG (quality 82) into <task>/shots/<name>.jpg, and records console
// errors, page errors, failed requests and an accessibility audit.
//
// Output: tools/work/shoot/latest.json + latest.md (committed: the evidence travels).
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(toolsDir, "..");
const outDir = join(toolsDir, "work", "shots");
const reportDir = join(toolsDir, "work", "shoot");
await mkdir(outDir, { recursive: true });
await mkdir(reportDir, { recursive: true });

const argv = process.argv.slice(2);
const oi = argv.indexOf("--only");
const onlyList = oi < 0 ? null : String(argv[oi + 1]).split(",").map((x) => x.trim()).filter(Boolean);
const want = argv.filter((a, i) => !a.startsWith("-") && !(oi >= 0 && i === oi + 1));
const manifest = JSON.parse(await readFile(join(toolsDir, "manifest.json"), "utf8"));
const jobs = manifest.filter((t) => !want.length || want.includes(t.task)).map((t) => ({ ...t, shots: t.shots.filter((s) => !onlyList || onlyList.includes(s.name) || onlyList.includes(t.task) || onlyList.includes(t.task + "--" + s.name)) }));
if (!jobs.length) { console.error(`no such task in manifest: ${want.join(",")}`); process.exit(1); }

// A local static server, so pages load the same way they will on GitHub Pages:
// ES modules and fetch are blocked by CORS on file://, which would hide real errors.
const { createServer } = await import("node:http");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  const { readFile, stat } = await import("node:fs/promises");
  const { join: j } = await import("node:path");
  try {
    let f = j(designDir, rel);
    if ((await stat(f)).isDirectory()) f = j(f, "index.html");
    const body = await readFile(f);
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }); res.end("404 " + rel);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb",
         "--font-render-hinting=none", "--hide-scrollbars",
         "--js-flags=--max-old-space-size=512"],
});
// One long-lived context: opening a second context kills this Chromium build under
// --single-process (Chromium 152), so the phone shots reuse it at a 390-wide viewport —
// the pages are responsive by CSS media query, not by viewport meta.
const base = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const ctxFor = async () => base;

// PNG -> JPEG inside the same browser (no image toolchain on this box). Runs in its
// own tiny page, so a tall full-page canvas never shares a heap with the page under test.
let encPage = null;
const encode = async (pngPath) => {
  if (!encPage) {
    encPage = await (await ctxFor({})).newPage();
    await encPage.setViewportSize({ width: 48, height: 48 });
    await encPage.goto("about:blank");
  }
  const b64 = await readFile(pngPath, "base64");
  return encPage.evaluate(async (src) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("decode")); img.src = src; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    window.__px = [img.naturalWidth, img.naturalHeight];
    return c.toDataURL("image/jpeg", 0.82).split(",")[1];
  }, "data:image/png;base64," + b64);
};

/** actions: "click:sel" "type:sel:text" "key:Key" "hover:sel" "eval:js" "wait:ms" "scroll:y" */
async function runActions(page, actions = []) {
  const log = [];
  // scroll jumps must land, not animate: screenshots are taken right after the actions
  await page.evaluate("document.documentElement.style.scrollBehavior = 'auto'").catch(() => {});
  for (const a of actions) {
    const i = a.indexOf(":");
    const kind = i < 0 ? a : a.slice(0, i);
    const arg = i < 0 ? "" : a.slice(i + 1);
    try {
      if (kind === "click") { await page.locator(arg).first().scrollIntoViewIfNeeded(); await page.locator(arg).first().click(); }
      else if (kind === "type") { const [sel, ...rest] = arg.split(":"); await page.locator(sel).first().fill(rest.join(":")); }
      else if (kind === "key") { await page.keyboard.press(arg); }
      else if (kind === "hover") { await page.locator(arg).first().hover(); }
      else if (kind === "eval") { await page.evaluate(`(() => { ${arg} })()`); }
      else if (kind === "scroll") { await page.evaluate(`window.scrollTo(0, ${arg})`); }
      else { await page.waitForTimeout(Math.min(+arg || 300, 4000)); }
      log.push(a);
    } catch (e) { log.push(`${a} -> FAILED ${String(e).split("\n")[0]}`); }
    await page.waitForTimeout(120);
  }
  return log;
}

// In-page audit: accessible names, contrast, landmarks, focus ring, image alts.
const audit = async () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && +cs.opacity > 0.05
      && r.bottom > 0 && r.top < innerHeight * 3 && r.right > 0 && r.left < innerWidth;
  };
  // Chromium serialises colours as rgb()/rgba() and, for color-mix() and wide-gamut
  // colours, as color(srgb r g b / a) with 0..1 components — normalise both to 0..255.
  const parse = (c) => {
    const nums = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return /^color\(/.test(c.trim()) ? nums.map((v) => v * 255) : nums;
  };
  const alpha = (c) => {
    const n = [...c.matchAll(/[\d.]+/g)].map(Number);
    if (/^color\(/.test(c.trim())) return n.length >= 4 ? n[3] : 1;
    return /rgba\(|\}\s*;?/.test(c) && n.length >= 4 ? n[3] : 1;
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const b = getComputedStyle(n).backgroundColor;
      if (!b || b === "transparent") continue;
      if (alpha(b) < 0.35) continue;   // near-transparent overlay
      return parse(b).slice(0, 3);
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const name = (el) => (
    el.getAttribute("aria-label")
    || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(" ")
    || (el.labels && el.labels.length ? [...el.labels].map((l) => l.textContent).join(" ") : "")
    || el.getAttribute("title") || el.getAttribute("alt") || ""
  ).trim();

  const controls = [...document.querySelectorAll("input,select,textarea,[role=textbox],[contenteditable=true]")]
    .filter(vis).filter((el) => el.type !== "hidden" && !el.closest("[aria-hidden=true]"))
    .map((el) => ({ tag: el.tagName.toLowerCase(), name: name(el), ph: el.getAttribute("placeholder") || "" }))
    .filter((c) => !c.name);
  const iconOnly = [...document.querySelectorAll("button,[role=button],a[href]")]
    .filter(vis).filter((el) => !(el.textContent || "").trim() && !name(el) && !el.getAttribute("aria-label"))
    .map((el) => el.tagName.toLowerCase() + ":" + (el.className?.toString?.().slice(0, 30) || ""));
  const imgs = [...document.querySelectorAll("img")].filter(vis)
    .filter((el) => !el.hasAttribute("alt")).map((el) => el.getAttribute("src")?.split("/").pop() || "img");
  const contrast = [];
  const seen = new Set();
  for (const el of [...document.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,td,th,label,button,a,span,small,figcaption,dd,dt,summary,legend")]) {
    const txt = (el.textContent || "").trim();
    if (txt.length < 2 || !vis(el) || el.children.length) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const bold = (+cs.fontWeight >= 700 && size >= 18.66) || (size >= 24);
    const need = bold ? 3 : 4.5;
    const r = ratio(parse(cs.color), bgOf(el));
    const key = txt.slice(0, 24) + cs.color + Math.round(size);
    if (seen.has(key)) continue;
    seen.add(key);
    if (r < need) contrast.push({ text: txt.slice(0, 40), size: Math.round(size), ratio: +r.toFixed(2), need });
  }
  let focusRing = "none";
  try {
    const el = document.querySelector("a[href],button,input,select,textarea,[tabindex]");
    if (el) {
      el.focus();
      const cs = getComputedStyle(el);
      focusRing = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none" && cs.outlineColor !== "transparent")
        ? "outline" : (cs.boxShadow && cs.boxShadow !== "none" ? "shadow" : "none");
    }
  } catch { /* no focusable element */ }
  return {
    h1: document.querySelectorAll("h1").length,
    lang: document.documentElement.lang || "",
    title: document.title || "",
    landmarks: ["header", "main", "footer", "nav", "aside"].filter((t) => document.querySelector(t)).join("+") || "none",
    labelledControlsMissing: controls,
    unnamedButtons: iconOnly,
    imgMissingAlt: imgs,
    lowContrast: contrast.slice(0, 12),
    focusRing,
  };
};

const results = [];
for (const job of jobs) {
  const taskDir = join(designDir, job.task);
  const shotsDir = join(taskDir, "shots");
  await mkdir(shotsDir, { recursive: true });
  for (const shot of job.shots) {
    const page = join(taskDir, shot.page.split("?")[0]);   // the shot page may carry a query
    const label = `${job.task}/${shot.name}`;
    if (!existsSync(page)) { results.push({ label, ok: false, errs: [], why: "page missing" }); continue; }
    const ctx = await ctxFor(shot);
    const p = await ctx.newPage();
    await p.emulateMedia({ reducedMotion: shot.motion === "reduce" ? "reduce" : "no-preference", media: shot.print ? "print" : "screen" });
    if (shot.width && shot.height) await p.setViewportSize({ width: shot.width, height: shot.height });
    const errs = [];
    p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
    p.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
    p.on("requestfailed", (r) => errs.push("requestfailed: " + r.url().replace(origin + "/", "") + " " + (r.failure()?.errorText || "")));
    let rec = { label, ok: true, errs };
    try {
      await p.goto(`${origin}/${job.task}/${shot.page}`, { waitUntil: "load", timeout: 30000 });
      await p.evaluate("document.fonts.ready.then(() => 1)").catch(() => 1);
      await p.waitForTimeout(350);
      rec.actions = await runActions(p, shot.actions || []);
      await p.waitForTimeout(shot.settle ?? 250);
      // scroll-driven reveals must have fired before a full-page shot, and the shot must
      // start at the top: instant jumps, no smooth animation, no mid-page capture
      await p.addStyleTag({ content: "html,body{scroll-behavior:auto!important}" }).catch(() => {});
      // (phone shots rely on the white composite in the encoder for overscroll areas)
      if (shot.full) {
        const h = await p.evaluate("document.documentElement.scrollHeight").catch(() => 0);
        for (const y of [h / 3, (2 * h) / 3, h]) {
          await p.evaluate(`window.scrollTo(0, ${Math.round(y)})`).catch(() => {});
          await p.waitForTimeout(220);
        }
        await p.evaluate("window.scrollTo(0, 0)").catch(() => {});
        await p.waitForTimeout(260);
      }
      const png = join(outDir, `${job.task}__${shot.name}.png`);
      // full-page shots render at CSS scale: a 1440x4000 page at dpr 2 is a 2880x8000 canvas,
      // which is a lot of memory next to Strata
      await p.screenshot({ path: png, fullPage: !!shot.full, scale: shot.full ? "css" : "device", timeout: 30000 });
      rec.audit = await p.evaluate(`(${audit.toString()})()`).catch((e) => ({ auditError: String(e).slice(0, 120) }));
      // re-encode PNG -> JPEG (see encode())
      const b64 = await encode(png);
      const [imgW, imgH] = await encPage.evaluate("window.__px");
      const jpg = join(shotsDir, `${shot.name}.jpg`);
      await writeFile(jpg, Buffer.from(b64, "base64"));
      rec.jpg = `${job.task}/shots/${shot.name}.jpg`;
      rec.bytes = (await readFile(jpg)).length;
      rec.px = `${imgW}x${imgH}`;
      await unlink(png).catch(() => {});
      rec.actions_failed = (rec.actions || []).filter((a) => a.includes("FAILED"));
    } catch (e) {
      rec.ok = false; rec.why = String(e).split("\n")[0].slice(0, 200);
    }
    await p.close().catch(() => {});
    results.push(rec);
    const a = rec.audit || {};
    console.log(
      `${rec.ok ? "ok  " : "FAIL"} ${label.padEnd(42)} ${(rec.bytes ? (rec.bytes / 1024).toFixed(0) + "KB" : "").padStart(8)}`
      + ` errs ${String(rec.errs.length).padStart(2)}`
      + ` ${rec.px || ""}`
      + ` contrast ${(a.lowContrast || []).length}`
      + ` unlabelled ${(a.labelledControlsMissing || []).length + (a.unnamedButtons || []).length}`
      +(rec.why?" | WHY "+rec.why:"")+(rec.errs.length ? " | " + rec.errs[0].slice(0, 90) : ""),
    );
  }
}
await browser.close().catch(() => {});
server.close();

const md = ["# design screenshot run", "",
  `shots: ${results.length} · clean: ${results.filter((r) => r.ok && !r.errs.length).length}`
  + ` · failed: ${results.filter((r) => !r.ok).length} · with console/page/request errors: ${results.filter((r) => r.ok && r.errs.length).length}`, "",
  "| shot | size | console errors | low contrast | unlabelled | focus ring | notes |", "|--|--|--|--|--|--|--|",
  ...results.map((r) => `| ${r.label} | ${r.bytes ? (r.bytes / 1024).toFixed(0) + " KB" : "-"} | ${r.errs.length}`
    + ` | ${(r.audit?.lowContrast || []).length} | ${(r.audit?.labelledControlsMissing || []).length + (r.audit?.unnamedButtons || []).length}`
    + ` | ${r.audit?.focusRing || "-"} | ${(r.ok ? (r.actions_failed || []).join(" ") || "clean" : r.why + " " + r.errs.slice(0, 1)).slice(0, 120)} |`), "",
  ...results.filter((r) => r.errs.length).map((r) => `- ${r.label}\n${r.errs.map((e) => "  - " + e).join("\n")}`),
];
await writeFile(join(reportDir, "latest.json"), JSON.stringify(results, null, 1));
await writeFile(join(reportDir, "latest.md"), md.join("\n") + "\n");
const bad = results.filter((r) => !r.ok || r.errs.length).length;
console.log(`\nwrote tools/work/shoot/latest.md — ${results.length} shots, ${bad} with problems`);
process.exit(0);
