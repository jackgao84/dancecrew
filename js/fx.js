// Full-screen celebrations. They queue so nothing overlaps.
import { avatarSVG } from './avatar.js';
import { el, esc, icon, reducedMotion, TYPE_SHOUT, TYPE_COLOR, TYPE_ICON } from './ui.js';
import * as Sound from './sound.js';
import { MOVES } from './content.js';

let queue = Promise.resolve();
const enqueue = fn => (queue = queue.then(fn, fn));

export function confetti(n = 70) {
  if (reducedMotion()) return;
  const colors = ['#FFD23F', '#FF7AB6', '#5CC8FF', '#5EE0B0', '#9B6BFF', '#FF9F43'];
  const box = el('<div class="confetti" aria-hidden="true"></div>');
  let h = '';
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 100;
    h += `<i class="${i % 3 ? '' : 'round'}" style="left:${x}%;background:${colors[i % colors.length]};--dx:${(Math.random() - 0.5) * 240}px;--r:${(Math.random() * 900 - 450) | 0}deg;--d:${1.6 + Math.random() * 1.4}s;--delay:${Math.random() * 0.35}s"></i>`;
  }
  box.innerHTML = h;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3600);
}

function show(node, { auto = 0, onShow = null, buttonOnly = false } = {}) {
  return new Promise(resolve => {
    document.body.appendChild(node);
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      node.classList.add('leaving');
      setTimeout(() => { node.remove(); resolve(); }, 240);
    };
    const timer = auto ? setTimeout(close, auto) : null;
    // Ignore the tap that opened it.
    setTimeout(() => node.addEventListener('click', e => {
      if (buttonOnly && !e.target.closest('[data-close]')) return;
      Sound.tap();
      close();
    }), 350);
    onShow?.(close);
  });
}

