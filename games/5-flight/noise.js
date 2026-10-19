// Deterministic value noise and fbm, written here so the terrain has no dependency.
// heightAt(x, z) is the one source of truth: the chunks displace by it and the plane
// crashes by it, so the picture and the collision cannot disagree.

function hash(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function value(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const tx = smooth(x - xi), tz = smooth(z - zi);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * tz;
}

export function fbm(x, z, octaves = 5, lac = 2.02, gain = 0.5) {
  let f = 1, a = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * value(x * f, z * f);
    norm += a;
    f *= lac;
    a *= gain;
  }
  return sum / norm;
}

export const SEA = 0;

/** Terrain height in metres. Broad landform, a ridge term for mountains, fine detail. */
export function heightAt(x, z) {
  const land = fbm(x * 0.0065 + 40.7, z * 0.0065 - 17.3, 5);
  const detail = fbm(x * 0.031 - 5.1, z * 0.031 + 9.4, 4);
  const ridge = Math.pow(Math.max(0, land - 0.52) * 2.4, 1.55);
  const shelf = Math.pow(Math.max(0, 0.34 - land) * 2.0, 1.4);
  return (land - 0.44) * 62 + ridge * 58 - shelf * 26 + (detail - 0.5) * 7;
}
