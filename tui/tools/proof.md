# Proof: the TUI check can fail

Two things are recorded here: the run, and what happens when each guarantee is broken on purpose.
The controls were made by editing one line out of an app (never the checker), running
`node tui/tools/check.mjs <page> --skip-phone`, and reverting. Everything between the fences is
captured output, not written.

## The run

Six pages x 1280x800, 390x844 and 320x568. `expect` is what the driven keys and taps must have
changed; `pose` is the return value of the harness call.

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
PASS  tui/4-player desktop cols=137 rows=39 ink=2243 glyphs=76 changed=true expect={"viz":"matrix","shuffle":true,"index":3,"playing":true,"played":1} pose=["window.tui.api.select(3) -> \"Copper Wire\"","window.tui.api.play(true) -> true"]
PASS  tui/4-player phone   cols=40 rows=40 ink=592 glyphs=62 changed=true expect={"tab":2} pose=[]
PASS  tui/4-player narrow  cols=35 rows=26 ink=470 glyphs=59 changed=true expect={"tab":2} pose=[]
PASS  tui/5-ops    desktop cols=167 rows=44 ink=3165 glyphs=68 changed=true expect={"level":"info","acks":1,"restarts":1,"paused":true,"filter":"GET","shownLines":"@changed"} pose=["window.tui.api.pause(true) -> true"]
PASS  tui/5-ops    phone   cols=49 rows=46 ink=1321 glyphs=57 changed=true expect={"tab":2} pose=[]
PASS  tui/5-ops    narrow  cols=39 rows=28 ink=567 glyphs=49 changed=true expect={"tab":2} pose=[]
PASS  tui/6-editor desktop cols=159 rows=39 ink=1348 glyphs=70 changed=true expect={"buf":"notes.md","saves":1,"hits":8,"edits":1} pose=["window.tui.api.find('ring') -> 8","window.tui.api.ex('e notes.md') -> \"opened notes.md\""]
PASS  tui/6-editor phone   cols=46 rows=40 ink=791 glyphs=63 changed=true expect={"line":"@changed","buf":"@changed"} pose=[]
PASS  tui/6-editor narrow  cols=37 rows=24 ink=424 glyphs=60 changed=true expect={"line":"@changed","buf":"@changed"} pose=[]
overall: ok
```

## The negative controls

```console
$ node tui/tools/check.mjs 3-files --skip-phone   # the space key stops staging in the file manager
ok: false   grid: 161x42, ink 2049, 75 distinct glyphs
   ! the driven input did not land where the scenario says: commits=8 want 9, top="grid: sort directories before files, always" want "staged test"
```

```console
$ node tui/tools/check.mjs 5-ops --skip-phone   # the log rows stop declaring a hit region
ok: false   grid: 167x44, ink 3165, 68 distinct glyphs
   ! no hit region tagged "log" to tap
   ! 3 tap(s) sent, none fired a hit region
```

```console
$ node tui/tools/check.mjs 6-editor --skip-phone   # the page loads a face whose arrows and bullets fall off the grid
ok: false   grid: 173x39, ink 1348, 70 distinct glyphs
   ! font fallback breaks the grid: "●"=8.7px vs 7.25px, "▲"=8.7px vs 7.25px
```

```console
$ node tui/tools/check.mjs 6-editor --skip-phone   # the harness pose call throws
ok: false   grid: 159x39, ink 1348, 70 distinct glyphs
   ! pose window.tui.api.find('ring') threw: page.evaluate: Error: boom
   ! the driven input did not land where the scenario says: hits=0 want 8
```

```console
$ node tui/tools/check.mjs 1-monitor --skip-phone   # draw() returns without drawing
ok: false   grid: 161x43, ink 0, 0 distinct glyphs
   ! blank grid: 0/6923 cells drawn
   ! only 0 distinct glyphs on screen
   ! no hit region tagged "proc" to tap
   ! 2 tap(s) sent, none fired a hit region
   ! the driven input did not land where the scenario says: sort="mem" want "pid"
```


## What each control is the evidence for

- **dead-key** is why the scenarios name their fields. The first version asserted only that
  `state()` differed before and after driving, and the kit's own frame counter made that true no
  matter what the page did with the key — every page passed while the space key was dead.
- **dead-tap** is why taps are aimed at a declared region by tag and the page has to report one
  firing. Before that, a desktop scenario passed with its only tap landing on empty cells.
- **bad-font** is the failure a screenshot does not catch and an "is it monospaced" test does not
  either: the substituted face is monospaced, its arrows are just not the width of the cell the
  grid was measured in.
- **throwing-pose** is the reason the pose result is asserted rather than printed: as first
  written, a pose that threw only failed the page because a field expectation happened to notice.
- **blank-grid** covers an empty shell, which would otherwise report a clean layout.
