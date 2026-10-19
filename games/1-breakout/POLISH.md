# 1-breakout — polish pass (TST-5)

Harness for every round: `tools/polish.sh <tag> 1-breakout` (desktop 960×540, software
rendering) and `PHONE=1 tools/polish.sh <tag> 1-breakout` (portrait 390×844, touch), plus
`node tools/mobilecheck.mjs 1-breakout`. fps is idle / play / game-over, measured on
SwiftShader beside the model server, so it is a floor, not the frame rate a real GPU gets.
fps is compared round to round on the same machine, same build, one browser at a time.

Screenshots: `shots/` — `before-*` is TST-4 as merged, `after-*` is this pass on desktop,
`phone-after-*` is the phone in portrait, `mobile-{play,drag}.jpg` is the phone check driving
the game with a real touch tap and drag, `bug-greywash-*` is a bug caught by looking (below).

## Round 0 — the shared kit (this round is in all five games)

What changed (shared/crt.js, shared/hud.css, shared/effects.js):

- **Colour grade in the CRT pass.** The grille and the scanlines multiply the picture flat, so
  the arcade look had turned muddy and the neon pastel. The pass now ends with saturation, a
  gentle contrast S-curve and a small lift in the blacks (a lit tube never shows true black).
- **Preset tuning**: grain, aperture grille and scanline depth down, gain back up.
- **The attract line is a card**, not bare blinking text over the playfield: dark panel, neon
  edge, one eased pop. The hint is a chip under it. The game-over panel fades in. A stat that
  changes pops (`.value.pop`).
- **Sparks are hot filaments** — white at birth, their own colour as they die, alpha on a
  curve instead of a linear fade.
- **A screen flash** (`createScreenFlash`): a DOM tint under the glass that pops on an impact
  and decays; out of the layer tree between hits.

fps: 9.5 / 8.5 → 6.5 / 6.0 — **a 30% loss, and it was the HUD.** A continuous `ease-in-out`
opacity animation on the attract chip, in a page whose HUD and glass layers are blended, makes
the whole tube recomposite every frame. Back to `steps(2)` (the arcade blink) and the frame
rate came straight back. Lesson kept in a comment in hud.css.

**What did not work — `shots/bug-greywash-*.jpg`.** The new grade declared
`uniform float uSat, uContrast, uLift` in GLSL and I set them in the presets, but never added
them to `CRTShader.uniforms`. WebGL defaults a missing uniform to 0, so `mix(vec3(lum), col,
0.0)` made the picture the luminance and the S-curve pinned it at mid-grey: every frame in the
next four sweeps was a white tube with scanlines on it, with **zero console output**. Four
rounds of "improvements" were measured on a grey screen, and the fps gain of the grey screen
(fewer lit pixels) was read as a win. Caught by looking at a phone screenshot and disabling
passes one at a time. `attachCRT` now diffs the uniforms declared in GLSL against the
uniforms the material provides and warns. That is the check that was missing.

## Round 1 — the game

The start screen and the play screen were dark, washed and flat: a black floor, bricks that
all read as the same off-white, a paddle floating in a halo, a ball trail like smoke, and 40%
of the tube as empty black.

- **Bricks**: the palette was pastel (`#ff5d5d`, `#ffe066`…) under a key light at 2.3 and a
  metalness of 0.35 — every row blew out to the same colour. Deep chroma bases, metalness 0.1,
  emissive at 0.5: the colour is the brick's own, the rows are distinguishable, and the shatter
  (which colours its instances per row) now matches the brick it came from.
- **Floor**: the grid is emissive, and it is emissive on **a black plate with glowing lines**.
  Re-using the albedo grid as the emissive map made the whole floor a light source. Also a
  light pool on the floor, and less roughness so the plate reads as polished.
- **Room**: lit skirts at the foot of the side walls, so the wall meets the floor with a seam
  and the cabinet sits in a room, not in a void. The apron is a quarter smaller, anisotropically
  filtered (a tiled grid at a grazing angle moirés into bright bands).
- **Paddle**: contact shadow (it sits on the floor, it does not float over its own glow), neon
  outline on both long edges, a brighter core strip.
- **Ball**: halo a third smaller, trail tighter and brighter (14 dots, white for the first
  three) — it reads as a path now, not as smoke.
- **Danger line**: one glowing band, a radial wash and chevrons pointing at it, replacing nine
  identical ticks that read as loose change.
- **Post**: exposure 0.98 → 1.08, bloom threshold 0.92 → 0.82, strength 0.5 → 0.62.
- **Camera**: distance fitted to 0.985 of the field box (was 1.03), and on the start and end
  screens a slow yaw drift, so the attract frame is never frozen. In play the aim is exact.
- **Feel**: a screen flash on a brick (small, warm), on a ball lost (red, big) and on the win;
  the HUD score pops on every brick.
- **HUD**: the attract card is hidden while playing (it sat over the field).

fps 9.5 / 8.5 (TST-4) → **9.0 / 8.5 / 8.7**. No frame rate paid for it.

## Mobile round — phone support (this round is in all five games, in its own shape)

- `shared/mobile.js`: touch and phone detection, a quality preset (DPR cap 2 → 1.5 on a phone,
  bloom scale 0.5 → 0.34, shadow map 1024 → 512, particle pools ×0.55, CRT uniform overrides
  that drop the four-tap phosphor bleed, the rolling beam, the grain and the flicker while
  keeping curvature, scanlines, grille and tube edge), and a frame-time watchdog: below
  45 fps for 2.5 s the shadow map and the bloom are switched off, once.
- `shared/touch.js`, `shared/touch.css`: a **drag-anywhere surface** (drag to slide the paddle,
  tap to serve) and three chips (◀ serve ▶). The controls synthesise the keyboard events the
  game already handles, so there is one input path, not two. The paddle is driven through the
  same axis the arrows use, by comparing the finger's screen x with the paddle's projected
  screen x, so the feel is identical on both.
- Layout: viewport meta with `viewport-fit=cover` and no zoom, `touch-action: none`,
  `overscroll-behavior: none`, safe-area padding, a compact two-row HUD under 760px/560px, the
  drawn cabinet turned off on phones, and the keyboard legend replaced by the control layer
  (`body.touch .hud-controls { display: none }`).
- Portrait camera: a steeper pitch (64° → 70°) and a capped distance, so the field is not a
  stamp in the middle of a foggy apron.

fps on a phone-sized portrait viewport, DPR 1, software: **11.5 / 11 / 10.7**.
`node tools/mobilecheck.mjs 1-breakout` → tap takes the game from `start` to `play`, a drag
moves the paddle (x 0 → −3.15), 3 chips, control layer present, no page scroll, 0 console
errors. Portrait shots: `shots/phone-after-*.jpg`, `shots/mobile-*.jpg`.

## Visual rating

| | before | after |
|---|---|---|
| desktop | 3.5/5 — the room was black, the rows of bricks one washed colour, the paddle a halo, the tube 40% empty | 4.5/5 — neon reads as neon, the field is grounded by a lit grid and a contact shadow, hits flash and the debris is coloured |
| phone | 0/5 — no touch controls, a white tube in portrait | 4/5 — portrait composition works, drag and chips drive the game, HUD fits |

## Open

- The side bands of the tube are still dark and empty in landscape; the fit is depth-driven,
  so a wide viewport wastes the sides. Filling them (a lit apron pattern, side cabinets) is the
  next round.
- The vignette shows banding in the dark corners; a grain/dither was raised from 0.012 to
  0.018, which helps, and a dither in the shader (not grain) would fix it properly.
