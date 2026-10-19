// Ad-hoc: dump a game's scene graph (world positions, sizes, materials) to find a stray object.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, normalize, basename, dirname } from "node:path";

const game = resolve(process.argv[2]);
const root = resolve(dirname(game));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    const file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? fileURLToPath(new URL("../chromium-capped.sh", import.meta.url)),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${basename(game)}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const dump = await page.evaluate(() => {
    const env = window.arcade;
    const THREEV = (v) => (v ? [v.x, v.y, v.z].map((n) => +n.toFixed(2)) : null);
    const rows = [];
    env.scene.traverse((o) => {
      const box = o.geometry && new (window.arcade.Box3Cls ?? Object)();
      const par = o.geometry?.parameters ?? {};
      const size = o.geometry?.boundingBox
        ? [o.geometry.boundingBox.max.x - o.geometry.boundingBox.min.x, o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y, o.geometry.boundingBox.max.z - o.geometry.boundingBox.min.z].map((n) => +n.toFixed(2))
        : Object.entries(par).filter(([k, v]) => typeof v === "number" && ["width", "height", "depth", "radius", "args"].includes(k)).map(([k, v]) => `${k}=${+v.toFixed(2)}`).join(" ");
      const m = o.material;
      rows.push({
        type: o.type, name: o.name || null,
        pos: THREEV(o.getWorldPosition(o.getWorldPosition ? new (Object.getPrototypeOf(o.position).constructor)() : null)),
        scale: o.scale ? [o.scale.x, o.scale.y, o.scale.z].map((n) => +n.toFixed(2)) : null,
        geo: size || null,
        mat: m ? [m.type, m.color?.getHexString?.(), m.emissive?.getHexString?.(), "emI=" + (m.emissiveIntensity ?? "-"), "tone=" + (m.toneMapped ?? "-"), "op=" + (m.opacity ?? 1), m.blending].filter(Boolean).join(" ") : null,
        visible: o.visible,
      });
    });
    return { rows, cam: { pos: THREEV(env.camera.position), fov: env.camera.fov, near: env.camera.near, far: env.camera.far, quat: env.camera.quaternion.toArray().map((n) => +n.toFixed(3)) }, fog: env.scene.fog ? [env.scene.fog.near, env.scene.fog.far, env.scene.fog.color.getHexString()] : null };
  });
  console.log(JSON.stringify(dump, null, 1));
} finally {
  await browser.close().catch(() => {});
  server.close();
}
