// Ghost hand: shows (never tells) how to play in a game's first seconds.
//   const ghost = createGhost(host);
//   ghost.show({ type: 'tap' | 'hold' | 'swipe', x, y, dir: 'down', text: 'Tap to jump' });
//   ghost.hide();
// x / y are CSS pixels inside `host`. Text must stay one short line.
import { reducedMotion } from '../ui.js';

const HAND = `<svg viewBox="0 0 64 80" aria-hidden="true"><g fill="#fff" stroke="#3B2A4A" stroke-width="4" stroke-linejoin="round">
<path d="M24,40 L24,10 Q24,4 30,4 Q36,4 36,10 L36,32 L36,26 Q36,21 41,21 Q46,21 46,26 L46,34 L46,30 Q46,25 51,25 Q56,25 56,30 L56,54 Q56,74 38,76 L32,76 Q20,76 14,64 L6,48 Q3,42 8,39 Q13,37 16,42 L24,54 Z"/></g>
<path d="M28,12 L28,18" stroke="#3B2A4A" stroke-width="3" stroke-linecap="round" opacity=".35"/></svg>`;

export function createGhost(host) {
  const el = document.createElement('div');
  el.className = 'ghost';
  el.hidden = true;
  el.innerHTML = `<div class="ghost-ring"></div><div class="ghost-hand">${HAND}</div><div class="ghost-text"></div>`;
  host.appendChild(el);
  let timer = 0;
  return {
    show({ type = 'tap', x, y, dir = 'down', text = '', ms = 0 }) {
      clearTimeout(timer);
      el.hidden = false;
      el.className = `ghost g-${type} g-${dir}${reducedMotion() ? ' g-still' : ''}`;
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      el.querySelector('.ghost-text').textContent = text;
      el.querySelector('.ghost-text').hidden = !text;
      if (ms) timer = setTimeout(() => { el.hidden = true; }, ms);
    },
    hide() { clearTimeout(timer); el.hidden = true; },
    get visible() { return !el.hidden; },
    destroy() { clearTimeout(timer); el.remove(); },
  };
}
