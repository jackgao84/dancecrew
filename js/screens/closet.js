// Closet: the avatar designer. Tapping any item plays a short dance wearing it (~1.2 s), then back
// to idle — locked items too, as a sneak peek. Reduced motion: a gentle squash only.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import { avatarSVG } from '../avatar.js';
import { SKIN, HAIR_COLORS, OUTFIT_COLORS, SHOE_COLORS, ITEMS, RARE_ITEMS, itemById } from '../content.js';
import { el, esc, icon, actions, go, reducedMotion } from '../ui.js';

const TABS = [
  { id: 'hair', label: 'Hair', kind: 'item', slot: 'hair', crop: 'head' },
  { id: 'hairColor', label: 'Hair colour', kind: 'color', key: 'hairColor' },
  { id: 'skin', label: 'Skin', kind: 'color', key: 'skin' },
  { id: 'outfit', label: 'Outfit', kind: 'item', slot: 'outfit', crop: 'body' },
  { id: 'outfitColor', label: 'Outfit colour', kind: 'color', key: 'outfitColor' },
  { id: 'shoes', label: 'Sneakers', kind: 'item', slot: 'shoes', crop: 'feet' },
  { id: 'shoeColor', label: 'Sneaker colour', kind: 'color', key: 'shoeColor' },
  { id: 'head', label: 'Hats', kind: 'item', slot: 'head', crop: 'head' },
  { id: 'face', label: 'Face', kind: 'item', slot: 'face', crop: 'face' },
];

export const PREVIEW_DANCE_MS = 1200;
const BURST = ['#FFD23F', '#FF7AB6', '#5CC8FF', '#5EE0B0', '#9B6BFF', '#FF9F43'];

/** Moves the preview can dance: the player's unlocked moves plus a cheer (so level 1 has variety). */
export function previewMoves(player) {
  return [...(player ? State.unlockedMoves(player).map(m => m.id) : ['bounce']), 'cheer'];
}

function colorOptions(key, player) {
  const bonus = player ? State.unlockedBonusColors(player).map(b => b.color) : [];
  if (key === 'skin') return SKIN;
  if (key === 'hairColor') return HAIR_COLORS;
  if (key === 'outfitColor') return [...OUTFIT_COLORS, ...bonus];
  return [...SHOE_COLORS, ...bonus];
}

/**
 * Interactive avatar designer. `avatar` is edited in place; onChange fires after each tap.
 * With no `player`, only starter items are available (first-run setup).
 */
