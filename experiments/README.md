# experiments

Five three.js graphics and motion experiments, each in its own folder, all on one shared lab
kit. Plain static files: `index.html`, ES modules, CSS. No build step, no npm, no server-side
code — open `index.html` and it runs. Three.js, lil-gui and Rapier come from a pinned CDN
importmap, every internal path is relative, so the folder is GitHub-Pages-ready as it stands.

Live: **https://makefunstuff.github.io/strata-test/experiments/** · the
[gallery](index.html) is the thumbnail row, the [site hub](../index.html) also links the
[five games](../games/index.html).

## The five, as measured

FPS is headless Chromium on SwiftShader (software — the model server on this machine holds the
GPU), so every number below is a **floor**, not what a real GPU does; the pages are written to
hold 60 fps on a desktop GPU, and each has a low/medium/high preset for the rest. "Works" is
what the headless check measured after driving the page — scripted drags, clicks and calls into
the page's own `window.experiment` hook — not what it should do. One command per experiment:

```
node experiments/tools/check.mjs 1-water --label water --wait 8 \
  --drag 0.5,0.6:0.62,0.5 --click 0.4,0.55 --eval "…"

# the cloth: a real mouse drag on the sheet, a shift-drag slice, a scripted sustained pull
node experiments/tools/check.mjs 3-cloth-tearing --label cloth --wait 8 \
  --drag 0.47,0.53:0.36,-0.06:900 --drag 0.4,0.42:0.16,0.22:600:shift \
  --eval "…api.pullScreen(mid, …)…"
```

`bash experiments/tools/sweep.sh` runs all five and prints one line each
(`experiments/tools/summarize.mjs` reads the JSON the checker emits). The table is the last full sweep, run on the branch after merging `origin/main`. The checker writes
`<experiment>/shots/<label>-start.jpg` and `<label>-after.jpg`; the after-shot is the evidence and is
kept, the before-shot is not. `hero.jpg`, `alt1.jpg`, `alt2.jpg` are the ones the gallery shows.

| # | experiment | works? (headless, software renderer) | fps (sw) idle / after input | one line | controls |
|---|---|---|---|---|---|
| 1 | [Water](1-water/index.html) | 0 errors; splats 0→70 from drag + click, 7 floating bodies bobbing, sim 256², reflection RT 384² | 14.0 / 14.4 | GPU height-field waves with planar mirror reflection, screen-space refraction, Fresnel, depth tint, foam, caustics and floaters that kick the water back | click / drag = ripples · `Space` stone · `R` rain · `Q` preset |
| 2 | [Voxel demolition](2-voxel-demolition/index.html) | 0 errors; 842 blocks, 2 shells fired, 121 shattered, 701 displaced, 706 awake, 695 chips, 700 dust, last impact 31 m/s | 19.2 / 18.4 | 842 Rapier rigid-body voxels in one instanced mesh; shells shatter blocks into chips, dust, flash and camera shake | click = charge & fire · `1-4` structure · `R` rebuild |
| 3 | [Cloth & tearing](3-cloth-tearing/index.html) | 0 errors; 2145 particles, 12402 constraints, **927 snapped** — real mouse drags on the sheet, a shift-drag slice and a scripted sustained pull — quads 1840 of 2052 | 30.0 / 30.4 | Verlet mass–spring weave with gusting wind aerodynamics; constraints keep a strain memory, so **grabbing a patch and pulling rags the sheet**, and cut edges stop being drawn | drag = grab & pull · shift-drag/`C` cut · `Space` gust · `R` re-weave |
| 4 | [GPU flocking](4-gpu-flocking/index.html) | 0 errors; 4096 boids, hawk on chase, mean speed 9.05, trails on; 16 384 boids measured at 8.8 fps | 18.4 / 17.6 | Boids live in position/velocity float textures; a pseudo-random tap set is the neighbourhood, one instanced draw reads the textures in the vertex shader | pointer = hawk · click = scatter · `H` hawk mode · `T` trails |
| 5 | [Volumetric fire](5-volumetric-fire/index.html) | 0 errors; click-stoke lifts effective intensity 1→1.96, light 148, gust 0.66, 60 march steps at 42% resolution | 6.0 / 6.0 | A raymarched fBm teardrop flame and a smoke plume lit by the fire itself, in a custom reduced-resolution composer pass, with embers, wind shear and a flickering point light | click = stoke · `Space` gust · `D` douse |

