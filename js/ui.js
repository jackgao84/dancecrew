// Small DOM helpers, icons, toasts and modals.
import * as Sound from './sound.js';

export const INK = '#3B2A4A';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Delegated click handling: data-act="name" → handlers[name](el, event). */
export function actions(root, handlers) {
  const fn = e => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t) || t.disabled) return;
    const h = handlers[t.dataset.act];
    if (h) { Sound.tap(); h(t, e); }
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

// ------------------------------------------------------------------ icons
const S = 'stroke="#3B2A4A" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';
const merged = (shapes, fill) => `<g fill="${INK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
function starPts(cx, cy, r, inner = 0.5) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
}
const gearTeeth = () => Array.from({ length: 8 }, (_, i) => `<rect x="20" y="3" width="8" height="10" rx="2" transform="rotate(${i * 45} 24 24)"/>`).join('');

const ICONS = {
  star: c => merged(`<polygon points="${starPts(24, 25, 20)}"/>`, c || '#FFD23F') + `<path d="M17,18 L20,15" ${S} stroke="#fff" fill="none"/>`,
  bolt: c => merged('<path d="M27,3 L9,27 H22 L19,45 L39,19 H26 Z"/>', c || '#FFD23F'),
  hand: c => merged('<rect x="13" y="10" width="7" height="20" rx="3.5"/><rect x="20" y="5" width="7" height="24" rx="3.5"/><rect x="27" y="7" width="7" height="22" rx="3.5"/><rect x="34" y="12" width="6" height="18" rx="3"/><rect x="13" y="22" width="27" height="21" rx="9"/><rect x="4" y="25" width="16" height="8" rx="4" transform="rotate(-38 12 29)"/>', c || '#FFE3CC'),
  words: c => merged('<path d="M9,8 H39 Q44,8 44,13 V29 Q44,34 39,34 H23 L13,42 L15,34 H9 Q4,34 4,29 V13 Q4,8 9,8 Z"/>', c || '#fff') + `<g fill="${INK}"><circle cx="15" cy="21" r="3"/><circle cx="24" cy="21" r="3"/><circle cx="33" cy="21" r="3"/></g>`,
  heart: c => merged('<path d="M24,42 C10,32 4,24 4,16 C4,9 9,5 15,5 C19,5 22,7 24,10 C26,7 29,5 33,5 C39,5 44,9 44,16 C44,24 38,32 24,42 Z"/>', c || '#FF7AB6') + `<path d="M11,14 Q12,10 16,10" ${S} stroke="#fff" fill="none"/>`,
  rewind: c => merged('<circle cx="24" cy="24" r="20"/>', c || '#9B6BFF') + `<path d="M23,14 L11,24 L23,34 Z M37,14 L25,24 L37,34 Z" fill="#fff" ${S}/>`,
  lock: c => merged('<rect x="8" y="21" width="32" height="23" rx="7"/>', c || '#FFD23F') + `<path d="M15,21 V15 Q15,6 24,6 Q33,6 33,15 V21" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="31" r="3.5" fill="${INK}"/><path d="M24,33 V37" ${S}/>`,
  sound: c => merged('<path d="M5,18 H13 L24,9 V39 L13,30 H5 Z"/>', c || '#5CC8FF') + `<path d="M30,17 Q35,24 30,31 M35,12 Q43,24 35,36" fill="none" ${S} stroke-width="4"/>`,
  mute: c => merged('<path d="M5,18 H13 L24,9 V39 L13,30 H5 Z"/>', c || '#ddd') + `<path d="M31,18 L43,30 M43,18 L31,30" fill="none" ${S} stroke-width="4"/>`,
  gear: c => merged(gearTeeth() + '<circle cx="24" cy="24" r="14"/>', c || '#9B6BFF') + `<circle cx="24" cy="24" r="5.5" fill="#fff" ${S}/>`,
  back: () => `<path d="M29,9 L14,24 L29,39" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  next: () => `<path d="M19,9 L34,24 L19,39" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  home: c => merged('<path d="M6,24 L24,7 L42,24 H37 V42 H11 V24 Z"/>', c || '#FFD23F') + `<rect x="19" y="29" width="10" height="13" rx="3" fill="#FF7AB6" ${S}/>`,
  check: () => `<path d="M9,25 L20,36 L40,13" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  play: c => merged('<path d="M14,8 L40,24 L14,40 Z"/>', c || '#5EE0B0'),
  note: c => merged('<circle cx="14" cy="36" r="8"/><circle cx="36" cy="32" r="8"/><rect x="18" y="8" width="5" height="28"/><rect x="40" y="6" width="4" height="26"/><path d="M18,8 L44,4 V12 L18,16 Z"/>', c || '#9B6BFF'),
  flame: c => merged('<path d="M24,44 C12,44 7,36 8,28 C9,20 16,17 16,9 C22,12 25,17 24,23 C27,21 29,17 29,13 C37,18 41,26 40,32 C39,39 33,44 24,44 Z"/>', c || '#FF9F43') + `<path d="M24,41 C19,41 17,37 18,34 C19,30 23,29 23,25 C28,28 30,32 29,35 C29,39 27,41 24,41 Z" fill="#FFD23F"/>`,
  moon: c => merged('<path d="M30,4 C18,6 10,15 10,26 C10,37 19,45 30,45 C36,45 41,42 44,38 C32,39 24,31 24,20 C24,13 26,8 30,4 Z"/>', c || '#FFD23F'),
  book: c => merged('<path d="M4,10 Q14,6 24,11 Q34,6 44,10 V40 Q34,36 24,41 Q14,36 4,40 Z"/>', c || '#fff') + `<path d="M24,11 V41" ${S} fill="none"/><path d="M9,17 Q15,15 19,17 M9,24 Q15,22 19,24 M29,17 Q33,15 39,17" ${S} fill="none" stroke-width="2.5"/>`,
  wall: c => merged('<rect x="4" y="6" width="40" height="36" rx="8"/>', c || '#FFD23F') + `<rect x="9" y="11" width="14" height="11" rx="3" fill="#FF7AB6" ${S} stroke-width="2.5"/><rect x="26" y="13" width="13" height="10" rx="3" fill="#5CC8FF" ${S} stroke-width="2.5"/><rect x="12" y="27" width="24" height="10" rx="3" fill="#5EE0B0" ${S} stroke-width="2.5"/>`,
  trophy: c => merged('<path d="M13,6 H35 V18 Q35,30 24,31 Q13,30 13,18 Z"/><rect x="21" y="30" width="6" height="7"/><rect x="14" y="36" width="20" height="7" rx="3"/>', c || '#FFD23F') + `<path d="M13,11 H6 Q6,21 14,22 M35,11 H42 Q42,21 34,22" fill="none" ${S}/>`,
  shirt: c => merged('<path d="M16,6 L6,13 L10,22 L14,20 V42 H34 V20 L38,22 L42,13 L32,6 Q24,12 16,6 Z"/>', c || '#FF7AB6') + `<polygon points="${starPts(24, 28, 6)}" fill="#fff"/>`,
  gift: c => merged('<rect x="6" y="18" width="36" height="24" rx="4"/><rect x="4" y="12" width="40" height="9" rx="3"/>', c || '#5EE0B0') + `<path d="M24,12 V42" stroke="#FF7AB6" stroke-width="6"/><path d="M24,12 Q14,2 11,8 Q9,13 24,12 Q34,2 37,8 Q39,13 24,12" fill="#FF7AB6" ${S}/>`,
  plus: () => `<path d="M24,10 V38 M10,24 H38" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  minus: () => `<path d="M10,24 H38" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  pencil: c => merged('<path d="M8,40 L10,30 L32,8 L40,16 L18,38 Z"/>', c || '#FFD23F') + `<path d="M8,40 L10,30 L18,38 Z" fill="#FFE3CC" ${S}/>`,
  trash: c => merged('<path d="M11,14 H37 L34,43 H14 Z"/><rect x="7" y="9" width="34" height="6" rx="3"/><rect x="19" y="4" width="10" height="6" rx="2"/>', c || '#ddd'),
  download: c => merged('<rect x="6" y="34" width="36" height="9" rx="4"/>', c || '#5EE0B0') + `<path d="M24,5 V28 M14,19 L24,29 L34,19" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  upload: c => merged('<rect x="6" y="34" width="36" height="9" rx="4"/>', c || '#5CC8FF') + `<path d="M24,29 V6 M14,15 L24,5 L34,15" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  crew: c => merged('<circle cx="16" cy="17" r="9"/><circle cx="33" cy="17" r="9"/><path d="M3,42 Q4,28 16,28 Q28,28 29,42 Z"/><path d="M20,42 Q21,28 33,28 Q45,28 45,42 Z"/>', c || '#5CC8FF'),
  boombox: c => merged('<rect x="3" y="14" width="42" height="28" rx="7"/><path d="M12,14 Q12,6 24,6 Q36,6 36,14" fill="none"/>', c || '#FF7AB6') + `<circle cx="14" cy="29" r="7" fill="#fff" ${S}/><circle cx="34" cy="29" r="7" fill="#fff" ${S}/><circle cx="14" cy="29" r="2.5" fill="${INK}"/><circle cx="34" cy="29" r="2.5" fill="${INK}"/><path d="M12,14 Q12,6 24,6 Q36,6 36,14" fill="none" ${S} stroke-width="4"/>`,
  flag: c => merged('<path d="M10,6 H38 L32,15 L38,24 H14 V44 H10 Z"/>', c || '#FF9F43') + `<polygon points="${starPts(23, 15, 5)}" fill="#fff"/>`,
  clock: c => merged('<circle cx="24" cy="24" r="19"/>', c || '#fff') + `<path d="M24,13 V24 L31,29" fill="none" ${S} stroke-width="4"/>`,
  sparkle: c => merged('<path d="M24,3 Q27,21 45,24 Q27,27 24,45 Q21,27 3,24 Q21,21 24,3 Z"/>', c || '#FFD23F'),
  pause: c => merged('<rect x="10" y="8" width="10" height="32" rx="3"/><rect x="28" y="8" width="10" height="32" rx="3"/>', c || '#fff'),
  skip: c => merged('<path d="M6,10 L22,24 L6,38 Z M22,10 L38,24 L22,38 Z"/><rect x="38" y="10" width="5" height="28" rx="2"/>', c || '#fff'),
  calm: c => merged('<circle cx="24" cy="24" r="20"/>', c || '#5EE0B0') + `<path d="M13,24 Q18,18 24,24 Q30,30 35,24" fill="none" ${S} stroke-width="4"/>`,
};

