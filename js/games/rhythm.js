// One timing model for every rhythm game (Beat Battle, Showdown, Crew Combo, calibration).
//
// Real play: time = the AudioContext clock, so notes line up with what is heard. A pointer
// event is judged at   audioTimeAt(e.timeStamp) − outputLatency − calibrationOffset.
// Tests (?speed=N) or no audio: time = performance clock × SPEED and the music is muted, so a
// headless run can go fast without an audio clock.
import * as Sound from '../sound.js';
import { SPEED } from './engine.js';
import { getOffset } from './calibration.js';

const perfNow = () => (performance.now() / 1000) * SPEED;

export function audioMode() {
  return SPEED === 1 && Sound.hasAudio() && Sound.contextRunning();
}

/**
 * Start a song and return a rhythm controller in "game seconds".
 * opts: as Sound.startBeat (bpm, bars, loop, groove, keyIdx, countIn, melody, onStep) + calibrate:false
 *   now()              current audio time (what is being heard right now)
 *   gameNow()          now() minus the device calibration offset. Draw notes and sweep misses on
 *                      THIS clock: judge(e) subtracts the same offset, so a tap made in time with
 *                      the music lands exactly on the note and the late window stays symmetric.
 *   offset             the calibration offset in seconds (0 when tuning is off)
 *   judge(e)           game time at which a pointer/keyboard event happened (latency-corrected)
 *   t0, spb, end       start of beat 0, seconds per beat, end time
 *   timeOf(beat)       game time of a beat index (correct across pause/resume)
 *   beatAt(time)       fractional beat index for a time
 *   pause(), resume(), stop(), setFilter(hz), setLevel(v), paused
 */
export function startRhythm(opts = {}) {
  const useAudio = audioMode();
  const offset = opts.calibrate === false ? 0 : getOffset();
  if (useAudio) {
    const beat = Sound.startBeat(opts);
    const lat = () => Sound.outputLatency();
    const api = {
      audio: true,
      offset,
      now: () => Sound.now() - lat(),
      gameNow: () => Sound.now() - lat() - offset,
      judge: e => Sound.now() - (performance.now() - (e?.timeStamp ?? performance.now())) / 1000 - lat() - offset,
      get t0() { return beat.t0; },
      spb: beat.spb,
      get end() { return beat.end; },
      timeOf: b => beat.timeOf(b),
      beatAt: t => (t - beat.t0) / beat.spb,
      pause: () => beat.pause(),
      resume: () => beat.resume(),
      stop: () => beat.stop(),
      setFilter: hz => beat.setFilter(hz),
      setLevel: v => beat.setLevel(v),
      get paused() { return beat.paused; },
    };
    return api;
  }
  // Silent, perf-clock rhythm (tests, or audio unavailable).
  const spb = 60 / (opts.bpm || 92);
  let t0 = perfNow() + 0.15 + (opts.countIn ?? 4) * spb;
  const bars = opts.loop ? Infinity : (opts.bars ?? 16);
  let pausedAt = null;
  let nextStep = 0;
  let stopped = false;
  const stepLen = spb / 4;
  // Keep onStep / onBar callbacks flowing so games that react to them still work.
  const tick = setInterval(() => {
    if (stopped || pausedAt != null) return;
    const horizon = perfNow() + 0.2;
    while (t0 + nextStep * stepLen <= horizon && nextStep < bars * 16) {
      if (nextStep % 16 === 0) opts.onBar?.(nextStep / 16);
      opts.onStep?.(nextStep, t0 + nextStep * stepLen);
      nextStep++;
    }
  }, 25);
  return {
    audio: false,
    offset,
    now: () => (pausedAt ?? perfNow()),
    gameNow: () => (pausedAt ?? perfNow()) - offset,
    judge: e => perfNow() - ((performance.now() - (e?.timeStamp ?? performance.now())) / 1000) * SPEED - offset,
    get t0() { return t0; },
    spb,
    get end() { return t0 + bars * 4 * spb; },
    timeOf: b => t0 + b * spb,
    beatAt: t => (t - t0) / spb,
    pause() { if (pausedAt == null) pausedAt = perfNow(); },
    resume() { if (pausedAt != null) { t0 += perfNow() - pausedAt; pausedAt = null; } },
    stop() { stopped = true; clearInterval(tick); },
    setFilter() {}, setLevel() {},
    get paused() { return pausedAt != null; },
  };
}

/** Judge a tap against a target time. Returns { grade: 'perfect'|'great'|'good'|null, delta }. */
export function grade(delta, { perfect = 0.07, great = 0.13, good = 0.2, scale = 1 } = {}) {
  const d = Math.abs(delta);
  if (d <= perfect * scale) return { grade: 'perfect', delta };
  if (d <= great * scale) return { grade: 'great', delta };
  if (d <= good * scale) return { grade: 'good', delta };
  return { grade: null, delta };
}
