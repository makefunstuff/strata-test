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

## Weights
The full desktop page is 10 642 px tall and the phone capture is 25 558 px,
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
