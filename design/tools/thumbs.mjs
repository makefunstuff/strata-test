/* design/tools/thumbs.mjs — make the gallery's thumbnails.
 *
 * The cards on design/index.html must not pull 2 880 px screenshots: the frame costs
 * 3 MB of images and loads slow. So the thumbs are built once, committed as static
 * files, and the page keeps no build step. ImageMagick, invoked per file.
 *
 * The crop is the honest one: resize to 640 px wide (a whole 1 440 px page becomes
 * 640 px wide, so nothing is cropped sideways), then take the top 400 px, which is
 * the page's hero at true page scale. No crop of a hero shot, no phone shot blown up.
 *
 *   node design/tools/thumbs.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const designDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(designDir, "thumbs");
mkdirSync(outDir, { recursive: true });

/* [source, output, alt for the log] — one per task; desktop shots only. */
const PICKS = [
  ["01-landing/shots/hero.jpg", "01-landing.jpg"],
  ["02-dashboard/shots/light.jpg", "02-dashboard.jpg"],
  ["03-mobile/shots/today.jpg", "03-mobile.jpg"],
  ["04-tui/shots/stream.jpg", "04-tui.jpg"],
  ["05-system/shots/kit-paper.jpg", "05-system.jpg"],
  ["06-identity/shots/masthead.jpg", "06-identity.jpg"],
  ["07-dataviz/shots/claim.jpg", "07-dataviz.jpg"],
  ["08-form/shots/lookup.jpg", "08-form.jpg"],
  ["09-motion/shots/system.jpg", "09-motion.jpg"],
  ["10-redesign/shots/after-full.jpg", "10-redesign.jpg"],
  ["11-styles/shots/heroes.jpg", "11-styles.jpg"],
  ["11-styles/shots/swiss-hero.jpg", "style-swiss.jpg"],
  ["11-styles/shots/brutalism-hero.jpg", "style-brutalism.jpg"],
  ["11-styles/shots/japanese-hero.jpg", "style-japanese.jpg"],
  ["11-styles/shots/cyber-hero.jpg", "style-cyber.jpg"],
  ["shots/full.jpg", "gallery.jpg"]
];

let bytes = 0;
for (const [src, out] of PICKS) {
  const from = join(designDir, src), to = join(outDir, out);
  try {
    statSync(from);
  } catch {
    console.log(`skip  ${src} — no such shot`);
    continue;
  }
  execFileSync("magick", [from, "-resize", "640x", "-gravity", "North", "-crop", "640x400+0+0",
    "+repage", "-strip", "-interlace", "Plane", "-quality", "82", to]);
  bytes += statSync(to).size;
  console.log(`ok    ${src} → thumbs/${out}`);
}
console.log(`\n${PICKS.length} thumbs, ${(bytes / 1024).toFixed(0)} KB total in design/thumbs/`);
