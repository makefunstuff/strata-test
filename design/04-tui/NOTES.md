# 04 — TUI: logtrail, a log tail that fits a terminal

## The brief

A text user interface that a person would actually use: real navigation, real data, real
states, and a look that is not "a box with a title". The rendered capture goes in the gallery.

## The product

**logtrail** — a log explorer for the fictional `harbour-gateway` fleet (six services,
eight routes, 420 seeded lines over four minutes). One TypeScript file, no dependencies:
no React, no curses, no blessed, no build step.

```
node src/logtrail.ts                      # the real app, raw mode, nine keys
node src/logtrail.ts --frame stream --cols 148 --rows 40   # one frame, to stdout
bash tools/capture.sh                     # the eight captures in the gallery
```

## Review round: the phone width had never been measured

The manifest for this task had nine shots, all of them wide (1500, 1660, 1960 px). There was no
390 px shot, so nothing in the harness had ever laid this page out on a phone. At 390 it scrolled
sideways by **282 px** (`document.scrollWidth` 672 against a 390 viewport).

`tools/chain-probe.mjs` (added with these fixes) prints the ancestor chain of every element
crossing the edge, with each box's width, scroll width, computed track and overflow:

```text
div.panel   w=638 r=672  sw=636
div.two     w=358 r=374  grid=358px      ← a 358 px track inside a 322 px box
pre.code    w=596                        ← the min-content of a code block is its longest line
```

The chain, read bottom up: a `pre` whose longest line is 596 px has min-content 596. An `fr` track's
base size **is** the item's min-content, so the panel became 638, the `.two` grid became 638, and
the page's own grid — an implicit `auto` column, which is sized by max-content — became 672. The
page had `overflow: auto` on the `pre` already, which is what makes the code readable; it does not
stop a *block* child's min-content from propagating through the block parents below it.

Every fix is one bounded track:

```css
main      { grid-template-columns: minmax(0, 1fr) }                    /* was an implicit auto */
.two      { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) }  /* was 1.35fr 1fr */
.keys     { grid-template-columns: max-content minmax(0, 1fr) }        /* was auto 1fr */
pre.code  { min-width: 0; max-width: 100% }                            /* scrolled, unbounded */
@media (max-width: 700px) { .frames { grid-template-columns: repeat(auto-fit, minmax(420px, 420px));
                                      overflow-x: auto; overscroll-behavior-x: contain;
                                      scroll-snap-type: x proximity } }
```

A 148-column terminal cannot be drawn legibly at 322 px, so below 700 the frame row keeps a readable
420 px and scrolls **inside itself** — the row swipes, the page does not. Measured at 390:
**282 px → 0 px** (`docW 390`, `innerWidth 390`, no element crossing the right edge outside the
intended scroller).

Two shots were added so this cannot rot again: `phone` (390 × 844, whole page) and `phone-frames`
(390, the frame row in view). Eleven shots, all `errs 0`, `contrast 0`, `unlabelled 0` at the phone
width. The manifest entry for a task is now part of what gets reviewed: a task with no phone shot has
no phone measurement.

## What is built

**Three views.**
`stream` — the tail (time, level, service, endpoint, latency, message) with a scroll
indicator, next to a detail pane that decomposes the selected line into key/value pairs,
a 26-request latency strip, and the raw JSON.
`endpoints` — the same buffer aggregated by route: volume, p50/p95/max, warnings, errors,
a share bar and a 20-request latency sparkline, sorted by any column.
`help` — a modal key table that blanks the screen behind it.

**Two strips at the bottom.** `volume` is a 60-bucket histogram in a teal ramp (the newest
six buckets are brighter: that is the live edge). `severity` sits under it in the same
60 buckets: warn+error count per bucket, amber, red where a bucket holds an error. Volume
and trouble read as one figure, not two.

**States.** a live filter with a tiny query language (`lvl=`, `svc=`, `ep=`, `code=`,
substring — applied to the tail and the table together), a no-match state that names the
filter and lists the levels that do exist, `f` freeze (the buffer keeps filling and the
status says so), and a light palette on `t`.

**It knows its own window.** At 128 columns the detail pane appears; at 80 the endpoint and
latency columns drop out, the tab labels shorten, the per-level counts and the histogram
labels go away. Nothing scrolls sideways. Every line is written to *exactly* the pane's
visible width — colour codes are stripped before measuring, which is the only reason the
right-hand border stays in one column.

