# 10 · Redesign — a flood portal, and a script that measures both versions

## Brief
Take a deliberately plain/ugly page, keep it in the folder, redesign it, and show
before and after.

## Built
`design/10-redesign/before.html` is the ugly page: the Harrow Estuary Authority
flood & tide portal as found — 11 px grey body text at `#999`, a fixed 960 px
three-column layout, a nine-link nav in capitals, an auto-advancing carousel
above the flood warning, a scrolling ticker, a cookie wall with one button, an
eleven-column tide table with `<td>`s used as headers, seven PDF-only notices,
six sidebar widgets (two of them third-party), positive `tabindex`s, and a
newsletter box sitting between the notices and the FAQ.

`design/10-redesign/after.html` + `after.css` + `after.js` is the redesign of the
same content: the answer first (status panel: area, flood line, window, peak,
four things to do), one reading column at 68ch and a 300 px rail, the tide table
with real headers and the flood line tinted, five notices with a reading copy
beside each PDF, the phone number in the masthead, an address check, no carousel,
no ticker, a refusal-first cookie banner.

`design/10-redesign/index.html` + `case.js` is the case study: **one measurement
function run over both pages on every load** (four hidden iframes: both pages at
1 400 px and at 390 px), a 15-row table of the differences, the 20 changes each
with the problem, the change and the rule it comes from, eight before/after crops,
the list of what was deliberately kept, and the method.

## The part that makes it a case study
The claims are not my notes, they are printed from the pages. Lowest ratio
`1.03 → 4.87`; contrast findings `137 → 0`; smallest text `9 px → 12 px`;
targets under 34 px `91 → 37` (the 37 are inline text links); unnamed controls
`5 → 0`; landmarks `1 → 6`; h1s `0 → 1`; positive tabindex `3 → 0`; things that
move on their own `1 + 2 → 0 + 0`; scroll to the answer `1 324 px → 429 px`;
sideways scroll at 390 px `572 px → 0 px`; notices readable only as a download
`7 of 7 → 0 of 5`; links `86 → 58`.

Two rows are **against** the redesign and stay in the table: it is 2 034 px
longer (nothing was cut, so it grew) and it fetches 118 KB where the before page
fetches about none — one inline file, no webfonts, no photographs. **The bad page
is faster.** The method section prices that: subset the display face, self-host,
preload one body face.

The tide numbers are diffed cell by cell, day by day:
**7 days compared, 61 times and heights, 0 rows changed.**

## Round 1 → round 2
1. **The redesign silently dropped data.** The first tide table listed both high
   waters and the first low water and omitted the **second low water of every
   day** — eight numbers gone — under a heading saying "every number is the
   number it was". The diff found it, because the diff is a comparison and my eye
   reading the table was not. The table now carries all four waters of each day
   in the order they happen, and the row above is the proof.
2. **The diff itself was broken first**: it keyed the day off `cells[0]`, which on
   the before page is the weekday and on the after page a row-header, so it
   reported `0 days compared, 0 numbers` — a green-looking row that checked
   nothing. The day is now found wherever it sits in the row.
3. **An audit row that flattered the wrong page.** "Facts that exist only as PDF"
   counted links whose text says PDF: the before page hides the label in a
   sibling `<span>[PDF 1.2 MB]</span>` and scored 1, the after page labels its
   PDFs honestly and scored 7 — the row read as if the redesign had *added*
   PDF-only facts. It now counts notices with a PDF and no reading copy
   (`7 of 7 → 0 of 5`), plus a second row of the megabytes listed
   (`10.4 MB → 9.1 MB`), which is scored **neutral**, because the official
   record stays where it was.
4. **The audit counted `<label>`s as unnamed controls** (5 → 3), because a label
   has no accessible name of its own. Labels are not controls: the list is now
   links, buttons, fields, summaries, plus untitled iframes → `5 → 0`.
5. **The phone tide table overflowed the page by 62 px** while looking fine: the
   sr-only header used `position:absolute; width:1px; overflow:hidden` on a
   `<thead>`, and `display:table-header-group` ignores `overflow`, so the header
   cells (109 px wide) pushed the document to 452 px. On a phone the header is
   now `display: none` — every card cell is already labelled by its own
   `data-l`, so the words are not lost, only duplicated.
6. **The phone card was nine rows a day** ("Height (m)" four times a day). The
   card is a two-column grid now: label · time · height, one line per water, with
   ` m` on the heights and the range as a rule-topped summary line.
