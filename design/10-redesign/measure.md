# 10 · Redesign — the redesign, measured

Run: `node 10-redesign/measure.mjs` (headless Chromium over local HTTP, the same binary as the audit).
Nothing here is read from the source files: every number is measured from the rendered page,
and the drawings are mapped back through the scale the drawing code used.

## The curve is the table

Each dot's `cy` is inverted through the shared scale and compared with the cell beside it.
A peak dot is flood-coloured only if the height is above the flood line; a `—` must be a gap.

| day | waters | dots | max deviation | peaks / above line | wrong colours | gaps drawn for missing |
| --- | --- | --- | --- | --- | --- | --- |
| Tue 3 December | 4 | 4 | 0.008 m | 2 / 2 | 0 | 0 for 0 |
| Wed 4 December | 4 | 4 | 0.008 m | 2 / 2 | 0 | 0 for 0 |
| Thu 5 December | 4 | 4 | 0.008 m | 1 / 1 | 0 | 0 for 0 |
| Fri 6 December | 4 | 3 | 0.008 m | 0 / 0 | 0 | 1 for 1 |
| Sat 7 December | 4 | 4 | 0.008 m | 0 / 0 | 0 | 0 for 0 |
| Sun 8 December | 4 | 4 | 0.006 m | 0 / 0 | 0 | 0 for 0 |
| Mon 9 December | 4 | 4 | 0.008 m | 0 / 0 | 0 | 0 for 0 |

Every dot within **0.008 m** of its cell; **0** peaks coloured wrongly; **0** rows with a
gap that does not match a missing reading. Every row has a curve: true.

## The gauge is the panel

| mark | attribute | measured metres | deviation |
| --- | --- | --- | --- |
| now | 3.94 m | 3.94 m | 0.000 m |
| line | 4.20 m | 4.20 m | 0.000 m |
| pred | 4.48 m | 4.48 m | 0.001 m |
| fc | 4.61 m | 4.61 m | 0.001 m |

Marks in order (tide < flood line < predicted < forecast): **true**. Key rows 4, swatches 4,
SVG hidden from readers (the numbers are in the text): true.
Every number in the key is present: true. Every centimetre in the key equals its arithmetic: true.

## The lede is the table

| claim | value | check |
| --- | --- | --- |
| flood line in the lede | 4.2 m | the table's caption quotes the same |
| forecast peak in the lede | 4.61 m | named as the forecast with surge |
| centimetres above the line | 41 cm | **41 = 41 ✓** |
| predicted tide quoted in the lede | 4.48 m | the table's own 22:14 high is 4.48 m: same ✓ |
| the table names its basis | — | says predicted astronomical tide, without surge ✓ |

Before this round the lede said the peak was 4.61 m and 41 cm above the line while the table's
22:14 tide was 4.48 m, and nothing on the page said the two numbers are two different things.

## States are words, not colours

| pill | ink | ratio on paper | words |
| --- | --- | --- | --- |
| in force | rgb(161, 51, 39) | 6.96 | true |
| applications open | rgb(22, 112, 87) | 6.02 | true |
| starts 13 January | rgb(36, 86, 127) | 7.74 | true |

Notices carrying a state: 3 of 5 (the two undated-by-state notices are a map and a report).
Worst state ink on paper: **6.02** (AA text is 4.5).

## It prints, and it fits a phone

| | desktop 1 400 | print A4 794 | phone 390 |
| --- | --- | --- | --- |
| sideways overflow | 0 px | 0 px | 0 px |
| curves on the page | 7 | 7 of 7 | 7 |
| table width | — | 794 px | scrolls in its own box: 0 px |
| table font | — | 12.6667px | — |

The gauge survives print: true. The case study's 572 px → 0 px phone row still
holds: **0 px** of document overflow at 390 px, with the table scrolling in its
own box (0 px inside) rather than pushing the page sideways.

Console errors: **0**

