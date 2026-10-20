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
