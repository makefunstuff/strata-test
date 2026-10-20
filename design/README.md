# Design gallery — eleven briefs, built and measured

Eleven design briefs, one model, one harness. Every page here was built from a
written brief as plain static files (no build step, relative paths, fonts only
from pinned `@fontsource` packages), screenshotted in headless Chromium, looked
at against its own screenshots, fixed, and re-shot. Each folder carries a
`NOTES.md`: the brief, the implementation, a round of self-critique with the
numbers that moved, what is still wrong, and ratings out of five.

Start at [`index.html`](index.html) — the summary page, with thumbnails, the
measured facts and the verdict. It uses ES modules and reads a generated file, so
view it over http://: `node design/tools/serve.mjs` then
<http://127.0.0.1:8080/index.html>. Every individual task page works over
`file://` on its own.

## The eleven

Scores are the model's own, from each `NOTES.md`. Average of eleven: **visual 4.0,
layout 4.0, consistency 4.7, accessibility 4.0, originality 4.2**.

| # | Task | Folder | V | L | C | A | O | Shots | One-line verdict |
|--:|---|---|--:|--:|--:|--:|--:|--:|---|
| 01 | Landing page — Foldline, offline topo maps | [`01-landing`](01-landing/index.html) | 4 | 4 | 4.5 | 4 | 4.5 | 10 | The hero earns the page: a generated map sheet whose elevation profile matches the drawn route; the sections under it are a familiar marketing structure. |
| 02 | Dashboard — Gridwatch depot control tower | [`02-dashboard`](02-dashboard/index.html) | 4 | 4 | 4 | 4 | 3 | 14 | Dense, legible, two themes, hand-drawn SVG charts with an annotated peak; the least original thing in the folder, and rated 3 for it. |
| 03 | Mobile app — Ternmark birding log | [`03-mobile`](03-mobile/index.html) | 4 | 4 | 5 | 4 | 4 | 19 | Nine screens that agree with each other, with offline as the premise and the states that happen; no device was touched. |
| 04 | TUI — logtrail, a log tail | [`04-tui`](04-tui/index.html) | 4 | 4 | 5 | 3 | 4 | 9 | Real no-dependency TypeScript, and a capture pipeline that renders the program's own ANSI bytes; accessibility 3 because a terminal makes colour carry the level. |
| 05 | Design system — Halyard | [`05-system`](05-system/index.html) | 4 | 4 | 5 | 4 | 4 | 18 | One stylesheet, four themes, 24 components, 22 contrast pairs per theme measured in the browser; the themes are derivatives of tasks 01–04. |
| 06 | Identity — Meridian Hydrographic | [`06-identity`](06-identity/index.html) | 4 | 4 | 5 | 4 | 4 | 14 | A construction-built mark, 32 icons on one grid, files generated from one source — and the mark is the weakest part of the strongest-looking page. |
| 07 | Data visualisation — Harrow Estuary | [`07-dataviz`](07-dataviz/index.html) | 4 | 4 | 4 | 4 | 5 | 17 | The datum change is the argument; the dishonest fit is kept on the page, labelled; a gap is drawn as a gap. |
| 08 | Form / flow — flood resilience grant | [`08-form`](08-form/index.html) | 4 | 4 | 5 | 4 | 4 | 12 | Six steps, 24 questions, one field pattern; an address lookup that fills a *later* answer and says it did; a stop screen that keeps its button enabled. |
| 09 | Motion — a system and twelve interactions | [`09-motion`](09-motion/index.html) | 4 | 4 | 5 | 4 | 5 | 21 | The film strip *is* the animation (frames rendered from a live page, scrubbed); reduced motion is a redesign with a named replacement per study. |
| 10 | Redesign — a flood portal, both versions | [`10-redesign`](10-redesign/index.html) | 4 | 5 | 4 | 5 | 5 | 32 | One measure function over the bad page and the good one: 137 → 0 contrast findings, 1 324 → 429 px to the answer, 572 → 0 px overflow, 61 tide values 0 changed. |
| 11 | Style range — one brief, nine styles | [`11-styles`](11-styles/index.html) | 4 | 3.5 | 5 | 4 | 4 | 43 | Parity measured on rendered text (41 strings × 9 pages) and the added words counted; the layout axis is 3.5 because the nine costumes share one skeleton. |

`Fidelity` is scored only on 11 (4), the one task that asks for styles by name.

## Verdict on range and taste

**The taste is one taste.** Ink on paper, a hairline rule, one accent, tabular
numbers, a serif or grotesque against a mono, generous leading, no gradient, no
shadow, no rounded card stacks. It is a good default — it is why accessibility
averages 4.0 and the colours that taste produces are the ones that pass — and it
appears in the landing page, the dashboard, the charts, the form, the redesign
and three of the nine styles, which is most of the folder. Asked for loud styles
the model goes there (brutalism at 3 px rules with a ticker, pixel at whole-pixel
SVG and a blinking cursor, cyber with cut corners and a scan sweep) and the
results keep the discipline.

