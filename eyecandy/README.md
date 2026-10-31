# eye candy

Five three.js pages whose only brief was *be beautiful*. Nothing to solve, nothing to win, no layout to
audit: each folder is a shader, a subject and a grade. Plain static files — `index.html`, ES modules,
CSS — with three.js 0.170.0 and lil-gui from a pinned CDN importmap, every internal path relative, so
the folder is GitHub-Pages-ready as it stands.

Live: **https://makefunstuff.github.io/strata-test/eyecandy/** · the
[gallery](index.html) is the thumbnail row, and the [site hub](../index.html) also links the
[five games](../games/index.html), the [seven experiments](../experiments/index.html) and the
[design gallery](../design/index.html).

This shelf is the sibling of `experiments/`. The experiments are written to be *right* (a leapfrog wave
update, a Rapier CCD projectile, a strain-memory tear); these are written to be *looked at*, which turns
out to need a different discipline — exposure, contrast, silhouette and colour, decided rather than
derived. It reuses the experiments' renderer kit (`createLab`) through one wrapper, `shared/candy.js`.

## The five, as measured

FPS is headless Chromium on SwiftShader (software — the model server on this box holds both GPUs), so
every number is a **floor**, not what a real GPU does; each page has a low/medium/high preset for the
rest. "Works" is what the check measured after driving the page — clicks, drags and calls into the
page's own `window.experiment` hook — not what it should do.

```
node eyecandy/tools/check.mjs 1-aurora --label aurora --wait 9 --view 1200x760 \
  --click 0.5,0.5 --eval "window.experiment.api.flare()"
```

The checker writes `shots/<label>-start.jpg` and `<label>-after.jpg`; the after-shot is the evidence and
is kept. `hero.jpg`, `alt1.jpg`, `alt2.jpg` are posed and shot by `eyecandy/tools/hero.mjs` (same
harness, 1600×900, and it applies the third state of each page — a flare, a thicker film, a pop, a
different palette, a startle, a shockwave, an injected ring) and are the three the gallery shows. The
table is the last full sweep, run at 1000×620 on the high preset.

| # | page | works? (headless, software renderer) | fps (sw) | one line | controls |
|---|---|---|---|---|---|
| 1 | [Aurora](1-aurora/index.html) | 0 errors; 11 curtains, mirror RT 660×418, activity 1.30, palette `green veil`, flare 0→1, snow 900 | 4.8 | fBm light curtains with ridged rays over a procedural starfield and a Milky Way, and a frozen lake that mirrors the world via a **second render from below** with ripples, frost, cracks and moon glint | drag look · wheel in · click flare · `C` palette · `M` moon · `Space` calm |
| 2 | [Iridescence](2-iridescence/index.html) | 0 errors; 16 bubbles at 420 nm, pop drives `popping` 0→1 and droplets 0→34, `popIndex` verified | 13.2 | Soap bubbles coloured by **thin-film interference** — optical path through a 1.333 film divided by each channel's wavelength — draining, swirling, Fresnel-rimmed, popping into droplets | drag orbit · click pop · `P` pop one · `N` new field · `Space` freeze |
| 3 | [Nebula](3-nebula/index.html) | 0 errors; 200 000 points, spread 34, turbulence 14.5, theme switch and `blast()` both recorded | 8.4 | All 200k–300k points positioned in the **vertex shader** from a seed: shell → three arms → differential spin → three noise taps into filaments; the CPU updates only time | drag orbit · click shockwave · `T` theme · `R` reset · `Space` spin |
| 4 | [Bioluminescence](4-bioluminescence/index.html) | 0 errors; 7 jellyfish, pulse 0.42 Hz, `startle()` raises pulse and sets `startled`, tentacles and shaft counts hold | 12 | Jellyfish lit by themselves: a lathe bell that clamps on a wave from apex to margin, arms and tentacles lagging the pulse in the vertex shader, shafts from the surface, marine snow | drag orbit · click startle · `G` glow · `S` surface · `Space` still |
| 5 | [Kaleidoscope](5-kaleido/index.html) | 0 errors; 14 folds, damp 0.93, `inject()` recorded, `freeze()` and `clear()` verified | 10 | A generator feeding a **feedback buffer kept in wedge space**, so rotate-and-zoom is one texture lookup; one wedge is computed and the display pass mirrors it n times | drag folds/zoom · wheel folds · click inject · `C` palette · `F` freeze · `R` clear |

Software FPS is the whole-page rate the harness measures, so it also carries the cost of the screenshot
machinery; the in-page readout (bottom right) is what the page itself counts.

## How they look (1–5)

Self-assessed from the kept `hero.jpg` at the high preset. 3 = does the job, 4 = would show someone,
5 = the reason to open the page.

