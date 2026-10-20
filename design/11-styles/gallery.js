/* The gallery for study 11. Every number on this page comes from stats.js, which
   measure.mjs generates from the pages themselves; the words marked "judgement" are
   the only opinions here, and they are kept in one block, at the top, above the code that uses them. */
const S = window.TERNMARK_STATS;
if (!S) {
  document.body.insertAdjacentHTML("afterbegin", '<p style="padding:20px;color:#a00">stats.js is missing — run <code>node measure.mjs</code> in this folder.</p>');
  throw new Error("no stats");
}
const R = S.rows;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const el = (id) => document.getElementById(id);
const kb = (n) => (n / 1024).toFixed(1);
const SHORT = { swiss: "Swiss", brutalism: "Brutalism", editorial: "Editorial", glass: "Glass", neumorph: "Neumorphism", pixel: "Pixel", japanese: "Japanese", cyber: "Cyber", luxury: "Luxury" };
const sum = (a) => a.reduce((n, x) => n + x, 0);;

/* =====================================================================
   JUDGEMENT — the authored part. Fidelity: does the page keep the
   conventions the style was built on, including the expensive ones.
   Craft: is it a good page, judged the same way for all nine.
   ===================================================================== */
const JUDGEMENT = {
  swiss: { fidelity: 5, craft: 4.5, short: "The grid is visible, the red is rationed, nothing is rounded, and the numerals do the shouting. The figure is the weakest part: a diagram where this style historically used a photograph.",
    note: "The most disciplined page here. It pays for the style: an 11-column hero, a 40 px numeral over every feature, uppercase micro-labels at 11 px that stay legible because the tracking is wide. It is also the most legible of the nine at a glance. What it lacks is the photograph — Swiss design's other half — and the page admits that by drawing a figure with a rule and a caption." },
  brutalism: { fidelity: 4.5, craft: 4, short: "Times and monospace, 3 px rules, hard shadows, a ticker, no easing anywhere. The ASCII schematic is a good signifier and the most fragile element on the page.",
    note: "Keeps the expensive rules: no radius, no blur, colour that clashes on purpose, a hover that swaps rather than fades. Two costs are visible: the black section bars steal hierarchy from the headings, and the ASCII block is the element most likely to be cut off on a phone — it scrolls inside its frame, which is honest, not pretty." },
  editorial: { fidelity: 4.5, craft: 4.5, short: "Masthead, folios, a drop cap, two columns with a hairline between, dot leaders, oldstyle figures. The price line is where the shared copy fits this style worst.",
    note: "The best reader of the nine: a real measure, justified columns with hyphenation, and an index you can scan. It also invented prose in its first draft and lost 13 words when the parity check caught it. “£0 one season” over a plan called Free reads oddly in a magazine: the style wants a number and a unit, and the brief has a plan with no price." },
  glass: { fidelity: 4, craft: 4, short: "One recipe repeated honestly: 10 % white, 22 px blur, a 28 % hairline, a long soft shadow, depth by overlap. The accessibility of translucent text is the style's real weakness.",
    note: "The panels are all the same object at different sizes, which is the point. The mesh behind them had to be given a real base colour — a body background paints above a negative-z layer, so the glass was blurring a flat rectangle. The emphasis in the headline is a solid colour with a halo, not gradient-clipped text, because gradient text reads as transparent to a contrast checker and to some screen readers." },
  neumorph: { fidelity: 4.5, craft: 3.5, short: "The purest sheet here: one surface, one light source, no borders and no second colour, every control raised or pressed. Also the one that must be read from a diagram to be understood.",
    note: "It keeps the rule that makes the style hard — colour is the surface, ink is only text — and pays for it. Five places failed the contrast audit on the first pass — the soft greys the idiom is built on, and the accent — and every one had to be darkened against the surface before the sheet was clean (the lightest text now measures 5.0:1, the accent 5.1:1). The deeper cost is not fixable in CSS: the difference between raised and pressed is shadow alone, so a screenshot, a screen reader and a low-vision reader all lose the hierarchy at once." },
  pixel: { fidelity: 4.5, craft: 3.5, short: "A 16 × 16 sprite drawn as unit rectangles, four saturated hues, 4 px borders, a scanline overlay, a blinking cursor. It reads worse than it looks, and that is the trade.",
    note: "The graphics obey the style completely (no anti-aliasing, whole pixels only), and the boot strip and the PLAYER 1 / PLAYER 2 panels are the right jokes. The cost is typographic: the display face ships in one weight (400) and its capitals have no rhythm to set a headline with, so it is 30 px on a desktop, 19 px on a phone, in a 26-character measure, and the reading face is VT323 at 22 px — a terminal font asked to set a book. Motion is one blink, and it stops when asked." },
  japanese: { fidelity: 4, craft: 4.5, short: "Warm paper, hairlines, one vermilion spent on a seal, a vertical title, long leading. The quietest page, and the one whose signature costs the most layout.",
    note: "The vertical column is the whole style in one element and it forces a three-column hero with a lot of air. `font-feature-settings: \"jp\"` with lang=\"en\" keeps Latin punctuation from being drawn at half width — the smallest technical detail in this study and the one a native reader would notice first. The seal red measures 4.4:1, so the places where red must be read use a darkened red at 5.1:1, and the true vermilion is kept for the seal and the numerals." },
  cyber: { fidelity: 4.5, craft: 4, short: "Cut-corner panels in two clipped layers, a perspective grid, a HUD strip, monospace telemetry, glow only on the live element. The most engineered sheet of the nine.",
    note: "It invents properly in the style's own language — the status strip, the tier IDs, the decoded transmission — and keeps the discipline that cyan is structure, magenta is the live thing, lime is a reading. It adds the most words of the nine (+42), all of them labels, which is the style's habit: a heads-up display is mostly labelling. Its grid layer is a fixed background, so it does not move with the page; that reads as depth on a screen and as a band in a screenshot." },
  luxury: { fidelity: 4.5, craft: 4, short: "A hairline frame, centred symmetry, a light serif at a size that forces slowness, gold on lines only. Where gold must be read, it is a different gold.",
    note: "The most restrained page: 5 inks, 0 px of shadow, motion as a 400 ms colour change that is removed on request. Two things go against the subject — a luxury layout centres the call to action and slows the reader, and a grant applicant in a flood season should not be read to slowly — which is a good example of a style being performed well and chosen badly." },
};


