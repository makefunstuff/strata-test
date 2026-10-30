#!/usr/bin/env node
// tui/tools/font-probe.mjs — which monospace faces can actually draw the character grid?
//
// A webfont that is missing box-drawing or block glyphs does not fail loudly: the browser silently
// takes those characters from a fallback face, which has a different advance width, and the grid
// drifts out of alignment one column at a time. This loads each candidate, measures every glyph the
// kit can put on screen, and prints the ones whose advance differs from "M".
//
// usage: node tui/tools/font-probe.mjs ['"Fira Code"', ...]
import { chromium } from "playwright-core";
import { launch } from "./check.mjs";

const GLYPHS = [
  "M", "W", "0", "1", ":", ".", ",", "#", "*", "/", "\\", "|", "-", "=", "+", "[", "]", "(", ")", "<", ">", "%",
  "·", "→", "←", "↑", "↓", "▶", "❙", "✓", "✗", "✕", "★", "☆", "●", "○", "▲", "▼", "◆", "◇", "§", "¶", "…", "“", "”", "‘", "’",
  "░", "▒", "▓", "█", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "▉", "▍", "▏", "╪", "╳",
  "─", "│", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼",
  "━", "┃", "┏", "┓", "┗", "┛", "┣", "┫", "┳", "┻", "╋",
  "═", "║", "╔", "╗", "╚", "╝", "╠", "╣", "╦", "╩", "╬",
  "╭", "╮", "╰", "╯", "┄", "╎",
];

const CANDIDATES = [
  '"JetBrains Mono"', '"IBM Plex Mono"', '"Fira Code"', '"Roboto Mono"', '"Inconsolata Variable"',
  '"Ubuntu Mono"', '"Space Mono"', '"Source Code Pro"', '"Anonymous Pro"', '"Share Tech Mono"',
  '"Fira Mono"', '"Red Hat Mono"', '"Azeret Mono"', '"Spline Sans Mono"', '"Fragment Mono"',
  '"Martian Mono"', '"Geist Mono"', '"Courier Prime"', '"PT Mono"', '"Cousine"',
];

const CDN = (name) => `https://cdn.jsdelivr.net/npm/@fontsource/${name.toLowerCase().replace(/\s+/g, "-")}@5.2.5/index.css`;
const CDN_VAR = (name) => `https://cdn.jsdelivr.net/npm/@fontsource-variable/${name.toLowerCase().replace(/\s+/g, "-")}@5.2.5/index.css`;

const wanted = process.argv.slice(2);
const list = wanted.length ? wanted : CANDIDATES;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.setContent(`<style>body{margin:0}</style><body>`);

const links = list.map((f) => {
  const name = f.replace(/"/g, "");
  return name.endsWith(" Variable")
    ? `<link rel="stylesheet" href="${CDN_VAR(name.replace(" Variable", ""))}">`
    : `<link rel="stylesheet" href="${CDN(name)}">`;
});
// append the stylesheets and wait for each one to load — measuring before the CSS arrives means every
// face silently falls back and the probe tells you nothing
await page.evaluate((html) => {
  const box = document.createElement("div");
  box.innerHTML = html.join("");
  return new Promise((done) => {
    let left = [...box.children].length;
    for (const el of [...box.children]) {
      el.addEventListener("load", () => { if (--left <= 0) done(); });
      el.addEventListener("error", () => { if (--left <= 0) done(); });
      document.head.appendChild(el);
    }
    if (!left) done();
  });
}, links);
await page.evaluate(() => document.fonts.ready);

const rows = await page.evaluate(async ({ fonts, glyphs }) => {
  const out = [];
  for (const family of fonts) {
    const spec = `15px ${family}, monospace`;
    let loaded = 0;
    try { loaded = (await document.fonts.load(spec, "MMMM")).length; } catch { /* not loaded */ }
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = spec;
    const base = ctx.measureText("M").width;
    const bad = [];
    for (const g of glyphs) {
      const w = ctx.measureText(g).width;
      if (Math.abs(w - base) > Math.max(0.6, base * 0.12)) bad.push(g);
    }
    out.push({ family, loaded, check: document.fonts.check(spec, "M"), base: +base.toFixed(2), missing: bad.length, glyphs: bad.slice(0, 40).join("") });
  }
  return out;
}, { fonts: list, glyphs: GLYPHS });

for (const r of rows.sort((a, b) => a.missing - b.missing)) {
  console.log(`${String(r.missing).padStart(3)} off-grid  ${r.family.padEnd(24)} faces:${r.loaded} check:${r.check} advance ${r.base}px  ${r.glyphs}`);
}
await browser.close();
