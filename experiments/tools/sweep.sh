#!/usr/bin/env bash
# TST-6 sweep: run the headless check for every experiment with the final code, one summary line each.
# Software rendering (SwiftShader) on this machine, so FPS is a floor, not the real-GPU number.
# Usage: bash experiments/tools/sweep.sh
set -u
cd "$(dirname "$0")/.." || exit 1
run() { # label  dir  extra-args...
  local label="$1" dir="$2"; shift 2
  SMOKE_MEM_HIGH=220M CHECK_MAX_MS=175000 timeout 180 node tools/check.mjs "$dir" --label "$label" --wait 8 "$@" \
    > "/tmp/tst6-$label.json" 2>"/tmp/tst6-$label.err"
  node tools/summarize.mjs "$label" "$dir" "/tmp/tst6-$label.json"
}
run water   1-water             --drag 0.5,0.6:0.62,0.5 --click 0.4,0.55 --eval "async()=>{const e=window.experiment;e.lab.gui.close();e.api.dropStone(0.1);return 1;}"
run vox     2-voxel-demolition  --eval "async()=>{const e=window.experiment;e.lab.gui.close();e.api.fireAt({x:0,y:2.5,z:4});await new Promise(r=>setTimeout(r,1500));e.api.fireAt({x:-1.5,y:5,z:3});e.api.shatterAt({x:2,y:6,z:2},3.5);return 1;}"
# the cloth gets a REAL mouse drag on the sheet (the advertised mechanic is grab-and-pull), then a
# Shift-drag through the sheet (the cut tool), then a scripted sustained pull spread over frames
run cloth   3-cloth-tearing     --drag 0.47,0.53:0.36,-0.06:900 --drag 0.4,0.42:0.16,0.22:600:shift --eval "async()=>{const e=window.experiment;e.lab.gui.close();e.api.gust(1.6);await new Promise(r=>setTimeout(r,600));const m=e.api.mid();return JSON.stringify(await e.api.pullScreen(m[0],m[1],-0.3,0.12,16,12));}"
run flock   4-gpu-flocking      --click 0.4,0.5 --eval "async()=>{const e=window.experiment;e.lab.gui.close();e.api.setHawkMode('chase');e.api.scatter();return 1;}"
run fire    5-volumetric-fire   --click 0.5,0.6 --eval "async()=>{const e=window.experiment;e.lab.gui.close();e.api.stoke(0.9);e.api.gust(0.8,0.3);return 1;}"
# the town: orbit it, grow a new town from a new seed, then put the lights on
run diorama 6-medieval-diorama  --drag 0.5,0.5:0.62,0.42:700 --eval "async()=>{const e=window.experiment;e.setChrome(false);e.setAutoRotate(false);e.setView('hero');const before=e.state().seed;e.newCity();await new Promise(r=>setTimeout(r,1500));e.setNight(1);return JSON.stringify({before,after:e.state()});}"
