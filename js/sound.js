// Every sound is synthesised live with the Web Audio API — no audio files.

let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;

export function setEnabled(v) {
  enabled = !!v && !TEST_MUTE;
  if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.02);
}
export const isEnabled = () => enabled;

/** Must run inside a user gesture at least once (iOS). Safe to call often. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = enabled && !TEST_MUTE ? 0.9 : 0;
    master.connect(comp);
    comp.connect(ctx.destination);
    // iOS wakes the audio path with a silent buffer played during a gesture.
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  }
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume();
}

export const now = () => (ctx ? ctx.currentTime : performance.now() / 1000);
export const hasAudio = () => !!ctx;
export const contextRunning = () => !!ctx && ctx.state === 'running';
/** Resolves true once the AudioContext is running, or false after `ms` (iPad can take a moment to wake it). */
export function whenRunning(ms = 400) {
  return new Promise(res => {
    if (!ctx) return res(false);
    const t0 = performance.now();
    const check = () => {
      if (ctx.state === 'running') return res(true);
      if (performance.now() - t0 >= ms) return res(false);
      setTimeout(check, 20);
    };
    check();
  });
}
/** Test hook: ?mute=1 or ?speed=N silences everything (headless runs). */
const TEST_MUTE = (() => { try { const q = new URLSearchParams(location.search); return q.has('mute') || (Number(q.get('speed')) > 0 && Number(q.get('speed')) !== 1); } catch { return false; } })();
export const outputLatency = () => (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0);

export function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function tone({ f, type = 'triangle', t = now(), dur = 0.15, vol = 0.25, slideTo = null, attack = 0.005, dest = master, detune = 0 }) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

export function burst({ t = now(), dur = 0.1, vol = 0.3, type = 'highpass', freq = 6000, q = 1, dest = master, sweep = null }) {
  if (!ctx) return;
  const n = noise();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) sweep(f.frequency, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(dest);
  n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
}

// ------------------------------------------------------------------ SFX
export function tap() { if (!ctx) return; tone({ f: 740, dur: 0.07, vol: 0.12, type: 'sine', slideTo: 990 }); }
export function key() { if (!ctx) return; tone({ f: 520, dur: 0.05, vol: 0.1, type: 'square' }); }
export function soft() { if (!ctx) return; const t = now(); tone({ f: 392, t, dur: 0.16, vol: 0.12 }); tone({ f: 330, t: t + 0.12, dur: 0.2, vol: 0.12 }); }

export function point(type = 'firstAsk') {
  if (!ctx) return;
  const t = now() + 0.01;
  const root = { firstAsk: 72, words: 74, kind: 76 }[type] || 72;
  [0, 4, 7, 12, 16].forEach((s, i) => {
    tone({ f: mtof(root + s), t: t + i * 0.065, dur: 0.22, vol: 0.2, type: 'square' });
    tone({ f: mtof(root + s + 12), t: t + i * 0.065, dur: 0.18, vol: 0.08, type: 'triangle' });
  });
  tone({ f: 180, t, dur: 0.25, vol: 0.3, type: 'sine', slideTo: 520 }); // boing
  sparkle(t + 0.35);
}

export function sparkle(t = now()) {
  if (!ctx) return;
  const notes = [84, 88, 91, 96, 93, 100];
  notes.forEach((n, i) => tone({ f: mtof(n), t: t + i * 0.045, dur: 0.18, vol: 0.07, type: 'sine' }));
}

export function star() {
  if (!ctx) return;
  const t = now();
  tone({ f: mtof(83), t, dur: 0.1, vol: 0.18, type: 'square' });
  tone({ f: mtof(88), t: t + 0.08, dur: 0.35, vol: 0.18, type: 'square' });
}