/* ---------- the masthead and the brief ---------- */
const totalBytes = sum(R.map((r) => r.bytesHtml + r.bytesCss));
el("fact-content").textContent = `${S.contentStrings} strings · ${S.contentWords} words, one file`;
el("fact-file").textContent = `${R.length} HTML + ${R.length} CSS, ${kb(totalBytes)} KB of markup and stylesheet`;
el("fact-render").textContent = "render.js — every page builds its own from content.json";
const shots = sum(R.map((r) => r.audit.shots));
el("fact-shots").textContent = `${shots} (${R.length} × hero, whole page, phone) — ${sum(R.map((r) => r.audit.consoleErrors))} console errors, ${Math.max(...R.map((r) => r.audit.contrast ?? 0))} contrast findings at the end`;

const C = S.content;
el("b-hed").textContent = C.h1;
el("b-lede").textContent = C.lede;
el("b-list").innerHTML =
  C.features.map((f) => `<li><b>${esc(f.t)}</b> — ${esc(f.b)}</li>`).join("") +
  C.stats.map((s) => `<li><b>${esc(s.v)} ${esc(s.u)}</b> — ${esc(s.n)}</li>`).join("") +
  `<li><b>${esc(C.quote.by)}</b>, ${esc(C.quote.role)}: “${esc(C.quote.q)}”</li>` +
  C.plans.map((p) => `<li><b>${esc(p.t)}</b> ${esc(p.p)} ${esc(p.per)} — ${esc(p.l.join("; "))}</li>`).join("") +
  `<li><b>${esc(C.foot.inputLabel)}</b> (${esc(C.foot.inputHint)}) · ${esc(C.foot.lines.join(" · "))} · ${esc(C.foot.legal)}</li>`;

/* ---------- the nine heroes ---------- */
el("hero-strip").innerHTML = R.map((r) => `
  <figure>
    <a href="${r.file}" aria-label="Open the ${nameOf(r.key)} page"><img src="shots/${r.key}-hero.jpg" alt="The top of the ${r.title} page" loading="lazy"></a>
    <figcaption><b>${esc(nameOf(r.key))}</b><span>${r.heights.full ?? "?"} px tall</span></figcaption>
  </figure>`).join("");

el("towers-strip").innerHTML = R.map((r) => `
  <figure>
    <a href="shots/${r.key}-full.jpg" aria-label="The whole ${nameOf(r.key)} page, full-size capture"><img src="shots/${r.key}-full.jpg" style="--pageh: ${r.heights.full ?? 2400}" alt="The whole ${nameOf(r.key)} page" loading="lazy"></a>
    <figcaption><b>${esc(SHORT[r.key])}</b>${r.heights.full ?? "?"} px · ${kb(r.bytesHtml + r.bytesCss)} KB</figcaption>
  </figure>`).join("");