export function icon(name, color, cls = '') {
  const f = ICONS[name];
  if (!f) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 48 48" aria-hidden="true">${f(color)}</svg>`;
}

export const TYPE_ICON = { firstAsk: 'hand', words: 'words', kind: 'heart', rewind: 'rewind' };
export const TYPE_COLOR = { firstAsk: 'sky', words: 'mint', kind: 'pink', rewind: 'grape' };
export const TYPE_NAME = { firstAsk: 'First Ask', words: 'Used My Words', kind: 'Kind Move', rewind: 'Rewind' };
export const TYPE_SHOUT = { firstAsk: 'FIRST ASK!', words: 'USED MY WORDS!', kind: 'KIND MOVE!', rewind: 'REWIND!' };

// ------------------------------------------------------------------ toast / modal
let toastEl = null;
let toastTimer = null;
export function toast(msg, { action = null, ms = 3200 } = {}) {
  hideToast();
  toastEl = el(`<div class="toast" role="status"><span class="msg">${msg}</span></div>`);
  if (action) {
    const b = el(`<button class="btn small white">${esc(action.label)}</button>`);
    b.onclick = () => { hideToast(); action.fn(); };
    toastEl.appendChild(b);
  }
  document.body.appendChild(toastEl);
  if (ms) toastTimer = setTimeout(hideToast, ms);
  return toastEl;
}
export function hideToast() {
  clearTimeout(toastTimer);
  toastEl?.remove();
  toastEl = null;
}

export function modal(inner, { onClose = null, dismissable = true, cls = '' } = {}) {
  const ov = el(`<div class="overlay ${cls}"><div class="modal" role="dialog" aria-modal="true">${inner}</div></div>`);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ov.classList.add('leaving');
    setTimeout(() => ov.remove(), 220);
    onClose?.();
  };
  if (dismissable) ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  return { el: ov.querySelector('.modal'), close, overlay: ov };
}

export function confirmBox({ title, text = '', yes = 'Yes', no = 'Not now', yesCls = 'mint' }) {
  return new Promise(resolve => {
    const m = modal(`<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}<div class="row"><button class="btn white" data-a="no">${esc(no)}</button><button class="btn ${yesCls}" data-a="yes">${esc(yes)}</button></div>`,
      { onClose: () => resolve(false) });
    m.el.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      Sound.tap();
      if (a === 'yes') { resolve(true); m.close(); } else m.close();
    });
  });
}

// ------------------------------------------------------------------ time
export function timeAgo(ts, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  const d = new Date(ts), n = new Date(now);
  const days = Math.round((new Date(n.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return d.toLocaleDateString('en', { weekday: 'long' });
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
}
