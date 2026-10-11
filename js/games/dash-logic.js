// City Dash — the run model. No DOM: the game draws it, the unit tests drive it in Node.
//
// World: a pure function of (seed, distance). The course is cut into 36 m chunks and each chunk
// is built from hash(seed, chunk index) alone, so any stretch of road can be rebuilt exactly
// (the tutorial chunks at the start and the clear runway to the Showcase are fixed). Narrow screens
// see less road, so they run a little slower on a street that is shorter by the same share
// (paceFor): the run takes the same time everywhere, and only the runway moves.
//
// Run: fixed 1/120 s physics steps, and a ring buffer of plain snapshots of the runner
// (30 a second). "Run it back" restores the snapshot from 3 s before the crash.
//
// Scoring — running it back is always the best answer to a crash:
//   record 10 · clean clear 60 · repaired clear (the obstacle you crashed into) 10 · Showcase 150
//   Comeback Bonus: x2 on up to 3 records past the crash point in the 5 s after a rewind
//   (only after the first crash at an obstacle).
// A real crash + "Run it back" beats "Keep going" by at least the 10 repair points (plus the
// records you get a second go at). A crash on purpose + rewind is at most 10 + 30 − 60 = −20
// against the clean run of the same stretch, so crashing on purpose never pays.
//
// Speed is the adaptive pace and nothing else (a stumble only slows it): a struggling player is
// never hurried. The run clock rewinds with the runner, so a rewind never costs road; if the clock
// still runs out (a very gentle pace and many stumbles), the crew brings the Showcase to the runner.

export const FINISH = 1200;          // metres to the Showcase
export const TIME_CAP = 90;          // seconds on the run clock
export const CHUNK = 36;             // metres per world chunk
export const REWIND_SECS = 3;
export const COMEBACK_SECS = 5;
export const COMEBACK_MAX = 3;
export const PTS = { record: 10, clean: 60, repair: 10, finish: 150 };
export const SPEEDS = { min: 14, max: 18.5 };      // m/s, mixed by the adaptive level
export const DENSITY = { min: 0.45, max: 1 };      // share of optional obstacles that appear
export const PHYS = {
  g: 50, jumpV: 16.2,    // apex ≈ 2.6 m, ≈ 0.65 s in the air
  fallG: 2.4, slam: 30,  // swipe down in the air: fall fast, slide on landing
  slide: 0.62,           // seconds
  buffer: 0.15,          // a tap just before landing still jumps
  cancel: 0.15,          // a swipe right after a tap turns the hop into a slide (the same finger: any time on the way up)
  snap: 0.12,            // …this early the runner is still low and drops straight into the slide; later it slams down
  standH: 2.3, slideH: 1.1, halfW: 0.4, recR: 0.55,
};
export const STUMBLE = { secs: 1.2, low: 0.45, invuln: 1.0 };
export const HORIZON = 40;           // obstacles are switched on/off this far ahead
export const RUNWAY = 30;            // last metres before the Showcase: records only

export const STEP = 1 / 120;
export const LOOK = 19;              // metres of road ahead that the full pace is tuned for

/** Pace for a screen that shows `lookM` metres of road ahead: slower on narrow screens, on a street
 *  shorter by the same share, so the reaction time and the run time stay the same. */
export function paceFor(lookM) {
  const speedScale = Math.max(0.8, Math.min(1, lookM / LOOK));
  return { speedScale, finish: Math.round((FINISH * speedScale) / 10) * 10 };
}
const SNAP_EVERY = 4;               // 30 snapshots per second
const RING = 160;                    // ≈ 5.3 s of history

