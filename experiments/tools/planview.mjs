#!/usr/bin/env node
/*
 * planview.mjs — draw the baked Tallinn plan from above and screenshot it, so the placement can be
 * looked at before any 3D exists: footprints, streets, wall ring, hill outline, landmarks.
 *
 *   node experiments/tools/planview.mjs [out.png]
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pw from "playwright-core";
import { generateTallinn } from "../7-tallinn-diorama/layout.js";
import { STREETS } from "../7-tallinn-diorama/osm.js";

const OUT = resolve(process.argv[2] || "/tmp/tln-plan.png");
const city = generateTallinn();
const { terr } = city;

const W = 1500, H = 1500, S = 1.05;
const cx = -40, cz = -110;                              // centre the picture on the town
const px = (x) => W / 2 + (x - cx) * S;
const pz = (z) => H / 2 + (z - cz) * S;

const parts = [];
// sea
parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#12212e"/>`);
let coast = city.terr.COAST.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ");
parts.push(`<polygon points="${px(-900)},${pz(-1200)} ${coast} ${px(1000)},${pz(-1200)}" fill="#16344a"/>`);
// land + hill
parts.push(`<polygon points="${city.terr.TOOMP.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ")}" fill="#1e3a24" stroke="#4c8a55" stroke-width="1.5"/>`);
// wall
parts.push(`<polyline points="${terr.WALL_PATH.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ")}" fill="none" stroke="#d9c48a" stroke-width="3.5"/>`);
// streets (osm.js stores each polyline as [x, z] *pairs*, not a flat array — walking it as numbers
// silently produced a polyline of "NaN,NaN" and a plan with no streets in it at all)
for (const s of STREETS) {
  const pts = s.p.map(([x, z]) => `${px(x)},${pz(z)}`);
  parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${s.m ? "#e8dcc0" : "#6b7a86"}" stroke-opacity="${s.m ? 0.9 : 0.5}" stroke-width="${(s.w * S).toFixed(1)}" stroke-linecap="round"/>`);
}
// squares
for (const q of city.squares) {
  parts.push(`<g transform="translate(${px(q.x)},${pz(q.z)}) rotate(${(q.rot * 180 / Math.PI).toFixed(1)})"><rect x="${-q.w / 2 * S}" y="${-q.d / 2 * S}" width="${q.w * S}" height="${q.d * S}" fill="${q.surface === "grass" ? "#2f5b32" : "#3b4a55"}" stroke="#8fa3b3" stroke-width="0.8"/></g>`);
}
// houses
for (const h of city.houses) {
  parts.push(`<g transform="translate(${px(h.x)},${pz(h.z)}) rotate(${(h.rot * 180 / Math.PI).toFixed(1)})"><rect x="${-h.w / 2 * S}" y="${-h.d / 2 * S}" width="${h.w * S}" height="${h.d * S}" fill="#c98a4a" fill-opacity="0.86" stroke="#20140c" stroke-width="0.6"/></g>`);
}
// modern fringe
for (const b of city.blocks) {
  parts.push(`<g transform="translate(${px(b.x)},${pz(b.z)}) rotate(${(b.rot * 180 / Math.PI).toFixed(1)})"><rect x="${-b.w / 2 * S}" y="${-b.d / 2 * S}" width="${b.w * S}" height="${b.d * S}" fill="#5d6b78" fill-opacity="0.75"/></g>`);
}
// towers, trees
for (const t of city.towers) parts.push(`<circle cx="${px(t.x)}" cy="${pz(t.z)}" r="${(t.r * S).toFixed(1)}" fill="#e6d3a3" stroke="#000" stroke-width="0.5"/>`);
for (const t of city.trees) parts.push(`<circle cx="${px(t.x)}" cy="${pz(t.z)}" r="${(2.2 * t.s).toFixed(1)}" fill="#57a05a" fill-opacity="0.8"/>`);
// landmarks + labels
for (const l of city.landmarks) {
  parts.push(`<circle cx="${px(l.x)}" cy="${pz(l.z)}" r="7" fill="#ff5d5d" stroke="#fff" stroke-width="1.6"/>`);
  parts.push(`<text x="${px(l.x) + 10}" y="${pz(l.z) + 4}" fill="#fff" font-size="15" font-family="monospace" paint-order="stroke" stroke="#000" stroke-width="3.5">${l.id} (${l.x},${l.z})</text>`);
}
// ground-height readout of a few probes, drawn as text
const probes = [[0, 22, "raekoda"], [-348, 16, "toomkirik"], [-448, 161, "loss"], [147, -457, "oleviste"], [241, -596, "margareeta"], [-228, 278, "kiek"], [282, 71, "viru"], [24, -100, "puhavaimu"], [-142, 144, "niguliste"], [300, 200, "outside-s"], [-600, 60, "west"]];
parts.push(probes.map(([x, z, n], i) => `<text x="14" y="${26 + i * 19}" fill="#ffd479" font-size="14" font-family="monospace">${n.padEnd(11)} y=${terr.ground(x, z).toFixed(1)} slope=${terr.slope(x, z).toFixed(2)}</text>`).join(""));
parts.push(`<text x="14" y="${26 + probes.length * 19 + 8}" fill="#8ee8ff" font-size="14" font-family="monospace">${city.houses.length} houses · ${city.trees.length} trees · ${city.towers.length} towers · ${city.roads.length} roads</text>`);

const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0b0f14}svg{display:block}</style><svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
const tmp = "/tmp/tln-plan.html";
await writeFile(tmp, html);

const browser = await pw.chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true, args: ["--disable-gpu", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`file://${tmp}`);
await page.screenshot({ path: OUT, type: "png" });
await browser.close();
console.log(OUT, `${city.houses.length} houses, ${city.blocks.length} blocks, ${city.trees.length} trees, ${city.towers.length} towers`);
