# Design gallery — eleven briefs, built and measured

The model under evaluation is **Swift 1.5 Flash-Next** (`strata/swift-1.5-flash-next-iq3_s`,
the IQ3_S quant of Qwen3.8-Flash-Next, 131K context, served by Strata on a home GPU box),
working as the coding agent **pi**. Eleven design briefs, that one model, one harness.
Every page here was built from a
written brief as plain static files (no build step, relative paths, fonts only
from pinned `@fontsource` packages), screenshotted in headless Chromium, looked
at against its own screenshots, fixed, and re-shot. Each folder carries a
`NOTES.md`: the brief, the implementation, a round of self-critique with the
numbers that moved, what is still wrong, and ratings out of five.

Start at [`index.html`](index.html) — the summary page, with thumbnails, the
measured facts and the verdict.

**Read this folder over http, not `file://`.** Measured, not assumed:
`node tools/filecheck.mjs` opens every distinct page in the manifest twice in the same
Chromium the screenshots come from — once over `file://`, once over http — with the same
console, page and request listeners the screenshot audit uses. Of **27 pages, 4 open
clean over `file://`**: `05-system/index.html` and the three pages of `10-redesign`. The
other 23 do not, because ES module scripts and `fetch()` are blocked by CORS on `file://`
and nine of the eleven task pages load a module — each one logging `blocked by CORS
policy` / `ERR_FAILED` on its own script. Over http, 26 of 27 load with no errors; the
27th is `10-redesign/before.html`, the deliberately-bad page whose fictional
`watermark.png` is not in the repo. So: `node tools/serve.mjs` and open
<http://127.0.0.1:8080/>. The report, page by page with the first error each logged, is
[`tools/work/filecheck.md`](tools/work/filecheck.md) — paths in it are cut to `design/…`,
because a CORS message quotes the absolute URL and this repository is public.

## The eleven

Scores are the model's own, from each `NOTES.md`. Averages over eleven, summed from
the table below: **visual 4.00, layout 4.14, consistency 4.77, accessibility 4.00,
originality 4.32** (and fidelity 4.00, scored on task 11 alone). Visual and
accessibility are tied last; layout is third; consistency is the high axis, and no
task scores under 4 on it.

| # | Task | Folder | V | L | C | A | O | Shots | One-line verdict |
|--:|---|---|--:|--:|--:|--:|--:|--:|---|
| 01 | Landing page — Foldline, offline topo maps | [`01-landing`](01-landing/index.html) | 4 | 4 | 4.5 | 4 | 4.5 | 10 | The hero earns the page: a generated map sheet whose elevation profile matches the drawn route; the sections under it are a familiar marketing structure. |
| 02 | Dashboard — Gridwatch depot control tower | [`02-dashboard`](02-dashboard/index.html) | 4 | 5 | 5 | 4 | 4 | 15 | Round 2: the card wall became an instrument panel, and `measure.mjs` says the chart is more readable (band separation 1.07 → 1.16, greyscale rank −0.33 → 1.00) while the liveliness index went *down* (56.4 → 53.0). |
| 03 | Mobile app — Ternmark birding log | [`03-mobile`](03-mobile/index.html) | 4 | 4 | 5 | 4 | 4 | 19 | Nine screens that agree with each other, with offline as the premise and the states that happen; no device was touched. |
| 04 | TUI — logtrail, a log tail | [`04-tui`](04-tui/index.html) | 4 | 4 | 5 | 3 | 4 | 11 | Real no-dependency TypeScript, and a capture pipeline that renders the program's own ANSI bytes; accessibility 3 because a terminal makes colour carry the level. |
| 05 | Design system — Halyard | [`05-system`](05-system/index.html) | 4 | 4 | 5 | 4 | 4 | 18 | One stylesheet, four themes, 24 components, 22 contrast pairs per theme measured in the browser; the themes are derivatives of tasks 01–04. |
| 06 | Identity — Meridian Hydrographic | [`06-identity`](06-identity/index.html) | 4 | 4 | 5 | 4 | 4 | 14 | A construction-built mark, 32 icons on one grid, files generated from one source — and the mark is the weakest part of the strongest-looking page. |
| 07 | Data visualisation — Harrow Estuary | [`07-dataviz`](07-dataviz/index.html) | 4 | 4 | 4 | 4 | 5 | 17 | The datum change is the argument; the dishonest fit is kept on the page, labelled; a gap is drawn as a gap. |
| 08 | Form / flow — flood resilience grant | [`08-form`](08-form/index.html) | 4 | 4 | 5 | 4 | 4 | 12 | Six steps, 24 questions, one field pattern; an address lookup that fills a *later* answer and says it did; a stop screen that keeps its button enabled. |
| 09 | Motion — a system and twelve interactions | [`09-motion`](09-motion/index.html) | 4 | 4 | 5 | 4 | 5 | 23 | The film strip *is* the animation (frames rendered from a live page, scrubbed); reduced motion is a redesign with a named replacement per study. |
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

