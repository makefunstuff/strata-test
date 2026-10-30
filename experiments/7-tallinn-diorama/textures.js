// Every surface in Tallinn is painted on a canvas at load time — pastel plaster with its tall
// windows, red tile, limestone courses, cobble setts, the onion domes of the cathedral, the soil
// strata of the cut-away base. No image files: the whole city is code, and a seed reproduces it.
import * as THREE from "three";

let R = Math.random;   // every painter below draws from this one stream

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
const hex = (v) => "#" + v.toString(16).padStart(6, "0");
function shade(col, k, a = 1) {
  const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * k)));
  return a >= 1 ? `rgb(${f(r)},${f(g)},${f(b)})` : `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

function speckle(g, w, h, n, colors, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(R() * colors.length) | 0];
    const s = size[0] + R() * (size[1] - size[0]);
    g.globalAlpha = 0.05 + R() * 0.3;
    g.fillRect(R() * w, R() * h, s, s * (0.6 + R()));
  }
  g.globalAlpha = 1;
}

const S = 128;   // one bay of facade = S px

/** weathering: grime in the lower third, sun bleach on top */
function weather(g, h = S) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, "rgba(255,248,225,0.07)");
  gr.addColorStop(0.62, "rgba(60,44,24,0.05)");
  gr.addColorStop(1, "rgba(24,16,6,0.20)");
  g.fillStyle = gr; g.fillRect(0, 0, S * 2, h);
}

/** a tall window with shutters and a moulded surround — the face of a Hanseatic house */
function windowPane(g, x, y, w, h, { glass = 0x2b3038, frame = 0xf2ead8, shutters = true, arch = false } = {}) {
  if (arch) {
    g.fillStyle = shade(frame, 0.86);
    g.beginPath();
    g.moveTo(x - 5, y + h); g.lineTo(x - 5, y + w * 0.4);
    g.arc(x + w / 2, y + w * 0.4, w / 2 + 5, Math.PI, 0);
    g.lineTo(x + w + 5, y + h); g.closePath(); g.fill();
  } else {
    g.fillStyle = shade(frame, 0.86); g.fillRect(x - 5, y - 6, w + 10, h + 11);
    g.fillStyle = shade(frame, 1.05); g.fillRect(x - 5, y - 6, w + 10, 2.5);
  }
  g.fillStyle = hex(glass); g.fillRect(x, y, w, h);
  // panes
  g.strokeStyle = "rgba(226,214,186,0.5)"; g.lineWidth = 1.2;
  for (let i = 1; i < 2; i++) { const xx = x + (w * i) / 2; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke(); }
  for (let j = 1; j < 3; j++) { const yy = y + (h * j) / 3; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
  // sky in the upper panes, room dark below
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, "rgba(158,190,220,0.34)");
  gr.addColorStop(0.5, "rgba(60,72,92,0.10)");
  gr.addColorStop(1, "rgba(16,14,10,0.42)");
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  if (shutters) {
    const sw = w * 0.16;
    for (const sx of [x - 1, x + w - sw + 1]) {
      g.fillStyle = shade(0x6d5237, 0.85 + R() * 0.3);
      g.fillRect(sx, y, sw, h);
      g.fillStyle = "rgba(0,0,0,0.28)";
      for (let yy = y + 3; yy < y + h; yy += 4.5) g.fillRect(sx + 0.6, yy, sw - 1.2, 1);
    }
  }
  // sill
  g.fillStyle = shade(frame, 1.02); g.fillRect(x - 8, y + h + 4, w + 16, 4);
  g.fillStyle = "rgba(0,0,0,0.26)"; g.fillRect(x - 8, y + h + 8, w + 16, 1.6);
}

/** one bay of pastel plaster: a tall window, a lintel course, lime-wash mottling */
function plasterBay(rng, { col = 0xd9b48a, trim = 0xf1e6cf, style = 0, windows = true } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = hex(col); g.fillRect(0, 0, S, S);
  speckle(g, S, S, 700, ["#ffffff", "#7a6647", "#efe0c2", "#4a3d2c"], [1, 4]);
  for (let i = 0; i < 16; i++) {                                    // lime-wash blotches
    g.globalAlpha = 0.05 + R() * 0.08;
    g.fillStyle = R() < 0.5 ? "#fff8ea" : shade(col, 0.72);
    g.beginPath(); g.arc(R() * S, R() * S, 7 + R() * 24, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  if (style === 1) {                                                 // horizontal plaster bands
    for (let y = 18; y < S; y += 26) {
      g.fillStyle = "rgba(255,250,236,0.20)"; g.fillRect(0, y, S, 3.4);
      g.fillStyle = "rgba(40,26,12,0.14)"; g.fillRect(0, y + 3.4, S, 1.4);
    }
  }
  if (windows) {
    windowPane(g, 34, 22, S - 68, 62, { frame: trim, arch: style === 2 });
  } else {
    // no painted windows on the bays: the 3D sashes laid over them are the windows, and two
    // grids that do not agree is the difference between a facade and a wall of dark tiles
    g.fillStyle = "rgba(255,250,236,0.10)"; g.fillRect(30, 18, S - 60, 70);
    g.fillStyle = "rgba(40,26,12,0.10)"; g.fillRect(30, 86, S - 60, 3.5);
  }
  if (style === 3) {                                                 // a niche with a saint
    g.fillStyle = "rgba(30,24,16,0.35)";
    g.beginPath(); g.arc(S / 2, S - 22, 12, Math.PI, 0); g.fill();
    g.fillStyle = shade(trim, 0.9); g.fillRect(S / 2 - 3, S - 30, 6, 12);
  }
  weather(g);
  return c;
}

/** the ground floor: a plank door with an arched head, a shop opening, a plinth */
function groundBay(rng, { col = 0xd9b48a, trim = 0xf1e6cf, door = true } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = hex(col); g.fillRect(0, 0, S, S);
  speckle(g, S, S, 1500, ["#ffffff", "#6f5c3f", "#e9dbbc", "#3d3226"], [1, 6]);
  // the plinth: rough stone at the street
  const ph = 34;
  g.fillStyle = shade(0x8e8878, 0.82); g.fillRect(0, S - ph, S, ph);
  for (let y = S - ph; y < S; y += 9) {
    for (let x = (y / 9) % 2 ? -6 : 0; x < S; x += 17) {
      g.fillStyle = shade(0x8e8878, 0.72 + R() * 0.5);
      g.fillRect(x + 1.2, y + 1.2, 14.6, 6.6);
    }
  }
  g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(0, S - ph, S, 2.2);
  if (door) {
    const x = 38, w = S - 76, y = S - ph - 62, h = 62;
    g.fillStyle = shade(trim, 0.84);
    g.beginPath(); g.moveTo(x - 7, y + h); g.lineTo(x - 7, y + 16);
    g.arc(x + w / 2, y + 16, w / 2 + 7, Math.PI, 0); g.lineTo(x + w + 7, y + h); g.closePath(); g.fill();
    g.fillStyle = shade(0x503a24, 0.9); g.fillRect(x, y + 8, w, h - 8);
    g.fillStyle = "rgba(0,0,0,0.3)";
    for (let xx = x + 4; xx < x + w; xx += 8) g.fillRect(xx, y + 10, 1.6, h - 12);
    g.fillStyle = "rgba(228,206,160,0.14)"; g.fillRect(x, y + 8, w, 4);
    // iron hinges and a ring
    g.fillStyle = "#2a2620";
    g.fillRect(x + 2, y + 20, w - 4, 3.4); g.fillRect(x + 2, y + 46, w - 4, 3.4);
    g.beginPath(); g.arc(x + w - 12, y + 36, 3.4, 0, 7); g.lineWidth = 1.8; g.strokeStyle = "#3a342c"; g.stroke();
  } else {
    const x = 30, w = S - 60, y = S - ph - 46, h = 46;
    g.fillStyle = shade(trim, 0.84); g.fillRect(x - 6, y - 6, w + 12, h + 10);
    g.fillStyle = "#242a30"; g.fillRect(x, y, w, h);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(150,180,210,0.28)"); gr.addColorStop(1, "rgba(20,16,10,0.4)");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = shade(0x7a5a34, 0.9); g.fillRect(x + w / 2 - 1.5, y, 3, h);
  }
  weather(g);
  return c;
}

/**
 * A whole gable end painted at once: the facade painting a Hanseatic house shows the street.
 * `kind` picks the silhouette decoration — stepped, pointed, pedimented or plain.
 */
export function gableFaceCanvas(rng, { col = 0xc97d5f, trim = 0xf3e9d4, kind = "stepped", seedRoof = 0xa4562e } = {}) {
  const { c, g } = canvas(S * 2, S * 2);
  g.clearRect(0, 0, S * 2, S * 2);
  g.fillStyle = hex(col); g.fillRect(0, 0, S * 2, S * 2);
  speckle(g, S * 2, S * 2, 2600, ["#ffffff", "#6f5c3f", "#f2e5c8", "#41352584"], [1, 6]);
  // string courses across the facade
  for (const y of [S * 1.34, S * 0.92]) {
    g.fillStyle = shade(trim, 0.98); g.fillRect(0, y, S * 2, 6);
    g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(0, y + 6, S * 2, 2);
  }
  // three tall windows on the upper floor, two below
  for (const [i, x] of [0.24, 0.5, 0.76].entries()) {
    windowPane(g, S * 2 * x - 21, S * 0.42, 42, 74, { frame: trim, arch: kind === "pediment" });
    void i;
  }
  for (const x of [0.32, 0.68]) windowPane(g, S * 2 * x - 19, S * 1.44, 38, 66, { frame: trim });
  // pilaster strips up the edges, and the silhouette decoration along the gable curve
  g.fillStyle = shade(trim, 1);
  g.fillRect(0, 0, 13, S * 2); g.fillRect(S * 2 - 13, 0, 13, S * 2);
  g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(13, 0, 3, S * 2); g.fillRect(S * 2 - 16, 0, 3, S * 2);
  if (kind === "stepped") {
    g.fillStyle = shade(trim, 1);
    for (let i = 0; i < 5; i++) {
      const w = 22, x = S - (i + 1) * 27 - 11, y = S * 0.30 + i * 22;
      g.fillRect(x, y, w, 20); g.fillRect(S * 2 - x - w, y, w, 20);
      g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, y + 18, w, 2.4); g.fillRect(S * 2 - x - w, y + 18, w, 2.4);
      g.fillStyle = shade(trim, 1);
    }
  } else if (kind === "pointed") {
    g.fillStyle = shade(trim, 1);
    g.beginPath(); g.moveTo(S, S * 0.10); g.lineTo(S * 0.52, S * 0.44); g.lineTo(S * 1.48, S * 0.44); g.closePath(); g.fill();
    g.fillStyle = hex(seedRoof);
    g.beginPath(); g.moveTo(S, S * 0.16); g.lineTo(S * 0.62, S * 0.44); g.lineTo(S * 1.38, S * 0.44); g.closePath(); g.fill();
  } else if (kind === "pediment") {
    g.fillStyle = shade(trim, 1.02);
    g.beginPath(); g.moveTo(S * 0.42, S * 0.40); g.quadraticCurveTo(S, S * 0.02, S * 1.58, S * 0.40);
    g.lineTo(S * 1.44, S * 0.46); g.quadraticCurveTo(S, S * 0.14, S * 0.56, S * 0.46); g.closePath(); g.fill();
    g.beginPath(); g.arc(S, S * 0.30, 13, 0, 7); g.fillStyle = "rgba(30,26,20,0.55)"; g.fill();
    g.strokeStyle = shade(trim, 1); g.lineWidth = 3; g.stroke();
  } else {
    g.fillStyle = shade(trim, 0.96); g.fillRect(S * 0.5, S * 0.34, S, 7);
  }
  // dead-end balcony on a corbel — the detail every Tallinn gable has
  g.fillStyle = shade(trim, 0.92);
  g.fillRect(S - 26, S * 0.66, 52, 7);
  g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(S - 26, S * 0.73, 52, 3);
  weather(g, S * 2);
  return c;
}

function roofTileCanvas(rng, { col = 0xb26036, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(snow ? 0xeef3f8 : col, 0.62); g.fillRect(0, 0, S, S);
  const r = 11;
  for (let row = -1; row * r * 1.05 < S + r; row++) {
    const y = row * r * 1.15;
    for (let i = -1; i * r * 2 < S + r * 2; i++) {
      const x = i * r * 2 + (row % 2 ? r : 0);
      const k = 0.72 + R() * 0.55;
      g.fillStyle = shade(snow ? 0xeef3f8 : col, snow ? 0.9 + R() * 0.16 : k);
      g.beginPath();
      g.moveTo(x, y + r * 1.5); g.lineTo(x, y + r * 0.5);
      g.quadraticCurveTo(x + r, y - r * 0.35, x + r * 2, y + r * 0.5);
      g.lineTo(x + r * 2, y + r * 1.5); g.closePath(); g.fill();
      if (!snow) {
        g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(x + r * 2 - 2.4, y + r * 0.35, 2.4, r * 1.15);
        g.fillStyle = "rgba(255,225,190,0.13)"; g.fillRect(x + 1.5, y + r * 0.45, 2, r);
      }
    }
  }
  if (!snow) {
    for (let i = 0; i < 22; i++) {                                   // lichen on the warm side
      g.globalAlpha = 0.10 + R() * 0.16; g.fillStyle = "#5c723c";
      g.beginPath(); g.arc(R() * S, R() * S, 3 + R() * 8, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  } else {                                                            // tiles showing under the snow
    g.globalAlpha = 0.35;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = shade(col, 0.8 + R() * 0.4);
      g.beginPath(); g.ellipse(R() * S, R() * S, 3 + R() * 6, 2 + R() * 3, R() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  return c;
}

function slateCanvas(rng, { col = 0x3d4a52, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(snow ? 0xeef3f8 : col, 0.55); g.fillRect(0, 0, S, S);
  const h = 12;
  let row = 0;
  for (let y = -h; y < S + h; y += h) {
    let x = (row % 2) * -9;
    while (x < S) {
      const w = 11 + R() * 15;
      g.fillStyle = shade(snow ? 0xeef3f8 : col, snow ? 0.9 + R() * 0.14 : 0.62 + R() * 0.72);
      g.fillRect(x + 1, y + 1, w - 2, h - 2);
      if (!snow) {
        g.fillStyle = "rgba(255,255,255,0.09)"; g.fillRect(x + 1, y + 1, w - 2, 1.3);
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + 1, y + h - 2.3, w - 2, 1.3);
      }
      x += w;
    }
    row++;
  }
  speckle(g, S, S, 400, snow ? ["#ffffff", "#c9d6e2"] : ["#dfe7ef", "#131a20"], [1, 3]);
  return c;
}

function stoneCanvas(rng, { col = 0x9a9284, block = [26, 40], course = 18, mortar = 0.55, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, mortar); g.fillRect(0, 0, S, S);
  let y = 0, row = 0;
  while (y < S) {
    const hh = course * (0.8 + R() * 0.45);
    let x = row % 2 ? -block[0] * 0.5 : 0;
    while (x < S) {
      const w = block[0] * (0.65 + R() * 0.8), inset = 1.7;
      g.fillStyle = shade(col, 0.78 + R() * 0.5);
      g.fillRect(x + inset, y + inset, w - inset * 2, hh - inset * 2);
      g.fillStyle = "rgba(255,250,235,0.13)"; g.fillRect(x + inset, y + inset, w - inset * 2, 1.6);
      g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(x + inset, y + hh - inset - 1.6, w - inset * 2, 1.6);
      x += w;
    }
    y += hh; row++;
  }
  speckle(g, S, S, 900, ["#ffffff", "#3b3630", "#cdc5b4"], [1, 3]);
  if (snow) {
    g.globalAlpha = 0.8; g.fillStyle = "#eef3f8";
    for (let i = 0; i < 60; i++) { g.beginPath(); g.ellipse(R() * S, R() * S, 4 + R() * 10, 1.6 + R() * 3, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
  return c;
}

/** narrow brick courses in a lime mortar — Pikk Hermann and the bastion faces */
function brickCanvas(rng, { col = 0x8d4a39, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = snow ? "#dfe5ee" : "#b9a893"; g.fillRect(0, 0, S, S);
  const course = 9.5;
  let y = 0, row = 0;
  while (y < S) {
    let x = row % 2 ? -13 : 0;
    while (x < S) {
      const w = 26 * (0.9 + R() * 0.2);
      g.fillStyle = shade(col, 0.7 + R() * 0.62);
      g.fillRect(x + 1.2, y + 1.1, w - 2.4, course - 2.2);
      g.fillStyle = "rgba(255,240,220,0.12)"; g.fillRect(x + 1.2, y + 1.1, w - 2.4, 1.1);
      g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(x + 1.2, y + course - 2.1, w - 2.4, 1.0);
      x += w;
    }
    y += course; row++;
  }
  speckle(g, S, S, 1200, ["#ffffff", "#2a1a14", "#e0cdb6"], [1, 2.5]);
  weather(g, S);
  if (snow) {
    g.globalAlpha = 0.55; g.fillStyle = "#eef3f8";
    for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(R() * S, R() * S, 5 + R() * 12, 1.4 + R() * 2.6, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
  return c;
}

/** a plain limewashed wall, tinted per building by its vertex colour */
function plasterPlainCanvas(rng, { col = 0xe8e2d4 } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, 0.94); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    g.globalAlpha = 0.05 + R() * 0.09;
    g.fillStyle = R() < 0.5 ? "#ffffff" : "#8c8477";
    g.beginPath(); g.ellipse(R() * S, R() * S, 6 + R() * 34, 4 + R() * 22, R() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  speckle(g, S, S, 700, ["#ffffff", "#6d675d", "#c9c1b0"], [1, 2.5]);
  weather(g, S);
  return c;
}

function cobbleCanvas(rng, { col = 0x776f66, fan = false, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  // the joints read dark from a distance, but the setts themselves must not: a high-contrast grid
  // is what made the square look like a waffle in the close-ups
  g.fillStyle = shade(col, snow ? 0.94 : 0.56); g.fillRect(0, 0, S, S);
  // setts in fan-shaped arcs, the way Tallinn's streets are actually laid
  const cell = 8.5;
  for (let y = -cell; y < S + cell; y += cell) {
    for (let x = -cell; x < S + cell; x += cell) {
      const bow = fan ? Math.sin((x / S) * Math.PI * 2) * 3.2 : Math.sin((y / S) * Math.PI) * 1.6;
      const w = cell * (0.78 + R() * 0.18), h = cell * (0.74 + R() * 0.2);
      g.fillStyle = shade(snow ? 0xdfe6ee : col, (snow ? 0.86 : 0.82) + R() * (snow ? 0.22 : 0.36));
      g.beginPath();
      g.roundRect(x + 1, y + 1 + bow, w, h, 1.8);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x + 1.4, y + 1.4 + bow, w - 1, 1.1);
    }
  }
  speckle(g, S, S, 260, snow ? ["#ffffff", "#b9c6d2"] : ["#cfc7ba", "#4a4239"], [1, 2.2]);
  return c;
}

function pavingCanvas(rng, { col = 0x9b9287, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, snow ? 0.94 : 0.6); g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 21) {
    for (let x = (y / 21) % 2 ? -10 : 0; x < S; x += 21) {
      g.fillStyle = shade(snow ? 0xe4ebf2 : col, (snow ? 0.88 : 0.84) + R() * (snow ? 0.2 : 0.3));
      g.fillRect(x + 1, y + 1, 19, 19);
      g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x + 1, y + 1, 19, 1.5);
    }
  }
  speckle(g, S, S, 220, snow ? ["#ffffff"] : ["#c9c1b4", "#3d372f"], [1, 2.2]);
  return c;
}

function grassCanvas(rng, { col = 0x6d8a45, snow = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(snow ? 0xe9eff6 : col, snow ? 0.95 : 0.96); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S;
    g.strokeStyle = shade(snow ? 0xdfe8f2 : col, (snow ? 0.86 : 0.68) + R() * (snow ? 0.3 : 0.66));
    g.globalAlpha = 0.4 + R() * 0.5; g.lineWidth = 0.8 + R() * 1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 5); g.stroke();
  }
  g.globalAlpha = 1;
  if (!snow) speckle(g, S, S, 240, ["#8fa04a", "#3d4d24", "#b8b25a"], [1, 3]);
  return c;
}

function woodCanvas(rng, { col = 0x6b4c2c, vertical = false } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = shade(col, 0.72); g.fillRect(0, 0, S, S);
  const step = 12;
  for (let i = 0; i < S; i += step) {
    const x = vertical ? 0 : i, y = vertical ? i : 0, len = S, th = step;
    g.fillStyle = shade(col, 0.68 + R() * 0.6);
    g.fillRect(vertical ? x : x, y, vertical ? th : len, vertical ? len : th);
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(vertical ? x + th - 1.4 : x, y, vertical ? 1.4 : len, vertical ? len : 1.4);
    g.fillStyle = "rgba(255,235,200,0.06)"; g.fillRect(vertical ? x + 1 : x, y, vertical ? 1.6 : len, vertical ? len : 1.6);
    for (let k = 0; k < 12; k++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.12})`;
      if (vertical) g.fillRect(x + 2 + R() * (th - 4), R() * S, 0.9, 6 + R() * 24);
      else g.fillRect(R() * S, y + 2 + R() * (th - 4), 6 + R() * 24, 0.9);
    }
  }
  return c;
}

