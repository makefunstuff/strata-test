#!/usr/bin/env node
/*
 * qualitytest.mjs — regression test for the shared quality panel (experiments/shared/lab.js).
 *
 *   node experiments/tools/qualitytest.mjs [page-dir]      (default 3-cloth-tearing)
 *
 * Two things must hold, and a review found one of them broken:
 *
 *  1. Nudging the **pixel ratio** slider must change the pixel ratio and NOTHING ELSE. It used to
 *     sit in the same folder as the preset select, and the folder-level `change` listener caught
 *     the slider's change too — so every keyboard nudge re-ran the preset handler. On the cloth
 *     that handler sews a new sheet, which wiped every tear the user had just made.
 *  2. Choosing a **preset** must still run the page's quality handler (that is the point of it).
 *
 * On the cloth page a re-weave is visible in the numbers: `torn` falls to 0. So the test tears the
 * sheet with a real sustained pull, nudges the pixel ratio, and requires the tears to survive.
 *
 * exit 0 on PASS, 1 on any failure.
 */
import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, dirname, basename } from "node:path";

const { chromium } = pw;
const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..", process.argv[2] ?? "3-cloth-tearing");
const root = dirname(dir);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch {
    if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${basename(dir)}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../../games/tools/chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote", "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});
const stop = async (code, why) => { console.error(`qualitytest: ${why}`); await browser.close().catch(() => {}); server.close(); process.exit(code); };
setTimeout(() => void stop(3, "timed out"), 180000);
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (!/favicon/.test(m.location().url) && m.type() === "error") errors.push(m.text()); });
await page.goto(url, { waitUntil: "load", timeout: 40000 });
await page.waitForTimeout(6000);
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.experiment.state())));
const panel = () => page.evaluate(() => ({ quality: window.experiment.lab.q.quality, pixelRatio: window.experiment.lab.q.pixelRatio }));

const fails = [];
const say = (ok, line) => { if (!ok) fails.push(line); console.log(`${ok ? "ok  " : "FAIL"}  ${line}`); };

// 0. the panel must start on the preset the page really runs
const s0 = await state();
const p0 = await panel();
say(["low","medium","high"].includes(p0.quality), `panel opens on preset ${p0.quality} (page state: resolution=${s0.resolution}, particles=${s0.particles})`);

// 1. tear the sheet with a real sustained pull, so a re-weave would be visible as torn -> 0
const mid = await page.evaluate(() => window.experiment.api.mid());
const torn0 = (await state()).torn;
const pull = await page.evaluate(`window.experiment.api.pullScreen(${mid[0]}, ${mid[1]}, 0.34, -0.06, 18, 16)`);
const s1 = await state();
say(s1.torn > torn0, `sustained pull tore the sheet (torn ${torn0} → ${s1.torn}, grabbed ${pull.index})`);

// 2. nudge the pixel ratio slider with the keyboard; nothing but the pixel ratio may move
const p1 = await panel();
const ratioBefore = p1.pixelRatio;
// lil-gui's number box is a text input: typing in it and committing (Enter) emits a `change`
// event that bubbles up the panel DOM — that is what the folder-level listener used to catch
const found = await page.evaluate(() => {
  const folder = [...document.querySelectorAll(".lil-gui .lil-gui")]
    .find((f) => f.querySelector(".title")?.textContent.trim() === "quality");
  const el = folder && [...folder.querySelectorAll("input[type=text]")]
    .find((i) => Math.abs(+i.value - window.experiment.lab.q.pixelRatio) < 1e-6);
  if (!el) return false;
  el.focus(); el.select();
  return document.activeElement === el;
});
say(found, "found and focused the pixel ratio number box in the quality folder");
await page.keyboard.type("0.8");
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
const s2 = await state();
const p2 = await panel();
const ratioAfter = p2.pixelRatio;
say(Math.abs(ratioAfter - 0.8) < 1e-6, `pixel ratio typed to 0.8 (${ratioBefore} → ${ratioAfter})`);
// a re-weave resets `torn` to 0 and sews every particle again; the sheet is allowed to tear a
// little more on its own while a grabbed flap settles, so the test is "no reset", not "frozen"
say(s2.torn >= s1.torn && s2.particles === s1.particles, `tears survived the nudge (torn ${s1.torn} → ${s2.torn}, ${s2.particles} particles) — no re-weave`);
say(p2.quality === p1.quality, `preset stayed ${p2.quality}`);

// 3. choosing a preset must still run the page handler
await page.evaluate(() => {
  const sel = [...document.querySelectorAll(".lil-gui select")].find((s) => [...s.options].some((o) => o.value === "high"));
  sel.value = "high";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(2500);
const s3 = await state();
const p3 = await panel();
const quality = p3.quality;
const moved = quality === "high" && (s3.particles !== s2.particles || s3.resolution !== s2.resolution || s3.torn === 0);
say(moved, `preset select runs the quality handler (quality=${quality}, particles ${s2.particles} → ${s3.particles}, resolution ${s2.resolution} → ${s3.resolution})`);

await browser.close();
server.close();
if (errors.length) { fails.push("console/page errors: " + errors.slice(0, 3).join(" | ")); console.log("errors:", errors.slice(0, 4)); }
console.log(fails.length ? `FAIL ${fails.length}` : "PASS — the panel does what its labels say");
process.exit(fails.length ? 1 : 0);
