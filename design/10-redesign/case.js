/* 10 · the case study.
   Two jobs. One: measure both pages with one function, in the browser, on every
   load, so the claims in the change log are not my notes. Two: hold the twenty
   changes, each with what the page did, what it does now, and the rule it comes
   from. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── the measurement ────────────────────────────────────────────────── */
const rgb = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s || "");
  if (!m) return null;
  const p = m[1].split(/[\s,\/]+/).filter((x) => x !== "").map(Number);
  return p.length >= 3 ? { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } : null;
};
const lum = ({ r, g, b }) => {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
const over = (c, bg) => {
  const a = c.a === undefined ? 1 : c.a;
  return { r: c.r * a + bg.r * (1 - a), g: c.g * a + bg.g * (1 - a), b: c.b * a + bg.b * (1 - a), a: 1 };
};
const bgOf = (el, doc) => {
  let e = el;
  while (e && e !== doc.documentElement.parentElement) {
    const c = rgb(getComputedStyle(e).backgroundColor);
    if (c && (c.a === undefined ? 1 : c.a) > 0.05) return c;
    e = e.parentElement;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
};
const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
const visible = (el) => {
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 2 && r.height >= 2;
};
const accName = (el, doc) => {
  const aria = (el.getAttribute("aria-label") || "").trim();
  if (aria) return aria;
  const id = el.getAttribute("aria-labelledby");
  if (id) { const s = id.split(/\s+/).map((i) => doc.getElementById(i)).filter(Boolean).map((e) => e.textContent).join(" ").trim(); if (s) return s }
  if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(" ").trim();
  if (/^(a|button|summary)$/.test(el.tagName.toLowerCase())) return el.textContent.trim();
  return "";
};

function measure(doc, win, answerSel) {
  const all = $$("body *", doc);
  const textEls = all.filter((el) => visible(el) && ownText(el).length > 1 && !/^(script|style|noscript)$/.test(el.tagName.toLowerCase()));
  let low = 0, lowest = 21, minFont = 99, minFontEl = null;
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize);
    if (fs < minFont) { minFont = fs; minFontEl = el }
    const fg = rgb(s.color);
    if (!fg) continue;
    const bg = bgOf(el, doc);
    const r = ratio(over(fg, bg), bg);
    if (r < lowest) lowest = r;
    const large = fs >= 24 || (fs >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    if (r < (large ? 3 : 4.5)) low++;
  }
  const ctrl = $$("a[href],button,input,select,textarea,summary", doc).filter(visible);
  const frames = $$("iframe", doc).filter(visible);
  const small = ctrl.filter((el) => el.getBoundingClientRect().height < 34).length;
  const unl = ctrl.filter((el) => {
    const t = el.tagName.toLowerCase();
    if (t === "input" && /^(hidden|submit|button|reset)$/.test(el.type)) return false;
    return accName(el, doc).length < 2;
  }).length + frames.filter((f) => !(f.getAttribute("title") || "").trim() && !(f.getAttribute("aria-label") || "").trim()).length;
  const landmarks = $$("header,nav,main,footer,aside,form[aria-label],[role=main],[role=navigation],[role=search]", doc).length;
  const h1s = $$("h1", doc).length;
  const links = $$("a[href]", doc).length;
  /* A document entry: a listed notice whose text names a PDF with a size on it.
     The smallest matching elements only, so one row is counted once, not once per
     ancestor. The measure is not "how many links say PDF" — the redesign labels its
     PDFs honestly and would score worse than the page that hides them. It is
     "how many notices can only be read by downloading a file", and the megabytes
     the page can ask a reader to fetch. */
  const cand = $$("li,article,div,p,tr,td", doc)
    .filter((el) => /PDF\b[^\n]{0,40}?\d+(\.\d+)?\s?(MB|KB)/i.test(el.textContent) && el.textContent.length < 400);
  const docEntries = cand.filter((el) => !cand.some((o) => o !== el && el.contains(o)));
  const READ = /\b(read|read the plan|read the summary|apply|search the street|plain English|on this page)\b/i;
  const pdfOnly = docEntries.filter((el) => !READ.test(el.textContent)).length;
  const pdfMb = docEntries.reduce((n, el) => {
    const m = [...el.textContent.matchAll(/(\d+(?:\.\d+)?)\s?(MB|KB)/gi)].pop();
    return m ? n + (+m[1]) * (m[2].toUpperCase() === "MB" ? 1024 : 1) / 1024 : n;
  }, 0);
  const docs = docEntries.length;
  const posTab = $$("[tabindex]", doc).filter((e) => parseInt(e.getAttribute("tabindex"), 10) > 0).length;
  const moving = doc.getAnimations ? doc.getAnimations().filter((a) => { const t = a.effect && a.effect.getTiming(); return t && t.iterations === Infinity }).length : 0;
  const carousels = $$("[class*=slide],[class*=carousel],[class*=slider],[class*=ticker]", doc).length;
  const answer = answerSel ? $(answerSel, doc) : null;
  const answerY = answer ? Math.round(answer.getBoundingClientRect().top + win.scrollY) : 0;
  const res = win.performance.getEntriesByType("resource");
  const bytes = res.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0);
  return {
    low, lowest, minFont, minFontTag: minFontEl ? minFontEl.tagName.toLowerCase() : "—",
    controls: ctrl.length, small, unl, landmarks, h1s, links, pdfOnly, pdfMb, docs, posTab,
    moving, carousels, answerY,
    height: doc.documentElement.scrollHeight,
    overflow: doc.documentElement.scrollWidth - win.innerWidth,
    kb: Math.round(bytes / 1024), reqs: res.length,
  };
}

