# experiments

Seven three.js graphics and motion experiments, each in its own folder, all on one shared lab
kit. Plain static files: `index.html`, ES modules, CSS. No build step, no npm, no server-side
code — open `index.html` and it runs. Three.js, lil-gui and Rapier come from a pinned CDN
importmap, every internal path is relative, so the folder is GitHub-Pages-ready as it stands.

Live: **https://makefunstuff.github.io/strata-test/experiments/** · the
[gallery](index.html) is the thumbnail row, the [site hub](../index.html) also links the
[five games](../games/index.html).

## The seven, as measured

FPS is headless Chromium on SwiftShader (software — the model server on this machine holds the
GPU), so every number below is a **floor**, not what a real GPU does; the pages are written to
hold 60 fps on a desktop GPU, and each has a low/medium/high preset for the rest. "Works" is
what the headless check measured after driving the page — scripted drags, clicks and calls into
the page's own `window.experiment` hook — not what it should do. One command per experiment, written
to run from the **repo root** (the checker serves the folder above whatever path you hand it, so the
experiment directory is spelled in full):

```
node experiments/tools/check.mjs experiments/1-water --label water --wait 8 \
  --drag 0.5,0.6:0.62,0.5 --click 0.4,0.55 --eval "…"

# the cloth: a real mouse drag on the sheet, a shift-drag slice, a scripted sustained pull
node experiments/tools/check.mjs experiments/3-cloth-tearing --label cloth --wait 8 \
  --drag 0.47,0.53:0.36,-0.06:900 --drag 0.4,0.42:0.16,0.22:600:shift \
  --eval "…api.pullScreen(mid, …)…"

# the town: hide the chrome for a clean frame, orbit it, put the lights on; setSeed (not newCity) so the
# run can be repeated, and --width/--height exist so the phone layout is a checked thing (390×780 on low)
node experiments/tools/check.mjs experiments/6-medieval-diorama --label hero --wait 9 \
  --eval "window.experiment.setAutoRotate(false)" --eval "window.experiment.setChrome(false)" \
  --eval "window.experiment.setView('hero')" --eval "window.experiment.setSeed('Thornburgh')"
node experiments/tools/check.mjs experiments/6-medieval-diorama --label phone --wait 9 --width 390 --height 780 \
  --eval "window.experiment.setQuality('low')" --eval "window.experiment.setChrome(false)"

# the real city: the hour and the season, and the phone width at the height a phone actually has
# (390×844). Every one of these returns state() so the run is evidence and not just an exit code.
node experiments/tools/check.mjs experiments/7-tallinn-diorama --label hero --wait 6 \
  --eval "window.experiment.state()"
node experiments/tools/check.mjs experiments/7-tallinn-diorama --label night --wait 6 \
  --eval "(()=>{const e=window.experiment;e.setTime(1.28);e.setView('market');return e.state();})()"
node experiments/tools/check.mjs experiments/7-tallinn-diorama --label winter --wait 6 \
  --eval "(()=>{const e=window.experiment;e.setSeason('winter');e.setView('market');return e.state();})()"
node experiments/tools/check.mjs experiments/7-tallinn-diorama --label phone --wait 6 --width 390 --height 844 \
  --eval "(()=>{const e=window.experiment;e.setQuality('low');return e.state();})()"

# the overlay, driven rather than assumed: the rail opens a card and flies there, the tour starts, and
# six seconds later it has moved on its own to a second landmark with the camera following it — a card
# that never opens, or a tour that never advances, fails this run instead of looking fine in a still
node experiments/tools/check.mjs experiments/7-tallinn-diorama --label tour --wait 6 \
  --eval "(()=>{const e=window.experiment;e.setChrome(true);e.openLandmark('oleviste');return e.landmark();})()" \
  --eval "window.experiment.startTour()" \
  --eval "(()=>{const e=window.experiment;return new Promise(r=>setTimeout(()=>r({touring:e.touring(),card:e.landmark(),view:e.state().view}),6000));})()"

# and the same eighteen frames the card set is made of, in one page load, with the exposure of each
# printed (mean, spread, blown pixels) so a flat grey frame fails a review rather than passing for art
node experiments/tools/shotpack.mjs experiments/7-tallinn-diorama --spec frames.json --out shots-review
```

