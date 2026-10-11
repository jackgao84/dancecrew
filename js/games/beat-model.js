// Beat Battle — the pure game model (no DOM, unit-tested): tiers, chart, scoring, heat, CHILL
// and the freestyle finale. js/games/beat.js is only view, input, sound and juice on top of it.
//
// The principle lives in these numbers. Hits build a multiplier (x1 → x4) that is never taken
// away, but heat caps it: Warm (≥40) → x2, HOT (≥70) → x1 with tighter timing. Heat comes from
// missing again and again or mashing. A 3-second CHILL pauses the song (nothing can be missed),
// drops heat to 0 and the saved multiplier is back — so at high heat, chilling is the best play.
//   Worked number: HOT with x4 saved, 20 perfect notes → play on ≈ 5 400, chill first → 8 000.
import { grade as gradeTap } from './rhythm.js';
import { createAdapt } from './adapt.js';
import { rng as seeded } from './engine.js';

export const ROUND_SECS = 75;
export const FREESTYLE_SECS = 10;
export const COUNT_IN = 4;

// Tiers set the tempo, how long notes are on screen, timing windows, the note mix and the
// bounds the adaptive density may move between (density only — never heat).
export const TIERS = [
  { id: 'chill', label: 'Chill', bpm: 84, travel: 2.1, scale: 1.2, density: [0.3, 0.6], start: 0.4, groove: 2,
    mix: { tap: 0.8, hold: 0.14, swipe: 0.06, combo: 0 }, dirs: ['up'], eighths: false, holdLens: [2] },
  { id: 'groove', label: 'Groove', bpm: 96, travel: 1.75, scale: 1, density: [0.4, 0.8], start: 0.5, groove: 0,
    mix: { tap: 0.6, hold: 0.16, swipe: 0.14, combo: 0.1 }, dirs: ['up', 'left', 'right'], eighths: true, holdLens: [1, 2] },
  { id: 'hype', label: 'Hype', bpm: 108, travel: 1.5, scale: 0.9, density: [0.55, 1], start: 0.65, groove: 1,
    mix: { tap: 0.5, hold: 0.17, swipe: 0.18, combo: 0.15 }, dirs: ['up', 'left', 'right'], eighths: true, holdLens: [1, 2] },
];
export const tierById = id => TIERS.find(t => t.id === id) || TIERS[1];
/** New players start on Chill; the tier grows with real-world levels (they can always pick). */
export const defaultTierId = level => (level >= 11 ? 'hype' : level >= 5 ? 'groove' : 'chill');

export const HEAT = { miss: 18, stray: 8, hit: -3, warm: 40, hot: 70, max: 100 };
export const MULT_STEP = 8;          // hits in a row for each multiplier step
export const MULT_MAX = 4;
export const PTS = { perfect: 100, great: 80, good: 50 };
export const FREE_PTS = { perfect: 60, great: 45, good: 30 };
export const HOLD_PTS = 30;          // per beat held to the end
export const COMBO_PTS = 50;         // both halves of a 2-lane combo
export const CHILL_SECS = 3;
export const EARLY_CHILL = 150;      // chilling while only Warm: noticing early pays
export const EARLY_GAP_SECS = 12;    // …at most once every 12 s of song, and only when misses made
                                     // it Warm (heat from mashing an empty lane doesn't count)
export const NEAR_SECS = 0.4;        // a tap this close to a note is "early"/"late", not stray…
export const FUMBLES = 2;            // …but the 2nd+ early tap on one note is mashing: the combo starts
                                     // again, it counts as a stray tap and the note can only be a "good"
export const STRAY = { taps: 3, secs: 0.5 }; // a burst of stray taps also starts the combo again
/**
 * Slapping every lane at once is not playing the notes. A hit within the slap window of presses on
 * `lanes` or more *empty* lanes scores nothing: no points, no combo, no multiplier. The note is
 * simply used up. Whichever finger lands first, the slap is caught (a hit that turns out to be part
 * of one is taken back, before the score shows it). Two fingers on a two-lane combo are never a slap.
 * An empty lane has no note to hit there; a first early/late tap on a lane's own note is an attempt
 * at that note, not an empty lane (a second one is mashing, and counts).
 * The window is a note's whole hit window (`secs` × the tier's timing scale: ±0.2 s, so 0.4 s wide):
 * two blind fingers that can both land on the same beat are never further apart than that. So a
 * finger-roll, or a two-hand "flam" (left hand on two lanes, the right hand on the other two a
 * moment later), is caught too — a 0.2 s window let a flam 0.21 s apart out-score a sloppy honest
 * kid on Chill. Honest play, even with a stray finger now and then, practically never presses two
 * empty lanes that close to a hit.
 */
