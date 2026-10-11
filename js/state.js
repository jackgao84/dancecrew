// All persistent data lives in one localStorage key on this device (KEYS.game).
// Every change goes through mutate(), which enforces:
//  - XP never goes down (the only exception is cancelling a mis-tap inside the 60 s undo window);
//  - Play Tickets are never negative and never taken away — the only decrease is the player
//    spending one ticket to start a round (beginRound).

import * as R from './rules.js';
import { KEYS, migrateLegacyKeys, readKey, removeKey } from './storage-keys.js';
import { ITEMS, RARE_ITEMS, MOVES, BONUS_COLORS, BONUS_COLOR_START_LEVEL, DEFAULT_REWARDS, ROLES, randomAvatar } from './content.js';

const KEY = KEYS.game;
const VERSION = 1;
let S = null;
const listeners = new Set();

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// ---------------------------------------------------------------- storage
export function load() {
  try {
    migrateLegacyKeys();
    const raw = readKey(KEY);
    S = raw ? migrate(JSON.parse(raw)) : null;
    if (S) settleTickets();
  } catch (e) {
    console.warn('Could not read saved data', e);
    S = null;
  }
  return S;
}
export const get = () => S;
export const hasGame = () => !!(S && S.players && S.players.length);

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.warn('Could not save', e);
  }
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Apply a change. `allowXpDrop` is only ever true for the 60-second mis-tap undo.
 * `ticketSpender` is the id of the one player allowed to spend exactly one ticket (beginRound).
 */
export function mutate(fn, { allowXpDrop = false, ticketSpender = null } = {}) {
  const before = new Map(S.players.map(p => [p.id, { xp: p.xp, tickets: p.tickets || 0 }]));
  const snapshot = JSON.stringify(S);
  const refuse = msg => { S = JSON.parse(snapshot); throw new Error(msg); };
  const result = fn(S);
  for (const p of S.players) {
    const b = before.get(p.id);
    if (!b) continue;
    if (!allowXpDrop && p.xp < b.xp) refuse('XP can never go down');
    const t = p.tickets || 0;
    if (t < 0 || !Number.isFinite(t)) refuse('Tickets can never be negative');
    if (t > R.TICKET_CAP) refuse('Ticket bank is capped');
    if (t < b.tickets && !(ticketSpender === p.id && b.tickets - t === 1)) refuse('Tickets can never be taken away');
  }
  persist();
  listeners.forEach(l => l());
  return result;
}

export function requestPersistentStorage() {
  try { navigator.storage?.persist?.(); } catch { /* optional */ }
}

// ---------------------------------------------------------------- PIN
// Not bank-grade — it keeps the PIN out of plain sight on a family device.
function hashPin(pin, salt) {
  let h = 2166136261 >>> 0;
  const str = salt + ':' + pin;
  for (let round = 0; round < 2000; round++) {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i) + round;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h.toString(16);
}
export function checkPin(pin) {
  return !!S?.pin && hashPin(pin, S.pin.salt) === S.pin.hash;
}
export function setPin(pin) {
  mutate(s => { const salt = uid(); s.pin = { salt, hash: hashPin(pin, salt) }; });
}

// ---------------------------------------------------------------- setup
// v2 fields: Arcade tickets, daily warm-up, play time, per-game progress, rare items.
const V2_PLAYER_DEFAULTS = () => ({
  tickets: 0, warmupDay: null, paidRound: null, play: null, games: {}, rareItems: [],
  showdownWeek: null, showdownWonFor: null, showdownUsed: [], showdownProgress: null,
});

function newPlayer(role, name, avatar, designed) {
  return {
    id: uid(), role, name: name.trim(), avatar: avatar || randomAvatar(), designed: !!designed,
    xp: 0, stars: 0, newItems: [], missions: {}, missionDay: null, practiceDay: null, practiceBest: 0,
    created: Date.now(),
    ...V2_PLAYER_DEFAULTS(),
  };
}

