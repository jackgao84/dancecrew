// Beat Battle — four lanes on a DPR canvas, the player's avatar dancing their unlocked moves
// (DOM SVG + the mv-* dance classes), a live Heat Meter and the CHILL button.
// Every rule lives in beat-model.js; this file is view, input, sound and juice.
// Top-level code stays DOM-free: unit tests import this module in Node.
import * as R from '../rules.js';
import { avatarSVG } from '../avatar.js';
import { icon } from '../ui.js';
import {
  createCanvas, startLoop, pointerInput, guardSurface, createParticles, createPops, createShake,
  roundRect, inkFill, outlinedText, starPath, COLORS, INK, clamp, ease,
} from './engine.js';
import { startRhythm } from './rhythm.js';
import * as M from './beat-model.js';

const TAU = Math.PI * 2;
const LANES = ['sky', 'pink', 'mint', 'yellow'];
const TINT = { sky: '#D4F0FF', pink: '#FFD9EA', mint: '#D2F7E8', yellow: '#FFF0B3', orange: '#FFE4C9', grape: '#E8DEFF' };
const SOFT = '#D9D1E3'; // a note that slid by: it just fades, no red, no X
const DASH = [6, 14], NO_DASH = [];
// Low levels get Clap / Stomp / Jump pads so every lane and the freestyle have a move.
const FILLERS = [
  { id: 'clap', name: 'Clap', cls: 'cheer', color: 'pink', drum: 'clap' },
  { id: 'stomp', name: 'Stomp', cls: 'bbstomp', color: 'orange', drum: 'kick' },
  { id: 'jump', name: 'Jump', cls: 'bbjump', color: 'mint', drum: 'jump' },
];
const GRADE = {
  perfect: { text: 'Perfect!', color: COLORS.yellow },
  great: { text: 'Great!', color: COLORS.white },
  good: { text: 'Nice!', color: COLORS.mint },
};
const TEACH = { tap: 'Tap as it lands!', hold: 'Hold it down!', swipe: 'Flick it up!' };
const GHOST_HAND = 56; // the ghost hand reaches this far right of / below its fingertip
const PAD_NOTES = [72, 75, 79, 82]; // pentatonic pops for the freestyle pads
const KEYS = { d: 0, f: 1, j: 2, k: 3, 1: 0, 2: 1, 3: 2, 4: 3 };

/** The moves this player has unlocked (newest four) + Clap/Stomp fillers. Lane i = pad i. */
function moveSet(State, player) {
  const moves = State.unlockedMoves(player).slice(-4).map(m => ({ id: m.id, name: m.name, cls: m.id, color: m.color }));
  const pads = moves.length ? [...moves] : [];
  for (const f of FILLERS) if (pads.length < 4) pads.push(f);
  return { pads, lanes: LANES.map((_, i) => pads[i % pads.length]) };
}

const roundsPlayed = p => Object.entries(p.games || {})
  .filter(([k]) => k === 'beat' || k.startsWith('beat.')).reduce((n, [, g]) => n + (g.rounds?.length || 0), 0);

export default {
  id: 'beat',
  title: 'Beat Battle',
  blurb: 'Tap, hold and flick to the beat. Too hot? CHILL!',
  icon: 'note',
  color: 'grape',
  kind: 'arcade',
  rhythm: true,
  ready: true,
  tiers: M.TIERS.map(t => ({ id: t.id, label: t.label })),
  defaultTier: p => M.defaultTierId(R.levelForXp(p?.xp || 0)),
  create(host, ctx) { return createBeatBattle(host, ctx); },
};