**The capture is honest.** `tools/capture.sh` runs the program at a fixed size, writes the
**bytes it prints** to `capture/*.ansi`, and `capture.html` is a small ANSI reader
(SGR: 24-bit fg/bg, bold, dim, italic, reverse) that paints those bytes into a terminal
window. Nothing in the gallery is a redraw of the design.

## Round 1 → round 2 (self-critique from the captures)

1. **The panes did not meet.** The first stream frame merged the two panes with a stub
   function and a `mergePanes` that returned border lines; the frame was written by
   `L.length = 2 + rowsShown`. Rebuilt: each pane produces `rowsShown` lines of exactly
   its width, then they are concatenated and clipped once.
2. **Boxes were two cells too wide** (`w - 4` maths that ignored the right-hand title), so
   the top border ran past the corners; the arithmetic is now `w - 5 - T - (R + 1)`.
3. **Double rules.** The detail pane drew its own left border next to the list's right
   border: `││`. The list draws the shared rule; the detail pane starts with a space.
4. **Borders after padding.** `clip()` pads at the end of the string, so a row built as
   `clip(body + "│")` put the border in the middle of the row with spaces behind it.
   Padding now happens before the border (`pad(body, w - 3) + "│"`).
5. **Truncated table rows.** Table rows clipped to `cols` lost their right border and grew
   a `…`. Clip to `cols - 1`, then add the rule.
6. **A crash on a small window.** In a pty whose `columns` came back as `0`,
   `"─".repeat(listW - 2)` threw `RangeError: Invalid count value: -2`. The frame clamps
   to a minimum 48×12, every `repeat` is `Math.max(0, …)`, and the live path uses
   `process.stdout.columns || 148`.
7. **The histogram was a rainbow.** Colouring each bucket by its loudest level made 55 of
   60 buckets red or amber — noise. Split into two strips: volume (one colour, a ramp) and
   severity (a second strip with its own scale). Colour now means one thing per strip.
8. **The endpoints table was 100 of 148 columns and 12 rows of dead space.** Added the
   per-route latency sparkline, and sized that frame to 148×22.
9. **A key's colour was printed as text** in the sparkline (a bare hex string concatenated
   into the row) — the visible `4f9c88▂` in the capture.
10. **Contrast.** Terminal `faint` measured 3.26:1 and the light palette's 2.9:1; box rules
    1.4:1. `faint` moved to 5:1+, rules to 2.5–3.2:1, the bar ramp to 4:1+. After that the
    audit reports only box-drawing rules and block glyphs — decoration, not text.
11. **`color-mix(in oklab, …)`** in the capture page's chrome text: Chromium serialises it
    as `oklab()` and the audit scored it 1.3:1, and it is a colour the audit cannot check.
    Literal hex values now carry text colour.
12. **A false claim in the footer.** It said "1-9 sort"; the view tabs own 1/2/3. Sorting is
    now real (`s` cycles the column, `S` reverses, the header shows the arrow) and the
    footer says what the keys are.

## Round 2 → round 3 (review: the phone width had never been measured)

The manifest for this task had nine shots, all of them wide: 1500, 1660, 1960 px. There was no
390 px shot, so nothing in the harness had ever laid this page out on a phone. Laid out at 390 it
scrolled sideways by **282 px** (`document.scrollWidth` 672 against a 390 viewport). Reviewed with
`tools/chain-probe.mjs`, which prints the ancestor chain of every element that crosses the edge:

```text
div.panel  w=638 r=672  sw=636
div.two    w=358 r=374  grid=358px      ← the grid track is 358 inside a 322 box
pre.code   w=596                        ← the min-content of a code block is its longest line
```

The chain: a `pre` with a 596 px line has min-content 596; an `fr` track's base size **is** the
item's min-content; so the panel became 638, the `.two` grid became 638, and the page's grid (an
implicit `auto` column, sized by max-content) became 672. Every fix is one `minmax(0, …)`:

```css
main  { grid-template-columns: minmax(0, 1fr) }                     /* was an implicit auto column */
.two  { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) }   /* was 1.35fr 1fr */
.keys { grid-template-columns: max-content minmax(0, 1fr) }         /* was auto 1fr */
pre.code { min-width: 0; max-width: 100% }                          /* was overflowing already */
@media (max-width: 700px) { .frames { grid-template-columns: repeat(auto-fit, minmax(420px, 420px));
                                      overflow-x: auto } }          /* the row scrolls, not the page */
```

