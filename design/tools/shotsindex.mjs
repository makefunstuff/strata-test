/* design/tools/shotsindex.mjs — write a real page into every task's shots/ folder.
 *
 * The gallery links "N shots" as <task>/shots/. A bare folder has no index, so on a
 * static host like GitHub Pages that link is a 404, and links.mjs — which statted the
 * folder — reported it as existing. Twelve links 404'd in review. This generator gives
 * every shots folder a page: that task's own screenshot report, rendered, one figure per
 * shot with the numbers the audit measured on it.
 *
 *   node design/tools/shotsindex.mjs              # every task in the manifest
 *   node design/tools/shotsindex.mjs 09-motion
 *
 * Input is tools/work/shoot/<task>.json, the report a complete shoot.mjs run writes for a
 * task: an array of rows, each { label, ok, errs[], audit{…}, jpg, bytes, px }, with the
 * page, viewport and full-page flag read off the manifest by matching the shot name.
 *
 * With no report the page still lists the files on disk and says the audit columns are
 * blank, because nobody has run the audit for that task since per-task reports existed.
 * Every row names a file that exists, so a row cannot be a 404. Nothing here is authored.
 */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(toolsDir, "..");
const manifest = JSON.parse(await readFile(join(toolsDir, "manifest.json"), "utf8"));

const css = `
body{margin:0;background:#0e1418;color:#e8eef2;font:15px/1.55 "JetBrains Mono","DejaVu Sans Mono",ui-monospace,monospace}
main{max-width:1120px;margin:0 auto;padding:32px 20px 72px}
h1{font-size:20px;letter-spacing:.02em;margin:0 0 6px}
a{color:#4fb3c9}
p.lede{color:#9fb2bd;font-size:13px;max-width:78ch}
figure{margin:0 0 30px;padding-top:18px;border-top:1px solid #232f36}
img{display:block;width:100%;height:auto;margin:0 0 8px;border:1px solid #2a363e;background:#131a1f}
figcaption{color:#9fb2bd;font-size:12.5px}
figcaption b{color:#e8eef2}
.k{color:#7f95a1}
.bad{color:#ff7b6b}.ok{color:#8fd6a0}
`;

const n = (v) => (typeof v !== "number" ? `<span class="bad">?</span>` : `<span class="${v > 0 ? "bad" : "ok"}">${v}</span>`);

async function rowsFor(task, rep, files, dir) {
  const entry = manifest.find((m) => m.task === task);
  const byName = new Map((entry?.shots || []).map((s) => [s.name, s]));
  const seen = new Set();
  const rows = (Array.isArray(rep) ? rep : []).map((r) => {
    const file = basename(r.jpg || "");
    seen.add(file);
    const name = String(r.label || "").split("/").slice(1).join("/");
    const m = byName.get(name);
    const a = r.audit || {};
    return {
      file,
      name,
      page: m?.page || "—",
      px: r.px || "?",
      full: !!m?.full,
      w: m?.width ?? "?",
      kb: Math.round((r.bytes || 0) / 1024),
      errs: r.errs?.length,
      contrast: a.lowContrast?.length,
      unlabelled: (a.labelledControlsMissing?.length || 0) + (a.unnamedButtons?.length || 0),
      alt: a.imgMissingAlt?.length,
      landmarks: a.landmarks || "?",
      ok: r.ok,
    };
  });
  for (const f of files)
    if (!seen.has(f))
      rows.push({ file: f, name: f.replace(/\.(jpg|png)$/, ""), page: "—", px: "?", full: false, w: "?",
        kb: Math.round((await stat(join(dir, f))).size / 1024), errs: "—", contrast: "—", unlabelled: "—", alt: "—", landmarks: "—", ok: null });
  return rows;
}

async function writeIndex(task) {
  const dir = join(designDir, task, "shots");
  if (!existsSync(dir)) return null;
  const repName = task === "." ? "index" : task;
  const repPath = join(toolsDir, "work", "shoot", `${repName}.json`);
  const rep = existsSync(repPath) ? JSON.parse(await readFile(repPath, "utf8")) : null;
  const files = (await readdir(dir)).filter((f) => /\.(png|jpg)$/.test(f)).sort();
  const rows = await rowsFor(task, rep, files, dir);
  const entry = manifest.find((m) => m.task === task);
  const title = entry?.title || task;

  const body = [];
  for (const r of rows) {
    const m = String(r.px).match(/^(\d+)x(\d+)/);
    body.push(`<figure>
  <img src="${r.file}" width="${m ? m[1] : 1240}" height="${m ? m[2] : 700}" loading="lazy"
       alt="Screenshot of ${r.name} on ${r.page}, ${r.px} pixels.">
  <figcaption><b>${r.name}</b> — ${r.page} at ${r.w} px viewport${r.full ? ", whole page" : ""}, ${r.kb} KB.
    <span class="k">console</span> ${n(r.errs)}
    <span class="k">contrast</span> ${n(r.contrast)}
    <span class="k">unnamed controls</span> ${n(r.unlabelled)}
    <span class="k">img without alt</span> ${n(r.alt)}
    <span class="k">landmarks</span> ${r.landmarks}
    ${r.ok === false ? '<span class="bad">the audit flagged this shot</span>' : ""}</figcaption>
</figure>`);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — every screenshot</title>
<style>${css}</style>
</head>
<body>
<main>
  <h1>${title} — ${rows.length} screenshots</h1>
  <p class="lede">Every screenshot this task has committed, with the numbers the audit ran on it.
  These are the same files the gallery thumbnail is taken from. Generated by
  <code>tools/shotsindex.mjs</code>${rep
    ? ` from <code>tools/work/shoot/${repName}.json</code>, the report the last complete
       <code>node tools/shoot.mjs ${task}</code> run wrote. Edit the manifest, not this page.`
    : ` — from the file names on disk, because <code>tools/work/shoot/${repName}.json</code> is
       missing. The audit columns are blank and the page says so; run
       <code>node tools/shoot.mjs ${task}</code> to fill them.`}
  <a href="../index.html">the task</a> · <a href="../../index.html">the gallery</a></p>
  ${body.join("\n")}
</main>
</body>
</html>
`;
  await writeFile(join(dir, "index.html"), html);
  return { task, shots: rows.length, report: !!rep };
}

const wanted = process.argv[2] && process.argv[2] !== "." ? [process.argv[2]] : manifest.map((m) => m.task).filter((t) => t !== ".");
for (const t of wanted) { const r = await writeIndex(t); if (r) console.log(`${r.task.padEnd(14)} ${String(r.shots).padStart(3)} shots  index.html  ${r.report ? "audit numbers from the report" : "NO REPORT — audit columns blank"}`); }
