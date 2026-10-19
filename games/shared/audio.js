// Arcade sound, synthesised in WebAudio — the site stays plain files with no audio assets.
// Voices are short square/triangle blips, noise bursts and arpeggios, the way a coin-op board
// did it. Every game calls these from its own events; M mutes, and the context wakes up on the
// first key press so autoplay rules stay satisfied.
const SEMI = (n) => 440 * Math.pow(2, n / 12);

export function createAudio({ master = 0.45, delay = 0.16, delayMix = 0.14, feedback = 0.3 } = {}) {
  let ctx = null, out = null, tape = null, damp = null, fb = null, wet = null, comp = null, tap = null;
  let music = null;
  let muted = false;
  let gestured = false;        // autoplay policy: nothing is scheduled before the first keypress
  let pendingMusic = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = muted ? 0 : master;

      // one feedback path, well under unity gain, damped so it cannot self-oscillate
      tape = ctx.createDelay(0.5);
      tape.delayTime.value = delay;
      damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 2200;
      fb = ctx.createGain();
      fb.gain.value = Math.min(0.6, feedback);
      wet = ctx.createGain();
      wet.gain.value = delayMix;
      tape.connect(damp);
      damp.connect(fb);
      fb.connect(tape);        // tape → damp → fb → tape   (loop gain = feedback)
      tape.connect(wet);       // tape → wet → out
      wet.connect(out);

      // a compressor keeps stacked arcade sounds (music + blips + explosions) off the ceiling
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      out.connect(comp);
      comp.connect(ctx.destination);

      // a meter so the sound can be measured headlessly, not just listened to
      tap = ctx.createGain();
      tap.gain.value = 1;
      out.connect(tap);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const now = () => (ctx ? ctx.currentTime : 0);

  function voice(freq, { to = null, dur = 0.12, type = "square", gain = 0.25, at = 0, send = 0.22, detune = 0 } = {}) {
    if (!gestured || !ensure()) return;
    const t = now() + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(out);
    if (send > 0) g.connect(tape);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function burst({ dur = 0.2, gain = 0.3, at = 0, freq = 1200, to = null, q = 1, type = "lowpass", send = 0.12 } = {}) {
    if (!gestured || !ensure()) return;
    const t = now() + at;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    if (send > 0) g.connect(tape);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function arp(notes, step = 0.06, opts = {}) {
    notes.forEach((n, i) => voice(SEMI(n), { ...opts, at: i * step, dur: opts.dur ?? 0.12 }));
  }

  // ---- a tiny step sequencer for background music ------------------------------------
  function startMusic(opts = {}) {
    if (!gestured) { pendingMusic = opts; return; }   // start it on the first keypress
    const {
      bpm = 132, bass = null, lead = null, hat = true, kick = true,
      leadType = "square", leadGain = 0.055, bassGain = 0.1,
    } = opts;
    if (!ensure()) return;
    stopMusic();
    const sixteenth = 60 / bpm / 4;
    let i = 0, next = now() + 0.08;
    const bassNotes = bass ?? [0, null, 0, null, 7, null, 0, null, 5, null, 0, null, 3, null, 7, null];
    const leadNotes = lead ?? [null, null, null, null, null, null, null, null,
                               null, null, null, null, null, null, null, null];
    const tick = () => {
      if (!ctx) return;
      while (next < now() + 0.12) {
        const at = next - now();
        const b = bassNotes[i % bassNotes.length];
        if (b !== null && b !== undefined) {
          voice(SEMI(b - 24), { dur: sixteenth * 2.2, type: "triangle", gain: bassGain, at, send: 0.06 });
        }
        const l = leadNotes[i % leadNotes.length];
        if (l !== null && l !== undefined) voice(SEMI(l), { dur: sixteenth * 1.6, type: leadType, gain: leadGain, at, send: 0.3 });
        if (kick && i % 4 === 0) burst({ dur: 0.11, gain: 0.18, freq: 160, to: 45, at, q: 6, send: 0.04 });
        if (hat && i % 2 === 1) burst({ dur: 0.035, gain: 0.035, freq: 8000, type: "highpass", at, send: 0.04 });
        next += sixteenth;
        i++;
      }
    };
    music = setInterval(tick, 25);
    tick();
  }

  function stopMusic() {
    pendingMusic = null;
    if (music) { clearInterval(music); music = null; }
  }

  const sfx = {
    blip: (f = 620) => voice(f, { to: f * 1.25, dur: 0.06, gain: 0.18 }),
    bounce: (v = 1) => voice(180 + 150 * v, { to: 120 + 90 * v, dur: 0.08, gain: 0.2, send: 0.15 }),
    wall: (v = 1) => voice(320 + 90 * v, { to: 200, dur: 0.07, type: "triangle", gain: 0.16, send: 0.1 }),
    brick: (n = 0) => {
      voice(SEMI(9 + (n % 8)), { to: SEMI(16 + (n % 8)), dur: 0.07, gain: 0.18, send: 0.16 });
      burst({ dur: 0.1, gain: 0.09, freq: 3200, to: 900 });
    },
    crack: () => burst({ dur: 0.16, gain: 0.16, freq: 1800, to: 400, q: 2 }),
    shatter: () => {
      burst({ dur: 0.42, gain: 0.2, freq: 2400, to: 260 });
      voice(SEMI(-8), { to: SEMI(-20), dur: 0.3, type: "sawtooth", gain: 0.1 });
    },
    coin: () => {
      voice(SEMI(19), { dur: 0.06, gain: 0.2, send: 0.15 });
      voice(SEMI(24), { dur: 0.16, gain: 0.2, at: 0.07, send: 0.25 });
    },
    score: (n = 0) => voice(SEMI(12 + (n % 5) * 2), { dur: 0.05, gain: 0.12, send: 0.1 }),
    power: () => arp([12, 16, 19, 24], 0.055, { dur: 0.12, gain: 0.16 }),
    jump: () => voice(SEMI(5), { to: SEMI(17), dur: 0.13, gain: 0.18, send: 0.2 }),
    land: () => burst({ dur: 0.09, gain: 0.12, freq: 700, to: 180, send: 0.08 }),
    dash: () => {
      burst({ dur: 0.22, gain: 0.14, freq: 400, to: 3200, type: "highpass" });
      voice(SEMI(17), { to: SEMI(5), dur: 0.18, gain: 0.09, type: "triangle" });
    },
    laser: () => voice(SEMI(24), { to: SEMI(5), dur: 0.16, type: "sawtooth", gain: 0.12, send: 0.3 }),
    explode: () => {
      burst({ dur: 0.5, gain: 0.28, freq: 1100, to: 90, q: 3, send: 0.2 });
      voice(SEMI(-14), { to: SEMI(-26), dur: 0.45, type: "sawtooth", gain: 0.14, send: 0.15 });
    },
    hit: () => {
      voice(SEMI(2), { to: SEMI(-6), dur: 0.12, type: "square", gain: 0.18 });
      burst({ dur: 0.12, gain: 0.12, freq: 900, to: 300 });
    },
    die: () => arp([12, 7, 3, -2, -7], 0.11, { dur: 0.2, gain: 0.18, type: "square" }),
    gameOver: () => arp([0, -5, -12, -17], 0.16, { dur: 0.34, gain: 0.17, type: "triangle" }),
    win: () => arp([12, 16, 19, 24, 28, 31], 0.085, { dur: 0.2, gain: 0.16 }),
    start: () => arp([12, 19, 24], 0.06, { dur: 0.12, gain: 0.16 }),
    select: () => voice(SEMI(14), { dur: 0.045, gain: 0.12, send: 0.1 }),
    tick: () => voice(SEMI(24), { dur: 0.03, gain: 0.08, type: "triangle", send: 0.05 }),
  };

  function setMuted(m) {
    muted = m;
    if (out) out.gain.setTargetAtTime(m ? 0 : master, ctx.currentTime, 0.02);
    try { localStorage.setItem("arcade-muted", m ? "1" : "0"); } catch { /* private mode */ }
  }
  function isMuted() { return muted; }

  // Peak level of everything the game sends to the speakers, for headless checks:
  // a runaway feedback loop shows up as a peak that keeps climbing and never decays.
  function meter() {
    if (!ensure()) return null;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    tap.connect(an);
    const buf = new Float32Array(an.fftSize);
    return {
      peak() {
        an.getFloatTimeDomainData(buf);
        let p = 0;
        for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
        return p;
      },
      stop() { tap.disconnect(an); },
    };
  }

  try { muted = localStorage.getItem("arcade-muted") === "1"; } catch { /* private mode */ }

  // wake the context on the first press (autoplay policy)
  const wake = () => {
    gestured = true;
    ensure();
    if (pendingMusic) { const p = pendingMusic; pendingMusic = null; startMusic(p); }
    window.removeEventListener("keydown", wake);
    window.removeEventListener("pointerdown", wake);
  };
  window.addEventListener("keydown", wake);
  window.addEventListener("pointerdown", wake);

  return {
    sfx, startMusic, stopMusic, setMuted, isMuted, ensure, meter,
    get context() { return ctx; },
    get gestured() { return gestured; },
  };
}

/** Returns true when the key is the mute toggle; pair with the game's keydown handler. */
export function audioKey(code, audio) {
  if (code !== "KeyM") return false;
  audio.setMuted(!audio.isMuted());
  return true;
}
