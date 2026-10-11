// Renders one comic panel: scene + cast + props + speech bubbles.
import { avatarSVG } from './avatar.js';
import { sceneSVG, propSVG } from './scenes.js';
import { esc, reducedMotion } from './ui.js';
import { fillText } from './data.js';

export function actorsHTML(cast, lookup, { speaking = null } = {}) {
  const rm = reducedMotion();
  return cast.map(c => {
    const who = lookup(c.who);
    if (!who) return '';
    const move = !rm && c.move ? 'mv-' + c.move : (!rm ? 'mv-idle' : '');
    return `<div class="actor ${c.flip ? 'flip' : ''} ${speaking === c.who ? 'speaking' : ''}" data-who="${c.who}" style="left:${c.x}%">
      ${avatarSVG(who.avatar, { expr: c.expr || 'happy', cls: move + (c.expr === 'heated' && !rm ? ' mv-heated' : '') })}
    </div>`;
  }).join('');
}

export function panelHTML(panel, lookup) {
  const bubbles = (panel.say || []).map((b, i, arr) => {
    const actor = (panel.cast || []).find(c => c.who === b.who);
    const x = actor ? actor.x : 50;
    const left = Math.max(22, Math.min(78, x));
    const tail = Math.max(12, Math.min(88, 50 + (x - left) * 2.4));
    const low = i > 0 && Math.abs(x - ((panel.cast || []).find(c => c.who === arr[0].who)?.x ?? 50)) < 48;
    const who = lookup(b.who);
    return `<div class="bubble ${low ? 'low' : ''}" style="left:${left}%;--tail:${tail}%;animation-delay:${0.25 + i * 0.35}s">
      <b>${esc(who?.name || '')}</b>${esc(fillText(b.text, lookup))}</div>`;
  }).join('');
  const props = (panel.props || []).map(p => `<div class="prop prop-${p.type}" style="left:${p.x}%;top:${p.y}%">${propSVG(p.type)}</div>`).join('');
  return `<div class="comic-panel bg-${panel.bg}">
    ${sceneSVG(panel.bg)}
    ${props}
    <div class="cast">${actorsHTML(panel.cast || [], lookup)}</div>
    ${bubbles}
  </div>`;
}
