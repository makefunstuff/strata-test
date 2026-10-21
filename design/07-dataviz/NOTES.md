# 07 · Data visualisation — **Harrow Estuary, 1994–2024**

## The brief

One subject, several chart types, drawn honestly: labelled axes, units, a
colour-blind-safe palette, tooltips, keyboard access, a summary table, states,
and print.

## What is built

`index.html` + `styles.css` + `data.js` + `charts.js`. **No chart library**: the
kit in `charts.js` is linear scales, generated ticks, axes, line/area/box/stack/
slope/heat-map marks, one shared tooltip, one keyboard cursor, and a table built
from the same array as the marks.

Six figures, in one argument:

| | figure | why this mark |
|---|---|---|
| 01 | spring-tide maxima, 31 years, one line | a line for a series with an order; the datum step annotated where it happens |
| 02 | twelve gauges, 60 days, small multiples | twelve series at one scale so a surge *travelling up the estuary* is visible; one crosshair column, one readout strip |
| 03 | daily maxima by month, box plots + raw points | the box summarises, the points are the evidence; the box is drawn on top of them, not instead of them |
| 04 | hours above each height band, stacked area | a stack is only honest when the parts add up — hours do, so the top edge is a real total |
| 05 | 1-in-50 level for nine places, 1994 → 2024, slope chart | two columns and one line per place, sorted by rise: the order is the argument, and every value is printed |
| 06 | every day of 2024, a calendar heat map | the question at the quays is *which days*, not the annual mean |

The spine is a **datum change**: in 2011 the gauges move from Ordnance Datum to
Chart Datum and the series falls 28 cm in one year. The trend line is fitted and
drawn on the Chart Datum segment only (+25 cm a decade), and the fit *across*
the join (+1.5 cm a decade) is kept on the page as the mistake.

Then two sections that argue about the craft: **how to read this** (the baseline,
the unit on the axis, colour never alone, hover as a convenience) and **what
these charts do not say** (the numbers are invented; two gauges lost 41 of 60
days and the lines break at the hole; one year is not a trend; the 1-in-50
levels are modelled from the same series, not independent of it). And **four
ways this page could have lied**, drawn: bars from the series minimum, a pie of
a time series, twin axes chosen to agree, and a rainbow with an arrow and no unit.

## The parts that are decisions, not decoration

- **The prose carries no numbers of its own.** The three callouts read
  "+25 cm a decade", "−28 cm", the peak year, "8 of 31 years are storm years" —
  every one is filled from the arrays the chart draws, so the sentence cannot
  disagree with the pixels. (In round 1 four of them did.)
- **A gap is drawn as a gap.** Salt Pits and Mudmere lost 41 of the 60 days; the
  small-multiple lines break, the readout prints `—` and marks the gauge dark,
  and the table counts the missing days. The peak listed for those two is the
  highest *recorded* day, and the caveats say so.
- **Twelve series do not fit in a tooltip.** Section 02 has a readout strip
  above the grid — twelve code/value pairs, over-line values in red with a
  triangle, `role="status"`, updated by the same code as the crosshair.
- **Colour never carries alone.** The palette is Okabe–Ito-derived; every series
  in the stack is labelled inside its band where there is room; the calendar's
  over-line days are ringed *and* counted in words ("4 of 366"); the flood line
  is labelled at its right end.
- **Units are a control, not a caption** — metres/feet re-renders every axis,
  tooltip, table, band label and decade slope (cm → in), and the y margins grow
  for the wider labels.
- **Every figure has its numbers**, in a table generated from the same array.
  In chart mode the tables are in the DOM and clipped; in numbers mode they are
  on the page.
- **Keyboard is the same code path as the pointer**: `Tab` into a chart, `←` `→`
  walk the series, `Home`/`End` jump, `PageUp`/`PageDown` step, `Esc` clears; the
  spoken value in the live region is the painted value.
- **Print** gives one figure per page, unhides every table, and removes the
  control bar and the tooltip layer.

## Self-critique: round 1 → round 2

