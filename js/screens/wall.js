// Crew Wall: only good moments, from everyone (grown-ups' rewinds included).
// v2: anyone can react to a post with a positive sticker — "Who's reacting?" → pick a sticker.
// One of each sticker per player per post, never on your own post. Reactors' mini-avatars show
// with their stickers instead of counts. Showdown wins and "Most improved" are milestones — no scores.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import { avatarSVG } from '../avatar.js';
import { content } from '../data.js';
import { RARE_ITEMS, RIVAL_CREW } from '../content.js';
import { gameById } from '../games/registry.js';
import { el, esc, icon, actions, go, modal, timeAgo, reducedMotion, INK, TYPE_ICON, TYPE_COLOR, TYPE_SHOUT, TYPE_NAME } from '../ui.js';

const SCORE_WORDS = ['', 'Nice groove', 'Smooth moves', 'Rewind Legend'];

export function challengeText(c) {
  if (!c) return '';
  const what = c.type === 'any' ? 'points' : (TYPE_NAME[c.type] + (c.target === 1 ? '' : 's'));
  return `${c.target} ${what} as a crew`;
}

// ------------------------------------------------------------------ stickers (original SVG art)
// Die-cut sticker look: ink outline, then a white border, then the colour — like the v1 icons.
const cut = (shapes, fill) => `<g fill="${INK}" stroke="${INK}" stroke-width="12" stroke-linejoin="round">${shapes}</g>`
  + `<g fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round">${shapes}</g>`
  + (fill ? `<g fill="${fill}">${shapes}</g>` : '');