`bash experiments/tools/sweep.sh` runs all seven and prints one line each
(`experiments/tools/summarize.mjs` reads the JSON the checker emits). The table is the last full sweep, run on the branch after merging `origin/main` and after the
review fixes (it is the run the two tests below are quoted from). The checker writes
`<experiment>/shots/<label>-start.jpg` and `<label>-after.jpg`; the after-shot is the evidence and is
kept, the before-shot is not. `hero.jpg`, `alt1.jpg`, `alt2.jpg` are the ones the gallery shows.

| # | experiment | works? (headless, software renderer) | fps (sw) idle / after input | one line | controls |
|---|---|---|---|---|---|
| 1 | [Water](1-water/index.html) | 0 errors; splats 0→54 from drag + click, 7 floating bodies bobbing, sim 256², reflection RT 384² | 13.6 / 13.6 | GPU height-field waves with planar mirror reflection, screen-space refraction, Fresnel, depth tint, foam, caustics and floaters that kick the water back | click / drag = ripples · `Space` stone · `R` rain · `Q` preset |
| 2 | [Voxel demolition](2-voxel-demolition/index.html) | 0 errors; 842 blocks, 2 shells fired, 120 shattered, 700 displaced, 707 awake, 598 chips, 644 dust, last impact 31 m/s | 19.6 / 19.2 | 842 Rapier rigid-body voxels in one instanced mesh; shells shatter blocks into chips, dust, flash and camera shake | click = charge & fire · `1-4` structure · `R` rebuild |
| 3 | [Cloth & tearing](3-cloth-tearing/index.html) | 0 errors; 2145 particles, 12402 constraints, **974 snapped** — real mouse drags on the sheet, a shift-drag slice and a scripted sustained pull — quads 1831 of 2052 | 30.4 / 30.4 | Verlet mass–spring weave with gusting wind aerodynamics; constraints keep a strain memory, so **grabbing a patch and pulling rags the sheet**, and cut edges stop being drawn | drag = grab & pull · shift-drag/`C` cut · `Space` gust · `R` re-weave |
| 4 | [GPU flocking](4-gpu-flocking/index.html) | 0 errors; 4096 boids, hawk on chase, mean speed 9.25, trails on; 16 384 boids measured at 8.8 fps | 18.0 / 17.6 | Boids live in position/velocity float textures; a pseudo-random tap set is the neighbourhood, one instanced draw reads the textures in the vertex shader | pointer = hawk · click = scatter · `H` hawk mode · `T` trails |
| 5 | [Volumetric fire](5-volumetric-fire/index.html) | 0 errors; click-stoke lifts effective intensity 1→1.93, light 250, gust 0.64, 60 march steps at 42% resolution | 6.4 / 6.8 | A raymarched fBm teardrop flame and a smoke plume lit by the fire itself, in a custom reduced-resolution composer pass, with embers, wind shear and a flickering point light | click = stoke · `Space` gust · `D` douse |
| 6 | [Medieval city diorama](6-medieval-diorama/index.html) | 0 errors; seed `BRAMWELL` grows 37 houses, 15 streets, 235 trees, 22 smoking chimneys, 596 lit windows — 3 265 pieces / 60 042 tris in **21 draw calls**; `newCity()` `BRAMWELL`→`Thornburgh` (43 houses, 431 trees, 3 582 pieces, still 21 calls); sixteen named seeds span 32–51 houses, 14–17 streets and 213–649 trees, and the same seed twice is identical; night, six views, tilt-shift and all three quality presets driven; 390×780 clean on `low`, panel shuts itself below 640 px | 9.2 / 8.0 (12.8 / 20.4 at phone width on `low`) | A whole town from one seed — ring streets, frontage houses, a wall with gatehouses, a keep, a cathedral, a river with bridges and fields beyond — cut away to show strata and put under a tilt-shift lens, in 21 draw calls with every texture painted at load | `N` night · `C` new town · `V` view · `G` panel · drag = orbit |
| 7 | [Tallinn Old Town diorama](7-tallinn-diorama/index.html) | 0 errors at both widths; the OpenStreetMap plan bakes to **660 houses, 16 landmarks, 35 wall towers, 890 trees, 190 folk** at the default seed `TALLINN` — 11 573 pieces / 215 282 tris in **43 draw calls** (`setSeed('tallinn')` in the sweep: 860 trees, 11 482 pieces, still 43 calls); `setSeed('tallinn')` twice is the same town, and re-seeding only re-furnishes it (the streets and footprints stay the real ones); eleven views, day hours, winter, tilt-shift, all three quality presets and the tour driven; 390×844 clean on `low` with the panel shut (60 folk, 8 405 pieces); one close-up per landmark under `shots/landmarks/` (16 frames, one page load, each with its exposure printed) | 3.6 / 4.0 (5.6 / 8.0 at phone width on `low`) | One real city rather than a generated one: the street plan, the building footprints and the town wall come from OpenStreetMap, the sixteen landmarks are modelled by hand where they actually stand, and the December market, the hearth smoke and the bay are the moving layer | `N` night · `C` snow · `V` view · `G` panel · drag = orbit · tap a landmark, or ▶ for the tour |

