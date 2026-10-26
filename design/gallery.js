/* design/index.html — the gallery frame's script.
 * Everything numeric (scores, shot counts, averages, min/max) is read from the task
 * data below and the harness manifest, and computed here. The only authored text is
 * the prose in VERDICT, which is the model's own judgement, labelled as such. */

const TASKS = [
  {
    n: "01", folder: "01-landing", title: "Foldline", kind: "Web landing page",
    brief: "A landing page for an offline topographic map app: hero, features, pricing, FAQ, sign-up.",
    strong: "Round 2 asked the hero's sentences what they draw, and they flinched: the sheet's own scale bar (180 units = 2 km) makes the drawn route **7.6 km**, and the legend, the profile plate and the SVG's own `aria-label` all said **11.4 km**; the field gains 551 m, the plate said +640; the summit is 860 m, the copy said 812. Every quoted number is now derived in the generator from the drawn path and the field at each marker, and `01-landing/measure.mjs` checks it with the path's own `getTotalLength()` as the ruler. Under the hero, the six SaaS cards became a map key: the layers drawn in the sheet's own hand at the sheet's declared stroke widths, and the 38 MB the hero quotes broken into the layers that spend it (one quantity, one ramp, percentages that sum to 100).",
    weak: "The byte budget is invented — no build makes this pack, so the seven numbers are consistent, not measured. The route's 7.6 km is arithmetically true on a synthetic field: the sheet is not Ordnance Survey data, and \"Ordnance-Survey-quality\" is a product claim. The quote band, pricing and footer are untouched, and the fragments are hand-drawn, not the generated sheet. No reader pass, no 200 % capture.",
    scores: { Visual: 4.5, Layout: 4.5, Consistency: 5, Accessibility: 4.5, Originality: 5 },
    verdict: "The hero earned the page; now the page's numbers come from the hero, and the instrument refuses a sentence that drifts. The liveliness index is flat (55.1 → 55.0) because cream ground replaced white cards — the honest trade, stated.", shots: 13
  },
  {
    n: "02", folder: "02-dashboard", title: "Gridwatch", kind: "Analytics dashboard",
    brief: "A depot load control tower: KPIs, a 24-hour load chart, a vehicle table, filters, two themes, phone.",
    strong: "Round 2 made it an instrument panel instead of a card wall: one ground and hairline rules, a dominant primary readout, one sequential ramp ordered by depot size. Measured, not asserted — weakest boundary between neighbouring bands 1.07 → 1.16, palest fill against the panel 2.94 → 4.60, greyscale rank −0.33 → 1.00, primary/secondary KPI type 1.00 → 1.43 (`02-dashboard/measure.mjs`). It also found the page quoting a peak its own chart did not draw (7.82 MW at 19:10 in the headline, the figcaption and the aria-label; the series peaks at 6.35 MW at 18:00).",
    weak: "The liveliness index went *down*, 56.4 → 53.0, and hue families 2.2 → 1.0: the page gave up colour variety on purpose, and the index ranks colour variety. It is still a dashboard as a genre; chart exploration is pointer-only; and the energy units do not integrate (412.6 MWh headline against a curve summing to ~67 MWh) — a content bug that survived the round.",
    scores: { Visual: 4, Layout: 5, Consistency: 5, Accessibility: 4, Originality: 4 },
    verdict: "The measured legibility went up and the measured liveliness went down; that gap is the most interesting number in the folder.", shots: 15
  },
  {
    n: "03", folder: "03-mobile", title: "Ternmark", kind: "Mobile app screens",
    brief: "An offline-first birding log: nine screens, the log-a-sighting flow, and the states that happen.",
    strong: "Offline is the premise, not an error: queued records, a sync state, and empty, loading, offline and no-permission screens, all shot on a phone frame.",
    weak: "No device was touched; the chrome is a browser imitating a phone, and no gesture is tested.",
    scores: { Visual: 4, Layout: 4, Consistency: 5, Accessibility: 4, Originality: 4 },
    verdict: "Nine screens that agree with each other, which is the hard part.", shots: 19
  },
  {
    n: "04", folder: "04-tui", title: "logtrail", kind: "Terminal UI",
    brief: "A log tail in a terminal: three views, a filter language, freeze, a light palette, 80-column mode.",
    strong: "No dependencies, TypeScript only, and a capture pipeline that renders the program's own bytes: a browser reads the ANSI stream an ANSI writer produced, so what is shot is what the terminal draws.",
    weak: "Its own accessibility rating: 3. No screen reader, no mouse, no resize, and the colour ramp carries the level in the densest view.",
    scores: { Visual: 4, Layout: 4, Consistency: 5, Accessibility: 3, Originality: 4 },
    verdict: "Real software, honestly captured, weak on the axes a terminal makes hard.", shots: 11
  },
  {
    n: "05", folder: "05-system", title: "Halyard", kind: "Design system",
    brief: "One component kit that must survive four themes: paper, deck, terminal, print.",
    strong: "22 contrast pairs per theme measured in the browser in the same function the documentation calls, 24 components, four skins, zero per-component colour.",
    weak: "The themes are derivatives of tasks 01–04; the components/patterns boundary is arbitrary; no focus order, target size or ARIA validation.",
    scores: { Visual: 4, Layout: 4, Consistency: 5, Accessibility: 4, Originality: 4 },
    verdict: "A contract, and the page that proves it holds.", shots: 18
  },
  {
    n: "06", folder: "06-identity", title: "Meridian Hydrographic", kind: "Logo and icon set",
    brief: "A mark, five lockups, a 32-icon set, an identity page — files generated from one source.",
    strong: "Round 2 made the page the thing it documents: a chart sheet. The mark sits on depth tints over its own 24-unit graticule, with a compass rose built on the mark's radii, sounding numerals in the sheet's italic, and a title block; the in-use panel is a chart excerpt with a magenta danger diamond; `05 Chart colours` documents the palette with measured rules. `measure.mjs` checks the page's promises against the rendered geometry — and it caught the page lying about its own headline claim: the 16 px row shipped stroke 1.25, which at 16/24 scale is **0.83 device px**, a grey hairline. It is 1.00 px now, and the page states the arithmetic.",
    weak: "Liveliness 28.6 → 29.9, hue families 0.9 → 1.2: a chart's tints are pale by nature and the page is 80% prose, so the index barely moves — that index is not the axis for a spec sheet. The mark itself is still the weakest part of the strongest-looking page. No dark theme, and a survey tablet at night is a real context; the graticule is CSS, so a printed sheet loses it.",
    scores: { Visual: 4.5, Layout: 4, Consistency: 5, Accessibility: 4.5, Originality: 4.5 },
    verdict: "The manual became the sheet, and its own measurement proved its 16 px claim false — 0.83 device px — then fixed it.", shots: 15
  },
  {
    n: "07", folder: "07-dataviz", title: "Harrow Estuary, 1994–2024", kind: "Data visualisation",
    brief: "Thirty years of tide-gauge records: the argument, six figures, and the caveats.",
    strong: "The spine is the datum change in 2010: one baseline in pale and a note, an explicit gap where the gauge was rebuilt, and the dishonest fit kept on the page as a labelled counter-example.",
    weak: "Two figures are pointer-only (one has a keyboard cursor); no reader tested the prose; the page is 5 000 px of one repeating stack.",
    scores: { Visual: 4, Layout: 4, Consistency: 4, Accessibility: 4, Originality: 5 },
    verdict: "The most original task in the folder, and the one that argues most carefully.", shots: 17
  },
  {
    n: "08", folder: "08-form", title: "Property Flood Resilience grant", kind: "Form and flow",
    brief: "A six-step council grant application: eligibility, six works categories, evidence, declarations.",
    strong: "An address lookup fills in a *later* answer (the flood zone) and says it did; the stop screen keeps its button enabled so the reason is reachable; the summary focuses and links to the field.",
    weak: "No reader, no autofill, no keyboard-only pass; the date group's one message covers three boxes.",
    scores: { Visual: 4, Layout: 4, Consistency: 5, Accessibility: 4, Originality: 4 },
    verdict: "Government-form discipline, applied by a model that wrote the rules into the markup.", shots: 12
  },
  {
    n: "09", folder: "09-motion", title: "Motion", kind: "Motion system",
    brief: "A motion language, twelve interactions, and the frames as evidence.",
    strong: "Round 2 put the subject in the cards: a timing plate per study, drawn from the study's own Web Animation objects (delay, duration, easing family) on a shared 0 → settle axis, so the written timing and the demo cannot disagree. It fills the dead column the page's own notes named, its four marks are the four curve families at 3.98–5.17:1 on the surface they sit on, and the durations table finally shows its `reduce` column. The film strips remain the best evidence-capture in the folder.",
    weak: "The page's frame timings are still estimates from a render loop, not the browser's, and 31 keyframe blocks is not an engine. Three placements of the plate were killed by measurement (dark-on-dark, a clipped fixed box, and a tall-column version that grew the document 2 000 px); the card-window shots that moved — toast 25→9 — are artefacts of a fixed-height frame over a taller page, and the manifest now carries element frames to measure a card as a card.",
    scores: { Visual: 4.5, Layout: 4.5, Consistency: 5, Accessibility: 4.5, Originality: 5 },
    verdict: "The strip is still the animation; now the card shows its clock, read out of the animation objects. Measured as elements, the cards are livelier: 41→49, 40→45, 59→65; the full-page frame 32 → 38.", shots: 26
  },
  {
    n: "10", folder: "10-redesign", title: "A flood portal, redesigned", kind: "Redesign of a real-shaped page",
    brief: "A live council flood-warning portal, deliberately built badly, then redesigned, with both kept and measured.",
    strong: "Round 2 drew the subject: a tide curve in every day's row (four waters, the flood line dashed, peaks coloured only where the numbers clear it, a gap where the gauge was out of service) and a level gauge in the panel, so 3.94 now, 4.20 flood line, 4.48 predicted and 4.61 with surge become one picture with the margins stated in centimetres. It also found the page contradicting itself — the lede's 4.61 m against the table's 4.48 m for the same tide — and fixed it by naming the two quantities, not renumbering them. The case study's audit (137 → 0 contrast findings, 1 324 → 429 px to the answer, 572 → 0 px overflow, 61 tide values diffed with 0 changed) is now joined by 10-redesign/measure.mjs, which maps every drawn dot back to the cell it came from (≤ 0.008 m).",
    weak: "The curve is a schematic on an index axis, not a time axis; the gauge is one forecast run, drawn, not a feed; the case study is 27 083 px with no sticky index; nothing is tested at 200 % zoom; the users are invented. Two harness holes surfaced here: liveliness emulated neither reduced motion nor print (eight published rows were duplicates of their screen twins), and shoot.mjs silently ignored the `element:` key.",
    scores: { Visual: 4.5, Layout: 5, Consistency: 4.5, Accessibility: 5, Originality: 5 },
    verdict: "The measurement still does the arguing. Now it argues about the drawings too: 0 peaks coloured above the line that the numbers do not support, and a printed A4 page with no sideways overflow.", shots: 37
  },
  {
    n: "11", folder: "11-styles", title: "One brief, nine styles", kind: "Style range",
    brief: "The same product copy set in nine visual styles: Swiss, brutalism, editorial, glass, neumorphism, pixel, Japanese minimal, cyber, luxury.",
    strong: "Parity measured on rendered text: 41 content strings present in all nine pages, and every style's added words counted (12–42). It caught the editorial page inventing two paragraphs of prose (+53 words) and the Swiss page inventing section names.",
    weak: "Its own layout rating: 3.5. A 40 px numeral over a caps label, a three-column feature grid, two plan panels and a copy-left hero appear in all nine — the structure was not restyled, only its skin.",
    scores: { Visual: 4, Layout: 3.5, Consistency: 5, Accessibility: 4, Originality: 4, Fidelity: 4 },
    verdict: "Range in surfaces and type; the armature stays, and the page says so.", shots: 43
  }
];

