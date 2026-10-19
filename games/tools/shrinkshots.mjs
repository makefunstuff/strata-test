// Re-encode a game's screenshots from PNG to JPEG (quality 82), in place.
//
//   node tools/shrinkshots.mjs <game> [<game> …]
//
// A 3D frame is not a screenshot of text: at quality 82 it is about one eighth of the PNG
// (790 KB → 55 KB) and indistinguishable as a thumbnail. The site is static and public, so the
// whole repo has to stay small enough to clone and to publish. Chromium does the encode —
// canvas.toDataURL — because there is no image toolchain here, and no build step is allowed.
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const gamesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const games = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const out = resolve(gamesDir, "tools", "work", "shrink");
await mkdir(out, { recursive: true });

const pages = [];
for (const g of games) {
  const dir = join(gamesDir, g, "shots");
  try { pages.push(...(await readdir(dir)).filter((f) => f.endsWith(".png")).map((f) => join(dir, f))); }
  catch { console.log(`no shots for ${g}`); }
}
if (!pages.length) { console.log("nothing to shrink"); process.exit(0); }

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? resolve(gamesDir, "tools/chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
let bytes0 = 0, bytes1 = 0;
for (const file of pages) {
  const data = await readFile(file);
  bytes0 += data.length;
  const b64 = await page.evaluate(async (src) => {
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad;
      img.src = "data:image/png;base64," + src; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.82).split(",")[1];
  }, data.toString("base64"));
  const jpg = Buffer.from(b64, "base64");
  bytes1 += jpg.length;
  const target = file.replace(/\.png$/, ".jpg");
  await writeFile(target, jpg);
  await unlink(file);
  console.log(`${file.replace(gamesDir + "/", "")}: ${(data.length / 1024) | 0} KB → ${(jpg.length / 1024) | 0} KB`);
}
await browser.close().catch(() => {});
console.log(`total ${(bytes0 / 1024) | 0} KB → ${(bytes1 / 1024) | 0} KB (${pages.length} shots)`);