**One brief has been rebuilt against this diagnosis, and the result is not what a
"make it prettier" round produces.** `02-dashboard` was the folder's least original page (3 of 5,
its own rating) and the plainest example of the template look. It is now an instrument panel: one
ground, hairline rules, a dominant primary readout, a single sequential ramp instead of six hues.
Its chart measures **more readable** on every legibility number the task's `measure.mjs` can
produce (neighbour separation 1.07 → 1.16, 1.4.11 floor 2.94 → 4.60, greyscale rank −0.33 → 1.00,
KPI hierarchy 1.00 → 1.43) and **less lively** on the folder's index (56.4 → 53.0, hue families
2.2 → 1.0). Both numbers are true. The taste critique was about sameness, and the fix removed
colour variety on purpose, so the index that measures colour variety went down — see
*"The counter-example"* below. That is what an evidence-based design round looks like when the
instrument and the craft disagree: you keep the craft, publish the fall, and say why.

 05's
four themes with 22 contrast pairs per theme, 08's one field pattern across 24
questions, 09's one duration-and-curve token set, 10's single measure function
run over both pages, 11's 41 content strings checked against the text a browser
rendered in nine pages. Consistency is the highest axis and nothing is under 4 on
it. It is also good at arguing with evidence and at leaving the evidence that
hurts in: 07 keeps the dishonest fit on the page, 10 keeps the rows that read
137 → 0 next to its own 4 → 5, 11 publishes the 30–42 words each style adds, and
every `NOTES.md` ends with what is still wrong.

**Three named weaknesses.** *Structure*, and the spread says it, not the average:
layout averages 4.14, third of five, with visual and accessibility tied last at 4.00
(accessibility's floor is task 04's 3, in a terminal where colour carries the level)
— what marks layout is that it is the only axis carrying a 3.5, task 11's, and there
the weakness is visible: a 40 px numeral over a caps label, a three-column feature
grid, two plan panels and a copy-left hero recur across the nine styles — the
surfaces were restyled, the argument's shape was not. *Drawn marks*: 06 is the
best-looking page in the folder and its own verdict is that the logo is the weakest
part of it. *The edges of typography*: the smallest measured
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

## How it compares to a strong frontier model

State the basis first: **no frontier arm was run in this repo.** No Claude-4/Opus-,
GPT-5- or Gemini-2.5-Pro-class agent was given these eleven briefs, so what follows is a
judgement against expectation, stated at the level the folder can support, and the
comparison the task asks for is delivered as that — not as a measured A/B.

**At the level expected of a frontier agent, on the evidence in this folder.** Eleven
complete briefs delivered as static pages that load clean at 1 440 and 390 with no console
errors; no build step and no dependency drift; self-critique rounds that move measured
numbers (05's 22 contrast pairs per theme, 10's 137 → 0 findings and 572 → 0 px, 11's
41 content strings × 9 pages); audits that publish their own warnings and, in 09's case,
their own row count. A frontier agent on the same briefs would be expected to produce the
same class of artifact, and this is that class: the deliverables are complete, verifiable
and self-documenting rather than fragments and lorem ipsum.

