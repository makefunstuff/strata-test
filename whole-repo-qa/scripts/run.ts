// Ask every question with the whole packed repo in the prompt, on one arm, and grade each reply.
//   node scripts/run.ts --arm strata|27b [--label NAME] [--only id,id] [--warm] [--max-tokens N] [--force]
// Appends one row per question to results/<label>.jsonl (thinking text to results/<label>/<id>.reasoning.txt) and
// skips questions already there, so a stopped run resumes where it left off. results/<label>.meta.json records the
// endpoint, model, prompt size and anything cut to fit the arm's context.
// Cold by default: a fresh nonce opens every prompt, so no prefix cache can serve the repo; --warm drops it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { grade, HERE, loadQuestions, packed, placeQuestions } from "./lib.ts";

// Endpoints and the key come from the environment (the repo is public: no hosts or keys in it).
//   STRATA_BASE_URL  Strata's OpenAI API, with /v1      STRATA_API_KEY  its bearer key
//   ROUTER_BASE_URL  the llama.cpp router's API, with /v1 (its /tokenize sits beside /v1)
interface Arm { base: string; baseEnv: string; model?: string; key?: string; ctx: number; tokenize?: string }
const env = (name: string) => {
  const v = process.env[name];
  if (!v) { console.error(`set ${name}`); process.exit(2); }
  return v.replace(/\/+$/, "");
};
const ARMS: Record<string, () => Arm> = {
  strata: () => ({ base: env("STRATA_BASE_URL"), baseEnv: "STRATA_BASE_URL", ctx: 131072, key: env("STRATA_API_KEY") }),
  "27b": () => {
    const base = env("ROUTER_BASE_URL");
    return { base, baseEnv: "ROUTER_BASE_URL", model: "qwen3.8-27b", ctx: 131072, tokenize: base.replace(/\/v1$/, "") + "/tokenize" };
  },
};

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name: string) => argv.includes(`--${name}`);
const armName = opt("arm");
if (!armName || !ARMS[armName]) { console.error("usage: run.ts --arm strata|27b [--label NAME] [--only id,id] [--warm] [--max-tokens N] [--force]"); process.exit(2); }
const arm = ARMS[armName]();
const warm = flag("warm");
const label = opt("label") ?? `${armName}${warm ? "-warm" : ""}`;
const maxTokens = Number(opt("max-tokens") ?? 16384);
const only = opt("only")?.split(",");
const TIMEOUT_MS = 30 * 60 * 1000;

const SYSTEM = [
  "You answer questions about a code repository. The whole repository is in the user message.",
  "Each file starts with `===== FILE <path> (<n> lines) =====` and ends with `===== END <path> =====`.",
  "Every line is prefixed with its line number and `| `, and an anchor line `----- <path>:<line> -----` stands before",
  "every 25th line of a file. Answer from the repository text only.",
].join(" ");
const INSTRUCT = [
  "Reply in exactly this format and nothing else:",
  "ANSWER: <short answer>",
  "CITATION: <path>:<line>",
  "The citation is the one line of the repository that shows the answer: its file path and line number.",
].join("\n");

const headers: Record<string, string> = { "Content-Type": "application/json" };
if (arm.key) headers.Authorization = `Bearer ${arm.key}`;

async function modelId(): Promise<string> {
  if (arm.model) return arm.model;
  const r = await fetch(`${arm.base}/models`, { headers });
  if (!r.ok) throw new Error(`${arm.base}/models: HTTP ${r.status}`);
  return (await r.json()).data[0].id;
}

