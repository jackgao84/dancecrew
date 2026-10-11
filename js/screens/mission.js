// Missions: short real-time scenes with a live Heat Meter. No wrong answers, no fail state.
// Lines move on by themselves (tap to skip); choices wait on a timer ring while the heat creeps up.
// Cooling down before it gets HOT is an "Early spot"; "I need a minute" is the Power move; a timer
// that runs out is just a short "Take a minute" breath. Rules + timings live in mission-rt.js.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as FX from '../fx.js';
import { avatarSVG } from '../avatar.js';
import { content, castLookup, fillText, alliesFor } from '../data.js';
import { sceneSVG } from '../scenes.js';
import { actorsHTML } from '../comic.js';
import { el, esc, icon, actions, go, reducedMotion } from '../ui.js';
import { nextMission } from './player.js';
import { SPEED, COLORS, FONT, rng, createCanvas, createParticles, createPops, createShake } from '../games/engine.js';
import { createGhost } from '../games/ghost.js';
import * as RT from './mission-rt.js';
import { KEYS, readKey } from '../storage-keys.js';

const SCORE = [
  null,
  { title: 'Nice groove', line: 'You made it through a tricky moment.' },
  { title: 'Smooth moves', line: 'You found a way to cool down and keep going.' },
  { title: 'Rewind Legend', line: 'You made a repair. That’s the hardest move there is!' },
];
const READ_KEY = KEYS.readAloud; // per device, like the rhythm calibration
const COOL = [COLORS.mint, COLORS.sky, COLORS.white, COLORS.yellow];
const WARMC = [COLORS.orange, COLORS.yellow, COLORS.pink];
const FUN = [COLORS.yellow, COLORS.pink, COLORS.sky, COLORS.mint, COLORS.grape];
// The breathing buddy's face: eyes closed, slow smile.
const CALM_FACE = `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="#3B2A4A" stroke-width="3.5" stroke-linecap="round">
<path d="M11,21 Q15.5,16.5 20,21 M28,21 Q32.5,16.5 37,21"/><path d="M17,30 Q24,36 31,30"/></g>
<ellipse cx="10" cy="28" rx="4" ry="2.5" fill="#FF8FB1" opacity=".7"/><ellipse cx="38" cy="28" rx="4" ry="2.5" fill="#FF8FB1" opacity=".7"/></svg>`;

// Read-aloud glyph: an open book with a little sound arc (a speaker would read as "mute").
const BOOK = '<path d="M24,13 Q15,7 4,10 V38 Q15,35 24,40 Q33,35 44,38 V10 Q33,7 24,13 Z"/>';
const READ_IC = `<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><g fill="#3B2A4A" stroke="#3B2A4A" stroke-width="7" stroke-linejoin="round">${BOOK}</g><g fill="#fff">${BOOK}</g>
<path d="M24,14 V39 M9,16 Q14,15 19,17 M9,22 Q14,21 19,23 M29,17 Q34,15 39,16 M29,23 Q34,21 39,22" fill="none" stroke="#3B2A4A" stroke-width="3" stroke-linecap="round"/></svg>`;

const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
const readPref = () => { try { return readKey(READ_KEY) === '1'; } catch { return false; } };
const savePref = v => { try { localStorage.setItem(READ_KEY, v ? '1' : '0'); } catch { /* private mode */ } };