**Behind it on four specific edges.** (1) *Drawn marks*: 06's own verdict is that its logo
is the weakest part of its best-looking page; a frontier model's logotype work is the axis
where the gap is most visible in a portfolio. (2) *Structural originality*: the same three
layouts recur across the eleven tasks, and task 11's 3.5 is the measured form of that.
(3) *Typographic metrics at the edges*: 10.5 px tracked capitals as the smallest rendered
text in task 11, and a 22 px body because a pixel face's x-height is a quarter of the em —
the face gets chosen before the metrics are. (4) *Self-verification across long edits*:
the 09-motion regression (`buildAudit` read `r.props` off a snapshot that had dropped it,
throwing on every load and emptying two sections) survived because the screenshots were
not re-taken after the code changed, and the page's own Checks table did not count its own
rows until a reviewer asked for it. Frontier agents commit this class of lapse too; what
makes it a *model* weakness here is that the fix needed to be asked for, not that it was
missed.

**The one measured neighbour in this repo** is `whole-repo-qa/README.md`: Strata against
the router's dense 27B on ~100K-token whole-repo Q&A — 25/25 answers on both arms, line
citations 23/25 against 25/25, and ~2.9× faster time-to-first-token. The same shape shows
up in this gallery: the answers are right, and the precision at the edges is where the
smaller model loses.

**Ahead on the axis that is not quality.** These eleven briefs ran on a home GPU box at
~2 400 tok/s prefill with no API meter, in a folder whose harness (briefs written down,
one manifest, one screenshot command, a per-task report) is exactly the shape of the A/B it
lacks: a frontier arm scored by the same screenshots is a run of `shoot.mjs` away.

## The harness, and the four things it was blind to

`tools/shoot.mjs` screenshots every page in a RAM-capped systemd scope (so the
box keeps ~4 GiB free while Strata runs) and audits console, page and network
errors, low-contrast text, unnamed controls, landmarks, headings, focus, image
alts and sideways overflow. `tools/rendered.mjs` reads the text a browser
rendered plus computed styles and the font files fetched. `tools/overflow.mjs`
names the elements wider than a phone; `tools/chain-probe.mjs` prints their
ancestor chains with each box's width, scroll width and computed track, which is
the difference between "overflows by 282 px" and a fix. `tools/dump.mjs` prints
the text of selected regions, `tools/names.mjs` lists controls the audit calls
unnamed, `tools/probe.mjs` is the one-page font diagnostic. `tools/thumbs.mjs`
builds the gallery thumbnails, `tools/shotsindex.mjs` writes the page inside every
`shots/` folder, `tools/links.mjs` checks that every relative reference resolves
under the rule a static host applies, `tools/liveliness.mjs` measures whether a frame is
visually alive (the section below), `tools/serve.mjs` serves the tree over
http for the pages that use ES modules. Each task that needs its own measurement
has a `measure.mjs`.

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

- **Coverage is the manifest, and the manifest had holes.** The audit only measures
  the shots the manifest asks for, and `04-tui` had nine shots, every one of them
  wide: 1500, 1660, 1960 px. Laid out at 390 the page scrolled sideways by **282 px**
  and nothing had ever known, because nothing had ever asked for 390. `06-identity`
  had a phone shot and overflowed by **63 px**, which the harness reported as a
  391 px document and nobody read. Both are fixed and measured at 0 px, and
  `04-tui` now has two 390 px shots, so the next run cannot be blind that way again.
  The rule this teaches is not about CSS: a page width that is never requested is a
  page width that is never audited, and a report nobody prints is a report nobody reads.

### Third, and the one this folder could not see at all: nothing measured whether a page was worth looking at

The audit measures whether a page is *correct*. Nothing measured whether it was *alive*, which is
the question a visitor actually asks, and the folder's answer to it had been eleven models of
self-grading giving each other a 4/5. `tools/liveliness.mjs` screenshots each brief at 1440 and
reads the pixels — Hasler–Süsstrunk colourfulness, how many of twelve hue bins clear 1% of pixels,
ink coverage against the dominant background, tonal entropy of the luminance histogram, and a
panel-depth share from the box tree — then folds them into a 0–100 index whose weights are stated
in the file rather than fitted to a taste.

