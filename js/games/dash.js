// City Dash — run through the city to the Showcase. Tap = jump, swipe down = slide.
// A crash is never the end: the run pauses on "Run it back" (rewind 3 s + Comeback Bonus) or
// "Keep going" (a stumble). With no charges left a crash is just a stumble; the run always reaches the Showcase.
// Charges = 3 + this week's real-life Rewinds (gold), so the real-world link is on screen.
// The run model lives in dash-logic.js (unit-tested), the art in dash-art.js.
import * as R from '../rules.js';
import * as E from './engine.js';
import { icon } from '../ui.js';
import { createRun, botAction, paceFor, LOOK, CHUNK, COMEBACK_SECS, PHYS, KINDS, noise } from './dash-logic.js';
import { buildArt, skyCSS, loadPoses, loadPose, rasterPoses, drawPose, RUN_FRAMES, sprite } from './dash-art.js';

const { INK, COLORS: C } = E;
const INTRO = 1.8;          // 3-2-1 before GO (game seconds)
const REWIND_ANIM = 1.0;    // the VHS rewind on screen
const FINISH_ANIM = 2.8;    // celebrating on the stage
const DEAD = 40;            // no swipes from the top/bottom edges (iOS system gestures)
const ARM = 0.35;           // the crash card ignores taps for its first moment (game seconds)
const FX_WAIT = 30;         // ms: a held press's jump sound waits this long (or for the release)…
const FX_MAX = 160;         // …or up to this while the finger heads down (a swipe to slide: no hop sound)
const CLEAN_WORDS = ['Clean!', 'Smooth!', 'Nice!', 'Fresh!', 'Clean!'];

export default {
  id: 'dash',
  title: 'City Dash',
  blurb: 'Run to the Showcase. Crash? Run it back!',
  icon: 'flag',
  color: 'sky',
  kind: 'arcade',
  ready: true,
  create: (host, ctx) => createDash(host, ctx),
};

export const AVATAR_M = 2.95;   // the runner's height in metres
export const SLIDE_ROT = 1.12;  // the slide pose leans back this far (radians) around the feet
/** How far behind the feet the sliding runner's head reaches (CSS px) for a runner avatarH px tall. */
export const slideReach = avatarH => 0.95 * avatarH * Math.sin(SLIDE_ROT);

/** Screen layout for a play area of w×h CSS px: scale (px per metre), ground line, runner spot. */
export function layout(w, h, dpr = 1) {
  const narrow = w < 560;
  const hudH = narrow ? 86 : 62;
  const groundY = Math.round(h - Math.max(62, h * (narrow ? 0.12 : 0.16)));
  const scale = runnerX => {
    const ahead = w - runnerX;
    let ppm = ahead / LOOK;                       // ≈ 19 m of road ahead on an iPad
    if (ppm < 25) ppm = Math.min(25, ahead / 12); // phones: a readable runner (the pace slows to match, see paceFor)
    return Math.max(8, Math.min(ppm, (groundY - hudH - 8) / 5.3, 60));
  };
  let runnerX = Math.round(Math.max(46, Math.min(200, w * (narrow ? 0.13 : 0.19))));
  let ppm = scale(runnerX);
  // Narrow screens: the sliding runner leans back past its feet, so move it in until the whole pose
  // (head and hair) stays inside the play area. A runner further in only ever gets smaller, so it still fits.
  const need = Math.ceil(slideReach(AVATAR_M * ppm) + 4);
  if (runnerX < need) { runnerX = need; ppm = scale(runnerX); }
  const ahead = w - runnerX;
  const backY = groundY - Math.round(0.7 * ppm);
  const unit = Math.max(70, Math.min(170, Math.min(w, h) * 0.18));
  return {
    w, h, dpr, narrow, hudH, groundY, backY, runnerX, ppm, lookM: ahead / ppm,
    avatarH: AVATAR_M * ppm, unit, buildH: Math.max(unit * 1.4, (backY - hudH) * 0.85), farH: Math.max(80, (backY - hudH) * 0.7),
    curbY: groundY + Math.round(0.45 * ppm),
  };
}

// The Showcase at the finish (metres from where it stands, stageX): the runner hops on at STAGE_HOP and
// the crew waits in a row from CREW_AT, CREW_GAP apart. The finish camera keeps all of them in view.
const STAGE_HOP = 5.8, CREW_AT = 8.6, CREW_GAP = 2.3, CREW_W = 0.62 * AVATAR_M;
/** Where the finish camera comes to rest, relative to stageX, for a layout L with `crewN` crew waiting. */
export function finishCam(L, crewN = 4) {
  const right = CREW_AT + Math.max(0, crewN - 1) * CREW_GAP + CREW_W / 2 + 0.4; // the last crew member, whole
  const left = STAGE_HOP - AVATAR_M / 3 - 0.4;                                  // the runner on the stage, whole
  // iPads see the whole party from 3 m on; a narrow view moves on until the last crew member fits,
  // but never so far that the runner slides off the left.
  return Math.min(Math.max(3, right - L.lookM), left + L.runnerX / L.ppm);
}

