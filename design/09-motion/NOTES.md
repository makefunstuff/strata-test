# 09 · Motion — a system, twelve interactions, and the frames as evidence

## Brief
Design the motion for a product: micro-interactions, page transitions, state
changes, with durations and easing curves defined, and a reduced-motion
fallback.

## Built
`design/09-motion/index.html` + `styles.css` + `motion.js`. Four durations, four
curves, six rules, and **twelve studies**: a sheet, a dialog grown from its
button, a toast with its countdown, a row added to a list, a sort that shows the
crossing, a tab rule, a skeleton becoming content, a heart with its overshoot, a
button that becomes its own progress, a disclosure opening its own height, a
scroll reveal with a ruler, and a card that knows where the pointer is. Each
study carries a live demo, three frames of that same animation, a six-line spec,
and a named reduced-motion replacement. The last section is a set of checks
measured from the page.

## The thing that makes this a design document and not a GIF
Every animation on this page is one Web Animation, created paused. The demo plays
it; the three frames are that animation with `currentTime` set to 0 ms, 45 %, and
the end — the same objects, the same durations, the same curves. Nothing is
redrawn as a picture of motion. Press Play and the strip's animation runs.

That construction is also the reason the strip is honest about the state: in every
frame the row is *already in the list*, the tab already reads
`aria-selected="true"`, the disclosure is already open, the heart is already
`aria-pressed="true"`. **The state is final at the press; only the picture is
behind.** That is the whole "nothing waits for the animation" rule, visible in a
screenshot.

## Decisions over decoration
**Durations are tied to distance and role, not taste.** `--dur-1` 120 ms is a
state already under the finger. `--dur-2` 220 ms is the working duration.
`--dur-3` 360 ms is a thing that crosses the screen. `--dur-4` 560 ms is the
scroll ruler and nothing else. Two durations for arrivals (220 and 360) is a
policy: a sheet from the bottom tab bar and a dialog in the centre of a
1 400 px stage are not the same journey.

**Curves have one job each.** `--ease` for anything that stays; `--ease-out` for
arrivals; `--ease-in` for departures, so exits are shorter than entries;
`--ease-spring` (a 1.4 overshoot) for exactly one moment — a press on a 40 px
heart, for 120 ms. A curve that overshoots on a panel that stays on screen looks
like a lie: the eye reads it as a panel that has not settled.

**Three layout animations, declared.** The tab rule's `width` (a 2 px rule inside
a 260 px tablist: a sliding rule that changes length is the lie), the upload
button's `width` (a 112 px button in a static column; the alternative is a button
that jumps), and one disclosure's `grid-template-rows: 0fr → 1fr` (an unknown
height, animated with no measuring and no layout code). The Checks section lists
them and marks the row `warn`, because they are the exceptions and an audit that
only reports green is a brochure.

**A container transform, not a scale-from-centre.** The dialog's origin is at the
Export button that opened it, and its words arrive after the box lands — one
object, two beats, so the eye follows the box rather than watching two things
pop.

**The ruler is linear, the reveal is staggered.** A progress rule is a ruler: an
eased ruler lies about the page. The reveal blocks are 120 ms apart, which reads
as a stack arriving; 60 ms reads as a queue, 240 ms reads as waiting.

**Reduced motion is a redesign, and every study names its replacement.** The
tokens go to 0 ms, so a strip's three frames become one frame at 0 ms — the
screenshot of that is `shots/reduced-sheet.jpg`. Cutting motion must not cut
information, so each study states what carries the news instead: the sheet's
heading takes focus and gets a Close button, because a drag gesture has gone; the
toast's countdown bar becomes a text suffix "closes in 6 s", because a shrinking
bar is no news to a screen reader; the button's spinner becomes the words
"Uploading", because a ring spinning at 0 ms is a frozen ring; the sort's
crossing becomes the column header's direction, because the order is the
information.

**Pointer play is quarantined.** Study 12 runs on `pointermove`, is inert on
touch, is flat under reduced motion, and the card is a link with a visible
underline without it — so none of it is load-bearing.

## Round 1 → round 2
1. **Two `fill: both` animations on one property of one element fight, and the
   loser wins the frame.** The upload button's label faded out and back with two
   animations; the mid frame showed a label at 0.65 opacity, which is what two
   overlapping keyframe lists interpolate to. Every sequenced study is now
   **one** animation with keyframe offsets. The strip caught this: no GIF of the
   design would have.
