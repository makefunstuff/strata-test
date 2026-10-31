#!/usr/bin/env bash
# Chromium in a systemd user scope with a RAM cap. Like games/tools/chromium-capped.sh, but
# the eurorack check keeps several pages and audio contexts alive at once, so it needs a
# higher ceiling than the games harness' 1.5 GiB before systemd starts killing it.
exec systemd-run --user --scope --quiet --collect \
  -p MemoryHigh="${SMOKE_MEM_HIGH:-1200M}" -p MemoryMax="${SMOKE_MEM_MAX:-3G}" \
  "${CHROMIUM_BIN:-/usr/bin/chromium}" "$@"