/** Obstacles. hw/hh = forgiving hit box half-width / height; banners hit from `bottom` up. */
export const KINDS = {
  box: { w: 1.4, h: 1.35, hw: 0.58, hh: 1.15, name: 'box' },
  cone: { w: 0.95, h: 1.3, hw: 0.32, hh: 1.05, name: 'cone' },
  hurdle: { w: 1.2, h: 1.6, hw: 0.28, hh: 1.45, name: 'hurdle' },
  crates: { w: 2.8, h: 1.35, hw: 1.25, hh: 1.15, name: 'crates' },
  banner: { w: 2.6, h: 1.5, hw: 1.15, bottom: 1.6, slide: true, name: 'banner' },
};
const JUMPERS = ['box', 'cone', 'hurdle'];

// ---------------------------------------------------------------- seeded helpers
function hash(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul((b | 0) + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Deterministic 0..1 value for decoration (buildings, lamps…) — same seed, same city. */
export const noise = (seed, i) => hash(seed ^ 0x5bd1e995, i) / 4294967296;

// ---------------------------------------------------------------- world
const PATTERNS = [['box', 18], ['cone', 11], ['hurdle', 13], ['crates', 9], ['banner', 19], ['double', 11], ['jumpSlide', 9], ['slideJump', 6], ['breather', 6]];
const PATTERN_TOTAL = PATTERNS.reduce((n, p) => n + p[1], 0);

/**
 * One chunk of road: { k, x0, obstacles: [{ id, kind, x, w, h, hw, hh, bottom, slide, tier, teach }],
 * records: [{ id, x, y }] }. Pure: the same (seed, k) always gives the same chunk.
 * `tier` 0..1: an obstacle appears when tier < the run's density (0 = always, used to teach).
 */
export function chunkAt(seed, k, finish = FINISH) {
  const x0 = k * CHUNK;
  const c = { k, x0, x1: x0 + CHUNK, obstacles: [], records: [], pattern: 'none' };
  if (k < 0 || x0 >= finish) return c;
  const r = mulberry(hash(seed, k));
  const ob = (kind, lx, tier, teach = null) => {
    const K = KINDS[kind];
    c.obstacles.push({ id: k * 8 + c.obstacles.length, k, kind, x: x0 + lx, w: K.w, h: K.h, hw: K.hw, hh: K.hh || 0, bottom: K.bottom || 0, slide: !!K.slide, tier, teach });
  };
  const rec = (lx, y) => { if (x0 + lx < finish - 2) c.records.push({ id: k * 64 + c.records.length, x: x0 + lx, y }); };
  // Records trace a good jump over an obstacle: too high to grab without jumping.
  const arc = (lx, span = 3.2, n = 5) => { for (let i = 0; i < n; i++) { const d = -span + (2 * span * i) / (n - 1); rec(lx + d, 3.4 + 1.0 * (1 - (d / span) ** 2)); } };
  const line = (lx, n, gap = 1.7, y = 1.5) => { for (let i = 0; i < n; i++) rec(lx + i * gap, y); };
  const under = lx => { rec(lx - 0.75, 0.85); rec(lx, 0.85); rec(lx + 0.75, 0.85); }; // only a slide reaches under the sign
  const jumper = (lx, tier, teach) => {
    const kind = JUMPERS[Math.floor(r() * JUMPERS.length)];
    ob(teach ? 'box' : kind, lx, tier, teach);
    arc(lx, kind === 'crates' ? 3.8 : 3.2);
  };
  const tierA = () => r() * 0.7;          // singles: most of them, even when eased off
  const tierB = () => 0.55 + r() * 0.45;  // the second obstacle of a pair: only when cruising

  // Tutorial: warm-up records → first jump → breather → first slide.
  if (k === 0) { line(14, 9, 2); c.pattern = 'start'; return c; }
  if (k === 1) { jumper(16, 0, 'jump'); line(3, 3); c.pattern = 'teachJump'; return c; }
  if (k === 2) { line(8, 6, 1.8); arc(28, 2.6, 4); c.pattern = 'breather'; return c; }
  if (k === 3) { ob('banner', 14, 0, 'slide'); under(14); line(24, 4); c.pattern = 'teachSlide'; return c; }
  // Runway to the Showcase: records only.
  if (x0 + CHUNK > finish - RUNWAY) { line(4, Math.max(0, Math.min(14, Math.floor((finish - RUNWAY - x0 + 26) / 2))), 2); c.pattern = 'runway'; return c; }

  let pick = r() * PATTERN_TOTAL, pattern = 'box';
  for (const [name, wgt] of PATTERNS) { if ((pick -= wgt) < 0) { pattern = name; break; } }
  c.pattern = pattern;
  const jit = () => Math.round((r() - 0.5) * 6 * 10) / 10;
  switch (pattern) {
    case 'box': case 'cone': case 'hurdle': case 'crates': {
      const lx = 17 + jit();
      ob(pattern, lx, tierA());
      arc(lx, pattern === 'crates' ? 3.8 : 3.2);
      if (r() < 0.6) line(3, 3);
      break;
    }
    case 'banner': {
      const lx = 17 + jit();
      ob('banner', lx, tierA());
      under(lx);
      if (r() < 0.6) line(4, 3);
      break;
    }
    case 'double': jumper(8, tierA()); jumper(27, tierB()); break;
    case 'jumpSlide': jumper(8, tierA()); ob('banner', 27, tierB()); under(27); break;
    case 'slideJump': ob('banner', 8, tierA()); under(8); jumper(27, tierB()); break;
    default: { // breather: a wavy line of records and a bonus hop
      for (let i = 0; i < 7; i++) rec(5 + i * 1.8, 1.5 + 0.4 * Math.sin(i * 0.9));
      arc(28, 2.6, 4);
    }
  }
  return c;
}

/** Memoised world for one seed. `at(x)` = the chunk that contains distance x. */
export function createWorld(seed, finish = FINISH) {
  const cache = new Map();
  const chunk = k => { let c = cache.get(k); if (!c) { c = chunkAt(seed, k, finish); cache.set(k, c); } return c; };
  return {
    seed, finish,
    chunk,
    at: x => chunk(Math.floor(x / CHUNK)),
    /** All obstacles in [a, b] in order (allocates — tests and setup only, not per frame). */
    obstaclesIn(a, b) { const out = []; for (let k = Math.floor(a / CHUNK); k <= Math.floor(b / CHUNK); k++) for (const o of chunk(k).obstacles) if (o.x >= a && o.x <= b) out.push(o); return out; },
    recordsIn(a, b) { const out = []; for (let k = Math.floor(a / CHUNK); k <= Math.floor(b / CHUNK); k++) for (const o of chunk(k).records) if (o.x >= a && o.x <= b) out.push(o); return out; },
  };
}

// ---------------------------------------------------------------- snapshots
const SNAP_FIELDS = ['t', 'x', 'y', 'vy', 'ground', 'airT', 'slideT', 'bufferT', 'fastFall', 'slideQueued', 'stumbleT', 'invulnT', 'score', 'records', 'cleans', 'repairs', 'streak', 'bestStreak', 'logLen', 'jumps', 'slides'];

/** Fixed-size ring of plain snapshot objects (allocated once; push copies fields, no garbage). */
export function createRing(capacity = RING, fields = SNAP_FIELDS) {
  const slots = Array.from({ length: capacity }, () => Object.fromEntries(fields.map(f => [f, 0])));
  let start = 0, len = 0;
  return {
    get length() { return len; },
    /** i = 0 is the oldest kept snapshot. */
    get: i => slots[(start + i) % capacity],
    push(src) {
      let slot;
      if (len < capacity) slot = slots[(start + len++) % capacity];
      else { slot = slots[start]; start = (start + 1) % capacity; } // full: overwrite the oldest
      for (const f of fields) slot[f] = src[f];
      return slot;
    },
    /** Index of the newest snapshot taken at or before time t (the oldest one if none). */
    indexAt(t) {
      for (let i = len - 1; i >= 0; i--) if (slots[(start + i) % capacity].t <= t + 1e-9) return i;
      return len ? 0 : -1;
    },
    /** Keep only snapshots 0..i (drop the "future" after a rewind). */
    truncate(i) { len = Math.max(0, Math.min(len, i + 1)); },
    copyTo(i, dst) { const s = slots[(start + i) % capacity]; for (const f of fields) dst[f] = s[f]; return dst; },
    clear() { start = 0; len = 0; },
  };
}

// ---------------------------------------------------------------- the run
/**
 * One run to the Showcase.
 * opts: { seed, charges, level (0..1, fixed) | adapt (createAdapt, min 0 max 1), speedScale, finish, onEvent(type, data) }
 * Input: jump(), slide(). Crash → mode 'crash' until resolve('rewind' | 'keep').
 * Ends with mode 'done' at the Showcase, or when the run clock reaches TIME_CAP (finish event `early`:
 * the Showcase comes to the runner).
 */
export function createRun({ seed = 1, charges = 3, level = 0.4, adapt = null, speedScale = 1, finish = FINISH, onEvent = null } = {}) {
  const world = createWorld(seed, finish);
  const s = {
    t: 0, x: 0, y: 0, vy: 0, ground: true, airT: 0, slideT: 0, bufferT: 0, fastFall: false, slideQueued: false,
    stumbleT: 0, invulnT: 0, score: 0, records: 0, cleans: 0, repairs: 0, streak: 0, bestStreak: 0, logLen: 0,
    jumps: 0, slides: 0, v: 0, tick: 0,
  };
  const ring = createRing();
  const log = [];                       // { type: 'rec' | 'res', id, t } — undone on rewind
  const collected = new Map();          // record id → time
  const resolved = new Map();           // obstacle id → { how: 'clear'|'repair'|'knock', t }
  const committed = new Map();          // obstacle id → shown? (decided once, when it comes near)
  const crashed = new Set();            // obstacles crashed into (kept through rewinds)
  const stats = { rewinds: 0, stumbles: 0, crashes: 0, comebackRecords: 0, comebackPts: 0, repairedKinds: [] };
  let mode = 'run';
  let pending = null;                   // the crash waiting for a choice
  let comeback = null;                  // { x, until, left }
  let chargesLeft = Math.max(0, charges | 0);
  let acc = 0, mono = 0, finished = false, early = false;
  const emit = (type, data) => onEvent?.(type, data);

  const lvl = () => (adapt ? (adapt.level - adapt.min) / Math.max(1e-9, adapt.max - adapt.min) : level);
  const density = () => DENSITY.min + (DENSITY.max - DENSITY.min) * lvl();
  const baseSpeed = () => (SPEEDS.min + (SPEEDS.max - SPEEDS.min) * lvl()) * speedScale;
  /** Current speed: the adaptive pace, dipped for a moment by a stumble. Never faster. */
  function speedNow() {
    const dip = s.stumbleT > 0 ? STUMBLE.low + (1 - STUMBLE.low) * (1 - s.stumbleT / STUMBLE.secs) : 1;
    return baseSpeed() * dip;
  }
  const isActive = ob => committed.get(ob.id) === true;

  function commit() {
    const k0 = Math.floor(s.x / CHUNK), k1 = Math.floor((s.x + HORIZON) / CHUNK);
    for (let k = k0; k <= k1; k++) {
      const obs = world.chunk(k).obstacles;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (!committed.has(o.id) && o.x - s.x < HORIZON) committed.set(o.id, o.tier === 0 || o.tier < density());
      }
    }
  }

  function remember(type, id, boosted = false) { log.push({ type, id, t: s.t, boosted }); s.logLen = log.length; }
  /** Roll the log back to `len` entries: records go back on the street, clears are undone, and so are their stats. */
  function undoTo(len) {
    while (log.length > len) {
      const e = log.pop();
      if (e.type === 'rec') {
        collected.delete(e.id);
        if (e.boosted) { stats.comebackRecords--; stats.comebackPts -= PTS.record; }
      } else {
        if (resolved.get(e.id)?.how === 'repair') stats.repairedKinds.pop();
        resolved.delete(e.id);
      }
    }
    s.logLen = log.length;
  }
  function settle(ob, how) { resolved.set(ob.id, { how, t: s.t }); remember('res', ob.id); }

  function doJump() {
    s.vy = PHYS.jumpV; s.ground = false; s.airT = 0; s.slideT = 0; s.bufferT = 0; s.fastFall = false; s.slideQueued = false;
    s.jumps++;
    emit('jump');
  }
  function startSlide() { s.slideT = PHYS.slide; s.slides++; emit('slide'); }

  function collide() {
    const H = s.slideT > 0 ? PHYS.slideH : PHYS.standH;
    const a = s.x - PHYS.halfW, b = s.x + PHYS.halfW;
    const k0 = Math.floor((s.x - 4) / CHUNK), k1 = Math.floor((s.x + 4) / CHUNK);
    for (let k = k0; k <= k1; k++) {
      const obs = world.chunk(k).obstacles;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (!isActive(o) || resolved.has(o.id)) continue;
        // passed it cleanly?
        if (o.x + o.hw < a) {
          if (crashed.has(o.id)) { settle(o, 'repair'); s.score += PTS.repair; s.repairs++; stats.repairedKinds.push(o.kind); emit('repair', o); }
          else { settle(o, 'clear'); s.score += PTS.clean; s.cleans++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); emit('clean', o); }
          adapt?.record(true, mono);
          continue;
        }
        if (b < o.x - o.hw || a > o.x + o.hw) continue;
        const hit = o.slide ? s.y + H > o.bottom : s.y < o.hh;
        if (!hit) continue;
        if (s.invulnT > 0) { settle(o, 'knock'); emit('knock', o); continue; }
        crash(o);
        return;
      }
    }
  }

  function collect() {
    const H = s.slideT > 0 ? PHYS.slideH : PHYS.standH;
    const reach = PHYS.halfW + PHYS.recR;
    const k0 = Math.floor((s.x - reach) / CHUNK), k1 = Math.floor((s.x + reach) / CHUNK);
    for (let k = k0; k <= k1; k++) {
      const recs = world.chunk(k).records;
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (collected.has(r.id) || Math.abs(r.x - s.x) > reach) continue;
        if (r.y < s.y - PHYS.recR || r.y > s.y + H + PHYS.recR) continue;
        let pts = PTS.record, boosted = false;
        if (comeback && comeback.left > 0 && s.t <= comeback.until && r.x > comeback.x) {
          pts *= 2; boosted = true; comeback.left--; stats.comebackRecords++; stats.comebackPts += PTS.record;
        }
        s.score += pts; s.records++;
        collected.set(r.id, s.t);
        remember('rec', r.id, boosted);
        emit('collect', { rec: r, pts, boosted });
      }
    }
  }

  function crash(o) {
    mode = 'crash';
    stats.crashes++;
    const first = !crashed.has(o.id);
    crashed.add(o.id);
    s.streak = 0;
    pending = { ob: o, x: s.x, y: s.y, t: s.t, first, slide: s.slideT > 0 };
    adapt?.record(false, mono);
    emit('crash', pending);
  }

  function tick() {
    s.t += STEP; mono += STEP;
    if (s.stumbleT > 0) s.stumbleT = Math.max(0, s.stumbleT - STEP);
    if (s.invulnT > 0) s.invulnT = Math.max(0, s.invulnT - STEP);
    s.v = speedNow();
    s.x += s.v * STEP;
    if (s.bufferT > 0) { if (s.ground) doJump(); else s.bufferT -= STEP; }
    if (!s.ground) {
      s.airT += STEP;
      s.vy -= PHYS.g * (s.fastFall ? PHYS.fallG : 1) * STEP;
      s.y += s.vy * STEP;
      if (s.y <= 0) {
        const impact = -s.vy;
        s.y = 0; s.vy = 0; s.ground = true; s.airT = 0; s.fastFall = false;
        emit('land', impact);
        if (s.slideQueued) { s.slideQueued = false; startSlide(); }
        if (s.bufferT > 0) doJump();
      }
    }
    if (s.slideT > 0) { s.slideT -= STEP; if (s.slideT <= 0) { s.slideT = 0; emit('slideEnd'); } }
    commit();
    collide();
    if (mode !== 'run') return;
    collect();
    if (s.x >= finish || s.t >= TIME_CAP) {
      mode = 'done'; finished = true; early = s.x < finish;
      s.score += PTS.finish;
      emit('finish', { time: s.t, early });
      return;
    }
    if (++s.tick % SNAP_EVERY === 0) ring.push(s);
  }

  ring.push(s);
  commit();

  const run = {
    world, s, stats, finish,
    get mode() { return mode; },
    get pending() { return pending; },
    get comeback() { return comeback; },
    get charges() { return chargesLeft; },
    get finished() { return finished; },
    get level() { return lvl(); },
    get density() { return density(); },
    speedNow,
    /** Advance by dt seconds (fixed internal steps; stops at a crash or the finish). */
    step(dt) {
      if (mode !== 'run') return;
      acc += Math.min(0.25, Math.max(0, dt));
      while (acc >= STEP && mode === 'run') { acc -= STEP; tick(); }
      if (mode !== 'run') acc = 0;
    },
    jump() { if (mode !== 'run') return false; s.bufferT = PHYS.buffer; return true; },
    /**
     * Swipe down. sameGesture: the swipe comes from the press that started this hop (it was a slide all along).
     * Returns 'slide' (on the ground), 'cancel' (the hop becomes a slide and isn't counted as a jump) or
     * 'slam' (a real jump that slams down and slides on landing); false when not running.
     * A cancelled hop drops straight into the slide only while it is still low (PHYS.snap); later it
     * takes the slam path, which lands in well under 0.1 s, so the runner never jumps from mid-air to
     * the ground in one frame.
     */
    slide(sameGesture = false) {
      if (mode !== 'run') return false;
      s.bufferT = 0;
      if (s.ground) { startSlide(); return 'slide'; }
      const cancel = s.vy > 0 && (s.airT < PHYS.cancel || sameGesture);
      if (cancel) s.jumps = Math.max(0, s.jumps - 1);
      if (cancel && s.airT < PHYS.snap) {
        s.y = 0; s.vy = 0; s.ground = true; s.airT = 0;
        startSlide();
        return 'cancel';
      }
      s.fastFall = true; s.vy = Math.min(s.vy, -PHYS.slam); s.slideQueued = true; emit('slam');
      return cancel ? 'cancel' : 'slam';
    },
    /** The snapshots a rewind will travel through, newest first (copies — call before resolve). */
    rewindPath() {
      if (mode !== 'crash') return [];
      const to = ring.indexAt(pending.t - REWIND_SECS);
      const out = [{ t: s.t, x: s.x, y: s.y, slide: s.slideT > 0 }];
      for (let i = ring.length - 1; i >= to; i--) { const q = ring.get(i); out.push({ t: q.t, x: q.x, y: q.y, slide: q.slideT > 0 }); }
      return out;
    },
    /** After a crash: 'rewind' (uses a charge: back 3 s, score back to that moment) or 'keep' (stumble on). */
    resolve(choice) {
      if (mode !== 'crash') return false;
      const p = pending;
      pending = null;
      if (choice === 'rewind' && chargesLeft > 0) {
        chargesLeft--; stats.rewinds++;
        const i = ring.indexAt(p.t - REWIND_SECS);
        ring.copyTo(i, s);
        ring.truncate(i);
        undoTo(s.logLen);
        // Only the first crash at an obstacle earns a comeback (no farming one obstacle).
        comeback = p.first ? { x: p.x, until: s.t + COMEBACK_SECS, left: COMEBACK_MAX, from: s.t } : null;
        const back = p.t - s.t;
        if (back < 1) s.invulnT = Math.max(s.invulnT, 1 - back); // very short history: a moment's grace
        acc = 0;
        mode = 'run';
        emit('rewind', { crash: p, to: s.t, back });
      } else {
        stats.stumbles++;
        settle(p.ob, 'knock');
        s.stumbleT = STUMBLE.secs;
        s.invulnT = STUMBLE.invuln;
        if (!s.ground) s.vy = Math.min(s.vy, 0);
        s.slideT = 0; s.bufferT = 0;
        acc = 0;
        mode = 'run';
        emit('stumble', p);
      }
      return true;
    },
    status(ob) { const r = resolved.get(ob.id); return r ? r.how : committed.has(ob.id) ? (committed.get(ob.id) ? 'active' : 'off') : 'ahead'; },
    resolvedAt: id => resolved.get(id)?.t ?? Infinity,
    isCollected: id => collected.has(id),
    wasCrashed: id => crashed.has(id),
    isActive,
    /** The next obstacle still to pass (shown and unresolved), or null. */
    nextObstacle(from = s.x - PHYS.halfW) {
      for (let k = Math.floor((from - 4) / CHUNK), n = 0; n < 4; k++, n++) {
        const obs = world.chunk(k).obstacles;
        for (let i = 0; i < obs.length; i++) {
          const o = obs[i];
          if (o.x + o.hw >= from && !resolved.has(o.id) && (isActive(o) || !committed.has(o.id))) return o;
        }
      }
      return null;
    },
    result() {
      return {
        score: s.score, records: s.records, cleans: s.cleans, repairs: s.repairs, bestStreak: s.bestStreak,
        rewinds: stats.rewinds, stumbles: stats.stumbles, crashes: stats.crashes,
        comebackRecords: stats.comebackRecords, repairedKinds: stats.repairedKinds.slice(),
        finished, early, finish, distance: Math.min(finish, s.x), time: s.t, jumps: s.jumps, slides: s.slides,
      };
    },
  };
  return run;
}

