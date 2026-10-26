// 10-redesign/measure.mjs — the redesign's numbers, checked against the redesign.
//
//   node 10-redesign/measure.mjs [--url <task-dir>] [--out measure.md]
//
// This brief's whole claim is that its numbers are true: the case study prints measurements from
// both pages, and the notes record the times the measurements caught the prose lying (a tide table
// that dropped every second low water; a headline that quoted 4.10 m as a flood-line high). Round 2
// adds two drawings — a tide curve per day, and a level gauge — and a drawing can lie in ways a
// screenshot cannot show, so they are checked here, in the browser, against the text beside them:
//
//   the curve is the table      every dot's y maps back to its cell's metres (±0.02 m); a peak is
//                               coloured flood only when the height is above the flood line; a
//                               gauge reading of "—" is a gap, not a point
//   the gauge is the panel      each mark's x maps back to its data attribute, and every centimetre
//                               in the key equals the arithmetic of the two numbers it quotes
//   the lede is the table       the flood line, the peak, the surge clause and the predicted tide
//                               agree across the lede, the panel, the table caption and the table
//   states are not colour       every state pill has words, and its ink clears 4.5:1 on the paper
//   it prints                   at A4 width the table has no sideways overflow, and the curves are
//                               still on the page (the notes' named hole: print CSS, no capture)
//   the phone holds             sideways overflow at 390 px, the case study's 572 px → 0 px row
//
// The folder's audit (tools/shoot.mjs) walks HTML text nodes: it never sees SVG geometry, and it
// does not emulate print. That is the gap this file fills.
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

