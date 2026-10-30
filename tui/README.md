# tui — six terminal apps on the Strata FP4 character grid

Six TUIs, six different jobs, one shared kit and no build step. The point of the shelf is to find
out how much range a single character grid has: same cells, same renderer, six pages that do not
look like relatives.

| # | page | the job it is doing | shape | box dialect | face | palette |
|---|---|---|---|---|---|---|
| 1 | [`1-monitor/`](1-monitor/) | btop-style system monitor | four panels + a process table | rounded light | JetBrains Mono | midnight / phosphor / graphite (three themes, `t`) |
| 2 | [`2-mail/`](2-mail/) | mutt/aerc mail reader | three columns, no frames | rules + a focus gutter only | IBM Plex Mono | solarized dark |
| 3 | [`3-files/`](3-files/) | ranger + lazygit: tree, preview, index | three panes, one focused | heavy corners, `┏━┓` | Fira Code | gruvbox dark hard |
| 4 | [`4-player/`](4-player/) | ncmpcpp music player, tracks generated live | two columns, stacked panels | light corners, unframed visualiser | Space Mono | nord |
| 5 | [`5-ops/`](5-ops/) | k9s/Grafana services and logs | tile row + stream + alert rail | heavy tiles inside light boxes | Roboto Mono | dracula |
| 6 | [`6-editor/`](6-editor/) | vim-style modal editor | tabs, gutter, buffer, sidebar, status | **no borders anywhere** | Anonymous Pro | catppuccin mocha |

Density runs from `5-ops` (a 167×44 grid with a log line every 420 ms) down to `4-player` (137×39,
deliberately airy, because a player with a dense playlist is a playlist app).

## What each one actually does

Nothing here is a mock-up with dead keys. Every page changes state through its real handlers, and
`window.tui.state()` is the app's own state, not a rendering of it — the checker reads that back.

- **pulse** — simulated CPU/memory/net/disk, per-core eighth-block bars, a process table you can
  sort (`s`), filter (`f`), inspect (`Enter`) and kill (`K`, and it really goes away). `p` freezes
  every counter; `1`–`4` move the keyboard focus between panels; `t` cycles three themes.
- **post** — six maildirs, unread counts, threads, a reader with a quoted history and an envelope
  footer, `r` replies with a header block you type into, `d` deletes to trash with an undo, `/`
  filters the folder, `g` brings in a message that was not there.
- **rig** — a tree with git status glyphs and sizes, a preview with a real tokenizer for
  js/json/css/md/svg and block art for the two binaries (labelled as art, not as a thumbnail), and
  an index: `space` stages, `c` commits what is staged, `d` discards, `R` dirties the tree again so
  there is always something to do.
- **wave** — the tracks are patterns (root, scale, bpm, drum weight) and a WebAudio graph plays
  them: square arpeggio, triangle bass, noise hat, scheduled a fifth of a second ahead of the audio
  clock. The spectrum is that graph's own `AnalyserNode`. Where the output is blocked — headless
  Chromium is — the same pattern drives a synthetic spectrum and the page says `synthetic` in the
  status line rather than pretending.
- **grid** — service tiles with p95 sparklines, a log stream that follows the tail *until you scroll
  up*, severity filters, a search, alerts you ack (`A`), and a service you can restart (`r`) that
  comes back through `starting` and writes its own startup line.
- **quill** — modes (normal, insert, visual-line, search, ex), motions (`hjkl w b 0 ^ $ gg G`),
  operators (`dd dw x D yy p P > <`), `u`/`Ctrl-R` against whole-line snapshots, `/` with every hit
  underlined, and an ex line where `:w`, `:q`, `:wq`, `:e <name>` and `:<number>` do what they say.

## Seeing them

Plain static files, no build step, no npm, relative paths throughout — but each page is an ES
module importing `shared/tui.js`, and a browser refuses to import a module over `file://`. So open
them over http, which is how Pages serves them anyway:

