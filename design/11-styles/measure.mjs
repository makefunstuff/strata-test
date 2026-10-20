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

const here = import.meta.dirname;
const content = JSON.parse(await readFile(path.join(here, "content.json"), "utf8"));
const rendered = JSON.parse(await readFile(path.join(here, "rendered.json"), "utf8"));
const audit = JSON.parse(await readFile(path.join(here, "..", "tools", "work", "shoot", "latest.json"), "utf8"));

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

const out = {
  generatedFrom: "content.json + rendered.json (tools/rendered.mjs) + tools/work/shoot/latest.json",
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
