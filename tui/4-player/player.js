// wave — tui/4: a music player in the ncmpcpp mould — a playlist on the left, the record on the right,
// a transport along the bottom.
//
// The music is not a file: each track is a pattern (root, scale, bar length, bpm, drum weight) and a
// WebAudio graph plays it — a square arpeggio, a triangle bass, a noise hat — scheduled a fifth of a
// second ahead of the audio clock. The spectrum is that graph's own AnalyserNode. Where an audio
// output is not available (headless Chromium is muted), the same pattern drives a synthetic spectrum
// instead, and state() says which one the screen is showing, so the page never claims to be showing
// sound it is not making.
import { createTUI, pad, pad0, clamp, clock, rng } from "../shared/tui.js";

const PAL = {
  // nord: a cold slate with ice blues and one warm sand colour, no saturated primaries
  pageBg: "#171921", screenBg: "#1f2229", panel: "#262a33", well: "#22252c", line: "#3b404c",
  line2: "#4c566a", fg: "#eceff4", dim: "#a9b1c2", faint: "#6b7386", accent: "#88c0d0",
  green: "#a3be8c", red: "#bf616a", yellow: "#ebcb8b", blue: "#81a1c1", magenta: "#b48ead",
  cyan: "#8fbcbb", orange: "#d08770", track: "#2e333d",
};

const TRACKS = [
  { title: "Frost Front", artist: "Borealis", album: "Ice Drift", bpm: 96, root: 45, scale: "minor", bars: 8, hat: 0.5, len: 214 },
  { title: "Sonar", artist: "Kelp Council", album: "Deep Field", bpm: 112, root: 50, scale: "dorian", bars: 8, hat: 0.8, len: 187 },
  { title: "Night Bus", artist: "Tramline", album: "Last Service", bpm: 124, root: 43, scale: "minor", bars: 16, hat: 0.65, len: 246 },
  { title: "Copper Wire", artist: "Tramline", album: "Last Service", bpm: 118, root: 55, scale: "major", bars: 8, hat: 0.4, len: 202 },
  { title: "Helium", artist: "Balloon School", album: "Lift", bpm: 104, root: 52, scale: "lydian", bars: 8, hat: 0.3, len: 231 },
  { title: "Slow Tide", artist: "Kelp Council", album: "Deep Field", bpm: 88, root: 41, scale: "dorian", bars: 16, hat: 0.25, len: 288 },
  { title: "Static Garden", artist: "Aerial", album: "Aerial Views", bpm: 130, root: 48, scale: "minor", bars: 8, hat: 0.9, len: 174 },
  { title: "Ferric", artist: "Aerial", album: "Aerial Views", bpm: 121, root: 46, scale: "major", bars: 8, hat: 0.55, len: 199 },
  { title: "Lodestone", artist: "Borealis", album: "Ice Drift", bpm: 92, root: 40, scale: "lydian", bars: 16, hat: 0.35, len: 265 },
  { title: "Undertow", artist: "Kelp Council", album: "Deep Field", bpm: 108, root: 53, scale: "minor", bars: 8, hat: 0.7, len: 221 },
  { title: "Paper Rain", artist: "Balloon School", album: "Lift", bpm: 99, root: 47, scale: "dorian", bars: 16, hat: 0.45, len: 258 },
  { title: "Iron Lung", artist: "Aerial", album: "Aerial Views", bpm: 127, root: 42, scale: "minor", bars: 8, hat: 0.75, len: 183 },
  { title: "Halogen", artist: "Tramline", album: "Last Service", bpm: 115, root: 49, scale: "lydian", bars: 8, hat: 0.5, len: 212 },
  { title: "Low Orbit", artist: "Borealis", album: "Ice Drift", bpm: 90, root: 44, scale: "dorian", bars: 16, hat: 0.3, len: 276 },
  { title: "Wet Cement", artist: "Kelp Council", album: "Deep Field", bpm: 106, root: 51, scale: "major", bars: 8, hat: 0.6, len: 195 },
  { title: "Static Garden (reprise)", artist: "Aerial", album: "Aerial Views", bpm: 130, root: 48, scale: "minor", bars: 8, hat: 0.85, len: 141 },
  { title: "Night Bus (dub)", artist: "Tramline", album: "Last Service", bpm: 122, root: 43, scale: "minor", bars: 16, hat: 0.55, len: 268 },
  { title: "Lift", artist: "Balloon School", album: "Lift", bpm: 101, root: 54, scale: "lydian", bars: 8, hat: 0.35, len: 229 },
];

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const state = {
  i: 0, playing: false, pos: 0, volume: 0.7, muted: false,
  shuffle: false, repeat: "off",            // off | one | all
  viz: "bars",                              // bars | wave | matrix
  sel: 0, filter: "", filtering: false,
  played: 0, seeks: 0, audio: "off",         // off | live | synthetic
  bins: new Uint8Array(64), scope: new Uint8Array(64),
  nextBeat: 0, step: 0, startedAt: 0, synthT: 0,
  queue: TRACKS.map((_, i) => i),
};

