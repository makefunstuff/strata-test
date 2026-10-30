#!/usr/bin/env bash
# tui/tools/summarize.sh — run the checker over everything and print one line per pass.
# usage: tui/tools/summarize.sh [extra check.mjs args]
cd "$(dirname "$0")/../.." || exit 1
node tui/tools/check.mjs --all "$@" | node tui/tools/summarize.mjs
exit "${PIPESTATUS[0]}"
