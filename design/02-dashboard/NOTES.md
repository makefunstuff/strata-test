# 02 — Dashboard: Gridwatch, depot load control tower

## The brief

A 24-hour operations dashboard: energy load, cost, efficiency, fleet readiness, plus a
depot table and filters. Densely populated with realistic data, and it must stay usable
on a phone.

## The product

**Gridwatch** — the control tower for a 532-bus electric bus fleet across six London-area
depots. The screen answers the one question a duty controller has at 19:00: *are we going
to breach the contract ceiling tonight, and who is not charge-ready for 05:00?*

Fictional. Depot names, codes and numbers are invented; the data is generated from a seed
(`data.js`) so every render is the same, which makes the screenshots reviewable.

## What is built

`index.html` + `styles.css` + `data.js` + `app.js`. One page, no chart library, no build
step — every chart is hand-drawn SVG built from the data module.

**Layout.** Sidebar (nav, day range, depot checkboxes, peak-sites shortcut, search,
account) → top bar (title, live state, compare-range select, export, theme) → five KPI
cards with 7-day sparklines → stacked 24-hour load chart + power-source donut → kWh/km
by depot against target + alert log → depot status table → provenance footer.

**Charts, all live.**
- *Stacked area, 24 h, per depot*: bands, gridlines, peak line with a value, an annotated
  anomaly ("bank 3 offline 19:00") whose marker sits at the real point, and a hover
  crosshair with a per-depot kW tooltip. The viewBox is measured from the container at
  draw time and redrawn by a `ResizeObserver`, so the chart fills its card at any width.
- *Donut*: grid import / on-site solar / battery discharge, with the MWh behind each share
  written out in the key (a donut that only shows percentages is decoration).
- *Bars*: kWh per km per depot, target line at 1.24, plus a tick for last week's value.
- *Sparklines*: 7-day trend in every KPI, and a 7-day trace in each table row.

**Interactions.**
- Depot checkboxes and the chart legend are one control, in both directions: untick WFP and
  the band leaves the stack, the tooltip, the table and the row count together.
- Day range (today / yesterday / 7 days) re-scales the KPIs, the area chart (24 points →
  7 daily points) and the sparklines.
- Sort by any column (`aria-sort`, the header shows ↑/↓, the sort is announced under the
  title); search filters depot, circuit and asset text; "peak sites only" and "select all"
  presets; a reset that returns everything and says so in a toast.
- Density toggle (comfortable / compact rows), CSV export (toast + a copy-to-clipboard of
  the filtered rows), theme toggle persisted to `localStorage`.
- Empty state: an unplugged-cable drawing, a sentence that explains *why* it is empty
  (all depots unchecked vs. the term "hall" matching nothing) and a reset button.

**Responsive.** 1440 → sidebar + two-up charts; 1280 → charts stack, KPIs 3-up;
1080 → the sidebar becomes an off-canvas drawer with a scrim, a close button, Escape and
tap-outside to dismiss, and the long "live · last sample · ceiling · band" string collapses
to "live"; 720 → KPIs 2-up, the depot table becomes one card per depot with
`data-label` pseudo-headers; 430 → KPIs 1-up.

