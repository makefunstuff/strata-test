// Validate questions.json against the pinned checkout: every canonical line exists, contains an expected string,
// and a reply that quotes it is graded right. Prints each question's place in the prompt.
//   node scripts/check.ts
import { lineOf } from "./pack.ts";
import { grade, packed, placeQuestions } from "./lib.ts";

const { corpus, files } = packed();
const placed = placeQuestions(corpus, files);
let bad = 0;
const ids = new Set<string>();
for (const q of placed) {
  const text = lineOf(q.paths[0], q.line);
  const problems: string[] = [];
  if (ids.has(q.id)) problems.push("duplicate id");
  ids.add(q.id);
  if (text === null) problems.push("no such line");
  else if (!q.expect.some((e) => text.includes(e))) problems.push(`line lacks expect: ${JSON.stringify(text)}`);
  if (q.offset < 0) problems.push("line not found in corpus");
  const self = grade(q, `ANSWER: ${q.expect[0]}\nCITATION: ${q.paths[0]}:${q.line}`);
  if (!self.cite_ok) problems.push("canonical citation does not grade as cited");
  const wrong = grade(q, `ANSWER: nothing\nCITATION: ${q.paths[0]}:${q.line + 400}`);
  if (wrong.correct) problems.push("a wrong reply grades right");
  if (problems.length) bad++;
  console.log(`${q.position.padEnd(6)} ${(q.frac * 100).toFixed(1).padStart(5)}%  ${q.id.padEnd(22)} ${q.paths[0]}:${q.line}` +
    (problems.length ? `  !! ${problems.join("; ")}` : ""));
}
const by = (p: string) => placed.filter((q) => q.position === p).length;
console.log(`\n${placed.length} questions: start ${by("start")}, middle ${by("middle")}, end ${by("end")}; ${bad} with problems`);
process.exit(bad ? 1 : 0);
