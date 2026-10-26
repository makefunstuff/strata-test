// Draws the hero map sheet: hypsometric hillshade on canvas, contours from the same
// field with marching squares, then the loch, the route, its elevation profile, the
// grid, compass and scale bar in SVG. Everything is drawn from one elevation field,
// so the contours, the profile and the spot heights always agree.
import { terrain, paintTerrain, contourSegments, chain, toPath } from "./terrain.js";

const W = 1200, H = 760;
const g = (id) => document.getElementById(id);
const h = terrain(11);
const BASE = 180, SPAN = 680;                       // field value 0..1 = 180 m..860 m
const metres = (v) => BASE + v * SPAN;

// 1. hillshade + hypsometric bands
paintTerrain(document.getElementById("terrain"), h, { w: W, hh: H, sun: [-0.5, -0.7], steps: 20, relief: 0.22 });

// 2. contours: a 10 m interval with a 50 m index, all from the same field
const levels = [];
for (let e = 210; e <= 810; e += 10) levels.push((e - BASE) / SPAN);
const isIndex = (lv) => Math.abs(metres(lv) % 50) < 3;
let minor = "", major = "";
const byLevel = new Map();
levels.forEach((lv) => {
  const lines = chain(contourSegments(h, lv, 120, 76));
  byLevel.set(lv, lines);
  const d = toPath(lines, W, H);
  if (isIndex(lv)) major += d; else minor += d;
});
g("contours").innerHTML = `<path d="${minor}"/>`;
g("index").innerHTML = `<path d="${major}"/>`;

// 3. grid: 1 km cells, kept faint, with graticule ticks on the frame
const grid = [];
for (let x = 100; x < W; x += 100) grid.push(`M${x} 18V${H - 18}`);
for (let y = 100; y < H; y += 100) grid.push(`M18 ${y}H${W - 18}`);
const ticks = [];
for (let x = 50; x < W - 20; x += 50) ticks.push(`M${x} 18v10M${x} ${H - 18}v-10`);
for (let y = 50; y < H - 20; y += 50) ticks.push(`M18 ${y}h10M${W - 18} ${y}h-10`);
g("water").insertAdjacentHTML("beforebegin",
  `<path d="${grid.join("")}" stroke="#4b4433" stroke-width="1" opacity="0.07" fill="none"/>`
  + `<path d="${ticks.join("")}" stroke="#4b4433" stroke-width="1.4" opacity="0.5" fill="none"/>`
  + `<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#4b4433" stroke-width="2.2" opacity="0.55"/>`
  + `<rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#4b4433" stroke-width="0.8" opacity="0.28"/>`);

// 4. contour spot heights on the index contours, right of the summit
const spot = (lv) => {
  for (const { pts } of byLevel.get(lv) || []) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a[0] + b[0]) / 2 * W, my = (a[1] + b[1]) / 2 * H;
      if (mx < 940 || mx > 1120 || my < 120 || my > 620) continue;
      const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (Math.abs(ang) > 62) continue;                     // only the flanks that run near-vertical
      const flip = ang > 20 ? 180 : 0;
      return `<g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${(ang + flip).toFixed(1)})" filter="url(#halo)">
        <text x="0" y="-6" text-anchor="middle" font-size="13" font-weight="600" fill="#4a4231">${Math.round(metres(lv) / 10) * 10}</text></g>`;
    }
  }
  return "";
};
g("index").insertAdjacentHTML("afterend", levels.filter(isIndex).map(spot).join(""));

// 5. the loch in the south-west valley
const loch = "M96 626c56-58 168-70 232-32 56 32 50 96-16 124-70 30-196 24-226-18-14-18-8-46 10-74z";
g("water").innerHTML =
  `<path d="${loch}" fill="#a4c6cf" stroke="#4f7f8b" stroke-width="1.8"/>`
  + `<path d="M140 646c44-32 108-36 150-16M164 686c38-22 88-24 124-10M196 718c28-14 62-16 88-8" fill="none" stroke="#7ba7b2" stroke-width="1.5"/>`;