export function rewind() {
  if (!ctx) return;
  const t = now() + 0.01;
  // Record scratch: "wicka-wicka" — filtered noise swept back and forth.
  const scratch = (at, up) => burst({
    t: at, dur: 0.16, vol: 0.55, type: 'bandpass', q: 4, freq: up ? 500 : 3200,
    sweep: (p, tt) => p.exponentialRampToValueAtTime(up ? 3200 : 450, tt + 0.14),
  });
  scratch(t, true); scratch(t + 0.15, false); scratch(t + 0.32, true); scratch(t + 0.44, false);
  tone({ f: 600, t, dur: 0.14, vol: 0.12, type: 'sawtooth', slideTo: 1400 });
  tone({ f: 1400, t: t + 0.15, dur: 0.14, vol: 0.12, type: 'sawtooth', slideTo: 500 });
  // Tape rewind whoosh
  tone({ f: 1800, t: t + 0.6, dur: 0.5, vol: 0.12, type: 'sawtooth', slideTo: 180 });
  burst({ t: t + 0.6, dur: 0.5, vol: 0.2, type: 'lowpass', freq: 3000, sweep: (p, tt) => p.exponentialRampToValueAtTime(300, tt + 0.5) });
  // Double fanfare
  const f = t + 1.1;
  [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone({ f: mtof(n + 7), t: f + i * 0.05, dur: 0.3, vol: 0.16, type: 'square' }));
  kick(f); kick(f + 0.35);
  sparkle(f + 0.4);
}

export function levelUp() {
  if (!ctx) return;
  const t = now() + 0.05;
  const seq = [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36], [84, 0.52]];
  seq.forEach(([n, d]) => { tone({ f: mtof(n), t: t + d, dur: 0.3, vol: 0.2, type: 'square' }); tone({ f: mtof(n - 12), t: t + d, dur: 0.3, vol: 0.1, type: 'triangle' }); });
  [72, 76, 79, 84].forEach(n => tone({ f: mtof(n), t: t + 0.7, dur: 0.9, vol: 0.1, type: 'sawtooth', attack: 0.02 }));
  tone({ f: 200, t, dur: 0.7, vol: 0.12, type: 'sine', slideTo: 1600 });
  kick(t + 0.7); crash(t + 0.7);
  sparkle(t + 1.0);
}

export function unlockSfx() {
  if (!ctx) return;
  const t = now();
  [79, 84, 88, 91, 96].forEach((n, i) => tone({ f: mtof(n), t: t + i * 0.07, dur: 0.4, vol: 0.12, type: 'sine' }));
}

export function heatUp() { if (!ctx) return; const t = now(); tone({ f: 140, t, dur: 0.45, vol: 0.2, type: 'sawtooth', slideTo: 320 }); burst({ t, dur: 0.35, vol: 0.12, type: 'lowpass', freq: 900 }); }
export function coolDown() { if (!ctx) return; const t = now(); [88, 84, 79, 76].forEach((n, i) => tone({ f: mtof(n), t: t + i * 0.09, dur: 0.4, vol: 0.1, type: 'sine' })); }
export function whoosh() { if (!ctx) return; burst({ dur: 0.25, vol: 0.15, type: 'bandpass', freq: 800, q: 1, sweep: (p, t) => p.exponentialRampToValueAtTime(4000, t + 0.22) }); }
export function chime() { if (!ctx) return; const t = now(); [76, 83].forEach((n, i) => tone({ f: mtof(n), t: t + i * 0.1, dur: 0.5, vol: 0.12, type: 'sine' })); }

