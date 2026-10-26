/* The skeleton probe, injected into each style page by measure.mjs.

   It reads what the page LAYS OUT, not what the stylesheet declares: a
   grid-template-columns declaration is not a rendered column. Per section: how many
   boxes sit on how many distinct x positions, how many tracks the grid host
   resolves to, the gap, and the widest body measure in ch. Plus the page-wide
   signatures a style's structure leaves behind: the module the section tops fall on
   (a page on a module grid has one), the type scale, the largest radius, whether
   links keep their underline, and how the feature list is built.

   Two pages whose signature matches have the same skeleton whatever their CSS says,
   which is the claim the ratings' weakest axis makes.
*/
window.__ternmarkProbe = () => {
  const num = (v) => parseFloat(v) || 0;
  const tracks = (el) => {
    const g = getComputedStyle(el).gridTemplateColumns;
    if (!g || g === "none") return 0;
    return (g.match(/px/g) || []).length;
  };
  const secs = [...document.querySelectorAll("main section, main > section")];
  const sections = secs.map((sec) => {
    const kids = [...sec.children].filter((el) => num(getComputedStyle(el).width) > 80);
    /* the section's content grid, not its heading row: the host with the most children */
    const grids = kids.filter((el) => getComputedStyle(el).display.includes("grid"));
    const gridHost = grids.sort((a, b) => b.children.length - a.children.length)[0] || sec;
    const gk = [...gridHost.children].filter((el) => num(getComputedStyle(el).width) > 40);
    const gx = [...new Set(gk.map((el) => Math.round(el.getBoundingClientRect().x)))];
    const h2 = sec.querySelector("h2");
    return {
      h2: h2 ? h2.textContent.trim().slice(0, 18) : "",
      cols: gx.length,
      host: gridHost.tagName.toLowerCase() + "." + (typeof gridHost.className === "string" ? gridHost.className.split(" ")[0] : ""),
      tracks: tracks(gridHost),
      gap: Math.round(num(getComputedStyle(gridHost).columnGap)),
      measure: Math.max(0, ...kids.map((el) => Math.round(num(getComputedStyle(el).width) / (num(getComputedStyle(el).fontSize) || 16)))),
    };
  });
  const leaves = [...document.querySelectorAll("main *")].filter((el) => el.children.length === 0 && el.textContent.trim());
  const sizes = [...new Set(leaves.map((el) => Math.round(num(getComputedStyle(el).fontSize))))].sort((a, b) => b - a);
  const ys = secs.map((s) => Math.round(s.getBoundingClientRect().top + window.scrollY)).filter((y) => y > 0);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  /* Two rhythms, both measurable. The spacing module is the gcd of every spacing value the
     page computes (padding, margin, gap): a page built on an 8 px module measures 8, and a
     page whose numbers were typed as they looked right measures 1. The top rhythm is the gcd
     of the gaps between section tops, which text heights usually wreck. */
  const props = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "columnGap", "rowGap"];
  const spacing = [];
  for (const el of document.querySelectorAll("main *, main")) {
    const cs = getComputedStyle(el);
    for (const p of props) {
      const v = Math.round(parseFloat(cs[p]) || 0);
      /* the module is the rhythm of the spacings that do layout; a 1-4 px optical nudge
         is not a grid unit, and counting it would let a page claim 1 px as its module */
      if (v >= 8) spacing.push(v);
    }
  }
  const module = spacing.length ? spacing.reduce((a, v) => gcd(a, v), spacing[0]) : 0;
  const deltas = ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d > 0);
  const topRhythm = deltas.length ? deltas.reduce((a, d) => gcd(a, d), deltas[0]) : 0;
  const radii = [...document.querySelectorAll("main *")].map((el) => num(getComputedStyle(el).borderRadius));
  /* two kinds of link, measured separately: the navigation, and the links in the text.
     A page can underline one and not the other, and the styles disagree about which. */
  const navLinks = [...document.querySelectorAll("nav a, header a")];
  const textLinks = [...document.querySelectorAll("main a, footer a")].filter(
    (a) => !/\b(btn|cta|button)\b/.test(a.className));
  const listHost = secs.map((s) => s.querySelector("ol, ul")).find((l) => l && l.children.length >= 3) || null;
  /* the largest bare display figure on the page — a feature numeral or a stat value, from
     its own text, and where it sits: hanging in a rail at the section's left edge, or above
     its heading. The styles that put the number in a rail are the ones with a manuscript,
     terminal or index tradition (swiss, editorial, japanese, pixel). */
  const numerals = leaves.filter((el) => /^[0-9]{1,2}$/.test(el.textContent.trim()) && num(getComputedStyle(el).fontSize) >= 18);
  const firstSec = secs[1] || secs[0];
  const hostX = firstSec ? firstSec.getBoundingClientRect().x : 0;
  return {
    sections,
    scale: sizes.slice(0, 6),
    module, topRhythm, spacingValues: spacing.length,
    radiusMax: Math.round(Math.max(0, ...radii)),
    navUnderlines: navLinks.length ? [...new Set(navLinks.map((a) => getComputedStyle(a).textDecorationLine))] : [],
    textLinkUnderlines: textLinks.length ? [...new Set(textLinks.map((a) => getComputedStyle(a).textDecorationLine))] : [],
    textLinkCount: textLinks.length,
    listFeatures: !!listHost,
    featureTag: listHost ? listHost.tagName.toLowerCase() : "none",
    figureSize: numerals.length ? Math.round(Math.max(...numerals.map((el) => num(getComputedStyle(el).fontSize)))) : 0,
    figureMode: numerals.length
      ? (numerals[0].getBoundingClientRect().x < hostX + 40 ? "rail" : "above")
      : "none",
    maxMeasure: Math.max(0, ...sections.map((s) => s.measure)),
  };
};

/* Gradient-clipped type: the audit reports "no colour to measure" for a transparent
   foreground. True of the CSS, false of the screen. Draw the element's own screenshot
   into a canvas and count what was painted: the dominant colour is the ground, the
   rarer colours are the glyphs, and their ratio is the contrast a reader gets. */
window.__ternmarkPixels = async (b64) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(0); img.src = "data:image/png;base64," + b64; });
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const n = d.length / 4;
  const hist = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] >> 3) + "," + (d[i + 1] >> 3) + "," + (d[i + 2] >> 3);
    const e = hist.get(k) || [0, 0, 0, 0];
    e[0] += d[i]; e[1] += d[i + 1]; e[2] += d[i + 2]; e[3]++;
    hist.set(k, e);
  }
  const lum = (rgb) => {
    const f = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const bins = [...hist.entries()].map(([, v]) => ({ rgb: [v[0] / v[3], v[1] / v[3], v[2] / v[3]], share: v[3] / n }));
  bins.sort((a, b) => b.share - a.share);
  const ground = bins[0];
  const glyph = bins.slice(1).find((b) => b.share > 0.004) || bins[1] || ground;
  const ratio = (Math.max(lum(ground.rgb), lum(glyph.rgb)) + 0.05) / (Math.min(lum(ground.rgb), lum(glyph.rgb)) + 0.05);
  return {
    w: img.width, h: img.height,
    ground: ground.rgb.map(Math.round), groundShare: +ground.share.toFixed(3),
    glyph: glyph.rgb.map(Math.round), glyphShare: +glyph.share.toFixed(3),
    ratio: +ratio.toFixed(2),
    distinct: bins.filter((b) => b.share > 0.004).length,
  };
};