export function createGame({ gameName, crewName, heroName, heroAvatar, others, pin, lang = 'en' }) {
  const salt = uid();
  S = {
    v: VERSION,
    created: Date.now(),
    gameName: gameName.trim(),
    crewName: crewName.trim(),
    lang,
    sound: true,
    pin: { salt, hash: hashPin(pin, salt) },
    players: [
      newPlayer('hero', heroName, heroAvatar, true),
      ...others.map((o, i) => newPlayer(ROLES[i + 1], o.name, o.avatar, false)),
    ],
    log: [],
    events: [],
    redemptions: [],
    rewards: DEFAULT_REWARDS.map(r => ({ ...r })),
    challenge: { type: 'firstAsk', target: 10, bonus: 100, doneWeek: null },
    potBonus: 0,
    storySeen: [],
    arcade: { ...R.DEFAULT_ARCADE },
    reactions: {},
    crewOrder: null,
    showdown: { openedWeek: null, opened: [] },
  };
  persist();
  listeners.forEach(l => l());
  return S;
}

function migrate(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.players)) return null;
  s.v = s.v || 1;
  s.log = s.log || [];
  s.events = s.events || [];
  s.redemptions = s.redemptions || [];
  s.rewards = s.rewards || DEFAULT_REWARDS.map(r => ({ ...r }));
  s.challenge = s.challenge || { type: 'firstAsk', target: 10, bonus: 100, doneWeek: null };
  s.potBonus = s.potBonus || 0;
  s.storySeen = s.storySeen || [];
  s.sound = s.sound !== false;
  s.lang = s.lang || 'en';
  s.arcade = { ...R.DEFAULT_ARCADE, ...(s.arcade || {}) };
  s.reactions = s.reactions || {};
  s.crewOrder = Array.isArray(s.crewOrder) ? s.crewOrder : null;
  s.showdown = s.showdown || { openedWeek: s.challenge?.doneWeek || null };
  s.showdown.opened = s.showdown.opened || (s.showdown.openedWeek ? [s.showdown.openedWeek] : []);
  for (const p of s.players) {
    p.newItems = p.newItems || [];
    p.missions = p.missions || {};
    p.xp = Math.max(0, Number(p.xp) || 0);
    p.stars = Math.max(0, Number(p.stars) || 0);
    const d = V2_PLAYER_DEFAULTS();
    for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
    p.tickets = Math.min(R.TICKET_CAP, Math.max(0, Math.floor(Number(p.tickets) || 0)));
  }
  return s;
}

// ---------------------------------------------------------------- lookups
export const player = id => S.players.find(p => p.id === id);
export const playerByRole = role => S.players.find(p => p.role === role);
export const level = p => R.levelForXp(p.xp);
export const pot = () => R.crewPot(S);

export function unlockedItems(p) {
  const lv = level(p);
  return [...ITEMS.filter(i => i.level <= lv), ...RARE_ITEMS.filter(i => (p.rareItems || []).includes(i.id))];
}
export const ownsItem = (p, id) => unlockedItems(p).some(i => i.id === id);
export function unlockedMoves(p) {
  const lv = level(p);
  return MOVES.filter(m => m.level <= lv);
}
export function unlockedBonusColors(p) {
  const n = level(p) - BONUS_COLOR_START_LEVEL + 1;
  return BONUS_COLORS.slice(0, Math.max(0, n));
}

// Everything a level range unlocks, in reveal order.
export function unlocksBetween(fromLevel, toLevel) {
  const out = [];
  for (let lv = fromLevel + 1; lv <= toLevel; lv++) {
    ITEMS.filter(i => i.level === lv).forEach(i => out.push({ kind: 'item', level: lv, item: i }));
    MOVES.filter(m => m.level === lv).forEach(m => out.push({ kind: 'move', level: lv, move: m }));
    const bi = lv - BONUS_COLOR_START_LEVEL;
    if (bi >= 0 && BONUS_COLORS[bi]) out.push({ kind: 'color', level: lv, color: BONUS_COLORS[bi] });
  }
  return out;
}

