import * as State from '../state.js';
import * as Sound from '../sound.js';
import { avatarSVG } from '../avatar.js';
import { MOVES } from '../content.js';
import { el, esc, icon, actions, go } from '../ui.js';

export default function moves(root, pid) {
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const lv = State.level(p);
  let sel = State.unlockedMoves(p).slice(-1)[0] || MOVES[0];
  let beat = null;

  const screen = el(`<main class="screen moves">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>${esc(p.name)}’s Moves</h1><div class="sub">New moves unlock as you level up</div></div>
    </header>
    <div class="moves-layout">
      <section class="move-stage panel grape">
        <div class="ms-av allow-motion"></div>
        <div class="ms-info"><h2 class="ms-name"></h2><p class="ms-blurb"></p>
        <button class="btn" data-act="beat">${icon('note')} <span>Play a beat</span></button></div>
      </section>
      <section class="move-grid">${MOVES.map(m => {
        const locked = m.level > lv;
        return `<button class="move-card ${m.color} ${locked ? 'locked' : ''}" data-act="${locked ? 'locked' : 'pick'}" data-id="${m.id}">
          <span class="mc-av">${avatarSVG(p.avatar, { expr: locked ? 'focus' : 'happy' })}</span>
          <b>${esc(m.name)}</b>
          ${locked ? `<span class="mc-lock">${icon('lock')} Level ${m.level}</span>` : ''}
        </button>`;
      }).join('')}</section>
    </div>
  </main>`);
  root.appendChild(screen);

  const paint = () => {
    screen.querySelector('.ms-av').innerHTML = avatarSVG(p.avatar, { expr: 'grin', cls: 'mv-' + sel.id });
    screen.querySelector('.ms-name').textContent = sel.name;
    screen.querySelector('.ms-blurb').textContent = sel.blurb;
    screen.querySelectorAll('.move-card').forEach(c => c.classList.toggle('on', c.dataset.id === sel.id));
  };
  paint();
  const stopBeat = () => { beat?.stop(); beat = null; screen.querySelector('[data-act=beat] span').textContent = 'Play a beat'; };

  const off = actions(screen, {
    back: () => go('#/player/' + p.id),
    pick: b => { sel = MOVES.find(m => m.id === b.dataset.id); paint(); },
    locked: b => {
      const m = MOVES.find(x => x.id === b.dataset.id);
      Sound.soft();
      screen.querySelector('.ms-name').textContent = m.name;
      screen.querySelector('.ms-blurb').textContent = `Reach Level ${m.level} to learn this one. Every real-life point gets you closer!`;
    },
    beat: () => {
      if (beat) return stopBeat();
      beat = Sound.startBeat({ bpm: 94, bars: 8, groove: Math.floor(Math.random() * 3), countIn: 0 });
      screen.querySelector('[data-act=beat] span').textContent = 'Stop the beat';
      setTimeout(() => beat && Sound.now() > beat.end - 0.1 && stopBeat(), (beat.end - Sound.now()) * 1000 + 200);
    },
  });
  return () => { off(); stopBeat(); };
}
