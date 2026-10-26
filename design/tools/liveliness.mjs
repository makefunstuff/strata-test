// Measure whether a page is *visually alive* — the axis the gallery cannot self-grade.
//
//   node tools/liveliness.mjs                    # every hero/full shot in the manifest
//   node tools/liveliness.mjs 02-dashboard       # one task
//   node tools/liveliness.mjs 01-landing --shot hero,full
//   node tools/liveliness.mjs --json tools/work/liveliness/latest.json
//
// Why this exists: design/README.md's own Limits paragraph says it plainly — "the ratings are
// the model grading its own taste, and the axes where self-grading is easiest (visual quality:
// eleven tasks spread over one point) are the least useful numbers in this folder". Every task
// scored itself 4/5 on visual. Eleven 4/5s is not a measurement, it is a prior. Meanwhile the
// verdict on taste in the same file — "the taste is one taste" — was a human eyeballing the
// folder and calling it boring, which is a claim that can be put in numbers.
//
// What is measured, on the actual rendered pixels (not the CSS, not the intent):
//
//   colourfulness  Hasler & Süsstrunk's perceptual metric: mean + std of the colour-opponent
//                  channels (rg = R−G, yb = 0.5(R+G)−B) across the frame. Achromatic = 0.
//                  Reference points on the web: a text document ~1–3, a restrained editorial
//                  page ~4–8, a colourful marketing page ~15–25, a poster > 30.
//   hues           how many of 12 hue bins carry at least 1% of the pixels with real chroma —
//                  one broad-peak palette and a rich one separate cleanly here.
//   ink            share of pixels whose colour differs from the dominant background by more
//                  than a just-noticeable amount: how much of the frame is doing work.
//   tonal entropy  Shannon entropy of the 16-bin luminance histogram: flat scans are low,
//                  frames with real lights and darks are high.
//   depth          fraction of pixels inside rounded, bordered or shadowed boxes — the
//                  card/panel layering a flat layout does without.
//
// `lively` is a 0–100 index over those, and it is a *ranking device*, not a verdict: it can
// tell you that eleven pages are the same page, and that a change made a frame less monotone.
// It cannot tell you a page is good, and it deliberately does not try to. Accessibility,
// contrast and the tasks' own measured contracts still decide whether a change ships — a
// liveliness gain bought by dropping contrast below AA is a regression, not a win, and
// tools/shoot.mjs is what catches that.
//
// Output: a sorted table on stdout, the raw numbers as JSON (committed by default, so the
// number travels with the branch), and a one-line mean for the folder.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const toolsDir = dirname(fileURLToPath(import.meta.url));
// LIVELINESS_ROOT lets the same measurement be run against a different checkout (a git worktree
// at HEAD), which is the only way to state a before/after pair from one instrument.
const designDir = resolve(process.env.LIVELINESS_ROOT ?? resolve(toolsDir, ".."));

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i < 0 ? def : argv[i + 1]; };
const want = argv.filter((a, i) => !a.startsWith("-") && !argv[i - 1]?.startsWith("--"));
const shotFilter = opt("shot", "").split(",").filter(Boolean);
const outPath = resolve(opt("json", join(toolsDir, "work", "liveliness", "latest.json")));
const WIDTH = +opt("width", 1440), HEIGHT = +opt("height", 900), DPR = +opt("dpr", 2);
const SAMPLE_STEP = +opt("step", 3);          // pixels skipped when reading back (perf on SwiftShader)
const MAX_MS = +(process.env.LIVELY_MAX_MS ?? 240000);

/* --live [url]: assert the PUBLISHED frame page has the band's data.
   The Pages workflow publishes design/ with `rsync --exclude tools/`; the first deploy of the band
   put its data under tools/, so every visitor got the "no measurement on file" fallback while every
   local check stayed green. A measurement that is only ever checked locally is not deployed. */