/* ------------------------------------------------------------------ the synth */

let ctx = null, master = null, analyser = null, noiseBuf = null, audioError = null;

function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function ensureAudio() {
  if (ctx || audioError) return !!ctx;
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) throw new Error("no AudioContext");
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.muted ? 0 : state.volume * 0.5;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    state.audio = "live";
  } catch (e) {
    audioError = e;
    state.audio = "synthetic";
  }
  return !!ctx;
}

function voice(freq, at, dur, type, gain) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(master);
  o.start(at); o.stop(at + dur + 0.02);
}

function hat(at, gain) {
  if (!ctx || !noiseBuf) return;
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 6200;
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(at); s.stop(at + 0.06);
}

/** Schedule the next fifth of a second of the pattern against the audio clock (or the fake one). */
function schedule(dt) {
  const tr = TRACKS[state.i];
  const stepDur = 60 / tr.bpm / 4;                        // a 16th note
  const now = ctx ? ctx.currentTime : (state.synthT += dt);
  const horizon = now + 0.2;
  while (state.playing && state.nextBeat < horizon) {
    const at = Math.max(state.nextBeat, now + 0.005);
    const sc = SCALES[tr.scale];
    const deg = [0, 2, 4, 6, 4, 2, 5, 3][state.step % 8];
    const oct = state.step % 16 < 8 ? 12 : 24;
    const midi = tr.root + oct + sc[deg % sc.length];
    voice(mtof(midi), at, stepDur * 1.6, "square", 0.16);
    if (state.step % 4 === 0) voice(mtof(tr.root - 12 + sc[(state.step >> 2) % sc.length]), at, stepDur * 3.4, "triangle", 0.3);
    if (state.step % 2 === 0) hat(at, 0.06 + tr.hat * 0.09);
    if (state.step % 16 === 8) voice(mtof(tr.root + 24), at, stepDur * 0.8, "sawtooth", 0.07);
    state.nextBeat = at + stepDur;
    state.step++;
    state.pos += stepDur;
  }
  if (state.pos >= tr.len) {
    if (state.repeat === "one") state.pos = 0;
    else { next(state.repeat === "all"); state.pos = 0; }
  }
}

/** A spectrum when there is no analyser to read: the pattern's own shape, not a random walk. */
function synthSpectrum() {
  const tr = TRACKS[state.i];
  const t = state.synthT;
  const pulse = 0.55 + 0.45 * Math.sin((t * tr.bpm * 4 * Math.PI) / 60);
  for (let i = 0; i < state.bins.length; i++) {
    const f = i / state.bins.length;
    const body = Math.exp(-f * 1.9) * 235;
    const arp = Math.abs(Math.sin(t * 2.1 + f * 9)) * 150 * Math.exp(-Math.abs(f - 0.45) * 4.2);
    const hiss = f > 0.6 ? tr.hat * 120 * Math.max(0, Math.sin(t * 13 + f * 21)) : 0;
    state.bins[i] = clamp(Math.round(Math.pow((body + arp + hiss) / 255, 0.72) * 255 * pulse * (state.muted ? 0.05 : 1)), 0, 255);
  }
  for (let i = 0; i < state.scope.length; i++) {
    state.scope[i] = clamp(128 + Math.round(90 * Math.sin(i * 0.5 + t * 6) * (0.3 + 0.7 * pulse)), 0, 255);
  }
}

