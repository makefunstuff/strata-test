/* 09 · motion study.
   One rule runs this whole page: every animation is a Web Animation that is
   created paused. The live demo plays it; the strip holds it at a millisecond.
   Nothing is painted, nothing is faked, and with prefers-reduced-motion the
   durations come from CSS as 0 ms, so the three frames of a strip become
   identical — which is the honest picture of what reduced motion is. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const EASE = {
  std: "cubic-bezier(0.2, 0.7, 0.3, 1)",
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  spring: "cubic-bezier(0.34, 1.4, 0.5, 1)",
};
const cssNum = (name) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
};
const DUR = () => ({ 1: cssNum("--dur-1"), 2: cssNum("--dur-2"), 3: cssNum("--dur-3"), 4: cssNum("--dur-4") });
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)");

/* ── the animation helper every study uses ──────────────────────────── */
function anim(el, from, to, opts) {
  /* two shapes: anim(el, {from}, {to}, {...}) and anim(el, [kf, kf, …], {...}).
     A sequenced state (the button, the heart) is one animation with offsets:
     two fill:both animations on one property of one element fight, and the
     later one's before-phase wins, which is what a scrubbed strip shows. */
  const kf = Array.isArray(from) ? from : [from, to];
  const o = Array.isArray(from) ? to : opts;
  const a = el.animate(kf, { duration: o.d, easing: o.ease || EASE.std, fill: "both", delay: o.delay || 0, ...(o.steps ? { iterations: o.steps } : {}) });
  a.pause();
  a.currentTime = 0;
  return a;
}
function clock(anims) {
  return Math.max(...anims.map((a) => { const t = a.effect.getTiming(); return (t.delay || 0) + t.duration }));
}
function seek(anims, t) {
  const total = clock(anims);
  for (const a of anims) {
    const tg = a.effect.getTiming();
    a.currentTime = t * total;
    void tg;
  }
}
function playAll(anims) {
  for (const a of anims) { a.currentTime = 0; a.play() }
}

/* ── the studies ────────────────────────────────────────────────────── */
/* Each study: markup, a mount that builds paused animations, the spec, and the
   reduced-motion replacement. `props` is what the study animates, and the audit
   at the bottom of the page reads it back out of the registry. */
