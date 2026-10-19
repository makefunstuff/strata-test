// Live check: load each published game from GitHub Pages, capture console/page errors,
// press a key, and read the HUD back. Run from games/tools so playwright-core resolves.
import { chromium } from "playwright-core";

const base = "https://makefunstuff.github.io/strata-test";
const games = [
  ["1-breakout", "Space"],
  ["2-runner", "Space"],
  ["3-marble-maze", "ArrowDown"],
  ["4-tower-defense", "KeyN"],
  ["5-flight", "ShiftLeft"],
];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? new URL("../chromium-capped.sh", import.meta.url).pathname,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process", "--no-zygote",
         "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=256"],
});
for (const [name, key] of games) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const bad = [];
  page.on("console", (m) => m.type() === "error" && !/favicon|autoplay/i.test(m.text()) && bad.push(m.text()));
  page.on("pageerror", (e) => bad.push(String(e)));
  await page.goto(`${base}/${name}/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.keyboard.press(key);
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 78));
  console.log(`${name.padEnd(16)} errors=${bad.length ? bad.slice(0, 2).join(" | ") : "none"}  ${txt}`);
  await page.close();
}
await browser.close();