function readSpectrum() {
  if (ctx && analyser && state.audio === "live") {
    analyser.getByteFrequencyData(state.bins);
    analyser.getByteTimeDomainData(state.scope);
    let sum = 0;
    for (const v of state.bins) sum += v;
    // a muted or blocked output gives a silent analyser: say so instead of showing a dead meter
    if (sum < 40) { state.audio = "synthetic"; synthSpectrum(); }
  } else {
    synthSpectrum();
  }
}

/* ------------------------------------------------------------------ transport */

function play(on = !state.playing) {
  state.playing = on;
  if (on) {
    ensureAudio();
    if (ctx) { ctx.resume?.(); state.nextBeat = ctx.currentTime + 0.05; }
    state.startedAt = performance.now();
  }
  window.tui?.toast(on ? `▶ ${TRACKS[state.i].title}` : "❙❙ paused");
}

function next(allowWrap = true) {
  const order = state.shuffle ? [...state.queue].sort(() => rand() - 0.5) : state.queue;
  const at = order.indexOf(state.i);
  const nxt = order[(at + 1) % order.length];
  if (at === order.length - 1 && !allowWrap && state.repeat !== "one") { state.playing = false; state.pos = 0; return; }
  state.i = nxt; state.sel = state.i; state.pos = 0; state.step = 0; state.played++;
  if (state.playing) { if (ctx) state.nextBeat = ctx.currentTime + 0.05; }
}

function prev() {
  const at = state.queue.indexOf(state.i);
  state.i = state.queue[(at - 1 + state.queue.length) % state.queue.length];
  state.sel = state.i; state.pos = 0; state.step = 0;
}

function seekBy(d) { state.pos = clamp(state.pos + d, 0, TRACKS[state.i].len); state.seeks++; }
function seekTo(frac) { state.pos = clamp(frac * TRACKS[state.i].len, 0, TRACKS[state.i].len); state.seeks++; }
const list = () => {
  const f = state.filter.toLowerCase();
  return TRACKS.map((tr, i) => ({ ...tr, i })).filter((tr) => !f || tr.title.toLowerCase().includes(f) || tr.artist.toLowerCase().includes(f) || tr.album.toLowerCase().includes(f));
};
const rand = rng(0xbeef);

/* ------------------------------------------------------------------ drawing */

function cover(t, x, y, w, h, seed, accent) {
  // the record sleeve, drawn from the track's numbers: the bpm sets the column rhythm, the scale the rows
  const r = rng(seed);
  const cols = ["accent", "blue", "cyan", "magenta", "faint"];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = Math.sin(i * 0.55 + seed % 7) + Math.cos(j * 0.7 - (seed % 11) * 0.3) + Math.sin((i + j) * 0.24 + r() * 0.02);
      const k = clamp(Math.round(((v + 3) / 6) * 4), 0, 4);
      t.cell(x + i, y + j, " ░▒▓█"[k], t.attr({ fg: cols[k], bg: k >= 3 ? null : null }));
    }
  }
  t.box(x - 1, y - 1, w + 2, h + 2, { corners: "light", style: { fg: accent ? "accent" : "line" }, fill: false });
}

