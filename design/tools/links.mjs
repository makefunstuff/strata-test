/* design/tools/links.mjs — every relative href and src in the HTML files under a
 * folder must point at a file that exists. The gallery links eleven tasks, their
 * NOTES.md files, their shots folders and 21 thumbnails; a typo there is invisible
 * until a reader hits it.
 *
 *   node design/tools/links.mjs                 # design/**.html + the site index.html
 *   node design/tools/links.mjs design/11-styles
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const designDir = resolve(dirname(dirname(fileURLToPath(import.meta.url))));
const repo = dirname(designDir);

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "shots", "capture", "work", "thumbs"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await htmlFiles(p));
    else if (/\.(html|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const SKIP = /^(https?:|mailto:|tel:|#|data:|javascript:|about:)/i;
const arg = process.argv[2];
const files = arg ? await htmlFiles(resolve(arg)) : [...await htmlFiles(designDir), join(repo, "index.html")];

let checked = 0, misses = 0;
for (const f of files) {
  const html = await readFile(f, "utf8");
  for (const u of [...html.matchAll(/(?:href|src|poster|data-src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])) {
    const t = u.trim();
    if (SKIP.test(t) || t.includes("://") || t.startsWith("//") || t.includes("${")) continue;
    const clean = decodeURIComponent(t.split("#")[0].split("?")[0]);
    if (!clean) continue;
    checked++;
    try {
      await stat(resolve(dirname(f), clean));
    } catch {
      misses++;
      console.log(`MISSING  ${relative(repo, f)} -> ${t}`);
    }
  }
}
console.log(`\n${files.length} html and script files (${basename(repo)}), ${checked} relative references, ${misses} missing`);
process.exit(misses ? 1 : 0);