/** the onion domes of the Alexander Nevsky Cathedral: dark green, studded with gold stars */
function onionDomeCanvas(rng) {
  const { c, g } = canvas(S, S);
  g.fillStyle = "#243a3a"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {                                   // tin sheen, vertical ribs
    const x = R() * S;
    g.fillStyle = `rgba(${40 + R() * 40 | 0},${70 + R() * 40 | 0},${70 + R() * 36 | 0},${0.2 + R() * 0.5})`;
    g.fillRect(x, R() * S, 1 + R() * 3, 6 + R() * 30);
  }
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      const x = (col + (row % 2 ? 0.5 : 0)) * (S / 4), y = row * (S / 5) + 12;
      g.fillStyle = "#e8c052";
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const r = k % 2 ? 2.6 : 6.2;
        g[k ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      g.fillStyle = "rgba(255,240,180,0.5)"; g.fillRect(x - 0.8, y - 6, 1.6, 12);
    }
  }
  return c;
}

/** the cut-away face of the diorama: boulder clay over Baltic limestone, with the fossils */
function strataCanvas(rng) {
  const { c, g } = canvas(512, 256);
  const bands = [
    { h: 0.08, col: 0x4c4028, grain: ["#6f5c38", "#2b2317", "#7f9a52"] },
    { h: 0.12, col: 0x5a4526, grain: ["#7a5c34", "#33261a", "#a08455"] },
    { h: 0.15, col: 0x6f5a3a, grain: ["#96784a", "#443421", "#c0a06a"] },
    { h: 0.18, col: 0x8a8578, grain: ["#b3ae9e", "#4e4a42", "#d8d2bd"] },   // limestone
    { h: 0.20, col: 0x9b968a, grain: ["#c6c1b2", "#59544b", "#e4dfd0"] },   // fossil limestone
    { h: 0.27, col: 0x6b6a66, grain: ["#8f8e89", "#33322f", "#b0afa8"] },   // dolomite
  ];
  let y = 0;
  for (let bi = 0; bi < bands.length; bi++) {
    const b = bands[bi];
    const hh = Math.round(b.h * 256);
    g.fillStyle = hex(b.col); g.fillRect(0, y, 512, hh);
    const nxt = bands[(bi + 1) % bands.length];
    g.fillStyle = hex(nxt.col);
    g.beginPath(); g.moveTo(0, y + hh);
    for (let x = 0; x <= 512; x += 14) g.lineTo(x, y + hh - 5 - Math.sin(x * 0.045 + b.h * 26) * 5 - R() * 5);
    g.lineTo(512, y + hh + 12); g.lineTo(0, y + hh + 12); g.closePath(); g.fill();
    speckle(g, 512, Math.max(4, hh), 1400, b.grain, [1, 6]);
    for (let i = 0; i < 6; i++) {                                     // bedding planes
      g.fillStyle = `rgba(0,0,0,${0.07 + R() * 0.12})`;
      g.fillRect(0, y + R() * hh, 512, 1 + R() * 2);
    }
    if (bi >= 3) {                                                     // fossil beds
      for (let i = 0; i < 26; i++) {
        const fx = R() * 512, fy = y + R() * hh;
        g.strokeStyle = "rgba(230,226,210,0.34)"; g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k < 5; k++) g.arc(fx, fy, 1.5 + k * 1.6, 0.4, 4.2);
        g.stroke();
      }
    }
    y += hh;
  }
  for (let i = 0; i < 40; i++) {                                      // erratics in the clay
    const x = R() * 512, sy = 20 + R() * 110, r = 2 + R() * 4.5;
    g.fillStyle = `rgb(${80 + R() * 40 | 0},${76 + R() * 36 | 0},${70 + R() * 32 | 0})`;
    g.beginPath(); g.ellipse(x, sy, r, r * (0.6 + R() * 0.5), R() * 3, 0, 7); g.fill();
    g.fillStyle = "rgba(0,0,0,0.3)"; g.beginPath(); g.ellipse(x, sy + r * 0.35, r, r * 0.3, 0, 0, 7); g.fill();
  }
  for (let i = 0; i < 14; i++) {                                      // root and crack work
    g.strokeStyle = `rgba(${46 + R() * 22 | 0},${34 + R() * 16 | 0},20,0.32)`;
    g.lineWidth = 1 + R() * 1.8; g.beginPath();
    let x = R() * 512, yy = 6; g.moveTo(x, yy);
    for (let s = 0; s < 7; s++) { x += (R() - 0.5) * 26; yy += 6 + R() * 16; g.lineTo(x, yy); }
    g.stroke();
  }
  return c;
}