export default function mission(root, pid, missionId) {
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const td = State.today(p);
  if (td.missionDone) { go('#/player/' + p.id); return; }

  const m = missionId ? content.missions.find(x => x.id === missionId) : nextMission(p);
  if (!m) return picker(root, p);

  const rm = reducedMotion();
  const idx = content.missions.indexOf(m);
  const lookup = castLookup({ me: p, allies: alliesFor(p, idx) });
  const fill = t => fillText(t, lookup);
  const X = [24, 56, 82];
  const cast = m.cast.map((who, i) => ({ who, x: X[i] ?? 50, expr: 'happy' }));
  const me = cast.find(c => c.who === 'me');
  const newbie = Object.keys(p.missions || {}).length < 2;
  const speakOk = canSpeak();
  let readAloud = speakOk && readPref();
  // Choice order is shuffled per choice point (display only), so tapping blind never picks one kind.
  const seed = (Date.now() + idx * 7919) >>> 0;
  const rand = rng(seed);

  const screen = el(`<main class="screen mission rt" data-phase="intro">
    <header class="topbar">
      <button class="icon-btn" data-act="leave" aria-label="Leave">${icon('back')}</button>
      <div class="title"><h1>${esc(m.title)}</h1><div class="sub">Mission ${idx + 1} of ${content.missions.length}</div></div>
      ${speakOk ? `<button class="read-btn" data-act="read" aria-pressed="${readAloud}" aria-label="Read aloud">${READ_IC}<span>Read</span></button>` : ''}
    </header>
    <div class="mission-stage">
      <div class="scene-wrap">
        <div class="comic-panel">${sceneSVG(m.bg)}<div class="cast"></div></div>
      </div>
      <div class="heat" role="meter" aria-label="Heat meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-level="cool">
        <span class="heat-label">HEAT</span>
        <div class="heat-tube"><i></i><b class="heat-hotline" aria-hidden="true"></b></div>
        <span class="heat-word">Cool</span>
      </div>
    </div>
    <div class="dialogue" aria-live="polite"></div>
  </main>`);
  root.appendChild(screen);
  const stage = screen.querySelector('.mission-stage');
  const wrap = screen.querySelector('.scene-wrap');
  const castEl = screen.querySelector('.cast');
  const dlg = screen.querySelector('.dialogue');
  const heatBox = screen.querySelector('.heat');
  const tubeCover = screen.querySelector('.heat-tube i');
  const heatWord = screen.querySelector('.heat-word');
  const readBtn = screen.querySelector('.read-btn');

  // ---- timing: every timer on this screen goes through one scheduler (pausable, SPEED-scaled)
  const sched = RT.createScheduler({ speed: SPEED });
  const run = RT.createRun();
  const view = createCanvas(stage);
  view.canvas.classList.add('mission-fx');
  const parts = createParticles(260);
  const pops = createPops();
  const shake = createShake();
  const ghost = createGhost(screen);
  let fxUntil = 0;          // keep drawing the fx canvas until this time (s)
  let fxDrawn = false;
  const wakeFx = secs => { fxUntil = Math.max(fxUntil, performance.now() / 1000 + secs); };

  let phase = 'intro';
  let node = null;
  let lineIdx = 0;
  let attempt = 0;          // how many times this choice set has come back after a pause
  let order = null;         // display order of the current node's choices (data indexes)
  let choicesReady = false; // taps count only once the choices have animated in
  let rise = RT.RISE_MIN;   // heat/s for the current node's own heat
  let creep = 0;            // heat/s while the choices wait
  let lineTimer = null;     // { start, total, bar }
  let timer = null;         // { start, total, attempt, ring }
  let breath = null;        // { start, total, circle, label, out }
  let jobs = [];            // ids of the current step's jobs (cancelled on every step change)
  let finished = false;
  let shownHeat = -1;
  let shownLevel = 'cool';
  let ghostOn = null;       // 'line' | 'choice'
  let ghostChoiceShown = false;
  let lineCount = 0;
  let rising = false;
  const events = [];        // key moments, for the test hook
  const logEvent = (type, extra = {}) => { if (events.length < 60) events.push({ type, at: +sched.now.toFixed(2), heat: Math.floor(run.heat), eff: Math.floor(RT.effHeat(run)), ...extra }); };

  const later = (sec, fn) => { const id = sched.after(sec, fn); jobs.push(id); return id; };
  const clearJobs = () => { jobs.forEach(id => sched.cancel(id)); jobs = []; };
  const setPhase = ph => { phase = ph; screen.dataset.phase = ph; };

  // ---- speech (optional read-aloud, built-in speechSynthesis only)
  const speech = { active: false, token: 0, fallback: 0, u: null };
  function hush() {
    speech.token++;
    speech.active = false;
    speech.fallback = sched.cancel(speech.fallback);
    if (speakOk) try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
  function speak(text) {
    if (!readAloud || !speakOk || !text) return;
    hush();
    const tok = speech.token;
    const done = () => { if (tok !== speech.token) return; speech.active = false; speech.fallback = sched.cancel(speech.fallback); };
    try {
      const u = new window.SpeechSynthesisUtterance(String(text).replace(/[“”]/g, ''));
      u.rate = 0.95; u.pitch = 1.1;
      u.onend = done; u.onerror = done;
      speech.u = u; // hold on to it: Safari can garbage-collect an utterance before its onend fires
      speech.active = true;
      // Some voices never fire onend: stop waiting after a generous estimate.
      speech.fallback = sched.after(1.2 + String(text).length * 0.085, done);
      window.speechSynthesis.speak(u);
    } catch { speech.active = false; }
  }
  /** Run fn once any read-aloud has finished. */
  const whenQuiet = fn => (speech.active ? later(0.2, () => whenQuiet(fn)) : fn());

  // ---- scene
  let castKey = '';
  function paintCast(speaking = null, move = null) {
    const list = cast.map(c => (c.who === 'me' && move ? { ...c, move } : c));
    const key = JSON.stringify(list);
    if (key !== castKey) {
      castKey = key;
      castEl.innerHTML = actorsHTML(list, lookup, { speaking });
    } else {
      castEl.querySelectorAll('.actor').forEach(a => a.classList.toggle('speaking', a.dataset.who === speaking));
    }
    castEl.querySelector('[data-who="me"] .av')?.classList.toggle('mv-heated', heatedLook());
  }
  function squashMe() {
    if (rm) return;
    const av = castEl.querySelector('[data-who="me"] .av');
    if (!av) return;
    av.classList.remove('squash'); void av.getBoundingClientRect(); av.classList.add('squash');
  }
  /** Point on the fx canvas: the player's avatar head, or the top of the heat tube. */
  function spot(where) {
    const s = stage.getBoundingClientRect();
    const r = (where === 'heat' ? heatBox.querySelector('.heat-tube') : castEl.querySelector('[data-who="me"]'))?.getBoundingClientRect();
    if (!r) return { x: s.width / 2, y: s.height / 2, h: 100 };
    if (where === 'heat') return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height * (1 - run.heat / 100), h: r.height };
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height * 0.25, h: r.height };
  }
  function popText(text, where, color, big = false) {
    const pt = spot(where);
    const size = Math.max(22, Math.min(46, view.w / (big ? 15 : 20)));
    // Keep the whole word (and its ink outline) on the canvas at the pop's 1.2x peak.
    const peak = size * 1.2;
    view.g.font = `900 ${Math.round(peak)}px ${FONT}`;
    const half = view.g.measureText(text).width / 2 + peak / 10 + 6;
    const x = half * 2 >= view.w ? view.w / 2 : Math.max(half, Math.min(view.w - half, pt.x));
    const life = big ? 1.4 : 1.1;
    pops.add(text, x, Math.max(size, pt.y - size * 0.4), { size, color, life, rise: rm ? 0 : 50 });
    wakeFx(life);
    logEvent('pop', { text, left: Math.round(x - half), right: Math.round(x + half), w: Math.round(view.w) });
  }
  function burst(where, colors, n = 18, shape = 'circle') {
    const pt = spot(where);
    // Reduced motion: a few slow sparkles that barely travel, no expanding ring.
    if (rm) parts.burst(pt.x, pt.y, { n: Math.ceil(n / 4), colors, speed: 60, size: 9, shape, life: 0.7, gravity: 0 });
    else {
      parts.burst(pt.x, pt.y, { n, colors, speed: 300, size: 9, shape, life: 0.9 });
      parts.ring(pt.x, pt.y, { color: colors[0], r: 50 });
    }
    wakeFx(1);
  }

  // ---- heat meter (painted from the frame loop only when the rounded value changes)
  const LEVELS = ['cool', 'warm', 'hot'];
  let cooling = false;
  const heatedLook = () => me?.expr === 'heated' && shownLevel === 'hot' && !rm;
  function paintHeat(nowRising) {
    if (nowRising !== rising) { rising = nowRising; heatBox.classList.toggle('rising', rising && !rm); }
    const nowCooling = !sched.paused && run.pending < -0.5;
    if (nowCooling !== cooling) { cooling = nowCooling; heatBox.classList.toggle('cooling', cooling); }
    const h = Math.floor(run.heat); // floor: the meter reads HOT! exactly when the rules say HOT
    if (h === shownHeat) return;
    shownHeat = h;
    tubeCover.style.transform = `translateY(${-h}%)`;
    heatBox.setAttribute('aria-valuenow', h);
    const lv = RT.heatLevel(h);
    if (lv === shownLevel) return;
    const up = LEVELS.indexOf(lv) > LEVELS.indexOf(shownLevel);
    shownLevel = lv;
    heatWord.textContent = RT.HEAT_WORD[lv];
    heatBox.dataset.level = lv;
    if (!rm) { heatBox.classList.remove('bump'); void heatBox.offsetWidth; heatBox.classList.add('bump'); }
    if (up) {
      Sound.heatUp();
      burst('heat', WARMC, 10);
      if (lv === 'hot') logEvent('hot');
      // A heated reaction gets a light shake; heat that built while someone was reading doesn't.
      if (lv === 'hot' && phase !== 'choices') { shake.add(5); wakeFx(0.5); }
    }
    castEl.querySelector('[data-who="me"] .av')?.classList.toggle('mv-heated', heatedLook());
  }

  // ---- per-frame progress (read bar, choice ring, breathing circle)
  function paintProgress() {
    const now = sched.now;
    if (lineTimer?.bar) lineTimer.bar.style.transform = `scaleX(${Math.min(1, (now - lineTimer.start) / lineTimer.total).toFixed(3)})`;
    if (timer?.ring && timer.start != null) {
      const left = Math.max(0, 1 - (now - timer.start) / timer.total);
      timer.ring.style.strokeDashoffset = (100 * (1 - left)).toFixed(2);
      const low = left < 0.3;
      if (low !== timer.low) { timer.low = low; timer.ringBox.classList.toggle('low', low); }
    }
    if (breath) {
      const k = Math.min(1, (now - breath.start) / breath.total);
      // In for the first ~45%, a short hold, out for the rest.
      const s = k < 0.45 ? k / 0.45 : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      breath.circle.style.transform = `scale(${(0.62 + 0.38 * s).toFixed(3)})`;
      breath.ring.style.strokeDashoffset = (100 * (1 - k)).toFixed(2);
      const out = k >= 0.5;
      if (out !== breath.out) { breath.out = out; breath.label.textContent = out ? '…and out.' : 'Breathe in…'; }
    }
  }

  // ---- frame loop: the only place time moves
  let raf = 0;
  let last = performance.now();
  const STEP = 1 / 60;
  const waitingOnRing = () => phase === 'choices' && timer?.start != null && creep > 0;
  const frame = t => {
    const realDt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    // Small steps, so a slow frame (or ?speed=4) can't fire a timer before the heat has caught up.
    let moved = false;
    for (let rem = realDt; rem > 1e-6; rem -= STEP) {
      const dt = sched.advance(Math.min(rem, STEP));
      if (!dt) break;
      moved = true;
      RT.stepHeat(run, dt, { rise, creep: waitingOnRing() ? creep : 0 });
    }
    if (moved) paintProgress();
    const waiting = waitingOnRing();
    paintHeat(!sched.paused && (run.pending > 0.5 || (waiting && run.heat < RT.CREEP_CAP)));
    // Juice layer: only drawn while something is alive on it.
    if (t / 1000 < fxUntil || parts.list.length) {
      parts.update(realDt); pops.update(realDt); shake.update(realDt);
      view.clear();
      parts.draw(view.g); pops.draw(view.g);
      const o = shake.offset();
      wrap.style.transform = o.x || o.y ? `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px)` : '';
      fxDrawn = true;
    } else if (fxDrawn) { fxDrawn = false; view.clear(); wrap.style.transform = ''; }
    raf = requestAnimationFrame(frame);
  };

  // ---- ghost hand (first seconds only)
  function showGhost(kind, target, text) {
    if (!target) return;
    const s = screen.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    ghost.show({ type: 'tap', x: 0, y: 0, text });
    const tw = text ? screen.querySelector('.ghost-text')?.offsetWidth || 200 : 64;
    const x = Math.max(tw / 2 + 8, Math.min(s.width - tw / 2 - 8, r.left - s.left + Math.min(r.width * 0.5, 90)));
    const y = r.top - s.top + Math.min(r.height * 0.5, 36);
    ghost.show({ type: 'tap', x, y, text });
    ghostOn = kind;
    sched.after(3.2, () => { if (ghostOn === kind) hideGhost(); });
  }
  function hideGhost() { ghostOn = null; ghost.hide(); }

  // ---- flow
  function intro() {
    dlg.innerHTML = `<div class="mission-intro panel white pop-in">
      <h2>${esc(fill(m.title))}</h2>
      <p>${esc(fill(m.blurb))}</p>
      <div class="how">${icon('flame')}<p>Heat rises while you wait. Cool it early!</p></div>
      <button class="btn huge pink" data-act="start">${icon('play')} Start</button>
    </div>`;
  }

  function enter(id) {
    node = m.nodes[id];
    if (!node) return finish();
    lineIdx = 0;
    attempt = 0;
    order = null;
    cast.forEach(c => { if (node.expr?.[c.who]) c.expr = node.expr[c.who]; });
    const secs = node.lines.reduce((s, l) => s + RT.readTime(fill(l.text)), 0);
    rise = RT.riseRate(node.heat || 0, secs);
    RT.addHeat(run, node.heat || 0);
    showLine();
  }

  function showLine() {
    clearJobs();
    setPhase('line');
    timer = null; breath = null;
    const line = node.lines[lineIdx];
    const text = fill(line.text);
    const speaker = line.who === 'narrator' ? null : lookup(line.who);
    const last = lineIdx === node.lines.length - 1;
    const beforeChoices = last && !!node.choices;
    paintCast(line.who, node.end && last ? node.move : null);
    dlg.innerHTML = `<button class="line ${speaker ? 'talk' : 'narr'} pop-in" data-act="advance" ${beforeChoices ? 'data-hold' : ''}>
      ${speaker ? `<span class="line-av">${avatarSVG(speaker.avatar, { crop: 'head', expr: cast.find(c => c.who === line.who)?.expr || 'happy' })}</span>` : ''}
      <span class="line-text">${speaker ? `<b>${esc(speaker.name)}</b>` : ''}${esc(text)}</span>
      <span class="line-next">${icon('next')}</span>
      ${beforeChoices ? '' : '<span class="read-bar" aria-hidden="true"><i></i></span>'}
    </button>`;
    Sound.note(74 + (lineCount++ % 4) * 3, 0.07, 'sine', 0.06);
    speak(speaker ? `${speaker.name}: ${text}` : text);
    // The line right before the choices never moves on by itself: it stays up with them.
    if (beforeChoices) { lineTimer = null; later(0.35, () => whenQuiet(showChoices)); }
    else {
      lineTimer = { start: sched.now, total: RT.readTime(text), bar: dlg.querySelector('.read-bar i') };
      later(lineTimer.total, () => whenQuiet(advance));
    }
    if (lineCount === 1) later(0.4, () => showGhost('line', dlg.querySelector('.line-next'), 'Tap to skip'));
  }

  function advance() {
    if (phase !== 'line') return;
    if (ghostOn === 'line') hideGhost();
    if (lineIdx < node.lines.length - 1) { lineIdx++; showLine(); return; }
    if (node.choices) { showChoices(); return; }
    if (node.next) { enter(node.next); return; }
    if (node.end) finish();
  }

  function showChoices() {
    if (phase !== 'line' && phase !== 'pause') return;
    clearJobs();
    setPhase('choices');
    lineTimer = null; breath = null;
    dlg.querySelector('.line-next')?.remove();
    dlg.querySelector('.read-bar')?.remove();
    dlg.querySelector('.choice-set, .take-minute')?.remove();
    const texts = node.choices.map(c => fill(c.text));
    const n = texts.length;
    // A fresh order at each choice point; the same one when they come back after a pause.
    if (!order || attempt === 0) order = RT.shuffleOrder(n, rand);
    choicesReady = false;
    dlg.insertAdjacentHTML('beforeend', `<div class="choice-set" data-attempt="${attempt}">
      <div class="choice-head pop-in">
        <span class="ring" aria-hidden="true"><svg viewBox="0 0 56 56"><circle class="ring-bg" cx="28" cy="28" r="22"/><circle class="ring-fg" cx="28" cy="28" r="22" pathLength="100"/></svg>${icon('clock')}</span>
        <b>${attempt ? 'Ready? Your move.' : newbie && !ghostChoiceShown ? 'Pick before the ring runs out!' : `Your move, ${esc(p.name)}!`}</b>
      </div>
      <div class="choices">${order.map((i, slot) => {
        const c = node.choices[i];
        const g = RT.kindGroup(c.kind);
        const st = RT.kindStyle(c.kind);
        // Reduced motion: no stagger, every choice appears at once (a delayed one would sit
        // invisible while taps already count).
        return `<button class="choice k-${g}${st !== g ? ' k-' + st : ''} pop-in"${rm ? '' : ` style="animation-delay:${(0.06 + slot * 0.08).toFixed(2)}s"`} data-act="choose" data-i="${i}" data-kind="${esc(c.kind)}">
          <span class="kind-ic" title="${esc(RT.KIND_LABEL[st])}">${icon(RT.KIND_ICON[st])}</span><span class="choice-text">${esc(texts[i])}</span></button>`;
      }).join('')}</div>
    </div>`);
    Sound.whoosh();
    const ringBox = dlg.querySelector('.ring');
    const lineText = fill(node.lines[node.lines.length - 1]?.text || '');
    timer = { start: null, total: RT.choiceTime(texts, attempt), attempt, ring: ringBox.querySelector('.ring-fg'), ringBox, low: false, lineText, texts };
    speak(order.map(i => texts[i]).join('. … ')); // in the order they're shown
    // Taps count, and the ring starts, only once every choice has popped in: after the last one's
    // delay plus its pop, or (reduced motion, all shown at once) a short beat so a tap meant for
    // the line doesn't land on a choice. The ring also waits for any read-aloud to finish.
    const inSecs = rm ? 0.15 : 0.06 + 0.08 * (n - 1) + 0.5;
    later(inSecs, () => { choicesReady = true; whenQuiet(startRing); });
  }

  function startRing() {
    if (phase !== 'choices' || !timer) return;
    timer.start = sched.now;
    // Heat builds while the ring waits, but can't tip HOT before a reader has read the line and
    // every choice. After a "Take a minute" it builds again, until it has been HOT once.
    const plan = RT.ringCreep(run, node, timer.total, attempt, RT.readAllowance(timer.lineText, timer.texts));
    creep = plan.rate;
    logEvent('ring', { attempt, total: +timer.total.toFixed(2), hotAt: +plan.hotAt.toFixed(2), creep: +creep.toFixed(3) });
    later(timer.total, onTimeout);
    if (newbie && attempt === 0 && !ghostChoiceShown) {
      ghostChoiceShown = true;
      const target = dlg.querySelector('.choice[data-kind="minute"] .kind-ic') || dlg.querySelector('.choice .kind-ic');
      later(0.3, () => showGhost('choice', target, ''));
    }
  }

  // The ring ran out: a neutral breathing pause, then the same choices with more time.
  function onTimeout() {
    if (phase !== 'choices') return;
    clearJobs();
    hideGhost();
    hush();
    logEvent('timeout', { attempt });
    RT.timeout(run);
    setPhase('pause');
    timer = null; creep = 0; choicesReady = false;
    me.expr = 'focus';
    castKey = ''; paintCast(null);
    dlg.querySelector('.choice-set')?.remove();
    dlg.insertAdjacentHTML('beforeend', `<div class="take-minute panel pop-in" role="status">
      <div class="breath" aria-hidden="true">
        <svg viewBox="0 0 120 120"><circle class="br-track" cx="60" cy="60" r="54"/><circle class="br-ring" cx="60" cy="60" r="54" pathLength="100"/></svg>
        <i class="br-bubble">${CALM_FACE}</i>
      </div>
      <div class="tm-text"><h2>Take a minute</h2><p class="br-label">Breathe in…</p></div>
    </div>`);
    const box = dlg.querySelector('.take-minute');
    breath = { start: sched.now, total: RT.BREATH_SECS, circle: box.querySelector('.br-bubble'), ring: box.querySelector('.br-ring'), label: box.querySelector('.br-label'), out: false };
    const half = RT.BREATH_SECS / 2 / SPEED;
    Sound.breathIn(half);
    later(RT.BREATH_SECS / 2, () => Sound.breathOut(half));
    later(RT.BREATH_SECS, () => { logEvent('pause-end'); attempt++; showChoices(); });
  }

  function choose(i) {
    if (phase !== 'choices' || !choicesReady) return;
    const c = node.choices[i];
    if (!c) return;
    clearJobs();
    hideGhost();
    hush();
    timer = null; creep = 0; choicesReady = false;
    logEvent('choose', { kind: c.kind, attempt });
    const res = RT.choose(run, c, node);
    if (c.kind === 'minute' || c.kind === 'repair' || c.kind === 'words') me.expr = c.kind === 'repair' ? 'calm' : 'focus';
    if (c.kind === 'hot') me.expr = 'heated';
    if (c.kind === 'calm') me.expr = 'grin';
    castKey = '';
    const quoted = c.kind === 'minute' ? 'I need a minute.' : (c.text.match(/“([^”]+)”/) || [])[1];
    if (quoted) {
      node = { lines: [{ who: 'me', text: quoted }], next: c.to };
      lineIdx = 0;
      showLine();
    } else enter(c.to);
    squashMe();
    celebrate(res);
  }

  function celebrate(res) {
    if (res.power) {
      popText('Power move!', 'me', COLORS.mint, true);
      burst('me', COOL, 26, 'star');
      Sound.combo(6); Sound.chime();
    }
    if (res.early) {
      // Straight on the scheduler, not the step's job list: tapping the next line must not cancel it.
      sched.after(res.power ? 0.45 : 0, () => { popText('Early spot!', 'heat', COLORS.yellow); burst('heat', [COLORS.yellow, COLORS.white, COLORS.mint], 14, 'star'); Sound.spark(); });
    }
    if (res.kind === 'repair') { popText('Rewind!', 'me', COLORS.grape, true); burst('me', [COLORS.grape, COLORS.pink, COLORS.white], 22, 'star'); Sound.tapeRewind(); }
    if (res.kind === 'words' && !res.early) { burst('me', COOL, 14); Sound.combo(3); }
    if (res.kind === 'calm') { burst('me', FUN, 14); Sound.combo(4); }
    if (res.kind === 'hot') { burst('me', WARMC, 12); }
    if (res.delta < 0) { Sound.coolDown(); burst('heat', COOL, 10); }
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearJobs();
    hideGhost();
    hush();
    setPhase('results');
    lineTimer = null; timer = null; breath = null; creep = 0;
    const endNode = node;
    const score = RT.scoreRun(run, endNode);
    const prevBest = p.missions?.[m.id]?.best || 0;
    State.recordMission(p.id, m.id, score);
    // Spotting it early lights this mission's spark (kept on the record; notes stay as v1).
    const spark = RT.earnedSpark(run);
    const newSpark = spark && !State.player(p.id).missions?.[m.id]?.spark;
    if (newSpark) State.mutate(s => { const rec = s.players.find(x => x.id === p.id)?.missions?.[m.id]; if (rec) rec.spark = true; });
    const t = State.today(State.player(p.id));
    RT.addHeat(run, Math.min(0, 8 - RT.effHeat(run)));
    paintCast(null, endNode?.move || 'bounce');
    Sound.levelUp();
    FX.confetti(score === 3 ? 90 : 60);
    const buddy = lookup('a1') || lookup('a2');
    const recap = RT.recap(run).map(r => `<li class="rc-${r.key}">${icon(r.icon)}<span>${esc(r.text)}</span></li>`).join('');
    const nextBtn = t.practiceReady
      ? `<button class="btn mint" data-act="practice">${icon('boombox')} Practice time!</button>`
      : t.resting ? `<button class="btn grape" data-act="rest">${icon('moon')} Done for today</button>`
      : `<button class="btn pink" data-act="done">${icon('check')} Done</button>`;
    dlg.innerHTML = `<div class="results panel yellow pop-in">
      <div class="notes">${[1, 2, 3].map(n => `<span class="${n <= score ? 'on' : ''}">${icon('note', n <= score ? '#9B6BFF' : '#fff')}</span>`).join('')}${spark ? `<i class="spark-badge" role="img" aria-label="Early spotter!">${icon('sparkle', '#FFD23F')}${newSpark ? '<b class="tag">New!</b>' : ''}</i>` : ''}</div>
      <h2>Mission complete!<span class="rs-title">${esc(SCORE[score].title)}</span></h2>
      ${prevBest && score > prevBest ? '<span class="tag new-best">New best!</span>' : ''}
      <p>${esc(SCORE[score].line)}</p>
      ${recap ? `<ul class="recap">${recap}</ul>` : ''}
      ${buddy ? `<div class="crew-say"><span class="cl-av">${avatarSVG(buddy.avatar, { crop: 'head', expr: 'grin' })}</span><p><b>${esc(buddy.name)}:</b> “${esc(RT.crewLine(run, endNode))}”</p></div>` : ''}
      ${!t.goalMet ? `<p class="small"><b>Next:</b> earn 3 real-life points today to unlock your Practice Session.</p>` : ''}
      <div class="row">${nextBtn}</div>
    </div>`;
    if (score >= 2) later(0.3, () => { burst('me', FUN, 30, 'star'); });
    if (spark) later(0.7, () => { Sound.spark(); });
  }

  // ---- input: lines and choices answer on release (a scroll or pointercancel is neutral),
  // with instant pressed feedback on pointerdown. Keyboard / assistive clicks still work.
  let press = null;
  let lastPointer = -1e9;
  const tapTarget = e => e.target.closest?.('[data-act="advance"], [data-act="choose"]');
  const unpress = () => { press?.t.classList.remove('pressed'); press = null; };
  const commit = t => {
    if (!t.isConnected) return;
    if (t.dataset.act === 'choose') choose(Number(t.dataset.i));
    else if (phase === 'line') advance();
  };
  const onDown = e => {
    lastPointer = performance.now();
    if (e.button > 0) return;
    const t = tapTarget(e);
    if (!t) return;
    if (t.dataset.act === 'choose' && !choicesReady) return; // still popping in: not readable yet
    unpress();
    press = { t, id: e.pointerId, x: e.clientX, y: e.clientY };
    t.classList.add('pressed');
    Sound.tap();
  };
  const onMove = e => { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 16) unpress(); };
  const onUp = e => {
    lastPointer = performance.now();
    if (!press || e.pointerId !== press.id) return;
    const t = press.t;
    unpress();
    commit(t);
  };
  const onCancel = e => { if (press && e.pointerId === press.id) unpress(); };
  const onClick = e => {
    const t = tapTarget(e);
    if (!t) return;
    // Pointer taps were handled on release; this is a keyboard / switch / VoiceOver activation.
    if (e.detail === 0 || performance.now() - lastPointer > 800) { Sound.tap(); commit(t); }
  };
  screen.addEventListener('pointerdown', onDown);
  screen.addEventListener('pointermove', onMove);
  screen.addEventListener('pointerup', onUp);
  screen.addEventListener('pointercancel', onCancel);
  screen.addEventListener('click', onClick);

  // ---- hiding the app pauses every timer (and the read-aloud)
  const onVis = () => {
    if (document.hidden) { sched.pause(); hush(); unpress(); } else { sched.resume(); last = performance.now(); }
  };
  document.addEventListener('visibilitychange', onVis);

  function toggleRead() {
    readAloud = !readAloud;
    savePref(readAloud);
    readBtn?.setAttribute('aria-pressed', readAloud);
    if (!readAloud) { hush(); return; }
    Sound.unlock();
    if (phase === 'line' || phase === 'choices') {
      const line = node.lines[lineIdx];
      speak(phase === 'choices' ? (order || node.choices.map((_, i) => i)).map(i => fill(node.choices[i].text)).join('. … ') : fill(line.text));
    }
  }

  // Test hook (headless e2e): read-only view of the live state.
  const hook = window.__mission = {
    id: m.id,
    get phase() { return phase; },
    get heat() { return Math.floor(run.heat); },
    get eff() { return Math.floor(RT.effHeat(run)); },
    get kinds() { return run.kinds.slice(); },
    get events() { return events.slice(); },
    get run() { return { ...run, kinds: run.kinds.slice() }; },
    get timer() { return timer && { total: timer.total, attempt: timer.attempt, started: timer.start != null, left: timer.start == null ? timer.total : Math.max(0, timer.total - (sched.now - timer.start)), allowance: RT.readAllowance(timer.lineText, timer.texts), creep }; },
    get line() { return lineTimer && { total: lineTimer.total, left: Math.max(0, lineTimer.total - (sched.now - lineTimer.start)) }; },
    get now() { return sched.now; },
    get paused() { return sched.paused; },
    get pending() { return sched.size; },
    get readAloud() { return readAloud; },
    get order() { return order && order.slice(); },
    get ready() { return choicesReady; },
    seed,
    sched,
    speed: SPEED,
  };

  intro();
  paintCast();
  paintHeat(false);
  raf = requestAnimationFrame(frame);

  const off = actions(screen, {
    leave: () => go('#/player/' + p.id),
    start: () => { Sound.unlock(); enter(m.start); },
    read: () => toggleRead(),
    practice: () => go('#/practice/' + p.id),
    rest: () => go('#/rest/' + p.id),
    done: () => go('#/player/' + p.id),
  });

  return () => {
    off();
    cancelAnimationFrame(raf);
    sched.destroy();
    hush();
    ghost.destroy();
    view.destroy();
    screen.removeEventListener('pointerdown', onDown);
    screen.removeEventListener('pointermove', onMove);
    screen.removeEventListener('pointerup', onUp);
    screen.removeEventListener('pointercancel', onCancel);
    screen.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', onVis);
    if (window.__mission === hook) window.__mission = null;
  };
}

// All missions played at least once: pick one to replay.
function picker(root, p) {
  const screen = el(`<main class="screen mission-pick">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>Pick a mission</h1><div class="sub">You've played them all — replay a favourite!</div></div>
    </header>
    <div class="mission-list">${content.missions.map(m => {
      const rec = p.missions[m.id] || {};
      const best = rec.best || 0;
      return `<button class="big-link panel white" data-act="pick" data-id="${m.id}">${icon('flame')}<span><b>${esc(m.title)}</b><small>${esc(m.blurb)}</small></span>
        <span class="mini-notes">${[1, 2, 3].map(n => icon('note', n <= best ? '#9B6BFF' : '#eee')).join('')}<i class="mini-spark${rec.spark ? ' on' : ''}" title="${rec.spark ? 'Early spotter!' : 'Spot it early to light the spark'}">${icon('sparkle', rec.spark ? '#FFD23F' : '#eee')}</i></span></button>`;
    }).join('')}</div>
  </main>`);
  root.appendChild(screen);
  return actions(screen, {
    back: () => go('#/player/' + p.id),
    pick: b => go(`#/mission/${p.id}/${b.dataset.id}`),
  });
}
