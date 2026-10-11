import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import { avatarSVG } from '../avatar.js';
import { content } from '../data.js';
import { el, esc, icon, actions, go, toast } from '../ui.js';
import { GAMES, gameById } from '../games/registry.js';
import { sparkline, improvedBadge } from '../games/progress.js';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ---- "My Arcade progress" (stage 8): this player's own bests + last 7 rounds. Never other players.
/**
 * One row per progress key this player has played: per game, per tier, per co-op partner
 * ("with Mum"). Sorted in Arcade order, then most recently played. `lookup` finds a partner by id.
 */
export function progressRows(p, lookup = State.player) {
  const order = id => { const i = GAMES.findIndex(g => g.id === id); return i < 0 ? GAMES.length : i; };
  return Object.entries(p.games || {})
    .filter(([, g]) => g?.rounds?.length)
    .map(([key, g]) => {
      const [id, ...rest] = key.split('.');
      const game = gameById(id);
      const sub = rest.join('.');
      let label = '';
      if (sub.includes('+')) {
        const other = sub.split('+').find(x => x !== p.id);
        label = `Crew best with ${lookup(other)?.name || 'a friend'}`;
      } else if (sub) label = game?.tiers?.find(t => t.id === sub)?.label || sub[0].toUpperCase() + sub.slice(1);
      const st = State.gameStats(p, key);
      return {
        key, id, title: game?.title || id, icon: game?.icon || 'star', color: game?.color || 'yellow', label,
        best: st.best, scores: st.scores, improved: st.improvedCount, last: g.rounds.at(-1)?.t || 0,
      };
    })
    .sort((a, b) => order(a.id) - order(b.id) || b.last - a.last);
}

function progressSection(p) {
  const rows = progressRows(p);
  if (!rows.length) return '';
  return `<section class="pp-progress panel white" aria-label="My Arcade progress">
    <h2>${icon('trophy')} My Arcade progress</h2>
    <ul class="ap-list">${rows.map(r => `<li class="ap-row" data-key="${esc(r.key)}">
      <span class="ap-ic ${esc(r.color)}">${icon(r.icon)}</span>
      <span class="ap-name"><b>${esc(r.title)}</b>${r.label ? `<small>${esc(r.label)}</small>` : ''}</span>
      <span class="ap-best"><b>${r.best.toLocaleString()}</b><small>My best</small></span>
      <span class="ap-chart">${sparkline(r.scores, { best: r.best, label: `${r.title}: my last rounds` })}${improvedBadge(r.improved)}</span>
    </li>`).join('')}</ul>
  </section>`;
}

export function nextMission(p) {
  const list = content.missions;
  return list.find(m => !p.missions[m.id]) || null;
}

