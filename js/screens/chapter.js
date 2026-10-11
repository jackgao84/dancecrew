// Comic-panel cutscene player. Tap to advance; Skip is always available.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import * as FX from '../fx.js';
import { content, castLookup, fillText } from '../data.js';
import { panelHTML } from '../comic.js';
import { el, esc, icon, actions, go } from '../ui.js';

export default function chapter(root, nStr, mode) {
  const n = Number(nStr);
  const ch = content.story[n - 1];
  const firstRun = mode === 'first';
  const exit = () => go(firstRun ? '#/home' : '#/story');
  if (!ch || n > R.chaptersUnlocked(State.pot())) { go('#/story'); return; }
  const lookup = castLookup();
  let i = 0;

  const screen = el(`<main class="screen chapter">
    <header class="topbar">
      <button class="icon-btn" data-act="exit" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>Chapter ${n}: ${esc(ch.title)}</h1></div>
      <button class="btn small white" data-act="skip">${icon('skip')} Skip</button>
    </header>
    <div class="comic" data-act="next"></div>
    <div class="comic-nav">
      <button class="icon-btn" data-act="prev" aria-label="Previous">${icon('back')}</button>
      <div class="pdots">${ch.panels.map((_, k) => `<i data-k="${k}"></i>`).join('')}</div>
      <button class="btn pink" data-act="next"><span>Next</span> ${icon('next')}</button>
    </div>
  </main>`);
  root.appendChild(screen);
  const comic = screen.querySelector('.comic');

  const paint = () => {
    const p = ch.panels[i];
    comic.innerHTML = `${p.caption ? `<div class="caption">${esc(fillText(p.caption, lookup))}</div>` : ''}${panelHTML(p, lookup)}`;
    screen.querySelectorAll('.pdots i').forEach((d, k) => d.classList.toggle('on', k <= i));
    screen.querySelector('.comic-nav .btn span').textContent = i === ch.panels.length - 1 ? 'The end!' : 'Next';
    screen.querySelector('[data-act=prev]').style.visibility = i ? 'visible' : 'hidden';
  };

  const finish = async () => {
    State.markChapterSeen(n);
    if (ch.finale) {
      await FX.showcase(State.get().players, { title: 'SEASON COMPLETE!', sub: 'The Big Showcase', bars: 6 });
    } else {
      Sound.levelUp();
    }
    const done = el(`<div class="chapter-done panel yellow pop-in">
      <h2>Chapter ${n} complete!</h2>
      ${content.story[n] ? `<p>${n + 1 <= R.chaptersUnlocked(State.pot()) ? 'The next chapter is ready too!' : 'Keep earning real-life XP as a crew to unlock the next chapter.'}</p>` : '<p>Season 1 is done. What a crew!</p>'}
      <button class="btn pink" data-act="exit">${firstRun ? `${icon('home')} Let's go!` : `${icon('book')} Back to the story`}</button>
    </div>`);
    comic.innerHTML = '';
    comic.appendChild(done);
    screen.querySelector('.comic-nav').hidden = true;
  };

  paint();
  return actions(screen, {
    exit,
    skip: () => { State.markChapterSeen(n); exit(); },
    prev: () => { if (i > 0) { i--; Sound.whoosh(); paint(); } },
    next: (b, e) => {
      if (e.target.closest('.chapter-done')) return;
      if (i < ch.panels.length - 1) { i++; Sound.whoosh(); paint(); } else finish();
    },
  });
}
