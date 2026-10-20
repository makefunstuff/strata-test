#!/usr/bin/env bash
# The run's memory watchdog: one line per second (MemAvailable, swap used, memory PSI, Strata engine RSS, VRAM per
# GPU). When MemAvailable falls under FLOOR_GIB (default 3) it stops the run: it writes logs/ABORT, kills the
# sandboxed pi containers, stops strata.service at once (that frees the engine's RAM before the host's own watchdog,
# floor 2 GiB, would start the router), writes the original config back through Ansible and starts Strata on it.
# usage: memwatch.sh LOGFILE [FLOOR_GIB]       (run in the background for the whole parallel-2 phase)
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
LOG=$1 FLOOR=${2:-3}
while :; do
  a=$(awk '/^MemAvailable:/ {printf "%.2f", $2 / 1048576}' /proc/meminfo)
  s=$(awk '/SwapTotal/{t=$2} /SwapFree/{f=$2} END{printf "%.1f", (t-f)/1048576}' /proc/meminfo)
  p=$(awk '/^some/{sub("avg10=", "", $2); print $2}' /proc/pressure/memory)
  r=$(ps -eo rss=,args= | awk '$2 ~ /\/engine\/strata$/ {s+=$1} END {printf "%.2f", s/1048576}')
  v=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | paste -sd/)
  echo "$(date +%T) avail_gib=$a swap_used_gib=$s psi_some_avg10=$p engine_rss_gib=$r vram_mib=$v" >> "$LOG"
  if awk -v a="$a" -v f="$FLOOR" 'BEGIN{exit !(a < f)}'; then
    echo "$(date +%T) WATCHDOG: MemAvailable $a GiB < $FLOOR GiB: stopping the run, restoring the original config" >> "$LOG"
    echo "$(date -Iseconds) MemAvailable $a GiB < $FLOOR GiB" > "$HERE/logs/ABORT"
    docker ps -q --filter name=strata-pi- | xargs -r docker kill >/dev/null 2>&1
    systemctl stop strata.service
    "$HERE/scripts/strata-config.sh" original --stopped >> "$LOG" 2>&1
    echo "$(date +%T) WATCHDOG: Strata back on the original config" >> "$LOG"
    exit 0
  fi
  sleep 1
done
