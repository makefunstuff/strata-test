// Shared procedural textures — every game paints its own surfaces on a canvas, so the whole
// site stays plain text files with no binary assets and no build step.
import * as THREE from "three";

const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

function finish(c, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

function grain(x, size, amount, tint = null) {
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    if (tint) { d[i] += tint[0]; d[i + 1] += tint[1]; d[i + 2] += tint[2]; }
  }
  x.putImageData(img, 0, 0);
}

/** Soft round glow: particles, trails, light blooms, halos. */
export function glowTexture() {
  return memo("glow", () => {
    const size = 128;
    const [c, x] = canvas(size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.7)");
    g.addColorStop(0.55, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return finish(c);
  });
}

/** Long soft streak: speed lines, motion smears, cloud bands. */
export function streakTexture() {
  return memo("streak", () => {
    const w = 256, h = 32;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, h * 0.36, w, h * 0.28);
    const v = x.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, "rgba(0,0,0,1)");
    v.addColorStop(0.5, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,1)");
    x.globalCompositeOperation = "destination-out";
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    return finish(c, { repeat: 1 });
  });
}

/** Neon grid plate: dark base, glowing cells, brighter majors, a pool of light. */
export function gridTexture({ base = "#0b1220", line = "rgba(90,190,255,0.22)", major = "rgba(130,225,255,0.34)",
                              cells = 16, majors = 4, size = 1024, pool = "rgba(70,140,220,0.30)" } = {}) {
  return memo(`grid:${base}${line}${major}${cells}${majors}${size}${pool}`, () => {
    const [c, x] = canvas(size);
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
    grain(x, size, 20);
    const cell = size / cells;
    x.lineWidth = 2;
    x.strokeStyle = line;
    for (let i = 0; i <= cells; i++) {
      const p = i * cell + 0.5;
      x.beginPath(); x.moveTo(p, 0); x.lineTo(p, size); x.stroke();
      x.beginPath(); x.moveTo(0, p); x.lineTo(size, p); x.stroke();
    }
    x.lineWidth = 5;
    x.strokeStyle = major;
    for (let i = 0; i <= majors; i++) {
      const p = i * (size / majors) + 0.5;
      x.beginPath(); x.moveTo(p, 0); x.lineTo(p, size); x.stroke();
      x.beginPath(); x.moveTo(0, p); x.lineTo(size, p); x.stroke();
    }
    if (pool) {
      const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, pool);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, size, size);
    }
    return finish(c);
  });
}

/** Asphalt / road: dark base, speckle, faint wheel wear. */
export function asphaltTexture({ base = "#1b212b", speckle = 0.5, size = 512 } = {}) {
  return memo(`asphalt:${base}${speckle}${size}`, () => {
    const [c, x] = canvas(size);
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000 * speckle; i++) {
      const a = 0.02 + Math.random() * 0.12;
      x.fillStyle = Math.random() < 0.6 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      x.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    grain(x, size, 14);
    return finish(c);
  });
}

