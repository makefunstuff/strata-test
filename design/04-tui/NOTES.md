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
