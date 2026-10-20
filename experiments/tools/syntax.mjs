// Cheap syntax gate for the experiment pages: every .js under experiments/ is checked as an ES
// module (copy to a .mjs in tmp, `node --check`). Catches the broken-edit class of bug that a
// browser check only reports as "Unexpected token".
//   node experiments/tools/syntax.mjs [dir ...]
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["."];
const dir = await mkdtemp(join(tmpdir(), "syntax-"));
const files = [];
async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
}
for (const r of roots) await walk(r);

const bad = [];
for (const f of files) {
  const t = join(dir, f.replaceAll("/", "_"));
  await writeFile(t, await readFile(f, "utf8"));
  await new Promise((done) => execFile(process.execPath, ["--check", t], (err, so, se) => {
    if (err) bad.push(`${f}: ${String(se).split("\n").slice(0, 3).join(" ")}`);
    done();
  }));
}
for (const b of bad) console.log("FAIL " + b);
console.log(`${files.length - bad.length}/${files.length} files parse as ES modules`);
process.exit(bad.length ? 1 : 0);
