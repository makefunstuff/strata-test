# games

Five browser games, each in its own folder, all on one shared arcade kit. Plain static files:
`index.html`, ES modules, CSS. No build step, no npm, no server-side code. Open `index.html`
and it runs; this folder is what GitHub Pages publishes.

Live: **https://makefunstuff.github.io/strata-test/games/** · the [hub](index.html) is the cabinet row
(the site root is the [lab hub](../index.html), with the [graphics experiments](../experiments/index.html) on the other shelf).

## The five, as measured

FPS is headless Chromium on SwiftShader (software: the model server on this machine holds the
GPU), so it is a floor. On a real GPU all five run at 60. "Works" is what the headless check
saw, not what it should do.

| # | game | works? | fps (sw) | what is in it | play | look |
|---|---|---|---|---|---|---|
| 1 | [Breakout](1-breakout/index.html) | 0 errors; score 0→7 on input, 53 bricks | 10.5 / 8.5 | neon room, PMREM reflections, procedural grid + metal, ball trail, ball-follow light, brick shatter, shockwave rings, camera shake, bloom, CRT + cabinet, WebAudio SFX + bassline | 3/5 — the CRT and the room carry it; the game is plain Breakout | 4/5 |
| 2 | [Runner](2-runner/index.html) | 0 errors; score 0→56, lanes and jumps react | 11 / 10.5 | scrolling neon motorway, instanced lane dashes, pylons with lit caps, chrome runner with swinging limbs and a contact shadow, additive speed trail, dodge crates and jump hurdles, chase camera that leans, FOV widening with speed, crash sparks/shards/rings | 3/5 — speed reads well; the obstacle set is thin | 4/5 |
| 3 | [Marble Maze](3-marble-maze/index.html) | 0 errors; `ready → rolling`, tile 13,1→11,1; warped onto the goal → `STATE CLEAR`, into a hole → `FALLS 1 · LAST HOLE` | 7.5 / 6.5 | real physics (cannon-es): a static body per floor run and per wall, re-placed by the board quaternion each frame, tilt on a damped spring; procedural wood/stone/metal, PMREM chrome marble, lit hole rims, goal beacon, wall clacks from real impact velocities, camera lean + shake | 4/5 — the spring tilt rewards restraint, that is the game | 4/5 |
| 4 | [Tower Defense](4-tower-defense/index.html) | 0 errors; towers 0→3 from clicks, money 100→29; rules driven headlessly: 7 kills, 0 leaks, wave clear, money 65 | 10 / 9.5 | 12x12 field, BFS lane that **re-routes around what you build**, a placement that seals the lane is refused, pooled walkers with billboard health bars, towers that lead their target, muzzle flash, sparks/shards/rings, camera drift + shake on leak | 4/5 — building a wall behind the pack is a real decision | 4/5 |
| 5 | [Flight](5-flight/index.html) | 0 errors; pitch moves the altitude 110→15→95 m; gate in front → `RINGS 1 · LAST RING +20` at `SPEED 86`; on the ground → `STATE DOWN`, flying again 2 s later | 22 / 24 | infinite terrain from my own value-noise fbm, 5x5 recycled 46 m chunks (refilled buffers, 25 draw calls, no per-frame allocation), height-banded flat shading, Sky shader + sun + fog, bank-to-turn jet, spinning prop, wingtip vapour trail, ring gates that burst and recycle | 4/5 — rings, speed, and the ground is the whole danger | 5/5 |

## Polish pass (TST-5)

Two visual rounds per game, then a phone round, then a final sweep. Every change was shot at
start, mid-play and **game-over** (the game's own end verb through `window.arcade`, not a
staged screen) on desktop 960×540 and on a 390×844 touch viewport, and kept only if the picture
improved and the console, the controls and the frame rate were unchanged. Per-game detail, with
the before/after frames, is in each folder's `POLISH.md`.

fps is idle / play / game-over, headless SwiftShader beside the model server: a floor, compared
round to round on the same machine, one browser at a time.

| # | game | rounds | fps before | fps after | phone fps | look | why |
|---|---|---|---|---|---|---|---|
| 1 | Breakout | 2 + phone | 9.5 / 8.5 / 8.7 | 9.0 / 8.5 / 8.7 | 11.5 / 11 / 10.7 | 3.5 → **4.5** | pastel bricks blew out to one colour under the key light; now deep chroma bases with real emissive, a lit grid floor, a paddle with a contact shadow, a tight bright trail, screen flashes |
| 2 | Runner | 2 + phone | 11 / 10.5 / 10.7 | 11 / 12 / 12 | 15.5 / 16.5 / 16 | 3 → **4.5** | the fog, sky and env lifted the whole frame to a flat daytime wash; now a night motorway with a city skyline, a sun in the haze, and hazard bands painted on the road in the obstacle's colour |
| 3 | Marble Maze | 2 + phone | 7.5 / 6.5 / 6.7 | 7.5 / 7 / 6.7 | 15 / 15 / 14.7 | 3.5 → **4** | the goal beacon bloomed a green streak down the left of the tube at the camera's grazing angle; dimming it changed nothing (additive with `toneMapped: false` sits above the bloom threshold at any opacity) — normal blending did; the wall shadows are at 0.55 so the maze floor is not blacked out |
| 4 | Tower Defense | 2 + phone | 6.5 / 6.5 / 6.7 | 10 / 10.5 / 9.3 | 21 / 20 / 20 | 3 → **3.5** | flat bright turf with black holes under every tower; darker cooler turf, a warm lane that reads against it, shadows at half strength |
| 5 | Flight | 2 + phone | 16 / 18.5 / 14.7 | 24.5 / 25 / 15.3 | 33.5 / 33 / 19.3 | 2.5 → **3.5** | turbidity 9 / rayleigh 1.9 scattered the sky to a pale wash and the play frame was empty sky; deeper scattering, and a shot sequence that flies level, so terrain and ring gates are in the picture |

