// tui/tools/summarize.mjs — turn check.mjs's JSON into one line per pass.
// The other shelves' checkers print a table themselves; the tui one prints JSON because the
// scenarios assert against state(), and a table cannot carry that. This is the table.
//   node tui/tools/summarize.mjs < file.json        (or: --file path)
import { readFileSync } from "node:fs";

const fromFile = process.argv.indexOf("--file");
const txt = fromFile >= 0 ? readFileSync(process.argv[fromFile + 1], "utf8") : readFileSync(0, "utf8");
let d;
try {
  d = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
} catch {
  process.stdout.write(txt.slice(-4000));     // the checker died before it printed JSON: show why
  process.exit(1);
}
const pad = (v, n) => String(v ?? "").padEnd(n);
for (const c of d.results) {
  const g = c.grid ?? {};
  const errs = c.errors ?? [];
  console.log(
    `${errs.length ? "FAIL" : "PASS"}  ${pad(c.page, 12)} ${pad(c.tag, 7)} ` +
    `cols=${g.cols} rows=${g.rows} ink=${g.ink} glyphs=${g.glyphs} ` +
    `changed=${c.changed} expect=${Object.keys(c.expect ?? {}).length ? JSON.stringify(c.expect) : "-"} ` +
    `pose=${JSON.stringify(c.pose ?? [])}`,
  );
  const seen = new Set();
  for (const e of errs) {
    const line = String(e).split("\n")[0].slice(0, 200);
    if (seen.has(line)) continue;
    seen.add(line);
    console.log(`     ! ${line}`);
  }
}
console.log("overall:", d.ok ? "ok" : "FAILED");
process.exit(d.ok ? 0 : 1);