function createBeatBattle(host, ctx) {
  const { player: p, sound: Sound, state: State, ghost } = ctx;
  const rm = !!ctx.reducedMotion;
  const tier = M.tierById(ctx.tier);
  const run = M.createRun({ tier: tier.id, seed: ctx.seed, makeAdapt: ctx.adapt });
  const { spb, freeBeat, totalBeats } = run.shape;
  const { pads, lanes: laneMoves } = moveSet(State, p);
  const teach = roundsPlayed(p) < 3;
  ctx.hud.label(`${p.name} · ${tier.label}`);

  // ------------------------------------------------------------ DOM
  const exprCache = {};
  const svgFor = expr => exprCache[expr] || (exprCache[expr] = avatarSVG(p.avatar, { expr, cls: expr === 'heated' ? 'mv-heated' : '' }));
  const RING = 2 * Math.PI * 45;
  const root = document.createElement('div');
  root.className = 'bb';
  root.dataset.zone = 'cool';
  root.innerHTML = `
    <section class="bb-stage">
      <div class="bb-spot">
        <span class="bb-light" aria-hidden="true"></span>
        <div class="bb-badges"><span class="bb-mult"><b>x1</b></span><span class="bb-saved" hidden></span></div>
        <div class="bb-combo" aria-live="polite"></div>
        <div class="bb-dancer mv-idle">${svgFor('happy')}</div>
      </div>
      <button class="bb-chill" type="button" aria-label="Hold to chill">
        <svg class="bb-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="45"/><circle class="fg" cx="50" cy="50" r="45" style="stroke-dasharray:${RING};stroke-dashoffset:${RING}"/></svg>
        <span class="bb-chill-face">${icon('calm')}<b>CHILL</b></span>
      </button>
      <div class="bb-heat" data-level="cool" role="meter" aria-label="Heat" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        ${icon('flame')}<span class="bb-tube"><i></i><em class="w"></em><em class="h"></em></span><b class="bb-heat-word">Cool</b>
      </div>
    </section>
    <div class="bb-floor"></div>`;
  host.appendChild(root);
  host.classList.add('bb-host');
  const q = sel => root.querySelector(sel);
  const floor = q('.bb-floor');
  const dancer = q('.bb-dancer');
  const chillBtn = q('.bb-chill');
  const ringFg = q('.bb-ring .fg');
  const heatEl = q('.bb-heat');
  const heatWord = q('.bb-heat-word');
  const tube = q('.bb-tube');
  const multEl = q('.bb-mult');
  const multB = q('.bb-mult b');
  const savedEl = q('.bb-saved');
  const comboEl = q('.bb-combo');

  // ------------------------------------------------------------ canvas + layout
  const view = createCanvas(floor);
  const g = view.g;
  const particles = createParticles(500);
  const pops = createPops();
  const shake = createShake();
  let L = null;
  let fRect = null;
  view.onResize = v => { L = layout(v.w, v.h); fRect = null; };
  L = layout(view.w, view.h);
  const floorRect = () => fRect || (fRect = floor.getBoundingClientRect());

  function layout(w, h) {
    const pad = clamp(Math.round(w * 0.025), 8, 14);
    const gap = clamp(Math.round(w * 0.018), 6, 12);
    const laneW = (w - pad * 2 - gap * 3) / 4;
    const x = [0, 1, 2, 3].map(i => pad + i * (laneW + gap));
    const cx = x.map(v => v + laneW / 2);
    const r = Math.max(16, Math.min(laneW * 0.33, 36, h * 0.058));
    const label = laneW >= 104 && h > 380;
    const hitY = h - pad - r * 1.25 - (label ? 30 : 20);
    // Freestyle pads: one row when wide enough, else a 2-column grid (last row centred).
    const n = pads.length;
    const top = Math.max(58, h * 0.13);
    const cols = w >= 520 ? n : 2;
    const rows = Math.ceil(n / cols);
    const pw = (w - pad * 2 - gap * (cols - 1)) / cols;
    const ph = (h - top - pad - 6 - gap * (rows - 1)) / rows;
    const free = pads.map((_, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
      const x0 = pad + (w - pad * 2 - (inRow * pw + (inRow - 1) * gap)) / 2;
      return { x: x0 + (i % cols) * (pw + gap), y: top + row * (ph + gap), w: pw, h: ph };
    });
    return { w, h, pad, gap, laneW, x, cx, R: r, hitY, label, pxPerBeat: (hitY + r * 1.6) / run.shape.travelBeats, top, free };
  }
  const laneAt = x => clamp(Math.floor((x - L.pad + L.gap / 2) / (L.laneW + L.gap)), 0, 3);
  const padAt = (x, y) => {
    let best = 0, bd = Infinity;
    L.free.forEach((r, i) => {
      const d = Math.hypot(clamp(x, r.x, r.x + r.w) - x, clamp(y, r.y, r.y + r.h) - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  // Pre-built lane backgrounds (no gradient allocation per frame).
  let laneFills = null;
  let hazeFill = null;
  const fills = () => {
    if (laneFills && laneFills.h === L.h) return;
    laneFills = LANES.map(c => { const gr = g.createLinearGradient(0, 0, 0, L.h); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.55, TINT[c]); gr.addColorStop(1, TINT[c]); return gr; });
    laneFills.h = L.h;
    hazeFill = g.createLinearGradient(0, 0, 0, L.h * 0.55);
    hazeFill.addColorStop(0, 'rgba(255,122,69,0.55)');
    hazeFill.addColorStop(1, 'rgba(255,159,67,0)');
  };

  // ------------------------------------------------------------ song
  let rhythm = null;
  let frozen = null;            // song beat held while chilling / paused
  let ended = false, paused = false, freestyle = false, stopLoop = null, bot = null;
  let tNow = 0, hudAt = 0, lastScore = -1, taps = 0;
  const press = [0, 0, 0, 0];
  const flash = [0, 0, 0, 0];
  const padPress = pads.map(() => 0);
  let chillVis = 0, heatVis = 0, bannerAt = -1;
  // Notes are drawn, and misses/holds swept, on the calibrated clock (the one taps are judged on),
  // so a laggy speaker never eats the late half of the timing window.
  const songBeat = () => (frozen != null ? frozen : rhythm ? M.songBeatAt(rhythm) : -M.COUNT_IN - 1);

  function begin() {
    if (ended || rhythm) return;
    rhythm = startRhythm({
      bpm: tier.bpm, bars: run.shape.bars, countIn: M.COUNT_IN, groove: tier.groove,
      keyIdx: Math.floor(ctx.rng() * 4), melody: true,
    });
    fRect = null;
    if (paused) { rhythm.pause(); frozen = songBeat(); }
  }
  // Audio needs a moment to wake on iPad; never wait more than 0.4 s.
  function whenAudioReady(cb) {
    const t0 = performance.now();
    const ok = () => ctx.speed !== 1 || !Sound.hasAudio() || Sound.contextRunning() || performance.now() - t0 > 400;
    const check = () => (ended ? null : ok() ? cb() : setTimeout(check, 30));
    check();
  }

  // ------------------------------------------------------------ dancer
  let curExpr = 'happy', curMove = 'mv-idle', moveUntil = 0, proudUntil = 0, grinUntil = 0;
  function setExpr(expr) {
    if (expr === curExpr) return;
    curExpr = expr;
    dancer.innerHTML = svgFor(expr);
  }
  function setMove(cls) {
    const c = 'mv-' + cls;
    if (c === curMove) return;
    curMove = c;
    dancer.className = `bb-dancer ${c}${rm ? ' once' : ''}`;
  }
  function dance(move, hold = 0.9) {
    setMove(move.cls);
    moveUntil = tNow + hold;
    if (!rm && dancer.animate) dancer.animate([{ transform: 'scale(1.1, .9)' }, { transform: 'scale(.95, 1.06)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
  }
  function dancerStep(beat) {
    const zone = run.battle.zone;
    setExpr(run.chilling ? 'calm' : tNow < proudUntil ? 'proud' : zone === 'hot' ? 'heated' : zone === 'warm' ? 'focus' : tNow < grinUntil ? 'grin' : 'happy');
    if (tNow > moveUntil) setMove(run.chilling || beat < 0 ? 'idle' : 'bounce');
  }

  // ------------------------------------------------------------ input
  function onDown(pt, e) {
    if (!rhythm || ended || paused || run.chilling) return;
    taps++;
    const beat = rhythm.beatAt(rhythm.judge(e));
    if (beat >= freeBeat - 0.3) return freeDown(pt, beat);
    const lane = laneAt(pt.x);
    press[lane] = 1;
    react(run.press(lane, beat, pt.id), lane);
  }
  function onSwipe(sw, e) {
    if (!rhythm || ended || paused || run.chilling) return;
    const r = run.swipe(sw.id, sw.dir, rhythm.beatAt(rhythm.judge(e)));
    if (r) react(r, r.note.lane);
  }
  function onUp(pt, held, e) {
    if (!rhythm || ended) return;
    const beat = frozen != null ? frozen : rhythm.beatAt(rhythm.judge(e));
    react(run.release(pt.id, beat, pt.cancelled)); // a cancelled flick still counts
  }

  function react(r, lane) {
    if (!r) return;
    switch (r.type) {
      case 'hit': return hitFx(r);
      case 'swipeStart': Sound.tap(); return;
      case 'swipeHint': {
        const n = r.note;
        pops.add('Flick it!', L.cx[n.lane], L.hitY - L.R * 2.2, { color: COLORS.sky, size: fontFor(24) });
        Sound.pop();
        return;
      }
      case 'holdDone': {
        const n = r.note;
        particles.burst(L.cx[n.lane], L.hitY, { n: 18, colors: [COLORS[LANES[n.lane]], COLORS.yellow, COLORS.white], speed: 360, shape: 'star', size: 9 });
        particles.ring(L.cx[n.lane], L.hitY, { color: COLORS.yellow, r: L.R * 2 });
        pops.add(`Held! +${r.pts}`, L.cx[n.lane], L.hitY - L.R * 2.4, { color: COLORS.yellow, size: fontFor(24) });
        Sound.combo(3);
        dance(laneMoves[n.lane], 1.1);
        return;
      }
      case 'holdPartial':
        pops.add(`+${r.pts}`, L.cx[r.note.lane], L.hitY - L.R * 2.2, { color: COLORS.white, size: fontFor(22) });
        Sound.pop();
        return;
      case 'stray':
        flash[lane] = Math.max(flash[lane], 0.35);
        Sound.key();
        if (r.burst) bump();
        if (r.scatter) slapHint();
        return;
      case 'early': case 'late':
        flash[lane] = Math.max(flash[lane], 0.5);
        Sound.tap();
        if (r.burst) bump();
        if (r.scatter) slapHint();
        return;
      case 'scatter': { // a note caught in a slap across the lanes: used up, nothing earned
        const n = r.note;
        flash[n.lane] = Math.max(flash[n.lane], 0.5);
        particles.burst(L.cx[n.lane], L.hitY, { n: 5, colors: [COLORS.white], speed: 140, size: 6 });
        Sound.tap();
        slapHint();
        return;
      }
      default:
    }
  }
  const fontFor = size => clamp(Math.round(size * Math.min(1, L.laneW / 120)), 15, size);
  // Slapping every lane scores nothing; say how to score instead (at most every few seconds).
  let slapHintAt = -9;
  function slapHint() {
    if (tNow - slapHintAt < 3) return;
    slapHintAt = tNow;
    pops.add('Aim for the notes!', L.w / 2, L.h * 0.3, { color: COLORS.sky, size: clamp(L.w * 0.05, 18, 30), life: 1.3 });
  }

  // A hit sounds at once; its pop, sparkles and dance join the next frame (the only time they'd be
  // drawn anyway). A hit with an empty lane pressed right by it waits until it is settled, so a
  // note that turns out to be part of a slap (even a two-hand one) never shows "Perfect!".
  const fxQueue = [];
  function hitFx(r) {
    press[r.note.lane] = 1;
    if (r.grade === 'perfect') Sound.perfect(); else Sound.hit(r.streak);
    if (r.swipe) Sound.whoosh();
    fxQueue.push(r);
  }
  function flushFx(beat) {
    for (let i = 0; i < fxQueue.length;) {
      const r = fxQueue[i];
      if (!r.note.scatter && run.slapRisk(r.note, beat)) { i++; continue; }
      fxQueue.splice(i, 1);
      if (!r.note.scatter) hitShow(r);
    }
  }
  let hitShows = 0; // grade pops shown (tests: a slap never shows one)
  function hitShow(r) {
    hitShows++;
    const n = r.note;
    const x = L.cx[n.lane], y = L.hitY;
    const col = COLORS[LANES[n.lane]];
    const perfect = r.grade === 'perfect';
    flash[n.lane] = 1;
    particles.ring(x, y, { color: perfect ? COLORS.yellow : COLORS.white, r: L.R * 1.8 });
    particles.burst(x, y, { n: perfect ? 16 : 10, colors: [col, COLORS.white, COLORS.yellow], speed: perfect ? 380 : 300, size: 8, shape: perfect ? 'star' : 'circle' });
    pops.add(GRADE[r.grade].text, x, y - L.R * 1.9, { color: GRADE[r.grade].color, size: fontFor(28), life: 0.6, rise: 40 });
    if (r.combo) {
      const mate = run.notes[r.note.pair];
      pops.add(`Combo +${r.combo}`, (x + L.cx[mate.lane]) / 2, y - L.R * 3.2, { color: COLORS.pink, size: fontFor(30), life: 0.9 });
      Sound.combo(5);
      shake.add(3);
    }
    if (r.leveled) multUp();
    if (r.streak >= 10 && r.streak % 10 === 0) {
      pops.add(`${r.streak} in a row!`, L.w / 2, L.h * 0.32, { color: COLORS.yellow, size: clamp(L.w * 0.07, 26, 40), life: 1 });
      Sound.combo(r.streak / 10);
      shake.add(2);
    }
    if (perfect) grinUntil = tNow + 0.8;
    dance(laneMoves[n.lane]);
  }

  function multUp() {
    const s = run.s, m = run.battle.mult;
    if (m < s.earned) {
      pops.add(`x${s.earned} saved!`, L.w / 2, L.h * 0.24, { color: COLORS.sky, size: clamp(L.w * 0.07, 24, 38), life: 1.1 });
      Sound.star();
    } else {
      pops.add(`x${m}!`, L.w / 2, L.h * 0.24, { color: COLORS.yellow, size: clamp(L.w * 0.11, 36, 64), life: 1.1 });
      Sound.star();
      shake.add(3);
      if (!rm) multEl.animate?.([{ transform: 'scale(1.6) rotate(-8deg)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3, 1.8, .5, 1)' });
    }
  }
  function bump() {
    heatEl.classList.remove('bump');
    void heatEl.offsetWidth;
    heatEl.classList.add('bump');
  }

  // ------------------------------------------------------------ freestyle
  function freeDown(pt, beat) {
    const i = padAt(pt.x, pt.y);
    padPress[i] = 1;
    const r = run.freeTap(beat);
    const rect = L.free[i];
    const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
    const m = pads[i];
    if (!r || r.type !== 'free') {
      particles.burst(x, y, { n: 4, colors: [COLORS.white], speed: 140, size: 6 });
      Sound.tap();
      dance(m, 0.5);
      return;
    }
    const perfect = r.grade === 'perfect';
    particles.ring(x, y, { color: COLORS.white, r: Math.min(rect.w, rect.h) * 0.45 });
    particles.burst(x, y, { n: perfect ? 22 : 14, colors: [COLORS[m.color] || COLORS.yellow, COLORS.white, COLORS.yellow], speed: 420, size: 9, shape: 'star' });
    pops.add(`${GRADE[r.grade].text} +${r.pts}`, x, rect.y + rect.h * 0.22, { color: GRADE[r.grade].color, size: clamp(rect.w * 0.13, 18, 30), life: 0.7 });
    if (m.drum === 'clap') Sound.clap(Sound.now()); else if (m.drum === 'kick') Sound.kick(Sound.now()); else if (m.drum === 'jump') Sound.jump();
    Sound.note(PAD_NOTES[i % PAD_NOTES.length] + (perfect ? 12 : 0), 0.18, 'square', 0.1);
    shake.add(perfect ? 2 : 1);
    dance(m, 0.8);
  }
  function enterFreestyle() {
    freestyle = true;
    bannerAt = tNow;
    Sound.combo(8);
    Sound.sparkle();
    particles.burst(L.w / 2, L.h * 0.2, { n: 30, speed: 420, shape: 'star', size: 10 });
  }

  // ------------------------------------------------------------ CHILL
  let chillPtr = null, breath = -1;
  function chillDown(e) {
    e.preventDefault();
    try { chillBtn.setPointerCapture?.(e.pointerId); } catch { /* synthetic */ }
    beginChill(e.pointerId);
  }
  function chillUp(e) {
    if (chillPtr == null || (e && e.pointerId !== chillPtr)) return;
    endChill(false);
  }
  function beginChill(id) {
    if (chillPtr != null || !rhythm || ended || paused) return;
    const beat = songBeat();
    if (beat < 0) { // the song hasn't started yet
      Sound.soft();
      chillBtn.classList.remove('nudge'); void chillBtn.offsetWidth; chillBtn.classList.add('nudge');
      return;
    }
    if (!run.chillStart(beat)) return;
    // A breath settles earlier presses (the model already counts those hits), so show any pops
    // still waiting on the slap check now, not after the breath.
    for (const r of fxQueue.splice(0)) if (!r.note.scatter) hitShow(r);
    chillPtr = id;
    frozen = beat;
    rhythm.pause();
    breath = -1;
    chillBtn.classList.add('holding');
    root.classList.add('chilling');
    // The breath has the stage: any lesson steps aside (a note still coming is taught again after).
    ghost.hide();
    if (ghostNote) { ghostNote.ghosted = false; ghostNote = null; }
    ghostMode = null;
  }
  let holdHintAt = -9;
  function endChill(done) {
    chillPtr = null;
    chillBtn.classList.remove('holding');
    root.classList.remove('chilling');
    const r = done ? null : run.chillStop(frozen);
    if (r) {
      Sound.soft();
      // A quick tap isn't a breath: show how instead (at most every few seconds).
      if (r.brief && !paused && tNow - holdHintAt > 3) {
        holdHintAt = tNow;
        pops.add('Hold it for a big breath!', L.w / 2, L.h * 0.3, { color: COLORS.mint, size: clamp(L.w * 0.05, 18, 30), life: 1.3 });
        chillBtn.classList.remove('nudge'); void chillBtn.offsetWidth; chillBtn.classList.add('nudge');
      }
    }
    if (!paused && rhythm) { rhythm.resume(); frozen = null; }
  }
  function chillStep(dt) {
    const r = run.chillTick(dt, frozen);
    const p = run.s.chillP;
    const secs = M.CHILL_SECS / (ctx.speed || 1);
    if (!r?.done && p < 0.5 && breath !== 0) { breath = 0; Sound.breathIn(Math.max(0.2, (0.5 - p) * secs)); }
    if (!r?.done && p >= 0.5 && breath !== 1) { breath = 1; Sound.breathOut(Math.max(0.2, (1 - p) * secs)); }
    if (!r?.done) return;
    Sound.coolDown();
    Sound.sparkle();
    particles.burst(L.w / 2, L.h * 0.46, { n: 40, colors: [COLORS.mint, COLORS.sky, COLORS.white, COLORS.yellow], speed: 460, size: 10, shape: 'star' });
    pops.add(r.mult > 1 ? `Chilled! x${r.mult} is back!` : 'Chilled!', L.w / 2, L.h * 0.4, { color: COLORS.mint, size: clamp(L.w * 0.075, 24, 40), life: 1.5, rise: 50 });
    if (r.early) { pops.add(`Early chill +${r.early}`, L.w / 2, L.h * 0.52, { color: COLORS.yellow, size: clamp(L.w * 0.06, 20, 32), life: 1.5 }); Sound.star(); }
    shake.add(4);
    proudUntil = tNow + 1.4;
    dance(FILLERS[0], 1.2);
    endChill(true);
  }

  // ------------------------------------------------------------ ghost hand (learn by playing)
  // The hand points at the target; its one-line label is placed where it stays inside the game
  // and off the landing pads of the lesson (beat.css reads --bb-tx / --bb-ty on this host).
  let ghostMode = null, ghostNote = null, chillTaught = false, freeTaught = false;
  const hostBox = () => host.getBoundingClientRect();
  const boxIn = (r, hr = hostBox()) => ({ l: r.left - hr.left - host.clientLeft, t: r.top - hr.top - host.clientTop, w: r.width, h: r.height });
  const hostXY = (x, y) => { const f = boxIn(floor.getBoundingClientRect()); return { x: f.l + x, y: f.t + y }; };
  function showGhost(opts, place) {
    ghost.show(opts);
    const gEl = host.querySelector(':scope > .ghost');
    const label = gEl?.querySelector('.ghost-text');
    if (!label) return;
    const w = label.offsetWidth, h = label.offsetHeight;
    const at = place(w, h);
    const x = clamp(at.x, 6, Math.max(6, host.clientWidth - w - 6));
    const y = clamp(at.y, 6, Math.max(6, host.clientHeight - h - 6));
    gEl.style.setProperty('--bb-tx', Math.round(x - opts.x) + 'px');
    gEl.style.setProperty('--bb-ty', Math.round(y - opts.y) + 'px');
  }
  function teachNote(n) {
    ghostNote = n;
    const a = hostXY(L.cx[n.lane], L.hitY - L.R * 0.2);
    const side = n.lane < 2 ? 1 : -1; // label over the quiet neighbour lane, just above its pad
    const reach = Math.max(L.R * 1.3, GHOST_HAND) + 6;
    showGhost({ type: n.teach, dir: 'up', x: a.x, y: a.y, text: TEACH[n.teach] },
      (w, h) => ({ x: side > 0 ? a.x + reach : a.x - reach - w, y: a.y - L.R * 1.35 - h }));
  }
  function teachChill() {
    const hr = hostBox();
    const b = boxIn(chillBtn.getBoundingClientRect(), hr), m = boxIn(heatEl.getBoundingClientRect(), hr);
    const a = { x: b.l + b.w / 2, y: b.t + b.h / 2 };
    const heatAbove = m.t + m.h <= b.t + 1 && m.l < b.l + b.w && m.l + m.w > b.l;
    showGhost({ type: 'hold', x: a.x, y: a.y, text: 'Hold to cool down' }, (w, h) => {
      const y = (heatAbove ? m.t : b.t) - 10 - h;
      let x = a.x - w / 2;
      if (m.l >= b.l + b.w - 1 && m.t < y + h && m.t + m.h > y) x = Math.min(x, m.l - 8 - w); // keep the meter in view
      return { x, y };
    });
  }
  function nextLesson(beat) {
    if (!teach || beat >= M.LESSON.end || run.chilling) return null;
    for (let i = run.firstOpen; i < run.spawned; i++) {
      const n = run.notes[i];
      if (n.teach && !n.ghosted && n.live && !n.hit && !n.missed && n.beat - beat <= 1.6) return n;
    }
    return null;
  }
  function ghostStep(beat) {
    if (ghostNote) {
      const n = ghostNote;
      if (n.missed || (n.kind === 'hold' ? n.done : n.hit)) { ghost.hide(); ghostNote = null; }
      return;
    }
    // A lesson note arriving comes first; the CHILL lesson shows again right after it.
    const lesson = nextLesson(beat);
    if (lesson) {
      if (ghostMode === 'chill') chillTaught = false;
      ghostMode = null;
      lesson.ghosted = true;
      teachNote(lesson);
      return;
    }
    if (ghostMode === 'chill') { if (run.battle.zone === 'cool' && !run.chilling) { ghost.hide(); ghostMode = null; } return; }
    if (ghostMode === 'free') { if (beat > freeBeat + 6 || run.s.freeHits > 1) { ghost.hide(); ghostMode = null; } return; }
    if (!chillTaught && run.battle.zone !== 'cool' && !run.chilling && beat < freeBeat) {
      chillTaught = true;
      ghostMode = 'chill';
      teachChill();
      return;
    }
    if (!freeTaught && beat >= freeBeat - 0.2) {
      freeTaught = true;
      ghostMode = 'free';
      const r0 = L.free[0];
      const a = hostXY(r0.x + r0.w / 2, r0.y + r0.h / 2), top = hostXY(0, r0.y + 12).y;
      showGhost({ type: 'tap', x: a.x, y: a.y, text: 'Tap moves on the beat!' }, (w, h) => ({ x: a.x - w / 2, y: Math.min(top, a.y - 44 - h) }));
    }
  }

  // ------------------------------------------------------------ frame
  const missed = [];
  const done = [];
  let zoneShown = 'cool';
  const ui = { heat: -1, mult: -1, earned: -1, streak: -1, chillP: -1 };

  function step(dt) {
    tNow += dt;
    const beat = songBeat();
    flushFx(beat);
    run.spawn(beat);
    if (bot) bot.step(beat);
    if (rhythm && !paused && !ended) {
      if (run.chilling) chillStep(dt);
      else {
        missed.length = 0;
        run.advance(beat, missed);
        for (const n of missed) {
          if (!n.free) Sound.miss();
          if (n.heatUp) bump();
        }
        done.length = 0;
        run.holdTick(beat, done);
        done.forEach(r => react(r));
      }
      if (!freestyle && beat >= freeBeat) enterFreestyle();
      if (beat >= totalBeats + 0.4 && !run.chilling) return finish();
      ghostStep(beat);
    }
    // Heat → music, meter, button, dancer.
    const zone = run.battle.zone;
    if (zone !== zoneShown) {
      const up = (zone === 'hot') || (zone === 'warm' && zoneShown === 'cool');
      zoneShown = zone;
      root.dataset.zone = zone;
      if (up) { Sound.heatUp(); bump(); }
      rhythm?.setFilter(zone === 'hot' ? 1300 : zone === 'warm' ? 3200 : 20000);
    }
    if (tNow - hudAt > 0.25 * (ctx.speed || 1) || ended) {
      hudAt = tNow;
      ctx.hud.time(1 - clamp(beat / totalBeats, 0, 1));
    }
    dancerStep(beat);
    syncDom(beat);
    // Juice
    for (let i = 0; i < 4; i++) { press[i] = Math.max(0, press[i] - dt * 7); flash[i] = Math.max(0, flash[i] - dt * 4); }
    for (let i = 0; i < padPress.length; i++) padPress[i] = Math.max(0, padPress[i] - dt * 6);
    chillVis += ((run.chilling ? 1 : 0) - chillVis) * Math.min(1, dt * 7);
    heatVis += (run.s.heat / 100 - heatVis) * Math.min(1, dt * 4);
    particles.update(dt);
    pops.update(dt);
    shake.update(dt);
    draw(beat);
  }

  function syncDom(beat) {
    const s = run.s;
    // A hit joins the score a moment later, once it can't turn out to be part of a slap: the
    // number only ever goes up.
    const shown = Math.max(lastScore, run.shownScore(beat));
    if (shown !== lastScore) { lastScore = shown; ctx.hud.score(shown); }
    const h = Math.round(s.heat);
    if (h !== ui.heat) {
      ui.heat = h;
      tube.style.setProperty('--h', (h / 100).toFixed(2));
      heatEl.dataset.level = run.battle.zone;
      heatEl.setAttribute('aria-valuenow', h);
      const word = run.battle.zone === 'hot' ? 'HOT!' : run.battle.zone === 'warm' ? 'Warm' : 'Cool';
      if (heatWord.textContent !== word) heatWord.textContent = word;
      chillBtn.classList.toggle('warm', run.battle.zone === 'warm');
      chillBtn.classList.toggle('hot', run.battle.zone === 'hot');
    }
    const mult = run.battle.mult;
    if (mult !== ui.mult || s.earned !== ui.earned) {
      ui.mult = mult; ui.earned = s.earned;
      multB.textContent = 'x' + mult;
      multEl.dataset.m = mult;
      savedEl.hidden = s.earned <= mult;
      savedEl.textContent = `x${s.earned} saved`;
    }
    if (s.streak !== ui.streak) {
      ui.streak = s.streak;
      comboEl.textContent = s.streak >= 3 ? `${s.streak} combo` : '';
    }
    const cp = Math.round(run.battle.keptP * 200) / 200;
    if (cp !== ui.chillP) {
      ui.chillP = cp;
      ringFg.style.strokeDashoffset = (RING * (1 - cp)).toFixed(1);
      chillBtn.classList.toggle('charged', cp > 0);
    }
  }

  // ------------------------------------------------------------ drawing
  function draw(beat) {
    fills();
    view.clear('#FFF6E5');
    g.save();
    shake.apply(g);
    if (heatVis > 0.02) { g.globalAlpha = Math.min(1, heatVis * 1.1); g.fillStyle = hazeFill; g.fillRect(0, 0, L.w, L.h * 0.55); g.globalAlpha = 1; }
    const fadeLanes = freestyle ? clamp((tNow - bannerAt) * 3, 0, 1) : 0;
    if (fadeLanes < 1) {
      if (fadeLanes) g.globalAlpha = 1 - fadeLanes;
      drawLanes(beat);
      drawNotes(beat);
      g.globalAlpha = 1;
    }
    if (freestyle) { g.globalAlpha = fadeLanes; drawPads(beat); g.globalAlpha = 1; }
    particles.draw(g);
    pops.draw(g);
    g.restore();
    if (chillVis > 0.01) drawChill();
    else drawCount(beat);
    if (freestyle) drawBanner();
  }

  function drawLanes(beat) {
    const pulse = beat >= 0 && !run.chilling ? Math.max(0, 1 - (beat - Math.floor(beat)) * 3) : 0;
    const a0 = g.globalAlpha;
    for (let i = 0; i < 4; i++) {
      const c = LANES[i];
      roundRect(g, L.x[i], L.pad, L.laneW, L.h - L.pad * 2, Math.min(22, L.laneW * 0.3));
      g.fillStyle = laneFills[i];
      g.fill();
      if (flash[i] > 0) { g.globalAlpha = a0 * flash[i] * 0.45; g.fillStyle = COLORS[c]; g.fill(); g.globalAlpha = a0; }
      g.lineWidth = 4; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
      // Guide dashes down the lane
      g.strokeStyle = 'rgba(59,42,74,.12)'; g.lineWidth = 3;
      g.setLineDash(DASH);
      g.beginPath(); g.moveTo(L.cx[i], L.pad + 16); g.lineTo(L.cx[i], L.hitY - L.R * 1.3); g.stroke();
      g.setLineDash(NO_DASH);
      // Landing pad: where notes should be when you tap
      const pr = press[i];
      const rr = L.R * (1.18 + 0.06 * pulse - 0.08 * pr);
      g.beginPath(); g.arc(L.cx[i], L.hitY, rr, 0, TAU);
      inkFill(g, pr > 0.05 ? COLORS[c] : COLORS.white, 4);
      g.beginPath(); g.arc(L.cx[i], L.hitY, rr * 0.74, 0, TAU);
      g.lineWidth = 4; g.strokeStyle = COLORS[c]; g.stroke();
      if (L.label) outlinedText(g, laneMoves[i].name, L.cx[i], L.h - L.pad - 16, { size: 14, color: COLORS.white });
    }
  }

  function wobble(n, beat) {
    if (rm || run.chilling) return 0;
    const z = run.battle.zone;
    if (z === 'cool') return 0;
    return Math.sin(beat * Math.PI * 1.5 + n.id * 1.7) * (z === 'hot' ? L.R * 0.3 : L.R * 0.16);
  }

  function drawNotes(beat) {
    const R = L.R;
    const a0 = g.globalAlpha;
    for (let i = run.firstOpen; i < run.spawned; i++) {
      const n = run.notes[i];
      if (!n.live || (n.hit && (n.kind !== 'hold' || n.done))) continue;
      const y = L.hitY - (n.beat - beat) * L.pxPerBeat;
      if (y < -R * 2 - n.len * L.pxPerBeat) break;
      let alpha = 1;
      if (n.missed) {
        const k = (beat - n.missedAt) * spb / 0.35;
        if (k >= 1) continue;
        alpha = 0.55 * (1 - k);
      }
      if (y > L.h + R * 2) continue;
      const x = L.cx[n.lane] + wobble(n, beat);
      const fill = n.missed ? SOFT : COLORS[LANES[n.lane]];
      g.globalAlpha = a0 * alpha;
      if (n.kind === 'hold') drawHold(n, x, y, beat, fill);
      else {
        if (n.kind === 'combo' && n.pair > n.id && !n.missed) {
          const mate = run.notes[n.pair];
          if (!mate.hit) {
            const mx = L.cx[mate.lane] + wobble(mate, beat);
            g.lineCap = 'round';
            g.beginPath(); g.moveTo(x, y); g.lineTo(mx, y);
            g.strokeStyle = INK; g.lineWidth = 14; g.stroke();
            g.strokeStyle = COLORS.yellow; g.lineWidth = 7; g.stroke();
            starPath(g, (x + mx) / 2, y, R * 0.5, R * 0.24);
            inkFill(g, COLORS.yellow, 3);
          }
        }
        bubble(x, y, R, fill);
        if (n.kind === 'swipe' && !n.missed) arrow(x, y, R, n.dir);
      }
    }
    g.globalAlpha = a0;
  }

  function bubble(x, y, r, fill) {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    inkFill(g, fill, 4);
    g.beginPath(); g.ellipse(x - r * 0.32, y - r * 0.38, r * 0.26, r * 0.16, -0.6, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
  }
  function arrow(x, y, r, dir) {
    g.save();
    g.translate(x, y);
    g.rotate(dir === 'left' ? -Math.PI / 2 : dir === 'right' ? Math.PI / 2 : 0);
    g.beginPath(); g.moveTo(-r * 0.45, r * 0.22); g.lineTo(0, -r * 0.3); g.lineTo(r * 0.45, r * 0.22);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = INK; g.lineWidth = r * 0.36; g.stroke();
    g.strokeStyle = COLORS.white; g.lineWidth = r * 0.18; g.stroke();
    g.restore();
  }
  function drawHold(n, x, y, beat, fill) {
    const R = L.R;
    const holding = n.hit && !n.done;
    const head = holding ? L.hitY : y;
    const tail = L.hitY - (n.beat + n.len - beat) * L.pxPerBeat;
    const bw = R * 1.15;
    if (head - tail > 2) {
      roundRect(g, x - bw / 2, tail - bw / 2, bw, head - tail + bw, bw / 2);
      g.fillStyle = n.missed ? SOFT : TINT[LANES[n.lane]]; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      roundRect(g, x - bw * 0.2, tail, bw * 0.4, Math.max(0, head - tail), bw * 0.2);
      g.fillStyle = fill; g.fill();
      g.beginPath(); g.arc(x, tail, R * 0.42, 0, TAU); inkFill(g, fill, 3);
    }
    if (holding) {
      const k = 0.5 + 0.5 * Math.sin(tNow * 18);
      g.beginPath(); g.arc(x, L.hitY, R * (1.3 + 0.12 * k), 0, TAU);
      g.strokeStyle = COLORS.yellow; g.lineWidth = 6; g.stroke();
      bubble(x, L.hitY, R * 0.92, fill);
    } else bubble(x, head, R, fill);
  }

  function drawPads(beat) {
    const frac = beat - Math.floor(beat);
    const a0 = g.globalAlpha;
    for (let i = 0; i < pads.length; i++) {
      const r = L.free[i], m = pads[i];
      const pr = padPress[i];
      const col = COLORS[m.color] || COLORS.yellow;
      const rad = Math.min(26, r.w * 0.2);
      roundRect(g, r.x, r.y + 6, r.w, r.h - 6, rad); g.fillStyle = INK; g.fill();
      roundRect(g, r.x, r.y + pr * 5, r.w, r.h - 6, rad); inkFill(g, col, 5);
      roundRect(g, r.x + 10, r.y + 10 + pr * 5, r.w - 20, Math.min(26, r.h * 0.12), 12);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fill();
      const cx = r.x + r.w / 2, cy = r.y + (r.h - 6) / 2 + pr * 5;
      const base = Math.min(r.w, r.h) * 0.22;
      // A ring closes in on every beat: tap when it meets the star.
      if (!run.chilling && beat < totalBeats) {
        g.globalAlpha = a0 * (0.35 + 0.65 * frac);
        g.beginPath(); g.arc(cx, cy, base * (1 + 0.9 * (1 - frac)), 0, TAU);
        g.strokeStyle = COLORS.white; g.lineWidth = 6; g.stroke();
        g.globalAlpha = a0;
      }
      starPath(g, cx, cy, base * (1 + 0.25 * pr), base * 0.5);
      inkFill(g, COLORS.white, 4);
      outlinedText(g, m.name, cx, Math.min(r.y + r.h - 22, cy + base + 26), { size: clamp(r.w * 0.14, 15, 26) });
    }
  }

  function drawChill() {
    const p = run.s.chillP;
    g.globalAlpha = chillVis * 0.84;
    g.fillStyle = '#D2F7E8';
    g.fillRect(0, 0, L.w, L.h);
    g.globalAlpha = chillVis;
    const br = p < 0.5 ? ease.inOut(p / 0.5) : 1 - ease.inOut((p - 0.5) / 0.5);
    const base = Math.min(L.w, L.h) * 0.3;
    const r = base * (rm ? 0.85 : 0.6 + 0.4 * br);
    const cx = L.w / 2, cy = L.h * 0.45;
    g.beginPath(); g.arc(cx, cy, r * 1.2, 0, TAU); g.fillStyle = 'rgba(94,224,176,.3)'; g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); inkFill(g, COLORS.mint, 5);
    g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.35, r * 0.18, 0, TAU); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, base * 1.12, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, p));
    g.strokeStyle = INK; g.lineWidth = 13; g.stroke();
    g.strokeStyle = COLORS.sky; g.lineWidth = 7; g.stroke();
    outlinedText(g, p < 0.5 ? 'Breathe in…' : '…and out', cx, cy, { size: clamp(base * 0.2, 20, 38) });
    outlinedText(g, 'The beat waits for you', cx, Math.min(L.h - 24, cy + base * 1.12 + 34), { size: clamp(base * 0.12, 15, 22), color: COLORS.white });
    g.globalAlpha = 1;
  }

  function drawCount(beat) {
    if (!rhythm || beat >= 0.6 || beat < -M.COUNT_IN) return;
    const k = beat - Math.floor(beat);
    const text = beat < -3 ? '3' : beat < -2 ? '2' : beat < -1 ? '1' : 'GO!';
    const s = rm ? 1 : 1 + 0.35 * (1 - ease.outCubic(Math.min(1, k * 2)));
    g.globalAlpha = beat >= 0 ? Math.max(0, 1 - beat / 0.6) : 1;
    outlinedText(g, text, L.w / 2, L.h * 0.38, { size: clamp(L.h * 0.13, 48, 110) * s, color: text === 'GO!' ? COLORS.mint : COLORS.yellow });
    g.globalAlpha = 1;
  }
  function drawBanner() {
    const k = clamp((tNow - bannerAt) * 2.2, 0, 1);
    const s = rm ? 1 : ease.outBack(k);
    outlinedText(g, 'FREESTYLE!', L.w / 2, L.top / 2 + 2, { size: clamp(L.w * 0.08, 26, 46) * s, color: COLORS.yellow });
  }

  // ------------------------------------------------------------ keyboard (desktop / testing)
  const onKey = e => {
    if (e.repeat || ended) return;
    if (e.key === ' ') { e.preventDefault(); if (e.type === 'keydown') beginChill('key'); else chillUp({ pointerId: 'key' }); return; }
    const lane = KEYS[e.key?.toLowerCase?.()];
    if (lane == null || !L) return;
    const pt = { x: freestyle ? L.free[lane % pads.length].x + 4 : L.cx[lane], y: freestyle ? L.free[lane % pads.length].y + 4 : L.hitY, id: 'k' + lane };
    if (e.type === 'keydown') onDown(pt, e); else onUp(pt, 0, e);
  };

  // ------------------------------------------------------------ test bot
  // Drives the real input path (PointerEvents on the floor and the CHILL button) and plays like a
  // kid who sometimes loses it: a mashing burst, a miss run to HOT then a full CHILL, a later miss
  // run caught early at Warm with a let-go-and-hold-again CHILL, then the freestyle.
  function createBot() {
    const st = { id: 700, ups: [], held: new Map(), seen: new Set(), mode: 'play', hotDone: false, warmDone: false, chillAt: -99, again: -1, stray: 0, strayDone: false, holds: 0, n: 0, freeDone: new Set(), offDone: false };
    const fire = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: false, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
    const tapAt = (x, y) => { const id = ++st.id; fire(floor, 'pointerdown', x, y, id); st.ups.push({ id, x, y }); };
    const chillPress = () => { const b = chillBtn.getBoundingClientRect(); st.chillId = ++st.id; fire(chillBtn, 'pointerdown', b.left + b.width / 2, b.top + b.height / 2, st.chillId); };
    const chillRelease = () => { const b = chillBtn.getBoundingClientRect(); fire(chillBtn, 'pointerup', b.left + b.width / 2, b.top + b.height / 2, st.chillId); };
    return {
      step(beat) {
        if (!rhythm || ended || paused) return;
        const fr = floorRect();
        const X = lane => fr.left + L.cx[lane], Y = fr.top + L.hitY - 4;
        for (const u of st.ups.splice(0)) fire(floor, 'pointerup', u.x, u.y, u.id);
        for (const [id, h] of st.held) if (beat >= h.until || h.note.done) { fire(floor, 'pointerup', h.x, h.y, id); st.held.delete(id); }
        const s = run.s, zone = run.battle.zone;
        // CHILL: a full one at HOT; at Warm, let go early once, then hold again to finish.
        if (st.mode === 'chill') {
          if (!run.chilling && st.pressed) { chillRelease(); st.pressed = false; st.mode = 'play'; st.chillAt = beat; st.hotDone = true; }
          else if (!st.pressed) { chillPress(); st.pressed = true; }
          return;
        }
        if (st.mode === 'chillWarm') {
          if (!st.pressed && st.again < 0) { chillPress(); st.pressed = true; }
          else if (st.pressed && run.chilling && s.chillP >= 0.4 && !st.letGo) { chillRelease(); st.pressed = false; st.letGo = true; st.again = beat + 1; }
          else if (!st.pressed && st.again >= 0 && beat >= st.again) { chillPress(); st.pressed = true; st.again = -1; }
          else if (st.pressed && !run.chilling && st.letGo) { chillRelease(); st.pressed = false; st.mode = 'play'; st.warmDone = true; st.chillAt = beat; }
          if (st.pressed) return;
        }
        // Reaching the zone switches straight to CHILL (no sneaky hit first that would cool it back down).
        if (st.mode === 'missHot' && zone === 'hot') { st.mode = 'chill'; return; }
        if (st.mode === 'missWarm' && zone !== 'cool') { st.mode = 'chillWarm'; return; }
        const chartEnd = freeBeat - 4;
        if ((st.mode === 'missHot' || st.mode === 'missWarm') && beat > chartEnd) st.mode = zone === 'cool' ? 'play' : st.mode === 'missHot' ? 'chill' : 'chillWarm';
        if (st.mode === 'play' && !st.hotDone && beat < chartEnd - 12 && ((s.earned >= 4 && beat > 24) || beat > freeBeat * 0.5)) st.mode = 'missHot';
        if (st.mode === 'play' && st.hotDone && !st.warmDone && (beat - st.chillAt) * spb > 13.5 && beat < chartEnd - 8) st.mode = 'missWarm';
        // A little mashing early on (3 quick taps in an empty lane).
        if (!st.strayDone && beat > 21 && st.mode === 'play') {
          const lane = [0, 1, 2, 3].find(l => !run.notes.some(n => n.live && !n.hit && !n.missed && n.lane === l && Math.abs(n.beat - beat) < 1.5));
          if (lane != null) { tapAt(X(lane), Y); if (++st.stray >= 3) st.strayDone = true; }
        }
        if (beat >= freeBeat - 0.3) {
          const nb = Math.ceil(beat - 0.02);
          if (nb < totalBeats && !st.freeDone.has(nb) && (nb - beat) * spb <= 0.012) {
            st.freeDone.add(nb);
            const r = L.free[nb % pads.length];
            tapAt(fr.left + r.x + r.w / 2, fr.top + r.y + r.h / 2);
          } else if (!st.offDone && beat > freeBeat + 2.4 && beat - Math.floor(beat) > 0.45) {
            st.offDone = true;
            const r = L.free[0];
            tapAt(fr.left + r.x + r.w / 2, fr.top + r.y + r.h / 2);
          }
          return;
        }
        for (let i = run.firstOpen; i < run.spawned; i++) {
          const n = run.notes[i];
          if (n.beat > beat + 1) break;
          if (!n.live || n.hit || n.missed || st.seen.has(n.id)) continue;
          if (st.mode === 'missHot' || st.mode === 'missWarm') continue; // let it slide by
          const lag = st.n % 5 === 3 ? -0.05 : 0.012; // now and then a little late
          if ((n.beat - beat) * spb > lag) continue;
          st.seen.add(n.id);
          st.n++;
          const id = ++st.id, x = X(n.lane), y = Y;
          fire(floor, 'pointerdown', x, y, id);
          if (n.kind === 'swipe') {
            const d = { up: [0, -1], left: [-1, 0], right: [1, 0] }[n.dir];
            fire(floor, 'pointermove', x + d[0] * 20, y + d[1] * 20, id);
            fire(floor, 'pointermove', x + d[0] * 48, y + d[1] * 48, id);
            st.ups.push({ id, x: x + d[0] * 48, y: y + d[1] * 48 });
          } else if (n.kind === 'hold') {
            const early = ++st.holds === 3;
            st.held.set(id, { note: n, x, y, until: n.beat + n.len * (early ? 0.5 : 1) + 0.02 });
          } else st.ups.push({ id, x, y });
        }
      },
    };
  }

  // ------------------------------------------------------------ lifecycle
  const input = pointerInput(floor, { onDown, onSwipe, onUp });
  guardSurface(chillBtn);
  const noMenu = e => e.preventDefault();
  chillBtn.addEventListener('pointerdown', chillDown);
  chillBtn.addEventListener('pointerup', chillUp);
  chillBtn.addEventListener('pointercancel', chillUp);   // iOS system gesture: progress is kept
  chillBtn.addEventListener('lostpointercapture', chillUp);
  chillBtn.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  const dbg = window.__beat = {
    get beat() { return songBeat(); }, get heat() { return run.s.heat; }, get zone() { return run.battle.zone; },
    get chilling() { return run.chilling; }, get chillP() { return run.s.chillP; }, get score() { return run.s.score; },
    get stats() { return { ...run.s, strays: undefined, mult: run.battle.mult, density: run.battle.density }; },
    get freestyle() { return freestyle; }, get paused() { return !!rhythm?.paused; }, get taps() { return taps; }, get hitShows() { return hitShows; },
    lane: i => { const r = floorRect(); return { x: r.left + L.cx[i], y: r.top + L.hitY }; },
    missed: () => run.notes.filter(n => n.missed && !n.free).map(n => ({ beat: n.beat, lane: n.lane, kind: n.kind, heatUp: n.heatUp || 0 })),
    upcoming: () => run.notes.slice(run.firstOpen, run.spawned).filter(n => n.live && !n.hit && !n.missed && !n.pending).map(n => ({ id: n.id, beat: n.beat, lane: n.lane, kind: n.kind })),
    note: id => { const n = run.notes[id]; return n && { hit: !!n.hit, missed: !!n.missed, scatter: !!n.scatter }; },
    freeze: () => api.pause(), thaw: () => api.resume(), // tests: hold a frame (no pause card) for a screenshot
  };

  function finish() {
    if (ended) return;
    ended = true;
    stopLoop?.();
    stopLoop = null;
    if (chillPtr != null) endChill(false);
    rhythm?.stop();
    ghost.hide();
    const res = run.result();
    // Only what happened: a chip with nothing to count isn't shown (and no row when none are).
    const chips = run.endTags().map(c => `<span class="tag${c.cls ? ' ' + c.cls : ''}">${icon(c.icon, c.color)} ${c.text}</span>`);
    ctx.end({
      ...res,
      title: ctx.kind === 'practice' ? 'Practice session complete!' : undefined,
      extra: chips.length ? `<div class="bb-end">${chips.join('')}</div>` : '',
    });
  }

  const api = {
    start() {
      stopLoop = startLoop(step);
      whenAudioReady(begin);
    },
    pause() {
      if (ended || paused) return;
      paused = true;
      if (chillPtr != null) endChill(false);
      if (rhythm) { if (frozen == null) frozen = songBeat(); rhythm.pause(); }
      stopLoop?.();
      stopLoop = null;
      draw(songBeat());
    },
    resume() {
      if (ended || !paused) return;
      paused = false;
      if (rhythm) { rhythm.resume(); frozen = null; run.grace(songBeat()); }
      fRect = null;
      stopLoop = startLoop(step);
    },
    finish,
    destroy() {
      ended = true;
      stopLoop?.();
      rhythm?.stop();
      input.destroy();
      chillBtn.removeEventListener('pointerdown', chillDown);
      chillBtn.removeEventListener('pointerup', chillUp);
      chillBtn.removeEventListener('pointercancel', chillUp);
      chillBtn.removeEventListener('lostpointercapture', chillUp);
      chillBtn.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      view.destroy();
      root.remove();
      host.classList.remove('bb-host');
      if (window.__beat === dbg) window.__beat = null;
    },
    hint() {
      if (!rhythm) return { type: 'wait', ms: 100 };
      const fr = floorRect();
      for (let i = run.firstOpen; i < run.spawned; i++) {
        const n = run.notes[i];
        if (!n.live || n.hit || n.missed) continue;
        return { type: n.kind === 'hold' ? 'hold' : n.kind === 'swipe' ? 'swipe' : 'tap', x: fr.left + L.cx[n.lane], y: fr.top + L.hitY, dx: 0, dy: -60, ms: 400 };
      }
      return { type: 'wait', ms: 100 };
    },
    autoplay() {
      if (!bot) bot = createBot();
      return true;
    },
  };
  return api;
}
