// First run: the crew leader (the kid) names things and designs an avatar,
// then a grown-up sets the PIN. Takes about 3 minutes.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import { avatarSVG } from '../avatar.js';
import { GAME_NAME_IDEAS, CREW_NAME_IDEAS, NPCS, randomAvatar } from '../content.js';
import { el, esc, icon, actions, reducedMotion } from '../ui.js';
import { avatarEditor } from './closet.js';
import { choosePin } from './pin.js';

export default function onboarding(root, onFinish) {
  const draft = {
    heroName: '',
    heroAvatar: { ...randomAvatar(), hair: 'crop', outfit: 'hoodie', outfitColor: '#5CC8FF' },
    gameName: '',
    crewName: '',
    others: [
      { label: 'Another kid', name: '', avatar: randomAvatar() },
      { label: 'A grown-up', name: '', avatar: randomAvatar() },
      { label: 'Another grown-up', name: '', avatar: randomAvatar() },
      { label: 'A grandparent', name: '', avatar: { ...randomAvatar(), hairColor: '#B8B4BE' } },
    ],
  };
  let step = 0;
  let offStep = null;
  const rm = reducedMotion();
  const screen = el('<main class="screen onboard"></main>');
  root.appendChild(screen);

  const progress = n => `<div class="steps" aria-label="Step ${n} of 6">${[1, 2, 3, 4, 5, 6].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

  function nameStep({ n, title, sub, value, ideas = [], placeholder, key, art = '' }) {
    screen.innerHTML = `${progress(n)}
      <div class="ob-card panel white pop-in">
        ${art}
        <h1>${title}</h1>
        ${sub ? `<p class="muted">${sub}</p>` : ''}
        <input class="field big" maxlength="${key === 'heroName' ? 20 : 28}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="words" enterkeyhint="next" aria-label="${esc(title)}">
        ${ideas.length ? `<div class="ideas">${ideas.map(i => `<button class="chip" data-act="idea" data-v="${esc(i)}">${esc(i)}</button>`).join('')}</div>` : ''}
        <div class="row between"><button class="btn white" data-act="back">${icon('back')} Back</button><button class="btn pink" data-act="next">Next ${icon('next')}</button></div>
      </div>`;
    const input = screen.querySelector('input');
    const sync = () => { screen.querySelector('[data-act=next]').disabled = !input.value.trim(); };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) screen.querySelector('[data-act=next]').click(); });
    sync();
    if (!value && matchMedia('(pointer: fine)').matches) input.focus();
    return actions(screen, {
      idea: b => { input.value = b.dataset.v; sync(); Sound.sparkle(); },
      back: () => show(step - 1),
      next: () => { draft[key] = input.value.trim(); show(step + 1); },
    });
  }

  const STEPS = [
    // 0 — welcome
    () => {
      const crew = [NPCS.kiko.avatar, draft.heroAvatar, NPCS.pip.avatar];
      screen.innerHTML = `
        <div class="welcome">
          <div class="welcome-stage">${crew.map((a, i) => `<div class="wd wd${i}">${avatarSVG(a, { expr: 'grin', cls: rm ? '' : ['mv-wave', 'mv-bounce', 'mv-pop'][i] })}</div>`).join('')}</div>
          <h1 class="big-title">Let’s start a<br>dance crew!</h1>
          <p class="lead">Train together. Level up for real. Get ready for the <b>Big Showcase</b>.</p>
          <button class="btn huge pink" data-act="go">${icon('play')} Let’s go!</button>
        </div>`;
      return actions(screen, { go: () => { Sound.unlock(); Sound.point('kind'); show(1); } });
    },
    // 1 — hero name
    () => nameStep({ n: 1, key: 'heroName', title: 'Hey, crew leader! What’s your name?', value: draft.heroName, placeholder: 'Your name',
      art: `<div class="ob-art">${avatarSVG(draft.heroAvatar, { expr: 'wink', crop: 'head' })}</div>` }),
    // 2 — avatar
    () => {
      screen.innerHTML = `${progress(2)}
        <div class="ob-head"><h1>Make your dancer, ${esc(draft.heroName)}!</h1><p class="muted">Pick hair, colours and kicks. You can change it any time.</p></div>
        <div class="editor-host"></div>
        <div class="row between"><button class="btn white" data-act="back">${icon('back')} Back</button><button class="btn pink" data-act="next">Looking fresh! ${icon('next')}</button></div>`;
      const offEd = avatarEditor(screen.querySelector('.editor-host'), draft.heroAvatar, {});
      const offA = actions(screen, { back: () => show(1), next: () => show(3) });
      return () => { offEd(); offA(); };
    },
    // 3 — game name
    () => nameStep({ n: 3, key: 'gameName', title: 'Name the game!', sub: 'This shows on the home screen.', value: draft.gameName, ideas: GAME_NAME_IDEAS, placeholder: 'Game name',
      art: `<div class="ob-art big-ic">${icon('sparkle')}</div>` }),
    // 4 — crew name
    () => nameStep({ n: 4, key: 'crewName', title: 'Name your dance crew!', sub: 'Everyone in the family is in it.', value: draft.crewName, ideas: CREW_NAME_IDEAS, placeholder: 'Crew name',
      art: `<div class="ob-art big-ic">${icon('crew')}</div>` }),
    // 5 — the rest of the crew
    () => {
      screen.innerHTML = `${progress(5)}
        <div class="ob-card panel white pop-in">
          <h1>Who else is in ${esc(draft.crewName)}?</h1>
          <p class="muted">Five dancers. Grown-ups too! Names or nicknames are fine. They can design their own look later.</p>
          <div class="crew-inputs">${draft.others.map((o, i) => `
            <label class="crew-input"><span class="mini">${avatarSVG(o.avatar, { crop: 'head' })}</span>
              <span class="ci-text"><b>${o.label}</b><input class="field" data-i="${i}" maxlength="20" value="${esc(o.name)}" placeholder="Name" autocomplete="off" autocapitalize="words"></span></label>`).join('')}
          </div>
          <div class="row between"><button class="btn white" data-act="back">${icon('back')} Back</button><button class="btn pink" data-act="next">Next ${icon('next')}</button></div>
        </div>`;
      const inputs = [...screen.querySelectorAll('input[data-i]')];
      const sync = () => {
        inputs.forEach(inp => { draft.others[inp.dataset.i].name = inp.value; });
        screen.querySelector('[data-act=next]').disabled = inputs.some(inp => !inp.value.trim());
      };
      inputs.forEach(inp => inp.addEventListener('input', sync));
      sync();
      return actions(screen, { back: () => show(4), next: () => show(6) });
    },
    // 6 — grown-up: PIN
    () => {
      screen.innerHTML = `${progress(6)}
        <div class="ob-card panel yellow pop-in">
          <div class="ob-art big-ic">${icon('lock')}</div>
          <h1>Grown-up time!</h1>
          <p>Hand the ${/iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 ? 'iPad' : 'device'} to a grown-up. Parents log real-life points and edit rewards with a 4-digit PIN.</p>
          <div class="row between"><button class="btn white" data-act="back">${icon('back')} Back</button><button class="btn grape" data-act="pin">${icon('lock', '#fff')} Set the PIN</button></div>
        </div>`;
      return actions(screen, {
        back: () => show(5),
        pin: async () => {
          const pin = await choosePin('Choose a 4-digit PIN');
          if (!pin) return;
          State.createGame({
            gameName: draft.gameName, crewName: draft.crewName, heroName: draft.heroName, heroAvatar: draft.heroAvatar,
            others: draft.others.map(o => ({ name: o.name, avatar: o.avatar })), pin,
          });
          show(7);
        },
      });
    },
    // 7 — ready
    () => {
      const ps = State.get().players;
      screen.innerHTML = `
        <div class="welcome">
          <h1 class="big-title">${esc(State.get().crewName)}<br>is ready!</h1>
          <div class="lineup">${ps.map((p, i) => `<div class="lu" style="--i:${i}">${avatarSVG(p.avatar, { expr: 'grin', cls: rm ? '' : ['mv-bounce', 'mv-wave', 'mv-pop', 'mv-bounce', 'mv-wave'][i] })}<span>${esc(p.name)}</span></div>`).join('')}</div>
          <p class="lead">Every good move in real life earns XP. Let’s see how the story starts…</p>
          <button class="btn huge pink" data-act="go">${icon('book')} Start the story</button>
        </div>`;
      Sound.levelUp();
      return actions(screen, { go: () => onFinish() });
    },
  ];

  function show(n) {
    offStep?.();
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    offStep = STEPS[step]();
    window.scrollTo(0, 0);
  }
  show(0);
  return () => offStep?.();
}
