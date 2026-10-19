// Bisect a rendering artifact: load a game, toggle shader uniforms live, and measure which pixel
// rows are brighter than their neighbourhood (a "line" is a row that stands out by a lot).
//   node linescan.mjs <game-dir> [--shot out.png] [expr ...]
// Each expr is JS evaluated with `env` = {post, scene, camera, renderer} from window.arcade, e.g.
//   "env.post.crt.uniforms.uBeam.value = 0"   "env.scene.getObjectByName('apron').visible = false"
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, basename, dirname } from "node:path";


// --- trace: for each sampled column, the y of the brightest pixel in the band.
// A flat series = a screen-space artefact (post/DOM/scanline); a varying series = geometry.
function traceRows(img, band, xr, step = 8) {
  const out = [];
  for (let x = Math.floor(img.w * xr[0]); x < Math.floor(img.w * xr[1]); x += step) {
    let best = { y: band[0], v: -1 };
    for (let y = band[0]; y <= band[1]; y++) {
      let sum = 0, n = 0;
      for (let k = -1; k <= 1; k++) {
        const i = y * img.w * img.chan + (x + k) * img.chan;
        sum += 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2]; n++;
      }
      const v = sum / n;
      if (v > best.v) best = { y, v: +v.toFixed(1) };
    }
    out.push([x, best.y, best.v]);
  }
  return out;
}

const args = process.argv.slice(2);
const target = args[0];
if (!target) { console.error("usage: node linescan.mjs <game-dir|file.png> [expr ...]"); process.exit(2); }
const flags = new Set(["--shot", "--band", "--x", "--trace", "--wait"]);
const exprs = args.filter((a, i) => i > 0 && !a.startsWith("--") && !flags.has(args[i - 1]));
const shot = args.includes("--shot") ? args[args.indexOf("--shot") + 1] : null;

// --- minimal PNG decoder (8-bit RGBA/RGB, non-interlaced) -> {w,h,chan,px}
function decodePng(buf) {
  let pos = 8, w = 0, h = 0, chan = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); chan = data[9] === 6 ? 4 : 3; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * chan, out = Buffer.alloc(stride * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= chan ? cur[x - chan] : 0, b = prev[x], c = x >= chan ? prev[x - chan] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, chan, px: out };
}

function rowPeaksAll(img, xr = [0.25, 0.75]) {
  const { w, h, chan, px } = img;
  const x0 = Math.floor(w * xr[0]), x1 = Math.floor(w * xr[1]);
  const rows = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0, n = 0;
    for (let x = x0; x < x1; x += 2) {
      const i = y * w * chan + x * chan;
      sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
      n++;
    }
    rows[y] = sum / n;
  }
  const score = [];
  for (let y = 0; y < h; y++) {
    let near = 0, n = 0;
    for (let k = -30; k <= 30; k++) {
      const j = y + k;
      if (j >= 0 && j < h && Math.abs(k) > 3) { near += rows[j]; n++; }
    }
    score.push({ y, bright: +rows[y].toFixed(1), over: +(rows[y] - near / Math.max(1, n)).toFixed(1) });
  }
  score.sort((a, b) => b.over - a.over);
  return score;
}

function rowPeaks(img) { return rowPeaksAll(img).slice(0, 4); }

// a bare .png argument is analysed on its own (no browser)
if (target && target.endsWith(".png")) {
  const img = decodePng(await readFile(resolve(target)));
  const xr = args.includes("--x") ? args[args.indexOf("--x") + 1].split(",").map(Number) : [0.25, 0.75];
  const all = rowPeaksAll(img, xr);
  const band = args.includes("--band") ? args[args.indexOf("--band") + 1].split(",").map(Number) : [0, img.h];
  if (args.includes("--trace")) {
    const t = traceRows(img, band, xr);
    console.log(JSON.stringify({ ys: t.map((r) => r[1]), profile: t }, null, 0));
    process.exit(0);
  }
  const win = all.filter((r) => r.y >= band[0] && r.y <= band[1]).slice(0, 6).map((r) => {
    // average colour across the sampled window of that row, plus the row above/below
    const rgb = (y) => {
      let R = 0, G = 0, B = 0, n = 0;
      for (let x = Math.floor(img.w * xr[0]); x < Math.floor(img.w * xr[1]); x += 2) {
        const i = y * img.w * img.chan + x * img.chan;
        R += img.px[i]; G += img.px[i + 1]; B += img.px[i + 2]; n++;
      }
      return [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
    };
    return { ...r, rgb: rgb(r.y), above: rgb(r.y - 3), below: rgb(r.y + 3) };
  });
  console.log(JSON.stringify({ file: target, size: [img.w, img.h], band, x: xr, lines: win }, null, 2));
  process.exit(0);
}

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const game = resolve(target);
const root = resolve(dirname(game));
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    const file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${basename(game)}/index.html`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("./chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});

const xr = args.includes("--x") ? args[args.indexOf("--x") + 1].split(",").map(Number) : [0.1, 0.26];
const band = args.includes("--band") ? args[args.indexOf("--band") + 1].split(",").map(Number) : [100, 400];
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => shots.push({ label: "pageerror", err: e.message }));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await page.waitForTimeout(2500);

  for (let i = 0; i <= exprs.length; i++) {
    if (i > 0) {
      const e = exprs[i - 1];
      await page.evaluate((src) => { new Function("env", src)(window.arcade ?? { post: window.arcadePost }); }, e);
      if (args.includes("--wait")) await page.waitForTimeout(+args[args.indexOf("--wait") + 1]);
    }
    const label = i === 0 ? "asis" : exprs[i - 1].replace(/[^a-z0-9]+/gi, "_").slice(0, 36);
    const buf = await page.screenshot({ path: shot ?? `/tmp/linescan-${label}.png` });
    const img = decodePng(buf);
    if (args.includes("--trace")) { shots.push({ label, trace: traceRows(img, band, xr) }); continue; }
    const all = rowPeaksAll(img, xr);
    shots.push({
      label,
      title: await page.title(),
      text: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 160),
      lines: all.filter((r) => r.y >= band[0] && r.y <= band[1]).slice(0, 3),
    });
    await page.waitForTimeout(400);
  }
  await mkdir("games/tools/work", { recursive: true }).catch(() => {});
  await writeFile("games/tools/work/linescan.json", JSON.stringify(shots, null, 2));
  console.log(JSON.stringify(shots, null, 2));
} finally {
  await browser.close().catch(() => {});
  server.close();
}