// ------------------------------------------------------------------ drums
// Every voice takes an optional `dest` so a beat can route through its own music bus.
export function kick(t = now(), vol = 0.9, dest = master) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.4);
}
export function snare(t, vol = 0.45, dest = master) {
  burst({ t, dur: 0.18, vol, type: 'highpass', freq: 1400, dest });
  tone({ f: 190, t, dur: 0.1, vol: vol * 0.5, type: 'triangle', slideTo: 140, dest });
}
export function clap(t, vol = 0.35, dest = master) {
  [0, 0.012, 0.026].forEach(d => burst({ t: t + d, dur: 0.06, vol, type: 'bandpass', freq: 1600, q: 1.5, dest }));
  burst({ t: t + 0.03, dur: 0.18, vol: vol * 0.6, type: 'bandpass', freq: 1400, q: 1.2, dest });
}
export function hat(t, vol = 0.12, open = false, dest = master) { burst({ t, dur: open ? 0.22 : 0.045, vol, type: 'highpass', freq: 7500, dest }); }
export function crash(t, dest = master) { burst({ t, dur: 1.2, vol: 0.18, type: 'highpass', freq: 5000, dest }); }
export function bass(t, midi, dur, dest = master) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(mtof(midi), t);
  f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(180, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
export function stab(t, midis, dest = master) {
  midis.forEach(m => {
    tone({ f: mtof(m), t, dur: 0.22, vol: 0.06, type: 'square', dest });
    tone({ f: mtof(m), t, dur: 0.22, vol: 0.05, type: 'sawtooth', detune: 8, dest });
  });
}
export function bell(t, midi, dest = master) { tone({ f: mtof(midi), t, dur: 0.35, vol: 0.09, type: 'sine', dest }); tone({ f: mtof(midi + 12), t, dur: 0.2, vol: 0.03, type: 'sine', dest }); }

// 16-step patterns. Original grooves.
export const GROOVES = [
  { name: 'Boom Bap', kick: [0, 7, 10], snare: [4, 12], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [14], swing: 0.14,
    bass: [[0, 0, 3], [7, 0, 1], [10, 3, 2], [12, 5, 2]], stab: [2, 11] },
  { name: 'Bounce', kick: [0, 3, 8, 11], snare: [4, 12], clap: [12], hat: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], open: [6], swing: 0.08,
    bass: [[0, 0, 2], [3, 0, 1], [8, 7, 2], [11, 5, 2], [14, 3, 1]], stab: [6, 14] },
  { name: 'Lazy Sunday', kick: [0, 6, 10], snare: [8], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], swing: 0.18,
    bass: [[0, 0, 4], [6, 5, 2], [10, 3, 4]], stab: [4, 12] },
];
const SCALE = [0, 3, 5, 7, 10, 12]; // minor pentatonic
const KEYS = [36, 38, 41, 43]; // C, D, F, G bass roots
export const scaleNote = (keyIdx, degree, octave = 0) => KEYS[keyIdx % KEYS.length] + 12 * octave + SCALE[((degree % SCALE.length) + SCALE.length) % SCALE.length];

/**
 * Start a generated beat. Returns a controller:
 *   t0 (audio time of beat 0 of bar 0, after `countIn` clicks), spb (seconds per beat), end,
 *   timeOf(beatIndex) → audio time (stays correct across pause/resume),
 *   pause() / resume() (the song holds its place — used by CHILL), stop(),
 *   setFilter(hz) (muffle the music, e.g. while chilling), setLevel(0..1).
 * opts: bpm, bars (ignored when loop), loop, groove, keyIdx, countIn, melody, onBar(bar),
 *       onStep(step, audioTime) — called as each 16th is scheduled (≈0.2 s ahead).
 */
