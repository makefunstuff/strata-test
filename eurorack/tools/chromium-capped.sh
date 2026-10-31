#!/usr/bin/env bash
# Chromium in a systemd user scope with a RAM cap. Like games/tools/chromium-capped.sh, but
# the eurorack check keeps several pages and audio contexts alive at once, so it needs a
# higher ceiling than the games harness' 1.5 GiB before systemd starts killing it.
# Without a systemd user session (containers, CI) the proof still runs — uncapped.
CHROME="${CHROMIUM_BIN:-/usr/bin/chromium}"
if command -v systemd-run >/dev/null 2>&1 &&
   systemd-run --user --scope --quiet --collect -p MemoryMax=64M /bin/true >/dev/null 2>&1; then
  exec systemd-run --user --scope --quiet --collect \
    -p MemoryHigh="${SMOKE_MEM_HIGH:-1200M}" -p MemoryMax="${SMOKE_MEM_MAX:-3G}" \
    "$CHROME" "$@"
fi
echo "chromium-capped: no systemd user session — running uncapped" >&2
exec "$CHROME" "$@"
