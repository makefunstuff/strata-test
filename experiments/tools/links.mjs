#!/usr/bin/env node
/*
 * links.mjs — check that every local href/src in the published HTML resolves to a real file.
 *
 *   node experiments/tools/links.mjs [root]        (default: repo root)
 *
 * The Pages layout mirrors the repo (index.html at the root, games/ and experiments/ under it), so
 * a path that resolves in the checkout resolves on the site. External URLs, #fragments and mailto:
 * are reported separately and not checked.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const html = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    if (e === ".git" || e === "node_modules" || e === "tools" || e === "whole-repo-qa") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith(".html")) html.push(p);
  }
};
walk(root);

const missing = [];
const externals = new Set();
let checked = 0;
for (const f of html) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:|javascript:)/.test(u) || u.startsWith("#")) { externals.add(u.split("#")[0]); continue; }
    const clean = decodeURIComponent(u.split("#")[0].split("?")[0]);
    if (!clean) continue;
    const target = resolve(dirname(f), clean);
    checked++;
    if (!existsSync(target)) missing.push(`${f.slice(root.length + 1)} -> ${u}`);
  }
}
console.log(`${html.length} html files, ${checked} local references checked, ${missing.length} missing`);
for (const m of missing) console.log("  MISSING", m);
console.log(`${externals.size} external origins (not fetched):`, [...externals].slice(0, 8).join(" "));
process.exit(missing.length ? 1 : 0);