function spectrumBars(t, x, y, w, h) {
  const n = Math.min(state.bins.length, w);
  for (let i = 0; i < n; i++) {
    const v = state.bins[Math.floor((i / n) * state.bins.length)] / 255;
    const total = v * h * 8;
    const cx = x + Math.floor((i / n) * w);
    for (let j = 0; j < h; j++) {
      const fromBottom = h - 1 - j;
      let ch = " ", col = "green";
      if (total >= (fromBottom + 1) * 8) { ch = "▄"; col = fromBottom > h * 0.75 ? "red" : fromBottom > h * 0.45 ? "yellow" : "green"; }
      else if (total > fromBottom * 8) { ch = "▁▂▃▄▅▆▇"[Math.round(total - fromBottom * 8) - 1] ?? " "; col = "cyan"; }
      if (ch !== " ") t.cell(cx, y + j, ch, t.attr({ fg: col }));
    }
  }
}

function spectrumMatrix(t, x, y, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = state.bins[Math.floor((i / w) * state.bins.length)] / 255;
      const on = (h - j) / h < v;
      const k = on ? clamp(Math.round(v * 4), 1, 4) : 0;
      t.cell(x + i, y + j, " ░▒▓"[k] ?? " ", t.attr({ fg: on ? (v > 0.75 ? "red" : v > 0.45 ? "yellow" : "cyan") : "track" }));
    }
  }
}

function spectrumWave(t, x, y, w, h) {
  const mid = Math.floor(h / 2);
  t.hline(x, y + mid, w, "─", t.attr({ fg: "line" }));
  for (let i = 0; i < w; i++) {
    const v = (state.scope[Math.floor((i / w) * state.scope.length)] ?? 128) / 255;
    const off = Math.round((v - 0.5) * (h - 1));
    for (let j = 0; j < h; j++) {
      const d = j - mid;
      if ((off >= 0 && d <= off && d >= 0) || (off < 0 && d >= off && d <= 0)) {
        t.cell(x + i, y + j, "│", t.attr({ fg: Math.abs(d) > h * 0.35 ? "magenta" : "accent" }));
      }
    }
  }
}

