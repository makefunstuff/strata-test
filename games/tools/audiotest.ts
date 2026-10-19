// Measure a game's arcade sound in headless Chromium — no ears required.
//   node audiotest.ts <game-dir|url> [--keys "Space:120"] [--secs 2] [--json out.json]
// The game must expose its audio object as window.arcadeAudio (createAudio from shared/audio.js).
// It presses a key (the autoplay gesture), fires the loudest sound plus the music, samples the
// output level from an AnalyserNode, then stops and samples the tail. A feedback loop that cannot
// decay shows up as a level that climbs and never falls; silence is required after the tail.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, basename, dirname } from "node:path";

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const target = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
if (!target) {
  console.error("usage: node audiotest.ts <game-dir|url> [--keys k:ms,...] [--secs 2] [--json out.json]");
  process.exit(2);
}
const secs = Number(opt("secs", "2"));
const keys = (opt("keys", "Space:120") as string).split(",").filter(Boolean).map((p) => {
  const [k, ms] = p.split(":");
  return { key: k, ms: Number(ms ?? 100) };
});

const types: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "text/svg+xml",
};
let url = target;
let server: ReturnType<typeof createServer> | undefined;
if (!/^https?:/.test(target)) {
  const game = resolve(target);
  const root = resolve(dirname(game));
  server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      const file = join(root, p);
      if (!file.startsWith(root)) throw new Error("outside");
      const st = await stat(file);
      if (st.isDirectory()) { res.writeHead(404).end("dir"); return; }
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  url = `http://127.0.0.1:${addr.port}/${basename(game)}/index.html`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("./chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
         "--js-flags=--max-old-space-size=256"],
});
// Watchdog, as in smoke.ts: a stalled headless Chromium must not outlive the run that started it.
const MAX_MS = +(process.env.SMOKE_MAX_MS ?? 120000);
async function stop(code: number, why: string): Promise<never> {
  console.error(`audiotest: ${why}`);
  await browser.close().catch(() => {});
  server?.close();
  process.exit(code);
}
const deadline = setTimeout(() => void stop(3, `timed out after ${MAX_MS}ms (SMOKE_MAX_MS)`), MAX_MS);
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void stop(4, `caught ${sig}`));
const errors: string[] = [];
let result: any = null;
let pre: any = null;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on("console", (m) => {
    if (/favicon\.ico$/.test(m.location().url)) return;
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2500);

  // before any key press the game must be completely silent (autoplay policy)
  pre = await page.evaluate(async () => {
    const w = window as any;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const audio = w.arcadeAudio;
    if (!audio) return { error: "window.arcadeAudio is not exposed by this game" };
    const m = audio.meter();
    const vals: number[] = [];
    for (let i = 0; i < 8; i++) { vals.push(m.peak()); await sleep(100); }
    m.stop();
    return { vals, gestured: audio.gestured, state: audio.context ? audio.context.state : "none" };
  });

  for (const { key, ms } of keys) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(ms);
  }

  result = await page.evaluate(async ({ secs }) => {
    const w = window as any;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const audio = w.arcadeAudio;
    if (!audio) return { error: "window.arcadeAudio is not exposed by this game" };
    audio.setMuted(false);
    audio.ensure();
    const m = audio.meter();
    if (!m) return { error: "no meter (WebAudio unavailable)" };
    const sample = async (n: number) => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) { out.push(m.peak()); await sleep(100); }
      return out;
    };
    audio.sfx.explode();
    audio.sfx.coin();
    audio.sfx.win();
    audio.startMusic({ bpm: 150 });
    const loud = await sample(Math.round(secs * 10));
    audio.stopMusic();
    const tail = await sample(14);
    m.stop();
    return {
      loud, tail,
      state: audio.context ? audio.context.state : "none",
      gestured: audio.gestured,
    };
  }, { secs });
} finally {
  clearTimeout(deadline);
  await browser.close().catch(() => {});
  server?.close();
}

const fail: string[] = [];
if (result?.error || pre?.error) fail.push(String(result?.error ?? pre?.error));
if (errors.length) fail.push(...errors);
if (!result?.error && !pre?.error) {
  const peak = (a: number[]) => Math.max(...a);
  const idle = peak(pre.vals);
  const loud = peak(result.loud);
  const end = result.tail[result.tail.length - 1];
  const tailMax = peak(result.tail);
  if (idle > 0.01) fail.push(`sound is audible before the first keypress (peak ${idle.toFixed(3)})`);
  if (loud < 0.03) fail.push(`nothing audible: peak ${loud.toFixed(3)}`);
  if (loud > 0.98) fail.push(`clipping: peak ${loud.toFixed(3)}`);
  if (tailMax > 0.25) fail.push(`sound does not decay after stop (tail peak ${tailMax.toFixed(3)}) — feedback loop`);
  if (end > 0.05) fail.push(`tail still at ${end.toFixed(3)} after 1.4 s`);
  // Growth during play is normal (the game keeps making sounds); the signature of a feedback
  // loop is a tail that never falls, which is what the checks above measure.
  const q = Math.floor(result.loud.length / 4);
  const first = peak(result.loud.slice(0, q));
  const last = peak(result.loud.slice(-q));
  Object.assign(result, { level_first: first, level_last: last });
  Object.assign(result, { pre_peak: idle, pre_gestured: pre.gestured, loud_peak: loud, tail_peak: tailMax, tail_end: end });
}

if (opt("json")) await writeFile(opt("json")!, JSON.stringify(result, null, 2));
const brief = {
  pre_peak: result?.pre_peak,
  pre_gestured: result?.pre_gestured,
  state: result?.state, gestured: result?.gestured,
  loud_peak: result?.loud_peak, level_first: result?.level_first, level_last: result?.level_last,
  tail_peak: result?.tail_peak, tail_end: result?.tail_end,
  loud: result?.loud?.map((v: number) => Number(v.toFixed(3))),
  tail: result?.tail?.map((v: number) => Number(v.toFixed(3))),
  errors,
};
console.log(JSON.stringify(brief, null, 2));
if (fail.length) {
  console.error("AUDIO FAIL:\n  " + fail.join("\n  "));
  process.exit(1);
}
console.log("AUDIO OK: audible, no clipping, decays to silence");
