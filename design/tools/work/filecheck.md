# file:// check — `node tools/filecheck.mjs`

27 pages opened twice. Over `file://`: 4 clean, 23 with console/page/request errors. Over `http://`: 1 with errors.

Works over `file://`: 05-system, 10-redesign

Blocked over `file://`: ., 01-landing, 02-dashboard, 03-mobile, 04-tui, 06-identity, 07-dataviz, 08-form, 09-motion, 11-styles

| task / page | file:// errors | first file:// error | http:// errors |
|--|--|--|--|
| ./index.html | 3 | console: Access to script at 'design/gallery.js' from origin 'null' has been blocked by CORS policy: Cross ori | 0 |
| 01-landing/index.html | 3 | console: Access to script at 'design/01-landing/terrain-boot.js' from origin 'null' has been blocked by CORS p | 0 |
| 02-dashboard/index.html | 3 | console: Access to script at 'design/02-dashboard/app.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 03-mobile/index.html | 36 | console: Access to script at 'design/03-mobile/app.js' from origin 'null' has been blocked by CORS policy: Cro | 0 |
| 03-mobile/app.html | 3 | console: Access to script at 'design/03-mobile/app.js' from origin 'null' has been blocked by CORS policy: Cro | 0 |
| 04-tui/index.html | 24 | console: Access to fetch at 'design/04-tui/capture/stream.ansi?v=1793030565959' from origin 'null' has been bl | 0 |
| 04-tui/capture.html | 3 | console: Access to fetch at 'design/04-tui/capture/stream.ansi?v=1793030569134' from origin 'null' has been bl | 0 |
| 05-system/index.html | 0 | — | 0 |
| 06-identity/index.html | 3 | console: Access to script at 'design/06-identity/identity.js' from origin 'null' has been blocked by CORS poli | 0 |
| 07-dataviz/index.html | 3 | console: Access to script at 'design/07-dataviz/app.js' from origin 'null' has been blocked by CORS policy: Cr | 0 |
| 08-form/index.html | 3 | console: Access to script at 'design/08-form/app.js' from origin 'null' has been blocked by CORS policy: Cross | 0 |
| 09-motion/index.html | 3 | console: Access to script at 'design/09-motion/motion.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 10-redesign/before.html | 0 | — | 1 |
| 10-redesign/after.html | 0 | — | 0 |
| 10-redesign/index.html | 0 | — | 0 |
| 11-styles/s01-swiss.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s02-brutalism.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s03-editorial.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s04-glass.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s05-neumorph.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s06-pixel.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s07-japanese.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s08-cyber.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/s09-luxury.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/index.html | 3 | console: Access to script at 'design/11-styles/gallery.js' from origin 'null' has been blocked by CORS policy: | 0 |
| 11-styles/before-glass.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
| 11-styles/before-neumorph.html | 3 | console: Access to script at 'design/11-styles/render.js' from origin 'null' has been blocked by CORS policy:  | 0 |
