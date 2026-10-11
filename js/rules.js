// Pure game rules. No DOM, no storage — safe to unit test in Node.

export const POINT_TYPES = {
  firstAsk: { pts: 1, color: 'sky' },
  words:    { pts: 1, color: 'mint' },
  kind:     { pts: 1, color: 'pink' },
  rewind:   { pts: 2, color: 'grape' },
};
export const XP_PER_POINT = 10;
export const STARS_PER_POINT = 1;
export const DAILY_GOAL = 3;          // points
export const UNDO_WINDOW_MS = 60_000;

export function rewardFor(type) {
  const t = POINT_TYPES[type];
  if (!t) throw new Error('Unknown point type: ' + type);
  return { pts: t.pts, xp: t.pts * XP_PER_POINT, stars: t.pts * STARS_PER_POINT };
}

// ---- Levels ---------------------------------------------------------------
// XP needed to go from level n to n+1, starting at level 1.
const STEPS = [30, 50, 60, 70, 75, 80, 80, 85, 85, 90, 90, 95, 95, 100, 100, 100, 105, 105, 105, 105];
const LATE_STEP = 110;

export function xpForLevel(level) {
  let total = 0;
  for (let n = 1; n < level; n++) total += STEPS[n - 1] ?? LATE_STEP;
  return total;
}

export function levelForXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp) {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - base, span: next - base, next, base };
}

// ---- Crew pot & chapters --------------------------------------------------
export const CHAPTER_POT = [0, 250, 700, 1400, 2300, 3500];

export function crewPot(state) {
  return state.players.reduce((s, p) => s + p.xp, 0) + (state.potBonus || 0);
}

export function chaptersUnlocked(pot) {
  return CHAPTER_POT.filter(t => pot >= t).length;
}

export function nextChapterTarget(pot) {
  return CHAPTER_POT.find(t => t > pot) ?? null;
}

// ---- Dates ---------------------------------------------------------------
const pad = n => String(n).padStart(2, '0');

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday of the week containing ts (local time).
export function weekKey(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(12, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return dayKey(d.getTime());
}

export function weekDays(ts = Date.now()) {
  const start = new Date(weekKey(ts) + 'T12:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dayKey(d.getTime());
  });
}

// ---- Per-player derived stats --------------------------------------------
export function activeLog(state) {
  return state.log.filter(e => !e.undone);
}

export function pointsOn(state, pid, day) {
  return activeLog(state)
    .filter(e => e.pid === pid && e.day === day)
    .reduce((s, e) => s + e.pts, 0);
}

export function weekSummary(state, pid, ts = Date.now()) {
  const days = weekDays(ts);
  const perDay = days.map(d => pointsOn(state, pid, d));
  return {
    days,
    perDay,
    goalDays: perDay.filter(p => p >= DAILY_GOAL).length,
    total: perDay.reduce((a, b) => a + b, 0),
  };
}

// ---- Weekly challenge -----------------------------------------------------
export const CHALLENGE_TYPES = ['firstAsk', 'words', 'kind', 'rewind', 'any'];

export function challengeProgress(state, ts = Date.now()) {
  const c = state.challenge;
  if (!c) return { count: 0, target: 0, done: false };
  const wk = weekKey(ts);
  const entries = activeLog(state).filter(e => e.week === wk);
  const count = c.type === 'any'
    ? entries.reduce((s, e) => s + e.pts, 0)
    : entries.filter(e => e.type === c.type).length;
  return { count, target: c.target, done: count >= c.target };
}

// =====================================================================
// v2 — Arcade: tickets, warm-up, co-op, daily cap, wind-down, charges.
// =====================================================================
export const TICKET_CAP = 10;
export const ADULT_ROLES = ['p1', 'p2', 'gp'];
export const isAdult = p => !!p && ADULT_ROLES.includes(p.role);
export const DEFAULT_ARCADE = { capMin: 15, windDown: '19:00' };
export const CAP_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60];
export const WIND_DOWN_OPTIONS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', 'off'];
export const WAKE_HOUR = 5; // the Arcade reopens at 05:00
export const DASH_BASE_CHARGES = 3;
export const DASH_BONUS_MAX = 5;

/** Tickets earned for one real-world entry: 1 per point, so a REWIND earns 2. */
export const ticketsFor = type => rewardFor(type).pts;

/** How many of `earned` tickets fit in the bank (never more than the cap, never negative). */
export function ticketsToBank(current, earned) {
  return Math.max(0, Math.min(earned, TICKET_CAP - current));
}

export function arcadeSettings(state) {
  return { ...DEFAULT_ARCADE, ...(state?.arcade || {}) };
}

/** True between the parent-set wind-down time and 05:00. */
export function windDownActive(state, now = Date.now()) {
  const { windDown } = arcadeSettings(state);
  if (!windDown || windDown === 'off') return false;
  const [h, m] = windDown.split(':').map(Number);
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= h * 60 + m || mins < WAKE_HOUR * 60;
}

export function playSecondsToday(player, now = Date.now()) {
  return player?.play?.day === dayKey(now) ? player.play.seconds : 0;
}

export function playSecondsLeft(state, player, now = Date.now()) {
  return Math.max(0, arcadeSettings(state).capMin * 60 - playSecondsToday(player, now));
}

export function rewindsThisWeek(state, pid, now = Date.now()) {
  const wk = weekKey(now);
  return activeLog(state).filter(e => e.pid === pid && e.type === 'rewind' && e.week === wk).length;
}

