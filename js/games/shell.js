// The round shell every Arcade game runs inside.
//
// intro card (one line + Start) → pay (credit / warm-up / ticket / free) → game runs →
// positive end screen (best moment, personal-best framing, last-7 chart, one crew line).
// Pauses when the app is hidden, never loses a paid round (round credit), and exposes
// window.__game for headless tests.
//
// ── Game module contract (js/games/<id>.js) ─────────────────────────────────────────────
//   export default {
//     id, title, blurb (≤ 1 line), icon, color, kind: 'arcade'|'coop'|'showdown',
//     ready: true,                  // false keeps it off the Arcade (placeholder)
//     rhythm?: true,                // offers calibration on first run
//     tiers?: [{ id, label }], defaultTier?(player),
//     create(host, ctx) → { start(), pause(), resume(), destroy(),
//                            finish?(),   // end early now → must call ctx.end(result)
//                            hint?(), autoplay?() }   // tests
//   }
//   ctx = { player, partner, kind, tier, seed, rng, speed, reducedMotion, clock, ghost,
//           sound, state, adapt(opts), hud: { score(n), time(frac), label(text) }, end(result) }
//   result = { score, best, crew: { rewinds, chills, timeouts, spots, syncs }, title?, extra?, names?,
//              noRecord? }   // noRecord: don't add to personal charts (e.g. Showdown progress)
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import * as FX from '../fx.js';
import { avatarSVG } from '../avatar.js';
import { content } from '../data.js';
import { el, esc, icon, actions, reducedMotion } from '../ui.js';
import { requirePin } from '../screens/pin.js';
import { createClock, SPEED, rng as seeded } from './engine.js';
import { createAdapt } from './adapt.js';
import { createGhost } from './ghost.js';
import { isCalibrated } from './calibration.js';
import { sparkline, improvedBadge } from './progress.js';

const PAY_LABEL = {
  credit: 'Free — you still had a round saved',
  warmup: 'Free warm-up round!',
  ticket: 'Uses 1 ticket',
  adult: 'Free crew round with a grown-up',
  free: 'Free round',
};
const LEAVE_FREE_SECS = 20;
// A grown-up's PIN makes co-op free for this pair for 30 minutes.
const confirmed = new Map();
const pairKey = (a, b) => [a, b].sort().join('+');

const SEED = (() => { try { const v = Number(new URLSearchParams(location.search).get('seed')); return v > 0 ? v : 0; } catch { return 0; } })();

export function reasonCard(reason, { back, backLabel = 'Back', extra = '' } = {}) {
  const r = content.arcade?.reasons?.[reason] || { title: 'Not right now', text: '' };
  const ic = reason === 'windDown' ? 'moon' : reason === 'cap' ? 'clock' : reason === 'tickets' ? 'star' : 'lock';
  return `<div class="reason-card panel white pop-in" data-reason="${esc(reason)}">
    <span class="reason-ic">${icon(ic)}</span>
    <h2>${esc(r.title)}</h2><p>${esc(r.text)}</p>${extra}
    ${back ? `<button class="btn pink" data-act="${back}">${icon('back')} ${esc(backLabel)}</button>` : ''}
  </div>`;
}

/** Progress key: per game, per difficulty tier, per co-op pair. */
export function progressKey(game, tier, player, partner) {
  if (partner) return `${game.id}.${pairKey(player.id, partner.id)}`;
  return tier ? `${game.id}.${tier}` : game.id;
}

function pickLine(result, player, partner, rec, captain = null) {
  const L = content.arcade?.lines || {};
  const c = result.crew || {};
  let group = 'default', n = 0;
  if (partner) { group = 'coop'; n = c.syncs || 0; }
  else if ((c.rewinds || 0) > 1) { group = 'rewinds'; n = c.rewinds; }
  else if ((c.rewinds || 0) === 1) { group = 'rewind1'; n = 1; }
  else if ((c.chills || 0) > 0) { group = 'chills'; n = c.chills; }
  else if ((c.timeouts || 0) > 0) { group = 'timeouts'; n = c.timeouts; }
  else if ((c.spots || 0) > 0) { group = 'spots'; n = c.spots; }
  else if (result.showdown) group = 'showdown';
  else if (rec?.newBest) group = 'newBest';
  else if (rec?.improved) group = 'improved';
  let list = L[group]?.length ? L[group] : (L.default || ['Crew’s got you, {me}.']);
  // Never print a count that's too small to celebrate ("0 in sync!").
  if (n < 2 && list.some(x => !x.includes('{n}'))) list = list.filter(x => !x.includes('{n}'));
  const line = list[Math.floor(Math.random() * list.length)];
  return line.replaceAll('{n}', n).replaceAll('{me}', player.name).replaceAll('{a}', player.name)
    .replaceAll('{b}', partner?.name || '').replaceAll('{captain}', captain?.name || '');
}

