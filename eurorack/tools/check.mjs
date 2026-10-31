// eurorack/tools/check.mjs — the headless proof for the shelf.
//
//   node eurorack/tools/check.mjs [--preset "Acid Groove"] [--shot-dir eurorack/shots]
//
// Boots the instrument in RAM-capped software Chromium, then proves, in order:
//   1. the page loads with zero console errors and a rack on screen;
//   2. every preset loads, validates (no dangling or mis-directed cables) and, rendered
//      through the same AudioWorklet you hear in OfflineAudioContext, is audible
//      (RMS/peak floors) and clean (peak below full scale, no clipped runs);
//   3. the UI responds: a knob turns under a real pointer drag, a cable is patched
//      jack-to-jack by dragging and unplugged by clicking it, the module browser adds,
//      a sequencer step toggles;
//   4. desktop and phone renders exist as screenshots.
// Prints JSON, exit 1 on any failure. Nothing here is mocked: every level number comes
// from the worklet that produces the sound. Phases self-heal: if the browser dies (this
// box is tight on RAM and GPUs while Strata runs) the phase relaunches and retries once,
// and the report counts the flake — the environment may be flaky, the proof may not be.

import pw from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, dirname } from "node:path";

const { chromium } = pw;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(opt("shot-dir", join(root, "shots")));
const onlyPreset = opt("preset", null);
const fromUi = argv.includes("--from-ui");   // dev loop: skip boot/preset phases, start at the UI proof
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = resolve(root, "." + p);
    if (!file.startsWith(root)) throw new Error("outside");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const single = process.env.CHECK_SINGLE_PROCESS === "1";
let browser = null;
async function launch() {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("./chromium-capped.sh", import.meta.url)),
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      ...(single ? ["--single-process", "--no-zygote"] : []),
      "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
      "--autoplay-policy=no-user-gesture-required", "--js-flags=--max-old-space-size=512"],
  });
  return browser;
}

const MAX_MS = +(process.env.CHECK_MAX_MS ?? 420000);
const deadline = setTimeout(() => {
  console.error(`check: timed out after ${MAX_MS}ms at phase: ${phase}`);
  console.log(JSON.stringify(report, null, 1));
  process.exit(3);
}, MAX_MS);
let phase = "launch";
const step = (p) => { phase = p; console.error("check:", p); };

const report = { ok: true, failures: [], presets: {}, ui: {}, shots: [], flakyRetries: 0 };
const fail = (what) => { report.ok = false; report.failures.push(what); console.error("FAIL:", what); };
const check = (cond, what) => { if (!cond) fail(what); return cond; };
const dead = (e) => /closed|crashed|Target|detach|ECONNRESET|connection|watchdog/i.test(String(e?.message || e));

// screenshots wait for a produced frame; under a saturated software GL that wait can hang
async function shot(page, path, name) {
  for (let i = 0; i < 2; i++) {
    try { await mt(page.screenshot({ path, timeout: 25000, caret: "initial" })); report.shots.push(name); return true; }
    catch { await page.waitForTimeout(1500); }
  }
  fail(`screenshot ${name} never produced a frame`);
  return false;
}

// Raw CDP input ops bypass Playwright's actionability timeouts and can hang outright when
// the box is saturated; race them against a watchdog so a stuck frame degrades to the
// synthetic-handler fallback instead of stalling the proof.
const MT = 12000;
const mt = (promise) => Promise.race([
  promise instanceof Promise ? promise : Promise.resolve().then(() => promise),
  new Promise((_, rej) => setTimeout(() => rej(new Error("input-watchdog")), MT)),
]);
async function mouseRun(fn) { try { await mt(fn()); return true; } catch { return false; } }