function draw(t, dt) {
  t.clear();
  if (state.playing) { schedule(dt); readSpectrum(); }
  // paused: an analyser that is not being fed holds its last frame, so the bars freeze rather than
  // draining to an empty box — the title says frozen, which is the truth of it. Before anything has
  // ever played there is no last frame, so the model's own steady state is shown and named "model".
  else {
    state.synthT += dt * 0.15;
    if (!state.bins.some((v) => v > 0)) synthSpectrum();
  }

  const compact = t.cols < 92;
  const tr = TRACKS[state.i];
  const body = { x: 0, y: 0, w: t.cols - 1, h: t.rows - 2 };

  const drawList = (r) => {
    const items = list();
    // on a phone the playlist is 18 rows and the screen is 40: rather than a tall empty box, fit the
    // box to the list and spend the rest of the screen on what is playing now
    const spare = r.h - (items.length + 2);
    const boxH = spare >= 6 ? items.length + 2 : r.h;
    t.box(r.x, r.y, r.w, boxH, { title: `playlist ${items.length}`, sub: state.filter ? `“${state.filter}”` : `${TRACKS.length} tracks`, corners: "light", style: { fg: "line" } });
    const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: boxH - 2 };
    const top = clamp(state.sel - Math.floor(inner.h / 2), 0, Math.max(0, items.length - inner.h));
    items.forEach((item, k) => {
      const y = inner.y + (k - top);
      if (y < inner.y || y > inner.y + inner.h - 1) return;
      const on = k === state.sel;
      const cur = item.i === state.i;
      const mark = cur ? (state.playing ? "▶" : "❙❙") : " ";
      const left = `${mark}${pad0(k + 1, 2)} ${pad(item.title, Math.max(6, inner.w - 20))}`;
      t.text(inner.x, y, left, t.attr({ fg: on ? "bg" : cur ? "accent" : "fg", bg: on ? "accent" : null, b: cur }));
      t.text(inner.x + inner.w - 6, y, pad(clock(item.len), 5, true), t.attr({ fg: on ? "bg" : "dim" }));
      t.hit(inner.x, y, inner.w, 1, () => { state.sel = k; state.i = item.i; state.pos = 0; state.step = 0; if (state.playing) { state.nextBeat = ctx ? ctx.currentTime + 0.05 : 0; } }, "row");
    });
    state.sel = clamp(state.sel, 0, Math.max(0, items.length - 1));
    if (boxH < r.h) {
      const cur = TRACKS[state.i];
      const y = r.y + boxH + 1;
      t.text(r.x, y, `${state.playing ? "▶" : "❙❙"} ${pad(cur.title, Math.max(6, r.w - 10))}`, t.attr({ fg: "accent", b: true }));
      t.text(r.x, y + 1, `   ${cur.artist} · ${cur.album}`, t.attr({ fg: "dim" }));
      t.bar(r.x, y + 2, r.w - 7, state.pos / cur.len, { fg: "accent", track: "─", trackFg: "line", head: "╪" });
      t.text(r.x + r.w - 6, y + 2, clock(Math.floor(state.pos)), t.attr({ fg: "dim" }));
      t.text(r.x, y + 3, `played ${state.played} · shuffle ${state.shuffle ? "on" : "off"} · repeat ${state.repeat} · 320kbm`, t.attr({ fg: "faint" }));
    }
  };

  const drawQueue = (r) => {
    // what plays next — shuffle on reorders it, and the panel says so rather than lying
    t.box(r.x, r.y, r.w, r.h, { title: "up next", sub: state.shuffle ? "shuffled" : "in order", corners: "light", style: { fg: "line" } });
    const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
    if (inner.h < 1) return;
    const order = state.shuffle ? [...state.queue].sort((a, b) => ((a * 7919 + b * 104729) % 97) - ((b * 7919 + a * 104729) % 97)) : state.queue;
    const from = order.indexOf(state.i);
    for (let k = 1; k <= inner.h; k++) {
      const idx = order[(from + k) % order.length];
      const tr2 = TRACKS[idx];
      const y = inner.y + k - 1;
      if (y > inner.y + inner.h - 1) break;
      t.text(inner.x, y, `${pad0(k, 2)} ${pad(tr2.title, inner.w - 16)} ${pad(clock(tr2.len), 5, true)}`, t.attr({ fg: "dim" }));
      t.hit(inner.x, y, inner.w, 1, () => { state.i = idx; state.sel = idx; state.pos = 0; state.step = 0; if (state.playing) state.nextBeat = ctx ? ctx.currentTime + 0.05 : 0; }, "queue");
    }
  };

  const drawSpectrum = (r) => {
    t.box(r.x, r.y, r.w, r.h, { title: `spectrum · ${state.viz}`, sub: !state.playing ? (state.played || state.pos ? "frozen" : "model") : state.audio === "live" ? "analyser" : "synthetic", corners: "light", style: { fg: "line" } });
    const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
    if (inner.h < 2 || inner.w < 8) return;
    if (state.viz === "bars") spectrumBars(t, inner.x, inner.y, inner.w, inner.h);
    else if (state.viz === "matrix") spectrumMatrix(t, inner.x, inner.y, inner.w, inner.h);
    else spectrumWave(t, inner.x, inner.y, inner.w, inner.h);
  };

  const drawNow = (r) => {
    t.box(r.x, r.y, r.w, r.h, { title: "now playing", sub: `${state.played} played`, corners: "light", style: { fg: "line" } });
    const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
    if (inner.h < 6 || inner.w < 20) return;
    const chh = clamp(inner.h - 2, 5, 20), cw = clamp(Math.floor(chh * 1.6), 12, Math.max(12, inner.w - 22));
    cover(t, inner.x + 1, inner.y + 1, cw, chh, tr.root * 31 + tr.bpm, true);
    const tx = inner.x + cw + 3;
    t.text(tx, inner.y + 1, tr.title, t.attr({ fg: "fg", b: true }));
    t.text(tx, inner.y + 2, tr.artist, t.attr({ fg: "accent" }));
    t.text(tx, inner.y + 3, tr.album, t.attr({ fg: "dim", i: true }));
    t.text(tx, inner.y + 4, `${tr.bpm} bpm · ${NOTE_NAMES[tr.root % 12]} ${tr.scale}`, t.attr({ fg: "faint" }));
    t.text(tx, inner.y + 5, `${state.audio === "live" ? "audio out" : "no audio out"}`, t.attr({ fg: "faint" }));
    t.text(tx, inner.y + 6, `320k · ${tr.bars} bars · ${state.shuffle ? "shuffled" : "in order"}`, t.attr({ fg: "faint" }));
    t.text(tx, inner.y + 7, `added Sun · played ${state.played}×`, t.attr({ fg: "faint" }));
    // the sleeve's own summary line runs under both of them, the way a player's does
    t.text(inner.x, Math.min(inner.y + chh + 1, inner.y + inner.h - 1), `album ${tr.album.toLowerCase().replace(/\s+/g, "-")} · track ${state.i + 1} of ${TRACKS.length} · queue ${state.queue.length}`, t.attr({ fg: "faint" }));
    // the pattern behind the track: these are the values the synth is actually running on
    const my = Math.min(inner.y + chh + 1, inner.y + inner.h - 1) + 1;
    if (my + 3 < inner.y + inner.h) {
      t.hline(inner.x, my, inner.w, "─", t.attr({ fg: "line2" }));
      t.text(inner.x, my + 1, `root ${NOTE_NAMES[tr.root % 12]} · scale ${tr.scale} · ${tr.bars} bars · hat ${Math.round(tr.hat * 100)}%`, t.attr({ fg: "dim" }));
      const deg = tr.scale === "dorian" ? "0 2 5 7 10" : tr.scale === "major" ? "0 2 4 7 9" : "0 3 5 7 10";
      t.text(inner.x, my + 2, `arp ${deg} · step ${tr.hat.toFixed(2)} · bars ${tr.bars}`, t.attr({ fg: "dim" }));
      t.text(inner.x, my + 3, `bass ${NOTE_NAMES[(tr.root + 7) % 12]} · ${tr.bpm}bpm · out ${state.audio === "live" ? "WebAudio" : "silent"}`, t.attr({ fg: "faint" }));
    }
  };

  if (compact) {
    // one pane at a time; the transport stays on screen whatever is showing
    const tabs = ["list", "now", "viz"];
    let x = 1;
    state.tab = state.tab ?? 0;
    tabs.forEach((label, i) => {
      const w = label.length + 4;
      const on = state.tab === i;
      t.text(x, 0, ` ${i + 1}:${label} `, t.attr({ fg: on ? "bg" : "dim", bg: on ? "accent" : null, b: on }));
      t.hit(x, 0, w, 1, () => (state.tab = i), "tab");
      x += w + 1;
    });
    t.text(0, 1, "─".repeat(t.cols), t.attr({ fg: "line" }));
    const r = { x: 0, y: 2, w: t.cols - 1, h: body.h - 3 };
    if (state.tab === 0) drawList(r);
    else if (state.tab === 1) drawNow({ ...r, h: Math.max(8, Math.floor(r.h * 0.5)) }), drawQueue({ ...r, y: r.y + Math.max(8, Math.floor(r.h * 0.5)) - 1, h: r.h - Math.max(8, Math.floor(r.h * 0.5)) + 1 });
    else drawSpectrum(r);
  } else {
    // three panels, no dead ground: the list and the queue share the left column, the record and
    // its spectrum share the right
    const lw = Math.max(26, Math.min(44, Math.round(t.cols * 0.34)));
    const listH = Math.max(8, Math.round(body.h * 0.58));
    drawList({ x: 0, y: 0, w: lw, h: listH });
    drawQueue({ x: 0, y: listH - 1, w: lw, h: body.h - listH + 2 });
    const nowH = Math.max(8, body.h - Math.min(12, Math.max(6, Math.round(body.h * 0.32))));
    drawNow({ x: lw + 1, y: 0, w: t.cols - lw - 2, h: nowH });
    drawSpectrum({ x: lw + 1, y: nowH - 1, w: t.cols - lw - 2, h: body.h - nowH + 2 });
  }

  // the transport: seek bar (tappable), time, volume, and the flags
  const ty = t.rows - 2;
  const barX = 7, barW = Math.max(10, t.cols - 26);
  t.text(0, ty, clock(state.pos), t.attr({ fg: "accent" }));
  t.bar(barX, ty, barW, state.pos / tr.len, { fg: "accent", track: "─", trackFg: "line", head: "╪" });
  t.text(t.cols - 6, ty, clock(tr.len), t.attr({ fg: "dim" }));
  t.hit(barX, ty, barW, 1, (dx) => { seekTo(dx / barW); if (!state.playing) play(true); }, "seek");
  const y = t.rows - 1;
  t.status(y, state.filtering ? [`filter “${state.filter}▌”  esc clears`] : [
    state.playing ? "▶ playing" : "❙❙ paused",
    state.muted ? "muted" : `vol ${Math.round(state.volume * 100)}%`,
    `shuffle ${state.shuffle ? "on" : "off"}`, `repeat ${state.repeat}`,
    `viz ${state.viz}`, `spectrum: ${state.audio}`,
  ], state.filtering ? [] : ["space play · j/k pick · Enter play · h/l seek · [ ] vol · v viz · s shuffle · r repeat"],
  { bg: "line2", fg: "bg" });
}

