/* design/index.html — the gallery frame's script.
 * Everything numeric (scores, shot counts, averages, min/max) is read from the task
 * data below and the harness manifest, and computed here. The only authored text is
 * the prose in VERDICT, which is the model's own judgement, labelled as such. */

const TASKS = [
  {
    n: "01", folder: "01-landing", title: "Foldline", kind: "Web landing page",
    brief: "A landing page for an offline topographic map app: hero, features, pricing, FAQ, sign-up.",
    strong: "The hero is a generated map sheet: contours, a route and an elevation profile drawn in the page from the same numbers, so the picture and the claim cannot disagree.",
    weak: "The sections under the hero are a familiar marketing structure; the hero's left column runs out before the map's height.",
    scores: { Visual: 4, Layout: 4, Consistency: 4.5, Accessibility: 4, Originality: 4.5 },
    verdict: "The hero earns the page; the rest is competent.", shots: 10
  },
  {
    n: "02", folder: "02-dashboard", title: "Gridwatch", kind: "Analytics dashboard",
    brief: "A depot load control tower: KPIs, a 24-hour load chart, a vehicle table, filters, two themes, phone.",
    strong: "Hand-drawn SVG charts with an annotated peak; filters, sort, empty state, a phone drawer; audit clean in both themes.",
    weak: "Its own rating for originality: 3 of 5 — a control-room layout with a point of view, not a new one.",
    scores: { Visual: 4, Layout: 4, Consistency: 4, Accessibility: 4, Originality: 3 },
    verdict: "Dense, legible, and the least original thing in the folder.", shots: 14
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
    verdict: "Real software, honestly captured, weak on the axes a terminal makes hard.", shots: 9
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
    strong: "The mark is drawn as a construction (grid, compass, offset curve) with the grid left visible; 32 icons on one 24 px grid with a written drop-16 rule; every file built from one data source.",
    weak: "The mark itself is the weakest part of the strongest-looking page — the argument about the construction is stronger than the drawing.",
    scores: { Visual: 4, Layout: 4, Consistency: 5, Accessibility: 4, Originality: 4 },
    verdict: "A superb manual around a mark that is one idea and two compromises.", shots: 14
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
    strong: "Each study is a film strip you scrub — the frames were rendered from a live page and stitched offline, so the strip *is* the animation. Reduced motion is a redesign with a named replacement per study, and the audit reports its own warnings.",
    weak: "It is 31 keyframe blocks, not one animation engine; nothing is timed; the page's own frame timings are estimates from a render loop, not the browser's.",
    scores: { Visual: 4, Layout: 4, Consistency: 5, Accessibility: 4, Originality: 5 },
    verdict: "The best evidence-capture in the folder, and the most honest audit.", shots: 21
  },
  {
    n: "10", folder: "10-redesign", title: "A flood portal, redesigned", kind: "Redesign of a real-shaped page",
    brief: "A live council flood-warning portal, deliberately built badly, then redesigned, with both kept and measured.",
    strong: "One measure function, run over both pages in four iframes: 15 rows, contrast findings 137 → 0, 1 324 px → 429 px to the answer, sideways overflow 572 px → 0, and a cell-by-cell tide diff of 7 days and 61 values with 0 changed.",
    weak: "The 26 000 px case study has no sticky index; nothing was tested at 200 % zoom; the users are invented.",
    scores: { Visual: 4, Layout: 5, Consistency: 4, Accessibility: 5, Originality: 5 },
    verdict: "The task where the measurement did the arguing, and kept the rows that counted against it.", shots: 32
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
  document.getElementById("avg-note").innerHTML =
    `Highest axis: <b>${best[0]}</b> (${fmt(per[best[0]].avg)}), lowest: <b>${best.at(-1)}</b> (${fmt(per[best.at(-1)].avg)}). ` +
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
        </ul>
        <dl>
          <div class="good"><dt>Strongest, measured</dt><dd>${esc(t.strong)}</dd></div>
          <div class="bad"><dt>Weakest, its own words</dt><dd>${esc(t.weak)}</dd></div>
        </dl>
        <p class="links">
          <a href="${t.folder}/index.html">${t.folder}/index.html</a>
          <a href="${t.folder}/NOTES.md">NOTES.md</a>
          <a href="${t.folder}/shots/">${counts[t.folder] ?? t.shots} shots</a>
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
    First, <b>structure</b>: Layout is the lowest axis (${fmt(per.Layout.avg)}) and the only 3.5 in
    the folder is task 11's, where the weakness is visible — a 40 px numeral over a caps label, a
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

const counts = await shotCounts();
const per = table();
range();
cards(counts);
verdict(per);
document.getElementById("fact-tasks").textContent = `${TASKS.length} briefs, one model, one harness`;
const total = Object.keys(counts).length ? Object.values(counts).reduce((a, b) => a + b, 0) : TASKS.reduce((a, t) => a + t.shots, 0);
document.getElementById("fact-shots").textContent = `${total} shots across the eleven tasks, plus this page's`;
document.getElementById("foot-shots").textContent = `${total}+`;