export function startBeat({ bpm = 92, bars = 16, groove = 0, keyIdx = 0, countIn = 4, melody = true, onBar = null, onStep = null, loop = false } = {}) {
  const spb = 60 / bpm;
  const step = spb / 4;
  const g = GROOVES[groove % GROOVES.length];
  const root = KEYS[keyIdx % KEYS.length];
  const start = now() + 0.15;
  let t0 = start + countIn * spb;
  const total = loop ? Infinity : bars * 16;
  let nextStep = 0;
  let timer = null;
  let stopped = false;
  let pausedAt = null;

  // Music bus: gain → lowpass → master, so a game can duck or muffle the song.
  let bus = master, filt = null, gain = null;
  if (ctx) {
    gain = ctx.createGain(); gain.gain.value = 1;
    filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000;
    gain.connect(filt); filt.connect(master);
    bus = gain;
  }

  if (ctx) for (let i = 0; i < countIn; i++) tone({ f: i === countIn - 1 ? 1320 : 990, t: start + i * spb, dur: 0.06, vol: 0.14, type: 'square', dest: bus });

  const chordFor = bar => [0, 5, 3, 7][bar % 4];
  function schedule() {
    if (!ctx || stopped || pausedAt != null) return;
    const horizon = ctx.currentTime + 0.2;
    while (nextStep < total) {
      const s = nextStep % 16;
      const bar = Math.floor(nextStep / 16);
      let t = t0 + nextStep * step;
      if (s % 2 === 1) t += g.swing * step;
      if (t > horizon) break;
      if (t < ctx.currentTime - 0.05) { nextStep++; continue; } // fell behind (long frame): skip, don't pile up
      const intro = !loop && bar < 1;
      const outro = !loop && bar === bars - 1;
      if (s === 0 && onBar) onBar(bar);
      onStep?.(nextStep, t);
      if (!intro && g.kick.includes(s)) kick(t, 0.9, bus);
      if (!intro && g.snare.includes(s)) snare(t, 0.45, bus);
      if (!intro && g.clap.includes(s)) clap(t, 0.35, bus);
      if (g.hat.includes(s)) hat(t, s % 4 === 0 ? 0.13 : 0.08, g.open.includes(s), bus);
      const cr = chordFor(bar);
      if (!intro) g.bass.forEach(([bs, deg, len]) => { if (bs === s) bass(t, root + cr + SCALE[deg % SCALE.length] - (deg > 3 ? 12 : 0), len * step * 1.6, bus); });
      if (!intro && g.stab.includes(s)) stab(t, [root + 36 + cr, root + 39 + cr, root + 43 + cr], bus);
      if (melody && bar >= 4 && bar % 2 === 0 && [0, 3, 6, 10].includes(s)) bell(t, root + 48 + cr + SCALE[(bar + s) % SCALE.length], bus);
      if (outro && s === 0) crash(t, bus);
      nextStep++;
    }
    if (nextStep >= total) clearInterval(timer);
  }
  if (ctx) {
    schedule();
    timer = setInterval(schedule, 25);
  }
  const api = {
    spb, bars,
    get t0() { return t0; },
    get end() { return loop ? Infinity : t0 + bars * 16 * step; },
    get paused() { return pausedAt != null; },
    timeOf: beatIndex => t0 + beatIndex * spb,
    pause() {
      if (pausedAt != null || stopped) return;
      pausedAt = now();
      if (gain) { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); }
    },
    resume() {
      if (pausedAt == null || stopped) return;
      const gap = now() - pausedAt;
      t0 += gap;
      pausedAt = null;
      // Steps already queued ahead of the pause are skipped; the song picks up where it was.
      const idx = Math.max(0, Math.ceil((now() + 0.05 - t0) / step));
      nextStep = Math.max(nextStep, idx);
      if (gain) { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(1, ctx.currentTime, 0.08); }
      schedule();
    },
    stop() {
      stopped = true; clearInterval(timer);
      if (gain) { try { gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); setTimeout(() => { try { filt.disconnect(); } catch { /* gone */ } }, 400); } catch { /* closed */ } }
    },
    setFilter(hz) { if (filt) filt.frequency.setTargetAtTime(Math.max(200, hz), ctx.currentTime, 0.1); },
    setLevel(v) { if (gain && pausedAt == null) gain.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, 0.08); },
  };
  return api;
}

