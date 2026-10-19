# Prompt for game 4-tower-defense

Sent verbatim (everything below the line) to one fresh headless pi session on Strata, run in this folder.
The rules part is the same for all five games (`../tools/rules.md`).

---
Build a small 3D tower-defense game with three.js on a grid.
- The map is a 12x12 grid of tiles seen from an angled camera. Enemies spawn at an entrance tile on one edge and walk to an exit tile on the opposite edge, following a shortest path found with BFS or A* around blocked tiles.
- The player places towers by clicking empty tiles (raycast against the grid), paying money. A placement that would fully block the path from entrance to exit is rejected. Enemies already walking re-route when the path changes.
- Towers automatically target and shoot the nearest enemy in range with visible projectiles. Enemies have health bars and give money when killed. An enemy that reaches the exit costs a life.
- Waves: each wave has more and tougher enemies. Start the next wave with a button or the N key.
- HTML overlay UI: money, lives, wave, tower cost, a start-wave button and a game-over screen with restart.

Rules:
- Work only in the current folder. Plain static files: index.html plus JavaScript modules (and CSS if you want). No build step, no npm install, no bundler; it must open in a browser as is.
- Use three.js 0.170.0 from jsDelivr through an import map, exactly:
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  Any other library also from jsDelivr with an exact version.
- All paths relative (the game will be hosted under a sub-path). No server-side code.
- Test it yourself in headless Chromium with: node ../tools/smoke.ts . --keys "ArrowLeft:500,Space:100" --click 0.5,0.5
  It serves this folder, waits 4 s, plays the keys (key:holdMs, comma-separated; "wait:ms" pauses) and clicks (canvas fractions x,y; several separated by ";"), then prints console errors, page errors, failed requests, the page text before and after the input, and the frame rate. It renders in software (SwiftShader), so the frame rate is lower than on a real GPU. You cannot see the screenshots it saves; rely on the printed output, and put score/state text in the HTML overlay so you can check that the game reacts.
- Fix every error it reports, and check the game reacts to input. When the game works, write a short README.md (what it is, controls, how it works) and stop.