/* ------------------------------------------------------------------ input */

function onKey(k) {
  if (state.filtering) {
    if (k === "Esc") { state.filtering = false; state.filter = ""; return true; }
    if (k === "Enter") { state.filtering = false; return true; }
    if (k === "Backspace") { state.filter = state.filter.slice(0, -1); return true; }
    if (k.length === 1) { state.filter += k; return true; }
    return true;
  }
  const items = list();
  switch (k) {
    case "Space": case "p": play(); return true;
    case "j": case "ArrowDown": state.sel = clamp(state.sel + 1, 0, items.length - 1); return true;
    case "k": case "ArrowUp": state.sel = clamp(state.sel - 1, 0, items.length - 1); return true;
    case "Enter": {
      const it = items[state.sel];
      if (it) { state.i = it.i; state.pos = 0; state.step = 0; state.played++; play(true); }
      return true;
    }
    case "N": case "n": next(true); return true;
    case "P": prev(); return true;
    case "h": case "ArrowLeft": seekBy(-5); return true;
    case "l": case "ArrowRight": seekBy(5); return true;
    case "H": seekBy(-30); return true;
    case "L": seekBy(30); return true;
    case "[": state.volume = clamp(state.volume - 0.1, 0, 1); if (master) master.gain.value = state.muted ? 0 : state.volume * 0.5; return true;
    case "]": state.volume = clamp(state.volume + 0.1, 0, 1); if (master) master.gain.value = state.muted ? 0 : state.volume * 0.5; return true;
    case "m": state.muted = !state.muted; if (master) master.gain.value = state.muted ? 0 : state.volume * 0.5; window.tui.toast(state.muted ? "muted" : `unmuted · ${Math.round(state.volume * 100)}%`); return true;
    case "s": state.shuffle = !state.shuffle; window.tui.toast(`shuffle ${state.shuffle ? "on" : "off"}`); return true;
    case "r": state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off"; window.tui.toast(`repeat ${state.repeat}`); return true;
    case "v": state.viz = state.viz === "bars" ? "matrix" : state.viz === "matrix" ? "wave" : "bars"; return true;
    case "f": state.filtering = true; state.filter = ""; return true;
    case "1": case "2": if (window.tui?.compact) { state.tab = +k - 1; return true; } break;
    case "q":
      window.tui.quit({ command: "wave", line: `${state.played} track${state.played === 1 ? "" : "s"} played · ${state.seeks} seeks · spectrum was ${state.audio}` });
      return true;
    default: return false;
  }
}

