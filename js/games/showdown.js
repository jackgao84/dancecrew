// SHOWDOWN — the weekly boss. The friendly Neon Owls (Pip, Dash, Kiko) call a move sequence on
// four big pads to the beat, and the player copies it. A slip is never the end: "Run it back!"
// and the Owl replays it — slower with the ghost hand after 2 slips, one move shorter after 3 —
// so a player who keeps going always gets there. Rules and worked numbers: showdown-logic.js.
//
// DOM for the stage, avatars and pads (only the calling Owl + the player are animated), one
// canvas on top for sparks and pops, one rAF loop, no State writes per frame.
import { avatarSVG, INK } from '../avatar.js';
import { NPCS } from '../content.js';
import { sceneSVG } from '../scenes.js';
import { esc, icon } from '../ui.js';
import { weekKey } from '../rules.js';
import { createCanvas, startLoop, pointerInput, createParticles, createPops, createShake, COLORS } from './engine.js';
import { startRhythm } from './rhythm.js';
import * as SD from './showdown-logic.js';

const OWLS = ['pip', 'dash', 'kiko'];
const HELP_IDLE = 4; // seconds without a tap before the ghost hand points at the next pad

// ---------------------------------------------------------------- art
const M = (shapes, fill = '#fff', sw = 7) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const ln = (d, w = 4, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
function burstPts(cx, cy, r, inner, n) {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return p.join(' ');
}
const HAND = '<rect x="13" y="10" width="7" height="20" rx="3.5"/><rect x="20" y="5" width="7" height="24" rx="3.5"/><rect x="27" y="7" width="7" height="22" rx="3.5"/>'
  + '<rect x="34" y="12" width="6" height="18" rx="3"/><rect x="13" y="22" width="27" height="21" rx="9"/><rect x="4" y="25" width="16" height="8" rx="4" transform="rotate(-38 12 29)"/>';
const PAD_ART = {
  clap: `<g transform="translate(0 15) rotate(24 26 26) scale(.8)">${M(HAND, '#fff', 8)}</g>`
    + `<g transform="translate(64 15) scale(-1 1) rotate(24 26 26) scale(.8)">${M(HAND, '#fff', 8)}</g>`
    + ln('M32,3 L32,10') + ln('M19,7 L23,13') + ln('M45,7 L41,13'),
  stomp: M('<path d="M7,41 Q7,31 17,30 L27,30 Q31,19 41,19 L46,19 Q52,19 52,27 L52,33 Q59,35 59,42 L59,46 Q59,50 55,50 L11,50 Q7,50 7,46 Z"/>')
    + `<path d="M7,44 L59,44 L59,46 Q59,50 55,50 L11,50 Q7,50 7,46 Z" fill="#FF7AB6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
    + ln('M31,29 L38,32 M34,24 L41,27', 3) + ln('M3,58 L11,55') + ln('M61,58 L53,55') + ln('M32,61 L32,56'),
  spin: ln('M50,38 A19,19 0 1 1 42,15', 13) + ln('M50,38 A19,19 0 1 1 42,15', 6, '#fff')
    + M('<path d="M34,7 L53,11 L42,26 Z"/>', '#fff', 6)
    + M(`<polygon points="${burstPts(31, 33, 8, 4, 5)}"/>`, '#FFD23F', 5),
  pop: M(`<polygon points="${burstPts(32, 33, 28, 15, 9)}"/>`, '#fff', 6)
    + M('<circle cx="32" cy="33" r="7"/>', '#FFD23F', 5) + ln('M24,19 L26,22', 3, '#fff'),
};

const SIGN = `<svg viewBox="0 0 184 84" aria-hidden="true">
  <rect x="3" y="3" width="178" height="78" rx="20" fill="#2B2045" stroke="${INK}" stroke-width="5"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#FF7AB6" stroke-width="9" opacity=".3"><path d="M22,26 L28,34 M58,26 L52,34"/><ellipse cx="40" cy="45" rx="19" ry="20"/></g>
    <g stroke="#FF7AB6" stroke-width="3.5"><path d="M22,26 L28,34 M58,26 L52,34"/><ellipse cx="40" cy="45" rx="19" ry="20"/></g>
    <g stroke="#5CC8FF" stroke-width="8" opacity=".3"><circle cx="33" cy="42" r="6"/><circle cx="47" cy="42" r="6"/></g>
    <g stroke="#5CC8FF" stroke-width="3"><circle cx="33" cy="42" r="6"/><circle cx="47" cy="42" r="6"/></g>
  </g>
  <circle cx="33" cy="42" r="2.2" fill="#D4F0FF"/><circle cx="47" cy="42" r="2.2" fill="#D4F0FF"/>
  <path d="M37,51 L43,51 L40,57 Z" fill="#FFD23F"/>
  <g font-weight="900" font-size="25" letter-spacing="1" text-anchor="middle">
    <text x="118" y="40" fill="none" stroke="#5EE0B0" stroke-width="7" opacity=".3">NEON</text>
    <text x="118" y="40" fill="#D2F7E8" stroke="#5EE0B0" stroke-width="1.5">NEON</text>
    <text x="118" y="68" fill="none" stroke="#FFD23F" stroke-width="7" opacity=".3">OWLS</text>
    <text x="118" y="68" fill="#FFF0B3" stroke="#FFD23F" stroke-width="1.5">OWLS</text>
  </g></svg>`;

// Dance moves on the SVG avatar parts (Web Animations: no class juggling, no forced layout).
const DANCE = {
  clap: {
    armL: ['rotate(18deg)', 'rotate(-60deg)', 'rotate(-48deg)', 'rotate(0deg)'],
    armR: ['rotate(-18deg)', 'rotate(60deg)', 'rotate(48deg)', 'rotate(0deg)'],
    all: ['none', 'translateY(3px) scale(1.05, .95)', 'none', 'none'],
  },
  stomp: {
    legL: ['none', 'translateY(-18px) rotate(16deg)', 'translateY(2px)', 'none'],
    all: ['none', 'translateY(-8px) scale(.97, 1.04)', 'translateY(5px) scale(1.1, .9)', 'none'],
    armL: ['none', 'rotate(46deg)', 'rotate(12deg)', 'none'],
    armR: ['none', 'rotate(-46deg)', 'rotate(-12deg)', 'none'],
  },
  spin: {
    all: ['none', 'translateY(-10px) scaleX(.12)', 'translateY(-14px) scaleX(-1)', 'translateY(-8px) scaleX(.12)', 'none'],
    armL: ['none', 'rotate(84deg)', 'rotate(84deg)', 'rotate(84deg)', 'none'],
    armR: ['none', 'rotate(-84deg)', 'rotate(-84deg)', 'rotate(-84deg)', 'none'],
  },
  pop: {
    torso: ['none', 'translateY(-6px) scale(1.06)', 'none'],
    armL: ['none', 'translateY(-10px) rotate(30deg)', 'none'],
    armR: ['none', 'translateY(-10px) rotate(-30deg)', 'none'],
    hd: ['none', 'translateY(-5px) rotate(-8deg)', 'none'],
    all: ['none', 'translateY(3px) scale(1.06, .94)', 'none'],
  },
  cheer: {
    all: ['none', 'translateY(-22px) scale(.96, 1.05)', 'translateY(4px) scale(1.08, .93)', 'translateY(-10px)', 'none'],
    armL: ['none', 'rotate(140deg)', 'rotate(150deg)', 'rotate(130deg)', 'none'],
    armR: ['none', 'rotate(-140deg)', 'rotate(-150deg)', 'rotate(-130deg)', 'none'],
  },
};
const PARTS = ['all', 'armL', 'armR', 'legL', 'legR', 'hd', 'torso'];

// ---------------------------------------------------------------- end-screen extras
export function revealHTML(item, p, rm) {
  if (!item) {
    return `<div class="sd-reveal trophy"><span class="sd-reveal-art">${icon('trophy')}</span>
      <p class="sd-reveal-text"><b>Showdown trophy ×${p.showdownWins || 1}</b><small>Every rare item is yours. Crew legend!</small></p></div>`;
  }
  const av = { ...p.avatar, [item.slot]: item.id };
  // Zoom on the prize: the head for hats, hair and faces, the feet for shoes, head-to-waist for outfits.
  const crop = { hair: 'head', head: 'head', face: 'head', shoes: 'feet' }[item.slot] || null;
  const bust = item.slot === 'outfit';
  let art = avatarSVG(av, { expr: 'proud', crop, cls: rm ? '' : 'mv-cheer', label: esc(`${p.name} wearing ${item.name}`) });
  if (bust) art = art.replace(/viewBox="[^"]*"/, 'viewBox="24 36 152 200"');
  return `<div class="sd-reveal">
    <span class="sd-reveal-art ${bust ? 'bust' : crop || ''}"><i class="sd-rays"></i>${art}</span>
    <p class="sd-reveal-text"><span class="sd-rare">${icon('sparkle')} Rare item</span><b>${esc(item.name)}</b>
      <small>A gift from the Neon Owls. It's in your closet!</small></p></div>`;
}
/** Out of time: where the next try this week starts, compared with where this one started. */
export function savedHTML(reached, from) {
  const pips = SD.LENGTHS.map((_, i) => `<i class="${i < reached ? 'done' : ''}">${i < reached ? icon('star') : i + 1}</i>`).join('');
  const line = reached > 0 ? `Next time this week, you start at round ${reached + 1}` : 'The Owls are ready for a rematch this week';
  const gained = reached - from;
  const vs = gained > 0 ? `${gained === 1 ? 'One more round' : `${gained} more rounds`} beaten: furthest yet this week!`
    : from > 0 ? `Round ${from + 1} is still saved for you` : '';
  return `<div class="sd-saved"><span class="sd-pips">${pips}</span><b>${esc(line)}</b>${vs ? `<small>${esc(vs)}</small>` : ''}</div>`;
}

export default {
  id: 'showdown',
  title: 'Showdown',
  blurb: 'Copy the Neon Owls, move for move.',
  icon: 'trophy',
  color: 'yellow',
  kind: 'showdown',
  rhythm: true,
  ready: true,

  create(host, ctx) {
    const { player, state: State, sound: Sound } = ctx;
    const rm = !!ctx.reducedMotion;
    const speed = ctx.speed || 1;
    const startSeq = State.showdownStartSeq(player);
    // The Showdown score is the week's running total: points banked by earlier tries this week.
    const prog = player.showdownProgress;
    const banked = prog?.week === weekKey() ? Math.max(0, Math.round(prog.score || 0)) : 0;
    const adapt = ctx.adapt({ min: 0, max: 1, start: 0.5, step: 0.25, window: 4, missesToEase: 2, hitsToRamp: 6, cooldown: 4 });
    const game = SD.createShowdown({ seed: ctx.seed, startSeq, adapt });
    const keyIdx = Math.floor(ctx.rng() * 4);
    const base = [60, 62, 65, 67][keyIdx]; // pad notes sit in the song's key

    const root = document.createElement('div');
    root.className = 'sd';
    root.innerHTML = `
      <div class="sd-stage">
        ${sceneSVG('stage')}
        <div class="sd-sign">${SIGN}</div>
        <div class="sd-rounds" aria-hidden="true">${SD.LENGTHS.map((_, i) => `<i>${i + 1}</i>`).join('')}</div>
        ${OWLS.map(id => `<div class="sd-owl" data-owl="${id}" data-slot="backL"><span class="sd-spot"></span><div class="sd-av"></div><span class="sd-name">${esc(NPCS[id].name)}</span></div>`).join('')}
        <div class="sd-me"><span class="sd-spot"></span><div class="sd-av"></div><span class="sd-name">${esc(player.name)}</span></div>
        <div class="sd-bubble" hidden></div>
        <div class="sd-seq" aria-hidden="true"></div>
        <div class="sd-callout" role="status" hidden><b></b><small></small></div>
      </div>
      <div class="sd-pads" data-mode="watch">${SD.PADS.map((p, i) => `
        <div class="sd-pad" data-pad="${i}" role="button" aria-label="${p.name}" style="--c:${p.hex};--cl:${p.light}">
          <span class="sd-glow"></span><span class="sd-pic"><svg viewBox="0 0 64 64" aria-hidden="true">${PAD_ART[p.id]}</svg></span><b>${p.name}</b>
        </div>`).join('')}
      </div>`;
    host.appendChild(root);
    const view = createCanvas(host);
    view.canvas.classList.add('sd-fx');
    const g = view.g;
    const fx = createParticles(240);
    const pops = createPops();
    const shake = createShake();

    const q = sel => root.querySelector(sel);
    const stage = q('.sd-stage');
    const padsEl = q('.sd-pads');
    const pads = [...root.querySelectorAll('.sd-pad')];
    const glows = pads.map(p => p.querySelector('.sd-glow'));
    const seqEl = q('.sd-seq');
    const calloutEl = q('.sd-callout');
    const bubbleEl = q('.sd-bubble');
    const signEl = q('.sd-sign');
    const roundPips = [...root.querySelectorAll('.sd-rounds i')];
    const owlEls = Object.fromEntries(OWLS.map(id => [id, q(`[data-owl="${id}"]`)]));
    const meEl = q('.sd-me');

    // ------------------------------------------------------------ avatars (≤ 2 animated)
    const parts = new Map(); // who → { all, armL, … }
    const exprOf = {};
    let caller = null;
    function paint(who, expr) {
      const animated = who === 'me' || who === caller;
      const key = expr + (animated ? '*' : '');
      if (exprOf[who] === key) return;
      exprOf[who] = key;
      const box = (who === 'me' ? meEl : owlEls[who]).querySelector('.sd-av');
      const av = who === 'me' ? player.avatar : NPCS[who].avatar;
      box.innerHTML = avatarSVG(av, { expr, cls: animated && !rm ? 'mv-idle' : 'sd-still' });
      const svg = box.firstElementChild;
      parts.set(who, Object.fromEntries(PARTS.map(k => [k, svg.querySelector('.av-' + k)])));
    }
    function dance(who, move) {
      if (rm) return;
      const p = parts.get(who);
      const d = DANCE[move];
      if (!p || !d) return;
      const ms = move === 'cheer' ? 900 / speed : Math.max(140, Math.min(520, (game.interval * rhythm.spb * 1000 * 0.95) / speed));
      for (const k in d) p[k]?.animate(d[k].map(transform => ({ transform })), { duration: ms, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    }
    function setCaller(id) {
      if (caller === id) return;
      const prev = caller;
      caller = id;
      const backs = OWLS.filter(o => o !== id);
      owlEls[id].dataset.slot = 'front';
      owlEls[backs[0]].dataset.slot = 'backL';
      owlEls[backs[1]].dataset.slot = 'backR';
      if (prev) paint(prev, 'happy');
      paint(id, 'grin');
    }

    // ------------------------------------------------------------ layout
    let rects = [];
    const P = { stageX: 0, stageY: 0, sw: 1, sh: 1, feet: 0, avh: 0, crewX: 0, meX: 0, narrow: false, banner: 0, bubble: 60 };
    function layout() {
      const hr = host.getBoundingClientRect();
      rects = pads.map(p => {
        const r = p.getBoundingClientRect();
        const ic = p.querySelector('.sd-pic').getBoundingClientRect();
        const x = r.left - hr.left, y = r.top - hr.top;
        return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2, icX: ic.left - hr.left + ic.width / 2, icY: ic.top - hr.top, icH: ic.height };
      });
      const sr = stage.getBoundingClientRect();
      const sw = stage.clientWidth, sh = stage.clientHeight;
      const k = Math.max(sw / 800, sh / 450);           // the scene is drawn "slice"
      const offY = (sh - 450 * k) / 2;
      const feet = Math.min(sh - 8, offY + 372 * k);    // stand on the stage floor
      const narrow = sw < 600;
      let avh = Math.min(feet - (narrow ? 64 : 70), sw * 0.5);
      const bubble = Math.min(82, Math.max(50, avh * 0.27)) + 14; // the Owl's move bubble sits above the head
      avh = Math.max(80, Math.min(avh, feet - bubble - 8));
      const avw = (avh * 2) / 3;
      const crewX = Math.max(sw * 0.27, avw * 0.98);
      const meX = Math.min(sw * 0.76, sw - avw * 0.56);
      const banner = Math.max(0, offY + 43 * k);
      Object.assign(P, { stageX: sr.left - hr.left, stageY: sr.top - hr.top, sw, sh, feet, avh, crewX, meX, narrow, banner, bubble });
      stage.classList.toggle('narrow', narrow);
      stage.classList.toggle('mid', !narrow && sw < 820);
      const st = stage.style;
      st.setProperty('--avh', avh.toFixed(1) + 'px');
      st.setProperty('--feet', (sh - feet).toFixed(1) + 'px');
      st.setProperty('--crew-x', crewX.toFixed(1) + 'px');
      st.setProperty('--me-x', meX.toFixed(1) + 'px');
      st.setProperty('--banner', banner.toFixed(1) + 'px'); // under the scene's bulb banner
      placeCallout();
    }
    view.onResize = () => layout();
    layout();
    const headOf = x => ({ x: P.stageX + x, y: P.stageY + P.feet - P.avh * 0.82 });

    // ------------------------------------------------------------ small UI helpers
    let clockNow = 0;
    let calloutUntil = 0;
    // The callout goes where it hides nobody: clear of every head, the Owl's move bubble, the dots
    // pill and the sign, as near the middle of the stage as it can. Searched once per callout.
    function placeCallout() {
      if (calloutEl.hidden) return;
      const { sw, sh, feet, avh, crewX, meX, narrow, banner, bubble } = P;
      const w = calloutEl.offsetWidth, h = calloutEl.offsetHeight;
      const avw = (avh * 2) / 3;
      const head = feet - avh - 4;      // the front Owl's and the player's hair
      const back = feet - avh * 0.76;   // the two Owls at the back
      const top = banner + (narrow ? 5 + 32 : 6 + 42) + 4; // under the dots pill
      const signW = narrow ? 0 : sw < 820 ? 126 : 150;
      const keepOut = [
        [crewX - avw * 0.46, head, crewX + avw * 0.46, sh],
        [crewX - bubble / 2 - 4, head - bubble - 16, crewX + bubble / 2 + 4, head],
        [crewX + avw * 0.2, back, crewX + avw * 0.9, sh],
        [crewX - avw * 0.9, back, crewX - avw * 0.2, sh],
        [meX - avw * 0.46, head, meX + avw * 0.46, sh],
        [0, 0, signW + 16, signW * 0.46 + 12],
      ];
      const px = (crewX + avw * 0.9 + meX - avw * 0.46) / 2; // the gap between the Owls and the player
      const py = (top + feet - avh * 0.45) / 2;
      let best = null, bestCost = Infinity;
      for (let cy = top + h / 2; cy <= feet - h / 2; cy += 6) {
        for (let cx = w / 2 + 6; cx <= sw - w / 2 - 6; cx += 8) {
          const l = cx - w / 2, t = cy - h / 2, r = cx + w / 2, b = cy + h / 2;
          let hit = 0;
          for (const [x0, y0, x1, y1] of keepOut) hit += Math.max(0, Math.min(r, x1) - Math.max(l, x0)) * Math.max(0, Math.min(b, y1) - Math.max(t, y0));
          const cost = hit * 20 + Math.abs(cx - px) + Math.abs(cy - py) * 0.6;
          if (cost < bestCost) { bestCost = cost; best = [cx, cy]; }
        }
      }
      const cs = calloutEl.style;
      if (!best) { cs.left = cs.top = ''; return; }
      cs.left = best[0].toFixed(1) + 'px';
      cs.top = best[1].toFixed(1) + 'px';
    }
    function callout(text, sub = '', tone = 'yellow', secs = 1.3) {
      calloutEl.querySelector('b').textContent = text;
      const sm = calloutEl.querySelector('small');
      sm.textContent = sub;
      sm.hidden = !sub;
      calloutEl.dataset.tone = tone;
      calloutEl.hidden = false;
      placeCallout();
      if (!rm) calloutEl.animate([{ transform: 'translate(-50%, -50%) scale(.35)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.12)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], { duration: 380, easing: 'ease-out' });
      calloutUntil = clockNow + secs;
    }
    let dots = [];
    let pendEl = null;
    function resetDots(n) {
      seqEl.innerHTML = '<i></i>'.repeat(n) + '<b class="sd-pend" hidden></b>';
      dots = [...seqEl.querySelectorAll('i')];
      pendEl = seqEl.querySelector('.sd-pend');
      showPending();
    }
    // The sequence's move points wait on the dots ("+450") and join the HUD score when it's beaten,
    // so the score on screen only ever goes up — even when the clock runs out mid-sequence.
    function showPending() {
      if (!pendEl) return;
      const n = game.pending;
      pendEl.hidden = !(n > 0); // never a "+0"
      pendEl.textContent = n > 0 ? `+${n.toLocaleString()}` : '';
    }
    function fillDot(i, pad) {
      const d = dots[i];
      if (!d) return;
      d.style.setProperty('--c', SD.PADS[pad].hex);
      d.classList.add('on');
      if (!rm) d.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.25)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    }
    function rewindDots() {
      dots.slice().reverse().forEach((d, n) => {
        if (!d.classList.contains('on')) return;
        if (rm) { d.classList.remove('on'); return; }
        d.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-300deg) scale(.5)' }], { duration: 300, delay: n * 60, easing: 'ease-in' })
          .onfinish = () => d.classList.remove('on');
      });
    }
    function setRound(idx) {
      roundPips.forEach((el, i) => { el.classList.toggle('done', i < idx); el.classList.toggle('now', i === idx); });
      ctx.hud.label(`Round ${idx + 1} of ${SD.LENGTHS.length}`);
    }
    const litN = [0, 0, 0, 0];
    function flash(i, { soft = false } = {}) {
      const pad = pads[i];
      const n = ++litN[i];
      pad.classList.add('lit');
      glows[i].animate([{ opacity: soft ? 0.5 : 1 }, { opacity: 0 }], { duration: 340, easing: 'ease-out' });
      const a = rm ? null : pad.animate(soft
        ? [{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg) scale(.97)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0)' }]
        : [{ transform: 'scale(1)' }, { transform: 'translateY(-5px) scale(1.07, 1.05)', offset: 0.3 }, { transform: 'translateY(2px) scale(.98, 1.02)', offset: 0.7 }, { transform: 'scale(1)' }],
      { duration: soft ? 260 : 300, easing: 'ease-out' });
      const off = () => { if (litN[i] === n) pad.classList.remove('lit'); };
      if (a) a.onfinish = off; else setTimeout(off, 200);
    }
    function sparks(i, big = false) {
      const r = rects[i];
      if (!r) return;
      const c = SD.PADS[i].hex;
      fx.burst(r.cx, r.cy - r.h * 0.12, { n: big ? 18 : 12, colors: [c, '#fff', COLORS.yellow], speed: big ? 380 : 300, size: 8, life: 0.6, shape: big ? 'star' : 'circle' });
      fx.ring(r.cx, r.cy, { color: '#fff', r: Math.min(r.w, r.h) * 0.55, life: 0.35 });
    }
    let popsUntil = 0;
    // Pops rise from inside the pad that was hit (clear of the name tags on the stage above).
    const popOn = (i, text, color, size) => { const r = rects[i]; if (r) pop(text, r.cx, r.y + r.h * 0.42, color, size); };
    function pop(text, x, y, color = COLORS.white, size = 30) {
      const half = text.length * size * 0.29 + 8; // keep the whole word on screen
      pops.add(text, Math.max(half, Math.min(view.w - half, x)), Math.max(size, y), { color, size, life: 0.85, rise: 55 });
      popsUntil = clockNow + 1;
    }
    function showBubble(html, color) {
      bubbleEl.innerHTML = html;
      bubbleEl.style.setProperty('--c', color);
      bubbleEl.hidden = false;
      if (!rm) bubbleEl.animate([{ transform: 'translate(-50%, 0) scale(.3)' }, { transform: 'translate(-50%, 0) scale(1.15)', offset: 0.6 }, { transform: 'translate(-50%, 0) scale(1)' }], { duration: 260, easing: 'ease-out' });
    }
    function padIcon(i) { return `<svg viewBox="0 0 64 64" aria-hidden="true">${PAD_ART[SD.PADS[i].id]}</svg>`; }

    // A pad's voice: its note in the song's key plus a matching percussion hit. `at` = audio time.
    function voice(i, at, vol = 1) {
      const t = at ?? Sound.now();
      const m = base + SD.PADS[i].deg;
      Sound.tone({ f: Sound.mtof(m + 12), t, dur: 0.24, vol: 0.13 * vol, type: 'square' });
      Sound.tone({ f: Sound.mtof(m + 24), t, dur: 0.16, vol: 0.05 * vol, type: 'sine' });
      const id = SD.PADS[i].id;
      if (id === 'clap') Sound.clap(t, 0.3 * vol);
      else if (id === 'stomp') Sound.kick(t, 0.75 * vol);
      else if (id === 'spin') Sound.burst({ t, dur: 0.22, vol: 0.12 * vol, type: 'bandpass', freq: 700, q: 2, sweep: (p, tt) => p.exponentialRampToValueAtTime(3200, tt + 0.2) });
      else Sound.tone({ f: 520, t, dur: 0.07, vol: 0.14 * vol, type: 'sine', slideTo: 1200 });
    }

    // ------------------------------------------------------------ ghost hand
    const ghost = ctx.ghost;
    let ghostOn = false;
    // The finger taps the pad's icon; the one-line words go in the stage callout, never on the pads.
    function ghostAt(i) {
      const r = rects[i];
      if (!r) return;
      // The fingertip sits high on the icon so the hand covers the picture, never the name.
      ghost.show({ type: 'tap', x: r.icX - 14, y: r.icY + r.icH * 0.16 });
      ghostOn = true;
    }
    function ghostOff() { if (ghostOn) ghost.hide(); ghostOn = false; }

    // ------------------------------------------------------------ rhythm + events
    let rhythm = { spb: 60 / SD.BPM, now: () => 0, gameNow: () => 0, beatAt: () => -9, judge: () => 0, timeOf: () => 0, audio: false, pause() {}, resume() {}, stop() {} };
    const sounded = new WeakSet();
    let lastTap = 0;
    let earlyShown = -1;
    let winItem;
    let endAt = null;
    let ended = false;
    let dotsFor = 0;       // a replay keeps the rewound dots (and the rewind bubble) until its first call
    let settledPts = 0;    // points of earlier taps credited by this one (shown on its pop)
    const seen = {};       // event counts, mirrored on data-* for the e2e specs (written per event, never per frame)
    // The HUD: the week's banked points + the sequences beaten this try. Never goes down.
    const hudScore = () => ctx.hud.score(banked + game.kept);
    // Dancing along, or a tap whose credit the next tap settles: during the player's turn it sounds
    // and flashes like any move (it never looks ignored); while the Owl is on, it's a soft answer.
    function moveTap(pad, full) {
      voice(pad, undefined, full ? 1 : 0.35);
      flash(pad, { soft: !full });
      if (full) { dance('me', SD.PADS[pad].id); lastTap = clockNow; }
    }

    function handle(e) {
      seen[e.type] = (seen[e.type] || 0) + 1;
      root.dataset[e.type] = seen[e.type];
      switch (e.type) {
        case 'seq': {
          setCaller(e.caller);
          for (const id of OWLS) if (id !== e.caller) paint(id, 'happy');
          padsEl.dataset.mode = 'watch';
          setRound(e.idx);
          paint('me', 'focus');
          ghostOff();
          if (e.replay) { dotsFor = e.L; break; }
          resetDots(e.L);
          bubbleEl.hidden = true;
          if (e.idx !== game.startIdx) Sound.whoosh();
          break;
        }
        case 'call': {
          if (e.i === 0) {
            if (dotsFor) { resetDots(dotsFor); dotsFor = 0; }
            calloutEl.hidden = true; // the stage is clear while the Owl calls
          }
          root.dataset.moves = game.calls.filter(c => c.fired).map(c => c.pad).join(',');
          if (!sounded.has(game.calls[e.i])) voice(e.pad);
          flash(e.pad);
          fillDot(e.i, e.pad);
          dance(caller, SD.PADS[e.pad].id);
          showBubble(padIcon(e.pad), SD.PADS[e.pad].hex);
          const h = headOf(P.crewX);
          fx.burst(h.x, h.y - P.avh * 0.1, { n: 5, colors: [SD.PADS[e.pad].hex, '#fff'], speed: 160, size: 7, life: 0.5, shape: 'star' });
          if (e.help) ghostAt(e.pad);
          break;
        }
        case 'respond': {
          padsEl.dataset.mode = 'go';
          resetDots(e.L);
          dotsFor = 0;
          bubbleEl.hidden = true;
          callout('Your turn!', e.first ? 'Copy the moves!' : '', 'mint', e.first ? 2.4 : 1.1);
          Sound.chime();
          lastTap = clockNow;
          if (e.help) root.dataset.help = (seen.help = (seen.help || 0) + 1);
          if (e.first || e.help) ghostAt(e.next);
          else ghostOff();
          break;
        }
        case 'echo': // dancing along after the Owl's last move: never a slip, no dot
          moveTap(e.pad, true);
          break;
        case 'pending': // maybe the next move, maybe dancing along: the next tap settles its dot
          moveTap(e.pad, true);
          if (game.help && e.next != null) ghostAt(e.next);
          break;
        case 'early': {
          moveTap(e.pad, false);
          const turn = game.idx * 100 + game.attempt;
          if (earlyShown !== turn) {
            earlyShown = turn;
            popOn(e.pad, 'Owls’ turn!', COLORS.white, 24);
          }
          break;
        }
        case 'hit': {
          fillDot(e.pos, e.pad);
          // An earlier pending tap credited now: its dot fills, its points join this tap's pop.
          if (e.settled) { settledPts += e.pts; break; }
          const pts = e.pts + settledPts;
          settledPts = 0;
          if (e.back) dots.forEach((d, i) => { if (i >= game.pos) d.classList.remove('on'); });
          voice(e.pad);
          flash(e.pad);
          sparks(e.pad, e.onBeat);
          dance('me', SD.PADS[e.pad].id);
          if (!pts) popOn(e.pad, 'Nice!', COLORS.white, 26);
          else popOn(e.pad, e.onBeat ? `On beat! +${pts}` : `+${pts}`, e.onBeat ? COLORS.yellow : COLORS.white, e.onBeat ? 30 : 28);
          showPending();
          lastTap = clockNow;
          if (e.next != null && game.help) ghostAt(e.next);
          else ghostOff();
          break;
        }
        case 'slip': {
          // No buzzer, no red: the tape rewinds, the dots spin back, the Owl winks. Same words as real life.
          voice(e.pad, undefined, 0.6);
          flash(e.pad, { soft: true });
          Sound.tapeRewind();
          rewindDots();
          ghostOff();
          padsEl.dataset.mode = 'watch';
          paint('me', 'happy');
          paint(caller, 'wink');
          showBubble(icon('rewind'), '#9B6BFF');
          callout('Run it back!', 'Crew’s got you', 'grape', 2);
          break;
        }
        case 'clear': {
          hudScore(); // the sequence's move points + its bonus join the score now
          showPending();
          roundPips[e.idx]?.classList.add('done');
          padsEl.dataset.mode = 'watch';
          ghostOff();
          paint('me', 'proud');
          dance('me', 'cheer');
          for (const id of OWLS) paint(id, 'wow');
          const h = headOf(P.meX);
          fx.burst(h.x, h.y, { n: 26, speed: 420, size: 9, life: 0.9, shape: 'rect' });
          shake.add(5);
          Sound.combo(e.idx + 2);
          if (e.reached < SD.LENGTHS.length) callout(e.flawless ? 'Flawless!' : 'Comeback!', `+${e.bonus} bonus`, e.flawless ? 'yellow' : 'pink', 2);
          break;
        }
        case 'win': {
          // The win is banked at once (item + round used up), whatever happens during the party.
          winItem = State.recordShowdownWin(player.id);
          State.finishRound(player.id);
          hudScore();
          callout('You beat the Owls!', `+${e.bonus} champ bonus`, 'yellow', 3);
          for (const id of OWLS) paint(id, id === caller ? 'proud' : 'grin');
          dance(caller, 'cheer');
          const h = headOf(P.meX);
          fx.burst(h.x, h.y, { n: 40, speed: 520, size: 10, life: 1.2, shape: 'star' });
          fx.burst(P.stageX + P.sw / 2, P.stageY + P.sh * 0.4, { n: 40, speed: 480, size: 9, life: 1.2, shape: 'rect' });
          shake.add(9);
          Sound.unlockSfx();
          endAt = clockNow + 1.8;
          break;
        }
        case 'timeup': endRound('timeup'); break;
        default: break;
      }
      root.dataset.phase = game.phase;
    }

    /** Bank this try's progress for the rest of the week, with the points of the sequences beaten. */
    function saveProgress() {
      const sum = game.summary();
      if (!sum.won) State.recordShowdownProgress(player.id, sum.reached, Date.now(), banked + sum.kept);
    }
    // Progress is saved when a try ends, not after every clear. Once a round counts — past the
    // shell's 20 s "Leave (round saved)" window — what it earned is kept even if the app closes
    // before the end screen, and the round credit goes with it. Before that, leaving keeps the
    // credit and the round simply didn't happen (so quick clears can't be farmed for free).
    function keepEarned() {
      if (ended || !started) return;
      const s = game.summary();
      if (!SD.keepsOnLeave({ realSecs: ctx.clock.now() / speed, won: s.won, reached: s.reached, startIdx: s.startIdx })) return;
      saveProgress();
      State.finishRound(player.id);
    }

    function endRound(kind) {
      if (ended) return;
      ended = true;
      stopBot();
      ghostOff();
      calloutEl.hidden = true; // the end card says it now
      root.classList.add('sd-ended');
      rhythm.stop();
      const sum = game.summary();
      const crew = { rewinds: sum.totalSlips, chills: 0, timeouts: 0, spots: 0, syncs: 0 };
      // The week's total: exactly the HUD's last number (an unfinished sequence scores when it's
      // beaten, and its points never showed on the HUD), so the score never drops at the end.
      const score = banked + sum.kept;
      // Every try goes on the personal chart as the week's total so far, so each end card compares
      // with the player's own best (and a try that beat nothing new still gets its line).
      if (kind === 'win') {
        ctx.end({ score, best: sum.best, crew, showdown: true, title: 'You beat the Neon Owls!', extra: revealHTML(winItem, State.player(player.id), rm) });
      } else {
        saveProgress();
        const moved = sum.reached > sum.startIdx;
        ctx.end({ score, best: sum.best, crew, title: moved ? 'Progress saved!' : 'Nice battle!', extra: savedHTML(sum.reached, sum.startIdx) });
      }
    }

    // ------------------------------------------------------------ input
    // A tap is judged when it happened (the event's time, latency- and calibration-corrected), not
    // when the frame reads it — the echo window and the beat bonus both use that time.
    function press(i, e) {
      if (ended || paused || !started) return;
      const jb = rhythm.beatAt(e ? rhythm.judge(e) : rhythm.gameNow());
      const off = (jb - Math.round(jb)) * rhythm.spb;
      for (const ev of game.tap(i, jb, clockNow, off)) handle(ev);
    }
    function padAt(x, y) {
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6) return i;
      }
      return -1;
    }
    const input = pointerInput(host, {
      onDown: (p, e) => { const i = padAt(p.x, p.y); if (i >= 0) press(i, e); },
    });
    const onKey = e => {
      const i = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
      if (i != null && !e.repeat) press(i, e);
    };
    document.addEventListener('keydown', onKey);

    // ------------------------------------------------------------ loop
    let stopLoop = null;
    let paused = false;
    let started = false;
    let lastBeat = -99;
    let lastFrac = -1;
    let drawn = false;
    let shaking = false;
    function step(dt) {
      if (paused) return;
      dt = Math.max(0, dt);
      clockNow = ctx.clock.now();
      const beat = rhythm.beatAt(rhythm.now());
      // Schedule the Owl's notes a moment ahead so they land on the beat (audio clock only).
      if (rhythm.audio && (game.phase === 'wait' || game.phase === 'call')) {
        for (const c of game.calls) {
          if (!sounded.has(c) && c.beat <= beat + 0.3) { sounded.add(c); voice(c.pad, rhythm.timeOf(c.beat)); }
        }
      }
      if (!ended) for (const e of game.update(beat, clockNow)) handle(e);
      if (endAt != null && clockNow >= endAt) endRound('win');
      const b = Math.floor(beat);
      if (b !== lastBeat) {
        lastBeat = b;
        if (b >= -SD.COUNT_IN && !rm) signEl.animate([{ transform: 'scale(1.06) rotate(-1deg)', filter: 'brightness(1.3)' }, { transform: 'none', filter: 'none' }], { duration: 260, easing: 'ease-out' });
      }
      if (game.phase === 'respond' && !ghostOn && clockNow - lastTap > HELP_IDLE) ghostAt(game.expected());
      if (!calloutEl.hidden && clockNow > calloutUntil) calloutEl.hidden = true;
      const frac = Math.max(0, 1 - game.clock(clockNow) / SD.ROUND_SECS); // holds still while the Owl runs it back
      if (Math.abs(frac - lastFrac) > 0.002) { lastFrac = frac; ctx.hud.time(frac); }
      // Juice: sparks + pops on the canvas, shake on the DOM stage.
      fx.update(dt);
      pops.update(dt);
      shake.update(dt);
      const o = shake.offset();
      if (o.x || o.y) { root.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px)`; shaking = true; }
      else if (shaking) { root.style.transform = ''; shaking = false; }
      if (fx.list.length || clockNow < popsUntil) {
        view.clear();
        fx.draw(g);
        pops.draw(g);
        drawn = true;
      } else if (drawn) { view.clear(); drawn = false; }
    }

    // ------------------------------------------------------------ autoplay (tests)
    // Drives the real input path with PointerEvents on the pads. Plays on the beat, peeks during
    // the first call (an "early" tap), echoes the Owl's last move and then jumps in eagerly on
    // every other sequence, slips once on its 2nd sequence and three times on its 3rd (so the
    // run-back, slower demo, ghost hand and shorter sequence all happen).
    let bot = 0;
    function stopBot() { clearInterval(bot); bot = 0; }
    function botTap(i) {
      const r = pads[i].getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 };
      pads[i].dispatchEvent(new PointerEvent('pointerdown', o));
      pads[i].dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    }

    return {
      start() {
        rhythm = startRhythm({ bpm: SD.BPM, loop: true, groove: 1, keyIdx, countIn: SD.COUNT_IN, melody: false });
        rhythm.setLevel?.(0.75);
        started = true;
        paint('me', 'focus');
        setCaller(SD.CALLERS[game.startIdx]);
        OWLS.forEach(id => paint(id, id === caller ? 'grin' : 'happy'));
        game.start(rhythm.beatAt(rhythm.now()));
        hudScore();
        setRound(game.startIdx);
        callout(`Round ${game.startIdx + 1}`, `Watch ${NPCS[caller].name}!`, 'yellow', 2.5);
        Sound.whoosh();
        stopLoop = startLoop(step);
      },
      pause() {
        if (paused) return;
        paused = true;
        rhythm.pause();
        stopLoop?.();
        stopLoop = null;
        // Paused (or the app hidden) during the victory party: straight to the end screen, which
        // the shell draws over its pause card once this call has returned.
        if (game.phase === 'win' && !ended) queueMicrotask(() => endRound('win'));
        else keepEarned();
      },
      resume() {
        if (!paused || ended) return;
        paused = false;
        rhythm.resume();
        stopLoop = startLoop(step);
      },
      finish() {
        if (game.phase === 'win') { endRound('win'); return; }
        for (const e of game.finish()) handle(e);
      },
      destroy() {
        keepEarned();
        ended = true;
        stopBot();
        stopLoop?.();
        rhythm.stop();
        input.destroy();
        document.removeEventListener('keydown', onKey);
        view.destroy();
        root.remove();
      },
      hint() {
        const want = game.expected();
        if (want == null) return { type: 'wait', ms: 60 };
        const r = pads[want].getBoundingClientRect();
        return { type: 'tap', x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      autoplay() {
        if (bot) return true;
        const PLAN = [[], [1], [0, 2, 0]]; // per sequence played: attempt → move it slips at
        const EAGER = 0.4; // beats after the Owl's last move: the bot jumps in before "Your turn!"
        let played = 0, seenIdx = -1, nextTap = null, peeked = false, echoed = -1;
        const beatNow = () => rhythm.beatAt(rhythm.gameNow());
        // A planned slip presses a pad that fits no reading of the taps (not an echo, not a copy).
        const slipPad = want => {
          for (let d = 1; d < 4; d++) if (!game.fits((want + d) % 4, beatNow() + 0.05)) return (want + d) % 4;
          return null; // every pad fits right now: slip on a later tap
        };
        const tap = want => {
          if (game.idx !== seenIdx) { seenIdx = game.idx; played++; }
          const slipAt = (PLAN[played - 1] || [])[game.attempt];
          // From that move on (the first tap where a wrong pad really is one), once per attempt.
          const wrong = slipAt != null && game.lead >= slipAt ? slipPad(want) : null;
          botTap(wrong ?? want);
        };
        bot = setInterval(() => {
          if (paused || ended) return;
          const calls = game.calls;
          if (game.phase === 'call') {
            const last = calls.at(-1);
            if (!peeked && calls[0]?.fired && beatNow() < last.beat - 0.3) { peeked = true; botTap((calls[0].pad + 2) % 4); return; }
            if (!last.fired || game.idx % 2 || game.attempt) return;
            const since = beatNow() - last.beat;
            const turn = game.idx * 100 + game.attempt;
            if (echoed !== turn) {
              // Dancing along (harmless): a move the Owl just called that can't be the first copy.
              echoed = turn;
              const echo = calls.slice().reverse().find(c => c.pad !== calls[0].pad && since + last.beat - c.beat < SD.ECHO - 0.5);
              botTap((echo || last).pad);
              return;
            }
            if (since >= EAGER) {
              tap(calls[0].pad);
              nextTap = Math.ceil(beatNow() + 0.5);
            }
            return;
          }
          if (game.phase !== 'respond') { nextTap = null; return; }
          const beat = beatNow();
          if (nextTap == null) nextTap = Math.ceil(beat + 0.02);
          if (beat < nextTap) return;
          nextTap += 1;
          tap(game.expected());
        }, 8);
        return true;
      },
    };
  },
};