// ---------------------------------------------------------------- scoring
/** Log a real-world point. Returns what happened so the UI can celebrate. */
export function addEntry(pid, type, note = '', now = Date.now()) {
  return mutate(s => {
    const p = s.players.find(x => x.id === pid);
    if (!p) throw new Error('No such player');
    const r = R.rewardFor(type);
    const potBefore = R.crewPot(s);
    const lvBefore = R.levelForXp(p.xp);
    const entry = {
      id: uid(), ts: now, day: R.dayKey(now), week: R.weekKey(now),
      pid, type, pts: r.pts, xp: r.xp, stars: r.stars, note: (note || '').trim().slice(0, 140),
    };
    // Play Tickets: 1 per point (a REWIND earns 2). They land in the bank when the 60 s undo
    // window closes, so an undo never has to take a ticket away.
    settleIn(s, now);
    entry.tk = R.ticketsFor(type);
    entry.tkDone = false;
    s.log.push(entry);
    p.xp += r.xp;
    p.stars += r.stars;
    const lvAfter = R.levelForXp(p.xp);
    const unlocks = unlocksBetween(lvBefore, lvAfter);
    if (lvAfter > lvBefore) {
      s.events.push({ id: uid(), ts: now, kind: 'level', pid, level: lvAfter, entryId: entry.id });
      unlocks.filter(u => u.kind === 'item').forEach(u => p.newItems.push(u.item.id));
    }

    // Weekly crew challenge
    let challengeDone = false;
    const c = s.challenge;
    if (c && c.doneWeek !== entry.week && R.challengeProgress(s, now).done) {
      c.doneWeek = entry.week;
      c.doneBy = entry.id;
      s.potBonus += c.bonus;
      s.events.push({ id: uid(), ts: now, kind: 'challenge', type: c.type, target: c.target, bonus: c.bonus, entryId: entry.id });
      openShowdown(s, entry.week); // the Neon Owls are ready (never re-locks)
      challengeDone = true;
    }

    const potAfter = R.crewPot(s);
    const chBefore = R.chaptersUnlocked(potBefore);
    const chAfter = R.chaptersUnlocked(potAfter);
    for (let n = chBefore + 1; n <= chAfter; n++) {
      s.events.push({ id: uid(), ts: now, kind: 'chapter', chapter: n, entryId: entry.id });
    }
    trimHistory(s);
    const room = R.TICKET_CAP - (p.tickets || 0) - R.pendingTickets(s, pid, now) + entry.tk;
    return {
      entry, player: p, lvBefore, lvAfter, unlocks, challengeDone, newChapter: chAfter > chBefore ? chAfter : 0,
      tickets: Math.max(0, Math.min(entry.tk, room)), bankFull: room <= 0, windDown: R.windDownActive(s, now),
      rewindsThisWeek: R.rewindsThisWeek(s, pid, now), rewindCap: R.DASH_BONUS_MAX,
    };
  });
}

export function canUndo(entry, now = Date.now()) {
  return entry && !entry.undone && now - entry.ts <= R.UNDO_WINDOW_MS;
}

/**
 * Cancel a mis-tap. Only inside the 60-second window — after that, XP is locked in forever.
 * Play Tickets from the entry are NOT removed: nobody can take a ticket away.
 */
