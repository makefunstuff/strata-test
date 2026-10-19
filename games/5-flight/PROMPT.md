# Prompt for game 5-flight

Sent verbatim (everything below the line) to one fresh headless pi session on Strata, run in this folder.
The rules part is the same for all five games (`../tools/rules.md`).

---
Build a 3D flight game with three.js over procedural terrain, with good graphics that still run at a steady frame rate.
- The player flies a simple plane mesh: arrow keys (and WASD) pitch and roll/turn, Shift speeds up. A chase camera follows smoothly behind the plane.
- Procedural terrain from a noise function (write your own simplex or value noise or import one from jsDelivr with an exact version), in chunks or tiles that are created around the plane and reused, so you can fly forever. Color by height (water, sand, grass, rock, snow).
- Fog that fades the terrain into the sky, and a skybox: a sky shader (three's Sky addon is fine) or a gradient sky dome, with a sun.
- Particle effects: an engine trail behind the plane, and glowing rings to fly through that burst into sparks when collected. Rings give score.
- Post-processing with bloom: EffectComposer + RenderPass + UnrealBloomPass (+ OutputPass) from three/addons.
- Hitting the terrain crashes the plane and restarts after a moment.
- Keep the frame rate steady: modest triangle and draw-call counts, reuse geometry, no per-frame allocations. Show score, speed, altitude and FPS in an HTML overlay.

Rules:
- Work only in the current folder. Plain static files: index.html plus JavaScript modules (and CSS if you want). No build step, no npm install, no bundler; it must open in a browser as is.
- Use three.js 0.170.0 from jsDelivr through an import map, exactly:
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  Any other library also from jsDelivr with an exact version.
- All paths relative (the game will be hosted under a sub-path). No server-side code.
- Test it yourself in headless Chromium with: node ../tools/smoke.ts . --keys "ArrowLeft:500,Space:100" --click 0.5,0.5
  It serves this folder, waits 4 s, plays the keys (key:holdMs, comma-separated; "wait:ms" pauses) and clicks (canvas fractions x,y; several separated by ";"), then prints console errors, page errors, failed requests, the page text before and after the input, and the frame rate. It renders in software (SwiftShader), so the frame rate is lower than on a real GPU. You cannot see the screenshots it saves; rely on the printed output, and put score/state text in the HTML overlay so you can check that the game reacts.
- Fix every error it reports, and check the game reacts to input. When the game works, write a short README.md (what it is, controls, how it works) and stop.