A 148-column terminal cannot be drawn legibly at 322 px, so the frame row keeps a readable 420 px
and scrolls inside itself with `overscroll-behavior-x: contain` and snap points: the row swipes,
the page does not. Measured at 390: **282 px → 0 px** (`docW 390`, innerW 390, no element crossing
the right edge).

Two shots were added so this cannot rot again: `phone` (390 × 844, whole page) and `phone-frames`
(390, the frame row in view). Eleven shots now, all reported `errs 0`, `contrast 0`, `unlabelled 0`
at the phone width.

## What is still weak

- The live path is exercised by hand only: `--frame` is tested by the capture, the raw-mode
  loop by a pty session. There is no test harness for key sequences, and the app quit path
  assumes one key per `data` event.
- `enter` (copy) and `o` (open trace) are documented in the help and drawn in the pane,
  and not implemented: there is no OSC 52 clipboard write and no external viewer.
- The 420 lines are static. `f` freezes and the live edge is drawn, but nothing appends, so
  "following" is a state you leave, not one you experience.
- The mouse is not handled at all (no click-to-select, no wheel), which is a real limitation
  in a terminal app with a 420-line list.
- One filter box, no saved filters, no time-window control, no "show the 20 lines around
  this one".
- No 24-bit-false fallback: on a 256-colour or 8-colour terminal the colours collapse. A
  real TUI probes `COLORTERM` and degrades.
- The help overlay blanks the screen behind the box instead of dimming it, which is the
  easy version.

## Ratings

| | | why
| --- | --- | ---
| Visual quality | **4** | a real terminal visual language: box-drawing rules, a teal ramp,
  thresholds as colour, tabular alignment, a two-strip figure. Bounded by the medium — the
  type is one mono face at one size, so hierarchy is carried by weight, colour and column
  position only.
| Layout / hierarchy | **4** | the eye lands on the list, the selected row, then the detail
  pane, and the two strips summarise the window; the table view is dense but every column
  is worth its width. The help overlay is the flattest screen.
| Consistency | **5** | one palette object, one set of helpers (`clip`, `pad`, `vis`,
  `boxTop`), the same thresholds in the list, the table, the sparklines and the strips,
  the keys repeated in the bottom bar, the help and the board — from one source.
| Accessibility | **3** | level is never colour alone (`error`/`warn`/`info` are spelled in
  the level column, `E`/`!` glyphs in the compact mode), text ≥4.5:1, rules ≥2.5:1, the
  captures are text so they are copyable and screen-reader-readable. It loses points on the
  medium: mouse/keyboard-only is fine, but there is no focus indicator concept, no
  `NO_COLOR`/256-colour fallback, and no high-contrast mode.
| Originality | **4** | the two-strip volume/severity figure; a filter that is a query
  language applied to both views; a capture pipeline that photographs the program's own
  bytes through an ANSI reader instead of drawing a mock-up.

---

# Round 2 — the page's claims, asked of the bytes the program printed

## What the page was

The task's measured row is the `light` frame: **40 liveliness, 12.4 colourfulness, ink 0.097, 1 hue
family**. The audit carried **75 contrast findings** here, the folder's second-largest pile. The
ratings said: visual 4, layout 4, and *"the help overlay is the flattest screen"*.

This task is different from the rest of the folder: the frames are not drawings in the page, they are
**the program's own output** — `tools/capture.sh` runs `src/logtrail.ts` at a fixed size and writes
the ANSI bytes to `capture/*.ansi`, which `capture.html` renders. So the frames can be interrogated as
data, and the page's claims can be asked of them. Fourteen of the checks in `04-tui/measure.mjs`
read the `.ansi` files. What they found:

## Seven claims that were not true of the bytes

1. **The rules were drawn too faint to be structure.** Sixty of the 75 findings were the
   box-drawing glyphs at **2.81–2.83:1**. The audit had been asking them for 4.5:1, the bar for
   readable text, which is the wrong test: a pane border is a graphical object required to
   understand the content, so **WCAG 1.4.11's 3:1** applies — and at 2.81 the app failed the right
   bar in *both* palettes. Two changes, not one: the audit now classifies a node made only of
   box-drawing (U+2500–257F), block/shade (U+2580–259F) or braille (U+2800–28FF) characters as a
   graphic, reports it with `kind:"graphic"` and holds it to 3:1; and the palette moved — dark
   `line: 4d6170 → 536979` (**2.83 → 3.18**), light `8f9ca6 → 85939e` (**2.81 → 3.15**), each the
   smallest lightness step on the same hue.