```bash
node design/tools/serve.mjs                   # serve the repo root, then open /tui/
# or: python3 -m http.server            — any static server will do
```

Keyboard: press `?` on any page for the key map, `q` to quit (each page prints what it did — lines
acked, tracks played, saves — then offers `r` to restart).

**Phone**: one column at a time. The wide layouts collapse to tabs (`1`–`3` on the keyboard, a tap
on the tab), the key map becomes a row of buttons under the grid, hit regions turn rows, tabs, seek
bars and tiles into taps — a tap calls the same handler as the key, so it cannot drift. Tested at
390×844, and at 320×568 the kit clamps to a minimum column count rather than letting a panel
vanish.

## The check

```bash
cd tui/tools && npm install          # playwright-core only, pinned
tui/tools/summarize.sh               # every page × 3 widths, one line per pass
node tui/tools/check.mjs 5-ops       # one page, full JSON
node tui/tools/check.mjs --all --skip-phone
KEYS=j,j,l VIEW=390x844 node tui/tools/probe.mjs 4-player   # print the grid as text
node tui/tools/font-probe.mjs        # which faces can actually draw the box set
```

Per page it requires: the `window.tui` hook; a non-blank grid (≥ 6 % of cells with ink and ≥ 18
distinct glyphs, so an empty shell fails); **no console, page or network errors — a `draw()` that
throws once fails the page**; no sideways overflow and no grid below the fold.

Then the input, at 1280×800, 390×844 and 320×568: real keys, real taps and real poses
(`window.tui.api.…`), after which `state()` is read back twice. The kit's own counters
(`frame`, `keys`, `taps`) and a live app's clock are stripped before comparing, because a monitor
moves those by itself and a check that passes on them is not a check — and each scenario then names
the fields its input must have landed in (`commits: 9`, `top: "staged test"`, `acks: 1`,
`theme: "phosphor"`, `tab: 2`), so a key that does nothing fails the page instead of passing it.
One of those expectations is a literal space: the files scenario types a commit subject with a word
boundary in it, because the key layer used to eat the space and nothing else noticed.
Screenshots land in each design's `shots/`. Latest run: **18/18 passes** (6 pages × 3 widths).

The glyph audit is the one that earns its keep. A webfont that does not carry `┌` or `█` does not
fail: the browser takes that glyph from a fallback face, the advance width changes, and the grid
drifts out of alignment one column at a time. It measures the advance of every character on screen
against the loaded cell and fails the odd one out. It found three candidates that look fine and are
not — Inconsolata and Martian Mono carry no box drawing at all, Ubuntu Mono has none of the blocks,
arrows or boxes (72 of the set fall back). `font-probe.mjs` is that measurement on demand; the six
faces above are the ones that survived it.

## Verdict on Strata FP4

**What it got right, and I mean the model and not the harness.** The parts that are *reasoning*
came out right on the first pass and did not need to be revisited: the character-grid model itself
(buffer + style id + a class per style, one `innerHTML` write per frame), the key handling, the
undo design (whole-line snapshots rather than an inverse-operation log — boring, and correct under
every sequence I threw at it), and the habit of exposing `state()` so a check can read the app
instead of the picture. The six briefs did not blur into six copies of one layout either: the mail
reader really has no frames, the editor really has no borders, the ops board really is the densest,
and the palettes are six different families rather than one palette six times. Data honesty is
better than I expected from a small model — the player says `synthetic spectrum` on a machine that
cannot hear it instead of showing a decorative wiggle, and the file manager labels its binary
preview as art from a name rather than a thumbnail.

**What it got wrong, by file.** Two classes, and both are the same failure: it wrote code that
*looked* finished and never looked at the result.

