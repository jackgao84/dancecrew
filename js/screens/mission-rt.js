// Real-time mission rules. Pure: no DOM, no imports — js/screens/mission.js drives it and
// tests/missions-rt.test.mjs checks it in Node.
//
// The principle is in the numbers:
//  - Heat rises live on tense nodes and creeps up while the choices wait, so choosing a cool-down
//    (a minute / words) BEFORE it gets HOT earns the "Early spot". Waiting alone can never tip it
//    HOT before a reader has had time to read the line and every choice, so the spot rewards
//    noticing, not tapping fast. A heated reaction counts as HOT at once, whatever the meter said.
//  - A deliberate "I need a minute" is the strongest cool-down of all (and a "Power move!").
//  - Letting the timer run out is neutral: a short "Take a minute" breathing pause that always
//    brings the meter back below HOT (less than choosing a minute would), no recap line and no
//    score credit, then the same choices come back with more time. The heat builds again from
//    where the breath left it, so sitting it out (a whole ring, a breath and most of the next)
//    lets it tip HOT and the Early spot goes; once it has been HOT, later rings hold still.
//  - No fail state: every path ends; repair endings score highest (3 notes), as in v1.

export const WARM = 34;
export const HOT = 67;
export const MAX_HEAT = 100;
export const CREEP_CAP = 96;          // waiting never pins the meter at 100

/** Heat change when a choice is made. "I need a minute" is the biggest drop on purpose. */
export const KIND_HEAT = { hot: 20, words: -15, minute: -40, calm: -10, repair: -35, neutral: 0 };
/** A timed-out pause cools "a little" (at least this much, and always to just below HOT). */
export const PAUSE_DROP = 10;
export const PAUSE_FLOOR = 3;         // the pause leaves the meter at least this far below HOT
/** Kinds that count as a cool-down for the Early spot. */
export const COOL_KINDS = ['minute', 'words'];
/** Kinds that earn the 2-note score (v1 rule). 'paused' is deliberately not here. */
export const CREDIT_KINDS = ['minute', 'words', 'repair', 'calm'];

// ---------------------------------------------------------------- timing (seconds)
export const READ_BASE = 2.5;
export const READ_PER_CHAR = 0.06;
export const CHOICE_MIN = 8;
export const CHOICE_MAX = 12;
export const RETRY_FACTOR = 1.5;      // after a "Take a minute" pause the ring is 50% longer
export const BREATH_SECS = 4.5;       // one slow breath: in, hold, out
export const RISE_MIN = 6;            // heat/s: a tense node's heat eases in at least this fast
export const COOL_RATE = 22;          // heat/s: cool-downs drain quickly (it feels good)
export const HOT_AT = 0.8;            // waiting never tips HOT before 80% of the way round the ring…
export const READ_GRACE = 1.5;        // …nor before the reading allowance plus this beat

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len = t => String(t ?? '').length;

/** How long a line stays up before it moves on by itself: ≥ 2.5 s + 60 ms per character. */
export const readTime = text => READ_BASE + READ_PER_CHAR * len(text);

/**
 * Seconds a reader needs, once the choices are readable, for the line before them and every
 * choice (the same formula as the line timer) plus a short grace. Waiting can't make the meter
 * HOT any sooner. Counted from when the ring starts, so read-aloud and silent readers get the same.
 */
export const readAllowance = (lineText, choiceTexts = []) =>
  readTime([lineText, ...choiceTexts].map(t => String(t ?? '')).join(' ')) + READ_GRACE;

/**
 * The choice timer: 8–12 s scaled by how much there is to read (40 → 140 characters in total),
 * then 1.5× on every return after a "Take a minute" pause.
 */
export function choiceTime(texts, attempt = 0) {
  const chars = (texts || []).reduce((n, t) => n + len(t), 0);
  const base = CHOICE_MIN + (CHOICE_MAX - CHOICE_MIN) * clamp((chars - 40) / 100, 0, 1);
  return attempt > 0 ? base * RETRY_FACTOR : base;
}

export const heatLevel = h => (h >= HOT ? 'hot' : h >= WARM ? 'warm' : 'cool');
export const HEAT_WORD = { cool: 'Cool', warm: 'Warm', hot: 'HOT!' };

/** Choice icon group: minute / words / repair / other. */
export const kindGroup = kind => (['minute', 'words', 'repair'].includes(kind) ? kind : 'other');
/**
 * The look of one choice: its group, plus a variant inside 'other' so a calm choice (which earns
 * credit) never wears the same icon as the heated reaction.
 */
export const kindStyle = kind => {
  const g = kindGroup(kind);
  return g === 'other' && (kind === 'hot' || kind === 'calm') ? kind : g;
};
export const KIND_ICON = { minute: 'calm', words: 'words', repair: 'rewind', other: 'bolt', hot: 'flame', calm: 'check' };
export const KIND_LABEL = { minute: 'Take a minute', words: 'Use words', repair: 'Repair', other: 'Go', hot: 'Heated', calm: 'Keep it cool' };

/**
 * Display order for a set of n choices (Fisher–Yates with the screen's seeded rng). Display only:
 * the data order is the same in every mission, so without this "always tap the top one" would pick
 * the same kind every time without reading.
 */