export function undoEntry(entryId, now = Date.now()) {
  const e = S.log.find(x => x.id === entryId);
  if (!canUndo(e, now)) return false;
  mutate(s => {
    const entry = s.log.find(x => x.id === entryId);
    const p = s.players.find(x => x.id === entry.pid);
    entry.undone = true;
    p.xp -= entry.xp;
    p.stars = Math.max(0, p.stars - entry.stars);
    const lv = R.levelForXp(p.xp);
    const lockedAgain = ITEMS.filter(i => i.level > lv).map(i => i.id);
    p.newItems = p.newItems.filter(id => !lockedAgain.includes(id));
    for (const k of ['head', 'hair', 'outfit', 'shoes', 'face']) {
      if (lockedAgain.includes(p.avatar[k])) p.avatar[k] = { head: 'none', hair: 'crop', outfit: 'tee', shoes: 'classic', face: 'noface' }[k];
    }
    if (s.challenge?.doneBy === entryId) {
      s.potBonus -= s.challenge.bonus;
      s.challenge.doneWeek = null;
      s.challenge.doneBy = null;
    }
    s.events = s.events.filter(ev => ev.entryId !== entryId);
  }, { allowXpDrop: true });
  return true;
}

function trimHistory(s) {
  if (s.events.length > 600) s.events = s.events.slice(-500);
  // Keep the log bounded; old entries are summarised in XP totals already.
  if (s.log.length > 6000) s.log = s.log.slice(-5000);
}

// ---------------------------------------------------------------- stars & rewards
export function redeem(pid, rewardId, now = Date.now()) {
  return mutate(s => {
    const p = s.players.find(x => x.id === pid);
    const r = s.rewards.find(x => x.id === rewardId);
    if (!p || !r || p.stars < r.cost) return false;
    p.stars -= r.cost;
    const red = { id: uid(), ts: now, pid, rewardId, name: r.name, icon: r.icon, cost: r.cost };
    s.redemptions.push(red);
    s.events.push({ id: uid(), ts: now, kind: 'reward', pid, name: r.name, icon: r.icon });
    if (s.redemptions.length > 400) s.redemptions = s.redemptions.slice(-300);
    return red;
  });
}
export function saveReward(reward) {
  mutate(s => {
    const i = s.rewards.findIndex(r => r.id === reward.id);
    const clean = { id: reward.id || uid(), icon: reward.icon || '⭐', name: String(reward.name).trim().slice(0, 60), cost: Math.max(1, Math.min(99, Math.round(reward.cost) || 1)) };
    if (i >= 0) s.rewards[i] = clean; else s.rewards.push(clean);
  });
}
export function removeReward(id) { mutate(s => { s.rewards = s.rewards.filter(r => r.id !== id); }); }

// ---------------------------------------------------------------- challenge
export function setChallenge({ type, target, bonus }) {
  mutate(s => {
    const wk = R.weekKey();
    const keepDone = s.challenge?.doneWeek === wk && s.challenge.type === type && s.challenge.target === target;
    s.challenge = {
      type, target: Math.max(1, Math.min(99, target)), bonus: Math.max(0, Math.min(500, bonus)),
      doneWeek: keepDone ? wk : null, doneBy: keepDone ? s.challenge.doneBy : null,
    };
  });
  // A lowered target may already be met: award it now.
  return checkChallengeNow();
}
export function checkChallengeNow(now = Date.now()) {
  const wk = R.weekKey(now);
  if (!S.challenge || S.challenge.doneWeek === wk || !R.challengeProgress(S, now).done) return false;
  mutate(s => {
    s.challenge.doneWeek = wk;
    s.challenge.doneBy = null;
    s.potBonus += s.challenge.bonus;
    s.events.push({ id: uid(), ts: now, kind: 'challenge', type: s.challenge.type, target: s.challenge.target, bonus: s.challenge.bonus });
    openShowdown(s, wk);
  });
  return true;
}

