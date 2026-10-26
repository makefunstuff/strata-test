// 01-landing/measure.mjs — the landing page's numbers, checked against its own drawing.
//
//   node 01-landing/measure.mjs [--url <task-dir>] [--out measure.md]
//
// The page's claim to originality is that the hero is generated topography "drawn from one elevation
// field, so the contours, the profile and the spot heights always agree". The field is true. The
// sentences around it were not: they were typed. Measured here, at the sheet's own scale bar
// (180 user units, labelled 2 km), the route the sheet draws is 7.6 km, and the legend and the
// profile plate both said 11.4 km; the field gains 551 m, the plate said +640 m; the summit is 860 m
// on the field and 812 m in the copy; the car park is 309 m, the copy said 210 m.
//
// So the numbers are derived in terrain-boot.js now, and this file refuses any drift:
//
//   the scale bar is the ruler    the drawn bar's width in user units is the sheet's km; the route
//                                 path's own getTotalLength() × that scale equals the quoted distance
//   the prose is the drawing      legend, hero caption, SVG aria-label, spot heights, the col, the
//                                 car park and the profile plate are compared with window.__sheet
//   the strip is the plate        the hero profile's points map back to the same 64 field samples
//   the pack adds up              the byte budget's seven rows sum to the 38 MB the hero quotes, and
//                                 each segment's rendered width equals its share
//   the fragments are drawings    strokes are the sheet's family, labels sit inside the plate with
//                                 their descenders, and every label carries the sheet's halo
//   the page fits                 no sideways overflow at 390 px, with the key in one column
//
// The folder's audit (tools/shoot.mjs) compares text against colour. It cannot tell a true sentence
// from a false one, and it never asks a drawing what it draws. That is the gap this file fills.
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(here, "..");
const { chromium } = createRequire(join(designDir, "tools", "noop.cjs"))("playwright-core");

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1] };
const ROOT = resolve(flag("--url", here));
const OUT = resolve(flag("--out", join(here, "measure.md")));

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
async function serve(root) {
  const srv = createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    const file = join(root, p === "/" ? "index.html" : p);
    try {
      if (!(await stat(file)).isFile()) throw 0;
      res.setHeader("content-type", TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
      res.end(await readFile(file));
    } catch { res.statusCode = 404; res.end("nope") }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { origin: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

const READ = `(() => {
  const S = window.__sheet;
  const txt = (sel) => document.querySelector(sel)?.textContent.replace(/\\s+/g, " ").trim() ?? null;
  const num = (t) => parseFloat(String(t).replace(/[^0-9.]/g, ""));
  const out = { sheet: S, quoted: {} };

  /* ---- the scale bar is the ruler ------------------------------------------- */
  const scale = document.querySelector('#overlay g[transform^="translate(912"]');
  const bars = scale ? [...scale.querySelectorAll('g[stroke] rect')] : [];
  const x0 = Math.min(...bars.map((r) => +r.getAttribute("x")));
  const x1 = Math.max(...bars.map((r) => +r.getAttribute("x") + +r.getAttribute("width")));
  const route = [...document.querySelectorAll("#overlay path")].find((p) => p.getAttribute("stroke") === "#c2410c" && +p.getAttribute("stroke-width") > 3);
  const drawnUnits = route ? route.getTotalLength() : null;
  out.scale = {
    barUnits: x1 - x0, label: [...(scale?.querySelectorAll("text") ?? [])].map((t) => t.textContent).join(" "),
    mPerUnit: 2000 / (x1 - x0),
    drawnUnits: Math.round(drawnUnits),
    kmFromDrawing: +(((drawnUnits * 2000) / (x1 - x0)) / 1000).toFixed(1),
    kmQuoted: num(txt("#legendKm")),
    kmInPlate: (txt("#overlay") ?? "").match(/PROFILE · ([0-9.]+) KM/)?.[1] ?? null,
    ariaKm: (document.getElementById("overlay")?.getAttribute("aria-label") ?? "").match(/route of ([0-9.]+) km/)?.[1] ?? null,
  };

  /* ---- the prose is the drawing --------------------------------------------- */
  const labels = [...document.querySelectorAll("#overlay text")].map((t) => t.textContent.replace(/\\s+/g, " ").trim());
  const find = (re) => labels.find((l) => re.test(l)) ?? null;
  out.quoted = {
    legend: txt("#legendKm"), heroKm: txt("#heroKm"), heroGain: txt("#heroGain"),
    heroPeak: txt("#heroPeak"), heroStart: txt("#heroStart"),
    aria: document.getElementById("overlay")?.getAttribute("aria-label"),
    spotLabel: find(/\\d+ m$/), colLabel: find(/the col/), parkLabel: find(/car park/),
    plateTitle: find(/PROFILE ·/),
    plateStart: find(/^\\d+ m$/),
    statsRegion: txt('.stats dd:nth-of-type(2)') ?? [...document.querySelectorAll(".stats dd")].map((d) => d.textContent.trim()).join(" · "),
  };

  /* ---- the strip is the plate ---------------------------------------------- */
  const hp = document.querySelector("#heroProfile svg");
  const line = hp?.querySelector("path[stroke-width='2']");
  const d = line?.getAttribute("d") ?? "";
  const pts = [...d.matchAll(/-?[0-9.]+ -?[0-9.]+/g)].map((m) => m[0].split(" ").map(Number));
  const cap = txt(".hero-prof-cap");
  out.strip = {
    exists: !!hp, points: pts.length, samples: S.prof.length,
    quoted: cap, aria: hp?.getAttribute("aria-label"),
    role: hp?.getAttribute("role"),
  };
  if (pts.length > 1) {
    // the strip's own scale, rebuilt the way terrain-boot draws it, then each point mapped back
    const HW = 452, pd = 12, lo = S.pmin - 25, hi = S.pmax + 25, HH = 96, plot = HH - 2 * pd - 14;
    const v = (y) => lo + ((HH - pd - y) / plot) * (hi - lo);
    const dev = pts.map((p, i) => Math.abs(v(p[1]) - S.prof[i]));
    out.strip.maxDevM = +Math.max(...dev).toFixed(2);
    out.strip.first = +v(pts[0][1]).toFixed(1);
    out.strip.last = +v(pts[pts.length - 1][1]).toFixed(1);
  }

  /* ---- the pack adds up ---------------------------------------------------- */
  const segs = [...document.querySelectorAll(".pb-segs span")].map((s) => +s.style.width.replace("%", ""));
  const key = [...document.querySelectorAll(".pb-key li")].map((li) => ({
    name: li.querySelector("span").textContent.trim(),
    mb: num(li.querySelector("b").textContent),
    pct: num(li.querySelector("em").textContent),
  }));
  const heroRegion = num([...document.querySelectorAll(".stats dd")].map((d) => d.textContent).join(" ").match(/([0-9.]+)\\s*MB/)?.[1] ?? "NaN");
  out.pack = {
    key, sumMb: +key.reduce((a, k) => a + k.mb, 0).toFixed(1),
    sumPct: key.reduce((a, k) => a + k.pct, 0),
    segsSum: +segs.reduce((a, w) => a + w, 0).toFixed(1), segs: segs.length,
    heroRegion,
    worstSegDev: +Math.max(...key.map((k, i) => Math.abs(segs[i] - (k.mb / 38) * 100))).toFixed(2),
    labelled: key.filter((k) => k.name.length > 3 && k.mb > 0).length,
    aria: document.querySelector(".pack-bar")?.getAttribute("role") + ":" + (document.querySelector(".pack-bar")?.getAttribute("aria-label") ?? "").slice(0, 40),
  };

  /* ---- the fragments are drawings ----------------------------------------- */
  const frag = [...document.querySelectorAll(".pack .frag svg")].map((svg) => {
    const vb = svg.getAttribute("viewBox").split(" ").map(Number);
    const drawn = [...svg.querySelectorAll("path,rect,circle,line")].filter((n) => n.getAttribute("fill") !== "none" || n.getAttribute("stroke"));
    // the width family, from what is actually painted: a CSS "stroke: none" is invisible to the
    // attribute, which is how a shadow flank reported a stray 1px in the first draft of this check
    const strokes = [...new Set(drawn.filter((n) => getComputedStyle(n).stroke !== "none")
      .map((n) => getComputedStyle(n).strokeWidth))].sort();
    const texts = [...svg.querySelectorAll("text")].map((t) => {
      const b = t.getBBox();
      return { text: t.textContent, bottom: +(b.y + b.height).toFixed(1), vbH: vb[3],
        halo: getComputedStyle(t).paintOrder.startsWith("stroke") };
    });
    return {
      drawn: drawn.length, strokes,
      clipped: texts.filter((t) => t.bottom > vb[3] - 1).map((t) => t.text),
      haloed: texts.every((t) => t.halo), texts: texts.length,
      hidden: svg.getAttribute("aria-hidden"),
    };
  });
  const mapStrokes = {
    contours: getComputedStyle(document.querySelector("#contours")).strokeWidth,
    index: getComputedStyle(document.querySelector("#index")).strokeWidth,
    route: getComputedStyle(document.querySelector("#route path[stroke-width='3.4']") ?? document.querySelector("#contours")).strokeWidth,
  };
  out.frag = {
    mapStrokes,
    n: frag.length, minDrawn: Math.min(...frag.map((f) => f.drawn)),
    allHalo: frag.every((f) => f.haloed), allHidden: frag.every((f) => f.hidden === "true"),
    clipped: frag.flatMap((f) => f.clipped),
    strokes: [...new Set(frag.flatMap((f) => f.strokes))].sort(),
  };

  /* ---- contrast of the new type, and the phone ----------------------------- */
  const lum = (c) => { const m = c.match(/[0-9.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]) };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2) };
  const paper = getComputedStyle(document.body).backgroundColor;
  const inkOf = (sel) => { const e = document.querySelector(sel); return e ? { sel, ink: getComputedStyle(e).color, ratio: ratio(getComputedStyle(e).color, paper), size: getComputedStyle(e).fontSize } : null };
  out.contrast = [inkOf(".hero-prof-cap"), inkOf(".pb-key em"), inkOf(".pb-key span"), inkOf(".pack p"), inkOf(".pack h3")].filter(Boolean);
  out.overflow = document.documentElement.scrollWidth - window.innerWidth;
  return out;
})()`;

async function main() {
  const web = await serve(ROOT);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? join(designDir, "tools", "chromium-capped.sh"),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
      "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  await page.goto(`${web.origin}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2400);
  const d = await page.evaluate(READ);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const phone = await page.evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    packCols: getComputedStyle(document.querySelector(".pack")).gridTemplateColumns.split(" ").length,
    barW: Math.round(document.querySelector(".pb-segs").getBoundingClientRect().width),
  }))()`);
  await browser.close();
  web.close();

  const S = d.sheet;
  const ok = (b) => (b ? "✓" : "**✗**");
  const L = [];
  const push = (s = "") => L.push(s);
  push("# 01 · Landing — the hero's numbers, checked against the hero's drawing");
  push("");
  push("Run: `node 01-landing/measure.mjs` (headless Chromium over local HTTP, the same binary as the audit).");
  push("The elevation field, the route, the scale bar and the profile are generated by `terrain-boot.js`;");
  push("this file reads `window.__sheet` and the rendered page, and refuses a page whose sentences and");
  push("whose drawing disagree. The drawn route's own `getTotalLength()` is the ruler — not my arithmetic.");
  push("");
  push("## The scale bar is the ruler");
  push("");
  push("| | value |");
  push("| --- | --- |");
  push(`| the drawn scale bar | ${d.scale.barUnits} user units, labelled \`${d.scale.label}\` → ${d.scale.mPerUnit.toFixed(2)} m per unit |`);
  push(`| the route path's own length | ${d.scale.drawnUnits} units = **${d.scale.kmFromDrawing} km** |`);
  push(`| quoted in the legend | ${d.scale.kmQuoted} km ${ok(d.scale.kmQuoted === d.scale.kmFromDrawing)} |`);
  push(`| quoted in the sheet's profile plate | ${d.scale.kmInPlate} km ${ok(+d.scale.kmInPlate === d.scale.kmFromDrawing)} |`);
  push(`| quoted in the sheet's \`aria-label\` | ${d.scale.ariaKm} km ${ok(+d.scale.ariaKm === d.scale.kmFromDrawing)} |`);
  push(`| derived by the generator | ${S.routeKm} km (from ${S.routeUnits} units at ${S.mPerUnit} m/unit) ${ok(S.routeKm === d.scale.kmFromDrawing)} |`);
  push("");
  push("Before this round the legend and the plate said **11.4 km** for a route the sheet draws at");
  push(`**${d.scale.kmFromDrawing} km** — a 50 % overstatement, invisible to a screenshot, and invisible to`);
  push("the audit, which compares text against colour and never asks a drawing what it draws.");
  push("");
  push("## The prose is the drawing");
  push("");
  push("| number | derived from the field | quoted on the page | |");
  push("| --- | --- | --- | --- |");
  push(`| summit spot height | ${S.peak} m | \`${d.quoted.spotLabel}\` | ${ok(d.quoted.spotLabel === `${S.peak} m`)} |`);
  push(`| the col | ${S.col} m | \`${d.quoted.colLabel}\` | ${ok(d.quoted.colLabel === `the col ${S.col} m`)} |`);
  push(`| car park | ${S.park} m | \`${d.quoted.parkLabel}\` | ${ok(d.quoted.parkLabel === `car park ${S.park} m`)} |`);
  push(`| profile plate | +${S.gain} m over ${S.routeKm} km | \`${d.quoted.plateTitle}\` | ${ok(d.quoted.plateTitle === `PROFILE · ${S.routeKm} KM · +${S.gain} M`)} |`);
  push(`| plate start / peak | ${S.pmin} m / ${S.pmax} m | \`${d.quoted.plateStart}\` and \`${d.quoted.spotLabel}\` | ${ok(d.quoted.plateStart === `${S.pmin} m`)} |`);
  push(`| hero caption | ${S.routeKm} km, +${S.gain} m, ${S.peak} m, ${S.park} m | \`${d.quoted.heroKm} / ${d.quoted.heroGain} / ${d.quoted.heroPeak} / ${d.quoted.heroStart}\` | ${ok(d.quoted.heroKm === `${S.routeKm} km` && d.quoted.heroGain === `+${S.gain} m` && d.quoted.heroPeak === `${S.peak} m` && d.quoted.heroStart === `${S.park} m`)} |`);
  push(`| legend | ${S.routeKm} km | \`${d.quoted.legend}\` | ${ok(d.quoted.legend === `${S.routeKm} km`)} |`);
  push(`| sheet \`aria-label\` | \`${String(d.quoted.aria).slice(0, 96)}…\` | peak and distance named | ${ok(String(d.quoted.aria).includes(`${S.peak}-metre`) && String(d.quoted.aria).includes(`${S.routeKm} km`))} |`);
  push("");
  push("The copy's own numbers, typed before this round: 812 m, 640 m, 210 m, 11.4 km. The field says");
  push(`**${S.peak} m**, **${S.col} m**, **${S.park} m**, **${S.routeKm} km**. The honest number is smaller`);
  push("than the marketing number, and the sheet is the authority, so the marketing number moved.");
  push("");
  push("## The strip is the plate");
  push("");
  push(`The hero strip draws **${d.strip.points}** points from **${d.strip.samples}** field samples — the`);
  push("same array the sheet's plate draws, so the two strips cannot quote different climbs.");
  push(`Mapped back through the strip's own scale: **${d.strip.first} m** at the car park,`);
  push(`**${d.strip.last} m** at the summit, **${d.strip.maxDevM} m** maximum deviation from the samples.`);
  push(`Caption \`${d.strip.quoted}\`; role \`${d.strip.role}\` with an \`aria-label\` that states the numbers.`);
  push("");
  push("## The pack adds up");
  push("");
  push("| layer | MB | % |");
  push("| --- | --- | --- |");
  for (const k of d.pack.key) push(`| ${k.name} | ${k.mb} | ${k.pct} % |`);
  push(`| **total** | **${d.pack.sumMb}** | **${d.pack.sumPct} %** |`);
  push("");
  push(`The hero quotes **${d.pack.heroRegion} MB** for a region; the seven layers sum to`);
  push(`**${d.pack.sumMb} MB** ${ok(d.pack.sumMb === d.pack.heroRegion)}. Segment widths sum to`);
  push(`**${d.pack.segsSum} %** across ${d.pack.segs} segments, worst segment off its share by`);
  push(`**${d.pack.worstSegDev} %**; every row carries words as well as a width (${d.pack.labelled} of ${d.pack.key.length}).`);
  push(`The bar is one quantity, so it is one ramp; the bar itself is \`aria-hidden\` and the\``);
  push(`role="img"\` label spells the breakdown out for a reader: \`${d.pack.aria}\`…\``);
  push("");
  push("## The fragments are drawings");
  push("");
  push(`${d.frag.n} fragments, the least-drawn carrying **${d.frag.minDrawn}** shapes.`);
  push("");
  push("The sheet declares its stroke family on its own groups — `#contours` 0.9, `#index` 1.7, the route");
  push(`3.4 — and the fragments' computed widths are **${d.frag.strokes.join(", ")}**: the same four`);
  push("numbers, at a plate 148 units wide instead of a sheet 1 200 wide. A family of nine widths was");
  push("the first version of this section; the instrument printed them, so they became four.");
  push("");
  const family = ["0.9px", "1.3px", "1.7px", "3.4px"];
  const strays = d.frag.strokes.filter((w) => !family.includes(w) && parseFloat(w) > 0);
  push(`Strays from the four: **${strays.length ? strays.join(", ") : "none"}**. All labels carry the sheet's halo:`);
  push(`**${d.frag.allHalo}**; all are \`aria-hidden\` because the words beside them are the content:`);
  push(`**${d.frag.allHidden}**; labels clipped by a plate edge: **${d.frag.clipped.length ? d.frag.clipped.join(", ") : "none"}**.`);
  push("");
  push("## The new type, and the phone");
  push("");
  push("| element | ink | ratio on paper | size |");
  push("| --- | --- | --- | --- |");
  for (const c of d.contrast) push(`| ${c.sel} | ${c.ink} | ${c.ratio} | ${c.size} |`);
  push("");
  push(`Sideways overflow: desktop **${d.overflow} px**, phone **${phone.overflow} px**; the pack is`);
  push(`**${phone.packCols}** column at 390 px, the byte bar ${phone.barW} px wide.`);
  push("");
  push(`Console errors: **${errs.length}**${errs.length ? " — " + errs.join("; ") : ""}`);
  push("");
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, L.join("\n") + "\n");
  console.log(L.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1) });
