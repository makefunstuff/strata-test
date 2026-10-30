#!/usr/bin/env bash
# tui/tools/summarize.sh — run the checker over everything and print one line per pass.
# usage: tui/tools/summarize.sh [extra check.mjs args]
cd "$(dirname "$0")/../.." || exit 1
out=$(mktemp)
node tui/tools/check.mjs --all "$@" >"$out" 2>&1
status=$?
python3 - "$out" <<'PY'
import json, sys
txt = open(sys.argv[1]).read()
try:
    d = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
except Exception:
    print(txt[-4000:]); sys.exit(1)
for c in d["results"]:
    g = c.get("grid") or {}
    errs = c.get("errors") or []
    ok = "PASS" if not errs else "FAIL"
    print(f"{ok}  {c['page']:12s} {c['tag']:7s} cols={g.get('cols')} rows={g.get('rows')} "
          f"ink={g.get('ink')} glyphs={g.get('glyphs')} changed={c.get('changed')} pose={c.get('pose')}")
    seen = set()
    for e in errs:
        k = e.split("\n")[0][:200]
        if k in seen:
            continue
        seen.add(k)
        print("     !", k)
print("overall:", "ok" if d.get("ok") else "FAILED")
PY
rm -f "$out"
exit $status
