#!/usr/bin/env bash
# Put strata.service on the parallel-2 config or back on the original, through homelab's Ansible role
# (playbooks/configure-strata.yml), then wait until Strata answers a one-token request.
#   strata-config.sh parallel2     template with ansible/parallel2.yml laid over the live strata.json; the role's
#                                  handler restarts strata.service (try-restart)
#   strata-config.sh original      template with no overrides (byte-identical to the original); restart
#   strata-config.sh original --stopped
#                                  the watchdog's path: Strata was stopped first to free the memory at once, so write
#                                  the original config without a restart, then start strata.service
# Needs HOMELAB_DIR (the homelab checkout, with ansible/strata-config-overrides.patch applied), STRATA_BASE_URL and
# STRATA_API_KEY. Appends {"config", "load_s", ...} to results/load.jsonl and copies the live config to
# results/strata-<config>.json.
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
: "${HOMELAB_DIR:?set HOMELAB_DIR to the homelab checkout}" "${STRATA_BASE_URL:?}" "${STRATA_API_KEY:?}"
WHICH=${1:?usage: strata-config.sh parallel2|original [--stopped]}
CONFIG=$(systemctl show strata.service -p ExecStart --value | grep -o -- '--config [^ ;]*' | cut -d' ' -f2)
mkdir -p "$HERE/logs" "$HERE/results"

extra=()
case $WHICH in
  parallel2) extra=(-e "@$HERE/ansible/parallel2.yml") ;;
  original) ;;
  *) echo "unknown config $WHICH" >&2; exit 2 ;;
esac
[ "${2:-}" = --stopped ] && extra+=(-e local_ai_strata_restart=false)

T0=$EPOCHREALTIME
(cd "$HOMELAB_DIR" && .venv/bin/ansible-playbook playbooks/configure-strata.yml -c local "${extra[@]}") \
  > "$HERE/logs/ansible-$WHICH-$(date +%H%M%S).log" 2>&1
[ "${2:-}" = --stopped ] && systemctl start strata.service
cp "$CONFIG" "$HERE/results/strata-$WHICH.json"

# /v1/models answers before the engine is loaded; wait until a one-token request goes through
until curl -s -m 600 "$STRATA_BASE_URL/chat/completions" -H "Authorization: Bearer $STRATA_API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{"messages":[{"role":"user","content":"hi"}],"max_tokens":1,"chat_template_kwargs":{"enable_thinking":false}}' \
      2>/dev/null | grep -q choices; do
  systemctl is-active --quiet strata.service || { echo "strata.service is not running" >&2; exit 1; }
  sleep 2
done
LOAD=$(awk -v a="$T0" -v b="$EPOCHREALTIME" 'BEGIN{printf "%.1f", b-a}')
SERVING=$(curl -s -H "Authorization: Bearer $STRATA_API_KEY" "${STRATA_BASE_URL%/v1}/v1/status" | jq -c .concurrency)
AVAIL=$(awk '/^MemAvailable:/ {printf "%.2f", $2 / 1048576}' /proc/meminfo)
echo "{\"config\": \"$WHICH\", \"time\": \"$(date -Iseconds)\", \"load_s\": $LOAD, \"concurrency\": $SERVING, \"mem_available_gib\": $AVAIL}" \
  | tee -a "$HERE/results/load.jsonl"