The first run is the finding, and it is not flattering:

| | colourfulness | hue families | liveliness |
| --- | --- | --- | --- |
| mean over the eleven briefs | **13.3** | **1.2** | **42.2** |
| highest brief (`03-mobile` board) | 16.9 | 2 | 67 |
| lowest brief (`08-form` step 1) | 6.4 | **0** | 17 |
| the gallery frame itself, whole page | 6.8 → **9.6** | 0 → 0 | 19 → **26** |
| the same run, after `02-dashboard` was rebuilt (next section) | **12.5** | **1.09** | **40.5** |

"Eleven tasks spread over one point" on the visual axis is visible in the pixels now: a mean of
**1.2 hue families out of twelve**, and two of eleven frames — `08-form`, `09-motion` — with *no hue
at all* above 1% of their pixels. That is the human verdict, "the taste is one taste", turned into a
number that can be moved or refuted, which is more than an eleven-way 4/5 ever was.

What it cannot do, stated plainly: it is a ranking device, not a judge. High colourfulness on a
page whose contrast then fails AA is a regression, and `shoot.mjs` is what stops that; a page can
be dull for a reason (a six-step grant form, a spec sheet, a print-first document) and the index
does not know why. And it measures a *frame*, so what the frame is decides the answer: the gallery
page reads 26 whole-page while its liveliest section measures 49 and its dullest, the verdict
prose, 5. Two measurement traps turned up while building it, and both are now in the tool: a
whole-page frame of a page with `loading="lazy"` images measures a *shorter, emptier* document
depending on scroll history (10140 px against 10503 px here), so the tool scrolls the document and
awaits the images before it shoots; and this software-raster Chromium can hand back a frame that is
not the page, which the tool now refuses — a decoded frame that is >50% undrawn or >99.8% black is
a FAILED shot, retried once, not a score. The first version of the tool scored one page at 72/100
for being near-black; the "page" was the repo's own dark hub, served because a path resolved one
directory too high.

