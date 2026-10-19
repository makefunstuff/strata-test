# 2-runner — polish pass (TST-5)

Harness: `tools/polish.sh <tag> 2-runner` (desktop 960×540, software rasteriser) and
`PHONE=1 tools/polish.sh <tag> 2-runner` (portrait 390×844, touch), plus
`node tools/mobilecheck.mjs 2-runner`. fps is idle / play / game-over and is a floor, not the
frame rate a real GPU gets; the game-over frame is the game's own `crash()` through
`window.arcade`, not a staged screen.

Frames: `shots/before-*.jpg` (as merged), `shots/r4-*.jpg` (after), `shots/phone-after-*.jpg`
(portrait), `shots/mobile-play.jpg` (the phone check driving it with real touch),
`shots/bug-greywash-play.jpg` (a bug caught by looking — see the end).

## Round 0 — the shared kit

The CRT regrade, the HUD card, the hot-filament sparks and the screen flash (all five games;
the details and the frame-rate lesson from the blinking HUD are in `1-breakout/POLISH.md`).

Two runner-specific defects fell out of it:

- **The keyboard legend sat in the middle of the road.** The kit's `.hud-hint` became a fixed
  chip under the attract card, at 56% height — and the runner's `#hint`, which is a line of the
  HUD strip, inherited it. So "SPACE JUMPS · ARROWS CHANGE LANE" was drawn across the play
  field, faint, in perspective over the tarmac. Fixed twice over: `.hud > .hud-hint` stays in
  the strip, and the runner sets `body.playing` while running, which is what hides the attract
  furniture during play in all five games.
- **The attract card is not for the run**, only for the attract screen (same rule).

## Round 1 — the picture

The frame was a **flat daytime wash**: a teal sky band, grey asphalt, obstacles that all read
the same, and the runner itself lost in a white smear. The cause was not one thing: the fog
colour was a light blue-grey (`0x2f5780`), the sky texture's horizon was `#8fc4ef`, the PMREM
room was at intensity 0.7 and lit the whole ground plane, the key light was 1.5 warm-white, and
the runner carried a point light at 4 plus twelve additive trail dots at 0.9.

- **Dusk, not noon.** Fog `0x2f5780 → 0x10203a`, sky `#16324f/#070d16/#8fc4ef → #0a1428/#04070e/#2c4f78`,
  env 0.7 → 0.35, hemisphere 0.55 → 0.35, key 1.5 → 1.15 and warmer, rim 1.0 → 1.6 and cyan.
  The neon the kit already draws (cyan edges, magenta lane lines, amber pylon caps, red/amber
  hazard stripes) only reads when the room around it is dark: the frame went from "washed" to
  "arcade" without adding a single new object.
- **A city on the horizon.** 90 instanced towers plus 90 additive window planes, two draw
  calls, no per-frame work, and a low sun disc in the haze band. The horizon band used to be a
  gradient; now the road runs *to* somewhere, and the eye has a fixed thing to measure speed
  against.
- **Hazard bands on the road**, in the obstacle's own colour: red for a crate (dodge), amber for
  a hurdle (jump). At speed the block is a blur in the fog; the band on the tarmac is what the
  player reads, and it makes the two kinds unmistakable before they are close. This is the
  single biggest playability gain of the pass.
- **The runner stopped being a smear**: lamp 4 → 2.2, trail base opacity 0.9 → 0.5, so the
  chrome body, the visor and the swinging limbs are visible.
- Exposure 1.06 → 1.12 with the bloom threshold 0.85 → 0.9: the neon gains, the wash does not.
- A screen flash on the crash, in the colour of what was hit.

## Round 2 — the horizon

The ground's far edge ended on a hard line where the plane met the sky band. Fog 22/96 →
20/74, so the tarmac dissolves into the haze colour before the seam, and the ground's emissive
0.18 → 0.12 (the near field was the brightest thing in the frame, which is the opposite of what
a night road does).

**The first version of this round deleted the skyline.** Moving the fog to 74 put the towers
(z −150…−242) entirely inside it, so they vanished; the shot looked emptier than before. The
towers and their windows are `fog: false` now — the skyline is meant to be *at* the horizon,
outside the fog, a silhouette, which is what the eye expects.

fps 11 / 10.5 / 10.7 → **11 / 12 / 12**. The frame rate went *up*: the darker palette lights
fewer pixels through the bloom.

## Mobile round — phone support

- Chips: ◀ ▶ (hold to steer, they push the arrows), **jump** (a tap on Space, the accent chip),
  R. On a phone a lane change and a jump are one gesture each, and the game's keydown path is
  the only input path.
- Portrait: three's fov is vertical, so a tall viewport crops the three lanes off the sides.
  `camera.portraitFit` is applied to the chase camera's fov every frame (×1.34 in portrait),
  which keeps all three lanes and the horizon in frame.
- Quality: DPR cap, bloom, CRT overrides and the watchdog from `shared/mobile.js`.

fps on a portrait phone viewport (DPR 1, software): **15.5 / 16.5 / 16**.
`node tools/mobilecheck.mjs 2-runner` → 4 chips, all four reaching the game's keydown listener
(`ArrowLeft, Space, ArrowRight, KeyR`), a held ◀ chip moves the runner x 0 → −2.2 measured while
the finger is down, no page scroll, 0 console errors. Portrait frame: `shots/phone-after-play.jpg`.

## Visual rating

| | before | after |
|---|---|---|
| desktop | 3/5 — a grey daytime wash, the runner lost in its own light, the horizon a gradient | 4.5/5 — a night motorway with a city ahead, neon that reads, hazards signalled on the road |
| phone | 0/5 — no touch controls, lanes cropped out of frame | 4/5 — lanes fit, chips drive the game, HUD fits |

## Open

- No real shadows in this game (the runner's contact shadow only). A shadow map for the
  obstacles would help them sit on the road; on the software rasteriser it costs more than the
  budget the task allows, so it is the first thing to try on a GPU.
- The sun disc sits behind the skyline and is mostly hidden; moving it to a clear gap, or
  lowering it, is a five-minute change that a screenshot will judge.
- The game-over panel is the shared card over a frozen frame; a slow-motion crash (the update
  loop already decelerates) would be the natural round 3.
