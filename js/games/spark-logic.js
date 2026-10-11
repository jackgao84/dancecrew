// Spot the Spark — pure round logic (no DOM). js/games/spark.js renders it; tests drive it directly.
//
// A crew member hits a frustrating moment and clues build one by one: a subtle one first (fists or
// cheeks), stomping in the middle, steam always last. Spotting at clue 1 scores 100, then
// 70 / 40 / 20: noticing early is worth the most, and it also finishes the scene sooner.
// Guessing isn't noticing: a tap (or "All good!") before any clue — or between scenes — scores
// nothing, shows a short "Watch closely…" (with a lock), and uses up that scene's top rung (a decoy
// called after a guess is worth half), so blind tapping never pays. When clue 1 comes is random
// enough that counting seconds can't stand in for watching. A tap on the character that misses the
// showing clue asks for a closer look ("Tap right on the clue!", a short lock that only lets a tap on a
// showing clue through); the first one in a scene keeps the top rung, any more are guesses.
// After a spot the player picks a cool-down — every one is valid — and the later the spot, the
// more cooling it takes (a tap early, a hold late). Decoy scenes (happy dancing) want "All good!".
// Score never goes down.
//
// Time is game seconds (the shell's pausable clock). Positions are in the avatar's 200×300 viewBox.

export const ROUND_SECS = 75;
export const CUES = ['fists', 'stomp', 'cheeks', 'steam'];
export const EARLY_CUES = ['fists', 'cheeks'];   // every spark starts with a subtle clue…
export const LAST_CUE = 'steam';                 // …and boils over last
export const HAPPY_CUES = ['notes', 'hop', 'cheer', 'glow'];
export const LADDER = [100, 70, 40, 20];        // spot at clue 1, 2, 3, 4
export const COOL_POINTS = 25;                   // every cool-down is a good one
export const DECOY_POINTS = 50;                  // "All good!" when they're just happy…
export const DECOY_GUESSED = 25;                 // …after a guess in that scene (a tap on them, or too soon)
export const STREAK_STEP = 10;                   // +10 per early spot in a row…
export const STREAK_MAX = 50;                    // …up to +50
export const LOCK_SECS = 0.8;                    // "Watch closely…" lock after a tap too soon…
export const LOCK_GROW = 0.4;                    // …a little longer for each extra guess this scene…
export const LOCK_MAX = 2.4;                     // …and every tap during it restarts it
export const HOLD_SECS = [0, 0, 0, 0.8, 1.4];    // cooling needed by spot stage (0 = one tap)
export const GAP_MIN = 0.75;                     // seconds between clues, always inside these bounds
export const GAP_MAX = 2.0;
export const T = { enter: 1.0, grace: 1.5, calm: 3.0, own: 2.8, yay: 2.4, coolGrace: 6 };
export const LEAD_JITTER = [0.2, 3.4];           // random extra wait before clue 1: you can't time it
const HOLD_PHASE = { calm: T.calm, own: T.own, yay: T.yay };   // how long each resting beat lasts

/** Cool-downs: icon-led, ≤ 3 words, all valid. `icon` is a ui.icon name or a spark-art icon. */
export const COOLS = [
  { id: 'breathe', label: 'Breathe', icon: 'calm', say: 'In… and out.' },
  { id: 'say', label: 'Say it', icon: 'words', say: 'I feel frustrated!' },
  { id: 'minute', label: 'Need a minute', icon: 'clock', say: 'I need a minute.' },
  { id: 'walk', label: 'Walk & back', icon: 'walk', say: 'Back in a sec!' },
  { id: 'squeeze', label: 'Squeeze', icon: 'squeeze', say: 'Squeeeeze…' },
  { id: 'count', label: 'Count to 5', icon: 'hand', say: '1, 2, 3, 4, 5…' },
];