const PAGES = {
  before: { url: "before.html", answer: "#b-faq" },
  after: { url: "after.html", answer: ".do" },
};

function loadFrame(id, url) {
  return new Promise((res) => {
    const f = $("#" + id);
    f.addEventListener("load", () => setTimeout(() => res(f.contentDocument), 220), { once: true });
    f.src = url;
  });
}

async function measureAll() {
  const db = $("#probe-d-b"), da = $("#probe-d-a"), pb = $("#probe-p-b"), pa = $("#probe-p-a");
  const [dbd, dad, pbd, pad] = await Promise.all([
    loadFrame("probe-d-b", PAGES.before.url), loadFrame("probe-d-a", PAGES.after.url),
    loadFrame("probe-p-b", PAGES.before.url), loadFrame("probe-p-a", PAGES.after.url),
  ]);
  const docs = { before: dbd, after: dad }, phones = { before: pbd, after: pad };
  const B = measure(docs.before, db.contentWindow, PAGES.before.answer);
  const A = measure(docs.after, da.contentWindow, PAGES.after.answer);
  const PB = measure(phones.before, pb.contentWindow, null);
  const PA = measure(phones.after, pa.contentWindow, null);
  B.overflowP = PB.overflow; A.overflowP = PA.overflow;
  B.kb = Math.max(B.kb, PB.kb); A.kb = Math.max(A.kb, PA.kb);
  const tide = tideDiff(docs.before, docs.after);
  const up = B.answerY - A.answerY;
  const grow = A.height - B.height;
  const d = $("#pagesDelta");
  if (d) d.innerHTML = "Measured on these two files: the answer that was <b>" + B.answerY + " px</b> down the page is now at " +
    "<b>" + A.answerY + " px</b>, " + up + " px higher. The page itself grew from <b>" + B.height + " px</b> to <b>" +
    A.height + " px</b>, " + grow + " px longer, because the type is four and a half points bigger, the tide table " +
    "explains itself, and every notice says who it is for. A redesign that made the page shorter would have had to " +
    "cut something, and nothing was cut.";
  const m = $("#mastDelta");
  if (m) m.textContent = "The answer moved up " + up + " pixels. The page grew " + grow + ".";
  const f1 = $("#figBefore"), f2 = $("#figAfter");
  if (f1) f1.innerHTML = f1.innerHTML.replace("HEIGHT1", B.height + " px");
  if (f2) f2.innerHTML = f2.innerHTML.replace("HEIGHT2", A.height + " px");
  $("#tideDiff").textContent = tide.text;
  $("#tideDiff").style.color = tide.ok ? "var(--after)" : "var(--before)";
  render(B, A);
}