Software FPS is the whole-page rate the harness measures, so it also carries the cost of the
screenshot machinery. The in-page readout (bottom right) is what the page itself counts.

## How they look and how they move (1–7)

Self-assessed, from the kept shots (`hero.jpg`, `alt1.jpg`, `alt2.jpg` in each folder) at the
medium preset. 3 = does the job, 4 = would show someone, 5 = the reason to open the page.

| # | experiment | visuals | motion | why that number |
|---|---|---|---|---|
| 1 | water | **4** | **4** | the planar reflection, caustics and foam carry it; the sky band is a gradient, not a sky. wave fronts spread, reflect off the basin walls and the crates ride them and kick ripples back |
| 2 | voxel demolition | **4** | **5** | masonry in flat colours under a hard key light, saved by dust, chips and flash. 842 real rigid bodies topple, tumble and pile, and a hard hit collapses the wall where it is hit |
| 3 | cloth & tearing | **4** | **4** | a woven sheet that catches a low sun, flutters, rags and frays. the verlet flutter and a tear that runs along the weave read as cloth; at high stiffness it behaves as a board |
| 4 | GPU flocking | **4** | **4** | 4096 darts with heading colour, fog and an afterimage trail. the flock turns as a body, splits around the spheres and reforms behind the hawk — but the neighbourhood is sampled, so the flocking is approximate |
| 5 | volumetric fire | **5** | **3** | the flame lights itself, the plume takes the glow, bloom at dusk carries it — the best-looking page here. it flickers, rises, shears and curls in the wind, yet the flame body is a shaped teardrop: it looks alive rather than being alive |
| 6 | medieval city diorama | **4** | **3** | the cut-away strata, the tilt-shift rim and 40-odd houses with real window plans do the work; the folk are small and the fields are painted, not grown. lanterns come on at night, smoke leans off the wind, banners flap and the folk walk the lanes — but the town itself is static, which is what a model of a town is |
| 7 | Tallinn Old Town diorama | **4** | **3** | it is *Tallinn*: the plan, the footprints and the wall are the city's own, and the sixteen landmarks stand where they do, which no generated town can claim; the roofscape is busy, and the modern city beyond the wall is still a few grey blocks on a green field. the bay heaves, the hearths smoke, the folk and the carts use the streets, the flags take the wind and the December market lights up at night — and, like any model of a town, the town itself stands still |

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
flag     right 276 torn · down-left 134 · up 48         curtain  right 272 · down-left 352 · up 48
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
   It gained `--width`/`--height` for the diorama, so the phone layout is a checked thing.

## 6 · The diorama: what the screenshots caught

A town is the first page here where "no console errors" says nothing about whether it *works* — a
scene can render perfectly and look like a crime scene, a board game or a field of cotton wool. Every
entry below is a defect found by looking at a rendered frame, most of them invisible to any assertion.

