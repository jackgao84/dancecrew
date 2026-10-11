// Spot the Spark: a crew member starts getting frustrated and clues build one by one.
// Tap the first clue you see — the earlier, the more points — then pick a cool-down.
// Rules live in spark-logic.js (pure, unit-tested); this file draws them and handles touch.
import * as State from '../state.js';
import * as R from '../rules.js';
import { avatarSVG } from '../avatar.js';
import { sceneSVG } from '../scenes.js';
import { content } from '../data.js';
import { NPCS } from '../content.js';
import { esc, icon } from '../ui.js';
import { createCanvas, startLoop, pointerInput, guardSurface, createParticles, createPops, createShake, COLORS, PALETTE, FONT, rng as seeded } from './engine.js';
import { createSparkRound, ROUND_SECS, CUE_POINTS, COOLS, LOCK_SECS, spotRung, spotPoints } from './spark-logic.js';
import { cueLayer, propArt, propSize, sparkIcon, hasSparkIcon } from './spark-art.js';

const SPOT_WORD = ['', 'First clue!', 'Nice eyes!', 'Got it!', 'Spotted!'];
const COOL_WORD = { breathe: 'Nice breath!', say: 'Said it!', minute: 'Power move!', walk: 'Reset!', squeeze: 'Squeezed out!', count: 'Counted down!' };
const FALLBACK = [
  { id: 'fb-tower', who: 'kiko', bg: 'home', prop: 'blocks', side: 'left', text: '{name}\'s block tower keeps falling over.', cues: ['fists', 'stomp', 'cheeks', 'steam'], calm: 'Wider base this time!' },
  { id: 'fb-lace', who: 'dash', bg: 'street', prop: 'lace', side: 'left', text: '{name}\'s lace snapped before practice.', cues: ['cheeks', 'fists', 'stomp', 'steam'], calm: 'I\'ll ask for a spare.' },
  { id: 'fb-move', decoy: true, who: 'pip', bg: 'studio', text: '{name} just nailed the new move!', cues: ['hop', 'notes', 'glow'], calm: 'Did you see that?!' },
];

const coolIcon = c => (hasSparkIcon(c.icon) ? sparkIcon(c.icon) : icon(c.icon));