/** Brushed metal panel: vertical streaks between two tones. */
export function brushedMetal({ top = "#243244", bottom = "#121a26", streaks = 1400, size = 512 } = {}) {
  return memo(`metal:${top}${bottom}${streaks}${size}`, () => {
    const [c, x] = canvas(size);
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    for (let i = 0; i < streaks; i++) {
      const px = Math.random() * size;
      x.strokeStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.05})`;
      x.beginPath();
      x.moveTo(px, Math.random() * size);
      x.lineTo(px + (Math.random() - 0.5) * 6, Math.random() * size);
      x.stroke();
    }
    return finish(c);
  });
}

/** Wood grain for a board: warm base, long rings, a few darker knots. */
export function woodTexture({ base = "#b6874f", ring = "#7d5730", size = 1024 } = {}) {
  return memo(`wood:${base}${ring}${size}`, () => {
    const [c, x] = canvas(size);
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
    for (let i = 0; i < 170; i++) {
      const y = Math.random() * size;
      const amp = 6 + Math.random() * 26;
      x.strokeStyle = `rgba(${parseInt(ring.slice(1, 3), 16)},${parseInt(ring.slice(3, 5), 16)},${parseInt(ring.slice(5, 7), 16)},${0.05 + Math.random() * 0.16})`;
      x.lineWidth = 1 + Math.random() * 3.5;
      x.beginPath();
      for (let px = 0; px <= size; px += 8) {
        const py = y + Math.sin((px / size) * Math.PI * (1 + Math.random() * 2)) * amp;
        px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const cx = Math.random() * size, cy = Math.random() * size;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, 30 + Math.random() * 50);
      g.addColorStop(0, "rgba(80,50,25,0.45)");
      g.addColorStop(1, "rgba(80,50,25,0)");
      x.fillStyle = g;
      x.fillRect(cx - 90, cy - 90, 180, 180);
    }
    grain(x, size, 12);
    return finish(c);
  });
}

/** Stone / rock face for maze walls and cliffs: mottled with cracks. */
export function stoneTexture({ base = "#4a5566", size = 512, cracks = 90 } = {}) {
  return memo(`stone:${base}${size}${cracks}`, () => {
    const [c, x] = canvas(size);
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
    for (let i = 0; i < 700; i++) {
      const r = 6 + Math.random() * 42;
      const a = 0.03 + Math.random() * 0.07;
      x.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      x.beginPath();
      x.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = "rgba(0,0,0,0.22)";
    for (let i = 0; i < cracks; i++) {
      x.lineWidth = 0.6 + Math.random() * 1.4;
      x.beginPath();
      let px = Math.random() * size, py = Math.random() * size;
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) {
        px += (Math.random() - 0.5) * 70;
        py += (Math.random() - 0.5) * 70;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    grain(x, size, 18);
    return finish(c);
  });
}

/** Grass / tundra for terrain and roadside. */
export function grassTexture({ base = "#3f6b3a", size = 512 } = {}) {
  return memo(`grass:${base}${size}`, () => {
    const [c, x] = canvas(size);
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
    for (let i = 0; i < 5200; i++) {
      const a = 0.04 + Math.random() * 0.14;
      const c2 = Math.random() < 0.55 ? "255,255,255" : "0,20,0";
      x.fillStyle = `rgba(${c2},${a})`;
      x.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 5);
    }
    grain(x, size, 16);
    return finish(c);
  });
}

/** Value-noise field, used as a roughness/bump/blend map. Mono (not sRGB). */
export function noiseTexture({ size = 256, octaves = 4, contrast = 1, base = 0.5 } = {}) {
  return memo(`noise:${size}${octaves}${contrast}${base}`, () => {
    const [c, x] = canvas(size);
    const img = x.createImageData(size, size);
    const g = (ix, iy) => {
      let v = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const n = Math.sin((ix * f) * 12.9898 + (iy * f) * 78.233) * 43758.5453;
        v += (n - Math.floor(n)) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.1;
      }
      return v / norm;
    };
    for (let y = 0; y < size; y++) for (let ix = 0; ix < size; ix++) {
      const v = Math.max(0, Math.min(1, base + (g(ix, y) - 0.5) * contrast));
      const k = (y * size + ix) * 4;
      const b = (v * 255) | 0;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return finish(c, { srgb: false });
  });
}

/** Diagonal hazard stripes for crates and hurdles. */
export function stripesTexture({ a = "#ff5252", b = "#241016", bands = 7, size = 256 } = {}) {
  return memo(`stripes:${a}${b}${bands}${size}`, () => {
    const [c, x] = canvas(size);
    x.fillStyle = b;
    x.fillRect(0, 0, size, size);
    x.fillStyle = a;
    const w = size / bands;
    x.transform(1, 0, -0.55, 1, 0, 0);
    for (let i = -bands; i < bands * 2; i += 2) x.fillRect(i * w, 0, w, size);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.strokeStyle = "rgba(0,0,0,0.4)";
    x.lineWidth = 3;
    x.strokeRect(2, 2, size - 4, size - 4);
    grain(x, size, 16);
    return finish(c);
  });
}

/** Soft dark blob: the contact shadow under a player, marble or tower. */
export function shadowTexture({ size = 256, strength = 0.6 } = {}) {
  return memo(`shadow:${size}${strength}`, () => {
    const [c, x] = canvas(size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.45})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return finish(c);
  });
}

/** Vertical sky gradient, used as a stretched background. */
export function skyTexture(top = "#13203a", bottom = "#05070d", horizon = null, stop = 0.62) {
  return memo(`sky:${top}${bottom}${horizon}${stop}`, () => {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 256;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    if (horizon) g.addColorStop(stop, horizon);
    g.addColorStop(1, bottom);
    x.fillStyle = g;
    x.fillRect(0, 0, 8, 256);
    const t = finish(c, { srgb: true });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Radial sprite for a sun / moon disc. */
export function discTexture(inner = "rgba(255,250,235,1)", outer = "rgba(255,160,70,0)") {
  return memo(`disc:${inner}${outer}`, () => {
    const size = 256;
    const [c, x] = canvas(size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.32, "rgba(255,225,180,0.85)");
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return finish(c);
  });
}
