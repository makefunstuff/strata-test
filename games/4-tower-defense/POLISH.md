# 4-tower-defense — polish pass (TST-5)

Harness: `tools/polish.sh <tag> 4-tower-defense` (desktop 960×540, software rasteriser),
`PHONE=1 tools/polish.sh <tag> 4-tower-defense` (portrait 390×844, touch),
`node tools/mobilecheck.mjs 4-tower-defense`. fps is idle / play / game-over, a floor measured on
the software rasteriser; the end frame is the game's own `over()` (lives out) through
`window.arcade`.

Frames: `shots/before-*.jpg`, `shots/r4-*.jpg` (after), `shots/phone-after-*.jpg` (portrait),
`shots/mobile-play.jpg` (real touch taps building on the board), `shots/bug-greywash-play.jpg`.

This game took the shared round, one targeted visual round and the phone round.

## Round 0 — the shared kit

The CRT regrade, the HUD card, the hot-filament sparks, the screen flash (all five; the
frame-rate lesson and the grey-wash bug are in `1-breakout/POLISH.md`). The attract/wave card
("START WAVE (N)") is the visible change here: it used to be bare blinking text over the board.

`shots/bug-greywash-play.jpg` is this game's frame from the four sweeps where the grade's uniforms
were missing from the material: a white tube with scanlines, and no console output.

## Round 1 — the board

Three things in the frame fought the player:

- **The lawn was the brightest object on the tube.** The tiles are an instanced grid with a
  procedural grass map tinted per instance; the base was `#33663c` and the grass tint `#46874f`,
  which under the key light and the CRT's gain made the board glow and flattened everything on it.
  Base `#33663c → #25462c`, tint `#46874f → #3c7448`: the board is now the darkest large object,
  and the towers, enemies and the lane sit *on* it.
- **The lane you must read was the least readable thing in the frame.** The path tint multiplied
  by a green grass map comes out olive, and the lane — the whole subject of the game — vanished
  into the turf. Path tint `#cba86d → #e6c184`: warm against cool, and the eye follows the route
  at a glance. (The tint is a multiply, so a warm path on a dark cool base is the only cheap way
  to get a lane that reads without a second material.)
- **The towers sat in black holes.** The key light casts; at full strength a small tower's shadow
  on a bright lawn is a hard black disc, and three of them read as holes punched in the board.
  `key.shadow.intensity = 0.5` (three r168+) takes the opacity out and leaves the shape, which is
  what the contact cue wanted.

fps 6.5 / 6.5 / 6.7 → **10 / 10.5 / 9.3**. The gain is measured, not attributed per change: the
dark turf feeds the bloom far less, and the regrade is a cheaper shader path. It is a +50% frame
rate, so the honest statement is "measured on the same machine, same build, one browser at a
time" and the cause is inferred.

## Mobile round — phone support

- **The board is the control.** The game is already pointer-driven, and Chromium derives
  `pointerdown` from a real touch, so a tap on a tile builds — no parallel touch model was added.
  The keyboard-only verbs go on chips: ◀ ▶ (cursor), **build** (Space, at the cursor), wave (N), R.
- Portrait: the camera **pulls back** by `0.8 x (16/9) / aspect` and the fog scales with it, which
  is what puts the whole 12×12 lane in frame on a tall viewport. The first attempt opened the
  vertical fov (40° → 56°) and the board was still cropped sideways: three's fov is vertical, so
  the horizontal view is `fov x aspect`, and it is the horizontal that a square board needs. The
  first pull-back frame was pure fog: fog is a distance, so it has to move with the camera.
- Quality: DPR cap, bloom, shadow map 1024 → 512, CRT overrides, and the watchdog.
- The wave card and the key legend are hidden during a wave (`body.playing`).

fps on a portrait phone viewport (DPR 1, software): **21 / 20 / 20** — the fit put the fog over
the surround, which is the cheap part of the frame to shade.
`node tools/mobilecheck.mjs 4-tower-defense` → 5 chips, all reaching the game's keydown listener
(`ArrowLeft, Space, ArrowRight, KeyN, KeyR`); nine real touch taps on the board produce 14 pointer
events in the page and spend the whole opening purse (money 100 → 0): a phone player builds by
tapping the field. No page scroll, 0 console errors. Portrait frame: `shots/phone-after-play.jpg`,
the taps in `shots/mobile-play.jpg`.

## Visual rating

| | before | after |
|---|---|---|
| desktop | 3/5 — a glowing green mat, an invisible lane, towers in black holes | 3.5/5 — a board with depth, a lane you can follow, towers that sit on the ground |
| phone | 0/5 — no touch story, board cropped | 4/5 — tapping the field builds, the lane fits, the wave card is out of the way in play |

## Open

- This is the least visually finished of the five and it knows it: the enemies are one block
  style with a billboard health bar, the muzzle flash is a sprite, and the ground has no ambient
  life (no grass detail, no props). The next round is the enemy set and a landscape around the
  board, not the board.
- The range ring is a flat additive disc at 0.17 that washes the tiles under it; a hatched ring
  (bands, not a filled disc — see the kit's note about thin bright curves) would read better.
- In portrait the board fits but is modest on a 390px tube; a camera that eases toward the cursor
  tile (and the wave ahead) would be the phone answer, and it has to keep the fog in step.