// ---------------------------------------------------------------- game layer
export function saveAvatar(pid, avatar) {
  mutate(s => { const p = s.players.find(x => x.id === pid); p.avatar = { ...avatar }; p.designed = true; });
}
export function clearNewItems(pid) {
  mutate(s => { s.players.find(x => x.id === pid).newItems = []; });
}
export function renamePlayer(pid, name) {
  const n = String(name).trim().slice(0, 20);
  if (n) mutate(s => { s.players.find(x => x.id === pid).name = n; });
}
export function recordMission(pid, missionId, score, now = Date.now()) {
  mutate(s => {
    const p = s.players.find(x => x.id === pid);
    const m = p.missions[missionId] || { best: 0, plays: 0 };
    m.best = Math.max(m.best, score);
    m.plays++;
    p.missions[missionId] = m;
    p.missionDay = R.dayKey(now);
    s.events.push({ id: uid(), ts: now, kind: 'mission', pid, missionId, score });
  });
}
export function recordPractice(pid, score, now = Date.now()) {
  mutate(s => {
    const p = s.players.find(x => x.id === pid);
    p.practiceFor = R.practiceSession(s, p, now) ?? R.dayKey(now); // which earned session this used
    p.practiceDay = R.dayKey(now);
    p.practiceBest = Math.max(p.practiceBest || 0, score);
  });
}
export function markChapterSeen(n) {
  mutate(s => { if (!s.storySeen.includes(n)) s.storySeen.push(n); });
}
export function setSetting(key, value) {
  if (!['lang', 'sound', 'gameName', 'crewName'].includes(key)) return;
  mutate(s => { s[key] = value; });
}

// Today's state for one player (used by the player page and rest screen).
export function today(p, now = Date.now()) {
  const day = R.dayKey(now);
  const pts = R.pointsOn(S, p.id, day);
  const goalMet = pts >= R.DAILY_GOAL;
  const missionDone = p.missionDay === day;
  const practiceDone = p.practiceDay === day;
  const windDown = R.windDownActive(S, now);
  const practiceAvail = R.practiceAvailable(S, p, now);
  // Today's own session is still unused (e.g. this morning's round was yesterday's carry-over).
  const todaysUnused = goalMet && (p.practiceFor ?? p.practiceDay) !== day;
  return {
    day, pts, goalMet, missionDone, practiceDone, windDown,
    practiceReady: practiceAvail && !windDown,
    practiceSaved: (practiceAvail && windDown) || (practiceDone && todaysUnused), // earned, kept for tomorrow
    resting: missionDone && (practiceDone || (practiceAvail && windDown)),
  };
}

// ---------------------------------------------------------------- v2 Arcade
function openShowdown(s, week) {
  s.showdown.openedWeek = week;
  s.showdown.opened = [...new Set([...(s.showdown.opened || []), week])].slice(-20);
}

/** Move tickets whose undo window has closed into the bank (capped). Internal: inside mutate. */
function settleIn(s, now) {
  for (const e of s.log) {
    if (!e.tk || e.tkDone) continue;
    if (e.undone) { e.tkDone = true; continue; }
    if (now - e.ts <= R.UNDO_WINDOW_MS) continue;
    const p = s.players.find(x => x.id === e.pid);
    if (p) p.tickets = (p.tickets || 0) + R.ticketsToBank(p.tickets || 0, e.tk);
    e.tkDone = true;
  }
}
/** Bank any tickets that are ready. Safe to call often (writes only when something lands). */
export function settleTickets(now = Date.now()) {
  if (!S) return;
  const due = S.log.some(e => e.tk && !e.tkDone && (e.undone || now - e.ts > R.UNDO_WINDOW_MS));
  if (due) mutate(s => settleIn(s, now));
}

/**
 * Start a round. Checks wind-down, the kids' daily cap and payment. Spends at most one ticket.
 * Paying leaves a "round credit" (paidRound) that finishRound() clears — if the round never
 * finishes (app closed, left in the first seconds), the next round is free instead.
 * opts: { kind, partnerId, adultConfirmed, payerId }.  Returns the gate decision.
 */
