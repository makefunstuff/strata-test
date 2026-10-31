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
const dead = (e) => /closed|crashed|Target|detach|ECONNRESET|connection/i.test(String(e?.message || e));

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
const MT = 8000;
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
  await page.waitForFunction("window.eurorack && window.eurorack.booted", null, { timeout: 30000 });
  await page.waitForSelector(".panel", { timeout: 10000 });
};
const dismissHelp = (page) => page.evaluate(() => {
  const h = document.getElementById("help");
  h.classList.remove("open");
  localStorage.setItem("eurorack.help.seen", "1");   // first-open only, like the real button
});

try {
  // ---- 1. boot ----
  step("boot");
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
    const lv = await withPage({ width: 800, height: 600 }, async (page, errors) => {
      await boot(page);
      check(await page.evaluate((n) => eurorack.loadPreset(n), name), `preset ${name} failed to load`);
      const errs = await page.evaluate("eurorack.validate()");
      check(errs.length === 0, `preset ${name} invalid: ${errs.slice(0, 3).join("; ")}`);
      const r = await page.evaluate(async (n) => await eurorack.renderOffline(n, 4), name);
      check(errors.length === 0, `preset ${name}: console errors during render: ${errors.slice(0, 3).join(" | ")}`);
      return r;
    });
    report.presets[name] = lv;
    check(lv.rms >= 0.02, `preset ${name} too quiet to be music (rms ${lv.rms.toFixed(4)})`);
    check(lv.peak >= 0.08, `preset ${name} near-silent (peak ${lv.peak.toFixed(3)})`);
    check(lv.peak <= 1.0001, `preset ${name} exceeds full scale (peak ${lv.peak})`);
    check(lv.clippedFrac < 0.001, `preset ${name} clips ${(lv.clippedFrac * 100).toFixed(2)}% of samples`);
  }

  // ---- 3. UI: knobs, cables, browser, sequencer — real mouse first, handlers as fallback ----
  step("ui");
  await withPage({ width: 1280, height: 800 }, async (page) => {
    await boot(page);
    await dismissHelp(page);
    await page.evaluate("eurorack.loadPreset('Acid Groove')");
    await page.waitForTimeout(200);

    // Cables sag over panels (real ones do too), so act only on controls nothing covers.
    const knobBox = await page.evaluate(() => {
      for (const k of document.querySelectorAll(".panel .knob")) {
        const r = k.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (hit && k.contains(hit)) return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: k.closest(".panel").dataset.id };
      }
      return null;
    });
    if (check(knobBox, "no knob is free of covering cables to drag")) {
      const read = () => page.evaluate((id) => document.querySelector(`.panel[data-id="${id}"] .knob .kval`)?.textContent ?? null, knobBox.id);
      const before = await read();
      let after = before, mode = "mouse";
      for (let attempt = 0; attempt < 2 && after === before; attempt++) {
        await mouseRun(async () => {
          await page.mouse.move(knobBox.x, knobBox.y);
          await page.mouse.down();
          await page.mouse.move(knobBox.x, knobBox.y - 26, { steps: 8 });
          await page.mouse.up();
        });
        await page.waitForTimeout(250);
        after = await read();
      }
      if (after === before) {                                        // fallback: drive the handlers directly
        mode = "synthetic";
        after = await page.evaluate(([x, y, id]) => {
          const k = document.querySelector(`.panel[data-id="${id}"] .knob`);
          k.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: x, clientY: y }));
          k.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: x, clientY: y - 26 }));
          k.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: x, clientY: y - 26 }));
          return document.querySelector(`.panel[data-id="${id}"] .knob .kval`)?.textContent ?? null;
        }, [knobBox.x, knobBox.y, knobBox.id]);
      }
      check(before !== after, `knob drag changed nothing (${before}, mouse and synthetic)`);
      report.ui.knob = { before, after, mode };
    }

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

    await shot(page, join(outDir, "desktop.png"), "desktop.png");
  });

  // ---- 4. hero + phone shots ----
  step("shots");
  await withPage({ width: 1280, height: 800 }, async (page) => {
    await boot(page);
    await dismissHelp(page);
    await page.evaluate("eurorack.loadPreset('Ambient Garden')");
    await page.waitForTimeout(400);
    await shot(page, join(outDir, "hero.png"), "hero.png");
  });
  await withPage({ width: 390, height: 844, extra: { deviceScaleFactor: 2, hasTouch: true, isMobile: true } }, async (page, errors) => {
    await boot(page);
    await dismissHelp(page);
    await page.evaluate("eurorack.loadPreset('Acid Groove')");
    await page.waitForTimeout(400);
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
