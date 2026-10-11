// Home stage. The crew is alive:
//  - tap a dancer → they bust out one of their unlocked moves + a "My page" bubble (~3 s);
//  - the name tag opens their page;
//  - hold a dancer (~350 ms) → pick them up and drag to swap spots (works in the wrapped phone
//    layout too); the order is saved;
//  - idle life: every so often someone does a little move (off under reduced motion);
//  - recent Crew Wall moments (last 24 h) show on a banner and the WHOLE crew cheers together —
//    never a per-member "nothing yet" state.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import * as FX from '../fx.js';
import { avatarSVG } from '../avatar.js';
import { content } from '../data.js';
import { el, esc, icon, actions, go, reducedMotion, timeAgo } from '../ui.js';
import { requirePin } from './pin.js';
import { challengeText, wallItems, momentText } from './wall.js';

export { challengeText };

export const HOLD_MS = 350;        // long-press before a dancer is picked up
const SLOP = 10;                   // px a finger may wobble while holding (more = it's a scroll)
const DANCE_MS = 2400;
const BUBBLE_MS = 3000;
const CHEER_MS = 1800;
const MOMENT_WINDOW = 24 * 3600_000;
const BURST = ['#FFD23F', '#FF7AB6', '#5CC8FF', '#5EE0B0', '#9B6BFF', '#FF9F43'];
const IDLE = ['idl-hop', 'idl-wave', 'idl-look', 'idl-shimmy'];