export const SCATTER = { secs: 0.4, lanes: 2 };
export const scatterSecs = tier => SCATTER.secs * tier.scale;
export const BRIEF_P = 0.1;          // a CHILL tap shorter than ~0.3 s is not a breath: it changes nothing
export const GRACE_BEATS = 1.5;      // after a chill that cooled something (Warm or HOT), notes you had
                                     // no time for are free; a CHILL while Cool is no shield
export const GRACE_MIN_P = 0.2;      // letting go early earns that grace only after a real breath
                                     // (~0.6 s of holding), and then heat-free only: the combo still resets
export const GRACE_GAP_SECS = 6;     // at most one such grace every 6 s of song (a finished Warm/HOT chill always gets it)
                                     // A chill that melted mostly slap/stray heat is still a real cool-down
                                     // (heat → 0), but it earns no grace, no crew chill and no HOT-chill moment.
export const RESUME_GAP_SECS = 20;   // after "Take five" → Keep going, the notes you had no time for add no
                                     // heat (they still count as slid-by notes); at most once every 20 s of song
export const FRESH_P = 0.5;          // kept progress can't finish a breath for heat that came after it:
                                     // a new heat run needs at least half a breath (1.5 s) of its own
export const HOT_SHRINK = 0.8;
export const LEAD_SECS = 0.15;       // rhythm.js starts the count-in this long after start
/** The first notes teach themselves with the ghost hand: all three land inside the first 10 s. */
export const LESSON = { tap: 3, hold: 5, holdLen: 2, swipe: 9, end: 12 };

/**
 * The song beat the view draws notes at and sweeps misses on: the rhythm's calibrated clock
 * (gameNow = what is heard, minus this device's tuning offset). rhythm.judge(e) subtracts the same
 * offset, so a tap made in time with what the ear hears lands on the note, early or late alike.
 */
export const songBeatAt = rhythm => rhythm.beatAt(rhythm.gameNow());

export const zoneOf = h => (h >= HEAT.hot ? 'hot' : h >= HEAT.warm ? 'warm' : 'cool');
export const multCap = h => (h >= HEAT.hot ? 1 : h >= HEAT.warm ? 2 : MULT_MAX);
export const windowScale = (tier, h) => tier.scale * (h >= HEAT.hot ? HOT_SHRINK : 1);
const ZONE_RANK = { cool: 0, warm: 1, hot: 2 };

/** 75 s of song: whole bars after the count-in; the last ~10 s (whole bars) are the freestyle. */
export function roundShape(tier) {
  const spb = 60 / tier.bpm;
  const bars = Math.max(8, Math.floor((ROUND_SECS - COUNT_IN * spb) / (4 * spb)));
  const totalBeats = bars * 4;
  const freeBeat = totalBeats - Math.ceil(FREESTYLE_SECS / (4 * spb)) * 4;
  return { spb, bars, totalBeats, freeBeat, travelBeats: tier.travel / spb };
}

// ---------------------------------------------------------------- chart
/**
 * The full chart for a round, a pure function of (tier, seed). Every note has a rank `r`;
 * at runtime a note is played only if r ≤ the adaptive density when it appears, so the
 * adaptive controller thins or fills the chart without ever touching heat.
 * Note: { id, beat, lane, kind: 'tap'|'hold'|'swipe'|'combo', len, dir, pair, r, teach? }
 */