function pickCaptain(player, partner) {
  const others = State.get().players.filter(p => p.id !== player.id && p.id !== partner?.id);
  return others[Math.floor(Math.random() * others.length)] || player;
}

/** Positive framing of a round against the player's own past (never other players). */
function bestText(rec, score) {
  if (!rec) return '';
  if (rec.firstRound) return 'First round — that’s your best to beat!';
  if (rec.newBest) return `New best! (was ${rec.prevBest.toLocaleString()})`;
  if (score === rec.best) return 'Matched your best!';
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  if (rec.rank <= 3 && rec.scores.length >= 3) return `Your ${ord(rec.rank)} best round!`;
  const gap = rec.best - score;
  if (gap <= Math.max(50, rec.best * 0.2)) return `Just ${gap.toLocaleString()} away from your best!`;
  return `Your best: ${rec.best.toLocaleString()}`;
}

/**
 * Run one round in `root`.
 * opts: { game, player, partner, kind, onExit(), onDone(result, rec), introLine }
 */
export function runRound(root, opts) {
  const { game, onExit, onDone = null, introLine = null } = opts;
  const player = State.player(opts.player.id);
  const partner = opts.partner ? State.player(opts.partner.id) : null;
  const kind = opts.kind || game.kind || 'arcade';
  const rm = reducedMotion();
  let tier = game.tiers ? (opts.tier || game.defaultTier?.(player) || game.tiers[0].id) : null;
  let payerId = null;

  const screen = el(`<main class="screen game-screen" data-game="${esc(game.id)}">
    <header class="game-hud">
      <button class="icon-btn" data-act="leave" aria-label="Pause">${icon('pause')}</button>
      <div class="hud-title"><b>${esc(game.title)}</b><small class="hud-label">${esc(partner ? `${player.name} + ${partner.name}` : player.name)}</small></div>
      <div class="hud-timer" aria-hidden="true"><i></i></div>
      <span class="score-pill">${icon('star')}<b class="hud-score">0</b></span>
    </header>
    <div class="game-host"></div>
    <div class="game-overlay"></div>
  </main>`);
  root.appendChild(screen);
  const host = screen.querySelector('.game-host');
  const overlay = screen.querySelector('.game-overlay');
  const scoreEl = screen.querySelector('.hud-score');
  const timerEl = screen.querySelector('.hud-timer i');
  const labelEl = screen.querySelector('.hud-label');

  let inst = null, clock = null, ghost = null, phase = 'intro', activeSecs = 0, committedSecs = 0, lastTick = 0, ended = false, score = 0, gate = null, lastResult = null;
  const players = partner ? [player.id, partner.id] : [player.id];

  const test = window.__game = {
    id: game.id,
    get phase() { return phase; },
    get score() { return score; },
    get result() { return lastResult; },
    hint: () => (phase === 'playing' ? inst?.hint?.() ?? null : null),
    autoplay: () => (phase === 'playing' ? inst?.autoplay?.() : false),
    speed: SPEED,
  };

  const tickActive = () => { const t = performance.now(); if (phase === 'playing' && lastTick) activeSecs += (t - lastTick) / 1000; lastTick = t; };
  const activeTimer = setInterval(tickActive, 500);
  const commitTime = () => { tickActive(); const d = activeSecs - committedSecs; if (d >= 1) { if (kind !== 'practice') State.addPlayTime(players, d); committedSecs += Math.round(d); } }; // v1 Practice ignores the cap

  function show(html) { overlay.innerHTML = html; overlay.hidden = !html; }

  function preview() {
    const adultConfirmed = partner && confirmed.get(pairKey(player.id, partner.id)) > Date.now();
    return R.roundGate(State.get(), player, { kind, partner, adultConfirmed, payer: payerId ? State.player(payerId) : null });
  }

  function intro() {
    phase = 'intro';
    const g = preview();
    if (!g.ok) { phase = 'blocked'; show(reasonCard(g.reason, { back: 'quit', extra: capExtra(g.reason) })); return; }
    const hasAdult = partner && (R.isAdult(player) || R.isAdult(partner));
    const kids = partner ? [player, partner].filter(p => !R.isAdult(p)) : [];
    const cost = kind === 'practice' ? 'Practice session — free today' : PAY_LABEL[g.pay] + (g.payer && partner && g.pay !== 'adult' ? ` (${State.player(g.payer).name})` : '');
    show(`<div class="intro-card panel white pop-in">
      <span class="intro-ic ${esc(game.color || 'yellow')}">${icon(game.icon || 'star')}</span>
      <h2>${esc(game.title)}</h2>
      <p class="intro-line">${esc(introLine || game.blurb)}</p>
      ${game.tiers ? `<div class="chips tiers" role="radiogroup" aria-label="Level">${game.tiers.map(t => `<button class="chip ${t.id === tier ? 'on' : ''}" data-act="tier" data-tier="${esc(t.id)}" role="radio" aria-checked="${t.id === tier}">${esc(t.label)}</button>`).join('')}</div>` : ''}
      <p class="cost-line">${icon(g.pay === 'ticket' ? 'star' : 'gift')} ${esc(cost)}</p>
      ${hasAdult && g.pay !== 'adult' ? `<button class="btn small mint" data-act="adult">${icon('lock')} Grown-up playing? Free with PIN</button>` : ''}
      ${!hasAdult && kids.length === 2 && g.pay !== 'credit' ? `<div class="chips payer">${kids.map(k => `<button class="chip ${g.payer === k.id ? 'on' : ''}" data-act="payer" data-id="${k.id}">${esc(k.name)} covers it</button>`).join('')}</div>` : ''}
      ${game.rhythm && !isCalibrated() ? `<div class="tune-step"><p><b>First time on this iPad?</b> Tune the beat — 10 seconds.</p><button class="btn mint" data-act="calibrate">${icon('note')} Tune the beat</button></div>` : ''}
      <button class="btn huge pink" data-act="start">${icon('play')} Let's go!</button>
    </div>`);
  }

  function capExtra(reason) {
    if (reason !== 'cap' && reason !== 'windDown') return '';
    return `<div class="row center-row"><button class="btn small sky" data-act="nav" data-to="#/story">${icon('book')} Story</button>
      <button class="btn small pink" data-act="nav" data-to="#/closet/${player.id}">${icon('shirt')} Closet</button>
      <button class="btn small mint" data-act="nav" data-to="#/wall">${icon('wall')} Crew Wall</button></div>`;
  }

  async function start() {
    if (phase !== 'intro') return;
    phase = 'starting';
    Sound.unlock();
    const adultConfirmed = partner && confirmed.get(pairKey(player.id, partner.id)) > Date.now();
    gate = State.beginRound(player.id, { kind, partnerId: partner?.id, adultConfirmed, payerId, game: game.id });
    if (!gate.ok) { phase = 'blocked'; show(reasonCard(gate.reason, { back: 'quit', extra: capExtra(gate.reason) })); return; }
    show('');
    // Rhythm games need the audio clock: give iPad a moment to wake the AudioContext.
    if (game.rhythm) await Sound.whenRunning(400);
    if (phase !== 'starting') return; // left while waiting
    clock = createClock();
    ghost = createGhost(host);
    const seed = SEED || (Date.now() % 100000) + 1;
    const ctx = {
      player, partner, kind, tier, seed, rng: seeded(seed), speed: SPEED, reducedMotion: rm,
      clock, adapt: o => createAdapt(o), ghost, sound: Sound, state: State,
      hud: {
        score(n) { score = Math.max(0, Math.round(n)); scoreEl.textContent = score.toLocaleString(); },
        time(frac) { timerEl.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`; },
        label(text) { labelEl.textContent = text; },
      },
      end: result => finish(result),
    };
    phase = 'playing';
    lastTick = performance.now();
    inst = game.create(host, ctx);
    inst.start?.();
  }

  function pause(reason = 'user') {
    if (phase !== 'playing') return;
    commitTime();
    phase = 'paused';
    clock?.pause();
    inst?.pause?.();
    const early = activeSecs < LEAVE_FREE_SECS;
    show(`<div class="intro-card panel white pop-in" data-paused="${reason}"><span class="intro-ic sky">${icon('pause')}</span><h2>${reason === 'hidden' ? 'Welcome back!' : 'Take five'}</h2>
      <div class="row center-row">
        ${early ? `<button class="btn white" data-act="quit">${icon('home')} Leave (round saved)</button>`
          : inst?.finish ? `<button class="btn white" data-act="finishNow">${icon('check')} Finish now</button>` : `<button class="btn white" data-act="quit">${icon('home')} Leave</button>`}
        <button class="btn huge pink" data-act="resume">${icon('play')} Keep going</button></div></div>`);
  }
  function resume() {
    if (phase !== 'paused') return;
    Sound.unlock();
    show('');
    clock?.resume();
    phase = 'playing';
    lastTick = performance.now();
    inst?.resume?.();
  }

  function finish(result) {
    if (ended) return;
    ended = true;
    commitTime();
    phase = 'ended';
    lastResult = result;
    try { inst?.pause?.(); } catch { /* ignore */ }
    ghost?.hide();
    const finalScore = Math.max(0, Math.round(result.score || 0));
    score = finalScore;
    scoreEl.textContent = finalScore.toLocaleString();
    if (gate?.payer && gate.pay !== 'free') State.finishRound(gate.payer); // a free practice round never uses up a saved credit
    if (kind === 'practice') State.recordPractice(player.id, finalScore);
    const key = progressKey(game, tier, player, partner);
    let rec = null;
    if (!result.noRecord) {
      rec = State.recordRound(player.id, key, finalScore);
      if (partner) State.recordRound(partner.id, key, finalScore);
    }
    onDone?.(result, rec);
    const stats = State.gameStats(State.player(player.id), key);
    const captain = pickCaptain(player, partner);
    const line = result.crewLine || pickLine(result, player, partner, rec, captain);
    Sound.levelUp();
    if (!rm) FX.confetti(rec?.newBest ? 120 : 60);
    const td = State.today(State.player(player.id));
    const again = kind !== 'practice' && preview().ok;
    const title = result.title || (partner ? `${player.name} + ${partner.name}: crew's got you!` : 'Round complete!');
    show(`<div class="end-card panel yellow pop-in" role="dialog" aria-label="Round complete">
      <h2 class="end-title">${esc(title)}</h2>
      <div class="end-score"><span class="big">${finalScore.toLocaleString()}</span>${rec ? `<span class="pb ${rec.newBest ? 'new' : ''}">${esc(bestText(rec, finalScore))}</span>` : ''}</div>
      ${result.best ? `<p class="best-moment">${icon('sparkle')} <b>Best moment:</b> ${esc(result.best)}</p>` : ''}
      ${result.extra || ''}
      ${rec ? `<div class="end-progress">${sparkline(stats.scores, { best: stats.best })}${rec.improved ? improvedBadge(1) : ''}</div>` : ''}
      <div class="crew-say"><span class="cl-av">${avatarSVG(captain.avatar, { crop: 'head', expr: 'grin' })}</span><p><b>${esc(captain.name)}:</b> “${esc(line)}”</p></div>
      <div class="row center-row">
        <button class="btn white" data-act="quit">${icon('back')} ${kind === 'practice' ? (td.resting ? 'Done for today' : 'Done') : 'Arcade'}</button>
        ${again ? `<button class="btn pink" data-act="again">${icon('play')} Play again</button>` : ''}
      </div>
    </div>`);
  }

  function quit() {
    if (phase === 'paused' || phase === 'playing') commitTime();
    phase = 'left';
    onExit?.();
  }

  const onHide = () => { if (document.hidden) pause('hidden'); };
  const onPageHide = () => { if (phase === 'playing' || phase === 'paused') commitTime(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);

  const off = actions(screen, {
    leave: () => (phase === 'playing' ? pause() : phase === 'paused' ? resume() : quit()),
    quit: () => quit(),
    resume: () => resume(),
    start: () => start(),
    finishNow: () => { show(''); phase = 'playing'; clock?.resume(); inst?.finish?.(); },
    nav: b => { quit(); location.hash = b.dataset.to; },
    tier: b => { tier = b.dataset.tier; intro(); },
    payer: b => { payerId = b.dataset.id; intro(); },
    calibrate: () => { const back = location.hash.slice(1); quit(); location.hash = `#/calibrate/${encodeURIComponent(back)}`; },
    adult: async () => {
      const ok = await requirePin({ fresh: true, once: true });
      if (ok) { confirmed.set(pairKey(player.id, partner.id), Date.now() + 30 * 60_000); intro(); }
    },
    again: () => { cleanup(); next = runRound(root, { ...opts, tier }); },
  });

  function cleanup() {
    off();
    clearInterval(activeTimer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    try { inst?.destroy?.(); } catch (e) { console.warn(e); }
    ghost?.destroy();
    if (window.__game === test) window.__game = null;
    screen.remove();
  }

  intro();
  // "Play again" replaces this round with a new one: the router's teardown must reach whichever
  // round is current, so every game's destroy() runs.
  let next = null;
  const teardown = () => { if (phase === 'playing' || phase === 'paused') commitTime(); cleanup(); };
  return () => (next ? next() : teardown());
}
