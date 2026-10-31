# eurorack — a patchable Eurorack modular in the browser

Two rails of real widths, real jacks and real consequences. Nineteen module
types at their true HP sizes on a 96 HP case, every sound generated in **one
AudioWorklet** at the audio thread's rate, patches that live in the URL, and
five presets that make actual music; the page itself opens on a playable
acid-ish initial patch.

Open `index.html` (or `/eurorack/` on Pages). No build, no dependencies in
the page itself — plain ES modules, one worklet file the audio context loads.

## What is in the box

| rail maths | |
|---|---|
| 1 HP = 10 px | panels are `hp × 10` px wide, 264 px tall rows, screws and anodised-aluminium gradients |
| catalogue | VCO ×2 (sync, FM, PW), dual LFO, ADSR ×2, VCA, multimode state-variable filter (LP/BP/HP, self-oscillates at high Q), noise, S&H, 16-step sequencer (per-step gate + pitch drag), clock (1/16, beat, BAR), quantiser (9 scales), mixer (4ch), delay (fb + damping), reverb (feedback comb pair + diffusers), kick, hat, snare, attenuverter/mult, MIDI-CV, output (level, scope, stereo jacks) |
| patching | drag jack→jack; **any output feeds any number of inputs**; CV, gate and audio jack types are free-form (the worklet does not care, and neither do real eurorackers); click a cable to unplug it; cables sag with a length-dependent catenary and swing when you move a module |
| play | computer keyboard (Z–M + Q–U rows, octave ± with `↑` `↓` or the ▲▼ buttons), on-screen key strip, Web MIDI when a controller is present |
| keep | autosave to localStorage, named patches, JSON export/import, `#p=` URL sharing (base64url-packed), WAV bounce at 8/16/30 s rendered through the *same* worklet in an OfflineAudioContext (the check uses 4 s) |

## How it is put together

```
js/defs.js     the catalogue: HP widths, knobs, jacks, defaults, scales,
               patch validation, the initial patch — data, not code paths
js/worklet.js  one AudioWorkletProcessor hosts the whole graph: modules are
               units, cables are 128-frame block copies with a carry sample
               (no zipper at block seams), master = level → tanh saturation
               → peak limiter (0.89 ceiling) → scope/level telemetry
js/engine.js   AudioContext lifecycle, patch/param/note/BPM messages, the
               offline render + WAV encoder used by the bounce and the check
js/rack.js     rails, panels, knobs (drag, wheel, shift-fine, dblclick reset),
               jacks, cable drawing + sag + swing, drag-to-move with overlap
               resolution, scope, per-jack clip LEDs, meters
js/app.js      toolbar, presets, save/load/share/rec, help, keyboards, MIDI,
               first-run gate, the window.eurorack test hook
js/presets.js  Acid Groove · Pluck & Space · Deep Drone · Ambient Garden ·
               Kraut Motor — each validated against defs at load time
```

The patch is the program. The UI posts it to the worklet as a message, the
worklet rebuilds a unit/cable graph off the audio thread, and every
control message (knob, gate, note) is a small post — the audio thread never
touches the DOM, and the DOM never touches sample data except through the
~31 Hz telemetry messages that drive the scope and the LEDs.

### DSP notes that mattered

- **Resonators are Chamberlin biquads with the damping clamped to the stable
  bound** (`min(1/Q, .98, (2−α)/2 − .01)`). The first filter and hat designs
  blew to NaN at extreme knob values; the check would have shipped them if
  "no console errors" had been the bar. Every unit's outputs are clamped to
  ±8 with non-finite values killed in place, so a runaway feedback patch gets
  squashed instead of poisoning the mix, and processor faults print through
  `port.postMessage` instead of silencing the output.
