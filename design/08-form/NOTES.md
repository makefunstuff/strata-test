# 08 · Form / flow UX — **Property Flood Resilience grant**, Harrow Estuary Authority

## The brief

A multi-step flow that people finish: validation that helps, progress,
conditional fields, a review step, keyboard support, autosave and a receipt.

## What is built

`index.html` + `styles.css` + `app.js`. Six steps in one page: eligibility →
property → works → your details → check your answers → submitted.

| step | what it asks | what is designed in |
|---|---|---|
| 1 eligibility | ownership, flood history, mapped zone | a **stop** (a tenant without the owner's permission cannot apply), a reveal that asks for the zone reference, a "before you start" panel with the four things a person needs to have to hand |
| 2 property | the address | an **address lookup** that fills in the postcode *and the flood zone* (the payoff is stated: "The flood zone was filled in from the index"), plus a manual path |
| 3 the works | items, quotes, start date | a **live total** against the £5,000 cap, a reveal for quotes with an uploader (choosing, uploading, uploaded, over-limit), and day/month/year boxes |
| 4 your details | name, email, phone, contact | a reveal for post contact, a declaration, `type=email`, `inputmode`, `autocomplete` |
| 5 check your answers | everything | a review that repeats each answer in the words the person read, a **Change** control per section, and a "what happens next" panel |
| 6 submitted | receipt | a reference, a copy of every answer, the next three dates, the phone number, print, start again |

Around it: a step rail with per-step state (done / now / check), a progress bar
that counts steps, an elapsed clock, an autosave chip ("Saving…", "Saved 22:20"),
a draft-restoring banner, and a save-and-return code.

## The parts that are decisions, not decoration

- **One submit validates the whole step, and the top of the page says so.** The
  summary is a `role="alert"` box with a link per problem; the link puts the caret
  in the field. The summary gets focus, not the first bad field: a screen-reader
  user hears the list, a sighted user sees the red box.
- **A field is never validated before the person has left it.** A rules table
  lives on the markup (`data-required`, `data-pattern`, `data-msg`, `data-min`),
  so the field says what it needs.
- **An unanswered radio group is an unanswered question.** `data-required` sits on
  the group's first input; the summary names the question.
- **A hidden question is not a question.** The manual address is behind
  "Enter the address manually", and a reveal is behind an answer: fields that are
  not on screen are not validated. The same rule must not apply when collecting
  answers for the receipt — see the fixes below.
- **The CTA stays enabled when the answer stops the application.** A disabled
  button hides the reason; here the stop panel is a heading with the reason, the
  summary repeats it as a link, and the button is the thing that tells you.
- **A reveal is a live function of the DOM**, not of the last autosave, and
  clearing the answer that opened a panel clears what was typed inside it.
- **The review repeats the answer in the person's words** — "No, I rent it and
  the owner agrees", not `owner-permission` — and the receipt repeats every
  answer, including the ones inside panels.
- **Submitting re-checks everything.** The review step is not a bypass: if an
  earlier step has become incomplete, submitting lands there with its summary.
- **Focus is two-colour** (yellow fill, dark ring) so it survives the white page,
  the green button, the tinted panels and the red summary.
- **On a phone the primary action is sticky** under the thumb, the rail becomes a
  horizontal strip, and every target is 44 px+.

## Self-critique: round 1 → round 2

| What the screenshots showed | Fix |
|---|---|
| The "empty form" shot landed on **step 2**, not on an error summary: an empty eligibility step passed | Unanswered radio groups declared no requirement, so `ruleFor` returned `null` and the step sailed through. `data-required` on the group's first input, and the summary lists the question |
| Submitting from the review landed on **step 2 with a postcode error nobody had been asked** | The manual address fields are inside a hidden panel and were being validated. Fields with no client rects, or under `[hidden]`, are skipped by validation |
| …and then the **receipt was empty**: "What you told us" had no rows, and the copy said "emailed to **you**" | The visible-only rule was also used by the collector, and every step is hidden once you move on. Validation and collection are two reads of one form: `fieldsIn(step, all)` |
| The quote upload panel **never appeared** for "I have one quote" | The reveal syntax `quotes:one quotes:none` was split on `:` into one token, so the value list became `["one quotes", "none"]`. Reveals now parse pairs |
| The upload panel stayed shut when the answer was set programmatically | Reveals read `state.answers`, i.e. the last autosave. They now read the form (`live(name)`) |
| The review printed **`owner-permission`, `yes`, `phone`** | `derived()` maps each value back to the label text the person read |
| The review's label/value pairs **shifted into a third column** ("Grid reference" with no value beside it) | The grid reserved a column for a Change control that lives in the section header. Two columns |
| The date box showed `mm/dd/yyyy` under a hint that said "Day, month and year", and a native picker offers no way to type a partial date | Three labelled boxes, one message naming the part, a real-date check (15 2 2025 is fine, 30 2 is not), and a future-date rule |
| The **phone shot was a desktop layout**: the rail sat beside a squeezed form at 390 px | `phone: true` in the manifest was a flag the harness never read. The harness now treats it as a 390×844 viewport at dpr 2, and every phone shot in the manifest carries an explicit size — so the phone shots in tasks 01–07 were re-checked and were already sized |
| A full-page phone shot had the **save toast painted in the middle of the document** | A `position: fixed` box that sits off-screen (a slide-in that has not slid in) is drawn mid-page by a full-page capture. The harness hides fixed boxes outside the viewport for full shots |
| The masthead shattered at 390 px: "HARROW ESTUARY / AUTHORITY" over three lines, the save chip squeezing the title | The header reflows under 620 px and the chip takes a line of its own |
| A shot failed on `requestfailed: …/inter@5.3.0/400.css net::ERR_CERT_…` — a CDN flake, not a page defect | The harness retries a shot once when a request fails, and clears its listeners between attempts so one error is not counted twice |
| One reveal silently did nothing: **no console error, no failed request, nothing on screen** | A patch had turned `$$` into `$`: `querySelector` returned an element, `.length` was `undefined`, and the function returned `""`. State-driven shots (the `eval:` dumps in the report) are how this was found |

Final run: **12 shots, 0 console/page/network errors, 0 low-contrast findings,
0 unlabelled controls, no missing stylesheets, no sideways overflow** — desktop
states (clean, revealed, blocked, works + upload, errors, lookup, review,
receipt, draft), phone (390 px) and phone with a failed submit.

## What is still weak

- **`?demo=fill&go=review` is a door in shipped code.** It is documented and it
  sends nothing, but a production form would keep that scaffolding out.
- **The save-and-return code is a promise with no door**: there is no
  "come back" page to type `HEA-DRAFT-1127` into, so the flow stops short of the
  thing that makes a long form survivable.
- The elapsed clock counts up, which implies a session timeout that does not
  exist; a real service must warn before it expires and save the draft first.
- Nothing is sent: no idempotency key, no double-submit guard beyond a busy
  button, no conflict check when two devices edit the same draft.
- The file upload is simulated client-side; the over-limit message ("photograph
  page 1 only, or send it by post") is a sentence, not a path.
- The date rule asks for all three parts with one message; per-box messages
  would be kinder.
- The address index is three hard-coded rows with substring matching: "Quay Wall
  2" finds nothing. It says so and offers the manual path, which is the honest
  behaviour, not a good one.
- The stop panel (tenant without permission) has no way forward inside the form:
  the permission letter is a link to a section that describes a phone call.
- No forced-colours pass, no screen-reader walkthrough, and printing a mid-form
  step is untested.

## Ratings

| axis | /5 | why |
|---|---|---|
| Visual quality | 4 | It reads like a real council service: a phase banner, a crest, a green rule under the masthead, panels with a left keyline, no decoration. The receipt's summary box is drab, and the summary's focus ring is loud in a screenshot |
| Layout & hierarchy | 4 | Step eyebrow → h1 → lede → questions, one column at 660 px, the rail and the progress bar telling the same story twice; the phone rail strip shows three and a half items, which says "scrolls" but not "there are six" |
| Consistency | 5 | One field pattern (legend, hint, options, error), one reveal pattern, one button, one status chip, one toast, across six steps and 24 questions; the rules live in the markup, not in a JS table |
| Accessibility | 4 | Contrast measured clean; the summary gets focus and links to the field; `aria-invalid` + `aria-describedby` wired to the live message; fieldsets and legends for every group; 44–48 px targets; a two-colour focus ring; three live regions (status, total, save). No screen-reader walkthrough, and the date group's single message covers three boxes |
| Originality | 4 | The lookup that fills in a *later* answer (the flood zone) and says it did; the stop that keeps the button enabled so the reason is reachable; a receipt that repeats every answer including the hidden ones; the total that argues against the £5,000 cap as you tick boxes |
