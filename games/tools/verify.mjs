// One bounded verification sweep for all five games — the command a reviewer (or the board)
// runs once, in about three minutes, to check the claims in games/results.md.
//
//   node tools/verify.mjs            # quick: every game loads clean, reacts to input, has FPS
//   node tools/verify.mjs --full     # + audio measured, + the game rules driven through
//                                    #   window.arcade, + the published site's relative paths
//
// Every check has a hard timeout and the browser is always closed, so this cannot hang and
// cannot pile up Chromium processes next to Strata. Exit code: 0 all green, 1 something failed.
// Results land in tools/work/verify/latest.json and latest.md (committed, so the evidence
// travels with the branch).
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gamesDir = resolve(here, "..");
const outDir = join(here, "work", "verify");
const FULL = process.argv.includes("--full");
const CAP = process.env.SMOKE_MEM_HIGH ?? "220M";
const MAX = +(process.env.VERIFY_MAX_MS ?? 150000);

// each: [game, key sequence, a string the HUD must show after the input]
const GAMES = [
  ["1-breakout", "Space:150,ArrowLeft:600,ArrowRight:900,wait:900", "SCORE"],
  ["2-runner", "ArrowLeft:400,Space:200,ArrowRight:600,wait:1100", "STATE RUNNING"],
  ["3-marble-maze", "ArrowDown:900,ArrowLeft:900,wait:800", "STATE ROLLING"],
  ["4-tower-defense", "KeyN:100,wait:5200", "MONEY"],
  ["5-flight", "ArrowDown:800,ArrowUp:1200,wait:900", "STATE FLY"],
];

function run(label, script, args, timeout = MAX) {
  return new Promise((done) => {
    const child = execFile(
      process.execPath,
      [script, ...args],
      { cwd: gamesDir, detached: true, maxBuffer: 8 << 20,
        env: { ...process.env, SMOKE_MEM_HIGH: CAP, SMOKE_MAX_MS: String(timeout - 5000) } },
      (err, stdout, stderr) => {
        let data = null;
        // tools print JSON then a human line ("AUDIO OK: ..."), so parse the JSON prefix
        const txt = String(stdout || "");
        const cut = txt.lastIndexOf("}");
        for (const cand of [txt, cut > 0 ? txt.slice(0, cut + 1) : ""]) {
          try { data = JSON.parse(cand); break; } catch { /* keep looking */ }
        }
        done({
          label,
          code: err && !err.killed ? (err.code ?? 1) : 0,
          killed: err?.killed === true,
          data,
          stdout,
          notes: String(stderr || "").split("\n").filter((l) => /error|fail/i.test(l)).slice(0, 2),
        });
      },
    );
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
    }, timeout);
    child.on("exit", () => clearTimeout(timer));
  });
}

const rows = [];
function report(label, ok, detail) {
  rows.push({ label, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(26)} ${detail}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const [game, keys, want] of GAMES) {
    const r = await run(game, "tools/smoke.ts",
      [game, "--wait", "4", "--out", `screenshots/${game}`, "--keys", keys]);
    const d = r.data;
    if (!d) { report(game, false, `no JSON from smoke (code ${r.code})`); continue; }
    const changed = d.text_before !== d.text_after;
    const shown = (d.text_after || "").includes(want);
    const clean = (d.errors?.length ?? 1) === 0;
    report(game, clean && changed && shown,
      `errors=${d.errors?.length} fps=${d.fps_idle}/${d.fps_play} hud_moves=${changed} shows"${want}"`);
  }

  if (!FULL) return finish();

  for (const [game, keys] of GAMES) {
    const r = await run(`audio ${game}`, "tools/audiotest.ts", [game, "--keys", keys.split(",")[0] + ":250", "--secs", "2"]);
    const d = r.data;
    if (!d) { report(`audio ${game}`, false, `no JSON (code ${r.code})`); continue; }
    const ok = (d.pre_peak ?? 1) === 0 && (d.loud_peak ?? 0) > 0.02 && (d.tail_end ?? 1) < 0.05;
    report(`audio ${game}`, ok,
      `silent_before=${(d.pre_peak ?? 1) === 0} peak=${d.loud_peak?.toFixed?.(3)} tail_end=${d.tail_end?.toExponential?.(1)}`);
  }

  // the rules, driven through each game's own exposed verbs (one browser, five proofs)
  const rules = await run("rule proofs", "tools/work/rules.mjs", [], 330000);
  const rm = (rules.stdout.match(/(\d+)\/(\d+) rule proofs passed/) ?? []).slice(1).map(Number);
  await writeFile(join(outDir, "rules.txt"), rules.stdout).catch(() => {});
  report("rule proofs", rm.length === 2 && rm[0] === rm[1] && rm[1] >= 5,
    rm.length === 2 ? `${rm[0]}/${rm[1]} proofs (marble goal+hole, tower wave, flight ring+crash)` : "no summary line");

  const live = await run("published paths", "tools/work/linkcheck.mjs", [], 90000);
  const m = live.stdout.match(/(\d+) local refs.*?(\d+) problems/);
  report("published paths", !!m && +m[2] === 0, m ? `${m[1]} refs, ${m[2]} problems` : "linkcheck printed nothing");

  return finish();
}

function finish() {
  const failed = rows.filter((r) => !r.ok);
  const md = [
    `# verification (${FULL ? "full" : "quick"} sweep)`,
    "",
    `\`node tools/verify.mjs${FULL ? " --full" : ""}\` — ${rows.length} checks, ${failed.length} failed.`,
    "",
    "| check | result |",
    "|---|---|",
    ...rows.map((r) => `| ${r.label} | ${r.ok ? "ok" : "**FAIL**"} — ${r.detail.replace(/\|/g, "/")} |`),
    "",
    "FPS is measured under SwiftShader (software rendering: the model server holds the GPU), so",
    "it is a floor, not the frame rate a real GPU gets. Audio numbers are peak amplitude from an",
    "AnalyserNode: silent before the first keypress (autoplay policy), audible while playing,",
    "and the tail must decay to silence, which is what catches feedback loops.",
    "",
  ].join("\n");
  return writeFile(join(outDir, "latest.md"), md)
    .then(() => writeFile(join(outDir, "latest.json"), JSON.stringify({ mode: FULL ? "full" : "quick", rows }, null, 2)))
    .then(() => {
      console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);
      process.exit(failed.length ? 1 : 0);
    });
}

main().catch((e) => { console.error(e); process.exit(1); });