| what the frame showed | the real cause | what changed |
|---|---|---|
| every tree was **white** | `setColorAt(…, t.tint2 ?? 0xffffff)` — `tint2` is a *texture-palette* field, undefined on trees, so the fallback won every time. The per-kind leaf colours were computed and thrown away | colour comes from the tree kind (oak / pine / willow / orchard), `0xffffff` only as a last resort |
| the cut-away earth was **solid black** | the strata texture's `v` mapping put the plain dark base band over the whole cliff, and a downward face in a hemisphere-plus-sun rig gets almost nothing to reflect | the side band gets its own `v` range in `earthSide`, and the material carries the same map as an emissive term (0.26) so the strata read in shadow |
| the stones in the strata were **pink and mint confetti** | 90 discs of pale grey, each lifted into the desaturated end of the tone-mapper by the emissive term | 46 small, dark discs; roots 26 → 8 at a third of the alpha |
| hearth smoke was **cotton wool** | 26 points per chimney at 22 px, alpha 0.5, unseeded — three identical puffs per roof | 22 points, 12 px, alpha 0.5 with a seeded per-particle life and phase; plumes lean off the wind and thin out |
| the walls were a **garden wall** | 6.4 m high, 1.65 m thick, towers at r 1.9 — under-scaled against 7 m houses | 8.6 m curtain, 2.9 m thick, towers r 2.6 with 1.05 m merlons, a walk, a railed hoarding and a banner each |
| hedges were **green gravel** | the hedge was a row of upright boxes lit flat, at leaf brightness | a thin ribbon near ground level, darker, with a soft shadow stroke painted into the ground canvas under it |
| the whole frame was **washed to pastel** | the tilt-shift band started at 0.5 of the frame with blur 3 and a 58% saturation boost, so most of the town was half-blurred and over-cooked | band from 0.34, focus 0.5, blur 1.5, saturation +20%, and the pass runs *before* tone mapping so the highlights survive |
| the town was **sparse, and houses floated** | the occupancy grid refused neighbours too eagerly and `emptyChance` skipped 20% of lots; a house sat on `groundY` computed once for its centre while its corners differed by up to half a metre | skip chance 0.12, frontage packed at 0.82–1.0, a back toft behind every frontage house, a scatter pass of infill houses (≈43 per town, up from 26); the ground canvas paints a contact shadow under each footprint |
| the **wall had holes in it** | a gate deleted the whole curtain stretch on *both* sides of its vertex: three gates meant six 19 m gaps in a 364 m circuit | the curtain is built in 4 m segments and only segments inside a gatehouse's own width are skipped, so the circuit is never broken |
| **folk walked off the edge of the world** | walker paths were taken from raw street polylines, and two roads run outside the wall to the river | paths are filtered to 0.94 of the chunk outline, walkers to paths > 12 m, carts to paths > 30 m |
| windows were **glowing decals** | an additive quad *was* the window, so a lit room had no frame and the glass never looked set into the wall | windows are built: a timber surround, cross mullions and a recessed dark pane from the same plan the layout recorded; the additive quad is only the night glow, and it is hidden by day |
| the fields were a **green carpet** | one flat fill with a few darker patches | eight field tones by kind (tilled, stubble, pasture, fallow, legume), plough furrows stroked along each field's long axis, a hedge and a bush cluster on the boundary, and the rim of the chunk graded to bare soil |
| trees were **white-green lollipops** | too few, too regular, and the crown was one cone | 213–649 per town depending on seed, oaks with a three-blob crown and a flared trunk, pines as stacked cones, pollards, willows, orchard trees, bush and reed instanced kinds, all placed with jitter and rejected off roads, water and lots |
| the river **was not there at all** | the hand-built ribbon was wound face-down, so with the default `FrontSide` the whole water surface was culled — the "river" in every early shot was the painted riverbed on the ground | `side: DoubleSide`, which also means the river is still there when the chunk is seen from below |
| everything painted on the ground was **mirrored in z** | a CanvasTexture is uploaded flipped, and the painter mapped canvas *y* to +*z* like the mesh UVs: invisible for a ring road and a market square, brutal for a river, a castle compound and a contact shadow (this one hid for a very long time — the town looks plausible either way) | `S()` negates the *z* term, so the brush lands where the mesh's UV says it should |
| the water was **one flat tile per segment**, then a set of zebra stripes | every vertex of a quad shared the same along-stream `u`, so a segment could only ever be one flat colour; fixing that without retuning put the wave trains near the segment rate and they aliased into stripes | `u` advances across the quad (0.35 per segment), wave trains re-tuned against that rate, specular exponent and amplitude brought down |
| the river **hung in the air**, then **flooded the fields**, then **pinched into pools** | three different datums: the bed came from a profile smoothed along the stream, the banks from the raw terrain, the width from a fraction of a nominal river width. Any rule about "where the water should be" was a guess that one seed would break | one cross-section per seed, in metres: a flat bed `riverBed` out from the centreline, a wall rising *exactly* `riverDepth` to the fields at `riverWall`, both cut below the local ground (`naturalTerrain`), and the surface at 0.28 of the depth under the fields. The water is then a constant width that tucks under the wall — checked numerically (edge gap within ~1 m on eight seeds), not by eye |
| the bridge **lay along the river like a drowned plank** | it was oriented by the *road*, so an oblique crossing put the deck parallel to the current; and it was built where any road came near the water, including riverside roads — those became stone slabs sitting in fields | a crossing has to have its centre in the water and go across the flow; the deck is built square to the current (parapets upstream and downstream, piers in the bed, cutwaters under them), and the span comes from the channel's own cross-section |

