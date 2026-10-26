/* design/tools/links.mjs — every relative href and src in the HTML files under a
 * folder must point at a file that exists. The gallery links eleven tasks, their
 * NOTES.md files, their shots folders and 21 thumbnails; a typo there is invisible
 * until a reader hits it. A folder link only counts as resolving when the folder has an
 * index.html, because that is the rule the static host will apply to it.
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
    /* a reference ending in "/" is a folder, and on a static host a folder only resolves
       if it contains an index.html — that is what GitHub Pages does with
       design/01-landing/shots/. The first version of this tool statted the folder, reported
       it as existing, and twelve "N shots" links 404'd in review. */
    const target = resolve(dirname(f), clean);
    const probe = clean.endsWith("/") ? join(target, "index.html") : target;
    try {
      await stat(probe);
    } catch {
      misses++;
      console.log(`MISSING  ${relative(repo, f)} -> ${t}${clean.endsWith("/") ? "  (a folder with no index.html)" : ""}`);
      continue;
    }
    /* Publishing is "rsync design/ minus design/tools/", so a page that exists on the live
       site may link straight into a directory that never gets copied. This was invisible:
       the gallery's footer linked the harness report at tools/work/shoot/latest.md, this
       tool reported 0 missing (the file exists in the repo, which is all it checked), and the
       live page 404'd. Existence in the repo is not the publishing rule. */
    /* the manifest is the deliberate exception: publishing copies that one file under
       design/tools/ (see .github/workflows/pages.yml), because the published gallery fetches it */
    const publishedFromTools = ["tools/manifest.json"].includes(relative(designDir, target));
    const fromPublished = !relative(designDir, f).startsWith("tools/");
    const intoTools = relative(designDir, target).startsWith("tools/");
    if (fromPublished && intoTools && !publishedFromTools) {
      misses++;
      console.log(`UNPUBLISHED  ${relative(repo, f)} -> ${t}  (under design/tools/, which publishing excludes — print it as text, not a link)`);
    }
  }
}
console.log(`\n${files.length} html and script files (${basename(repo)}), ${checked} relative references, ${misses} missing`);
process.exit(misses ? 1 : 0);