/* ---------- one card per style ---------- */
el("cards").innerHTML = R.map((r, i) => {
  const j = JUDGEMENT[r.key];
  const n = String(i + 1).padStart(2, "0");
  return `<article class="card" id="${r.key}">
    <div class="card-head">
      <h3>${n} · ${esc(nameOf(r.key))}</h3>
      <p class="who"><a href="${r.file}">open the page</a><a href="${r.cssFile}">its stylesheet</a><span>${esc(r.fonts.join(", "))}</span></p>
    </div>
    <p class="rules">${esc(r.rules)}</p>
    <div class="shots">
      <figure class="d"><a href="${r.file}" aria-label="Open the ${nameOf(r.key)} page"><img src="shots/${r.key}-hero.jpg" alt="The ${nameOf(r.key)} page at 1440 by 900" loading="lazy"></a><figcaption>1440 × 900</figcaption></figure>
      <figure class="f"><a href="shots/${r.key}-full.jpg" aria-label="The whole ${nameOf(r.key)} page, full-size capture"><img src="shots/${r.key}-full.jpg" style="--pageh: ${r.heights.full ?? 2400}" alt="The whole ${nameOf(r.key)} page" loading="lazy"></a><figcaption>whole page, ${r.heights.full ?? "?"} px</figcaption></figure>
      <figure class="p"><a href="shots/${r.key}-phone.jpg" aria-label="The ${nameOf(r.key)} page at 390 pixels wide, full-size capture"><img src="shots/${r.key}-phone.jpg" alt="The ${nameOf(r.key)} page at 390 pixels wide" loading="lazy"></a><figcaption>phone 390 × 844 of ${r.heights.phone ?? "?"} px</figcaption></figure>
    </div>
    <dl class="numbers">
      <div><dt>Type in use</dt><dd>${esc(r.h1font)} ${r.h1size.replace("px", "")} / ${r.h1weight}, ${esc(r.bodyfont)} ${r.bodysize.replace("px", "")}</dd></div>
      <div><dt>Type arrived</dt><dd>${(r.render && r.render.woff) || 0} font files fetched · ${esc(((r.render && r.render.families) || []).join(", ") || "none")}</dd></div>
      <div><dt>Smallest text</dt><dd>${r.smallestText ? r.smallestText.toFixed(1) : "?"} px · body leading ${esc(r.bodyleading)}</dd></div>
      <div><dt>Colour</dt><dd>${r.dom.inks} rendered inks · ${r.css.coloursDeclared} declared${r.dom.bg ? " · base " + esc(r.dom.bg) : ""}</dd></div>
      <div><dt>Geometry</dt><dd>max radius ${r.dom.maxRadius} px · ${r.css.borders} borders · ${r.css.shadows} shadows</dd></div>
      <div><dt>Motion</dt><dd>${r.dom.animations} running · ${r.css.keyframes} keyframes · reduced-motion block ${r.css.reducedMotion ? "yes" : "NO"}</dd></div>
      <div><dt>Signatures</dt><dd>${r.css.features.length ? esc(r.css.features.join(", ").replace(/:/g, "")) : "type and rule only"}</dd></div>
      <div><dt>Content</dt><dd>${r.parity.found}/${r.parity.total} strings · ${r.wordsRendered} words rendered · ${r.extraWords.count} added</dd></div>
      <div><dt>Audit</dt><dd>${r.audit.consoleErrors} console · ${r.audit.contrast ?? "—"} contrast · ${esc(r.audit.landmarks || "—")} · ${kb(r.bytesHtml + r.bytesCss)} KB</dd></div>
    </dl>
    <p class="verdict-one"><b>Fidelity ${j.fidelity} · Craft ${j.craft}.</b> ${j.note}</p>
  </article>`;
}).join("");

function nameOf(key) {
  return {
    swiss: "Swiss / International Typographic",
    brutalism: "Brutalism",
    editorial: "Editorial / magazine",
    glass: "Glassmorphism",
    neumorph: "Neumorphism",
    pixel: "Pixel / 8-bit",
    japanese: "Japanese minimal",
    cyber: "Cyber / heads-up display",
    luxury: "Luxury / house of distinction",
  }[key];
}

