// Shared, dependency-free game helpers for the Arcade:
// canvas (DPR-aware), a frame loop, a test-speed clock, pointer gestures (tap / hold / swipe,
// multi-touch safe), particles, floating text pops, screen shake and cartoon drawing helpers.
import { avatarSVG } from '../avatar.js';
import { reducedMotion } from '../ui.js';

export const INK = '#3B2A4A';
export const COLORS = {
  yellow: '#FFD23F', pink: '#FF7AB6', sky: '#5CC8FF', mint: '#5EE0B0', grape: '#9B6BFF', orange: '#FF9F43',
  cream: '#FFF6E5', white: '#FFFFFF', ink: INK,
};
export const PALETTE = [COLORS.yellow, COLORS.pink, COLORS.sky, COLORS.mint, COLORS.grape, COLORS.orange];

// ---------------------------------------------------------------- clock
/** Test hook: `?speed=3` runs game clocks 3× faster (headless playthroughs). Real play = 1. */
export const SPEED = (() => {
  try {
    const v = Number(new URLSearchParams(location.search).get('speed'));
    return v > 0 && v <= 8 ? v : 1;
  } catch { return 1; }
})();

/** A pausable clock in seconds, scaled by SPEED. */
export function createClock() {
  let base = performance.now();
  let pausedAt = null;
  let offset = 0;
  return {
    now() { const t = pausedAt ?? performance.now(); return ((t - base - offset) / 1000) * SPEED; },
    pause() { if (pausedAt == null) pausedAt = performance.now(); },
    resume() { if (pausedAt != null) { offset += performance.now() - pausedAt; pausedAt = null; } },
    get paused() { return pausedAt != null; },
  };
}

// ---------------------------------------------------------------- canvas + loop
/**
 * A canvas that fills `host` and keeps its backing store at devicePixelRatio (capped at 2 for
 * iPad performance). Draw in CSS pixels; `view.w` / `view.h` are the CSS size.
 */
