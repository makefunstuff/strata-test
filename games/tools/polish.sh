#!/usr/bin/env bash
# Screenshot sweep for the polish pass: start, mid-play and game over for each game, plus fps
# and console errors, into games/<game>/shots/<tag>-{start,play,over}.png.
#
#   tools/polish.sh <tag> [game...]        tag: "before", "after-r1", … (empty = current state)
#   PHONE=1 tools/polish.sh <tag> …        the same sweep in phone emulation (portrait 390x844,
#                                          touch, DPR 2, one tap mid-screen): shots are tagged
#                                          phone-<tag>, so desktop and phone sit side by side.
#
# The end screen is reached through each game's own end verb on window.arcade (see OVERS),
# so what is shot is the real game-over state, not a staged one. Input sequences are the
# ones tools/shoot.sh uses, so the mid-play frame is comparable across rounds.
# Results: games/tools/work/polish/<game>.<tag>.json
set -uo pipefail
G=$(cd "$(dirname "$0")/.." && pwd)
tag=${1:?usage: tools/polish.sh <tag> [game...]}; shift
games=("$@"); [ ${#games[@]} -gt 0 ] || games=(1-breakout 2-runner 3-marble-maze 4-tower-defense 5-flight)

# keyboard: the same sequences shoot.sh uses
declare -A input=(
  [1-breakout]='--keys Space:100,ArrowLeft:700,ArrowRight:1200,Space:120,wait:1500'
  [2-runner]='--keys Space:100,wait:1500,ArrowLeft:120,wait:800,ArrowUp:120,wait:800,ArrowRight:120'
  [3-marble-maze]='--keys ArrowRight:1500,ArrowDown:1500,wait:1000'
  [4-tower-defense]='--click 0.42,0.45;0.5,0.5;0.58,0.55;0.46,0.6 --keys n:100,wait:5000'
  [5-flight]='--keys ArrowLeft:500,ArrowRight:400,Shift:1200,wait:900'
)
# the game's own end-state verb, run through window.arcade
declare -A over=(
  [1-breakout]='window.arcade.over()'
  [2-runner]='window.arcade.crash()'
  [3-marble-maze]='window.arcade.warp("H")'
  [4-tower-defense]='window.arcade.over()'
  [5-flight]='window.arcade.fly.pos.y = 0.2'
)
declare -A overwait=(
  [1-breakout]=1.2 [2-runner]=1.4 [3-marble-maze]=2.2 [4-tower-defense]=1.2 [5-flight]=1.6
)
mkdir -p "$G/tools/work/polish"
extra=()
tagp="$tag"
if [ "${PHONE:-0}" = "1" ]; then extra=(--phone --tap 0.5,0.72); tagp="phone-$tag"; fi
for g in "${games[@]}"; do
  shots="$G/$g/shots"
  mkdir -p "$shots"
  node "$G/tools/smoke.ts" "$G/$g" --wait 4 --out "$shots/$tagp" \
    ${input[$g]} "${extra[@]}" --jpeg --overjs "${over[$g]}" --overwait "${overwait[$g]}" \
    > "$G/tools/work/polish/$g.$tagp.json"
  rc=$?
  node -e 'const r=require(process.argv[1]);
    const bad=(r.errors||[]).filter(e=>!/favicon/.test(e));
    console.log(process.argv[2].padEnd(16), "rc", String(process.argv[3]).padEnd(3),
      "fps", String(r.fps_idle).padStart(5)+"/"+String(r.fps_play).padStart(5)+"/"+String(r.fps_over).padStart(5),
      "errors", bad.length, "|", (r.text_after||"").slice(0,58), "=>", (r.text_over||"").slice(0,50));
    if (bad.length) console.log("   ", bad.slice(0,3).join(" | ").slice(0,300));' \
    "$G/tools/work/polish/$g.$tagp.json" "$g/$tagp" "$rc"
done
