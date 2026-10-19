#!/usr/bin/env bash
# Smoke-test every game (or the ones named) with its own input and save screenshots to games/screenshots/.
#   tools/shoot.sh [base-url] [game...]     base-url: test a deployed copy instead of the local folders
# Results (errors, fps, page text before/after input) go to games/tools/work/shoot/<game>.json.
# SMOKE_GPU=1 renders on the GPU (use it when Strata is not holding the VRAM) for a real frame rate.
set -uo pipefail
G=$(cd "$(dirname "$0")/.." && pwd)
base=""; [[ ${1:-} == http* ]] && { base=$1; shift; }
games=("$@"); [ ${#games[@]} -gt 0 ] || games=(1-breakout 2-runner 3-marble-maze 4-tower-defense 5-flight)
declare -A input=(
  [1-breakout]='--keys Space:100,ArrowLeft:700,ArrowRight:1200,wait:1500'
  [2-runner]='--keys Space:100,wait:1500,ArrowLeft:120,wait:800,ArrowUp:120,wait:800,ArrowRight:120,wait:800,ArrowRight:120'
  [3-marble-maze]='--keys ArrowRight:1500,ArrowDown:1500,wait:1000'
  [4-tower-defense]='--click 0.42,0.45;0.5,0.5;0.58,0.55;0.46,0.6 --keys n:100,wait:5000'
  [5-flight]='--keys ArrowLeft:500,ArrowRight:400,Shift:1200,wait:900'
)
mkdir -p "$G/screenshots" "$G/tools/work/shoot"
tag=${SHOOT_TAG:-}
for g in "${games[@]}"; do
  target=${base:+$base$g/}; target=${target:-$G/$g}
  # shellcheck disable=SC2086
  node "$G/tools/smoke.ts" "$target" --wait 5 --out "$G/screenshots/$g$tag" ${input[$g]} > "$G/tools/work/shoot/$g$tag.json"
  rc=$?
  node -e 'const r=require(process.argv[1]); console.log(process.argv[2].padEnd(16), "rc", process.argv[3], "fps", r.fps_idle, "/", r.fps_play, "errors", r.errors.length, "|", r.text_before.slice(0,70), "=>", r.text_after.slice(0,70))' "$G/tools/work/shoot/$g$tag.json" "$g" "$rc"
done