export function buildChart(tierIn, seed = 1) {
  const tier = typeof tierIn === 'string' ? tierById(tierIn) : tierIn;
  const rnd = seeded((seed >>> 0) * 7919 + tier.bpm);
  const { freeBeat } = roundShape(tier);
  const notes = [];
  const busy = [-1, -1, -1, -1]; // beat until which each lane is taken
  const add = (beat, lane, kind, extra = {}) => {
    const n = { id: notes.length, beat, lane, kind, len: 0, dir: null, pair: null, r: 0, ...extra };
    notes.push(n);
    busy[lane] = beat + n.len + 0.5;
    return n;
  };
  const holdBlocksAll = tier.id === 'chill'; // one finger is enough on Chill
  const hold = (beat, lane, len, extra) => {
    const n = add(beat, lane, 'hold', { len, ...extra });
    if (holdBlocksAll) busy.fill(beat + len + 0.5);
    return n;
  };

  // First notes teach themselves (with the ghost hand) inside the first 10 s: a tap, a hold, a swipe.
  const T = LESSON;
  add(T.tap, 1, 'tap', { teach: 'tap' }); add(T.tap + 1, 2, 'tap');
  hold(T.hold, 1, T.holdLen, { teach: 'hold' });
  add(T.swipe, 2, 'swipe', { dir: 'up', teach: 'swipe' }); add(T.swipe + 1, 0, 'tap'); add(T.swipe + 2, 3, 'tap', { r: 0.3 });

  let last = 3;
  const pickLane = (free, avoid) => {
    const c = free.filter(l => l !== avoid);
    const from = c.length ? c : free;
    return from[Math.floor(rnd() * from.length)];
  };
  const slots = [0, 1, 2, 3].concat(tier.eighths ? [0.5, 1.5, 2.5, 3.5] : []).sort((a, b) => a - b);
  for (let bar = T.end / 4; bar * 4 < freeBeat - 1; bar++) {
    const late = bar * 4 > freeBeat * 0.55; // a little busier in the second half
    for (const s of slots) {
      const beat = bar * 4 + s;
      if (beat > freeBeat - 1.5) break;
      const off = s % 1 !== 0;
      let r = off ? 0.62 + rnd() * 0.38 : s % 2 ? 0.25 + rnd() * 0.35 : rnd() * 0.18;
      if (late) r *= 0.92;
      const m = tier.mix;
      const roll = rnd();
      let kind = roll < m.combo ? 'combo' : roll < m.combo + m.hold ? 'hold' : roll < m.combo + m.hold + m.swipe ? 'swipe' : 'tap';
      if (off && (kind !== 'swipe' || tier.id !== 'hype')) kind = 'tap'; // off-beats: quick taps (Hype: flicks too)
      if (kind === 'combo' && s % 2 !== 0) kind = 'tap';    // combos land on the strong beats
      const free = [0, 1, 2, 3].filter(l => busy[l] <= beat);
      if (!free.length) continue;
      if (kind === 'combo') {
        if (free.length < 2) kind = 'tap';
        else {
          const a = pickLane(free, -1);
          const b = pickLane(free.filter(l => l !== a), -1);
          const na = add(beat, a, 'combo', { r });
          const nb = add(beat, b, 'combo', { r, pair: na.id });
          na.pair = nb.id;
          last = b;
          continue;
        }
      }
      const lane = pickLane(free, last);
      last = lane;
      if (kind === 'hold') {
        const len = Math.min(tier.holdLens[Math.floor(rnd() * tier.holdLens.length)], Math.floor(freeBeat - 1.5 - beat));
        if (len >= 1) { hold(beat, lane, len, { r }); continue; }
        kind = 'tap';
      }
      if (kind === 'swipe') add(beat, lane, 'swipe', { r, dir: tier.dirs[Math.floor(rnd() * tier.dirs.length)] });
      else add(beat, lane, 'tap', { r });
    }
  }
  notes.sort((a, b) => a.beat - b.beat || a.id - b.id);
  // Ids become array indexes (so notes[n.pair] is the partner).
  const index = new Map(notes.map((n, i) => [n.id, i]));
  for (const n of notes) { n.id = index.get(n.id); if (n.pair != null) n.pair = index.get(n.pair); }
  return notes;
}

// ---------------------------------------------------------------- scoring core
/**
 * Score, heat, multiplier and CHILL for one round. Times are song seconds.
 * The adaptive controller only ever receives hits and misses; it cannot touch heat.
 */
