# games

Five browser games, each in its own folder, all on one shared arcade kit. Plain static files:
`index.html`, ES modules, CSS. No build step, no npm, no server-side code. Open `index.html`
and it runs; this folder is what GitHub Pages publishes.

Live: **https://makefunstuff.github.io/strata-test/** · the [hub](index.html) is the cabinet row.

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
sequencer, a meter) · `hud.css` (the HUD, the cabinet typeface, the attract panel).

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
```

Exit code is the verdict. The latest run is committed: `tools/work/verify/latest.md` (and
`latest.json`, `rules.txt`). Per tool: `smoke.ts` (one game: console, HUD text before/after a
key sequence, FPS), `audiotest.ts` (measured audio), `work/rules.mjs` (the rules, through each
game's own verbs), `work/linkcheck.mjs` (every published page's local hrefs resolve under the
sub-path), `linescan.mjs` / `domscan.mjs` (the debug scalpels). Every browser tool has a
watchdog (`SMOKE_MAX_MS`, SIGTERM/SIGINT) that closes Chromium before exiting.

The long build log — the bisections, the pi runs that went in circles, the per-game notes — is
kept as this task's report on the work board, not in the repo.
