// Shared by build.ts, run.ts and report.ts: the padding corpus, the questions, the rungs and the grader.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const HERE = join(import.meta.dirname, "..");
const target = JSON.parse(readFileSync(join(HERE, "target.json"), "utf8"));

/** The ladder: total prompt tokens per request (1K = 1024). */
export const RUNGS = [8192, 32768, 65536, 122880];
export const rungName = (n: number) => `${n / 1024}K`;

export interface Question { id: string; needle: string; q: string; answer: string[] }
export const loadQuestions = (): Question[] => JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8")).questions;

export const SYSTEM = [
  "You answer questions about source code. Files from two repositories are in the user message, each between",
  "`===== FILE <repo>/<path> =====` and `===== END <repo>/<path> =====`. Answer from that text only.",
].join(" ");
export const INSTRUCT = "Reply in exactly this format and nothing else:\nANSWER: <short answer>";

export interface SourceFile { path: string; text: string }

/** Every tracked text file of each repo in target.json, paths prefixed with the repo name, `git ls-files` order. */
export function sourceFiles(): SourceFile[] {
  const globToRe = (g: string) => new RegExp("(^|/)" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
  const excludes: RegExp[] = target.exclude.map(globToRe);
  const out: SourceFile[] = [];
  for (const repo of target.repos) {
    const dir = join(HERE, "work", repo.name);
    const paths = execFileSync("git", ["-C", dir, "-c", "core.quotepath=off", "ls-files", "-z"], { encoding: "utf8" })
      .split("\0").filter(Boolean).filter((p) => !excludes.some((re) => re.test(p))).sort();
    for (const p of paths) {
      const buf = readFileSync(join(dir, p));
      if (buf.includes(0)) continue; // binary
      out.push({ path: `${repo.name}/${p}`, text: buf.toString("utf8").replace(/\n$/, "") });
    }
  }
  return out;
}

export const block = (path: string, text: string) => `===== FILE ${path} =====\n${text}\n===== END ${path} =====\n\n`;

/** The user message after the nonce: the corpus, then the question. */
export const userMessage = (corpus: string, q: Question) => `${corpus}Question: ${q.q}\n\n${INSTRUCT}`;

export function grade(q: Question, reply: string) {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\*\*/g, "");
  const m = text.match(/ANSWER:\s*([\s\S]*)$/i);
  const answer = m ? m[1].trim() : null;
  // No ANSWER: line is wrong: a reply that only mentions the answer somewhere does not count.
  const right = answer !== null && q.answer.every((re) => new RegExp(re, "i").test(answer));
  return { answer, right };
}
