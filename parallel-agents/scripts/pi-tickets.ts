// Headless pi agents on agentic-glimmer tickets, one after another (seq) or all at once (par), each sandboxed as in
// homelab/evals/strata-2026-10-19-full-experts (pi-eval.ts there, trimmed to its tickets part):
//   - pi runs `pi -p --no-session --mode json --offline --model strata/<id>:medium` in a throwaway node container:
//     read-only root, no capabilities, no-new-privileges, no host home; its PI_CODING_AGENT_DIR is a temp dir that
//     holds only a models.json (the daily Strata entry's compat/thinking fields). ~/.pi/agent is never read or written.
//   - its only network is the namespace of strata-sbx-proxy (sandbox.sh): 127.0.0.1:18097 relays to Strata.
//   - the ticket's hidden tests then run in a second container with --network none.
// Speed per assistant turn comes from pi's JSON events, stamped as they arrive: TTFT = turn_start to the first delta,
// decode = (usage.output - 1) / (first to last delta).
//
// usage: node pi-tickets.ts seq|par LABEL MODEL_ID TICKET...
// Needs HOMELAB_DIR (for evals/agentic-glimmer-2026-10-14/tasks) and STRATA_API_KEY. Appends one row per ticket and
// one per batch to results/tickets.jsonl; writes sessions/<LABEL>/<ticket>.jsonl (pi's events without the per-token
// deltas) and results/diffs/<LABEL>__<ticket>.diff.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOMELAB = process.env.HOMELAB_DIR, KEY = process.env.STRATA_API_KEY;
if (!HOMELAB || !KEY) throw new Error("set HOMELAB_DIR and STRATA_API_KEY");
const TASKS = join(HOMELAB, "evals", "agentic-glimmer-2026-10-14", "tasks");
const IMAGE = "node:25-bookworm@sha256:78839ac448c23517f8eab2e8f7943d9b4f73979eb7f8bed2c73dbf72ff869e7b";
const PROXY = "strata-sbx-proxy";
// pi's install, found from the `pi` on PATH: <root>/node_modules/.bin/pi is a shim naming the bundle it runs
// (target=../.mise/.../pi-coding-agent/dist/bundle/cli.js); the container mounts <root> read-only at the same path
const [PI_ROOT, PI_CLI] = (() => {
  const bin = realpathSync(spawnSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).stdout.trim());
  const target = readFileSync(bin, "utf8").match(/target=(\S+)/)?.[1];
  if (!target) throw new Error(`cannot find pi's bundle from ${bin}`);
  return [bin.slice(0, bin.indexOf("/node_modules/")), resolve(dirname(bin), target)];
})();
const UID = `${process.getuid!()}:${process.getgid!()}`;
const TICKET_TIMEOUT_S = 1800;
// agentic-glimmer-2026-10-14/run.py
const PREAMBLE = "You are working autonomously in this repository; nobody will answer questions. " +
  "Read the code, make the change, run the tests, and stop when the work is done.\n\n";

function modelsJson(id: string): string {
  return JSON.stringify({ providers: { strata: { api: "openai-completions", apiKey: KEY, baseUrl: "http://127.0.0.1:18097/v1",
    models: [{ id, name: id, contextWindow: 196608, maxTokens: 32768, input: ["text"], reasoning: true, supportsTools: true,
      tokenizer: "qwen3",
      compat: { reasoningContentField: "reasoning_content", supportsDeveloperRole: false, supportsReasoningEffort: true,
        supportsStore: false, thinkingFormat: "qwen-chat-template" },
      thinking: { defaultLevel: "medium", efforts: ["low", "medium", "xhigh"], mode: "effort", requiresEffort: false } }] } } }, null, 1);
}

type Turn = { t_start_s: number; ttft_s: number | null; gen_s: number | null; input: number; output: number;
  cacheRead: number; decode_tps: number | null; stop: string };
type PiRun = { wall_s: number; rc: number | null; timed_out: boolean; turns: Turn[]; tool_calls: number;
  tool_errors: number; output_tokens: number; input_tokens: number; error?: string };

const SANDBOX = ["--user", UID, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--pids-limit", "512", "--memory", "4g", "--tmpfs", "/tmp:rw,exec,size=1g", "--tmpfs", "/home/agent:rw,size=256m",
  "-e", "HOME=/home/agent", "-e", "PYTHONDONTWRITEBYTECODE=1"];

