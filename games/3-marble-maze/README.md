# Marble Maze

Tilt a wooden maze board with the arrow keys and roll a chrome marble from the
top-right pad to the green pad at the bottom-left, without losing it in a hole
or off the edge. Rendered with three.js (jsDelivr, import map) and simulated
with cannon-es, so it runs by opening `index.html` - no build step, no npm, no
server. Paths are relative, so it works under a GitHub Pages sub-path.

Controls

- Left / Right / Up / Down arrows, or A / D / W / S - tilt the board that way.
- The board is on a critically damped spring: it eases to the tilted angle and
  springs back to flat when you let go, so the marble responds to how long you
  hold a key, not to key taps.
- R - restart (resets the timer and the fall counter).
- M - mute, C - toggle the CRT and the cabinet bezel.

Rules

- Reach the green pad. The timer runs from your first tilt; the best time of the
  session is kept.
- `H` tiles in the map are holes: they are real gaps in the collision shapes, so
  the marble drops through them.
- The `O` tile is an opening in the edge wall - a striped warning plate marks it.
- Every drop costs a fall, and puts the marble back on the start pad.

How it works

- `level.js` is the level: a 15 x 11 character map, plus `parse()`, which groups
  contiguous floor tiles into runs so that a hole is a gap in the floor body
  rather than a hole punched in one big plate.
- `main.js` mirrors that parse into two worlds: one merged `BoxGeometry` per
  floor run and per wall block for the renderer, and one static cannon-es
  `Body` per the same shapes. The tilt is a spring on the board group; every
  static body is re-placed by the same quaternion each frame, so physics and
  picture cannot drift apart.
- The marble is a cannon-es sphere; `collide` events give the impact velocity,
  which drives the wall clack, the sparks and the camera shake. Falling below the
  board surface means a hole or the edge, and the tile under the marble says which.
- Everything arcade is the shared kit in `../shared/`: `post.js` (bloom, CRT,
  OutputPass, PMREM room environment for the chrome), `crt.js` + `bezel.js`
  (tube and plastic cabinet), `textures.js` (procedural wood, stone, brushed
  metal, grid, stripes, glow, shadow - no image files), `effects.js` (sparks,
  shards, shockwave rings, impact light), `audio.js` (synthesised coin-op SFX
  and a bassline, silent until the first keypress), `hud.css`, `fps.js`.
- Draw calls: board, walls, wall rims, frame, hole rims, pads, beacon, marble,
  glow, contact shadow and table are each one mesh, plus the effect objects.
- Verified headless: `node ../tools/smoke.ts 3-marble-maze --keys
  "ArrowDown:1600,ArrowLeft:1500"` - no console or page errors, state goes
  `ready -> rolling`, the tile readout moves 13,1 -> 11,1. Sound is measured by
  `tools/audiotest.ts`: silence before the first keypress, no clipping, and a
  tail that decays to silence.
