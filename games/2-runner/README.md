# 2 · Endless Runner (three.js)

A small 3D endless runner: you run forward down a three-lane track, obstacles come
towards you, the speed rises the longer you survive, and one hit ends the run.

Open `index.html` in a browser — plain static files, no build step. three.js 0.170.0
is loaded from jsDelivr through the import map in `index.html`.

## Controls

| Key | Action |
| --- | --- |
| ← / A | move one lane left (quick slide, 0.18 s) |
| → / D | move one lane right |
| Space / ↑ / W | jump (also starts a run), click on the canvas also jumps |
| R | restart |

A lane slide is a short eased tween, so you can slide while airborne. Jumping is simple
ballistic physics (apex ≈ 1.6 m), which is enough to clear the low hurdles but not the tall crates.

## Files

- `index.html` — page, import map, HTML overlay (score, speed, best, lane, state, last action, game-over panel)
- `style.css` — overlay styling
- `main.js` — renderer, scene, camera, light, fog, resize, animation loop
- `game.js` — state machine (run / game over), speed ramp, scoring, collisions, input
- `player.js` — player mesh, lane tween, jump physics, run animation
- `spawner.js` — obstacle pool and spawn rules
- `track.js` — scrolling lane dashes and side posts
- `hud.js` — DOM overlay updates
- `rng.js` — mulberry32 RNG (deterministic, so a run is reproducible)

## How it works

The player stays at `z = 0` and the world moves towards him, which keeps collision and
spawning simple. Speed ramps from 9 m/s to 30 m/s over time, so obstacle gaps stay roughly
one second apart no matter how fast you are.

Obstacles are drawn from a fixed pool of 24 meshes (no allocation per frame). Two kinds:

- **crate** (1.9 m tall): blocks a lane, must be dodged — it is taller than the jump apex;
- **hurdle** (0.65 m tall): blocks a lane, must be jumped.

A spawn event places 1–3 obstacles in distinct lanes. With 3 obstacles all lanes are filled,
and in that case every one of them is a jumpable hurdle, so a pattern is never impossible —
the game never blocks all three lanes with something that cannot be jumped. When fewer than
three lanes are used, at least one lane is always left clear.

The motion is visible through recycled lane dashes and side posts sliding past, plus fog
that hides the far end of the track so obstacles fade in as they approach. Best score is kept
in `localStorage`.

Tested with the headless Chromium harness:

```sh
node ../tools/smoke.ts . --keys "ArrowLeft:500,Space:100" --click 0.5,0.5
```

It reports no console/page errors, 60 fps in SwiftShader, and the overlay shows the lane
change, the jump and the obstacles passed.