7. **The prose was wrong about its own data**: "the last is the morning of
   5 December, at 4.10 m" — 4.10 m is *below* the 4.20 m flood line; the evening
   high at 4.22 m is the last that reaches it. The change log's tide entry said
   "the two high waters labelled" after the table carried four; it says so now.
8. **Ten columns do not fit in a 68ch column at 15 px / 10 px padding**: 14.5 px,
   8 px padding, numerals `nowrap` and tabular.

## Weights
Desktop case study 27 083 px tall, 37 shots (round 2: five new frames, three of them element frames of the instruments, one media: print). The crops are 1 400 × 760 CSS px
pairs; the phone shots are 390 px. `before-phone` is the only shot the harness
marks with problems (12 contrast findings, 1 unnamed control, +572 px of
sideways scroll, one 404) — those are the artefact, not the harness.

## Remaining weak points
- **The before page is a caricature, not an audit.** A real redesign brief starts
  from a real site's analytics, support tickets and reader tests. Everything here
  is invented, so the 23 changes are argued from the page, not from evidence
  about readers. The measurements are real; the users are not.
- **The address check is a demo of a lookup, not a lookup**: four hard-coded
  answers, no index, no map, no geocoding, and the "borderline" answer's 15 cm
  margin is a sentence I wrote.
- The rail is three boxes of link lists. It is legible and it is the weakest part
  of the layout: the page's visual events are the amber flood tint and the red
  status band, and the rail has neither.
- The after page is **competent civic design, not beautiful**: one serif for
  headings, one sans, one mono, three accents, hairline rules. That is a
  deliberate choice for a page read in sunlight by a frightened person, and it is
  also the limit of what this page attempts.
- No screen-reader pass: the landmarks, names, heading outline and tab order are
  measured, no reading of a page with a reader is recorded, and `—` for the
  missing observation is explained in prose, not in the cell.
- The IA claim (nine nav links → five, six widgets → three boxes) is argued on
  one page. A portal is ~20 page types, and the "five labels" claim is only tested
  against this one.
- Every link is `#`: the notices, the street list and the 2025 tables do not
  exist. The case study claims a reading copy per notice; the copy is one
  paragraph deep.
- Print CSS exists (the tide table at 10pt) and no print capture is in the
  gallery; a tide table is a thing people put on a wall.
- The 118 KB is mostly five webfont files; nothing is subset, and no
  `font-display: optional` variant is shown.
- No `prefers-contrast`, no text-size (200 %) capture, no forced-colours mode.

## Ratings
| Axis | /5 | Note |
|---|---|---|
| Visual quality | 4 | legible, calm, typographic; the rail is three boxes of links and the page has two visual events in 3 681 px |
| Layout & hierarchy | 5 | the answer is where the eye lands, one column for the argument, one rail for actions, 1 324 px → 429 px measured; the case study's own hierarchy is strong but 26 000 px long with no sticky index |
| Consistency | 4 | one token set and one type system across the redesign and the case study; the before page is intentionally outside it, and the crops are the only place the two pages meet |
| Accessibility | 5 | 0 contrast findings, 0 unnamed controls, 6 landmarks, one h1, no positive tabindex, 44 px controls, skip link, visible focus, 572 → 0 px overflow — all measured in the page; no reader walkthrough, no 200 % capture |
| Originality | 5 | the redesign carries its own audit (four iframes, one measure function, 15 rows, a cell-by-cell tide diff), and the table keeps the rows that count against it |

---

# Round 2 — the water, drawn

## What the page was

The case study's frame measured **38 liveliness, 13.3 colourfulness, 2 hue families, panel depth 0**.
Its own notes named the flatness: *"the rail is three boxes of link lists… the page's visual events
are the amber flood tint and the red status band, and the rail has neither"*, and *"the page has two
visual events in 3 681 px"*. The subject is a **tide**, and the page drew it as nine columns of
numbers.

Then the reading found a contradiction. The lede: *"The forecast peak is **4.61 m** at 22:14 on
3 December — 41 cm above the flood line."* The panel: *"Next high water 22:14 · **4.48 m**."* The
table's 22:14 row: **4.48**. So the page quoted 4.61 for the same tide it tabulates as 4.48, in the
one sentence a resident acts on, and said nothing about the difference.

The numbers are not a mistake. 4.48 m is the **predicted astronomical tide**; 4.61 m is the
**forecast water level including the storm surge** — and the 13 cm between them is the whole
emergency: the tide alone is 28 cm over the line, the forecast is 41 cm over. The defect is that
only a flood engineer reading the page would know which is which. **The fix is naming, not
renumbering** — the lede now states both and says what each is, the table's caption says the table is
the prediction *without surge*, and the drawn gauge puts both on one scale so the gap is the
information.