export function createBattle(tierIn = 'groove', { makeAdapt = createAdapt } = {}) {
  const tier = typeof tierIn === 'string' ? tierById(tierIn) : tierIn;
  const adapt = makeAdapt({ min: tier.density[0], max: tier.density[1], start: tier.start, step: 0.07, window: 6, missesToEase: 3, hitsToRamp: 10, cooldown: 4 });
  const s = {
    score: 0, heat: 0, earned: 1, streak: 0, bestStreak: 0, missRun: 0,
    hits: 0, misses: 0, perfects: 0, bursts: 0, strays: [], strayHeat: 0,
    chills: 0, earlyChills: 0, hotChills: 0, bestHotChill: 0,
    chilling: false, chillP: 0, cycleZone: null, cycleTop: null, cycleReal: false, cycleMash: false, stopZone: 'cool', lastEarly: -Infinity,
    freeHits: 0, combos: 0, holds: 0, slaps: 0,
  };
  const b = {
    tier, adapt, s,
    get mult() { return Math.min(s.earned, multCap(s.heat)); },
    get zone() { return zoneOf(s.heat); },
    get density() { return adapt.level; },
    get scale() { return windowScale(tier, s.heat); },
    /** Heat climbed into a hotter zone since CHILL was let go: a new heat run. */
    get newRun() { return !s.chilling && ZONE_RANK[zoneOf(s.heat)] > ZONE_RANK[s.stopZone]; },
    /** The breath progress a CHILL press would start from right now (what the ring shows). */
    get keptP() { return b.newRun ? Math.min(s.chillP, 1 - FRESH_P) : s.chillP; },

    hit(g, t = 0) {
      const mult = b.mult;
      const pts = (PTS[g] || PTS.good) * mult;
      const heat0 = s.heat, stray0 = s.strayHeat, best0 = s.bestStreak;
      s.score += pts;
      s.hits++;
      if (g === 'perfect') s.perfects++;
      s.missRun = 0;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      s.heat = Math.max(0, s.heat + HEAT.hit);
      s.strayHeat = Math.min(s.heat, Math.max(0, s.strayHeat + HEAT.hit)); // mashing heat cools first
      let leveled = false;
      if (s.streak % MULT_STEP === 0 && s.earned < MULT_MAX) { s.earned++; leveled = true; }
      adapt.record(true, t);
      // What this hit added, so a slap across the lanes can take it back (see SCATTER).
      const undo = { pts, perfect: g === 'perfect', leveled, best: best0, heat: heat0 - s.heat, stray: stray0 - s.strayHeat, combo: false };
      return { pts, mult, leveled, streak: s.streak, undo };
    },
    /** Take back a hit that turned out to be part of a slap across the lanes: it never happened. */
    unhit(u) {
      s.score -= u.pts;
      s.hits--;
      if (u.perfect) s.perfects--;
      if (u.combo) s.combos--;
      if (s.streak > 0) s.streak--;
      s.bestStreak = Math.max(u.best, s.streak);
      if (u.leveled) s.earned = Math.max(1, s.earned - 1);
      s.heat = Math.min(HEAT.max, s.heat + u.heat);
      s.strayHeat = Math.min(s.heat, s.strayHeat + u.stray);
      s.slaps++;
    },
    /** A note slid by in a grace moment: no heat and no miss, but the combo starts again. */
    slip() { s.streak = 0; },
    /** A note slid by. `heatFree` (right after a pause): it counts like any other, but adds no heat. */
    miss(t = 0, heatFree = false) {
      const before = s.heat;
      s.misses++;
      s.missRun++;
      s.streak = 0;
      if (s.missRun >= 2 && !heatFree) s.heat = Math.min(HEAT.max, s.heat + HEAT.miss); // the first miss in a row is free
      adapt.record(false, t);
      return { heatUp: s.heat - before };
    },
    /**
     * A tap with no note near. Three within half a second (mashing) warms things up a little and
     * starts the combo again (the multiplier already earned stays saved).
     */
    stray(t = 0) {
      for (let i = s.strays.length - 1; i >= 0; i--) if (t - s.strays[i] > STRAY.secs) s.strays.splice(i, 1);
      s.strays.push(t);
      if (s.strays.length < STRAY.taps) return { burst: false };
      s.strays.length = 0;
      s.bursts++;
      s.streak = 0;
      const before = s.heat;
      s.heat = Math.min(HEAT.max, s.heat + HEAT.stray);
      s.strayHeat += s.heat - before;
      return { burst: true };
    },

    /**
     * Start (or continue) holding CHILL. Letting go keeps the progress for next time — but if the
     * heat has climbed into a hotter zone since, that is a new heat run: it needs a breath of its
     * own (kept progress is capped at 1 − FRESH_P), so a breath can't be banked in advance.
     */
    chillStart() {
      if (s.chilling) return false;
      const z = zoneOf(s.heat);
      if (s.chillP === 0 || b.newRun) {
        s.chillP = b.keptP;
        s.cycleZone = z;
        s.cycleTop = z;
        s.cycleReal = s.heat - s.strayHeat >= HEAT.warm; // Warm from misses, not from mashing
      } else if (ZONE_RANK[z] > ZONE_RANK[s.cycleTop]) s.cycleTop = z;
      // The heat being breathed away now came mostly from mashing: it still melts, but it's no
      // frustration run (no grace, no crew chill, no HOT-chill moment). Melting keeps the mix.
      s.cycleMash = s.strayHeat * 2 > s.heat;
      s.chilling = true;
      return true;
    },
    /** Heat melts evenly to 0 over the 3 s; returns the completion when the breath is done. */
    chillTick(dt, t = 0) {
      if (!s.chilling) return null;
      const p0 = s.chillP;
      const p1 = Math.min(1, p0 + dt / CHILL_SECS);
      const k = p1 >= 1 ? 0 : (1 - p1) / (1 - p0);
      s.heat *= k;
      s.strayHeat *= k;
      s.chillP = p1;
      if (p1 < 1) return { done: false, p: p1 };
      s.chilling = false;
      s.chillP = 0;
      s.heat = 0;
      s.strayHeat = 0;
      s.stopZone = 'cool';
      s.breaths = (s.breaths || 0) + 1; // every finished breath
      // Only chills that cooled a real heat run (not a Cool one, not mashing heat) earn the crew's praise.
      const real = !!s.cycleTop && s.cycleTop !== 'cool' && !s.cycleMash;
      if (real) s.chills++;
      s.missRun = 0;
      s.strays.length = 0;
      let early = 0;
      if (s.cycleZone === 'warm' && s.cycleReal && t - s.lastEarly >= EARLY_GAP_SECS) {
        early = EARLY_CHILL;
        s.score += early;
        s.earlyChills++;
        s.lastEarly = t;
      }
      if (real && s.cycleTop === 'hot') { s.hotChills++; s.bestHotChill = Math.max(s.bestHotChill, s.earned); }
      return { done: true, early, mult: b.mult, from: s.cycleTop, mash: s.cycleMash };
    },
    /** Let go early (or pointercancel): progress is kept, nothing is lost. */
    chillStop() {
      if (!s.chilling) return null;
      s.chilling = false;
      s.stopZone = zoneOf(s.heat);
      return { p: s.chillP };
    },

    free(g) {
      const pts = (FREE_PTS[g] || FREE_PTS.good) * b.mult;
      s.score += pts;
      s.freeHits++;
      if (g === 'perfect') s.perfects++;
      return { pts, mult: b.mult };
    },

    /** The round's best moment — principle moments first. */
    bestMoment() {
      if (s.bestHotChill >= MULT_MAX) return 'Chilled at HOT and came back to x4!';
      if (s.hotChills) return s.bestHotChill >= 2 ? `Chilled at HOT and came back to x${s.bestHotChill}!` : 'Chilled at HOT and cooled right down!';
      if (s.earlyChills) return `Early chill at Warm: +${EARLY_CHILL}!`;
      if (s.chills) return 'Took a chill and came back strong!';
      if (s.bestStreak >= 10) return `Combo of ${s.bestStreak}!`;
      if (s.freeHits >= 6) return `${s.freeHits} on-beat moves in the freestyle!`;
      if (s.perfects >= 5) return `${s.perfects} perfect hits!`;
      return 'You found the groove!';
    },
  };
  return b;
}