export function shuffleOrder(n, rand = Math.random) {
  const order = Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Tense nodes make heat rise live. Data can say so (`"tense": true`); otherwise a choice node that adds heat. */
export const isTense = node => !!node && (node.tense ?? (!!node.choices && (node.heat || 0) > 0));

// ---------------------------------------------------------------- one playthrough
export function createRun() {
  return { heat: 0, pending: 0, peak: 0, kinds: [], early: 0, power: 0, timeouts: 0 };
}

/** Where the meter is heading (a rise that is still easing in already counts). */
export const effHeat = run => clamp(run.heat + Math.max(0, run.pending), 0, MAX_HEAT);

/** Queue a heat change; the meter eases to it live. */
export function addHeat(run, delta) {
  run.pending += delta || 0;
  run.peak = Math.max(run.peak, effHeat(run));
}

/**
 * Advance the live meter by dt seconds.
 *   rise   heat/s at which a queued rise eases in
 *   creep  extra heat/s while the choices wait on a tense node
 * Returns the change this step.
 */
export function stepHeat(run, dt, { rise = RISE_MIN, creep = 0 } = {}) {
  if (!(dt > 0)) return 0;
  const before = run.heat;
  if (run.pending) {
    const rate = run.pending > 0 ? Math.max(RISE_MIN, rise) : COOL_RATE;
    const move = Math.sign(run.pending) * Math.min(Math.abs(run.pending), rate * dt);
    run.heat += move;
    run.pending -= move;
    // Snap when the change has fully eased in, so small float steps don't drift.
    if (Math.abs(run.pending) < 1e-6) { run.pending = 0; run.heat = Math.round(run.heat * 1e6) / 1e6; }
  }
  if (creep > 0 && run.heat < CREEP_CAP) run.heat = Math.min(CREEP_CAP, run.heat + creep * dt);
  // The meter can't go below 0 or above 100; drop whatever is left over.
  if (run.heat <= 0) { run.heat = 0; if (run.pending < 0) run.pending = 0; }
  if (run.heat >= MAX_HEAT) { run.heat = MAX_HEAT; if (run.pending > 0) run.pending = 0; }
  run.peak = Math.max(run.peak, run.heat);
  return run.heat - before;
}

/** Rate a tense node's own heat eases in: spread over its lines so it rises while they play. */
export const riseRate = (heat, lineSecs) => Math.max(RISE_MIN, heat > 0 ? heat / Math.max(1, lineSecs) : 0);

/**
 * How the heat creeps while a ring waits: it builds toward HOT so it lands no sooner than `hotAt`
 * seconds after the ring starts (the later of the reading allowance and 80% of the ring). With
 * today's missions the reading allowance is longer than the first ring, so waiting brings the
 * meter right up to the line, and the "Take a minute" pause cools it back down.
 * Already HOT (a heated choice): no creep, it doesn't get worse just by waiting.
 */
export function creepPlan(eff, timerSecs, allowance = 0) {
  const hotAt = Math.max(1, timerSecs * HOT_AT, allowance);
  return { rate: Math.min(6, Math.max(0, HOT - eff) / hotAt), hotAt };
}
export const creepRate = (eff, timerSecs, allowance = 0) => creepPlan(eff, timerSecs, allowance).rate;

/**
 * The creep for one ring on `node` (the screen and the tests share this rule).
 *   attempt 0  builds toward HOT, never before the reading allowance or 80% of the ring;
 *   attempt 1+ (after a "Take a minute") builds again from where the breath left it and tips HOT
 *              at 80% of the longer ring: the reader has had a whole ring and a breath already,
 *              so sitting it out costs the Early spot after ~25 s, never sooner;
 *              once the meter has been HOT there's no spot left to lose, so it holds still.
 * Calm (non-tense) nodes never creep.
 */
export function ringCreep(run, node, timerSecs, attempt = 0, allowance = 0) {
  const plan = creepPlan(effHeat(run), timerSecs, attempt > 0 ? 0 : allowance);
  const hold = !isTense(node) || (attempt > 0 && run.peak >= HOT);
  return hold ? { rate: 0, hotAt: plan.hotAt } : plan;
}

/**
 * Is picking on this node a real decision while heat builds? A tense node with more than one
 * choice. (A calm node's only choice — "Use words" after taking a minute — just carries on.)
 */
export const isDecision = node => isTense(node) && (node?.choices?.length || 0) > 1;

/**
 * The player picked a choice on `node`. Returns what to celebrate:
 *   early  – a cool-down (minute / words) picked in a real decision (isDecision) while the heat
 *            has not yet been HOT: one noticing moment is one Early spot
 *   power  – a deliberate "I need a minute"
 * A heated reaction IS the heat getting HOT: the meter goes at least to HOT (so it matches the
 * scene) and the Early spot is gone for the rest of the run, however low the meter sat before.
 * (Without a node — the rules tests — every pick counts as a decision.)
 */
export function choose(run, choice, node = null) {
  const kind = choice?.kind || 'neutral';
  const early = COOL_KINDS.includes(kind) && Math.max(run.peak, effHeat(run)) < HOT && (!node || isDecision(node));
  const power = kind === 'minute';
  run.kinds.push(kind);
  if (early) run.early++;
  if (power) run.power++;
  const delta = kind === 'hot' ? Math.max(KIND_HEAT.hot, HOT - effHeat(run)) : KIND_HEAT[kind] ?? 0;
  addHeat(run, delta);
  if (kind === 'hot') run.peak = Math.max(run.peak, HOT);
  return { kind, early, power, delta };
}

/**
 * The ring ran out: a neutral "Take a minute" pause. Recorded as 'paused' — no recap, no credit.
 * It cools a little (and always below HOT, so the breath visibly works) but never as much as
 * choosing "I need a minute" would have, and it doesn't undo an Early spot already lost.
 */
export function timeout(run) {
  run.kinds.push('paused');
  run.timeouts++;
  const dest = clamp(run.heat + run.pending, 0, MAX_HEAT);
  const target = Math.max(0, Math.min(dest - PAUSE_DROP, HOT - PAUSE_FLOOR));
  addHeat(run, target - dest);
}

/** 1–3 notes, exactly as v1: repair ending 3, any cool-down/repair/calm 2, otherwise 1. */
export function scoreRun(run, endNode) {
  if (endNode?.repair) return 3;
  return run.kinds.some(k => CREDIT_KINDS.includes(k)) ? 2 : 1;
}

export const RECAP = {
  minute: { icon: 'calm', text: 'Power move: took a minute to cool down' },
  early: { icon: 'sparkle', text: 'Early spot: cooled it before it got hot' },
  words: { icon: 'words', text: 'Used words to say how it felt' },
  repair: { icon: 'rewind', text: 'Made a repair: owned it and fixed it' },
  hot: { icon: 'flame', text: 'Got heated — and bounced back' },
  calm: { icon: 'check', text: 'Kept it cool' },
};

/** Recap lines for the results card, most important first. 'paused' never appears. */
export function recap(run) {
  const has = k => run.kinds.includes(k);
  const out = [];
  if (has('repair')) out.push({ key: 'repair', ...RECAP.repair });
  if (run.early) out.push({ key: 'early', ...RECAP.early });
  if (has('minute')) out.push({ key: 'minute', ...RECAP.minute });
  if (has('words')) out.push({ key: 'words', ...RECAP.words });
  if (has('hot')) out.push({ key: 'hot', ...RECAP.hot });
  if (has('calm')) out.push({ key: 'calm', ...RECAP.calm });
  return out;
}

/**
 * The Early spot is the lasting reward for noticing early (notes stay as v1): a spark badge on the
 * results card, kept on the mission record and lit on the replay picker.
 */
export const earnedSpark = run => (run?.early || 0) > 0;

/** One crew line for the results card, tied to the real-life words. Spotting it early comes first. */
export function crewLine(run, endNode) {
  if (endNode?.repair && run.early) return 'You spotted it early and made it right. That’s a superpower.';
  if (endNode?.repair && run.kinds.includes('hot')) return 'You ran it back and made it right. That’s how crews win.';
  if (endNode?.repair) return 'A repair is the hardest move there is. You nailed it.';
  if (run.early) return 'You spotted it early. That’s a superpower.';
  if (run.power) return '“I need a minute” — that’s a power move.';
  return 'Everyone gets heated sometimes. Crew’s got you.';
}

// ---------------------------------------------------------------- scheduler
/**
 * One clock for every timer on a screen. It only moves when advance() is called (the screen's
 * frame loop), so pausing it pauses everything; `speed` scales time (the ?speed=N test hook);
 * clear()/destroy() drop every pending job, so nothing fires after the screen is gone.
 */
export function createScheduler({ speed = 1 } = {}) {
  let t = 0;
  let seq = 0;
  let paused = false;
  let dead = false;
  const jobs = new Map();
  return {
    get now() { return t; },
    get paused() { return paused; },
    get size() { return jobs.size; },
    get destroyed() { return dead; },
    speed,
    /** Run fn after `sec` scheduler seconds. Returns an id for cancel(). */
    after(sec, fn) {
      if (dead) return 0;
      const id = ++seq;
      jobs.set(id, { at: t + Math.max(0, sec || 0), fn });
      return id;
    },
    cancel(id) { if (id) jobs.delete(id); return 0; },
    has(id) { return jobs.has(id); },
    /** Move time on by `realDt` wall-clock seconds. Returns the scaled step (0 while paused). */
    advance(realDt) {
      if (paused || dead || !(realDt > 0)) return 0;
      const dt = realDt * speed;
      t += dt;
      // Due jobs run in time order; one may schedule or cancel others.
      for (;;) {
        let nid = 0, nj = null;
        for (const [id, j] of jobs) if (j.at <= t && (!nj || j.at < nj.at)) { nid = id; nj = j; }
        if (!nj) break;
        jobs.delete(nid);
        nj.fn();
        if (dead) break;
      }
      return dt;
    },
    pause() { paused = true; },
    resume() { paused = false; },
    clear() { jobs.clear(); },
    destroy() { dead = true; jobs.clear(); },
  };
}