**It designs well where the brief has a contract that can be measured.** 05's
four themes with 22 contrast pairs per theme, 08's one field pattern across 24
questions, 09's one duration-and-curve token set, 10's single measure function
run over both pages, 11's 41 content strings checked against the text a browser
rendered in nine pages. Consistency is the highest axis and nothing is under 4 on
it. It is also good at arguing with evidence and at leaving the evidence that
hurts in: 07 keeps the dishonest fit on the page, 10 keeps the rows that read
137 → 0 next to its own 4 → 5, 11 publishes the 30–42 words each style adds, and
every `NOTES.md` ends with what is still wrong.

**Three named weaknesses.** *Structure*: layout is the lowest axis, and the only
3.5 in the folder is task 11, where a 40 px numeral over a caps label, a
three-column feature grid, two plan panels and a copy-left hero recur across the
nine styles — the surfaces were restyled, the argument's shape was not. *Drawn
marks*: 06 is the best-looking page in the folder and its own verdict is that the
logo is the weakest part of it. *The edges of typography*: the smallest measured
text across task 11's nine pages is 10.5 px of tracked capitals, and the pixel
page sets its body at 22 px because VT323's x-height is a quarter of the em —
the style's face gets chosen before its metrics are reckoned with.

**Range, honestly.** Nine named styles, no face shared between two styles, radii
0 → 999 px, h1 tracking −2.42 → +12.88 px, page length 2 149 → 3 742 px, all
nine at zero contrast findings under a text-node audit, 28 font files fetched
across them. The four type-led styles are closest to textbook; glass and
neumorphism reproduce the recipe and inherit its damage (neumorphism needed
twelve darkened greys; glass body copy over a translucent panel measures 11.34:1
against the card and cannot be measured over the middle of a drifting blob).
Style fidelity 4: the range is real and it is skin-deep in structure.

**Trade-off reasoning** lives inside the tasks (each `NOTES.md` has weights, a
round-1 → round-2, named compromises), and it is strongest where a number moved.
A twelfth brief that isolated it — four conflicting-constraint problems with
written decision records — was dropped by the owner before it was built, so that
skill is present and exercised, never rated on its own.

## The harness, and the two things it was blind to

`tools/shoot.mjs` screenshots every page in a RAM-capped systemd scope (so the
box keeps ~4 GiB free while Strata runs) and audits console, page and network
errors, low-contrast text, unnamed controls, landmarks, headings, focus, image
alts and sideways overflow. `tools/rendered.mjs` reads the text a browser
rendered plus computed styles and the font files fetched. `tools/overflow.mjs`
names the element wider than a phone. `tools/thumbs.mjs` builds the gallery
thumbnails. `tools/probe.mjs` is the one-page font diagnostic. Each task that
needs its own measurement has a `measure.mjs`.

- **Contrast was measured per element, and elements with children were skipped.**
  Emphasis lives in inline elements, so the coloured words that carry meaning were
  exactly what it never read; and `rgba(0, 0, 0, 0)` parsed as black, so
  gradient-clipped text was measured as a colour it does not have. `shoot.mjs`
  now walks text nodes and reports a near-transparent foreground as unmeasurable.
  `11-styles/shots/before-glass.jpg` is the proof: the old audit passed that page
  with zero findings. **Contrast counts for tasks 01–10 came from the element rule
  and are looser than 11's.**
- **Nothing measured which type the browser drew.** The editorial page asked for
  Source Serif 4 through a custom property, the browser dropped the declaration
  and used its installed serif, and the pinned faces sat registered and never
  fetched: clean console, `contrast 0`, no failed requests, and a screenshot that
  only lies to someone who read the `<link>` tags. `rendered.mjs` now reports the
  loaded families and fetched font files per page.

Reports: `tools/work/shoot/latest.md` is the last run, `<task>.md` the last
complete run of that task. The last full sweep: **43 shots in 11-styles, 8 in the
gallery frame, 0 with problems** — the two `before-*` shots report 1 and 12
contrast findings, which is what they are for.

## Limits

No readers: every subject is invented, no interview, no observation, no
analytics. No assistive technology, no keyboard-only walkthrough, no second
browser, no second machine, no 200 % zoom, no Lighthouse budget. Chromium 152,
software rendering, one Linux box. The ratings are the model grading its own
taste, and the axes where self-grading is easiest (visual quality: eleven tasks
spread over one point) are the least useful numbers in this folder.

## Commands

```sh
node design/tools/shoot.mjs 11-styles          # screenshots + audit for one task
node design/tools/shoot.mjs 11-styles --only swiss-hero,swiss-full
node design/tools/rendered.mjs 11-styles       # rendered text, computed styles, fonts
cd design/11-styles && node measure.mjs        # -> stats.js, the page's own numbers
node design/tools/thumbs.mjs                   # gallery thumbnails (ImageMagick)
node design/tools/serve.mjs design 8080        # look at the pages in a browser
node design/tools/probe.mjs 11-styles s03-editorial.html   # font diagnostic
```
