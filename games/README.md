# games

Five browser games, each in its own folder, all on one shared arcade kit. Plain static
files: `index.html`, ES modules, CSS. No build step, no npm, no server-side code. Open
`index.html` and it runs; the site is published from this folder by GitHub Pages.

| game | the one line |
|---|---|
| [1 · Breakout](1-breakout/index.html) | neon room, PMREM reflections, ball trail, brick shatter, 53 bricks |
| [2 · Runner](2-runner/index.html) | chrome runner on a scrolling motorway that gets faster and never ends |
| [3 · Marble Maze](3-marble-maze/index.html) | a wooden board in real physics (cannon-es): tilt, roll, don't fall |
| [4 · Tower Defense](4-tower-defense/index.html) | enemies path-find and re-path around what you build; sealing the lane is refused |
| [5 · Flight](5-flight/index.html) | infinite terrain from 60 lines of noise, bank-to-turn jet, ring gates |

The [index](index.html) is the cabinet row, with screenshots.
[results.md](results.md) is the log: what each harness reported, and the bugs that catching
them found.

## The rules the site is built to

- `three@0.170.0` from jsDelivr, pinned, via an importmap:
  `"three"` → `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`,
  `"three/addons/"` → `.../examples/jsm/`. Every other library is pinned to an exact
  jsDelivr version (cannon-es 0.20.0, @fontsource/press-start-2p 5.3.0).
- All paths are relative, so the whole folder works under a sub-path (`/strata-test/`).
- No asset files. Every texture, the cabinet bezel and every sound are generated at
  runtime — procedural canvas textures, a canvas-drawn bezel, WebAudio synthesis.

## shared/ — the kit all five run on

- `post.js` — the render pipeline: Render → UnrealBloom → CRT → OutputPass, plus
  `setupEnvironment()` (PMREM `RoomEnvironment`) so metal has something to reflect.
- `crt.js` + `crt.css` + `bezel.js` — the monitor: barrel "inflate", per-pixel RGB triplet
  sampling, phosphor, scanlines, an aperture grille, a rolling beam, flicker, noise,
  vignette and a rounded tube edge, with a plastic cabinet bezel drawn on a canvas around
  it. `C` toggles the whole thing. The bezel's aperture and the shader's tube edge come
  from the same `tubeRect()`, so they cannot drift apart.
- `textures.js` — glow, streak, grid, asphalt, brushed metal, wood, stone, grass, stripes,
  noise, sky, shadow, disc.
- `effects.js` — sparks, shatter shards, shockwave rings, impact lights: pooled, allocated
  once. `speedlines.js` — speed streaks. `fps.js` — the FPS readout.
- `audio.js` — coin-op synthesis: 19 one-shot SFX, a tape echo, a compressor, and a
  bassline/lead/hat/kick sequencer. Nothing is scheduled before the first keypress (the
  autoplay policy), and `meter()` exposes an analyser so a headless test can *measure*
  sound.
- `hud.css` — the HUD, the cabinet typeface, the attract/game-over panel.

Each game exposes `window.arcade` (renderer, scene, camera, post, and its own state and
verbs) and `window.arcadeAudio`, which is what makes them testable from outside.

## Running and checking

One command checks the whole site, in about three minutes:

```sh
cd games/tools && npm i          # playwright-core, and nothing else
node tools/verify.mjs            # five games: clean console, HUD reacts to input, FPS
node tools/verify.mjs --full     # + audio measured, + the rules driven through the games,
                                 #   + the published site's relative paths  (~7 minutes)
```

Exit code 0 means every check passed. The latest run is committed, so the evidence travels
with the branch: `tools/work/verify/latest.md` (the table), `latest.json`, `rules.txt`.

What each layer asserts:

| tool | asserts |
|---|---|
| `tools/verify.mjs` | the sweep, with a hard timeout per check: no run can hang |
| `tools/smoke.ts <game>` | loads a game, 0 console/page errors, the HUD text changes under a key sequence, FPS before/after |
| `tools/audiotest.ts <game>` | sound measured through an `AnalyserNode`: silent before the first keypress (autoplay policy), audible while playing, no clipping, tail decays to silence (this is what catches a feedback loop) |
| `tools/work/rules.mjs` | the rules, through the verbs each game exposes on `window.arcade`: the marble warped onto the goal reports `STATE CLEAR`, warped into a hole reports `FALLS 1 · LAST HOLE`; three towers placed report `TOWERS 3` and pay; a gate moved in front of the plane reports `RINGS 1 · LAST RING +20` at `SPEED 86`; the plane put on the ground reports `STATE DOWN · LAST CLIPPED THE GROUND` |
| `tools/work/linkcheck.mjs` | every local href/src on every published page resolves under the Pages sub-path |
| `tools/linescan.mjs`, `tools/domscan.mjs` | the debug scalpel that found the line across the tube: score pixel rows, apply JS to the live scene/post, find DOM box edges on a band |

To play with a game by hand, `python3 -m http.server 8000` in this folder, or open
`index.html` directly. `tools/run-pi.ts` (via `tools/shoot.sh`) is the builder that made
these games: it runs pi headless on a game's `PROMPT.md`.

Every browser tool has a watchdog (a `SMOKE_MAX_MS` deadline, and a handler for SIGTERM/SIGINT)
that closes Chromium before exiting: on this machine the harness runs beside a model server
that holds the GPU and most of the RAM, and a leaked browser is both a stuck review and a
memory emergency. The default `SMOKE_MEM_HIGH=220M` cap plus those watchdogs are why the
RAM floor has held all task long.

## Two facts about checking games on this machine

- **The FPS numbers are a floor, not a ceiling.** Strata holds the GPU for local inference,
  so the harness runs Chromium on SwiftShader (software) with a 220 MiB ceiling: 7-22 fps.
  On a real GPU these are 60.
- **`dt` is capped at 0.05 s**, so at 8 fps a headless session runs about 2.5x slower than
  real time. A wave that looks stalled in the harness is fine.