| # | page | visuals | motion | why that number |
|---|---|---|---|---|
| 1 | aurora | **5** | **4** | the best-looking page here: ray structure, a real reflected sky and a silhouetted shore give it a photograph's composition. the curtains wave, flare and drain colour, but the ray field is the same fBm everywhere — up close it reads as texture rather than weather |
| 2 | iridescence | **5** | **3** | the interference is real, so the marbling and the black film come out on their own rather than being painted. drift and wobble are gentle; bubbles pass through each other and the pop is a hole, not a burst of film |
| 3 | nebula | **4** | **4** | granular dust with dark lanes, arms and a spiked core star; it looks like a picture of a nebula. the arms shear but the envelope is still one lens — a second, coarser noise octave would break it into clouds |
| 4 | bioluminescence | **4** | **4** | the lag in the tentacles is what sells it: the trail follows the clamp instead of swinging rigidly. bells read as glowing saucers from the side, and the under-bell disc only pays off from below |
| 5 | kaleidoscope | **4** | **5** | the loop is genuinely alive — every frame is the previous one rotated, zoomed, faded and repainted, so it never repeats. the accumulated rim goes milky and the palette runs muddy at the extremes, which is why contrast and saturation are pinned in the display pass |

## The shared kit — `shared/`

| file | what it gives every page |
|---|---|
| `shared/candy.js` | `createCandy()` — the experiments' `createLab` (renderer, ACES, composer + bloom, camera, orbit, fps, HUD, hints, lil-gui, presets, pointer, `lab.expose`) with heavier bloom and a black sky; `GLSL`, one chunk of hash / value-noise / fBm / ridged-fBm / domain-warp / cosine-palette / soft-clip that every shader in the shelf cuts from; `fullscreenQuad`, `overlayPass`, `gradePass` (vignette + grain + tint + saturation, the last pass on all five), `sparkleField`, `snap` |
| `shared/candy.css` | the quieter chrome: full-bleed canvas, title with a subtitle, HUD moved to the bottom so it never lands on the picture, fps badge, hint card, blurred lil-gui theme |

The GLSL is GLSL1 as three.js compiles it under WebGL2 (`varying`, `gl_FragColor`, `texture2D` all
work), and it is prepended to every fragment and vertex shader so no page re-declares noise.

Each page exposes `window.experiment.state()` (the numbers on screen) and an `api` the harness drives:
`flare` / `setPalette` / `setCurtains` / `setMirror` (1), `pop` / `popIndex` / `build` (2), `blast` /
`setTheme` / `setCount` (3), `startle` / `setGlow` / `setCount` (4), `inject` / `setFolds` /
`setPalette` / `freeze` / `clear` (5). That hook is what turns "the page loaded" into "the picture
moved" — the check reads state, drives the api, and reads state again.

## What got hard

1. **A backtick inside a GLSL comment ends the template literal.** `` // `d` is the film thickness ``
   closed the shader string early and the page died with `Unexpected identifier 'd'` — a JS parse error
   pointing at nothing (2). The check caught it in one run; an eyeball would not have.
2. **`hash33` returns a `vec3`.** The 3D value noise wanted a float at each of the eight corners; using
   the vector hash gave `cannot convert from '3-component vector of float' to 'float'` at eight lines at
   once, in every shader that touched `fbm3`. The kit now has both `hash33` and `hash31` (`shared/candy.js`).
3. **A mirror is a second camera, and trees can stand in front of it.** Reflecting the eye and the view
   ray in `y = 0` and re-rendering works — but the reflection of a curtain 30° up lands on ice *behind*
   the treeline, so the lake looked empty until the pines became two side groves and the middle of the
   frame was open water.
4. **Everything here wants to be overexposed.** Bloom on top of additive blending on top of ACES turns
   two hundred thousand soft particles into one white blob: the nebula's first render was a featureless
   disc at 100% brightness. The fix was arithmetic, not taste — per-particle alpha down ~3×, a density
   `smoothstep` that carves dark lanes, and a bloom threshold raised above the dust rather than below it.
5. **Uniforms must be declared per stage.** The nebula's vertex shader used `uBright`, `uCore` and the
   four palette vectors that only existed in its uniform *values*; ANGLE complained once per undeclared
   name, and the errors point at the line that *used* them, not the line that forgot them.
6. **The checker's root was one level too shallow.** Pages here reach `../shared/` *and*
   `../../experiments/shared/`, so the harness must serve the repo root and mirror the URL, the way
   Pages does — serving the shelf root produced a 404 on a file that was there.
7. **A `dot(vec3, vec2)` is a "dimension mismatch" three lines away from the cause** (1), and ANGLE
   reports the *first* failed stage for both stages of a program: the useful line is the last error
   block, not the first.
8. **Draw ranges are per-ribbon, not per-vertex.** Showing "20 of 40 tentacles" is `n × segs × 6`
   indices on a single merged mesh; the first attempt divided by an index count that had already been
   divided and drew nothing. `makeRibbon` now keeps `segs`, `ribbons` and a `setRibbons(n)`.

## Rules this shelf keeps from the repo

Static files only, no build step, no npm at runtime (`tools/` has `playwright-core`, gitignored);
relative paths everywhere; nothing served from the filesystem, so `file://` is not supported and Pages
is the deployment; no secrets, no hostnames; the headless check exits non-zero on any console, page or
network error, and a page is not "done" until the check is clean and a hero shot has been looked at.
