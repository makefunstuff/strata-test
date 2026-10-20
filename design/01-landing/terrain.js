// Terrain generator for the Foldline hero: seeded value-noise elevation, a hypsometric
// hillshade painted on canvas, and contour polylines pulled out of the same field with
// marching squares. No libraries, no build step: it runs in the page.
//
// The field is deliberately hilly in the middle-east and flat in the south-west, so the
// route has a believable climb and the labels have somewhere to sit.

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** value noise on a lattice, bilinear-smoothed */
function lattice(size, seed) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const smooth = (v) => v * v * (3 - 2 * v);
  return (x, y) => {
    const xi = x * size, yi = y * size;
    const x0 = Math.floor(xi), y0 = Math.floor(yi);
    const fx = smooth(xi - x0), fy = smooth(yi - y0);
    const at = (a, b) => g[(((b % size) + size) % size) * size + (((a % size) + size) % size)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

/**
 * Elevation field over [0,1]², 5 octaves of value noise plus a summit bump.
 * Returns h(x, y) in 0..1.
 */
export function terrain(seed = 7) {
  const oct = [lattice(3, seed + 1), lattice(6, seed + 2), lattice(12, seed + 3), lattice(28, seed + 4)];
  const gain = [0.5, 0.27, 0.15, 0.08];
  const px = 0.68, py = 0.34;                       // summit position
  return (x, y) => {
    let h = 0;
    for (let i = 0; i < oct.length; i++) h += gain[i] * oct[i](x, y);
    // one long ridge running NW-SE, kept gentle so the contours stay readable
    const ridge = Math.abs(Math.sin((x * 1.5 + y * 1.0) * Math.PI)) ** 2.2;
    h = h * 0.74 + ridge * 0.14;
    const d = Math.hypot((x - px) * 1.15, y - py);
    h += Math.max(0, 1 - d * 2.4) ** 2 * 0.72;      // the peak
    h -= Math.max(0, 0.5 - Math.hypot((x - 0.16) * 1.6, y - 0.86)) * 0.55;  // the flat valley
    return Math.min(1, Math.max(0, h * 1.02));
  };
}

// hypsometric tint: light paper tones, valley green through heather to scree
const BANDS = [
  [0.00, [223, 232, 226]],   // valley floor, faint blue-green
  [0.16, [234, 234, 219]],
  [0.32, [233, 229, 208]],
  [0.48, [230, 221, 193]],
  [0.62, [226, 213, 180]],
  [0.76, [221, 205, 170]],
  [0.88, [214, 198, 166]],
  [1.00, [208, 192, 164]],
];
const tint = (h) => {
  for (let i = 1; i < BANDS.length; i++) {
    if (h <= BANDS[i][0]) {
      const [a, ca] = BANDS[i - 1], [b, cb] = BANDS[i];
      const t = (h - a) / (b - a);
      return ca.map((v, k) => v + (cb[k] - v) * t);
    }
  }
  return BANDS[BANDS.length - 1][1];
};

/**
 * Paint the field into a canvas: hypsometric bands + a north-west light hillshade.
 * The canvas is drawn at half the CSS size and stretched by the browser.
 */
export function paintTerrain(canvas, h, { w = 1200, hh = 760, sun = [-0.6, -0.8], steps = 24, relief = 0.42 } = {}) {
  const cw = Math.round(w / 2), ch = Math.round(hh / 2);
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(cw, ch);
  const d = img.data;
  const sx = sun[0], sy = sun[1];
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const u = x / cw, v = y / ch;
      // stepped elevation: banded fills read as cartography, not as a photo
      const e = Math.floor(h(u, v) * steps) / steps;
      const dx = (h(u + 1 / cw, v) - h(u - 1 / cw, v)) / (2 / cw);
      const dy = (h(u, v + 1 / ch) - h(u, v - 1 / ch)) / (2 / ch);
      const nx = -dx * relief, ny = -dy * relief, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      const shade = Math.max(0, (nx * sx + ny * sy + nz * 0.72) / nl);
      const light = 0.86 + shade * 0.26;
      const [r, g, b] = tint(e);
      const i = (y * cw + x) * 4;
      d[i] = Math.min(255, r * light); d[i + 1] = Math.min(255, g * light); d[i + 2] = Math.min(255, b * light);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { cw, ch };
}

/**
 * Marching squares isolines of the field at `level`.
 * Returns an array of [x1,y1,x2,y2] segments in [0,1] space.
 */
export function contourSegments(h, level, nx = 110, ny = 70) {
  const g = new Float32Array((nx + 1) * (ny + 1));
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) g[y * (nx + 1) + x] = h(x / nx, y / ny);
  const segs = [];
  const X = (i) => i / nx, Y = (j) => j / ny;
  const lerp = (a, b, v1, v2) => (level - v1) / ((v2 - v1) || 1e-9);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const tl = g[j * (nx + 1) + i], tr = g[j * (nx + 1) + i + 1];
      const br = g[(j + 1) * (nx + 1) + i + 1], bl = g[(j + 1) * (nx + 1) + i];
      let m = 0;
      if (tl > level) m |= 8;
      if (tr > level) m |= 4;
      if (br > level) m |= 2;
      if (bl > level) m |= 1;
      if (m === 0 || m === 15) continue;
      const top = () => [X(i) + (X(i + 1) - X(i)) * lerp(0, 1, tl, tr), Y(j)];
      const right = () => [X(i + 1), Y(j) + (Y(j + 1) - Y(j)) * lerp(0, 1, tr, br)];
      const bottom = () => [X(i) + (X(i + 1) - X(i)) * lerp(0, 1, bl, br), Y(j + 1)];
      const left = () => [X(i), Y(j) + (Y(j + 1) - Y(j)) * lerp(0, 1, tl, bl)];
      const push = (a, b) => segs.push([a[0], a[1], b[0], b[1]]);
      switch (m) {
        case 1: case 14: push(left(), bottom()); break;
        case 2: case 13: push(bottom(), right()); break;
        case 3: case 12: push(left(), right()); break;
        case 4: case 11: push(top(), right()); break;
        case 6: case 9: push(top(), bottom()); break;
        case 7: case 8: push(left(), top()); break;
        case 5: push(left(), top()); push(bottom(), right()); break;
        case 10: push(left(), bottom()); push(top(), right()); break;
      }
    }
  }
  return segs;
}