### Phone support (all five)

- **Controls**, drawn only on a touch device (`body.touch`), synthesising the keys each game
  already handles, so there is one input path and not two that can disagree:
  - Breakout — **drag anywhere** on the tube slides the paddle (the finger's screen x against
    the paddle's projected screen x), tap to serve; chips ◀ ▶ and serve.
  - Runner — chips ◀ **jump** ▶ (jump is a tap on Space, so a lane change and a jump are one
    gesture each), R on a chip.
  - Marble Maze — a **virtual stick** tilts the board (it pushes the arrows), R on a chip.
  - Tower Defense — the board is already pointer-driven, so **a tap on a tile builds**; chips
    for ◀ build ▶, wave (N) and R.
  - Flight — a **virtual stick** for pitch and roll, **boost held** with a thumb, R on a chip.
- **Layout**: `viewport-fit=cover` with no pinch zoom, `touch-action: none` and
  `overscroll-behavior: none` (no page scroll, no rubber-banding during play), safe-area
  padding, a compact two-row HUD under 760px, the drawn cabinet switched off on phones, and the
  keyboard legend replaced by the control layer. The whole phone type scale lives in that one
  media query, because every size in the HUD kit is an em off `.hud`'s `font-size`: the base was
  6px, which reads fine in a screenshot scaled up and is unreadable on a real 390px tube, so it
  is 8px with 12px values. Landscape phones (844×390) get their own block — smaller chips, and the
  stick tucked into the corner, because a 68px chip row plus a 96px stick costs a fifth of a
  390px-tall tube. Portrait cameras — the rule that matters is that **three's fov is
  vertical**, so a tall viewport narrows the *horizontal* view, which is the axis a board game
  needs: opening the vertical fov does not make a board fit sideways, the camera has to move.
  Breakout steepens its pitch and caps its distance; the Marble Maze and the Tower Defense pull
  the camera back by `0.8 x (16/9) / aspect` (capped) and scale their fog with it, because fog is
  a distance and the desktop fog buried the board at the portrait distance; the Runner multiplies
  its chase fov by 1.34 so all three lanes stay in frame; the Flight opens its chase fov to 74°
  and aims 7 m below the nose, because a level aim in a tall tube is a frame of empty sky.
- **Cost**: `shared/mobile.js` caps the device pixel ratio (2 → 1.5 on a phone), lowers the
  bloom scale and strength, halves the particle pools, drops the shadow map to 512, and swaps in
  CRT uniforms without the four-tap phosphor bleed, the rolling beam, the grain or the flicker.
  `autoQuality()` is a frame-time watchdog: under 45 fps for 2.5 s it switches off the bloom and
  the shadow map, once.

### What the checks are

```sh
tools/polish.sh <tag> [game…]        # start / play / game-over frames + fps + console, per game
PHONE=1 tools/polish.sh <tag>        # the same on a 390×844 touch viewport
node tools/mobilecheck.mjs           # real CDP touch: chips, stick, drag, board taps, no scroll
node tools/shrinkshots.mjs <g> …     # PNG → JPEG at quality 82, in place (790 KB → 55 KB)
```

`smoke.ts` gained `--phone` (a portrait touch context; `browser.newPage()` touch flags are not
enough in this Chromium, it needs `newContext({ isMobile, hasTouch })` plus
`Emulation.setTouchEmulationEnabled`; `PHONE_MODE=landscape` in the environment turns it sideways
at 844×390 — an environment variable, because an option that swallows the next argument is how
`--phone landscape` once ate the game name and every phone sweep became a sweep of one game), `--overjs` (drive the game's own end verb, then shoot and
read the end screen) and `--jpeg`. `tools/mobilecheck.mjs` measures the steering **while the
finger is held down** — a stick only pushes while it is pushed — and reads the game's state back
through `window.arcade`: tap to start, drag to steer, no scroll, no console errors. 5/5 pass.

**The bug worth knowing**: the new colour grade declared `uSat`, `uContrast` and `uLift` in GLSL
and set them in the presets, but never added them to `CRTShader.uniforms`. WebGL defaults a
missing uniform to 0, so `mix(vec3(lum), col, 0.0)` returned the luminance and the contrast curve
pinned it at mid-grey — every frame in the next four sweeps was a white tube with scanlines, with
**no console output at all**, and the fps that a grey screen buys was read as a win. Found by
shooting the phone page and disabling post passes one at a time. `attachCRT` now diffs the
uniforms declared in GLSL against the uniforms the material provides and warns. Evidence in
`1-breakout/shots/bug-greywash-*.jpg`; the same failure is in `<game>/shots/bug-greywash-play.jpg`
for the other four.

## What got hard as the complexity rose

1. **Graphics with no assets.** Every texture, the cabinet bezel and every sound are generated
   at runtime (canvas textures, WebAudio synthesis), so the site stays plain files. That
   decision is what made the CRT, the wood, the chrome and the coin-op sound possible at all.
2. **The CRT is a shader and a DOM overlay at once.** The tube's rounded edge and the drawn
   cabinet's aperture have to be the same geometry, so both read `tubeRect()`. Thin bright
   curves fringe red/cyan through per-pixel RGB sampling, so range rings are bands, not lines.
3. **A horizon seam** in the runner took three passes: the fog colour, the sky texture's
   horizon ramp, and a far grid compressing into a line.
4. **The line across the tube** — bisected by toggling the post chain, the sky, the mesh, the
   background, then the DOM. Four real defects fell out; the line itself was the HUD's 2px
   cyan underline (`tools/linescan.mjs`, `tools/domscan.mjs`).
5. **Sound you can test.** The tape delay had a second, unity-gain feedback path that
   self-oscillated into a shriek. `tools/audiotest.ts` measures it through an `AnalyserNode`:
   silent before the first keypress (autoplay policy), audible while playing, no clipping, tail
   decaying to silence — which is what catches a feedback loop.
6. **Verification that fits a shared machine.** Headless Chromium runs beside a model server
   that holds the GPU and most of the RAM: 220 MiB caps, one browser per sweep, a watchdog that
   closes it on a deadline, and the results committed with the branch.

## shared/ — the kit all five run on

`post.js` (Render → UnrealBloom → CRT → OutputPass, and `setupEnvironment()` PMREM so metal
has something to reflect) · `crt.js` + `crt.css` + `bezel.js` (the tube: barrel inflate,
per-pixel RGB triplet sampling, phosphor, scanlines, aperture grille, rolling beam, flicker,
noise, vignette, rounded edge, plus a plastic cabinet drawn on a canvas around it; `C` toggles
it) · `textures.js` (wood, stone, grass, asphalt, brushed metal, stripes, sky, glow, shadow…)
· `effects.js` (pooled sparks, shards, shockwave rings, impact lights) · `speedlines.js` ·
`fps.js` · `audio.js` (19 synthesised SFX, a damped tape echo, a compressor, a bassline
sequencer, a meter) · `hud.css` (the HUD, the cabinet typeface, the attract panel) · `mobile.js`
(touch and phone detection, the quality preset, the frame-time watchdog) · `touch.js` +
`touch.css` (the control layer: chips, virtual stick, drag surface, phone layout).

Each game exposes `window.arcade` — the renderer, scene, camera, post, and its own state and
verbs (`place()`, `warp()`, `fly`) — and `window.arcadeAudio`. That is what makes them testable
from outside, and what the rule proofs call.

## The rules the site is built to

- `three@0.170.0` from jsDelivr, pinned, through an importmap; every other library pinned to an
  exact jsDelivr version (cannon-es 0.20.0, @fontsource/press-start-2p 5.3.0).
- All paths relative, so the folder works under a sub-path (`/strata-test/`).
- No asset files, no build step, no server code.

## Checking

```sh
cd games/tools && npm i          # playwright-core, and nothing else
node tools/verify.mjs            # ~3 min: five games, clean console, HUD reacts to input, FPS
node tools/verify.mjs --full     # ~7 min: + measured audio, + the rules, + published paths
node tools/mobilecheck.mjs       # phone: touch controls driven with real CDP touch events
tools/polish.sh before           # start / play / game-over screenshots, desktop and phone
```

Exit code is the verdict. The latest run is committed: `tools/work/verify/latest.md` (and
`latest.json`, `rules.txt`). Per tool: `smoke.ts` (one game: console, HUD text before/after a
key sequence, FPS), `audiotest.ts` (measured audio), `work/rules.mjs` (the rules, through each
game's own verbs), `work/linkcheck.mjs` (every published page's local hrefs resolve under the
sub-path), `linescan.mjs` / `domscan.mjs` (the debug scalpels). Every browser tool has a
watchdog (`SMOKE_MAX_MS`, SIGTERM/SIGINT) that closes Chromium before exiting.

The long build log — the bisections, the pi runs that went in circles, the per-game notes — is
kept as this task's report on the work board, not in the repo.
