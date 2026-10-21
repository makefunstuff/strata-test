# 03 — Mobile app screens: Ternmark, an offline-first birding log

## The brief

A phone-first app with four or more screens that form one real flow, designed as a
system, not as six separate pages.

## The product

**Ternmark** — a birding log for people who walk marshes, where the signal stops at the
sluice. The promise: see a bird, get it identified, confirm it yourself, keep counting,
and let the records queue until you reach the car park.

Fictional brand; the species, counts, patches and the "county recorder" are invented for
the prototype.

## What is built

`app.html` (the app) + `index.html` (a review board that shows the app live) +
`app.css` + `board.css` + `app.js`. No framework, no images, no build step.

**Nine screens, one spine.** `today` (morning count, four stats, logged rows, calls
heard, rare birds nearby) → the **log-a-sighting sheet** (capture → identify → count and
place) → `detail` (field plate, why the confidence is 91 %, the pin, the note) →
`life list` (grouped by family, rare marks, search, two sorts) → `trip` (the walked
route, seven stops, timeline) → `onboarding` (the location ask). Plus four states:
**offline, empty, loading, permission denied.**

**The app is real, not pictures.** A query-string router (`?screen=log&step=2&state=offline`)
means every frame on the board is a live instance of the same page. Tab bar, FAB, sheet
steps, suggestion selection, count stepper, save → toast, row → detail push, back
buttons, list search, family chips, both sorts, the state switcher, Escape-to-close: all
wired.

**Design system.** Warm chalk paper (`#f6f2ea`), ink type, one moss accent (`#1f6d55`)
for the brand and primary actions, one coral (`#b8452f`) strictly for rarity, queued
records and faults, gold for the queued dot and the confidence chip. Sora for titles,
DM Sans for text, a tabular mono for every count, time and percentage — columns of
sightings line up. Cards at 20 px, rows at 13 px, chips at 999, hairline borders,
a 52 px raised centre FAB, 44 px minimum targets, `env(safe-area-inset-bottom)` on the
tab bar, 260 ms cubic-bezier sheet, 8 % press scale, all motion off under
`prefers-reduced-motion`.

**Deliberate calls.**
- *No photographs.* The birds are silhouettes and the sighting "photo" is a labelled
  **field plate** — "drawn from the two photos, not a photograph". A prototype that
  pasted stock birds into a birding app would be pretending to be something it is not.
- *Confidence comes with receipts.* The 91 % is followed by three reasons and one
  **minus**: the call was not used, because the 06:12 recording is a Cetti's warbler.
  And the flow ends with *you* confirming the bird — "none of these" is a first-class
  button, not a footer link.
- *Offline is the normal state.* The banner states the outage in minutes, queued rows
  carry a gold dot, the onboarding says the map is 26 MB and already on the phone.
- *The permission ask is one screen with two facts and a way out* ("Not now — I will tap
  the patch in"), which keeps the app usable without location.

## Round 1 → round 2 (self-critique from the screenshots)

Round 1 problems found by looking:
1. **CDN died mid-task.** `cdn.fontsource.com` started serving a parked GoDaddy
   certificate, so every frame rendered in fallback type (27 failed requests on the
   board alone). Fonts now come from pinned `@fontsource`/`@fontsource-variable`
   packages on jsDelivr (`5.3.0`, `preconnect`), which is also what tasks 01–02 use.
2. **The sheet had a hole in it.** `grid-template-rows: auto auto 1fr` made the *progress
   bar* the stretching row, so step 2's content started ~250 px down the screen.
   `auto auto auto 1fr` puts the stretch where the content is.
3. **`undefined` printed over four bird thumbnails** — the candidate data had a silhouette
   for the first item only, and the template interpolated a missing field.
4. **The hint line broke into three columns.** `.hint { display: flex }` turned each text
   node and `<b>` into a flex item. It is a block with an inline icon now.
5. **The primary action was dead on arrival.** Step 2 pre-selects the top candidate
   (it is `aria-pressed="true"`), so "Use wading warbler" must be enabled at that point;
   it was `disabled` until you tapped. It is armed from the data at boot.
6. **A dev tool leaked into the shots.** The state switcher sat inside the phone in the
   frames; `?nobar=1` hides it (it is also hidden when embedded).
7. **Contrast**: the `new` tag (coral on coral-soft) measured 4.29:1 — a dedicated
   `--coral-text` (#96331f) at 6:1 now carries text, and the coral stays for fills.
   The viewfinder hint measured 1:1 because the audit cannot resolve a gradient
   background; the viewfinder has a solid dark colour under the gradient, so the pair is
   now auditable (10:1).
8. **Favicon 404** on the board (the console error in the report): a data-URI favicon
   added to both pages.
9. **Eyebrow wrap**: the date/patch line wrapped under the condition chip on a 390 px
   screen; it is shortened and ellipsised.
10. **Harness gap**: `page: "app.html?screen=list"` was treated as a filename →
    "page missing". The shot page is now split at `?` before the existence check.

## What is still weak

- The bird silhouettes are the weakest part of the visual: at 38 × 27 px they read as
  dark blobs, and eight of them look related. They are honest placeholders, not
  identifiability aids.
- One flow is deep. The life list, trip and detail screens are real but shallow — the
  list has no detail page of its own, and "You" (the fifth tab) is a stub that opens
  onboarding.
- The maps are drawings. A real app needs a tiled map with pan/zoom; mine is a fixed
  340 × 240 SVG with a route and pins, which is fine for a frame and useless for
  navigating.
- The sheet is a modal dialog, so the status bar is covered: acceptable on iOS, and the
  back affordance is inside the sheet, but a system-driven dismiss (drag) is not
  implemented — the handle is decorative.
- Search filters by name and family only; there is no sorting by count, no date range,
  and no rare-bird-only filter.
- Toast is a single line with a 3.2 s timeout; no undo, which a destructive flow
  (deleting a sighting) would need.
- Everything is one theme; there is no dark mode, and a marsh at 06:00 in November
  wants one.

## Ratings

| | | why
| --- | --- | ---
| Visual quality | **4** | a specific, coherent look (chalk paper, moss, coral, tabular
  numbers), disciplined radii and hairlines, a real icon set; the silhouette thumbnails
  and the flat map keep it from 5.
| Layout / hierarchy | **4** | the flow is the spine, the tab bar is honest, the sheet
  steps are legible at a glance, and the states sit in the same grid as the content.
  The detail screen is long and the trip stats bar floats over the map without much air.
| Consistency | **5** | one token set, one component vocabulary, the same chip/pill/row
  language in all nine frames; the board's components are the app's own stylesheet, so
  they cannot drift.
| Accessibility | **4** | modal semantics with focus move and return, Escape, `aria-pressed`
  on toggles, `role="status"` toast, rows as buttons with a spoken summary, `role="img"`
  on the plate and maps, audit clean (0 contrast findings, 0 unlabelled controls), motion
  respected. Loses a point: no dark mode, the raised FAB overlaps content, and the drag
  handle has no keyboard equivalent (the close button does).
| Originality | **4** | offline-first as the design premise rather than an error state;
  confidence with evidence and a human out; the field plate that declares itself not a
  photograph; the permission ask as a designed screen.