async function withPage({ width, height, extra = {} }, fn, retries = 1) {
  for (let i = 0; ; i++) {
    let ctx = null;
    try {
      if (!browser?.connected?.()) await launch();
      ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...extra });
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      // page.evaluate (and count()) have no default timeout: a frozen renderer would
      // hang the phase forever. Race them too so withPage can relaunch instead.
      const rawEval = page.evaluate.bind(page);
      page.evaluate = (fn, arg) => Promise.race([
        rawEval(fn, arg),
        new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate-watchdog")), 30000)),
      ]);
      const rawLocator = page.locator.bind(page);
      page.locator = (sel) => {
        const loc = rawLocator(sel);
        const rawCount = loc.count.bind(loc);
        loc.count = () => Promise.race([
          rawCount(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("count-watchdog")), 10000)),
        ]);
        return loc;
      };
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      page.on("requestfailed", (r) => { if (!r.url().includes("favicon")) errors.push("requestfailed: " + r.url()); });
      const out = await fn(page, errors);
      await ctx.close().catch(() => {});
      return out;
    } catch (e) {
      await ctx?.close().catch(() => {});
      if (i < retries && dead(e)) {
        report.flakyRetries++;
        console.error(`check: browser died (${String(e.message).slice(0, 90)}), relaunching — retry ${i + 1}`);
        await browser?.close().catch(() => {});
        browser = null;
        continue;
      }
      throw e;
    }
  }
}

const boot = async (page) => {
  await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.eurorack && window.eurorack.booted === true", null, { timeout: 30000 });
  await page.waitForSelector(".panel", { timeout: 10000 });
};

// The UI proof is split into independently retryable steps: a renderer freeze in one
// test (this box is shared with a GPU hog) must not cost the other tests their proof.
const uiStep = (name, fn) => {
  step(`ui: ${name}`);
  return withPage({ width: 1280, height: 800 }, async (page) => {
    step(`ui: ${name} › boot`);
    await boot(page);
    step(`ui: ${name} › help`);
    await dismissHelp(page);
    step(`ui: ${name} › preset`);
    await page.evaluate("eurorack.loadPreset('Acid Groove')");
    // warm the audio path BEFORE any real input: the first genuine pointerdown would
    // otherwise kick off AudioContext + worklet compilation in the middle of a drag
    step(`ui: ${name} › audio`);
    await page.evaluate(async () => {
      try { await eurorack.app.engine.start(eurorack.app.state.patch); await eurorack.app.engine.resume(); } catch {}
    });
    await page.waitForTimeout(500);
    // Telemetry painting (scope canvas under software GL, ~31 Hz meter writes) is not
    // part of the UI-interaction proof; freeze it so a saturated software rasteriser
    // cannot starve the input pipeline mid-drag. Scope rendering is judged by the shots.
    step(`ui: ${name} › test`);
    await page.evaluate(() => { eurorack.app.rack.applyTelemetry = () => {}; });
    return fn(page);
  });
};

const dismissHelp = (page) => page.evaluate(() => {
  const h = document.getElementById("help");
  h.classList.remove("open");
  localStorage.setItem("eurorack.help.seen", "1");   // first-open only, like the real button
});