// Where each clue sits on the avatar (viewBox 200×300) — also the centres of the hit circles.
// The first two points are where the art is drawn (left, right); extra points widen the target.
export const CUE_POINTS = {
  fists: [[60, 217], [140, 217], [100, 218]],    // either fist, or the tummy between them
  stomp: [[84, 272], [116, 272], [100, 254]],    // either foot, or the legs
  cheeks: [[64, 140], [136, 140], [100, 146]],   // either cheek, or the middle of the face
  steam: [[30, 60], [170, 60], [100, 64]],        // either puff, or the top of the head
  notes: [[26, 66], [176, 82]],
  hop: [[84, 272], [116, 272]],
  cheer: [[56, 128], [144, 128]],
  glow: [[64, 140], [136, 140]],
};
export const HIT_UNITS = 34;     // hit-circle radius in viewBox units…
export const HIT_MIN_PX = 40;    // …but never under 40 CSS px (80 px circles, well over 64)
export const BODY = { x0: 22, x1: 178, y0: 36, y1: 292 };   // the character's box (for kind hints)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Lock length after the n-th guess (0-based) in a scene. */
export const lockSecs = n => Math.min(LOCK_MAX, LOCK_SECS + LOCK_GROW * Math.max(0, n));
/** Spot points for a stage (1-based clue count when tapped). */
export const spotPoints = stage => LADDER[clamp(stage, 1, 4) - 1];
/** The ladder rung a spot lands on: a guess earlier in the scene costs the top rung. */
export const spotRung = (stage, guessed = false) => clamp(stage + (guessed ? 1 : 0), 1, 4);
/** Seconds of cooling a spot at this stage takes (0 = a single tap). */
export const coolNeed = stage => HOLD_SECS[clamp(stage, 1, 4)];
/** Hit radius in viewBox units for a character drawn at `pxPerUnit` CSS px per unit. */
export const hitRadius = (pxPerUnit = 1) => Math.max(HIT_UNITS, HIT_MIN_PX / Math.max(0.01, pxPerUnit));

/**
 * Seconds between clues: adaptive level (0 easy … 1 hard) and round progress (speeds up),
 * always clamped to [GAP_MIN, GAP_MAX].
 */
export function cueGap(level = 0.5, progress = 0, pace = 1) {
  const base = lerp(1.9, 1.1, clamp(level, 0, 1)) * lerp(1, 0.72, clamp(progress, 0, 1));
  return clamp(base * clamp(pace || 1, 0.7, 1.3), GAP_MIN, GAP_MAX);
}

/**
 * Which visible clue a tap means: the nearest visible clue point within the (generous) hit radius,
 * or null. A tap elsewhere on the character isn't a spot — you have to point at what you noticed.
 * Returns { cue, point, dist } or null.
 */
export function resolveTap(x, y, visible, pxPerUnit = 1) {
  if (!visible?.length) return null;
  const r = hitRadius(pxPerUnit);
  let best = null;
  for (const cue of visible) {
    for (const [px, py] of CUE_POINTS[cue] || []) {
      const d = Math.hypot(x - px, y - py);
      if (d <= r && (!best || d < best.dist)) best = { cue, point: [px, py], dist: d };
    }
  }
  return best;
}
/** Is (x, y) on the character at all? (For the kind "tap right on the clue" hint.) */
export const onBody = (x, y) => x >= BODY.x0 && x <= BODY.x1 && y >= BODY.y0 && y <= BODY.y1;

/** Word count for captions (≤ 8 words). {name} counts as one word. */
export const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/** Validate one scene; returns a list of problems (empty = fine). */
export function validateScene(s, { bgs = null, props = null, who = null } = {}) {
  const out = [];
  if (!s || typeof s !== 'object') return ['not an object'];
  if (!s.id) out.push('missing id');
  if (!s.text || wordCount(s.text) > 8) out.push(`caption must be 1–8 words: "${s.text}"`);
  if (s.calm && wordCount(s.calm) > 9) out.push(`calm line too long: "${s.calm}"`);
  const pool = s.decoy ? HAPPY_CUES : CUES;
  if (!Array.isArray(s.cues) || s.cues.length < (s.decoy ? 2 : 4)) out.push('needs its clues');
  else {
    if (new Set(s.cues).size !== s.cues.length) out.push('clues repeat');
    s.cues.forEach(c => { if (!pool.includes(c)) out.push(`unknown clue ${c}`); });
    if (!s.decoy && !EARLY_CUES.includes(s.cues[0])) out.push(`first clue must be subtle (${EARLY_CUES.join('/')}), not ${s.cues[0]}`);
    if (!s.decoy && s.cues[s.cues.length - 1] !== LAST_CUE) out.push(`${LAST_CUE} comes last`);
  }
  if (bgs && !bgs.includes(s.bg)) out.push(`unknown bg ${s.bg}`);
  if (props && s.prop && !props.includes(s.prop)) out.push(`unknown prop ${s.prop}`);
  if (who && !who.includes(s.who)) out.push(`unknown who ${s.who}`);
  if (s.lead != null && !(s.lead >= 0.5 && s.lead <= 4)) out.push('lead out of range');
  if (s.pace != null && !(s.pace >= 0.7 && s.pace <= 1.3)) out.push('pace out of range');
  return out;
}

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Order a round: the first scene is a real spark (the ghost teaches on it), decoys are spread out
 * (one every 3–4 scenes, never first, never two in a row). Enough scenes for any speed of play.
 */