function createDash(host, ctx) {
  const { player, sound: Sound, reducedMotion: rm } = ctx;
  const S = ctx.state.get();
  const total = R.dashCharges(S, player.id);
  const base = Math.min(total, R.DASH_BASE_CHARGES);
  const gold = total - base;
  const crew = (ctx.state.crewInOrder?.() || S.players).filter(p => p.id !== player.id).slice(0, 4);
  const seed = ctx.seed;

  host.classList.add('dash-host');
  const view = E.createCanvas(host);
  const g = view.g;
  const ui = document.createElement('div');
  ui.className = 'dash-ui';
  host.appendChild(ui);
  const particles = E.createParticles(300);
  const pops = E.createPops();
  const shake = E.createShake();
  const adapt = ctx.adapt({ min: 0, max: 1, start: 0.35, step: 0.12, missesToEase: 3, hitsToRamp: 8, cooldown: 4 });

  let L = null, art = null, scanPat = null, poseImgs = null, poses = null, headImg = null, crewImgs = [], crewSpr = [];
  let run = null, phase = 'intro', paused = false, ended = false, stopLoop = null, beat = null;
  let introT = 0, crashT = 0, rewT = 0, finT = 0, animT = 0, lastCount = 4;
  let rewindPath = null, rewindBack = 3, overlayEl = null, overlayAt = 0, autoStumble = false, lastScore = -1;
  let runPhase = 0, squash = 0, stretch = 0, stumbleShow = 0, collectRun = 0, collectT = 0, goldNoteT = 6;
  let slowmo = 1, teachUntil = 0;
  let rewFrom = 0, rewLost = 0, freezeAt = null;
  let press = null, jumpFxAt = 0;
  const fx = { jump: 0, slide: 0 };
  const taught = { jump: false, slide: false, rewind: false, active: null, tries: 0, skipId: null, ob: null, g: null };
  let bot = null, frozen = false;

  // ---------------------------------------------------------------- layout + art
  function relayout() {
    L = layout(view.w, view.h, view.dpr);
    art = buildArt(L, seed);
    host.style.background = skyCSS(L.backY + 2);
    scanPat = g.createPattern(art.scan, 'repeat');
    if (poseImgs) poses = rasterPoses(poseImgs, L.avatarH, view.dpr);
    crewSpr = crewImgs.map(img => (img?.naturalWidth ? sprite(L.avatarH * 0.62, L.avatarH * 0.93, view.dpr, gg => gg.drawImage(img, 0, 0, L.avatarH * 0.62, L.avatarH * 0.93)) : null));
  }
  view.onResize = () => relayout();
  relayout();
  // Narrow screens see less road: a little slower, on a street shorter by the same share (same run time).
  const { speedScale, finish } = paceFor(L.lookM);
  let finishX = finish, stageX = finish, earlyFinish = false, hopDelay = 0;

  // Pre-render the runner's poses (and the crew waiting at the Showcase) during the countdown.
  const loading = Promise.all([
    loadPoses(player.avatar).then(imgs => { poseImgs = imgs; poses = rasterPoses(imgs, L.avatarH, view.dpr); }),
    E.avatarImage(player.avatar, { crop: 'head', expr: 'grin' }).then(img => { headImg = img; }),
    ...crew.map((p, i) => loadPose(p.avatar, 'cheer').then(img => { crewImgs[i] = img; })),
  ]).catch(() => {}).then(() => relayout());
  let loaded = false;
  loading.then(() => { loaded = true; });

  // ---------------------------------------------------------------- the run
  run = createRun({ seed, charges: total, adapt, speedScale, finish, onEvent });
  const runnerY = () => L.groundY - run.s.y * L.ppm;
  const sxOf = (x, camX) => L.runnerX + (x - camX) * L.ppm;
  /** Draw a sprite 1:1 on whole device pixels (the unscaled fast path; x, y = its top-left in CSS px). */
  const blit = (img, x, y) => { const d = view.dpr; g.drawImage(img, Math.round(x * d) / d, Math.round(y * d) / d, img.width / d, img.height / d); };
  /** Which building sprite stands in slot i (never the same as its left neighbour). */
  const buildingAt = i => {
    const n = art.buildings.length, v = k => Math.floor(noise(seed, k * 7) * n);
    const a = v(i), b = v(i - 1);
    return a === b ? (a + 1 + (i & 1)) % n : a;
  };

  function onEvent(type, d) {
    const s = run.s;
    const rx = L.runnerX, ry = runnerY();
    switch (type) {
      case 'jump': {
        stretch = 1; squash = 0;
        if (taught.active === 'jump') endTeach('jump');
        // A finger still down may be starting a swipe to slide: its hop sound waits a moment (see pendingJumpFx).
        const now = performance.now();
        if (press && !press.up && now - press.t0 < FX_MAX) jumpFxAt = press.t0 + FX_WAIT;
        else jumpFx();
        break;
      }
      case 'land':
        if (d > 6) {
          squash = Math.min(1, d / 22); stretch = 0;
          Sound.tone({ f: 150, dur: 0.08, vol: 0.12, type: 'sine', slideTo: 70 });
          particles.burst(rx, L.groundY, { n: 5, colors: ['#FFFFFF', '#EDE4F7'], speed: 120, size: 6, gravity: 200, life: 0.3, angle: -Math.PI / 2, spread: 2.6 });
          if (d > 26) shake.add(2);
        }
        break;
      case 'slide':
        Sound.slide(); squash = 0.6; fx.slide++;
        particles.burst(rx - 10, L.groundY, { n: 8, colors: ['#FFFFFF', '#EDE4F7', C.yellow], speed: 180, size: 7, gravity: 250, life: 0.4, angle: Math.PI + 0.3, spread: 0.8 });
        if (taught.active === 'slide') endTeach('slide');
        break;
      case 'slam': Sound.whoosh(); break;
      case 'collect': {
        const x = sxOf(d.rec.x, s.x), y = L.groundY - d.rec.y * L.ppm;
        collectRun = collectT > 0 ? collectRun + 1 : 0; collectT = 0.6;
        if (d.boosted) {
          Sound.combo(4 + collectRun);
          pops.add('x2!', x, y - 18, { color: C.yellow, size: 30 });
          particles.burst(x, y, { n: 12, colors: [C.yellow, C.orange, C.white], speed: 260, size: 8, shape: 'star', life: 0.6 });
        } else {
          Sound.collect(collectRun);
          particles.burst(x, y, { n: 6, colors: [C.pink, C.yellow, C.white], speed: 170, size: 6, life: 0.45 });
        }
        particles.ring(x, y, { color: d.boosted ? C.yellow : C.white, r: L.ppm * 0.7, life: 0.3 });
        break;
      }
      // A clean clear is celebrated at least as much as a repair (and streaks on top), so a crash on purpose never looks like the better play.
      case 'clean': {
        Sound.perfect();
        pops.add(CLEAN_WORDS[s.cleans % CLEAN_WORDS.length], rx + 30, ry - L.avatarH * 1.05, { color: C.mint, size: L.narrow ? 28 : 34, life: 0.8, rise: 60 });
        passBurst(d, [C.mint, C.yellow, C.white, C.sky]);
        const n = s.streak;
        if (n >= 3 && n % 3 === 0) {
          Sound.combo(Math.min(10, 3 + n / 3));
          pops.add(`${n} in a row!`, L.w / 2, L.hudH + (L.groundY - L.hudH) * 0.5, { color: C.yellow, size: L.narrow ? 30 : 40, life: 1, rise: 40 });
        }
        break;
      }
      case 'repair':
        Sound.chime();
        pops.add('Repaired!', rx + 30, ry - L.avatarH * 1.05, { color: C.pink, size: L.narrow ? 28 : 34, life: 0.8, rise: 60 });
        passBurst(d, [C.pink, C.yellow, C.mint, C.sky]);
        break;
      case 'knock': Sound.pop(); break;
      case 'crash':
        phase = 'crash'; crashT = 0;
        Sound.bonk(); shake.add(9);
        particles.burst(rx + L.ppm * 0.6, ry - L.avatarH * 0.45, { n: 14, colors: [C.yellow, C.white, C.pink], speed: 300, size: 10, shape: 'star', life: 0.7 });
        pops.add('Bonk!', rx + 40, ry - L.avatarH * 1.05, { color: C.white, size: L.narrow ? 30 : 38, life: 0.8 });
        beat?.setFilter(700);
        if (taught.active) endTeach(null);
        break;
      case 'stumble':
        Sound.miss(); Sound.tone({ f: 260, dur: 0.25, vol: 0.12, type: 'sine', slideTo: 520 });
        stumbleShow = 0.35;
        pops.add(autoStumble ? 'Crew’s got you!' : 'Keep going!', rx + 40, ry - L.avatarH * 1.05, { color: C.sky, size: L.narrow ? 24 : 30, life: 1 });
        beat?.setFilter(20000);
        break;
      case 'rewind': break; // the screen side is in chooseRewind()
      case 'finish':
        phase = 'finish'; finT = 0; finishX = s.x;
        if (d.early) { // the run clock ran out first: the crew rolls the Showcase out to meet the runner
          earlyFinish = true; stageX = s.x; hopDelay = 0.35;
          pops.add('Crew’s got you!', L.w / 2, L.hudH + (L.groundY - L.hudH) * 0.35, { color: C.yellow, size: L.narrow ? 32 : 42, life: 1.4, rise: 30 });
        }
        Sound.combo(10); Sound.sparkle();
        beat?.setLevel(0.25);
        break;
    }
  }
  function passBurst(ob, colors) {
    particles.burst(sxOf(ob.x, run.s.x), L.groundY - Math.min(ob.h, 1.5) * L.ppm, { n: rm ? 8 : 16, colors, speed: 300, size: 9, shape: 'star', life: 0.7 });
  }
  function jumpFx() {
    jumpFxAt = 0; fx.jump++;
    Sound.jump();
    particles.burst(L.runnerX, L.groundY, { n: 6, colors: ['#FFFFFF', '#EDE4F7'], speed: 140, size: 7, gravity: 300, life: 0.35, angle: Math.PI, spread: 1.2 });
  }
  /** Play a held press's jump sound once it is clearly a tap (not the start of a swipe down). */
  function pendingJumpFx(now) {
    if (!jumpFxAt || now < jumpFxAt) return;
    const swiping = press && !press.up && press.dy > 5 && press.dy > Math.abs(press.dx) && now - press.t0 < FX_MAX;
    if (!swiping) jumpFx();
  }

  // ---------------------------------------------------------------- teaching (ghost hand)
  // The hand hangs below its fingertip (and the one-line label below the hand), so it floats above the
  // obstacle and its records: the kid sees the box coming, the arc to jump through and the hand at once.
  const GHOST_DROP = { tap: 118, swipe: 124 }; // fingertip → bottom of hand + label (swipe: hand at the end of its stroke)
  function teachSpot(ob, type) {
    const { ppm, groundY } = L;
    let top = groundY - art.obstacles[ob.kind].ay;
    const recs = run.world.at(ob.x).records;
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (Math.abs(r.x - ob.x) < 4.5) top = Math.min(top, groundY - (r.y + PHYS.recR) * ppm);
    }
    return {
      x: E.clamp(sxOf(ob.x, run.s.x), 110, L.w - 110),
      y: Math.max(L.hudH + 44, top - 10 - GHOST_DROP[type]),
    };
  }
  function teach(realNow) {
    if (taught.active) {
      if (realNow > teachUntil) { taught.skipId = run.nextObstacle()?.id ?? null; endTeach(null); return; } // let it play out: the crash teaches Run it back
      // follow the obstacle as it creeps in (slow-mo): only when it has moved a few pixels
      const p = teachSpot(taught.ob, taught.g.type);
      if (Math.abs(p.x - taught.g.x) > 3) { taught.g.x = p.x; taught.g.y = p.y; ctx.ghost.show(taught.g); }
      return;
    }
    if (taught.tries >= 3) return;
    const ob = run.nextObstacle();
    if (!ob || !run.isActive(ob) || !ob.teach || ob.id === taught.skipId) return;
    const s = run.s;
    if (ob.teach === 'jump' && !taught.jump && s.ground) {
      const lead = Math.max(1, s.v) * PHYS.jumpV / PHYS.g;
      if (ob.x - s.x <= lead + 1.6) startTeach('jump', ob, { type: 'tap', text: 'Tap to jump' }, realNow);
    } else if (ob.teach === 'slide' && !taught.slide && s.ground) {
      const front = ob.x - ob.hw - (s.x + PHYS.halfW);
      if (front <= 3.4) startTeach('slide', ob, { type: 'swipe', dir: 'down', text: 'Swipe down to slide' }, realNow);
    }
  }
  function startTeach(what, ob, g0, realNow) {
    taught.active = what;
    taught.ob = ob;
    taught.g = { ...g0, ...teachSpot(ob, g0.type) };
    taught.tries++;
    teachUntil = realNow + 5000;
    slowmo = Math.min(slowmo, 0.3);
    ctx.ghost.show(taught.g);
  }
  /** `what` = the move was made. null = the moment passed (after a rewind the ghost shows it again). */
  function endTeach(what) {
    if (what) taught[what] = true;
    taught.active = null;
    taught.ob = null;
    teachUntil = Infinity;
    ctx.ghost.hide();
  }

  // ---------------------------------------------------------------- crash → choice
  function chargeIcons(left) {
    let out = '';
    const used = total - left;
    for (let i = 0; i < total; i++) {
      const isGold = i >= base;
      const spent = isGold ? i - base < used - base : i < Math.min(used, base);
      out += `<span class="dc-ch${isGold ? ' gold' : ''}${spent ? ' used' : ''}">${icon('rewind', isGold ? '#FFD23F' : '#FFFFFF')}</span>`;
    }
    return out;
  }
  function showOverlay() {
    const left = run.charges;
    const goldLeft = Math.max(0, Math.min(gold, left));
    overlayEl = document.createElement('div');
    overlayEl.className = 'dash-crash';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-label', 'Run it back?');
    overlayEl.innerHTML = `<div class="dc-card pop-in">
      <p class="dc-line">Crew’s got you!</p>
      <button type="button" class="btn huge pink dc-back" data-dash="rewind">${icon('rewind')} Run it back</button>
      <div class="dc-charges" aria-label="${left} rewinds left">${chargeIcons(left)}</div>
      ${goldLeft ? `<p class="dc-gold">Gold = your real Rewinds this week</p>` : ''}
      <button type="button" class="btn small white dc-keep" data-dash="keep">Keep going ${icon('next')}</button>
    </div>`;
    ui.appendChild(overlayEl);
    overlayAt = crashT;
    if (!taught.rewind) {
      taught.rewind = true;
      requestAnimationFrame(() => {
        const b = overlayEl?.querySelector('.dc-back');
        if (!b) return;
        // The hand hangs below the fingertip: keep it left of the charge icons so the gold ones and
        // their real-life note stay in view (the first time the link is explained).
        // Layout offsets, not client rects: the card is still popping in (scaled) at this point.
        const at = el => { let x = 0, y = 0; for (let e = el; e && e !== overlayEl; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
        const bp = at(b), first = overlayEl.querySelector('.dc-ch');
        const chargesX = first ? at(first).x : bp.x + b.offsetWidth;
        const x = Math.max(bp.x + 18, Math.min(bp.x + b.offsetWidth * 0.3, chargesX - 46));
        ctx.ghost.show({ type: 'tap', x, y: bp.y + b.offsetHeight * 0.45 });
      });
    }
  }
  function hideOverlay() { overlayEl?.remove(); overlayEl = null; ctx.ghost.hide(); }
  function choose(which) {
    if (phase !== 'crash' || !overlayEl) return;
    if (crashT - overlayAt < ARM) return; // a jump still being mashed can't pick for the kid
    Sound.tap();
    hideOverlay();
    if (which === 'rewind') chooseRewind();
    else { autoStumble = false; run.resolve('keep'); phase = 'run'; }
  }
  function chooseRewind() {
    rewindPath = run.rewindPath();
    const crashT0 = run.pending.t;
    rewFrom = run.s.score;
    run.resolve('rewind');
    rewLost = Math.max(0, rewFrom - run.s.score); // counted down on screen: records back on the street, points to grab again
    rewindBack = crashT0 - run.s.t;
    taught.skipId = null;
    phase = 'rewind'; rewT = 0;
    Sound.tapeRewind();
    beat?.pause();
  }
  function endRewind() {
    phase = 'run';
    rewindPath = null;
    beat?.resume(); beat?.setFilter(20000);
    Sound.combo(6);
    const cb = run.comeback;
    pops.add(cb ? 'Comeback x2!' : 'Run it back!', L.w / 2, L.hudH + (L.groundY - L.hudH) * 0.35, { color: C.yellow, size: L.narrow ? 34 : 46, life: 1.2, rise: 40 });
    particles.burst(L.runnerX, runnerY() - L.avatarH * 0.5, { n: 18, colors: [C.yellow, C.pink, C.sky, C.white], speed: 280, size: 9, shape: 'star', life: 0.7 });
  }

  function onUiDown(e) {
    const b = e.target.closest('[data-dash]');
    if (!b) return;
    e.preventDefault();
    choose(b.dataset.dash);
  }
  ui.addEventListener('pointerdown', onUiDown);

  // ---------------------------------------------------------------- input
  const live = () => phase === 'run' && !paused;
  // A tap jumps on pointerdown, except in the bottom band (road only), where an iPad home-bar swipe
  // starts: there it waits for the release, so a system gesture (pointercancel) never jumps.
  const input = E.pointerInput(view.canvas, {
    onDown: p => {
      if (jumpFxAt) jumpFx(); // a new press: the last one really was a jump
      press = { id: p.id, t0: performance.now(), dx: 0, dy: 0, x0: p.x, y0: p.y, up: false };
      if (live() && p.y < L.h - DEAD) run.jump();
    },
    onMove: p => { if (press?.id === p.id) { press.dx = p.x - press.x0; press.dy = p.y - press.y0; } },
    onTap: p => { if (live() && p.y >= L.h - DEAD) run.jump(); },
    onUp: p => { if (press?.id === p.id) { press.up = true; if (jumpFxAt) jumpFx(); } },
    onSwipe: e => {
      if (!live() || e.dir !== 'down' || e.y <= DEAD || e.y >= L.h - DEAD) return;
      const same = press?.id === e.id; // the press that started this hop: it was a slide all along
      const how = run.slide(same);
      if (same && jumpFxAt) { if (how === 'slam') jumpFx(); else jumpFxAt = 0; } // a cancelled hop never sounds as a jump
    },
  });
  const onKey = e => {
    if (e.repeat || paused) return;
    const k = e.code;
    if (phase === 'crash' && overlayEl) {
      if (k === 'Enter' || k === 'KeyR') { e.preventDefault(); choose('rewind'); }
      else if (k === 'KeyK') { e.preventDefault(); choose('keep'); }
      return;
    }
    if (!live()) return;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') { e.preventDefault(); run.jump(); }
    else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); run.slide(); }
  };
  window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- frame
  function frame(dt) {
    if (paused) return;
    if (frozen) { draw(); return; } // test hook: hold a moment still for a screenshot
    animT += dt;
    collectT = Math.max(0, collectT - dt);
    squash = Math.max(0, squash - dt * 6);
    stretch = Math.max(0, stretch - dt * 5);
    stumbleShow = Math.max(0, stumbleShow - dt);
    bot?.tick(dt);
    pendingJumpFx(performance.now());
    if (phase === 'intro') {
      introT += dt;
      const n = countNow();
      if (n !== lastCount) { lastCount = n; Sound.countdown(n); }
      if (introT >= INTRO && loaded) go();
    } else if (phase === 'run') {
      const realNow = performance.now();
      teach(realNow);
      const target = taught.active ? 0.04 / ctx.speed : 1; // the ghost's slow-mo lasts the same real time at any test speed
      slowmo += (target - slowmo) * Math.min(1, dt * (target < slowmo ? 14 : 6));
      if (!taught.active && slowmo > 0.97) slowmo = 1;
      run.step(dt * slowmo);
      runPhase += dt * slowmo * run.s.v * 0.42;
      if (goldNoteT > 0) goldNoteT -= dt;
    } else if (phase === 'crash') {
      crashT += dt;
      if (crashT > 0.35 && !overlayEl) {
        if (run.charges > 0) showOverlay();
        else { autoStumble = true; run.resolve('keep'); phase = 'run'; }
      }
    } else if (phase === 'rewind') {
      rewT += dt;
      if (freezeAt === 'rewind' && rewT >= REWIND_ANIM * 0.45) { freezeAt = null; frozen = true; }
      else if (rewT >= REWIND_ANIM) endRewind();
    } else if (phase === 'finish') {
      finT += dt;
      if (freezeAt === 'finish' && finT >= 1.1) { freezeAt = null; frozen = true; }
      runPhase += dt * 6;
      if (finT < 1.6 && Math.floor((finT - dt) * 5) !== Math.floor(finT * 5)) {
        const st = sxOf(stageX + 9, cameraX());
        particles.burst(st + (Math.random() - 0.5) * L.ppm * 10, L.groundY - L.ppm * (4 + Math.random() * 2), { n: 18, colors: E.PALETTE, speed: 300, size: 8, shape: Math.random() < 0.5 ? 'star' : 'rect', life: 1.1 });
        Sound.pop();
      }
      if (finT >= FINISH_ANIM) endRound();
    }
    particles.update(dt); pops.update(dt); shake.update(dt);
    const shown = phase === 'rewind' ? Math.round(rewFrom - rewLost * rewindEase()) : run.s.score;
    if (shown !== lastScore) { lastScore = shown; ctx.hud.score(shown); }
    draw();
  }

  function go() {
    phase = 'run';
    Sound.countdown(0);
    pops.add('GO!', L.w / 2, L.hudH + (L.groundY - L.hudH) * 0.4, { color: C.yellow, size: L.narrow ? 48 : 64, life: 0.7, rise: 30 });
    beat = Sound.startBeat({ bpm: 118, loop: true, groove: 1, keyIdx: Math.floor(ctx.rng() * 4), countIn: 0, melody: true });
    beat.setLevel(0.55);
  }

  // ---------------------------------------------------------------- drawing
  function cameraX() {
    if (phase === 'rewind' && rewindPath) return pathAt(rewindEase()).x;
    if (phase === 'finish') return Math.min(finishX + finT * 7, stageX + finishCam(L, crew.length));
    return run.s.x;
  }
  const rewindEase = () => E.ease.inOut(Math.min(1, rewT / REWIND_ANIM));
  function pathAt(p) {
    const n = rewindPath.length - 1;
    const f = p * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    const a = rewindPath[i], b = rewindPath[Math.min(n, i + 1)];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, slide: k < 0.5 ? a.slide : b.slide };
  }

  function draw() {
    const camX = cameraX();
    view.clear();
    g.save();
    shake.apply(g);
    if (phase === 'rewind' && !rm) g.translate((Math.random() - 0.5) * 6, 0);
    drawCity(camX);
    drawStreet(camX);
    drawStage(camX);
    drawCourse(camX);
    drawRunner(camX);
    particles.draw(g);
    pops.draw(g);
    g.restore();
    if (phase === 'rewind') drawVHS();
    drawHud();
    if (phase === 'intro') drawCountdown();
  }

  function drawCity(camX) {
    const { w, ppm, backY, hudH } = L;
    const camPx = camX * ppm;
    const sun = art.sun;
    blit(sun, w - sun.cssW - Math.min(40, w * 0.05), hudH - sun.cssH * 0.18);
    for (let i = 0; i < 4; i++) {
      const c = art.clouds[i % 3];
      const span = w + c.cssW * 2;
      let x = (i * span * 0.37 + 60 - camPx * 0.05 - animT * (rm ? 2 : 7) * (1 + i * 0.2)) % span;
      if (x < 0) x += span;
      blit(c, x - c.cssW, hudH + 14 + ((i * 53) % 3) * (backY - hudH) * 0.12);
    }
    const far = art.far, fw = far.cssW;
    let fx = -((camPx * 0.18) % fw);
    for (; fx < w; fx += fw) blit(far, fx, backY - L.farH);
    const lay = camPx * 0.45, SW = L.unit * 2.05;
    for (let i = Math.floor(lay / SW) - 1; i <= Math.floor((lay + w) / SW) + 1; i++) {
      const b = art.buildings[buildingAt(i)];
      const x = i * SW - lay + noise(seed, i * 7 + 1) * Math.max(0, SW - b.cssW);
      blit(b, x - b.ax, backY - b.ay + 3);
    }
    // street furniture at the back of the sidewalk (never in the runner's way)
    const pp = 0.85, lookBack = L.runnerX / ppm + 3;
    for (let i = Math.floor((camX * pp - lookBack) / 9); i <= Math.ceil((camX * pp + L.lookM + 3) / 9); i++) {
      const r = noise(seed + 99, i);
      if (r < 0.2) continue;
      const spr = r < 0.58 ? art.props.lamp : r < 0.9 ? art.props.tree : art.props.speaker;
      const x = L.runnerX + (i * 9 + noise(seed + 7, i) * 3 - camX * pp) * ppm;
      blit(spr, x - spr.ax, backY + ppm * 0.12 - spr.ay);
    }
  }

  function drawStreet(camX) {
    const { w, h, ppm, backY, groundY, curbY } = L;
    const lw = art.lw;
    g.fillStyle = '#EFE6F8'; g.fillRect(0, backY, w, curbY - backY);
    g.strokeStyle = 'rgba(59,42,74,.13)'; g.lineWidth = 2;
    g.beginPath();
    const x0 = camX - L.runnerX / ppm - 2;
    for (let m = Math.floor(x0 / 2.5) * 2.5; m < camX + L.lookM + 3; m += 2.5) { const sx = sxOf(m, camX); g.moveTo(sx, backY + 2); g.lineTo(sx - ppm * 0.35, curbY); }
    g.stroke();
    g.fillStyle = 'rgba(59,42,74,.07)'; g.fillRect(0, groundY + 2, w, curbY - groundY - 2);
    g.fillStyle = INK; g.fillRect(0, backY - lw / 2, w, lw * 0.8);
    const curbH = Math.max(8, ppm * 0.3);
    g.fillStyle = '#C9C1D6'; g.fillRect(0, curbY, w, curbH);
    g.fillStyle = '#7B6C95'; g.fillRect(0, curbY + curbH, w, h - curbY - curbH);
    g.fillStyle = INK; g.fillRect(0, curbY - lw / 2, w, lw); g.fillRect(0, curbY + curbH - lw / 2, w, lw);
    const roadMid = curbY + curbH + (h - curbY - curbH) * 0.5;
    g.fillStyle = '#FFF6E5';
    for (let m = Math.floor(x0 / 5) * 5; m < camX + L.lookM + 5; m += 5) {
      const sx = sxOf(m, camX);
      E.roundRect(g, sx, roadMid - ppm * 0.09, ppm * 2.2, Math.max(5, ppm * 0.18), 4); g.fill();
    }
    // start line
    const s0 = sxOf(0, camX);
    if (s0 > -ppm && s0 < w + ppm) {
      const sq = (curbY - backY) / 4;
      for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 2; c2++) { g.fillStyle = (r + c2) % 2 ? INK : C.white; g.fillRect(s0 + c2 * sq - sq, backY + r * sq, sq, sq); }
    }
  }

  /** Metres the Showcase still has to roll in (an early finish: it comes out to meet the runner). */
  const stageRoll = () => (earlyFinish ? (1 - E.ease.outCubic(Math.min(1, finT / 0.45))) * (L.lookM + 8) : 0);
  function drawStage(camX) {
    const st = art.stage;
    const at = stageX + stageRoll();
    const sx = sxOf(at + 1, camX);
    if (sx - st.ax > L.w || sx - st.ax + st.cssW < 0) return;
    blit(st, sx - st.ax, L.groundY - st.ay + art.lw);
    const floorY = L.groundY - st.floor;
    const party = phase === 'finish' || camX > stageX - 30;
    crewSpr.forEach((spr, i) => {
      if (!spr) return;
      const cx = sxOf(at + CREW_AT + i * CREW_GAP, camX);
      const hop = party && !rm ? Math.abs(Math.sin(animT * 7 + i * 1.3)) * L.ppm * 0.35 : 0;
      drawPose(g, spr, cx, floorY - hop, { sy: 1 + (party && !rm ? Math.sin(animT * 14 + i) * 0.03 : 0) });
    });
  }

  function drawCourse(camX) {
    const { ppm, groundY } = L;
    const x0 = camX - L.runnerX / ppm - 4, x1 = camX + L.lookM + 4;
    const now = run.s.t;
    const cb = run.comeback, cbLive = cb && cb.left > 0 && now <= cb.until;
    // an early finish: the road past the runner clears for the Showcase rolling in
    const clearFrom = earlyFinish ? stageX + 0.5 : Infinity, clearA = Math.max(0, 1 - finT * 5);
    for (let k = Math.floor(x0 / CHUNK); k <= Math.floor(x1 / CHUNK); k++) {
      const c = run.world.chunk(k);
      for (const o of c.obstacles) {
        if (o.x < x0 || o.x > x1) continue;
        const st = run.status(o);
        if (st === 'off' || st === 'ahead' || (o.x > clearFrom && clearA <= 0)) continue;
        if (o.x > clearFrom) g.globalAlpha = clearA;
        const spr = art.obstacles[o.kind];
        const sx = sxOf(o.x, camX);
        if (st === 'knock') {
          const age = Math.max(0, Math.min(1, (now - run.resolvedAt(o.id)) * 5));
          const a = (o.slide ? 0.5 : 1.35) * age;
          g.save(); g.globalAlpha = 1 - 0.35 * age;
          g.translate(sx + spr.cssW / 2 + age * ppm * 0.4, groundY); g.rotate(a);
          g.drawImage(spr, -spr.cssW, -spr.cssH, spr.cssW, spr.cssH);
          g.restore();
          g.globalAlpha = 1;
          continue;
        }
        let wob = 0;
        if (phase === 'crash' && run.pending?.ob.id === o.id && !rm) wob = Math.sin(animT * 40) * 0.05 * Math.max(0, 1 - crashT * 2);
        if (wob) { g.save(); g.translate(sx, groundY); g.rotate(wob); g.drawImage(spr, -spr.ax, -spr.ay, spr.cssW, spr.cssH); g.restore(); }
        else blit(spr, sx - spr.ax, groundY - spr.ay);
        g.globalAlpha = 1;
      }
      for (const r of c.records) {
        if (r.x < x0 || r.x > x1 || run.isCollected(r.id) || (r.x > clearFrom && clearA <= 0)) continue;
        if (r.x > clearFrom) g.globalAlpha = clearA;
        const spr = r.id % 3 === 0 ? art.recordAlt : art.record;
        const sx = sxOf(r.x, camX), sy = groundY - r.y * ppm;
        const spin = rm ? 1 : 0.3 + 0.7 * Math.abs(Math.cos(animT * 3 + r.id * 0.7));
        if (cbLive && r.x > cb.x) {
          g.beginPath(); g.arc(sx, sy, spr.cssW * 0.62 + Math.sin(animT * 10) * 2, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,210,63,.55)'; g.fill();
        }
        g.drawImage(spr, sx - spr.cssW * spin / 2, sy - spr.cssH / 2, spr.cssW * spin, spr.cssH);
        g.globalAlpha = 1;
      }
    }
  }

  function runnerPose() {
    const s = run.s;
    if (phase === 'finish') return { pose: finT - hopDelay > 0.55 ? 'cheer' : finT < hopDelay ? RUN_FRAMES[Math.floor(runPhase) % 4] : 'jump', x: 0, y: 0 };
    if (phase === 'crash' || stumbleShow > 0) return { pose: 'crash' };
    if (phase === 'rewind' && rewindPath) { const p = pathAt(rewindEase()); return { pose: p.slide ? 'slide' : p.y > 0.05 ? 'jump' : RUN_FRAMES[Math.floor(animT * 14) % 4], y: p.y, slide: p.slide }; }
    if (phase === 'intro') return { pose: 'run1' };
    if (s.slideT > 0) return { pose: 'slide', slide: true };
    if (!s.ground) return { pose: 'jump' };
    return { pose: RUN_FRAMES[Math.floor(runPhase) % 4] };
  }

  function drawRunner(camX) {
    const s = run.s;
    const { ppm, groundY } = L;
    const info = runnerPose();
    let x = L.runnerX, y = groundY - (info.y ?? s.y) * ppm;
    let rot = 0.07, sx = 1, sy = 1;
    const k = rm ? 0.5 : 1;
    if (phase === 'finish') {
      // hop from the street onto the Showcase stage
      const t = E.clamp((finT - hopDelay) / 0.55, 0, 1), sx0 = sxOf(finishX, camX), sx1 = sxOf(stageX + STAGE_HOP, camX);
      x = sx0 + (sx1 - sx0) * E.ease.outCubic(t);
      const floor = art.stage.floor;
      y = groundY - (t < 1 ? floor * t + Math.sin(t * Math.PI) * ppm * 1.8 : floor + Math.abs(Math.sin(finT * 7)) * ppm * (rm ? 0.1 : 0.45));
      rot = 0;
    }
    const lift = (groundY - y) / ppm;
    // shadow
    g.fillStyle = 'rgba(59,42,74,.22)';
    g.beginPath(); g.ellipse(x, phase === 'finish' && finT - hopDelay > 0.55 ? groundY - art.stage.floor : groundY, ppm * 0.6 * Math.max(0.35, 1 - lift / 5), ppm * 0.14 * Math.max(0.35, 1 - lift / 5), 0, 0, Math.PI * 2); g.fill();
    if (info.slide) { rot = -SLIDE_ROT; sx = 1 + 0.08 * k; sy = 1 - 0.06 * k; }
    else if (info.pose === 'jump') {
      const v = phase === 'run' ? s.vy / PHYS.jumpV : 0;
      sy = 1 + Math.max(-0.1, Math.min(0.12, v * 0.12)) * k; sx = 1 / sy; rot = -0.05;
    } else if (info.pose === 'crash') { rot = phase === 'crash' ? -0.28 : Math.sin(animT * 22) * 0.12; }
    else if (phase === 'run' || phase === 'rewind') { const b = Math.abs(Math.sin(runPhase * Math.PI)); y -= b * ppm * 0.08 * k; sy = 1 + 0.03 * k * b; }
    sy *= 1 - squash * 0.24 * k + stretch * 0.16 * k;
    sx *= 1 + squash * 0.24 * k - stretch * 0.1 * k;
    if (s.stumbleT > 0 && phase === 'run') rot += Math.sin(animT * 24) * 0.1 * (s.stumbleT / 1.2) * k;
    const alpha = s.invulnT > 0 && phase === 'run' && !rm ? 0.55 + 0.45 * Math.abs(Math.sin(animT * 18)) : 1;
    const spr = poses?.[info.pose];
    if (spr) drawPose(g, spr, x, y, { sx, sy, rot, alpha });
    else { // still loading: a friendly capsule
      E.roundRect(g, x - L.avatarH * 0.18, y - L.avatarH * 0.8, L.avatarH * 0.36, L.avatarH * 0.8, L.avatarH * 0.18); E.inkFill(g, C.sky, art.lw);
    }
    // dizzy stars after a stumble (or while the crash choice is up)
    if ((s.stumbleT > 0 && phase === 'run') || phase === 'crash') {
      const hx = x, hy = y - L.avatarH * 0.92;
      for (let i = 0; i < 3; i++) {
        const a = animT * (rm ? 1 : 6) + i * 2.1;
        E.starPath(g, hx + Math.cos(a) * ppm * 0.7, hy + Math.sin(a) * ppm * 0.22, Math.max(6, ppm * 0.2));
        E.inkFill(g, C.yellow, 2);
      }
    }
  }

  function drawHud() {
    const { w, narrow } = L;
    // Wide: charges, then the distance meter on the same row. Narrow: the meter on top, the charges under it.
    const pad = 12, cs = narrow ? 26 : 32;
    const mx0 = narrow ? pad : pad + total * (cs + 5) + 16, mx1 = w - pad - 18;
    const my = pad + (narrow ? 0 : 4), mh = narrow ? 24 : 28;
    const cy = narrow ? my + mh + 10 : pad;
    const left = run.charges, used = total - left;
    for (let i = 0; i < total; i++) {
      const isGold = i >= base;
      const spent = isGold ? i - base < used - base : i < Math.min(used, base);
      drawCharge(pad + cs / 2 + i * (cs + 5), cy + cs / 2, cs / 2, isGold, spent);
    }
    // the real-life link, for the first seconds: where the gold charges came from (the caret points at them)
    if (gold > 0 && goldNoteT > 0 && phase !== 'intro') {
      const text = `+${gold} from your real Rewinds!`;
      g.font = `900 ${narrow ? 13 : 16}px ${E.FONT}`;
      const tw = g.measureText(text).width + 20, th = cs - 6;
      const nx = pad + base * (cs + 5), ny = cy + cs + 8;
      g.globalAlpha = Math.min(1, goldNoteT * 2);
      g.beginPath(); g.moveTo(nx + 10, ny + 1); g.lineTo(nx + 18, ny - 7); g.lineTo(nx + 26, ny + 1); E.inkFill(g, C.yellow, 3);
      E.roundRect(g, nx, ny, tw, th, th / 2); E.inkFill(g, C.yellow, 3);
      g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, nx + 10, ny + th / 2 + 1);
      g.globalAlpha = 1;
    }
    const x = phase === 'finish' ? finish : cameraX();
    const p = Math.max(0, Math.min(1, x / finish));
    E.roundRect(g, mx0, my, mx1 - mx0, mh, mh / 2); E.inkFill(g, C.white, 3);
    const fillW = Math.max(mh, (mx1 - mx0) * p);
    E.roundRect(g, mx0, my, fillW, mh, mh / 2); E.inkFill(g, C.mint, 3);
    const togo = Math.max(0, Math.ceil(finish - x));
    E.outlinedText(g, togo > 0 ? `${togo} m${narrow || mx1 - mx0 < 300 ? '' : ' to the Showcase'}` : 'Showcase!', mx1 - mh * 1.1, my + mh / 2 + 1, { size: narrow ? 15 : 17, align: 'right' });
    // the Showcase star at the end, the runner's head on the track
    E.starPath(g, mx1, my + mh / 2, mh * 0.78); E.inkFill(g, C.yellow, 3);
    const hx = mx0 + fillW - mh / 2, hr = mh * 0.78;
    g.save(); g.beginPath(); g.arc(hx, my + mh / 2, hr, 0, Math.PI * 2); g.fillStyle = C.sky; g.fill();
    if (headImg?.naturalWidth) { g.clip(); g.drawImage(headImg, 0, 100, 400, 400, hx - hr, my + mh / 2 - hr, hr * 2, hr * 2); }
    g.restore();
    g.beginPath(); g.arc(hx, my + mh / 2, hr, 0, Math.PI * 2); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    // Comeback Bonus timer
    const cb = run.comeback;
    if (cb && cb.left > 0 && run.s.t <= cb.until && (phase === 'run' || phase === 'crash')) {
      const f = Math.max(0, (cb.until - run.s.t) / COMEBACK_SECS);
      const bw = narrow ? 150 : 190, bh = narrow ? 30 : 36, bx = narrow ? w - pad - bw : pad, by = cy + cs + 10;
      const pulse = rm ? 1 : 1 + Math.sin(animT * 10) * 0.03;
      g.save(); g.translate(bx + bw / 2, by + bh / 2); g.scale(pulse, pulse);
      E.roundRect(g, -bw / 2, -bh / 2, bw, bh, bh / 2); E.inkFill(g, C.yellow, 3);
      E.roundRect(g, -bw / 2 + 6, bh / 2 - 9, (bw - 12) * f, 5, 3); g.fillStyle = C.orange; g.fill();
      E.outlinedText(g, `COMEBACK x2 · ${cb.left}`, 0, -2, { size: narrow ? 15 : 18 });
      g.restore();
    }
  }

  function drawCharge(cx, cy, r, isGold, spent) {
    g.save();
    if (spent) g.globalAlpha = 0.3;
    g.beginPath(); g.arc(cx, cy, r - 1.5, 0, Math.PI * 2); E.inkFill(g, isGold ? C.yellow : C.white, 3);
    g.fillStyle = INK;
    const s = r * 0.42;
    for (const dx of [-s * 0.95, s * 0.15]) { g.beginPath(); g.moveTo(cx + dx + s, cy - s); g.lineTo(cx + dx, cy); g.lineTo(cx + dx + s, cy + s); g.closePath(); g.fill(); }
    g.restore();
  }

  function drawVHS() {
    const { w, h } = L;
    const p = Math.min(1, rewT / REWIND_ANIM);
    g.fillStyle = `rgba(155,107,255,${0.2 * (1 - p * 0.4)})`; g.fillRect(0, 0, w, h);
    g.fillStyle = scanPat; g.fillRect(0, 0, w, h);
    if (!rm) {
      const by = ((animT * 520) % (h + 80)) - 40;
      g.fillStyle = 'rgba(255,255,255,.4)';
      for (let i = 0; i < 7; i++) g.fillRect(((i * 97 + animT * 900) % w) - 40, by + i * 4, 60 + (i * 37) % 120, 2);
    }
    const lx = 20, ly = L.hudH + 22, s = L.narrow ? 12 : 16;
    // the tape arrows blink like a VCR; the label stays put so it can be read
    g.fillStyle = rm || Math.floor(animT * 4) % 2 === 0 ? C.white : C.yellow; g.strokeStyle = INK; g.lineWidth = 3;
    for (const dx of [0, s]) { g.beginPath(); g.moveTo(lx + dx + s, ly - s); g.lineTo(lx + dx, ly); g.lineTo(lx + dx + s, ly + s); g.closePath(); g.fill(); g.stroke(); }
    E.outlinedText(g, `REWIND  -${Math.round(rewindBack)}s`, lx + s * 2 + 12, ly + 1, { size: L.narrow ? 20 : 26, align: 'left' });
    // the score counts down in the HUD as the records go back on the street: say what that means
    if (rewLost > 0) E.outlinedText(g, `+${rewLost} to grab again!`, lx, ly + s + (L.narrow ? 22 : 28), { size: L.narrow ? 17 : 22, align: 'left', color: C.yellow });
  }

  function countNow() { return Math.max(1, 3 - Math.floor(introT / (INTRO / 3))); }
  function drawCountdown() {
    const n = countNow();
    const k = (introT / (INTRO / 3)) % 1;
    const sc = rm ? 1 : 1 + (1 - Math.min(1, k * 3)) * 0.4;
    E.outlinedText(g, String(n), L.w / 2, L.hudH + (L.groundY - L.hudH) * 0.42, { size: (L.narrow ? 70 : 96) * sc, color: C.yellow });
    if (!loaded) E.outlinedText(g, 'Lacing up…', L.w / 2, L.hudH + (L.groundY - L.hudH) * 0.62, { size: 20 });
  }

  // ---------------------------------------------------------------- end
  function result() {
    const r = run.result();
    const kindName = k => KINDS[k]?.name || 'obstacle';
    const best = r.comebackRecords > 0 ? `Comeback Bonus x2 on ${r.comebackRecords} record${r.comebackRecords > 1 ? 's' : ''}!`
      : r.repairs > 0 ? `Ran it back and cleared the ${kindName(r.repairedKinds[r.repairedKinds.length - 1])}!`
        : r.rewinds > 0 ? 'You ran it back and kept going!'
          : r.bestStreak >= 5 ? `${r.bestStreak} clean moves in a row!`
            : r.records > 0 ? `${plural(r.records, 'record')} on the way to the Showcase!` : 'All the way to the Showcase!';
    const chips = endChips(r).join('');
    const link = gold ? `<p class="dash-gold">${icon('rewind', '#FFD23F')} Your real-life Rewinds gave you +${gold} gold charge${gold > 1 ? 's' : ''}</p>` : '';
    return {
      score: r.score,
      best,
      crew: { rewinds: r.rewinds },
      title: r.finished ? 'Made it to the Showcase!' : 'What a run!',
      extra: `${chips ? `<div class="dash-sum">${chips}</div>` : ''}${link}`,
    };
  }
  function endRound() {
    if (ended) return;
    ended = true;
    beat?.stop(); beat = null;
    ctx.ghost.hide();
    ctx.end(result());
  }

  // ---------------------------------------------------------------- autoplay (tests)
  // Drives the real input path: PointerEvents on the play surface and the crash buttons.
  // It crashes on purpose now and then, runs it back (and once keeps going).
  function makeBot() {
    const plan = new Set([2, 5, 8, 12]);
    const order = new Map();
    const skipIds = new Set();
    let pid = 700, wait = 0, picks = 0;
    const skip = ob => {
      if (!order.has(ob.id)) { order.set(ob.id, order.size); if (plan.has(order.get(ob.id))) skipIds.add(ob.id); }
      return skipIds.has(ob.id) && !run.wasCrashed(ob.id);
    };
    const fire = (el, type, x, y, id) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    };
    return {
      tick(dt) {
        if (phase === 'crash' && overlayEl) {
          wait += dt;
          if (wait < 0.6) return;
          wait = 0;
          const b = overlayEl.querySelector(picks++ === 1 ? '[data-dash=keep]' : '[data-dash=rewind]');
          const r = b.getBoundingClientRect();
          fire(b, 'pointerdown', r.width / 2, r.height / 2, pid++);
          return;
        }
        if (phase !== 'run') return;
        const a = botAction(run, { skip });
        const cv = view.canvas, cx = L.w * 0.6, cy = L.h * 0.5;
        if (a === 'jump' && run.s.bufferT <= 0) { const id = pid++; fire(cv, 'pointerdown', cx, cy, id); fire(cv, 'pointerup', cx, cy, id); }
        else if (a === 'slide') { const id = pid++; fire(cv, 'pointerdown', cx, cy - 40, id); fire(cv, 'pointermove', cx, cy + 40, id); fire(cv, 'pointerup', cx, cy + 40, id); }
      },
    };
  }

  const api = {
    get phase() { return phase; }, get run() { return run; }, get layout() { return L; },
    charges: { total, base, gold }, taught, fx, pace: { speedScale, finish },
    freeze(on) { frozen = !!on; if (!on && taught.active) teachUntil = performance.now() + 5000; }, // like resume(): the lesson gets its full moment
    /** Test hook: hold still at the next moment of this kind ('rewind': halfway through the VHS rewind; 'finish': on the stage). */
    freezeOn(what) { freezeAt = what; },
    get frozen() { return frozen; },
    /** Test hook: where the obstacle being taught is on screen (host CSS px), or null. */
    teachBox() {
      const ob = taught.ob;
      if (!ob) return null;
      const spr = art.obstacles[ob.kind], x = sxOf(ob.x, run.s.x);
      return { left: x - spr.ax, top: L.groundY - spr.ay, right: x - spr.ax + spr.cssW, bottom: L.groundY - spr.ay + spr.cssH };
    },
  };
  window.__dash = api;

  return {
    start() { stopLoop = E.startLoop(frame); },
    pause() {
      if (paused) return;
      paused = true;
      stopLoop?.(); stopLoop = null;
      beat?.pause();
    },
    resume() {
      if (!paused || ended) return;
      paused = false;
      if (taught.active) teachUntil = performance.now() + 5000; // a pause mid-lesson restarts the ghost's moment
      if (phase !== 'rewind') beat?.resume();
      stopLoop = E.startLoop(frame);
    },
    finish() { endRound(); },
    destroy() {
      stopLoop?.(); stopLoop = null;
      input.destroy();
      window.removeEventListener('keydown', onKey);
      ui.removeEventListener('pointerdown', onUiDown);
      beat?.stop(); beat = null;
      view.destroy();
      ui.remove();
      host.classList.remove('dash-host');
      host.style.background = '';
      if (window.__dash === api) window.__dash = null;
    },
    hint() {
      const hr = host.getBoundingClientRect();
      if (phase === 'crash' && overlayEl) {
        const b = overlayEl.querySelector('[data-dash=rewind]').getBoundingClientRect();
        return { type: 'tap', x: b.left + b.width / 2, y: b.top + b.height / 2 };
      }
      const a = phase === 'run' ? botAction(run) : null;
      if (a === 'jump') return { type: 'tap', x: hr.left + hr.width * 0.6, y: hr.top + hr.height / 2 };
      if (a === 'slide') return { type: 'swipe', x: hr.left + hr.width * 0.6, y: hr.top + hr.height * 0.4, dx: 0, dy: 80 };
      return { type: 'wait', ms: 16 };
    },
    autoplay() { bot = makeBot(); return true; },
  };
}

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** End-card chips for a run result: only counts above zero (a tough run is never shown a 0). */
export function endChips(r) {
  const moves = r.cleans + r.repairs;
  return [
    r.records > 0 ? `<span class="tag">${recordIcon()} ${plural(r.records, 'record')}</span>` : '',
    moves > 0 ? `<span class="tag mint">${icon('star')} ${plural(moves, 'clean move')}</span>` : '',
    r.rewinds > 0 ? `<span class="tag grape">${icon('rewind')} Ran it back ×${r.rewinds}</span>` : '',
  ].filter(Boolean);
}

function recordIcon() {
  return `<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="#2B2233" stroke="#3B2A4A" stroke-width="3.5"/><circle cx="24" cy="24" r="12" fill="none" stroke="#54456A" stroke-width="2"/><circle cx="24" cy="24" r="7" fill="#FF7AB6" stroke="#3B2A4A" stroke-width="2.5"/><circle cx="24" cy="24" r="1.8" fill="#3B2A4A"/></svg>`;
}
