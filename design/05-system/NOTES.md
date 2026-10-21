# 05 · Design system — **Halyard**

## The brief

One component system, documented as a product: primitives, tokens, components,
patterns, rules, and a theme contract. Four themes, one component stylesheet.

## What is built

A single documentation page (`index.html`, `system.css`, `system.js`, no
framework, no build step) over **four themes** — `paper` (Foldline, the map
sheet), `deck` (Gridwatch, the control tower), `field` (Ternmark, the phone
app), `terminal` (logtrail, the TUI) — and **24 components**: button, icon
button, input, textarea, select, checkbox, radio, switch, slider, tabs,
accordion, menu, table, pills/tags, avatar, progress, skeleton, empty state,
breadcrumbs, pagination, toast, alert, tooltip, dialog. Five patterns: filter
bar, sortable table with an empty state, a form that validates, a destructive
dialog, toast + live region + progress.

The page **measures itself in the browser**. `system.js` sets a probe element's
`color` to each token, resolves the computed colour of token pairs, and prints
the contrast ratio next to the pair it belongs to. Switching theme re-measures
everything: the swatch grid, the summary line, the token table, the motion
durations. Nothing in the page is a declared number.

## The architecture, in one rule

A theme re-assigns **only**: colour roles (including every soft fill), the three
type faces, the line-height ratio, the radius scale, the three elevations, and
the four durations. Below the theme blocks the component CSS is allowed one
vocabulary — `--surface`, `--ink`, `--accent`, `--ok`, `--data-1`, `--r-md`,
`--dur-2`, `--font-mono` — and never a literal colour, face, radius, shadow or
duration. `system.css` is 700 lines; the four theme blocks are the only place a
hex digit appears, and the kit renders them all.

The theme switch is therefore a real test. In `terminal`, every radius drops to
0–3 px, all three faces become JetBrains Mono, elevation becomes a 1 px rule
(someone has to say it: shadows are meaningless on a black field), and all four
durations become `0ms` — a terminal does not animate. Nothing below the theme
blocks moved to make that happen.

## The contrast contract, as pairs

The first version of the swatch grid measured each token "on surface". That
produced numbers nobody uses: `--warn-soft` scored 1.4:1 against the page, which
is fine, because nobody reads a fill — you read the word *on* it. The grid now
prints **22 pairs**, each with the foreground that really sits on that
background:

```
--accent-ink on --accent        the label on a primary button    4.5
--warn      on --warn-soft      a status word on its own fill    4.5
--accent    on --surface        a link on the page               4.5
--line-strong on --surface      an input's boundary              3
--focus     on --surface        the focus ring                   3
--data-1…4  on --surface        a 24 px series swatch            3
--surface-2 on --surface        a card against the page          1.05
```

Three of those are judgements worth naming. A link is **text**, so it clears
4.5:1, not the 3:1 people quote from the large-text rule. A hairline is not
text, and grading it 4.5:1 would turn every rule in the product to mud, so it is
graded 1.3:1 — visible, not loud. A card's background is not graded by WCAG at
all; this grades it at 1.05:1, because a tone step nobody can see is not
elevation.

Text pairs render as `Aa` in the real foreground on the real background.
Graphical pairs (a boundary, a ring, a swatch) render the object itself, so the
screenshot audit does not read a hairline as body copy.

## In use, at phone size

Section 10 shows four 390 × 844 panels — a map sheet, a control tower, a field
app, a terminal — authored at 150 px and zoomed ×2.6, built from the same bars,
rows, pills and numbers as the rest of the page. Each panel sets one
`data-theme` on its own root: four products, one stylesheet, visible side by
side.

## Self-critique: round 1 → round 2