/* ---------- the parity table ---------- */
const extrasAll = R.map((r) => r.extraWords.count);
el("parity-intro").insertAdjacentHTML("beforeend", ` On these nine pages the answer is:
  <strong>all ${S.contentStrings} content strings are present in all nine</strong>, and each style
  added between ${Math.min(...extrasAll)} and ${Math.max(...extrasAll)} words of its own.`);
el("parity-table").innerHTML = `
  <thead><tr><th>Style</th><th class="num">Strings found</th><th>Missing</th><th class="num">Words rendered</th><th class="num">Words added</th><th>The words a style added</th></tr></thead>
  <tbody>${R.map((r) => `<tr class="${r.parity.found === r.parity.total ? "perfect" : ""}">
    <th>${esc(nameOf(r.key))}</th>
    <td class="num good">${r.parity.found}/${r.parity.total}</td>
    <td>${r.parity.missing.length ? esc(r.parity.missing.join(", ")) : "—"}</td>
    <td class="num">${r.wordsRendered}</td>
    <td class="num">${r.extraWords.count}</td>
    <td class="extras">${esc(r.extraWords.list.slice(0, 12).join(" · "))}</td>
  </tr>`).join("")}</tbody>`;
el("parity-note").innerHTML = `The added words are of three kinds, and the table cannot tell them apart, so it is stated
  here: nav labels and section names (every style), numerals and ornaments (seven styles), and
  <em>specimen data</em> — a log of five sightings at the Sandbar hide, added to the five styles
  that show an app screen (brutalism, glass, neumorphism, pixel, cyber) to demonstrate the
  product. The specimen log is not brief copy; it is the same five records in all five pages.`;

/* ---------- the measurement table ---------- */
el("measure-table").innerHTML = `
  <thead><tr><th>Style</th><th>Display face</th><th>Body face</th><th class="num">h1</th><th class="num">h1 wt</th><th class="num">h1 tracking</th><th class="num">body</th><th class="num">leading</th><th class="num">smallest</th><th class="num">inks</th><th class="num">radius</th><th class="num">anim</th><th class="num">page px</th><th class="num">KB</th></tr></thead>
  <tbody>${R.map((r) => `<tr>
    <th>${esc(nameOf(r.key))}</th>
    <td>${esc(r.h1font)}</td>
    <td>${esc(r.bodyfont)}</td>
    <td class="num">${r.h1size}</td>
    <td class="num">${r.h1weight}</td>
    <td class="num">${r.h1tracking}</td>
    <td class="num">${r.bodysize}</td>
    <td class="num">${esc(r.bodyleading)}</td>
    <td class="num">${r.smallestText.toFixed(1)}</td>
    <td class="num">${r.dom.inks}</td>
    <td class="num">${r.dom.maxRadius}</td>
    <td class="num">${r.dom.animations}</td>
    <td class="num">${r.heights.full}</td>
    <td class="num">${kb(r.bytesHtml + r.bytesCss)}</td>
  </tr>`).join("")}</tbody>`;
el("measure-note").innerHTML = `Nine pages, ${new Set(R.map((r) => r.h1font)).size} display faces and
  ${new Set(R.map((r) => r.bodyfont)).size} body faces — no face is used twice. Radius runs from 0 px
  (four styles) to 999 px (two), motion from 0 to 3 running animations, page length from
  ${Math.min(...R.map((r) => r.heights.full))} px to ${Math.max(...R.map((r) => r.heights.full))} px,
  and every one of the nine carries a <code>prefers-reduced-motion</code> block.
  ${R.filter((r) => r.css.threeCol).length} of the nine use a three-column grid for the features — the one
  piece of armature that survives every costume, and the reason this study is about skins.
  Type is measured too: ${R.reduce((a, r) => a + ((r.render && r.render.woff) || 0), 0)} font files were
  fetched across the nine pages, and the first family the browser reports for every body and headline is
  a pinned one. In the first pass of this task that was not true — the editorial body reported
  <em>Times New Roman</em>, the browser's own serif, with its pinned faces registered and never fetched —
  and the screenshots of that pass are in the git history.`;

/* ---------- the ratings ---------- */
el("rating-table").innerHTML = `
  <thead><tr><th>Style</th><th class="num">Fidelity</th><th class="num">Craft</th><th>The judgement</th></tr></thead>
  <tbody>${R.map((r) => `<tr><th>${esc(nameOf(r.key))}</th><td class="num"><span class="rate"><b>${JUDGEMENT[r.key].fidelity}</b><span>/5</span></span></td><td class="num"><span class="rate"><b>${JUDGEMENT[r.key].craft}</b><span>/5</span></span></td><td>${JUDGEMENT[r.key].short}</td></tr>`).join("")}</tbody>`;

