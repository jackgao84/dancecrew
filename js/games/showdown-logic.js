// Showdown rules — pure and DOM-free (unit-tested in tests/showdown.test.mjs).
//
// The Neon Owls call a move sequence on four pads, one move per beat; the player repeats it
// (order matters, timing only adds a bonus). Five sequences of 3 → 7 moves: each one is the last
// plus one new move, the way crews build a routine. A slip is never the end — "Run it back!" and,
// after a two-beat breath, the Owl replays the same sequence. After 2 slips the demo slows to a
// triplet feel and the ghost hand helps; after 3 the sequence gets one move shorter (and keeps
// shrinking, down to 2). Persistence wins.
//
// A slip costs no clock time: the round clock holds still from the slip until the player's turn
// in the replay (up to FREE_MAX seconds a round, so a round always ends). Worked numbers (120 BPM,
// 90 s cap): flawless on the beat ≈ 29 s; at a child's pace (1 s to start, 0.8 s a tap) ≈ 40 s;
// slipping on the LAST move twice on every sequence at that pace still wins inside one round
// (≈ 81 s counted, ≈ 119 s real with the free replays — unit-tested over 40 seeds). So a round is
// at most ROUND_SECS + FREE_MAX = 135 s of real time. Out of time anyway → the sequences beaten
// are saved and the next try this week starts there.
// Tapping along with the Owl is dancing, not copying: an echo never slips and never scores. The
// taps after the Owl's last move are read every way that fits: any of the Owl's moves tapped back
// within ECHO beats of its call (1.5 s: a child's reaction time, ~0.8 s, plus three times its
// scatter — a child's timing can vary a lot — and a second "Pop!" is fine too) may be an echo,
// the rest copy the routine. Only a tap that fits no reading is a slip — or one that would take
// back a dot already shown (the child was copying, so that's the wrong move; see takesBack).
// What the child sees never contradicts what they did: a tap that could be a copy is never shown
// as an echo, and for a child who watched the Owl (or danced along only while it called) a wrong
// move is never shown as a hit that leaves their next right move to slip. A dance that runs on past
// the Owl's last move is truly ambiguous — its last taps can be the copy's first moves — and there
// about 3% of wrong moves still read as the right one after them (holding every such tap would make
// an honest dancer's dots wait two or more taps in 11% of tries instead of 2%).
// A child who watches the Owl without tapping along is copying: every copy gets its dot at once.
// (A tap before the Owl's first move — the count-in, or one left over from the last try — isn't
// dancing along: it can't be tapping a move back.)
// For one who has been dancing along, a tap that could be either (a dance-along tap that happens to
// match the next move, or an eager start the moment the Owl finishes) is 'pending' — it sounds and
// flashes like a hit and its dot and points come with the next tap: the next move in order means
// the child is copying, so both get their dots at once (unless those taps could still be the dance
// itself: a routine that ends the way it starts); anything else settles the reading. Once a hit
// has shown this attempt, a tap that copies the next move gets its dot at once.
// Scoring never goes down. Each position in a sequence scores once (100, +50 on the beat), and a
// clear adds 100 per move when flawless or 50 per move after a run-back — so a slip costs only
// that sequence's bonus, and slipping on purpose never pays (200 vs 150 per move). Only beaten
// sequences are banked for the week (`kept`), so running the clock down never beats a clean win —
// and the HUD shows exactly that (`kept`): a sequence's move points wait on the dots ('pending')
// until it's beaten, so the score on screen never goes down when the clock runs out.
import { rng } from './engine.js';

