// The Arcade: one player's tickets, today's game time and the games they can play.
// Only this player's numbers are shown — never anyone else's.
import * as State from '../state.js';
import * as R from '../rules.js';
import { avatarSVG } from '../avatar.js';
import { el, esc, icon, actions, go, modal } from '../ui.js';
import { readyGames } from '../games/registry.js';
import { sparkline, improvedBadge } from '../games/progress.js';
import { reasonCard, progressKey } from '../games/shell.js';

function ticketBank(p) {
  const pending = R.pendingTickets(State.get(), p.id);
  const slots = Array.from({ length: R.TICKET_CAP }, (_, i) => `<i class="${i < p.tickets ? 'on' : i < p.tickets + pending ? 'incoming' : ''}"></i>`).join('');
  return `<div class="ticket-bank" aria-label="${p.tickets} tickets">
    <span class="tb-slots">${slots}</span>
    <b>${p.tickets}</b><small>ticket${p.tickets === 1 ? '' : 's'}${pending ? ` · +${pending} incoming` : ''}${p.tickets >= R.TICKET_CAP ? ' · bank full — go play!' : ''}</small>
  </div>`;
}

/** The most recently played progress key for a game (a tier or a co-op pair). */
function lastKey(p, game) {
  const keys = Object.keys(p.games || {}).filter(k => k === game.id || k.startsWith(game.id + '.'));
  if (!keys.length) return progressKey(game, game.tiers ? (game.defaultTier?.(p) || game.tiers[0].id) : null, p, null);
  return keys.sort((a, b) => (p.games[b].rounds.at(-1)?.t || 0) - (p.games[a].rounds.at(-1)?.t || 0))[0];
}

export default function arcade(root, pid) {
  State.settleTickets();
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const s = State.get();
  const wind = R.windDownActive(s);
  const gateNow = R.roundGate(s, p, {});
  const kid = !R.isAdult(p);
  const left = Math.floor(R.playSecondsLeft(s, p) / 60);
  const day = R.dayKey();
  const games = readyGames();

  const capped = kid && gateNow.reason === 'cap';
  const chips = wind || capped ? '' : [
    p.paidRound ? `<span class="tag saved">${icon('gift')} A round is saved for you</span>` : '',
    p.warmupDay !== day ? `<span class="tag warm">${icon('sparkle')} Free warm-up ready!</span>` : '',
    kid ? `<span class="tag">${icon('clock')} ${left} min of games left today</span>` : '',
  ].join('');

  let body;
  if (wind) body = reasonCard('windDown', { extra: navRow(p) });
  else if (kid && gateNow.reason === 'cap') body = reasonCard('cap', { extra: navRow(p) });
  else if (!games.length) body = `<div class="panel white center empty">${icon('boombox')}<h2>New games are on the way!</h2><p>Keep earning tickets — they'll be waiting.</p></div>`;
  else {
    body = `<div class="arcade-grid">${games.map(g => card(g, p, s)).join('')}</div>`;
  }

  const screen = el(`<main class="screen arcade">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>Arcade</h1><div class="sub">${esc(p.name)}’s games</div></div>
      <span class="av-chip">${avatarSVG(p.avatar, { crop: 'head' })}</span>
    </header>
    <section class="arcade-status panel sky-l">${ticketBank(p)}<div class="chips">${chips}</div></section>
    ${body}
    <p class="muted center small">${icon('star')} Every real-life point = 1 ticket. A Rewind = 2 tickets + a City Dash rewind!
      · <button class="linkish" data-act="tune">Tune the beat</button></p>
  </main>`);
  root.appendChild(screen);

  return actions(screen, {
    back: () => go('#/player/' + p.id),
    tune: () => go('#/calibrate/' + encodeURIComponent('/arcade/' + p.id)),
    nav: b => go(b.dataset.to),
    play: b => go(`#/play/${b.dataset.game}/${p.id}`),
    showdownLocked: b => { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); },
    partner: () => pickPartner(p),
  });
}

function navRow(p) {
  return `<div class="row center-row"><button class="btn small sky" data-act="nav" data-to="#/story">${icon('book')} Story</button>
    <button class="btn small pink" data-act="nav" data-to="#/closet/${p.id}">${icon('shirt')} Closet</button>
    <button class="btn small mint" data-act="nav" data-to="#/wall">${icon('wall')} Crew Wall</button></div>`;
}

function card(g, p, s) {
  const key = lastKey(p, g);
  const st = State.gameStats(p, key);
  const stats = st.rounds
    ? `<div class="gc-stats"><span class="gc-best">${icon('trophy')} Best ${st.best.toLocaleString()}</span>${sparkline(st.scores, { best: st.best })}${improvedBadge(st.improvedCount)}</div>`
    : `<div class="gc-stats"><span class="gc-best new">${icon('sparkle')} New game!</span></div>`;
  if (g.kind === 'showdown') {
    const status = R.showdownStatus(s, p);
    if (status !== 'open') {
      const prog = R.challengeProgress(s);
      const text = status === 'done' ? 'Beaten this week! Finish another Crew Challenge for a rematch.'
        : `Finish the Crew Challenge together to call out the Neon Owls! (${prog.count} of ${prog.target})`;
      return `<button class="game-card ${g.color} waiting" data-act="showdownLocked">
        <span class="gc-ic">${icon(g.icon)}</span><span class="gc-text"><b>${esc(g.title)}</b><small>${esc(text)}</small></span>
        ${status === 'done' ? '' : `<span class="meter gc-meter" style="--p:${Math.min(1, prog.count / Math.max(1, prog.target))};--fill:var(--pink)"><i></i></span>`}
        ${stats}</button>`;
    }
  }
  const act = g.kind === 'coop' ? 'partner' : 'play';
  return `<button class="game-card ${g.color}" data-act="${act}" data-game="${g.id}">
    <span class="gc-ic">${icon(g.icon)}</span><span class="gc-text"><b>${esc(g.title)}</b><small>${esc(g.blurb)}</small></span>
    ${g.kind === 'showdown' ? '<span class="tag new">OPEN!</span>' : ''}
    ${stats}</button>`;
}

function pickPartner(p) {
  const others = State.crewInOrder().filter(x => x.id !== p.id);
  const m = modal(`<h2>Who's playing with ${esc(p.name)}?</h2>
    <div class="partner-grid">${others.map(o => `<button class="who" data-id="${o.id}"><span class="who-av">${avatarSVG(o.avatar, { crop: 'head' })}</span><b>${esc(o.name)}</b></button>`).join('')}</div>
    <p class="muted small center">Free with a grown-up (they confirm with the PIN).</p>
    <div class="row center-row"><button class="btn white" data-a="cancel">Not now</button></div>`);
  m.el.addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) { m.close(); go(`#/play/combo/${p.id}/${b.dataset.id}`); }
    if (e.target.closest('[data-a=cancel]')) m.close();
  });
}
