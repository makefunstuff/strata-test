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

---

# Round 2 — the hero's numbers, asked what they draw

## What the page was

The task's measured row is the hero: **40 liveliness, 13.5 colourfulness, 1 hue family**. The page's
own ratings named the rest: *"Feature cards, quote band and footer are competent but ordinary"*, and
*"the hero's left column runs out before the map's height, leaving a soft gap"*.

Then the reading found something the ratings did not. The page's claim to originality is a hero drawn
from one elevation field — *"so the contours, the profile and the spot heights always agree"*. The
field agrees with itself. The **sentences around it did not**:

| quoted on the page | what the sheet's own drawing says |
| --- | --- |
| route, **11.4 km** (legend, and the profile plate's `PROFILE · 11.4 KM`) | the route path's own `getTotalLength()` is 680 user units; the scale bar is 180 units = 2 km → **7.6 km** |
| `+640 M` of gain | the field's 64 samples gain **551 m** |
| summit **812 m** (label, and the SVG's `aria-label`) | the field at the summit marker's apex is **860 m** |
| the col **640 m** | **573 m** at the label's position |
| car park **210 m** | **309 m** at the route's first point |

A 50 % overstatement of the walk, in the legend, in the plate, and in the `aria-label` a screen
reader reads. The folder's audit cannot see this: it compares text against colour, and it never asks
a drawing what it draws. The numbers were typed by a person writing marketing, and the drawing was
generated, and nothing between them checked the arithmetic.

**The fix is derivation, not editing.** `terrain-boot.js` now computes the distance from the drawn
route and the drawn scale bar, and the heights from the field at each marker's own position, and
prints them into the labels, the plate, the legend, the caption and the `aria-label`. The honest
number is *smaller* than the marketing number — 7.6 km, not 11.4 — and the sheet is the authority, so
the marketing number moved. `01-landing/measure.mjs` refuses any drift from now on.

## What is built

- **The route, at hero scale.** The notes' "soft gap" is filled with the subject: the elevation
  profile of the route the sheet draws, on the same **64 field samples** as the plate's strip, with
  the car park and summit heights as labels and the distance and gain in the caption. It is the same
  fact twice, in the same array, not a decoration under a headline.
- **The pack, as a map key.** The section's headline is *"Cartography, not a map tile cache"*, and it
  was six SaaS cards with icons in tinted squares. Six layers are now drawn in the sheet's own hand —
  contour hairlines with an index contour carrying its "500", a region box over ground with its "41",
  a route with the profile it implies, a ridge with its shadow flank and a tide line, a device with
  the route inside and a battery gauge, a printed sheet with its grid, scale bar and fold line. Every
  fragment is `aria-hidden`: the words beside it are the content.
- **The 38 MB is broken into what spends it.** The hero quotes a region size; the key answers it —
  contours 12.4, hillshade 8.6, paths and rights of way 5.9, buildings 3.7, names 2.9, walls and
  fences 2.3, the 1 m terrain model 2.2. One quantity, so **one ramp** (not a rainbow); every number
  is a word as well as a width; the bar itself is `aria-hidden` and carries a `role="img"` label that
  spells the breakdown out; and the percentages are largest-remainder, so the parts make 100 and not
  the 101 the naive rounding printed.
- **`01-landing/measure.mjs`**, the instrument: the drawn route's own length as the ruler, prose
  against field, strip against samples, byte budget against the hero, fragments against the sheet's
  declared stroke family, and the phone.

## The instrument was wrong three times before it was useful

1. `find(/^\d+ m$/)` to read the plate's start label matched the **summit** label first (both are
   "860 m"), so the report claimed the plate said 860 m at the start. The plate's labels are now read
   from the plate's own group.
2. The stroke-family check filtered on the `stroke` **attribute**, and one shape has its stroke set to
   `none` in CSS (the ridge's shadow flank) — so the report showed a stray `1px` that nothing draws.
   The filter reads computed style now, and the family is **0.9, 1.3, 1.7, 3.4**, which is what the
   hero sheet declares.
3. The percentages summed to **101 %**. The key rounds by largest remainder.

## The eleventh harness hole: the tool measured the same frame three times

`01-landing` sets `scroll-behavior: smooth`. `shoot.mjs` neutralises that with a style tag before it
runs a shot's actions; **`liveliness.mjs` did not**. So the manifest's three `eval:` scroll actions
animated, never landed before the shutter, and `hero`, `features` and `fold` measured as the page top
— **three identical published rows** (40 · 13.5 · 0.132 for all three, before and after). The fix is
the same style tag plus a settle. `09-motion` sets smooth scrolling too, so its section rows are
re-measured with this run; the numbers in its notes were taken through the broken path.

The general shape is the folder's recurring one: **the frame you never verify is the claim you never
measure.** A row that is identical to its neighbour is a smell, and the report never said so.

## Liveliness, before and after

Same instrument (with the scroll fix), both trees, the 7 frames the tool takes for this task:

The 7 frames the tool takes for this task (it skips the 390 px shots; the audit covers those), same
instrument, both trees, back to back.

| frame | before | after | |
| --- | --- | --- | --- |
| `hero` | 40 · colour 13.5 · ink 0.132 · tonal 0.32 | **41 · colour 13.8 · ink 0.148 · tonal 0.33** | the profile strip lands in the hero |
| `features` | 34 · colour 7.8 · ink **0.403** · 1 hue | 34 · colour **10.3** · ink 0.097 · **2 hues** | the card wall becomes the key |
| `full` — the whole page | 71 · ink 0.414 | 69 · ink 0.348 | six white cards out, cream ground in |
| `fold`, `pricing-annual`, `faq-open`, `form-error` | 47 · 44 · 70 · 80 | **identical** | untouched sections: the control |
| mean, 7 frames | 55.1 · colour 21.7 · hues 1.43 | 55.0 · colour **22.0** · hues **1.57** | |

**The three new frames** — the instruments themselves: `hero-prof` **58** (colour 23.8),
`pack-bar` **60** (colour 16.8, **4 hue families**), `pack-rows` **34** (ink 0.168, depth 0.26).

Read honestly: **the index does not move** (55.1 → 55.0) and ink falls, because six white cards were
replaced by a key on the page's own cream ground — the same trade `02-dashboard` made, measured the
same way. What moved is colourfulness (`features` 7.8 → 10.3, hue families 1 → 2, the task mean
1.43 → 1.57) and the facts: the route is **7.6 km** in every place it is quoted, the gain is
**551 m**, the byte budget sums to the hero's **38 MB**, the fragments use the sheet's **four** stroke
widths with no strays, and the hero's soft gap carries the route.

If the objective were the number, the cheapest move is a wall of white cards on cream ground. It is
not the objective; the printed-out fact is that the page was overstating its own walk by 50 %.

## Ratings, round 2

| Axis | /5 | Note |
|---|---|---|
| Visual quality | **4.5** | the hero carries a real instrument, the section under it speaks the sheet's language, and the byte bar is the pack's own truth; the quote band and the footer are still ordinary |
| Layout & hierarchy | **4.5** | the notes' soft gap is filled with the subject; the key is two columns of hairline rows, one column at 390 px |
| Consistency | **5** | the fragments use the stroke widths the sheet declares (measured, no strays), and every quoted number is derived from the field, so prose and drawing cannot drift |
| Accessibility | **4.5** | 0 audit findings on 13 shots; the byte bar has a `role="img"` label that states the breakdown; the profile's `aria-label` states distance, gain and heights; the new type is 5.51–15.86:1. Half a point off: no reader walkthrough, no 200 % capture, unchanged |
| Originality | **5** | a landing page that derives its marketing numbers from its own drawing, and ships the instrument that refuses a sentence which drifts |

## Round 2's remaining weak points

- **The byte budget is an estimate presented as a breakdown.** There is no export, no build, no pack:
  the seven numbers sum to the 38 MB the hero claims, and nothing measures them, because the product
  does not exist. The key is internally consistent and externally invented.
- The 7.6 km is derived from a **synthetic elevation field** and the sheet's own scale bar. It is
  arithmetically true and physically fictional: the sheet is not Ordnance Survey data, and the page
  says "Ordnance-Survey-quality", which is a claim about a product, not a measurement.
- The fragments are **hand-drawn**, not generated by the sheet's code. They use the sheet's stroke
  family, and none of them is the sheet.
- The quote band, the pricing block and the footer are untouched — the notes called them ordinary, and
  they remain the least considered part of the page.
- No reader walkthrough, no 200 % text capture, no forced-colours mode: unchanged, and now the
  largest untested surface on the page.