export const PADS = [
  { id: 'clap', name: 'Clap', color: 'yellow', hex: '#FFD23F', light: '#FFF0B3', deg: 7 },
  { id: 'stomp', name: 'Stomp', color: 'pink', hex: '#FF7AB6', light: '#FFD9EA', deg: 0 },
  { id: 'spin', name: 'Spin', color: 'sky', hex: '#5CC8FF', light: '#D4F0FF', deg: 10 },
  { id: 'pop', name: 'Pop', color: 'mint', hex: '#5EE0B0', light: '#D2F7E8', deg: 15 },
];
export const LENGTHS = [3, 4, 5, 6, 7];
export const CALLERS = ['pip', 'dash', 'kiko', 'dash', 'kiko'];
export const ROUND_SECS = 90;
export const BPM = 120;
export const COUNT_IN = 2;     // clicks before beat 0
export const GAP_SLIP = 2;     // beats from a slip to the replay: time for the rewind + "Run it back!"
export const GAP_CLEAR = 2;    // beats from a clear to the next sequence (both rounded up to a beat)
export const SLOW = 4 / 3;     // beats per move in the slower demo (half-note triplets)
export const MIN_LEN = 2;
export const ON_BEAT = 0.1;    // seconds from the nearest beat that count as "on beat"
export const PTS = { move: 100, onBeat: 50, flawless: 100, comeback: 50, win: 500 };
export const ECHO = 3;         // beats (1.5 s at 120 BPM) after the Owl calls a move in which tapping it back is an echo
export const DOUBLE = 0.6;     // beats (0.3 s): two taps this close are one quick "Pop, Pop!", not two moves
export const REORDER = 2;      // beats (1 s): how far a child's reaction times scatter (dance taps can swap order)
export const FREE_MAX = 45;    // seconds of "Run it back" replays per round that the clock doesn't count
export const COUNTS_AFTER = 20.5; // real seconds: past the shell's 20 s "Leave (round saved)" window a round counts

/**
 * Leaving mid-round (app hidden or closed, paused past 20 s): keep this try's beaten sequences and
 * use up the round credit? Only once the round counts and a sequence was beaten. Progress is NOT
 * saved after every clear, so a quick clear-then-leave inside the free-leave window can't farm
 * rounds without spending the credit.
 */
export const keepsOnLeave = ({ realSecs, won, reached, startIdx }) => !won && reached > startIdx && realSecs >= COUNTS_AFTER;

/** Moves in this attempt: one shorter after the 3rd slip, then one more per slip, never below 2. */
export const attemptLength = (full, slips) => Math.max(Math.min(full, MIN_LEN), full - Math.max(0, slips - 2));
/** Beats per called move: slower demo after 2 slips. */
export const callInterval = slips => (slips >= 2 ? SLOW : 1);

/**
 * The next move of a routine. Low difficulty level → easy-to-remember chunks (a move often
 * repeats once: "Clap Clap"); high level → no repeats and none of the last two moves.
 */
export function nextMove(prev, rnd, level = 0.5) {
  const last = prev[prev.length - 1];
  const last2 = prev[prev.length - 2];
  if (last == null) return Math.floor(rnd() * PADS.length);
  const repeat = 0.45 - 0.4 * Math.max(0, Math.min(1, level));
  if (last !== last2 && rnd() < repeat) return last;
  const pool = PADS.map((_, i) => i).filter(i => i !== last && (level < 0.6 || prev.length < 2 || i !== last2));
  return pool[Math.floor(rnd() * pool.length)];
}

/** The five sequences for a seed at a fixed difficulty level (each extends the one before). */
export function planSequences(seed, level = 0.5, lengths = LENGTHS) {
  const rnd = rng(seed);
  const master = [];
  return lengths.map(n => {
    while (master.length < n) master.push(nextMove(master, rnd, level));
    return master.slice(0, n);
  });
}

/**
 * One Showdown round, driven by time. The view (or a test) calls:
 *   start(beat)                          before the first sequence (beat ≈ −COUNT_IN)
 *   update(beat, secs) → events          every frame (beat = rhythm beat, secs = round clock)
 *   tap(pad, beat, secs, offBeat) → events   a pad press; beat = when it happened (a tuned device's
 *                                        calibrated beat: it only judges the tap, the replay or next
 *                                        sequence is timed from the frame clock so the breath
 *                                        between them never shrinks); offBeat = seconds from the
 *                                        nearest beat
 *   finish() → events                    end early (progress kept)
 * Events: seq, call, respond, early (during the call), echo (tapping along: harmless; pos = moves
 *         shown copied), pending (a move that may be a copy: its dot comes when the next tap
 *         settles it), hit (settled: true = credited now for an earlier pending tap), slip, clear,
 *         win, timeup.
 * opts: { seed, startSeq (sequence to resume at), adapt (createAdapt instance), level (if no adapt) }
 */