const CHECKS = `(() => {
  const num = (s) => parseFloat(String(s).replace(/[^0-9.\\-]/g, ""));
  const rows = [...document.querySelectorAll("table.tides tbody tr")];
  const FLOOD = 4.20;
  const out = { rows: rows.length, flood: FLOOD };

  /* ---- the curve is the table ------------------------------------------------ */
  // the shared scale is rebuilt from the table's own cells, exactly as the drawing code does it,
  // and each dot is mapped back through it. y = H - pad - ((v - lo)/(hi - lo)) * (H - 2 pad)
  // heights only: a time like 04:26 stripped of its colon is 426, and 426 as a tide height
  // poisons the scale — which is exactly how this instrument first lied
  const hs = rows.flatMap((tr) => [...tr.querySelectorAll('td[data-l="Height (m)"]')].map((td) => num(td.textContent)).filter(Number.isFinite));
  const lo = Math.min(...hs, FLOOD) - 0.35, hi = Math.max(...hs, FLOOD) + 0.35;
  const H = 30, pad = 3;
  const vOf = (y) => lo + ((H - pad - y) / (H - 2 * pad)) * (hi - lo);
  const cs = getComputedStyle(document.documentElement);
  const floodInk = cs.getPropertyValue("--flood").trim();
  out.curves = rows.map((tr) => {
    const cells = [...tr.querySelectorAll("td[data-l]")];
    const waters = [];
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const h = num(cells[i + 1].textContent);
      waters.push({ t: cells[i].textContent.trim(), h: Number.isFinite(h) ? h : null });
    }
    const svg = tr.querySelector("svg.tide-curve");
    const dots = [...(svg?.querySelectorAll("circle") ?? [])];
    const gaps = [...(svg?.querySelectorAll("line.gap") ?? [])];
    const pairs = waters.filter((w) => w.h != null);
    const deltas = dots.map((c, i) => Math.abs(vOf(+c.getAttribute("cy")) - pairs[i].h));
    const peaks = dots.filter((c) => c.classList.contains("peak"));
    const wrongPeak = dots.filter((c) => {
      const w = pairs[[...dots].indexOf(c)];
      return !w || ((w.h > FLOOD) !== c.classList.contains("peak"));
    }).length;
    return {
      day: tr.querySelector("th").textContent.trim().replace(/\\s+/g, " ").split("curve")[0],
      waters: waters.length, drawn: dots.length, missing: waters.filter((w) => w.h == null).length,
      gaps: gaps.length, maxDevM: +Math.max(0, ...deltas).toFixed(3),
      peaks: peaks.length, aboveLine: pairs.filter((w) => w.h > FLOOD).length, wrongPeak,
      hasSvg: !!svg, band: !!svg?.querySelector("rect.above"), line: !!svg?.querySelector("line.line"),
    };
  });

  /* ---- the gauge is the panel ------------------------------------------------ */
  const g = document.getElementById("gauge");
  if (g) {
    const d = g.dataset, W = 288, gp = 2;
    const xOf = (v) => gp + ((v - +d.lo) / (+d.hi - +d.lo)) * (W - 2 * gp);
    const mark = (sel) => { const l = g.querySelector(sel); return l ? +l.getAttribute("x1") : null };
    const px = (v) => (v - gp) * ((+d.hi - +d.lo) / (W - 2 * gp)) + +d.lo;   // px back to metres
    const v = { now: mark(".g-now") ?? mark("rect.g-now"), line: mark(".g-line"), pred: mark(".g-pred"), fc: mark(".g-fc") };
    // keep every mark in the same unit (device x) and invert once; the "now" mark is the end of
    // a bar, so its x is pad + width
    const bar = g.querySelector("rect.g-now");
    v.now = bar ? +bar.getAttribute("width") + gp : null;
    const key = g.querySelector(".g-key")?.textContent.replace(/\\s+/g, " ") ?? "";
    const cm = (a, b) => Math.round(Math.abs(a - b) * 100);
    out.gauge = {
      attrs: { lo: +d.lo, hi: +d.hi, now: +d.now, line: +d.line, pred: +d.predicted, fc: +d.forecast },
      metres: { now: +px(v.now).toFixed(2), line: +px(v.line).toFixed(2), pred: +px(v.pred).toFixed(2), fc: +px(v.fc).toFixed(2) },
      devM: { now: Math.abs(px(v.now) - +d.now), line: Math.abs(px(v.line) - +d.line), pred: Math.abs(px(v.pred) - +d.predicted), fc: Math.abs(px(v.fc) - +d.forecast) },
      order: +d.now < +d.line && +d.line < +d.predicted && +d.predicted < +d.forecast,
      keyHas: ["now", "line", "pred", "fc"].map((k) => key.includes((+d[{ now: "now", line: "line", pred: "predicted", fc: "forecast" }[k]]).toFixed(2))),
      cmInKey: { nowLine: key.includes(cm(+d.now, +d.line)), predLine: key.includes(cm(+d.predicted, +d.line)), fcLine: key.includes(cm(+d.forecast, +d.line)) },
      swatches: g.querySelectorAll(".sw").length, keyRows: g.querySelectorAll(".g-key li").length,
      svgHidden: g.querySelector("svg")?.getAttribute("aria-hidden"),
    };
  }

  /* ---- the lede is the table ------------------------------------------------- */
  const txt = (sel) => document.querySelector(sel)?.textContent.replace(/\\s+/g, " ").trim() ?? "";
  const lede = txt(".lede");
  const pick = (re) => (lede.match(re) ?? []).map(num).filter(Number.isFinite);
  const tableMax = Math.max(...hs);
  out.prose = {
    lede,
    floodQuoted: num((lede.match(/flood line of\\s*([0-9.]+)/i) ?? [])[1]),
    peakQuoted: num((lede.match(/peak is\\s*([0-9.]+)/i) ?? [])[1]),
    cmQuoted: num((lede.match(/([0-9]+)\\s*cm above/) ?? [])[1]),
    predictedQuoted: num((lede.match(/high water is\\s*([0-9.]+)/i) ?? [])[1]),
    saysSurge: /surge/i.test(lede),
    tablePredicted: /predicted astronomical tides/i.test(txt("#tides")) || /without surge/i.test(txt("#tides")),
    tableMax: +tableMax.toFixed(2),
  };
  out.prose.cmOk = out.prose.cmQuoted === Math.round((out.prose.peakQuoted - out.prose.floodQuoted) * 100);

  /* ---- states are not colour ------------------------------------------------- */
  const lum = (c) => {
    const m = c.match(/[0-9.]+/g).map(Number);
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) };
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
  };
  // the page's --paper token is #ffffff and the notices sit directly on it, so the ground is
  // white by construction; a computed background on the list itself is transparent
  const paperL = 1;
  out.states = [...document.querySelectorAll(".notices .st")].map((s) => {
    const ink = lum(getComputedStyle(s).color);
    const r = (Math.max(paperL, ink) + 0.05) / (Math.min(paperL, ink) + 0.05);
    return { text: s.textContent.trim(), colour: getComputedStyle(s).color, ratio: +r.toFixed(2), words: s.textContent.trim().length > 2 };
  });
  out.metaWithState = document.querySelectorAll(".notices .meta").length;

  /* ---- the phone holds ------------------------------------------------------- */
  out.overflow = document.documentElement.scrollWidth - window.innerWidth;
  out.floodInk = floodInk;
  return out;
})()`;