export function planScenes(pool, rng, count = 18) {
  const sparks = pool.filter(s => !s.decoy);
  const decoys = pool.filter(s => s.decoy);
  if (!sparks.length) return shuffle(pool, rng).slice(0, count);
  let sBag = [], dBag = [];
  const nextSpark = () => { if (!sBag.length) sBag = shuffle(sparks, rng); return sBag.pop(); };
  const nextDecoy = () => { if (!dBag.length) dBag = shuffle(decoys, rng); return dBag.pop(); };
  const out = [];
  // First scene: prefer one whose first clue is the fists (the easiest to see and to show).
  const firsts = sparks.filter(s => s.cues[0] === 'fists');
  const first = (firsts.length ? firsts : sparks)[Math.floor(rng() * (firsts.length || sparks.length))];
  out.push(first);
  sBag = shuffle(sparks.filter(s => s !== first), rng);
  let untilDecoy = 2 + Math.floor(rng() * 2);
  while (out.length < count) {
    if (decoys.length && untilDecoy <= 0) { out.push(nextDecoy()); untilDecoy = 3 + Math.floor(rng() * 2); continue; }
    let s = nextSpark();
    if (s === out[out.length - 1] && sparks.length > 1) s = nextSpark();
    out.push(s);
    untilDecoy--;
  }
  return out;
}

/** Three different cool-downs to offer (all valid). */
export function pickCools(rng, n = 3) {
  return shuffle(COOLS, rng).slice(0, n);
}

/**
 * One round.
 *   const r = createSparkRound({ scenes, rng, adapt });
 *   r.start(t); each frame r.update(t); inputs r.tap(t, x, y, pxPerUnit) / r.allGood(t) /
 *   r.coolDown(t, id) / r.coolUp(t); r.teach() when the ghost hand shows a clue;
 *   r.drain() → events for the renderer; r.result() at the end.
 * Events: scene, cue, early, locked, nudge, spot, lookAgain, decoyTap, decoyYes, decoyPass, own,
 *         holdStart, holdEnd, cooled, next, end.
 */
