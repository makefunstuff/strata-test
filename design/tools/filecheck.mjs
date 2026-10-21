// Which pages load over file:// — the protocol a reader meets after cloning the repo.
//
//   node tools/filecheck.mjs                  # every task page in the manifest
//   node tools/filecheck.mjs 01-landing 05-system
//
// Each page is opened twice in the same RAM-capped Chromium used by shoot.mjs: once over
// file://, once over http:// from a local server rooted at design/. The same listeners
// record console errors, page errors and failed requests. ES module scripts and fetch()
// are blocked by CORS on file://, so any page that imports a module dies there; that is a
// fact about the page, and the point of this tool is to measure it rather than assert it.
//
// Output: tools/work/filecheck.json + filecheck.md
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(toolsDir, "..");
const reportDir = join(toolsDir, "work");

const want = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const manifest = JSON.parse(await readFile(join(toolsDir, "manifest.json"), "utf8"));
const tasks = manifest.filter((t) => !want.length || want.includes(t.task));
if (!tasks.length) { console.error("no such task in manifest:", want.join(",")); process.exit(1); }

// one page of every distinct (task, path) pair in the manifest — the file:// question is
// about the entry document, and a query string does not change the module graph, so
// app.html?screen=today and app.html?screen=log are one case, measured once
const pages = [];
for (const t of tasks) {
  const seen = new Set();
  for (const s of t.shots) {
    const [file, query] = s.page.split("?");
    if (seen.has(file)) continue;
    seen.add(file);
    pages.push({ task: t.task, page: file, url: file + (query ? "?" + query : "") });
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".json": "application/json", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const { stat } = await import("node:fs/promises");
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  try {
    let f = join(designDir, rel);
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    res.writeHead(200, { "content-type": TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("404 " + rel); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(toolsDir, "chromium-capped.sh"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb",
         "--font-render-hinting=none", "--hide-scrollbars",
         "--js-flags=--max-old-space-size=512"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

/* The console text of a CORS block quotes the absolute file:// URL, which carries the
   machine's path. The repository is public, so no absolute path ever leaves this tool:
   anything at or above design/ is cut to design/..., loopback origins are dropped, and a
   string that still smells like a home path is replaced by a marker. */
const redact = (s) => {
  let out = String(s)
    .replace(/file:\/\/[^\s'"`)]+/g, (m) => (m.includes("/design/") ? "file://…/" + m.slice(m.indexOf("/design/") + 1) : "file://…"))
    .replace(/https?:\/\/(127\.0\.0\.1|localhost):\d+/g, "<local>")
    .replace(/[^\s'"]*\/design\//g, "design/");
  if (/\/home\//.test(out) || /\/[a-z0-9._-]+\/[a-z0-9._-]+\/design/.test(out)) out = "[redacted: absolute path]";
  return out;
};

const load = async (url) => {
  const errs = [];
  await page.goto("about:blank").catch(() => {});   // clear any chrome-error state from the last load
  await page.waitForTimeout(120);
  const off = () => { page.removeAllListeners("console"); page.removeAllListeners("pageerror"); page.removeAllListeners("requestfailed"); };
  off();
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + redact(m.text()).slice(0, 160)); });
  page.on("pageerror", (e) => errs.push("pageerror: " + redact(String(e)).slice(0, 160)));
  page.on("requestfailed", (r) => errs.push("requestfailed: " + redact(r.url()).replace(/^https?:\/\/[^/]+\/?/, "").slice(0, 120) + " " + (r.failure()?.errorText || "")));
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(900);
  } catch (e) {
    errs.push("goto: " + redact(String(e)).split("\n")[0].slice(0, 160));
  }
  // did the page actually build itself? a module blocked by CORS can render its static shell
  const built = await page.evaluate(() => ({
    html: document.documentElement.innerHTML.length,
    interactive: document.querySelectorAll("button, a, input, select").length,
    bodyChildren: document.body ? document.body.children.length : 0,
  })).catch(() => null);
  off();
  return { errs, built };
};

const rows = [];
for (const p of pages) {
  const abs = join(designDir, p.task, p.page);
  const f = await load(pathToFileURL(abs).href + (p.url.includes("?") ? "?" + p.url.split("?")[1] : ""));
  const h = await load(`${origin}/${p.task}/${p.url}`);
  rows.push({ ...p, file: f, http: h });
  const mark = (x) => x.length ? String(x.length) : "0";
  console.log(`${(p.task + "/" + p.page).padEnd(34)} file:// ${mark(f.errs).padStart(3)} errs   http:// ${mark(h.errs).padStart(3)} errs`);
}
await browser.close();
server.close();

const blocked = rows.filter((r) => r.file.errs.length);
const summary = {
  generatedFrom: "manifest pages opened over file:// and http:// by tools/filecheck.mjs",
  pages: rows.length,
  blockedOverFile: blocked.length,
  okOverFile: rows.length - blocked.length,
  tasksOkOverFile: [...new Set(rows.filter((r) => !r.file.errs.length).map((r) => r.task))],
  tasksBlockedOverFile: [...new Set(blocked.map((r) => r.task))],
  errorsOverHttp: rows.filter((r) => r.http.errs.length).length,
  rows,
};
await writeFile(join(reportDir, "filecheck.json"), JSON.stringify(summary, null, 1));

const md = [
  "# file:// check — `node tools/filecheck.mjs`",
  "",
  `${summary.pages} pages opened twice. Over \`file://\`: ${summary.okOverFile} clean, ${summary.blockedOverFile} with console/page/request errors. Over \`http://\`: ${summary.errorsOverHttp} with errors.`,
  "",
  "Works over `file://`: " + (summary.tasksOkOverFile.join(", ") || "none"),
  "",
  "Blocked over `file://`: " + (summary.tasksBlockedOverFile.join(", ") || "none"),
  "",
  "| task / page | file:// errors | first file:// error | http:// errors |",
  "|--|--|--|--|",
  ...rows.map((r) => `| ${r.task}/${r.page} | ${r.file.errs.length} | ${(r.file.errs[0] || "—").replace(/\|/g, "/").slice(0, 110)} | ${r.http.errs.length} |`),
];
await writeFile(join(reportDir, "filecheck.md"), md.join("\n") + "\n");
console.log(`\nfile:// — ${summary.okOverFile}/${summary.pages} pages clean; http:// — ${summary.pages - summary.errorsOverHttp}/${summary.pages}`);
console.log("wrote tools/work/filecheck.md");