The frames above, as taken (`hero.jpg`, `alt1.jpg`–`alt3.jpg` are the ones the gallery shows):
[the whole chunk from above](6-medieval-diorama/shots/bird.jpg) ·
[the bridge square to the current](6-medieval-diorama/shots/bridge.jpg) ·
[the cut-away strata](6-medieval-diorama/shots/strata.jpg) ·
[390×780 on the low preset](6-medieval-diorama/shots/phone.jpg)

The ranges above are sixteen seeds run through `generateCity`, houses/trees, so they can be repeated:
`BRAMWELL` 37/235 · `Thornburgh` 43/431 · `Lindale67` 46/213 · `Marshgate` 35/500 · `Camelot` 46/456 ·
`Ironbridge` 41/311 · `Whitwick` 47/312 · `Egremont` 41/501 · `Ashholt` 43/534 · `Lowton` 44/521 ·
`Marshridge13` 32/315 · `Harhaven89` 41/506 · `Crawport` 46/483 · `Linridge49` 39/649 ·
`Whithaven92` 51/253 · `Fenwick` 41/445 — 32–51 houses, 14–17 streets, 213–649 trees, 1–2 bridges.

Two things worth keeping from the build side:

- **Merging is not optional at this size.** 3 265 pieces of geometry (seed `BRAMWELL`) go down as 21 draw calls through
  the `Batch` helper (bucket by material key, merge, one mesh each). Without it the town is a
  3 500-draw-call page that no phone survives. Trees, folk, carts, birds, banners and lit windows are
  instanced on top of that, and the smoke is one `Points` draw for every chimney in the town.
- **A seed has to reach everything.** Terrain, the ground canvas (1024², 1536² or 2048² with the quality preset), every painted texture, tree
  scatter and folk are all fed from one `Rng`; the same seed string therefore produces the same town
  down to the last window, which is what makes `?seed=`, **C** and the URL shareable rather than cute.


## 7 · Tallinn: what the frames and the plan caught

Same rule as the diorama above: a page with no console errors can still be wrong. This one added a
second class of defect, because the geometry now comes from OpenStreetMap — a mistake in the bake or in
reading the plan is invisible in the code and obvious in the frame.