const AXES = ["Visual", "Layout", "Consistency", "Accessibility", "Originality", "Fidelity"];
const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ""));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* shot counts come from the harness manifest when it can be read, so the totals on
   this page are the harness's own numbers, not a transcription of them. */
async function shotCounts() {
  const m = {};
  try {
    const r = await fetch("tools/manifest.json");
    for (const t of await r.json()) m[t.task] = t.shots.length;
  } catch { /* file:// or a partial checkout: the authored counts stand */ }
  return m;
}

const axisScores = (a) => AXES.filter((k) => a[k] !== undefined).map((k) => a[k]);

function table() {
  const per = {};
  for (const k of AXES) {
    const xs = TASKS.map((t) => t.scores[k]).filter((x) => x !== undefined);
    per[k] = { avg: avg(xs), n: xs.length, min: Math.min(...xs), max: Math.max(...xs) };
  }
  const head = `<thead><tr><th>Task</th><th>Brief</th>${AXES.map((k) => `<th class="n">${k}</th>`).join("")}<th class="n">Shots</th></tr></thead>`;
  const rows = TASKS.map((t) => `<tr>
    <td class="n"><a href="${t.folder}/index.html">${t.n}</a></td>
    <td class="t"><b>${esc(t.title)}</b><span>${esc(t.kind)} — ${esc(t.verdict)}</span></td>
    ${AXES.map((k) => `<td class="n">${t.scores[k] === undefined ? "—" : fmt(t.scores[k])}</td>`).join("")}
    <td class="n">${t.shots}</td></tr>`).join("");
  const foot = `<tfoot><tr><td class="n"></td><td>Average of eleven self-ratings</td>
    ${AXES.map((k) => `<td class="n">${fmt(per[k].avg)}</td>`).join("")}
    <td class="n">${TASKS.reduce((a, t) => a + t.shots, 0)}</td></tr></tfoot>`;
  document.getElementById("score-table").innerHTML = head + `<tbody>${rows}</tbody>` + foot;

  const best = AXES.filter((k) => per[k].n > 3).sort((a, b) => per[b].avg - per[a].avg);
  const floor = Math.min(...best.map((k) => per[k].avg));
  const onFloor = best.filter((k) => per[k].avg === floor);
  document.getElementById("avg-note").innerHTML =
    `Highest axis: <b>${best[0]}</b> (${fmt(per[best[0]].avg)}), lowest: <b>${onFloor.join(" and ")}</b>`
    + ` (${fmt(floor)}${onFloor.length > 1 ? ", tied" : ""}). `
    + `Layout sits at ${fmt(per.Layout.avg)}, third of five — the claim in the prose is about the `
    + `spread, not the mean: Layout is the only axis carrying a 3.5. ` +
    `Spread on ${best[0]}: ${fmt(per[best[0]].min)}–${fmt(per[best[0]].max)}. ` +
    `Lowest single score in the table: <b>3</b> — originality on 02 Gridwatch, and accessibility on 04 logtrail. ` +
    `Fidelity is scored only on 11, the one task that asks for styles by name.`;
  return per;
}