// 6. the route: car park → col → summit, and the profile it implies
const pts = [[336, 694], [392, 646], [430, 622], [470, 570], [530, 530], [600, 470], [664, 452], [712, 392], [768, 352], [802, 306]];
const summit = [838, 258];
const route = [...pts, summit];
const catmull = (p, k = 1 / 6) => {
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += `C${b[0] + (c[0] - a[0]) * k} ${b[1] + (c[1] - a[1]) * k} ${c[0] - (e[0] - b[0]) * k} ${c[1] - (e[1] - b[1]) * k} ${c[0]} ${c[1]}`;
  }
  return d;
};
const full = catmull(route);
const climb = catmull(route.slice(6));
/* The scale bar drawn below is 180 sheet units and says 2 km, so the sheet is its own authority on
   distance: 1 unit = 2000/180 metres. Every number this page quotes is derived from that and from
   the elevation field, and 01-landing/measure.mjs refuses a page that quotes a number its own
   drawing contradicts — which is what it found: the legend said 11.4 km for a route the sheet draws
   at 7.5 km, and the profile said +640 m for a field that gains 602 m. */
const M_PER_UNIT = 2000 / 180;
const curveLen = (p, k = 1 / 6) => {
  let L = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    const P = [b, [b[0] + (c[0] - a[0]) * k, b[1] + (c[1] - a[1]) * k],
               [c[0] - (e[0] - b[0]) * k, c[1] - (e[1] - b[1]) * k], c];
    let prev = P[0];
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const u = 1 - t;
      const x = u*u*u*P[0][0] + 3*u*u*t*P[1][0] + 3*u*t*t*P[2][0] + t*t*t*P[3][0];
      const y = u*u*u*P[0][1] + 3*u*u*t*P[1][1] + 3*u*t*t*P[2][1] + t*t*t*P[3][1];
      L += Math.hypot(x - prev[0], y - prev[1]); prev = [x, y];
    }
  }
  return L;
};
g("route").innerHTML =
  `<path d="${full}" fill="none" stroke="#fbf7ee" stroke-width="6" opacity="0.42" stroke-linecap="round"/>`
  + `<path d="${full}" fill="none" stroke="#c2410c" stroke-width="3.4" stroke-linecap="round"/>`
  + `<path d="${climb}" fill="none" stroke="#8a2b06" stroke-width="1.6" stroke-dasharray="8 7" stroke-linecap="round"/>`;

// sample the profile from the same polyline
const prof = (() => {
  const N = 64, out = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * (route.length - 1);
    const k = Math.floor(t), f = t - k;
    const a = route[k], b = route[Math.min(k + 1, route.length - 1)];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    out.push(metres(h(x / W, y / H)));
  }
  return out;
})();
const pmin = Math.min(...prof), pmax = Math.max(...prof);
const at = (x, y) => Math.round(metres(h(x / W, y / H)));
const peak = at(838, 250);          // the summit marker's own apex
const col = at(676, 476);           // the col label's own position
const park = at(336, 694);          // the route's first point, the car park
const start = Math.round(prof[0]);  // where the route begins, from the profile's own samples
const gain = Math.round(pmax - pmin);
const routeUnits = curveLen(route);
const routeKm = +((routeUnits * M_PER_UNIT) / 1000).toFixed(1);
const pw = 250, ph = 54;
const px = (i) => (i / (prof.length - 1)) * pw;
const py = (v) => ph - ((v - pmin) / (pmax - pmin)) * (ph - 8);
const pline = prof.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join("");

// 7. marks
g("marks").innerHTML = `
  <g filter="url(#halo)">
    <g fill="#fffdf7" stroke="#16563f" stroke-width="2.4">
      <circle cx="336" cy="694" r="13"/>
      <circle cx="470" cy="570" r="8.5"/>
      <circle cx="664" cy="452" r="8.5"/>
    </g>
    <path d="M330 687h5.6c3 0 5.2 2.2 5.2 5.2s-2.2 5.2-5.2 5.2H333v5.4h-3z" fill="#16563f" stroke="none"/>
    <path d="M465 565l10 10M475 565l-10 10" stroke="#16563f" stroke-width="2" fill="none"/>
    <path d="M838 238l13 24h-26z" fill="#15191b" stroke="#fbf7ee" stroke-width="1.8"/>
  </g>`;

