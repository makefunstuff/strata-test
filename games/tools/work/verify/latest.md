# verification (quick sweep)

`node tools/verify.mjs` — 5 checks, 0 failed.

| check | result |
|---|---|
| 1-breakout | ok — errors=0 fps=9/8.5 hud_moves=true shows"SCORE" |
| 2-runner | ok — errors=0 fps=10.5/10.5 hud_moves=true shows"STATE RUNNING" |
| 3-marble-maze | ok — errors=0 fps=7.5/6.5 hud_moves=true shows"STATE ROLLING" |
| 4-tower-defense | ok — errors=0 fps=10/10 hud_moves=true shows"MONEY" |
| 5-flight | ok — errors=0 fps=25.5/22 hud_moves=true shows"STATE FLY" |

FPS is measured under SwiftShader (software rendering: the model server holds the GPU), so
it is a floor, not the frame rate a real GPU gets. Audio numbers are peak amplitude from an
AnalyserNode: silent before the first keypress (autoplay policy), audible while playing,
and the tail must decay to silence, which is what catches feedback loops.
