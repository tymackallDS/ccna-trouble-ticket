/* Harbor Point Night Shift: optional sound. A generative "night shift" ambience and a few quiet effects.
 *
 * Off by default. Nothing is created or played until the learner turns sound on from the speaker
 * button in the masthead. Everything is synthesized live with the Web Audio API: no audio files,
 * no downloads, nothing to license.
 *
 *   TT.sfx(name)        play one effect (a no-op when sound or effects are off). Names: TT.audio.NAMES.
 *   TT.audio.get()      a copy of the settings
 *   TT.audio.set(patch) change settings ({on, music, musicVol, sfx, sfxVol}); saved to localStorage
 *   TT.audio.toggle()   flip the master switch
 *   document.dispatchEvent(new CustomEvent('tt:sfx', { detail: { name } }))   same as TT.sfx(name)
 *
 * Music: a low server-room bed (filtered noise plus a quiet 60 Hz hum and its harmonics), a warm pad
 * that drifts through a D minor / modal chord palette every 8-16 s through a lowpass filter, a slow
 * LFO and a generated convolution reverb, and every 20-40 s a sparse distant pluck or harbor tone.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  const doc = G.document;
  const KEY = 'trouble-ticket-audio-v1';
  const DEFAULTS = Object.freeze({ on: false, music: true, musicVol: 0.35, sfx: true, sfxVol: 0.6 });
  const GAP_MS = 120; // the same effect never plays twice within this window
  const NAMES = ['pager', 'resolve', 'promote', 'badge', 'ping-ok', 'ping-fail', 'link-up', 'link-down', 'flip', 'correct', 'wrong', 'scene-step', 'clockin'];

  /* ---------- settings ---------- */
  const clamp01 = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
  function clean(s) {
    s = s && typeof s === 'object' ? s : {};
    return {
      on: s.on === true,
      music: s.music === undefined ? DEFAULTS.music : s.music === true,
      musicVol: clamp01(s.musicVol, DEFAULTS.musicVol),
      sfx: s.sfx === undefined ? DEFAULTS.sfx : s.sfx === true,
      sfxVol: clamp01(s.sfxVol, DEFAULTS.sfxVol),
    };
  }
  function load() {
    try {
      const raw = G.localStorage && G.localStorage.getItem(KEY);
      return clean(raw ? JSON.parse(raw) : null);
    } catch (e) { return clean(null); }
  }
  function store(s) {
    try { if (G.localStorage) G.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* blocked storage: the choice just won't stick */ }
  }
  let S = load();

  /* ---------- rate limiter ---------- */
  const lastAt = {};
  /** True (and remembered) when `name` may play at time `now` (ms); false within GAP_MS of its last play. */
  function allow(name, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const prev = lastAt[name];
    if (prev !== undefined && t - prev < GAP_MS && t >= prev) return false;
    lastAt[name] = t;
    return true;
  }

  /* ---------- level curves ----------
   * The slider is linear; gain follows a power curve so the middle of the slider sounds like the middle.
   * At the default music volume the ambience measures roughly -24 LUFS (see tests/notes in the report). */
  const MUSIC_REF = 0.85;
  const SFX_REF = 1.0;
  const musicGain = (v) => (v <= 0 ? 0 : MUSIC_REF * Math.pow(v / DEFAULTS.musicVol, 1.6));
  const sfxGain = (v) => (v <= 0 ? 0 : SFX_REF * Math.pow(v / DEFAULTS.sfxVol, 1.6));

  /* ---------- small synthesis helpers (work on any BaseAudioContext, so they can render offline) ---------- */
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /** A stereo impulse response: decaying noise that darkens as it fades, with a short pre-delay. */
  function makeIR(c, seconds, predelay, bright) {
    const rate = c.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const pre = Math.floor(rate * predelay);
    const buf = c.createBuffer(2, len, rate);
    const tau = seconds / 6.9; // about -60 dB at the end
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        // one-pole lowpass whose cutoff falls over time: the tail gets darker, like a big room
        const k = Math.max(0.04, bright * Math.exp(-t / (seconds * 0.35)));
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t / tau);
      }
    }
    return buf;
  }

  /** A looping brown-noise buffer whose ends meet, so the loop point never clicks. */
  function makeNoise(c, seconds) {
    const rate = c.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = c.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) { v = (v + 0.02 * (Math.random() * 2 - 1)) * 0.998; d[i] = v; }
    const drift = d[len - 1] - d[0];
    let peak = 0;
    for (let i = 0; i < len; i++) { d[i] -= drift * (i / (len - 1)); peak = Math.max(peak, Math.abs(d[i])); }
    for (let i = 0; i < len; i++) d[i] /= peak || 1;
    return buf;
  }

  /** Plain white noise for the effects (paper, a card, a relay click). */
  function makeWhite(c, seconds) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Attack-hold-release envelope on a gain param. */
  function env(p, t, peak, a, hold, rel) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setValueAtTime(peak, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  /** One short tone: an oscillator through an optional lowpass and an envelope, into out (and a reverb send). */
  function tone(c, out, o) {
    const t = o.t;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || o.a + o.d));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    g.gain.value = 0;
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; osc.connect(f); node = f; }
    node.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.g, t + o.a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.a + o.d);
    g.connect(out.dry);
    if (out.wet && o.wet) { const s = c.createGain(); s.gain.value = o.wet; g.connect(s); s.connect(out.wet); }
    osc.start(t);
    osc.stop(t + o.a + o.d + 0.05);
    osc.onended = () => { try { g.disconnect(); } catch (e) { /* already gone */ } };
  }

  /** A short filtered noise burst (paper, a card flip, a relay click). */
  function noiseHit(c, out, noise, o) {
    const t = o.t;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.a + o.d);
    f.Q.value = o.q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.g, t + o.a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.a + o.d);
    src.connect(f); f.connect(g); g.connect(out.dry);
    if (out.wet && o.wet) { const s = c.createGain(); s.gain.value = o.wet; g.connect(s); s.connect(out.wet); }
    src.start(t, Math.random() * 2);
    src.stop(t + o.a + o.d + 0.05);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* already gone */ } };
  }

  /* ---------- the effects: each under ~600 ms, soft attacks, nothing bright or arcade-like ---------- */
  // Peak levels are low on purpose: they sit just above the ambience at the default volumes.
  const FX = {
    // two soft chirps, a pager on the desk two cubicles over
    pager(c, o, t, n) {
      tone(c, o, { t, f0: 1318, f1: 1250, a: 0.008, d: 0.09, g: 0.07, lp: 3000, wet: 0.25 });
      tone(c, o, { t: t + 0.14, f0: 1568, f1: 1480, a: 0.008, d: 0.11, g: 0.06, lp: 3000, wet: 0.3 });
    },
    // a stamp coming down on the ticket: a low thunk and a little paper
    resolve(c, o, t, n) {
      tone(c, o, { t, f0: 140, f1: 58, glide: 0.12, a: 0.004, d: 0.28, g: 0.13, lp: 600, wet: 0.15 });
      noiseHit(c, o, n, { t: t + 0.005, f0: 2600, a: 0.003, d: 0.07, g: 0.06, q: 0.6, wet: 0.1 });
      noiseHit(c, o, n, { t: t + 0.07, f0: 1800, f1: 3200, a: 0.02, d: 0.12, g: 0.025, q: 0.5 });
    },
    // rank up: a gentle rising F-A-C chime (the relative major of the D minor ambience)
    promote(c, o, t, n) {
      [698.5, 880, 1046.5].forEach((f, i) => {
        tone(c, o, { t: t + i * 0.12, f0: f, a: 0.01, d: 0.42 - i * 0.04, g: 0.06, lp: 2600, wet: 0.45 });
        tone(c, o, { t: t + i * 0.12, f0: f * 2, a: 0.01, d: 0.18, g: 0.012, lp: 4000, wet: 0.4 });
      });
    },
    // badge: one small bell (inharmonic partials, quick fade)
    badge(c, o, t, n) {
      tone(c, o, { t, f0: 1174.7, a: 0.006, d: 0.5, g: 0.06, wet: 0.45 });
      tone(c, o, { t, f0: 1174.7 * 2.76, a: 0.004, d: 0.16, g: 0.012, wet: 0.3 });
      tone(c, o, { t, f0: 587.3, a: 0.01, d: 0.35, g: 0.025, wet: 0.3 });
    },
    // the echo reply arrives: a soft blip
    'ping-ok'(c, o, t, n) {
      tone(c, o, { t, f0: 1100, f1: 1400, glide: 0.05, a: 0.006, d: 0.12, g: 0.06, lp: 3200, wet: 0.2 });
    },
    // the ping dies: a muted low buzz
    'ping-fail'(c, o, t, n) {
      tone(c, o, { t, f0: 110, f1: 92, a: 0.012, d: 0.22, g: 0.05, type: 'sawtooth', lp: 380, wet: 0.08 });
      tone(c, o, { t, f0: 110.8, f1: 92.6, a: 0.012, d: 0.22, g: 0.03, type: 'square', lp: 300 });
    },
    // a link light goes green: a tiny rising tick
    'link-up'(c, o, t, n) {
      tone(c, o, { t, f0: 880, f1: 1320, glide: 0.04, a: 0.003, d: 0.06, g: 0.065, lp: 3500, wet: 0.15 });
    },
    // a link light goes out: a small falling tone
    'link-down'(c, o, t, n) {
      tone(c, o, { t, f0: 660, f1: 392, glide: 0.1, a: 0.004, d: 0.13, g: 0.065, type: 'triangle', lp: 1800, wet: 0.12 });
    },
    // a flashcard turns over: a soft paper swish
    flip(c, o, t, n) {
      noiseHit(c, o, n, { t, f0: 900, f1: 2600, a: 0.025, d: 0.08, g: 0.07, q: 0.7 });
    },
    // a practice answer is right: two soft rising notes
    correct(c, o, t, n) {
      tone(c, o, { t, f0: 659.3, a: 0.008, d: 0.18, g: 0.075, type: 'triangle', lp: 2400, wet: 0.3 });
      tone(c, o, { t: t + 0.09, f0: 880, a: 0.008, d: 0.28, g: 0.075, type: 'triangle', lp: 2400, wet: 0.35 });
    },
    // a practice answer is wrong: one low, muted, slightly beating tone (a nudge, not a buzzer)
    wrong(c, o, t, n) {
      tone(c, o, { t, f0: 233, f1: 220, a: 0.012, d: 0.24, g: 0.05, type: 'triangle', lp: 900, wet: 0.15 });
      tone(c, o, { t, f0: 226, f1: 214, a: 0.012, d: 0.24, g: 0.035, type: 'triangle', lp: 900 });
    },
    // a scene moves on: the faintest tick
    'scene-step'(c, o, t, n) {
      tone(c, o, { t, f0: 2200, f1: 1900, a: 0.002, d: 0.035, g: 0.026, lp: 5000, wet: 0.1 });
    },
    // the time clock: a muffled punch, then a low warm tone
    clockin(c, o, t, n) {
      noiseHit(c, o, n, { t, f0: 1400, a: 0.002, d: 0.04, g: 0.06, q: 1.2 });
      tone(c, o, { t, f0: 180, f1: 120, glide: 0.05, a: 0.002, d: 0.08, g: 0.08, lp: 500 });
      tone(c, o, { t: t + 0.07, f0: 293.7, a: 0.03, d: 0.45, g: 0.035, type: 'triangle', lp: 1200, wet: 0.4 });
    },
  };
  // Bigger cues get a moment to themselves: a pager page that lands with them waits until they finish.
  const CUE = { resolve: 0.32, promote: 0.55, clockin: 0.4 };
  const WAITS = { pager: 1, badge: 1 };

  /* ---------- the music ---------- */
  // Chords as MIDI notes: a bass note, then the pad voicing. D minor / dorian with a lydian colour on Bb.
  const CHORDS = {
    Dm9: [38, 50, 57, 60, 64],
    Bbmaj7: [34, 50, 53, 57, 64], // with the E on top (#11)
    Fmaj9: [41, 53, 57, 60, 67],
    Am11: [45, 52, 55, 60, 62],
    Gm9: [43, 50, 53, 57, 58],
    Csus2: [36, 55, 60, 62, 67],
  };
  // Where each chord likes to go next: gentle movement, no strong cadences.
  const NEXT = {
    Dm9: ['Bbmaj7', 'Fmaj9', 'Am11', 'Gm9'],
    Bbmaj7: ['Fmaj9', 'Dm9', 'Csus2', 'Gm9'],
    Fmaj9: ['Csus2', 'Dm9', 'Bbmaj7', 'Am11'],
    Am11: ['Dm9', 'Fmaj9', 'Bbmaj7'],
    Gm9: ['Dm9', 'Bbmaj7', 'Csus2'],
    Csus2: ['Fmaj9', 'Dm9', 'Am11'],
  };

  /**
   * Build the ambience on any audio context into `dest`. tick(horizon) schedules everything due before
   * currentTime + horizon, so a live context calls it every second and an offline one calls it once.
   */
  function Music(c, dest) {
    const out = c.createGain();
    out.gain.value = 1;
    out.connect(dest);
    const rev = c.createConvolver();
    rev.buffer = makeIR(c, 4.5, 0.03, 0.55);
    const revIn = c.createGain();
    revIn.gain.value = 1;
    revIn.connect(rev);
    rev.connect(out);
    const noise = makeNoise(c, 9);
    const nodes = [];
    const keep = (n) => { nodes.push(n); return n; };

    // bed: air handling and a rack of fans (brown noise, rumble plus a faint airy band)
    const ns = keep(c.createBufferSource());
    ns.buffer = noise; ns.loop = true;
    const lo = c.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = 280; lo.Q.value = 0.4;
    const hi = c.createBiquadFilter(); hi.type = 'highpass'; hi.frequency.value = 45;
    const bedG = c.createGain(); bedG.gain.value = 0.05;
    ns.connect(lo); lo.connect(hi); hi.connect(bedG); bedG.connect(out);
    const air = c.createBiquadFilter(); air.type = 'bandpass'; air.frequency.value = 1100; air.Q.value = 0.6;
    const airG = c.createGain(); airG.gain.value = 0.006;
    ns.connect(air); air.connect(airG); airG.connect(out);
    // the air breathes very slowly
    const bedL = keep(c.createOscillator()); bedL.frequency.value = 0.041;
    const bedLG = c.createGain(); bedLG.gain.value = 0.012;
    bedL.connect(bedLG); bedLG.connect(bedG.gain);

    // mains hum: 60 Hz (Baltimore) with the harmonics small speakers can actually reproduce
    [[60, 0.006], [120, 0.004], [180, 0.0015], [240, 0.0006]].forEach(([f, g]) => {
      const o = keep(c.createOscillator()); o.frequency.value = f;
      const og = c.createGain(); og.gain.value = g;
      o.connect(og); og.connect(out);
    });

    // pad: voices -> shared lowpass (slow LFO on the cutoff) -> dry + reverb
    const padF = c.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 820; padF.Q.value = 0.6;
    const padLfo = keep(c.createOscillator()); padLfo.frequency.value = 0.047;
    const padLfoG = c.createGain(); padLfoG.gain.value = 260;
    padLfo.connect(padLfoG); padLfoG.connect(padF.frequency);
    const padOut = c.createGain(); padOut.gain.value = 1;
    padF.connect(padOut);
    const padDry = c.createGain(); padDry.gain.value = 0.55; padOut.connect(padDry); padDry.connect(out);
    const padWet = c.createGain(); padWet.gain.value = 0.85; padOut.connect(padWet); padWet.connect(revIn);
    // a second, slower LFO breathes the pad level a little
    const swell = keep(c.createOscillator()); swell.frequency.value = 0.019;
    const swellG = c.createGain(); swellG.gain.value = 0.12;
    swell.connect(swellG); swellG.connect(padOut.gain);

    const t0 = c.currentTime + 0.05;
    nodes.forEach((n) => n.start(t0));

    let chord = pick(['Dm9', 'Fmaj9', 'Bbmaj7']);
    let nextChord = t0;
    let nextTex = t0 + rnd(14, 24);
    let alive = true;
    const voices = []; // {stopAt, nodes}

    function playChord(t, dur) {
      const notes = CHORDS[chord];
      const att = rnd(3.5, 5.5);
      const rel = rnd(5, 7);
      const end = t + dur + 0.2; // hold until the next chord has begun to swell in
      notes.forEach((m, i) => {
        const bass = i === 0;
        const g = c.createGain();
        const p = c.createStereoPanner ? c.createStereoPanner() : null;
        const peak = bass ? 0.06 : 0.032 * (i === notes.length - 1 ? 0.7 : 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + att);
        g.gain.setValueAtTime(peak, end);
        g.gain.linearRampToValueAtTime(0.0001, end + rel);
        if (p) { p.pan.value = bass ? 0 : rnd(-0.45, 0.45); g.connect(p); p.connect(padF); } else g.connect(padF);
        const f = mtof(m);
        const oscs = bass
          ? [['sine', 0], ['triangle', 4]]
          : [['sawtooth', -7 + rnd(-2, 2)], ['triangle', 6 + rnd(-2, 2)]];
        oscs.forEach(([type, det]) => {
          const o = c.createOscillator();
          o.type = type; o.frequency.value = f; o.detune.value = det;
          const og = c.createGain(); og.gain.value = type === 'sawtooth' ? 0.55 : 1;
          o.connect(og); og.connect(g);
          o.start(t); o.stop(end + rel + 0.1);
          o.onended = () => { try { og.disconnect(); } catch (e) { /* gone */ } };
        });
        voices.push({ stopAt: end + rel + 0.1, g });
      });
    }

    function texture(t) {
      const notes = CHORDS[chord];
      if (Math.random() < 0.62) {
        // a soft, distant pluck an octave above one of the chord's upper notes
        const m = pick(notes.slice(2)) + 12;
        const p = c.createStereoPanner ? c.createStereoPanner() : null;
        const g = c.createGain(); g.gain.value = 1;
        if (p) { p.pan.value = rnd(-0.6, 0.6); g.connect(p); p.connect(out); } else g.connect(out);
        tone(c, { dry: g, wet: revIn }, { t, f0: mtof(m), a: 0.012, d: 2.6, g: 0.022, type: 'triangle', lp: 1500, wet: 1.6 });
        if (Math.random() < 0.5) tone(c, { dry: g, wet: revIn }, { t: t + rnd(0.35, 0.6), f0: mtof(pick(notes.slice(2)) + 12), a: 0.012, d: 2.2, g: 0.014, type: 'triangle', lp: 1400, wet: 1.6 });
      } else {
        // a harbor horn far across the water: low, slow, almost all reverb
        const f = mtof(pick([38, 41, 36]));
        [0, 0.6].forEach((det, k) => {
          const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f + det; osc.detune.value = k ? 5 : -5;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.7;
          const g = c.createGain();
          env(g.gain, t, 0.022, 1.8, 1.4, 3.2);
          const dry = c.createGain(); dry.gain.value = 0.25;
          osc.connect(lp); lp.connect(g); g.connect(dry); dry.connect(out); g.connect(revIn);
          osc.start(t); osc.stop(t + 6.6);
          osc.onended = () => { try { g.disconnect(); } catch (e) { /* gone */ } };
        });
      }
    }

    function tick(horizon) {
      if (!alive) return;
      const until = c.currentTime + horizon;
      while (nextChord < until) {
        const dur = rnd(8, 16);
        playChord(nextChord, dur);
        nextChord += dur;
        chord = pick(NEXT[chord]);
      }
      while (nextTex < until) {
        texture(nextTex);
        nextTex += rnd(20, 40);
      }
      for (let i = voices.length - 1; i >= 0; i--) {
        if (voices[i].stopAt < c.currentTime) { try { voices[i].g.disconnect(); } catch (e) { /* gone */ } voices.splice(i, 1); }
      }
    }

    function stop(at) {
      alive = false;
      const t = at || c.currentTime;
      nodes.forEach((n) => { try { n.stop(t); } catch (e) { /* not started */ } });
      setTimeoutSafe(() => { try { out.disconnect(); } catch (e) { /* gone */ } }, Math.max(0, (t - c.currentTime) * 1000) + 200);
    }

    return { tick, stop, out, get chord() { return chord; } };
  }
  const setTimeoutSafe = (f, ms) => (G.setTimeout ? G.setTimeout(f, ms) : null);

  /* ---------- the live engine ---------- */
  const E = { ctx: null, master: null, musicBus: null, sfxBus: null, sfxRev: null, noise: null, music: null, timer: null, idle: null, cueUntil: 0 };

  function AC() { return G.AudioContext || G.webkitAudioContext || null; }

  /** Create the context and buses. Call only from a user gesture. */
  function ensureCtx() {
    if (E.ctx) return E.ctx;
    const Ctor = AC();
    if (!Ctor) return null;
    let c;
    try { c = new Ctor({ latencyHint: 'playback' }); } catch (e) { try { c = new Ctor(); } catch (e2) { return null; } }
    E.ctx = c;
    // a gentle safety limiter at the end of the chain
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -12; lim.knee.value = 8; lim.ratio.value = 6; lim.attack.value = 0.005; lim.release.value = 0.25;
    lim.connect(c.destination);
    E.master = c.createGain(); E.master.gain.value = 0; E.master.connect(lim);
    E.musicBus = c.createGain(); E.musicBus.gain.value = 0; E.musicBus.connect(E.master);
    E.sfxBus = c.createGain(); E.sfxBus.gain.value = sfxGain(S.sfxVol); E.sfxBus.connect(E.master);
    E.sfxRev = c.createConvolver(); E.sfxRev.buffer = makeIR(c, 1.6, 0.012, 0.6); E.sfxRev.connect(E.sfxBus);
    E.noise = makeWhite(c, 3);
    return c;
  }

  const ramp = (p, v, secs) => {
    const c = E.ctx;
    const t = c.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(v, t + secs);
  };

  function resume() { if (E.ctx && E.ctx.state === 'suspended' && !(doc && doc.hidden)) { try { E.ctx.resume(); } catch (e) { /* ignore */ } } }

  function startMusic() {
    if (!E.ctx || E.music) return;
    E.music = Music(E.ctx, E.musicBus);
    E.music.tick(4);
    E.timer = G.setInterval(() => { if (E.music) E.music.tick(4); }, 1000);
    ramp(E.musicBus.gain, musicGain(S.musicVol), 4); // fade in over 4 s
  }

  function stopMusic(fade) {
    if (!E.ctx || !E.music) return;
    const m = E.music;
    E.music = null;
    G.clearInterval(E.timer); E.timer = null;
    const secs = fade == null ? 2.5 : fade;
    ramp(E.musicBus.gain, 0, secs);
    m.stop(E.ctx.currentTime + secs + 0.1);
  }

  /** Bring the engine in line with the settings. Safe to call any time; makes no sound unless on. */
  function apply(fromGesture) {
    if (fromGesture && S.on) ensureCtx();
    const c = E.ctx;
    if (!c) return;
    if (!S.on) {
      stopMusic(0.8);
      ramp(E.master.gain, 0, 0.8);
      G.clearTimeout(E.idle);
      E.idle = G.setTimeout(() => { if (!S.on && E.ctx) E.ctx.suspend(); }, 1000);
      return;
    }
    G.clearTimeout(E.idle);
    resume();
    ramp(E.master.gain, 1, 0.05);
    ramp(E.sfxBus.gain, S.sfx ? sfxGain(S.sfxVol) : 0, 0.05);
    if (S.music) {
      if (!E.music) startMusic();
      else ramp(E.musicBus.gain, musicGain(S.musicVol), 0.15);
    } else {
      stopMusic();
      idleSoon();
    }
  }

  /** With the music off, let the context sleep between effects so it costs nothing. */
  function idleSoon() {
    G.clearTimeout(E.idle);
    if (!E.ctx || (S.on && S.music)) return;
    E.idle = G.setTimeout(() => { if (E.ctx && !(S.on && S.music)) E.ctx.suspend(); }, 4000);
  }

  const played = []; // the last few effects that actually played (for tests)
  /** Play one effect. Returns true if it was scheduled. Never throws. */
  function sfx(name) {
    try {
      if (!S.on || !S.sfx || S.sfxVol <= 0) return false;
      const fn = FX[name];
      if (!fn) return false;
      if (!E.ctx) return false; // the context only exists after the learner turned sound on
      if (doc && doc.hidden) return false;
      if (!allow(name)) return false;
      resume();
      const c = E.ctx;
      let t = c.currentTime + 0.01;
      if (WAITS[name] && E.cueUntil > t) t = E.cueUntil;
      if (CUE[name]) E.cueUntil = Math.max(E.cueUntil, t + CUE[name]);
      fn(c, { dry: E.sfxBus, wet: E.sfxRev }, t, E.noise);
      played.push(name); if (played.length > 30) played.shift();
      idleSoon();
      return true;
    } catch (e) { return false; }
  }

  /* ---------- public API ---------- */
  function get() { return Object.assign({}, S); }
  function set(patch, fromGesture) {
    const before = S;
    S = clean(Object.assign({}, S, patch || {}));
    store(S);
    if (before.on !== S.on || before.music !== S.music || before.sfx !== S.sfx || before.musicVol !== S.musicVol || before.sfxVol !== S.sfxVol) {
      try { apply(fromGesture !== false); } catch (e) { /* audio is optional; never break the page */ }
    }
    syncUi();
    return get();
  }
  function toggle() { return set({ on: !S.on }); }

  TT.sfx = sfx;
  TT.audio = {
    KEY, DEFAULTS, NAMES, GAP_MS,
    get, set, toggle, allow,
    musicGain, sfxGain,
    get state() { return E.ctx ? E.ctx.state : 'none'; },
    get context() { return E.ctx; },
    get played() { return played.slice(); },
    // for tests and tuning: build the ambience or one effect on any (offline) context
    _music: Music,
    _fx: (c, dest, name, t) => FX[name](c, { dry: dest, wet: null }, t || 0, makeWhite(c, 3)),
  };

  /* ---------- UI: a speaker button in the masthead and a small popover ---------- */
  const ICON = {
    on: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    off: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };
  let ui = null;
  const PREVIEW = ['pager', 'resolve', 'ping-ok', 'correct', 'badge', 'link-up', 'flip', 'promote', 'ping-fail', 'wrong', 'link-down', 'scene-step', 'clockin'];
  const LABEL = { pager: 'pager', resolve: 'ticket resolved', promote: 'promotion', badge: 'badge', 'ping-ok': 'ping reply', 'ping-fail': 'ping dropped', 'link-up': 'link up', 'link-down': 'link down', flip: 'card flip', correct: 'right answer', wrong: 'wrong answer', 'scene-step': 'scene step', clockin: 'clock in' };
  let previewI = 0;

  function syncUi() {
    watch();
    if (!ui) return;
    const { btn, root } = ui;
    const live = S.on && (S.music || S.sfx);
    const want = live ? 'on' : 'off';
    if (btn.dataset.icon !== want) { btn.innerHTML = ICON[want]; btn.dataset.icon = want; }
    btn.classList.toggle('is-on', live);
    const label = live ? 'Sound settings (sound on)' : 'Sound settings (sound off)';
    btn.setAttribute('aria-label', label);
    btn.title = live ? 'Sound on' : 'Sound off';
    const sw = (sel, v, dis) => { const b = root.querySelector(sel); b.setAttribute('aria-checked', String(v)); b.querySelector('.tt-au-state').textContent = v ? 'On' : 'Off'; if (dis !== undefined) b.disabled = dis; };
    sw('[data-au="on"]', S.on);
    sw('[data-au="music"]', S.music, !S.on);
    sw('[data-au="sfx"]', S.sfx, !S.on);
    const mv = root.querySelector('#tt-au-mv');
    const sv = root.querySelector('#tt-au-sv');
    mv.value = String(Math.round(S.musicVol * 100)); mv.disabled = !S.on || !S.music;
    sv.value = String(Math.round(S.sfxVol * 100)); sv.disabled = !S.on || !S.sfx;
    mv.setAttribute('aria-valuetext', `${mv.value} percent`);
    sv.setAttribute('aria-valuetext', `${sv.value} percent`);
    root.querySelector('#tt-au-mvo').textContent = mv.value + '%';
    root.querySelector('#tt-au-svo').textContent = sv.value + '%';
    root.querySelector('[data-au="preview"]').disabled = !S.on || !S.sfx;
    root.querySelector('.tt-au-body').classList.toggle('is-off', !S.on);
    root.querySelector('.tt-au-note').textContent = !S.on
      ? 'Off. Nothing plays until you switch it on.'
      : !AC() ? 'This browser has no Web Audio, so it stays silent.' : S.music ? 'Night shift ambience is playing. It is generated live, never looped.' : 'Ambience off. Effects only.';
  }

  function open(v) {
    if (!ui) return;
    const was = !ui.pop.hidden;
    ui.pop.hidden = !v;
    ui.btn.setAttribute('aria-expanded', String(!!v));
    if (v && !was) {
      // open toward the side with room: right-aligned under the button, unless that would run off the left edge
      ui.root.classList.remove('tt-au-left');
      const r = ui.btn.getBoundingClientRect();
      if (r.right - ui.pop.offsetWidth < 8) ui.root.classList.add('tt-au-left');
      syncUi();
      const f = ui.pop.querySelector('[data-au="on"]'); if (f) f.focus(); }
  }

  function build() {
    const root = doc.createElement('div');
    root.className = 'tt-audio';
    root.innerHTML = `
      <button type="button" class="tt-audio-btn" id="tt-audio-btn" aria-expanded="false" aria-controls="tt-audio-pop"></button>
      <div class="tt-audio-pop" id="tt-audio-pop" role="dialog" aria-modal="false" aria-labelledby="tt-au-h" hidden>
        <p class="tt-au-h" id="tt-au-h">Sound <span>Night shift</span></p>
        <button type="button" class="tt-au-sw tt-au-master" role="switch" data-au="on" aria-checked="false"><span class="tt-au-l">All sound</span><span class="tt-au-track" aria-hidden="true"><i></i></span><span class="tt-au-state">Off</span></button>
        <div class="tt-au-body">
          <div class="tt-au-row">
            <button type="button" class="tt-au-sw" role="switch" data-au="music" aria-checked="true"><span class="tt-au-l">Ambient music</span><span class="tt-au-track" aria-hidden="true"><i></i></span><span class="tt-au-state">On</span></button>
            <div class="tt-au-vol"><label for="tt-au-mv">Music volume</label><input type="range" id="tt-au-mv" min="0" max="100" step="1"><output id="tt-au-mvo" for="tt-au-mv"></output></div>
          </div>
          <div class="tt-au-row">
            <button type="button" class="tt-au-sw" role="switch" data-au="sfx" aria-checked="true"><span class="tt-au-l">Sound effects</span><span class="tt-au-track" aria-hidden="true"><i></i></span><span class="tt-au-state">On</span></button>
            <div class="tt-au-vol"><label for="tt-au-sv">Effects volume</label><input type="range" id="tt-au-sv" min="0" max="100" step="1"><output id="tt-au-svo" for="tt-au-sv"></output></div>
            <button type="button" class="btn quiet tt-au-prev" data-au="preview">Preview effects</button>
          </div>
        </div>
        <p class="tt-au-note" aria-live="polite"></p>
      </div>`;
    const btn = root.querySelector('.tt-audio-btn');
    const pop = root.querySelector('.tt-audio-pop');
    ui = { root, btn, pop };
    btn.addEventListener('click', () => open(pop.hidden));
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-au]');
      if (!b || b.disabled) return;
      const k = b.getAttribute('data-au');
      if (k === 'on') set({ on: !S.on }, true);
      else if (k === 'music') set({ music: !S.music }, true);
      else if (k === 'sfx') set({ sfx: !S.sfx }, true);
      else if (k === 'preview') {
        const name = PREVIEW[previewI++ % PREVIEW.length];
        b.textContent = `Preview effects (${LABEL[name]})`;
        sfx(name);
      }
    });
    root.querySelector('#tt-au-mv').addEventListener('input', (e) => set({ musicVol: Number(e.target.value) / 100 }, true));
    root.querySelector('#tt-au-sv').addEventListener('input', (e) => set({ sfxVol: Number(e.target.value) / 100 }, true));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); e.stopPropagation(); open(false); btn.focus(); }
    });
    // close when focus or a click goes elsewhere
    root.addEventListener('focusout', (e) => { if (!pop.hidden && e.relatedTarget && !root.contains(e.relatedTarget)) open(false); });
    doc.addEventListener('click', (e) => { if (pop.hidden) return; const path = e.composedPath ? e.composedPath() : [e.target]; if (path.indexOf(root) === -1 && !root.contains(e.target)) open(false); });
    return root;
  }

  /* Wide screens: in the top-right cluster, just before the theme toggle.
   * Phones (the cluster there only has room for two icons): at the end of the rank chip's row. */
  const NARROW = '(max-width: 600px)';
  function place() {
    if (!ui) return;
    const mast = doc.querySelector('header.mast') || doc.querySelector('header');
    if (!mast) return;
    const narrow = G.matchMedia && G.matchMedia(NARROW).matches;
    const hud = mast.querySelector('.tt-hud');
    const chip = mast.querySelector(':scope > .cr-hud');
    if (narrow && chip) {
      if (chip.nextElementSibling !== ui.root) chip.insertAdjacentElement('afterend', ui.root);
      mast.classList.add('tt-au-narrow');
      return;
    }
    mast.classList.remove('tt-au-narrow');
    if (hud) {
      const theme = hud.querySelector('#tt-theme');
      if (theme) { if (theme.previousElementSibling !== ui.root) hud.insertBefore(ui.root, theme); }
      else if (ui.root.parentNode !== hud) hud.appendChild(ui.root);
    } else if (ui.root.parentNode !== mast) mast.appendChild(ui.root);
  }

  function inject() {
    if (!doc.querySelector('header.mast') && !doc.querySelector('header')) return;
    if (!ui) build();
    place();
    syncUi();
    // career.js moves its chip between the cluster and its own row as the window changes; follow it
    if (G.matchMedia) {
      const mq = G.matchMedia(NARROW);
      const re = () => G.setTimeout(place, 0);
      if (mq.addEventListener) mq.addEventListener('change', re); else if (mq.addListener) mq.addListener(re);
      const wide = G.matchMedia('(min-width: 901px)');
      if (wide.addEventListener) wide.addEventListener('change', re); else if (wide.addListener) wide.addListener(re);
    }
    const mast = doc.querySelector('header.mast') || doc.querySelector('header');
    if (G.MutationObserver && mast) new G.MutationObserver(() => { if (ui && (!ui.root.isConnected || (G.matchMedia && G.matchMedia(NARROW).matches) !== mast.classList.contains('tt-au-narrow') || (mast.classList.contains('tt-au-narrow') && !mast.querySelector(':scope > .tt-audio')))) place(); }).observe(mast, { childList: true });
  }

  /* ---------- watching the page instead of editing it ---------- */
  // Career toasts, the rank-up notice and the RESOLVED / LEARNED stamps are noticed as they are added.
  let watcher = null;
  function onAdded(list) {
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1 || !n.classList) continue;
        const cl = n.classList;
        if (cl.contains('cr-toast')) sfx(cl.contains('cr-toast-badge') ? 'badge' : 'pager');
        else if (cl.contains('cr-promo')) sfx('promote');
        else if ((cl.contains('stamp') || cl.contains('ls-stamp')) && cl.contains('fresh')) sfx('resolve');
      }
    }
  }
  function watch() {
    if (!doc) return;
    const want = S.on && S.sfx;
    if (want && !watcher && G.MutationObserver && doc.body) {
      watcher = new G.MutationObserver(onAdded);
      watcher.observe(doc.body, { childList: true, subtree: true });
    } else if (!want && watcher) { watcher.disconnect(); watcher = null; }
  }

  if (!doc) return; // loaded under node for tests

  // the same as TT.sfx, for modules that would rather not reach into TT
  doc.addEventListener('tt:sfx', (e) => { if (e && e.detail && e.detail.name) sfx(e.detail.name); });
  // Clock in on the home page (a link, so no edit to home.js is needed)
  doc.addEventListener('click', (e) => { const a = e.target && e.target.closest && e.target.closest('#hm-clockin'); if (a) sfx('clockin'); }, true);

  // A background tab costs nothing: suspend when hidden, resume when visible.
  doc.addEventListener('visibilitychange', () => {
    if (!E.ctx) return;
    if (doc.hidden) { try { E.ctx.suspend(); } catch (e) { /* ignore */ } }
    else if (S.on && S.music) resume();
  });

  // Sound was on last visit: browsers block autoplay, so wait for the first gesture before starting.
  if (S.on) {
    const first = () => {
      doc.removeEventListener('pointerdown', first, true);
      doc.removeEventListener('keydown', first, true);
      if (S.on && !E.ctx) { try { apply(true); } catch (e) { /* ignore */ } }
    };
    doc.addEventListener('pointerdown', first, true);
    doc.addEventListener('keydown', first, true);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => { inject(); watch(); });
  else { inject(); watch(); }
})(globalThis);