/* the tide tables: “the numbers did not move” is a rule, so it is checked —
   every time and every height in each day's row on both pages, as a sorted set.
   The day is found wherever it sits in the row: "03/12" in the first column on the
   before page, "Tue 3 December" in a row-header on the after page. */
function tideDiff(bd, ad) {
  const dayNum = (cell) => {
    let m = cell.match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})?$/) || cell.match(/^(\d{1,2})\/(\d{2})$/);
    if (m) return +m[1];
    m = cell.match(/^\w*\s*(\d{1,2})\s*(?:Dec|December)$/i);
    return m ? +m[1] : null;
  };
  const grab = (doc) => {
    const map = {};
    for (const tr of $$("table tr", doc)) {
      const cells = $$("td,th", tr).map((c) => c.textContent.trim());
      if (cells.length < 4) continue;
      let day = null, di = -1;
      cells.forEach((c, i) => { if (day === null) { const d = dayNum(c); if (d !== null) { day = d; di = i } } });
      if (day === null) continue;
      map[day] = cells.filter((_, i) => i !== di)
        .flatMap((c) => c.match(/\d{2}:\d{2}|\d+[.,]\d+/g) || [])
        .sort();
    }
    return map;
  };
  const b = grab(bd), a = grab(ad);
  let cells = 0, diff = 0, days = 0, missing = 0;
  for (const k of Object.keys(b)) {
    const bb = b[k], aa = a[k];
    if (!aa) { missing++; continue }
    days++;
    cells += bb.length;
    if (bb.join(",") !== aa.join(",")) diff++;
  }
  return { ok: diff === 0 && missing === 0 && days >= 7, text: `${days} days compared, ${cells} times and heights, ${diff} rows changed${missing ? `, ${missing} days not found on the new page` : ""}` };
}