export function createShowdown({ seed = 1, startSeq = 0, adapt = null, level = 0.5 } = {}) {
  const rnd = rng(seed);
  const lvl = () => (adapt ? adapt.level : level);
  const master = [];
  const grow = n => { while (master.length < n) master.push(nextMove(master, rnd, lvl())); };
  const first = Math.max(0, Math.min(LENGTHS.length - 1, Math.floor(Number(startSeq)) || 0));
  const s = {
    phase: 'ready', idx: first, startIdx: first, slips: 0, attempt: 0, full: 0, L: 0, interval: 1, pos: 0,
    calls: [], respondAt: Infinity, announceAt: 0, announce: null,
    score: 0, kept: 0, totalSlips: 0, taps: 0, onBeats: 0, run: 0, bestRun: 0, cleared: [], scored: new Set(),
    free: 0, freeFrom: null, can: new Set([0]), held: [], started: false, heard: [], danced: false,
    frame: -Infinity, // the latest frame beat (update): what the child sees and hears, whatever a tap's judged beat
  };
  const lead = () => Math.min(s.L - 1, Math.max(...s.can)); // the move to hint: every "maybe" tap read as a copy

  function plan(fromBeat, gap, replay) {
    s.full = LENGTHS[s.idx];
    grow(s.full);
    s.L = attemptLength(s.full, s.slips);
    s.interval = callInterval(s.slips);
    const firstBeat = Math.ceil(fromBeat + gap - 1e-6);
    s.calls = master.slice(0, s.L).map((pad, i) => ({ i, pad, beat: firstBeat + i * s.interval, fired: false }));
    s.respondAt = firstBeat + (s.L - 0.5) * s.interval;
    s.announceAt = firstBeat - 1;
    s.pos = 0;
    s.can = new Set([0]);
    s.held = [];
    s.heard = [];
    s.started = false;
    s.danced = false;
    s.phase = 'wait';
    s.announce = {
      type: 'seq', idx: s.idx, full: s.full, L: s.L, caller: CALLERS[s.idx], replay, slips: s.slips,
      slow: s.interval > 1, shorter: s.L < s.full, firstBeat, interval: s.interval,
    };
  }

  function fire(beat, ev) {
    for (const c of s.calls) {
      if (!c.fired && beat >= c.beat) {
        c.fired = true;
        ev.push({ type: 'call', i: c.i, pad: c.pad, L: s.L, slow: s.interval > 1, help: s.slips >= 2, replay: s.attempt > 0 });
      }
    }
  }
  /** The replay after a slip is on the house: the clock starts again when the player's turn does. */
  function thaw(secs) {
    if (s.freeFrom == null) return;
    s.free = Math.min(FREE_MAX, s.free + Math.max(0, secs - s.freeFrom));
    s.freeFrom = null;
  }
  function respond(ev, secs) {
    thaw(secs);
    s.phase = 'respond';
    ev.push({ type: 'respond', L: s.L, next: s.calls[lead()].pad, help: s.slips >= 2, first: s.idx === s.startIdx && s.attempt === 0 });
  }
  /** Dancing along: the Owl's still on its turn (any pad), or this pad was called within ECHO beats. */
  const alongAt = (pad, beat) => s.phase === 'call' || s.calls.some(c => c.pad === pad && beat - c.beat <= ECHO);
  /** Every count of moves copied that this tap allows, from every reading so far. */
  const copiesOf = pad => [...s.can].filter(m => m < s.L && s.calls[m].pad === pad).map(m => m + 1);
  /**
   * A copy that would take back a dot already shown: not an echo, and every reading it fits has
   * fewer moves copied than the dots (the taps shown as copies would all have to be dancing along).
   * For a child who is copying that is a wrong move, so it's the slip — on this tap, not on their
   * next right one. Unless the child has been dancing along (a tap during the Owl's call, or one
   * shown as an echo) and could have danced right to the Owl's last move and then started the copy
   * over, this tap being its next move: then the dots step back to match.
   * The trade: on round 1 the Owl's three moves take a second, so a child whose dance-along lags by
   * more than that taps all of it after the Owl, and it reads as copying (its dots fill). If they
   * missed a move of it and then start the copy over, the restart is this slip — the same taps as a
   * copier's wrong move after two right ones (Spin, Clap, Spin), whose slip belongs on that tap, and
   * the tap that contradicts the dots shown. Measured: the last move missed at a 1.1 s lag slips 44%
   * of those first tries (7% at 0.8 s); none on rounds 2–5, where the dance starts during the call.
   */
  const takesBack = (pad, along, copies) => !along && copies.length > 0 && Math.max(...copies) < s.pos
    && !(s.danced && danceThenCopy(danceTaps(), (dance, k) => s.calls[k].pad === pad && danceable(dance, { last: true, loose: true })));
  /**
   * The child's own count, if every tap since the Owl finished was a copy (they are the routine's
   * first moves, in order): what a child who is copying believes. Else -1.
   */
  function ownCount() {
    const since = s.heard.filter(h => !h.early);
    return since.every((h, i) => i < s.L && h.pad === s.calls[i].pad) ? since.length : -1;
  }
  /** Every tap since the Owl's first move (before it, a tap can't be tapping a move back). */
  const danceTaps = () => s.heard.filter(h => h.beat >= s.calls[0].beat - 1e-6);
  /**
   * The ways a dancing child's taps `T` can end: dancing along, then the copy started — the last k
   * taps are the routine's first k moves in order (k = 0: still dancing). fn(dance taps, k) → true
   * for a reading that fits; returns whether any did.
   */
  function danceThenCopy(T, fn) {
    for (let k = 0; k <= Math.min(T.length, s.L - 1); k++) {
      if (!T.slice(T.length - k).every((h, i) => h.pad === s.calls[i].pad)) continue;
      if (fn(T.slice(0, T.length - k), k)) return true;
    }
    return false;
  }
  /**
   * The held taps as a run of copies from the dots shown (a second "Pop!" in between is dancing
   * along), carried on in order by this tap `cur`: [...held taps in the run, cur], or null. Not
   * while the same taps could be the child dancing along to the Owl — and maybe starting the copy
   * over with the last of them (a routine that ends the way it starts, a quick "Pop, Pop!" on a
   * move the routine starts with twice): the next tap tells.
   */
  function heldRun(cur) {
    const run = [];
    for (const h of s.held) if (s.pos + run.length < s.L && h.pad === s.calls[s.pos + run.length].pad) run.push(h);
    const at = s.pos + run.length;
    if (!run.length || at >= s.L || s.calls[at].pad !== cur.pad) return null;
    run.push(cur);
    // Dancing all along (k = 0: but not as exactly this run, which is copying), or dancing and then
    // starting the copy with some of the run's later taps.
    const dancing = danceThenCopy(danceTaps(), (dance, k) => k < run.length && danceable(dance, { not: k ? null : run }));
    return dancing ? null : run;
  }
  /**
   * Could the taps `D` (in time order) all be the child dancing along? Each one taps back one of the
   * Owl's moves within ECHO beats of its call; a move takes one tap, or two in a quick double tap
   * (DOUBLE); taps land out of call order only as far as a child's timing scatters (REORDER); and
   * every move from the Owl's first up to the latest one danced is danced (a child who is copying
   * watches the Owl and doesn't tap along with it, so D is every tap since the Owl's first move).
   *  opts.not  = a run of taps that must NOT all read as the moves they copy (dancing along from
   *              the dots' move on, in order, IS copying it: both expect the same next tap);
   *  opts.last = the Owl's last move is among them (the child danced to the end);
   *  opts.loose = moves may be skipped: to excuse, never to credit.
   * A bounded search (a few moves, a few taps); if it runs long it answers "yes", the kind reading.
   */
  function danceable(D, { not = null, last = false, loose = false } = {}) {
    if (!D.length || D.length > 2 * s.L) return false;
    const place = not ? new Map(not.map((h, i) => [h, s.pos + i])) : null;
    const lag = (h, c) => h.beat - s.calls[c].beat;
    const at = new Array(D.length);
    const used = new Map(); // call → taps on it
    let budget = 20000;
    const fits = (k, c) => {
      const h = D[k];
      if (h.pad !== s.calls[c].pad || lag(h, c) < -1e-6 || lag(h, c) > ECHO) return false;
      const u = used.get(c);
      if (u && (u.length > 1 || h.beat - u[0].beat > DOUBLE)) return false;
      for (let i = 0; i < k; i++) if (at[i] > c && lag(h, c) - lag(D[i], at[i]) > REORDER) return false; // at[i] = -1: left out
      return true;
    };
    const done = () => {
      if (place && D.every((h, k) => !place.has(h) || place.get(h) === at[k])) return false;
      if (!used.size) return false;
      const hi = Math.max(...at);
      if (last && hi !== s.L - 1) return false;
      if (!loose) for (let c = 0; c < hi; c++) if (!used.has(c)) return false;
      return true;
    };
    // A tap shown as dancing along (an echo: it copies nothing in any reading) is dancing whatever
    // it matches, and so is one while the Owl was still calling that taps back none of its moves:
    // if it fits no move, it's left out.
    const free = h => h.echo || (h.early && !s.calls.some((c, i) => h.pad === c.pad && lag(h, i) >= -1e-6 && lag(h, i) <= ECHO));
    const walk = k => {
      if (--budget < 0) return true;
      if (k === D.length) return done();
      for (let c = 0; c < s.L; c++) {
        if (!fits(k, c)) continue;
        at[k] = c;
        const u = used.get(c) || [];
        used.set(c, [...u, D[k]]);
        const r = walk(k + 1);
        if (u.length) used.set(c, u); else used.delete(c);
        if (r) return true;
      }
      if (!free(D[k])) return false;
      at[k] = -1;
      return walk(k + 1);
    };
    return walk(0);
  }
  /**
   * A pad press once the Owl has called its last move. `s.can` holds every count of moves the
   * player may have copied so far, one per way of reading their taps: a tap copies the next move,
   * or — if it's dancing along — it may be an echo that copies nothing. Only a tap that fits no
   * reading is a slip.
   *
   * What the player sees (`s.pos` = dots shown, always one of the readings):
   *  - some reading completes the routine → every dot left fills, clear;
   *  - the tap copies nothing in any reading → an echo (it's dancing along);
   *  - it can't be an echo → a hit: the dots move up to the nearest reading (a tap held earlier as
   *    'pending' gets its dot and points now, marked `settled`);
   *  - it could be either → 'pending' (sounds and flashes like a hit, the dot waits), unless the
   *    child is copying — they watched the Owl without tapping along, or a hit has shown this
   *    attempt already — then it's a hit at once; or it carries on the pending taps in order (the
   *    routine's next move after them) and they can't all be the dance: the whole run gets its
   *    dots and points now;
   *  - it fits the dots but breaks the child's own count ahead of them → 'pending' too (unsure);
   *  - it would take back a dot already shown (see takesBack) → the slip is on this tap.
   * So a real copy tap is never shown as an echo, whatever came before it, and a wrong move by a
   * child who watched the Owl (or danced along only while it called) is never shown as a hit that
   * leaves their next right move to slip. After a dance that ran on past the Owl's last move it can
   * be (~3% of wrong moves): the dance's last taps may be the copy's first moves, and holding every
   * tap that depends on that reading would keep honest dancers' dots waiting far more often.
   */
  function answer(pad, beat, secs, offBeat) {
    const cur = { pad, beat, off: offBeat };
    const along = alongAt(pad, beat);
    const copies = copiesOf(pad);
    const can = new Set(along ? [...s.can, ...copies] : copies);
    if (!can.size || takesBack(pad, along, copies)) return slip(pad, beat, secs);
    // A tap that breaks the child's own count while the dots are behind it is unsure (see below).
    const own = ownCount();
    const breaksOwn = !along && own > s.pos && own < s.L && s.calls[own].pad !== pad;
    s.heard.push(cur);
    s.can = can;
    if (!copies.length) {
      s.danced = true;
      cur.echo = true;
      return [{ type: 'echo', pad, pos: s.pos }];
    }
    const up = copies.filter(m => m > s.pos);
    let run = !copies.includes(s.L) && along && !s.started ? heldRun(cur) : null;
    if (run && !copies.includes(s.pos + run.length)) run = null;
    let to = null;
    if (copies.includes(s.L)) to = s.L;
    else if (run) to = s.pos + run.length;
    // The nearest reading: when a repeated move ("Clap Clap") leaves more than one, the dots never
    // run ahead of the child (the rest fill when the routine is complete). A tap that could be
    // dancing along waits for the next one — but only for a child who has been dancing along: one
    // who watched the Owl without a tap is copying from the first move.
    else if ((!along || s.started || !s.danced) && up.length) to = Math.min(...up);
    // It fits the dots shown, but they are behind the child's own count and it breaks that (the
    // taps before it could be dancing along too — a routine that ends the way it starts): a wrong
    // move by a child who was copying (then their next right move would slip), or the start of the
    // copy by one who was dancing. Its dot waits: the next tap tells.
    const unsure = to != null && to < s.L && breaksOwn;
    if ((to == null && along) || unsure) {
      s.held.push(cur);
      return [{ type: 'pending', pad, pos: s.pos, next: s.calls[lead()].pad }];
    }
    if (to == null) {
      // Not an echo, and no reading it fits goes past the dots shown: the move is already on the
      // dots (a second "Pop!" once the echo window has closed), so it's a hit that adds nothing — a
      // correct tap never looks ignored. After dancing along to the Owl's last move, the child may
      // be starting the copy over: the dots step back to match.
      const was = s.pos;
      s.pos = Math.max(...can);
      s.held = [];
      return [{ type: 'hit', pad, pos: s.pos - 1, pts: 0, onBeat: false, repeat: true, back: s.pos < was, L: s.L, next: s.calls[lead()].pad }];
    }
    const ev = [];
    if (s.phase === 'call') { fire(beat, ev); respond(ev, secs); }
    // Usually one new move. When this tap settles earlier pending taps as copies, they count now
    // too, each with its own on-beat bonus: the run it carries on, or else the latest pending taps.
    const n = to - s.pos;
    const earlier = run ? run.slice(0, -1).map(h => h.off) : s.held.slice(Math.max(0, s.held.length - (n - 1))).map(h => h.off);
    const offs = [...Array(n - 1 - earlier.length).fill(1), ...earlier, offBeat];
    s.held = [];
    for (let k = 0; k < n; k++) {
      const out = advance(s.calls[s.pos].pad, beat, secs, offs[k]);
      if (k < n - 1) out[0].settled = true;
      ev.push(...out);
      if (out.length > 1) break; // cleared (the next sequence is already planned)
    }
    return ev;
  }
  function slip(pad, beat, secs) {
    const want = s.calls[s.pos].pad;
    s.slips++;
    s.totalSlips++;
    s.attempt++;
    s.run = 0;
    adapt?.record(false, secs);
    if (s.free < FREE_MAX) s.freeFrom = secs;
    const ev = {
      type: 'slip', pad, want, pos: s.pos, slips: s.slips,
      slow: callInterval(s.slips) > 1, shorter: attemptLength(s.full, s.slips) < s.L,
    };
    plan(Math.max(beat, s.frame), GAP_SLIP, true);
    return [ev];
  }
  /** The right move: score its position (once per sequence) and clear the sequence at the end. */
  function advance(pad, beat, secs, offBeat) {
    const fresh = !s.scored.has(s.pos);
    const onBeat = Math.abs(offBeat) <= ON_BEAT;
    const pts = fresh ? PTS.move + (onBeat ? PTS.onBeat : 0) : 0;
    if (fresh) s.scored.add(s.pos);
    s.score += pts;
    s.taps++;
    if (onBeat) s.onBeats++;
    s.run++;
    s.bestRun = Math.max(s.bestRun, s.run);
    adapt?.record(true, secs);
    s.started = true;
    const hit = { type: 'hit', pad, pos: s.pos, pts, onBeat, repeat: !fresh, L: s.L, next: null };
    s.pos++;
    if (s.pos < s.L) { hit.next = s.calls[Math.max(s.pos, lead())].pad; return [hit]; }
    const flawless = s.slips === 0;
    const bonus = (flawless ? PTS.flawless : PTS.comeback) * s.L;
    s.score += bonus;
    s.kept = s.score;
    s.cleared.push({ idx: s.idx, L: s.L, full: s.full, slips: s.slips });
    const clear = { type: 'clear', idx: s.idx, L: s.L, slips: s.slips, bonus, flawless, reached: s.idx + 1 };
    if (s.idx >= LENGTHS.length - 1) {
      s.score += PTS.win;
      s.kept = s.score;
      s.phase = 'win';
      return [hit, clear, { type: 'win', bonus: PTS.win }];
    }
    s.idx++;
    s.slips = 0;
    s.attempt = 0;
    s.scored = new Set();
    plan(Math.max(beat, s.frame), GAP_CLEAR, false);
    return [hit, clear];
  }

  const api = {
    get phase() { return s.phase; },
    get idx() { return s.idx; },
    get pos() { return s.pos; },
    get slips() { return s.slips; },
    get attempt() { return s.attempt; },
    get L() { return s.L; },
    get interval() { return s.interval; },
    get calls() { return s.calls; },
    get score() { return s.score; },
    /** Points from beaten sequences only (what a try banks for the week) — the score on the HUD. */
    get kept() { return s.kept; },
    /** Move points of the sequence being played: they join the HUD when it's beaten. */
    get pending() { return s.score - s.kept; },
    /** Moves copied if every tap that may be a copy is one (what the hint and ghost follow). */
    get lead() { return s.phase === 'respond' || s.phase === 'call' ? lead() : 0; },
    get totalSlips() { return s.totalSlips; },
    get cleared() { return s.cleared; },
    get startIdx() { return s.startIdx; },
    /** Sequences finished overall (where the next attempt this week would start). */
    get reached() { return s.idx + (s.phase === 'win' ? 1 : 0); },
    /** The pad the player should press next (during their turn), else null. */
    expected() { return s.phase === 'respond' ? s.calls[lead()].pad : null; },
    /** Would pressing `pad` at `beat` be taken (echo, early or a copy) rather than a slip? */
    fits(pad, beat) {
      if (s.phase !== 'call' && s.phase !== 'respond') return true;
      if (s.phase === 'call' && beat - s.calls[s.L - 1].beat < -1e-6) return true;
      const along = alongAt(pad, beat), copies = copiesOf(pad);
      return along || (copies.length > 0 && !takesBack(pad, along, copies));
    },
    /** Help mode: slower demo + ghost hand on the pads. */
    get help() { return s.slips >= 2; },
    /** Round seconds that count against the cap: replays after a slip don't (up to FREE_MAX). */
    clock(secs) { return secs - Math.min(FREE_MAX, s.free + (s.freeFrom != null ? Math.max(0, secs - s.freeFrom) : 0)); },

    start(beat) {
      if (s.phase !== 'ready') return;
      s.frame = beat;
      plan(beat, GAP_CLEAR, false);
    },

    update(beat, secs) {
      const ev = [];
      if (s.phase === 'ready' || s.phase === 'win' || s.phase === 'timeup') return ev;
      s.frame = beat;
      if (api.clock(secs) >= ROUND_SECS) return api.finish();
      if (s.phase === 'wait' && beat >= s.announceAt) { s.phase = 'call'; ev.push(s.announce); }
      if (s.phase === 'call') {
        fire(beat, ev);
        if (beat >= s.respondAt) respond(ev, secs);
      }
      return ev;
    },

    tap(pad, beat, secs, offBeat = 1) {
      if (s.phase === 'wait') return [{ type: 'early', pad }];
      if (s.phase !== 'call' && s.phase !== 'respond') return [];
      if (s.phase === 'call' && beat - s.calls[s.L - 1].beat < -1e-6) { // the Owl is still calling
        // Dancing along with the Owl — once it has started. A tap in the beat before its first move
        // (the count-in's last click, or a tap left over from the last try) can't be tapping a move
        // back, so it says nothing about how this child plays: one who then watches is copying.
        if (beat >= s.calls[0].beat - 1e-6) {
          s.heard.push({ pad, beat, off: offBeat, early: true });
          s.danced = true;
        }
        return [{ type: 'early', pad }];
      }
      return answer(pad, beat, secs, offBeat);
    },

    /** Out of time (or "Finish now"): the round ends, progress so far is kept. */
    finish() {
      if (s.phase === 'win' || s.phase === 'timeup') return [];
      s.phase = 'timeup';
      return [{ type: 'timeup', reached: s.idx }];
    },

    /** Numbers for the end screen. */
    summary() {
      return {
        score: s.score, kept: s.kept, won: s.phase === 'win', reached: api.reached, startIdx: s.startIdx,
        totalSlips: s.totalSlips, cleared: s.cleared.slice(), onBeats: s.onBeats, taps: s.taps,
        best: bestMoment(s),
      };
    },
  };
  return api;
}

const times = n => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** The round's best moment. Principle moments come first: a run-back that got there. */
export function bestMoment({ cleared = [], bestRun = 0 }) {
  const byLen = (a, b) => b.full - a.full || b.idx - a.idx;
  const comeback = cleared.filter(c => c.slips > 0).sort(byLen)[0];
  if (comeback) return `Ran it back ${times(comeback.slips)} and nailed round ${comeback.idx + 1}!`;
  const clean = cleared.slice().sort(byLen)[0];
  if (clean) return `${clean.L} moves, zero slips: round ${clean.idx + 1} was flawless!`;
  if (bestRun > 0) return `Copied ${bestRun} Owl move${bestRun === 1 ? '' : 's'} in a row`;
  return 'Stepped up to face the Neon Owls';
}
