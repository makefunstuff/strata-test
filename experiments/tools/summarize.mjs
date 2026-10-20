#!/usr/bin/env node
/*
 * summarize.mjs — one line per check: printout of experiments/tools/check.mjs's JSON.
 *
 *   node experiments/tools/summarize.mjs water 1-water /tmp/tst6-water.json
 *
 * Flags: FPS idle/play (software renderer: a floor), total console/page/network errors, whether any
 * scripted interaction errored, and the page's own state after the interaction — the evidence that the
 * mechanic moved, not just that the page loaded.
 */
import { readFileSync } from "node:fs";

const [label, dir, file] = process.argv.slice(2);
const txt = readFileSync(file, "utf8");
let j;
try {
  j = JSON.parse(txt.slice(txt.lastIndexOf("\n{\n")));
} catch {
  const at = Math.max(txt.lastIndexOf("\n{\n"), txt.indexOf("{"));
  try { j = JSON.parse(txt.slice(at)); } catch (e) { console.log(label, dir, "PARSE FAIL", String(e).slice(0, 80)); process.exit(0); }
}
const bad = (j.errors || []).length + (j.page_errors || []).length + (j.failed_requests || []).length;
const failedEval = (j.interaction || []).filter((x) => /error/i.test(x));
const state = JSON.stringify(j.state_after || {});
console.log(
  `${(label || "?").padEnd(7)} ${(dir || "?").padEnd(22)} ` +
  `fps ${String(j.fps_idle).padStart(5)}/${String(j.fps_play).padStart(5)}  ` +
  `err ${String(bad).padStart(2)}  evalfail ${failedEval.length ? "YES " + failedEval.join(" ").slice(0, 90) : "no"}  ` +
  `state ${state.slice(0, 150)}`);
if (bad) console.log("   errors:", JSON.stringify(j.errors || []).slice(0, 300), JSON.stringify(j.page_errors || []).slice(0, 200));