/** City Dash "Run it back" charges for one run: base + this week's real-world Rewinds. */
export function dashCharges(state, pid, now = Date.now()) {
  return DASH_BASE_CHARGES + Math.min(DASH_BONUS_MAX, rewindsThisWeek(state, pid, now));
}

/** Yesterday's day key (local). */
export function prevDayKey(now = Date.now()) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}

/**
 * v1 Practice Session: one free round a day, earned by 3 real-life points. A session earned but not
 * played (e.g. the goal was reached after wind-down) carries over to the next day. We track which
 * earned day a session used (`practiceFor`), so playing yesterday's carried session never uses up
 * today's — a kid who always reaches the goal in the evening still gets one every day.
 * Returns the day key of the session to play now (the older one first), or null.
 */
export function practiceSession(state, player, now = Date.now()) {
  const day = dayKey(now);
  if (player.practiceDay === day) return null; // one Practice a day
  const used = player.practiceFor ?? player.practiceDay ?? null; // v1 saves only knew practiceDay
  const earned = d => pointsOn(state, player.id, d) >= DAILY_GOAL && used !== d;
  const y = prevDayKey(now);
  if (earned(y)) return y;
  if (earned(day)) return day;
  return null;
}
export const practiceAvailable = (state, player, now = Date.now()) => practiceSession(state, player, now) !== null;

/**
 * Showdown: unlocked when a Weekly Crew Challenge completes (the unlock never re-locks and carries
 * into later weeks until used). One win per player per calendar week.
 */
/** Crew-challenge unlocks this player hasn't used yet, oldest first. */
export function showdownPending(state, player) {
  const sd = state?.showdown || {};
  const opened = [...new Set([...(sd.opened || []), sd.openedWeek].filter(Boolean))];
  const used = player.showdownUsed || (player.showdownWonFor ? [player.showdownWonFor] : []);
  return opened.filter(w => !used.includes(w)).sort();
}
export function showdownStatus(state, player, now = Date.now()) {
  if (player.showdownWeek === weekKey(now)) return 'done';
  return showdownPending(state, player).length ? 'open' : 'locked';
}
export const showdownOpen = (state, player, now = Date.now()) => showdownStatus(state, player, now) === 'open';

/** Tickets still inside the 60 s undo window ("ticket incoming"). */
export function pendingTickets(state, pid, now = Date.now()) {
  return state.log.filter(e => e.pid === pid && !e.undone && e.tk && !e.tkDone && now - e.ts <= UNDO_WINDOW_MS)
    .reduce((n, e) => n + e.tk, 0);
}

/**
 * Can this round start, and who pays? Pure — changes nothing.
 * kind: 'arcade' · 'showdown' · 'coop' · 'practice' (v1, free, ignores the cap).
 * opts.adultConfirmed: a grown-up partner confirmed with the PIN → co-op is free.
 * opts.payer: in kid + kid co-op, the player covering the round (default: best option).
 * Returns { ok, pay: 'credit'|'warmup'|'ticket'|'adult'|'free', payer, reason }.
 */
export function roundGate(state, player, { kind = 'arcade', partner = null, adultConfirmed = false, payer = null } = {}, now = Date.now()) {
  if (windDownActive(state, now)) return { ok: false, reason: 'windDown' };
  if (kind === 'practice') {
    if (player.practiceDay === dayKey(now)) return { ok: false, reason: 'practiceDone' };
    return practiceAvailable(state, player, now) ? { ok: true, pay: 'free', payer: player.id } : { ok: false, reason: 'practiceLocked' };
  }
  const need = 30; // a round needs 30 s of today's play time left (kids only — grown-ups have no cap)
  for (const p of [player, partner]) {
    if (p && !isAdult(p) && playSecondsLeft(state, p, now) < need) return { ok: false, reason: 'cap', who: p.id };
  }
  if (kind === 'showdown') {
    const st = showdownStatus(state, player, now);
    if (st !== 'open') return { ok: false, reason: st === 'done' ? 'showdownDone' : 'showdownLocked' };
  }
  if (kind === 'coop' && adultConfirmed && (isAdult(player) || isAdult(partner))) return { ok: true, pay: 'adult', payer: null };
  const day = dayKey(now);
  const canPay = p => (p.paidRound ? 'credit' : p.warmupDay !== day ? 'warmup' : (p.tickets || 0) >= 1 ? 'ticket' : null);
  let candidates = [player];
  if (kind === 'coop' && partner && !isAdult(partner)) candidates = payer ? [payer] : [player, partner];
  if (kind === 'coop' && isAdult(player) && partner && !isAdult(partner)) candidates = [partner];
  const rank = { credit: 0, warmup: 1, ticket: 2 };
  const options = candidates.map(p => ({ p, pay: canPay(p) })).filter(o => o.pay)
    .sort((a, b) => rank[a.pay] - rank[b.pay] || (b.p.tickets || 0) - (a.p.tickets || 0));
  if (!options.length) return { ok: false, reason: 'tickets' };
  return { ok: true, pay: options[0].pay, payer: options[0].p.id };
}

// ---- v2: per-game progress (never compared across players) ----------------
export const ROUND_HISTORY = 20;

/** "Most improved": average of the last 3 rounds ≥ 115% of the 4 before them. */
export function mostImproved(scores) {
  if (scores.length < 7) return false;
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const last = avg(scores.slice(-3));
  const prev = avg(scores.slice(-7, -3));
  return prev > 0 ? last >= prev * 1.15 : last > 0;
}