## What is built

- **A tide curve in every day's row**, drawn from that row's own cells: four waters in the order
  they happen, the flood line dashed with a band above it, peaks flood-coloured where a water passes
  the line, and a **gap** where the gauge at the mouth was out of service on 6 December — not a
  straight line through an invented point. The curve sits under the date, in the row, beside the
  numbers it draws, and the nine columns and the measured phone layout are unchanged.
- **A level gauge in the panel**, on one scale: the bar to the current tide (3.94 m), the flood line
  (4.20), the predicted high (4.48), the forecast with surge (4.61). Its key states every mark as a
  margin — *"now 26 cm below it, above it from 21:30"*, *"28 cm over the line"*, *"41 cm over: the
  surge is the difference"* — so the reader subtracts nothing at 11 pm.
- **State pills on the notices** (*in force* / *applications open* / *starts 13 January*): the five
  identically-shaped blocks are now scannable by state, in ink at 6.02–7.74:1, and every pill is a
  word, never a colour alone.
- **The rail's warnings box says what is happening tonight** — a warning in force, peak 4.61 m at
  22:14 — with a red edge. The notes' complaint about the rail was that it had no visual event; the
  box that matters tonight is now the loudest thing in the column.

## The instrument: `10-redesign/measure.mjs`

A drawing can lie in ways a screenshot cannot show, so the two instruments are measured against the
text beside them, in the browser, mapping the geometry back through the scale the drawing code used.

| check | result |
| --- | --- |
| every curve dot maps back to its cell's metres | **≤ 0.008 m** (all 27 points, seven days) |
| peaks coloured flood only where the height is above the line | **0 wrong** (2+2+1 = 5 above, 5 coloured) |
| a missing reading is a gap, not a point | **1 gap for 1 missing**, 3 dots on 4 waters |
| gauge marks map back to the panel's data attributes | **0.000–0.001 m** |
| lede arithmetic: cm above the line = (peak − line) × 100 | **41 = 41 ✓** |
| predicted tide in the lede = the table's own 22:14 height | **4.48 = 4.48 ✓** |
| the table names its basis | says *predicted astronomical tides, without surge* ✓ |
| state pills: words present, ink on paper | 3 of 5, **6.02 / 6.96 / 7.74** (AA text 4.5) |
| print, A4 794 px | **0 px** sideways overflow, **7 of 7** curves on the page, table 794 px at 12.7 px |
| phone 390 px | **0 px** document overflow — the case study's `572 px → 0 px` row still holds |
| console errors | **0** |

The instrument was wrong twice before it was right, and both failures are in the file as comments:
it read the tide heights by stripping punctuation from every labelled cell, so the time `04:26`
became a tide of **426 m** and poisoned the shared scale; and its pixel-to-metre inverse multiplied
where it divided, reporting the flood line at **15 706 m**. A measurement that cannot fail is not a
measurement, and a measurement that has never been seen to fail is the same thing wearing a lab coat.

## Two harness holes this round fell into

1. **`tools/liveliness.mjs` emulated neither `motion: "reduce"` nor `print: true`.** `shoot.mjs`
   emulates both. So the folder's published measurement rows for `03-mobile/loading`,
   `07-dataviz/reduced`, `07-dataviz/print` and five `09-motion` rows were **silent duplicates of
   their screen twins** — eight rows that measured the same frame twice and were cited as evidence
   about a mode. The tool now applies `emulateMedia` per shot, exactly as the audit does.
2. **`tools/shoot.mjs` silently ignored the `element:` key** that `liveliness.mjs` supports. Four
   instrument frames shipped as 2 800 × 1 400 viewports — the same file size, so the report looked
   healthy. The audit and the measurement were looking at different pictures. The harness now
   screenshots the node's own box, and records a shot error when the selector is missing.

Same lesson as the missing 390 px widths and the fixed-height card windows: **the frame you never
ask for, or never emulate, is the claim you never measured.**

## Coverage hole named and closed

The notes' list included *"Print CSS exists (the tide table at 10pt) and no print capture is in the
gallery; a tide table is a thing people put on a wall."* The manifest now carries
**`10-redesign/after-print`** (media: print), and the print measurements above are in this file.

## Liveliness, before and after

The tool measures 25 of the 32 (it skips the seven 390 px phone frames; the audit covers those).
Same instrument, both trees, back to back.

