// Climb the ladder on one arm: every rung's prompts (work/prompts, from build.ts), one question per run, cold.
//   node scripts/run.ts --arm strata|27b [--rungs 8K,32K] [--only id,id] [--run N] [--max-tokens N] [--force]
// Appends one row per request (rung, question, run number; --run picks the number, default 1) to
// results/<arm>.jsonl and skips rows already there without an error, so a stopped run resumes. --force asks again;
// report.ts keeps only the newest row of each rung/question/run.
// Times come from the SSE stream as the client sees it: TTFT = request sent to the first delta (thinking or
// answer), decode = (completion tokens - 1) / (last delta - first delta). the servers' own `timings` are kept
// beside them (both arms report them), which also shows whether a request waited behind someone else's in the router's one slot.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { grade, HERE, loadQuestions, RUNGS, rungName } from "./lib.ts";

// Endpoints and the key come from the environment (the repo is public: no hosts or keys in it).
//   STRATA_BASE_URL  Strata's OpenAI API, with /v1      STRATA_API_KEY  its bearer key
//   ROUTER_BASE_URL  the llama.cpp router's API, with /v1
const env = (name: string) => {
  const v = process.env[name];
  if (!v) { console.error(`set ${name}`); process.exit(2); }
  return v.replace(/\/+$/, "");
};
const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const armName = opt("arm");
if (armName !== "strata" && armName !== "27b") { console.error("usage: run.ts --arm strata|27b [--rungs 8K,32K] [--only id,id] [--run N] [--max-tokens N] [--force]"); process.exit(2); }
const base = env(armName === "strata" ? "STRATA_BASE_URL" : "ROUTER_BASE_URL");
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (armName === "strata") headers.Authorization = `Bearer ${env("STRATA_API_KEY")}`;
const maxTokens = Number(opt("max-tokens") ?? 4096);
const rungs = opt("rungs")?.split(",") ?? RUNGS.map(rungName);
const only = opt("only")?.split(",");
const runNo = Number(opt("run") ?? 1);
const TIMEOUT_MS = 15 * 60 * 1000;
const MEM_FLOOR_GIB = 8;

let model = "qwen3.8-27b";
if (armName === "strata") {
  const r = await fetch(`${base}/models`, { headers });
  if (!r.ok) throw new Error(`${base}/models: HTTP ${r.status}`);
  model = (await r.json()).data[0].id;
}

const memGiB = () => Number(readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+)/)![1]) / 1048576;

// The router has one slot for the 27B: wait until nobody else's request is in it, so it is not timed behind them.
async function routerIdle() {
  if (armName !== "27b") return;
  const root = base.replace(/\/v1$/, "");
  for (let i = 0; i < 600; i++) {
    const r = await fetch(`${root}/slots?model=${model}`).catch(() => null);
    if (!r?.ok) return; // no /slots here: rely on the server timings
    const slots = await r.json().catch(() => null);
    if (!Array.isArray(slots) || !slots.some((s: any) => s.is_processing)) return;
    if (i === 0) console.log("router slot busy (someone else's request); waiting");
    await new Promise((res) => setTimeout(res, 2000));
  }
  console.log("router slot still busy after 20 min; sending anyway (compare server_prefill_tps)");
}

// A tiny request first, so a model the server still has to load does not count against the first rung.
{
  const t = performance.now();
  const r = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify({
    model, max_tokens: 8, messages: [{ role: "user", content: "Say hi." }], chat_template_kwargs: { enable_thinking: false } }) });
  await r.text();
  console.log(`${armName} (${model}) warm-up: HTTP ${r.status} in ${Math.round(performance.now() - t) / 1000}s`);
}

const RES = join(HERE, "results");
mkdirSync(RES, { recursive: true });
const out = join(RES, `${armName}.jsonl`);
const key = (rung: string, id: string, run: number) => `${rung}/${id}/${run}`;
const done = new Set(existsSync(out) && !argv.includes("--force")
  ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error)
    .map((r) => key(r.rung, r.id, r.run ?? 1)) : []);
const questions = loadQuestions().filter((q) => !only || only.includes(q.id));

for (const rung of rungs) {
  const dir = join(HERE, "work/prompts", rung);
  if (!existsSync(dir) || readdirSync(dir).length === 0) { console.error(`no prompts for ${rung}: run build.ts`); process.exit(2); }
  for (const q of questions) {
    if (done.has(key(rung, q.id, runNo))) continue;
    if (memGiB() < MEM_FLOOR_GIB + 0.5) { console.error(`MemAvailable ${memGiB().toFixed(1)} GiB: stopping`); process.exit(4); }
    const p = JSON.parse(readFileSync(join(dir, `${q.id}.json`), "utf8"));
    const body = {
      model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: true },
      messages: [{ role: "system", content: p.system }, { role: "user", content: `[request ${randomUUID()}]\n\n${p.user}` }],
    };
    await routerIdle();
    const memBefore = memGiB();
    const t0 = performance.now();
    const s = (t: number | null) => (t === null ? null : Math.round(t - t0) / 1000);
    let first: number | null = null, last: number | null = null;
    let content = "", reasoning = "", finish: string | null = null, usage: any = null, timings: any = null, error: string | null = null;
    try {
      const r = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
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
            if (typeof d.content === "string" && d.content) { content += d.content; first ??= now; last = now; }
            if (c.finish_reason) finish = c.finish_reason;
          }
        }
      }
    } catch (e: any) {
      error = String(e?.message ?? e);
    }
    const t1 = performance.now();
    if (error && content === "" && /fetch failed|ECONNREFUSED|ECONNRESET|socket/i.test(error)) {
      console.error(`${rung} ${q.id}: ${error}; stopping, rerun to resume`);
      process.exit(3);
    }
    const g = grade(q, content);
    const ttft = s(first);
    const promptTokens = usage?.prompt_tokens ?? null;
    const row = {
      arm: armName, model, rung, id: q.id, run: runNo, time: new Date().toISOString(), built_tokens: p.tokens,
      prompt_tokens: promptTokens, completion_tokens: usage?.completion_tokens ?? null,
      ttft_s: ttft, total_s: s(t1),
      prefill_tps: promptTokens && ttft ? Math.round(promptTokens / ttft) : null,
      decode_tps: usage?.completion_tokens > 1 && first !== null && last !== null && last > first
        ? Math.round((usage.completion_tokens - 1) / ((last - first) / 1000) * 10) / 10 : null,
      server_prefill_tps: timings?.prompt_per_second ? Math.round(timings.prompt_per_second) : null,
      server_decode_tps: timings?.predicted_per_second ? Math.round(timings.predicted_per_second * 10) / 10 : null,
      server_prompt_n: timings?.prompt_n ?? null, server_cache_n: timings?.cache_n ?? null,
      reasoning_chars: reasoning.length, finish_reason: finish, error,
      mem_before_gib: Math.round(memBefore * 10) / 10, mem_after_gib: Math.round(memGiB() * 10) / 10,
      right: g.right, answer: g.answer, reply: content,
    };
    appendFileSync(out, JSON.stringify(row) + "\n");
    console.log(`${rung.padEnd(5)} ${q.id.padEnd(22)} ${g.right ? "RIGHT" : "WRONG"}  prompt=${promptTokens} ttft=${ttft}s` +
      ` prefill=${row.prefill_tps}/s decode=${row.decode_tps}/s out=${row.completion_tokens} total=${row.total_s}s` +
      (timings ? ` server=${row.server_prefill_tps}/${row.server_decode_tps}` : "") + (error ? `  error=${error.slice(0, 120)}` : ""));
  }
}