// The server's own tokenizer: /tokenize where the server has one (llama.cpp), else usage.prompt_tokens of a
// one-token request minus that of an empty one (Strata has no /tokenize). The second way costs one full prefill.
async function promptTokens(content: string): Promise<number> {
  const r = await fetch(`${arm.base}/chat/completions`, { method: "POST", headers, body: JSON.stringify({
    model, max_tokens: 1, messages: [{ role: "user", content }], chat_template_kwargs: { enable_thinking: false } }) });
  if (!r.ok) throw new Error(`token count: HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).usage.prompt_tokens;
}
async function countTokens(text: string): Promise<number | null> {
  if (!arm.tokenize) return (await promptTokens(`[count ${randomUUID()}]\n${text}`)) - (await promptTokens(`[count ${randomUUID()}]\n`));
  const r = await fetch(arm.tokenize, { method: "POST", headers, body: JSON.stringify({ model: arm.model, content: text }) });
  return r.ok ? (await r.json()).tokens.length : null;
}

const { corpus: full, files } = packed();
const model = await modelId();

// Fit the corpus to the arm's context: drop whole files from the end until prompt + max_tokens fits.
const PROMPT_SLACK = 600; // question, instructions, nonce and chat template
let corpus = full;
const dropped: string[] = [];
let corpusTokens = await countTokens(corpus);
if (corpusTokens !== null) {
  while (corpusTokens + PROMPT_SLACK + maxTokens > arm.ctx) {
    const f = files.filter((x) => !dropped.includes(x.path)).at(-1)!;
    dropped.push(f.path);
    corpus = full.slice(0, f.start);
    corpusTokens = (await countTokens(corpus))!;
  }
}

const RES = join(HERE, "results");
mkdirSync(join(RES, label), { recursive: true });
const out = join(RES, `${label}.jsonl`);
writeFileSync(join(RES, `${label}.meta.json`), JSON.stringify({
  label, arm: armName, base: `$${arm.baseEnv}`, model, ctx: arm.ctx, max_tokens: maxTokens, warm,
  thinking: "chat_template_kwargs.enable_thinking: true, no effort field; server-default sampling",
  target: JSON.parse(readFileSync(join(HERE, "target.json"), "utf8")),
  corpus_chars: corpus.length, corpus_tokens_counted: corpusTokens,
  token_count_via: arm.tokenize ? "/tokenize" : "usage.prompt_tokens difference", truncated_files: dropped,
  started: new Date().toISOString(),
}, null, 1) + "\n");
if (dropped.length) console.log(`context ${arm.ctx}: dropped ${dropped.length} files from the end: ${dropped.join(", ")}`);

// A tiny request first, so a model the server still has to load does not count against the first question.
{
  const t = performance.now();
  const r = await fetch(`${arm.base}/chat/completions`, { method: "POST", headers, body: JSON.stringify({
    model, max_tokens: 8, messages: [{ role: "user", content: "Say hi." }], chat_template_kwargs: { enable_thinking: false } }) });
  await r.text();
  console.log(`warm-up: HTTP ${r.status} in ${Math.round(performance.now() - t) / 1000}s`);
}

const done = new Set(existsSync(out) && !flag("force")
  ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
const placed = placeQuestions(full, files, loadQuestions()).filter((q) => !only || only.includes(q.id));

for (const q of placed) {
  if (done.has(q.id)) continue;
  const inPrompt = !dropped.some((p) => q.paths.includes(p));
  const nonce = warm ? "" : `[request ${randomUUID()}]\n\n`;
  const body = {
    model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true },
    chat_template_kwargs: { enable_thinking: true },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${nonce}${corpus}\n\nQuestion: ${q.q}\n\n${INSTRUCT}` },
    ],
  };
  const t0 = performance.now();
  const s = (t: number | null) => (t === null ? null : Math.round(t - t0) / 1000);
  let first: number | null = null, firstContent: number | null = null, last: number | null = null;
  let content = "", reasoning = "", finish: string | null = null, usage: any = null, timings: any = null, error: string | null = null;
  try {
    const ctl = AbortSignal.timeout(TIMEOUT_MS);
    const r = await fetch(`${arm.base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: ctl });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of r.body) {
      buf += dec.decode(chunk as Uint8Array, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let ev: any;
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.error) throw new Error(JSON.stringify(ev.error).slice(0, 500));
        if (ev.usage) usage = ev.usage;
        if (ev.timings) timings = ev.timings;
        for (const c of ev.choices ?? []) {
          const d = c.delta ?? {};
          const rs = d.reasoning_content ?? d.reasoning;
          const now = performance.now();
          if (typeof rs === "string" && rs) { reasoning += rs; first ??= now; last = now; }
          if (typeof d.content === "string" && d.content) { content += d.content; first ??= now; firstContent ??= now; last = now; }
          if (c.finish_reason) finish = c.finish_reason;
        }
      }
    }
  } catch (e: any) {
    error = String(e?.message ?? e);
  }
  const t1 = performance.now();
  if (error && content === "" && /fetch failed|ECONNREFUSED|ECONNRESET|socket/i.test(error)) {
    // The server went away (a mode switch or the night stop): leave this question for the resume.
    console.error(`${q.id}: ${error}; stopping, rerun to resume`);
    process.exit(3);
  }
  const g = grade(q, content);
  const row = {
    id: q.id, position: q.position, frac: Math.round(q.frac * 1000) / 1000, label, model, time: new Date().toISOString(),
    in_prompt: inPrompt, ttft_s: s(first), first_answer_s: s(firstContent), total_s: s(t1),
    decode_tps: usage?.completion_tokens && first !== null && last !== null && last > first
      ? Math.round((usage.completion_tokens - 1) / ((last - first) / 1000) * 10) / 10 : null,
    prompt_tokens: usage?.prompt_tokens ?? null, completion_tokens: usage?.completion_tokens ?? null,
    reasoning_chars: reasoning.length, finish_reason: finish, error, timings,
    expected: `${q.paths[0]}:${q.line}`, ...g, reply: content,
  };
  writeFileSync(join(RES, label, `${q.id}.reasoning.txt`), reasoning);
  appendFileSync(out, JSON.stringify(row) + "\n");
  console.log(`${q.position.padEnd(6)} ${q.id.padEnd(22)} ${g.correct ? "RIGHT" : g.cite_ok ? "cite-only" : g.answer_ok ? "answer-only" : "WRONG"}` +
    `  cite=${g.citation ?? "-"}  ttft=${row.ttft_s}s total=${row.total_s}s prompt=${row.prompt_tokens} out=${row.completion_tokens}` +
    (error ? `  error=${error.slice(0, 120)}` : ""));
}