| What the screenshots showed | Fix |
|---|---|
| `requestfailed` on the mono webfont | `@fontsource-variable/ibm-plex-mono` **does not exist** (404). IBM Plex Mono has no variable release; switched to the static package at 400/500 |
| `pageerror: r.querySelectorAll is not a function` — the theme bar did nothing | `$$` was called as a **template tag** (`` $$`#${id} button` ``), so the helper received a strings array. Now `$$("#" + id + " button")` |
| Screenshots in the wrong theme, one after another | The switchers persisted to `localStorage`, and the harness reuses one browser context — a docs page that remembers your theme wrecks the next screenshot. Persistence removed: the switches are per-visit |
| `--line-strong` at 2.62:1, `--line` at 1.26:1, field `--ink-3` at 4.29:1, the empty-state paragraph at 4.2:1 | Darkened the paper hairline pair, the field caption colour, and moved the empty-state explanation to `--ink-2` |
| The pressed segment loses its fill under the pointer (visible in every click shot) | `.seg button[aria-pressed="true"]:hover` keeps the accent fill — a control's state must not depend on the cursor |
| "Saving" measured at 3.38:1 | The busy state hid its label (`color: transparent`) and drew a spinner in its place. The spinner now **joins** the label; the label stays readable and `aria-busy` stays true |
| Motion durations were literals scattered over the kit (`transition: background .15s`) | Added `--dur-1…4` and `--ease`/`--ease-in` to every theme and rewrote the transitions; the terminal theme sets them all to `0ms`. The motion card prints the theme's own numbers |
| Phone: the control bar's labels floated off their switches; 26 px segment buttons | Each group is now `.grp` (label + switch), the bar is a two-column grid under 620 px, and `@media (pointer: coarse)` lifts the switches to 40 px and buttons to 44 px |
| **The page rendered twice**: `full.jpg` jumped from 5 095 px to 10 285 px tall | A string splice during an edit inserted a block using **stale offsets**, duplicating the document and silently dropping the phone section. Rebuilt `index.html` from the intact copy and added an integrity pass — every `$("#id")` in `system.js` and every `#id` in the manifest is now checked against the page's ids, and duplicate ids are listed |

Final run: **18 shots, 0 console/page/network errors, 0 low-contrast findings,
0 unlabelled controls, 0 duplicate ids, 22/22 contrast checks passing in each of
the four themes.**

## What is still weak

- **Documentation lives in JS.** The component grid, the rules table and the
  token table are rendered from arrays in `system.js`. The page is honest and
  live, but a crawler sees an empty `<div id="kit">`, and a reader with JS off
  gets the tokens section only.
- **The audit is narrow by design.** 22 measured pairs, accessible names, focus
  ring presence, landmarks. It does not check focus order, target size, heading
  order, `aria` validity, or reflow at 400 %. The page asserts exactly what it
  measures, which is the right posture and a smaller guarantee than "WCAG AA".
- **Density is a padding multiplier.** Real dense modes shorten rows, drop
  subtitles and change the type scale; `compact` here tightens spacing only.
- **The dark themes' elevation is a 1 px inset rule**, which reads as a border.
  Menus and dialogs in `deck` separate from the page by colour, not by depth —
  defensible for a control tower, thin for a marketing surface.
- **`paper` and `field` are cousins** (both warm, both moss). Four themes that
  argue with each other would show off the contract better.
- No forced-colours mode, no print stylesheet, no tests in CI.

## Ratings

| axis | /5 | why |
|---|---|---|
| Visual quality | 4 | The paper/deck/terminal skins are strong; the documentation layout is calm and dense, the swatch grid is beautiful at 8-up |
| Layout & hierarchy | 4 | Ten sections, a sticky contract bar, a nav that tracks the section; the kit grid runs long and the components/patterns boundary is arbitrary |
| Consistency | 5 | The theme-agnostic layer is the point of the task and it holds: 24 components, four skins, zero per-component colour |
| Accessibility | 4 | 22 contrast pairs measured in the browser per theme, real controls, labelled switches, focus ring everywhere, dialog with a trap; no focus-order, target-size or ARIA validation |
| Originality | 4 | The pair-based, self-measuring colour contract and the terminal theme's `0ms` motion are mine; the themes are derivatives of tasks 01–04 rather than a new visual idea |