export function beginRound(pid, { kind = 'arcade', partnerId = null, adultConfirmed = false, payerId = null, game = null } = {}, now = Date.now()) {
  settleTickets(now);
  const p = player(pid);
  const partner = partnerId ? player(partnerId) : null;
  const payer = payerId ? player(payerId) : null;
  const gate = R.roundGate(S, p, { kind, partner, adultConfirmed, payer }, now);
  if (!gate.ok) return gate;
  const payerIdOut = gate.payer;
  const mark = { game, at: now };
  if (gate.pay === 'credit') mutate(s => { s.players.find(x => x.id === payerIdOut).paidRound = mark; });
  if (gate.pay === 'warmup') mutate(s => { const q = s.players.find(x => x.id === payerIdOut); q.warmupDay = R.dayKey(now); q.paidRound = mark; });
  if (gate.pay === 'ticket') mutate(s => { const q = s.players.find(x => x.id === payerIdOut); q.tickets -= 1; q.paidRound = mark; }, { ticketSpender: payerIdOut });
  return gate;
}

/** The round was played to its end screen: the payer's round credit is used up. */
export function finishRound(payerId) {
  if (!payerId) return;
  const p = player(payerId);
  if (p?.paidRound) mutate(s => { s.players.find(x => x.id === payerId).paidRound = null; });
}

/** Count active play time toward the daily cap. Call once per round (or on pause) — not per frame. */
export function addPlayTime(pids, seconds, now = Date.now()) {
  const secs = Math.max(0, Math.round(seconds));
  if (!secs) return;
  const day = R.dayKey(now);
  mutate(s => {
    for (const id of [].concat(pids)) {
      const p = s.players.find(x => x.id === id);
      if (!p) continue;
      if (!p.play || p.play.day !== day) p.play = { day, seconds: 0 };
      p.play.seconds += secs;
    }
  });
}

/**
 * Record a finished round under a progress key (e.g. 'dash', 'beat.groove', 'combo.<pairId>').
 * Returns { best, prevBest, newBest, firstRound, rank, improved, scores } for the end screen.
 */
export function recordRound(pid, key, score, now = Date.now()) {
  return mutate(s => {
    const p = s.players.find(x => x.id === pid);
    const g = p.games[key] || (p.games[key] = { rounds: [], best: 0, improvedAt: null });
    const sc = Math.max(0, Math.round(score));
    const prevBest = g.best || 0;
    g.rounds.push({ s: sc, t: now });
    if (g.rounds.length > R.ROUND_HISTORY) g.rounds = g.rounds.slice(-R.ROUND_HISTORY);
    g.best = Math.max(prevBest, sc);
    const scores = g.rounds.map(r => r.s);
    const sinceLast = g.improvedAt == null ? Infinity : g.rounds.filter(r => r.t > g.improvedAt).length;
    const improved = R.mostImproved(scores) && sinceLast >= 3;
    if (improved) {
      g.improvedAt = now;
      g.improvedCount = (g.improvedCount || 0) + 1;
      s.events.push({ id: uid(), ts: now, kind: 'improved', pid, game: key.split('.')[0] });
    }
    const rank = 1 + scores.filter(x => x > sc).length; // 1 = best of the kept rounds
    return { best: g.best, prevBest, newBest: sc > prevBest && prevBest > 0, firstRound: g.rounds.length === 1, rank, improved, scores: scores.slice(-7) };
  });
}

export function gameStats(p, key) {
  const g = p.games?.[key];
  return { best: g?.best || 0, scores: (g?.rounds || []).slice(-7).map(r => r.s), improvedCount: g?.improvedCount || 0, rounds: g?.rounds?.length || 0 };
}

/** Showdown: remember how far the player got this week (attempts resume from there) and the points banked so far. */
export function recordShowdownProgress(pid, seq, now = Date.now(), score = 0) {
  mutate(s => { s.players.find(x => x.id === pid).showdownProgress = { week: R.weekKey(now), seq, score: Math.max(0, Math.round(score) || 0) }; });
}
export function showdownStartSeq(p, now = Date.now()) {
  return p.showdownProgress?.week === R.weekKey(now) ? p.showdownProgress.seq : 0;
}

