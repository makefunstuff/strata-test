// Every surface is painted on a canvas at load time: timber-framed bays, plaster, stone courses,
// roof tile / slate / thatch, planks, and the cut-away soil strata of the diorama base. No image
// files, so the page stays one folder of plain text.
import * as THREE from "three";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d") };
}

function tex(c, { repeat = 1, repeatY = null, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeatY ?? repeat);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** speckled noise, the base grain of every material here */
function speckle(g, w, h, n, colors, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(R() * colors.length) | 0];
    const s = size[0] + R() * (size[1] - size[0]);
    g.globalAlpha = 0.05 + R() * 0.3;
    g.fillRect(R() * w, R() * h, s, s * (0.6 + R()));
  }
  g.globalAlpha = 1;
}

function hex(v) { return "#" + v.toString(16).padStart(6, "0"); }
function shade(col, k) {
  const r = ((col >> 16) & 255), gg = (col >> 8) & 255, b = col & 255;
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * k)));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

const S = 128; // one bay of wall = S px

/**
 * One timber-framed bay: plaster infill, corner posts, floor rails, a window, and — by variant —
 * diagonal braces, brick nogging or shutters. Tiled horizontally it reads as a row of bays, which
 * is why house widths are snapped to whole bays.
 */
function bayTexture(rng, { plaster = 0xe3d5b8, timber = 0x4a3524, glass = 0x2a2b30, style = 0, boards = false } = {}) {
  const { c, g } = canvas(S, S);
  // ground
  g.fillStyle = boards ? shade(timber, 1.25) : hex(plaster);
  g.fillRect(0, 0, S, S);
  if (boards) {
    // vertical board siding
    for (let x = 0; x < S; x += 7) {
      g.fillStyle = `rgba(0,0,0,${0.10 + R() * 0.16})`;
      g.fillRect(x, 0, 1.6, S);
      g.fillStyle = `rgba(255,235,200,${0.03 + R() * 0.05})`;
      g.fillRect(x + 2, 0, 3, S);
    }
  } else {
    speckle(g, S, S, 900, ["#ffffff", "#8b7b5f", "#c9b894", "#5d5140"], [1, 4]);
    // faint lime-wash blotches
    for (let i = 0; i < 22; i++) {
      g.globalAlpha = 0.05 + R() * 0.07;
      g.fillStyle = R() < 0.5 ? "#fffaf0" : "#9c8a6a";
      const r = 6 + R() * 22;
      g.beginPath(); g.arc(R() * S, R() * S, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  const post = 11;
  const beamCol = shade(timber, 1);
  function beam(x, y, w, h) {
    g.fillStyle = beamCol; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,220,170,0.10)"; g.fillRect(x, y, w, 1.5);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, y + h - 1.5, w, 1.5);
    // grain
    g.fillStyle = "rgba(0,0,0,0.16)";
    for (let i = 0; i < 4; i++) g.fillRect(x + R() * w, y, 1, h);
  }
  // corner posts + floor rails (rails land at every bay boundary, i.e. every storey)
  beam(0, 0, post, S); beam(S - post, 0, post, S);
  beam(0, 0, S, 9); beam(0, S - 11, S, 11);
  if (style === 1) { // St Andrew's cross
    g.save(); g.translate(S / 2, S / 2);
    beam(-S / 2 + post, -3, S - post * 2, 8);
    g.rotate(0.62); beam(-S / 2, -4, S, 8); g.rotate(-1.24); beam(-S / 2, -4, S, 8);
    g.restore();
  } else if (style === 2) { // square + braces
    beam(post, S * 0.46, S - post * 2, 8);
    g.save(); g.translate(post + 10, S - 12); g.rotate(-0.9); beam(0, -4, S * 0.42, 7); g.restore();
    g.save(); g.translate(S - post - 10, S - 12); g.rotate(Math.PI + 0.9); beam(0, -4, S * 0.42, 7); g.restore();
  } else if (style === 3 && !boards) { // brick nogging in the lower half
    for (let y = S * 0.55; y < S - 12; y += 7) {
      for (let x = post + ((y / 7) % 2) * 5; x < S - post; x += 11) {
        g.fillStyle = `rgb(${128 + R() * 40 | 0},${62 + R() * 26 | 0},${44 + R() * 18 | 0})`;
        g.fillRect(x, y, 9.5, 5.6);
      }
    }
  }
  // window
  const wx = 30, wy = 24, ww = S - 60, wh = 54;
  if (style === 4 && !boards) {
    // shuttered: narrower, with boarded shutters
    g.fillStyle = shade(timber, 1.5); g.fillRect(wx - 6, wy - 3, ww + 12, wh + 6);
    g.fillStyle = hex(glass); g.fillRect(wx, wy, ww, wh);
    g.fillStyle = shade(timber, 1.35);
    g.fillRect(wx, wy, ww / 2 - 1, wh); g.fillRect(wx + ww / 2 + 1, wy, ww / 2 - 1, wh);
    g.fillStyle = "rgba(0,0,0,0.3)";
    for (let x = wx + 2; x < wx + ww; x += 5) { g.fillRect(x, wy, 1, wh); }
  } else {
    g.fillStyle = shade(timber, 0.85); g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    g.fillStyle = hex(glass); g.fillRect(wx, wy, ww, wh);
    // panes
    const cols = boards ? 2 : 3, rows = 2;
    g.strokeStyle = "rgba(228,214,180,0.55)"; g.lineWidth = 1.4;
    for (let i = 1; i < cols; i++) { const x = wx + (ww * i) / cols; g.beginPath(); g.moveTo(x, wy); g.lineTo(x, wy + wh); g.stroke(); }
    for (let j = 1; j < rows; j++) { const y = wy + (wh * j) / rows; g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + ww, y); g.stroke(); }
    // sky reflection in the upper panes so windows are not dead black
    const grd = g.createLinearGradient(0, wy, 0, wy + wh);
    grd.addColorStop(0, "rgba(150,180,210,0.30)");
    grd.addColorStop(0.55, "rgba(40,44,54,0.05)");
    grd.addColorStop(1, "rgba(20,16,10,0.35)");
    g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
    // sill
    g.fillStyle = shade(timber, 1.2); g.fillRect(wx - 7, wy + wh + 3, ww + 14, 4);
  }
  // a quiet vertical gradient: grime below, weather above
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, "rgba(255,246,220,0.06)");
  gr.addColorStop(0.75, "rgba(40,26,12,0.10)");
  gr.addColorStop(1, "rgba(20,12,4,0.20)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

function plasterTexture(rng, col = 0xd9c9a8) {
  const { c, g } = canvas(S, S);
  g.fillStyle = hex(col); g.fillRect(0, 0, S, S);
  speckle(g, S, S, 1400, ["#ffffff", "#7d6c50", "#efe3c6", "#4d4234"], [1, 5]);
  for (let i = 0; i < 16; i++) {
    g.globalAlpha = 0.06 + R() * 0.08;
    g.fillStyle = R() < 0.5 ? "#fffaf0" : "#8a775a";
    g.beginPath(); g.arc(R() * S, R() * S, 8 + R() * 26, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, "rgba(255,250,230,0.07)");
  gr.addColorStop(1, "rgba(30,20,10,0.22)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

function stoneTexture(rng, { col = 0x9a9284, block = [26, 40], course = 18, mortar = 0.55 } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, mortar); g.fillRect(0, 0, S, S);
  let y = 0;
  let row = 0;
  while (y < S) {
    const h = course * (0.8 + R() * 0.45);
    let x = row % 2 ? -block[0] * 0.5 : 0;
    while (x < S) {
      const w = block[0] * (0.65 + R() * 0.8);
      const inset = 1.6;
      const k = 0.78 + R() * 0.5;
      g.fillStyle = shade(col, k);
      g.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
      // a chamfer: light on top, dark under
      g.fillStyle = "rgba(255,250,235,0.13)";
      g.fillRect(x + inset, y + inset, w - inset * 2, 1.6);
      g.fillStyle = "rgba(0,0,0,0.20)";
      g.fillRect(x + inset, y + h - inset - 1.6, w - inset * 2, 1.6);
      x += w;
    }
    y += h; row++;
  }
  speckle(g, S, S, 900, ["#ffffff", "#3b3630", "#cdc5b4"], [1, 3]);
  return c;
}

function roofTexture(rng, { kind = "tile", col = 0xa0522c } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, 0.6); g.fillRect(0, 0, S, S);
  if (kind === "tile") {
    // rounded clay tiles in courses, each course overlapping the one below
    const r = 11;
    for (let row = -1; row * r * 1.05 < S + r; row++) {
      const y = row * r * 1.15;
      for (let i = -1; i * r * 2 < S + r * 2; i++) {
        const x = i * r * 2 + (row % 2 ? r : 0);
        const k = 0.72 + R() * 0.55;
        g.fillStyle = shade(col, k);
        g.beginPath();
        g.moveTo(x, y + r * 1.5);
        g.lineTo(x, y + r * 0.5);
        g.quadraticCurveTo(x + r, y - r * 0.35, x + r * 2, y + r * 0.5);
        g.lineTo(x + r * 2, y + r * 1.5);
        g.closePath(); g.fill();
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.fillRect(x + r * 2 - 2.4, y + r * 0.35, 2.4, r * 1.15);
        g.fillStyle = "rgba(255,225,190,0.13)";
        g.fillRect(x + 1.5, y + r * 0.45, 2, r);
      }
    }
    // moss
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = 0.10 + R() * 0.18;
      g.fillStyle = "#59703a";
      g.beginPath(); g.arc(R() * S, R() * S, 3 + R() * 9, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  } else if (kind === "slate") {
    const h = 13;
    let row = 0;
    for (let y = -h; y < S + h; y += h) {
      let x = (row % 2) * -9;
      while (x < S) {
        const w = 12 + R() * 16;
        g.fillStyle = shade(col, 0.62 + R() * 0.7);
        g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = "rgba(255,255,255,0.09)";
        g.fillRect(x + 1, y + 1, w - 2, 1.3);
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(x + 1, y + h - 2.3, w - 2, 1.3);
        x += w;
      }
      row++;
    }
    speckle(g, S, S, 500, ["#dfe7ef", "#1b2026"], [1, 3]);
  } else { // thatch
    g.fillStyle = shade(col, 0.8); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const y = R() * S;
      g.strokeStyle = shade(col, 0.5 + R() * 0.85);
      g.globalAlpha = 0.35 + R() * 0.5;
      g.lineWidth = 0.8 + R() * 1.4;
      g.beginPath();
      const x = R() * S;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 3, y + 6, x + (R() - 0.5) * 8, y + 14);
      g.stroke();
    }
    g.globalAlpha = 1;
    // course bands of a swept eave
    for (let y = 12; y < S; y += 26) {
      g.strokeStyle = "rgba(60,40,14,0.35)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y - 4, S * 0.7, y + 4, S, y); g.stroke();
    }
  }
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, "rgba(255,240,210,0.10)");
  gr.addColorStop(1, "rgba(10,6,2,0.18)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

function plankTexture(rng, col = 0x6b4c2c) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, 0.75); g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 13) {
    g.fillStyle = shade(col, 0.7 + R() * 0.6);
    g.fillRect(x, 0, 11.4, S);
    g.fillStyle = "rgba(255,235,200,0.06)";
    g.fillRect(x + 1, 0, 1.5, S);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(x + 11, 0, 1.4, S);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.12})`;
      g.fillRect(x + 2 + R() * 7, R() * S, 0.9, 6 + R() * 26);
    }
  }
  return c;
}

/** The cut-away edge of the diorama: topsoil and roots, clay, sandstone, then solid rock. */
function strataTexture(rng) {
  const { c, g } = canvas(512, 256);
  const bands = [
    { h: 0.07, col: 0x4c3f27, grain: ["#6f5c38", "#2b2317", "#87a05a"] },   // topsoil + grass creep
    { h: 0.13, col: 0x5a4326, grain: ["#7a5c34", "#33261a", "#a08455"] },   // dark earth, roots
    { h: 0.16, col: 0x7a5c39, grain: ["#9a7846", "#4a3620", "#c0a06a"] },   // clay-with-lumps
    { h: 0.20, col: 0x8d7350, grain: ["#b09468", "#5b452c", "#d3bb8d"] },   // sand
    { h: 0.22, col: 0x7d7466, grain: ["#a39a89", "#4b453b", "#c8bfab"] },   // sandstone
    { h: 0.22, col: 0x59544c, grain: ["#7b746a", "#332f2a", "#9a938a"] },   // rock
  ];
  let y = 0;
  for (const b of bands) {
    const hh = Math.round(b.h * 256);
    g.fillStyle = hex(b.col); g.fillRect(0, y, 512, hh);
    // wavy boundary with the band below
    g.fillStyle = hex(bands[(bands.indexOf(b) + 1) % bands.length].col);
    g.beginPath();
    g.moveTo(0, y + hh);
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + hh - 6 - Math.sin(x * 0.05 + b.h * 30) * 5 - R() * 5);
    g.lineTo(512, y + hh + 10); g.lineTo(0, y + hh + 10); g.closePath(); g.fill();
    speckle(g, 512, hh > 4 ? hh : 4, 1500, b.grain, [1, 6]);
    // bedding planes
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + R() * 0.12})`;
      const ly = y + R() * hh;
      g.fillRect(0, ly, 512, 1 + R() * 2);
    }
    y += hh;
  }
  // embedded stones and roots
  for (let i = 0; i < 46; i++) {
    const x = R() * 512, sy = 40 + R() * 200, r = 1.5 + R() * 3.5;
    g.fillStyle = `rgb(${68 + R() * 30 | 0},${63 + R() * 27 | 0},${56 + R() * 24 | 0})`;
    g.beginPath(); g.ellipse(x, sy, r, r * (0.6 + R() * 0.5), R() * 3, 0, 7); g.fill();
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(x, sy + r * 0.35, r, r * 0.3, 0, 0, 7); g.fill();
  }
  for (let i = 0; i < 8; i++) {
    g.strokeStyle = `rgba(${52 + R() * 24 | 0},${38 + R() * 18 | 0},20,0.34)`;
    g.lineWidth = 1 + R() * 1.8;
    g.beginPath();
    let x = R() * 512, yy = 6;
    g.moveTo(x, yy);
    for (let s = 0; s < 7; s++) { x += (R() - 0.5) * 26; yy += 6 + R() * 14; g.lineTo(x, yy); }
    g.stroke();
  }
  // vertical cracks
  for (let i = 0; i < 16; i++) {
    g.strokeStyle = "rgba(0,0,0,0.34)";
    g.lineWidth = 1 + R() * 3;
    g.beginPath();
    let x = R() * 512, yy = 30 + R() * 40;
    g.moveTo(x, yy);
    for (let s = 0; s < 8; s++) { x += (R() - 0.5) * 12; yy += 12 + R() * 20; g.lineTo(x, yy); }
    g.stroke();
  }
  return c;
}