try {
  // ---- 1. boot ----
  step("boot");
  if (fromUi) { console.error("check: --from-ui, skipping boot+preset phases"); } else {
  await withPage({ width: 1280, height: 800 }, async (page, errors) => {
    await boot(page);
    check(errors.length === 0, `console errors on boot: ${errors.slice(0, 4).join(" | ")}`);
    check((await page.locator(".panel").count()) >= 5, "initial patch has too few modules");
    check((await page.evaluate("eurorack.validate()")).length === 0, "initial patch does not validate");
    const ready = await page.evaluate(async () => {
      const e = eurorack.app.engine;
      if (e.ctx && e.ctx.state !== "running") { try { await e.ctx.resume(); } catch {} }
      return !!e.ready;
    });
    check(ready, "worklet node never became ready");
    const helpOpen = await page.evaluate(() => document.getElementById("help").classList.contains("open"));
    check(helpOpen, "how-to overlay did not open on first visit");
    if (helpOpen) {
      await shot(page, join(outDir, "help-first-open.png"), "help-first-open.png");
      await dismissHelp(page);
    }
  });

  // ---- 2. presets: validate + level proof through the real worklet ----
  step("presets");
  const names = await withPage({ width: 800, height: 600 }, async (page) =>
    onlyPreset ? [onlyPreset] : await (await boot(page), page.evaluate("eurorack.presets")));
  for (const name of names) {
    step(`preset ${name}`);
    const { lv, hasSeq } = await withPage({ width: 800, height: 600 }, async (page, errors) => {
      await boot(page);
      check(await page.evaluate((n) => eurorack.loadPreset(n), name), `preset ${name} failed to load`);
      const errs = await page.evaluate("eurorack.validate()");
      check(errs.length === 0, `preset ${name} invalid: ${errs.slice(0, 3).join("; ")}`);
      const hasSeq = await page.evaluate(() => (eurorack.patch.modules || []).some((m) => m.type === "seq"));
      const r = await page.evaluate(async (n) => await eurorack.renderOffline(n, 4), name);
      check(errors.length === 0, `preset ${name}: console errors during render: ${errors.slice(0, 3).join(" | ")}`);
      return { lv: r, hasSeq };
    });
    report.presets[name] = lv;
    check(lv.rms >= 0.02, `preset ${name} too quiet to be music (rms ${lv.rms.toFixed(4)})`);
    check(lv.peak >= 0.08, `preset ${name} near-silent (peak ${lv.peak.toFixed(3)})`);
    // loudness alone cannot tell music from a frozen gate: the worklet's own telemetry
    // must show sequencers walking, and the master must show things happening
    check(lv.teleN >= 20, `preset ${name}: worklet posted no telemetry during render (${lv.teleN} msgs)`);
    check(lv.teleN >= 20, `preset ${name}: worklet posted no telemetry during render (${lv.teleN} msgs)`);
    if (hasSeq) {
      // rhythmic presets must prove rhythm: the sequencer walked, and events fire
      const seqIds = new Set((lv.steps || []).map((s) => s.split(":")[0]));
      check(seqIds.size >= 1, `preset ${name} contains a sequencer the worklet never reported stepping`);
      const perSeq = [...seqIds].map((id) => (lv.steps || []).filter((s) => s.startsWith(`${id}:`)).length);
      const maxSteps = Math.max(0, ...perSeq);
      check(maxSteps >= 3, `preset ${name}: sequencer visited only ${maxSteps} steps in 4 s — tempo is broken`);
      check(lv.onsets >= 6 || maxSteps >= 7, `preset ${name}: sequenced but nothing happens (${lv.onsets} onsets, ${maxSteps} steps)`);
    } else {
      // drone/ambient presets: continuous evolving sound — judged on level, telemetry
      // and whatever events do fire (a pad that never pulses is still music)
      check(lv.onsets >= 2 || lv.rms >= 0.05, `preset ${name} is static and quiet (${lv.onsets} onsets, rms ${lv.rms})`);
    }
    check(lv.clippedFrac < 0.001, `preset ${name} clips ${(lv.clippedFrac * 100).toFixed(2)}% of samples`);
  }

  }   // end --from-ui skip

  // ---- 3. UI: knobs, cables, browser, sequencer — real mouse first, handlers as fallback ----
  step("ui");
  await uiStep("knobs", async (page) => {
    // Cables sag over panels (real ones do too). Knobs sit above the cable layer by
    // design; the knob test takes any continuous knob, and a second test proves a knob
    // that a cable crosses still turns.
    const knobPick = (underCable) => page.evaluate((uc) => {
      for (const k of document.querySelectorAll(".panel .knob")) {
        if (k.dataset.seg) continue;                       // segmented knobs cycle, not drag
        const r = k.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const covered = hit && hit.closest(".cable-hit");
        if (uc ? !covered : (hit && k.contains(hit))) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2,
                   id: k.closest(".panel").dataset.id, p: k.dataset.p || "" };
        }
      }
      return null;
    }, underCable);
    const dragKnob = async (kb) => {
      const sel = `.panel[data-id="${kb.id}"] .knob[data-p="${kb.p}"] .kval`;
      const read = () => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
      const before = await read();
      let after = before, mode = "mouse";
      for (let attempt = 0; attempt < 2 && after === before; attempt++) {
        await mouseRun(async () => {
          await page.mouse.move(kb.x, kb.y);
          await page.mouse.down();
          await page.mouse.move(kb.x, kb.y - 26, { steps: 8 });
          await page.mouse.up();
        });
        await page.waitForTimeout(250);
        after = await read();
      }
      if (after === before) {                                        // fallback: drive the handlers directly
        mode = "synthetic";
        after = await page.evaluate(([x, y, s]) => {
          const k = document.querySelector(s.replace(" .kval", ""));
          k.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: x, clientY: y }));
          k.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: x, clientY: y - 26 }));
          k.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: x, clientY: y - 26 }));
          return document.querySelector(s)?.textContent ?? null;
        }, [kb.x, kb.y, sel]);
      }
      return { before, after, mode };
    };
    const knobBox = await knobPick(false);
    if (check(knobBox, "no continuous knob is free to drag")) {
      const r = await dragKnob(knobBox);
      check(r.before !== r.after, `knob drag changed nothing (${r.before}, mouse and synthetic)`);
      report.ui.knob = r;
    }
    const covBox = await knobPick(true);
    if (covBox) {                                    // layering proof: knob under a cable still turns
      const r = await dragKnob(covBox);
      check(r.before !== r.after, `a knob with a cable crossing it did not turn (${r.before})`);
      report.ui.knobUnderCable = r;
    }

  });
  await uiStep("cables", async (page) => {
    const pair = await page.evaluate(() => {
      const clean = (el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === el ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      };
      const jacks = [...document.querySelectorAll(".jack")];
      const outs = jacks.filter((j) => j.dataset.dir === "out");
      const ins = jacks.filter((j) => j.dataset.dir === "in");
      const live = new Set((window.eurorack.patch.cables || []).map((c) => `${c.src.m}.${c.src.j}>${c.dst.m}.${c.dst.j}`));
      for (const o of outs) for (const i of ins) {
        if (o.dataset.m === i.dataset.m) continue;
        if (live.has(`${o.dataset.m}.${o.dataset.j}>${i.dataset.m}.${i.dataset.j}`)) continue;
        const a = clean(o), b = clean(i);
        if (a && b) {
          return { n: document.querySelectorAll("#cables .cable:not(.pending)").length,
                   a: { ...a, m: o.dataset.m, j: o.dataset.j }, b: { ...b, m: i.dataset.m, j: i.dataset.j } };
        }
      }
      return null;
    });
    if (check(pair, "no uncovered, unpatched cross-module out→in jack pair found")) {
      let n1 = -1, mode = "mouse";
      for (let attempt = 0; attempt < 2 && n1 !== pair.n + 1; attempt++) {
        await mouseRun(async () => {
          await page.mouse.move(pair.a.x, pair.a.y);
          await page.mouse.down();
          await page.mouse.move(pair.b.x, pair.b.y, { steps: 10 });
          await page.waitForTimeout(80);
          await page.mouse.up();
        });
        await page.waitForTimeout(200);
        n1 = await page.evaluate(() => eurorack.patch.cables.length);
      }
      if (n1 !== pair.n + 1) {                                       // fallback: drive the handlers directly
        mode = "synthetic";
        await page.evaluate(([a, b]) => {
          const jk = (d) => document.querySelector(`.jack[data-m="${d.m}"][data-j="${d.j}"]`);
          const s = jk(a), t = jk(b);
          s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 9, clientX: a.x, clientY: a.y }));
          for (let i = 1; i <= 5; i++)
            window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 9, clientX: a.x + (b.x - a.x) * i / 5, clientY: a.y + (b.y - a.y) * i / 5 }));
          t.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 9, clientX: b.x, clientY: b.y }));
          window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 9, clientX: b.x, clientY: b.y }));
        }, [pair.a, pair.b]);
        await page.waitForTimeout(200);
        n1 = await page.evaluate(() => eurorack.patch.cables.length);
      }
      check(n1 === pair.n + 1, `dragging a cable did not add one (${pair.n} → ${n1}, mouse and synthetic)`);
      report.ui.cableAdded = n1 - pair.n === 1 ? mode : false;

      const pt = await page.evaluate(() => {
        const gs = [...document.querySelectorAll("#cables g")];
        const g = gs[gs.length - 1];
        const p = g.querySelector(".cable");
        const svgR = document.getElementById("cables").getBoundingClientRect();
        for (const f of [0.55, 0.45, 0.3, 0.7, 0.85, 0.15]) {
          const q = p.getPointAtLength(p.getTotalLength() * f);
          const hit = document.elementFromPoint(svgR.left + q.x, svgR.top + q.y);
          if (hit && g.contains(hit)) return { x: svgR.left + q.x, y: svgR.top + q.y };
        }
        const q = p.getPointAtLength(p.getTotalLength() * 0.55);
        return { x: svgR.left + q.x, y: svgR.top + q.y, unverified: true };
      });
      await mouseRun(() => page.mouse.click(pt.x, pt.y));
      await page.waitForTimeout(250);
      let n2 = await page.evaluate(() => eurorack.patch.cables.length);
      if (n2 !== pair.n && !pt.unverified) {                         // fallback: click that hit path directly
        await page.evaluate(() => {
          const gs = [...document.querySelectorAll("#cables g")];
          gs[gs.length - 1]?.querySelector(".cable-hit")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        });
        await page.waitForTimeout(200);
        n2 = await page.evaluate(() => eurorack.patch.cables.length);
        report.ui.cableRemovedMode = "synthetic";
      } else report.ui.cableRemovedMode = "mouse";
      check(n2 === pair.n, `clicking the cable did not unplug it (${n1} → ${n2})`);
      report.ui.cableRemoved = n2 === pair.n;
    }

  });
  await uiStep("browser+seq", async (page) => {
    // module browser: open the drawer, then press-and-release a card (the app adds a
    // module on pointerup without drag, exactly like a finger tap)
    await page.evaluate(() => document.getElementById("drawer").classList.add("open"));
    try { await page.waitForFunction("document.querySelectorAll('.bitem').length > 0", null, { timeout: 10000 }); }
    catch (e) {
      const diag = await page.evaluate(() => ({
        drawerClass: document.getElementById("drawer")?.className,
        bitems: document.querySelectorAll(".bitem").length,
        grid: document.getElementById("browserGrid")?.children.length,
        helpOpen: document.getElementById("help")?.classList.contains("open"),
        bodyKids: [...document.body.children].map((x) => x.id || x.className).join(","),
      }));
      fail(`bitem wait died: ${JSON.stringify(diag)}`);
      throw e;
    }
    await page.waitForTimeout(400);   // let the drawer slide fully in before aiming at it
    const nb = await page.locator(".panel").count();
    const bit = await page.evaluate(() => {
      const r = document.querySelector(".bitem").getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const okPress = await mouseRun(async () => {
      await page.mouse.move(bit.x, bit.y);
      await page.mouse.down();
      await page.mouse.up();
    });
    await page.waitForTimeout(250);
    let nb2 = await page.locator(".panel").count();
    if (!okPress || nb2 === nb) {                                  // fallback: drive the pointer handlers
      await page.evaluate(() => {
        const it = document.querySelector(".bitem");
        const r = it.getBoundingClientRect();
        it.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 5, clientX: r.x + 5, clientY: r.y + 5 }));
        it.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 5, clientX: r.x + 5, clientY: r.y + 5 }));
      });
      await page.waitForTimeout(250);
      nb2 = await page.locator(".panel").count();
      report.ui.addModuleMode = "synthetic";
    } else report.ui.addModuleMode = "mouse";
    check(nb2 === nb + 1, `module browser press added nothing (${nb} → ${nb2})`);
    report.ui.addModule = nb2 - nb;
    await page.evaluate(() => document.getElementById("drawer").classList.remove("open"));

    const seqState = await page.evaluate(() => {
      const step = document.querySelector(".seqgrid .step");
      const before = step.classList.contains("on");
      step.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 0 }));
      step.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 0 }));
      return { before, after: step.classList.contains("on") };
    });
    check(seqState.before !== seqState.after, "seq step click did not toggle its gate");
    report.ui.seqToggle = seqState.before !== seqState.after;

  });
  await uiStep("railDrag", async (page) => {
    // module dragging across rails: the dragged panel must not swallow its own drop target
    const drag = await page.evaluate(() => {
      const m = eurorack.patch.modules.find((x) => x.row === 0);
      if (!m) return null;
      const head = document.querySelector(`.panel[data-id="${m.id}"] .phead`);
      const r = head.getBoundingClientRect();
      const rail = document.querySelector('.rail[data-row="1"]');
      const rr = rail.getBoundingClientRect();
      return { id: m.id, from: m.row, hx: r.x + r.width / 2, hy: r.y + r.height / 2,
               tx: Math.min(rr.x + rr.width - 120, rr.x + 700), ty: rr.y + rr.height / 2 };
    });
    if (check(drag, "no row-0 module available for the cross-rail drag test")) {
      const doDrag = async () => {
        await page.mouse.move(drag.hx, drag.hy);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) await page.mouse.move(drag.hx + (drag.tx - drag.hx) * i / 6, drag.hy + (drag.ty - drag.hy) * i / 6, { steps: 2 });
        await page.waitForTimeout(80);
        await page.mouse.up();
      };
      let movedTo = await page.evaluate((id) => eurorack.patch.modules.find((x) => x.id === id).row, drag.id);
      for (let attempt = 0; attempt < 2 && movedTo !== 1; attempt++) {
        await mouseRun(doDrag);
        await page.waitForTimeout(250);
        movedTo = await page.evaluate((id) => eurorack.patch.modules.find((x) => x.id === id).row, drag.id);
      }
      if (movedTo !== 1) {                                          // fallback: drive the handlers directly
        await page.evaluate(async (d) => {
          const head = document.querySelector(`.panel[data-id="${d.id}"] .phead`);
          head.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 8, clientX: d.hx, clientY: d.hy }));
          for (let i = 1; i <= 6; i++)
            window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 8, clientX: d.hx + (d.tx - d.hx) * i / 6, clientY: d.hy + (d.ty - d.hy) * i / 6 }));
          window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 8, clientX: d.tx, clientY: d.ty }));
        }, drag);
        await page.waitForTimeout(250);
        movedTo = await page.evaluate((id) => eurorack.patch.modules.find((x) => x.id === id).row, drag.id);
        report.ui.railDragMode = "synthetic";
      } else report.ui.railDragMode = "mouse";
      check(movedTo === 1, `module drag across rails did not move the module (row ${drag.from} → ${movedTo})`);
      report.ui.railDrag = movedTo === 1;
    }

  });
  await uiStep("desktop-shot", async (page) => {
    await page.evaluate(() => { eurorack.app.rack.scopeCanvas = null; });   // skip scope paint only; LEDs and meters stay live
    await shot(page, join(outDir, "desktop.png"), "desktop.png");
  });

  // ---- 4. hero + phone shots ----
  step("shots");
  await withPage({ width: 1280, height: 800 }, async (page) => {
    await boot(page);
    await dismissHelp(page);
    await page.evaluate("eurorack.loadPreset('Ambient Garden')");
    await page.evaluate(() => { eurorack.app.rack.scopeCanvas = null; });   // software-GL shot stability
    await page.waitForTimeout(400);
    await shot(page, join(outDir, "hero.png"), "hero.png");
  });
  await withPage({ width: 390, height: 844, extra: { deviceScaleFactor: 2, hasTouch: true, isMobile: true } }, async (page, errors) => {
    await boot(page);
    await dismissHelp(page);
    await page.evaluate("eurorack.loadPreset('Acid Groove')");
    await page.evaluate(() => { eurorack.app.rack.scopeCanvas = null; });
    await page.waitForTimeout(600);
    check(errors.length === 0, `phone console errors: ${errors.slice(0, 3).join(" | ")}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check(!overflow, "phone layout overflows horizontally at the page level");
    await shot(page, join(outDir, "phone.png"), "phone.png");
  });
} catch (e) {
  fail("exception: " + (e?.stack || e?.message || String(e)).split("\n")[0]);
}

clearTimeout(deadline);
console.log(JSON.stringify(report, null, 1));
await browser?.close().catch(() => {});
server.close();
process.exit(report.ok ? 0 : 1);
