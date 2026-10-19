# 3-marble-maze — polish pass (TST-5)

Harness: `tools/polish.sh <tag> 3-marble-maze` (desktop 960×540, software rasteriser),
`PHONE=1 tools/polish.sh <tag> 3-marble-maze` (portrait 390×844, touch),
`node tools/mobilecheck.mjs 3-marble-maze`. fps is idle / play / game-over, a floor measured on
the software rasteriser. The end frame is the game's own fall (`warp()` into a hole / the
restart path), not a staged screen.

Frames: `shots/before-*.jpg`, `shots/r4-*.jpg` (after), `shots/phone-after-*.jpg` (portrait),
`shots/mobile-play.jpg`, `shots/bug-greywash-play.jpg` (the shared grade bug, see below).

This game took the shared round, one targeted visual round and the phone round. It is the most
functional of the five (real physics, real sound from real impact velocities) and its picture
needed the least, so the rounds were kept narrow and measured.

## Round 0 — the shared kit

The CRT regrade (saturation, a gentle contrast curve, a small black lift, grain and grille
turned down), the HUD card, the hot-filament sparks and the screen flash — all five games; the
frame-rate lesson (a continuous ease on a blended HUD layer costs ~30% of the frame budget) and
the grey-wash bug are written up in `1-breakout/POLISH.md`.

On this game the grade is what took the board from a flat blue rooftop to a lit object: cyan
grid, amber floor, dark walls and red hole rims separate cleanly, which is the readability the
game needs at a glance.

`shots/bug-greywash-play.jpg` is this game's frame from the four sweeps where the new grade's
uniforms were missing from the material: a white tube with scanlines, no console output.

## Round 1 — the goal beacon

The one visible defect in the frame: **a green streak down the whole left of the tube**. The
goal beacon is a cylinder of light at the goal tile; at the camera's grazing angle a wide
additive column, `toneMapped: false`, at opacity 0.28, is exactly the kind of bright thin
geometry that the bloom latches onto and the CRT's phosphor bleed smears — the goal announced
itself as an artefact across half the picture.

- beacon: radius 0.34 → 0.26 tiles, height 0.9 → 0.62, opacity 0.28 → 0.16, lowered onto the
  board (y 0.45 → 0.31)
- goal pad emissive 1.0 → 0.7, so the goal reads as a place, not as a light source
- `key.shadow.intensity = 0.55` (three r168+): the walls' own shadows at full strength blackened
  the maze floor between them, which is where the player has to read the path. Half strength
  keeps the shape and gives the floor back.

**Dimming it was not enough, and the screenshot said so.** The first pass shrank and dimmed the
beacon (the numbers above) and the streak was still there, just quieter: the column is
`AdditiveBlending` with `toneMapped: false`, so its luminance sits above the bloom threshold
however low its opacity is, and the bloom plus the CRT's phosphor bleed carry it up the tube. The
fix that worked is the blending, not the brightness — normal blending, tone mapped, opacity back
up to 0.34. It is the same shape in the same place, it reads as a goal marker, and the bloom
leaves it alone. Lesson: with a post chain, "make the artefact smaller" is the wrong knob; "make
it not a light source" is the right one.

## Mobile round — phone support

- **A virtual stick** for the tilt: it pushes the arrow keys the board already reads, with a
  dead zone, so a thumb tilt and a key tilt go through the same damped spring. One chip: R.
- Portrait: the camera **pulls back**, by `0.8 x (16/9) / aspect` (capped at 4.2), and the fog
  near/far scale with the same factor. Opening the vertical fov was the first attempt and it is
  the wrong knob: three's fov is vertical, so the horizontal view is `fov x aspect` and a phone's
  narrow aspect crops the maze whatever the vertical fov is — at 52° the board was cropped on both
  sides. Pulling back fits it. The first pull-back frame was then **pure fog with the board gone**,
  because the fog distances are tuned for the desktop camera; fog is a distance, so it moves with
  the camera. `shots/phone-after-play.jpg` is the frame where the whole maze, the stick and the
  chip are all in the tube.
- Quality: DPR cap, bloom scale/strength, shadow map 1024 → 512, CRT overrides, and
  `autoQuality()` dropping the bloom and the shadow map (to 256) if a phone cannot hold 45 fps
  for 2.5 s.
- The keyboard legend and the attract card are hidden while rolling (`body.playing`).

fps on a portrait phone viewport (DPR 1, software): **15 / 15 / 14.7**, double the desktop
number — the tube is a third of the pixels, and at the portrait distance the fog covers the
surround, which is cheap shading.
`node tools/mobilecheck.mjs 3-marble-maze` → the control layer is present, the R chip reaches
the game (`KeyR` in its keydown listener, `STATE ready → rolling`), and a stick swipe is measured
**while the finger is down**: the marble's |velocity.x| moves off zero, by 0.0001–0.004 m/s across
runs. That is the honest size of the signal — the board is a damped spring and the marble starts
from rest, so in the first second of a tilt there is barely any velocity to measure. The check
therefore gates on the state transition (`ready → rolling`, which is what a tilt is for) and
*reports* the steer number instead of demanding an impressive one. No page scroll, 0 console
errors. Portrait frame:
`shots/phone-after-play.jpg`.

## Visual rating

| | before | after |
|---|---|---|
| desktop | 3.5/5 — readable, but a green streak across the tube and a floor blacked out by its own shadows | 4/5 — the board is lit and separated, the goal is a place, the path reads |
| phone | 0/5 — no touch controls, board cropped | 4/5 — the whole board in frame, the stick drives the tilt, HUD fits |

## Open

- In landscape the board occupies the middle of the tube and the sides are empty; the camera fit
  is depth-driven. A closer camera with a steeper pitch, or a table that fills the frame, is the
  next round.
- The beacon is now quiet to the point of being easy to miss at a glance: a slow pulse on the
  decal (not the column) would sell the goal without the bloom smear.
- The fall is scored and sounded, but the camera does not follow the marble over the edge — the
  one animation the game is missing.
