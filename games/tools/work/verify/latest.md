# verification (full sweep)

`node tools/verify.mjs --full` — 12 checks, 0 failed.

| check | result |
|---|---|
| 1-breakout | ok — errors=0 fps=9/8 hud_moves=true shows"SCORE" |
| 2-runner | ok — errors=0 fps=11/11 hud_moves=true shows"STATE RUNNING" |
| 3-marble-maze | ok — errors=0 fps=7.5/6.5 hud_moves=true shows"STATE ROLLING" |
| 4-tower-defense | ok — errors=0 fps=9.5/9.5 hud_moves=true shows"MONEY" |
| 5-flight | ok — errors=0 fps=22/24.5 hud_moves=true shows"STATE FLY" |
| audio 1-breakout | ok — silent_before=true peak=0.179 tail_end=4.2e-6 |
| audio 2-runner | ok — silent_before=true peak=0.392 tail_end=5.7e-7 |
| audio 3-marble-maze | ok — silent_before=true peak=0.120 tail_end=3.4e-7 |
| audio 4-tower-defense | ok — silent_before=true peak=0.377 tail_end=5.1e-7 |
| audio 5-flight | ok — silent_before=true peak=0.156 tail_end=4.5e-7 |
| rule proofs | ok — 5/5 proofs (marble goal+hole, tower wave, flight ring+crash) |
| published paths | ok — 31 refs, 0 problems |

FPS is measured under SwiftShader (software rendering: the model server holds the GPU), so
it is a floor, not the frame rate a real GPU gets. Audio numbers are peak amplitude from an
AnalyserNode: silent before the first keypress (autoplay policy), audible while playing,
and the tail must decay to silence, which is what catches feedback loops.