/** a puff with no core: a soot cloud, not a soap bubble */
function smokeCanvas(size = 64) {
  const { c, g } = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, "rgba(232,230,225,0.5)");
  gr.addColorStop(0.34, "rgba(232,230,225,0.3)");
  gr.addColorStop(0.68, "rgba(226,224,220,0.12)");
  gr.addColorStop(1, "rgba(226,224,220,0)");
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

function radialCanvas(inner, outer, size = 64) {
  const { c, g } = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.45, inner.replace(/[\d.]+\)$/, "0.45)"));
  gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

/** one lit window pane, as an emissive map for a bay */
function bayGlowCanvas(rng, { lit = 0.62 } = {}) {
  const { c, g } = canvas(S, S);
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
  if (R() < lit) {
    const warm = R();
    const gr = g.createLinearGradient(0, 22, 0, 84);
    gr.addColorStop(0, `rgba(255,${205 + warm * 30 | 0},${130 + warm * 50 | 0},0.95)`);
    gr.addColorStop(1, `rgba(255,${160 + warm * 40 | 0},${70 + warm * 40 | 0},0.7)`);
    g.fillStyle = gr;
    g.fillRect(34, 22, S - 68, 62);
  }
  return c;
}

/** market stall canvas: red-and-white stripes over a warm interior */
function stallCanvas(rng) {
  const { c, g } = canvas(S, S);
  for (let x = 0; x < S; x += 16) {
    g.fillStyle = x % 32 ? "#c0392b" : "#f1e6d0";
    g.fillRect(x, 0, 16, S * 0.42);
  }
  g.fillStyle = "#3b2a1a"; g.fillRect(0, S * 0.42, S, S * 0.58);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,${170 + R() * 60 | 0},${80 + R() * 60 | 0},${0.3 + R() * 0.6})`;
    g.fillRect(R() * S, S * 0.5 + R() * S * 0.4, 3 + R() * 8, 3 + R() * 6);
  }
  return c;
}

export function buildTextures(seedRng) {
  R = seedRng.next;
  // a gable reads as one flat colour from the square, so it is chalked up toward white; the
  // facade bays keep the full strength because their shading is painted into the canvas
  const paler = (h, t) => {
    const c = new THREE.Color(h), w = new THREE.Color(0xffffff);
    return c.lerp(w, t).getHex();
  };
    // the Old Town's actual palette: chalky pastels, not a bucket of browns
  const plasterCols = [0xe9dcc2, 0xdcb86b, 0xd9a08d, 0xbccaa6, 0xc0cad4, 0xdcc48f, 0xca8b72, 0xa9bda6];
  const upper = [], upperGlow = [], groundRows = [], groundGlow = [], gables = [];
  for (let i = 0; i < 8; i++) {
    const col = plasterCols[i % plasterCols.length];
    const style = i % 4;
    upper.push(tex(plasterBay(Rng(), { col, style, windows: false })));
    upperGlow.push(tex(bayGlowCanvas(Rng(), { lit: 0.5 + (i % 3) * 0.12 })));
    groundRows.push(tex(groundBay(Rng(), { col, door: i % 2 === 0 })));
    groundGlow.push(tex(bayGlowCanvas(Rng(), { lit: 0.35 })));
    gables.push(tex(gableFaceCanvas(Rng(), {
      col: paler(col, 0.34), trim: i % 3 === 0 ? 0xf3e9d4 : 0xe8dcc0,
      kind: ["stepped", "pointed", "pediment", "plain"][i % 4],
    })));
    gables.push(tex(gableFaceCanvas(Rng(), {
      col: paler(plasterCols[(i + 3) % plasterCols.length], 0.4), trim: 0xf6efdd,
      kind: ["plain", "stepped", "pointed", "pediment"][(i + 1) % 4],
    })));
  }
  function Rng() { return { next: R }; }

  return {
    upper, upperGlow, ground: groundRows, groundGlow, gables,
    roofTile: tex(roofTileCanvas(Rng())),
    roofTileSnow: tex(roofTileCanvas(Rng(), { snow: true })),
    roofSlate: tex(slateCanvas(Rng())),
    roofSlateSnow: tex(slateCanvas(Rng(), { snow: true })),
    stone: [tex(stoneCanvas(Rng(), { col: 0x9a9284 })), tex(stoneCanvas(Rng(), { col: 0x8a8478, block: [20, 30], course: 13 })), tex(stoneCanvas(Rng(), { col: 0xa8a090, block: [34, 52], course: 22 }))],
    stoneSnow: [tex(stoneCanvas(Rng(), { col: 0x9a9284, snow: true })), tex(stoneCanvas(Rng(), { col: 0x8a8478, snow: true }))],
    cobble: tex(cobbleCanvas(Rng())),
    cobbleFan: tex(cobbleCanvas(Rng(), { fan: true })),
    cobbleSnow: tex(cobbleCanvas(Rng(), { snow: true })),
    paving: tex(pavingCanvas(Rng())),
    pavingSnow: tex(pavingCanvas(Rng(), { snow: true })),
    grass: tex(grassCanvas(Rng())),
    grassSnow: tex(grassCanvas(Rng(), { snow: true })),
    brick: tex(brickCanvas(Rng())),
    brickSnow: tex(brickCanvas(Rng(), { snow: true })),
    plasterPlain: tex(plasterPlainCanvas(Rng()), { repeat: 1, repeatY: 1 }),
    wood: tex(woodCanvas(Rng())),
    woodDark: tex(woodCanvas(Rng(), { col: 0x4a3620 })),
    onion: tex(onionDomeCanvas(Rng())),
    strata: tex(strataCanvas(Rng()), { repeat: 1, repeatY: 1 }),
    stall: tex(stallCanvas(Rng())),
    smoke: new THREE.CanvasTexture(smokeCanvas()),
    glow: new THREE.CanvasTexture(radialCanvas("rgba(255,206,132,1)", "rgba(255,150,40,0)")),
    soft: new THREE.CanvasTexture(radialCanvas("rgba(255,255,255,1)", "rgba(255,255,255,0)")),
  };
}
