// Crew Combo rules — pure, no DOM (unit-tested in Node).
//
// Two players share one chart: every main note arrives on both sides together.
//   both hit it on the beat, within ±150 ms of each other → SYNC!  the combo grows, 100 × multiplier
//   only one hits (or a hit is loose)                     → a solo hit: +30, the combo holds ("Crew's got you")
//   nobody hits                                           → the first one is free; after that crew heat rises
// "On the beat" means a clean hit on the drawn pad: inside the note's 'great' window, with no stray
// tap just before it (or pressed with it), and from a side that's reading the notes — one that hit
// the other pad on 2 of its last 4 notes (or 4 of its last 10) is guessing: guesses never sync and
// count as loose hits. So drumming on both pads, on one pad, or left-right-left-right on every beat
// without watching hardly ever syncs: reading the lanes together is what scores.
// The multiplier climbs x1 → x4 with syncs and never drops by itself. Heat squeezes it
// (Warm caps x2, HOT caps x1); a two-hand CHILL (both hold 2.5 s) cools the heat, brings the
// full multiplier back and adds a Crew-breath bonus (it refills over ~20 s, so it can't be farmed)
// — so at high heat, chilling together wins.
// Each side adapts on its own, invisibly: a side that's missing gets a gentler window and either
// pad counts (the other pad holds the combo as a solo hit, but only the drawn pad can sync);
// a side that's cruising gets a sharper window. Both sides always see the same notes.
// Only shared numbers exist: nothing here is counted per player.
import { isAdult } from '../rules.js';
import { grade } from './rhythm.js';
import { icon } from '../ui.js';

export const BPM = 96;
export const COUNT_IN = 4;
export const BARS = 28;                 // bar 0 intro · bars 1–26 notes · bar 27 outro
export const FINALE_BAR = 23;
export const END_BEAT = 27 * 4 + 2;     // the round ends mid-outro (~75 s with the count-in)
export const TRAVEL = 1.7;              // seconds a note takes to fall — the same on both sides

export const SYNC_WINDOW = 0.15;        // both hits within ±150 ms of each other
export const BASE_WINDOW = 0.2;         // a hit counts within ±200 ms of the note (× side scale)
export const SYNC_NOTE = 0.13;          // …and syncs only when each is within ±130 ms (× side scale) = 'great'
export const CLEAN_GAP = 0.25;          // a stray tap this close before a hit makes it a solo (mashing)
export const CHORD_GAP = 0.05;          // a stray pressed with the hit (both pads at once) does too
export const GUESS_OF = 4;              // a side that hit the other pad on GUESSES of its last GUESS_OF
export const GUESSES = 2;               // notes (within GUESS_BEATS) is guessing: its hits don't sync
export const GUESS_BEATS = 8;
export const GUESS_LONG = { of: 10, guesses: 4, beats: 20 }; // …nor does one that did on 4 of its last 10
export const FLAIR_WINDOW = 0.15;
export const SYNC_PTS = 100;            // × crew multiplier
export const PERFECT_BONUS = 20;
export const SOLO_PTS = 30;
export const LOOSE_PTS = 10;            // a hit that came out of a mash (or a guess) still counts, just for less
export const FLAIR_PTS = 20;
export const SYNCS_PER_STEP = 4;
export const MAX_MULT = 4;
export const WARM = 40;
export const HOT = 70;
export const HEAT = { doubleMiss: 22, strays: 6, sync: -5, solo: -2 };
export const CHILL_SECS = 2.5;
export const BREATH_BONUS = { warm: 250, hot: 150 };  // noticing early is worth more
export const BREATH_REFILL = 20;        // game seconds for the breath bonus to refill after a breath
export const THIN_LEVEL = 0.2;
export const LEARN_BARS = 4;          // the first bars are for learning: no heat while the crew finds the beat
export const LEARN_END_BEAT = (LEARN_BARS + 1) * 4;
export const STREAK_POPS = [5, 10, 15, 20, 30, 40, 50, 60, 80];

