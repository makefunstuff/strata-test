#!/usr/bin/env bash
# The whole experiment, one phase per call (in this order):
#   run.sh baseline    original config (one request at a time), Strata restarted fresh: raw streams 1 and 2, then the ticket pairs one
#                      after another, ROUNDS times
#   run.sh parallel2   memwatch.sh (3 GiB floor) for the phase; parallel-2 config through Ansible; the engine's slot
#                      lines from its log; raw streams 1 and 2; the same ticket pairs, both tickets of a pair at once
#   run.sh restore     original config through Ansible, checked against the copy saved before, Strata answering
# Needs HOMELAB_DIR, STRATA_BASE_URL, STRATA_API_KEY (README). Results in results/, pi event logs in sessions/,
# watchdog and Ansible logs in logs/ (gitignored).
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
S=$HERE/scripts
ROUNDS=${ROUNDS:-2}
PAIRS=("cli-json logstats" "config-rename presets-ini")
MODEL=$(curl -s -H "Authorization: Bearer $STRATA_API_KEY" "$STRATA_BASE_URL/models" | jq -r '.data[0].id')
CONFIG=$(systemctl show strata.service -p ExecStart --value | grep -o -- '--config [^ ;]*' | cut -d' ' -f2)
mkdir -p "$HERE/logs" "$HERE/results"
aborted() { [ -e "$HERE/logs/ABORT" ] && { echo "ABORTED: $(cat "$HERE/logs/ABORT")"; exit 3; }; return 0; }
# On exit: stop the watchdog, unless it fired: then wait for it to put the original config back and start Strata
# (killing it there left strata.json on parallel 2 with Strata stopped, the first time).
stop_watch() {
  if [ -e "$HERE/logs/ABORT" ]; then wait "$WD" 2>/dev/null || true; else kill "$WD" 2>/dev/null || true; fi
  "$S/sandbox.sh" down
}

tickets() {  # tickets seq|par LABEL
  "$S/sandbox.sh" up
  for r in $(seq "$ROUNDS"); do
    for p in "${PAIRS[@]}"; do aborted; node "$S/pi-tickets.ts" "$1" "$2-r$r" "$MODEL" $p; done
  done
  "$S/sandbox.sh" down
}

case ${1:-} in
  baseline)
    [ -e "$HERE/logs/original.json" ] || cp "$CONFIG" "$HERE/logs/original.json"
    jq -e 'has("parallel") | not' "$CONFIG" >/dev/null || { echo "strata.json already has \"parallel\""; exit 1; }
    rm -f "$HERE/logs/ABORT"
    "$S/memwatch.sh" "$HERE/logs/memwatch-original.log" 3 & WD=$!
    trap stop_watch EXIT
    # a fresh engine, as the parallel-2 phase gets (the template is unchanged, so Ansible restarts nothing)
    systemctl restart strata.service
    "$S/strata-config.sh" original
    node "$S/raw-streams.ts" original 1 3
    node "$S/raw-streams.ts" original 2 3
    tickets seq original ;;
  parallel2)
    [ -e "$HERE/logs/original.json" ] || cp "$CONFIG" "$HERE/logs/original.json"
    rm -f "$HERE/logs/ABORT"
    "$S/memwatch.sh" "$HERE/logs/memwatch-parallel2.log" 3 & WD=$!
    trap stop_watch EXIT
    LOG=$(jq -r .log "$CONFIG"); FROM=$(($(wc -l < "$LOG") + 1))
    "$S/strata-config.sh" parallel2
    # what the engine says about the slots it carved (VRAM per slot, slot drafters, batch groups, memory guard)
    tail -n +"$FROM" "$LOG" | grep -E -- '--batch|batch_slots|batch-groups|slot drafters|slot sessions|memory guard|VRAM free with everything|expert cache [0-9]+ slots|KV streaming: [0-9]+ of|parallel' \
      | sed -E 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/<host>/g' > "$HERE/results/engine-parallel2.log" || true
    aborted; node "$S/raw-streams.ts" parallel2 1 3
    aborted; node "$S/raw-streams.ts" parallel2 2 3
    tickets par parallel2 ;;
  restore)
    "$S/strata-config.sh" original
    cmp "$CONFIG" "$HERE/logs/original.json" && echo "strata.json is the original again" ;;
  *) echo "usage: run.sh baseline|parallel2|restore"; exit 2 ;;
esac