function onTap(x, y, tui) {
  if (y === tui.rows - 2) return false;          // the seek bar owns its row
  return false;
}

createTUI({
  name: "wave",
  sub: "— music player · generative",
  font: '"Space Mono", ui-monospace, "DejaVu Sans Mono", monospace',
  size: 15, lh: 1.18, fps: 12, minCols: 34, compactAt: 92, glow: 4,
  palette: PAL,
  keys: [
    { k: "Space", l: "play" }, { k: "j", l: "down" }, { k: "k", l: "up" }, { k: "Enter", l: "cue" }, "sep",
    { k: "h", l: "−5s" }, { k: "l", l: "+5s" }, { k: "[", l: "vol−" }, { k: "]", l: "vol+" }, "sep",
    { k: "v", l: "viz" }, { k: "s", l: "shuf" }, { k: "r", l: "repeat" }, { k: "m", l: "mute" }, { k: "f", l: "filter" }, { k: "q", l: "quit" },
  ],
  help: [
    ["Space or p", "play / pause — this is also what unlocks the audio on a phone"],
    ["j / k, ↑ ↓", "walk the playlist (tap a row to cue it, tap twice to play it)"],
    ["Enter or n", "play the selected track / next track"],
    ["h / l, ← →", "seek −5 s / +5 s; tap the seek bar anywhere to jump"],
    ["[ / ], m", "volume down, up, mute"],
    ["v", "visualiser: bars → matrix → wave"],
    ["s, r", "shuffle, repeat off → all → one"],
    ["f", "filter the playlist by title, artist or album"],
    ["1 2", "on a phone: playlist, now playing"],
    ["q", "quit to the exit panel"],
  ],
  draw, onKey, onTap,
  pills: () => ({ a: state.playing ? "▶ " + TRACKS[state.i].title.slice(0, 18) : "❙❙ paused", b: `${state.audio} spectrum` }),
  state: () => ({
    track: TRACKS[state.i].title, artist: TRACKS[state.i].artist, album: TRACKS[state.i].album,
    index: state.i, sel: state.sel, playing: state.playing,
    pos: +state.pos.toFixed(2), len: TRACKS[state.i].len,
    volume: +state.volume.toFixed(2), muted: state.muted,
    shuffle: state.shuffle, repeat: state.repeat, viz: state.viz,
    filter: state.filter, spectrum: state.audio, played: state.played, seeks: state.seeks,
    bins_nonzero: Array.from(state.bins).filter((v) => v > 8).length,
    audio_ready: !!ctx, audio_error: audioError ? String(audioError.message) : null,
  }),
  api: {
    select: (i) => { state.sel = clamp(+i, 0, list().length - 1); const it = list()[state.sel]; if (it) { state.i = it.i; state.pos = 0; } return TRACKS[state.i].title; },
    play: (v) => { play(v === undefined ? !state.playing : !!v); return state.playing; },
    pause: () => { play(false); return false; },
    seek: (s) => { state.pos = clamp(+s, 0, TRACKS[state.i].len); state.seeks++; return state.pos; },
    seekTo: (frac) => { seekTo(+frac); return state.pos; },
    volume: (v) => { state.volume = clamp(+v, 0, 1); if (master) master.gain.value = state.muted ? 0 : state.volume * 0.5; return state.volume; },
    viz: (m) => { if (["bars", "matrix", "wave"].includes(m)) state.viz = m; return state.viz; },
    shuffle: (v) => { state.shuffle = v === undefined ? !state.shuffle : !!v; return state.shuffle; },
    repeat: (m) => { if (["off", "all", "one"].includes(m)) state.repeat = m; return state.repeat; },
    next: () => { next(true); return TRACKS[state.i].title; },
    filter: (s) => { state.filter = String(s ?? ""); return list().length; },
    tab: (i) => { state.tab = clamp(+i, 0, 1); return state.tab; },
    quit: () => onKey("q"),
    resume: () => window.tui.resume(),
  },
});
