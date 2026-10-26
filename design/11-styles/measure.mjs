#!/usr/bin/env node
/* measure.mjs — the numbers behind 11-styles.

   It reads the one content file, the rendered text of every style page
   (tools/rendered.mjs), the pages' own CSS, and the screenshot harness's audit report,
   and writes stats.js for the gallery. Nothing here is estimated: every number is a
   count over a file that is in this folder.

   node 11-styles/measure.mjs
*/
import path from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

const here = import.meta.dirname;
const content = JSON.parse(await readFile(path.join(here, "content.json"), "utf8"));
const rendered = JSON.parse(await readFile(path.join(here, "rendered.json"), "utf8"));
const shootDir = path.join(here, "..", "tools", "work", "shoot");
/* The audit for THIS task. Prefer the per-task report: latest.* is only the last run,
   so measuring 11-styles after shooting any other task used to null every audit field. */
const report = ["11-styles.json", "latest.json"].map((f) => path.join(shootDir, f)).find((p) => existsSync(p));
const audit = JSON.parse(await readFile(report, "utf8"));

const norm = (s) =>
  String(s)
    .replace(/\u2011/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/* the content contract: every string a style may set, in the order a reader meets them */
const strings = [];
const push = (label, s) => strings.push({ label, s: norm(s) });
push("brand note", content.brandNote);
push("kicker", content.kicker);
push("headline", content.h1);
push("lede", content.lede);
push("cta 1", content.ctaPrimary);
push("cta 2", content.ctaSecondary);
content.features.forEach((f, i) => {
  push(`feature ${i + 1} title`, f.t);
  push(`feature ${i + 1} body`, f.b);
});
content.stats.forEach((s, i) => {
  push(`stat ${i + 1} unit`, s.u);
  push(`stat ${i + 1} note`, s.n);
});
push("quote", content.quote.q);
push("quote by", content.quote.by);
push("quote role", content.quote.role);
content.plans.forEach((p, i) => {
  push(`plan ${i + 1} name`, p.t);
  push(`plan ${i + 1} price`, p.p);
  p.l.forEach((l, j) => push(`plan ${i + 1} line ${j + 1}`, l));
});
push("footer made", content.foot.made);
push("input label", content.foot.inputLabel);
push("input hint", content.foot.inputHint);
push("input button", content.foot.inputButton);
content.foot.lines.forEach((l, i) => push(`footer link ${i + 1}`, l));
push("legal", content.foot.legal);

const contentWords = new Set(
  norm(JSON.stringify(content))
    .toLowerCase()
    .split(/[^a-z0-9'£]+/)
    .filter(Boolean)
);
const STOP = new Set(
  ("a an the of to in on at by for and or is are be it its this that with without from as off up down your you our we i s t " +
    "one two three four five six seven eight nine ten zero · — – - / \\ £ 0 1 2 3 4 5 6 7 8 9").split(/\s+/)
);

const bytes = async (p) => (await stat(p)).size;
const STYLES = ["swiss", "brutalism", "editorial", "glass", "neumorph", "pixel", "japanese", "cyber", "luxury"];
const rows = [];

for (let i = 0; i < STYLES.length; i += 1) {
  const key = STYLES[i];
  const n = String(i + 1).padStart(2, "0");
  const htmlFile = `s${n}-${key}.html`;
  const cssFile = `s${n}-${key}.css`;
  const html = await readFile(path.join(here, htmlFile), "utf8");
  const css = await readFile(path.join(here, cssFile), "utf8");
  const r = rendered[htmlFile];
  if (!r) throw new Error(`no rendered text for ${htmlFile} — run: node tools/rendered.mjs 11-styles`);
  const text = norm(r.text);

  // case-insensitive on purpose: five of the nine styles set their type in capitals with
  // text-transform, and CSS case-casing is not a change of words
  const missing = strings.filter((x) => !text.toLowerCase().includes(x.s.toLowerCase()));
  const pageWords = text.split(/[^A-Za-z'£-]+/).filter(Boolean);
  const extras = new Map();
  for (const w of pageWords) {
    const k = w.toLowerCase();
    if (k.length < 2 || STOP.has(k) || contentWords.has(k)) continue;
    extras.set(k, (extras.get(k) || 0) + 1);
  }
  const extraList = [...extras.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);

  const fonts = [...new Set([...html.matchAll(/@fontsource(-variable)?\/([a-z0-9-]+)@([0-9.]+)/g)]
    .map((m) => `${m[2]}@${m[3]}${m[1] ? " variable" : ""}`))];
  const rootDecls = (css.match(/:root\s*{([\s\S]*?)}/) || [, ""])[1];
  const colours = [...new Set([...rootDecls.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0].toLowerCase()))];

  const shots = audit.filter((a) => a.label.includes(`11-styles/${key}-`));
  const pxOf = (name) => {
    const s = shots.find((x) => x.label.endsWith(`/${name}`));
    const m = /x(\d+)$/.exec(s?.px || "");
    return m ? Number(m[1]) : null;
  };
  rows.push({
    key,
    file: htmlFile,
    cssFile,
    title: r.title,
    rules: (css.match(/^\/\*([\s\S]*?)\*\//) || [, ""])[1].trim().replace(/\n\s{2,3}/g, " "),
    bytesHtml: await bytes(path.join(here, htmlFile)),
    bytesCss: await bytes(path.join(here, cssFile)),
    fonts,
    h1font: r.h1font.split(",")[0].replace(/["']/g, ""),
    h1weight: r.h1weight,
    h1size: r.h1size,
    h1tracking: r.h1tracking,
    bodyfont: r.bodyfont.split(",")[0].replace(/["']/g, ""),
    bodysize: r.bodysize,
    bodyleading: r.bodyleading,
    smallestText: r.smallestText,
    /* did the pinned type arrive? the browser's own FontFace set and the woff files it
       actually fetched — the contrast audit never looked at fonts, and in the first pass
       of this task the editorial body rendered in the browser's serif with the pinned
       Source Serif 4 faces registered and never fetched. */
    render: {
      woff: (r.fontFiles || []).length,
      fontFiles: r.fontFiles || [],
      families: r.fontFamilies || [],
      bodyStack: r.bodyfont,
      h1Stack: r.h1font,
    },
    wordsRendered: r.words,
    parity: { total: strings.length, found: strings.length - missing.length, missing: missing.map((m) => m.label) },
    sentences: { total: strings.length, found: strings.length - missing.length },
    extraWords: { count: extraList.length, list: extraList.slice(0, 14) },
    dom: { headings: r.headings, links: r.links, forms: r.forms, inputs: r.inputs, svg: r.svg, img: r.imgs, landmarks: r.landmarks, animations: r.animations, maxRadius: r.maxRadius, inks: r.inks, bg: r.bodyBg, docWidth: r.docWidth, consoleErrors: (r.consoleErrors || []).length },
    css: {
      rules: (css.match(/\n[a-z.#:[*>]/g) || []).length,
      keyframes: (css.match(/@keyframes/g) || []).length,
      reducedMotion: /prefers-reduced-motion/.test(css),
      coloursDeclared: colours.length,
      shadows: (css.match(/box-shadow:/g) || []).length,
      borders: (css.match(/border(-\w+)?:\s*\d/g) || []).length,
      gridCols: (css.match(/grid-template-columns:/g) || []).length,
      threeCol: /grid-template-columns:[^;]*repeat\(3/.test(css),
      heroSplit: /grid-template-columns:[^;]*minmax\([^;]*minmax\(/.test(css),
      features: ["clip-path", "backdrop-filter", "columns:", "writing-mode", "font-variant-caps", "text-transform", "image-rendering", "shape-rendering", "text-shadow", "hyphens"].filter((f) => css.includes(f)),
      queries: { phone: /@media \(max-width/.test(css), motion: /prefers-reduced-motion/.test(css) },
    },
    heights: { full: pxOf(`${key}-full`), phone: pxOf(`${key}-phone`), hero: 900 },
    audit: {
      shots: shots.length,
      consoleErrors: shots.reduce((n, s) => n + (s.errs?.length || 0), 0),
      contrast: shots.length ? Math.max(...shots.map((s) => s.audit?.lowContrast?.length ?? 0)) : null,
      unlabelled: shots.length ? Math.max(...shots.map((s) => (s.audit?.unnamedButtons || []).length)) : null,
      landmarks: shots[0]?.audit?.landmarks ?? null,
      lang: shots[0]?.audit?.lang ?? null,
    },
  });
}

/* ── the skeleton, measured on the rendered pages ────────────────────────────
   The CSS patterns above (threeCol, heroSplit) read the stylesheet's text, which is
   not the same as what the page lays out: a grid-template-columns declaration is not a
   rendered column. The ratings' weakest axis — "the structure of the argument is not
   restyled, only its skin" — is a claim about layout, so it is measured in the
   browser: per section, how many tracks it resolves to, how many boxes sit on how
   many distinct x positions, the widest body measure in ch, the biggest type, the
   largest radius, whether links keep their underline, and the largest unit the
   section tops fall on (a page on a module grid has one). Two pages with the same
   signature have the same skeleton whatever their CSS says. */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { statSync } from "node:fs";
const { chromium } = createRequire(path.join(here, "..", "tools", "noop.cjs"))("playwright-core");
const TYPES2 = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
const srv = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  const file = path.join(here, rel === "" ? "index.html" : rel);
  try {
    if (!statSync(file).isFile()) throw 0;
    res.setHeader("content-type", TYPES2[path.extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end("nope"); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? path.join(here, "..", "tools", "chromium-capped.sh"),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const PROBE_FILE = path.join(here, "skeleton-probe.js");
const sigs = {};
for (let i = 0; i < STYLES.length; i += 1) {
  const key = STYLES[i];
  const pg = await browser.newPage();
  await pg.setViewportSize({ width: 1440, height: 900 });
  await pg.goto(`${origin}/s${String(i + 1).padStart(2, "0")}-${key}.html`, { waitUntil: "load" });
  await pg.waitForTimeout(900);
  await pg.addScriptTag({ path: PROBE_FILE });
  sigs[key] = await pg.evaluate(() => window.__ternmarkProbe());
  await pg.close();
}
/* gradient-clipped type: the audit reports "no colour to measure" for a transparent
   foreground, which is true of the CSS and false of the screen. Screenshot the element,
   decode it in the browser from the bytes, and measure what was painted. */
const gradientProbe = async () => {
  const out = [];
  for (let i = 0; i < STYLES.length; i += 1) {
    const key = STYLES[i];
    const pg = await browser.newPage();
    await pg.setViewportSize({ width: 1440, height: 900 });
    await pg.goto(`${origin}/s${String(i + 1).padStart(2, "0")}-${key}.html`, { waitUntil: "load" });
    await pg.waitForTimeout(700);
    const targets = await pg.evaluate(() => [...document.querySelectorAll("main *")]
      .filter((el) => el.children.length === 0 && el.textContent.trim().length > 4 &&
        (/alpha:\s*0\b|^rgba\(0,\s*0,\s*0,\s*0\)/.test(getComputedStyle(el).color)) &&
        /text/.test((getComputedStyle(el).backgroundClip || "") + (getComputedStyle(el).webkitBackgroundClip || "")))
      .map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim().slice(0, 24), x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; }));
    for (const t of targets) {
      if (t.w < 8 || t.h < 8) continue;
      const shot = (await pg.screenshot({ clip: { x: Math.max(0, t.x), y: Math.max(0, Math.min(t.y - 4, 800)), width: Math.min(t.w, 1200), height: Math.min(t.h + 8, 200) } })).toString("base64");
      await pg.addScriptTag({ path: PROBE_FILE });
      const px = await pg.evaluate((b64) => window.__ternmarkPixels(b64), shot).catch(() => null);
      out.push({ key, text: t.text, px });
    }
    await pg.close();
  }
  return out;
};
const painted = await gradientProbe();
await browser.close();
srv.close();

/* signature similarity: two pages match on a field when the field is equal */
const SIG_KEYS = ["module", "topRhythm", "radiusMax", "listFeatures", "featureTag", "figureMode", "maxMeasure"];
const secShape = (s2) => s2.sections.map((x) => `${x.cols}/${x.tracks}`).join(",");
const secHosts = (s2) => s2.sections.map((x) => `${x.host}:${x.cols}x${x.tracks}`).join(" · ");
const sim = {};
for (const a of STYLES) for (const b of STYLES) {
  if (a === b) continue;
  let m = 0; const total = SIG_KEYS.length + 2;
  for (const k of SIG_KEYS) if (JSON.stringify(sigs[a][k]) === JSON.stringify(sigs[b][k])) m += 1;
  if (secShape(sigs[a]) === secShape(sigs[b])) m += 1;
  if (JSON.stringify(sigs[a].scale) === JSON.stringify(sigs[b].scale)) m += 1;
  sim[`${a}>${b}`] = m / total;
}
const twin = STYLES.filter((a) => STYLES.some((b) => b !== a && sim[`${a}>${b}`] >= 0.99));
const meanSim = (Object.values(sim).reduce((x, y) => x + y, 0) / Object.keys(sim).length);

const out = {
  generatedFrom: `content.json + rendered.json (tools/rendered.mjs) + tools/work/shoot/${path.basename(report)} + the rendered pages at 1440 px`,
  skeleton: {
    note: "signatures measured in the browser: sections' rendered tracks and column counts, the module the section tops fall on, the widest body measure, the type scale, radius, link underlines, and how features are structured",
    twinStyles: twin,
    meanSimilarity: +meanSim.toFixed(3),
    signatures: Object.fromEntries(STYLES.map((k) => [k, {
      module: sigs[k].module, topRhythm: sigs[k].topRhythm, spacingValues: sigs[k].spacingValues, radiusMax: sigs[k].radiusMax, maxMeasure: sigs[k].maxMeasure,
      listFeatures: sigs[k].listFeatures, featureTag: sigs[k].featureTag, figureSize: sigs[k].figureSize,
      figureMode: sigs[k].figureMode, navUnderlines: sigs[k].navUnderlines,
      textLinkUnderlines: sigs[k].textLinkUnderlines, textLinkCount: sigs[k].textLinkCount, scale: sigs[k].scale,
      shape: secShape(sigs[k]), hosts: secHosts(sigs[k]),
    }])),
    painted,
  },
  contentStrings: strings.length,
  contentStrings: strings.length,
  contentWords: contentWords.size,
  content,
  styles: STYLES.length,
  rows,
};
await writeFile(path.join(here, "stats.js"), `/* generated by measure.mjs — do not edit by hand */\nwindow.TERNMARK_STATS = ${JSON.stringify(out, null, 1)};\n`);
console.log(`wrote 11-styles/stats.js`);
for (const r of rows)
  console.log(
    `${r.key.padEnd(10)} parity ${r.parity.found}/${r.parity.total}  extras ${String(r.extraWords.count).padStart(3)}  ` +
      `css ${(r.bytesCss / 1024).toFixed(1)}K  inks ${r.dom.inks}  rmax ${r.dom.maxRadius}  anim ${r.dom.animations}  ` +
      `console ${r.audit.consoleErrors}  contrast ${r.audit.contrast}`
  );