function cards(counts) {
  document.getElementById("cards").innerHTML = TASKS.map((t) => `
    <article class="card">
      <figure>
        <img src="thumbs/${t.folder}.jpg" width="640" height="400" loading="lazy"
          alt="${esc(t.title)}: ${esc(t.kind)} — screenshot of the top of the page">
        <figcaption>${t.folder}/shots/</figcaption>
      </figure>
      <div>
        <h3>${esc(t.title)} <span>${t.n} · ${esc(t.kind)}</span></h3>
        <p class="brief">${esc(t.brief)}</p>
        <ul class="scores" aria-label="self-ratings for ${esc(t.title)}">
          ${AXES.filter((k) => t.scores[k] !== undefined).map((k) => `<li><b>${fmt(t.scores[k])}</b> ${k}</li>`).join("")}
          ${(() => {
            // the one measured visual axis, kept visually distinct from the five self-graded ones
            const r = (window.LIVELINESS?.rows ?? []).find((x) => x.task === t.folder);
            return r ? `<li class="measured" title="measured from the rendered frame by tools/liveliness.mjs, not self-rated"><b>${r.lively}</b> lively (measured)</li>` : "";
          })()}
        </ul>
        <dl>
          <div class="good"><dt>Strongest, measured</dt><dd>${esc(t.strong)}</dd></div>
          <div class="bad"><dt>Weakest, its own words</dt><dd>${esc(t.weak)}</dd></div>
        </dl>
        <p class="links">
          <a href="${t.folder}/index.html">${t.folder}/index.html</a>
          <a href="${t.folder}/NOTES.md">NOTES.md</a>
          <a href="${t.folder}/shots/index.html">${counts[t.folder] ?? t.shots} shots</a>
        </p>
      </div>
    </article>`).join("");
}

