/* Meridian's icon set, as data: 32 glyphs on a 24 box, 2 px gutter, 1.5 stroke,
   round caps and joins, diagonals in 30° steps. Each entry is
   [name, keyboard, parts, drop16] — the fourth list is what disappears at 16 px,
   where the stroke is chosen so the device stroke is a whole pixel. The 16 px set is an
   edit, not a scale.

   The page renders from here; tools/sprite.mjs writes icons.svg from here.
   One source, two outputs. */
export const S = (d) => `<path d="${d}"/>`;
export const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

export const ICONS = [
  ["compass", "C", [C(12, 12, 9), S("M12 6.8 13.4 12 12 17.2 10.6 12Z"), S("M12 3.4V5"), S("M12 6.8v10.4")], [2, 3]],
  ["chart", "H", [S("M4.5 4.5h15v15h-15Z"), S("M7 15c2.4-1.6 4.2 1 6.4-.6 1.8-1.3 2.4-2.4 3.6-2.6"), C(8.4, 8.4, .65)], [1]],
  ["tide", "T", [C(12, 12, 8.6), S("M7.4 13.2c1.5-1.7 3 1.7 4.6 0 1.5-1.7 3 1.7 4.6 0"), S("M12 12V8")], [2]],
  ["soundings", "D", [S("M4.5 4.5h15v15h-15Z"), S("M7 16.5c2-2 4.4-4 7-4.4"), C(8.6, 10.2, .65), C(12.6, 8.2, .65), C(16.4, 11.4, .65)], [1]],
  ["waypoint", "P", [S("M12 20.6c4-4.4 6.1-7.6 6.1-10.2A6.1 6.1 0 1 0 5.9 10.4c0 2.6 2.1 5.8 6.1 10.2Z"), C(12, 10.3, 2)], []],
  ["anchor", "A", [C(12, 5, 2), S("M12 7v12.5"), S("M8.6 9.6h6.8"), S("M6 13.2c0 4 2.7 6.4 6 6.4s6-2.4 6-6.4")], [2]],
  ["lighthouse", "L", [S("M9.4 20V10.6h5.2V20"), S("M9 10.6 10 7h4l1 3.6"), S("M7.4 20h9.2"), S("M15.6 8.4 19 6.8"), S("M8.4 8.4 5 6.8")], [3, 4]],
  ["buoy", "B", [S("M8.2 20c0-4 1.7-6.8 3.8-6.8S15.8 16 15.8 20"), S("M12 13.2V6.6"), S("M12 6.6l2.6 1.6L12 9.8Z"), S("M6.2 20h11.6")], [3]],
  ["sail", "S", [S("M5 17.4h14l-1.7 2.6H6.7Z"), S("M12 17V4.8"), S("M12 6.6l4.6 10.2H12Z"), S("M12 8.8 8.2 16.8H12Z")], [3]],
  ["depth", "Z", [S("M4.5 5h15"), S("M12 8.4v6.2"), S("M9 12.2l3 3 3-3"), S("M8 18.6h8")], [3]],
  ["layers", "Y", [S("M12 4.2l7.8 3.9-7.8 3.9-7.8-3.9Z"), S("M4.2 12l7.8 3.9L19.8 12"), S("M4.2 16.2l7.8 3.9 7.8-3.9")], []],
  ["download", "J", [S("M12 4.4v9.8"), S("M8.2 10.6 12 14.4l3.8-3.8"), S("M5 18.8h14")], []],
  ["share", "K", [C(6.4, 12, 2.1), C(17.4, 6.4, 2.1), C(17.4, 17.6, 2.1), S("M8.4 11 15.4 7.4"), S("M8.4 13l7 3.6")], []],
  ["filter", "F", [S("M4.6 5.6h14.8l-5.6 6.6v6l-3.6-2.3v-3.7Z")], []],
  ["search", "O", [C(10.6, 10.6, 5.8), S("M14.9 14.9 19.4 19.4")], []],
  ["settings", "W", [S("M4.4 7.4h15.2"), S("M4.4 16.6h15.2"), C(9.2, 7.4, 1.9), C(15, 16.6, 1.9), S("M4.4 12h15.2"), C(12, 12, 1.9)], [4, 5]],
  ["bell", "N", [S("M7.2 16.2V11a4.8 4.8 0 0 1 9.6 0v5.2l1.2 2H6Z"), S("M10.2 19.6a1.9 1.9 0 0 0 3.6 0")], [1]],
  ["warning", "!", [S("M12 4.6 21 19.6H3Z"), S("M12 10v4.6"), S("M12 17.2v.01")], [2]],
  ["check", "✓", [S("M5.2 12.6 9.8 17.2 18.8 7")], []],
  ["close", "×", [S("M6.2 6.2 17.8 17.8"), S("M17.8 6.2 6.2 17.8")], []],
  ["plus", "+", [S("M12 5.6v12.8"), S("M5.6 12h12.8")], []],
  ["minus", "-", [S("M5.6 12h12.8")], []],
  ["chevron", ">", [S("M9.6 6.2 15.6 12l-6 5.8")], []],
  ["arrow", "→", [S("M4.6 12h14.8"), S("M14.2 6.6 19.4 12l-5.2 5.4")], []],
  ["trash", "⌫", [S("M5 7h14"), S("M9.2 7V4.6h5.6V7"), S("M6.6 7 7.6 20h8.8L17.4 7"), S("M10.2 10.6v6"), S("M13.8 10.6v6")], [3, 4]],
  ["edit", "E", [S("M5 19.2l1-4L16.6 4.6l2.8 2.8L8.8 18.2Z"), S("M14.6 6.6l2.8 2.8")], [1]],
  ["eye", "V", [S("M3.2 12c2.4-3.9 5.3-5.9 8.8-5.9s6.4 2 8.8 5.9c-2.4 3.9-5.3 5.9-8.8 5.9s-6.4-2-8.8-5.9Z"), C(12, 12, 2.4)], []],
  ["clock", "R", [C(12, 12, 8.6), S("M12 7.6V12l3.2 2.1"), S("M12 3.6v1.2"), S("M20.4 12h-1.2")], [2, 3]],
  ["battery", "U", [S("M3.4 8.6h14v6.8h-14Z"), S("M19.8 10.8v2.4"), S("M6.4 11v2"), S("M9.4 11v2"), S("M12.4 11v2")], [4]],
  ["key", "M", [C(8, 15.4, 3.9), S("M10.8 12.6 19.4 4"), S("M16.2 7.2l2.2 2.2"), S("M18.4 5l2.2 2.2")], [2, 3]],
  ["account", "I", [C(12, 8.4, 3.7), S("M5.2 20c1.5-3.5 4-5.2 6.8-5.2s5.3 1.7 6.8 5.2")], []],
  ["measure", "z", [C(12, 5, 1.6), S("M11.1 6.6 7.6 20"), S("M12.9 6.6 16.4 20"), S("M9.1 14.4h5.8")], [3]],
];

