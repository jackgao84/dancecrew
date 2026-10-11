// Crew Combo — two players, one iPad, one beat.
// Split screen (side by side in landscape, stacked in portrait/phone): each side has its
// player's avatar, two big pads and a CHILL button. The same notes fall on both sides; the
// combo only grows when both hit together (SYNC!), a solo hit holds it ("Crew's got you"),
// and when the crew heats up, both hold CHILL together to win the full multiplier back.
// Rules live in combo-logic.js (pure, unit-tested); this file is input, canvas and juice.
import {
  createCanvas, startLoop, pointerInput, createParticles, createPops, createShake,
  roundRect, inkFill, starPath, outlinedText, avatarImage, COLORS, INK, FONT, SPEED, clamp, ease, rng,
} from './engine.js';
import { startRhythm } from './rhythm.js';
import { createGhost } from './ghost.js';
import * as L from './combo-logic.js';

const THEME = [
  { bg: '#FFD9EA', track: '#FFF3F8', lanes: [COLORS.pink, COLORS.yellow], burst: [COLORS.pink, COLORS.yellow, COLORS.white] },
  { bg: '#D4F0FF', track: '#F1FAFF', lanes: [COLORS.sky, COLORS.mint], burst: [COLORS.sky, COLORS.mint, COLORS.white] },
];
const BADGE = [COLORS.white, COLORS.sky, COLORS.mint, COLORS.yellow];
const EXPRS = ['happy', 'grin', 'calm', 'focus', 'proud', 'wow'];
const HOP = 0.45;
const TICKS = [L.WARM, L.HOT];
const BOT_LOOK = 0.3;
const BOT_LATE = 0.25;
const KEYS = { a: [0, 0], s: [0, 1], k: [1, 0], l: [1, 1] };
const CHILL_KEYS = { q: 0, p: 1 };
const COUNT = ['3', '2', '1', 'Go!'];
const BREATH_TEXT = { in: ['Breathe', 'in…'], out: ['Breathe', 'out…'] };

function layout(w, h) {
  const land = w > h * 1.1;
  const small = Math.min(w, h) < 520;
  const P = small ? 8 : 12;
  const U = clamp(Math.min(w, h) / 22, 14, 26);
  const lay = { w, h, land, small, P, U, sides: [], center: null };
  if (land) {
    const cw = clamp(w * 0.1, 84, 112);
    const sw = (w - cw) / 2;
    lay.sides = [{ x: 0, y: 0, w: sw, h, outer: 'left' }, { x: w - sw, y: 0, w: sw, h, outer: 'right' }];
    lay.center = { x: sw, y: 0, w: cw, h, vertical: true };
  } else {
    const ch = clamp(h * 0.08, 60, 80);
    const sh = (h - ch) / 2;
    lay.sides = [{ x: 0, y: 0, w, h: sh, outer: 'left' }, { x: 0, y: h - sh, w, h: sh, outer: 'left' }];
    lay.center = { x: 0, y: sh, w, h: ch, vertical: false };
  }
  // Stacked, side A is turned 180° so the two players sit face to face at the short edges and
  // nobody reaches across the partner's lanes. Each side is laid out (and drawn) in its own frame.
  lay.sides[0].flip = !land;
  lay.sides[1].flip = false;
  for (const S of lay.sides) {
    S.cx2 = 2 * S.x + S.w; S.cy2 = 2 * S.y + S.h;
    S.px = S.x + P; S.py = S.y + P; S.pw = S.w - 2 * P; S.ph = S.h - 2 * P;
    const colW = clamp(S.pw * (land ? 0.3 : 0.23), 84, 170);
    const colX = S.outer === 'left' ? S.px + P : S.px + S.pw - P - colW;
    const lanesX = S.outer === 'left' ? colX + colW + P : S.px + P;
    const lanesW = S.pw - colW - 3 * P;
    const gap = Math.max(6, P * 0.8);
    const laneW = (lanesW - gap) / 2;
    const padH = clamp(S.ph * 0.2, 64, 118);
    const padY = S.py + S.ph - P - padH;
    const top = S.py + P;
    const laneBottom = padY - 8;
    S.top = top;
    S.noteR = clamp(Math.min(laneW * 0.28, (laneBottom - top) * 0.09), 15, 34);
    S.hitY = laneBottom - S.noteR - clamp(S.ph * 0.02, 6, 14); // a note on the line is fully inside the lane
    S.lanesX = lanesX; S.lanesW = lanesW;
    S.lanes = [0, 1].map(k => { const x = lanesX + k * (laneW + gap); return { x, y: top, w: laneW, h: laneBottom - top, cx: x + laneW / 2 }; });
    S.pads = [0, 1].map(k => ({ x: S.lanes[k].x, y: padY, w: laneW, h: padH }));
    const r = clamp(Math.min(colW * 0.38, padH * 0.62), 32, 58);
    S.chill = { x: colX + colW / 2, y: padY + padH / 2, r };
    S.col = { x: colX, y: top, w: colW, cx: colX + colW / 2 };
    S.nameY = top + (small ? 13 : 16);
    S.avFeet = S.chill.y - r - (small ? 18 : 22); // clear of the CHILL glow ring
    S.avH = clamp(Math.min(S.avFeet - (top + (small ? 34 : 42)), colW * 1.65), 56, 300);
  }
  const C = lay.center;
  if (C.vertical) {
    // Top of the strip is kept free for the one-line banner.
    C.bx = C.x + C.w / 2; C.br = Math.min(C.w * 0.38, 40); C.by = (h < 520 ? 16 : 60) + C.br;
    C.pipY = C.by + C.br + 16; C.pipX = C.bx - 21;
    C.streakY = C.pipY + 30;
    const mTop = C.streakY + U * 1.05 + 50;
    C.meter = { x: C.bx - 13, y: mTop, w: 26, h: Math.max(40, h - mTop - 24) };
    C.popA = { x: C.bx, y: h * 0.52 };
    C.popB = { x: C.bx, y: h * 0.52 + U * 2.2 };
  } else {
    C.bx = C.x + C.w / 2; C.by = C.y + C.h / 2; C.br = Math.min(C.h * 0.42, 32);
    C.pipX = C.bx + C.br + 18; C.pipY = C.by - 14;
    C.streakY = C.by + 13;
    const mx = P + 26;
    C.meter = { x: mx, y: C.by - 10, w: Math.max(50, C.bx - C.br - 46 - mx), h: 20 };
  }
  return lay;
}

