// Recompute a run's stats from its saved event log (tools/work/<game>/run-<k>.jsonl, written by run-pi.ts),
// for a run whose runner was killed before it could write runs.json.
//   node stats.ts <run-log.jsonl>
// Same rules as run-pi.ts: turns = turn_start events, decode time = first message_update to message_end per
// assistant message, wall time = arrival time of the last event.
import { readFileSync } from "node:fs";

const s = {
  wall_s: 0, turns: 0, tool_calls: 0, tool_errors: 0, tools: {} as Record<string, number>,
  output_tokens: 0, input_tokens: 0, cache_read_tokens: 0, decode_tok_s: 0, stop: "",
};
let decodeMs = 0;
let firstDelta = -1;
for (const line of readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!line.trim()) continue;
  const [stamp, json] = line.split("\t");
  const t: number = JSON.parse(stamp).t;
  const e = JSON.parse(json);
  s.wall_s = Math.round(t / 1000);
  if (e.type === "turn_start") s.turns++;
  if (e.type === "message_update" && firstDelta < 0) firstDelta = t;
  if (e.type === "message_end" && e.message?.role === "assistant") {
    const u = e.message.usage ?? {};
    s.output_tokens += u.output ?? 0;
    s.input_tokens += u.input ?? 0;
    s.cache_read_tokens += u.cacheRead ?? 0;
    if (firstDelta >= 0) decodeMs += t - firstDelta;
    firstDelta = -1;
    s.stop = e.message.stopReason ?? "";
  }
  if (e.type === "tool_execution_end") {
    s.tool_calls++;
    s.tools[e.toolName] = (s.tools[e.toolName] ?? 0) + 1;
    if (e.isError) s.tool_errors++;
  }
}
s.decode_tok_s = decodeMs ? Math.round((s.output_tokens / (decodeMs / 1000)) * 10) / 10 : 0;
console.log(JSON.stringify(s));
