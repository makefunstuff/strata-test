// Shared by run.ts, check.ts and report.ts: the question set, positions in the prompt, and the grader.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineOf, pack, type FileSpan } from "./pack.ts";

export const HERE = join(import.meta.dirname, "..");

export interface Question {
  id: string; q: string; paths: string[]; line: number; expect: string[]; answer: string[];
}
export type Position = "start" | "middle" | "end";
export interface Placed extends Question { offset: number; frac: number; position: Position }

export function loadQuestions(): Question[] {
  return JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8")).questions;
}

/** Character offset of `path:line` in the packed corpus, or -1. */
export function offsetOf(corpus: string, files: FileSpan[], path: string, line: number): number {
  const f = files.find((x) => x.path === path);
  if (!f) return -1;
  const at = corpus.indexOf(`\n${line}| `, f.start);
  return at >= 0 && at < f.end ? at + 1 : -1;
}

/** Each question with its canonical line's place in the prompt: thirds by character offset. */
export function placeQuestions(corpus: string, files: FileSpan[], qs = loadQuestions()): Placed[] {
  return qs.map((q) => {
    const offset = offsetOf(corpus, files, q.paths[0], q.line);
    const frac = offset / corpus.length;
    const position: Position = frac < 1 / 3 ? "start" : frac < 2 / 3 ? "middle" : "end";
    return { ...q, offset, frac, position };
  });
}

export function packed() { return pack(); }

export interface Grade {
  answer: string | null; citation: string | null; cited_path: string | null; cited_line: number | null;
  cited_text: string | null; cite_ok: boolean; answer_ok: boolean; correct: boolean;
}

/** Pull ANSWER and CITATION out of a reply (thinking already removed) and grade them against the question. */
export function grade(q: Question, reply: string): Grade {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\*\*/g, "");
  const am = text.match(/ANSWER:\s*([\s\S]*?)(?=\n\s*CITATION:|$)/i);
  const cm = text.match(/CITATION:\s*`?([^\s`:]+):(\d+)/i);
  const answer = am ? am[1].trim() : null;
  let cited_path = cm ? cm[1].replace(/^\.\//, "") : null;
  const cited_line = cm ? Number(cm[2]) : null;
  const cited_text = cited_path && cited_line ? lineOf(cited_path, cited_line) : null;
  const cite_ok = !!cited_path && q.paths.includes(cited_path) && cited_text !== null &&
    q.expect.some((e) => cited_text.includes(e));
  const subject = answer ?? text;
  const answer_ok = q.answer.every((re) => new RegExp(re, "i").test(subject));
  return {
    answer, citation: cm ? `${cm[1]}:${cm[2]}` : null, cited_path, cited_line, cited_text,
    cite_ok, answer_ok, correct: cite_ok && answer_ok,
  };
}