export default {
  id: 'spark',
  title: 'Spot the Spark',
  blurb: 'Spot the first clue — then help them cool down.',
  icon: 'flame',
  color: 'orange',
  kind: 'arcade',
  ready: true,
  create(host, ctx) {
    const S = ctx.sound;
    const rm = !!ctx.reducedMotion;
    const pool = content.sparks?.length ? content.sparks : FALLBACK;
    const adapt = ctx.adapt({ min: 0, max: 1, start: 0.35, step: 0.15, window: 4, missesToEase: 2, hitsToRamp: 3, cooldown: 4 });
    const round = createSparkRound({ scenes: pool, rng: ctx.rng, adapt, duration: ROUND_SECS });

    // ---------------------------------------------------------------- cast
    const players = State.get().players;
    const others = players.filter(p => p.id !== ctx.player.id);
    const castCache = new Map();
    const pick = list => list[Math.floor(ctx.rng() * list.length)];
    function castFor(scene) {
      if (castCache.has(scene.id)) return castCache.get(scene.id);
      const w = scene.who;
      let c;
      if (w === 'me') c = { name: ctx.player.name, avatar: ctx.player.avatar, me: true };
      else if (NPCS[w]) c = NPCS[w];
      else if (w === 'crew' && others.length) c = pick(others);
      else if (w === 'kid') { const k = others.filter(p => !R.isAdult(p)); c = k.length ? pick(k) : NPCS.pip; }
      else if (w === 'grownup') { const g = others.filter(p => R.isAdult(p)); c = g.length ? pick(g) : NPCS.sunny; }
      else c = NPCS.kiko;
      c = { name: c.name, avatar: c.avatar, me: !!c.me };
      castCache.set(scene.id, c);
      return c;
    }

    // ---------------------------------------------------------------- DOM
    const root = document.createElement('div');
    root.className = 'sp';
    root.innerHTML = `
      <div class="sp-stage">
        <div class="sp-bg"></div>
        <div class="sp-prop"></div>
        <div class="sp-char"><div class="sp-body"><div class="sp-av"></div><svg class="sp-cues" viewBox="0 0 200 300" aria-hidden="true"></svg></div></div>
        <div class="sp-say" hidden></div>
        <div class="sp-cap"><span class="sp-cap-face"></span><b class="sp-cap-text"></b></div>
        <div class="sp-note" role="status" hidden></div>
      </div>
      <div class="sp-bar">
        <div class="sp-watch">
          <div class="sp-ladder" aria-label="Spot it early for more points"><span class="sp-flame">${icon('flame')}</span><i>100</i><i>70</i><i>40</i><i>20</i></div>
          <button class="btn mint sp-good" type="button">${sparkIcon('thumbs')}<span>All good!</span></button>
        </div>
        <div class="sp-cool" hidden><p class="sp-cool-q"></p><div class="sp-cools"></div></div>
      </div>`;
    host.appendChild(root);
    const $ = sel => root.querySelector(sel);
    const stage = $('.sp-stage'), bgEl = $('.sp-bg'), propEl = $('.sp-prop'), charEl = $('.sp-char'), body = $('.sp-body');
    const avEl = $('.sp-av'), cuesEl = $('.sp-cues'), sayEl = $('.sp-say'), capEl = $('.sp-cap'), capFace = $('.sp-cap-face'), capText = $('.sp-cap-text');
    const noteEl = $('.sp-note'), watchEl = $('.sp-watch'), ladder = [...root.querySelectorAll('.sp-ladder i')], flame = $('.sp-flame');
    const goodBtn = $('.sp-good'), coolEl = $('.sp-cool'), coolQ = $('.sp-cool-q'), coolsEl = $('.sp-cools');

    const view = createCanvas(host);
    view.canvas.classList.add('sp-fx');
    const g = view.g;
    const parts = createParticles(260);
    const pops = createPops();
    const shake = createShake();

    // ---------------------------------------------------------------- state for drawing
    let cur = null;            // { scene, cast }
    let expr = 'happy', avCls = '';
    let lastBg = '';
    let noteUntil = 0;
    let lastHud = -1;
    let fxUntil = 0;
    let lastShake = '';
    let timers = [];
    let stopLoop = null;
    let ended = false;
    let bot = 0;
    let ghostFor = '';         // which lesson the ghost hand is showing
    const taught = { spot: false, cool: false, hold: false, decoy: false };
    const geo = { ch: 0, cw: 0, left: 0, top: 0 };

    const later = (at, fn) => timers.push({ at, fn });
    const now = () => ctx.clock.now();

    function renderAv() {
      avEl.innerHTML = avatarSVG(cur.cast.avatar, { expr, cls: avCls });
    }
    function setFace(e, cls = avCls) {
      if (e === expr && cls === avCls) return;
      expr = e; avCls = cls;
      renderAv();
    }

    // ---------------------------------------------------------------- layout (resize + new scene)
    function layout() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h || !cur) return;
      const prop = cur.scene.prop && propArt(cur.scene.prop) ? cur.scene.prop : null;
      const pr = prop ? propSize(prop) : 0;
      const pk = prop === 'tree' ? 2 / 3 : 1;               // prop width / height
      const right = cur.scene.side === 'right';
      const capBottom = capEl.offsetTop + capEl.offsetHeight;
      const bottom = Math.max(8, h * 0.035);
      // As tall as the stage allows, below the caption (the top ~10% of the avatar box is air).
      // The body is ~80% of the avatar box; hair, headphones and steam need ~90%.
      const tall = Math.max(120, Math.min((h - bottom - capBottom - 4) / 0.9, h * 0.86));
      const sideBySide = (w * 0.92) / (0.9 * (2 / 3) + pr * pk * 0.9);
      let ch, cw, left, pw = 0, ph = 0, pl = 0;
      if (!prop || sideBySide >= tall * 0.85) {
        // Character and prop stand side by side.
        ch = Math.max(120, Math.min(tall, sideBySide));
        cw = ch * (2 / 3);
        const bw = cw * 0.8;
        pw = prop ? ch * pr * pk : 0;
        ph = prop ? ch * pr : 0;
        const gl = (w - (bw + pw * 0.9)) / 2;
        left = prop && !right ? gl + pw * 0.9 - cw * 0.1 : gl - cw * 0.1;
        pl = !right ? gl : left + cw * 0.1 + bw - pw * 0.1;
      } else {
        // Narrow portrait (phones): the character gets the height; the prop tucks in behind at the side.
        ch = Math.max(120, Math.min(tall, (w * 0.96) / (0.9 * (2 / 3))));
        cw = ch * (2 / 3);
        pw = Math.min(ch * pr * pk, w * 0.4);
        ph = pw / pk;
        const shift = Math.max(0, Math.min((w - cw * 0.8) / 2 - 6, pw * 0.3));
        left = (w - cw) / 2 + (right ? -shift : shift);
        pl = right ? w - pw - 2 : 2;
      }
      const top = h - bottom - ch;
      Object.assign(charEl.style, { left: left + 'px', top: top + 'px', width: cw + 'px', height: ch + 'px' });
      if (prop) Object.assign(propEl.style, { left: pl + 'px', top: (h - bottom - ch * 0.02 - ph) + 'px', width: pw + 'px', height: ph + 'px' });
      sayEl.style.bottom = (h - (top + ch * 0.13)) + 'px';
      Object.assign(geo, { ch, cw, left, top });
      placeSay();
    }
    view.onResize = () => layout();

    // ---------------------------------------------------------------- geometry helpers
    /** A clue point (viewBox) → CSS px inside the host (for particles and the ghost hand). */
    function hostPoint([vx, vy]) {
      const c = charEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
      return { x: c.left - hr.left + (vx / 200) * c.width, y: c.top - hr.top + (vy / 300) * c.height };
    }
    function clientPoint([vx, vy]) {
      const c = charEl.getBoundingClientRect();
      return { x: c.left + (vx / 200) * c.width, y: c.top + (vy / 300) * c.height };
    }
    function hostCenter(el) {
      const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
      return { x: r.left - hr.left + r.width / 2, y: r.top - hr.top + r.height / 2 };
    }
    const clientCenter = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const fxOn = () => { fxUntil = now() + 1.6; };
    /** A combo pop that always fits on screen (pops grow to 1.2× as they land). */
    function pop(text, x, y, opts = {}) {
      const W = host.clientWidth;
      let size = opts.size || 30;
      g.font = `900 ${size}px ${FONT}`;
      const w = g.measureText(text).width * 1.2 + size * 0.5;
      if (w > W - 16) size = Math.max(14, size * (W - 16) / w);
      const half = Math.min(W - 16, w) / 2;
      pops.add(text, Math.max(8 + half, Math.min(W - 8 - half, x)), y, { ...opts, size });
    }

    // ---------------------------------------------------------------- UI pieces
    function showNote(html, until, cls = '') {
      noteEl.innerHTML = html;
      noteEl.className = 'sp-note ' + cls;
      noteEl.hidden = false;
      noteUntil = until;
      stage.classList.add('sp-dim');
      root.classList.add('noting');
    }
    function hideNote() { noteEl.hidden = true; noteUntil = 0; stage.classList.remove('sp-dim'); root.classList.remove('noting'); }
    /** The speech bubble sits over the character's head but never runs off the stage. */
    function placeSay() {
      if (sayEl.hidden) return;
      const w = stage.clientWidth, half = sayEl.offsetWidth / 2;
      sayEl.style.left = Math.max(half + 8, Math.min(w - half - 8, geo.left + geo.cw / 2)) + 'px';
    }
    function say(text) {
      sayEl.textContent = text;
      sayEl.hidden = !text;
      if (text) { placeSay(); sayEl.classList.remove('pop-in'); void sayEl.offsetWidth; sayEl.classList.add('pop-in'); }
    }
    /**
     * The ladder shows what a spot is worth right now. A guess uses up the top rung (it greys out
     * with a little wobble), so "watch first" is visible, not explained.
     */
    function paintLadder(shown = 0, got = 0) {
      const used = round.guessed;
      const now = shown ? spotRung(shown, used) : 0;
      ladder.forEach((el, i) => {
        const cls = got ? (i === got - 1 ? 'got' : i < got - 1 ? 'gone' : '') : i === now - 1 ? 'now' : i < Math.max(now - 1, used ? 1 : 0) ? 'gone' : '';
        const was = el.dataset.c || '';
        if (cls === was) return;
        el.dataset.c = cls;
        el.className = cls + (i === 0 && cls === 'gone' && used && !got && !rm ? ' used' : '');
      });
      flame.dataset.s = String(Math.min(4, shown));
    }
    /** Each new clue: the ladder steps and "All good!" perks up too (it's always a choice). */
    function perkGood() {
      if (rm) return;
      goodBtn.classList.remove('perk'); void goodBtn.offsetWidth; goodBtn.classList.add('perk');
    }
    function squash() {
      if (rm) return;
      body.classList.remove('squash'); void body.offsetWidth; body.classList.add('squash');
    }
    function showWatch(enabled) {
      coolEl.hidden = true;
      watchEl.hidden = false;
      goodBtn.disabled = !enabled;
    }
    const nameFor = c => (c.me ? 'you' : c.name);

    function showCools(options, need) {
      const c = cur.cast;
      coolQ.textContent = need ? 'Bigger spark — hold to cool it:' : c.me ? 'Pick your cool-down:' : `Help ${c.name} cool down:`;
      coolsEl.innerHTML = options.map(o => `<button class="sp-cd" type="button" data-id="${o.id}" style="--p:0">${coolIcon(o)}<b>${esc(o.label)}</b></button>`).join('');
      coolEl.classList.toggle('hold', !!need);
      watchEl.hidden = true;
      coolEl.hidden = false;
    }
    /** The held button fills; the others show the progress already banked (it carries over). */
    function paintHold() {
      const s = round.state;
      const base = s.need ? Math.min(1, (s.hold ? s.hold.base : s.progress) / s.need).toFixed(3) : '0';
      const now = round.coolFrac.toFixed(3);
      coolsEl.querySelectorAll('.sp-cd').forEach(el => {
        const f = s.hold && el.dataset.id === s.hold.id ? now : base;
        if (el.style.getPropertyValue('--p') !== f) el.style.setProperty('--p', f);
      });
    }

    // ---------------------------------------------------------------- ghost hand (learn by playing)
    // Targets in the bottom bar get their one-line label above the hand (the bar is short).
    function ghostAt(kind, p, type = 'tap', text = '', above = false) {
      ghostFor = kind;
      ctx.ghost.show({ type, x: p.x, y: p.y, text, dir: above ? 'above' : 'down' });
    }
    function ghostOff(kind) { if (!kind || ghostFor === kind) { ctx.ghost.hide(); ghostFor = ''; } }

    // ---------------------------------------------------------------- sounds for clues
    function cueSound(cue) {
      if (cue === 'fists') { S.tone({ f: 150, type: 'square', dur: 0.07, vol: 0.05 }); S.tone({ f: 140, type: 'square', dur: 0.07, vol: 0.05, t: S.now() + 0.09 }); }
      else if (cue === 'stomp') { S.kick(S.now(), 0.35); S.kick(S.now() + 0.28, 0.3); }
      else if (cue === 'cheeks') S.tone({ f: 330, slideTo: 520, dur: 0.22, vol: 0.06, type: 'sine' });
      else if (cue === 'steam') S.burst({ dur: 0.4, vol: 0.08, type: 'highpass', freq: 4500 });
      else if (cue === 'notes') { S.note(79, 0.12, 'sine', 0.08); setTimeout(() => S.note(84, 0.14, 'sine', 0.08), 120); }
      else if (cue === 'hop') S.tone({ f: 420, slideTo: 760, dur: 0.16, vol: 0.07, type: 'sine' });
      else if (cue === 'cheer') S.tone({ f: 523, slideTo: 1046, dur: 0.25, vol: 0.06, type: 'triangle' });
      else if (cue === 'glow') S.sparkle();
    }

    // ---------------------------------------------------------------- events from the round
    function handle(ev) {
      const t = now();
      switch (ev.type) {
        case 'scene': {
          timers = [];
          const scene = ev.scene;
          cur = { scene, cast: castFor(scene) };
          if (scene.bg !== lastBg) { bgEl.innerHTML = sceneSVG(scene.bg); lastBg = scene.bg; }
          const prop = scene.prop ? propArt(scene.prop) : '';
          propEl.innerHTML = prop;
          propEl.hidden = !prop;
          propEl.className = 'sp-prop prop-' + (scene.prop || 'none') + (scene.side === 'right' ? ' right' : '');
          cuesEl.innerHTML = cueLayer(cur.cast.avatar?.skin);
          body.className = 'sp-body' + (rm ? '' : ' enter');
          // Everyone starts with the same neutral face: the body clues are the tell, not the entrance.
          expr = ''; setFace('focus', rm ? '' : 'mv-idle');
          capFace.innerHTML = avatarSVG(cur.cast.avatar, { crop: 'head', expr: 'happy' });
          capText.textContent = String(scene.text).replaceAll('{name}', cur.cast.name);
          say('');
          hideNote();
          paintLadder(0);
          showWatch(true);
          root.dataset.phase = 'enter';
          root.classList.toggle('decoy', !!scene.decoy);
          ghostOff();
          layout();
          S.whoosh();
          break;
        }
        case 'cue': {
          if (ev.stage === 1) { root.dataset.phase = 'build'; body.classList.remove('enter'); }
          body.classList.add('on-' + ev.cue);
          // Happy stomps look like angry ones — the grin and sparkles tell them apart.
          if (ev.cue === 'stomp' || ev.cue === 'hop') body.classList.add('stomping');
          const cls = body.classList.contains('on-cheer') ? 'mv-cheer' : '';
          if (ev.decoy) setFace('grin', cls);
          else setFace(ev.stage >= 4 ? 'heated' : 'focus', '');
          cueSound(ev.cue);
          // The ghost hand teaches on a clean slate: earlier guesses and the lock are wiped, so
          // following the hand always works (and the "Watch closely…" note never argues with it).
          if (ev.stage === 1 && !ev.decoy && !taught.spot && round.teach()) {
            hideNote();
            ghostAt('spot', hostPoint(CUE_POINTS[ev.cue][0]), 'tap', 'Tap the first clue!');
          }
          if (ev.stage === 1 && ev.decoy && !taught.decoy && round.teach()) {
            hideNote();
            ghostAt('decoy', hostCenter(goodBtn), 'tap', 'Just happy? All good!', true);
          }
          paintLadder(ev.stage);
          perkGood();
          break;
        }
        case 'early': case 'lookAgain': case 'decoyTap': {
          const text = ev.type === 'decoyTap' ? 'Look again — see that grin?' : ev.type === 'lookAgain' ? 'Look again…' : ev.near ? 'Tap right on the clue!' : 'Watch closely…';
          showNote(`${sparkIcon('eye')}<span>${esc(text)}</span>`, ev.until, ev.rest ? 'rest' : '');
          // They noticed something but tapped beside it: rings show where the clues are (for as long
          // as the short lock, during which a tap on a clue is the spot).
          if (ev.kept) {
            for (const cue of ev.cues) for (const pt of CUE_POINTS[cue].slice(0, 2)) { const p = hostPoint(pt); parts.ring(p.x, p.y, { color: COLORS.white, r: 46, life: LOCK_SECS }); }
            fxOn();
          }
          if (ev.rest) paintLadder(0);
          else paintLadder(round.state.shown);
          S.soft();
          break;
        }
        case 'locked':
          noteUntil = ev.until;
          if (noteEl.hidden) showNote(`${sparkIcon('eye')}<span>Watch closely…</span>`, ev.until);
          S.tone({ f: 300, dur: 0.05, vol: 0.04, type: 'sine' });
          break;
        case 'nudge': {
          // Mid-lesson: no lock, no note — the hand just shows the move again.
          const g = ghostFor;
          if (g === 'spot') ghostAt('spot', hostPoint(CUE_POINTS[round.scene.cues[0]][0]), 'tap', 'Tap the first clue!');
          else if (g === 'decoy') ghostAt('decoy', hostCenter(goodBtn), 'tap', 'Just happy? All good!', true);
          S.tone({ f: 360, dur: 0.06, vol: 0.05, type: 'sine' });
          break;
        }
        case 'spot': {
          taught.spot = true;
          ghostOff('spot');
          hideNote();
          const p = hostPoint(ev.point);
          parts.ring(p.x, p.y, { color: COLORS.yellow, r: 70 });
          parts.ring(p.x, p.y, { color: COLORS.white, r: 40, life: 0.25 });
          parts.burst(p.x, p.y, { n: (rm ? 4 : 10) + (5 - ev.rung) * (rm ? 2 : 5), colors: [COLORS.yellow, COLORS.orange, COLORS.pink, COLORS.white], shape: 'star', speed: 340, size: 10 });
          pop(`+${ev.points}`, p.x, p.y - 24, { color: COLORS.yellow, size: 44 });
          pop(SPOT_WORD[ev.rung], p.x, p.y - 74, { size: 28, life: 1 });
          if (ev.bonus) pop(`Sharp eyes x${ev.streak}! +${ev.bonus}`, host.clientWidth / 2, 70, { color: COLORS.mint, size: 30, life: 1.2, rise: 30 });
          fxOn();
          shake.add(ev.rung === 1 ? 7 : 4);
          squash();
          body.classList.add('spotted');
          S.spark();
          if (ev.rung === 1) S.perfect(); else S.hit(ev.rung);
          if (ev.streak >= 2) S.combo(ev.streak);
          ctx.hud.score(round.score);
          paintLadder(ev.stage, ev.rung);
          showCools(ev.options, ev.need);
          root.dataset.phase = 'cool';
          // The hand shows on the middle button so its label stays on screen at any width.
          const btns = coolsEl.querySelectorAll('.sp-cd'), mid = btns[1] || btns[0];
          if (ev.need && !taught.hold) ghostAt('cool', hostCenter(mid), 'hold', 'Hold to cool down', true);
          else if (!ev.need && !taught.cool) ghostAt('cool', hostCenter(mid), 'tap', 'Pick a cool-down', true);
          break;
        }
        case 'holdStart': {
          ghostOff('cool');
          taught.hold = true;
          coolsEl.querySelector(`.sp-cd[data-id="${ev.id}"]`)?.classList.add('held');
          S.breathIn(Math.max(0.3, (ev.need - ev.progress) / ctx.speed));
          break;
        }
        case 'holdEnd': {
          coolsEl.querySelectorAll('.sp-cd.held').forEach(b => b.classList.remove('held'));
          paintHold();
          // Above the bar (never over the "hold to cool it" line).
          const b = hostCenter(coolsEl), hr = host.getBoundingClientRect();
          const top = Math.min(coolQ.getBoundingClientRect().top, coolsEl.getBoundingClientRect().top) - hr.top;
          pop('Almost — hold again!', b.x, top - 34, { size: 24, color: COLORS.white, life: 1 });
          fxOn();
          S.breathOut(0.5);
          break;
        }
        case 'cooled': {
          ghostOff('cool');
          taught.cool = true;
          const c = COOLS.find(x => x.id === ev.id);
          coolsEl.querySelectorAll('.sp-cd').forEach(b => { b.disabled = true; b.classList.toggle('chosen', b.dataset.id === ev.id); b.classList.remove('held'); });
          const p = hostPoint([100, 150]);
          parts.burst(p.x, p.y, { n: 16, colors: [COLORS.mint, COLORS.sky, COLORS.white], speed: 260, gravity: 200, life: 0.9 });
          parts.ring(p.x, p.y, { color: COLORS.mint, r: geo.cw * 0.6, life: 0.6 });
          const q = hostPoint([100, 232]);
          pop(`+${ev.points} ${COOL_WORD[ev.id] || 'Cool!'}`, q.x, q.y, { color: COLORS.mint, size: 32, life: 1.1 });
          fxOn();
          S.coolDown();
          ctx.hud.score(round.score);
          calmDown(ev.id, c?.say || '');
          root.dataset.phase = 'calm';
          later(t + 0.7, () => showWatch(false));
          break;
        }
        case 'own': {
          ghostOff();
          calmDown('breathe', 'I\'m taking a minute.');
          showWatch(false);
          const c = cur.cast;
          showNote(`${icon('calm')}<span>${esc(c.me ? 'You took your own minute. Nice!' : `${c.name} took a minute. Nice!`)}</span>`, t + 2.2, 'calm');
          stage.classList.remove('sp-dim');
          root.dataset.phase = 'own';
          S.breathOut(1.2);
          paintLadder(0);
          break;
        }
        case 'decoyYes': case 'decoyPass': {
          ghostOff('decoy');
          taught.decoy = true;
          hideNote();
          const yes = ev.type === 'decoyYes';
          paintLadder(0);                       // no spark here: the ladder rests
          body.classList.remove('stomping');
          body.classList.add('hopping');
          setFace('grin', rm ? '' : 'mv-cheer');
          say(ev.scene.calm || 'All good!');
          showWatch(false);
          root.dataset.phase = 'yay';
          const p = hostPoint([100, 90]);
          if (yes) {
            const b = hostCenter(goodBtn);
            parts.burst(p.x, p.y, { n: 22, colors: PALETTE, shape: 'star', speed: 320, size: 10 });
            parts.ring(b.x, b.y, { color: COLORS.mint, r: 70 });
            pop(`+${ev.points} All good!`, p.x, p.y - 30, { color: COLORS.mint, size: 36 });
            fxOn();
            shake.add(3);
            S.combo(4); S.collect(2);
            ctx.hud.score(round.score);
          } else {
            const c = cur.cast;
            showNote(`${sparkIcon('thumbs')}<span>${esc(c.me ? 'You were just happy!' : `${c.name} was just happy!`)}</span>`, t + 1.8, 'calm');
            stage.classList.remove('sp-dim');
            S.chime();
          }
          break;
        }
        case 'end': finishRound(); break;
        default: break;
      }
    }

    /** The character visibly calms: clues fade, a cool-down move, then a happy line. */
    function calmDown(id, first) {
      const t = now();
      body.className = 'sp-body calm-' + id;
      setFace('calm', '');
      say(first);
      later(t + 1.0, () => {
        setFace(cur.scene.decoy ? 'grin' : 'happy', rm ? '' : 'mv-idle');
        say(cur.scene.calm || 'Thanks, crew!');
        S.chime();
      });
    }

    // ---------------------------------------------------------------- input
    function handleTap(cx, cy) {
      if (ended || ctx.clock.paused) return;
      const t = now();
      const c = charEl.getBoundingClientRect();
      const ppu = c.width / 200;
      const vx = (cx - c.left) / ppu, vy = (cy - c.top) / (c.height / 300);
      const hr = host.getBoundingClientRect();
      parts.ring(cx - hr.left, cy - hr.top, { color: COLORS.white, r: 26, life: 0.25 });
      fxOn();
      if (round.tap(t, vx, vy, ppu).kind === 'ignored') S.tap();
      flush();
    }
    const input = pointerInput(stage, { onDown: (p, e) => handleTap(e.clientX, e.clientY) });

    guardSurface(root.querySelector('.sp-bar'));
    const onGood = e => {
      e.preventDefault();
      if (ended || ctx.clock.paused || goodBtn.disabled) return;
      round.allGood(now());
      flush();
    };
    goodBtn.addEventListener('pointerdown', onGood);
    const onGoodKey = e => { if (e.detail === 0) onGood(e); };
    goodBtn.addEventListener('click', onGoodKey);

    const onCoolDown = e => {
      const b = e.target.closest('.sp-cd');
      if (!b || b.disabled || ended || ctx.clock.paused) return;
      e.preventDefault();
      try { b.setPointerCapture?.(e.pointerId); } catch { /* synthetic */ }
      round.coolDown(now(), b.dataset.id);
      flush();
    };
    const onCoolUp = () => { if (round.state.hold) { round.coolUp(now()); flush(); } };
    const onCoolKey = e => {
      const b = e.target.closest('.sp-cd');
      if (!b || e.detail !== 0 || b.disabled) return;
      round.coolDown(now(), b.dataset.id);
      if (round.state.hold) { round.state.hold.base = round.state.need; round.coolUp(now()); }
      flush();
    };
    coolsEl.addEventListener('pointerdown', onCoolDown);
    coolsEl.addEventListener('pointerup', onCoolUp);
    coolsEl.addEventListener('pointercancel', onCoolUp);   // iOS system gesture: a kind release, progress kept
    coolsEl.addEventListener('lostpointercapture', onCoolUp);
    coolsEl.addEventListener('click', onCoolKey);

    function flush() { for (const ev of round.drain()) handle(ev); }

    // ---------------------------------------------------------------- frame loop
    function frame(dt) {
      const t = now();
      round.update(t);
      flush();
      if (ended) return;
      for (let i = timers.length - 1, list = timers; i >= 0 && list === timers; i--) {
        if (t >= list[i].at) { const fn = list[i].fn; list.splice(i, 1); fn(); }
      }
      if (round.state.hold) paintHold();
      if (noteUntil && t >= noteUntil) hideNote();
      if (t - lastHud >= 0.2) { lastHud = t; ctx.hud.time(1 - round.progress(t)); }
      parts.update(dt); pops.update(dt); shake.update(dt);
      const o = shake.offset();
      const tr = o.x || o.y ? `translate(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px)` : '';
      if (tr !== lastShake) { stage.style.transform = tr; lastShake = tr; }
      if (t < fxUntil || parts.list.length) { view.clear(); parts.draw(g); pops.draw(g); }
      else if (fxUntil) { view.clear(); fxUntil = 0; }
    }

    // ---------------------------------------------------------------- end
    // Praise what they spotted on their own (a spot the ghost hand walked them through isn't a moment,
    // and neither is one after a guess). The chip, the best moment and the crew line (result.crew.spots)
    // all count st.earlySolo — clean spots at clue 1 or 2 — so they always agree.
    const soloFirst = st => st.firstClue - st.taughtFirst;
    function bestMoment(st) {
      const who = scene => castFor(scene);
      const solo = soloFirst(st);
      if (solo >= 3) return `Spotted it at the first clue ${solo} times!`;
      if (solo) { const c = who(st.firstClueScenes[0]); return c.me ? 'Spotted your own spark at the first clue!' : `Spotted ${c.name}'s spark at the first clue!`; }
      if (st.bestSpot) { const c = who(st.bestSpot.scene); return c.me ? `Caught your own spark at clue ${st.bestSpot.stage}!` : `Caught ${c.name}'s spark at clue ${st.bestSpot.stage}!`; }
      if (st.cools) return st.cools === 1 ? 'Helped the crew cool down!' : `Helped the crew cool down ${st.cools} times!`;
      if (st.decoysRight && st.decoyScene) { const c = who(st.decoyScene); return c.me ? 'Knew you were just happy-dancing!' : `Knew ${c.name} was just happy-dancing!`; }
      return 'You watched the whole crew closely.';
    }
    function finishRound() {
      if (ended) return;
      ended = true;
      clearInterval(bot);
      stopLoop?.(); stopLoop = null;
      ctx.ghost.hide();
      // Caption, notes and speech fade out so nothing peeks out behind the end card.
      root.dataset.phase = 'over';
      hideNote();
      const res = round.result();
      const st = res.stats;
      const chips = [
        st.earlySolo ? `<span class="tag">${icon('sparkle')} Early spots: ${st.earlySolo}</span>` : '',
        st.cools ? `<span class="tag">${icon('calm')} Cool-downs: ${st.cools}</span>` : '',
        st.decoysRight + st.decoysGuessed ? `<span class="tag">${sparkIcon('thumbs')} All good calls: ${st.decoysRight + st.decoysGuessed}</span>` : '',
      ].join('');
      let crewLine;
      if (st.coolIds.includes('minute') && ctx.rng() < 0.5) crewLine = `At home you can say it too, ${ctx.player.name}: I need a minute.`;
      else if (soloFirst(st) >= 2 && ctx.rng() < 0.4) crewLine = 'Noticing early works in real life too. Crew’s got you.';
      ctx.end({
        score: res.score,
        best: bestMoment(st),
        crew: res.crew,
        title: st.spots ? (soloFirst(st) >= 3 ? 'Eagle-eyed spotter!' : 'Spark spotter!') : 'Round complete!',
        extra: chips ? `<div class="sp-end-chips">${chips}</div>` : '',
        ...(crewLine ? { crewLine } : {}),
        spark: {
          spots: st.spots, firstClue: st.firstClue, taughtFirst: st.taughtFirst, earlySolo: st.earlySolo, soloFirst: soloFirst(st), byStage: st.byStage.slice(), guessed: st.guessed, cools: st.cools, own: st.own,
          early: st.early, near: st.near, lookAgain: st.lookAgain, decoyTaps: st.decoyTaps, decoys: st.decoys, decoysRight: st.decoysRight, decoysGuessed: st.decoysGuessed,
          scenes: st.scenes, level: adapt.level, ...(botLog ? { bot: { ...botLog } } : {}),
        },
      });
    }

    // ---------------------------------------------------------------- test bot (real input path)
    const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 91,
      pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
    }));
    // What the bot got to try (the e2e spec checks the game answered each one properly).
    let botLog = null;
    function autoplay() {
      if (bot) return true;
      const r = seeded((ctx.seed || 1) * 7 + 3);
      let planFor = -1, plan = null, sparkNo = 0, decoyNo = 0, up = null, holding = null, restFor = -1;
      botLog = { sparks: 0, decoys: 0, early: 0, late: 0, left: 0, lookAgain: 0, decoyTap: 0, good: 0, restTap: 0, clean: 0, near: 0, nearSpot: 0 };
      const tapAt = (el, p) => { fire(el, 'pointerdown', p.x, p.y); up = { el, p }; };
      const tapCue = cue => { const pts = CUE_POINTS[cue]; const pt = pts[Math.floor(r() * pts.length)]; tapAt(stage, clientPoint([pt[0] + (r() - 0.5) * 16, pt[1] + (r() - 0.5) * 16])); };
      function makePlan(scene, fresh) {
        const p = { react: 0.2 + r() * 0.35, coolIdx: Math.floor(r() * 3) };
        if (!fresh) { p.stage = round.state.shown || 1; return p; }   // joined mid-scene: just spot it
        if (scene.decoy) { p.decoyTap = decoyNo++ === 1; botLog.decoys = decoyNo; return p; }
        const k = sparkNo++;
        botLog.sparks = sparkNo;
        if (k === 0) { p.early = true; p.stage = 1; }            // taps too soon → "Watch closely…", then follows the hand
        else if (k === 1) { p.stage = 3; p.partial = true; }     // spots late → a hold, lets go once
        else if (k === 2) p.stage = 0;                           // never taps → they take their own minute
        else if (k === 3) { p.lookAgain = true; p.stage = 1; }   // "All good!" on a real spark → look again, then spots
        else if (k === 4) { p.stage = 1; p.restTap = true; }     // taps the stage between scenes (a guess)
        else if (k === 5) { p.stage = 1; p.near = true; }        // taps beside the clue → "Tap right on the clue!", then on it
        else p.stage = r() < 0.7 ? 1 : r() < 0.6 ? 2 : 4;
        return p;
      }
      bot = setInterval(() => {
        if (ended || ctx.clock.paused) return;
        if (up) { fire(up.el, 'pointerup', up.p.x, up.p.y); up = null; return; }
        const s = round.state;
        const t = now();
        if (holding && s.phase !== 'cool') { fire(holding.el, 'pointerup', holding.p.x, holding.p.y); holding = null; return; }
        if (s.idx !== planFor && s.scene && (s.phase === 'enter' || s.phase === 'build')) { planFor = s.idx; plan = makePlan(s.scene, s.phase === 'enter' || s.shown === 0); }
        if (planFor !== s.idx || !plan) return;
        if (s.phase === 'own' && !plan.stage && !plan.counted) { plan.counted = true; botLog.left++; }
        if (s.phase === 'calm' && plan.restTap && restFor !== s.idx && t > s.phaseAt + 0.4) {
          restFor = s.idx; botLog.restTap++;
          tapAt(stage, clientPoint([100, 150]));
          return;
        }
        if (s.phase === 'enter' || s.phase === 'build') {
          if (s.shown === 0) {
            if (plan.early && !plan.didEarly && !round.locked) { plan.didEarly = true; botLog.early++; tapCue('fists'); }
            return;
          }
          // After "Tap right on the clue!" it goes straight for the ringed clue (that counts, top rung kept).
          if (plan.didNear && !plan.didNearSpot && round.locked && s.lockUntil === s.softLock) {
            plan.didNearSpot = true;
            // (the spot lands at once, and the near miss added no guess: the rung is what it was)
            const g0 = s.guesses, pt = CUE_POINTS[s.scene.cues[0]][0];
            tapAt(stage, clientPoint(pt));
            if (round.state.phase === 'cool' && round.state.guesses === g0) botLog.nearSpot++;
            return;
          }
          if (round.locked) return;                                // wait out the lock, like a watching player
          if (s.scene.decoy) {
            if (t < s.cueTimes[0] + plan.react) return;
            if (plan.decoyTap && !plan.didTap) { plan.didTap = true; botLog.decoyTap += s.lesson ? 0 : 1; tapCue(s.scene.cues[0]); return; }
            if (!plan.didGood) { plan.didGood = true; botLog.good++; }
            tapAt(goodBtn, clientCenter(goodBtn));
            return;
          }
          if (plan.lookAgain && !plan.didGood && t >= s.cueTimes[0] + plan.react) { plan.didGood = true; botLog.lookAgain += s.lesson ? 0 : 1; tapAt(goodBtn, clientCenter(goodBtn)); return; }
          if (plan.near && !plan.didNear && !s.lesson && t >= s.cueTimes[0] + plan.react) { plan.didNear = true; botLog.near++; tapAt(stage, clientPoint([100, 90])); return; }
          if (plan.stage && s.shown >= plan.stage && t >= s.cueTimes[plan.stage - 1] + plan.react) {
            if (plan.stage >= 3) botLog.late++; else if (!round.guessed) botLog.clean++;
            tapCue(s.scene.cues[s.shown - 1]);
          }
          return;
        }
        if (s.phase === 'cool' && !holding) {
          const btns = [...coolsEl.querySelectorAll('.sp-cd')];
          const b = btns[plan.coolIdx % btns.length];
          if (!b || t < s.phaseAt + 0.25) return;
          const p = clientCenter(b);
          if (!s.need) { tapAt(b, p); return; }
          fire(b, 'pointerdown', p.x, p.y);
          holding = { el: b, p };
          return;
        }
        if (s.phase === 'cool' && holding && plan.partial && !plan.didPartial && round.coolFrac >= 0.4) {
          plan.didPartial = true;
          fire(holding.el, 'pointerup', holding.p.x, holding.p.y);
          holding = null;
        }
      }, 30);
      return true;
    }

    // ---------------------------------------------------------------- hint (tests / fallback)
    function hint() {
      const s = round.state;
      if (s.phase === 'build' && s.shown && !round.locked) {
        if (s.scene.decoy) return { type: 'tap', ...clientCenter(goodBtn) };
        return { type: 'tap', cue: s.scene.cues[0], stage: s.shown, value: spotPoints(round.rung), ...clientPoint(CUE_POINTS[s.scene.cues[0]][0]) };
      }
      if (s.phase === 'cool' && !s.hold) {
        const b = coolsEl.querySelector('.sp-cd');
        if (b) return s.need ? { type: 'hold', ...clientCenter(b), ms: Math.ceil(((s.need - s.progress) / ctx.speed) * 1000) + 200 } : { type: 'tap', ...clientCenter(b) };
      }
      return { type: 'wait', ms: 60, phase: s.phase, shown: s.shown };
    }

    return {
      start() {
        round.start(now());
        flush();
        ctx.hud.score(0);
        stopLoop = startLoop(frame);
      },
      pause() { stopLoop?.(); stopLoop = null; root.classList.add('paused'); if (round.state.hold) { round.coolUp(now()); flush(); } },
      resume() { root.classList.remove('paused'); if (!ended && !stopLoop) stopLoop = startLoop(frame); },
      finish() { round.finish(now()); flush(); },
      destroy() {
        ended = true;
        clearInterval(bot);
        stopLoop?.();
        input.destroy();
        goodBtn.removeEventListener('pointerdown', onGood);
        goodBtn.removeEventListener('click', onGoodKey);
        view.destroy();
        root.remove();
      },
      hint,
      autoplay,
      get round() { return round; },
    };
  },
};
