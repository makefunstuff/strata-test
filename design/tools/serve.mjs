/* design/tools/serve.mjs — the smallest static server, for looking at these pages.
 *
 * The gallery and the study pages use ES modules and read generated files, so they
 * need http://, not file://. This serves any folder in the repo with no dependencies.
 *
 *   node design/tools/serve.mjs design 8080      # http://127.0.0.1:8080/
 *   node design/tools/serve.mjs                  # serves design/ on 8080
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";

const root = resolve(process.argv[2] || "design");
const port = Number(process.argv[3] || 8080);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8", ".cast": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end("outside the served folder") }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(`404 ${p}\n(root: ${root})`);
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root}\n  http://127.0.0.1:${port}/index.html`));