function runPi(model: string, prompt: string, work: string, log: string, tag: string): Promise<PiRun> {
  const agent = mkdtempSync(join(tmpdir(), "strata-pi-agent-"));
  writeFileSync(join(agent, "models.json"), modelsJson(model), { mode: 0o600 });
  const name = `strata-pi-${tag}-${process.pid}-${Date.now()}`;
  const args = ["run", "--rm", "--name", name, "--network", `container:${PROXY}`, ...SANDBOX,
    "-e", "PI_CODING_AGENT_DIR=/home/agent/pi", "-e", "PI_OFFLINE=1",
    "-v", `${PI_ROOT}:${PI_ROOT}:ro`, "-v", `${agent}:/home/agent/pi:rw`, "-v", `${work}:/work:rw`, "-w", "/work",
    IMAGE, "node", PI_CLI, "-p", "--no-session", "--mode", "json", "--offline", "--model", `strata/${model}:medium`, prompt];
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(log, "");
  return new Promise((done) => {
    const t0 = performance.now();
    const p = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false, buf = Buffer.alloc(0), stderr = "";
    const timer = setTimeout(() => { timedOut = true; spawnSync("docker", ["kill", name]); }, TICKET_TIMEOUT_S * 1000);
    const st: PiRun = { wall_s: 0, rc: null, timed_out: false, turns: [], tool_calls: 0, tool_errors: 0, output_tokens: 0, input_tokens: 0 };
    let start = 0, first = 0, last = 0;
    const onRecord = (line: string, t: number) => {
      let e: any;
      try { e = JSON.parse(line); } catch { return; }
      const m = e.message;
      if (e.type === "turn_start") { start = t; first = last = 0; }
      if (e.type === "message_start" && m?.role === "assistant" && !start) start = t;
      if (e.type === "message_update") {
        const k = e.assistantMessageEvent?.type ?? "";
        if (k.endsWith("_delta")) { if (!first) first = t; last = t; }
        return;  // deltas are not logged
      }
      // pi's system prompt names its install path: logged as <pi>, the home directory as <home> (public repo)
      appendFileSync(log, JSON.stringify({ t_s: +((t - t0) / 1000).toFixed(3), ...e }).split(PI_ROOT).join("<pi>")
        .split(homedir()).join("<home>") + "\n");
      if (e.type === "message_end" && m?.role === "assistant") {
        const u = m.usage ?? {};
        const ttft = first ? (first - start) / 1000 : null, gen = first && last > first ? (last - first) / 1000 : null;
        st.turns.push({ t_start_s: +((start - t0) / 1000).toFixed(3), ttft_s: ttft && +ttft.toFixed(3), gen_s: gen && +gen.toFixed(3),
          input: u.input ?? 0, output: u.output ?? 0, cacheRead: u.cacheRead ?? 0,
          decode_tps: gen && u.output > 1 ? +((u.output - 1) / gen).toFixed(1) : null, stop: m.stopReason });
        st.output_tokens += u.output ?? 0; st.input_tokens += u.input ?? 0;
        for (const c of m.content ?? []) if (c.type === "toolCall") st.tool_calls++;
        if (m.stopReason === "error") st.error = m.errorMessage;
      }
      if (e.type === "tool_execution_end" && e.isError) st.tool_errors++;
    };
    p.stdout.on("data", (d: Buffer) => {  // split on LF only
      const t = performance.now();
      buf = Buffer.concat([buf, d]);
      let i;
      while ((i = buf.indexOf(10)) >= 0) { onRecord(buf.subarray(0, i).toString("utf8").replace(/\r$/, ""), t); buf = buf.subarray(i + 1); }
    });
    p.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    p.on("close", (rc) => {
      clearTimeout(timer);
      rmSync(agent, { recursive: true, force: true });
      st.wall_s = +((performance.now() - t0) / 1000).toFixed(1);
      st.rc = timedOut ? null : rc; st.timed_out = timedOut;
      if (rc && !st.error) st.error = stderr.slice(-500);
      done(st);
    });
  });
}

function grade(work: string): { passed: boolean; tail: string } {
  const name = `strata-grade-${process.pid}-${Date.now()}`;
  const g = spawnSync("docker", ["run", "--rm", "--name", name, "--network", "none", ...SANDBOX, "-v", `${work}:/work:rw`, "-w", "/work",
    IMAGE, "python3", "-m", "unittest", "hidden_test"], { encoding: "utf8", timeout: 180_000, maxBuffer: 1 << 26 });
  if (g.error) spawnSync("docker", ["kill", name]);
  return { passed: !g.error && g.status === 0, tail: ((g.stdout ?? "") + (g.stderr ?? "")).slice(-800) };
}

