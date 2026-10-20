# 11 · Style range — one brief, nine visual styles

## Brief

One page, nine times. The task: take a single product brief and render it in at
least eight clearly distinct visual styles — not recolours, styles — then say
honestly how faithful each one is and how good each one is as a page.

The subject is **Ternmark**, a fictional offline-first birding log (a product
invented for task 03 and reused here on purpose, so the copy is somebody else's
problem and not this task's). The page is its home page: a headline, a lede,
three features, three statistics, a quote, two plans, and a release-notes
sign-up form.

Nine styles: Swiss / International Typographic, brutalism, editorial magazine,
glassmorphism, neumorphism, pixel / 8-bit, Japanese minimal, cyber / heads-up
display, luxury.

## Built

`design/11-styles/` — 12 HTML files, 11 CSS files, one content file, three
scripts, 43 screenshots.

| File | What it is |
|---|---|
| `content.json` | the whole brief: 41 strings, 207 words, one product, no style words |
| `render.js` | the shared parts: it injects the content, escapes it, wires the form, exposes the parity strings |
| `s01-swiss.html` … `s09-luxury.html` | one page per style; each links `render.js` and its own stylesheet |
| `s01-swiss.css` … `s09-luxury.css` | each opens with the rules the sheet obeys, in its own comment |
| `before-fixes.css`, `before-glass.html`, `before-neumorph.html` | two known failures put back on purpose, for the before/after below |
| `index.html`, `gallery.css`, `gallery.js` | the study page: nine heroes, nine whole pages, nine cards, three tables, the verdict |
| `measure.mjs` → `stats.js` | the measurement: rendered text, the page's own CSS, the harness audit |
| `../tools/rendered.mjs` | reads a browser's rendered text and computed styles for every page in a task |
| `shots/` | 27 style shots (hero, whole page, phone) + 13 study-page shots + 2 "before" shots |

Static, no build step, relative paths, pinned `@fontsource` packages from
jsDelivr. Fonts are never duplicated: 9 display faces and 8 text faces across
the nine pages (Nunito Sans is both display and body on the neumorphism page,
which is the style — one family, all the hierarchy in weight).

## The part that makes it a study and not a mood board

Nine pages that *look* different is cheap. The claim that has to be earned is
that they are nine arrangements of **one** piece of writing, and that is
checkable. `measure.mjs` checks it, over the text a browser has rendered (not
the template source, which is full of placeholders):

- **Content parity** — 41 strings: the headline, the lede, all three feature
  titles and bodies, all three statistic values, units and notes, the quote and
  its speaker, the plan names, prices and every plan line, the form's label,
  hint, button and the four footer lines and the legal line. Comparison is
  case-insensitive, because five of the nine styles set their type in capitals
  with CSS, and CSS case-casing is not a change of words.
- **Added words** — every rendered word that is not in the content file.

Result: **41/41 in all nine pages**, and each style adds **12–42 words** of its
own. The table on the study page prints the added words, so the kind of thing a
style adds is visible: nav labels and section names everywhere; numerals and
ornaments in seven; and the same five-record specimen log (the Sandbar hide
entries) in the five styles that show an app screen — that log is not brief
copy, it is specimen data, and it is named as such on the study page.

Two things the measurement caught, which is the point of having it:

- The editorial page began with **two paragraphs of prose I had written for
  it** ("The estuary is a place with no coverage and a lot of birds…"), which
  put it at +53 words. A magazine page wants prose, and the brief has none to
  give: the section now sets the brief's own feature bodies in two columns, and
  the page is 35 words closer to the contract (528 → 493).
- The Swiss page labels its sections in French and German (`Fonctions`,
  `Chiffres`, `Témoignage`, `Prix`) — the tradition's trilingual labelling, and
  a real cost: a reader in Suffolk cannot use a section name they cannot read.
  It stays, and it is listed in its own extras row.

## The nine, and what each one costs

Each stylesheet opens with the rules it obeys; `stats.js` prints what falls out
of them. Fidelity / craft are judged in full on the study page.

| Style | Type in use | Signature, and the price |
|---|---|---|
| Swiss | Archivo Variable 66 px / 16 px | visible 12-column grid, hairline rules, one red spent three times, 0 px radius, tabular numerals. No photograph: the style's other half is missing and the hero figure is a diagram. |
| Brutalism | Times 78 px + Space Mono | 3 px rules, hard 8 px offset shadows, zero radius, a scrolling ticker, hover swaps colours instead of easing. The ASCII schematic is the most fragile element on the page, and the black section bars steal hierarchy from the headings. |
| Editorial | Instrument Serif 74 px / Source Serif 4 | masthead, folios, drop cap, two justified columns with a column rule, dot leaders, small capitals, oldstyle figures, hyphenation. "£0 one season" is where the brief fits the style worst. |
| Glass | Manrope Variable 64 px | one recipe repeated at every size: 10 % white, 22 px blur, lifted saturation, a 28 % hairline, a long soft shadow. Needs a real base colour and a solid fill under any gradient, and translucent text is the style's accessibility problem. |
| Neumorphism | Nunito Sans 54 px / 800 | one surface, one light source, no borders, no second colour, raised and pressed pairs. The hierarchy is shadow alone, so a screenshot, a low-vision reader and a screen reader all lose it at once — and 12 places failed the contrast audit before the greys were darkened. |
| Pixel | Press Start 2P 30 px / VT323 22 px | a 16 × 16 sprite drawn as unit rectangles with `shape-rendering: crispEdges`, four hues, 4 px borders, scanlines, one blinking cursor. One-weight capitals and a 26-character measure: it reads worse than it looks. |
| Japanese | Zen Old Mincho 43 px / Zen Kaku Gothic New | warm paper, hairlines, one vermilion spent on a seal, vertical hero title, long leading, `font-feature-settings: "jp"`. The vertical column is the style's signature and it costs a three-column hero. |
| Cyber | Chakra Petch 46 px / IBM Plex Mono | cut-corner panels in two clipped layers (a `clip-path` cuts an ordinary border away), a perspective grid, a HUD strip, monospace telemetry, glow kept for the one live element. Adds the most words of the nine (+42), all of them labelling. |
| Luxury | Cormorant Garamond 46 px / Jost | hairline frame, centred axis, light serif at a size that slows the reader, gold on lines only, 400 ms transitions. Performed well and chosen badly: a flood-season grant applicant should not be read slowly. |

## Round 1 → round 2

Every fix below is a number that moved, and the two "before" pages are in the
folder, shot with the same harness.

| What was measured | Round 1 | Round 2 |
|---|---|---|
| Content parity, nine pages | 34–36 of 36 checks (list items and CSS capitals broke the check) | 41 of 41 in all nine, per-line list checks, case-insensitive |
| Editorial page's own prose | +53 words added, 528 rendered | 0 invented sentences, +30, 493 rendered |
| Neumorphism contrast | 12 findings under the text-node audit (soft greys 3.4:1 / 3.0:1, accent 3.1:1) — `shots/before-neumorph.jpg` | 0 findings, lightest text 5.0:1, accent 5.1:1 |
| Glass headline | gradient-clipped text (`color: transparent`) — `shots/before-glass.jpg` | solid aqua with a 26 px halo, 0 findings |
| Glass mesh | base colour on `body` buried the `z-index: -1` mesh: a flat navy rectangle | base colour on `html`, `body` transparent: the glass has something to blur |
| Study page, phone/desktop | **+204 px** of sideways page scroll on 7 shots (a duplicate `id="towers"`: the script replaced its own section, so full-size 1 440 px images sat in a block flow) | 0 px overflow on all 43 shots |
| Study page links | 45 image-only links with no accessible name | 45 `aria-label`s, 0 unnamed |
| Contrast findings, 27 style shots | 5 → 12 depending on the audit rule (see below) | **0** |
| Console errors, 43 shots | 1 (`const JUDGEMENT` used before it was declared — the cards silently did not render) | **0** |
| Colour pairs cited in comments | three CSS comments claimed 4.8:1, 4.9:1, 5.2:1 | all recomputed and corrected: 5.0, 5.1, 5.7 (and gold-as-decoration is 3.2, kept on rules only) |

**The audit was the thing that was weak, and it is worth stating plainly.**
The harness measured contrast per *element* and skipped any element that had
children. Emphasis lives in inline elements — an `em` in a headline, a `strong`
in a paragraph — so the coloured words that carry meaning were precisely what
it never read. It also parsed `rgba(0, 0, 0, 0)` as black, so gradient-clipped
type was measured as a colour it does not have. `tools/shoot.mjs` now walks
text nodes and reports a foreground with alpha under 0.5 as
*"transparent or gradient-clipped text, no colour to measure"*.

That is why `before-glass.jpg` reports exactly one finding: the gradient
headline, which the old audit passed with 0. The fix was never to satisfy the
check; the check was blind. Contrast numbers for tasks 01–10 were produced by
the element rule and are looser than the ones here; 11-styles is measured under
the text rule.

## Weights

43 shots: 27 style (hero 1 440 × 900, whole page, phone 390 × 844), 14 study
page, 2 before. `latest.md` reports **43 shots, 0 with problems**: no console
errors, no page errors, no failed requests, no missing stylesheets, no sideways
overflow, `contrast 0` and `unlabelled 0` on every style and study shot. The
two "before" shots are the intended artefacts (1 and 12 findings).

Measured across the nine pages:

- content 41 strings / 207 words; rendered 382–493 words; added 12–42
- CSS 8.7–13.0 KB, 74–102 rules; markup+sheet 13.6–19.0 KB per page
- 9 display faces, 8 text faces, no face used twice
- h1 30–78 px, weight 300–800, tracking −2.42 px to +12.88 px
- body 16–22 px, leading 20.73 px to 31.24 px; smallest text 10.5–14.5 px
- rendered inks 5–9; max radius 0 px (×4), 4, 50, 999 (×2); shadows 0–20
- running animations 0–3, keyframes 0–2, `prefers-reduced-motion` block in all 9
- page length 2 149–3 742 px desktop, 3 568–5 606 px phone
- landmarks `header+main+footer+nav` in all nine; one `h1` in all nine; one skip
  link in all nine; a visible focus outline on every page (the audit reports
  `focus ring: outline`); `lang="en"` in all nine

## Remaining weak points

- **The skins change, the armature does not.** All nine use a three-column grid
  for the features, all nine state a statistic as a big numeral over a capitals
  label, all nine set the plans as two panels, six of nine heroes are
  copy-left/figure-right. Nine costumes, one skeleton: this exercises restyling,
  not structural invention.
- **Specimen data is a trick.** Five pages show an app screen with the same five
  log records; an app screen makes any style look convincing, and five of them
  is five too many in a study about copy.
- **No reader, no reader software.** No screen-reader run, no keyboard-only
  walkthrough, no Lighthouse budget, no cross-browser check (Chromium 152), no
  zoom capture. Names, landmarks, roles and contrast are measured; being read
  is not.
- **The styles are performed, not interrogated.** Nothing here says whether a
  grant form *should* be set in brutalism, which is the question a real brief
  asks. The luxury page is the clearest case of a style executed well and
  chosen badly.
- **The ratings are taste.** The four styles I rate highest are type-led, and I
  would rate type-led styles highly in any case. The measurement is in the
  tables; the ranking is mine.
- Small type is at the edge: the tracked luxury label is 10.5 px, the Swiss,
  brutalist, pixel and cyber micro-labels are 11 px. WCAG sets no minimum size
  and the audit clears them; a reader with a phone in sunlight is the test that
  was not run.
- The `full` and `phone` shots of the study page are 19 695 px and 40 347 px
  tall: honest, and useless to read. The 13 section shots are the ones to look at.

## Ratings

| Axis | /5 | Note |
|---|---|---|
| Style fidelity | 4 | the four type-led styles are close to textbook and keep the expensive rules (Swiss spends its red three times, luxury sets a headline at a size that slows you, Japanese runs its title vertically); pixel, brutalism and cyber invent in the style's own language; neumorphism and glass keep the recipe and inherit its damage |
| Visual quality | 4 | the strongest pages (Swiss, editorial, Japanese, luxury) are the cheapest to build; the pixel and neumorph pages look better than they read, which is the same fact seen from the other side |
| Layout & hierarchy | 3.5 | the weakest axis and the honest one: a 40 px numeral over every feature, a three-column grid, two plan panels and a copy-left hero appear in all nine — the structure of the argument is not restyled, only its skin |
| Consistency | 5 | one content file, one renderer, one section order, one audit; 41/41 parity and 43 clean shots; the only repeated face is Nunito Sans, and that is the style |
| Accessibility | 4 | 0 contrast findings, 0 unnamed controls, 0 console errors across 27 style shots under a text-node audit; landmarks, one h1, skip links, 44 px controls, reduced-motion blocks in all nine; smallest text 10.5 px; no reader, keyboard or zoom walkthrough |
| Originality | 4 | the parity and added-word measurement over rendered text, the specimen-data disclosure, and the audit-blindness experiment (a before shot the old audit passed with 0) are the parts with something new in them; the styles themselves are known styles, performed |