/* ---------- the verdict ---------- */
const worst = R.reduce((a, b) => (a.extraWords.count > b.extraWords.count ? a : b));
const best = R.reduce((a, b) => (a.extraWords.count < b.extraWords.count ? b : a));
el("verdict-body").innerHTML = `
  <p><strong>What is good here is the part that is rules.</strong> Swiss, editorial, Japanese minimal
  and luxury — the styles whose identity lives in a grid, a measure and a type pairing — come out the
  strongest, and they are the four cheapest to build: two typefaces, a few hairlines, no images. Each
  keeps its own discipline where it costs something: the Swiss sheet spends its red three times in a
  page and sets no corner at a radius; the luxury page sets a headline at a size that slows the reader
  down and keeps its gold at 3.2:1 on the rules, switching to a darkened gold at 5.7:1 the moment the gold has to be read; the Japanese page
  runs its title vertically and pays for it with a three-column hero.</p>

  <p><strong>What is good here is also, visibly, the surface.</strong> Brutalism gets the defaults
  (Times for reading, a monospace for shouting), the 3 px rules, the hard offset shadows, the ticker,
  and a hover that swaps colours instead of easing. Pixel draws its bird as 1 × 1 rectangles with
  <code>shape-rendering: crispEdges</code> and puts a scanline over the whole page. Cyber cuts panel
  corners with two clipped layers, because a <code>clip-path</code> cuts an ordinary border away —
  a technique chosen by the constraint, not by taste. On the surface, the range is real:
  ${new Set(R.map((r) => r.h1font)).size} display faces, ${new Set(R.map((r) => r.bodyfont)).size} text faces,
  no repeats, and radii from 0 to 999 px.</p>

  <p><strong>The skins change; the armature does not.</strong> ${R.filter((r) => r.css.threeCol).length} of
  the nine put the features in a three-column grid; every one of the nine states a statistic as a big
  numeral over a capitals label; the plans are two panels in all nine; the form at the bottom is a
  labelled input and a button in all nine. Six of the nine heroes are copy-left, figure-right. That is
  the honest limit of this exercise: nine costumes, one skeleton. A model can restyle a page
  convincingly; it does not, on its own, re-invent the structure of the argument.</p>

  <p><strong>The idioms' known failures show up in the measurements, not in the intent.</strong>
  Neumorphism's hierarchy is shadow, so its first pass lost contrast in five places — the soft
  greys the idiom is made of, and the accent — and every one had to be darkened against the surface
  before the audit was clean. Brutalism's loudest hues land on the same line. Glassmorphism needed a
  solid base colour under the mesh (a body background paints above a <code>z-index:-1</code> layer, so
  the blur had nothing to blur), and it is the one page where the style's own recipe — white text on a
  ten-percent panel — is the accessibility problem. Every one of the nine is clean at the end:
  ${sum(R.map((r) => r.audit.consoleErrors))} console errors and ${Math.max(...R.map((r) => r.audit.contrast ?? 0))} contrast findings
  across ${shots} shots. The fixes are in the sheets, and the audits that found them are in
  <a href="NOTES.md">NOTES.md</a>.</p>

  <p><strong>The content holds, with one honest qualification.</strong> All ${S.contentStrings} brief strings appear
  in all nine pages. Each style adds ${Math.min(...extrasAll)}–${Math.max(...extrasAll)} words: labels, section
  names and numerals everywhere, and the same five-record specimen log in the five pages that show a
  screen. The most talkative page is ${esc(nameOf(worst.key))} (+${worst.extraWords.count}); the most obedient is
  ${esc(nameOf(best.key))} (+${best.extraWords.count}). One page (editorial) began by inventing two paragraphs of its
  own prose, which the parity check caught at +53 words; that prose is gone, and the section now sets
  the brief's own sentences in two columns. A check that catches its own author is the useful part of this exercise.</p>

  <p><strong>What is weakest.</strong> The display faces that carry a style most strongly also break
  first: the pixel page sets its headline in a one-weight, capitals-only face (30 px on a desktop,
  19 px on a phone, a 26-character measure) and its body in a terminal font at 22 px, so it reads
  worse than it looks, and the smallest type in the study is a tracked label at 10.5 px on the luxury
  page. The specimen logs
  are a way of making a style look convincing — an app screen always helps — and five of them is five
  too many for a study about copy. The ratings below are mine, and the styles that suit the subject
  (Swiss, editorial, Japanese) are the styles I would rate highly in any case: the ranking is a
  taste, not a measurement.</p>`;