| what the frame (or the plan) showed | the real cause | what changed |
|---|---|---|
| **the whole frame went solid black**, from the two most distant cameras only | one fragment somewhere in the scene was NaN/Inf, and `UnrealBloomPass` blurs: a mip chain smeared that one pixel over the screen. It survived `strength = 0`, because 0 × NaN is NaN, which is how it was traced — disabling the pass made the frame reappear, and hiding any one of several meshes "fixed" it by chance, since those meshes happened to cover the bad pixel | the bright pass in `shared/lab.js` clamps what it reads (`min(texel, vec4(6.0))`), far above any sunlit surface, so a firefly becomes a bright pixel instead of a black screen. It also rebuilds the pass on a real resize, whose `setSize` path can leave the composited frame black |
| the land was a **black disc** with the town standing on it | the ground mesh was built straight from `polarGrid` with `mat()`, which always sets `vertexColors: true` — and `polarGrid` has no colour attribute, so the unbound attribute gave black. It also mapped one grass tile across 1.9 km | the land is painted per vertex (grass, escarpment scree, shore sand, plateau lawn) and its UVs are rescaled to a tile every 13 m, in `paintLand` |
| the trees were **pale bubbles** | instance colours were `setRGB(0.6…1.0)`, numbers that look right in sRGB and are nearly white in the working (linear) space | colours come from hexes through `convertSRGBToLinear()`, like every other colour here |
| hearth smoke was **soap bubbles** | the puff texture was a radial gradient with a solid core | a soot gradient with no core, bigger points, less alpha |
| the Old Town was a **village in a field** — grass between the houses | only the road ribbons were paved; the yards and the gaps between 660 footprints were the landscape | `townFloor` clips a 13 m paving grid to the wall polygon, following the terrain corner by corner, so the town has a floor and the fields stay outside the wall |
| the streets were **not there at all**, and the cobbles silently vanished | `osm.js` stores each street as `p: [[x,z],…]` pairs and `layout.js` walked it as a flat array — every road came out NaN, and a NaN geometry draws nothing without complaining | `STREETS_PTS` unpacks the pairs once, and the NaN scan in the harness is what proved it |
| houses were **five-storey blocks among cottages** | OSM `levels` is a wish as often as a measurement | Old Town houses are clamped to 2–4 storeys (3 on the hill); the fringe keeps its 3–9 |
| the roofs were **hedgehogs** | a dormer every 5.4 m, 60% kept, each 1.8 × 1.6 with its own gable | one every 9 m with 55% dropped, at 1.45 × 1.15, and the roof overhang cut from 0.42 m to 0.26 m |
| facades were **a wall of dark tiles** | the plaster canvases painted their own windows *and* the 3D sashes were laid over them: two window grids that never agreed | the bays are plain plaster — the sashes *are* the windows, which is also what lights the town at night |
| the **Town Hall was salmon** | it was built with the `pink` house material | lime-washed ashlar with red tile, as it stands |
| the night market was **one orange wash** | the square's lamp glow was a single additive plane 0.7 of the square's width lying on the cobbles; from lamp-post height it filled the frame | capped at 18 m and at 0.52 opacity, and the lantern halos came down a third |
| a named view **put the camera under the cobbles** | the Lower Town falls 22 m from the wall to the quay, so a view written with one height is above ground on one street and under it on the next | `setView` lifts any view below `ground(x, z) + 2.6` — no view can bury itself |
| a second named view **buried itself in a gable**: the December market came out flat grey with the square in one corner | the market view stood where a large merchant house is; being above the ground is not the same as being able to see the target | `setView` now raycasts camera→target and lifts the camera until the line of sight is clear, ignoring folk, birds, smoke and glow (those would lift the camera for no reason) |
| the sky grew a **pale dome on top of the town**, from the two distant views only | `skyDome`'s gradient is a function of *world* direction: pinned to the origin, its horizon band cut through the middle of the diorama once the camera pulled 1.5 km out | the dome hangs on the camera (`sky.mesh.position.copy(camera.position)` each frame) and draws as a backdrop with `renderOrder = -1` and `depthTest = false` |
| the **cut-away strata was black** — the one thing an earth chunk exists to show | the tapered side leans its normals 48° below the horizon: the sun at 45° gave it nothing and the hemisphere handed it only the dark ground colour | the taper came in (`baseScale` 0.7 → 0.93, so the face is near-vertical) and the strata material carries a dim emissive floor, so the beds read whatever the sun is doing |
| the bay was a **white shell behind the town** | the sea is a `ShaderMaterial`, so it never got the scene fog: it kept its own colour to the horizon while the land hazed out, and read as a dome of concrete | the sea mixes to the fog colour over the camera's own fog range (`setFog`), and its reflected "sky" is a cooled, darkened horizon rather than the horizon |
| **11 000 smoke points** for 660 houses | `chimneys × 16` with no budget, and the quality presets never touched it | the presets budget the plumes (70 × 6 / 180 × 10 / 400 × 14) and take every *n*th chimney, so the smoke stays spread over the whole town instead of clustering on what was built first |
| the modern city was a **business park** — grey slabs on grass, all the way round | the bake keeps every large non-medieval footprint, and 64 were placed wherever they fell, including the foreground of the hero shot | the fringe is a hint: past 620 m, in the east/south sector where the real city actually is, at most 48 blocks, seven storeys, hazed down |
| the birdseye was a **smear** | two causes: the fog band was a property of the day (950–2700 m) while the camera was 900 m up, and a screen-space tilt-shift blurs a top-down view everywhere, because a map has no depth left to fake | the fog band travels with the camera distance, and the miniature blur is damped by how steeply the camera looks down |
| December had **green fields** round a snow-covered town | only the roofs had a winter snapshot; the land's colour is a vertex attribute painted at build time, and a material `color` cannot unsaturate green away | `snowGround` swaps the ground's colour array for a snow one (thin on the scarps, so the limestone still reads as rock) and swaps it back in summer |
| every daytime frame was **white at the horizon** | dome glow, fog and bloom were all pale at once, and the default hour put the sun at 41° | the day keys rise to 55°, the sky top deepens, the dome glow drops to 0.18 and the haze goes blue |