/** Chain the segments of one level into polylines; closed rings are marked. */
export function chain(segs, eps = 1e-6) {
  const key = (x, y) => `${Math.round(x / eps)},${Math.round(y / eps)}`;
  const map = new Map();
  for (const s of segs) {
    for (const end of [[s[0], s[1]], [s[2], s[3]]]) {
      const k = key(end[0], end[1]);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
  }
  const used = new Set();
  const out = [];
  const at = (s, k) => (key(s[0], s[1]) === k ? [s[2], s[3]] : [s[0], s[1]]);
  for (const s of segs) {
    if (used.has(s)) continue;
    const line = [[s[0], s[1]], [s[2], s[3]]];
    used.add(s);
    for (const dir of [1, -1]) {
      let head = line[dir === 1 ? line.length - 1 : 0];
      for (let guard = 0; guard < 4000; guard++) {
        const cands = (map.get(key(head[0], head[1])) || []).filter((c) => !used.has(c));
        if (!cands.length) break;
        const nxt = cands[0];
        used.add(nxt);
        const far = at(nxt, key(head[0], head[1]));
        if (dir === 1) line.push(far); else line.unshift(far);
        head = far;
      }
    }
    const closed = key(line[0][0], line[0][1]) === key(line[line.length - 1][0], line[line.length - 1][1]);
    out.push({ pts: line, closed });
  }
  return out;
}

/** path data for a chained contour, in SVG user units */
export function toPath(lines, W, H, close = null) {
  let d = "";
  for (const { pts, closed } of lines) {
    if (pts.length < 2) continue;
    if (close !== null && closed !== close) continue;
    d += `M${pts.map(([x, y]) => `${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join("L")}${closed ? "Z" : ""}`;
  }
  return d;
}