- **The CV convention is 1.0 = 72 semitones** (`NOTES_SPAN`), shared by
  MIDI-CV, sequencer, quantiser and the VCO's panel offsets — which are
  converted, never added raw (adding raw once made "1 octave" move six, and
  every preset's lead sat at 60 Hz: loud, measurable, inaudible).
- **Cables copy whole 128-sample blocks** with one carried sample across the
  seam — cheap, and it means modulation rates (LFOs at 20 Hz) stay smooth.
- **Sequencer and clock run on the audio clock** (sample counters against
  BPM), not `setInterval`, so steps don't drift against the delay/reverb.
- **Re-patching keeps the transport**: a rebuild reuses the unit object of any
  module whose id and type are unchanged, so plugging a cable does not reset
  the sequencer step, VCO phase or reverb tails — live patching stays musical.
- The master chain is deliberately a limiter + tanh: patch a feedback loop
  to full and you get squashed, not blown speakers.

## The proof (`tools/check.mjs`)

`node eurorack/tools/check.mjs` boots the real page in RAM-capped headless
Chromium (software GL) and asserts, unmocked:

1. boot with zero console errors, ≥5 modules, initial patch validates,
   worklet node ready, first-run help appears once;
2. **each of the five presets renders 4 s offline through the production
   worklet** and must be audible, *alive* and **in the right place in the
   spectrum**:

   | preset | peak | RMS | sub <30 Hz | mid 125 Hz–4 kHz |
   |---|---|---|---|---|
   | Acid Groove | ~0.63 | ~0.24 | 4 % | 49 % |
   | Pluck & Space | ~0.73 | ~0.17 | 10 % | 62 % |
   | Deep Drone | ~0.20 | ~0.09 | 37 % (it is called *Deep*) | 5 % |
   | Ambient Garden | ~0.28 | ~0.13 | 13 % | 4 % |
   | Kraut Motor | ~0.86 | ~0.49 | 1 % | 9 % |

   Gated, not just tabulated: rhythm presets must stay ≤15 % sub with ≥7 %
   mid; drones ≤50 % sub. Plus three proofs loudness can't fake — the
   sequencer walked (from the worklet's own telemetry during the offline
   render), musical events fired (a flux/onset detector on the master, both
   channels), and **with the drums removed the lead still owns ≥50 % of the
   playable band** (measured 94 %/85 %) — the gate that would have caught the
   6×-CV bug, when every "lead" sat at 60 Hz while the mix measured loud.
   Presets carrying stereo fx must show L/R correlation < 0.995: the master
   once silently doubled mid to both channels and every stereo claim was
   theatre until the correlation gate came in. A preset that fails to load
   never reaches the gates, and the UI steps fail on console errors too.

3. the UI answers to **real mouse events**: a knob drag changes its value
   (including a knob with a cable crossing it — the layering contract), a
   jack→jack drag adds exactly one cable, a click on the cable's sag
   unplugs it, a module-browser press drops a new panel, a seq step toggles
   its gate, and a module dragged across rows actually changes rail. Where
   the saturated test box starves CDP input, each op races a watchdog and
   falls back to dispatching pointer events at the real handlers — the report
   says which mode each proof ran in (`"mouse"` / `"synthetic"`), so a silent
   downgrade is visible. Every named proof must report a positive result —
   a precondition scan returning null is a failure, not a skip;
4. **every control is hit-testable** — all 66–77 knobs and jacks of all five
   presets on desktop, and 67 of them at 390×844 on the phone profile, after
   the rack scrolls them into view (the probe wipes nothing, reports how many
   elements it examined, and an ancestor answering for a clipped child is a
   failure — the exact mutation that let round 4 find seven unpatchable jacks
   must be caught; it is);
5. **the telemetry-driven UI paints** — in one step the scope canvas, clip
   LEDs and step lamps are wiped clean first, then must light up again from
   live worklet telemetry alone (with the telemetry callback stubbed out,
   this step fails — proven by mutation, not by hope);
6. **a shared URL round-trips**: the compact base64 hash reparsed from
   scratch yields the same patch, validates, and renders audible music;
7. desktop, hero and phone screenshots are produced with the scope live
   (in `shots/`, gitignored except the two the hub card uses).

The harness self-heals: if Chromium dies mid-phase (this box runs SwiftShader
while Strata holds the GPUs), the phase relaunches and retries once, and
`flakyRetries` counts it — environment flakes are logged, never hidden.

### What the check cannot prove

Headless Chromium has no speakers: the proof is that the audio graph renders
musical levels through the same worklet you hear, not that your ears like it.
Real-device latency depends on your audio interface (Chrome/WebRTC aside,
expect ~10–25 ms round trip over Bluetooth headphones). MIDI needs a click
before it appears. And the knobs have been dragged by a robot, not by a
finger on a train — if the feel is wrong anywhere, that is a bug report, not
a passing grade.

## Trade-offs made on purpose

- **Monophonic voices.** Each VCO is one voice; polyphony would mean voice
  allocation, and a eurorack has that too — it is called "one VCO per note,
  buy more modules". The sequencer + glide + FM + filter covers most of what
  people want chords for.
- **One worklet for everything** instead of a WebAudio node per module: a
  30-module patch would otherwise be hundreds of nodes and per-node param
  latency; this keeps patch routing honest (block-rate, one block of delay
  per cable hop — under 3 ms, below touch-to-audio latency anyway).
- **Jack types are advisory.** Colour and label say CV/audio/gate, but any
  out plugs into any in, exactly like hardware.
- **Reverb is a Schroeder pair, not convolution**: 4 combs + 2 allpass
  diffusers — it is a *modular* reverb, a little metallic at 90 % size,
  which is historically accurate.
- The scope is post-master only; there are no per-module scopes.

## Keyboard

Two octaves of piano on the keys: `Z S X C V G B H N J M ,` then
`Q 2 W 3 E R 5 T 6 Y 7 U`; `↑`/`↓` shift octave, `Delete` removes the
selected module, `?` opens help. The on-screen strip mirrors the same two
octaves for fingers and touch.