export const heatLevel = h => (h >= HOT ? 'hot' : h >= WARM ? 'warm' : 'cool');
export const multCap = h => (h >= HOT ? 1 : h >= WARM ? 2 : MAX_MULT);
export const baseMultFor = syncs => Math.min(MAX_MULT, 1 + Math.floor(syncs / SYNCS_PER_STEP));

/** What one side's difficulty level (0..1) means. Always inside these bounds, and never visible. */
export function sideParams(level) {
  const l = Math.min(1, Math.max(0, Number(level) || 0));
  return {
    either: l < 0.3,                                           // either pad counts (drawn like any note)
    windowScale: 1.35 - 0.45 * l,                              // 1.35 (gentle) … 0.9 (sharp)
    flair: l >= 0.6 ? Math.min(0.5, ((l - 0.6) / 0.4) * 0.5) : 0, // chance of an extra off-beat star (crew-wide)
  };
}

/** ctx.adapt options for one side. Grown-ups quietly start a notch higher. */
export function adaptOptions(player) {
  return { min: 0, max: 1, start: isAdult(player) ? 0.6 : 0.4, step: 0.12, window: 6, missesToEase: 3, hitsToRamp: 6, cooldown: 3 };
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PAT = { half: [0, 2], three: [0, 1, 2], four: [0, 1, 2, 3], skip: [0, 2, 3], push: [0, 1, 3], pickup: [1, 2, 3] };
function barPattern(bar, rnd) {
  if (bar <= 4) return PAT.half;
  if (bar <= 8) return bar % 2 ? PAT.three : PAT.half;
  if (bar <= 16) return [PAT.three, PAT.four, PAT.skip, PAT.push][Math.floor(rnd() * 4)];
  if (bar < FINALE_BAR) return [PAT.four, PAT.four, PAT.pickup, PAT.skip][Math.floor(rnd() * 4)];
  return PAT.four;
}

// Lanes can't be played blind. Drumming one pad on every beat matches a run of notes in one lane;
// tapping left-right-left-right on every beat matches a run of notes that zig-zag with the beat
// (lane = beat parity, or its opposite: the note's "swing"). The guess rule only lets a blind
// tapper sync inside a long run like that, so both runs stay short. (No strict L-R-L-R finale.)
export const MAX_SAME = 2;   // never 3 notes in a row in one lane
export const MAX_SWING = 3;  // never 4 notes in a row that zig-zag with the beat
export const swingOf = (lane, beat) => lane ^ (beat & 1);

/** The shared chart: main notes on whole beats (≥ 1 beat apart), lane 0/1, no long blind-friendly runs. */
export function buildChart(seed = 1) {
  const rnd = seeded(seed);
  const notes = [], pick = [];
  for (let bar = 1; bar < BARS - 1; bar++) {
    for (const b of barPattern(bar, rnd)) {
      notes.push({ beat: bar * 4 + b, lane: 0, bar, strong: b % 2 === 0 });
      pick.push(rnd() < 0.5 ? 0 : 1);
    }
  }
  // Each note takes its random lane unless that makes a long run. After a gap the two rules can box
  // a note in; then back up and take the other lane a note earlier (there's always a way through).
  const runOf = (i, k, same) => i >= k && Array.from({ length: k }, (_, j) => notes[i - 1 - j]).every(m => same(m, notes[i]));
  const fits = i => !runOf(i, MAX_SAME, (m, n) => m.lane === n.lane)
    && !runOf(i, MAX_SWING, (m, n) => swingOf(m.lane, m.beat) === swingOf(n.lane, n.beat));
  const tried = notes.map(() => 0);
  for (let i = 0; i < notes.length;) {
    if (tried[i] === 2) { tried[i] = 0; i--; continue; }
    notes[i].lane = tried[i]++ ? 1 - pick[i] : pick[i];
    if (fits(i)) i++;
  }
  return notes;
}

const NONE = Object.freeze([]);

/**
 * The shared round. Times are rhythm seconds; timeOf(beat) must stay correct across pauses.
 *   spawn(now)            reveal notes entering the lanes (decides each side's note form)
 *   press(side, lane, t)  a pad press judged at t → events
 *   update(now)           settle notes whose windows closed → events
 *   chill(dt, bothHold)   two-hand CHILL → null | { kind: 'breathing', frac } | { kind: 'breath', … }
 * Events: hit · sync · solo · covered · guess · flair · stray · miss · heat.
 */
export function createCrew({ chart, adapt, timeOf, rnd = Math.random }) {
  const notes = chart.map(n => ({
    beat: n.beat, lane: n.lane, bar: n.bar, strong: n.strong, i: 0,
    shown: false, skip: false, done: false, sync: false,
    either: [false, false], scale: [1, 1], hit: [null, null], at: [0, 0], grade: [null, null], clean: [false, false], paired: false, solo: [0, 0], closed: [false, false], wrong: [false, false],
  }));
  notes.forEach((n, i) => { n.i = i; });
  const flair = [];
  const strays = [[], []];
  const st = { score: 0, syncs: 0, streak: 0, bestStreak: 0, heat: 0, doubleRun: 0, chills: 0, chillProgress: 0, peakMult: 1, perfectSyncs: 0, breathAtHot: 0, restoredTo: 0, now: -Infinity, lastBreath: -Infinity };
  const lastStray = [-Infinity, -Infinity];
  const lastHit = [null, null];
  const breathing = { kind: 'breathing', frac: 0 };
  let out = [];
  let spawnIdx = 0, openIdx = 0;

  const drain = () => { if (!out.length) return NONE; const r = out; out = []; return r; };
  const windowFor = (n, s) => BASE_WINDOW * n.scale[s];
  const effMult = () => Math.min(baseMultFor(st.syncs), multCap(st.heat));

  function heatAdd(d) {
    const before = heatLevel(st.heat);
    st.heat = Math.max(0, Math.min(100, st.heat + d));
    if (st.heat < WARM) st.chillProgress = 0;
    const after = heatLevel(st.heat);
    if (after !== before) out.push({ kind: 'heat', level: after, rising: d > 0 });
  }

  function spawn(now, travel = TRAVEL) {
    if (now > st.now) st.now = now;
    while (spawnIdx < notes.length && timeOf(notes[spawnIdx].beat) - now <= travel) {
      const n = notes[spawnIdx++];
      const lv = [adapt[0].level, adapt[1].level];
      // A crew that's struggling on both sides quietly gets fewer notes (off-beats drop out).
      if (!n.strong && lv[0] < THIN_LEVEL && lv[1] < THIN_LEVEL) { n.skip = true; continue; }
      for (let s = 0; s < 2; s++) {
        const p = sideParams(lv[s]);
        n.either[s] = p.either;
        n.scale[s] = p.windowScale;
      }
      n.shown = true;
      const next = notes[spawnIdx];
      if (next && next.beat - n.beat < 1) continue;
      // Flair stars only when the whole crew is cruising, and the same star on both sides:
      // nothing on screen shows which player is finding it harder.
      const p = sideParams(Math.min(lv[0], lv[1])).flair;
      if (p > 0 && rnd() < p) {
        const lane = next && next.beat - n.beat <= 1 ? 1 - next.lane : 1 - n.lane;
        for (let s = 0; s < 2; s++) flair.push({ beat: n.beat + 0.5, side: s, lane, done: false, hit: false, tried: false });
      }
    }
  }

  function sync(n) {
    n.sync = true;
    // A hit that was already scored alone (the partner's event came in late) upgrades: no double points.
    for (let s = 0; s < 2; s++) if (n.solo[s]) { st.score -= n.solo[s]; n.solo[s] = 0; }
    const before = baseMultFor(st.syncs);
    st.syncs++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    const perfect = n.grade[0] === 'perfect' && n.grade[1] === 'perfect';
    const mult = effMult();
    const pts = SYNC_PTS * mult + (perfect ? PERFECT_BONUS : 0);
    st.score += pts;
    if (perfect) st.perfectSyncs++;
    heatAdd(HEAT.sync);
    st.peakMult = Math.max(st.peakMult, effMult());
    const base = baseMultFor(st.syncs);
    out.push({ kind: 'sync', note: n, pts, perfect, mult: effMult(), streak: st.streak,
      multUp: base > before ? base : 0, milestone: STREAK_POPS.includes(st.streak) ? st.streak : 0 });
  }

  // Did this side hit the other pad on GUESSES of the last GUESS_OF notes it pressed on — or, over a
  // longer stretch, on GUESS_LONG.guesses of its last GUESS_LONG.of? (A blind tapper matches about
  // half the notes, so it gets there quickly; an honest slip now and then never does.)
  function guessing(n, s) {
    let pressed = 0, wrong = 0, recent = 0;
    for (let j = n.i - 1; j >= 0 && pressed < GUESS_LONG.of; j--) {
      const m = notes[j];
      if (n.beat - m.beat > GUESS_LONG.beats) break;
      if (m.hit[s] == null && !m.wrong[s]) continue;
      pressed++;
      if (!m.wrong[s]) continue;
      wrong++;
      if (pressed <= GUESS_OF && n.beat - m.beat <= GUESS_BEATS) recent++;
    }
    return recent >= GUESSES || wrong >= GUESS_LONG.guesses;
  }

  // A sync needs both hits on the beat: on the drawn pad, inside 'great', not part of a mash or a guess.
  const onBeat = (n, s) => n.clean[s] && !n.wrong[s] && Math.abs(n.hit[s]) <= SYNC_NOTE * n.scale[s] + 1e-9 && !guessing(n, s);

  function hitNote(n, s, d, t, off) {
    n.hit[s] = d;
    n.at[s] = t;
    n.grade[s] = grade(d, { scale: n.scale[s] }).grade;
    n.clean[s] = t - lastStray[s] >= CLEAN_GAP;
    if (off) n.wrong[s] = true; // the other pad, allowed while easing: holds the combo, never syncs
    lastHit[s] = { n, t };
    // Only the drawn pad teaches the adapter anything; an allowed other-pad hit leaves it be.
    if (!off) adapt[s].record(true, timeOf(n.beat));
    st.doubleRun = 0;
    out.push({ kind: 'hit', side: s, note: n });
  }

  // Once both have hit (and a chord's second press has had CHORD_GAP to show up), is it a sync?
  function pair(n, now) {
    if (n.paired || n.sync || n.hit[0] == null || n.hit[1] == null || now < Math.max(n.at[0], n.at[1]) + CHORD_GAP) return;
    n.paired = true;
    const ok0 = onBeat(n, 0), ok1 = onBeat(n, 1);
    if (ok0 && ok1 && Math.abs(n.hit[0] - n.hit[1]) <= SYNC_WINDOW + 1e-9) { sync(n); return; }
    // A guess cost the crew a sync the partner was ready for: nudge that side to read the notes.
    for (let s = 0; s < 2; s++) {
      if ((s ? ok0 : ok1) && !(s ? ok1 : ok0) && (n.wrong[s] || guessing(n, s))) out.push({ kind: 'guess', side: s, note: n });
    }
  }

  function solo(n, s) {
    const pts = n.clean[s] && !guessing(n, s) ? SOLO_PTS : LOOSE_PTS;
    n.solo[s] = pts;
    st.score += pts;
    heatAdd(HEAT.solo);
    out.push({ kind: 'solo', side: s, note: n, pts });
  }

  function doubleMiss(n) {
    st.doubleRun++;
    st.streak = 0;
    if (st.doubleRun >= 2 && n.bar > LEARN_BARS) heatAdd(HEAT.doubleMiss);
    out.push({ kind: 'miss', note: n });
  }

  function hitFlair(side, lane, t) {
    for (const f of flair) {
      if (f.done || f.side !== side || f.lane !== lane) continue;
      if (Math.abs(t - timeOf(f.beat)) <= FLAIR_WINDOW) {
        f.done = true; f.hit = true;
        st.score += FLAIR_PTS;
        out.push({ kind: 'flair', side, lane, pts: FLAIR_PTS, note: f });
        return true;
      }
    }
    return false;
  }

  function stray(side, lane, t) {
    out.push({ kind: 'stray', side, lane });
    // Both pads at once: the hit that came with this press wasn't aimed.
    const h = lastHit[side];
    if (h && !h.n.paired && t - h.t <= CHORD_GAP) h.n.clean[side] = false;
    // Reaching for a flair star and just missing it isn't mashing (one try per star).
    for (const f of flair) {
      if (!f.done && !f.tried && f.side === side && f.lane === lane && Math.abs(t - timeOf(f.beat)) <= FLAIR_WINDOW * 2) { f.tried = true; return; }
    }
    // The other pad while a note is in reach is a guess on that note.
    for (let i = Math.max(0, openIdx - 2); i < notes.length; i++) {
      const n = notes[i];
      const T = timeOf(n.beat);
      if (T - t > 0.6) break;
      if (n.shown && n.lane !== lane && Math.abs(t - T) <= windowFor(n, side)) n.wrong[side] = true;
    }
    lastStray[side] = t;
    if (t < timeOf(LEARN_END_BEAT)) return; // the learning bars: drum away, no heat
    const a = strays[side];
    a.push(t);
    while (a.length && t - a[0] > 1.5) a.shift();
    if (a.length >= 4) { a.length = 0; heatAdd(HEAT.strays); } // a burst of mashing warms things up a little
  }

  function press(side, lane, t) {
    let best = null, bestD = Infinity;
    for (let i = openIdx; i < notes.length; i++) {
      const n = notes[i];
      const T = timeOf(n.beat);
      if (T - t > 0.6) break;
      if (!n.shown || n.done || n.hit[side] != null || n.closed[side]) continue;
      const d = Math.abs(t - T);
      if (d > windowFor(n, side)) continue;
      if (!n.either[side] && n.lane !== lane) continue;
      if (d < bestD) { best = n; bestD = d; }
    }
    if (best) hitNote(best, side, t - timeOf(best.beat), t, best.lane !== lane);
    else if (!hitFlair(side, lane, t)) stray(side, lane, t);
    return drain();
  }

  function update(now) {
    if (now > st.now) st.now = now;
    for (let i = openIdx; i < notes.length; i++) {
      const n = notes[i];
      const T = timeOf(n.beat);
      if (T - now > 0.5) break;
      if (!n.done && n.skip && now - T > 0.3) n.done = true;
      if (!n.done && n.shown) {
        pair(n, now);
        for (let s = 0; s < 2; s++) {
          if (n.hit[s] != null) {
            if (!n.sync && !n.solo[s] && (n.paired || now - (T + n.hit[s]) > SYNC_WINDOW + CHORD_GAP)) solo(n, s);
          } else if (!n.closed[s] && now - T > windowFor(n, s)) {
            n.closed[s] = true;
            adapt[s].record(false, T);
          }
        }
        const settled = s => n.sync || n.solo[s] || n.closed[s];
        if (settled(0) && settled(1)) {
          n.done = true;
          if (n.closed[0] && n.closed[1]) doubleMiss(n);
          else if (n.closed[0] !== n.closed[1]) out.push({ kind: 'covered', side: n.closed[0] ? 0 : 1, note: n });
        }
      }
      if (n.done && i === openIdx) openIdx++;
    }
    for (const f of flair) if (!f.done && now - timeOf(f.beat) > FLAIR_WINDOW) f.done = true;
    while (flair.length && flair[0].done && now - timeOf(flair[0].beat) > 1) flair.shift();
    return drain();
  }

  function chill(dt, bothHolding) {
    if (st.heat < WARM) { st.chillProgress = 0; return null; }
    if (!bothHolding) return null; // letting go keeps the progress so far
    st.chillProgress += dt;
    if (st.chillProgress < CHILL_SECS) { breathing.frac = st.chillProgress / CHILL_SECS; return breathing; }
    const level = st.heat >= HOT ? 'hot' : 'warm';
    // The bonus refills over BREATH_REFILL game seconds: breathing again straight away still cools
    // things and brings the multiplier back, it just doesn't pay twice.
    const refill = Math.min(1, Math.max(0, (st.now - st.lastBreath) / BREATH_REFILL));
    const bonus = Math.round((BREATH_BONUS[level] * refill) / 10) * 10;
    const before = effMult();
    st.score += bonus;
    st.lastBreath = st.now;
    st.chills++;
    if (level === 'hot') st.breathAtHot++;
    heatAdd(-st.heat);
    st.chillProgress = 0;
    st.restoredTo = Math.max(st.restoredTo, effMult());
    return { kind: 'breath', bonus, level, mult: effMult(), restored: effMult() > before };
  }

  return {
    notes, flair, spawn, press, update, chill,
    get score() { return st.score; },
    get syncs() { return st.syncs; },
    get streak() { return st.streak; },
    get bestStreak() { return st.bestStreak; },
    get heat() { return st.heat; },
    get heatLevel() { return heatLevel(st.heat); },
    get mult() { return effMult(); },
    get baseMult() { return baseMultFor(st.syncs); },
    get chillReady() { return st.heat >= WARM; },
    get chillFrac() { return st.chillProgress / CHILL_SECS; },
    get chills() { return st.chills; },
    /** Shared numbers only — this is everything the end screen may use. */
    summary() {
      return { score: Math.round(st.score), syncs: st.syncs, bestStreak: st.bestStreak, chills: st.chills, breathAtHot: st.breathAtHot, peakMult: st.peakMult, restoredTo: st.restoredTo, perfectSyncs: st.perfectSyncs };
    },
  };
}

/** Best moment: prefers a principle moment (a long sync streak, a crew breath that won the multiplier back). */
export function bestMoment(sum) {
  if (sum.bestStreak >= 6) return `${sum.bestStreak} syncs in a row!`;
  if (sum.chills && sum.restoredTo >= 2) return `Crew breath together: back to x${sum.restoredTo}!`;
  if (sum.chills) return 'Crew breath together!';
  if (sum.bestStreak >= 2) return `${sum.bestStreak} syncs in a row!`;
  if (sum.syncs) return 'First sync together!';
  return 'You kept the beat as a crew!';
}

/** The round result for the shell. Names both players; every number is the crew's. */
export function buildResult(sum, nameA, nameB) {
  const phrase = sum.syncs >= 30 ? 'totally in sync!' : sum.syncs >= 10 ? 'what a crew combo!' : 'crew’s got you!';
  // Only what the crew did: a chip never shows a zero.
  const chips = [
    sum.syncs ? `<span class="tag">${icon('crew')} ${sum.syncs} sync${sum.syncs === 1 ? '' : 's'} together</span>` : '',
    sum.peakMult > 1 ? `<span class="tag">${icon('star')} x${sum.peakMult} crew combo</span>` : '',
    sum.chills ? `<span class="tag">${icon('calm')} ${sum.chills} crew breath${sum.chills === 1 ? '' : 's'}</span>` : '',
  ].join('');
  return {
    score: sum.score,
    best: bestMoment(sum),
    crew: { syncs: sum.syncs, chills: sum.chills },
    names: [nameA, nameB],
    title: `${nameA} + ${nameB}: ${phrase}`,
    extra: chips ? `<div class="combo-end">${chips}</div>` : '',
  };
}
