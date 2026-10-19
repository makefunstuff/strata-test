// Pack work/repo into one prompt body with path:line markers.
//   node scripts/pack.ts            writes work/corpus.txt and work/index.json
// Layout, per tracked file in `git ls-files` order (C locale), minus target.json's excludes:
//   ===== FILE <path> (<n> lines) =====
//   1| first line
//   ...
//   ===== END <path> =====
// A full path:line marker on every line (`lib/layer.js:12| `) costs ~8 tokens a line and would double the prompt, so
// the path sits in the header and footer, each line carries its number, and a full anchor line
//   ----- <path>:26 -----
// stands before every 25th line (26, 51, ...).
// index.json records each file's character span, which places every question at a fraction of the prompt.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = join(import.meta.dirname, "..");
const REPO = join(HERE, "work/repo");
const target = JSON.parse(readFileSync(join(HERE, "target.json"), "utf8"));

const globToRe = (g: string) => new RegExp("(^|/)" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
const excludes: RegExp[] = target.exclude.map(globToRe);
const ANCHOR = 25;

export interface FileSpan { path: string; lines: number; start: number; end: number }

export function pack(): { corpus: string; files: FileSpan[] } {
  const paths = execFileSync("git", ["-C", REPO, "-c", "core.quotepath=off", "ls-files", "-z"], { encoding: "utf8" })
    .split("\0").filter(Boolean).filter((p) => !excludes.some((re) => re.test(p))).sort();
  let corpus = "";
  const files: FileSpan[] = [];
  for (const path of paths) {
    const buf = readFileSync(join(REPO, path));
    if (buf.includes(0)) continue; // binary
    let text = buf.toString("utf8");
    if (text.endsWith("\n")) text = text.slice(0, -1);
    const lines = text.split("\n");
    const start = corpus.length;
    corpus += `===== FILE ${path} (${lines.length} lines) =====\n`;
    corpus += lines.map((l, i) => (i > 0 && i % ANCHOR === 0 ? `----- ${path}:${i + 1} -----\n` : "") + `${i + 1}| ${l}`)
      .join("\n") + `\n===== END ${path} =====\n\n`;
    files.push({ path, lines: lines.length, start, end: corpus.length });
  }
  return { corpus, files };
}

/** The text of path:line in the pinned checkout (1-based), or null. */
export function lineOf(path: string, line: number): string | null {
  try {
    const lines = readFileSync(join(REPO, path), "utf8").split("\n");
    return line >= 1 && line <= lines.length ? lines[line - 1] : null;
  } catch { return null; }
}

if (import.meta.main) {
  const { corpus, files } = pack();
  writeFileSync(join(HERE, "work/corpus.txt"), corpus);
  writeFileSync(join(HERE, "work/index.json"), JSON.stringify({ chars: corpus.length, files }, null, 1));
  console.log(`${files.length} files, ${corpus.split("\n").length} lines, ${corpus.length} chars`);
}