function summary(turns: Turn[]) {  // over all turns of one run: output tokens / generation time, median TTFT
  const gen = turns.reduce((a, t) => a + (t.gen_s ?? 0), 0), out = turns.reduce((a, t) => a + (t.gen_s ? t.output - 1 : 0), 0);
  const ttft = turns.map((t) => t.ttft_s).filter((x): x is number => x != null).sort((a, b) => a - b);
  return { decode_tps: gen ? +(out / gen).toFixed(1) : null, ttft_med_s: ttft.length ? ttft[ttft.length >> 1] : null,
    ttft_max_s: ttft.length ? ttft[ttft.length - 1] : null, gen_s: +gen.toFixed(1) };
}

async function ticket(task: string, model: string, label: string, t0: number) {
  const tdir = join(TASKS, task), work = mkdtempSync(join(tmpdir(), `strata-ticket-${task}-`));
  cpSync(join(tdir, "repo"), work, { recursive: true });
  spawnSync("sh", ["-c", "git init -q && git add -A && git -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -qm init"], { cwd: work });
  const started_s = +((performance.now() - t0) / 1000).toFixed(1);
  const r = await runPi(model, PREAMBLE + readFileSync(join(tdir, "issue.md"), "utf8"), work, join(HERE, "sessions", label, `${task}.jsonl`), task);
  const diff = spawnSync("sh", ["-c", "git add -A && git -c core.fileMode=false diff --cached --stat | tail -1 && git diff --cached"],
    { cwd: work, encoding: "utf8", maxBuffer: 1 << 26 }).stdout;
  mkdirSync(join(HERE, "results", "diffs"), { recursive: true });
  writeFileSync(join(HERE, "results", "diffs", `${label}__${task}.diff`), diff);
  cpSync(join(tdir, "hidden_test.py"), join(work, "hidden_test.py"));
  const g = grade(work);
  rmSync(work, { recursive: true, force: true });
  const { turns, ...rest } = r;
  return { item: task, passed: g.passed, started_s, diffstat: diff.split("\n")[0] ?? "", hidden_tail: g.passed ? undefined : g.tail,
    ...rest, ...summary(turns), turns: turns.length, turn_stats: turns };
}

async function main() {
  const [mode, label, model, ...tickets] = process.argv.slice(2);
  if (!["seq", "par"].includes(mode) || !model || !tickets.length) throw new Error("usage: node pi-tickets.ts seq|par LABEL MODEL_ID TICKET...");
  const out = join(HERE, "results", "tickets.jsonl");
  mkdirSync(dirname(out), { recursive: true });
  const t0 = performance.now();
  const one = async (task: string) => {
    const r = await ticket(task, model, label, t0);
    appendFileSync(out, JSON.stringify({ label, mode, time: new Date().toISOString(), ...r }) + "\n");
    console.log(`${label} ${task} ${r.passed ? "PASS" : "FAIL"} ${r.wall_s}s turns=${r.turns} out=${r.output_tokens} decode=${r.decode_tps} ` +
      `ttft_med=${r.ttft_med_s} ttft_max=${r.ttft_max_s} tools=${r.tool_calls}/${r.tool_errors}err${r.timed_out ? " TIMEOUT" : ""}${r.error ? " ERR " + String(r.error).slice(0, 160) : ""}`);
    return r;
  };
  const rows = mode === "par" ? await Promise.all(tickets.map(one)) : await (async () => { const a = []; for (const t of tickets) a.push(await one(t)); return a; })();
  const wall = +((performance.now() - t0) / 1000).toFixed(1), tokens = rows.reduce((a, r) => a + r.output_tokens, 0);
  const batch = { label, mode, batch: true, time: new Date().toISOString(), tickets, passed: rows.filter((r) => r.passed).length,
    wall_s: wall, output_tokens: tokens, tokens_per_wall_s: +(tokens / wall).toFixed(1) };
  appendFileSync(out, JSON.stringify(batch) + "\n");
  console.log(`${label} ${mode}: ${batch.passed}/${tickets.length} passed, ${wall}s wall, ${tokens} output tokens, ${batch.tokens_per_wall_s} tok/s over the wall`);
}

main().catch((e) => { console.error(e); process.exit(1); });
