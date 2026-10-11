import * as State from '../state.js';
import * as R from '../rules.js';
import { content } from '../data.js';
import { sceneSVG } from '../scenes.js';
import { el, esc, icon, actions, go } from '../ui.js';

export default function story(root) {
  const s = State.get();
  const pot = State.pot();
  const unlocked = R.chaptersUnlocked(pot);
  const screen = el(`<main class="screen story">
    <header class="topbar">
      <button class="icon-btn" data-act="home" aria-label="Home">${icon('home')}</button>
      <div class="title"><h1>Road to the Big Showcase</h1><div class="sub">Season 1 · the whole crew's XP unlocks each chapter</div></div>
    </header>
    <div class="chapters">${content.story.map((ch, i) => {
      const n = i + 1;
      const open = n <= unlocked;
      const seen = s.storySeen.includes(n);
      const need = R.CHAPTER_POT[i] - pot;
      return `<button class="chapter-card ${open ? '' : 'locked'}" data-act="${open ? 'open' : 'locked'}" data-n="${n}" aria-label="Chapter ${n}: ${open ? esc(ch.title) : 'locked'}">
        <span class="cc-art">${sceneSVG(ch.panels[0].bg)}<span class="cc-num">${n}</span>${open ? '' : `<span class="cc-lock">${icon('lock')}</span>`}</span>
        <span class="cc-text"><b>${open ? esc(ch.title) : 'Locked'}</b><small>${open ? esc(ch.blurb) : `${need.toLocaleString()} more crew XP`}</small></span>
        ${open && !seen ? '<span class="tag new">NEW</span>' : ''}${open && seen ? `<span class="cc-seen">${icon('check')}</span>` : ''}
      </button>`;
    }).join('')}</div>
  </main>`);
  root.appendChild(screen);
  return actions(screen, {
    home: () => go('#/home'),
    open: b => go('#/chapter/' + b.dataset.n),
    locked: b => { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); },
  });
}