export function createSparkRound({ scenes, rng = Math.random, adapt = null, duration = ROUND_SECS, plan = null } = {}) {
  const list = plan || planScenes(scenes, rng);
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });
  const st = {
    t0: 0, t: 0, idx: -1, scene: null, phase: 'idle', phaseAt: 0,
    cueTimes: [], shown: 0, gap: 1.5, lockUntil: -Infinity, guesses: 0, lesson: false, restless: false, nearUsed: false, softLock: NaN,
    stage: 0, need: 0, progress: 0, hold: null, options: [], coolId: null,
    score: 0, streak: 0, over: false,
  };
  const stats = {
    scenes: 0, spots: 0, firstClue: 0, byStage: [0, 0, 0, 0], cools: 0, coolIds: [],
    own: 0, decoys: 0, decoysRight: 0, decoysGuessed: 0, early: 0, near: 0, guessed: 0, lookAgain: 0, decoyTaps: 0, bestStreak: 0,
    taughtFirst: 0, firstClueScenes: [], bestSpot: null, decoyScene: null, cooledScene: null,
    // Sparks the player caught early (clue 1 or 2) on their own: no guess first, not walked through by
    // the ghost hand. The crew line, the end-card chip and the best moment all count these.
    earlySolo: 0,
  };

  const progress = t => clamp((t - st.t0) / duration, 0, 1);
  const timeUp = t => t - st.t0 >= duration;
  const visible = () => (st.phase === 'build' ? st.scene.cues.slice(0, st.shown) : []);
  const locked = t => t < st.lockUntil;
  const setPhase = (p, t) => { st.phase = p; st.phaseAt = t; };

  function nextScene(t) {
    if (timeUp(t)) return end(t);
    st.idx++;
    if (st.idx >= list.length) list.push(...planScenes(scenes || list, rng).slice(1));
    const s = st.scene = list[st.idx];
    stats.scenes++;
    if (s.decoy) stats.decoys++;
    st.shown = 0; st.stage = 0; st.lockUntil = -Infinity; st.lesson = false; st.nearUsed = false; st.hold = null; st.progress = 0; st.need = 0; st.coolId = null;
    // A tap between scenes (nothing to spot yet) counts as this scene's first guess.
    st.guesses = st.restless ? 1 : 0;
    st.restless = false;
    const pr = progress(t);
    st.gap = cueGap(adapt ? adapt.t : 0.4, pr, s.pace) * (st.idx === 0 ? 1.3 : 1);
    // A little randomness in the wait before the first clue: you can't time it, you have to watch.
    st.lead = (s.lead ?? 1.5) * lerp(0.6, 0.5, pr) + lerp(LEAD_JITTER[0], LEAD_JITTER[1], rng()) + (st.idx === 0 ? 0.6 : 0);
    st.cueTimes = [];
    setPhase('enter', t);
    emit('scene', { scene: s, idx: st.idx, gap: st.gap });
  }

  function end(t) {
    if (st.over) return;
    st.over = true;
    setPhase('over', t);
    emit('end', { score: st.score });
  }

  /** A guess: a short lock (a little longer each time) and this scene's top rung is used up. */
  function lock(t) {
    st.lockUntil = t + lockSecs(st.guesses++);
    return st.lockUntil;
  }
  const REST = { calm: 1, own: 1, yay: 1 };
  /** While the ghost hand is teaching, a wrong tap just nudges: no lock, no guess. */
  function nudge(kind) { emit('nudge', { kind }); return { kind: 'nudge' }; }

  function resolveUnspotted(t) {
    st.lesson = false;
    adapt?.record(false, t);
    st.streak = 0;
    if (st.scene.decoy) { setPhase('yay', t); emit('decoyPass', { scene: st.scene }); }
    else { stats.own++; setPhase('own', t); emit('own', { scene: st.scene }); }
  }

  function completeCool(t, id) {
    st.progress = st.need;
    st.hold = null;
    st.coolId = id;
    st.score += COOL_POINTS;
    stats.cools++;
    stats.coolIds.push(id);
    stats.cooledScene = st.scene;
    setPhase('calm', t);
    emit('cooled', { id, points: COOL_POINTS, scene: st.scene });
  }

  return {
    get state() { return st; },
    get stats() { return stats; },
    get score() { return st.score; },
    get phase() { return st.phase; },
    get scene() { return st.scene; },
    get visible() { return visible(); },
    get locked() { return locked(st.t); },
    /** The rung a spot would land on right now (0 = no clue yet). */
    get rung() { return st.shown ? spotRung(st.shown, st.guesses > 0) : 0; },
    /** True once a guess has used up the top rung (this scene, or the next one between scenes). */
    get guessed() { return REST[st.phase] ? st.restless : st.guesses > 0; },
    get coolFrac() { return st.need ? clamp(st.progress / st.need, 0, 1) : 0; },
    get plan() { return list; },
    progress,
    drain() { return events.splice(0, events.length); },

    start(t = 0) { st.t0 = st.t = t; nextScene(t); },

    update(t) {
      if (st.over) return;
      st.t = t;
      const ph = st.phase;
      if (ph === 'enter' && t >= st.phaseAt + T.enter) {
        setPhase('build', t);
        st.cueTimes = st.scene.cues.map((_, i) => t + st.lead + i * st.gap);
      }
      if (st.phase === 'build') {
        while (st.shown < st.scene.cues.length && t >= st.cueTimes[st.shown]) {
          st.shown++;
          emit('cue', { cue: st.scene.cues[st.shown - 1], stage: st.shown, decoy: !!st.scene.decoy });
        }
        const last = st.cueTimes[st.cueTimes.length - 1];
        if (st.shown === st.scene.cues.length && t >= last + T.grace) resolveUnspotted(t);
        else if (timeUp(t)) return end(t);
      }
      if (st.phase === 'enter' && timeUp(t)) return end(t);
      if (st.phase === 'cool') {
        if (st.hold) {
          st.progress = Math.min(st.need, st.hold.base + (t - st.hold.start));
          if (st.progress >= st.need) completeCool(t, st.hold.id);
        } else if (timeUp(t) && t >= Math.max(st.phaseAt, st.t0 + duration) + T.coolGrace) return end(t);
      }
      const dur = HOLD_PHASE[st.phase];
      if (dur && t >= st.phaseAt + dur) { emit('next'); nextScene(t); }
    },

    /** A tap on the play surface at viewBox (x, y). */
    tap(t, x, y, pxPerUnit = 1) {
      if (!st.over && REST[st.phase]) {
        st.restless = true;
        stats.early++;
        emit('early', { until: t + LOCK_SECS, rest: true });
        return { kind: 'early' };
      }
      if (st.over || (st.phase !== 'enter' && st.phase !== 'build')) return { kind: 'ignored' };
      if (!st.lesson && locked(t)) {
        // After a near miss ("Tap right on the clue!") a tap on a showing clue is the spot, top rung
        // kept; any other tap during that short lock is swallowed without counting against them.
        // Scanning stays bounded: a near miss needs a clue showing and only happens once a scene.
        if (st.lockUntil === st.softLock) {
          if (!resolveTap(x, y, visible(), pxPerUnit)) { emit('locked', { until: st.lockUntil, soft: true }); return { kind: 'locked' }; }
          st.lockUntil = -Infinity;
        } else {
          emit('locked', { until: lock(t) });
          return { kind: 'locked' };
        }
      }
      const hit = resolveTap(x, y, visible(), pxPerUnit);
      // On a happy scene any tap on them (once they're showing it) is a call that something's up.
      const onThem = st.shown > 0 && (hit || onBody(x, y));
      if (!hit || st.scene.decoy) {
        if (st.lesson) return nudge(st.scene.decoy && onThem ? 'decoyTap' : 'early');
        if (st.scene.decoy && onThem) {
          stats.decoyTaps++;
          emit('decoyTap', { until: lock(t), cue: hit?.cue || st.scene.cues[0] });
          return { kind: 'decoyTap' };
        }
        // On them with a clue showing, just not on it: they noticed something. The first time in a
        // scene it only asks for a closer look (short lock, top rung kept); after that it's a guess.
        const near = st.shown > 0 && onBody(x, y);
        if (near && !st.nearUsed) {
          st.nearUsed = true;
          stats.near++;
          st.lockUntil = st.softLock = t + LOCK_SECS;
          emit('early', { until: st.lockUntil, stray: true, near: true, kept: true, cues: visible() });
          return { kind: 'near' };
        }
        // Before any clue it's a guess; so is a tap off the character, or a second near miss.
        stats.early++;
        emit('early', { until: lock(t), stray: st.shown > 0, near });
        return { kind: 'early' };
      }
      const stage = st.shown;
      const guessed = st.guesses > 0;
      const taught = st.lesson;
      const rung = spotRung(stage, guessed);
      const points = spotPoints(rung);
      // Only a clean spot (no guessing first) builds the streak, counts as a first-clue spot or
      // tells the difficulty the player is cruising. A spot the ghost hand walked them through
      // counts, but the end screen only praises ones they found on their own.
      st.streak = !guessed && stage <= 2 ? st.streak + 1 : 0;
      stats.bestStreak = Math.max(stats.bestStreak, st.streak);
      const bonus = st.streak >= 2 ? Math.min(STREAK_MAX, STREAK_STEP * (st.streak - 1)) : 0;
      st.score += points + bonus;
      st.stage = stage;
      st.lesson = false;
      stats.spots++;
      stats.byStage[stage - 1]++;
      if (guessed) stats.guessed++;
      else {
        if (stage === 1) { stats.firstClue++; if (taught) stats.taughtFirst++; else stats.firstClueScenes.push(st.scene); }
        if (stage <= 2 && !taught) stats.earlySolo++;
        if (!taught && (!stats.bestSpot || stage < stats.bestSpot.stage)) stats.bestSpot = { stage, scene: st.scene };
        adapt?.record(stage <= 2, t);
      }
      st.need = coolNeed(stage);
      st.progress = 0;
      st.options = pickCools(rng);
      setPhase('cool', t);
      emit('spot', { stage, rung, guessed, points, bonus, streak: st.streak, cue: hit.cue, point: hit.point, need: st.need, options: st.options });
      return { kind: 'spot', stage, rung, points, bonus, cue: hit.cue };
    },

    /** The "All good!" button. Before any clue it's a guess, like a tap too soon. */
    allGood(t) {
      if (st.over || (st.phase !== 'enter' && st.phase !== 'build')) return { kind: 'ignored' };
      if (st.lesson) { if (!st.scene.decoy) return nudge('lookAgain'); }
      else {
        if (locked(t)) { emit('locked', { until: lock(t) }); return { kind: 'locked' }; }
        if (!st.shown) { stats.early++; emit('early', { until: lock(t), good: true }); return { kind: 'early' }; }
        if (!st.scene.decoy) { stats.lookAgain++; emit('lookAgain', { until: lock(t), shown: st.shown }); return { kind: 'lookAgain' }; }
      }
      // A clean call is worth the full 50; after a guess in this scene (a tap on them, or a press
      // too soon) it's still right, but worth less — the same as a spark losing its top rung.
      const guessed = !st.lesson && st.guesses > 0;
      const points = guessed ? DECOY_GUESSED : DECOY_POINTS;
      st.lesson = false;
      st.score += points;
      if (guessed) stats.decoysGuessed++;
      else {
        stats.decoysRight++;
        stats.decoyScene = st.scene;
        adapt?.record(true, t);
      }
      setPhase('yay', t);
      emit('decoyYes', { points, guessed, scene: st.scene });
      return { kind: 'decoyYes', points, guessed };
    },

    /**
     * The ghost hand is about to teach this clue: wipe earlier guesses and the lock so following
     * the hand works at once, and until the lesson lands a wrong tap only nudges.
     */
    teach() {
      if (st.phase !== 'build' || !st.shown) return false;
      st.lockUntil = -Infinity;
      st.guesses = 0;
      st.lesson = true;
      return true;
    },

    /** Press on a cool-down. Early spots finish on the press; late ones fill while held. */
    coolDown(t, id) {
      if (st.phase !== 'cool' || !COOLS.some(c => c.id === id)) return { kind: 'ignored' };
      if (!st.need) { completeCool(t, id); return { kind: 'cooled', id }; }
      if (st.hold) return { kind: 'holding' };
      st.hold = { id, start: t, base: st.progress };
      emit('holdStart', { id, need: st.need, progress: st.progress });
      return { kind: 'holdStart', id };
    },

    /** Release (or pointercancel): a partial hold keeps its progress. */
    coolUp(t) {
      if (st.phase !== 'cool' || !st.hold) return { kind: 'ignored' };
      st.progress = Math.min(st.need, st.hold.base + (t - st.hold.start));
      const id = st.hold.id;
      st.hold = null;
      if (st.progress >= st.need) { completeCool(t, id); return { kind: 'cooled', id }; }
      emit('holdEnd', { id, progress: st.progress, need: st.need });
      return { kind: 'holdEnd', progress: st.progress };
    },

    /** "Finish now" from the pause card. */
    finish(t) { end(t); },

    result() {
      // The crew line says "you spotted it early" / "caught N sparks before they grew": only sparks the
      // player caught at clue 1 or 2 on their own count (the same number as the end card's chip and
      // best moment, so they never disagree). 0 → the shell's default line.
      return { score: st.score, crew: { spots: stats.earlySolo }, stats };
    },
  };
}