The gallery now shows the measurement instead of describing it. `#pulse` paints one tile per brief
in the background colour *read out of that brief's own screenshot*, bars its measured
colourfulness, and draws a hue rail whose widest segment is the grey "no hue at all" segment; the
card lists carry the measured axis beside the five self-graded ones, dashed, so nobody confuses
them. `tools/liveliness.mjs --per-task` regenerates `liveliness-data.js`, and a filtered run
refuses to overwrite it (one such run emptied the band and the page correctly said "no measurement
on file" — the fallback firing as designed). Adding the band moved the frame from 19 to 26, the
smallest honest proof that the number answers what you do to a page; the band's own section is the
liveliest thing in the folder's frame at 49.

And a lesson about the difference between *measured* and *deployed*. The band's data first lived at
`tools/liveliness-data.js`, which is where every local check said it should be — and Pages publishes
`design/` with `rsync --exclude tools/` (the harness is not a page), so the file 404'd in production
and every visitor got the "no measurement on file" fallback while the whole local suite stayed
green. It moved to `liveliness-data.js`, beside `gallery.js`, inside the published set, and
`tools/liveliness.mjs --live [url]` now asserts the published page has the band: it loads the live
URL, counts the tiles and the rail, and fails with the exclusion named. Run against the deploy that
shipped it, that check said `tiles 0 · fallback true` — the first version of this section's own
headliner was broken in production and only a check that leaves the machine can see that.

### Fourth, and the one pixels cannot see: nothing checked that a page agrees with itself

The redesign round on `02-dashboard` turned up a defect that no screenshot, contrast pass or
console check can find. The page's headline, its figure caption and the chart's **`aria-label`**
all said the day's peak was **7.82 MW at 19:10**. The seeded series the chart draws peaks at
**6.35 MW at 18:00**. Every frame was sharp, every colour passed AA, the console was silent, and a
screen reader was being told about a peak that is not on the chart. A dashboard whose prose and
plot disagree is not a styling problem, and "the screenshot looks fine" is not evidence about it.

The fix computes what the page claims from the series it drew: `peakKw`, `peakAt`, the contract
ceiling (8.03 MW) and the headroom (1.68 MW) are derived, so the caption, the meta line, the alert
and the picture cannot drift apart again. Two more lies of the same family went with it: the
`compare:` select redrew the page identically for every option (it is wired to a real comparison
curve now), and the KPI rail's "3.1 % vs last Sunday" had no comparison anywhere on the screen.
**A control that changes nothing, and a number with no picture behind it, both read as design and
function as misinformation.** `measure.mjs` in that task now checks that the comparison curve, the
delta and the rail agree.

### The counter-example: 02-dashboard rebuilt, and the liveliness index going the other way

The brief on this round was the human one — the demo looked like an AI's SaaS template: five
identical KPI cards, a rainbow stack, a donut for three categories, shadowed card soup, one
grotesque doing all the type. It was rebuilt as a depot control tower: one ground, one panel, one
recessed field, hairline rules, a dominant primary readout, Archivo for the UI and Plex Mono for
every numeral, and one **sequential** ramp for six depots carrying one quantity (kW) instead of
six unrelated hues. `02-dashboard/measure.mjs` measures what a stacked chart needs, from the
rendered page:

| | round 1 | round 2 |
| --- | --- | ---
| weakest boundary between neighbouring bands | 1.07 (L) · 1.08 (D) | **1.16 (L) · 1.18 (D)** |
| palest fill against the panel (WCAG 1.4.11 asks 3:1) | 2.94 (L) · 3.44 (D) | **4.60 (L) · 3.03 (D)** |
| greyscale rank: biggest depot is the heaviest band | −0.33 | **1.00 (L) · 1.00 (D)** |
| primary / secondary KPI type size | 1.00 | **1.43** |

The same instrument, the same eleven wide shots, before and after:

| | round 1 | round 2
| --- | --- | ---
| lively | 56.4 | **53.0**
| colourfulness | 22.9 | 21.5
| hue families (of 12) | 2.2 | **1.0**
| *empty state* | 16 | **49**

The index went **down**, and it is the most useful number in this section. The page deliberately
gave up hue variety — a sequential ramp, semantic colour only where a state is meant — and the
index is built out of colourfulness and hue families, so it ranks the thing that was removed. What
it did see: the empty state went from 16 to 49 (the old empty page was a strip of dead grey; the
new one keeps the rail and the panels, so an empty depot selection reads as an instrument at rest),
and ink and depth held while the table got denser.

So the index's mean over the eleven briefs moved **42.2 → 40.5**, colourfulness **13.3 → 12.5**,
hue families **1.2 → 1.09**, because one brief is now disciplined about colour. That is the
instrument's first counter-example, and the response is not to paint the rainbow back: repainting a
page to please a metric is exactly the failure the folder is accused of. The rules it leaves:

- **Compare a page against itself, round to round, and against pages of the same kind.** A landing
  page and a control tower are not on the same axis.
- **A fall is a question, not a verdict.** Read the components: here they say "fewer hues", which
  has a design reason, and the components that would show legibility (adjacent separability,
  greyscale order, hierarchy) are not in the index at all. That is why the task now has its own
  `measure.mjs`.
- **The frames that moved for the right reason are the ones to quote**: 16 → 49 on an empty state
  is a page that stopped looking broken.

Reports: `tools/work/shoot/latest.md` is the last run, `<task>.md` the last
complete run of that task — all eleven tasks have one, and `tools/shotsindex.mjs`
renders each of them into `<task>/shots/index.html` so the gallery's "N shots"
link lands on a page of evidence instead of a folder listing GitHub Pages does not
serve. The last full sweep: **214 shots across the eleven tasks plus 9 in the gallery
frame — 223 audited screenshots, 1 with problems** — that one is `10-redesign/before-full`, where the
deliberately-bad page loads a `watermark.png` the fictional studio never shipped and
the browser logs the 404; the two `before-*` shots in `11-styles` report 1 and 12
contrast findings, which is what they are for. `08-form/shots/stop.jpg` is a real
screenshot from an earlier round of that task, kept, and its page says it is not in
the last audit. Per task, the shot counts and the deliberate contrast findings are unchanged from
the previous run (`04-tui` 75, `10-redesign` 120, `03-mobile` 28, `07-dataviz` 24, `06-identity` 16,
`11-styles` 13). The one brief that changed, `02-dashboard`, is the reason its shot count moved
14 → 15 (a `compare-off` shot, to prove the header control redraws): **0 console errors, 0
contrast findings, 0 unlabelled controls, 0 sideways overflow** across 15 shots in both themes and
on phone, and its `measure.mjs` table above is the evidence for the visual claim. The
gallery frame reports `contrast 0` on all nine of its shots for the first time: its code chips
measured 4.47 against the 4.5 they need, and `--ink-3` moved `#6b7280` → `#6a717e`, one unit of
lightness, found by the harness and not by the eye.

## Limits

No readers: every subject is invented, no interview, no observation, no
analytics. No assistive technology, no keyboard-only walkthrough, no second
browser, no second machine, no 200 % zoom, no Lighthouse budget. Chromium 152,
software rendering, one Linux box. No frontier arm in the comparison above. There
is no CI: nothing re-runs the harness when the code changes, and that is how the
09-motion regression reached a commit with full-looking screenshots beside it —
the rule is now that a task is re-shot after every change to it. The ratings are
the model grading its own
taste, and the axes where self-grading is easiest (visual quality: eleven tasks
spread over one point) are the least useful numbers in this folder.

The gallery links raw `.md` files (a task's `NOTES.md`, a run's report). They are
served as text by GitHub Pages only because the repository root has a `.nojekyll`,
which turns Pages' Jekyll step off; without it a linked `.md` is converted to
`.html` and the link 404s.

The same kind of failure as the 09-motion rows lives in the prose of this folder: a
sentence asserted instead of measured. The sentence about `file://` sat here claiming
every task page opens on its own, and it was false for nine of eleven — the folder's
own limits paragraph and `01-landing/NOTES.md` contradicted it. A tool now measures
it (`tools/filecheck.mjs`) and the numbers above are its output. Two of the three
findings in the last review round were of this shape, and the check that catches them
is the one that runs the page: the shots, `dump.mjs --reduce --build --frames`,
`links.mjs`, `filecheck.mjs`. Prose about a page is not evidence about a page.

## Commands

```sh
node design/tools/shoot.mjs 11-styles          # screenshots + audit for one task
node design/tools/shoot.mjs 11-styles --only swiss-hero,swiss-full
node design/tools/rendered.mjs 11-styles       # rendered text, computed styles, fonts
cd design/11-styles && node measure.mjs        # -> stats.js, the page's own numbers
cd design/02-dashboard && node measure.mjs      # chart legibility: band separation, 1.4.11 floor,
                                            #   greyscale rank, KPI hierarchy -> measure.md
node design/02-dashboard/measure.mjs --url <dir> --out /tmp/before.md
                                            #   the same measurement against an old commit
                                            #   (git worktree add /tmp/old HEAD~1)
node design/tools/thumbs.mjs                   # gallery thumbnails (ImageMagick)
node design/tools/serve.mjs design 8080        # look at the pages in a browser
node design/tools/filecheck.mjs               # which pages load over file:// and which do not
node design/tools/liveliness.mjs --per-task    # measured liveliness -> tools/work/liveliness/ + liveliness-data.js
node design/tools/liveliness.mjs 02-dashboard --shot light,dark   # one task's frames
node design/tools/liveliness.mjs --live            # assert the PUBLISHED frame page has the band's data
node design/tools/dump.mjs 09-motion/index.html '#audit-list' --reduce --build --frames
                                              # the reduced-motion page, as the browser sees it
node design/tools/probe.mjs 11-styles s03-editorial.html   # font diagnostic
```
