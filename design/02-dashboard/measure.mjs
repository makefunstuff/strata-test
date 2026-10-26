// 02-dashboard/measure.mjs — legibility of the load chart, in numbers.
//
//   node 02-dashboard/measure.mjs [--url <task-dir>] [--out measure.md]
//
// Why this exists, and why it is not one more liveliness point.
// The folder's liveliness index rewards hue variety. This redesign *removed* hue variety on
// purpose — six depots carrying one quantity (kW) get a sequential ramp, not a rainbow — so the
// index went down (56.4 -> 53.0, hue families 2.2 -> 1.0) while the chart got easier to read.
// A claim like that needs a measurement about reading a chart:
//
//   band separation   smallest WCAG luminance ratio between neighbouring painted fills. Two fills
//                     at 1.05:1 are the same grey: their boundary is carried by the 1px separator,
//                     not by the colour. The old rainbow had six hues and no ordering, so adjacent
//                     pairs collided.
//   fill vs panel     WCAG 1.4.11 puts meaningful graphic objects at 3:1 against their background.
//   greyscale rank    Spearman ρ between fill darkness and series size. A sequential ramp must read
//                     "big is dark" with the colour removed — that is what survives print, a
//                     monochrome projector, and colour-blindness. A rainbow scores whatever.
//   KPI hierarchy     primary readout / secondary readout, in px. Five equal cards is 1.00.
//   plot ink          data mark as a share of the plot box.
//
// Measured in the browser from computed styles and the drawn SVG, not from the CSS source: the old
// page painted its bands at 78% opacity over the panel, and only the rendered colour counts.
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

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
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
await page.waitForTimeout(1500);

const probe = async (theme) => {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; window.dispatchEvent(new Event("resize")); }, theme);
  await page.waitForTimeout(800);
  return page.evaluate((th) => {
    const parse = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? [+m[1], +m[2], +m[3]] : null; };
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const card = document.querySelector(".card") ?? document.body;
    const panelRaw = parse(getComputedStyle(card).backgroundColor) ?? [255, 255, 255];
    const panel = lum(panelRaw);

    // legend order is size order (AWL is the biggest depot), and it is the same markup in both designs
    const fills = [...document.querySelectorAll("#arealegend button")].map((b) => ({
      code: b.textContent.trim(),
      lum: lum(parse(getComputedStyle(b.querySelector("i") ?? b).backgroundColor)),
    }));

    // the painted stack, bottom band first, with the alpha the page actually used
    const svg = document.querySelector("#area");
    const painted = [];
    for (const el of svg ? [...svg.querySelectorAll("rect.band, path[fill]")] : []) {
      const c = parse(getComputedStyle(el).fill);
      if (!c) continue;
      const a = +(el.getAttribute("fill-opacity") ?? getComputedStyle(el).fillOpacity ?? 1);
      if (a < 0.05) continue;
      // a 78%-opacity band is not its own colour: it is that colour composited on the panel
      painted.push(a >= 0.995 ? lum(c) : lum(c.map((v, i) => v * a + panelRaw[i] * (1 - a))));
    }
    const uniq = [];
    for (const l of painted) if (!uniq.length || Math.abs(uniq[uniq.length - 1] - l) > 1e-4) uniq.push(l);
    const adj = [];
    for (let i = 1; i < uniq.length; i++) adj.push(ratio(uniq[i - 1], uniq[i]));

    /* Rank order, direction set by the theme: on a light ground weight reads as dark, on a dark
       ground weight reads as light. A ramp that is "right" in one theme is exactly wrong in the
       other, and the first version of this one was: it scored -1.00 in dark. */
    const heavyIsDark = th === "light";   // `th`, not `theme`: this function is serialised into the page
    const byRank = fills.map((f, i) => ({ i, l: f.lum })).sort((a, b) => (heavyIsDark ? a.l - b.l : b.l - a.l)).map((x) => x.i);
    let inv = 0;
    for (let a = 0; a < byRank.length; a++) for (let b = a + 1; b < byRank.length; b++) if (byRank[a] > byRank[b]) inv++;
    const n = byRank.length;
    const rho = 1 - (2 * inv) / (n * (n - 1) / 2);   // +1 = the biggest depot is the heaviest band

    const prim = document.querySelector(".kpi-primary .big b") ?? document.querySelector(".kpi .big b");
    const sec = [...document.querySelectorAll(".kpi .big b")].find((e) => !e.closest(".kpi-primary")) ?? prim;
    const px = (e) => parseFloat(getComputedStyle(e).fontSize);
    let ink = null;
    if (svg) {
      const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
      if (vb.length === 4 && vb[2] && vb[3]) {
        const area = [...svg.querySelectorAll("rect.band")].reduce((s, r) =>
          s + (+r.getAttribute("width") || 0) * Math.max(0, +r.getAttribute("height") || 0), 0);
        if (area) ink = area / (vb[2] * vb[3]);
      }
    }
    return {
      codes: fills.map((f) => f.code).join(" "),
      minFillPanel: Math.min(...fills.map((f) => ratio(f.lum, panel))),
      minAdjacent: adj.length ? Math.min(...adj) : null,
      maxAdjacent: adj.length ? Math.max(...adj) : null,
      bandsPainted: uniq.length,
      rho,
      kpiRatio: prim && sec ? px(prim) / px(sec) : null,
      plotInk: ink,
    };
  }, theme);
};

const light = await probe("light");
const dark = await probe("dark");
await browser.close();
server.close();

const f2 = (x) => (x === null || x === undefined ? "—" : (+x).toFixed(2));
const rows = [
  ["adjacent band separation (min)", f2(light.minAdjacent), f2(dark.minAdjacent), "the weakest boundary between two depots; ~1.15+ is readable without counting stripes"],
  ["adjacent band separation (max)", f2(light.maxAdjacent), f2(dark.maxAdjacent), "how far apart the best pair is — the ramp's spread"],
  ["fill vs panel (min)", f2(light.minFillPanel), f2(dark.minFillPanel), "WCAG 1.4.11 asks 3.00 for meaningful marks"],
  ["greyscale rank ρ", f2(light.rho), f2(dark.rho), "+1 = the biggest depot is the heaviest band (darkest in light, brightest in dark); the chart must survive print and colour-blindness"],
  ["primary / secondary KPI type", f2(light.kpiRatio), f2(dark.kpiRatio), "1.00 = five equal cards; > 1.2 = the page says what to read first"],
  ["plot ink (data share of plot box)", f2(light.plotInk), f2(dark.plotInk), "reading density"],
  ["bands painted", light.bandsPainted, dark.bandsPainted, "series in the stack"],
];
const md = [
  "# 02-dashboard — chart legibility, measured",
  "",
  "Generated by `02-dashboard/measure.mjs` from the rendered page: computed fill colours (with the",
  "alpha the page actually painted) and the drawn SVG geometry. Run it against any copy with",
  "`node 02-dashboard/measure.mjs --url <task-dir> --out <file>`.",
  "",
  "| measure | light | dark | what it is for |",
  "| --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
  "",
  `Depot order used for the rank: ${light.codes} (largest depot first).`,
  "",
].join("\n");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, md);
console.log(md);
