# Look pass (TST-6) — "the games look kinda meh"

The shelf's own scorecard said it: play 3–4/5, look 4/5 on four of the five, and the *reason*
was in the numbers — everything scored 4, nothing scored 5, and the five pages looked like one
page. Four findings, each measured before it was believed. All fps below are headless Chromium on
SwiftShader beside the model server (a floor, and a noisy one: the box had a VM and two JVMs
running during this pass, so the absolute numbers are only comparable round to round).

Evidence: `*/shots/look0-*` is the control (same session, before any change), `look3-*` is after
(all five games, desktop and phone, start/play/game-over). The two intermediate rounds — the first
CRT attempt, which washed the tube green, and the pre-bloom-fix state — were dropped after being
read; keeping them would have doubled the diff to show work that was reverted on the way.

## 1. The CRT was grading the signal in the wrong order

`shared/crt.js` applied its grade — saturation, contrast S-curve, black lift, `uGain` 1.72 —
**after** the scanlines and aperture grille, and **before** `OutputPass` tone-mapped. So ACES
re-crushed a contrast curve that had already been applied, the grille multiplied an already
bloomed image, and `uGain` had to fight all of it back up. That is the flat, milky, same-y
picture, and it was one order-of-operations bug in a shared file, which is why all five games
shared it.

A real chain is electronics-then-tube: grade the signal, then let the phosphor multiply it.
`uGain` is split into `uGainPre` (a linear exposure, safe before ACES) and `uGain` (the creative
level, restored after the glass), and the black lift now runs **after** the tube mask — a
pre-mask lift was adding `uLift` to the black surround outside the aperture, i.e. painting a
grey rectangle where the bezel should be.

## 2. One phosphor for five games

Every game rendered through the same `uGlowColor: 0x2a6ea8`. A tube's phosphor is its colour
identity, so the shelf had one identity: `PHOSPHORS` in `shared/crt.js` now gives each game one —
`p22` green (Breakout, Marble Maze), `p31` warm (Runner), `p43` rose (Tower Defense), `p4` blue
(Flight) — and the cabinet's own accent colour is mixed into it so the tube, the label plate and
the picture agree. The vignette falls off toward the phosphor's unpowered glass instead of
neutral black, and there is a `uFilm` half-pixel grain so flats have tooth instead of looking
painted.

Two self-inflicted wounds caught on the way, both by shooting the frame rather than trusting the
fps (fps *rises* when the picture is wrong — the grey-wash lesson in `README.md`):

- A flat additive `uGlowColor` term painted an even green wash over every dark area. The
  phosphor now tints the *bleed* (light coming off glass) rather than adding a cast, at a
  deliberately near-white coefficient.
- `attachCRT`'s uniform-vs-GLSL guard had been broken since it was written: it left the trailing
  `;` on the last name of a comma-separated `uniform float a, b, c;` declaration, so seven
  uniforms were reported as missing and the real check never ran. Fixed; the guard is what would
  have caught the wash, had it worked.

## 3. Flight's sky was white, and not because of the CRT

The play frame was a pale empty field with a coin-sized jet in it — the shelf's 5/5 game had the
worst picture. Bisection (`post.debug()`, below) said the white survived the CRT being switched
off, so it was never the CRT. Measured, not guessed:

- the rendered sky was `[255,255,255]` and **did not respond to `rayleigh` or to
  `toneMappingExposure` at all** — because three injects the renderer's ACES curve into every
  material *and* `OutputPass` applies it again, and Preetham radiance runs into the tens. Both
  knobs were acting on values that were already clipped.
- The fix is two-part: `toneMapped:false` on the dome so it writes raw HDR into the float
  composer target and is graded once, and a `uSkyExposure` uniform giving the model its own
  exposure (`0.2`). `?sky=0.04` sets it from the URL, which is how it was calibrated: sweep the
  uniform, sample the rendered sky, keep the value that is blue.
- Sweeping `turbidity`/`mieCoefficient`/`rayleigh` on the rendered frame, scoring B−R across the
  zenith and two upper-band samples: `3.2/.004/3.2` → 46, `1.0/.0015/4.0` → 27,
  `1.5/.002/2.6` → **58** (kept). The counter-intuitive part: raising `rayleigh` makes the sky
  *less* blue, because it lifts all three channels together and shrinks the gap; `turbidity` (the
  aerosol term) is what to cut.
- The camera aimed level, for every aspect — the portrait-only downward tilt was not enough. It
  now aims 4 m below the nose (7 m in portrait), which is what puts the terrain and the rings in
  the picture at all.

One trap here worth repeating: patching `material.fragmentShader` after the material has been
rendered invalidates three's program cache every frame and cost this game **15 fps → 10 fps** on
the software renderer. Patch `Sky.SkyShader` before constructing.

## 4. Bloom is a colour source, not just a brightness source

A green wash appeared over Breakout. Every instinct said the CRT shader; it was not the CRT —
with the CRT pass disabled entirely the green stayed, and it died at `bloom.threshold 1.25`.
`UnrealBloomPass` blurs whatever clears its high-pass and adds it back over the whole frame, so a
threshold below the brightest thing in the play area makes bloom the frame's colour-grading layer,
and the cast is that object's hue: Breakout's near-white pastel brick faces, ~70% of the screen.

`tools/bloomprobe.mjs` measures it — forces bloom on (the fps watchdog switches it off on this
box, which is exactly how this hid), sweeps the threshold, and samples a region of scene geometry
plus the emissive content. Read the **delta** in cast, not the absolute value (Tower Defense's sky
measures cast 58 at every threshold and that is just sky being blue):

| game | old threshold | bloom-induced cast in a dark region | now | hot content |
|---|---|---|---|---|
| 1-breakout | 0.82 | **+57** | 1.25 | 233 → 226 lum (neon survives) |
| 2-runner | 0.9 | +0 | 1.0 | unchanged |
| 3-marble-maze | 0.84 | +0 | 1.0 | unchanged |
| 4-tower-defense | 0.88 | +1 | 1.0 | unchanged |
| 5-flight | 0.95 | +0 | 1.05 | unchanged |

Rule now in `shared/post.js`: the threshold sits above the scene's brightest non-emissive
surface, i.e. in HDR. Only Breakout was actually washing; the others moved to the rule for free,
with identical measured frames.

## New tools, because every one of these was a measurement

- `tools/bloomprobe.mjs [game…]` — the sweep above, one command, writes `work/bloomprobe/`.
- `smoke.ts --eval "<js>"` (+ `--evalshot`) — run an expression against the page and print its
  JSON next to the fps and console results. `page.evaluate` needs the expression *inside* parens.
- `post.debug({crt|bloom|tonemap|vignette})`, also reachable as `?post=crt:0,bloom:0` — the
  post-chain bisection that the grey-wash bug needed, promoted from an ad-hoc edit to a call.

## Verification

`node tools/verify.mjs` 5/5 clean console, HUD reacts, `tools/mobilecheck.mjs` 5/5 (the phone
branch keeps a small `uGlow` rather than zeroing it — zeroing made the phone picture the
colourless one). `tools/polish.sh look3` 5/5, 15 shots, 0 console errors.