**Accessibility.** Landmarks (aside/nav/header/main/footer), one h1, skip link, labelled
controls, `fieldset/legend` for both filter groups, `aria-pressed` on every toggle,
`aria-sort` on headers, `role="status"` on the toast, `aria-live` on the row count,
charts carry `role="img"` labels and the numbers they depict are in the table. Focus ring
is a 2 px teal outline with offset. Both themes were tuned so every text/background pair
in the audit clears 4.5:1 — the signal colours were darkened in light (teal #0a6f62,
amber #7d5606, blue #2a5aa8, red #a63a2c) and lightened in dark (#3ad0b8, #e8b45c,
#8ab8f2, #f08b7c), and the chart annotations get a paper-coloured halo via `paint-order`
so they stay legible over the bands.

## Round 1 → round 2 (self-critique from the screenshots)

Round 1: 12 shots, **12 with problems** — a module-scope ordering bug (`setTheme` ran
before the day data existed) killed the script; 12 contrast findings; the area chart
was letterboxed inside its card; the KPI sparklines sat on top of the delta text.

Fixes made after looking:
1. **Theme init order** — the stored theme is applied by setting the attribute, not by the
   redraw function; the charts are drawn once, after the data exists. 12 → 0 errors.
2. **Chart width** — the SVG was `980 × 268` with `width:100%`, so `preserveAspectRatio`
   letterboxed it and left a 25 % hole in the card. The viewBox is now measured from the
   live container and redrawn on resize; the plot fills the card at every width.
3. **KPI cards** — the sparkline moved from an absolute overlay (it collided with the
   delta copy) into its own row pinned to the bottom of a flex column, so all five cards
   share a baseline.
4. **Annotation collisions** — "peak 7.8 MW" and "bank 3 offline 19:00" sat on top of each
   other at 19:00; the peak label now hangs left of the peak line, the anomaly label sits
   below-left of its marker, both with a halo.
5. **Contrast** — 12 findings in light theme: teal/amber/blue/red chips at 3.5–4.2:1. All
   four signal colours re-picked against their soft backgrounds, all pairs now ≥ 5:1.
6. **`hidden` was a lie** — `.empty { display: grid }` overrode the UA `[hidden]` rule, so
   the "no depots match" card was showing underneath six real depots. `[hidden] { display:
   none !important }` fixes that class of bug for the whole file.
7. **Phone top bar** — title + 3 buttons + a 60-character status string wrapped into a
   mess. Buttons on one row, title below, long status string hidden on phones.
8. **Phone table** — the row cards spread label/value/de-nominator across the full width
   (three flex children), the state-of-charge bar collapsed to zero width, and the fill was
   an inline span. Values are right-aligned against an auto-margin label; `.soc` is 100 %
   wide; `.fill` is a block.
9. **Screenshot artefact** — `backdrop-filter: blur(10px)` on the sticky bar painted a black
   band in headless captures (and is a per-frame cost); the bar is a solid panel now.
10. **Density** — the compact mode hides the sparkline column, and the row cards keep the
    note under the depot name rather than adding a tenth column.

## What is still weak

- Only the area chart has a hover layer. The donut and bars are read-only; their numbers
  are in the key and the table, which is honest, but a controller who wants "BRP, last
  Thursday, by circuit" has nowhere to go.
- The sidebar nav is a single page's worth of anchors; Depots/Circuits/Reports are honest
  stubs, not screens.
- The table is ten columns wide at 1440 px. Below ~900 px it scrolls horizontally before it
  becomes cards, which is the ugly middle band of widths.
- The donut is the weakest chart here: three shares would be clearer as a stacked bar. It
  stayed a ring because "share of supply" is a known dashboard idiom, and the MWh values
  are written next to it.
- No keyboard path into the charts (the crosshair is pointer-only); the data it exposes is
  all present in the table, which is the reason it is acceptable and not the reason it is
  good.
- No real data pipeline: the series are seeded and shaped by hand, so the "19:10 peak" is
  authored, not measured.
- KPI sparklines have no axis and no units in the trace; a reader has to trust the delta
  text next to them.

## Ratings

| | | why
| --- | --- | ---
| Visual quality | **4** | the type/number pairing (Space Grotesk + IBM Plex Mono tabular
  figures) does the work; the charts have real annotations; the sidebar is dense without
  being grey mush; nothing looks like a template.
| Layout / hierarchy | **4** | the eye lands on the five KPIs, then the peak, then the
  table; the grid is disciplined and the drawer/phone layouts are designed, not patched.
  Loses a point on the 900–1200 px band where the table scrolls and on the empty vertical
  space in the alerts card.
| Consistency | **4** | one token set, two themes, every control reuses the same chip and
  pill vocabulary; the depot colours are the same in the legend, chart, checkboxes and
  table.
| Accessibility | **4** | audit clean (0 contrast findings, 0 unlabelled controls, landmarks,
  `aria-sort`/`aria-pressed`/`aria-live`), keyboard-reachable controls, both themes pass.
  Loses a point for pointer-only chart exploration.
| Originality | **3** | a control-room layout with a point of view (annotated peak,
  provenance footer, depot codes as the user's own, the unplugged-cable empty state) —
  inside a well-known dashboard genre, not a new one.

---

# Round 2 — the instrument panel

## What was said, and what was actually wrong with it

The folder's human verdict on the eleven demos was *"boring"* and *"AI sloppy"*. That is a
taste judgement, and taste judgements are not actionable, so this round started by naming
what a viewer is reacting to in this specific page:

- **Five identical KPI cards.** Equal size, equal treatment, five numbers competing. A
  control-room screen knows what to read first; this one did not.
- **A rainbow stack.** Six depots carrying one quantity (kW) were painted in six unrelated
  hues. The hues carried no order and no meaning, so the reader compares colours — the
  measured weak point below is 1.07:1 between neighbouring bands, i.e. the same grey twice.
- **A donut for three categories** where the interesting fact is the split of one total.
- **Card soup.** Drop-shadowed rounded boxes at every level, so nothing in the page was
  one surface.
- **One grotesque font doing everything**, including the numerals.
- The layout was a SaaS template wearing a bus-fleet costume. The subject is a **depot
  control tower**, and control towers are instrument panels: fields, rules, references,
  marks — not cards.

## What changed

**One ground, one panel, one recessed field.** Depth is carried by lightness and hairline
rules; a single elevation token is reserved for floating layers (tooltip, drawer, toast).
The rail is now one instrument strip with a recessed field for the primary readout, and a
dominant/secondary type ratio: the eye lands on 412.6 MWh, then the delta, then the rest.

**Two typefaces with jobs.** Archivo for the UI, IBM Plex Mono for anything that is a
number, a code, a timestamp, a unit or an axis tick. Labels are small mono capitals with
tracking, the way a panel labels a channel.

**Colour is semantic, not decorative.** One sequential ramp for the depot series, ordered
by size; the accent (teal) only on interactive state; ok/warn/fault/info only where a
state is meant; amber for the contract ceiling, coral for the over-target caps. Red is
never used on a bar that is not over target — the previous bars carried red in their
ramp for no reason.

**Charts that can be read against something.** The stacked area became stacked hourly
columns with the contract ceiling drawn as a labelled reference, a y axis, a total line,
an annotated peak and the "bank 3 offline 19:00" marker on the real point. The donut
became a 100 % part–whole bar, because three parts of one total is a bar, and the bar
shows the shares at a glance without a key hunt. The kWh/km bars got a target baseline
axis; the in-chart target label that collided with the bar values is gone.

**A comparison that compares.** The header's `compare:` select drew nothing at all: pick
"Saturday", the page redrew identically. It is wired now — the comparison day is drawn as
a dashed ghost curve, enters the tooltip, and the chart meta quotes the delta.

## Bugs this round turned up (all of them pre-existing)

1. **The page quoted a peak that its own chart did not draw.** Headline, figcaption and
   the chart's `aria-label` all said *7.82 MW at 19:10*. The seeded series peaks at
   **6.35 MW at 18:00**. A screen whose accessibility text describes a peak that is not on
   the chart is not a rounding error; a controller reading the aria label and a controller
   reading the chart are being told different things. The metrics, alerts, copy and
   aria-label now agree, and the ceiling (8.03 MW) and headroom (1.68 MW) are computed
   from the drawn series, so the numbers cannot drift from the picture again.
2. **The compare control was a lie** (above).
3. **The phone header spilled.** The sticky bar is fixed-height and translucent; at 390 px
   the wrapped title drew over the page content below it. It grows, and is opaque on phone.
4. **The Filters button clipped.** `.iconbtn { width: 30px }` won over the phone-only
   button that carries a label.
5. **Dark theme's selected day was a hole.** A near-white pressed button on a dark bar.
   The selected state now uses the accent in dark, ink in light.
6. **The first data ramp failed its own contrast budget.** Solved for the two constraints
   it must satisfy at once (see the measurement below), the ramp is `--d1…--d6` at
   ≥ 4.6:1 (light) and ≥ 3.0:1 (dark) against the panel, with every neighbouring pair
   ≥ 1.15:1 apart.
7. **…and it was inverted in dark.** Ordered like the light ramp, the biggest depot was
   the palest band on a dark ground: the measured rank came out −1.00. On a dark ground
   weight is light, so the dark ramp runs the other way.

## The legibility measurement

`node 02-dashboard/measure.mjs [--url <dir>] [--out <file>]` — the folder's per-task
measurement convention, in the browser, from computed fills (with the alpha the page
painted) and the drawn SVG geometry. Run against the previous round by pointing `--url` at
a worktree of the old commit.

| measure | round 1 | round 2 | why |
| --- | --- | --- | ---
| weakest boundary between neighbouring bands | 1.07 (L) · 1.08 (D) | **1.16 (L) · 1.18 (D)** | below ~1.15 the boundary is carried by the separator stroke, not by the colour |
| palest fill against the panel | 2.94 (L) · 3.44 (D) | **4.60 (L) · 3.03 (D)** | WCAG 1.4.11 asks 3:1 for a meaningful graphic object; a stacked band is one |
| greyscale rank (biggest depot = heaviest band) | −0.33 | **1.00 · 1.00** | the chart has to survive print, a monochrome projector and colour-blindness; a rainbow scores whatever |
| primary / secondary KPI type size | 1.00 | **1.43** | five equal cards is 1.00; the page now says what to read first |
| plot ink (data share of the plot box) | — | 0.17 | density |

Audit state after the round: 15 shots, **0 console errors, 0 contrast findings,
0 unlabelled controls, 0 sideways overflow**, both themes, phone included.

## And the liveliness index went *down*

The same instrument, the same eleven wide shots, before and after:

| | round 1 | round 2
| --- | --- | ---
| lively | 56.4 | **53.0**
| colourfulness | 22.9 | 21.5
| hue families (of 12) | 2.2 | **1.0**
| ink coverage | 0.08 | 0.08
| tonal entropy | 0.23 | 0.19
| panel depth | 0.16 | 0.16
| *empty state* | **16** | **49**

So the index that was built to catch "boring" rates this page *less lively* after the
redesign. Read the components and it is not a paradox: the page deliberately gave up hue
variety — six depots carrying one quantity get one sequential ramp, and semantic colour
only where a state is meant — and the index is built out of colourfulness and hue
families. It ranks colour variety; it cannot see that the colour is now doing a job.

Two things it did see, both real: the **empty state went from 16 to 49** (the old empty
page was a strip of dead grey; the new one keeps the rail, the panels and the structure,
so an empty depot selection reads as an instrument at rest, not a broken screen), and
`ink`/`depth` held while the table got denser.

That is the index's first counter-example and it is written into the folder's README:
use it to catch dead frames and to compare pages of the same kind, **not** to grade the
palette of a data-dense UI. The right response to a metric going down is not to paint the
rainbow back: that would be gaming the instrument, which is exactly the failure the folder
accuses the demos of.

## Open defects, still open

- **The energy units do not integrate.** The headline says 412.6 MWh for the day; the
  hourly curve sums to ~67 MWh. They are two authored numbers that were never reconciled,
  and the first version of the comparison curve normalised to the headline and drew a
  curve five times the size of the one it was comparing with (tooltip: 13,072 kW beside
  2,427 kW). The comparison is now normalised by the *ratio* between the two days, so the
  curve, the delta and the rail's "3.1 % vs last Sunday" tell one story. The absolute
  inconsistency is a content bug, not a layout bug, and it is still in the data.
- Chart exploration is pointer-only (no keyboard path to the hour tooltip).
- KPI sparklines still have no axis and no units in the trace.
- 900–1200 px: the table scrolls horizontally; the alerts card has empty vertical space.

## Ratings, round 2

The self-rated axes are the ones the folder already calls useless (every task in the
folder rated itself 4/5 on visual quality, spread over one point), so these are recorded
with the measurement next to them, and the measured axes are in the hub.

| | | why
| --- | --- | ---
| Visual quality | **4** | the instrument-panel system holds: one ground, hairline rules, two typefaces with jobs, semantic colour. Not a 5: the alerts card's whitespace and the sidebar's account block are still generic.
| Layout / hierarchy | **5** | primary readout dominant, one instrument strip, chart references (axis, ceiling, annotations), table rows designed as records on phone. The 900–1200 band is the known weak width.
| Consistency | **5** | one token set, two themes, the ramp ordered per theme, the same chip/pill vocabulary, depot colour identical in legend, chart, checkboxes, table.
| Accessibility | **4** | audit clean in both themes and on phone, 0 findings; the chart's aria text now agrees with the drawing (it did not). Loses a point for pointer-only chart exploration.
| Originality | **4** | the *genre* is still a dashboard. What is new is the treatment: a control tower that reads as panels, a ceiling line the whole page is measured against, depot codes as the operator's vocabulary.
