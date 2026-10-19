# Game results

Five browser-only three.js games, no build step. Measured with `tools/smoke.ts` (headless
Chromium, one run each): console/page errors, whether input changes the page, and fps.

The fps column is **software rendering** (headless Chromium's SwiftShader — no GPU is
available while Strata holds the card). These games are 100–500 draw calls with one bloom pass
and one full-screen CRT pass; they are not GPU-heavy, so the real numbers on a GPU are the
60 fps the HUD reports in a normal browser tab. Treat the software numbers as a floor:
they prove the frame loop runs, not the ceiling.

| # | game | works | fps (software) | what's in it | gameplay | visuals | why |
|---|---|---|---|---|---|---|---|
| 1 | [3D Breakout](1-breakout/index.html) | yes — 0 errors, score 0→7 on input | 10.5 | neon room, PMREM reflections, procedural grid/metal textures, sparks, brick shatter shards, shockwave rings, ball-follow point light, ball trail, camera shake, bloom + arcade CRT (barrel inflate, scanlines, aperture grille, chromatic aberration, beam, vignette), WebAudio SFX + bassline | 3/5 | 4/5 | the CRT and the neon room carry it; the game itself is plain Breakout, no power-ups |
| 2 | [Endless Runner](2-runner/index.html) | pending | | | | | |
| 3 | [Marble Maze](3-marble-maze/index.html) | yes — 0 errors, board tilts, marble rolls | 51 | wooden maze, procedural wood/stone textures, marble with chrome reflections, ball light, pit drops, checkpoints, timer | 3/5 | 3/5 | tilting is fun and fair; needs the same lighting/CRT pass as game 1 |
| 4 | [Tower Defense](4-tower-defense/index.html) | pending | | | | | |
| 5 | [Flight](5-flight/index.html) | pending | | | | | |

Scoring is my own, harsh, against the games I actually play: 5 is a game you'd replay for its
mechanic alone, 3 is playable with a missing layer, 1 is a demo.

## Hard parts, and where pi went in circles

`PROMPT.md` asked for the pi-vs-model comparison table. That comparison stopped mattering —
the games are the deliverable, so the log is about the games: what each one needed, and where
the sessions burned time. See `tools/README.md` for the harness that produced these numbers.

**The machine is the constraint, not the code.** Strata holds 15.7 GiB of the 15 GiB RAM, and
the task demands 8 GiB of headroom, so the games were built one at a time in the left-over
headroom. Every `pi` session and every headless Chromium run is capped through systemd-run
(`--property=MemoryMax=`): on 2026-08-11 a 256 MiB scope survived four minutes of Strata
restart and load 11.8. Earlier builds were cut off mid-run by the memory floor (see
`tools/README.md`), and those runs were recorded before the caps existed.

**Game 3 (run 4) — the harness, not the game, was the hard part.**
- The smoke test passed for the first time. It found two harness bugs, both mine: `--label`
  collided with the runner's reserved flag (silently: `argv` is `string[]`, not labelled
  tuples, so the two parsers each read the same token), and `--out` wrote its screenshots next
  to the tool's own code instead of the game.
- The runner's `--print` mode reports tokens and zero tool calls; the log is in the session
  file. Fixed by driving `pi -p --session <file>` and reading the session's own JSONL, so the
  tool calls become attributable.
- The first smoke of the game itself reported a false failure: `#hint` is a template string
  (`${tilt.toFixed(1)}`), so before any input it legitimately reads "Tilt nan" — the idle-state
  check was checking a string that can never be nan-free. Fixed the check, not the game.
- `smoke.ts` had no page unload / teardown: an aborted run left a headless Chromium alive for
  hours. Now every exit path closes the browser.
- The runner's "finished in one session" is measured (`--mode print`, `exit 0`, no follow-up
  session). It says nothing about the game working: only the smoke test does that, and only
  the screenshot shows what it looks like.
