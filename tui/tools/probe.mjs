#!/usr/bin/env node
// tui/tools/probe.mjs — print the live grid of a page so the text can be read without a screenshot.
// usage: node tui/tools/probe.mjs 4-player [row]
import { chromium } from "playwright-core";
import { launch } from "./check.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const dir = process.argv[2] ?? "1-monitor";
const onlyRow = process.argv[3] !== undefined ? +process.argv[3] : null;

const http = await import("node:http");
const fs = await import("node:fs/promises");
const pathMod = await import("node:path");
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let p = pathMod.join(ROOT, decodeURIComponent(u.pathname));
  if (p.endsWith("/")) p += "index.html";
  try {
    const buf = await fs.readFile(p);
    const type = p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/html";
    res.writeHead(200, { "content-type": type });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

const browser = await launch();
const [vw, vh] = (process.env.VIEW ?? "1280x800").split("x").map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
await page.goto(`http://127.0.0.1:${port}/tui/${dir}/`, { waitUntil: "load" });
await page.waitForTimeout(2500);
if (process.env.KEYS) {
  for (const k of process.env.KEYS.split(",")) {
    if (!k) continue;
    if (k === "Space") await page.keyboard.press("Space");
    else if (k.startsWith("C-")) await page.keyboard.press("Control+" + k.slice(2));
    else await page.keyboard.press(k);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
}
const out = await page.evaluate(() => {
  const t = window.tui;
  const rows = [];
  for (let y = 0; y < t.rows; y++) {
    let s = "";
    for (let x = 0; x < t.cols; x++) s += String.fromCharCode(t.term.ch[y * t.cols + x]);
    rows.push(s.replace(/\s+$/, ""));
  }
  return { cols: t.cols, rows, state: t.state() };
});
console.log(`# ${dir}  ${out.cols} cols`);
out.rows.forEach((r, i) => { if (onlyRow === null ? r.trim() : i === onlyRow) console.log(String(i).padStart(2), "|", r); });
console.log("# state", JSON.stringify(out.state));
await browser.close();
srv.close();
