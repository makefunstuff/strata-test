# 04-tui — the terminal's claims against its own bytes

Page: `http://127.0.0.1:33939/index.html` · 25 checks · **0 failing**

| check | |
| --- | --- |
| palette mirror equals the source (dark) | ok — 12 colours in src/logtrail.ts, 12 in the page; drift: none |
| palette mirror equals the source (light) | ok — 12 colours in src/logtrail.ts, 12 in the page; drift: none |
| every colour in the palette is used by the program | ok — 12 colours, uses: ink 12, dim 14, faint 32, line 31, accent 14, accentDim 2, gold 13, red 9, blue 2, sel 7, selInk 8, chip 3; dead: none (a violet and a panel fill were removed) |
| the strip prints the true ratio for every colour | ok — 22 swatches (2 palettes), worst print error 0.050; mismatches 0 |
| every colour clears its own bar (4.5 type, 3.0 rules and bars) | ok — min text ratio 5.21:1, min graphic 3.15:1 |
| the rule colour in the dark captures clears 3:1 | ok — 83,105,121 on #10161c = 3.18:1, 134 rule glyphs in the bytes |
| the rule colour in the light captures clears 3:1 | ok — 133,147,158 on #ffffff = 3.15:1, 116 rule glyphs in the bytes |
| the rule colour in the dark captures clears 3:1 | ok — 83,105,121 on #10161c = 3.18:1, 102 rule glyphs in the bytes |
| the overlay's printed counts are its own counts | ok — printed "18 keys … repeats 9"; table lists 18 (j k ↑ ↓ g G / Esc f t 1 2 3 s S enter o q); bar lists 9 |
| the status bar repeats keys the overlay lists | ok — BAR_KEYS table: j/k g/G / f t ? q; every label appears in the drawn bar: 7/7; keys outside the overlay: ? |
| the page's legend is the overlay's set plus the footer's | ok — legend 19: j k ↑ ↓ g G / Esc f t s S 1 2 3 ? enter o q | overlay+footer 19: j k ↑ ↓ g G / Esc f t 1 2 3 s S enter o q ? |
| every key the page lists is bound in the program | ok — bindings in source: q \x03 j k G g 1 2 3 ? t f s S \x1b \x7f / \r o; unbound in the legend: none |
| the page's caption states the same counts the program prints | ok — caption: the help overlay: a modal box that blanks the screen behind it, listing all 18 keys; the status bar repeats 9 of them — both counts come from the app's key table, and the overl |
| the volume strip is 60 buckets, and severity the same | ok — 60 volume glyphs, 60 severity glyphs |
| the printed bucket seconds match the window the bytes show | ok — printed "lines per 2 s" over 60 buckets = 120 s; the label's window starts 06:08 and the buffer's last drawn row is 06:09:15 = 75 s. The label used to say 10 s, which is 600 s: six minutes beside a two-minute window |
| the drawn tail sits inside the printed window | ok — 30 tail rows drawn, 06:09:08 → 06:09:15, inside the label's 06:08 → 06:09 |
| the severity line counts match the levels in the window | ok — printed 35 w 20 e for the buffer; the 30 rows this frame draws hold 2 warn 1 error — the counters are buffer-wide by design, and the frame is a window on it |
| the latency strip: bars, printed count and printed span agree | ok — 26 bars, "latency, last 26", "26 req", span 06:08:54 → 06:09:53 (the label used to be the typed "06:11:58 → 06:12:44" for every selection) |
| the endpoint table's strip is the last 20 requests its header names | ok — header names 20, the slice is -20; 8 rows draw a varied strip of 20 bars (the share bar, all one glyph, is not counted) |
| the filter's terms are one list: parser, key, help text | ok — FILTER_TERMS lvl= svc= ep= code=; the parser reads lvl svc ep code; the overlay names all of them |
| every capture fills rows - 1 and fits the declared width | ok — stream 39/39 rows 148/148 cols · endpoints 21/21 rows 148/148 cols · help 33/33 rows 148/148 cols · filtered 29/29 rows 148/148 cols · empty 25/25 rows 148/148 cols · light 33/33 rows 148/148 cols · narrow 23/23 rows 80/80 cols · frozen 33/33 rows 148/148 cols |
| no captured row exceeds its declared width | ok — stream 148 cols, endpoints 148, help 148, narrow 80 (declared 148/148/148/80) |
| the footer's line count is the buffer's | ok — footer 420, filter line 420, source 420 |
| the page does not scroll sideways at 390 px | ok — sideways overflow 0 px |
| no console errors | ok — clean |

_Bucket seconds, the key counts, the rule contrast and the grid widths are all read from `capture/*.ansi`, the program's own output. A label that disagrees with the bytes it sits next to fails here._