function cell(v, good, bad) {
  return `<td class="v ${good ? "good" : bad ? "bad" : "mid"}">${v}</td>`;
}
function render(B, A) {
  const rows = [
    ["Contrast findings", "text elements measured below 4.5:1 (3:1 for large text)", B.low, A.low, `${B.low} → ${A.low}`, A.low < B.low, B.low > 0],
    ["Lowest ratio on the page", "the worst text a reader meets; 21:1 is black on white", B.lowest.toFixed(2), A.lowest.toFixed(2), `${B.lowest.toFixed(2)} → ${A.lowest.toFixed(2)}`, A.lowest > B.lowest, B.lowest < 4.5],
    ["Smallest text", `the page's smallest type (in a &lt;${B.minFontTag}&gt; on the before page)`, B.minFont.toFixed(0) + " px", A.minFont.toFixed(0) + " px", `${B.minFont.toFixed(0)} px → ${A.minFont.toFixed(0)} px`, A.minFont > B.minFont, B.minFont < 14],
    ["Targets under 34 px", `of ${Math.max(B.controls, A.controls)} interactive elements: nav links, utility links, buttons`, B.small, A.small, `${B.small} → ${A.small}`, A.small < B.small, B.small > 0],
    ["Controls with no name", "a link, button or field a screen reader cannot announce", B.unl, A.unl, `${B.unl} → ${A.unl}`, A.unl < B.unl, B.unl > 0],
    ["Landmarks", "header, nav, main, aside, footer, form — the map a reader walks", B.landmarks, A.landmarks, `${B.landmarks} → ${A.landmarks}`, A.landmarks > B.landmarks, B.landmarks < 4],
    ["One h1", "exactly one, and it is the answer, not the brand", B.h1s, A.h1s, `${B.h1s} → ${A.h1s}`, A.h1s === 1, B.h1s !== 1],
    ["Positive tabindex", "tab order forced out of the document", B.posTab, A.posTab, `${B.posTab} → ${A.posTab}`, A.posTab < B.posTab, B.posTab > 0],
    ["Things that move on their own", "infinite CSS animations, plus carousels and tickers", `${B.moving} + ${B.carousels}`, `${A.moving} + ${A.carousels}`, `${B.moving} + ${B.carousels} → ${A.moving} + ${A.carousels}`, (A.moving + A.carousels) < (B.moving + B.carousels), (B.moving + B.carousels) > 0],
    ["Scroll to the answer", "pixels from the top of the page to the text that says what to do", B.answerY + " px", A.answerY + " px", `${B.answerY} px → ${A.answerY} px`, A.answerY < B.answerY, true],
    ["Sideways scroll at 390 px", "the overflow a phone reader must pan across", B.overflowP + " px", A.overflowP + " px", `${B.overflowP} px → ${A.overflowP} px`, A.overflowP < B.overflowP, B.overflowP > 0],
    ["Bytes fetched", "the whole cost of the redesign: one inline file against a page that fetches fonts", B.kb + " KB", A.kb + " KB", `${B.kb} KB → ${A.kb} KB`, A.kb < B.kb, B.kb > A.kb],
    ["Notices readable only as a download", `of the listed documents, those with a PDF and no reading copy beside them`, `${B.pdfOnly} of ${B.docs}`, `${A.pdfOnly} of ${A.docs}`, `${B.pdfOnly} of ${B.docs} → ${A.pdfOnly} of ${A.docs}`, A.pdfOnly < B.pdfOnly, B.pdfOnly > 0],
    ["Megabytes of PDF on the page", "the sum of the files listed: the record stays, so this barely moves — the win is the reading copy, not the file", B.pdfMb.toFixed(1) + " MB", A.pdfMb.toFixed(1) + " MB", `${B.pdfMb.toFixed(1)} MB → ${A.pdfMb.toFixed(1)} MB`, null, null],
    ["Links on the page", "counted, not judged: more links is not more usable", B.links, A.links, `${B.links} → ${A.links}`, null, null],
    ["Document height at 1400 px", "the whole page: the redesign is longer, and that is the cost of the space", B.height + " px", A.height + " px", `${B.height} px → ${A.height} px`, A.height < B.height, null],
  ];
  $("#mbox").innerHTML = `<table class="m">
    <thead><tr><th>Measure</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
    <tbody>${rows.map(([k, w, b, a, ch, better, badBefore]) =>
      `<tr><td class="mz">${k}<small>${w}</small></td>${cell(b, false, badBefore)}${cell(a, better, false)}<td class="v mid">${ch}</td></tr>`).join("")}
    </tbody></table>
    <p class="mnote"><b>The rows are the whole audit, and one of them is against the redesign.</b>
      The “Scroll to the answer” row measures the before page's FAQ answer
      (&ldquo;Refer to your Flood Risk Management Plan&rdquo;) against the after page's four things to do.
      The “Bytes fetched” row is the redesign's own cost: the before page is a single file with inline CSS,
      no webfonts and no photographs, so it fetches about a kilobyte; the after page fetches several hundred,
      of which almost all is five pinned webfont files. <b>The bad page is faster.</b> That is the price of
      type a person in sunlight can read, and it is a real price: the fix is to subset the display face to the
      characters warnings and headings use, self-host it, preload the one body face, and let the mono stack fall
      back to the system's. These numbers are what a redesign costs, not only what it saves.</p>`;
}

