# 5-flight — polish pass (TST-5)

Harness: `tools/polish.sh <tag> 5-flight` (desktop 960×540, software rasteriser),
`PHONE=1 tools/polish.sh <tag> 5-flight` (portrait 390×844, touch),
`node tools/mobilecheck.mjs 5-flight`. fps is idle / play / game-over, a floor measured on the
software rasteriser. The end frame is the game's own ground impact (the harness drops the jet to
`fly.pos.y = 0.2` through `window.arcade`, which is what the terrain collision turns into `STATE
DOWN`), not a staged screen.

Frames: `shots/before-*.jpg`, `shots/r5-*.jpg` (after), `shots/phone-r5-*.jpg` (portrait),
`shots/mobile-play.jpg`, `shots/bug-greywash-play.jpg`.

This game took the shared round, one targeted visual round and the phone round.

## Round 0 — the shared kit

The CRT regrade, the HUD card, the hot-filament sparks, the screen flash (all five; the frame-rate
lesson and the grey-wash bug are in `1-breakout/POLISH.md`). The grade matters more here than
anywhere: this game's post stack runs at exposure 0.62 with a bloom threshold of 1.05, i.e. a
deliberately dim cockpit look, and the old flat grade made it grey.

`shots/bug-greywash-play.jpg` is this game's frame from the four sweeps where the grade's uniforms
were missing from the material: a white tube, no console output, and — because a grey screen
lights fewer pixels through the bloom — a frame-rate gain that read as a win.

## Round 1 — the sky, and what "play" means

The play screenshot was **an empty pale wash**: the whole tube the colour of fog, a faint jet, and
nothing else. Two causes, and only one of them is a shader:

- **The sky scattered to white.** `Sky` at turbidity 9, rayleigh 1.9, mie 0.006 fills a
  forward-facing camera with near-white scattering, and the jet flies at floor+95, which is above
  almost everything. turbidity 9 → 5.5, rayleigh 1.9 → 1.1, mieCoefficient 0.006 → 0.0045,
  mieDirectionalG 0.82 → 0.86: the sky reads as sky, with a blue falloff and a sun direction, and
  the terrain and the ring gates come back into the picture.
- **The shot sequence was flying away from the game.** The harness key sequence pitched the jet up
  (ArrowUp 600 ms, then boost) and by the time the play frame was taken it was at ALT 304 with
  nothing in frame. The baseline frames have the same problem, so the "before" pictures of this
  game are as unrepresentative as they look. The sequence is a bank and a boost now
  (`ArrowLeft:500, ArrowRight:400, Shift:1200`), which is what a player does, and the play frame
  shows the jet, a ridge and three gold rings.

**This is the one round where the screenshot was the bug list, not the code.** The fps and console
metrics were clean while the frame was empty; nothing in the harness would have caught it.

fps 16 / 18.5 / 14.7 → **24.5 / 25 / 15.3**. Measured on the same machine, same build, one browser
at a time; the darker sky is the obvious candidate and is not proven per-change.

## Mobile round — phone support

- **A virtual stick** for pitch and roll (it pushes the arrows the flight model already reads),
  **boost held** with a thumb (a chip that presses Shift for as long as it is held — a tap would
  set the boost and release it straight back to cruise), and R.
- Portrait: the chase camera's fov opens 58° → 74° (a phone narrows the sideways view, and the
  sideways view is where the rings come from) **and aims 7 m below the nose**. The fov alone left
  the portrait frame a wall of sky: the flight is a forward view, so in a tall tube a level aim
  puts the horizon at the bottom edge. A few metres of downward aim and the terrain, the ridge and
  the rings are in the shot (`shots/phone-r5-play.jpg`).
- Quality: DPR cap, bloom scale/strength, CRT overrides, the watchdog. No shadow map in this game.
- The key legend and the attract card are hidden while flying (`body.playing`).

fps on a portrait phone viewport (DPR 1, software): **33.5 / 33 / 19.3**, the highest of the five,
because the tube is a third of the pixels. It is below the 36 / 35 / 23.3 measured before the
portrait aim, and that is the honest exchange: the frame went from empty sky (cheap to shade) to
terrain and rings (the game). In landscape (844×390) the same build runs at 37.5 fps with the
stick in the corner and the chips on the short edges.
`node tools/mobilecheck.mjs 5-flight` → the stick and the two chips are present, the chips reach
the game (`ShiftLeft`, `KeyR` in its keydown listener), a stick pulled back for 0.8 s climbs
**95 → 144.6 m measured while the finger is held down**, no page scroll, 0 console errors.
Portrait frame: `shots/phone-r5-play.jpg`.

## Visual rating

| | before | after |
|---|---|---|
| desktop | 2.5/5 — a white void with a jet in it; the play frame showed nothing of the game | 3.5/5 — a sky with depth, terrain and rings in frame, a jet with cyan tips you can read |
| phone | 0/5 — no touch controls, rings off the edge of the tube | 4/5 — the stick flies it, boost on a thumb, wings in frame |

## Open

- The terrain is flat-banded by height; at 20 m the bands read as paper. Face-normal shading, or a
  rock texture at low altitude, is the round this game needs next.
- The gold rings are unlit basic torus geometry; they do not react to the sky, and the burst on a
  pass is the only lively thing about them.
- 15.3 fps at the end frame is the lowest of the five on the software rasteriser: the crash burst
  (sparks, shards, rings, impact light, screen flash) plus the terrain is the heaviest moment in
  the game. A GPU fixes it; a pool cap on the crash burst is the software answer.