if (argv.includes("--live")) {
  const url = (argv[argv.indexOf("--live") + 1] ?? "").startsWith("http")
    ? argv[argv.indexOf("--live") + 1]
    : "https://makefunstuff.github.io/strata-test/design/";
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
    headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu"] });
  const pg = await b.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message.slice(0, 80)));
  pg.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 80)));
  const res = await pg.goto(url, { waitUntil: "load" });
  await pg.waitForTimeout(1500);
  const seen = await pg.evaluate(() => ({
    data: !!window.LIVELINESS?.rows?.length,
    rows: window.LIVELINESS?.rows?.length ?? 0,
    run: String(window.LIVELINESS?.generated ?? "").slice(0, 10),
    tiles: document.querySelectorAll("#pulse .tile").length,
    fallback: /No measurement on file/.test(document.getElementById("pulse-band")?.textContent ?? ""),
    rail: document.querySelectorAll("#pulse .rail span").length,
  }));
  const ok = res?.status() === 200 && seen.data && seen.tiles >= 11 && !seen.fallback;
  console.log(`${url}
  http ${res?.status()} · data ${seen.data} (${seen.rows} rows, run ${seen.run}) · tiles ${seen.tiles} · rail ${seen.rail} · fallback ${seen.fallback}${errs.length ? ` · errors: ${errs.join("; ")}` : ""}`);
  console.log(ok ? "LIVE OK: the published band is showing measured data"
    : "LIVE FAIL: the published page has no band data — check that the data file is inside the published set (Pages excludes tools/)");
  await b.close(); process.exit(ok ? 0 : 1);   // the local static server is not started in this mode
}

const manifest = JSON.parse(await readFile(join(toolsDir, "manifest.json"), "utf8"));
const jobs = manifest
  .filter((t) => !want.length || want.includes(t.task))
  .map((t) => ({ ...t, shots: t.shots.filter((s) => {
    const wide = s.width === undefined || s.width >= 900;   // desktop frames; phone frames measure phones
    const named = !shotFilter.length || shotFilter.includes(s.name) || shotFilter.includes(`${t.task}--${s.name}`);
    return wide && named;
  }) }));
if (!jobs.length) { console.error(`no matching shots for: ${want.join(",") || "*"}`); process.exit(1); }

// same local static server rule as shoot.mjs: ES modules and fetch() are CORS-blocked on file://
const { createServer } = await import("node:http");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  const { readFile: rd, stat } = await import("node:fs/promises");
  const { join: j } = await import("node:path");
  try {
    let f = j(designDir, rel);
    if ((await stat(f)).isDirectory()) f = j(f, "index.html");
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(await rd(f));
  } catch { res.writeHead(404).end("404 " + rel); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb", "--hide-scrollbars",
         "--js-flags=--max-old-space-size=512"],
});
const stop = async (code, note) => { if (note) console.error(note); await browser.close().catch(() => {}); server.close(); await new Promise((r) => setTimeout(r, 50)); process.exit(code); };
setTimeout(() => void stop(3, `liveliness timed out after ${MAX_MS}ms (LIVELY_MAX_MS)`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(4, `caught ${sig}`));

// One context only: a second context kills this Chromium build under --single-process.
let base = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR });

const measure = async (page) => page.evaluate((step) => {
  // --- pixels -------------------------------------------------------------
  // Screenshot-free: rasterise the document into a canvas via the same machinery the
  // browser uses for painting is not available to script, so we sample the live page's
  // own paint surface through html2canvas-free means — element background colours,
  // borders and text are not enough (gradients, canvas, SVG). Instead: draw every painted
  // box's own computed background sample is also not enough. So we read the real frame:
  // Chromium gives script no framebuffer, therefore this tool screenshots through CDP from
  // the caller and hands the decoded pixels to this function as window.__px (set below).
  const { data, width, height } = window.__px;
  // --- pixels: the frame that was actually painted, decoded in-page from a real screenshot
  // (this box has no image toolchain, so the decode uses the browser itself — same trick as
  // shoot.mjs's PNG->JPEG helper). Element styles alone would lie: gradients, canvas, SVG and
  // images are all paint that getComputedStyle never shows.
  let n = 0, mRG = 0, mYB = 0;
  const hue = new Array(12).fill(0);
  const lum16 = new Array(16).fill(0);
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    mRG += r - g; mYB += 0.5 * (r + g) - b; n++;
  }
  const meanRG = mRG / n, meanYB = mYB / n;
  let sRG = 0, sYB = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const rg = r - g, yb = 0.5 * (r + g) - b;
    sRG += (rg - meanRG) ** 2; sYB += (yb - meanYB) ** 2;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const chroma = mx - mn;
    if (chroma > 18 && mx > 0) {
      let h = 0;
      if (mx === r) h = 60 * (((g - b) / chroma) % 6);
      else if (mx === g) h = 60 * ((b - r) / chroma + 2);
      else h = 60 * ((r - g) / chroma + 4);
      if (h < 0) h += 360;
      hue[Math.min(11, Math.floor(h / 30))]++;
    }
    lum16[Math.min(15, Math.floor((0.2126 * r + 0.7152 * g + 0.0722 * b) / 16))]++;
  }
  // Hasler & Süsstrunk, the real two-term form: chromatic spread plus chromatic bias.
  const varRG = sRG / n, varYB = sYB / n;
  const colourfulness = Math.sqrt(varRG + varYB) + 0.3 * Math.sqrt(meanRG * meanRG + meanYB * meanYB);
  const hues = hue.filter((c) => c / n > 0.01).length;
  // the dominant hue bin's centre, so a page can be drawn in the colour it actually has —
  // and null when NO bin cleared the chroma threshold, because a dominant hue read off an empty
  // histogram is a fabricated colour (this happened: three neutral pages claimed 165°/225°).
  const dominant_hue = hues ? hue.indexOf(Math.max(...hue)) * 30 + 15 : null;
  let entropy = 0;
  for (const c of lum16) { const p = c / n; if (p > 0) entropy -= p * Math.log2(p); }
  // dominant background = the most common quantised colour
  const q = new Map();
  for (let i = 0; i < data.length; i += 4 * step) {
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    q.set(k, (q.get(k) ?? 0) + 1);
  }
  let bg = 0, bgCount = 0;
  for (const [k, c] of q) if (c > bgCount) { bgCount = c; bg = k; }
  const bgR = (bg >> 8) << 4, bgG = ((bg >> 4) & 15) << 4, bgB = (bg & 15) << 4;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    if (Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB) > 48) ink++;
  }

  // --- structure (CSS, second-order evidence of layering) -----------------
  let depthPx = 0, area = 0, radii = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.top > innerHeight || r.bottom < 0) continue;
    const cs = getComputedStyle(el);
    const vis = cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05;
    if (!vis) continue;
    const boxed = (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== "none" && cs.borderTopColor !== "rgba(0, 0, 0, 0)") ||
      (cs.boxShadow && cs.boxShadow !== "none") ||
      (cs.backgroundImage && cs.backgroundImage !== "none") ||
      (parseFloat(cs.borderTopLeftRadius) >= 6);
    if (boxed) depthPx += Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight);
    const rad = parseFloat(cs.borderTopLeftRadius);
    if (rad >= 2) radii.add(Math.round(rad));
    area += Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight);
  }
  const fonts = new Set();
  for (const el of document.querySelectorAll("h1,h2,h3,p,body")) fonts.add(getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim());
  return {
    colourfulness: +colourfulness.toFixed(1),
    hues, dominant_hue,
    ink: +(ink / n).toFixed(3),
    tonal_entropy: +(entropy / 4).toFixed(2),      // /4 so a fully spread histogram is 1.00
    depth: +(Math.min(1, depthPx / Math.max(1, area))).toFixed(2),
    radii: radii.size,
    families: fonts.size,
    bg: `rgb(${bgR},${bgG},${bgB})`,
    pixels: n,
  };
}, SAMPLE_STEP);

/** A transparent 0–100 index over the pixel metrics. Weights are stated, not fitted:
 *  colourfulness carries most of it because that is the quantity the human complaint is about. */
const index = (m) => Math.round(100 * Math.min(1,
  0.45 * Math.min(1, m.colourfulness / 22) +
  0.20 * Math.min(1, m.hues / 6) +
  0.15 * Math.min(1, m.ink / 0.55) +
  0.12 * Math.min(1, m.tonal_entropy / 0.85) +
  0.08 * Math.min(1, m.depth / 0.6)));

// ONE page for the whole run. shoot.mjs already learned that this Chromium build dies when a
// second *context* is opened under --single-process; it turns out a ~130th page target kills it
// too ("Failed to open a new tab"), so pages are recycled rather than multiplied, and the
// decoded frame is released after every measurement instead of accumulating in the page's heap.
let page = await base.newPage();
const fresh = async () => { await page.close().catch(() => {}); page = await base.newPage(); };
/* Under memory pressure this software-raster Chromium decays: shots late in a long run come back as
   a uniform field of the page's own background colour, with no error, no console output and no
   undrawn canvas — and the old validator scored that as a real (very dark, very dull) page. A whole
   context restart is heavier than a page, and it is the only thing that recovers a decaying
   renderer, so it is used for the retry. */
const freshContext = async () => {
  await page.close().catch(() => {});
  await base.close().catch(() => {});
  base = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR });
  page = await base.newPage();
};