2. **The curve plot was not the CSS curve.** The first diagram sampled `y(t)`
   against `t`; a CSS easing is the parametric cubic plotted y against x, which
   means solving `x(t)` for each x. Bisection, 24 steps. The spring's overshoot
   now goes above the plot box, where it belongs.
3. `TypeError: Cannot read properties of null (reading 'animate')` — the
   reduced-motion section mounted the *sheet's* markup for all three picks, so
   the row-insert and button studies found no `.li.new` and no `.btn`.
4. `Cannot read properties of undefined (reading 'setAttribute')` — five of the
   twelve studies were built: the tab study's frame hook used a helper that a
   scripted patch had mangled into a single-element selector, so
   `b[0]` was undefined.
5. The reduced strip's mini-stages were 150 px wide, so "the field plate" wrapped
   onto three lines. The mini-stage is now scaled, and the strip reads as three
   frames of one screen.
6. The token table set `--dur-1120 ms` — no air between the token and its value.
7. The Checks section's "longest animation" claimed the scroll ruler; the
   longest is the toast's 3 240 ms countdown bar, whose job is to last as long as
   the message can be read. It now names the study it found.

## Round 2 → round 3: the regression the shots could not see
1. **`TypeError: Cannot read properties of undefined (reading 'split')` on every
   load.** `buildAudit` copied the registry into a snapshot of
   `{ key, title, total, anims }` and then read `r.props.split(/,/)` off it. The
   throw landed in the middle of `build()`, so the reduced-motion grid
   (`#rmGrid`, 0 children), the Checks table (`#audit-list`, 0 children) and the
   state line (`#rmState`, stuck on “checking…”) all rendered empty, at 1 440 and
   at 390, with reduced motion on and off. `buildReduced` never ran.
2. **How it stayed invisible: the code moved and the evidence did not.** Round 2's
   fixes were written into `motion.js` and the screenshots were not re-taken, so
   `shots/audit.jpg` in the commit above still read “3 240 ms — the scroll ruler”,
   a string the code no longer contained, and the NOTES below claimed zero console
   errors on the strength of a run that predated the edit. A screenshot is
   evidence about the minute it was taken and nothing after it.
3. The fix carries `props` through the snapshot, and runs both section builders
   inside a guard: a throw now prints its own line inside the section
   (“reduced motion: build failed …”) and says so on the state line, instead of
   leaving a silent hole. `build()` publishes `window.__build = { studies, rm,
   audit, ran }` for a harness to read.
4. **The Checks table now counts itself.** Its last row reads “12 study cards, 3
   reduced-motion strips, 10 rows in this table”, read out of the live DOM after
   both builders ran. A section that emptied itself cannot pass its own audit —
   which is the check this page needed when it shipped the bug.
5. The harness side: `tools/shoot.mjs` now writes a per-task report
   (`tools/work/shoot/<task>.md`) only on a run that covered every shot of that
   task, so `09-motion.md` and the 21 shots in this folder are the same run —
   21 shots, 0 problems, with a `pageerror` listener live.


## Round 3 → round 4: a review read the reduced-motion page and the audit lied twice

A reviewer loaded the page with `prefers-reduced-motion: reduce` and found two
claims the page cannot support. Both are the same failure: a sentence typed where
a number should have been measured.

