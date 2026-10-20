#!/usr/bin/env node
// Regenerate the shipped files from the one source, icons.js:
//   node tools/sprite.mjs
// icons.svg  — 32 symbols, addressed by id, colour from currentColor
// mark.svg   — the full mark, currentColor + the signal red
// appicon.svg— ring and sun on ink, on the store's safe-area grid
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sprite, MARK, APPICON } from "../icons.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..");
writeFileSync(join(out, "icons.svg"), sprite());
writeFileSync(join(out, "mark.svg"), MARK);
writeFileSync(join(out, "appicon.svg"), APPICON);
console.log("icons.svg, mark.svg, appicon.svg written");
