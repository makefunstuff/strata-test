#!/usr/bin/env bash
# Regenerate the terminal captures the gallery renders. Each frame is the exact
# bytes logtrail prints to a terminal of that size; capture.html renders them.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p capture
for f in stream endpoints help filtered empty light narrow frozen; do
  node src/logtrail.ts --frame "$f" > "capture/$f.ansi"
  printf '%-11s %6d bytes\n' "$f" "$(wc -c < "capture/$f.ansi")"
done
