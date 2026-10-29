#!/usr/bin/env bash
# Clone each padding repo at its pinned commit into work/<name> (gitignored).
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
jq -r '.repos[] | "\(.name) \(.url) \(.commit)"' "$HERE/target.json" | while read -r NAME URL SHA; do
  DIR=$HERE/work/$NAME
  if [ -d "$DIR/.git" ] && [ "$(git -C "$DIR" rev-parse HEAD)" = "$SHA" ]; then echo "work/$NAME at $SHA"; continue; fi
  rm -rf "$DIR"; mkdir -p "$DIR"
  git -C "$DIR" init -q
  git -C "$DIR" remote add origin "$URL"
  git -C "$DIR" fetch -q --depth 1 origin "$SHA"
  git -C "$DIR" -c advice.detachedHead=false checkout -q FETCH_HEAD
  echo "work/$NAME at $(git -C "$DIR" rev-parse HEAD)"
done