const RECORD = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#2B2233" stroke="#3B2A4A" stroke-width="3"/>
<circle cx="50" cy="50" r="40" fill="none" stroke="#4a3d5c" stroke-width="1.5"/><circle cx="50" cy="50" r="33" fill="none" stroke="#4a3d5c" stroke-width="1.5"/><circle cx="50" cy="50" r="26" fill="none" stroke="#4a3d5c" stroke-width="1.5"/>
<path d="M20,30 A36,36 0 0 1 45,14" stroke="#fff" stroke-opacity=".35" stroke-width="4" fill="none" stroke-linecap="round"/>
<circle cx="50" cy="50" r="16" fill="#FF7AB6" stroke="#3B2A4A" stroke-width="2.5"/><circle cx="50" cy="50" r="3" fill="#2B2233"/></svg>`;

function ticketLine(entry, info) {
  const n = info.tickets ?? entry.tk ?? 0;
  // A real Rewind adds a City Dash run-back for the week — up to the weekly bonus cap.
  const charge = entry.type === 'rewind' && info.rewindsThisWeek != null && info.rewindsThisWeek <= info.rewindCap ? ' + a City Dash rewind' : '';
  if (info.bankFull || n === 0) return charge ? `Ticket bank full — go play!${charge.replace(' + a', ' You got a')}` : 'Ticket bank full — go play!';
  const t = `+${n} Arcade ticket${n === 1 ? '' : 's'}`;
  return info.windDown ? `${t}${charge} saved for tomorrow` : `${t}${charge} coming in a minute`;
}

/** Celebrate a logged point. Must be called synchronously from the tap for <300 ms feedback. */
export function celebratePoint(player, entry, unlockedMoves, info = null) {
  const rewind = entry.type === 'rewind';
  // Sound + confetti fire immediately, not queued.
  if (rewind) Sound.rewind(); else Sound.point(entry.type);
  const rm = reducedMotion();
  const moves = unlockedMoves.map(m => m.id);
  const move = rm ? '' : rewind ? 'mv-backspin' : 'mv-' + (moves[Math.floor(Math.random() * moves.length)] || 'bounce');
  const bg = { firstAsk: 'var(--sky)', words: 'var(--mint)', kind: 'var(--pink)', rewind: 'var(--grape)' }[entry.type];
  const node = el(`<div class="celebrate ${rewind ? 'rewind' : ''}" style="--bgc:${bg}" role="alert">
    <div class="rays"></div>
    <div class="cel-who outline-text">${esc(player.name)}</div>
    <div class="stage">
      ${rewind ? `<div class="record">${RECORD}</div><div class="x2">x2</div>` : ''}
      ${avatarSVG(player.avatar, { expr: rewind ? 'proud' : 'grin', cls: move })}
    </div>
    <div class="label big-title">${icon(TYPE_ICON[entry.type], null, 'shout-ic')} ${TYPE_SHOUT[entry.type]}</div>
    <div class="gain"><span class="tag">${icon('bolt')} +${entry.xp} XP</span><span class="tag">${icon('star')} +${entry.stars}</span></div>
    ${entry.note ? `<div class="note">“${esc(entry.note)}”</div>` : ''}
    ${rewind ? '<div class="cel-who">Owned it. Replayed it. Double points!</div>' : ''}
    ${info ? `<div class="ticket-line">${icon('star', '#FFD23F')} ${esc(ticketLine(entry, info))}</div>` : ''}
    <div class="tap-hint">Tap to keep going</div>
  </div>`);
  confetti(rewind ? 110 : 70);
  return enqueue(() => show(node, { auto: rewind ? 3600 : 2600 }));
}

function unlockCard(u, player) {
  if (u.kind === 'item') {
    const pv = { ...player.avatar, [u.item.slot]: u.item.id };
    return `<div class="card-reveal"><div class="flip"><div class="back">?</div><div class="front">
      <div class="pv">${avatarSVG(pv, { expr: 'grin' })}</div><h3>${esc(u.item.name)}</h3><p class="small">${esc(u.item.blurb || '')}</p></div></div></div>`;
  }
  if (u.kind === 'move') {
    return `<div class="card-reveal"><div class="flip"><div class="back">?</div><div class="front">
      <div class="pv allow-motion">${avatarSVG(player.avatar, { expr: 'grin', cls: 'mv-' + u.move.id })}</div><h3>New move: ${esc(u.move.name)}</h3><p class="small">${esc(u.move.blurb)}</p></div></div></div>`;
  }
  return `<div class="card-reveal"><div class="flip"><div class="back">?</div><div class="front">
    <div class="swatch-big" style="background:${u.color.color}"></div><h3>New colour: ${esc(u.color.name)}</h3><p class="small">For outfits and sneakers.</p></div></div></div>`;
}

export function celebrateLevelUp(player, level, unlocks) {
  return enqueue(() => {
    Sound.levelUp();
    confetti(120);
    const node = el(`<div class="celebrate levelup" style="--bgc:var(--yellow)" role="alert">
      <div class="rays"></div>
      <div class="label big-title">LEVEL UP!</div>
      <div class="cel-who">${esc(player.name)} reached <span class="tag lv-tag">Level ${level}</span></div>
      <div class="reveal-row">${unlocks.map(u => unlockCard(u, player)).join('')}</div>
      <button class="btn huge pink" data-close>Awesome!</button>
    </div>`);
    setTimeout(() => Sound.unlockSfx(), 1300);
    return show(node, { buttonOnly: true });
  });
}

export function celebrateChapter(n, title) {
  return enqueue(() => {
    Sound.chime();
    confetti(50);
    const node = el(`<div class="celebrate" style="--bgc:var(--sky)" role="alert">
      <div class="rays"></div>
      <div class="big-ic pop-in">${icon('book')}</div>
      <div class="label big-title">NEW CHAPTER!</div>
      <div class="cel-who">Chapter ${n}: ${esc(title)}</div>
      <p class="cel-who small-who">The whole crew's XP unlocked it together.</p>
      <div class="tap-hint">Find it in Story</div>
    </div>`);
    return show(node, { auto: 3800 });
  });
}

export function celebrateReward(player, reward) {
  return enqueue(() => {
    Sound.star();
    setTimeout(() => Sound.sparkle(), 200);
    confetti(80);
    const node = el(`<div class="celebrate" style="--bgc:var(--mint)" role="alert">
      <div class="rays"></div>
      <div class="big-emoji pop-in">${esc(reward.icon)}</div>
      <div class="label big-title">CASHED IN!</div>
      <div class="cel-who">${esc(player.name)}: ${esc(reward.name)}</div>
      <div class="note">Enjoy it — you earned it!</div>
      <div class="tap-hint">Tap to continue</div>
    </div>`);
    return show(node, { auto: 4000 });
  });
}

/** Whole-crew performance on stage. Used for weekly challenge wins and the season finale. */
export function showcase(players, { title = 'CREW CHALLENGE COMPLETE!', sub = '', bars = 5 } = {}) {
  return enqueue(() => new Promise(resolve => {
    Sound.unlock();
    const beat = Sound.startBeat({ bpm: 96, bars, groove: 1, countIn: 0, melody: true });
    const rm = reducedMotion();
    const moves = ['bounce', 'wave', 'pop', 'kick', 'robot', 'glide', 'spin'];
    const dancers = players.map((p, i) => `<div class="dancer" style="--i:${i}">${avatarSVG(p.avatar, { expr: 'grin', cls: rm ? '' : 'mv-' + moves[i % moves.length] })}<span>${esc(p.name)}</span></div>`).join('');
    const node = el(`<div class="celebrate showcase" style="--bgc:#2B2045" role="alert">
      <div class="spot s1"></div><div class="spot s2"></div><div class="spot s3"></div>
      <div class="label big-title">${esc(title)}</div>
      ${sub ? `<div class="gain"><span class="tag">${sub}</span></div>` : ''}
      <div class="dance-floor">${dancers}</div>
      <button class="btn huge" data-close>Take a bow!</button>
    </div>`);
    confetti(140);
    let ms = (beat.end - Sound.now()) * 1000;
    if (!Sound.hasAudio()) ms = 9000;
    // Everyone switches to a Star Freeze for the finale.
    const finale = setTimeout(() => {
      if (!rm) node.querySelectorAll('.dancer .av').forEach(a => { a.setAttribute('class', 'av mv-freeze'); });
      confetti(80);
    }, Math.max(0, ms - 2200));
    show(node, { auto: ms + 1200 }).then(() => { clearTimeout(finale); beat.stop(); resolve(); });
  }));
}
