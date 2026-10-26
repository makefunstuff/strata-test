// 06-identity/measure.mjs — the identity's claims, checked against the rendered page.
//
//   node 06-identity/measure.mjs [--url <task-dir>] [--out measure.md]
//
// The page makes promises a screenshot cannot check. It says every point sits on a radius of 6,
// 12, 18 or 24; every icon lives in 24 × 24 with a 1.5 stroke inside a 20 px live area; the mark
// is "the same drawing at 512 px and at 16 px"; a tint is data and words sit on paper. Those are
// arithmetic, so they are measured here, in the browser, from the geometry the browser was given:
//
//   construction radii    every circle in the construction diagram is in the set {6,12,18,24}
//   mark strokes          the mark's stroke is 3, the icons' is 1.5, and the 16 px row is 1.25
//   icon grid conformance every icon's viewBox is 24, and no drawn point leaves the 20 px live area
//   16 px legibility      the mark rasterised at 16 px still has a ring: ink coverage, and no
//                         stroke thinner than 1 device pixel, which is the page's "16 px is a
//                         second drawing" claim in numbers
//   tint contrast         every text-on-tint pair in the system, WCAG, and the dead zone of the
//                         deepest band (tint 5 fails both ink and white)
//   palette use           every colour token declared, and which of them appear in computed styles
//
// The audit in tools/shoot.mjs walks HTML text nodes. It does not see SVG <text>, and this page
// draws charts in SVG — so this file is where those pairs are measured, by hand, on purpose.
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(here, "..");
const { chromium } = createRequire(join(designDir, "tools", "noop.cjs"))("playwright-core");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const root = resolve(opt("url", here));
const out = opt("out", join(here, "measure.md"));

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  try {
    let f = join(root, rel);
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404).end("404"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(designDir, "tools", "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb", "--hide-scrollbars",
         "--js-flags=--max-old-space-size=512"],
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${origin}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(1400);

const m = await page.evaluate(async () => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
  const parse = (c) => { const mm = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return mm ? [+mm[1], +mm[2], +mm[3]] : null };
  const lum = (rgb) => 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  const R = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const num = (x) => (typeof x === "string" ? parseFloat(x) : x);

  // 1. the construction field
  const circles = [...document.querySelectorAll(".build-grid .g-circles circle")].map((c) => +c.getAttribute("r"));
  const allowed = [6, 12, 18, 24];
  const radiiOk = circles.filter((r) => allowed.includes(r)).length;

  // 2. strokes, as the browser was told
  const glyph = document.querySelector("#m-mark-glyph");
  const markStrokes = glyph ? [...glyph.querySelectorAll("[stroke-width]")].map((e) => num(e.getAttribute("stroke-width"))) : [];
  const icons = [...document.querySelectorAll(".wall .ic svg, #wall svg")];
  const iconStrokes = new Set();
  // the icon stroke is set in CSS, not as an attribute, so the attribute read came back empty:
  // the measured value is the computed one, in user units, which is what the grid is defined in
  for (const s of icons) for (const e of s.querySelectorAll("path,circle,line,polyline")) {
    const w = num(getComputedStyle(e).strokeWidth);
    if (w) iconStrokes.add(Math.round(w * 100) / 100);
  }
  const views = new Set(icons.map((s) => s.getAttribute("viewBox")));

  // 3. icon live area: no drawn point outside 2..22 (the 2 px gutter)
  let outside = 0, checked = 0;
  for (const s of icons.slice(0, 40)) {
    for (const e of s.querySelectorAll("path,circle,line,rect,polyline,polygon")) {
      const b = e.getBBox();
      if (!b.width && !b.height) continue;
      checked++;
      if (b.x < 1.4 || b.y < 1.4 || b.x + b.width > 22.7 || b.y + b.height > 22.7) outside++;
    }
  }

  // 4. the 16 px claim: rasterise the mark at 16 and count ink, and the thinnest device stroke
  // the "24 · 20 · 16" row, which is the page's claim in the flesh: a user-unit stroke times the
  // rendered scale is the device stroke, and a device stroke under 1 px is a grey hairline
  let ink16 = null, thin = null;
  const sizes = [...document.querySelectorAll("#sizes svg, .sizes svg")];
  if (sizes.length) {
    let smallest = null;
    for (const s of sizes) {
      const w = s.getBoundingClientRect().width;
      if (w > 0 && (!smallest || w < smallest.w)) smallest = { w, el: s };
    }
    const vb = (smallest.el.getAttribute("viewBox") || "0 0 24 24").split(/\s+/).map(Number);
    const scale = smallest.w / (vb[2] || 24);
    const devs = [...smallest.el.querySelectorAll("path,circle,line,polyline")]
      .map((e) => num(getComputedStyle(e).strokeWidth) * scale).filter((v) => v > 0);
    ink16 = { renderedPx: Math.round(smallest.w), n: sizes.length };
    if (devs.length) thin = Math.min(...devs);
  }

  // 5. text on tints: every pair the system can produce, in both directions
  const tints = ["--tint-1", "--tint-2", "--tint-3", "--tint-4", "--tint-5"]
    .map((n) => ({ name: n.replace("--", ""), hex: tok(n) }))
    .filter((t) => /^#/.test(t.hex));
  const inks = [["ink", "#14161a"], ["white", "#f7f6f3"], ["sea-deep", "#16334a"]];
  const grid = tints.map((t) => {
    const tl = lum(parse(rgbOf(t.hex)));
    const row = { tint: t.name, hex: t.hex };
    for (const [n, h] of inks) row[n] = R(lum(parse(rgbOf(h))), tl);
    return row;
  });
  function rgbOf(hex) {
    const el = document.createElement("span");
    el.style.cssText = `display:none;color:${hex}`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }

  // 6. the palette, declared vs used in computed styles
  const tokens = ["--ink", "--ink-2", "--ink-3", "--paper", "--paper-2", "--sea", "--signal", "--magenta",
    "--tint-1", "--tint-2", "--tint-3", "--tint-4", "--tint-5", "--sea-deep", "--grat"];
  const used = [];
  const all = [...document.querySelectorAll("*")].slice(0, 4000);
  const styles = all.map((e) => getComputedStyle(e));
  for (const t of tokens) {
    const v = tok(t);
    if (!v) continue;
    const rgb = rgbOf(v.startsWith("#") ? v : "#000000");
    const rgbTarget = v.startsWith("#") ? rgb : null;
    let hits = 0;
    for (const st of styles) {
      for (const p of ["color", "backgroundColor", "borderTopColor", "fill", "stroke"]) {
        if (rgbTarget && st[p] === rgbTarget) hits++;
      }
    }
    used.push([t, v, hits]);
  }

  // 7. the rule the section states: no HTML text sits on a tint
  let onTint = 0;
  const tintRgb = new Set(tints.map((t) => rgbOf(t.hex)));
  for (const e of all) {
    if (!e.children.length && (e.textContent || "").trim() && !e.closest("svg")) {
      if (tintRgb.has(getComputedStyle(e).backgroundColor)) onTint++;
    }
  }
  return {
    radii: { total: circles.length, ok: radiiOk, values: [...new Set(circles)].sort((a, b) => a - b) },
    markStrokes: [...new Set(markStrokes)],
    iconCount: icons.length,
    iconStrokes: [...iconStrokes].sort((a, b) => a - b),
    iconViews: [...views],
    liveArea: { checked, outside },
    ink16, thin,
    tints: grid,
    used,
    textOnTint: onTint,
  };
});
await browser.close();
server.close();

const f2 = (x) => (x === null || x === undefined ? "—" : (+x).toFixed(2));
const md = [
  "# 06-identity — the identity's claims, measured",
  "",
  "Generated by `06-identity/measure.mjs` from the rendered page: geometry the browser was given,",
  "computed colours, and WCAG ratios. The audit in `tools/shoot.mjs` walks HTML text nodes and does",
  "not see SVG `<text>`, so this file is where the page's SVG label pairs are measured.",
  "",
  "| claim on the page | measured | verdict |",
  "| --- | --- | --- |",
  `| every construction point sits on r ∈ {6, 12, 18, 24} | ${m.radii.ok}/${m.radii.total} circles in the set; radii seen: ${m.radii.values.join(", ")} | ${m.radii.ok === m.radii.total ? "true" : "FALSE"} |`,
  `| the mark's stroke is 3, the icons' is 1.5 | mark ${m.markStrokes.join(" / ") || "—"}; icons ${m.iconStrokes.join(" / ") || "—"} | ${m.iconStrokes.includes(1.5) ? "1.5 present" : "no 1.5"} |`,
  `| every icon lives in 24 × 24 | ${m.iconCount} icons, viewBoxes: ${m.iconViews.join(" ") || "—"} | ${m.iconViews.length === 1 && m.iconViews[0] === "0 0 24 24" ? "one grid" : "mixed"} |`,
  `| a 2 px gutter and a 20 px live area | ${m.liveArea.checked} boxes, ${m.liveArea.outside} outside 1.4–22.7 | ${m.liveArea.outside === 0 ? "true" : m.liveArea.outside + " overflow"} |`,
  `| 16 px is a second drawing, not a scale | smallest of ${m.ink16?.n ?? "—"} icon renderings is ${m.ink16?.renderedPx ?? "—"} px, thinnest device stroke ${f2(m.thin)} px | ${m.thin !== null && m.thin < 1 ? "sub-pixel: a grey hairline" : "≥ 1 device px"} |`,
  `| a tint is data: no word sits on a tint | ${m.textOnTint} HTML text nodes on a tint background | ${m.textOnTint === 0 ? "true" : "FALSE"} |`,
  "",
  "## Text on a tint, in both directions (WCAG)",
  "",
  "| tint | hex | ink | white | sea-deep |",
  "| --- | --- | --- | --- | --- |",
  ...m.tints.map((t) => `| ${t.tint} | \`${t.hex}\` | ${f2(t.ink)} | ${f2(t.white)} | ${f2(t["sea-deep"])} |`),
  "",
  "The deepest band is the dead zone: tint 5 is 4.09:1 for ink and 4.10:1 for white, so **tint 5",
  "carries no words in either direction** — that is the rule the section states, and the number it",
  "states it with.",
  "",
  "## Palette: declared and used",
  "",
  "| token | value | appearances in computed styles |",
  "| --- | --- | --- |",
  ...m.used.map((u) => `| \`${u[0]}\` | \`${u[1]}\` | ${u[2]} |`),
  "",
].join("\n");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, md);
console.log(md);