// ------------------------------------------------------------------ pure helpers (unit-tested)
/** A copy of `list` with the entry at `from` moved to `to` (clamped). */
export function moveItem(list, from, to) {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/**
 * The slot whose centre is nearest to (x, y). Slots are fixed layout positions (any number of rows),
 * so this works for the 5-across stage and the wrapped 3 + 2 phone stage alike. `current` gets a
 * small head start so the pick doesn't flicker on a border.
 */
export function nearestSlot(slots, x, y, current = -1, stick = 18) {
  let best = -1, bestD = Infinity;
  slots.forEach((s, i) => {
    const d = Math.hypot(s.x - x, s.y - y) - (i === current ? stick : 0);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/**
 * The move a tapped dancer plays: one of `ids` (their unlocked moves + a cheer, so Level 1 has
 * variety), never the same as `last` when there is any other choice.
 */
export function pickMove(ids, last = '', rand = Math.random) {
  const pool = ids.length > 1 ? ids.filter(x => x !== last) : ids;
  return pool.length ? pool[Math.floor(rand() * pool.length)] : 'bounce';
}

/** The latest 1–3 wall moments from the last 24 h, newest first ([] when there are none). */
export function pickMoments(items, now = Date.now(), max = 3) {
  return items.filter(it => it.ts > now - MOMENT_WINDOW && it.ts <= now + 60_000)
    .sort((a, b) => b.ts - a.ts).slice(0, max);
}

// ------------------------------------------------------------------ sounds
const pick = a => a[Math.floor(Math.random() * a.length)];
const later = (fn, ms) => setTimeout(fn, ms);
const MOVE_SOUND = {
  bounce: () => { Sound.jump(); later(() => Sound.jump(), 180); },
  wave: () => Sound.whoosh(),
  pop: () => { Sound.pop(); later(() => Sound.pop(), 150); },
  kick: () => { Sound.kick(); Sound.hit(2); },
  robot: () => [0, 1, 2].forEach(i => later(() => Sound.note(76 + i * 5, 0.07, 'square', 0.08), i * 100)),
  spin: () => { Sound.whoosh(); Sound.sparkle(); },
  glide: () => Sound.slide(),
  freeze: () => { Sound.jump(); later(() => Sound.chime(), 220); },
  cheer: () => { Sound.pop(); later(() => Sound.sparkle(), 120); },
};

// ------------------------------------------------------------------ markup
function momentsBanner(moments) {
  const rows = moments.map(it => momentText(it)).filter(Boolean);
  if (!rows.length) return '';
  return `<button class="moments" data-act="wall" aria-label="Crew moments — open the Crew Wall">
    <span class="mo-title">${icon('sparkle')}<b>Crew moments</b></span>
    ${rows.map((m, i) => `<span class="mo" style="--i:${i}">
      <span class="mo-av">${m.p ? avatarSVG(m.p.avatar, { crop: 'head', expr: 'grin' }) : icon(m.ic)}</span>
      <span class="mo-text">${esc(m.text)}<small>${esc(timeAgo(moments[i].ts))}</small></span></span>`).join('')}
  </button>`;
}

function memberHTML(p, i, rm) {
  return `<div class="crew-member" data-id="${p.id}" style="--d:${-i * 0.37}s">
    <button class="cm-av" aria-label="Make ${esc(p.name)} dance">${avatarSVG(p.avatar, { cls: rm ? '' : 'mv-idle' })}</button>
    <button class="cm-name" data-act="player" data-id="${p.id}" aria-label="Open ${esc(p.name)}’s page">${esc(p.name)}</button>
    ${!p.designed ? '<span class="tag new">Design me!</span>' : p.newItems.length ? '<span class="tag new">NEW gear</span>' : ''}
  </div>`;
}

// The newest moment the crew already cheered for (this app session) — confetti + sound only for new ones.
let lastCheered = null;

export default function home(root) {
  const s = State.get();
  const pot = State.pot();
  const unlocked = R.chaptersUnlocked(pot);
  const next = R.nextChapterTarget(pot);
  const prev = R.CHAPTER_POT[unlocked - 1] || 0;
  const unseen = content.story.slice(0, unlocked).some((c, i) => !s.storySeen.includes(i + 1));
  const ch = R.challengeProgress(s);
  const chDone = s.challenge?.doneWeek === R.weekKey();
  const rm = reducedMotion();
  const crew = State.crewInOrder();
  const moments = pickMoments(wallItems(s));

  const screen = el(`<main class="screen home">
    <header class="topbar">
      <div class="title"><h1>${esc(s.gameName)}</h1><div class="sub">${esc(s.crewName)} · road to the Big Showcase</div></div>
      <button class="icon-btn" data-act="sound" aria-label="Sound on or off">${icon(s.sound ? 'sound' : 'mute')}</button>
      <button class="icon-btn grape" data-act="parent" aria-label="Parent mode">${icon('lock')}</button>
    </header>

    <section class="stage-panel ${moments.length ? 'has-moments' : ''}" aria-label="Your crew">
      <div class="stage-lights"><i></i><i></i><i></i></div>
      ${moments.length ? momentsBanner(moments) : ''}
      <p class="stage-hint outline-text">Tap to dance · hold to move</p>
      <div class="crew-row">${crew.map((p, i) => memberHTML(p, i, rm)).join('')}</div>
      <div class="stage-floor"></div>
    </section>

    <section class="home-grid">
      <div class="panel yellow pot-card">
        <div class="pot-head">${icon('trophy')}<div><h2>Crew Pot</h2><p class="small"><b>${pot.toLocaleString()} XP</b> earned together</p></div></div>
        ${next !== null ? `<div class="meter" style="--p:${Math.min(1, (pot - prev) / (next - prev))};--fill:var(--pink)"><i></i></div>
          <p class="small"><b>${(next - pot).toLocaleString()} XP</b> until Chapter ${unlocked + 1}</p>`
        : `<p><b>Every chapter unlocked!</b> The Big Showcase is yours.</p>`}
      </div>
      <div class="panel ${chDone ? 'mint' : 'pink-l'} challenge-card">
        <div class="pot-head">${icon('flag')}<div><h2>Crew Challenge</h2><p class="small">${esc(challengeText(s.challenge))}</p></div></div>
        <div class="meter" style="--p:${Math.min(1, ch.count / Math.max(1, ch.target))};--fill:var(--sky)"><i></i></div>
        <p class="small">${chDone ? '<b>Done this week! Showcase unlocked.</b>' : `<b>${ch.count} of ${ch.target}</b> · resets Monday`}</p>
      </div>
      <button class="big-link panel sky" data-act="story">${icon('book')}<span><b>Story</b><small>Chapter ${unlocked} of 6 unlocked</small></span>${unseen ? '<span class="tag new">NEW</span>' : ''}</button>
      <button class="big-link panel mint" data-act="wall">${icon('wall')}<span><b>Crew Wall</b><small>Good moments from everyone</small></span></button>
    </section>
  </main>`);
  root.appendChild(screen);

  const row = screen.querySelector('.crew-row');
  const members = () => [...row.querySelectorAll('.crew-member')];
  const timers = new Set();
  const after = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const danceTimers = new Map();
  const lastMove = new Map(); // per dancer, kept across dances so a tap never repeats the last move
  let bubbleTimer = 0, cheering = false, press = null, suppressUntil = 0, spot = null;

  // ---------------------------------------------------------------- dancing
  const paint = (m, { expr = 'happy', cls = rm ? '' : 'mv-idle' } = {}) => {
    const p = State.player(m.dataset.id);
    m.querySelector('.cm-av').innerHTML = avatarSVG(p.avatar, { expr, cls });
  };
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const settle = m => { clearTimeout(danceTimers.get(m)); danceTimers.delete(m); delete m.dataset.move; paint(m); };

  function burst(m) {
    if (rm) return;
    const b = el(`<span class="cm-burst" aria-hidden="true">${BURST.concat(BURST.slice(0, 2)).map((c, i) => `<i style="--a:${i * 45 + 20}deg;--c:${c}"></i>`).join('')}</span>`);
    m.appendChild(b);
    after(() => b.remove(), 800);
  }

  function dance(m) {
    const p = State.player(m.dataset.id);
    const mv = pickMove([...State.unlockedMoves(p).map(x => x.id), 'cheer'], lastMove.get(p.id));
    lastMove.set(p.id, mv);
    m.dataset.move = mv;
    paint(m, { expr: 'grin', cls: rm ? '' : 'mv-' + mv });
    restart(m.querySelector('.cm-av'), 'tap-squash');
    (MOVE_SOUND[mv] || MOVE_SOUND.bounce)();
    Sound.combo(members().indexOf(m) * 2);
    burst(m);
    showBubble(m, p);
    clearTimeout(danceTimers.get(m));
    danceTimers.set(m, after(() => settle(m), DANCE_MS));
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    row.querySelectorAll('.cm-bubble').forEach(b => b.remove());
    row.querySelectorAll('.has-bubble').forEach(x => x.classList.remove('has-bubble'));
  }
  function showBubble(m, p) {
    hideBubble();
    const b = el(`<button class="cm-bubble" data-act="player" data-id="${p.id}" aria-label="Open ${esc(p.name)}’s page">My page ${icon('next')}</button>`);
    m.appendChild(b);
    m.classList.add('has-bubble');
    // One handle for both phases, so a re-tap mid-fade can't strip the new bubble's has-bubble.
    bubbleTimer = after(() => {
      b.classList.add('leaving');
      bubbleTimer = after(() => { b.remove(); m.classList.remove('has-bubble'); }, 220);
    }, BUBBLE_MS);
  }

  // ---------------------------------------------------------------- idle life + cheering
  function idleTick() {
    after(() => {
      const free = members().filter(m => !m.dataset.move && !m.classList.contains('dragging'));
      if (!cheering && !press && free.length && !document.hidden) {
        const m = pick(free);
        const svg = m.querySelector('.av');
        const cls = pick(IDLE);
        m.dataset.move = 'idle';
        svg.setAttribute('class', 'av ' + cls);
        after(() => { if (m.dataset.move === 'idle') { delete m.dataset.move; svg.setAttribute('class', 'av mv-idle'); } }, 1500);
      }
      idleTick();
    }, 6000 + Math.random() * 4000);
  }

  function cheer() {
    const fresh = moments[0].id !== lastCheered;
    lastCheered = moments[0].id;
    cheering = true;
    row.classList.add('cheering');
    members().forEach(m => { if (!m.dataset.move) paint(m, { expr: 'grin', cls: rm ? '' : 'mv-cheer' }); });
    if (fresh) { FX.confetti(40); Sound.sparkle(); Sound.combo(4); }
    after(() => {
      cheering = false;
      row.classList.remove('cheering');
      members().forEach(m => { if (!m.dataset.move && !m.classList.contains('dragging')) paint(m); });
    }, CHEER_MS);
  }

  // ---------------------------------------------------------------- hold → drag to reorder
  function pickUp() {
    const list = members();
    const from = list.indexOf(press.m);
    const slots = list.map(x => { const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, feet: r.top + r.width * 1.5 * 0.93 }; });
    Object.assign(press, { picked: true, list, from, to: from, slots, rowRect: row.getBoundingClientRect() });
    try { press.btn.setPointerCapture(press.id); } catch { /* synthetic events */ }
    hideBubble();
    settle(press.m);
    press.m.querySelector('.av').setAttribute('class', rm ? 'av' : 'av mv-held');
    press.m.dataset.move = 'held';
    press.m.classList.add('dragging');
    row.classList.add('sorting');
    spot = el('<i class="drop-spot" aria-hidden="true"></i>');
    row.appendChild(spot);
    placeSpot();
    Sound.pop();
  }
  function placeSpot() {
    const s = press.slots[press.to];
    spot.style.left = (s.x - press.rowRect.left) + 'px';
    spot.style.top = (s.feet - press.rowRect.top) + 'px';
    spot.style.width = s.w * 0.8 + 'px';
  }
  function shiftOthers() {
    moveItem(press.list, press.from, press.to).forEach((m, k) => {
      if (m === press.m) return;
      const a = press.slots[press.list.indexOf(m)], b = press.slots[k];
      m.style.transform = a === b ? '' : `translate(${b.x - a.x}px, ${b.y - a.y}px)`;
    });
  }
  function cancelPress() { clearTimeout(press?.timer); press?.btn.classList.remove('pressing'); press = null; }
  // revert: the drag was interrupted (pointercancel) — everyone slides home and nothing is saved.
  function drop({ revert = false } = {}) {
    if (revert && press.to !== press.from) { press.to = press.from; shiftOthers(); }
    const { m, list, from, to, slots } = press;
    press.btn.classList.remove('pressing');
    press = null;
    suppressUntil = performance.now() + 450;
    const order = moveItem(list, from, to);
    const a = slots[from], b = slots[to];
    m.classList.remove('dragging');
    m.classList.add('dropping');
    m.style.transform = from === to ? '' : `translate(${b.x - a.x}px, ${b.y - a.y}px)`;
    spot?.remove(); spot = null;
    Sound.tap();
    after(() => {
      // Commit: real DOM order; every transform is now zero because slots never move.
      row.classList.add('no-anim');
      order.forEach(x => { x.style.transform = ''; row.appendChild(x); });
      void row.offsetWidth;
      row.classList.remove('no-anim', 'sorting');
      m.classList.remove('dropping');
      delete m.dataset.move;
      paint(m);
      restart(m.querySelector('.cm-av'), 'tap-squash');
      if (from !== to) { State.setCrewOrder(order.map(x => x.dataset.id)); Sound.chime(); }
    }, rm ? 0 : 200);
  }

  const onDown = e => {
    const btn = e.target.closest('.cm-av');
    if (!btn || press || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press = { m: btn.closest('.crew-member'), btn, id: e.pointerId, x0: e.clientX, y0: e.clientY, picked: false };
    btn.classList.add('pressing'); // instant feedback on touch (iOS :active is unreliable)
    press.timer = setTimeout(() => { if (press && !press.picked) pickUp(); }, HOLD_MS);
  };
  const onMove = e => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
    if (!press.picked) { if (Math.hypot(dx, dy) > SLOP) cancelPress(); return; }
    e.preventDefault();
    const tilt = Math.max(-8, Math.min(8, dx / 12));
    press.m.style.transform = `translate(${dx}px, ${dy}px) scale(1.1) rotate(${tilt}deg)`;
    const s0 = press.slots[press.from];
    const to = nearestSlot(press.slots, s0.x + dx, s0.y + dy, press.to);
    if (to !== press.to) { press.to = to; shiftOthers(); placeSpot(); Sound.whoosh(); }
  };
  const onUp = e => {
    if (!press || e.pointerId !== press.id) return;
    if (press.picked) drop(); else cancelPress();
  };
  // pointercancel (an iOS system gesture mid-drag) is neutral: back to where they were, order unchanged.
  const onCancel = e => {
    if (!press || e.pointerId !== press.id) return;
    if (press.picked) drop({ revert: true }); else cancelPress();
  };
  const onClick = e => {
    if (performance.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); return; }
    const btn = e.target.closest('.cm-av');
    if (btn) dance(btn.closest('.crew-member'));
  };
  const noScroll = e => { if (press?.picked) e.preventDefault(); };
  const noMenu = e => { if (e.target.closest('.cm-av')) e.preventDefault(); };

  row.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  row.addEventListener('click', onClick, true);
  row.addEventListener('contextmenu', noMenu);
  // Blocking touchmove only for touches that start on the crew (a drag); the rest of home scrolls passively.
  row.addEventListener('touchmove', noScroll, { passive: false });

  if (!rm) idleTick();
  if (moments.length) { cheering = true; row.classList.add('cheering'); after(cheer, 350); }

  const off = actions(screen, {
    player: b => go('#/player/' + b.dataset.id),
    story: () => go('#/story'),
    wall: () => go('#/wall'),
    sound: b => {
      State.setSetting('sound', !State.get().sound);
      Sound.setEnabled(State.get().sound);
      b.innerHTML = icon(State.get().sound ? 'sound' : 'mute');
      if (State.get().sound) Sound.chime();
    },
    parent: async () => { if (await requirePin()) go('#/parent'); },
  });

  return () => {
    off();
    cancelPress();
    timers.forEach(clearTimeout);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  };
}