// --per-task keeps one representative frame per task: the folder-level number should be one
// number per brief, not one per screenshot (11 briefs, 190 wide frames otherwise).
const perTask = argv.includes("--per-task");
const PREFER = ["hero", "full", "masthead", "light", "board", "overview", "claim", "step1", "after-full", "swiss-hero"];
// the gallery frame is measured whole: a viewport-only sample would score the page above its own
// measured band and miss the one section that exists to answer this question
const OVERRIDE = { ".": "full" };
if (perTask) for (const t of jobs) {
  const pick = (OVERRIDE[t.task] ? t.shots.find((s) => s.name === OVERRIDE[t.task]) : undefined) ??
    PREFER.map((n) => t.shots.find((s) => s.name === n)).find(Boolean) ?? t.shots[0];
  t.shots = pick ? [pick] : [];
}

const rows = [];
for (const t of jobs) {
  for (const s of t.shots) {
    const url = `${origin}/${t.task === "." ? "" : t.task + "/"}/${s.page}`;
    try {
      await page.setViewportSize({ width: s.width ?? WIDTH, height: s.height ?? HEIGHT });
      await page.goto(url, { waitUntil: "load" });
      await page.waitForTimeout(s.settle ?? 900);
      if (s.actions) for (const a of s.actions) {
        if (a.startsWith("scroll:")) await page.evaluate(`window.scrollTo(0,${a.slice(7)})`).catch(() => {});
        if (a.startsWith("reveal:")) { const el = await page.$(a.slice(7)); if (el) await el.evaluate((x) => x.scrollIntoView({ block: "start" })).catch(() => {}); }
        if (a.startsWith("eval:")) await page.evaluate(a.slice(5)).catch(() => {});
        if (a.startsWith("click:")) { const el = await page.$(a.slice(6)); if (el) await el.click().catch(() => {}); }
      }
      // Materialise lazy content before measuring. The gallery's thumbnails are loading="lazy",
      // so a whole-page frame that never scrolled measures a *shorter, emptier* document than one
      // that did (10140 px vs 10503 px here) — the number would depend on the harness's own scroll
      // history, which is the kind of measurement this tool exists to replace.
      if (s.full) {
        await page.evaluate(async () => {
          const h = document.documentElement.scrollHeight;
          for (let y = 0; y < h; y += Math.round(innerHeight * 0.8)) {
            window.scrollTo(0, y);
            await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
          }
          window.scrollTo(0, 0);
          await Promise.all([...document.images].filter((i) => !i.complete).map((i) =>
            new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
        });
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(250);
      // A frame is only evidence if it was actually painted. Under memory pressure this
      // software-raster Chromium has been observed to hand back an all-black screenshot with no
      // error at all — and the tool scored that page as the liveliest in the folder (73/100),
      // because a black field is indistinguishable from a dark page to a colourfulness metric.
      // So the decoded frame is validated, and a blank one is a FAILED measurement, retried once.
      const grab = async () => {
        // An `element` shot is the node's own box: a card's numbers should not depend on where a
        // fixed-height window happens to land on a page whose layout changed. That is the frame
        // type the per-card rows of a study page need, and it is the reason the manifest has one.
        const png = s.element
          ? await (await page.waitForSelector(s.element, { timeout: 15000 })).screenshot({ timeout: 30000 })
          : await page.screenshot({ type: "png", fullPage: !!s.full,
              scale: s.full ? "css" : "device", timeout: 30000 });
        if (png.length < 2048) throw new Error(`blank screenshot (${png.length} bytes)`);
        if (process.env.LIVELINESS_DUMP) {
          const { writeFile: wF } = await import("node:fs/promises");
          await wF(`${process.env.LIVELINESS_DUMP}.${t.task}.${s.name}.png`, png);
        }
        const b64 = png.toString("base64");
        const check = await page.evaluate(async (src) => {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("decode failed")); img.src = src; });
          const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const x = c.getContext("2d", { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height);
          let undrawn = 0, lit = 0, n = 0;
          const hues = new Set();
          for (let i = 0; i < d.data.length; i += 4 * 7) {
            n++; if (d.data[i + 3] === 0) undrawn++; if (d.data[i] + d.data[i + 1] + d.data[i + 2] > 24) lit++;
            hues.add(((d.data[i] >> 3) << 10) | ((d.data[i + 1] >> 3) << 5) | (d.data[i + 2] >> 3));
          }
          if (undrawn / n > 0.5) throw new Error(`undrawn canvas (${Math.round(100 * undrawn / n)}% alpha 0) — raster produced nothing`);
          if (lit / n < 0.002) throw new Error(`all-black frame (${(100 * lit / n).toFixed(2)}% lit pixels)`);
          // A frame with almost no distinct colours was not painted: any page with type has
          // hundreds of quantised colours from antialiasing alone. 09-motion's run decayed to
          // frames of one #101010, which passed every previous check and scored 6/100.
          if (hues.size < 24) throw new Error(`flat frame (${hues.size} distinct colours) — nothing was painted`);
          window.__px = d;
          return { w: c.width, h: c.height, bytes: src.length >> 10, colours: hues.size,
                   lit: +(lit / n).toFixed(3), undrawn: +(undrawn / n).toFixed(3) };
        }, "data:image/png;base64," + b64);
        return check;
      };
      let frame;
      try { frame = await grab(); }
      catch (e) {
        console.log(`${t.task.padEnd(14)} ${(s.name ?? "").padEnd(10)} blank frame (${e.message.slice(0, 60)}), retrying once`);
        await fresh().catch(() => {});
        await page.setViewportSize({ width: s.width ?? WIDTH, height: s.height ?? HEIGHT });
        await page.goto(url, { waitUntil: "load" });
        await page.waitForTimeout(s.settle ?? 900);
        frame = await grab();
      }
      const m = await measure(page);
      await page.evaluate("window.__px = null").catch(() => {});   // release the decoded frame
      rows.push({ task: t.task, shot: s.name, width: s.width ?? WIDTH,
        frame: `${frame.w}x${frame.h}`, frame_lit: frame.lit, ...m, lively: index(m) });
      console.log(`${t.task.padEnd(14)} ${(s.name ?? "").padEnd(10)} lively ${String(index(m)).padStart(3)}  colour ${String(m.colourfulness).padStart(5)}  hues ${m.hues}  ink ${String(m.ink).padStart(5)}  tonal ${m.tonal_entropy}  depth ${m.depth}  bg ${m.bg}`);
    } catch (e) {
      console.log(`${t.task.padEnd(14)} ${(s.name ?? "").padEnd(10)} FAILED ${e.message.slice(0, 90)}`);
      // a dead target takes every later shot with it: rebuild the page rather than cascade
      // a dead target takes every later shot with it: rebuild the page, and if the renderer is
      // decaying (flat frames, closed targets) rebuild the whole context — the heavier restart is
      // reserved for that, because under memory pressure closing a context can close the run
      if (/Failed to open a new tab|Target (page|closed)|crashed|flat frame|has been closed/i.test(e.message)) await freshContext().catch(() => {});
    }
  }
}
await mkdir(dirname(outPath), { recursive: true });
const report = { generated: new Date().toISOString(), width: WIDTH, height: HEIGHT, rows };
await writeFile(outPath, JSON.stringify(report, null, 2));

// The gallery page is static (no server code, and file:// must keep working for the pages that
// do), so it cannot fetch this JSON: the run also emits it as a JS literal the frame reads
// synchronously. The page says where the numbers came from and prints the run's date, so a stale
// band is visible as stale rather than passing itself for truth.
// The gallery frame reads liveliness-data.js, so a *filtered* run (one task, one shot)
// must not overwrite it: the last such run replaced the folder's evidence with a single row and
// the page's own band correctly fell back to "no measurement on file". Writing the frame's data
// is an explicit act, and only a whole-folder run qualifies.
const allTasks = manifest.map((t) => t.task);
const wholeFolder = !want.length && rows.length >= allTasks.length;
if (wholeFolder) {
  // published beside gallery.js, NOT under tools/: the Pages workflow publishes design/ with
  // `rsync --exclude tools/`, so a data file under tools/ 404s live and the frame's band shows
  // "no measurement on file" to every visitor — verified: the first deploy did exactly that.
  const jsPath = join(designDir, "liveliness-data.js");
  await writeFile(jsPath, "// generated by tools/liveliness.mjs — do not hand-edit\n" +
    `// node tools/liveliness.mjs --per-task   (run ${report.generated})\n` +
    "window.LIVELINESS = " + JSON.stringify(report) + ";\n");
  console.log(`wrote ${jsPath}`);
} else {
  console.log(`filtered run: NOT touching liveliness-data.js (only a whole-folder run writes it)`);
}
const mean = (k) => (rows.reduce((a, r) => a + r[k], 0) / (rows.length || 1)).toFixed(1);
console.log(`\n${rows.length} shots · mean lively ${mean("lively")} · mean colourfulness ${mean("colourfulness")} · mean ink ${mean("ink")} · mean hues ${mean("hues")}`);
console.log(`wrote ${outPath}`);
await stop(0);