// ---------------------------------------------------------------- bot
/**
 * What a good player would do right now: 'jump', 'slide' or null.
 * Used by the unit tests and by the in-page autoplay (which turns it into real pointer events).
 * opts.skip(ob) → true: do nothing for that obstacle (a crash on purpose).
 */
export function botAction(run, { skip = null } = {}) {
  if (run.mode !== 'run') return null;
  const s = run.s;
  const ob = run.nextObstacle();
  if (!ob || !run.isActive(ob) || skip?.(ob)) return null;
  const v = Math.max(1, s.v || run.speedNow());
  const dist = ob.x - s.x;                              // to the obstacle's centre
  if (ob.slide) {
    const front = ob.x - ob.hw - (s.x + PHYS.halfW);
    return front <= Math.min(3, v * 0.2) && front > -ob.hw && s.slideT < 0.25 && s.ground ? 'slide' : null;
  }
  const lead = v * (PHYS.jumpV / PHYS.g);               // apex right over it
  return s.ground && dist <= lead ? 'jump' : null;
}

/** Play a whole run in Node with the bot (tests). `crashAt(ob)` → 'rewind' | 'keep' | falsy (don't crash). */
export function simulate(opts = {}, { crashAt = null, until = Infinity, maxSecs = 200 } = {}) {
  const run = createRun(opts);
  const plan = new Map();
  const skip = ob => { if (!plan.has(ob.id)) plan.set(ob.id, crashAt ? crashAt(ob, run) : null); return !!plan.get(ob.id) && !run.wasCrashed(ob.id); };
  let guard = 0;
  while (run.mode !== 'done' && run.s.x < until && guard++ < maxSecs * 120) {
    if (run.mode === 'crash') {
      const choice = plan.get(run.pending.ob.id) || 'keep';
      run.resolve(choice);
      continue;
    }
    const a = botAction(run, { skip });
    if (a === 'jump') run.jump(); else if (a === 'slide') run.slide();
    run.step(STEP);
  }
  return run;
}