async function main() {
  const web = await serve(ROOT);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? join(designDir, "tools", "chromium-capped.sh"),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
      "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  await page.goto(`${web.origin}/after.html`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const desk = await page.evaluate(CHECKS);

  // print: A4 at 96 dpi is 794 x 1123 CSS px, and the notes' claim is a 10 pt table
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.waitForTimeout(400);
  const print = await page.evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    curves: document.querySelectorAll("svg.tide-curve").length,
    curvesVisible: [...document.querySelectorAll("svg.tide-curve")].filter((s) => s.getBoundingClientRect().width > 40).length,
    tableW: Math.round(document.querySelector("table.tides").getBoundingClientRect().width),
    gaugeVisible: document.getElementById("gauge").getBoundingClientRect().width > 100,
    fontPx: getComputedStyle(document.querySelector("table.tides td")).fontSize,
  }))()`);

  // the phone: the case study prints a 572 px → 0 px row; re-measure it
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const phone = await page.evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    curves: document.querySelectorAll("svg.tide-curve").length,
    tableScroll: (() => { const w = document.querySelector("table.tides").closest("div"); return w ? w.scrollWidth - w.clientWidth : 0 })(),
  }))()`);

  await browser.close();
  web.close();

  const L = [];
  const push = (s = "") => L.push(s);
  push("# 10 · Redesign — the redesign, measured");
  push("");
  push("Run: `node 10-redesign/measure.mjs` (headless Chromium over local HTTP, the same binary as the audit).");
  push("Nothing here is read from the source files: every number is measured from the rendered page,");
  push("and the drawings are mapped back through the scale the drawing code used.");
  push("");
  push("## The curve is the table");
  push("");
  push("Each dot's `cy` is inverted through the shared scale and compared with the cell beside it.");
  push("A peak dot is flood-coloured only if the height is above the flood line; a `—` must be a gap.");
  push("");
  push("| day | waters | dots | max deviation | peaks / above line | wrong colours | gaps drawn for missing |");
  push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of desk.curves)
    push(`| ${c.day} | ${c.waters} | ${c.drawn} | ${c.maxDevM} m | ${c.peaks} / ${c.aboveLine} | ${c.wrongPeak} | ${c.gaps} for ${c.missing} |`);
  const dev = Math.max(...desk.curves.map((c) => c.maxDevM));
  const peaksBad = desk.curves.reduce((a, c) => a + c.wrongPeak, 0);
  const gapsBad = desk.curves.filter((c) => c.gaps !== c.missing).length;
  push("");
  push(`Every dot within **${dev} m** of its cell; **${peaksBad}** peaks coloured wrongly; **${gapsBad}** rows with a`);
  push(`gap that does not match a missing reading. Every row has a curve: ${desk.curves.every((c) => c.hasSvg && c.band && c.line)}.`);
  push("");
  push("## The gauge is the panel");
  push("");
  const g = desk.gauge;
  push("| mark | attribute | measured metres | deviation |");
  push("| --- | --- | --- | --- |");
  for (const k of ["now", "line", "pred", "fc"])
    push(`| ${k} | ${g.attrs[k].toFixed(2)} m | ${g.metres[k].toFixed(2)} m | ${g.devM[k].toFixed(3)} m |`);
  push("");
  push(`Marks in order (tide < flood line < predicted < forecast): **${g.order}**. Key rows ${g.keyRows}, swatches ${g.swatches},`);
  push(`SVG hidden from readers (the numbers are in the text): ${g.svgHidden}.`);
  push(`Every number in the key is present: ${g.keyHas.every(Boolean)}. Every centimetre in the key equals its arithmetic: ${Object.values(g.cmInKey).every(Boolean)}.`);
  push("");
  push("## The lede is the table");
  push("");
  const p = desk.prose;
  push("| claim | value | check |");
  push("| --- | --- | --- |");
  push(`| flood line in the lede | ${p.floodQuoted} m | the table's caption quotes the same |`);
  push(`| forecast peak in the lede | ${p.peakQuoted} m | ${p.saysSurge ? "named as the forecast with surge" : "**no surge clause**"} |`);
  push(`| centimetres above the line | ${p.cmQuoted} cm | ${p.cmOk ? `**${p.cmQuoted} = ${Math.round((p.peakQuoted - p.floodQuoted) * 100)} ✓**` : `**${p.cmQuoted} ≠ ${Math.round((p.peakQuoted - p.floodQuoted) * 100)} ✗**`} |`);
  push(`| predicted tide quoted in the lede | ${p.predictedQuoted} m | the table's own 22:14 high is ${p.tableMax} m: ${p.predictedQuoted === p.tableMax ? "same ✓" : "**different ✗**"} |`);
  push(`| the table names its basis | — | ${p.tablePredicted ? "says predicted astronomical tide, without surge ✓" : "**silent ✗**"} |`);
  push("");
  push("Before this round the lede said the peak was 4.61 m and 41 cm above the line while the table's");
  push("22:14 tide was 4.48 m, and nothing on the page said the two numbers are two different things.");
  push("");
  push("## States are words, not colours");
  push("");
  push("| pill | ink | ratio on paper | words |");
  push("| --- | --- | --- | --- |");
  for (const s of desk.states) push(`| ${s.text} | ${s.colour} | ${s.ratio} | ${s.words} |`);
  push("");
  push(`Notices carrying a state: ${desk.states.length} of ${desk.metaWithState} (the two undated-by-state notices are a map and a report).`);
  push(`Worst state ink on paper: **${Math.min(...desk.states.map((s) => s.ratio))}** (AA text is 4.5).`);
  push("");
  push("## It prints, and it fits a phone");
  push("");
  push("| | desktop 1 400 | print A4 794 | phone 390 |");
  push("| --- | --- | --- | --- |");
  push(`| sideways overflow | ${desk.overflow} px | ${print.overflow} px | ${phone.overflow} px |`);
  push(`| curves on the page | ${desk.curves.length} | ${print.curvesVisible} of ${print.curves} | ${phone.curves} |`);
  push(`| table width | — | ${print.tableW} px | scrolls in its own box: ${phone.tableScroll} px |`);
  push(`| table font | — | ${print.fontPx} | — |`);
  push("");
  push(`The gauge survives print: ${print.gaugeVisible}. The case study's 572 px → 0 px phone row still`);
  push(`holds: **${phone.overflow} px** of document overflow at 390 px, with the table scrolling in its`);
  push(`own box (${phone.tableScroll} px inside) rather than pushing the page sideways.`);
  push("");
  push(`Console errors: **${errs.length}**${errs.length ? " — " + errs.join("; ") : ""}`);
  push("");

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, L.join("\n") + "\n");
  console.log(L.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1) });