| frame | before | after | |
| --- | --- | --- | --- |
| `after-full` — the whole redesign | 40 · colour 11.6 | **41 · colour 11.9** | the redesign, whole page |
| `c-01a`, `c-02a`, `c-07a` — after-side crops | 41 · colour 12.5 | **44 · colour 13.4** | |
| `c-03a`, `c-06a` — after-side tide and rail crops | 46 · colour 13.7 | **49 · colour 15.5** | |
| `c-04a` — after-side nav crop | 42 | **44** | |
| `c-01b` … `c-07b` — the **before** page crops | 62, 70, 62, 76, 60, 60, 75 | **identical** | untouched: the instrument's control group |
| `full` — the case study | 38 · colour 13.3 | 38 · colour 13.0 | 3 change entries make it 1 122 px taller |
| mean, 25 shared frames | 42.0 · colour 20.2 | **42.7 · colour 20.4** | |

**The five new frames, which are the instruments themselves:**

| frame | lively | colourfulness | ink | hue families |
| --- | --- | --- | --- | --- |
| `rail-alert` | **66** | 36.8 | 0.210 | 3 |
| `gauge` | **58** | 20.7 | 0.112 | 2 |
| `tides-curve` | **45** | 17.1 | 0.052 | 2 |
| `notices-states` | **37** | 11.7 | 0.074 | 2 |
| `after-print` (A4, media: print) | 26 | 8.0 | 0.051 | 1 |

Those five numbers were taken twice. The first run put the gauge at **74** with **0.525** ink, which
is absurd for a box containing a bar and four lines of text: an element screenshot captures what is
**composited in that box**, and the cookie banner's confirmation toast — a dark, fixed, full-width
strip — was lying across the bottom of the gauge. The shot actions now dismiss the banner *and* its
toast (`click:#ckMin`, `click:#ckDone`), and the honest numbers are 37–66, a tenth lower on average.
An element frame is not an isolated frame: it is a photograph of a place on the page.

Read honestly, this is what the round did and did not do. The **whole-page** number for the redesign
moves by one point: the page grew from **3 681 px to 4 119 px** (438 px of instruments), and 4 119 px
of calm civic page is not moved by 438 px of instrument. It should not be moved: a flood page
measured for liveliness is a flood page measured for the wrong thing.
Where the instruments *are* the frame, the numbers are 37–66, mean 46.4. The before page's crops measure
**identical** to the last run, which is the control: the instrument reports change only where a
change was made. The case study row stays at 38 and drops a hair of colour because the page grew
1 122 px of prose. The folder mean over the eleven briefs moves from 41.4 by less than two tenths,
in the other direction, for the same reason.

If the objective were "raise 10-redesign's liveliness number", the cheapest move is a coloured
sidebar. It is not the objective, and the printed page — 26, colour 8 — is the frame that says what
this page is for: a tide table on a wall, in ink.

## Ratings, round 2

| Axis | /5 | Note |
|---|---|---|
| Visual quality | **4.5** | the page has instruments now, not just two bands: a curve per day, a gauge in the panel, a state per notice, one loud box in the rail. The wall of five identical notices is the last flat stretch |
| Layout & hierarchy | 5 | unchanged: the answer is where the eye lands, one column for the argument, one rail for actions, and the new instruments sit inside the existing grid |
| Consistency | **4.5** | the drawings use the token set and are generated from the table's own cells, so a shape and a sentence cannot drift; the before page stays outside the system on purpose |
| Accessibility | 5 | 0 audit findings on 37 shots; states are words as well as colour; the SVGs are `aria-hidden` because the numbers are already in the text; the print page has no sideways overflow at A4 |
| Originality | 5 | the change log grows to 23, and the new entries come with an instrument that maps every drawn dot back to the cell it came from |

## Round 2's remaining weak points

- The curve is a **schematic on an index axis**, not a time axis: four evenly spaced waters per day.
  The caption says *"in the order they happen"*, which is what is drawn; the gap on 6 December marks
  the missing one. A real tide plot is on a continuous time axis, and the table's second high water
  at 00:22 belongs to the next day.
- The gauge is a **static drawing of one forecast run** (3 December, 16:40). The panel is honest that
  it is one run; a live gauge needs a source, a clock, and an expired state.
- The surge distinction is **stated and measured, not derived**: a real portal computes it from the
  model run, and the reader deserves the 15 cm uncertainty band, not a clause.
- No map. The address check answers from four hard-coded streets, and a flood page without a map of
  the flood line is still a page of numbers.
- The before page is a caricature, the users are invented, and the case study measures pages, not
  readers — unchanged, and the biggest limit on the whole brief.