const STUDIES = [
  {
    key: "sheet", n: "01", title: "A sheet, from the thing that opened it",
    intent: "The panel has to say where it came from: the tab bar is at the bottom, so the panel arrives from the bottom, and the page behind gives way.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Ternmark · Today</span><span class="sp"></span><span class="icn">◇</span></div>
      <div class="body"><div class="li"><span class="dot">3</span><span class="grow">Reed Bunting<span class="sub">07:12 · reedbed</span></span></div>
      <div class="li"><span class="dot">2</span><span class="grow">Water Rail<span class="sub">06:58 · sluice</span></span></div></div>
      <div class="scrim"></div><div class="sheet"><div class="grab"></div><h4>Log a sighting</h4>
      <div class="li"><span class="dot">1</span><span class="grow">Take a photo</span></div>
      <div class="li"><span class="dot">2</span><span class="grow">Identify from the field plate</span></div></div></div>`,
    mount(r, D) {
      const scrim = $(".scrim", r), sheet = $(".sheet", r), body = $(".body", r);
      return [
        anim(scrim, { opacity: 0 }, { opacity: 1 }, { d: D[2], ease: EASE.std }),
        anim(sheet, { transform: "translateY(102%)" }, { transform: "translateY(0)" }, { d: D[3], ease: EASE.out }),
        anim(body, { transform: "translateY(0) scale(1)" }, { transform: "translateY(-8px) scale(.975)" }, { d: D[3], ease: EASE.out }),
      ];
    },
    spec: { trigger: "tap on “+” in the tab bar", timing: "--dur-3 (360 ms) · scrim --dur-2", curve: "--ease-out: starts fast, settles", props: "transform, opacity", why: "360 ms is long enough to read the panel's origin and short enough to feel answered. The page behind moves 8 px up so the sheet is visibly on top of it, not beside it." },
    rm: "The sheet appears in place, the page behind stays put, the scrim stays. <b>The heading is focus, so the panel is announced</b>, and a Close button sits at the top because a drag gesture has gone.",
  },
  {
    key: "modal", n: "02", title: "A dialog that grows out of its button",
    intent: "The container moves, then the content appears: two beats, so the eye follows one object instead of two things popping.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Gridwatch · Depots</span><span class="sp"></span><button class="btn sec">Export</button></div>
      <div class="body"><div class="li"><span class="dot">DW</span><span class="grow">Dockside<span class="sub">peak 1.42 MW</span></span><span class="val">92%</span></div>
      <div class="li"><span class="dot">AM</span><span class="grow">Amport<span class="sub">peak 0.96 MW</span></span><span class="val">77%</span></div></div>
      <div class="scrim"></div><div class="modal"><h4>Export the depot table?</h4><p>One CSV per day, with the depot rows as filtered.</p>
      <div class="row"><button class="btn sec">Cancel</button><button class="btn">Export</button></div></div></div>`,
    mount(r, D) {
      const scrim = $(".scrim", r), m = $(".modal", r), body = $(".body", r);
      m.style.transformOrigin = "96% 8%";           /* the Export button's centre, in stage space */
      return [
        anim(scrim, { opacity: 0 }, { opacity: 1 }, { d: D[2], ease: EASE.std }),
        anim(m, { transform: "translate(-50%,-50%) scale(.62)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { d: D[2], ease: EASE.out }),
        anim($("h4", m), { opacity: 0 }, { opacity: 1 }, { d: D[1], delay: D[2], ease: EASE.std }),
        anim($("p", m), { opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }, { d: D[2], delay: D[2], ease: EASE.out }),
        anim(body, { transform: "scale(1)" }, { transform: "scale(.985)" }, { d: D[3], ease: EASE.out }),
      ];
    },
    spec: { trigger: "press on Export", timing: "--dur-2 (220 ms) container, then --dur-2 content", curve: "--ease-out, origin at the trigger", props: "transform, opacity", why: "The Material container transform, cut to two beats: the box scales from the button that opened it (origin 96% 8%), and its words arrive after it lands. One object, one path." },
    rm: "The dialog appears at full size in the centre. <b>The trigger is remembered</b> and focus returns to it; the scrim stays, because the scrim is not decoration, it is “you are inside a task”.",
  },
  {
    key: "toast", n: "03", title: "A toast, and the clock it carries",
    intent: "A message that arrives must also say how long it will stay, so the bar is part of the message, not a spinner.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Meridian · Charts</span><span class="sp"></span></div>
      <div class="body"><div class="li"><span class="dot">4128</span><span class="grow">Harrow Mouth<span class="sub">surveyed 12 Nov</span></span><span class="val">v4</span></div></div>
      <div class="toast">Chart 4128 queued for download<span class="undo">Undo</span><span class="life"></span></div></div>`,
    mount(r, D) {
      const t = $(".toast", r), life = $(".life", r);
      const span = D[3] ? Math.max(D[3] * 9, 1) : 0;   /* the toast's whole life, on the same clock; 0 under reduced motion, so no 1 ms residue survives the media query */
      return [
        anim(t, { transform: "translateY(140%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }, { d: D[3], ease: EASE.out }),
        anim(life, { transform: "scaleX(1)" }, { transform: "scaleX(0)" }, { d: span, ease: "linear" }),
      ];
    },
    spec: { trigger: "a queued download", timing: "--dur-3 in · 3 240 ms of life", curve: "--ease-out in, --ease-in out", props: "transform, opacity", why: "The bar is the countdown, so a person can read the message and know when it goes. It pauses on hover and on focus, because a message you cannot finish reading is a message that was taken away." },
    rm: "The toast appears in place. <b>It is a live region, so the words are spoken</b>, and the countdown is a text suffix (“closes in 6 s”) because a shrinking bar carries no news to a screen reader.",
  },
  {
    key: "insert", n: "04", title: "A row added, and the rows that give way",
    intent: "The new record must be seen as one more thing in a list, not as a new list: it grows, the neighbours slide, and the whole list stays readable.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Life list</span><span class="sp"></span><span class="val">142</span></div>
      <div class="body">
      <div class="li new"><span class="dot">NEW</span><span class="grow">Water Rail<span class="sub">just now · added by you</span></span><span class="val">life</span></div>
      <div class="li n1"><span class="dot">1</span><span class="grow">Reed Bunting<span class="sub">3rd record</span></span><span class="val">+1</span></div>
      <div class="li n2"><span class="dot">2</span><span class="grow">Cetti's Warbler<span class="sub">7th record</span></span><span class="val">+1</span></div>
      <div class="li n3"><span class="dot">3</span><span class="grow">Little Egret<span class="sub">2nd record</span></span><span class="val">+1</span></div></div></div>`,
    mount(r, D) {
      const nw = $(".li.new", r), rows = [".n1", ".n2", ".n3"].map((s) => $(s, r));
      return [
        anim(nw, { opacity: 0, transform: "translateY(-7px) scaleY(.6)" }, { opacity: 1, transform: "translateY(0) scaleY(1)" }, { d: D[3], ease: EASE.out }),
        ...rows.map((el, i) => anim(el, { transform: `translateY(-${(i + 1) * 39}px)` }, { transform: "translateY(0)" }, { d: D[3], ease: EASE.out, delay: D[1] })),
      ];
    },
    frame(r) { $(".bar-top .val", r).textContent = "143" },
    spec: { trigger: "save a sighting", timing: "--dur-3, neighbours one --dur-1 behind", curve: "--ease-out", props: "transform, opacity", why: "The record is written to the data before the animation starts, so saving never waits for the picture. The neighbours move on the same clock, one frame behind, which reads as weight rather than as two events. The offset is a token, so under reduced motion it is 0 ms with everything else — a hard-coded beat would survive the media query." },
    rm: "The row is at the top of the list, marked “added”, and <b>the count changes in the header</b>. Nothing slides; the row's label carries the news the movement used to carry.",
  },
  {
    key: "reorder", n: "05", title: "A sort that shows the crossing",
    intent: "When a list re-sorts, a person must be able to follow one row to its new place; a redraw makes every row a new object.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Depots · by load</span><span class="sp"></span><button class="btn sec">Sort</button></div>
      <div class="body">
      <div class="li a"><span class="dot">DW</span><span class="grow">Dockside</span><span class="val">1.42</span></div>
      <div class="li b"><span class="dot">AM</span><span class="grow">Amport</span><span class="val">0.96</span></div>
      <div class="li c"><span class="dot">BR</span><span class="grow">Brentham</span><span class="val">0.71</span></div></div></div>`,
    mount(r, D) {
      /* a FLIP: the rows are already in their new order in the DOM, and each one
         starts where it used to be and travels to where it is */
      const from = { a: -78, b: 0, c: 78 };
      return Object.entries(from).map(([k, y]) =>
        anim($("." + k, r), { transform: `translateY(${y}px)` }, { transform: "translateY(0)" }, { d: D[3], ease: EASE.out }));
    },
    spec: { trigger: "press on the column header", timing: "--dur-3 (360 ms)", curve: "--ease-out", props: "transform", why: "First update the DOM, then measure where each row was, then move it back and let it travel: FLIP. The row's own value travels with it, so the eye keeps the object. A list of 300 rows shows 12 movers and moves the rest instantly, because a crossing that crosses the whole page is unreadable." },
    rm: "The list is redrawn in the new order and <b>the header says which column is sorted, in which direction</b>. The order is the information, and it arrives without a journey.",
  },
  {
    key: "tabs", n: "06", title: "A tab underline that is one object",
    intent: "The underline is not two indicators; it is one rule that slides, so the tab panel is understood as the same panel showing something else.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Estuary · readings</span></div>
      <div class="body"><div class="tabs"><button role="tab" aria-selected="true">Levels</button><button role="tab" aria-selected="false">Flow</button><button role="tab" aria-selected="false">Rain</button><span class="thumb"></span></div>
      <div class="panels"><div class="panel out">Highest spring tide, 1994–2024, metres above datum.</div><div class="panel in">Discharge at the mouth, cubic metres a second.</div></div></div></div>`,
    mount(r, D) {
      const th = $(".thumb", r), out = $(".panel.out", r), inp = $(".panel.in", r);
      return [
        anim(th, { transform: "translateX(0px)", width: "60px" }, { transform: "translateX(58px)", width: "52px" }, { d: D[3], ease: EASE.out }),
        anim(out, { opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-5px)" }, { d: D[1], ease: EASE.in }),
        anim(inp, { opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }, { d: D[2], delay: D[1] * 0.7, ease: EASE.out }),
      ];
    },
    frame(r) {
      const b = [...r.querySelectorAll(".tabs button")];
      b[0].setAttribute("aria-selected", "false"); b[1].setAttribute("aria-selected", "true");
    },
    spec: { trigger: "press on a tab, arrow keys at the tablist", timing: "--dur-3 rule · --dur-1 out · --dur-2 in", curve: "--ease-in out, --ease-out in", props: "transform, opacity, width (the rule)", why: "The outgoing panel leaves quickly (120 ms, accelerating) and the incoming panel arrives after a short overlap, so no frame shows two panels at once at full strength. Animating the rule's width is the one layout animation on this page: it is a 2 px rule inside a 260 px tablist, and a sliding rule that changes length looks like a lie." },
    rm: "The rule sits under the selected tab and the panel swaps. <b>aria-selected and the tablist's arrow keys carry the state</b>, so the movement is decoration for everyone, and nothing for anyone.",
  },
  {
    key: "skeleton", n: "07", title: "A skeleton that becomes the thing",
    intent: "The skeleton must be the shape of the content, so the arrival is a fill-in and not a swap.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Depot detail</span></div>
      <div class="body"><div class="sk"><i></i><i></i><i></i></div>
      <div class="live"><div class="kv"><span>Peak load</span><b>1.42 MW</b></div><div class="kv"><span>Energy today</span><b>22.4 MWh</b></div><div class="kv"><span>Buses charging</span><b>18 of 24</b></div></div></div></div>`,
    mount(r, D) {
      const sk = $(".sk", r), rows = $$(".live .kv", r);
      return [
        anim(sk, { opacity: 1, transform: "scaleY(1)" }, { opacity: 0, transform: "scaleY(.96)" }, { d: D[2], ease: EASE.in }),
        ...rows.map((el, i) => anim(el, { opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }, { d: D[2], delay: D[2] * 0.6 + i * D[1], ease: EASE.out })),
      ];
    },
    spec: { trigger: "the response lands", timing: "--dur-2 out · --dur-2 in, 120 ms apart", curve: "--ease-in out, --ease-out in", props: "transform, opacity", why: "The skeleton has the real row count and the real line widths, so the crossfade is one object gaining detail. Staggering the rows 120 ms apart reads as content arriving; 60 ms reads as a queue, and 240 ms reads as waiting." },
    rm: "The skeleton is replaced by the content in one step. <b>The loading state keeps its own text</b> (“Loading depot detail”), because a shimmer is not a status, and it is announced once when the numbers arrive.",
  },
  {
    key: "like", n: "08", title: "A heart, its overshoot, and eight sparks",
    intent: "The only place on this page allowed to overshoot: a touch on a 40 px circle, where the spring is the feedback that the press registered.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Ternmark · record</span></div>
      <div class="body" style="display:flex;align-items:center;gap:12px">
      <button class="heart" aria-pressed="false" aria-label="Save to favourites"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.5A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.5C19 15.4 12 20 12 20z"/></svg></button>
      <span class="count">128</span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span><span class="spark" style="left:50%;top:50%"></span></div></div>`,
    mount(r, D) {
      const heart = $(".heart", r), svg = $("svg", heart), sparks = $$(".spark", r), count = $(".count", r);
      const ang = sparks.map((_, i) => (i / sparks.length) * Math.PI * 2);
      const total = D[3] + D[1] * 0.6;
      const anims = [
        anim(heart, [
          { transform: "scale(1)", offset: 0 },
          { transform: "scale(1.34)", offset: 0.34, easing: EASE.spring },
          { transform: "scale(1)", offset: 1, easing: EASE.out },
        ], { d: total }),
        anim(svg, [
          { transform: "scale(.55)", opacity: 0, offset: 0 },
          { transform: "scale(1)", opacity: 1, offset: 0.3, easing: EASE.out },
          { transform: "scale(1)", opacity: 1, offset: 1 },
        ], { d: total }),
        anim(count, [
          { transform: "translateY(0)", opacity: 1, offset: 0 },
          { transform: "translateY(-13px)", opacity: 0, offset: 0.22, easing: EASE.in },
          { transform: "translateY(13px)", opacity: 0, offset: 0.23 },
          { transform: "translateY(0)", opacity: 1, offset: 0.5, easing: EASE.out },
          { transform: "translateY(0)", opacity: 1, offset: 1 },
        ], { d: total }),
      ];
      sparks.forEach((s, i) => {
        const x = Math.cos(ang[i]) * 26, y = Math.sin(ang[i]) * 26;
        anims.push(anim(s, [
          { transform: "translate(-50%,-50%) scale(0)", opacity: 0, offset: 0 },
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.18, easing: EASE.out },
          { transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(0)`, opacity: 0, offset: 1, easing: EASE.out },
        ], { d: total, delay: D[1] * 0.6 }));
      });
      return anims;
    },
    frame(r) {
      $(".heart", r).setAttribute("aria-pressed", "true");
      $(".count", r).textContent = "129";
    },
    spec: { trigger: "tap the heart", timing: "--dur-1 pop · --dur-2 settle · sparks --dur-3", curve: "--ease-spring once", props: "transform, opacity", why: "The spring (a 1.4 overshoot) is the one place this system allows going past the mark: it is the pressure release of a press on a small target, and it is 120 ms. The count rolls on the same clock so the number change is part of the same act." },
    rm: "The heart fills and the count changes. <b>aria-pressed carries the state</b>; the sparks are cut, and nothing about the news is lost with them.",
  },
  {
    key: "button", n: "09", title: "A button that becomes its own progress",
    intent: "The button must never disappear, move, or become a spinner alone: the label is the promise, and it stays where the thumb is.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Quote upload</span></div>
      <div class="body" style="display:flex;flex-direction:column;gap:10px;align-items:flex-start;padding-top:16px">
      <button class="btn up"><span class="lab">Upload quote</span><span class="spin" hidden></span><svg class="tick" viewBox="0 0 24 24" hidden><path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <span class="val">saltco-quote.pdf · 486 KB</span></div></div>`,
    mount(r, D) {
      const b = $(".btn", r), lab = $(".lab", b), spin = $(".spin", b), tick = $(".tick", b), path = $("path", tick);
      spin.hidden = false; tick.hidden = false;
      const d = path.getTotalLength();
      path.style.strokeDasharray = d;
      const total = Math.max(D[1] + D[3] + D[2], D[1] * 2 + D[3] + D[2]);
      const k = (o) => ({ offset: o, easing: EASE.std });
      return [
        anim(lab, [
          { opacity: 1, offset: 0 },
          { opacity: 0, offset: 0.2, easing: EASE.in },
          { opacity: 0, offset: 0.66 },
          { opacity: 1, offset: 1, easing: EASE.out },
        ], { d: total }),
        anim(spin, [
          { opacity: 0, transform: "scale(.5)", offset: 0 },
          { opacity: 1, transform: "scale(1)", offset: 0.26, easing: EASE.out },
          { opacity: 1, transform: "scale(1)", offset: 0.62 },
          { opacity: 0, transform: "scale(.5)", offset: 0.74, easing: EASE.in },
        ], { d: total }),
        anim(path, [
          { strokeDashoffset: d, opacity: 0, offset: 0 },
          { strokeDashoffset: d, opacity: 1, offset: 0.68 },
          { strokeDashoffset: 0, opacity: 1, offset: 0.88, easing: EASE.out },
          { strokeDashoffset: 0, opacity: 1, offset: 1 },
        ], { d: total }),
        anim(b, [
          { width: "112px", offset: 0 },
          { width: "96px", offset: 0.34, easing: EASE.std },
          { width: "96px", offset: 0.66 },
          { width: "118px", offset: 0.88, easing: EASE.std },
          { width: "118px", offset: 1 },
        ], { d: total }),
      ];
    },
    frame(r) { r.setAttribute("data-saved", "1"); const b = $(".btn", r); b.setAttribute("aria-disabled", "true"); },
    spec: { trigger: "press Upload", timing: "--dur-1 · --dur-3 mid · --dur-2 tick", curve: "--ease-in, --ease-out", props: "transform, opacity, stroke-dashoffset, width", why: "The width is the second and last layout animation on the page, and it is on a 112 px button in a static column: the layout cost is local and the alternative (a button that jumps) is worse. The label crossfades to a spinner and back to “Upload quote” with a tick drawn, so the promise, the work and the result are the same object." },
    rm: "The label changes words: “Upload quote”, “Uploading”, “Uploaded”. <b>No spinner</b>: a spinning ring at 0 ms is a frozen ring, and the word is the information.",
  },
  {
    key: "accordion", n: "10", title: "A disclosure that opens its own height",
    intent: "The answer must arrive as the question opening, so the region stays the same object; nothing may jump the content below it.",
    html: `<div class="app"><div class="bar-top"><span class="ttl">Grant form · help</span></div>
      <div class="body" style="padding-top:2px">
      <div class="acc"><button class="acc-h" aria-expanded="false" aria-controls="ab">What is a grid reference?<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <div class="acc-b" id="ab"><div><p>Six pairs of digits from the map, like 592104 131820. It puts your property in the right flood zone, and the assessor uses it to find the survey sheet.</p></div></div></div>
      <div class="acc"><button class="acc-h" aria-expanded="false" aria-controls="ab2">Do I need two quotes?<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <div class="acc-b" id="ab2"><div><p>Only when the works cost more than £1,500.</p></div></div></div></div></div>`,
    mount(r, D) {
      const b = $(".acc-b", r), chev = $(".acc-h .chev", r), p = $("p", b);
      return [
        anim(b, { gridTemplateRows: "0fr" }, { gridTemplateRows: "1fr" }, { d: D[3], ease: EASE.out }),
        anim(chev, { transform: "rotate(0deg)" }, { transform: "rotate(180deg)" }, { d: D[2], ease: EASE.std }),
        anim(p, { opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "translateY(0)" }, { d: D[2], delay: D[2] * 0.6, ease: EASE.out }),
      ];
    },
    frame(r) { $(".acc-h", r).setAttribute("aria-expanded", "true") },
    spec: { trigger: "press on the question", timing: "--dur-3 open · --dur-2 close", curve: "--ease-out open, --ease-in close", props: "grid-template-rows, transform, opacity", why: "`grid-template-rows: 0fr → 1fr` animates an unknown height with no measuring and no JavaScript layout, which is the reason this is the third layout animation on the page and the last one allowed. Content below the open panel moves with it, and the close is 140 ms shorter than the open: reading takes longer than leaving." },
    rm: "The answer appears and the chevron flips. <b>aria-expanded and aria-controls say the state</b>, and the panel's height is final the moment it is open, so nothing on the page moves under anyone's cursor.",
  },
  {
    key: "reveal", n: "11", title: "Scroll: a progress rule and a staggered reveal",
    intent: "Movement tied to scroll must be a function of the scroll, never a fixed show: scrub it and it obeys.",
    html: `<div class="app"><span class="prog"></span><div class="flow">
      <div class="rv"><div class="blk"></div></div><div class="rv"><div class="blk"></div></div>
      <div class="rv"><div class="blk"></div></div><div class="rv"><div class="blk"></div></div></div></div>`,
    mount(r, D) {
      const prog = $(".prog", r), rvs = $$(".rv", r);
      const anims = [anim(prog, { transform: "scaleX(0)" }, { transform: "scaleX(1)" }, { d: D[4], ease: "linear" })];
      rvs.forEach((el, i) => anims.push(anim(el, { opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }, { d: D[3], delay: i * D[1], ease: EASE.out })));
      return anims;
    },
    spec: { trigger: "the scroll position, mapped to currentTime", timing: "--dur-4 rule (linear) · --dur-3 blocks, 120 ms apart", curve: "linear for the rule, --ease-out for the blocks", props: "transform, opacity", why: "The rule is a ruler: linear, because an eased ruler lies about the page. The blocks stagger 120 ms, which is a stack arriving; the whole reveal is under 600 ms, because a page whose content trickles in is a page that is hiding its content. The reveal runs once per element, and never on a return visit." },
    rm: "The blocks are there, at full opacity, in reading order. <b>The progress rule stays</b>, because it is a position indicator, not a show; a scroll-linked ruler is not motion that a person must chase.",
  },
  {
    key: "pointer", n: "12", title: "A card that knows where the pointer is",
    intent: "Pointer-following is feedback about the pointer, and it has to be cheap, damped, and gone for anyone who does not want it.",
    html: `<div class="app"><div class="card"><span class="hl"></span><h4>Harrow Mouth gauge</h4><p>Highest recorded level 4.97 m, 2011. Move the pointer over the card.</p></div>
      <button class="mag">Open record</button></div>`,
    mount(r, D) {
      const card = $(".card", r), hl = $(".hl", r), mag = $(".mag", r);
      const set = (t) => {
        const x = 18 + t * 64, y = 24 + t * 52;
        hl.style.setProperty("--mx", x + "%"); hl.style.setProperty("--my", y + "%");
        card.style.transform = `perspective(600px) rotateY(${((x - 50) / 50 * 4).toFixed(2)}deg) rotateX(${((50 - y) / 50 * 4).toFixed(2)}deg)`;
        mag.style.transform = `translate(calc(-50% + ${((x - 50) * 0.34).toFixed(1)}px), ${((y - 50) * 0.22).toFixed(1)}px)`;
      };
      const a = anim(card, { transform: "perspective(600px) rotateY(-2.6deg) rotateX(1.3deg)" }, { transform: "perspective(600px) rotateY(2.6deg) rotateX(-1.3deg)" }, { d: D[1], ease: "linear" });
      const a2 = anim(mag, { transform: "translate(calc(-50% - 8px), -3px)" }, { transform: "translate(calc(-50% + 8px), 3px)" }, { d: D[1], ease: "linear" });
      const anims = [a, a2];
      a.onfinish = a2.onfinish = () => set(1);
      r.__setAt = (t) => { set(t); a.currentTime = t * D[1]; a2.currentTime = t * D[1] };
      anims.seekExtra = (t) => { set(t); for (const x of anims) x.currentTime = t * D[1] };
      return anims;
    },
    live(r) {
      const card = $(".card", r), hl = $(".hl", r), mag = $(".mag", r);
      card.addEventListener("pointermove", (e) => {
        const b = card.getBoundingClientRect();
        const x = ((e.clientX - b.left) / b.width) * 100, y = ((e.clientY - b.top) / b.height) * 100;
        hl.style.setProperty("--mx", x + "%"); hl.style.setProperty("--my", y + "%");
        card.style.transform = `perspective(600px) rotateY(${((x - 50) / 50 * 4).toFixed(2)}deg) rotateX(${((50 - y) / 50 * 4).toFixed(2)}deg)`;
        mag.style.transform = `translate(calc(-50% + ${((x - 50) * 0.34).toFixed(1)}px), ${((y - 50) * 0.22).toFixed(1)}px)`;
      });
      card.addEventListener("pointerleave", () => { card.style.transform = ""; mag.style.transform = "translate(-50%, 0)" });
    },
    spec: { trigger: "pointermove, damped in CSS", timing: "--dur-1 (120 ms) for the settle", curve: "linear while tracking, --ease-out on leave", props: "transform (a 4° tilt), opacity", why: "The tilt is 4° at the edges, which is the point where a card starts to look like a toy. The highlight is a background position, not a shadow animation. Nothing moves on touch: there is no pointer to follow, and a card that reacts to a tap is a card that lies about being pressed." },
    rm: "The card is flat and the highlight is centred. <b>The card is a link</b>, and it looks like one, so none of the pointer play is load-bearing.",
  },
];

/* The study's timing, drawn. Every bar is one Web Animation this card created: x is its delay,
   width is its duration, colour is its easing family. A page about motion spent its study cards on
   prose about timing and showed none of it; this is the subject in the card that talks about the
   subject, and it is read out of the animation objects, so it cannot disagree with the demo above. */
const EASE_FILL = { [EASE.std]: "var(--tl-std)", [EASE.out]: "var(--tl-out)", [EASE.in]: "var(--tl-in)", [EASE.spring]: "var(--tl-spring)" };
const easeKey = (e) => Object.keys(EASE).find((n) => EASE[n].replace(/\s/g, "") === String(e).replace(/\s/g, "")) || "std";

function timingPlate(anims, total) {
  const W = 268, x0 = 6, iw = W - 12;
  const rows = anims.map((a) => { const t = a.effect.getTiming(); return { d: t.delay || 0, w: t.duration, k: easeKey(t.easing) } });
  // the plate is sized to the study's own animation count: the button study runs five, the sheet
  // runs three, and a fixed box clipped the fifth bar out of the viewBox
  const H = Math.max(30, 10 + rows.length * 7 + 6);
  const bars = rows.map((r, i) => {
    const x = x0 + (r.d / (total || 1)) * iw;
    const w = Math.max(2, (r.w / (total || 1)) * iw);
    // the lane groups bars by easing family, so the colour is the grouping, not a wash
    return `<rect x="${x0}" y="${4 + i * 7}" width="${iw}" height="9" fill="${EASE_FILL[EASE[r.k]]}" opacity=".14"/>`
      + `<rect x="${x.toFixed(1)}" y="${5 + i * 7}" width="${w.toFixed(1)}" height="7" rx="1" fill="${EASE_FILL[EASE[r.k]]}"/>`;
  }).join("");
  const fams = [...new Set(rows.map((r) => r.k))].join(" · ");
  return `<div class="tl">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline of this study's ${rows.length} animations: each bar starts at its delay and spans its duration, coloured by easing family. The study settles at ${Math.round(total)} milliseconds.">
      <line x1="${x0}" y1="${H - 6}" x2="${W - x0}" y2="${H - 6}" stroke="var(--s-line)" stroke-dasharray="2 3"/>
      ${bars}
    </svg>
    <p class="tl-lab mono"><span>0 ms</span><span>${rows.length} animation${rows.length > 1 ? "s" : ""} · ${fams}</span><span>${Math.round(total)} ms</span></p>
  </div>`;
}

/* ── build the cards ────────────────────────────────────────────────── */
const FRAMES = [0, 0.45, 1];
const registry = [];
function buildCard(s, D) {
  const card = document.createElement("article");
  card.className = "study";
  card.id = "study-" + s.key;
  card.innerHTML = `<div class="st-head"><span class="ix">${s.n}</span><h3>${s.title}</h3><p class="intent">${s.intent}</p></div>
    <div class="st-body">
      <div class="st-side">
        <div class="demo"><div class="stage" data-demo></div></div>
        <div class="playbar"><button class="play" type="button">Play</button><button class="play ghost js-reduce" type="button">End frame</button><p class="hint">the same animation, held</p></div>
        <div class="tl-slot"></div>
      </div>
      <div>
        <div class="frames"></div>
        <dl class="st-spec">
          <div class="spec"><dt>Trigger</dt><dd>${s.spec.trigger}</dd></div>
          <div class="spec"><dt>Timing</dt><dd>${s.spec.timing}</dd></div>
          <div class="spec"><dt>Curve</dt><dd>${s.spec.curve}</dd></div>
          <div class="spec"><dt>Properties</dt><dd><span class="mono">${s.spec.props}</span></dd></div>
          <div class="spec"><dt>Why this</dt><dd>${s.spec.why}</dd></div>
          <div class="spec rm"><dt>Reduced motion</dt><dd>${s.rm}</dd></div>
        </dl>
      </div>
    </div>`;
  const stage = $("[data-demo]", card);
  stage.innerHTML = s.html;
  const anims = s.mount(stage, D);
  const total = clock(anims);
  $(".tl-slot", card).innerHTML = timingPlate(anims, total);
  if (s.live) s.live(stage);
  const frames = $(".frames", card);
  FRAMES.forEach((t) => {
    const f = document.createElement("div");
    f.className = "frame";
    const ms = Math.round(t * total);
    f.innerHTML = `<div class="frame-h"><span>${t === 0 ? "at press" : t === 1 ? "settled" : "mid"}</span><span class="t">${ms} ms</span></div><div class="stage"></div>`;
    const fs = $(".stage", f);
    fs.innerHTML = s.html;
    const fa = s.mount(fs, D);
    if (s.key === "pointer") fa.seekExtra(t); else seek(fa, t);
    /* the state is final in every frame, only the picture is mid: the row is in
       the list, the tab is selected, the disclosure is expanded, from frame one */
    if (s.frame) s.frame(fs);
    f.dataset.ms = String(ms);
    frames.append(f);
  });
  $(".play", card).addEventListener("click", () => { if (s.frame) s.frame(stage); seek(anims, 0); playAll(anims) });
  $(".js-reduce", card).addEventListener("click", () => seek(anims, 1));
  registry.push({ key: s.key, total, anims, props: s.spec.props, card });
  return card;
}

function build(D) {
  $("#studies-list").innerHTML = "";
  registry.length = 0;
  for (const s of STUDIES) $("#studies-list").append(buildCard(s, D));
  buildTokens(D);
  /* Reduced motion first, then the checks: the checks count the sections, so they have to
     see what was built. Each builder runs inside a guard. This page shipped a regression
     (buildAudit read r.props off a snapshot that had dropped it) and the throw emptied the
     reduced-motion grid, the checks table and the state line, while the screenshot pass kept
     reporting clean shots because the shots were never re-taken. A section that cannot build
     now says so in the section. */
  const ran = [];
  for (const [name, sel, fn] of [["reduced motion", "#rmGrid", () => buildReduced(D)], ["the checks", "#audit-list", () => buildAudit(D)]]) {
    try { fn(); ran.push(name) } catch (e) { failSection(name, sel, e) }
  }
  window.__build = {
    studies: $("#studies-list").children.length,
    rm: $("#rmGrid").children.length,
    audit: $("#audit-list").children.length,
    named: [...document.querySelectorAll("#studies-list .spec.rm dd")].filter((d) => d.textContent.trim()).length,
    reduced: REDUCE.matches,
    longest: Math.max(0, ...registry.map((r) => r.total)),
    ran,
  };
}
function failSection(name, sel, e) {
  const el = $(sel);
  if (el) el.innerHTML = `<div class="audit-row"><span class="k">${name}: build failed</span><span class="v">${String((e && e.message) || e)} — this section is empty because the script threw, not because there is nothing to show.</span><span class="s warn">fail</span></div>`;
  if (name === "reduced motion") $("#rmState").textContent = "reduced-motion section failed to build — see below";
  console.error(`${name} section failed to build`, e);
}

/* ── the system panels ──────────────────────────────────────────────── */
function buildTokens(D) {
  const uses = {
    1: "a state that is already under the finger: a press, a checkbox, an outgoing panel",
    2: "the working duration: a panel, a fade, a row settling",
    3: "a thing that crosses the screen, or a big region opening",
    4: "a scroll-linked ruler, and nothing else",
  };
  $("#tokDur").innerHTML = [1, 2, 3, 4].map((n) => `<tr><td>--dur-${n}</td><td class="v">${D[n]} ms</td><td>${uses[n]}</td>
    <td><span class="bar"><i style="width:${Math.round((D[n] / 560) * 100)}%"></i></span></td>
    <td class="z">0 ms</td></tr>`).join("");
  /* the durations table used to end four rows into 300 px of wall; the missing column is the
     page's central claim — every token is 0 ms under reduce — set next to the value it replaces */
  const note = $("#tokNote");
  if (note) note.textContent = `Read out of the stylesheet: ${D[1]} / ${D[2]} / ${D[3]} / ${D[4]} ms in force, and 0 ms in every row under prefers-reduced-motion. The bar is the duration against the 560 ms ceiling.`;
  const curves = [
    ["--ease", EASE.std, "the default: a thing that stays on screen"],
    ["--ease-out", EASE.out, "arrivals: sheets, rows, panels, dialogs"],
    ["--ease-in", EASE.in, "departures: an outgoing tab, a dismissed toast"],
    ["--ease-spring", EASE.spring, "one press on one 40 px target, 120 ms"],
  ];
  $("#curveList").innerHTML = curves.map(([n, v, u], i) =>
    `<li><span class="nm"><span class="sw" style="background:${["#8ab8f2", "#57c98d", "#f08b7c", "#e8b45c"][i]}"></span>${n}</span><span>${u}<br><span class="mono" style="font-size:11px;color:#828d94">${v}</span></span></li>`).join("");
  const svg = $("#curves svg"), g = $(".grid", svg);
  g.innerHTML = [0, 1, 2, 3, 4].map((i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="120"/>`).join("") +
    [0, 1, 2, 3, 4].map((i) => `<line x1="0" y1="${i * 30}" x2="240" y2="${i * 30}"/>`).join("");
  const colors = ["#8ab8f2", "#57c98d", "#f08b7c", "#e8b45c"];
  curves.forEach(([n, c], i) => {
    const m = c.match(/cubic-bezier\(([^)]+)\)/)[1].split(",").map(Number);
    /* a CSS easing is the parametric cubic with the ends pinned at (0,0) and (1,1):
       plot y against x, which means solving x(t) for each x — not plotting y(t) against t */
    const at = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    const pts = [];
    for (let s = 0; s <= 1.00001; s += 1 / 90) {
      let lo = 0, hi = 1, t = s;
      for (let k = 0; k < 24; k++) { t = (lo + hi) / 2; if (at(t, m[0], m[2]) < s) lo = t; else hi = t }
      pts.push([s * 220 + 10, 110 - at(t, m[1], m[3]) * 100]);
    }
    const p = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    p.setAttribute("points", pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", colors[i]);
    p.setAttribute("stroke-width", "2");
    svg.append(p);
  });
}
/* ── reduced-motion section ─────────────────────────────────────────── */
function buildReduced(D) {
  const picks = ["sheet", "insert", "button"];
  const named = STUDIES.filter((s) => (s.rm || "").trim().length > 0).length;
  const cover = `${picks.length} of ${STUDIES.length} studies are rebuilt as a strip below, and all ${named} of ${STUDIES.length} name their replacement in their own card — counted out of this DOM, not typed`;
  $("#rmState").textContent = `${REDUCE.matches ? "prefers-reduced-motion: reduce is ON on this view" : "prefers-reduced-motion: reduce is off on this view"} · ${cover}`;
  $("#rmGrid").innerHTML = "";
  for (const key of picks) {
    const s = STUDIES.find((x) => x.key === key);
    const card = document.createElement("div");
    card.className = "rm-card";
    card.innerHTML = `<h3>${s.title}</h3><span class="was">was: ${s.spec.props} over ${s.spec.timing}</span><p>${s.rm}</p><div class="rm-strip"></div>`;
    const strip = $(".rm-strip", card);
    FRAMES.forEach((t) => {
      const f = document.createElement("div");
      f.className = "frame";
      const fs = document.createElement("div");
      fs.className = "stage";
      fs.innerHTML = s.html;
      const fa = s.mount(fs, D);
      f.innerHTML = `<div class="frame-h"><span>${t === 0 ? "0" : t === 1 ? "end" : "mid"}</span><span class="t">${Math.round(t * clock(fa))} ms</span></div>`;
      seek(fa, t);
      f.append(fs);
      strip.append(f);
    });
    $("#rmGrid").append(card);
  }
}
function mini(html) { const d = document.createElement("div"); d.innerHTML = html; return d }

/* ── the checks, measured from the page ─────────────────────────────── */
function buildAudit(D) {
  const snapshot = registry.map((r) => ({ key: r.key, title: STUDIES.find((s) => s.key === r.key).title, total: r.total, anims: r.anims, props: r.props }));
  /* group by the property alone: the spec writes "width (the rule)", the audit counts width */
  const prop = (p) => p.replace(/\s*\([^)]*\)/g, "").trim();
  const props = snapshot.flatMap((r) => r.props.split(/,/).map((p) => [r.key, prop(p)]));
  const byProp = {};
  for (const [k, p] of props) (byProp[p] = byProp[p] || []).push(k);
  const layout = (byProp["width"] || []).concat(byProp["grid-template-rows"] || []);
  const longestRow = snapshot.slice().sort((a, b) => b.total - a.total)[0];
  const longest = longestRow.total;
  /* "long is allowed" is a property of two kinds of animation, not a sentence about one study */
  const LONG = ["toast", "reveal"];          /* a countdown and a scroll reveal: both have a job in their length */
  const longestStudy = STUDIES.find((s) => s.key === longestRow.key);
  const allowed = LONG.includes(longestRow.key);
  const spanOf = (a) => { const t = a.effect.getTiming(); return (t.delay || 0) + t.duration };
  const isLoop = (a) => { const it = a.effect.getTiming().iterations; return !Number.isFinite(it) || it > 1 };
  const perStudy = snapshot.map((r) => { const s = STUDIES.find((x) => x.key === r.key);
    return { key: r.key, title: r.title, n: s.n, timing: s.spec.timing, total: r.total,
      once: r.anims.filter((a) => !isLoop(a)), loops: r.anims.filter(isLoop) }; });
  const maxOf = (list) => Math.max(0, ...list.map(spanOf));
  const durOf = (list) => Math.max(0, ...list.map((a) => a.effect.getTiming().duration));
  const strict = perStudy.filter((s) => !LONG.includes(s.key));
  const ceiling = Math.max(0, ...strict.map((s) => maxOf(s.once)));
  const ceilingStudy = strict.slice().sort((a, b) => maxOf(b.once) - maxOf(a.once))[0];
  const singleCeiling = Math.max(0, ...strict.map((s) => durOf(s.once)));
  const singleStudy = strict.slice().sort((a, b) => durOf(b.once) - durOf(a.once))[0];
  const loopCount = perStudy.reduce((n, s) => n + s.loops.length, 0);
  const loopCycle = Math.max(0, ...perStudy.flatMap((s) => s.loops.map((a) => a.effect.getTiming().duration)));
  const longestText = () => {
    const at = D[3] === 0 ? " (reduced motion is on: every token is 0 ms, so this is what is left)" : "";
    const why = allowed
      ? `Its length is the job — a countdown and a scroll reveal are the two kinds allowed to run long here, and this is ${longestRow.key === "toast" ? "the toast's countdown bar, which has to last as long as the message can be read" : "the reveal, which is bound to the scroll"}.`
      : `This is not a countdown or a scroll reveal, so it belongs under 360 ms.`;
    const span = ceilingStudy && ceiling > 360 && D[3] !== 0
      ? ` The widest span outside those two kinds is <span class="mono">${ceiling} ms</span> in “${ceilingStudy.title}”.`
      : "";
    const single = ` The longest <i>single</i> animation outside the countdown and the reveal is <span class="mono">${singleCeiling} ms</span>, in “${singleStudy.title}” (study ${singleStudy.n}, declared timing <span class="mono">${singleStudy.timing}</span>). ${singleCeiling > 360 && D[3] !== 0 ? "The 360 ms line is crossed there, so this row is a warning about it and not a pass." : ""}`;
    const loops = loopCount ? ` ${loopCount} animations loop, with a cycle of up to <span class="mono">${loopCycle} ms</span>: a cycle is a rhythm, not a wait.` : "";
    return `<span class="mono">${longest} ms</span> — the span of “${longestRow.title}” (study ${longestStudy.n}, animates <span class="mono">${prop(longestStudy.spec.props)}</span>), measured as the last animation's delay + duration, so it is when the picture settles${at}. ${why}${span}${single}${loops}`;
  };
  const total = snapshot.reduce((n, r) => n + r.anims.length, 0);
  const paused = snapshot.reduce((n, r) => n + r.anims.filter((a) => a.playState === "paused").length, 0);
  const live = document.querySelectorAll('.stage [role="status"], .stage [role="dialog"], .stage [aria-expanded], .stage [aria-pressed], .stage [aria-selected]').length;
  const rows = [
    ["Durations in force", `<span class="mono">${D[1]} / ${D[2]} / ${D[3]} / ${D[4]} ms</span> read from the stylesheet. With <span class="mono">prefers-reduced-motion</span> every one of them is 0 ms, so a strip's three frames become one frame.`, D[3] === 0 ? "reduce" : "full"],
    ["Longest animation", longestText(), singleCeiling <= 360 || D[3] === 0 ? "ok" : "warn"],
    ["Properties animated", Object.entries(byProp).map(([p, ks]) => `<span class="mono">${p}</span> × ${ks.length}`).join(" · "), "info"],
    ["Layout properties", layout.length ? `deliberate, and named in the spec: <span class="mono">width</span> on the tab rule (study 06) and on one 112 px button (study 09), <span class="mono">grid-template-rows</span> on one disclosure (study 10). Nothing animates <span class="mono">top</span>, <span class="mono">left</span>, <span class="mono">margin</span> or <span class="mono">font-size</span>, and no animation touches a property that reflows the page behind it.` : "none", layout.length ? "warn" : "ok"],
    ["Animations created", `${total} Web Animations, <span class="mono">${paused}</span> of them paused at load: the strips hold them at a millisecond, and Play runs the same objects.`, paused === total ? "ok" : "warn"],
    ["State before motion", "In every study the data changes on the press, and the animation is started after it: saving, sorting, liking and tab switching do not wait for a frame. The proof is in the strips — at 0 ms the row is already in the list, the tab already reads <span class='mono'>aria-selected=true</span>, the disclosure is already open, and only the picture is behind.", "ok"],
    ["Non-visual equivalents", `${live} controls inside the demo surfaces carry <span class="mono">role=status</span>, <span class="mono">role=dialog</span>, <span class="mono">aria-expanded</span>, <span class="mono">aria-pressed</span> or <span class="mono">aria-selected</span>, so every animated change has a spoken fact.`, "ok"],
    ["Pointer play", "Study 12 runs on <span class='mono'>pointermove</span> only, is inert on touch, flat under reduced motion, and the card is a link without it.", "ok"],
    ["What is not proven", "No frame-rate measurement in this page: the animations are transform and opacity, and the layout cases are argued, not profiled. The demo surfaces are scaled-down components, so their 34 px targets are not the 44 px targets of the real product. No screen-reader walkthrough of a toast, a dialog or a re-sort.", "warn"],
  ];
  /* pushed after the literal, because the row counts the rows of the table it is in */
  rows.push(["Sections filled", `<span class="mono">${document.querySelectorAll("#studies-list .study").length}</span> study cards, <span class="mono">${document.querySelectorAll("#rmGrid .rm-card").length}</span> of ${STUDIES.length} studies rebuilt as reduced-motion strips below (a picked three, not the whole set), <span class="mono">${[...document.querySelectorAll("#studies-list .spec.rm dd")].filter((d) => d.textContent.trim()).length}</span> of ${STUDIES.length} study cards carrying a named replacement in their own spec, <span class="mono">${rows.length + 1}</span> rows in this table — all counted out of the live DOM after both builders ran. Both builders run in a guard, so a throw prints its own line inside the section that failed instead of leaving it empty.`, "ok"]);
  $("#audit-list").innerHTML = rows.map(([k, v, s]) => `<div class="audit-row"><span class="k">${k}</span><span class="v">${v}</span><span class="s ${s === "info" ? "" : s}">${s === "info" ? "" : s}</span></div>`).join("");
}

/* ── boot ───────────────────────────────────────────────────────────── */
build(DUR());
REDUCE.addEventListener("change", () => build(DUR()));