export function iconSvg(name, size = 24, small = size <= 17) {
  const ic = new Map(ICONS.map(([n, k, parts, drop]) => [n, { key: k, parts, drop }])).get(name);
  if (!ic) return "";
  // The 16 px stroke is set so the DEVICE stroke lands on a whole pixel, not on a hairline. The
  // icon scales by 16/24 = 0.667, and the first version asked for 1.25 user units, which is
  // 0.83 device px: on a 1x screen every 16 px icon rendered as a grey line, which is the exact
  // failure this section claims to design against. 1.5 user units is 1.0 device px at 16, and
  // 1.25 is 0.83 at 20, so the edit is chosen by the rendered pixel, not by the unit.
  const stroke = 1.5;   // 1.0 device px at 16, 1.25 at 20; the 16 px edit is the dropped detail
  const body = ic.parts.map((p, i) => (small && ic.drop.includes(i) ? "" : p)).join("");
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* the shipped sprite: one file, 32 symbols, addressed by id */
export function sprite() {
  const symbols = ICONS.map(([n, , parts]) => `  <symbol id="i-${n}" viewBox="0 0 24 24">${parts.join("")}</symbol>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Meridian icon sprite. ${ICONS.length} symbols, generated from icons.js by tools/sprite.mjs.
     Use: <svg width="24" height="24"><use href="icons.svg#i-compass"/></svg> — colour follows currentColor. -->
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false">
  <style>symbol { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round }</style>
${symbols}
</svg>
`;
}

export const MARK = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Meridian mark. One ring, one horizon, one meridian at 15°, one sun.
     Construction: 48x48 field, radii 6/12/18/24, horizon at y=30. currentColor + the signal red. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Meridian">
  <title>Meridian</title>
  <path d="M7.7 33.6A18 18 0 1 1 40.3 33.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M2.4 30h43.2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M24 4.6 24 24" transform="rotate(15 24 24)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24" cy="30" r="5.4" fill="#c8402f"/>
</svg>
`;

export const APPICON = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Meridian app icon: ring and sun on ink, on the store's safe-area grid (the mark
     occupies the inner 60 %). 512, 180, 96 and 48 all come from this file. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Meridian">
  <title>Meridian</title>
  <rect width="512" height="512" rx="112" fill="#14161a"/>
  <g transform="translate(102.4 102.4) scale(6.4)">
    <path d="M7.7 33.6A18 18 0 1 1 40.3 33.6" fill="none" stroke="#f7f6f3" stroke-width="3" stroke-linecap="round"/>
    <path d="M2.4 30h43.2" fill="none" stroke="#f7f6f3" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 4.6 24 24" transform="rotate(15 24 24)" fill="none" stroke="#f7f6f3" stroke-width="3" stroke-linecap="round"/>
    <circle cx="24" cy="30" r="5.4" fill="#c8402f"/>
  </g>
</svg>
`;