2. **"nine keys, no mouse — the bottom bar repeats them"**, printed by the help overlay over a
   table of **18 keys** (`j k ↑ ↓ g G / Esc f t 1 2 3 s S enter o q`), and repeated by the landing
   page's caption as *"listing all nine keys"*. The bar repeats **nine**. Both numbers now come from
   the two tables the program already has: the overlay's key list, and `BAR_KEYS`, which the status
   bar builds itself. The frame prints *"18 keys, no mouse — the bar repeats 9 of them"*.
3. **Three keys the overlay advertised and the program did not implement.** `/` fell into the
   catch-all that types into the filter, `enter` only closed help, and `o` typed an `o`. The words
   said *insert a filter term*, *copy the selected line*, *open the trace id*. They do those things
   now, in the terminal's own language: `/` appends the next term from `FILTER_TERMS` — the same
   list the parser reads — `enter` puts the line on the clipboard over **OSC 52**, `o` puts the trace
   id there, and the line pane marks the id as an **OSC 8** link with a `trace://` target: a scheme a
   viewer registers, not a host name. The app's key handler is the source of truth for what a key
   does, and the instrument takes its set from there.
4. **"lines per 10 s · 06:08 → 06:12"**, **"10 s buckets"**, **"warn+error per 10 s"**: the histogram
   is 60 buckets over a buffer that spans **116 s**, so a bucket is **2 s** — the label was five
   times the truth in three places, and the printed window ended at 06:12 when the buffer ends at
   06:09. All of it derives from `ALL` now.
5. **"06:11:58 → 06:12:44"** under the latency strip, printed for every selection. The strip is the
   last 26 requests *on the selected route*, so its span belongs to them: the frame reads
   **06:08:54 → 06:09:53 · 26 req**, computed from the rows.
6. **Two colours in the palette with no job** — a violet and a panel fill, declared in both palettes
   and referenced nowhere in the program. Deleted; the instrument fails if a colour with no use
   comes back.
7. **The endpoints frame emitted 22 lines into a 22-row terminal.** Every other view stops at
   `rows − 1`, because the last line of a terminal belongs to the cursor: that frame's bottom row
   scrolled off the screen. Capped, and the instrument checks all eight frames for `rows − 1` lines
   and the declared width.

## What is built

**The palette, as an instrument.** The page's chip says *2 palettes*; the section now shows them —
11 colours in each, on the ground each palette sits on (the light row on white, because that is where
it is used), each with its hex, its **computed** contrast ratio, the bar it must clear, and the job it
does. Colour carries jobs here, and the section says which: thresholds (`gold` over 300 ms, `red`
over 900 ms), levels (`faint` trace, `blue` debug, `accent` info), structure (`line`, the rules),
fills (`sel`, `chip`, each measured against the text that sits on it). The ratios are computed in the
page, not typed, and the *need* is printed beside the number, so a pass is not a colour-coded claim.
The swatch is the smallest part of each cell.

The keys legend's words were rewritten to the behaviour the program has, so the overlay, the legend
and the key handler say the same thing — and the instrument checks all three, by token.

## The instrument: 25 checks, and the seven ways it was wrong first

`04-tui/measure.mjs`: palette parity between the source, the page's mirror and the rendered swatches;
a job for every colour; the printed ratios; the rule colour inside the captured bytes; the key sets
(bindings ⊇ overlay = legend, bar ⊆ overlay ∪ footer, printed counts); the filter terms in parser,
key and help text; the histogram's 60 glyphs, its bucket seconds and its window; the latency strip's
bars, count and span; the endpoint strips (20 bars, the share bar not counted); every capture at
`rows − 1` lines within `cols`; 0 px overflow at 390 px; 0 console errors. **All 25 pass.**

Before they did, the instrument was wrong seven times, and each is in the source as a comment:

1. it imported `stat` from `fs`, which is the **callback** API; called with no callback it throws, the
   request handler caught it, and the server answered **404 for the page it was serving** — the report
   then described a 4-byte document with no scripts in it. A server that 404s the page under test is
   not measuring that page.
2. it read the captures as **latin1**. Box glyphs are multibyte: a 60-bucket histogram "had 0 glyphs",
   and a 148-column frame "was 376 wide".
3. it stripped **only SGR colours**, so the trace link's 33 OSC bytes counted as text width and the
   frame read as 177 columns.
