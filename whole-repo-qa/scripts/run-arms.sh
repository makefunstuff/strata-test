#!/usr/bin/env bash
# Run both arms one after the other, never at once, and always leave the router up.
#   scripts/run-arms.sh [27b] [strata]       default: both, 27B first (it runs on the router that is up by day)
# Each arm resumes from its results/<label>.jsonl, so rerunning after a stop only asks what is missing.
# MemAvailable is logged every 5 s to work/logs/mem-<arm>.log; Strata's own memwatch guards the 8 GiB floor.
# Needs ROUTER_BASE_URL (27b) and STRATA_BASE_URL + STRATA_API_KEY (strata) in the environment; see run.ts.
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$HERE/work/logs"
trap 'local-ai-mode router >/dev/null || echo "WARNING: router did not come back" >&2' EXIT
memlog() { while :; do awk -v t="$(date +%T)" '/^MemAvailable:/ {printf "%s %.2f\n", t, $2 / 1048576}' /proc/meminfo; sleep 5; done; }
arms=("$@"); [ ${#arms[@]} -gt 0 ] || arms=(27b strata)
"$HERE/scripts/fetch.sh"
node "$HERE/scripts/check.ts" >/dev/null
for a in "${arms[@]}"; do
  case $a in 27b) local-ai-mode router ;; strata) local-ai-mode strata ;; *) echo "unknown arm $a" >&2; exit 2 ;; esac
  memlog > "$HERE/work/logs/mem-$a.log" & mp=$!
  node "$HERE/scripts/run.ts" --arm "$a" 2>&1 | tee -a "$HERE/work/logs/$a.log"
  kill $mp
  echo "$a: MemAvailable min $(sort -k2 -n "$HERE/work/logs/mem-$a.log" | head -1 | cut -d' ' -f2) GiB"
done
node "$HERE/scripts/report.ts" > /dev/null
