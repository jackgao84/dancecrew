// The crew rests after the daily session. Short screen time by design.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import { avatarSVG } from '../avatar.js';
import { el, esc, icon, actions, go } from '../ui.js';

export default function rest(root, pid) {
  const s = State.get();
  const p = State.player(pid) || s.players[0];
  const screen = el(`<main class="screen rest">
    <div class="night">
      <div class="moon">${icon('moon')}</div>
      <div class="stars-bg">${Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 53) % 100}%;top:${(i * 37) % 60}%;--d:${(i % 5) * 0.4}s"></i>`).join('')}</div>
      <div class="sleepers">${s.players.map((x, i) => `<div class="sleeper" style="--i:${i}"><span class="beanbag"></span>${avatarSVG(x.avatar, { expr: 'sleepy', cls: 'mv-sleep' })}</div>`).join('')}</div>
      <div class="zzz" aria-hidden="true"><b>z</b><b>z</b><b>Z</b></div>
    </div>
    <div class="panel white rest-card">
      <h1>Great session, ${esc(p.name)}!</h1>
      <p>Today’s mission and practice are done. Real-life good moves still count all day — every one earns XP and a ticket.</p>
      <p><b>${R.windDownActive(s) ? 'The Arcade opens again in the morning.' : p.tickets && (R.isAdult(p) || R.playSecondsLeft(s, p) >= 30) ? `The Arcade is open — you have ${p.tickets} ticket${p.tickets === 1 ? '' : 's'}.` : 'Come back tomorrow for a new mission.'}</b></p>
      <div class="row"><button class="btn pink" data-act="player">${icon('back')} My page</button><button class="btn white" data-act="home">${icon('home')} Home</button></div>
    </div>
  </main>`);
  root.appendChild(screen);
  Sound.chime();
  return actions(screen, { player: () => go('#/player/' + p.id), home: () => go('#/home') });
}