Software FPS is the whole-page rate the harness measures, so it also carries the cost of the
screenshot machinery. The in-page readout (bottom right) is what the page itself counts.

## How they look and how they move (1–5)

Self-assessed, from the kept shots (`hero.jpg`, `alt1.jpg`, `alt2.jpg` in each folder) at the
medium preset. 3 = does the job, 4 = would show someone, 5 = the reason to open the page.

| # | experiment | visuals | motion | why that number |
|---|---|---|---|---|
| 1 | water | **4** | **4** | the planar reflection, caustics and foam carry it; the sky band is a gradient, not a sky. wave fronts spread, reflect off the basin walls and the crates ride them and kick ripples back |
| 2 | voxel demolition | **4** | **5** | masonry in flat colours under a hard key light, saved by dust, chips and flash. 842 real rigid bodies topple, tumble and pile, and a hard hit collapses the wall where it is hit |
| 3 | cloth & tearing | **4** | **4** | a woven sheet that catches a low sun, flutters, rags and frays. the verlet flutter and a tear that runs along the weave read as cloth; at high stiffness it behaves as a board |
| 4 | GPU flocking | **4** | **4** | 4096 darts with heading colour, fog and an afterimage trail. the flock turns as a body, splits around the spheres and reforms behind the hawk — but the neighbourhood is sampled, so the flocking is approximate |
| 5 | volumetric fire | **5** | **3** | the flame lights itself, the plume takes the glow, bloom at dusk carries it — the best-looking page here. it flickers, rises, shears and curls in the wind, yet the flame body is a shaped teardrop: it looks alive rather than being alive |

## The shared kit — `shared/`

| file | what it gives every page |
|---|---|
| `shared/lab.js` | renderer, ACES tonemap, `EffectComposer` + bloom, perspective camera, orbit controls, fps readout, HUD rows, hint card, lil-gui panel, low/medium/high quality presets, pointer helper (ndc, drag deltas, raycast), and `lab.expose({state, api})` which publishes `window.experiment` for the headless check |
| `shared/lab.css` | full-bleed canvas, title, HUD, fps, hint, back link, compact dark lil-gui theme |
| `shared/noise.js` | GLSL chunks: 3D simplex, fBm, curl, 2D value noise — the waves, the flame, the smoke and the terrain all cut from the same cloth |

Every page exposes `window.experiment.state()` (the numbers on screen) and an `api` the harness
drives: `dropStone`, `fireAt`, `shatterAt`, `grabScreen`/`cutScreen`/`dragTo`, `setHawkMode`/
`scatter`/`setCount`, `stoke`/`gust`/`douse`. That hook is what turns "the page loaded" into
"the mechanic moved".

### Testing the mechanic, not the page load

Two checks exist because a review found a mechanic that only *looked* implemented. Both drive
**real mouse events**, the way a person does, and both exit non-zero.

```
node experiments/tools/clothtest.mjs      # 6 real-mouse yanks on the flag and on a curtain
node experiments/tools/qualitytest.mjs    # typing in the shared pixel-ratio box, on the cloth
```

`clothtest.mjs` grabs the middle of the sheet with `mouse.down`, moves in steps, **holds the
pull**, releases, and requires `torn` to rise — and runs a control: the same sheet, untouched, in
the same wind, must not tear. Last run, from a clean sheet each time:

```
flag    right 309 torn · down-left 122 · up 48        curtain  right 296 · down-left 344 · up 48
control (no interaction): torn 0 → 0
```

`qualitytest.mjs` tears the sheet, types a new pixel ratio into the shared panel and presses
Enter, and requires the tears to survive: typing a render-size number must change the render
size and nothing else. It then picks a preset from the dropdown and requires the page handler to
run (that part is the point of the preset).

## What got hard as the complexity rose

1. **GPGPU is a shader-string API.** `GPUComputationRenderer.addVariable` takes a fragment
   shader *string*, not a material; passing a material produced a validator error pointing at a
   `[` on a line that did not exist (exp 4). The kit also defines `resolution` for you — reading
   a `uResolution` of your own invents is the second way to lose an afternoon.
2. **Premultiplied volume, premultiplied blend.** The raymarch (exp 5) accumulates
   light-and-coverage, so the volume mesh must blend `ONE, ONE_MINUS_SRC_ALPHA`; with the default
   blend the alpha is applied twice and the fire is a faint smear over a campfire-sized core.
