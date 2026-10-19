// Run one fresh headless pi session on Strata inside a game folder and record its stats.
//   node run-pi.ts <game-dir> [prompt-file]      (default prompt file: <game-dir>/PROMPT.md)
// Needs STRATA_BASE_URL (with /v1) and STRATA_API_KEY. A throwaway PI_CODING_AGENT_DIR holds only the Strata
// provider, so no user extensions, skills or settings leak in. Raw events go to tools/work/<game>/run-<k>.jsonl
// (not committed: they hold absolute paths); stats are appended to <game-dir>/runs.json.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_ID = "qwen3.8-flash-next-iq2_xs";
const TIMEOUT_MIN = Number(process.env.PI_TIMEOUT_MIN ?? 120);
const MEM_FLOOR_GIB = 8;

const gameDir = resolve(process.argv[2] ?? "");
const promptFile = resolve(process.argv[3] ?? join(gameDir, "PROMPT.md"));
const { STRATA_BASE_URL: baseUrl, STRATA_API_KEY: apiKey } = process.env;
if (!process.argv[2] || !baseUrl || !apiKey) {
  console.error("usage: STRATA_BASE_URL=… STRATA_API_KEY=… node run-pi.ts <game-dir> [prompt-file]");
  process.exit(2);
}
// PROMPT.md may carry a heading and notes above a line of "---"; only what follows it is sent.
const raw = readFileSync(promptFile, "utf8");
const prompt = (raw.includes("\n---\n") ? raw.slice(raw.indexOf("\n---\n") + 5) : raw).trim();

const here = dirname(fileURLToPath(import.meta.url));
const workDir = join(here, "work", basename(gameDir));
mkdirSync(workDir, { recursive: true });
const runsFile = join(gameDir, "runs.json");
const runs: any[] = existsSync(runsFile) ? JSON.parse(readFileSync(runsFile, "utf8")) : [];
const k = runs.length + 1;
const logPath = join(workDir, `run-${k}.jsonl`);

const agentDir = mkdtempSync(join(tmpdir(), "pi-strata-"));
writeFileSync(join(agentDir, "models.json"), JSON.stringify({
  providers: {
    strata: {
      api: "openai-completions", baseUrl, apiKey,
      models: [{
        id: MODEL_ID, name: "Strata Qwen3.8-Flash-Next IQ2_XS", reasoning: true, supportsTools: true,
        input: ["text"], contextWindow: 131072, maxTokens: 32768, tokenizer: "qwen3",
        thinking: { defaultLevel: "medium", efforts: ["low", "medium", "xhigh"], mode: "effort", requiresEffort: false },
        compat: {
          reasoningContentField: "reasoning_content", supportsDeveloperRole: false, supportsReasoningEffort: true,
          supportsStore: false, thinkingFormat: "qwen-chat-template",
        },
      }],
    },
  },
}));
writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "strata", defaultModel: MODEL_ID }));

const memGiB = () => Number(/MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))![1]) / 1048576;
let memMin = memGiB();

const t0 = Date.now();
const log = createWriteStream(logPath);
const child = spawn("pi", [
  "-p", "--no-session", "--mode", "json", "--model", `strata/${MODEL_ID}:medium`,
  "--no-extensions", "--no-skills", "--no-context-files", "--no-mcp", "--offline", prompt,
], { cwd: gameDir, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", "pipe", "pipe"] });

// Stats come from the event stream; every line is stamped with its arrival time for decode speed.
const s = {
  turns: 0, tool_calls: 0, tool_errors: 0, output_tokens: 0, input_tokens: 0, cache_read_tokens: 0,
  decode_ms: 0, tools: {} as Record<string, number>, stop: "", final_text: "", errors: [] as string[],
};
let firstDelta = 0;
let buf = "";
child.stdout.on("data", (d: Buffer) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const now = Date.now();
    log.write(JSON.stringify({ t: now - t0 }) + "\t" + line + "\n");
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "turn_start") s.turns++;
    if (e.type === "message_update" && !firstDelta) firstDelta = now;
    if (e.type === "message_end" && e.message?.role === "assistant") {
      const u = e.message.usage ?? {};
      s.output_tokens += u.output ?? 0;
      s.input_tokens += u.input ?? 0;
      s.cache_read_tokens += u.cacheRead ?? 0;
      if (firstDelta) s.decode_ms += now - firstDelta;
      firstDelta = 0;
      s.stop = e.message.stopReason ?? "";
      if (e.message.errorMessage) s.errors.push(String(e.message.errorMessage).slice(0, 300));
      const text = (e.message.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      if (text.trim()) s.final_text = text.trim();
    }
    if (e.type === "tool_execution_end") {
      s.tool_calls++;
      s.tools[e.toolName] = (s.tools[e.toolName] ?? 0) + 1;
      if (e.isError) s.tool_errors++;
    }
  }
});
let stderr = "";
child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