### How Strata FP4 did on it, in short

The parts with a right answer went well: the Overpass bake, the coordinate convention, the reuse of
ST-3's `Batch`/`Rng`/`geo` kit, and the fix list — 660 houses on their real footprints, 43 draw calls,
0 console errors at both widths, first time the page was asked to run. The hard parts were the ones with
no assertion to lean on. Roughly two thirds of the hour-by-hour work was looking at a rendered frame and
recognising that a roofscape looks like a hedgehog, that a square is a green field, or that the Town Hall
is salmon: nothing in the page complains about any of those, and each took a round of shots to find and
another to confirm. The single best hour was the black-frame hunt, where the method (hide one thing, then
one pass at a time) is what a model can do steadily and a human usually stops doing; the two worst were
both the same mistake — a hand-kept camera framing that stood inside a neighbouring gable.

What it cost: the CDN was unreachable from this machine for the last part of the task, so visual
iteration ran on a local three build (0.186) while the page ships pinned 0.170. Everything here was
measured that way, and the shared bloom fix is the kind of thing that only shows up against a specific
version. The honest summary is that the model finishes work like this and finds real defects, but its
first answer for "what does this look like" is usually wrong until it is made to look.

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
  6-medieval-diorama/ index.html main.js rng.js textures.js geo.js layout.js build.js life.js
                      tiltshift.js shots/
  7-tallinn-diorama/  index.html main.js osm.js terrain.js layout.js textures.js build.js life.js
                      ui.js ui.css shots/ shots/landmarks/ (one close-up per landmark)
                      (imports rng.js, geo.js and tiltshift.js from 6-, and shared/lab.js)
  tools/              check.mjs (one page), sweep.sh (all seven), summarize.mjs, syntax.mjs,
                      links.mjs (every local href/src resolves), clothtest.mjs (grab-and-tear),
                      qualitytest.mjs (the shared panel), bake-tallinn.mjs (Overpass JSON → osm.js),
                      planview.mjs (the plan as an SVG top-down, to check a bake by eye),
                      shotpack.mjs (one page load, many framed shots from a spec, with per-frame
                      exposure statistics — the visual-review loop for a big scene)
```

`tools/` is not published (the Pages workflow ships `experiments/` minus `tools/`).

## Pinned dependencies

```
three@0.170.0                     build/three.module.js, examples/jsm/
lil-gui@0.19.2                    dist/lil-gui.esm.js
@dimforge/rapier3d-compat@0.14.0   rapier.es.js      (exp 2)
```

Pinned by full URL in each page's importmap, so a page cannot silently start using a new three.