function createGame(host, ctx) {
  const { player, partner, reducedMotion: rm } = ctx;
  const Sound = ctx.sound;
  const names = [player.name, partner.name];
  const wrap = document.createElement('div');
  wrap.className = 'combo-surface';
  wrap.dataset.presses = '0';
  host.appendChild(wrap);
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  host.appendChild(live);
  const view = createCanvas(wrap);
  const g = view.g;
  let lay = layout(view.w, view.h);
  // Resizing resets the canvas bitmap, so draw again straight away (never a blank frame).
  view.onResize = v => { lay = layout(v.w, v.h); teach.note = null; bakeAll(); redraw(); };

  // Side A's effects live in side A's frame (turned when stacked); side B's and the crew's share one.
  const fx = createParticles(rm ? 80 : 220), fxA = createParticles(rm ? 50 : 140);
  const pops = createPops(), popsA = createPops();
  const FX = [fxA, fx], POPS = [popsA, pops];
  const shake = createShake();
  // Side B's teaching hand lives in its own layer so it sits above the canvas like the shell's.
  const ghostLayer = document.createElement('div');
  ghostLayer.className = 'combo-ghost-b';
  host.appendChild(ghostLayer);
  // …and when stacked, side A's hand lives in a layer turned 180° with the side.
  const flipLayer = document.createElement('div');
  flipLayer.className = 'combo-ghost-b combo-ghost-flip';
  host.appendChild(flipLayer);
  const ghosts = [ctx.ghost, createGhost(ghostLayer), createGhost(flipLayer)];
  const FLAME = new Path2D('M24,44 C12,44 7,36 8,28 C9,20 16,17 16,9 C22,12 25,17 24,23 C27,21 29,17 29,13 C37,18 41,26 40,32 C39,39 33,44 24,44 Z');
  // The dancers are SVG images: bake each into a bitmap at its on-screen size (re-baked on resize),
  // so a frame draws a bitmap instead of rasterising SVG — much cheaper on iPad.
  const svgs = [{}, {}];
  const imgs = [{}, {}];
  function bake(s, ex) {
    const img = svgs[s][ex];
    if (!img || !img.naturalWidth || destroyed) return;
    const h = Math.max(8, Math.ceil(lay.sides[0].avH * view.dpr * 1.1));
    const c = imgs[s][ex] || document.createElement('canvas');
    imgs[s][ex] = c;
    if (c.height === h) return;
    c.width = Math.ceil((h * 2) / 3);
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  }
  function bakeAll() { for (let s = 0; s < 2; s++) for (const ex of EXPRS) bake(s, ex); }
  [player, partner].forEach((p, s) => EXPRS.forEach(ex => avatarImage(p.avatar, { expr: ex }).then(img => { svgs[s][ex] = img; bake(s, ex); })));

  const chart = L.buildChart(ctx.seed);
  const adapt = [player, partner].map(p => ctx.adapt(L.adaptOptions(p)));
  const av = [0, 1].map(() => ({ hop: 0, sq: 0, lean: 0, dir: 1, expr: 'happy', exprT: 0 }));
  const padAnim = [[0, 0], [0, 0]];
  const due = [[false, false], [false, false]];
  const chillHeld = [new Set(), new Set()];
  const pointers = new Map();
  const beams = Array.from({ length: 4 }, () => ({ age: 1, life: 1, x1: 0, y1: 0, x2: 0, y2: 0 }));
  const pausedBy = new Set();
  const teach = { taps: true, note: null, chill: false, chillShown: 0, partnerHint: -1, coolPop: -9 };
  const coveredAt = [-9, -9], guessAt = [-9, -9];
  const banner = { text: '', until: 0 };

  let rhythm = null, crew = null, stopLoop = null, running = false, ended = false, destroyed = false;
  let frozenAt = 0, elapsed = 0, lastDt = 0, presses = 0, chilling = false, breathHalf = false, resumeIn = 0;
  let breath = null, badgePop = 0, hudT = 0, finaleShown = false, lastHeat = 'cool', soloHold = [0, 0], bot = null, curBeat = -9;

  // ------------------------------------------------------------ time + pausing
  function holdPause(why) {
    if (!rhythm) return;
    if (!pausedBy.size) { frozenAt = rhythm.gameNow(); rhythm.pause(); }
    pausedBy.add(why);
  }
  function releasePause(why) {
    if (!pausedBy.delete(why) || pausedBy.size) return;
    rhythm.resume();
  }
  // Game time is the calibrated clock: notes are drawn and misses swept on it, and judge(e) takes off
  // the same device offset, so a tap in time with the music lands on the note. The audio clock keeps
  // running while the song is paused, so freeze game time ourselves.
  const gameNow = () => (pausedBy.size ? frozenAt : rhythm.gameNow());
  const timeOf = b => rhythm.timeOf(b);

  // ------------------------------------------------------------ helpers
  const say = text => { live.textContent = text; };
  const setBanner = (text, secs = 2.2) => { banner.text = text; banner.until = elapsed + secs; };
  /** A point in side s's frame → the play surface (side A is turned 180° when stacked). */
  function toScreen(s, x, y) {
    const S = lay.sides[s];
    return S.flip ? { x: S.cx2 - x, y: S.cy2 - y } : { x, y };
  }
  function sideIn(s) { const S = lay.sides[s]; if (S.flip) { g.save(); g.translate(S.cx2, S.cy2); g.scale(-1, -1); } }
  function sideOut(s) { if (lay.sides[s].flip) g.restore(); }
  /** A crew-wide pop: the centre strip side by side; stacked, in both sides' lanes, each facing its player. */
  function crewPop(text, k, o) {
    if (lay.land) { const p = k ? lay.center.popB : lay.center.popA; pops.add(text, p.x, p.y, o); return; }
    for (let s = 0; s < 2; s++) {
      const S = lay.sides[s];
      POPS[s].add(text, S.lanesX + S.lanesW / 2, S.top + (S.hitY - S.top) * (0.3 + 0.18 * k), o);
    }
  }
  /** Keep a pop over its side's lanes (it swells to ~1.2× as it pops), even over the outer lane on a phone. */
  function popX(S, x, text, size) {
    const half = Math.min(S.lanesW / 2, text.length * size * 0.36);
    return clamp(x, S.lanesX + half, S.lanesX + S.lanesW - half);
  }
  function hitPoint(s, n) {
    const S = lay.sides[s];
    return { x: S.lanes[n.lane].cx, y: S.hitY };
  }
  function cheer(s, expr = 'grin', hop = false) {
    const a = av[s];
    a.sq = 1; a.dir *= -1; a.lean = 1; a.expr = expr; a.exprT = 0.55;
    if (hop && !rm) a.hop = HOP;
  }
  function score() { ctx.hud.score(crew.score); }

  // ------------------------------------------------------------ input
  function targetAt(sx, sy) {
    for (let s = 0; s < 2; s++) {
      const S = lay.sides[s];
      const x = S.flip ? S.cx2 - sx : sx, y = S.flip ? S.cy2 - sy : sy;
      if (x < S.x || x > S.x + S.w || y < S.y || y > S.y + S.h) continue;
      const c = S.chill;
      if (Math.hypot(x - c.x, y - c.y) <= c.r + 18) return { side: s, kind: 'chill' };
      if (x >= S.lanesX - lay.P && x <= S.lanesX + S.lanesW + lay.P) return { side: s, kind: 'pad', lane: x < S.lanesX + S.lanesW / 2 ? 0 : 1 };
      return { side: s, kind: 'avatar' };
    }
    return null;
  }

  function pressPad(s, lane, e) {
    presses++;
    wrap.dataset.presses = String(presses);
    padAnim[s][lane] = 1;
    if (!running || pausedBy.size || !crew) { Sound.note(64 + lane * 5, 0.05, 'triangle', 0.05); return; }
    // Taps during the count-in are just warm-up drumming.
    if (rhythm.beatAt(gameNow()) < chart[0].beat - 1.5) { Sound.note(62 + lane * 5 + s * 2, 0.05, 'triangle', 0.06); cheer(s, 'happy'); return; }
    handle(crew.press(s, lane, rhythm.judge(e)));
  }

  function pressChill(s, id) {
    chillHeld[s].add(id);
    if (!crew) return;
    if (!crew.chillReady) {
      Sound.pop();
      if (elapsed - teach.coolPop > 2) { teach.coolPop = elapsed; const S = lay.sides[s]; POPS[s].add('All cool!', S.chill.x, S.chill.y - S.chill.r - 12, { size: lay.U * 0.9, color: COLORS.mint }); }
    } else if (!chillHeld[1 - s].size) Sound.pop();
  }

  const input = pointerInput(wrap, {
    onDown(p, e) {
      const t = targetAt(p.x, p.y);
      if (!t) return;
      pointers.set(p.id, t);
      if (t.kind === 'pad') pressPad(t.side, t.lane, e);
      else if (t.kind === 'chill') pressChill(t.side, p.id);
      else { cheer(t.side, 'wow', true); Sound.pop(); }
    },
    onUp(p) {
      const t = pointers.get(p.id);
      pointers.delete(p.id);
      if (t?.kind === 'chill') chillHeld[t.side].delete(p.id);
    },
  });

  const onKey = e => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown' && e.repeat) return;
    if (KEYS[k] && e.type === 'keydown') pressPad(KEYS[k][0], KEYS[k][1], e);
    else if (k in CHILL_KEYS) {
      if (e.type === 'keydown') pressChill(CHILL_KEYS[k], 'key-' + k);
      else chillHeld[CHILL_KEYS[k]].delete('key-' + k);
    }
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  // ------------------------------------------------------------ reacting to the rules
  function handle(evs) { for (const ev of evs) react(ev); }
  function react(ev) {
    switch (ev.kind) {
      case 'hit': {
        const p = hitPoint(ev.side, ev.note);
        FX[ev.side].ring(p.x, p.y, { color: COLORS.white, r: lay.sides[ev.side].noteR * 1.6 });
        FX[ev.side].burst(p.x, p.y, { n: 8, colors: THEME[ev.side].burst, speed: 200, size: 7 });
        Sound.hit(ev.note.lane + ev.side * 2);
        cheer(ev.side);
        break;
      }
      case 'sync': {
        const a = hitPoint(0, ev.note), b = hitPoint(1, ev.note);
        // Each player watches their own lanes, so SYNC! shows up on both sides at once.
        for (const [s, p] of [[0, a], [1, b]]) {
          const r = lay.sides[s].noteR;
          FX[s].ring(p.x, p.y, { color: COLORS.yellow, r: r * 2.2, life: 0.45 });
          FX[s].burst(p.x, p.y, { n: 14, colors: [COLORS.yellow, ...THEME[s].burst], speed: 300, size: 9, shape: 'star' });
          const text = ev.perfect ? 'PERFECT SYNC!' : 'SYNC!', size = lay.U * (ev.perfect ? 1 : 1.2);
          POPS[s].add(text, popX(lay.sides[s], p.x, text, size), p.y - r * 2.2, { size, color: COLORS.yellow, life: 0.6, rise: 40 });
          cheer(s, 'grin', true);
        }
        const beam = beams.find(x => x.age >= x.life) || beams[0];
        const sa = toScreen(0, a.x, a.y);
        Object.assign(beam, { x1: sa.x, y1: sa.y, x2: b.x, y2: b.y, age: 0, life: 0.4 });
        badgePop = Math.max(badgePop, 0.4);
        Sound.perfect();
        if (ev.multUp) {
          badgePop = 1;
          shake.add(5);
          crewPop(`x${ev.multUp} CREW COMBO!`, 0, { size: lay.U * 1.2, color: COLORS.mint, life: 1.1, rise: 30 });
          Sound.combo(ev.multUp * 3);
          say(`Crew combo x${ev.multUp}`);
        }
        if (ev.milestone) {
          shake.add(4);
          const C = lay.center;
          fx.burst(C.bx, C.by, { n: 26, speed: 420, size: 10, shape: 'star' });
          crewPop(`${ev.milestone} in a row!`, 1, { size: lay.U * 1.3, color: COLORS.pink, life: 1.2, rise: 30 });
          Sound.combo(6 + ev.milestone / 5);
          say(`${ev.milestone} syncs in a row!`);
        }
        score();
        break;
      }
      case 'solo':
        score();
        break;
      case 'covered': {
        // The partner hit this one: the combo is held for the crew.
        if (elapsed - coveredAt[ev.side] < 2.5) break;
        coveredAt[ev.side] = elapsed;
        const S = lay.sides[ev.side];
        POPS[ev.side].add('Crew’s got you', S.lanesX + S.lanesW / 2, S.hitY - S.noteR * 2.4, { size: lay.U * 0.95, color: COLORS.white, life: 1.1, rise: 26 });
        break;
      }
      case 'guess': {
        // A gentle nudge on that side, now and then: the partner was ready, read the notes to sync.
        if (elapsed - guessAt[ev.side] < 8) break;
        guessAt[ev.side] = elapsed;
        const S = lay.sides[ev.side];
        POPS[ev.side].add('Follow the notes!', S.lanesX + S.lanesW / 2, S.top + (S.hitY - S.top) * 0.6, { size: lay.U * 0.9, color: COLORS.white, life: 1.3, rise: 22 });
        break;
      }
      case 'flair': {
        const S = lay.sides[ev.side];
        const x = S.lanes[ev.lane].cx;
        FX[ev.side].burst(x, S.hitY, { n: 10, colors: [COLORS.orange, COLORS.yellow], speed: 240, size: 8, shape: 'star' });
        Sound.collect(ev.side * 2 + ev.lane);
        cheer(ev.side);
        score();
        break;
      }
      case 'stray': {
        const S = lay.sides[ev.side];
        FX[ev.side].ring(S.lanes[ev.lane].cx, S.hitY, { color: THEME[ev.side].lanes[ev.lane], r: S.noteR * 1.2, life: 0.25 });
        Sound.note(62 + ev.lane * 5 + ev.side * 2, 0.05, 'triangle', 0.06);
        break;
      }
      case 'heat':
        wrap.dataset.heat = ev.level;
        if (ev.rising && ev.level !== 'cool') {
          Sound.heatUp();
          setBanner(ev.level === 'hot' ? 'HOT! Hold CHILL together' : 'Warm! Chill together?', 2.6);
          say(ev.level === 'hot' ? 'Hot! Hold chill together.' : 'Warm. Chill together?');
          if (!teach.chill) { teach.chill = true; teach.chillShown = elapsed; showChillGhosts(); }
        }
        break;
      default: break;
    }
  }

  function breathDone(r) {
    const C = lay.center;
    Sound.coolDown();
    Sound.chime();
    // The bonus shows inside the breathing circle; the multiplier pops back as play resumes.
    // (A breath straight after another still cools things down; its bonus just hasn't refilled yet.)
    const big = r.bonus ? `+${r.bonus}` : r.restored ? `x${r.mult}!` : 'Cool!';
    breath = { head: r.level === 'warm' && r.bonus ? 'Early breath!' : 'Crew breath!', big, back: r.restored ? r.mult : 0 };
    fx.burst(C.bx, C.by, { n: 30, colors: [COLORS.mint, COLORS.sky, COLORS.white], speed: 380, size: 10 });
    shake.add(3);
    cheer(0, 'grin', true); cheer(1, 'grin', true);
    wrap.dataset.heat = 'cool';
    wrap.dataset.breaths = String(crew.chills);
    say(`Crew breath!${r.bonus ? ` Plus ${r.bonus}.` : ''}${r.restored ? ` Crew combo x${r.mult} is back.` : ''}`);
    score();
  }

  function breathResume() {
    releasePause('chill');
    setBanner('Here we go!', 1.2);
    const C = lay.center;
    badgePop = 1;
    if (breath?.back) {
      crewPop(`x${breath.back} is back!`, 1, { size: lay.U * 1.2, color: COLORS.yellow, life: 1.3, rise: 30 });
      fx.ring(C.bx, C.by, { color: COLORS.yellow, r: C.br * 2, life: 0.5 });
      Sound.combo(breath.back * 3);
    }
  }

  // ------------------------------------------------------------ CHILL together
  function chillStep(dt) {
    const both = chillHeld[0].size > 0 && chillHeld[1].size > 0;
    if (resumeIn > 0) {
      resumeIn -= dt;
      if (resumeIn <= 0) breathResume();
    }
    const r = crew.chill(dt, both && resumeIn <= 0);
    if (r?.kind === 'breathing') {
      if (!chilling) {
        chilling = true; breathHalf = false;
        holdPause('chill');
        wrap.dataset.chill = 'on';
        hideGhosts();
        banner.until = 0;
        Sound.breathIn(L.CHILL_SECS / 2 / SPEED);
        av.forEach(a => { a.expr = 'calm'; a.exprT = 0.3; });
      }
      if (!breathHalf && r.frac >= 0.5) { breathHalf = true; Sound.breathOut(L.CHILL_SECS / 2 / SPEED); }
    } else if (r?.kind === 'breath') {
      chilling = false;
      wrap.dataset.chill = '';
      resumeIn = 0.9;
      breathDone(r);
    } else if (chilling) {
      chilling = false; // someone let go: the song carries on, the progress is kept
      wrap.dataset.chill = '';
      releasePause('chill');
    }
    // One side holding alone: show the other side where to put a hand.
    for (let s = 0; s < 2; s++) {
      soloHold[s] = chillHeld[s].size && !chillHeld[1 - s].size && crew.chillReady ? soloHold[s] + dt : 0;
      if (soloHold[s] > 0.25 && teach.partnerHint !== 1 - s) {
        teach.partnerHint = 1 - s;
        const c = lay.sides[1 - s].chill;
        ghostAt(1 - s, 'hold', c.x, c.y);
        setBanner('Hold together!', 1.6);
      }
    }
    if (teach.partnerHint >= 0 && !soloHold[0] && !soloHold[1]) { ghostOf(teach.partnerHint).hide(); teach.partnerHint = -1; }
  }

  // ------------------------------------------------------------ ghost hands (the first 10 s teach the game)
  function hideGhosts() { ghosts.forEach(gh => gh.hide()); }
  const ghostOf = s => (s ? ghosts[1] : lay.sides[0].flip ? ghosts[2] : ghosts[0]);
  // The hand hangs below its point (in the side's own frame): keep it on screen, since stacked
  // both sides' pads sit at an edge. Side A's turned layer shows the point at (w - x, h - y).
  function ghostAt(s, type, x, y) {
    const S = lay.sides[s];
    const room = lay.small ? 70 : 90;
    y = Math.min(y, S.y + S.h - room);
    if (s === 0 && S.flip) { const p = toScreen(0, x, y); x = lay.w - p.x; y = lay.h - p.y; }
    if (s === 0) ghosts[S.flip ? 0 : 2].hide(); // the layout may have turned since the last hint
    ghostOf(s).show({ type, x, y });
  }
  function showChillGhosts() {
    for (let s = 0; s < 2; s++) { const c = lay.sides[s].chill; ghostAt(s, 'hold', c.x, c.y); }
  }
  function teachStep() {
    if (teach.taps) {
      // Game seconds: the count-in plus the first notes, a little longer if nobody has synced yet.
      if (crew.syncs >= 3 || elapsed > (crew.syncs ? 10 : 14)) { teach.taps = false; hideGhosts(); return; }
      const n = crew.notes.find(x => !x.done && !x.skip && (x.hit[0] == null || x.hit[1] == null));
      if (n && n !== teach.note) {
        teach.note = n;
        for (let s = 0; s < 2; s++) {
          const pd = lay.sides[s].pads[n.lane];
          ghostAt(s, 'tap', pd.x + pd.w / 2, pd.y + pd.h * 0.3);
        }
      }
    } else if (teach.chill && teach.chillShown && elapsed - teach.chillShown > 6) {
      teach.chillShown = 0;
      if (teach.partnerHint < 0) hideGhosts();
    }
  }

  // ------------------------------------------------------------ frame
  function animate(dt) {
    for (let s = 0; s < 2; s++) {
      const a = av[s];
      a.sq = Math.max(0, a.sq - dt * 5);
      a.lean = Math.max(0, a.lean - dt * 3);
      a.hop = Math.max(0, a.hop - dt);
      a.exprT -= dt;
      if (a.exprT <= 0) a.expr = ended ? 'proud' : chilling ? 'calm' : crew?.heatLevel === 'cool' ? 'happy' : 'focus';
      padAnim[s][0] = Math.max(0, padAnim[s][0] - dt * 7);
      padAnim[s][1] = Math.max(0, padAnim[s][1] - dt * 7);
    }
    for (const b of beams) b.age += dt;
    badgePop = Math.max(0, badgePop - dt * 3);
    fx.update(dt); pops.update(dt); fxA.update(dt); popsA.update(dt); shake.update(dt);
  }

  function step(dt) {
    if (!running) return;
    lastDt = dt;
    elapsed += dt;
    const now = gameNow();
    crew.spawn(now);
    if (bot) botStep(now);
    handle(crew.update(now));
    chillStep(dt);
    teachStep();
    animate(dt);
    const beatNow = rhythm.beatAt(now);
    if (!finaleShown && beatNow >= L.FINALE_BAR * 4 - 1) {
      finaleShown = true;
      setBanner('Crew finale!', 2);
      fx.burst(lay.center.bx, lay.center.by, { n: 24, speed: 380, shape: 'star' });
    }
    if (elapsed - hudT > 0.2) {
      hudT = elapsed;
      ctx.hud.time(1 - clamp((beatNow + L.COUNT_IN) / (L.END_BEAT + L.COUNT_IN), 0, 1));
      if (crew.heatLevel !== lastHeat) { lastHeat = crew.heatLevel; wrap.dataset.heat = lastHeat; }
    }
    draw(now, beatNow);
    if (!ended && now >= timeOf(L.END_BEAT)) finish();
  }

  // ------------------------------------------------------------ drawing
  function draw(now, beatNow) {
    curBeat = beatNow;
    view.clear(COLORS.cream);
    g.save();
    shake.apply(g);
    const frac = beatNow - Math.floor(beatNow);
    const pulse = rm || beatNow < 0 ? 0 : Math.max(0, 1 - frac * 4);
    drawCenter(pulse);
    for (let s = 0; s < 2; s++) { sideIn(s); drawSide(s, now, pulse); sideOut(s); }
    drawBeams();
    fx.draw(g);
    pops.draw(g);
    sideIn(0); fxA.draw(g); popsA.draw(g); sideOut(0);
    if (chilling || resumeIn > 0) drawBreath();
    // The count-in shows in each side's lanes, facing its player.
    if (beatNow < 0) for (let s = 0; s < 2; s++) { sideIn(s); drawCount(lay.sides[s], beatNow); sideOut(s); }
    if (lay.land) drawBanner(beatNow);
    g.restore();
  }

  function redraw() { if (crew && rhythm) { const now = gameNow(); draw(now, rhythm.beatAt(now)); } }
  function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }

  function drawSide(s, now, pulse) {
    const S = lay.sides[s], th = THEME[s];
    roundRect(g, S.px, S.py, S.pw, S.ph, lay.small ? 18 : 24);
    inkFill(g, th.bg, 4);
    const dist = S.hitY - S.top;
    due[s][0] = due[s][1] = false;
    // lanes + moving beat lines
    for (let k = 0; k < 2; k++) {
      const ln = S.lanes[k];
      roundRect(g, ln.x, ln.y, ln.w, ln.h, lay.small ? 14 : 18);
      inkFill(g, th.track, 3);
    }
    g.save();
    g.beginPath();
    g.rect(S.lanesX, S.top + 2, S.lanesW, S.lanes[0].h - 4); // one clip for both lanes (and the stacked banner)
    g.clip();
    g.strokeStyle = INK;
    const b0 = Math.ceil(rhythm.beatAt(now - 0.1));
    for (let b = b0; b < b0 + 5; b++) {
      const y = S.hitY - ((timeOf(b) - now) / L.TRAVEL) * dist;
      if (y < S.top) break;
      g.globalAlpha = b % 4 === 0 ? 0.18 : 0.08;
      g.lineWidth = b % 4 === 0 ? 4 : 3;
      g.beginPath();
      for (let k = 0; k < 2; k++) { const ln = S.lanes[k]; g.moveTo(ln.x + 8, y); g.lineTo(ln.x + ln.w - 8, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    // landing rings
    for (let k = 0; k < 2; k++) {
      const ln = S.lanes[k];
      roundRect(g, ln.x + 6, S.hitY - 7, ln.w - 12, 14, 7);
      g.fillStyle = COLORS.white; g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      if (padAnim[s][k] > 0) { g.globalAlpha = padAnim[s][k]; g.fillStyle = th.lanes[k]; g.fill(); g.globalAlpha = 1; }
    }
    // Stacked: the one-line banner sits in both sides' lanes (facing each player), under the notes.
    if (!lay.land) drawBanner(curBeat, S);
    drawNotes(s, S, now, dist);
    g.restore();
    // pads
    for (let k = 0; k < 2; k++) drawPad(s, k, S, th);
    drawColumn(s, S, pulse);
  }

  function drawNotes(s, S, now, dist) {
    const r = S.noteR;
    for (const n of crew.notes) {
      const T = timeOf(n.beat);
      const dt = T - now;
      if (dt > L.TRAVEL + 0.2) break;
      if (dt < -0.8 || !n.shown || n.hit[s] != null) continue;
      let alpha = 1;
      if (n.closed[s]) { alpha = 1 - (now - T - L.BASE_WINDOW * n.scale[s]) / 0.3; if (alpha <= 0) continue; alpha *= 0.6; }
      const y = S.hitY - (dt / L.TRAVEL) * dist;
      const near = clamp(1 - Math.abs(dt) / 0.35, 0, 1);
      const sy = 1 + (rm ? 0 : 0.14 * near);
      // Every note looks the same on both sides; an easing side's extra slack is invisible.
      if (!n.closed[s] && Math.abs(dt) <= L.BASE_WINDOW * n.scale[s]) due[s][n.lane] = true;
      g.globalAlpha = alpha;
      const x = S.lanes[n.lane].cx;
      g.fillStyle = INK;
      g.beginPath(); g.ellipse(x, y + 4, r, r * sy, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x, y, r, r * sy, 0, 0, Math.PI * 2);
      inkFill(g, THEME[s].lanes[n.lane], 4);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      circle(x - r * 0.32, y - r * 0.34 * sy, r * 0.24); g.fill();
      g.globalAlpha = 1;
    }
    for (const f of crew.flair) {
      if (f.side !== s || f.hit) continue;
      const dt = timeOf(f.beat) - now;
      if (dt > L.TRAVEL + 0.2 || dt < -0.4) continue;
      const y = S.hitY - (dt / L.TRAVEL) * dist;
      g.globalAlpha = f.done ? 0.35 : 1;
      starPath(g, S.lanes[f.lane].cx, y, r * 0.8, r * 0.4);
      inkFill(g, COLORS.orange, 3.5);
      g.globalAlpha = 1;
    }
  }

  function drawPad(s, k, S, th) {
    const pd = S.pads[k];
    const pr = padAnim[s][k];
    const R = lay.small ? 16 : 22;
    const dy = pr * 5;
    roundRect(g, pd.x, pd.y + 6, pd.w, pd.h - 2, R);
    g.fillStyle = INK; g.fill();
    const squash = pr * 0.06 * pd.h;
    roundRect(g, pd.x - pr * 2, pd.y + dy + squash, pd.w + pr * 4, pd.h - 2 - squash, R);
    inkFill(g, th.lanes[k], 4);
    roundRect(g, pd.x + 10, pd.y + dy + squash + 7, pd.w - 20, Math.max(6, pd.h * 0.16), 6);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
    const cx = pd.x + pd.w / 2, cy = pd.y + dy + pd.h * 0.56;
    const rr = Math.min(pd.h * 0.22, pd.w * 0.2, 20);
    circle(cx, cy, rr);
    g.lineWidth = 5; g.strokeStyle = due[s][k] ? COLORS.white : 'rgba(255,255,255,0.7)'; g.stroke();
    if (due[s][k]) { circle(cx, cy, rr * 0.45); g.fillStyle = COLORS.white; g.fill(); }
  }

  function drawColumn(s, S, pulse) {
    const small = lay.small;
    // name tag
    const fs = small ? 14 : 17;
    g.font = `900 ${fs}px ${FONT}`;
    let name = names[s];
    const maxW = S.col.w - 8;
    while (name.length > 2 && g.measureText(name).width > maxW - 20) name = name.slice(0, -2) + '…';
    const tw = Math.min(maxW, g.measureText(name).width + 22);
    roundRect(g, S.col.cx - tw / 2, S.nameY - fs * 0.8, tw, fs * 1.6, fs);
    inkFill(g, COLORS.white, 3);
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, S.col.cx, S.nameY + 1);
    // a stage spotlight from the name tag down to the dancer (brightens on the beat)
    const cx = S.col.cx, topY = S.nameY + fs * 0.8, w0 = S.col.w * 0.14, w1 = S.col.w * 0.48;
    g.beginPath(); g.moveTo(cx - w0, topY); g.lineTo(cx + w0, topY); g.lineTo(cx + w1, S.avFeet); g.lineTo(cx - w1, S.avFeet); g.closePath();
    g.fillStyle = COLORS.white;
    g.globalAlpha = 0.34 + pulse * 0.16; g.fill();
    g.beginPath(); g.ellipse(cx, S.avFeet, w1, w1 * 0.2, 0, 0, Math.PI * 2);
    g.globalAlpha = 0.7; g.fill();
    g.globalAlpha = 1;
    // avatar with squash, lean and hop
    const a = av[s];
    g.fillStyle = 'rgba(59,42,74,0.14)';
    g.beginPath(); g.ellipse(cx, S.avFeet, S.avH * 0.2, S.avH * 0.035, 0, 0, Math.PI * 2); g.fill();
    const bob = pulse * 0.035;
    const hopY = a.hop > 0 ? -Math.sin((1 - a.hop / HOP) * Math.PI) * S.avH * 0.16 : 0;
    const img = imgs[s][a.expr] || imgs[s].happy;
    if (img) {
      // Squash & stretch around the feet (same geometry as engine.drawAvatar).
      const h = S.avH, w = h * (2 / 3);
      g.save();
      g.translate(S.col.cx, S.avFeet + hopY);
      g.rotate(rm ? 0 : a.lean * 0.12 * a.dir);
      g.scale((lay.land && s === 1 ? -1 : 1) * (1 + 0.07 * a.sq - bob * 0.5), 1 - 0.09 * a.sq + bob);
      g.drawImage(img, -w / 2, -h * (286 / 300), w, h);
      g.restore();
    }
    drawChillButton(s, S);
  }

  function drawChillButton(s, S) {
    const c = S.chill;
    const ready = crew.chillReady;
    const held = chillHeld[s].size > 0;
    const on = ready || held;
    if (ready && !held) {
      const k = rm ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 6);
      circle(c.x, c.y, c.r + 7 + 4 * k);
      g.lineWidth = 6; g.strokeStyle = COLORS.white; g.stroke();
      circle(c.x, c.y, c.r + 11 + 4 * k);
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    }
    circle(c.x, c.y + 5, c.r); g.fillStyle = INK; g.fill();
    circle(c.x, c.y + (held ? 3 : 0), c.r);
    // Resting (nothing to cool yet): a pale button, still clearly there to learn.
    inkFill(g, held ? '#A8F2D6' : on ? COLORS.mint : '#E2F8EF', 4);
    const y = c.y + (held ? 3 : 0);
    g.globalAlpha = on ? 1 : 0.45;
    g.beginPath();
    g.moveTo(c.x - c.r * 0.5, y - c.r * 0.12);
    g.bezierCurveTo(c.x - c.r * 0.25, y - c.r * 0.42, c.x, y - c.r * 0.42, c.x, y - c.r * 0.12);
    g.bezierCurveTo(c.x, y + c.r * 0.18, c.x + c.r * 0.25, y + c.r * 0.18, c.x + c.r * 0.5, y - c.r * 0.12);
    g.lineWidth = 5; g.lineCap = 'round'; g.strokeStyle = INK; g.stroke();
    outlinedText(g, 'CHILL', c.x, y + c.r * 0.38, { size: Math.max(11, c.r * 0.34) });
    const f = crew.chillFrac;
    if (f > 0) {
      g.beginPath(); g.arc(c.x, y, c.r + 7, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      g.lineCap = 'round';
      g.lineWidth = 12; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 6; g.strokeStyle = COLORS.white; g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawCenter(pulse) {
    const C = lay.center;
    // crew badge: the shared multiplier
    const mult = crew.mult, base = crew.baseMult;
    const br = C.br * (1 + (rm ? 0.1 : 0.3) * badgePop * badgePop + pulse * 0.04);
    circle(C.bx, C.by + 5, br); g.fillStyle = INK; g.fill();
    circle(C.bx, C.by, br); inkFill(g, BADGE[mult - 1], 4);
    outlinedText(g, 'x' + mult, C.bx, C.by + 1, { size: br * 0.95 });
    // pips: lit = multiplier now · white = saved (chill brings it back) · faint = still to earn
    for (let k = 0; k < L.MAX_MULT; k++) {
      const x = C.pipX + k * 14, y = C.pipY;
      circle(x, y, 5.5);
      if (k < mult) inkFill(g, COLORS.yellow, 2.5);
      else if (k < base) inkFill(g, COLORS.white, 2.5);
      else { g.fillStyle = 'rgba(59,42,74,0.12)'; g.fill(); }
    }
    // combo: syncs in a row
    const U = lay.U;
    if (C.vertical) {
      outlinedText(g, String(crew.streak), C.bx, C.streakY, { size: U * 1.25 });
      g.font = `900 ${Math.round(U * 0.62)}px ${FONT}`;
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('in a row', C.bx, C.streakY + U * 1.05);
    } else {
      g.font = `900 ${Math.round(U * 0.95)}px ${FONT}`;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const txt = String(crew.streak);
      g.lineWidth = Math.max(4, U / 5); g.lineJoin = 'round'; g.strokeStyle = INK; g.strokeText(txt, C.pipX - 5, C.streakY);
      g.fillStyle = COLORS.white; g.fillText(txt, C.pipX - 5, C.streakY);
      const w = g.measureText(txt).width;
      g.font = `900 ${Math.round(U * 0.7)}px ${FONT}`;
      g.fillStyle = INK; g.fillText('in a row', C.pipX + w + 1, C.streakY + 1);
    }
    drawHeat(C);
  }

  function drawHeat(C) {
    const m = C.meter, heat = crew.heat, lvl = crew.heatLevel;
    const color = lvl === 'hot' ? COLORS.pink : lvl === 'warm' ? COLORS.orange : COLORS.mint;
    const R = Math.min(m.w, m.h) / 2;
    roundRect(g, m.x, m.y, m.w, m.h, R); inkFill(g, COLORS.white, 3.5);
    const f = heat / 100;
    if (f > 0) {
      g.save();
      roundRect(g, m.x, m.y, m.w, m.h, R); g.clip();
      g.fillStyle = color;
      if (C.vertical) g.fillRect(m.x, m.y + m.h * (1 - f), m.w, m.h * f);
      else g.fillRect(m.x, m.y, m.w * f, m.h);
      g.restore();
      roundRect(g, m.x, m.y, m.w, m.h, R); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
    }
    g.strokeStyle = INK; g.lineWidth = 2.5; g.globalAlpha = 0.45;
    for (const t of TICKS) {
      g.beginPath();
      if (C.vertical) { const y = m.y + m.h * (1 - t / 100); g.moveTo(m.x + 4, y); g.lineTo(m.x + m.w - 4, y); }
      else { const x = m.x + m.w * (t / 100); g.moveTo(x, m.y + 4); g.lineTo(x, m.y + m.h - 4); }
      g.stroke();
    }
    g.globalAlpha = 1;
    // flame at the hot end
    const fs = C.vertical ? 30 : 26;
    const wig = rm || lvl === 'cool' ? 0 : Math.sin(elapsed * 14) * 0.08;
    const fx0 = C.vertical ? m.x + m.w / 2 : m.x + m.w + fs * 0.55;
    const fy0 = C.vertical ? m.y - fs * 0.6 : m.y + m.h / 2;
    g.save();
    g.translate(fx0, fy0);
    g.rotate(wig);
    g.scale(fs / 48, fs / 48);
    g.translate(-24, -26);
    g.globalAlpha = lvl === 'cool' ? 0.35 : 1;
    g.fillStyle = lvl === 'hot' ? COLORS.pink : COLORS.orange; g.fill(FLAME);
    g.lineWidth = 5; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(FLAME);
    g.restore();
    g.globalAlpha = 1;
  }

  function drawBeams() {
    const C = lay.center;
    g.lineCap = 'round';
    for (const b of beams) {
      if (b.age >= b.life) continue;
      const k = 1 - b.age / b.life;
      g.globalAlpha = Math.min(1, k * 1.5);
      // Control point chosen so the curve passes through the crew badge.
      g.beginPath(); g.moveTo(b.x1, b.y1); g.quadraticCurveTo(2 * C.bx - (b.x1 + b.x2) / 2, 2 * C.by - (b.y1 + b.y2) / 2, b.x2, b.y2);
      g.strokeStyle = INK; g.lineWidth = 6 + 10 * k; g.stroke();
      g.strokeStyle = COLORS.yellow; g.lineWidth = 2 + 6 * k; g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawBreath() {
    const w = lay.w, h = lay.h;
    const R = Math.min(w, h) * (lay.land ? 0.3 : 0.26);
    const f = chilling ? crew.chillFrac : 1;
    const inhale = f < 0.5;
    // After the breath the circle stays full while the bonus shows.
    const k = !chilling ? 1 : inhale ? ease.inOut(f * 2) : 1 - ease.inOut((f - 0.5) * 2);
    const r = R * (rm ? 0.85 + 0.1 * k : 0.62 + 0.38 * k);
    const cx = w / 2, cy = h / 2;
    g.fillStyle = 'rgba(255,246,229,0.62)';
    g.fillRect(0, 0, w, h);
    // the full-breath ring the circle grows into; the crew's progress runs around it
    circle(cx, cy, R + 8); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(59,42,74,0.3)'; g.stroke();
    circle(cx, cy + 6, r); g.fillStyle = INK; g.fill();
    circle(cx, cy, r); inkFill(g, '#BFF5E0', 5);
    circle(cx, cy, r * 0.74); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R + 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
    g.lineCap = 'round';
    g.lineWidth = 13; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 7; g.strokeStyle = COLORS.white; g.stroke();
    const [a, b] = !chilling ? [breath?.head || 'Here', breath?.big || 'we go!'] : inhale ? BREATH_TEXT.in : BREATH_TEXT.out;
    const size = Math.min(lay.U * 1.35, R * 0.27);
    if (!lay.land) {
      // Face to face: each player reads the words in their own half of the circle.
      const s2 = size * 0.8;
      for (let s = 0; s < 2; s++) {
        g.save();
        if (s === 0) { g.translate(2 * cx, 2 * cy); g.scale(-1, -1); }
        outlinedText(g, a, cx, cy + s2 * 0.95, { size: chilling ? s2 : s2 * 0.9 });
        outlinedText(g, b, cx, cy + s2 * 2.05, chilling ? { size: s2 } : { size: s2 * 1.2, color: COLORS.yellow });
        g.restore();
      }
    } else if (chilling) {
      outlinedText(g, a, cx, cy - size * 0.55, { size });
      outlinedText(g, b, cx, cy + size * 0.6, { size });
    } else {
      outlinedText(g, a, cx, cy - size * 0.7, { size: size * 0.9 });
      outlinedText(g, b, cx, cy + size * 0.6, { size: size * 1.35, color: COLORS.yellow });
    }
  }

  function drawCount(S, beatNow) {
    const i = clamp(Math.floor(beatNow) + L.COUNT_IN, 0, 3);
    const k = beatNow - Math.floor(beatNow);
    const size = lay.U * (3.2 - (rm ? 0 : k * 0.8));
    outlinedText(g, COUNT[i], S.lanesX + S.lanesW / 2, S.top + (S.hitY - S.top) * 0.45, { size, color: COLORS.yellow });
  }
  function drawBanner(beatNow, S) {
    const text = teach.taps && beatNow < 12 ? 'Tap together!' : banner.until > elapsed ? banner.text : '';
    if (!text) return;
    // Landscape: top of the centre strip (kept free). Stacked: the top of a side's lanes, under the
    // notes — inside the lane edges (the lanes clip it), so on a narrow phone the words shrink a
    // little, or wrap onto two lines, rather than get cut off.
    const { lines, fs, tw } = fitPill(text, lay.small ? 17 : 20, lay.land ? Infinity : S.lanesW - 12);
    const h = fs * (0.75 + 1.25 * lines.length);
    if (lay.land) drawPill(lines, lay.w / 2, lay.h < 520 ? lay.h - h / 2 - 12 : 32, tw, h, fs);
    else drawPill(lines, S.lanesX + S.lanesW / 2, S.top + 8 + h / 2, tw, h, fs);
  }
  /** The banner's lines, font size and pill width so it fits maxW (a pill's ends need 30 px). */
  function fitPill(text, fs, maxW) {
    const width = (t, f) => { g.font = `900 ${f}px ${FONT}`; return g.measureText(t).width; };
    let w = width(text, fs);
    if (w + 30 > maxW) { fs = Math.max(13, Math.floor((fs * (maxW - 30)) / w)); w = width(text, fs); }
    let lines = [text];
    const cut = text.length / 2;
    const at = [...text].reduce((best, ch, i) => (ch === ' ' && Math.abs(i - cut) < Math.abs(best - cut) ? i : best), -1);
    if (w + 30 > maxW && at > 0) { lines = [text.slice(0, at), text.slice(at + 1)]; w = Math.max(...lines.map(l => width(l, fs))); }
    g.font = `900 ${fs}px ${FONT}`;
    return { lines, fs, tw: Math.min(maxW, w + 30) };
  }
  function drawPill(lines, x, y, tw, h, fs) {
    roundRect(g, x - tw / 2, y - h / 2, tw, h, Math.min(fs, h / 2));
    g.fillStyle = INK; g.fill();
    g.fillStyle = COLORS.white; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, x, y + 1 + (i - (lines.length - 1) / 2) * fs * 1.25));
  }

  // ------------------------------------------------------------ round end
  function finish() {
    if (ended || !crew) return;
    ended = true;
    stopBot();
    hideGhosts();
    banner.until = 0;
    av.forEach(a => { a.expr = 'proud'; a.exprT = 9; a.hop = 0; a.lean = 0; a.sq = 0; });
    const now = gameNow();
    draw(now, rhythm.beatAt(now));
    rhythm.stop();
    ctx.end(L.buildResult(crew.summary(), names[0], names[1]));
  }

  // ------------------------------------------------------------ test bot (drives the real input path)
  function botPointer(type, id, x, y) {
    const r = wrap.getBoundingClientRect();
    wrap.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: false, bubbles: true, cancelable: true,
      clientX: r.left + x, clientY: r.top + y, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
    }));
  }
  function botTap(s, lane) {
    const pd = lay.sides[s].pads[lane];
    const id = 11 + s * 10 + lane;
    const { x, y } = toScreen(s, pd.x + pd.w / 2 + (bot.rnd() - 0.5) * pd.w * 0.4, pd.y + pd.h / 2);
    botPointer('pointerdown', id, x, y);
    bot.timers.push(setTimeout(() => botPointer('pointerup', id, x, y), 45));
    if (bot.timers.length > 64) bot.timers.splice(0, 32);
  }
  function botPlan(i) {
    if (i < 6) return [true, true];
    if (i >= 16 && i < 21) return [false, false]; // the crew loses the beat → heat → CHILL together
    const r = bot.rnd();
    return r < 0.7 ? [true, true] : r < 0.84 ? [true, false] : r < 0.96 ? [false, true] : [false, false];
  }
  function botStep(now) {
    const b = bot;
    if (crew.chillReady && !b.chill && resumeIn <= 0) b.chill = { t: 0, a: false, b: false };
    if (b.chill) {
      const c = b.chill;
      c.t += lastDt;
      const ca = lay.sides[0].chill, pa = toScreen(0, ca.x, ca.y), pb = lay.sides[1].chill;
      if (!c.a) { botPointer('pointerdown', 19, pa.x, pa.y); c.a = true; }
      if (!c.b && c.t >= 0.4) { botPointer('pointerdown', 29, pb.x, pb.y); c.b = true; }
      if (c.b && !crew.chillReady && !chilling) {
        botPointer('pointerup', 19, pa.x, pa.y); botPointer('pointerup', 29, pb.x, pb.y);
        b.chill = null;
      }
    }
    if (pausedBy.size) return;
    // Taps are timed with timers, not frames, so a slow frame doesn't make the bot late.
    const notes = crew.notes;
    while (b.idx < notes.length) {
      const n = notes[b.idx];
      const T = timeOf(n.beat);
      if (T - now > BOT_LOOK) break;
      const plan = botPlan(b.idx++);
      // After a stall (e.g. a screenshot) a real player wouldn't tap a note that's long gone.
      if (n.skip || !n.shown || now - T > 0.1 || !(plan[0] || plan[1])) continue;
      // Mostly the drawn pad; now and then the other one, which an easing side quietly accepts
      // (it holds the combo, never syncs).
      const lanes = [0, 1].map(s => (n.either[s] && b.rnd() < 0.1 ? 1 - n.lane : n.lane));
      botAt(T + (b.rnd() - 0.5) * 0.06, () => {
        // A timer that fired very late (a busy machine) would land on the next note: let it go.
        if (gameNow() - T > BOT_LATE) return;
        // Both players' fingers land in the same instant: two pointers, one event loop turn.
        for (let s = 0; s < 2; s++) if (plan[s] && n.hit[s] == null && !n.closed[s]) botTap(s, lanes[s]);
      });
    }
    for (const f of crew.flair) {
      if (f.done || b.seen.has(f) || timeOf(f.beat) - now > BOT_LOOK) continue;
      b.seen.add(f);
      if (b.rnd() < 0.6) botAt(timeOf(f.beat), () => { if (!f.done && gameNow() - timeOf(f.beat) < L.FLAIR_WINDOW) botTap(f.side, f.lane); });
    }
  }
  function botAt(t, fn) {
    const ms = Math.max(0, ((t - gameNow()) / SPEED) * 1000);
    bot.timers.push(setTimeout(() => { if (bot && running && !pausedBy.size) fn(); }, ms));
  }
  function stopBot() {
    if (!bot) return;
    bot.timers.forEach(clearTimeout);
    bot = null;
  }

  function clearHolds() { chillHeld[0].clear(); chillHeld[1].clear(); pointers.clear(); }

  return {
    start() {
      rhythm = startRhythm({ bpm: L.BPM, bars: L.BARS, countIn: L.COUNT_IN, groove: ctx.seed % 3, keyIdx: ctx.seed % 4 });
      crew = L.createCrew({ chart, adapt, timeOf, rnd: ctx.rng });
      running = true;
      ctx.hud.score(0);
      ctx.hud.time(1);
      wrap.dataset.heat = 'cool';
      wrap.dataset.offset = String(rhythm.offset || 0); // the device's tuned offset (tests)
      redraw();
      stopLoop = startLoop(step);
    },
    pause() {
      if (!running) return;
      running = false;
      holdPause('shell');
      clearHolds();
      stopLoop?.();
      stopLoop = null;
    },
    resume() {
      if (running || ended) return;
      releasePause('shell');
      running = true;
      stopLoop = startLoop(step);
    },
    finish() { finish(); },
    destroy() {
      running = false;
      destroyed = true;
      stopLoop?.();
      stopBot();
      rhythm?.stop();
      input.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      ghosts[1].destroy();
      ghosts[2].destroy();
      ghostLayer.remove();
      flipLayer.remove();
      // Safari keeps a global canvas-memory budget: release the baked dancers' backing stores.
      for (const set of imgs) for (const c of Object.values(set)) { c.width = 0; c.height = 0; }
      view.destroy();
      wrap.remove();
      live.remove();
    },
    /** Test hook: where and when side A's next note lands (viewport px, real ms). */
    hint() {
      if (!crew) return null;
      const now = gameNow();
      const n = crew.notes.find(x => !x.done && !x.skip && x.hit[0] == null && timeOf(x.beat) > now - 0.05);
      if (!n) return null;
      const pd = lay.sides[0].pads[n.lane];
      const p = toScreen(0, pd.x + pd.w / 2, pd.y + pd.h / 2);
      const r = wrap.getBoundingClientRect();
      return { type: 'tap', x: r.left + p.x, y: r.top + p.y, ms: Math.max(0, ((timeOf(n.beat) - now) / SPEED) * 1000), side: 0 };
    },
    /** Test hook: an in-page bot playing both sides with real PointerEvents (distinct pointer ids). */
    autoplay() {
      if (!bot) bot = { rnd: rng(ctx.seed * 7 + 3), idx: 0, seen: new WeakSet(), timers: [], chill: null };
      return true;
    },
  };
}

export default {
  id: 'combo',
  title: 'Crew Combo',
  blurb: 'Two players, one beat. Hit together!',
  icon: 'crew',
  color: 'mint',
  kind: 'coop',
  rhythm: true,
  ready: true,
  create: (host, ctx) => createGame(host, ctx),
};