// ------------------------------------------------------------------ v2 game SFX
// Short, friendly sounds shared by the Arcade games. Nothing here sounds like "losing":
// a miss is a soft, low blip; a crash is a cartoon boing.
export function hit(n = 0) { if (!ctx) return; const t = now(); tone({ f: mtof(76 + (n % 5) * 2), t, dur: 0.09, vol: 0.14, type: 'square' }); tone({ f: mtof(88 + (n % 5) * 2), t, dur: 0.07, vol: 0.05, type: 'sine' }); }
export function perfect() { if (!ctx) return; const t = now(); tone({ f: mtof(84), t, dur: 0.08, vol: 0.12, type: 'square' }); tone({ f: mtof(91), t: t + 0.05, dur: 0.12, vol: 0.1, type: 'square' }); }
export function miss() { if (!ctx) return; tone({ f: 220, dur: 0.12, vol: 0.08, type: 'triangle', slideTo: 180 }); }
export function combo(n = 1) { if (!ctx) return; const t = now(); [0, 4, 7].forEach((s, i) => tone({ f: mtof(72 + Math.min(n, 12) + s), t: t + i * 0.04, dur: 0.16, vol: 0.09, type: 'square' })); }
export function jump() { if (!ctx) return; tone({ f: 330, dur: 0.18, vol: 0.14, type: 'square', slideTo: 760 }); }
export function slide() { if (!ctx) return; burst({ dur: 0.22, vol: 0.12, type: 'bandpass', freq: 1200, q: 2, sweep: (p, t) => p.exponentialRampToValueAtTime(400, t + 0.2) }); }
export function collect(n = 0) { if (!ctx) return; const t = now(); tone({ f: mtof(83 + (n % 4) * 2), t, dur: 0.08, vol: 0.12, type: 'square' }); tone({ f: mtof(90 + (n % 4) * 2), t: t + 0.06, dur: 0.14, vol: 0.1, type: 'sine' }); }
export function bonk() { if (!ctx) return; const t = now(); tone({ f: 300, t, dur: 0.25, vol: 0.2, type: 'sine', slideTo: 90 }); burst({ t, dur: 0.1, vol: 0.12, type: 'lowpass', freq: 700 }); }
export function tapeRewind() { if (!ctx) return; const t = now(); tone({ f: 1600, t, dur: 0.6, vol: 0.1, type: 'sawtooth', slideTo: 200 }); burst({ t, dur: 0.6, vol: 0.18, type: 'bandpass', freq: 3000, q: 3, sweep: (p, tt) => p.exponentialRampToValueAtTime(500, tt + 0.55) }); }
export function breathIn(dur = 1.5) { if (!ctx) return; const t = now(); tone({ f: 262, t, dur, vol: 0.06, type: 'sine', slideTo: 392, attack: dur * 0.6 }); burst({ t, dur, vol: 0.05, type: 'bandpass', freq: 500, sweep: (p, tt) => p.exponentialRampToValueAtTime(1500, tt + dur) }); }
export function breathOut(dur = 1.5) { if (!ctx) return; const t = now(); tone({ f: 392, t, dur, vol: 0.06, type: 'sine', slideTo: 262, attack: 0.05 }); burst({ t, dur, vol: 0.05, type: 'bandpass', freq: 1500, sweep: (p, tt) => p.exponentialRampToValueAtTime(400, tt + dur) }); }
export function spark() { if (!ctx) return; const t = now(); [96, 100, 103].forEach((n, i) => tone({ f: mtof(n), t: t + i * 0.03, dur: 0.12, vol: 0.08, type: 'triangle' })); }
export function countdown(n) { if (!ctx) return; tone({ f: n > 0 ? 880 : 1320, dur: n > 0 ? 0.08 : 0.22, vol: 0.14, type: 'square' }); }
export function pop() { if (!ctx) return; tone({ f: 500, dur: 0.06, vol: 0.12, type: 'sine', slideTo: 900 }); }
export function note(midi, dur = 0.2, type = 'square', vol = 0.12) { if (!ctx) return; tone({ f: mtof(midi), dur, vol, type }); }