export function createCanvas(host, { maxDpr = 2 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  host.appendChild(canvas);
  const g = canvas.getContext('2d');
  const view = { canvas, g, w: 1, h: 1, dpr: 1, onResize: null };
  const resize = () => {
    // clientWidth ignores CSS transforms (e.g. the screen's entry animation), unlike getBoundingClientRect.
    view.w = Math.max(1, host.clientWidth);
    view.h = Math.max(1, host.clientHeight);
    view.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    view.onResize?.(view);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  // Safari keeps a global canvas-memory budget: release the backing store explicitly.
  view.destroy = () => { ro.disconnect(); canvas.width = 0; canvas.height = 0; canvas.remove(); };
  view.clear = color => { g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); if (color) { g.fillStyle = color; g.fillRect(0, 0, view.w, view.h); } else g.clearRect(0, 0, view.w, view.h); };
  return view;
}

/** requestAnimationFrame loop. `step(dt, t)` gets seconds (dt clamped to 1/20 so tab switches don't jump). */
export function startLoop(step) {
  let raf = 0;
  let last = performance.now();
  let running = true;
  const frame = now => {
    if (!running) return;
    // The first rAF timestamp can precede the performance.now() taken at start: never step backwards.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) * SPEED;
    last = now;
    step(dt, now / 1000);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { running = false; cancelAnimationFrame(raf); };
}

// ---------------------------------------------------------------- input
/**
 * Pointer gestures on an element, safe for several fingers at once (co-op).
 * Handlers receive { x, y, id, t } in element CSS pixels (t = performance.now()/1000).
 *   onDown  – every press, instantly (use for rhythm hits)
 *   onTap   – quick press + release without much movement
 *   onHoldStart / onHold(e, heldSeconds) / onHoldEnd(e, heldSeconds) – press held ≥ holdAfter
 *   onSwipe – { dir: 'up'|'down'|'left'|'right', dx, dy } once movement passes `swipeDist`
 *   onUp    – every release
 */
export function pointerInput(el, h = {}, { swipeDist = 28, holdAfter = 0.18, tapMax = 0.3 } = {}) {
  const active = new Map();
  const pos = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const nowS = () => performance.now() / 1000;
  let holdTimer = 0;
  const down = e => {
    e.preventDefault();
    try { el.setPointerCapture?.(e.pointerId); } catch { /* synthetic events */ }
    const p = { ...pos(e), id: e.pointerId, t: nowS() };
    active.set(e.pointerId, { start: p, last: p, swiped: false, holding: false });
    h.onDown?.(p, e);
  };
  const move = e => {
    const a = active.get(e.pointerId);
    if (!a) return;
    const p = { ...pos(e), id: e.pointerId, t: nowS() };
    a.last = p;
    const dx = p.x - a.start.x, dy = p.y - a.start.y;
    if (!a.swiped && Math.hypot(dx, dy) >= swipeDist) {
      a.swiped = true;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      h.onSwipe?.({ ...a.start, dir, dx, dy, id: e.pointerId, t: p.t }, e);
    }
    h.onMove?.(p, e);
  };
  const up = e => {
    const a = active.get(e.pointerId);
    if (!a) return;
    active.delete(e.pointerId);
    // pointercancel (iOS system gesture) is a neutral release: no tap, no swipe — games treat it kindly.
    const p = { ...pos(e), id: e.pointerId, t: nowS(), cancelled: e.type === 'pointercancel' };
    if (p.cancelled) { if (a.holding) h.onHoldEnd?.(p, p.t - a.start.t, e); h.onUp?.(p, p.t - a.start.t, e); return; }
    const held = p.t - a.start.t;
    if (a.holding) h.onHoldEnd?.(p, held, e);
    else if (!a.swiped && held <= tapMax) h.onTap?.(p, e);
    h.onUp?.(p, held, e);
  };
  // Hold detection runs on a timer so it fires even if the finger doesn't move.
  const tick = () => {
    const t = nowS();
    for (const a of active.values()) {
      const held = t - a.start.t;
      if (!a.swiped && !a.holding && held >= holdAfter) { a.holding = true; h.onHoldStart?.(a.start, held); }
      if (a.holding) h.onHold?.(a.last, held);
    }
    holdTimer = requestAnimationFrame(tick);
  };
  holdTimer = requestAnimationFrame(tick);
  guardSurface(el);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  const noMenu = e => e.preventDefault();
  el.addEventListener('contextmenu', noMenu);
  return {
    active,
    destroy() {
      cancelAnimationFrame(holdTimer);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
      el.removeEventListener('contextmenu', noMenu);
    },
  };
}

/**
 * Make an element a safe play surface on iPad: no scrolling/zoom, no long-press callout or text
 * selection, no pinch-zoom from two players' fingers.
 */
export function guardSurface(el) {
  el.style.touchAction = 'none';
  el.style.webkitTouchCallout = 'none';
  el.style.webkitUserSelect = 'none';
  el.style.userSelect = 'none';
  if (!el.__guarded) {
    el.__guarded = true;
    const stop = e => e.preventDefault();
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    el.addEventListener('touchmove', stop, { passive: false });
  }
}

// ---------------------------------------------------------------- juice
export function createParticles(max = 400) {
  const list = [];
  const rm = reducedMotion();
  return {
    list,
    /** Burst of confetti-ish particles at x,y. */
    burst(x, y, { n = 14, colors = PALETTE, speed = 260, size = 7, gravity = 600, life = 0.7, shape = 'circle', spread = Math.PI * 2, angle = -Math.PI / 2 } = {}) {
      const count = rm ? Math.ceil(n / 3) : n;
      for (let i = 0; i < count && list.length < max; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.4 + Math.random() * 0.8);
        list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity, life, age: 0, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], shape, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
      }
    },
    /** A quick ring "spark" at a hit. */
    ring(x, y, { color = COLORS.white, r = 30, life = 0.35 } = {}) {
      list.push({ x, y, ring: true, r0: r * 0.4, r1: r, color, life, age: 0 });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) { list.splice(i, 1); continue; }
        if (!p.ring) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      }
    },
    draw(g) {
      for (const p of list) {
        const k = 1 - p.age / p.life;
        g.globalAlpha = Math.max(0, k);
        if (p.ring) {
          g.strokeStyle = p.color; g.lineWidth = 5 * k;
          g.beginPath(); g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - k), 0, Math.PI * 2); g.stroke();
          continue;
        }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.color; g.strokeStyle = INK; g.lineWidth = 2;
        if (p.shape === 'star') { starPath(g, 0, 0, p.size, p.size * 0.5); g.fill(); g.stroke(); }
        else if (p.shape === 'rect') { g.fillRect(-p.size / 2, -p.size * 0.7, p.size, p.size * 1.4); g.strokeRect(-p.size / 2, -p.size * 0.7, p.size, p.size * 1.4); }
        else { g.beginPath(); g.arc(0, 0, p.size / 2, 0, Math.PI * 2); g.fill(); g.stroke(); }
        g.restore();
      }
      g.globalAlpha = 1;
    },
    clear() { list.length = 0; },
  };
}

