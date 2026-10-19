# Prompt for game 3-marble-maze

Sent verbatim (everything below the line) to one fresh headless pi session on Strata, run in this folder.
The rules part is the same for all five games (`../tools/rules.md`).

---
Build a 3D marble-maze game with three.js and real physics from cannon-es 0.20.0 (from jsDelivr: https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js).
- The player tilts a maze board with the arrow keys (and WASD); the tilt is limited to a small angle and eases back when keys are released. A marble rolls under gravity and collides with the maze walls, all simulated by cannon-es (the board and walls are physics bodies that tilt with the board).
- The marble starts in one corner and must reach a goal pad in the other. A few holes in the board: falling through one, or off the board, resets the marble to the start.
- A timer and a "level complete" screen with the time; R restarts.
- Shadows on: a directional light casts shadows, the marble and walls cast them and the board receives them.
- Show timer and state in an HTML overlay.

Rules:
- Work only in the current folder. Plain static files: index.html plus JavaScript modules (and CSS if you want). No build step, no npm install, no bundler; it must open in a browser as is.
- Use three.js 0.170.0 from jsDelivr through an import map, exactly:
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  Any other library also from jsDelivr with an exact version.
- All paths relative (the game will be hosted under a sub-path). No server-side code.
- Test it yourself in headless Chromium with: node ../tools/smoke.ts . --keys "ArrowLeft:500,Space:100" --click 0.5,0.5
  It serves this folder, waits 4 s, plays the keys (key:holdMs, comma-separated; "wait:ms" pauses) and clicks (canvas fractions x,y; several separated by ";"), then prints console errors, page errors, failed requests, the page text before and after the input, and the frame rate. It renders in software (SwiftShader), so the frame rate is lower than on a real GPU. You cannot see the screenshots it saves; rely on the printed output, and put score/state text in the HTML overlay so you can check that the game reacts.
- Fix every error it reports, and check the game reacts to input. When the game works, write a short README.md (what it is, controls, how it works) and stop.