3. **A march is a per-pixel loop.** 16 m of box at 44 steps is 0.36 m per step, and a 4 m flame
   is 11 samples: blocky. The fix is a tight volume box (13 m), 60 steps and a 42% render target —
   quality is bought in the right order, and the preset has to be *applied at startup*, not only
   when the user presses it.
4. **Tearing needs memory** (exp 3). A stretch threshold snaps on transients and never snaps on a
   slow pull, because the solver relaxes the sheet every frame. Constraints accumulate strain only
   while over-stretched and decay it otherwise; and constraints attached to pins are reinforced,
   so a yank tears the body, not the anchor line.
5. **Pinning every top particle** in `top` mode: pinning one in three let the sheet peel off the
   rail and the "tear" was a fake row of holes at the hem.
6. **Waves need a stable discretisation.** The naive explicit height-field update explodes in a
   hundred frames; the leapfrog/stable variant used in exp 1 (with `h` and `dh/dt` as the two
   texture channels) runs indefinitely, and a coarse CPU copy of the same grid is what the
   floaters bob on, so bodies and water agree without the CPU touching the 256² field.
7. **A physics engine is a WASM dependency with an API that moves.** Rapier's sphere collider is
   `ColliderDesc.ball(r)`, not `.sphere(r)` (exp 2). CCD on the shells is what stops a 46 m/s
   projectile tunnelling through a 0.4 m block.
8. **Headless software rendering is the only renderer available here** (the model server holds
   both GPUs), so every heavy page needed a quality preset from the start, and the check reports
   a floor: 6 fps for a full-screen raymarch on SwiftShader is a *good* result.
9. **Tearing is measured at the end of the step, not inside the solver** (exp 3, found in review).
   The strain pass ran on the last solver iteration, and the grab spring is applied *after* the
   loop — so the stretch a pull creates was never seen, and a yank on the default settings never
   tore anything. The pass now runs once, after the hem is re-pinned and the grab has pulled. The
   grab also pinches a **patch** of cloth (`grip`, a disc of particles, each dragged at its own
   offset from the picked point) rather than one mathematical point: a point makes a needle, a
   patch loads a disc of the weave and rags it. Adjacent threads take the load a broken one was
   carrying — a small capped kick, because an uncapped one unzips the whole sheet in a single step.
10. **Per-particle arrays indexed by position offset** (exp 3, same review): `pinned[a]` and
    `dead[a]` with `a = particle * 3` read the pin flag of a *different* particle, so an arbitrary
    third of the sheet was treated as pinned. The fix is to keep the particle index next to the
    offset. It only shows up as a sheet that pulls oddly — which is exactly how it hid.
11. **A folder-level `change` listener catches every control in the folder** (`shared/lab.js`,
    same review): the quality folder listened for `change` to detect a preset pick, so committing
    the pixel-ratio number box re-ran the whole preset — and on the cloth the preset sews a new
    sheet, wiping every tear. The listener belongs on the preset `select` (`preset.domElement`),
    and the panel opens on the preset a page really starts on (`createLab({ preset: "medium" })`,
    `lab.setQuality(...)`).
12. **The harness is a tool, not a script.** `check.mjs` serves the folder over http (module
   imports and WASM need a real origin), samples fps before and after the interaction, takes
   before/after screenshots, fails on console, page and **network** errors, and reads
   `window.experiment.state()` so the evidence is numeric, not a screenshot to squint at.

## Layout

```
experiments/
  index.html          the gallery
  README.md           this file
  shared/             lab.js, lab.css, noise.js
  1-water/            index.html main.js sim.js water.js floaters.js shots/
  2-voxel-demolition/ index.html main.js voxel.js bits.js shots/
  3-cloth-tearing/    index.html main.js cloth.js shots/
  4-gpu-flocking/     index.html main.js flock.js boids.js shots/
  5-volumetric-fire/  index.html main.js volume.js shots/
  tools/              check.mjs (one page), sweep.sh (all five), summarize.mjs, syntax.mjs,
                      links.mjs (every local href/src resolves), clothtest.mjs (grab-and-tear),
                      qualitytest.mjs (the shared panel)
```

`tools/` is not published (the Pages workflow ships `experiments/` minus `tools/`).

## Pinned dependencies

```
three@0.170.0                     build/three.module.js, examples/jsm/
lil-gui@0.19.2                    dist/lil-gui.esm.js
@dimforge/rapier3d-compat@0.14.0   rapier.es.js      (exp 2)
```

Pinned by full URL in each page's importmap, so a page cannot silently start using a new three.