export default function player(root, pid) {
  State.settleTickets();
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const s = State.get();
  const lp = R.levelProgress(p.xp);
  const td = State.today(p);
  const wk = R.weekSummary(s, p.id);
  const todayIdx = wk.days.indexOf(td.day);
  const moves = State.unlockedMoves(p);
  const nm = nextMission(p);

  const missionBtn = td.missionDone
    ? `<button class="task done" data-act="doneToday">${icon('check')}<span><b>Today’s mission</b><small>Done — nice work!</small></span></button>`
    : `<button class="task ready" data-act="mission">${icon('flame')}<span><b>Today’s mission</b><small>${nm ? esc(nm.title) : 'Replay a favourite'}</small></span>${nm ? '<span class="tag new">NEW</span>' : ''}</button>`;
  const practiceBtn = td.practiceDone
    ? `<button class="task done" data-act="doneToday">${icon('check')}<span><b>Practice session</b><small>${td.practiceSaved ? 'Done! Today’s is saved for tomorrow' : 'Done for today'}</small></span></button>`
    : td.practiceSaved
      ? `<button class="task saved" data-act="practiceSaved">${icon('moon')}<span><b>Practice session</b><small>Earned! Saved for tomorrow</small></span></button>`
    : td.practiceReady
      ? `<button class="task ready" data-act="practice">${icon('boombox')}<span><b>Practice session</b><small>Unlocked! Let’s groove</small></span><span class="tag new">GO</span></button>`
      : `<button class="task locked" data-act="practiceLocked">${icon('lock')}<span><b>Practice session</b><small>Unlocks at 3 real-life points today</small></span></button>`;
  const pending = R.pendingTickets(s, p.id);
  const capped = !R.isAdult(p) && R.playSecondsLeft(s, p) < 30;
  const arcadeOpen = !R.windDownActive(s) && !capped;
  const arcadeSub = R.windDownActive(s) ? 'Cooling down till morning'
    : capped ? 'Game time’s done for today — tickets are safe'
    : `${p.tickets} ticket${p.tickets === 1 ? '' : 's'}${pending ? ` (+${pending} coming)` : ''}${p.warmupDay !== td.day ? ' · free warm-up!' : ''}`;

  const screen = el(`<main class="screen player-page">
    <header class="topbar">
      <button class="icon-btn" data-act="home" aria-label="Home">${icon('home')}</button>
      <div class="title"><h1>${esc(p.name)}</h1><div class="sub">${esc(s.crewName)}</div></div>
      <span class="lv-badge" aria-label="Level ${lp.level}"><small>LEVEL</small>${lp.level}</span>
    </header>

    ${!p.designed ? `<button class="banner panel pink" data-act="closet">${icon('shirt')}<b>Design your look!</b><span>Tap here to make your dancer</span></button>` : ''}
    ${td.resting ? `<button class="banner panel grape" data-act="rest">${icon('moon')}<b>Today’s crew session is done!</b><span>Mission and practice — great work.</span></button>` : ''}

    <div class="pp-grid">
      <section class="pp-hero panel sky-l">
        <button class="pp-avatar" data-act="dance" aria-label="Make ${esc(p.name)} dance">${avatarSVG(p.avatar, { expr: 'happy', cls: 'mv-idle' })}</button>
        <p class="tiny-hint">Tap to dance!</p>
        <div class="meter-label"><span>${icon('bolt')} ${p.xp.toLocaleString()} XP</span><span>${lp.span - lp.into} to Level ${lp.level + 1}</span></div>
        <div class="meter" style="--p:${lp.into / lp.span}"><i></i></div>
        <div class="stars-row">
          <span class="stars-count">${icon('star')}<b>${p.stars}</b> stars</span>
          <button class="btn small pink" data-act="rewards">${icon('gift')} Rewards</button>
        </div>
      </section>

      <div class="pp-side">
      <section class="pp-today panel yellow-l">
        <h2>Today</h2>
        <div class="goal">
          ${[0, 1, 2].map(i => `<span class="pip ${i < td.pts ? 'on' : ''}">${i < td.pts ? icon('star') : ''}</span>`).join('')}
          <p><b>${Math.min(td.pts, 3)} of 3</b> real-life points${td.pts > 3 ? ` <span class="tag">+${td.pts - 3} extra!</span>` : ''}</p>
        </div>
        ${missionBtn}
        ${practiceBtn}
      </section>

      <section class="pp-week panel mint-l">
        <h2>This week</h2>
        <div class="week-dots">${wk.perDay.map((pts, i) => `<span class="wd ${pts >= 3 ? 'goal' : pts > 0 ? 'some' : ''} ${i === todayIdx ? 'today' : ''}"><b>${DOW[i]}</b><i>${pts >= 3 ? icon('star') : pts || ''}</i></span>`).join('')}</div>
        <p class="small"><b>${wk.total} points</b> this week · ${wk.goalDays} goal day${wk.goalDays === 1 ? '' : 's'}. Every week is a fresh start!</p>
      </section>

      <section class="pp-links">
        <button class="big-link panel pink" data-act="closet">${icon('shirt')}<span><b>Closet</b><small>${p.newItems.length ? p.newItems.length + ' new!' : 'Change your look'}</small></span>${p.newItems.length ? '<span class="tag new">NEW</span>' : ''}</button>
        <button class="big-link panel grape" data-act="moves">${icon('note', '#FFD23F')}<span><b>Moves</b><small>${moves.length} of 8 unlocked</small></span></button>
        <button class="big-link panel orange-l arcade-link" data-act="arcade">${icon('boombox')}<span><b>Arcade</b><small>${esc(arcadeSub)}</small></span>${p.warmupDay !== td.day && arcadeOpen ? '<span class="tag new">PLAY</span>' : ''}</button>
      </section>
      </div>
      ${progressSection(p)}
    </div>
  </main>`);
  root.appendChild(screen);

  const avBox = screen.querySelector('.pp-avatar');
  let danceTimer = null;
  return actions(screen, {
    home: () => go('#/home'),
    closet: () => go('#/closet/' + p.id),
    moves: () => go('#/moves/' + p.id),
    rewards: () => go('#/rewards/' + p.id),
    mission: () => go('#/mission/' + p.id),
    practice: () => go('#/practice/' + p.id),
    rest: () => go('#/rest/' + p.id),
    doneToday: () => toast('Done for today — come back tomorrow for more!'),
    practiceSaved: () => toast('You earned it! It’ll be waiting tomorrow morning.'),
    arcade: () => go('#/arcade/' + p.id),
    practiceLocked: b => {
      Sound.soft();
      b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
    },
    dance: () => {
      const m = moves[Math.floor(Math.random() * moves.length)] || { id: 'bounce' };
      avBox.innerHTML = avatarSVG(p.avatar, { expr: 'grin', cls: 'mv-' + m.id });
      Sound.point('kind');
      clearTimeout(danceTimer);
      danceTimer = setTimeout(() => { avBox.innerHTML = avatarSVG(p.avatar, { expr: 'happy', cls: 'mv-idle' }); }, 2600);
    },
  });
}