/** End-card chips for a round's stats: { icon, color?, text, cls? } — never a zero count. */
export function endTags(s) {
  return [
    s.bestStreak > 0 && { icon: 'flame', color: '#FF9F43', text: `Best combo ${s.bestStreak}` },
    s.perfects > 0 && { icon: 'star', text: `${s.perfects} perfect` },
    s.chills > 0 && { icon: 'calm', text: `${s.chills} chill${s.chills > 1 ? 's' : ''}`, cls: 'bb-tag-chill' },
  ].filter(Boolean);
}

// ---------------------------------------------------------------- one round
/**
 * A playable round: the chart + the scoring core, driven by song beats. The view calls
 * spawn/advance/holdTick every frame (except while chilling), and press/swipe/release/freeTap
 * from input. Every method returns a small event object the view turns into juice.
 */
export function createRun({ tier: tierIn = 'groove', seed = 1, makeAdapt = createAdapt } = {}) {
  const tier = typeof tierIn === 'string' ? tierById(tierIn) : tierIn;
  const shape = roundShape(tier);
  const { spb, travelBeats } = shape;
  const notes = buildChart(tier, seed);
  const b = createBattle(tier, { makeAdapt });
  const s = b.s;
  const held = new Map();   // pointerId → hold note being held
  const swipes = new Map(); // pointerId → { note, grade } waiting for the flick
  const freeBeats = new Set();
  let spawnIdx = 0;
  let firstOpen = 0;
  let graceUntil = -Infinity, graceMode = null, graceAt = -Infinity, resumeAt = -Infinity, holdP0 = 0, before = null;
  const CHILL_KEYS = ['chillP', 'heat', 'strayHeat', 'cycleZone', 'cycleTop', 'cycleReal', 'cycleMash', 'stopZone'];
  /**
   * Grace for the notes right after a pause, by kind:
   *   full   — a finished chill that cooled a real heat run: those notes are simply free;
   *   breath — a real partial breath at Warm/HOT: heat-free and not counted, the combo restarts (every 6 s at most);
   *   resume — Keep going after "Take five": heat-free only, the notes still count (every 20 s at most).
   * A weaker grace never cuts short a stronger one that is still running.
   */
  const RANK = { resume: 1, breath: 2, full: 3 };
  const giveGrace = (beat, mode) => {
    if (mode === 'breath' && (beat - graceAt) * spb < GRACE_GAP_SECS) return false;
    if (mode === 'resume' && (beat - resumeAt) * spb < RESUME_GAP_SECS) return false;
    if (beat < graceUntil && RANK[graceMode] > RANK[mode]) return false;
    graceUntil = beat + GRACE_BEATS;
    graceMode = mode;
    if (mode === 'resume') resumeAt = beat; else graceAt = beat;
    return true;
  };

  // Lane presses of the last moments (song seconds), to catch a slap across the lanes (SCATTER).
  // { t, lane, empty, note?, undo?, void? } — `empty`: nothing to hit in that lane.
  const taps = [];
  const SC = scatterSecs(tier) + 1e-9;
  const emptyLanesNear = (t, lane) => {
    const seen = new Set();
    for (const x of taps) if (x.empty && x.lane !== lane && Math.abs(x.t - t) <= SC) seen.add(x.lane);
    return seen.size;
  };
  /** A hit that turned out to be part of a slap: the note is used up, and nothing is earned. */
  const voidTap = x => {
    x.void = true;
    const n = x.note;
    if (!n.hit && !n.pending) return; // a flick that never came: nothing was earned, the note is still there
    n.scatter = true;
    if (x.undo) { b.unhit(x.undo); x.undo = null; } else s.slaps++;
    if (n.kind === 'hold') { n.done = true; for (const [pid, h] of held) if (h === n) held.delete(pid); }
    if (n.pending) { n.pending = false; n.hit = true; for (const [pid, w] of swipes) if (w.note === n) swipes.delete(pid); }
  };
  /** An empty press: remember it, and take back any hit it turns into a slap. */
  const emptyPress = (out, lane, t) => {
    taps.push({ t, lane, empty: true });
    const voided = [];
    for (const x of taps) {
      if (x.empty || x.void || Math.abs(x.t - t) > SC) continue;
      if (emptyLanesNear(x.t, x.lane) >= SCATTER.lanes) { voidTap(x); voided.push(x.note); }
    }
    if (voided.length) out.scatter = voided;
    return out;
  };

  const resolved = n => !n.live || n.missed || (n.hit && (n.kind !== 'hold' || n.done));

  const run = {
    tier, shape, notes, battle: b, s, spb,
    get spawned() { return spawnIdx; },
    get firstOpen() { return firstOpen; },
    get chilling() { return s.chilling; },

    /** Notes entering the screen are decided now: played if their rank fits today's density. */
    spawn(beat) {
      while (spawnIdx < notes.length && notes[spawnIdx].beat <= beat + travelBeats + 0.3) {
        const n = notes[spawnIdx++];
        const mate = n.pair != null ? notes[n.pair] : null;
        n.live = mate && mate.live !== undefined ? mate.live : !!n.teach || n.r <= b.density;
      }
    },
    /** Notes that slid past the line. Never while chilling — the song is waiting. */
    advance(beat, out = []) {
      if (s.chilling) return out;
      const win = 0.2 * b.scale;
      for (let i = firstOpen; i < spawnIdx; i++) {
        const n = notes[i];
        if (!n.live || n.hit || n.missed || n.pending) continue;
        if ((beat - n.beat) * spb <= win) continue;
        n.missed = true;
        n.missedAt = beat;
        const grace = n.beat < graceUntil ? graceMode : null;
        if (grace === 'full' || grace === 'breath') { n.free = true; if (grace === 'breath') b.slip(); }
        else n.heatUp = b.miss(beat * spb, grace === 'resume').heatUp;
        out.push(n);
      }
      while (firstOpen < spawnIdx && resolved(notes[firstOpen]) && notes[firstOpen].beat < beat - 1) firstOpen++;
      return out;
    },
    holdTick(beat, out = []) {
      for (const [pid, n] of held) {
        if (n.done) { held.delete(pid); continue; }
        if (beat >= n.beat + n.len) { held.delete(pid); out.push(completeHold(n)); }
      }
      return out;
    },

    /** A finger lands in a lane at song beat `beat`. */
    press(lane, beat, pid = 0) {
      if (s.chilling || beat >= shape.freeBeat) return { type: 'ignored' };
      const t = beat * spb;
      for (let i = taps.length - 1; i >= 0; i--) if (Math.abs(t - taps[i].t) > 2 * SC) taps.splice(i, 1);
      let best = null, bd = Infinity, first = null;
      for (let i = firstOpen; i < spawnIdx; i++) {
        const n = notes[i];
        if (n.lane !== lane || !n.live || n.hit || n.missed || n.pending) continue;
        first = first || n; // notes are in beat order: the lane's oldest open note
        const d = Math.abs(beat - n.beat) * spb;
        if (d < bd) { best = n; bd = d; }
      }
      // A tap still inside the oldest note's window is for that note: a late tap never steals the
      // next note in the lane (which would leave this one to slide by).
      if (first && first !== best && gradeTap((beat - first.beat) * spb, { scale: b.scale }).grade) { best = first; bd = Math.abs(beat - first.beat) * spb; }
      if (!best || bd > NEAR_SECS) {
        if (beat < 2) return emptyPress({ type: 'stray', burst: false }, lane, t);
        return emptyPress({ type: 'stray', ...b.stray(t) }, lane, t);
      }
      let g = gradeTap((beat - best.beat) * spb, { scale: b.scale }).grade;
      if (!g) {
        best.fumbles = (best.fumbles || 0) + 1;
        const out = { type: beat < best.beat ? 'early' : 'late', note: best };
        if (best.fumbles < FUMBLES || beat < 2) return out; // an attempt at this note: not an empty lane
        b.slip(); // mashing: the combo starts again and it warms things up like stray taps
        return emptyPress({ ...out, mash: true, ...b.stray(t) }, lane, t);
      }
      const tap = { t, lane, empty: false, note: best, undo: null, void: false };
      taps.push(tap);
      // Part of a slap across the lanes (two or more empty lanes pressed right around it)?
      if (emptyLanesNear(t, lane) >= SCATTER.lanes) {
        best.hit = true;
        voidTap(tap);
        return { type: 'scatter', note: best };
      }
      if (best.fumbles) g = 'good'; // a second try still counts, just as a "Nice!"
      if (best.kind === 'swipe') {
        best.pending = true;
        swipes.set(pid, { note: best, grade: g, tap });
        return { type: 'swipeStart', note: best, grade: g };
      }
      best.hit = true;
      const out = { type: 'hit', note: best, grade: g, ...b.hit(g, t) };
      tap.undo = out.undo;
      if (best.kind === 'hold') held.set(pid, best);
      const mate = best.pair != null ? notes[best.pair] : null;
      if (mate?.hit && !mate.scatter) {
        out.combo = COMBO_PTS * b.mult; s.score += out.combo; s.combos++;
        tap.undo.pts += out.combo; tap.undo.combo = true;
      }
      return out;
    },
    /** The finger flicked. The right direction keeps the timing grade; any flick still counts. */
    swipe(pid, dir, beat) {
      const w = swipes.get(pid);
      if (!w) return null;
      swipes.delete(pid);
      const n = w.note;
      n.pending = false;
      if (n.hit || n.missed) return null;
      const ok = dir === n.dir;
      const g = ok ? w.grade : 'good';
      n.hit = true;
      const out = { type: 'hit', note: n, grade: g, swipe: true, dirOk: ok, ...b.hit(g, beat * spb) };
      w.tap.undo = out.undo; // judged with its press: a slap around the press can still take it back
      return out;
    },
    /**
     * The finger lifted. If the system cancelled it (an iOS gesture), that's never held against
     * the player: a swipe waiting for its flick counts as flicked, a hold keeps what it earned.
     */
    release(pid, beat, cancelled = false) {
      const w = swipes.get(pid);
      if (w && cancelled) return run.swipe(pid, null, beat);
      if (w) { swipes.delete(pid); w.note.pending = false; return { type: 'swipeHint', note: w.note }; }
      const n = held.get(pid);
      if (!n) return null;
      held.delete(pid);
      if (n.done) return null;
      const frac = Math.max(0, Math.min(1, (beat - n.beat) / n.len));
      if (frac >= 0.85) return completeHold(n);
      n.done = true;
      const pts = Math.round(HOLD_PTS * n.len * frac) * b.mult;
      s.score += pts;
      return { type: 'holdPartial', note: n, pts, frac };
    },

    /**
     * Keep going after a pause ("Take five"): notes the player had no time to reach add no heat.
     * They still count as slid by (so pausing is never a shield), and at most once every 20 s.
     */
    grace(beat) {
      taps.length = 0; // the song waited: presses before the pause are settled
      return giveGrace(beat, 'resume');
    },

    /**
     * A hit whose pop should wait: an empty lane was pressed right by it and it is not settled yet,
     * so it may still turn out to be part of a slap. (A clean hit pops at once.)
     */
    slapRisk(note, beat) {
      const t = beat * spb;
      return taps.some(x => x.note === note && !x.void && t - x.t < SC && emptyLanesNear(x.t, x.lane) > 0);
    },
    /** The score to show right now: a hit joins it once it can no longer turn out to be part of a slap. */
    shownScore(beat) {
      if (s.chilling) return s.score;
      const t = beat * spb;
      let wait = 0;
      for (const x of taps) if (x.undo && !x.void && t - x.t < SC) wait += x.undo.pts;
      return s.score - wait;
    },

    chillStart(beat) {
      if (beat < 0 || s.chilling) return null;
      before = CHILL_KEYS.map(k => s[k]);
      b.chillStart();
      holdP0 = s.chillP;
      // Fingers still on notes stay where they are; the song simply waits.
      return { type: 'chillStart', p: s.chillP, zone: s.cycleTop };
    },
    chillTick(dt, beat) {
      const r = b.chillTick(dt, beat * spb);
      if (r?.done) taps.length = 0; // a real breath settles every press before it (the song waited)
      // The grace is for a breath that cooled a real heat run: a CHILL on a timer while Cool, or
      // melting heat that came from mashing, isn't a shield.
      if (r?.done && r.from !== 'cool' && !r.mash) giveGrace(beat, 'full');
      return r;
    },
    /** Let go early: progress is kept. A quick tap is not a breath, so it changes nothing. */
    chillStop(beat) {
      const r = b.chillStop();
      if (!r) return null;
      const held = r.p - holdP0;
      if (held < BRIEF_P) { CHILL_KEYS.forEach((k, i) => { s[k] = before[i]; }); return { ...r, p: s.chillP, brief: true, grace: false }; }
      taps.length = 0;
      return { ...r, brief: false, grace: held >= GRACE_MIN_P - 1e-9 && s.cycleTop !== 'cool' && !s.cycleMash && giveGrace(beat, 'breath') };
    },

    /** Freestyle: any tap near a beat scores once per beat. */
    freeTap(beat) {
      if (s.chilling || beat < shape.freeBeat - 0.25 || beat > shape.totalBeats + 0.25) return null;
      const nb = Math.round(beat);
      const g = gradeTap((beat - nb) * spb, { scale: tier.scale }).grade;
      if (!g || freeBeats.has(nb) || nb < shape.freeBeat || nb >= shape.totalBeats) return { type: 'freeOff', beat: nb };
      freeBeats.add(nb);
      return { type: 'free', grade: g, beat: nb, ...b.free(g) };
    },

    result() {
      return { score: s.score, best: b.bestMoment(), crew: { chills: s.chills } };
    },
    /** The end-card chips: only what happened (a chip with nothing to count isn't shown). */
    endTags() { return endTags(s); },
  };

  function completeHold(n) {
    n.done = true;
    s.holds++;
    const pts = HOLD_PTS * n.len * b.mult;
    s.score += pts;
    return { type: 'holdDone', note: n, pts };
  }
  return run;
}