| What the screenshots showed | Fix |
|---|---|
| Every screenshot came out **unstyled**: black-filled areas, no axis text, tables visible, no contrast findings. No console error, no failed request | The favicon's data-URI `href` had **no closing quote**, so the attribute swallowed the newline and the next tag: the DOM had `LINK(icon)` + `SCRIPT` and no stylesheet, which was never requested. Fixed the link; the harness now fails a shot whose `<link rel=stylesheet>` has no `sheet` (`CSS-MISSING`), and an attribute-quote lint runs over every page in the gallery |
| No SVG text at all, and every area path filled solid black | A helper's argument order: `el(tag, attrs, parent)` against call sites written `(parent, tag, attrs)`. Text nodes were created and thrown away. `el` now accepts both forms |
| The page grew to **37 572 px** tall and the phone shot to 43 415 px | Every redraw appended a second copy of each table, and the growing page fed a `ResizeObserver` that redrew. Tables are cleared on redraw; the observer only reacts to width changes |
| The phone page **scrolled sideways** (477 px at 390) | The sr-only pattern applied to a `<table>`: a table box cannot be squeezed to 1 px, so the six hidden tables widened the root scroller. The clip moved to the wrapper. The harness now measures `scrollWidth − innerWidth` on every shot |
| A twelve-row tooltip covered the grid it explained | A readout strip above the grid: all twelve at once, over-line values flagged, `—` for missing days |
| Cell labels collided inside 245 px cells ("29 NovCL") | One label per cell: the code and its peak day on one line |
| Section shots put the sticky control bar **over the figure caption** | `reveal:` honours the page's `scroll-margin-top`, then clears any full-width sticky bar |
| The callouts claimed **+31 cm fitted**, "1.0 cm a year on the CD segment" and **eight** storm years; the data fits 1.5 cm a decade across the record, 25 cm a decade on the CD segment, and 2 storm years. The lede said the trend was fitted on the CD segment; it was fitted across the datum change. A caveat described a "2016 gauge gap" that did not exist | Trend fitted and drawn on the CD segment, the across-the-join fit kept as the counter-example; the spike rate raised to a real 8/31; the gauge gap implemented as 41 null days with a visible break; the callout numbers generated from the data |
| The small multiples' y ticks were 3, the trend label read `+0.1 cm/decade` (a factor of 100 out) | Tick counts raised, and the slope label converts per-year display units to cm (×1000) or in (×120) per decade |
| In feet mode the axis labels touched the plot edge | y margins grow to 56 px for the wider labels |
| The calendar showed 0 days over the flood line, so the figure asked a question it could not answer | The generator's amplitude raised; 4 of 366 days over the line, ringed and counted |
| Hover states vanished in captures | The one-pixel scroll nudge (added for task 06's paint skip) fires `pointerleave`; state-driven shots now drive the cursor directly (`__cursor.set(i)`, `__hover(i)`) |

Final run: **17 shots, 0 console/page/network errors, 0 low-contrast findings,
0 unlabelled controls, no missing stylesheets, no sideways overflow** — desktop,
feet mode, numbers mode, reduced motion, phone (390 px) and print.

## What is still weak

- **Keyboard covers four of six figures.** The small multiples and the calendar
  are pointer-only; a 366-cell grid deserves a "jump to month" control, and the
  twelve-series readout needs a keyboard owner. `__cursor`/`__hover` are debug
  hooks in shipped code.
- **The tables are complete except one**: the calendar figure gives per-month
  counts, not every day of the year.
- **No cross-figure selection**: picking a gauge in section 02 does not filter
  section 03, so the page is six figures and not one interface.
- The thin top band of the stack is unlabelled in most months (no leader line
  when a band is under 15 px), and the sequential calendar ramp is single-hue —
  a greyscale check is implied, not run.
- **The four lies are drawings of tricks, not this data redrawn by a toggle.**
  A "show me the dishonest version of this chart" control would be the stronger
  device.
- The gauge gap is shown by the break and the readout, with no note in the chart
  naming the outage and its dates.
- No forced-colours pass, no screen-reader walkthrough, and the print sheet's
  readout strip is unverified.
- The 1-in-50 series in section 05 is modelled from the same generator, which the
  caveats say, and which a reader may still take as independent evidence.

## Ratings

| axis | /5 | why |
|---|---|---|
| Visual quality | 4 | Source Serif against tabular mono, hairline rules, one teal and one signal red: it reads like a serious local paper's data desk. The kicker band and the callout row are plainer than the figures deserve |
| Layout & hierarchy | 4 | Six figures with ledes that argue, a sticky control row, callouts, two prose panels and a counter-example grid; the section ledes run wide (68 ch) and the caption–chart–table stack repeats itself down a 5 000 px page |
| Consistency | 4 | One kit for six charts: the same ticks, the same tooltip, the same cursor, the same table, the same flood line wherever it appears; the "four lies" panel is deliberately outside the system, and its mini charts are hand-built rather than kit-built |
| Accessibility | 4 | Contrast measured clean; keyboard cursor with a live region on four figures; numbers for every figure; colour never alone; print. No screen-reader pass, and two figures are pointer-only |
| Originality | 5 | A datum change as the spine; the dishonest fit kept on the page as a counter-example; a gap drawn as a gap; "the same data, badly" drawn four ways; the caveats panel naming what the charts cannot support |