1. **Silent fallbacks.** `4-player/player.js` and `6-editor/editor.js` shipped with Inconsolata and
   Ubuntu Mono, both of which lack most of the box-drawing set; the pages rendered and "looked
   fine" in a screenshot until the grid was read back as text and the columns were visibly wrong.
   Same for the fonts loading late: `document.fonts.ready` resolves before a CDN face has been
   requested, so the first measurement of the cell was taken against the fallback font — the grid
   was laid out at the wrong width and only some glyphs disagreed with it. `shared/tui.js` now asks
   for the faces by name, waits, and re-fits.
2. **Empty frames and colliding status lines.** Every page except `1-monitor` and `5-ops` first drew
   its panels into the top third of the screen and left the rest of the frame empty — a TUI is a
   fixed frame, so "the data ran out" is a bug, not a look. The status lines were worse: each page
   hand-counted x positions, so at phone widths the right-hand hint printed *over* the state fields
   (`vol 70%shuffle onrepeat offviz space play…`). The fix is `tui.js`'s `status()`, which lays out
   fields, drops the hint whole when it cannot fit, and cannot overlap by construction. `3-files`
   also had a `TypeError` thrown from `draw()` on every frame — a `"open"` flag left inside a
   children array — which the pre-fix checker would have waved through because the page still
   painted.

**What the review round found, after the sweep was already green.** A fresh reader with the brief and
the diff found seven more bugs, all of them the same shape as the first batch — plausible code that
had never been driven:

- `Ctrl-R` in the editor was not in the kit's blocked-key list, so the browser reloaded the page and
  the unsaved buffer went with it. Every `C-<letter>` is blocked now.
- The key layer renamed `" "` to `"Space"`, and the pages matched on `" "` — so the space bar did
  nothing anywhere: staging in the file manager was dead, and no space could be typed in any field,
  commit subject, search or buffer. The chip that said `␣ stage` never worked either.
- Two `case "g"` labels in the mail reader: the first one (`jump to top`) shadowed the second, so
  sync — and the `g sync` chip — could never run.
- Theme switching wrote each theme into the *same* object, so after one full cycle "midnight" came
  back tinted with graphite. A palette is now replaced, never merged.
- On a phone, composing a reply drew the message list instead of the draft: you typed into a pane
  that was not on screen. And no page could have taken text from a soft keyboard at all, because a
  grid of cells is not an editable element — text fields now open a real `<input>`/`<textarea>` over
  the grid on a phone, while the keyboard path stays key-by-key.
- `?` was taken by the kit before the page saw it, so it could not be typed into anything, and
  Shift — which you must press to produce it — arrived as its own key and was fed to the editor as
  if it were a motion.
- The shelf page's README link pointed at the *root* README, which Pages never deploys: a 404 on the
  one page that tells you where the verdict is.

**And one in the check itself.** `state()` always contains the kit's `frame` counter, which ticks at
8–12 fps, so "the state changed after input" could not fail. That is why the file manager passed with
staging and committing both dead. The assertion now strips the kit's counters and compares the
fields each scenario names, which is the difference between a check and a screenshot.

**How much fixing it took.** All of it was me, the harness and a reviewer, not the model's second
opinion: asked to review its own pages it found nothing, and the sweep was green while four of the
six keyboards were partly dead. The number to quote is the checker's — 18 passes, 0 console errors,
all six glyph audits clean — and every one of those 18 runs got there only after a structural change.

**What I would not trust it to do without a human.** Anything where the spec is "looks right":
spacing, density, whether a panel should be there at all, whether a bar is convincing. It is
reliable for the machine-checkable half of a TUI — state, keys, buffers, undo, hit regions — only
when something drives those keys from outside and reads the result back. It wrote a keymap it had
never pressed and an assertion that could not fail, and both looked exactly right. The lever is the
check, but the check has to be adversarial: read the grid back as text, audit the glyphs against the
face, strip the counters that move by themselves, and name the field each keystroke is supposed to
land in. What survived "it renders" stopped surviving the first two; what survived "the state
changed" stopped surviving the third.