**The 40 ms that survived the media query.** Study 04 ("A row added, and the rows
that give way") gave the displaced rows `delay: 40` — a literal, not a token — while
everything else is on `--dur-*`. Under reduce every duration is 0 ms and that delay
is not, so the reduced strip read `mid 18 ms · end 40 ms` on the one study whose own
section says every duration on the page is 0 ms. The strip's frames are the proof of
the reduced path, so the strip was proving the opposite of the sentence above it.
Fixed: the offset is `D[1]`, and the study's own spec line changed from "neighbours
40 ms behind" to "neighbours one `--dur-1` behind", with the reason in the spec —
*a hard-coded beat would survive the media query*. The same class of bug was next
door in study 03: the toast's life is `Math.max(D[3] * 9, 1)`, whose `1` floor left a
`1 ms` frame in the reduced grid. It is `D[3] ? … : 0` now. Measured: all 45 frame
labels across the page read `0 ms` under reduce, where they read 18, 40 and 1.

**The hard-coded sentence about the longest animation.** The Checks row said
"…and it is the toast's countdown bar…" as prose, next to a measured number. Under
reduce the number becomes 40 ms (see above) and the study named by the data is study
01, the sheet — so the row read "40 ms, in 'A row added…' — and it is the toast's
countdown bar". The row is computed now, end to end: the span, its study, its number,
the properties it animates, and a ceiling separated into what is allowed to be long
(a countdown and a scroll reveal) and the longest *single* animation outside them.
Two facts came out of writing it. The longest single animation outside those two
kinds is **820 ms, in study 09** (the button that becomes its own progress), which
crosses the page's own 360 ms line: the row says so and carries a **warn**, where the
old prose row said "ok" and asserted that nothing exceeded 360 ms. That assertion
was false in the full-motion page too — 820 ms was always there. The audit is allowed
to fail the page it is printed on; that is the only way it is worth reading.

**The counters the handoff quoted.** I wrote that the page reports "12 of 12 studies
listed" and "12 of 12 studies have a named replacement". Neither string exists: the
page said "12 study cards, 3 reduced-motion strips, 10 rows in this table", and the
reduced panel holds **three** strips — a picked three, not the twelve. The substance
was there (every study card carries its own reduced-motion line) and the numbers were
wrong, in my summary, because I described the intent and not the DOM. So the page now
says the coverage the summary claimed to have measured, and says it in the same words
it can prove:

- `#rmState`: *"prefers-reduced-motion: reduce is ON on this view · 3 of 12 studies
  are rebuilt as a strip below, and all 12 of 12 name their replacement in their own
  card — counted out of this DOM, not typed"*
- the Checks table's last row: *"12 study cards, 3 of 12 studies rebuilt as
  reduced-motion strips below (a picked three, not the whole set), 12 of 12 study
  cards carrying a named replacement in their own spec, 10 rows in this table"*
- `window.__build` gained `named`, `reduced` and `longest`, so a harness can read
  `{studies: 12, rm: 3, audit: 10, named: 12, longest: 3240}` rather than infer.

**The coverage hole that hid it.** `reduced.jpg`, `reduced-sheet.jpg` and
`reduced-button.jpg` were all taken with `motion: reduce` — so the reduced section
*was* screenshotted. The Checks table under reduce was not: `audit.jpg` is a
full-motion shot, and the mismatch lived in the one section the reduce flag never
reached. Two shots added: `checks-reduced.jpg` (the table with the flag on: 0 ms,
REDUCE, warn rows) and `reduced-insert.jpg` (study 04 under reduce, where a surviving
stagger would show as a non-zero frame label). 23 shots, 0 with problems.

## Weights
The full desktop page is 10 778 px tall and the phone capture is 25 850 px,
because twelve studies with three frames each stack into one column on a 390 px
screen. On a phone the frames go side-by-side at 132 px, which is small; the
study is a reference document, and the phone view exists to prove it does not
break, not to be the way it is read.

## Remaining weak points
- **No frame-rate measurement.** The animations are transform and opacity by
  construction, and the three layout cases are argued, not profiled. The page
  says so in its own Checks row.
- The demo surfaces are scaled-down components, so their 34 px targets are not
  the 44 px targets of the real product; the audit prints that too.
- **Nothing re-runs the harness when the code changes.** There is no CI here, and
  the round-2 regression survived exactly because the pages were not re-shot after
  the edit. `tools/shoot.mjs 09-motion` is four minutes; running it after a change
  is a rule, not a step in the brief.
- No page transition and no shared-element study: the brief's "page transitions"
  are answered by the sheet, the dialog and the scroll reveal, which is a
  narrower answer than the brief asks for.
- `prefers-reduced-motion` is honoured as a media query with no user switch on
  the page, so a reviewer cannot turn it on and off inside the page; the harness
  can, and `reduced*.jpg` are captured that way.
- The studies sit in fixed demo surfaces; real motion also has to survive a
  window resize mid-flight, and this page never resizes a running animation.
- No screen-reader walkthrough of a toast, a dialog, a re-sort, or a tab change:
  the roles and states are there, and the reading order of a live announcement
  is unproven.
- One spring, no sound, no haptics: on a phone this system has two feedback
  channels and the studies use one.

## Ratings
| Axis | /5 | Note |
|---|---|---|
| Visual quality | 4 | the white demo surfaces on a dark wall make the frames the subject; the left column of each study card carries dead space |
| Layout & hierarchy | 4 | the study card's grid is legible, the spec column is dense, and the frame labels are the loudest type on the page, which is right |
| Consistency | 5 | one token set for duration and curve, one construction for every study, one rule for the state, one rule for reduced motion |
| Accessibility | 4 | the states are final at the press, the roles are there, reduced motion is a designed path with a named replacement per study; no profile, no reader walkthrough |
| Originality | 5 | the strip is the animation, scrubbed; the reduced-motion proof is three frames at 0 ms; the audit is measured and reports its own warnings |

---

# Round 2 — the clock, drawn

## What the page was

A motion system, documented on a dark wall: 32 liveliness, **10.3 colourfulness, no hue family at
all** in the measured frame. The page's own notes admitted *"the left column of each study card
carries dead space"*, and its rules section was six identical grey cards with no first rule. The
subject of the page is **time**, and the page showed time in prose: `--dur-3 (360 ms) · scrim
--dur-2` as a sentence.

## What is built

- **A timing plate in every study card.** The study's own Web Animation objects are read out —
  each animation's `delay`, `duration` and `easing` — and drawn on a shared 0 → settle axis: a bar
  per animation, a lane behind each bar grouping it by easing family, and a mono foot line
  `0 ms · 4 animations · out · 480 ms`. Twelve cards now show their clock next to the demo the
  clock describes, and it fills the dead column the notes named.
- **The colour is the easing family**, so the plate's four marks are the page's four curve tokens.
  The wall's bright `--sky/--acc/--coral/--gold` are **1.8–2.2:1 on the light surface**, so the
  plate carries darker siblings `--tl-std/–out/–in/–spring` at **3.98–5.17:1** against the paper —
  WCAG 1.4.11 asks 3:1 for a meaningful graphic, and a bar that encodes a category is meaningful.
- **The durations table gained its `reduce` column.** The page's central claim is that every token
  is 0 ms under `prefers-reduced-motion`; the token, the value and the zero now sit in one row, and
  the foot line is read out of the stylesheet, not typed.
- **The rules are ranked.** Six equal grey cards made the page's own hierarchy a lie; the
  composited-properties rule is the one the others obey, so it spans and is set larger, numbered
  01, the rest 02–06.

## Three versions of the plate, each killed by a measurement

1. **Dark on dark.** The first plate was a `--wall` box on the `--wall` page. It read as a hole, and
   it broke the page's own stated law — *the wall is the studio, the light surface is the object* —
   and in a fixed-height frame it displaced the light demo, so the card frames measured **duller**
   (sheet 32→20 in one pass, toast 25→9).
2. **Clipped.** A fixed 36 px box: the button study runs five animations at 7 px each, so the fifth
   bar fell outside the viewBox. The plate is sized to the study's animation count now.
3. **Misplaced.** Put in the card's tall column it grew the document **2 000 px** (11 258 → 13 270),
   pushing every film strip out of its fixed-height frame — five shots went duller. The plate now
   sits in the card's short column, where the right column sets the card height and the plate costs
   the page nothing.

## The instrument was broken, and it was scoring pages from a dead renderer

Running this task exposed a fault in `tools/liveliness.mjs`: under memory pressure the software
raster **decays**, and shots late in a run come back as a uniform field of the page's own background
colour — no console error, no undrawn canvas, not >99.8% black (16,16,16 is not 0), so every existing
validation passed and the tool scored `09-motion` shots at 6/100. A whole run decayed monotonically:
sheet 32, modal 26, toast 16 … ink 0.002.

The tool now counts **distinct colours** in the decoded frame and rejects a frame with fewer than 24
(any page with type has hundreds, from antialiasing alone), and a dead target gets a context restart
rather than a page rebuild. Every before/after number below was taken with the fixed validator, on
both trees, back to back.

## Element frames, because a card's numbers should not depend on a window

The card shots are fixed-height windows into a page whose layout changed, so they moved: `toast`
25→9 with no visual change. That is a measurement artefact, and the fix is the frame type that
matches the claim: the manifest now carries **`element` shots** (`sheet-card`, `toast-card`,
`button-card`) which screenshot the node's own box, so a card is measured as a card.

| frame | before | after |
| --- | --- | ---
| whole page (`full`) | 32 · colour 10.3 · ink 0.196 · tonal 0.28 | **38 · colour 12.6 · ink 0.218 · tonal 0.30** |
| **`sheet-card` (element)** | 41 · colour 10.8 · ink 0.353 | **49 · colour 14.4 · ink 0.383** |
| **`toast-card` (element)** | 40 · colour 11.4 | **45 · colour 13.2** |
| **`button-card` (element)** | 59 · colour 19.4 | **65 · colour 22.6** |
| rules section | 20 | **25** |
| a study card, window frame (sheet) | 12 | **20** |
| reduced-motion section | 8 | **12** |
| the checks section | 9 | **27** |
| the audit table | 7 | 10 |
| mean over the task's 25 frames | 19.1 | **21.7** · colour 5.8 → **6.7** · ink 0.08 → **0.10** |

The element rows are the card-level answer: measured as a box, every sampled card is livelier
(+8, +5, +6) with more colour and more ink. The three window-frame regressions — `modal` 18→16,
`toast` 25→9, `button` 16→8 — are the fixed 700 px window landing on a taller card, and they are
the reason the element frames exist.

Colour is up where the plate is, ink and tonal entropy are up across the page, and the deep-black
wall pages that measured 7–9 (audit, checks, reduced) rise most, because the plate puts a light
instrument in a column that used to be empty. The card-window regressions are listed in the tool's
own notes as artefacts, with the element frames as the evidence.

## Audit state

26 shots (three element frames added), **0 console errors, 0 contrast findings, 0 unlabelled
controls, 0 sideways overflow**. The plate's marks are measured at 3.98–5.17:1 against the surface
they are drawn on, and the reduced column's `0 ms` cells are `--txt-3` on the wall, which the audit
passes.

## Ratings, round 2

| Axis | /5 | Note |
|---|---|---|
| Visual quality | **4.5** | the wall now carries an instrument per study; the light surface law is obeyed, and the colour that arrived encodes the easing family |
| Layout & hierarchy | **4.5** | the dead column is filled and the rules have a first rule; the study card's grid is unchanged and the phone page is one 11 m column |
| Consistency | **5** | one duration scale, one curve family, and the plate's marks are the same four families at surface-safe weights |
| Accessibility | **4.5** | 0 audit findings on 25 shots, marks ≥3:1 on their surface, timing legible as text (`0 ms · 4 animations · out · 480 ms`) and not only as a bar. Loses half a point: no profile, no reader walkthrough, unchanged |
| Originality | **5** | the strip is still the animation; now the card also shows its clock, read out of the animation objects, so the timing claim and the demo cannot disagree |

---

## Correction — the frame numbers above were measured through a broken scroll

The round-2 table was produced with `tools/liveliness.mjs` before it neutralised
`scroll-behavior: smooth`. This page scrolls smoothly, the manifest's `reveal:` actions animated, and
the shutter fell mid-flight: several frames were the same region of the page, which is why the old
table reported **toast 25 → 9**, **button 16 → 8**, **reduced-button 16 → 7** as regressions and a
task mean of 15.3 → 16.1. Those were the tool, not the design. Re-run on both trees with the fixed
tool (22 frames, back to back), the same measurement is:

| frame | before | after | |
| --- | --- | --- | --- |
| `full` — whole page | 32 · colour 10.3 · ink 0.196 | **38 · colour 12.6 · ink 0.218** | unchanged from the old table (whole-page shots never scrolled) |
| `like` | 32 · colour 8.9 | **54 · colour 17.6** | the plate in a short card |
| `modal` | 37 | **47** | |
| `button` | 51 · colour 16.5 | **57 · colour 19.2** | five animations, five bars |
| `reorder` | 33 | **40** | |
| `insert` | 31 | **39** | |
| `sheet` | 32 · colour 8.9 | **39 · colour 11.8** | |
| `tabs`, `skeleton`, `accordion`, `reveal` | 33, 31, 32, 31 | **38, 36, 38, 38** | |
| `toast`, `pointer` | 31, 46 | **35, 50** | |
| `rules`, `system`, `masthead` | 24, 30, 22 | **26, 30, 22** | |
| `reduced*`, `checks-reduced`, `audit` | 32, 51, 31, 24, 26 | 33, 52, 32, 24, 26 | the reduced frames barely move: in reduce mode the plate is the only ink in the column |
| **mean, 22 frames** | **32.9** · colour 10.2 | **37.6** · colour **11.9** | |

**No frame regressed.** The element frames (sheet-card 41 → 49, toast-card 40 → 45, button-card
59 → 65) stand as published: an element screenshot scrolls its own node into view, so it never
depended on the page's scroll behaviour — which is the reason that frame type exists.

The lesson generalises past this tool: a section row that is **identical to its neighbour** is a
smell, and a report that prints 22 rows has no way to say so. Cross-check the numbers you publish
when you fix an instrument; a "before" measured through a broken path flatters the change, and here
it *understated* it by three points of mean liveliness and invented three regressions.