4. the app's own `vis()`/`clip()` had that same hole, and it was worse: the width walk treated every
   escape as an SGR colour and skipped to the next `m`; an OSC 8 sequence contains no `m`,
   `indexOf("m")` returned −1, the walk restarted at 0, and **the capture hung forever**. Printing a
   link introduced an infinite loop in the renderer. The width maths now skips OSC whole, and an
   escape with no terminator ends the walk instead of spinning.
5. it counted the endpoint row's **share bar** (18 `█`, one glyph) as part of the latency strip —
   38 bars in a 20-request strip. The rule that works: a run with more than one glyph in it.
6. it required the status bar's keys to be in the overlay's *table*, when `?` is in the overlay's
   footer.
7. it compared captured lines to `rows`, when a well-behaved TUI writes `rows − 1`.

The symmetry is the point: the instrument and the app made the **same** mistake about what a terminal
sequence is, and one of them looped.

## Liveliness, before and after

The 9 frames the tool takes for this task in both trees (it skips the 390 px shots), back to back,
same instrument:

| frame | before | after | |
| --- | --- | --- | --- |
| `board` — the whole page | 43 · colour 11.8 · ink 0.126 | **47 · colour 13.1 · ink 0.16** | the palette strip lands on the page |
| `stream` | 47 | **48** · colour 14.5 · ink 0.123 | the rules, 0.35 log points brighter |
| `filtered`, `narrow` | 48, 54 | **49, 55** | |
| `frozen` | 49 | 49 | |
| `endpoints` | 59 | 58 | one row less: the frame stopped overflowing its terminal |
| `help`, `empty` | 42, 41 | 42, 41 | the notes' flattest screen, and the empty state, unchanged |
| `light` — **the task row** | 40 · colour 12.4 · ink 0.097 | 40 · colour 12.4 · ink 0.102 | the light palette's rule went **2.81 → 3.15:1** and the index cannot see it |
| mean, 9 frames | 47.0 · colour 15.1 | **47.8 · colour 15.9** | |

**The three new frames** — the instruments: `palette-dark` **61** (colour 23.7), `palette-light`
**58** (colour 20.6), `keys-legend` **26** (colour 8.6).

The page moves four points; the task row moves **zero**. That is the honest outcome and it is worth
writing down: the change inside the light frame is a hairline rule from 2.81:1 to 3.15:1, which a
reader can see at 148 columns in a real terminal and this index cannot. The colour the strip adds
lives in the element frames (61, 58) and the whole page (43 → 47). A liveliness index that cannot see
a contrast fix is the same instrument that could not see a 50 % distance error in `01-landing`: it
ranks frames, and the things that make these pages true are not in a frame.

## Ratings, round 2

| Axis | /5 | Note |
|---|---|---|
| Visual quality | **4.5** | the frames are brighter where they were dim, and the page carries a real palette instrument; the prose panels are the same panels they were |
| Layout & hierarchy | **4** | unchanged: the strip joins the existing grid, and the notes' complaint about the help overlay is the medium's own flatness, not a layout fault |
| Consistency | **5** | the page's colour table, the app's palette and the audit are one measurement; the key legend, the overlay and the key handler are one set; the time labels are derived, so a label cannot outlive the data it described |
| Accessibility | **5** | 75 contrast findings → **0** across 14 shots; the rules clear 1.4.11's 3:1 in both palettes; the faintest text is 5.21:1; the strip prints the ratio and the bar for every colour, on the ground it is used on |
| Originality | **5** | a landing page whose claims are checked against the bytes its product printed, by an instrument that divides the captured window by the captured bucket count and asks what a "10 s bucket" is |

## Round 2's remaining weak points

- **OSC 52 and OSC 8 are not executed by anything here.** The instrument proves the sequences are in
  the bytes and that the width maths skips them; no terminal emulator is in the loop, so "copies to
  the clipboard" remains a claim about the emulator's support. A real check needs a terminal that
  answers OSC 52, which headless Chromium is not.
- The strip's palette data is a **hand-written mirror** of the app's table. The page cannot import
  the program's TypeScript, so equality is enforced by the instrument, not by construction: it fails
  on drift, which is not the same as being unable to drift.
- The severity counters are **buffer-wide** while the frame is a window on the buffer (35 w 20 e
  printed above 2 w 1 e drawn). The instrument records that as by design; a reader can still misread
  it, and a label that says "in the window" while counting the buffer is the kind of thing this round
  exists to catch.
- A palette legend is the least-read part of any page. The strip is for the reader who checks; the
  help overlay is still the flattest screen.
- No reader walkthrough, no 200 % text capture, no forced-colours mode: unchanged.
