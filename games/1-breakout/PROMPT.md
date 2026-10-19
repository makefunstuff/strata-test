# Prompt for game 1-breakout

Sent verbatim (everything below the line) to one fresh headless pi session on Strata, run in this folder.
The rules part is the same for all five games (`../tools/rules.md`).

---
Build a 3D Breakout game with three.js.
- A paddle at the bottom of the field moves left/right with the arrow keys (and A/D). A ball bounces off the side and top walls, the paddle and a grid of bricks. The bounce angle depends on where the ball hits the paddle.
- A brick breaks when hit and adds to the score. If the ball falls past the paddle you lose a life; 3 lives. Show a start screen, a game-over screen and a win screen; Space starts and restarts.
- Basic meshes (boxes, a sphere), one light (plus an ambient light), a perspective camera looking down at the field at an angle.
- Score and lives in an HTML overlay.

Rules:
- Work only in the current folder. Plain static files: index.html plus JavaScript modules (and CSS if you want). No build step, no npm install, no bundler; it must open in a browser as is.
- Use three.js 0.170.0 from jsDelivr through an import map, exactly:
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  Any other library also from jsDelivr with an exact version.
- All paths relative (the game will be hosted under a sub-path). No server-side code.
- Test it yourself in headless Chromium with: node ../tools/smoke.ts . --keys "ArrowLeft:500,Space:100" --click 0.5,0.5
  It serves this folder, waits 4 s, plays the keys (key:holdMs, comma-separated; "wait:ms" pauses) and clicks (canvas fractions x,y; several separated by ";"), then prints console errors, page errors, failed requests, the page text before and after the input, and the frame rate. It renders in software (SwiftShader), so the frame rate is lower than on a real GPU. You cannot see the screenshots it saves; rely on the printed output, and put score/state text in the HTML overlay so you can check that the game reacts.
- Fix every error it reports, and check the game reacts to input. When the game works, write a short README.md (what it is, controls, how it works) and stop.
