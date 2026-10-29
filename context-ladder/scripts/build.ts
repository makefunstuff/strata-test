// Build every rung's prompts once, so both arms get the very same text.
//   ROUTER_BASE_URL=http://<host>:18080/v1 node scripts/build.ts
// For each rung and question: real filler files (router's, then koa's, the needle files left out) up to the rung,
// with the needle file put in at the file boundary nearest the middle. The filler is cut at a line so the whole
// prompt (system + nonce + corpus + question, as the 27B's /tokenize counts it) lands just under the rung.
// Writes work/prompts/<rung>/<question>.json: { system, user, tokens }. The nonce is added per request by run.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { block, HERE, loadQuestions, RUNGS, rungName, sourceFiles, SYSTEM, userMessage, type Question } from "./lib.ts";

const base = process.env.ROUTER_BASE_URL?.replace(/\/+$/, "");
if (!base) { console.error("set ROUTER_BASE_URL (the 27B's /tokenize is the ruler)"); process.exit(2); }
const TOKENIZE = base.replace(/\/v1$/, "") + "/tokenize";
// The nonce ("[request <uuid>]", ~25 tokens) and the chat template's role markers are not in the counted text.
const TEMPLATE_SLACK = 64;

async function tokens(text: string): Promise<number> {
  const r = await fetch(TOKENIZE, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen3.8-27b", content: text }) });
  if (!r.ok) throw new Error(`/tokenize: HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).tokens.length;
}

const files = sourceFiles();
const questions = loadQuestions();
const needles = new Set(questions.map((q) => q.needle));
for (const q of questions) if (!files.some((f) => f.path === q.needle)) throw new Error(`needle ${q.needle} not found`);
const filler = files.filter((f) => !needles.has(f.path));
const fillerLines = filler.map((f) => f.text.split("\n"));
const totalLines = fillerLines.reduce((a, l) => a + l.length, 0);

/** The first `n` filler lines as file blocks, the needle block at the boundary nearest the middle. */
function corpus(n: number, q: Question): string {
  const blocks: string[] = [];
  for (let i = 0; i < filler.length && n > 0; i++) {
    const take = Math.min(n, fillerLines[i].length);
    blocks.push(block(filler[i].path, fillerLines[i].slice(0, take).join("\n")));
    n -= take;
  }
  const needle = block(q.needle, files.find((f) => f.path === q.needle)!.text);
  const half = (blocks.join("").length + needle.length) / 2;
  let at = 0, best = Infinity;
  for (let i = 0, len = 0; i <= blocks.length; len += blocks[i]?.length ?? 0, i++) {
    if (Math.abs(len - half) < best) { best = Math.abs(len - half); at = i; }
  }
  blocks.splice(at, 0, needle);
  return blocks.join("");
}

const whole = async (n: number, q: Question) => tokens(`${SYSTEM}\n${userMessage(corpus(n, q), q)}`);

for (const rung of RUNGS) {
  mkdirSync(join(HERE, "work/prompts", rungName(rung)), { recursive: true });
  for (const q of questions) {
    const goal = rung - TEMPLATE_SLACK;
    let lo = 0, hi = totalLines; // largest n with whole(n) <= goal
    if ((await whole(hi, q)) <= goal) throw new Error(`corpus too small for ${rungName(rung)}`);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if ((await whole(mid, q)) <= goal) lo = mid; else hi = mid - 1;
    }
    const c = corpus(lo, q);
    const user = userMessage(c, q);
    const t = await tokens(`${SYSTEM}\n${user}`);
    const frac = c.indexOf(`===== FILE ${q.needle} =====`) / c.length;
    writeFileSync(join(HERE, "work/prompts", rungName(rung), `${q.id}.json`),
      JSON.stringify({ rung, question: q.id, tokens: t, filler_lines: lo, needle_at: Math.round(frac * 100) / 100, system: SYSTEM, user }));
    console.log(`${rungName(rung).padEnd(5)} ${q.id.padEnd(22)} ${t} tokens, ${user.length} chars, needle at ${Math.round(frac * 100)}%`);
  }
}