/* ── the change log ─────────────────────────────────────────────────── */
const CHANGES = [
  {
    t: "The answer is the first thing on the page",
    prob: "The warning is a red strip of legal prose under a photo carousel, and the only instruction a resident can act on — “Refer to your Flood Risk Management Plan” — is the second FAQ item, far down the page.",
    chg: "The status panel is at the top: the area, the flood line, the window of hours, the forecast peak and its time, and four things to do. The legal reference and the official PDF are one line below it.",
    prn: "A page has one job. Put the answer where the eye lands, and let everything else on the page support it.",
    crops: ["c-01b", "c-01a", "The before page's only instruction, in the FAQ; the after page's first screen."],
  },
  {
    t: "The warning rewritten in English, with the reference kept",
    prob: "“…make application to the Authority in respect of any temporary defences not already installed. Duration of the warning is indefinite pending review of the Estuary Gauge Array and the Met Office Nautilus model run.”",
    chg: "Sentences under 22 words, the numbers inside the sentence, the verb in the second person. The reference <span class='kv'>TID/2024/1187</span>, the area's legal name, the 4.20 m threshold, the issue time and the review time are all still there, on one line under the plain answer.",
    prn: "A statutory notice and a reading copy are two documents. Keep both; show the one a person can act on at 11 pm first.",
  },
  {
    t: "The carousel is gone",
    prob: "Four slides advancing every 4.5 seconds with no pause control: a twenty-five year strategy, dredging, a new gauge, a schools programme. The flood warning is not in the carousel, and the carousel is above it.",
    chg: "Nothing replaces it. The three announcements are in News, dated, where a reader can take them in; the strategy consultation is the first item there.",
    prn: "Auto-advancing content is a timer the visitor did not ask for. On a flood page it competes with the flood for a reader's one point of attention.",
    crops: ["c-02b", "c-02a", "Four slides and four dots, against the warning that used to sit under them."],
  },
  {
    t: "The ticker stopped, and its numbers went where they are read",
    prob: "A yellow band of text moving right to left for 18 seconds: the live tide, the next high water, a gale warning, the ferry, a phone number.",
    chg: "The same five facts as five lines in the “Right now” panel, with the tide and the next high water at the top of the panel that is read first. The ferry is a line of its own.",
    prn: "Moving text is unreadable for many readers and unpausable for all of them. A fact that scrolls past is a fact you have to catch.",
  },
  {
    t: "A cookie wall became a banner, and the least-tracking choice came first",
    prob: "A dark strip over the bottom of the page: “By continuing to browse you agree”, one button “Continue”, and a second button of the same colour labelled “More information”. There is no refusal.",
    chg: "Two buttons and a link: <span class='kv'>Only what you asked for</span> first, <span class='kv'>Accept analytics too</span> second, “Decide later” as a link. Analytics are off until asked, and the page is fully usable behind the banner.",
    prn: "A choice with one path is not a choice. The default should be the option that takes least from the visitor.",
    crops: ["c-07b", "c-07a", "The as-found strip, whose only exit is agreement; the banner, whose first button refuses."],
  },
  {
    t: "Three columns became one column and a rail",
    prob: "57 / 23 / 20 percent of a fixed 960 px: reading columns of 545, 220 and 190 px at 11 px type. The main argument is 46 characters wide; the third column is six links and four downloads.",
    chg: "One reading column at 68 characters, and one rail of 300 px that holds actions. Below 1 000 px the rail falls under the content; the third column's six destinations are in the footer.",
    prn: "The column that carries the argument has to be readable. Everything else supports it, or goes away.",
    crops: ["c-06b", "c-06a", "Six widgets in two side columns; one rail of three boxes, with the newsletter last."],
  },
  {
    t: "Nine nav links became five, and the five are the page's questions",
    prob: "FLOOD RISK · TIDAL DATA · PERMITS &amp; LICENCES · WATER MANAGEMENT · ESTUARY REPORTS · COMMUNITY · SERVICES · DOCUMENT LIBRARY · HOME, in capitals at 11 px in a 30 px band, plus a “MENU” link on the same desktop nav.",
    chg: "Flood status · Tide times · Notices · News · Help. The rest are in the footer under Services, The Authority and Help, where the people who want a specific document look. The desktop “MENU” is gone.",
    prn: "Navigation labels are the visitor's words, not the organisation's departments. Five labels you can find beat nine you have to read.",
    crops: ["c-04b", "c-04a", "The nine-link band, and the five-link one."],
  },
  {
    t: "The search box got a label and a word",
    prob: "A text input with <span class='kv'>placeholder=\"Search\"</span> and a button containing a magnifier character. A placeholder is not a label: it vanishes on typing, is contrast-grey, and is not announced as a name by every reader.",
    chg: "A visible label “Search this site”, a <span class='kv'>&lt;form role=\"search\"&gt;</span>, and a button that says “Search”.",
    prn: "A control must be able to say what it is, out loud, after the text inside it has gone.",
  },
  {
    t: "Type: 11 px grey, to 16 px ink",
    prob: "Body text at 11 px in <span class='kv'>#999</span> on white — 2.85:1 — with 10 px for the small print, which is where the datum, the units and the units' exceptions live. The measured lowest ratio on the page is the grey date against the grey block.",
    chg: "16 px body at 15.2:1, 16.5 px on a phone, 13 px only for metadata and that at 4.9:1. The table's numbers are 15 px tabular mono.",
    prn: "A flood page is read in a kitchen, in a car, in the rain, on a screen in sunlight. Contrast and size are the whole of legibility.",
    crops: ["c-05b", "c-05a", "The news block at 11 px grey, and at 16 px ink."],
  },
  {
    t: "The tide table: eleven columns of grey, to a table that explains itself",
    prob: "Eleven columns of 10 px <span class='kv'>&lt;td&gt;</span>s used as headers with no scope, two high waters and two lows a day in unlabelled pairs, an em dash with no explanation, “S/G” and “DATUM” in the footnotes, and the flood line nowhere.",
    chg: "Real <span class='kv'>&lt;th scope&gt;</span>s, a caption carrying the units and the datum, all four waters of each day labelled in the order they happen, the days that reach the flood line tinted, the missing observation explained (the gauge was out of service; it is not estimated), and seven cards on a phone. <b>Every number is the number it was.</b> The cell-by-cell check caught the first version of this table dropping the second low water of every day; it is in the page now, and the row below is the proof.",
    prn: "A table is an argument about the data. Put the units in the header, the threshold in the rows, and the gaps in the open.",
    crops: ["c-03b", "c-03a", "The same seven days: eleven grey columns, and a table with the flood line marked."],
  },
  {
    t: "Dates written as dates",
    prob: "03/12/2024, 28/11/2024. Among the estuary's trading partners that is 3 December or 12 March, and the difference is the deadline of a consultation.",
    chg: "3 December 2024, in a <span class='kv'>&lt;time&gt;</span> element, so the machine-readable date survives the human-readable one.",
    prn: "A civic page is read by people whose first language is not English. A format that is ambiguous in two countries is a bug, not a style.",
  },
  {
    t: "Seven PDF-only notices became five notices you can read",
    prob: "Seven links, each a PDF of 410 KB to 3.1 MB, titled by their legal names. To learn whether a grant is for you, a reader downloads 640 KB and searches it.",
    chg: "Each notice is a page with a plain-language title, the issue date, a line saying who it is for, and the PDF beside it as the official record. The grant notice links to the application (task 08).",
    prn: "The PDF is the record; the web page is the reading copy. Making one stand in for the other costs a megabyte and a minute of a reader's time.",
  },
  {
    t: "Six sidebar widgets became three boxes, and seven links went to the organisation that owns them",
    prob: "“Quick Links” with 14 links, seven of them another organisation's services (housing, bins, council tax, roads) with nothing saying so. “Latest Updates” is a third-party feed that phones home and repeats News. “Weather” is a third-party widget: a blank 60×40 image and four words.",
    chg: "Three boxes: Actions, Prepare, Warnings for you. The district council's services are in the footer under a heading that names the council. The feed and the widget are gone, and their facts are in the page.",
    prn: "A sidebar is a tax on attention. A third-party widget is also a tax on the visitor's browser, on their privacy, and on the page's load in a car park.",
  },
  {
    t: "The phone number moved to where panic looks",
    prob: "The number is in the fourth sidebar widget, under the heading “Contact”, at 11 px, next to the opening hours. The utility bar offers “Contact 101”.",
    chg: "“Flooding now? Call 0300 123 4567 — out of hours, the same number”, in the masthead, at every page width, as a <span class='kv'>tel:</span> link so a phone dials it.",
    prn: "The emergency route goes where a frightened person looks: the top of the screen, in red, in the words they would use.",
  },
  {
    t: "The newsletter moved out of the middle of the answer",
    prob: "A cream box between the notices and the FAQ: “Sign up to estuary updates … sent fortnightly”, with an email field and a button, in the main column, on a page about a flood warning in force.",
    chg: "The bottom of the rail, below “Warnings for you”, and the copy says what it is not: “Not a warning list — warnings are a separate, free service above.” The warning signup is a full-width button above it.",
    prn: "On a warning page, anything that looks like the action is the action. A reader who signs up to a fortnightly newsletter during an emergency has been failed by the design.",
  },
  {
    t: "“Am I in a flood zone?” is a lookup, not a pointer to a 2.4 MB PDF",
    prob: "The FAQ's answer: “Designated areas are defined in the Designated Areas Order 2019 and are depicted on the indicative map, available from the document library.” The map is a 2.4 MB PDF of a statutory instrument.",
    chg: "An address box in the status panel. The demo answers give a warned address, a borderline one (with the model's stated margin), and a clear one; a miss says the index covers designated areas only, and gives the phone number and the street list.",
    prn: "Answer the question that brought the person. Show the uncertainty you have: a borderline answer without its margin is a guess dressed as a fact.",
  },
  {
    t: "One h1, and it is the answer",
    prob: "No <span class='kv'>&lt;h1&gt;</span> at all. Four <span class='kv'>&lt;h2&gt;</span>s styled identically, <span class='kv'>&lt;h4&gt;</span>s in the news, widget titles as <span class='kv'>&lt;div class=\"t\"&gt;</span>, and every heading in capitals so the eye cannot skim them.",
    chg: "One <span class='kv'>&lt;h1&gt;</span>: “Harrowmouth, Lower Sandbar and Upcerne” — the warned area, which is the answer. A real outline under it, in sentence case, and the brand in the masthead where it belongs.",
    prn: "A heading is a position in an argument, not a size of type. The h1 of a flood page is the place that is flooding.",
  },
  {
    t: "The tab order is the document",
    prob: "Three positive <span class='kv'>tabindex</span>s: 1 on the active nav link, 2 on the first utility link, 3 on the search box. Everything else is 0, so the first Tab lands in the middle of the header and the order is a matter of the numbers, not of the page.",
    chg: "No positive tabindex anywhere (measured 3 → 0). A visible focus ring on every control, and the skip link as the first stop.",
    prn: "Keyboard order is reading order. It has to survive a template change, which means it must come from the document.",
  },
  {
    t: "Targets, at the sizes a thumb has",
    prob: "The nav band is 30 px tall with 11 px labels; the utility bar's links are 10 px, sitting 3 px apart. Measured: most of the page's interactive elements are under 34 px tall.",
    chg: "Nav links 44 px, rail actions 44 px on touch pointers, buttons 40–44 px, the phone nav 44 px. The measured count under 34 px falls to the inline text links, which are allowed to be text-sized.",
    prn: "A page read in a moving car is operated by a thumb on glass. Text links are exempt; controls are not.",
  },
  {
    t: "The phone: from half a viewport of sideways scroll to none",
    prob: "A fixed 960 px layout on a 390 px screen. Measured overflow: 572 px. The reader pans, and to read the tide table zooms to about a quarter, which is eleven pans.",
    chg: "Fluid, one column, the tide table as seven cards with the labels beside the values, the status panel stacked above the address check, the cookie buttons 44 px, no sideways scroll (measured 0).",
    prn: "The phone is not a small desktop: it is how a person reads this page in a car, in the rain, with one hand, on a bad signal.",
    crops: ["c-08b", "c-08a", "The 960 px page on a 390 px screen, and the same content fluid."],
  },
  {
    t: "The tide, drawn — and the two numbers that were one number",
    prob: "The lede says the peak is <span class='num'>4.61 m</span>, 41 cm above the flood line. The table's 22:14 high water is <span class='num'>4.48 m</span>. Nothing on the page said the first is the forecast water level, tide plus storm surge, and the second the astronomical prediction: the redesign appeared to contradict itself, in the one sentence a resident acts on.",
    chg: "The lede names both and says what each is, and the table's caption says the table is the prediction without surge. <span class='kv'>10-redesign/measure.mjs</span> prints the arithmetic it checks: 41 = (4.61 − 4.20) × 100, and the predicted height quoted in the lede equals the table's own 22:14 height, 4.48 m.",
    prn: "A page that shows two numbers for one event must say which is which. An unexplained difference is read as an error, and in an emergency a page that must be interpreted is not a page.",
  },
  {
    t: "The shape of the water, in the row it belongs to",
    prob: "The subject is a tide and the page drew it as nine columns of numbers. The question is not what 4.48 means, it is how far over the line the water goes and what shape it makes — and the answer sits in the row, unreadable as a shape.",
    chg: "Each day's row carries its tide curve under the date, drawn from that row's own cells: four waters in order, the flood line dashed with the band above it, peaks flood-coloured where a water passes the line, and a gap where the gauge was out of service. The instrument maps every dot back through the scale to its cell (0.008 m) and refuses a peak coloured above the line that the numbers do not support.",
    prn: "Draw the subject where its data is. A shape earns its place by being the same facts as the text, and by failing the measurement when it is not.",
  },
  {
    t: "The margin, drawn: 26 cm below, 28 over, 41 over",
    prob: "The panel lists 3.94 m now, a flood line of 4.20, a next high of 4.48, a forecast of 4.61. What those four add up to — how close you are tonight, and how far over it is going — the reader has to subtract at 11 pm.",
    chg: "The panel carries a level gauge on one scale: a bar to the current tide, the flood line, the predicted high, the forecast with surge, and a key that states each mark as centimetres of margin. The marks are the panel's own data attributes and the instrument maps them back to them (0.000 m), so the picture cannot drift from the list.",
    prn: "Where a person acts on a margin, show the margin. Colour carries the state and the words carry it too, so nothing on a flood page is colour-only.",
  },

];

function renderLog() {
  $("#log-list").innerHTML = CHANGES.map((c, i) => `
    <li id="ch-${i + 1}">
      <div class="ch">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <h3>${c.t}</h3>
          <div class="grid">
            <div class="prob"><b class="k">The page did</b>${c.prob}</div>
            <div class="chg"><b class="k">It does now</b>${c.chg}</div>
            <div class="prn"><b class="k">The rule it comes from</b>${c.prn}</div>
          </div>
          ${c.crops ? `<div class="shots">
            <figure><span class="lab b">Before</span><img src="shots/${c.crops[0]}.jpg" alt="The before page, at the part this change is about." loading="lazy"></figure>
            <figure><span class="lab a">After</span><img src="shots/${c.crops[1]}.jpg" alt="The after page, at the same subject." loading="lazy"></figure>
            <p class="cap">${c.crops[2]}</p>
          </div>` : ""}
        </div>
      </div>
    </li>`).join("");
}

renderLog();
measureAll().catch((e) => {
  $("#mbox").innerHTML = `<p class="mnote" style="border-color:var(--before)">The measurement did not run:
    <span class="kv">${String(e).replace(/[<>&]/g, "")}</span>. The change log does not depend on it.</p>`;
});