/* the range strip: four of task 11's nine styles at one scale, the shortest evidence
   that the folder is not one taste. Built from design/thumbs/ by tools/thumbs.mjs. */
const RANGE = [
  ["style-swiss", "Swiss"], ["style-brutalism", "Brutalism"],
  ["style-japanese", "Japanese minimal"], ["style-cyber", "Cyber HUD"]
];
function range() {
  document.getElementById("range").innerHTML = `<p class="note">Four of task 11's nine styles, one
    brief, no typeface used twice: Swiss, brutalism, Japanese minimal, cyber. The other five
    (editorial, glass, neumorphism, pixel, luxury) are in
    <a href="11-styles/index.html">11-styles/index.html</a>.</p>
    <ul class="strip">${RANGE.map(([f, label]) => `<li>
      <img src="thumbs/${f}.jpg" width="640" height="400" loading="lazy" alt="${label} treatment of the same page">
      <span>${label}</span></li>`).join("")}</ul>`;
}

function verdict(per) {
  const shots = TASKS.reduce((a, t) => a + t.shots, 0);
  const t11 = TASKS.find((t) => t.n === "11");
  document.getElementById("verdict-body").innerHTML = `
  <p><b>The taste is one taste.</b> Ink on paper, a hairline rule, one accent, tabular numbers, a
    serif or grotesque against a mono, generous leading, no gradient, no shadow, no rounded
    card stacks. It is a good default: it lands legible and unshowy, and it is why the accessibility
    average is ${fmt(per.Accessibility.avg)} — the colours that taste produces are the ones that
    pass. It is also a single position. It appears in the landing page, the dashboard, the charts,
    the form, the redesign, and three of the nine styles of task 11, which is most of the folder.
    Asked for loud styles the model goes there — brutalism at 3 px rules with a moving ticker, pixel
    at whole-pixel SVG and a blinking cursor, cyber with cut corners and a scan sweep — and the
    results keep the discipline; the loudest of the nine (brutalism) is the only page the audit
    marked on its first pass, and the fix is documented as a change of roles, not of hues.</p>

  <p><b>Where it designs well.</b> Wherever the brief has a contract that can be measured. Task 05's
    four themes with 22 contrast pairs per theme, task 08's one field pattern across 24 questions,
    task 09's one duration-and-curve token set with a named reduced-motion replacement per study,
    task 10's single measure function run over the bad page and the good one, task 11's 41 content
    strings checked against the text a browser rendered in nine pages. Consistency is the highest
    axis (${fmt(per.Consistency.avg)}) and no task is under 4 on it. The model is also good at
    *arguing with evidence* and at leaving the evidence that hurts in: 07 keeps the dishonest fit on
    the page with a label, 10 keeps the rows that read 137 → 0 next to its own 4 → 5 and 1 → 6, 11
    publishes the 30–42 words each style adds, and every NOTES ends with a list of what is still
    wrong.</p>

  <p><b>Where it is weak, in three named places.</b>
    First, <b>structure</b>. The averages do not say this and the spread does: Layout averages
    ${fmt(per.Layout.avg)}, third of five behind Consistency and Originality, with Visual and
    Accessibility tied last at ${fmt(per.Visual.avg)} — accessibility's floor is task 04's 3, in a
    terminal where colour carries the level. What marks Layout is that it is the only axis carrying
    a 3.5, task 11's, and there the weakness is visible: a 40 px numeral over a caps label, a
    three-column feature grid, two plan panels and a copy-left hero recur across the nine styles, so
    restyling changed the surfaces and not the argument's shape. The model styles well inside a
    layout it has reached, and reaches for the same three layouts.
    Second, <b>drawn marks</b>: task 06 is the best-looking page in the folder and its own verdict is
    that the logo is the weakest part of it — the construction grid, the rules and the misuse examples
    are strong; the thing they frame is a plain mark with a hairline monogram.
    Third, <b>the edges of typography</b>: the smallest text measured across task 11's nine pages is
    10.5 px, all of it tracked capitals, and the editorial page sets its pull quote in a pixel face
    because the style had one — small tracked type and novelty faces at reading sizes are where the
    model's eye for size fails. Layout and edge typography are the two things to fix first.</p>

  <p><b>Style range, honestly.</b> Nine named styles, no face used twice, radii from 0 px to 999 px,
    h1 tracking from −2.42 px to +12.88 px, page length from 2 149 px to 3 742 px, all nine passing a
    text-node contrast audit at zero findings. The four type-led styles (Swiss, editorial, Japanese
    minimal, luxury) are the closest to textbook and cost the least CSS; pixel, brutalism and cyber
    invent in the style's own language; glass and neumorphism reproduce the recipe and inherit its
    damage — neumorphism needed twelve darkened greys, and the glass pages' body copy over a
    translucent panel is a contrast the audit measures at 11.34:1 against a solid card and cannot
    measure at all over the middle of a drifting blob. Style fidelity scores 4: the range is real, and
    it is skin-deep in structure.</p>

  <p><b>Against a strong frontier model.</b> No frontier arm was run in this repo, so this is a
    judgement against expectation and it is labelled as one. What was made is at the level a frontier
    coding agent (Claude-4/Opus-class, GPT-5-class, Gemini-2.5-Pro-class) reaches on briefs of this
    size: eleven complete static pages, no build step, ES modules that load, self-critique rounds
    that move measured numbers, audits that report their own warnings. It is behind on the same three
    edges the folder already names — drawn marks (06's logo), structural originality (three layouts
    recur), typographic metrics at the edges (10.5 px tracked capitals; a pixel face's quarter-em
    x-height at reading size) — and behind on self-verification across long edits: the 09-motion
    regression survived a code change because the screenshots were not re-taken, and the page's own
    audit did not count its own rows until the review asked. The one <i>measured</i> neighbour in this
    repo is <code>whole-repo-qa/README.md</code>: this model against the router's dense 27B on
    100K-token whole-repo Q&amp;A — 25/25 answers each, line citations 23/25 against 25/25, and about
    2.9× faster to first token. Same shape as this gallery: the answers are right, and the precision
    at the edges is where it loses. What is not about quality is cost: these eleven briefs ran on a
    home GPU box at ~2 400 tok/s prefill with no API meter, in a folder that is set up for the A/B it
    lacks — the eleven briefs are written, the harness is one command, and a frontier arm would be
    scored by the same screenshots.</p>

  <p><b>Reasoning about trade-offs.</b> Each task's notes carry weights (what was traded for what), a
    round-1 → round-2 of measured fixes, and named compromises: task 09 chose a scrub strip over a
    video and lost timing; task 10 chose a table that becomes cards on a phone and lost the column
    you can run your eye down; task 11 chose one section order for all nine styles to make parity
    checkable, and that is exactly why its layout score is 3.5; task 08 chose a stop screen that
    keeps its button enabled so the reason is reachable, and pays for it with an affirmative verb at a
    negative moment. The reasoning is strongest where a number moved and the number is in the text.
    A twelfth brief that isolated this skill — four conflicting-constraint problems with written
    decision records — was dropped by the owner before it was built, so trade-off reasoning is present
    inside the eleven tasks and was never rated on its own.</p>

  <p><b>The judgement I would defend.</b> The work is strong where it can be checked and weak where
    it must be seen. ${shots} screenshots, the audits, the parity tables and the diffs are trustworthy;
    the ratings are the model grading its own taste, and the two axes where self-grading is easiest
    (visual quality, at ${fmt(per.Visual.avg)} with an eleven-task spread of one point) are the least
    useful numbers on this page. Ask for a reader, a second browser, a keyboard-only pass, a 200 %
    zoom, a mark that must survive embroidery, and a layout that is not the one the model reaches
    for, and the same eleven tasks would score lower and more honestly.</p>`;
}

