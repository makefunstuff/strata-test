# Proof: the TUI shelf check actually checks

Run from the repo root. `summarize.sh` is a table over the same JSON.

```console
$ timeout 1500 tui/tools/summarize.sh
PASS  tui/1-monitor desktop cols=161 rows=43 ink=3719 glyphs=71 changed=true expect={"panel":"net","paused":true,"sort":"pid","theme":"phosphor","procs":13} pose=["window.tui.api.pause(true) -> true"]
PASS  tui/1-monitor phone   cols=47 rows=45 ink=842 glyphs=64 changed=true expect={"panel":"mem"} pose=[]
PASS  tui/1-monitor narrow  cols=41 rows=28 ink=711 glyphs=61 changed=true expect={"panel":"mem"} pose=[]
PASS  tui/2-mail   desktop cols=155 rows=39 ink=1454 glyphs=79 changed=true expect={"folder":"inbox","sel":2,"focus":"reader","syncs":1} pose=["window.tui.api.sync() -> 2"]
PASS  tui/2-mail   phone   cols=45 rows=40 ink=938 glyphs=72 changed=true expect={"folder":"@changed"} pose=[]
PASS  tui/2-mail   narrow  cols=37 rows=25 ink=580 glyphs=64 changed=true expect={"folder":"@changed"} pose=[]
PASS  tui/3-files  desktop cols=161 rows=42 ink=2049 glyphs=75 changed=true expect={"stagedN":0,"commits":9,"top":"staged test","branch":"main"} pose=["window.tui.api.checkout('main') -> \"main\""]
PASS  tui/3-files  phone   cols=47 rows=43 ink=797 glyphs=55 changed=true expect={"tab":2} pose=[]
PASS  tui/3-files  narrow  cols=38 rows=25 ink=411 glyphs=53 changed=true expect={"tab":2} pose=[]
PASS  tui/4-player desktop cols=137 rows=39 ink=2248 glyphs=76 changed=true expect={"viz":"matrix","shuffle":true,"index":3,"playing":true,"played":1} pose=["window.tui.api.select(3) -> \"Copper Wire\"","window.tui.api.play(true) -> true"]
PASS  tui/4-player phone   cols=40 rows=40 ink=592 glyphs=62 changed=true expect={"tab":2} pose=[]
PASS  tui/4-player narrow  cols=35 rows=26 ink=470 glyphs=59 changed=true expect={"tab":2} pose=[]
PASS  tui/5-ops    desktop cols=167 rows=44 ink=3165 glyphs=68 changed=true expect={"level":"info","acks":1,"restarts":1,"paused":true,"filter":"GET","shownLines":"@changed"} pose=["window.tui.api.pause(true) -> true"]
PASS  tui/5-ops    phone   cols=49 rows=46 ink=1321 glyphs=57 changed=true expect={"tab":2} pose=[]
PASS  tui/5-ops    narrow  cols=39 rows=28 ink=567 glyphs=49 changed=true expect={"tab":2} pose=[]
PASS  tui/6-editor desktop cols=159 rows=39 ink=1348 glyphs=70 changed=true expect={"buf":"notes.md","saves":1,"hits":8,"edits":1} pose=["window.tui.api.find('ring') -> 8","window.tui.api.ex('e notes.md') -> \"opened notes.md\""]
PASS  tui/6-editor phone   cols=46 rows=40 ink=791 glyphs=63 changed=true expect={"line":"@changed","buf":"@changed"} pose=[]
PASS  tui/6-editor narrow  cols=37 rows=24 ink=60 glyphs=60 changed=true expect={"line":"@changed","buf":"@changed"} pose=[]
overall: ok
```

## The negative controls (a check that cannot fail is not a check)

Each was run against the real pages, expecting a failure, and each produced one.

```console
# a blank grid is caught
$ node tui/tools/check.mjs 1-monitor --blank
FAIL ... ink 0.0% < 6%   (or: screen is blank)

# a key that is not wired is caught: the scenario asked for sort="mem" and the page reported "pid"
# (before the space-key fix this is what proved the chip was dead)
FAIL  tui/1-monitor desktop ... the driven input did not land where the scenario says: sort="pid" want "mem"

# a tap that lands on dead cells is caught
FAIL  tui/5-ops desktop ... no hit region tagged "log" to tap
FAIL  tui/5-ops desktop ... 3 tap(s) sent, none fired a hit region

# a font that falls back off the grid is caught
FAIL  tui/4-player desktop ... font fallback breaks the grid: "1"=7.5px vs 9px, ...
FAIL  tui/6-editor desktop ... 72 glyph(s) off the character grid: ...

# a pose that throws is caught
FAIL  tui/6-editor desktop ... pose window.tui.api.find('ring') threw: TypeError ...
```

The first version of the input assertion was `state()` differs before and after driving; the kit's
own frame counter made that always true, so every page passed with dead input. It now strips the
volatile fields and names, per scenario, the fields the input must land in.