/** Showdown won: one per week; hands over the next rare closet item (then a trophy count). */
export function recordShowdownWin(pid, now = Date.now()) {
  return mutate(s => {
    const p = s.players.find(x => x.id === pid);
    p.showdownWeek = R.weekKey(now);
    // A win uses the OLDEST unused unlock, so a carried-over one is never lost to event order.
    const use = R.showdownPending(s, p)[0] || R.weekKey(now);
    p.showdownUsed = [...(p.showdownUsed || (p.showdownWonFor ? [p.showdownWonFor] : [])), use].slice(-20);
    p.showdownWonFor = use;
    p.showdownProgress = null;
    p.showdownWins = (p.showdownWins || 0) + 1;
    const item = RARE_ITEMS.find(i => !p.rareItems.includes(i.id)) || null;
    if (item) { p.rareItems.push(item.id); p.newItems.push(item.id); }
    s.events.push({ id: uid(), ts: now, kind: 'showdown', pid, item: item?.id || null });
    return item;
  });
}

export function setArcade(settings) {
  mutate(s => {
    const cap = Number(settings.capMin);
    if (R.CAP_OPTIONS.includes(cap)) s.arcade.capMin = cap;
    if (R.WIND_DOWN_OPTIONS.includes(settings.windDown)) s.arcade.windDown = settings.windDown;
  });
}

// Crew Wall stickers — positive only. One of each sticker per player per post, never on your own.
export const STICKERS = ['star', 'heart', 'clap', 'rocket', 'crown', 'music'];
export function addReaction(postId, reactorId, sticker, ownerId = null) {
  if (!STICKERS.includes(sticker) || !player(reactorId) || reactorId === ownerId) return false;
  const have = S.reactions[postId]?.[reactorId] || [];
  if (have.includes(sticker)) return false;
  mutate(s => {
    const post = s.reactions[postId] || (s.reactions[postId] = {});
    post[reactorId] = [...(post[reactorId] || []), sticker];
  });
  return true;
}

/** Home-stage order (display only). */
export function setCrewOrder(ids) {
  const valid = ids.filter(id => S.players.some(p => p.id === id));
  if (valid.length !== S.players.length || new Set(valid).size !== valid.length) return;
  mutate(s => { s.crewOrder = valid; });
}
export function crewInOrder() {
  if (!S.crewOrder) return S.players.slice();
  const byId = new Map(S.players.map(p => [p.id, p]));
  const out = S.crewOrder.map(id => byId.get(id)).filter(Boolean);
  S.players.forEach(p => { if (!out.includes(p)) out.push(p); });
  return out;
}

// ---------------------------------------------------------------- backup
export function exportJSON() {
  return JSON.stringify({ app: 'crew-game', exported: new Date().toISOString(), data: S }, null, 1);
}
export function importJSON(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('bad-json'); }
  const data = obj && obj.app === 'crew-game' ? obj.data : obj;
  const ok = data && Array.isArray(data.players) && data.players.length >= 1 && data.players.length <= 8
    && data.players.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.xp))
    && Array.isArray(data.log || []) && data.pin && data.pin.hash;
  if (!ok) throw new Error('bad-shape');
  // Restoring a backup never takes Play Tickets away: keep the higher count per player.
  const before = new Map((S?.players || []).map(p => [p.id, p.tickets || 0]));
  const next = migrate(data);
  for (const p of next.players) if (before.has(p.id)) p.tickets = Math.min(R.TICKET_CAP, Math.max(p.tickets, before.get(p.id)));
  S = next;
  persist();
  listeners.forEach(l => l());
  return S;
}
export function eraseAll() {
  removeKey(KEY);
  S = null;
}