/* the measured-pulse band: one tile per brief, painted in the background colour measured from
   that brief's own frame (tools/liveliness.mjs), filled by its measured colourfulness. The near-
   white tiles with thin bars ARE the finding — this is a self-portrait, not a decoration. */
const relLum = (css) => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(css ?? "");
  if (!m) return 1;
  const [r, g, b] = [1, 2, 3].map((i) => +m[i] / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function pulse() {
  const band = document.getElementById("pulse-band");
  const foot = document.getElementById("pulse-foot");
  if (!band) return;
  const all = window.LIVELINESS?.rows ?? [];
  const rows = all.filter((r) => r.task !== ".");
  if (!rows.length) {
    // never fall back to invented colours: an unmeasured folder says so
    band.innerHTML = `<p class="note">No measurement on file. Run <code>node tools/liveliness.mjs --per-task</code>
      and reload — this band refuses to invent colours.</p>`;
    return;
  }
  band.innerHTML = `<div class="band-grid" role="img" aria-label="One tile per brief: its measured page background, its measured colourfulness as a bar, and its measured liveliness index">` +
    rows.map((r) => {
      const onDark = relLum(r.bg) < 0.35;
      const pct = Math.max(4, Math.min(100, Math.round(100 * r.colourfulness / 24)));
      const achromatic = r.dominant_hue === null || r.hues === 0;
      return `<div class="tile${onDark ? " dark" : ""}${achromatic ? " achromatic" : ""}" style="--bg:${esc(r.bg)};--h:${r.dominant_hue ?? 0}">
        <span class="t-name">${esc(r.task)}</span>
        <span class="t-bar"><i style="width:${pct}%"></i></span>
        <span class="t-nums"><b>${r.lively}</b> lively · ${r.colourfulness} colour · ${achromatic ? "no hue" : r.hues + " hue" + (r.hues === 1 ? "" : "s")}</span>
      </div>`;
    }).join("") + `</div>`;
  /* the hue rail: twelve hue bins, each as wide as the number of briefs whose dominant hue
     lands in it. Eleven frames in one bin, visually, is the "one taste" verdict without anyone
     having to write the sentence — and the rail's colours are the measured bin centres. */
  const bins = new Array(12).fill(0);
  let neutral = 0;
  for (const r of rows) {
    if (r.dominant_hue === null || r.hues === 0) neutral++;
    else bins[Math.min(11, Math.floor(r.dominant_hue / 30))]++;
  }
  const used = bins.map((c, i) => ({ c, h: i * 30 + 15 })).filter((x) => x.c > 0);
  band.insertAdjacentHTML("beforeend",
    `<div class="rail" role="img" aria-label="Hue histogram: ${neutral} of ${rows.length} briefs have no hue at all above 1% of pixels; the rest fall in ${used.map((x) => `the ${x.h} degree bin (${x.c})`).join(", ") || "no bins"}">` +
    (neutral ? `<span class="neutral" style="flex:${neutral}" title="no hue above 1% of pixels"></span>` : "") +
    used.map((x) => `<span style="flex:${x.c};background:hsl(${x.h} 68% 46%)" title="${x.c} brief(s), dominant hue ${x.h}&deg;"></span>`).join("") +
    `</div><p class="note rail-cap">` +
    (neutral ? `<b>${neutral}</b> of ${rows.length} frames carry <b>no hue at all</b> (grey ground, no chroma over 1% of pixels)` : "") +
    (neutral && used.length ? "; " : "") +
    (used.length ? `the rest: ${used.map((x) => `<b>${x.c}</b> × ${x.h}&deg;`).join(" · ")}` : "") + `</p>`);
  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const self = all.find((r) => r.task === ".");
  foot.innerHTML = `Measured ${esc(String(window.LIVELINESS.generated).slice(0, 10))} by
    <code>tools/liveliness.mjs</code>: mean liveliness <b>${mean("lively").toFixed(1)}</b> of 100, mean
    colourfulness <b>${mean("colourfulness").toFixed(1)}</b>, mean hue families <b>${mean("hues").toFixed(1)}</b>
    over eleven briefs — out of twelve hue bins, so a mean near one is what "one taste" looks like as a
    number. This page is measured by the same instrument and included here: <b>${self ? self.lively : "—"}</b>
    whole-page with this band in it; the frame scored 19 without the band, and
    <a href="README.md">README.md</a> carries the before/after and what the index cannot tell you.`;
}

const counts = await shotCounts();
const per = table();
pulse();
range();
cards(counts);
verdict(per);
document.getElementById("fact-tasks").textContent = `${TASKS.length} briefs, one model, one harness`;
const total = Object.keys(counts).length ? Object.values(counts).reduce((a, b) => a + b, 0) : TASKS.reduce((a, t) => a + t.shots, 0);
document.getElementById("fact-shots").textContent = `${total} shots across the eleven tasks, plus this page's`;
document.getElementById("foot-shots").textContent = `${total}+`;
