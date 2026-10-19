# Flight

Procedural terrain, a bank-to-turn jet, and ring gates to fly through, on the shared
arcade kit. Plain static files - `index.html`, no build step, no npm, relative paths.

Controls

- Arrows / WASD - roll and pitch. Rolling is turning: bank and the plane follows the
  tilt around the vertical, which is how arcade flight works.
- Shift - boost (52 -> 86 m/s), release to throttle back.
- R - restart. M - mute. C - CRT and cabinet bezel.

Rules

- Fly through a glowing ring: `10 + speed/8` points, a burst of sparks and a shockwave,
  and the ring is re-placed downrange. Rings you fly past are recycled ahead, so the
  run never runs out of them.
- The ground is the enemy: `heightAt(x, z)` is the single source of truth, used both to
  displace the mesh and to decide the crash, so the picture and the collision cannot
  disagree. Touch it and the plane explodes, then climbs again a couple of seconds later.
- Terrain is generated from my own value-noise fbm - broad landform, a ridge term for
  mountains, fine detail - coloured by height (sea, sand, grass, dark grass, rock, snow)
  with a per-vertex jitter, and flat-shaded.

How it works

- `noise.js` is the noise and `heightAt`. `terrain.js` is the chunk manager: 5 x 5 cells
  of 46 m around the plane, recycled from a pool - a pool mesh's position attribute and
  colour attribute are refilled when the plane crosses into a new cell, so flying forever
  allocates nothing and stays at 25 draw calls. Water is one large sheet that follows the
  plane, so the sea is one draw call too. No shadows: the sun is a directional light,
  bounce is a hemisphere light, and reflections come from the PMREM environment.
- `plane.js` builds the jet (fuselage, cone nose, wings with lit tips, fin, stabiliser,
  clearcoat canopy, spinning prop, exhaust glow). `rings.js` is the gate pool: a torus,
  an additive halo, a glow disc, facing the way you came, with `check()` (am I inside the
  disc) and `recycle()` (gates behind the plane go downrange).
- `main.js` is the arcade flight model: pitch and roll are local rotations, and turn
  comes from the lift vector - the plane's local up, projected onto the horizontal plane,
  crossed with its heading - which is the arcade shorthand for banking. The chase camera
  sits behind and above, smoothed exponentially, looking down the nose. The engine trail
  is a particle system spawned at the wingtips (denser when boosting), and the speed
  streaks are a rig that follows the plane's quaternion.
- Verified headless: `node ../tools/smoke.ts 5-flight --keys "wait:16000,ArrowRight:1500,
  ArrowUp:1400"` - no console or page errors, 21 fps idle / 10-16 fps flying under
  SwiftShader (no shadows, so it is the fastest of the five), and the altitude readout
  responds to pitch. `tools/work/flyproof.mjs` drives the scoring and crash paths through
  `window.arcade.fly`: lining the plane on a gate gives `SCORE 17 · RINGS 1 · LAST RING
  +17`, putting it on the ground gives `STATE DOWN · BEST 17 · LAST CLIPPED THE GROUND`,
  and two seconds later it is `STATE FLYING` again at 95 m.
- `tools/linescan.mjs` reports no line artefact in the band 100-400 (peak row 132).
