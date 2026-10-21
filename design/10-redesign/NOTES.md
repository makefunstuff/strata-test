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
Desktop case study 25 961 px tall, 32 shots. The crops are 1 400 × 760 CSS px
pairs; the phone shots are 390 px. `before-phone` is the only shot the harness
marks with problems (12 contrast findings, 1 unnamed control, +572 px of
sideways scroll, one 404) — those are the artefact, not the harness.

## Remaining weak points
- **The before page is a caricature, not an audit.** A real redesign brief starts
  from a real site's analytics, support tickets and reader tests. Everything here
  is invented, so the 20 changes are argued from the page, not from evidence
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
