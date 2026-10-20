# 01 · Foldline — web landing page

## Brief

Landing page for a fictional product: hero, features, pricing, footer, responsive.

**Brand invented for it:** *Foldline* — offline survey-grade topographic maps that also print a
paper sheet. The whole page is built around one design idea: **the page is a map sheet**.
Paper ground, ink type, ten-metre contour lines, a route in route-orange, hairline rules,
small radii, Fraunces (display) + Inter (text).

## What is in the folder

| file | what |
|---|---|
| `index.html` | hero, trust bar, 6 features, 3-step "how", quote band + numbers, 3 plans with a monthly/annual switch, FAQ, CTA + newsletter, 4-column footer |
| `styles.css` | tokens (colour, type, spacing, radius, shadow), all sections, 4 breakpoints (1060 / 900 / 640 / 420) |
| `terrain.js` | seeded value-noise elevation field, hypsometric + hillshade painter, marching-squares isolines, segment chaining |
| `terrain-boot.js` | draws the hero sheet: bands, 61 contour levels (10 m interval, 50 m index), spot heights, loch, route, elevation profile of that route, 1 km grid, graticule ticks, compass with magnetic variation, scale bar, sheet plate |
| `app.js` | sticky header, small-screen nav with `aria-expanded`, billing switch, inline newsletter validation, footer year |

No build step, no libraries; fonts are pinned `@fontsource@5.3.0` files from jsDelivr.
The hero map is generated at page load from one elevation field, so the contours, the
profile plate, the spot heights and the peak elevation all describe the same ground.
Copy claims are consistent with the drawing: 10 m contours, 50 m index, summit 812 m,
route 11.4 km, ascent +640 m, car park 210 m.

## Screenshots

`shots/hero.jpg` (1440 desktop hero) · `shots/full.jpg` (whole page) · `shots/features.jpg` ·
`shots/fold.jpg` (the folding diagram) · `shots/pricing-annual.jpg` (annual cycle selected) ·
`shots/faq-open.jpg` · `shots/form-error.jpg` (invalid e-mail, inline error, focus returned) ·
`shots/phone.jpg`, `shots/phone-full.jpg`, `shots/phone-menu.jpg` (nav panel open).

`tools/work/shoot/latest.md` has the run for this task: 10 shots, 0 console/page/network
errors, 0 low-contrast text findings, 0 unlabelled controls, focus ring present.

## Self-critique round (first pass → what was fixed)

The v1 screenshots were overwritten by the second pass, so the before state is described
rather than filed (later tasks keep `shots/v1-*.jpg`).

Weakest points found by looking at the first screenshots:

1. **The hero map rendered as mud.** Five octaves of noise plus a strong hillshade made a
   photographic brown smear; contours were invisible and the 1 km grid read as a chessboard.
   Fixed: 4 octaves of larger features, one gentle ridge, a stronger single summit, relief
   0.5 → 0.22, 20 bands with light paper tones, grid opacity 0.11 → 0.07 with ticks on the frame.
2. **Sheet text was tiny and colliding.** The loch label sat under the legend strip and the
   car park sat in the water. Fixed: labels enlarged (13–24 px), loch label moved inside the
   water, car park moved to the east shore, a profile plate added at the bottom centre away
   from the legend.
3. **The "how it works" diagram was a scribble.** Four repeated zig-zag paths read as a
   child's drawing. Fixed: proper nested contour arcs, a river, the same route carried through
   three folding stages with crease lines and arrows.
4. **A black band above the header on phones** — `html` had no background, so Chromium painted
   the overscroll area black. Fixed: `html { background: var(--paper) }`.
5. **Pricing cards had ragged CTA buttons** and free-plan whitespace. Fixed: plan cards are
   grids with the include list on the `1fr` row, so all three buttons sit on the same line.
6. **Contrast audit hits** (found by the harness, not by eye): footer column headings
   4.14:1 on ink → lightened; the mobile nav's own CTA inherited the nav link colour and was
   dark-on-dark (1.35:1) → given a light colour.

Two harness bugs the same round exposed, worth recording: ES modules are blocked on `file://`
(so the harness now serves `design/` over `127.0.0.1`, like Pages does), and Chromium
serialises `color-mix()` as `color(srgb …)` with 0–1 components, which made the contrast
audit report the light header as black.

## What still looks weak

- The feature grid is the most conventional part: six cards of icon + title + text, which is
  what every landing page does. The map identity is not carried into it (the icons are line
  drawings, not cartographic marks).
- The hero sheet is dense. At phone width it is legible as a texture, not as a map; the
  labels are unreadable below ~500 px.
- The quote band's avatar is initials in a circle — a placeholder, not a design.
- The fold diagram's three stages are schematic: the folded sheets do not show where the
  creases put the summit.
- The annual-plan saving is shown as a "−20 %" chip on the switch only; no price comparison
  line ("was £4") appears in the cards.
- No imagery at all: the page has no photography (by constraint of the exercise, and it shows).

## Ratings

| | /5 | why |
|---|---|---|
| Visual quality | 4 | The hero sheet is a real piece of cartography, generated in the page, and the paper/ink/orange system is coherent end to end. Feature cards, quote band and footer are competent but ordinary. |
| Layout & hierarchy | 4 | Clear section rhythm (paper → rule → paper-3 → ink → paper → moss → ink), one headline per section, pricing on one baseline grid. The hero's left column runs out before the map's height, leaving a soft gap. |
| Consistency | 4.5 | Tokens used throughout; every claim in the copy agrees with the drawing; icon stroke weight, radii and rules are one family. |
| Accessibility | 4 | Harness audit clean: contrast ≥ 4.5:1 on every text run, all controls named, landmarks, `lang`, skip link, visible focus ring, `aria-expanded` nav, labelled FAQ, form errors announced with `aria-invalid` + focus return. Not tested with a real screen reader, and no keyboard-only walkthrough of the whole page. |
| Originality | 4.5 | A landing page whose hero is generated topography with an elevation profile that matches the drawn route is not a template. The sections underneath follow a familiar marketing structure. |
