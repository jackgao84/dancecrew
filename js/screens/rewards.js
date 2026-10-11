import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as FX from '../fx.js';
import { el, esc, icon, actions, go, confirmBox } from '../ui.js';
import { requirePin } from './pin.js';

export default function rewards(root, pid) {
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const s = State.get();
  const mine = s.redemptions.filter(r => r.pid === p.id).slice(-5).reverse();
  const screen = el(`<main class="screen rewards">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>Rewards</h1><div class="sub">Spend your stars on real-life treats</div></div>
      <span class="star-bank">${icon('star')}<b>${p.stars}</b></span>
    </header>
    <div class="reward-cards">${s.rewards.map(r => {
      const can = p.stars >= r.cost;
      return `<div class="rcard panel ${can ? 'yellow' : 'white'}">
        <span class="rc-emoji">${esc(r.icon)}</span>
        <b class="rc-name">${esc(r.name)}</b>
        <span class="tag">${icon('star')} ${r.cost}</span>
        ${can ? `<button class="btn pink" data-act="cash" data-id="${r.id}">Cash in!</button>`
          : `<div class="rc-need"><div class="meter" style="--p:${p.stars / r.cost};--fill:var(--yellow)"><i></i></div><small>${r.cost - p.stars} more star${r.cost - p.stars === 1 ? '' : 's'}</small></div>`}
      </div>`;
    }).join('')}</div>
    ${mine.length ? `<div class="panel mint-l"><h3>You cashed in</h3><ul class="plain">${mine.map(r => `<li>${esc(r.icon)} ${esc(r.name)}</li>`).join('')}</ul></div>` : ''}
    <p class="muted center small">Stars come from real-life points. XP never goes down — spending stars doesn’t touch your level.</p>
  </main>`);
  root.appendChild(screen);
  return actions(screen, {
    back: () => go('#/player/' + p.id),
    cash: async b => {
      const r = s.rewards.find(x => x.id === b.dataset.id);
      if (!r) return;
      const ok = await confirmBox({ title: `${esc(r.icon)} ${esc(r.name)}`, text: `Spend <b>${r.cost} stars</b>? A grown-up will say yes with the PIN.`, yes: 'Get a grown-up', no: 'Not yet', yesCls: 'pink' });
      if (!ok) return;
      if (!(await requirePin({ fresh: true, once: true }))) return;
      if (State.redeem(p.id, r.id)) {
        await FX.celebrateReward(p, r);
        go('#/rewards/' + p.id);
      }
    },
  });
}
