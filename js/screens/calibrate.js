// Beat tuning (#/calibrate/<encoded return path>): tap along with 12 clicks so the rhythm games
// line up with this iPad's audio. Taps are timed with rhythm.judge — the same clock the games
// use — so the saved offset means exactly what the games need. Stored per device; never costs a
// ticket and never counts toward the daily Arcade time.
import * as Sound from '../sound.js';
import { el, icon, actions, go, reducedMotion } from '../ui.js';
import { startRhythm } from '../games/rhythm.js';
import { setOffset } from '../games/calibration.js';
import { evaluateTaps, tapDiff, TUNE } from '../games/beat-tune.js';
import { SPEED } from '../games/engine.js';

// Only ever return to an in-app route.
const safeBack = back => (/^\/[\w\-/%.]*$/.test(back || '') ? back : '/home');

export default function calibrate(root, back = '') {
  const to = '#' + safeBack(back);
  const rm = reducedMotion();
  const screen = el(`<main class="screen cal">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="title"><h1>Tune the beat</h1><div class="sub">Just for this iPad · about 10 seconds</div></div>
    </header>
    <section class="cal-stage panel sky-l" data-phase="idle">
      <p class="cal-line" aria-live="polite">Tap the big circle on every click.</p>
      <button class="cal-pad" type="button" aria-label="Tap on the beat"><span class="cal-ring"></span>${icon('note', '#fff')}</button>
      <div class="cal-dots" aria-hidden="true">${'<i></i>'.repeat(TUNE.clicks)}</div>
      <div class="cal-actions"><button class="btn huge pink" data-act="begin">${icon('play')} Start</button></div>
    </section>
  </main>`);
  root.appendChild(screen);
  const stage = screen.querySelector('.cal-stage');
  const line = screen.querySelector('.cal-line');
  const pad = screen.querySelector('.cal-pad');
  const dots = [...screen.querySelectorAll('.cal-dots i')];
  const acts = screen.querySelector('.cal-actions');

  let rhythm = null, raf = 0, phase = 'idle', lastClick = null, taps = [], backTimer = 0, gone = false;
  const setPhase = ph => { phase = ph; stage.dataset.phase = ph; };

  function begin() {
    if (phase === 'run' || phase === 'wait') return;
    Sound.unlock();
    setPhase('wait');
    taps = [];
    lastClick = null;
    dots.forEach(d => (d.className = ''));
    line.textContent = Sound.isEnabled() ? 'Get ready… tap on every click.' : 'Sound is off, so tap with the flashing circle.';
    acts.innerHTML = '';
    // Give the iPad's audio a moment to wake up (never more than 0.4 s).
    const t0 = performance.now();
    const go2 = () => {
      if (gone) return;
      if (SPEED === 1 && Sound.hasAudio() && !Sound.contextRunning() && performance.now() - t0 < 400) { setTimeout(go2, 30); return; }
      rhythm = startRhythm({ bpm: TUNE.bpm, bars: 0, countIn: TUNE.clicks, melody: false, calibrate: false });
      setPhase('run');
      raf = requestAnimationFrame(frame);
    };
    go2();
  }

  // Clicks sit on beats −12 … −1 of the rhythm clock (its count-in).
  function frame() {
    if (gone || phase !== 'run') return;
    const b = rhythm.beatAt(rhythm.now());
    const k = Math.floor(b);
    if (k >= -TUNE.clicks && k < 0 && k !== lastClick) {
      lastClick = k;
      const i = k + TUNE.clicks;
      dots[i]?.classList.add('beat');
      pad.classList.remove('flash'); void pad.offsetWidth; pad.classList.add('flash');
      if (!rm) pad.animate?.([{ transform: 'scale(1.07)' }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
      if (i === 0) line.textContent = 'Tap with the clicks…';
    }
    if (b > 0.6) return finish();
    raf = requestAnimationFrame(frame);
  }

  // No tap sound on purpose: hearing your own tap (late, through the speaker) would pull the timing.
  function onTap(e) {
    e.preventDefault();
    if (phase !== 'run') return;
    const b = rhythm.beatAt(rhythm.judge(e));
    taps.push(tapDiff(b));
    dots[Math.max(-TUNE.clicks, Math.min(-1, Math.round(b))) + TUNE.clicks]?.classList.add('tap');
    if (!rm) pad.animate?.([{ transform: 'scale(.94, .9)' }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.3, 1.8, .5, 1)' });
  }

  function finish() {
    rhythm?.stop();
    const r = evaluateTaps(taps);
    if (r.ok && Number.isFinite(r.offset)) {
      setOffset(r.offset);
      setPhase('tuned');
      line.innerHTML = `<b class="cal-tuned">Tuned!</b>`;
      acts.innerHTML = `<button class="btn pink" data-act="back">${icon('check')} Back to the beat</button>`;
      Sound.unlockSfx();
      backTimer = setTimeout(() => { if (!gone) go(to); }, 1600);
    } else {
      setPhase('again');
      line.textContent = 'Let’s run it back — tap right on each click.';
      acts.innerHTML = `<button class="btn huge pink" data-act="begin">${icon('rewind')} Run it back</button>
        <button class="linkish" data-act="back">Skip for now</button>`;
      Sound.soft();
    }
  }

  pad.addEventListener('pointerdown', onTap);
  const noMenu = e => e.preventDefault();
  pad.addEventListener('contextmenu', noMenu);
  pad.style.touchAction = 'none';

  // Test hook: taps the pad (real PointerEvents) `lag` seconds after each click, ± `jitter`.
  const hook = window.__calibrate = {
    get phase() { return phase; },
    get taps() { return taps.slice(); },
    autoplay(lag = 0.04, jitter = 0) {
      if (phase === 'idle' || phase === 'again') begin();
      let i = 0;
      const fire = () => {
        const b = pad.getBoundingClientRect();
        pad.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 90 + i, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, cancelable: true, pointerType: 'touch' }));
      };
      const next = () => {
        if (gone || i >= TUNE.clicks) return;
        if (phase !== 'run') { setTimeout(next, 20); return; }
        const target = rhythm.timeOf(i - TUNE.clicks) + lag + (i % 2 ? jitter : -jitter);
        const wait = (target - rhythm.now()) / SPEED * 1000;
        if (wait > 2) { setTimeout(next, Math.max(0, wait - 1)); return; }
        fire();
        i++;
        next();
      };
      next();
      return true;
    },
  };

  const off = actions(screen, {
    back: () => go(to),
    begin: () => begin(),
  });
  return () => {
    gone = true;
    off();
    cancelAnimationFrame(raf);
    clearTimeout(backTimer);
    rhythm?.stop();
    pad.removeEventListener('pointerdown', onTap);
    pad.removeEventListener('contextmenu', noMenu);
    if (window.__calibrate === hook) window.__calibrate = null;
  };
}