/** soft round sprite for smoke, glow and torch halos */
function radialTexture(rgbaInner, rgbaOuter, size = 64) {
  const { c, g } = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, rgbaInner);
  gr.addColorStop(0.45, rgbaInner.replace(/[\d.]+\)$/, "0.45)"));
  gr.addColorStop(1, rgbaOuter);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

// every painter below draws from this one stream, so a seed reproduces its textures too
let R = Math.random;

/**
 * Paint every canvas texture. `bays` holds the timber-framed facade variants; every house picks
 * one, which is also what batches the town into a handful of draw calls.
 */
export function buildTextures(seedRng) {
  R = seedRng.next;
  const bayVariants = [
    { plaster: 0xe6d8bb, timber: 0x4a3524, style: 0 },
    { plaster: 0xdcc9a4, timber: 0x3a2a1c, style: 1 },
    { plaster: 0xe9dcc2, timber: 0x54402c, style: 2 },
    { plaster: 0xcfc0a2, timber: 0x33251a, style: 3 },
    { plaster: 0xe2d3b4, timber: 0x453322, style: 4 },
    { boards: true, timber: 0x6a4c2e, style: 0 },
    { boards: true, timber: 0x503a24, style: 2 },
  ];
  return {
    bays: bayVariants.map((v) => tex(bayTexture(seedRng, v))),
    plaster: [tex(plasterTexture(seedRng, 0xdccaaa)), tex(plasterTexture(seedRng, 0xc9b898))],
    stone: [tex(stoneTexture(seedRng, { col: 0x9c9484 })), tex(stoneTexture(seedRng, { col: 0x8a8478, block: [20, 30], course: 13 }))],
    roofTile: tex(roofTexture(seedRng, { kind: "tile", col: 0xa4562e })),
    roofSlate: tex(roofTexture(seedRng, { kind: "slate", col: 0x5b6672 })),
    roofThatch: tex(roofTexture(seedRng, { kind: "thatch", col: 0xb08d4e })),
    plank: [tex(plankTexture(seedRng, 0x6b4c2c)), tex(plankTexture(seedRng, 0x4e3a26))],
    strata: tex(strataTexture(seedRng), { repeat: 1, repeatY: 1 }),
    smoke: new THREE.CanvasTexture(radialTexture("rgba(230,228,222,0.95)", "rgba(230,228,222,0)")),
    glow: new THREE.CanvasTexture(radialTexture("rgba(255,205,130,1)", "rgba(255,150,40,0)")),
  };
}