const memTimer = setInterval(() => {
  const m = memGiB();
  memMin = Math.min(memMin, m);
  if (m < MEM_FLOOR_GIB) {
    s.errors.push(`aborted: MemAvailable ${m.toFixed(2)} GiB below floor`);
    child.kill("SIGTERM");
  }
}, 5000);
// pi's bash tool has no timeout of its own: any process the agent started that is still running after
// TOOL_TIMEOUT_MIN is killed, as a tool timeout would (game 3 ran an endless simulation loop for 21 min).
const TOOL_TIMEOUT_MIN = Number(process.env.PI_TOOL_TIMEOUT_MIN ?? 10);
const descendants = (pid: number): number[] => {
  const kids = execFileSync("ps", ["-o", "pid=", "--ppid", String(pid)], { encoding: "utf8" }).split("\n")
    .map((x) => Number(x.trim())).filter(Boolean);
  return kids.flatMap((k) => [k, ...descendants(k)]);
};
const toolTimer = setInterval(() => {
  try {
    for (const pid of descendants(child.pid!)) {
      const [etimes, ...cmd] = execFileSync("ps", ["-o", "etimes=,args=", "-p", String(pid)], { encoding: "utf8" })
        .trim().split(/\s+/);
      if (Number(etimes) > TOOL_TIMEOUT_MIN * 60 && !/^(bash|sh)$/.test(cmd[0]?.split("/").pop() ?? "")) {
        process.kill(pid, "SIGKILL");
        s.errors.push(`killed hung tool process after ${TOOL_TIMEOUT_MIN} min: ${cmd.join(" ").slice(0, 80)}`);
      }
    }
  } catch { /* process gone between ps calls */ }
}, 30000);
const killTimer = setTimeout(() => { s.errors.push(`aborted: timeout ${TIMEOUT_MIN} min`); child.kill("SIGTERM"); },
  TIMEOUT_MIN * 60000);
const progress = setInterval(() => {
  console.error(`[${basename(gameDir)} run ${k}] ${((Date.now() - t0) / 60000).toFixed(1)} min, ` +
    `${s.turns} turns, ${s.tool_calls} tools (${s.tool_errors} err), ${s.output_tokens} out tok, mem ${memGiB().toFixed(1)} GiB`);
}, 60000);

const code: number = await new Promise((r) => child.on("close", r));
clearInterval(memTimer); clearInterval(progress); clearInterval(toolTimer); clearTimeout(killTimer);
log.end();
rmSync(agentDir, { recursive: true, force: true });

const wall = (Date.now() - t0) / 1000;
const run = {
  run: k, prompt_file: basename(promptFile), started: new Date(t0).toISOString(), exit_code: code,
  wall_s: Math.round(wall), turns: s.turns, tool_calls: s.tool_calls, tool_errors: s.tool_errors, tools: s.tools,
  output_tokens: s.output_tokens, input_tokens: s.input_tokens, cache_read_tokens: s.cache_read_tokens,
  decode_tok_s: s.decode_ms ? Math.round((s.output_tokens / (s.decode_ms / 1000)) * 10) / 10 : null,
  stop: s.stop, errors: s.errors, stderr: stderr.trim().slice(-500),
  mem_min_gib: Math.round(memMin * 100) / 100, final_text: s.final_text.slice(0, 2000),
};
// runs.json is committed to a public repo: no absolute paths, hostnames or keys.
const scrub = (t: string) => t.split(gameDir).join(".").split(dirname(gameDir)).join("..")
  .split(process.env.HOME ?? "/nonexistent").join("~").split(apiKey).join("<key>")
  .split(new URL(baseUrl).host).join("<strata-host>").replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>");
runs.push(JSON.parse(scrub(JSON.stringify(run))));
writeFileSync(runsFile, JSON.stringify(runs, null, 2) + "\n");
console.log(JSON.stringify({ ...run, final_text: run.final_text.slice(0, 400) }, null, 2));
