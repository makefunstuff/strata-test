#!/usr/bin/env bash
# Chromium in a systemd user scope with a RAM cap: past MemoryHigh the kernel reclaims and swaps Chromium's own
# pages, so a smoke test cannot push the host under the 8 GiB MemAvailable floor while Strata is up.
exec systemd-run --user --scope --quiet --collect -p MemoryHigh="${SMOKE_MEM_HIGH:-700M}" -p MemoryMax=3000M \
  "${CHROMIUM_BIN:-/usr/bin/chromium}" "$@"
