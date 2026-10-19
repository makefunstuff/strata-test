# Tower Defense

A 12 x 12 field, a lane of enemies that re-routes around whatever you build, and
three.js rendering it as an arcade cabinet. Plain static files - open
`index.html`, no build step, no npm, no server; relative paths so it works under
a GitHub Pages sub-path.

Controls

- Click a tile - build a tower there (costs $25).
- Arrows or WASD - move the build cursor; Space / Enter builds at the cursor.
- N, or the button in the HUD - start the next wave early (the build phase also
  runs out on its own after 12 s).
- R - restart. M - mute. C - CRT and cabinet bezel.

Rules

- Enemies walk a shortest path from the magenta arch to the green one, found with
  breadth-first search over the tiles. Rocks are permanent cover.
- A tower is refused if it would seal the lane: the placement runs the same BFS
  with the new tower in it, and says "that would seal the lane" when no route is
  left. Enemies already walking re-snap to the new route, so a wall you build
  behind them sends them the long way.
- Towers turn to the nearest enemy in range (2.4 tiles) and fire visible
  projectiles that lead the target. A kill pays $3 + wave; a leak costs a life.
- Each wave has more and tougher enemies: `5 + 2n` of them, `26 * 1.28^(n-1)` hp,
  a little faster, spawning a little closer together. Clearing a wave pays a
  bonus. Ten leaks ends the run.

How it works

- `grid.js` owns the field: an `InstancedMesh` of tiles tinted per tile (grass,
  sand for the current lane, rock, tower, gate), merged rock blocks, the two
  arches, the build cursor with its range band, `canPlace()` (bounds, rock,
  tower, gate, then the BFS-seal test) and `pick()` (raycast against the
  instanced tiles).
- `enemies.js` is a pool of 14 walkers with billboard health bars, no per-frame
  allocation. Movement walks the route polyline with a carry-over step, so speed
  is exact across tile corners. `onKill` / `onLeak` hand the money and lives back
  to the game.
- `towers.js` is a pool of towers (base, pillar, aiming head, muzzle flash,
  range ring) and a pool of 40 projectiles.
- `main.js` runs the wave state machine (build / wave / over), the HUD, the
  camera drift and the shared kit: `post.js` (bloom, CRT, OutputPass, PMREM
  environment), `crt.js` + `bezel.js` (the tube and the plastic "TOWER DEFENSE"
  cabinet), `textures.js` (procedural grass, stone, brushed metal, stripes,
  glow), `effects.js` (sparks, shards, shockwave rings, impact lights),
  `audio.js` (laser, explosions, coins, wave fanfares, a bassline - silent until
  the first keypress), `hud.css`, `fps.js`.
- Two lessons from the tube: a hairline range ring fringes red/cyan through the
  CRT's per-pixel RGB sampling, so the range circle is a band, not a line; and
  the software renderer runs the loop at ~10 fps while `dt` is capped at 0.05 s,
  so a headless session plays in slow motion - the game is fine, the clock in
  the harness is not.
- Verified headless: `node ../tools/smoke.ts 4-tower-defense --keys
  "KeyN:100,wait:7000" --click "0.42,0.45;0.55,0.5"` - no console or page
  errors, and the overlay shows towers 3, kills paying (last `kill +4`), money
  100 -> 29. `tools/linescan.mjs` drives the rules directly through
  `window.arcade.place()`: 3 towers, 7 kills, 0 leaks, wave clear bonus, money
  back to 65 - the arithmetic in the HUD matches the arithmetic in the code.