export function avatarEditor(host, avatar, { player = null, onChange = () => {}, tabs = null } = {}) {
  let tab = 'hair';
  const lv = player ? State.level(player) : 1;
  const newItems = new Set(player?.newItems || []);
  const shown = tabs ? TABS.filter(t => tabs.includes(t.id)) : TABS;

  host.innerHTML = `
    <div class="editor">
      <div class="editor-preview"><div class="spot-floor"></div><div class="pv-av"></div><span class="pv-peek tag">${icon('sparkle')} Sneak peek!</span></div>
      <div class="editor-controls">
        <div class="chips" role="tablist">${shown.map(t => `<button class="chip" role="tab" data-act="tab" data-tab="${t.id}">${esc(t.label)}${t.slot && [...newItems].some(id => itemById(id)?.slot === t.slot) ? '<b class="dot"></b>' : ''}</button>`).join('')}</div>
        <div class="options"></div>
      </div>
    </div>`;
  const pv = host.querySelector('.pv-av');
  const stage = host.querySelector('.editor-preview');
  const opts = host.querySelector('.options');
  const rm = reducedMotion();
  const moves = previewMoves(player);
  let danceTimer = 0, lastMove = '';

  const squash = () => { pv.classList.remove('pv-squash'); void pv.offsetWidth; pv.classList.add('pv-squash'); };
  const paintPreview = (bump = false) => {
    pv.innerHTML = avatarSVG(avatar, { expr: bump ? 'grin' : 'happy', cls: rm ? '' : 'mv-idle' });
    if (bump) squash();
  };
  const sparkles = () => {
    if (rm) return;
    const b = el(`<span class="pv-burst" aria-hidden="true">${BURST.concat(BURST).map((c, i) => `<i style="--a:${i * 30}deg;--c:${c}"></i>`).join('')}</span>`);
    stage.appendChild(b);
    setTimeout(() => b.remove(), 900);
  };
  /** A short dance wearing `look`, then back to idle in the current outfit. */
  const previewDance = (look, { peek = false } = {}) => {
    clearTimeout(danceTimer);
    const pool = moves.filter(m => m !== lastMove);
    lastMove = pool[Math.floor(Math.random() * pool.length)] || 'bounce';
    pv.innerHTML = avatarSVG(look, { expr: 'grin', cls: rm ? '' : 'mv-' + lastMove });
    stage.classList.add('dancing');
    stage.classList.toggle('peeking', peek);
    squash();
    sparkles();
    Sound.sparkle();
    if (!peek) Sound.combo(3);
    danceTimer = setTimeout(() => { stage.classList.remove('dancing', 'peeking'); paintPreview(); }, PREVIEW_DANCE_MS);
  };

  const paintOptions = () => {
    host.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.tab === tab));
    const t = TABS.find(x => x.id === tab);
    if (t.kind === 'color') {
      opts.innerHTML = `<div class="swatches">${colorOptions(t.key, player).map(c =>
        `<button class="swatch ${avatar[t.key] === c ? 'on' : ''}" style="--c:${c}" data-act="color" data-key="${t.key}" data-val="${c}" aria-label="colour ${c}"></button>`).join('')}</div>`;
      return;
    }
    const owned = new Set(player?.rareItems || []);
    const items = [...ITEMS.filter(i => i.slot === t.slot), ...RARE_ITEMS.filter(i => i.slot === t.slot)];
    opts.innerHTML = `<div class="tiles">${items.map(it => {
      const locked = it.rare ? !owned.has(it.id) : it.level > lv;
      const pvAv = { ...avatar, [t.slot]: it.id };
      return `<button class="tile ${avatar[t.slot] === it.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="${locked ? 'locked' : 'item'}" data-slot="${t.slot}" data-val="${it.id}" data-lv="${it.level}" aria-label="${esc(it.name)}${locked ? ', locked' : ''}">
        <span class="tile-art">${avatarSVG(pvAv, { crop: t.crop })}</span>
        <span class="tile-name">${esc(it.name)}</span>
        ${locked ? `<span class="tile-lock">${icon(it.rare ? 'trophy' : 'lock')}<b>${it.rare ? 'Showdown' : 'Lv ' + it.level}</b></span>` : ''}
        ${it.rare && !locked ? '<span class="tag rare">RARE</span>' : ''}
        ${newItems.has(it.id) ? '<span class="tag new">NEW</span>' : ''}
      </button>`;
    }).join('')}</div>`;
  };

  const off = actions(host, {
    tab: b => { tab = b.dataset.tab; paintOptions(); },
    color: b => { avatar[b.dataset.key] = b.dataset.val; Sound.sparkle(); clearTimeout(danceTimer); stage.classList.remove('dancing', 'peeking'); paintPreview(true); paintOptions(); onChange(avatar); },
    item: b => { avatar[b.dataset.slot] = b.dataset.val; paintOptions(); onChange(avatar); previewDance(avatar); },
    locked: b => {
      const rare = RARE_ITEMS.some(i => i.id === b.dataset.val);
      const tip = el(`<div class="lock-tip pop-in">${rare ? 'Win a Showdown to unlock!' : `Reach Level ${b.dataset.lv} to unlock!`}</div>`);
      host.querySelectorAll('.lock-tip').forEach(x => x.remove());
      b.appendChild(tip);
      setTimeout(() => tip.remove(), 1600);
      previewDance({ ...avatar, [b.dataset.slot]: b.dataset.val }, { peek: true });
    },
  });
  paintPreview();
  paintOptions();
  return () => { off(); clearTimeout(danceTimer); };
}

// ------------------------------------------------------------------ screen
export default function closet(root, pid) {
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const firstTime = !p.designed;
  const av = { ...p.avatar };
  const screen = el(`<main class="screen closet">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>${firstTime ? 'Design your look!' : esc(p.name) + '’s Closet'}</h1>
      <div class="sub">${firstTime ? 'Tap to try things on. Everything saves by itself.' : 'Level up to unlock more gear.'}</div></div>
      <button class="btn mint" data-act="done">${icon('check')} Done</button>
    </header>
    <div class="editor-host"></div>
  </main>`);
  root.appendChild(screen);
  const offEditor = avatarEditor(screen.querySelector('.editor-host'), av, {
    player: p,
    onChange: a => State.saveAvatar(p.id, a),
  });
  const offActs = actions(screen, {
    back: () => go('#/player/' + p.id),
    done: () => { if (!p.designed) State.saveAvatar(p.id, av); go('#/player/' + p.id); },
  });
  return () => {
    offEditor(); offActs();
    if (p.newItems.length) State.clearNewItems(p.id);
  };
}
