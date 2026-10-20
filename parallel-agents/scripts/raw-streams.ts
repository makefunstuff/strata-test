// Raw concurrent streams against Strata's /v1/chat/completions: N streaming requests sent at the same moment, each
// timed from its own SSE deltas. Same prompt and thinking request as homelab's raw-speed.sh (pi's daily setting:
// enable_thinking, no effort field), 512 new tokens, each prompt behind a unique tag so no stream reuses another's
// prompt cache.
//   per stream: TTFT (send to first delta), decode = (completion_tokens - 1) / (first to last delta)
//   aggregate:  all streams' completion tokens / (first send to last delta), and the sum of the per-stream decodes
// While the round runs, /metrics is polled every 0.5 s for the engine's view of its slots (live.slots).
// usage: node raw-streams.ts LABEL STREAMS [ROUNDS=3]   appends rows to results/raw-streams.jsonl
import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.STRATA_BASE_URL!, KEY = process.env.STRATA_API_KEY!;
if (!BASE || !KEY) throw new Error("set STRATA_BASE_URL and STRATA_API_KEY");
const PROMPT = "Write a Python module that parses an nginx access log, aggregates requests per status code and per " +
  "path, and prints the ten slowest paths by p95 latency. Include type hints and docstrings.";
const auth = { Authorization: `Bearer ${KEY}` };

type Stream = { ttft_s: number | null; decode_tps: number | null; completion_tokens: number; prompt_tokens: number;
  wall_s: number; t_first: number; t_last: number; error?: string };

async function one(maxTokens: number, t0: number): Promise<Stream> {
  const body = { model: "strata", messages: [{ role: "user", content: `[${randomUUID()}]\n${PROMPT}` }], max_tokens: maxTokens,
    stream: true, stream_options: { include_usage: true }, chat_template_kwargs: { enable_thinking: true } };
  const res = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body) });
  if (!res.ok || !res.body) return { ttft_s: null, decode_tps: null, completion_tokens: 0, prompt_tokens: 0, wall_s: 0,
    t_first: 0, t_last: 0, error: `${res.status} ${await res.text()}` };
  let first = 0, last = 0, usage: any = null, buf = "";
  const dec = new TextDecoder();
  for await (const chunk of res.body as any) {
    const now = performance.now();
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      let d: any; try { d = JSON.parse(line.slice(6)); } catch { continue; }
      if (d.usage) usage = d.usage;
      const delta = d.choices?.[0]?.delta ?? {};
      if ([delta.content, delta.reasoning_content, delta.reasoning].some((s) => typeof s === "string" && s !== "")) {
        if (!first) first = now;
        last = now;
      }
    }
  }
  const end = performance.now(), n = usage?.completion_tokens ?? 0;
  return { ttft_s: first ? +((first - t0) / 1000).toFixed(3) : null,
    decode_tps: last > first && first ? +((n - 1) / ((last - first) / 1000)).toFixed(1) : null,
    completion_tokens: n, prompt_tokens: usage?.prompt_tokens ?? 0, wall_s: +((end - t0) / 1000).toFixed(2), t_first: first, t_last: last };
}

async function main() {
  const [label, nArg, roundsArg] = process.argv.slice(2);
  const n = +nArg, rounds = +(roundsArg ?? 3);
  if (!label || !(n >= 1)) throw new Error("usage: node raw-streams.ts LABEL STREAMS [ROUNDS]");
  mkdirSync(join(HERE, "results"), { recursive: true });
  await one(16, performance.now());  // warm-up
  for (let r = 1; r <= rounds; r++) {
    const slots: any[] = [];
    let polling = true;
    const poll = (async () => {
      while (polling) {
        try {
          const m: any = await (await fetch(`${BASE.replace(/\/v1$/, "")}/metrics`, { headers: { ...auth, Accept: "application/json" } })).json();
          const l = m.live ?? {};
          slots.push({ running: l.running, queued: l.queued, slots: l.slots });
        } catch { /* not JSON on this build */ }
        await new Promise((ok) => setTimeout(ok, 500));
      }
    })();
    const t0 = performance.now();
    const streams = await Promise.all(Array.from({ length: n }, () => one(512, t0)));
    polling = false; await poll;
    const tokens = streams.reduce((a, s) => a + s.completion_tokens, 0);
    const lastAll = Math.max(...streams.map((s) => s.t_last));
    const row = { label, streams: n, round: r, time: new Date().toISOString(),
      aggregate_tps: +(tokens / ((lastAll - t0) / 1000)).toFixed(1),
      sum_decode_tps: +streams.reduce((a, s) => a + (s.decode_tps ?? 0), 0).toFixed(1),
      max_running: Math.max(0, ...slots.map((s) => s.running ?? 0)), max_queued: Math.max(0, ...slots.map((s) => s.queued ?? 0)),
      slot_states: [...new Set(slots.flatMap((s) => (s.slots ?? []).map((x: any) => x.state ?? x.status)).filter(Boolean))],
      per_stream: streams.map(({ t_first, t_last, ...s }) => s) };
    appendFileSync(join(HERE, "results", "raw-streams.jsonl"), JSON.stringify(row) + "\n");
    console.log(`${label} n=${n} round ${r}: aggregate ${row.aggregate_tps} tok/s, sum of streams ${row.sum_decode_tps}; ` +
      streams.map((s) => `[ttft ${s.ttft_s}s decode ${s.decode_tps} ${s.completion_tokens}tok${s.error ? " ERR " + s.error : ""}]`).join(" "));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