// 8. labels, plates and the profile
const label = (x, y, text, { size = 16, weight = 600, fill = "#2a2519", anchor = "start", opacity = 1, ls = "0.01em" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${ls}" text-anchor="${anchor}" opacity="${opacity}" filter="url(#halo)">${text}</text>`;
g("labels").innerHTML =
  label(864, 236, "Stob Bàn", { size: 24, weight: 700 })
  + label(864, 260, `${peak} m`, { size: 16, fill: "#6b5f45" })
  + label(150, 654, "Loch nan Sléibhe", { size: 18, fill: "#2c5a66" })
  + label(358, 700, `car park ${park} m`, { size: 14, fill: "#3f3828", weight: 500 })
  + label(676, 476, `the col ${col} m`, { size: 14, fill: "#3f3828", weight: 500 })
  + label(520, 590, "path, wall to the right", { size: 13, fill: "#4a4231", weight: 500 })
  // scale bar plate
  + `<g transform="translate(912 640)">
       <rect x="0" y="0" width="216" height="66" rx="7" fill="#fffdf7" opacity="0.93" stroke="#ded4c2"/>
       <text x="14" y="20" font-size="12" fill="#4a4231" letter-spacing="0.09em" font-weight="700">SCALE 1:25 000</text>
       <g stroke="#15191b" stroke-width="1.2">
         <rect x="14" y="30" width="45" height="9" fill="#15191b"/><rect x="59" y="30" width="45" height="9" fill="#fffdf7"/>
         <rect x="104" y="30" width="45" height="9" fill="#15191b"/><rect x="149" y="30" width="45" height="9" fill="#fffdf7"/>
       </g>
       <text x="14" y="56" font-size="12" fill="#4a4231">0</text>
       <text x="104" y="56" font-size="12" fill="#4a4231" text-anchor="middle">1</text>
       <text x="194" y="56" font-size="12" fill="#4a4231" text-anchor="end">2 km</text>
     </g>`
  // compass rose
  + `<g transform="translate(1102 132)" stroke="#2a2519" fill="none">
       <circle r="34" fill="#fffdf7" fill-opacity="0.93" stroke="#ded4c2" stroke-width="1.6"/>
       <path d="M0 -25 7 11 0 4 -7 11z" fill="#15191b" stroke="none"/>
       <path d="M0 -34v7M0 27v7M-34 0h7M27 0h7" stroke-width="1.6"/>
       <text y="-40" text-anchor="middle" font-size="14" font-weight="700" fill="#2a2519" stroke="none">N</text>
     </g>
     ${label(1102, 192, "var. 3° W", { size: 12, fill: "#4a4231", weight: 600, anchor: "middle" })}`
  // sheet plate
  + `<g transform="translate(44 44)">
       <rect x="0" y="0" width="228" height="50" rx="7" fill="#fffdf7" opacity="0.94" stroke="#ded4c2"/>
       <text x="15" y="21" font-size="14" font-weight="700" fill="#2a2519" letter-spacing="0.09em">SHEET 41 · STOB BÀN</text>
       <text x="15" y="38" font-size="11.5" fill="#6b5f45" letter-spacing="0.03em">contours 10 m · index 50 m · surveyed 2025</text>
     </g>`
  // elevation profile of the route, bottom left
  + `<g transform="translate(430 612)">
       <rect x="0" y="0" width="${pw + 28}" height="${ph + 52}" rx="7" fill="#fffdf7" opacity="0.94" stroke="#ded4c2"/>
       <text x="14" y="20" font-size="12" font-weight="700" fill="#2a2519" letter-spacing="0.09em">PROFILE · ${routeKm} KM · +${gain} M</text>
       <g transform="translate(14 32)">
         <path d="${pline}L${pw} ${ph}L0 ${ph}Z" fill="#c2410c" opacity="0.16"/>
         <path d="${pline}" fill="none" stroke="#c2410c" stroke-width="2"/>
         <line x1="0" y1="${ph}" x2="${pw}" y2="${ph}" stroke="#cabfa9" stroke-width="1"/>
         <circle cx="0" cy="${py(pmin).toFixed(1)}" r="3" fill="#15191b"/>
         <circle cx="${pw}" cy="${py(pmax).toFixed(1)}" r="3" fill="#15191b"/>
         <text x="0" y="${(py(pmin) + 12).toFixed(1)}" font-size="10.5" fill="#4a4231">${start} m</text>
         <text x="${pw}" y="10" font-size="10.5" fill="#4a4231" text-anchor="end">${peak} m</text>
       </g>
     </g>`;

// 9. the numbers the page quotes *outside* the sheet are printed from the same derivation, so the
//    legend, the plate, the spot heights and the hero strip cannot tell four different stories;
//    01-landing/measure.mjs reads these values back off the window and checks the sentences.
window.__sheet = { routeKm, routeUnits: Math.round(routeUnits), start, park, peak, col, gain,
  pmin: Math.round(pmin), pmax: Math.round(pmax), mPerUnit: +M_PER_UNIT.toFixed(3),
  samples: prof.length, prof: prof.map((v) => +v.toFixed(1)) };
const say = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt };
say("#legendKm", `${routeKm} km`);
say("#heroKm", `${routeKm} km`);
say("#heroGain", `+${gain} m`);
say("#heroPeak", `${peak} m`);
say("#heroStart", `${park} m`);
const overlay = document.getElementById("overlay");
if (overlay) overlay.setAttribute("aria-label",
  `A Foldline map sheet: contour lines around the ${peak}-metre peak of Stob Bàn, with a red route of ${routeKm} km climbing from the loch to the summit.`);

// The hero's left column ran out before the sheet's height — the page's own notes named it "a soft
// gap". The route's elevation profile, at hero scale, drawn from the same 64 samples as the plate's
// strip: the gap is filled with the subject, and it is the same fact twice rather than a decoration.
const heroProf = document.getElementById("heroProfile");
if (heroProf) {
  const HW = 452, HH = 96, pd = 12, lo = pmin - 25, hi = pmax + 25, plot = HH - 2 * pd - 14;
  const X = (i) => pd + (i / (prof.length - 1)) * (HW - 2 * pd);
  const Y = (v) => HH - pd - ((v - lo) / (hi - lo)) * plot;
  const line = prof.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => X(Math.round(f * (prof.length - 1))).toFixed(1));
  heroProf.innerHTML =
    `<svg viewBox="0 0 ${HW} ${HH}" role="img" aria-label="Elevation profile of the route: ${start} metres at the car park, climbing to ${peak} metres at the summit, ${gain} metres of gain over ${routeKm} kilometres.">
       <rect x="0" y="0" width="${HW}" height="${HH}" fill="var(--paper-2)" stroke="var(--line)"/>
       <path d="${line}L${(HW - pd).toFixed(1)} ${(HH - pd).toFixed(1)}L${pd} ${(HH - pd).toFixed(1)}Z" fill="var(--route)" opacity="0.14"/>
       <path d="${line}" fill="none" stroke="var(--route)" stroke-width="2" stroke-linejoin="round"/>
       <line x1="${pd}" y1="${(HH - pd).toFixed(1)}" x2="${HW - pd}" y2="${(HH - pd).toFixed(1)}" stroke="var(--line-2)"/>
       ${ticks.map((x) => `<line x1="${x}" y1="${HH - pd}" x2="${x}" y2="${HH - pd + 4}" stroke="var(--line-2)"/>`).join("")}
       <circle cx="${pd}" cy="${Y(pmin).toFixed(1)}" r="3" fill="var(--ink)"/>
       <circle cx="${(HW - pd).toFixed(1)}" cy="${Y(pmax).toFixed(1)}" r="3" fill="var(--ink)"/>
       <text x="${pd + 7}" y="${(Y(pmin) - 6).toFixed(1)}" class="hp-t">${park} m</text>
       <text x="${(HW - pd - 4).toFixed(1)}" y="${(Y(pmax) - 6).toFixed(1)}" text-anchor="end" class="hp-t">${peak} m</text>
     </svg>
     <figcaption class="hp-cap"><span class="mono">${routeKm} km</span> · <span class="mono">+${gain} m</span> · the same 64 samples as the sheet's profile plate</figcaption>`;
}