const ln = (d, color = INK, w = 3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
function starPts(cx, cy, r, inner = 0.5, n = 5) {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
}
// One open hand (3 fingers + thumb), upright around (0, 0); two of them lean in to clap.
const PALM = 'M-9,15 L-9,-6 Q-9,-10 -6,-10 Q-3,-10 -3,-7 Q-3,-14 0,-14 Q3,-14 3,-7 Q3,-11 6,-11 Q9,-11 9,-7 L9,15 Q9,20 0,20 Q-9,20 -9,15 Z';
const THUMB = '<rect x="-15" y="1" width="9" height="14" rx="4.5" transform="rotate(-28 -10 8)"/>';
const at = (tx, rot, flip, inner) => `<g transform="translate(${tx} 27) rotate(${rot}) scale(${flip ? -0.8 : 0.8} 0.8)">${inner}</g>`;
const handShape = `${THUMB}<path d="${PALM}"/>`;
const hand = (tx, rot, flip) => at(tx, rot, flip, `<g fill="#FFD0A6" stroke="${INK}" stroke-width="3" stroke-linejoin="round">${THUMB}<path d="${PALM}"/></g>`
  + `<path d="M-3,-7 L-3,-1 M3,-7 L3,-1" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".45"/>`);
const HANDS = at(17, 14, false, handShape) + at(31, -14, true, handShape);
const ROCKET_BODY = '<path d="M0,-17 C8,-9 9,1 7,10 L-7,10 C-9,1 -8,-9 0,-17 Z"/><path d="M-7,1 L-14,12 L-7,10 Z"/><path d="M7,1 L14,12 L7,10 Z"/><path d="M-5,10 Q0,22 5,10 Z"/>';

export const STICKER_ART = {
  star: () => cut(`<polygon points="${starPts(24, 25, 17)}"/>`, '#FFD23F')
    + ln('M16,20 L19,17', '#fff', 3.5) + `<circle cx="30" cy="27" r="2" fill="${INK}"/><circle cx="19" cy="27" r="2" fill="${INK}"/>` + ln('M21,31 Q24.5,34 28,31', INK, 2.5),
  heart: () => cut('<path d="M24,40 C12,32 7,25 7,18 C7,12 11,8 16.5,8 C20,8 22.5,10 24,13 C25.5,10 28,8 31.5,8 C37,8 41,12 41,18 C41,25 36,32 24,40 Z"/>', '#FF7AB6')
    + ln('M12,17 Q13,13 17,12.5', '#fff', 3.5),
  clap: () => cut(HANDS, '') + hand(17, 14, false) + hand(31, -14, true)
    + ln('M9,11 L12,14 M24,4 L24,8 M39,11 L36,14', INK, 3.5),
  rocket: () => `<g transform="translate(23 23) rotate(40) scale(.92)">${cut(ROCKET_BODY, '')}`
    + `<path d="M0,-17 C8,-9 9,1 7,10 L-7,10 C-9,1 -8,-9 0,-17 Z" fill="#FF7AB6"/><path d="M-7,1 L-14,12 L-7,10 Z M7,1 L14,12 L7,10 Z" fill="#5CC8FF"/>`
    + `<path d="M-5,10 Q0,22 5,10 Z" fill="#FFD23F"/><circle cx="0" cy="-3" r="4.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/></g>`,
  crown: () => cut('<path d="M9,37 L7,15 L17,24 L24,10 L31,24 L41,15 L39,37 Z"/>', '#FFD23F')
    + ln('M10,31 L38,31', INK, 2.5)
    + `<circle cx="24" cy="25" r="3.5" fill="#FF7AB6" stroke="${INK}" stroke-width="2.5"/><circle cx="15" cy="34" r="2" fill="#5CC8FF"/><circle cx="33" cy="34" r="2" fill="#5EE0B0"/>`,
  music: () => cut('<circle cx="15" cy="35" r="6.5"/><circle cx="34" cy="31" r="6.5"/><rect x="18" y="10" width="4.5" height="25"/><rect x="37" y="7" width="4.5" height="24"/><path d="M18,10 L41.5,6 L41.5,13 L18,17 Z"/>', '#9B6BFF')
    + ln('M12,33 Q13,31 15,31', '#fff', 2.5),
};
export const STICKER_NAMES = { star: 'Star', heart: 'Heart', clap: 'Clap', rocket: 'Rocket', crown: 'Crown', music: 'Music' };

export function stickerSVG(name, cls = '') {
  const f = STICKER_ART[name];
  return f ? `<svg class="sticker ${cls}" viewBox="0 0 48 48" aria-hidden="true">${f()}</svg>` : '';
}

// ------------------------------------------------------------------ feed items (pure)
/** Everything the wall shows, newest first: real-life points (not undone) + game-layer events. */
export function wallItems(s) {
  return [...R.activeLog(s).map(e => ({ ...e, kind: 'point' })), ...(s.events || [])].sort((a, b) => b.ts - a.ts);
}

/** Who a post belongs to (they can't react to it). Crew-wide posts have no owner. */
export const postOwner = item => (item.kind === 'challenge' || item.kind === 'chapter' ? null : item.pid || null);

const gameTitle = id => gameById(id)?.title || 'the Arcade';
const rareName = id => RARE_ITEMS.find(i => i.id === id)?.name || '';

/** Full wall post. `lookup(pid)` finds a player (defaults to the saved crew). */
export function describe(item, lookup = State.player) {
  const p = item.pid ? lookup(item.pid) : null;
  const name = p ? esc(p.name) : '';
  switch (item.kind) {
    case 'point':
      return {
        p, color: TYPE_COLOR[item.type], ic: TYPE_ICON[item.type],
        html: item.type === 'rewind'
          ? `<b>${name}</b> did a <b>REWIND</b>! Owned it and replayed it the right way.`
          : `<b>${name}</b> — ${TYPE_SHOUT[item.type].replace('!', '')}!`,
        note: item.note,
      };
    case 'level': return { p, color: 'yellow', ic: 'bolt', html: `<b>${name}</b> reached <b>Level ${item.level}</b>!` };
    case 'challenge': return { p: null, color: 'pink', ic: 'flag', html: `<b>Crew challenge complete!</b> ${esc(challengeText({ type: item.type, target: item.target }))} · +${item.bonus} to the Crew Pot` };
    case 'chapter': return { p: null, color: 'sky', ic: 'book', html: `<b>Chapter ${item.chapter} unlocked:</b> ${esc(content.story[item.chapter - 1]?.title || '')}` };
    case 'reward': return { p, color: 'mint', ic: 'gift', html: `<b>${name}</b> cashed in: ${esc(item.icon || '')} ${esc(item.name)}` };
    case 'mission': {
      const m = content.missions.find(x => x.id === item.missionId);
      return { p, color: 'orange', ic: 'flame', html: `<b>${name}</b> finished the mission “${esc(m?.title || '')}” — ${SCORE_WORDS[item.score] || 'Nice groove'}!` };
    }
    case 'showdown': {
      const prize = rareName(item.item);
      return {
        p, color: 'grape', ic: 'trophy', milestone: true,
        html: `<b>${name}</b> beat ${esc(RIVAL_CREW.replace(/^The /, 'the '))}!`,
        note: prize ? `Won the rare ${prize}` : 'Another trophy for the shelf',
      };
    }
    case 'improved':
      return { p, color: 'mint', ic: 'sparkle', milestone: true, html: `<b>${name}</b> is Most Improved at <b>${esc(gameTitle(item.game))}</b>!` };
    default: return null;
  }
}

/** One short line for the home-stage moments banner (plain text — escape when rendering). */
export function momentText(item, lookup = State.player) {
  const p = item.pid ? lookup(item.pid) : null;
  const n = p?.name || '';
  switch (item.kind) {
    case 'point': return { p, ic: TYPE_ICON[item.type], text: item.type === 'rewind' ? `${n} did a Rewind!` : `${n}: ${TYPE_NAME[item.type]}!` };
    case 'level': return { p, ic: 'bolt', text: `${n} reached Level ${item.level}!` };
    case 'challenge': return { p: null, ic: 'flag', text: 'Crew challenge complete!' };
    case 'chapter': return { p: null, ic: 'book', text: `Chapter ${item.chapter} unlocked!` };
    case 'reward': return { p, ic: 'gift', text: `${n} cashed in a reward!` };
    case 'mission': return { p, ic: 'flame', text: `${n} finished a mission!` };
    case 'showdown': return { p, ic: 'trophy', text: `${n} beat the Neon Owls!` };
    case 'improved': return { p, ic: 'sparkle', text: `${n} is Most Improved at ${gameTitle(item.game)}!` };
    default: return null;
  }
}

/** Crew members who may react to a post (everyone except its owner), in home-stage order. */
export const reactorsFor = (ownerId, crew) => crew.filter(p => p.id !== ownerId);

/** The sticker picker for one reactor: which stickers they've already given on this post. */
export function stickerChoices(reactions, postId, reactorId) {
  const given = reactions?.[postId]?.[reactorId] || [];
  return State.STICKERS.map(id => ({ id, given: given.includes(id) }));
}

function reactionsHTML(postId, fresh = null) {
  const r = State.get().reactions?.[postId] || {};
  return State.crewInOrder().filter(p => r[p.id]?.length).map(p => `
    <span class="rx" aria-label="${esc(p.name)}: ${r[p.id].map(st => STICKER_NAMES[st]).join(', ')}">
      <span class="rx-av">${avatarSVG(p.avatar, { crop: 'head', expr: 'grin' })}</span>
      ${r[p.id].map(st => `<span class="rx-st ${fresh && fresh.pid === p.id && fresh.st === st ? 'rx-new' : ''}">${stickerSVG(st)}</span>`).join('')}
    </span>`).join('');
}

// ------------------------------------------------------------------ screen
export default function wall(root) {
  const s = State.get();
  const items = wallItems(s).slice(0, 80);
  const crew = State.crewInOrder();

  let lastDay = '';
  const rows = items.map(it => {
    const d = describe(it);
    if (!d) return '';
    const day = timeAgo(it.ts).match(/min|just/) ? 'today' : timeAgo(it.ts);
    const head = day !== lastDay ? `<li class="day-head">${esc(day[0].toUpperCase() + day.slice(1))}</li>` : '';
    lastDay = day;
    const owner = postOwner(it);
    const canReact = reactorsFor(owner, crew).length > 0;
    return `${head}<li class="post ${d.milestone ? 'milestone' : ''}" data-post="${esc(it.id)}">
      <span class="post-av ${d.color}">${d.p ? avatarSVG(d.p.avatar, { crop: 'head', expr: 'grin' }) : icon(d.ic)}</span>
      <div class="post-bubble ${d.color}">
        <span class="post-ic">${icon(d.ic)}</span>
        <p>${d.html}</p>
        ${d.note ? `<p class="post-note">${d.milestone ? `${icon('star')} ${esc(d.note)}` : `“${esc(d.note)}”`}</p>` : ''}
        <div class="post-foot">
          <small>${esc(timeAgo(it.ts))}</small>
          <span class="reactions">${reactionsHTML(it.id)}</span>
          ${canReact ? `<button class="react-btn" data-act="react" data-post="${esc(it.id)}" data-owner="${esc(owner || '')}" aria-label="React with a sticker">${stickerSVG('heart')}<span>React</span></button>` : ''}
        </div>
      </div></li>`;
  }).join('');

  const screen = el(`<main class="screen wall">
    <header class="topbar">
      <button class="icon-btn" data-act="home" aria-label="Home">${icon('home')}</button>
      <div class="title"><h1>Crew Wall</h1><div class="sub">Good moments from the whole crew</div></div>
    </header>
    ${items.length ? `<ul class="feed">${rows}</ul>` : `<div class="panel white center empty">${icon('wall')}<h2>No moments yet</h2><p>The first good move will show up here!</p></div>`}
  </main>`);
  root.appendChild(screen);

  let picker = null;
  const off = actions(screen, {
    home: () => go('#/home'),
    react: b => { picker = pickSticker(b.dataset.post, b.dataset.owner || null, added => showAdded(screen, b.dataset.post, added)); },
  });
  return () => { off(); picker?.close(); };
}

/** Put the new sticker on the post with a little pop. */
function showAdded(screen, postId, added) {
  const post = screen.querySelector(`.post[data-post="${CSS.escape(postId)}"]`);
  if (!post) return;
  post.querySelector('.reactions').innerHTML = reactionsHTML(postId, added);
  if (!reducedMotion()) {
    const bubble = post.querySelector('.post-bubble');
    bubble.classList.remove('rx-bump'); void bubble.offsetWidth; bubble.classList.add('rx-bump');
  }
}

/** "Who's reacting?" → sticker. Calls done({ pid, st }) when a sticker lands. */
function pickSticker(postId, ownerId, done) {
  const crew = reactorsFor(ownerId, State.crewInOrder());
  const m = modal('<div class="react-pick"></div>', { cls: 'react-overlay' });
  const box = m.el.querySelector('.react-pick');
  let reactor = null;

  const who = () => {
    reactor = null;
    box.innerHTML = `<h2>Who’s reacting?</h2>
      <div class="react-who">${crew.map(p => `<button class="who" data-pid="${p.id}"><span class="who-av">${avatarSVG(p.avatar, { crop: 'head', expr: 'grin' })}</span><b>${esc(p.name)}</b></button>`).join('')}</div>
      <div class="row"><button class="btn white" data-a="cancel">Not now</button></div>`;
  };
  const stickers = () => {
    const choices = stickerChoices(State.get().reactions, postId, reactor.id);
    const allGiven = choices.every(c => c.given);
    box.innerHTML = `<div class="react-head"><span class="who-av">${avatarSVG(reactor.avatar, { crop: 'head', expr: 'grin' })}</span>
      <h2>${allGiven ? `Every sticker given, ${esc(reactor.name)}!` : `Pick a sticker, ${esc(reactor.name)}!`}</h2></div>
      <div class="sticker-grid">${choices.map(c => `<button class="sticker-btn ${c.given ? 'given' : ''}" data-st="${c.id}" ${c.given ? 'disabled' : ''}
        aria-label="${STICKER_NAMES[c.id]}${c.given ? ' (already given)' : ''}">${stickerSVG(c.id)}${c.given ? `<span class="given-ic">${icon('check')}</span>` : ''}</button>`).join('')}</div>
      <div class="row"><button class="btn white" data-a="back">${icon('back')} Back</button></div>`;
  };

  m.el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.a === 'cancel') { Sound.tap(); m.close(); return; }
    if (b.dataset.a === 'back') { Sound.tap(); who(); return; }
    if (b.dataset.pid) { Sound.pop(); reactor = crew.find(p => p.id === b.dataset.pid); stickers(); return; }
    if (b.dataset.st && reactor) {
      if (State.addReaction(postId, reactor.id, b.dataset.st, ownerId)) {
        Sound.pop(); Sound.sparkle();
        done({ pid: reactor.id, st: b.dataset.st });
      }
      m.close();
    }
  });
  if (crew.length === 1) { reactor = crew[0]; stickers(); } else who();
  return m;
}