/** Floating text ("Perfect!", "+50", "Combo x4") that pops, rises and fades. */
export function createPops() {
  const list = [];
  return {
    add(text, x, y, { color = COLORS.white, size = 30, life = 0.8, rise = 60 } = {}) { list.push({ text, x, y, color, size, life, rise, age: 0 }); },
    update(dt) { for (let i = list.length - 1; i >= 0; i--) { list[i].age += dt; if (list[i].age >= list[i].life) list.splice(i, 1); } },
    draw(g) {
      for (const p of list) {
        const k = p.age / p.life;
        const s = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15));
        g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        outlinedText(g, p.text, p.x, p.y - p.rise * k, { size: p.size * s, color: p.color });
      }
      g.globalAlpha = 1;
    },
  };
}

/** Light screen shake (disabled under prefers-reduced-motion). apply(g) before drawing the world. */
export function createShake() {
  const rm = reducedMotion();
  let amt = 0;
  return {
    add(a) { if (!rm) amt = Math.min(14, amt + a); },
    update(dt) { amt = Math.max(0, amt - dt * 40); },
    offset() { return amt ? { x: (Math.random() - 0.5) * amt, y: (Math.random() - 0.5) * amt } : { x: 0, y: 0 }; },
    apply(g) { if (!amt) return; const o = this.offset(); g.translate(o.x, o.y); },
  };
}

// ---------------------------------------------------------------- drawing helpers
export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Filled shape with the chunky ink outline used everywhere in the game. */
export function inkFill(g, fill, lw = 4) {
  g.fillStyle = fill; g.fill();
  g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
}

export function starPath(g, cx, cy, r, inner = r * 0.48, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    g.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  g.closePath();
}

export const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';

/** White text with a thick ink outline, like the DOM `.outline-text`. */
export function outlinedText(g, text, x, y, { size = 28, color = COLORS.white, align = 'center', baseline = 'middle', weight = 900 } = {}) {
  g.font = `${weight} ${Math.round(size)}px ${FONT}`;
  g.textAlign = align; g.textBaseline = baseline;
  g.lineJoin = 'round';
  g.lineWidth = Math.max(4, size / 5);
  g.strokeStyle = INK; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}

// ---------------------------------------------------------------- avatars on canvas
const imgCache = new Map();
/**
 * The player's SVG avatar as an <img> for drawImage (cached). Resolves when decoded.
 * opts: { expr, crop } as in avatarSVG. Image is 200×300 (or the crop's box).
 */
export function avatarImage(avatar, opts = {}) {
  const key = JSON.stringify([avatar, opts.expr || 'happy', opts.crop || '']);
  if (imgCache.has(key)) return imgCache.get(key);
  const svg = avatarSVG(avatar, { ...opts, cls: '' }).replace('<svg ', '<svg width="400" height="600" ');
  const img = new Image();
  const p = new Promise(res => { img.onload = () => res(img); img.onerror = () => res(img); });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  imgCache.set(key, p);
  return p;
}

/** Draw an avatar image with squash & stretch around its feet (x = centre, y = feet). */
export function drawAvatar(g, img, x, y, h, { sx = 1, sy = 1, rot = 0, flip = false, alpha = 1 } = {}) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const w = h * (2 / 3);
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(rot);
  g.scale((flip ? -1 : 1) * sx, sy);
  g.drawImage(img, -w / 2, -h * (286 / 300), w, h);
  g.restore();
}

// ---------------------------------------------------------------- misc
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = { outBack: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2), outCubic: t => 1 - Math.pow(1 - t, 3), inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 };
/** Seeded random (mulberry32) so charts/levels are reproducible in tests. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
