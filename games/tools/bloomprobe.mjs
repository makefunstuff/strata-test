// Measure the bloom pass as a *colour* source, not just a brightness one.
//
//   node tools/bloomprobe.mjs [game…] [--thresholds 0.82,1,1.25,1.6] [--out tools/work/bloomprobe]
//
// Why this exists: a green wash appeared over Breakout and every instinct said "the CRT shader
// is tinting the picture". It was not the CRT — with the CRT pass disabled entirely the green
// stayed, and it died at bloom threshold 1.25. UnrealBloomPass blurs whatever clears its
// high-pass and adds the result back over the whole frame, so a threshold that sits *below*
// the brightest thing in the play area turns bloom into the frame's colour-grading layer, and
// the cast is the hue of that object (here: near-white pastel brick faces, ~70% of the screen).
//
// So: for each game we force bloom on (the fps watchdog switches it off on this box, which is
// exactly how the bug hid), sweep the threshold, and sample two kinds of place —
//   dark  a region of *scene geometry* with no emissive in it, where a colour wash would show
//   hot   the emissive content that bloom is *for*, which must stay hot
// Read the DELTA in `dark.cast` across the sweep, not its absolute value: a sample that sits on
// sky or grass has a legitimate hue (Tower Defense's sky measures cast 58 at every threshold),
// and that is not a wash. A wash is when the *lowest* threshold measures clearly worse than the
// cleanest one — bloom is adding hue that the scene geometry does not have.
//
// The rule that came out of it, encoded in each game: threshold >= 1, above the scene's
// brightest non-emissive surface. See games/README.md "Bloom is a colour source".
//
// Output: one JSON per game in --out, printed as a table. Non-zero exit if a game cannot be
// measured, so it can be chained after tools/verify.mjs.
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gamesDir = resolve(here, "..");

// keys: the input that gets each game into a representative mid-play frame (same sequences as
// tools/polish.sh, shortened). dark/hot: fractional canvas coordinates, tuned per game to the
// two places that answer the question above.
const GAMES = {
  "1-breakout": { keys: "Space:120,ArrowRight:700,wait:600", dark: "0.5,0.16", hot: "0.5,0.33" },
  "2-runner": { keys: "Space:120,wait:1200", dark: "0.5,0.12", hot: "0.2,0.55" },
  "3-marble-maze": { keys: "ArrowRight:1200,wait:600", dark: "0.5,0.1", hot: "0.5,0.55" },
  "4-tower-defense": { keys: "KeyN:100,wait:2500", dark: "0.4,0.78", hot: "0.45,0.6" },
  "5-flight": { keys: "Shift:900,wait:500", dark: "0.5,0.86", hot: "0.5,0.75" },
};

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const wanted = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const names = wanted.length ? wanted : Object.keys(GAMES);
const thresholds = opt("thresholds", "0.82,1,1.25,1.6").split(",").map(Number);
const outDir = resolve(opt("out", join(here, "work", "bloomprobe")));
const MAX_MS = +(process.env.PROBE_MAX_MS ?? 120000);

const probe = (g) => {
  const cfg = GAMES[g];
  if (!cfg) return Promise.reject(new Error(`no sample points configured for ${g}`));
  const js = `(function(){
    const a = window.arcade; const cv = a.renderer.domElement;
    if (a.post.bloom) a.post.bloom.enabled = true;      // the watchdog would otherwise have killed it
    const s = document.createElement("canvas"); s.width = cv.width; s.height = cv.height;
    const cx = s.getContext("2d", { willReadFrequently: true });
    const px = (spec) => { const [fx, fy] = spec.split(",").map(Number);
      const d = cx.getImageData(Math.round(fx * s.width), Math.round(fy * s.height), 9, 9).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      const rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      return { rgb, cast: Math.max(...rgb) - Math.min(...rgb), lum: Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) };
    };
    const out = [];
    for (const th of ${JSON.stringify(thresholds)}) {
      a.post.bloom.threshold = th;
      a.post.render(); cx.drawImage(cv, 0, 0);           // one render per measurement, no rAF needed
      out.push({ threshold: th, dark: px("${cfg.dark}"), hot: px("${cfg.hot}") });
    }
    return { samples: out, errors_seen: 0 };
  })()`;
  return new Promise((done, fail) => {
    execFile(process.execPath, [join(here, "smoke.ts"), g, "--wait", "4", "--out", "/tmp/bloomprobe",
      "--keys", cfg.keys, "--eval", js],
      { cwd: gamesDir, detached: true, maxBuffer: 8 << 20,
        env: { ...process.env, SMOKE_MAX_MS: String(MAX_MS - 5000) } },
      (err, stdout) => {
        let parsed;
        try { parsed = JSON.parse(stdout); } catch { return fail(new Error(`${g}: no JSON from smoke.ts`)); }
        if (parsed.errors?.length) return fail(new Error(`${g}: page errors: ${parsed.errors.slice(0, 2).join(" | ")}`));
        if (!parsed.eval || parsed.eval.error) return fail(new Error(`${g}: probe: ${parsed.eval?.error ?? "no result"}`));
        done({ game: g, fps_play: parsed.fps_play, ...parsed.eval });
      });
  });
};

await mkdir(outDir, { recursive: true });
let failed = 0;
for (const g of names) {
  let r;
  try { r = await probe(g); } catch (e) { console.log(`${g.padEnd(16)} FAIL ${e.message}`); failed++; continue; }
  console.log(`== ${g}  (fps ${r.fps_play}, samples: dark @${GAMES[g].dark}, hot @${GAMES[g].hot})`);
  for (const s of r.samples) {
    console.log(`   threshold ${String(s.threshold).padEnd(5)}` +
      ` dark rgb=${JSON.stringify(s.dark.rgb).padEnd(16)} cast=${String(s.dark.cast).padStart(3)} lum=${String(s.dark.lum).padStart(3)}` +
      `   hot rgb=${JSON.stringify(s.hot.rgb).padEnd(16)} lum=${String(s.hot.lum).padStart(3)}`);
  }
  // the pick: the LOWEST threshold whose dark-region cast is within TOL of the cleanest cast
  // measured — i.e. the least bloom the scene can take before it stops colouring the frame.
  const minCast = Math.min(...r.samples.map((s) => s.dark.cast));
  const TOL = +(process.env.PROBE_CAST_TOL ?? 10);
  const pick = r.samples.find((s) => s.dark.cast <= minCast + TOL) ?? r.samples[r.samples.length - 1];
  r.pick = pick.threshold;
  r.bloom_induced_cast = (r.samples[0].dark.cast - minCast);
  await writeFile(join(outDir, `${g}.json`), JSON.stringify(r, null, 2));
  console.log(`   -> pick threshold ${pick.threshold} (dark cast ${pick.dark.cast}, cleanest ${minCast}, ` +
    `bloom-induced at ${r.samples[0].threshold}: +${r.bloom_induced_cast})\n`);
}
console.log(`wrote ${outDir}/<game>.json — ${names.length - failed}/${names.length} measured`);
process.exit(failed ? 1 : 0);
