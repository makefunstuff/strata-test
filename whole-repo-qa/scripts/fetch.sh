#!/usr/bin/env bash
# Clone the target repo at the pinned commit into work/repo (gitignored).
# usage: scripts/fetch.sh            (reads target.json)
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
URL=$(jq -r .url "$HERE/target.json") SHA=$(jq -r .commit "$HERE/target.json")
DIR=$HERE/work/repo
if [ -d "$DIR/.git" ] && [ "$(git -C "$DIR" rev-parse HEAD)" = "$SHA" ]; then echo "work/repo already at $SHA"; exit 0; fi
rm -rf "$DIR"; mkdir -p "$DIR"
git -C "$DIR" init -q
git -C "$DIR" remote add origin "$URL"
git -C "$DIR" fetch -q --depth 1 origin "$SHA"
git -C "$DIR" -c advice.detachedHead=false checkout -q FETCH_HEAD
echo "work/repo at $(git -C "$DIR" rev-parse HEAD)"
