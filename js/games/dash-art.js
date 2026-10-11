// City Dash art: original cartoon city drawn once into small offscreen canvases (sprites) whenever
// the play area changes size, so a frame is only a handful of drawImage calls.
// Every function here touches the DOM only when called (the module imports cleanly in Node).
import { INK, COLORS, roundRect, inkFill, starPath, outlinedText } from './engine.js';
import { KINDS, noise } from './dash-logic.js';
import { avatarSVG } from '../avatar.js';

const C = COLORS;
const LIGHT = ['#FFD9EA', '#FFF0B3', '#D2F7E8', '#D4F0FF', '#FFE4C9', '#E8DEFF'];
const BOLD = ['#FF7AB6', '#FFD23F', '#5EE0B0', '#5CC8FF', '#FF9F43', '#9B6BFF'];
export const VINYL = '#2B2233';

/** An offscreen canvas at device resolution; draw(g, w, h) works in CSS pixels. */
export function sprite(w, h, dpr, draw) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g, w, h);
  c.cssW = w; c.cssH = h;
  return c;
}

const lwFor = ppm => Math.max(2.5, Math.min(4.5, ppm * 0.09));

// ---------------------------------------------------------------- street furniture + obstacles
function boxShape(g, x, y, w, h, lw, fill = '#E9B27A') {
  roundRect(g, x, y, w, h, Math.min(w, h) * 0.1); inkFill(g, fill, lw);
  g.strokeStyle = INK; g.lineWidth = lw * 0.6;
  g.beginPath(); g.moveTo(x + lw, y + h * 0.24); g.lineTo(x + w - lw, y + h * 0.24); g.stroke();
  g.fillStyle = '#FFF0B3'; g.fillRect(x + w * 0.42, y + lw * 0.6, w * 0.16, h * 0.24 - lw * 0.6);
  g.strokeRect(x + w * 0.42, y + lw * 0.6, w * 0.16, h * 0.24 - lw * 0.6);
  starPath(g, x + w * 0.72, y + h * 0.62, Math.min(w, h) * 0.14); inkFill(g, C.pink, lw * 0.5);
  g.beginPath(); g.moveTo(x + w * 0.16, y + h * 0.5); g.lineTo(x + w * 0.36, y + h * 0.5); g.moveTo(x + w * 0.16, y + h * 0.64); g.lineTo(x + w * 0.3, y + h * 0.64);
  g.strokeStyle = 'rgba(59,42,74,.35)'; g.lineWidth = lw * 0.5; g.stroke();
}

const OBSTACLE_ART = {
  box(g, w, h, lw) { boxShape(g, lw, lw, w - 2 * lw, h - 2 * lw, lw); },
  crates(g, w, h, lw) {
    const cw = (w - 2 * lw) / 2;
    for (let i = 0; i < 2; i++) {
      const x = lw + i * cw;
      roundRect(g, x, lw, cw, h - 2 * lw, cw * 0.08); inkFill(g, i ? '#D98E47' : '#E8A15A', lw);
      g.strokeStyle = INK; g.lineWidth = lw * 0.55;
      g.beginPath(); g.moveTo(x + lw, lw * 2); g.lineTo(x + cw - lw, h - lw * 2); g.moveTo(x + cw - lw, lw * 2); g.lineTo(x + lw, h - lw * 2); g.stroke();
      g.strokeRect(x + cw * 0.12, lw + (h - 2 * lw) * 0.12, cw * 0.76, (h - 2 * lw) * 0.76);
    }
  },
  cone(g, w, h, lw) {
    const base = h * 0.14;
    roundRect(g, lw, h - base - lw, w - 2 * lw, base, base * 0.4); inkFill(g, '#E0782A', lw);
    g.beginPath();
    g.moveTo(w * 0.16, h - base - lw); g.lineTo(w * 0.42, lw * 1.2); g.quadraticCurveTo(w * 0.5, 0, w * 0.58, lw * 1.2); g.lineTo(w * 0.84, h - base - lw); g.closePath();
    inkFill(g, C.orange, lw);
    g.save(); g.clip();
    g.fillStyle = C.white;
    g.fillRect(0, h * 0.28, w, h * 0.13); g.fillRect(0, h * 0.56, w, h * 0.13);
    g.restore();
    g.beginPath();
    g.moveTo(w * 0.16, h - base - lw); g.lineTo(w * 0.42, lw * 1.2); g.quadraticCurveTo(w * 0.5, 0, w * 0.58, lw * 1.2); g.lineTo(w * 0.84, h - base - lw); g.closePath();
    g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
  },
  hurdle(g, w, h, lw) {
    const legW = Math.max(lw * 2.2, w * 0.1), barH = h * 0.2;
    for (const x of [w * 0.14, w * 0.86 - legW]) {
      roundRect(g, x, barH * 0.6, legW, h - barH * 0.6 - lw * 2, legW * 0.4); inkFill(g, C.white, lw);
      roundRect(g, x - legW * 0.8, h - lw * 3.2, legW * 2.6, lw * 2.4, lw); inkFill(g, C.grape, lw * 0.8);
    }
    roundRect(g, lw, lw, w - 2 * lw, barH, barH * 0.45);
    g.save(); g.clip();
    g.fillStyle = C.pink; g.fillRect(0, 0, w, h);
    g.fillStyle = C.white;
    for (let x = -barH; x < w; x += barH * 1.6) { g.beginPath(); g.moveTo(x, lw + barH); g.lineTo(x + barH * 0.8, lw); g.lineTo(x + barH * 1.4, lw); g.lineTo(x + barH * 0.6, lw + barH); g.fill(); }
    g.restore();
    roundRect(g, lw, lw, w - 2 * lw, barH, barH * 0.45); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
  },
  /** Banner: two poles and a pennant sign whose points stop at `bottom` metres. */
  banner(g, w, h, lw, ppm) {
    const pole = Math.max(lw * 2, ppm * 0.16);
    const top = h - 3.95 * ppm, signTop = h - 3.45 * ppm, signBot = h - 1.95 * ppm, tips = h - 1.5 * ppm;
    for (const x of [lw, w - lw - pole]) {
      roundRect(g, x, top, pole, h - top - lw, pole / 2); inkFill(g, '#8C7BA6', lw);
      g.beginPath(); g.arc(x + pole / 2, top, pole * 0.9, 0, Math.PI * 2); inkFill(g, C.yellow, lw);
    }
    const x0 = lw + pole * 0.6, x1 = w - lw - pole * 0.6;
    g.beginPath();
    g.moveTo(x0, signTop); g.lineTo(x1, signTop); g.lineTo(x1, signBot);
    const n = 5, step = (x1 - x0) / n;
    for (let i = n; i > 0; i--) { g.lineTo(x0 + step * (i - 0.5), tips); g.lineTo(x0 + step * (i - 1), signBot); }
    g.closePath();
    inkFill(g, C.pink, lw);
    g.fillStyle = C.yellow;
    for (let i = 0; i < n; i++) { g.beginPath(); g.moveTo(x0 + step * i + step * 0.2, signBot + lw); g.lineTo(x0 + step * (i + 0.5), tips - lw * 2.2); g.lineTo(x0 + step * (i + 1) - step * 0.2, signBot + lw); g.fill(); }
    const cy = (signTop + signBot) / 2;
    for (let i = 0; i < 3; i++) { starPath(g, x0 + (x1 - x0) * (0.2 + i * 0.3), cy, (signBot - signTop) * 0.26); inkFill(g, i === 1 ? C.yellow : C.white, lw * 0.6); }
  },
};

/** Obstacle sprite; anchor = bottom centre on the ground line. */
export function obstacleSprite(kind, ppm, dpr) {
  const K = KINDS[kind];
  const lw = lwFor(ppm);
  const w = K.w * ppm + lw * 2;
  const h = (kind === 'banner' ? 4.25 : K.h) * ppm + lw;
  const c = sprite(w, h, dpr, (g, W, H) => OBSTACLE_ART[kind](g, W, H, lw, ppm));
  c.ax = w / 2; c.ay = h;
  return c;
}

/** A vinyl record (the collectable). Anchor = centre. */
export function recordSprite(ppm, dpr, label = C.pink) {
  const r = 0.42 * ppm, lw = Math.max(2, lwFor(ppm) * 0.8);
  const s = (r + lw) * 2;
  const c = sprite(s, s, dpr, g => {
    const m = s / 2;
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); inkFill(g, VINYL, lw);
    g.strokeStyle = '#54456A'; g.lineWidth = Math.max(1, r * 0.06);
    for (const k of [0.78, 0.62]) { g.beginPath(); g.arc(m, m, r * k, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.arc(m, m, r * 0.38, 0, Math.PI * 2); inkFill(g, label, lw * 0.6);
    g.beginPath(); g.arc(m, m, r * 0.09, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(1.5, r * 0.1);
    g.beginPath(); g.arc(m, m, r * 0.72, -2.5, -1.7); g.stroke();
  });
  c.ax = s / 2; c.ay = s / 2;
  return c;
}

function cloudSprite(scale, dpr) {
  const w = 150 * scale, h = 62 * scale;
  return sprite(w, h, dpr, g => {
    g.save(); g.scale(scale, scale); g.translate(6, 8);
    g.beginPath();
    g.moveTo(0, 30); g.quadraticCurveTo(-4, 6, 22, 8); g.quadraticCurveTo(30, -12, 56, 0); g.quadraticCurveTo(80, -8, 88, 16);
    g.quadraticCurveTo(108, 18, 104, 36); g.quadraticCurveTo(104, 46, 90, 46); g.lineTo(10, 46); g.quadraticCurveTo(-2, 46, 0, 30); g.closePath();
    g.restore();
    inkFill(g, C.white, 3.5 * Math.min(1, scale + 0.2));
  });
}

function sunSprite(r, dpr) {
  const s = r * 3;
  return sprite(s, s, dpr, g => {
    const m = s / 2;
    g.strokeStyle = C.yellow; g.lineWidth = r * 0.16;
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; g.beginPath(); g.moveTo(m + Math.cos(a) * r * 1.2, m + Math.sin(a) * r * 1.2); g.lineTo(m + Math.cos(a) * r * 1.42, m + Math.sin(a) * r * 1.42); g.stroke(); }
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); inkFill(g, C.yellow, 4);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(m, m, r * 0.7, -2.6, -1.8); g.stroke();
  });
}

// ---------------------------------------------------------------- buildings
function mural(g, kind, cx, cy, s, lw) {
  if (kind === 0) { starPath(g, cx, cy, s); inkFill(g, C.yellow, lw); }
  else if (kind === 1) { // heart
    g.beginPath(); g.moveTo(cx, cy + s * 0.8);
    g.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.4);
    g.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.8); g.closePath(); inkFill(g, C.pink, lw);
  } else if (kind === 2) { // music note
    g.beginPath(); g.ellipse(cx - s * 0.35, cy + s * 0.55, s * 0.36, s * 0.28, -0.3, 0, Math.PI * 2); inkFill(g, C.grape, lw);
    g.fillStyle = INK; g.fillRect(cx - s * 0.05, cy - s * 0.8, s * 0.14, s * 1.35);
    g.beginPath(); g.moveTo(cx + s * 0.05, cy - s * 0.8); g.quadraticCurveTo(cx + s * 0.7, cy - s * 0.55, cx + s * 0.55, cy - s * 0.05); g.lineWidth = lw * 1.2; g.strokeStyle = INK; g.stroke();
  } else if (kind === 3) { // bolt
    g.beginPath(); g.moveTo(cx + s * 0.2, cy - s); g.lineTo(cx - s * 0.55, cy + s * 0.1); g.lineTo(cx - s * 0.05, cy + s * 0.1); g.lineTo(cx - s * 0.25, cy + s); g.lineTo(cx + s * 0.55, cy - s * 0.15); g.lineTo(cx + s * 0.05, cy - s * 0.15); g.closePath(); inkFill(g, C.orange, lw);
  } else if (kind === 4) { // vinyl
    g.beginPath(); g.arc(cx, cy, s, 0, Math.PI * 2); inkFill(g, VINYL, lw);
    g.beginPath(); g.arc(cx, cy, s * 0.4, 0, Math.PI * 2); inkFill(g, C.mint, lw * 0.7);
  } else { // rainbow stripes
    [C.pink, C.yellow, C.sky].forEach((col, i) => { g.beginPath(); g.arc(cx, cy + s * 0.6, s * (1.1 - i * 0.28), Math.PI, 0); g.lineWidth = s * 0.26; g.strokeStyle = col; g.stroke(); });
  }
}

/** One building sprite (anchor bottom-left). Deterministic from (seed, i). */
function buildingSprite(seed, i, unit, maxH, dpr, lw) {
  const n = k => noise(seed + i * 31, k);
  const w = Math.round(unit * (0.95 + n(1) * 0.8));
  const h = Math.round(maxH * (0.45 + n(2) * 0.55));
  const color = LIGHT[Math.floor(n(3) * LIGHT.length)];
  const accent = BOLD[Math.floor(n(4) * BOLD.length)];
  const roof = Math.floor(n(5) * 4);
  const roofH = unit * 0.34;
  const c = sprite(w + lw * 2, h + roofH + lw, dpr, g => {
    g.translate(lw, roofH);
    const body = () => { g.beginPath(); g.rect(0, 0, w, h); };
    body(); inkFill(g, color, lw);
    // roof trim
    roundRect(g, -lw * 0.5, -lw, w + lw, unit * 0.1, 4); inkFill(g, accent, lw);
    // rooftop extra
    if (roof === 0) { // water tank
      const tx = w * (0.2 + n(6) * 0.4), tw = unit * 0.3;
      g.fillStyle = INK; g.fillRect(tx + tw * 0.15, -roofH * 0.35, lw, roofH * 0.35); g.fillRect(tx + tw * 0.85 - lw, -roofH * 0.35, lw, roofH * 0.35);
      roundRect(g, tx, -roofH * 0.95, tw, roofH * 0.62, tw * 0.3); inkFill(g, '#E8A15A', lw);
    } else if (roof === 1) { // antenna
      g.strokeStyle = INK; g.lineWidth = lw; const ax = w * (0.3 + n(6) * 0.4);
      g.beginPath(); g.moveTo(ax, -lw); g.lineTo(ax, -roofH * 0.9); g.moveTo(ax - roofH * 0.25, -roofH * 0.6); g.lineTo(ax + roofH * 0.25, -roofH * 0.6); g.stroke();
      g.beginPath(); g.arc(ax, -roofH * 0.9, lw * 1.3, 0, Math.PI * 2); inkFill(g, C.pink, lw * 0.6);
    } else if (roof === 2) { // billboard
      const bw = Math.min(w * 0.9, unit * 1.05), bx = (w - bw) / 2, bh = roofH * 0.8;
      g.fillStyle = INK; g.fillRect(bx + bw * 0.2, -roofH * 0.2, lw, roofH * 0.2); g.fillRect(bx + bw * 0.8, -roofH * 0.2, lw, roofH * 0.2);
      roundRect(g, bx, -roofH * 0.2 - bh, bw, bh, 6); inkFill(g, C.white, lw);
      const words = ['DANCE', 'GROOVE', 'CREW', 'SHOWCASE'];
      outlinedText(g, words[Math.floor(n(7) * words.length)], bx + bw / 2, -roofH * 0.2 - bh / 2, { size: Math.min(bh * 0.55, bw / 5.2), color: accent });
    }
    // windows
    const cols = Math.max(2, Math.round(w / (unit * 0.36)));
    const ww = w / cols;
    const winW = ww * 0.56, winH = Math.min(unit * 0.28, ww * 0.8);
    const shop = h > unit * 1.3;
    const bottom = shop ? h - unit * 0.62 : h - unit * 0.1;
    const muralAt = n(8) < 0.55 ? Math.floor(n(9) * 3) : -1;
    const muralRow = { x: w / 2, y: h * 0.42, s: Math.min(w * 0.3, unit * 0.4) };
    let row = 0;
    for (let y = unit * 0.28; y + winH < bottom; y += winH * 1.55, row++) {
      for (let cI = 0; cI < cols; cI++) {
        const x = cI * ww + (ww - winW) / 2;
        if (muralAt >= 0 && Math.abs(x + winW / 2 - muralRow.x) < muralRow.s * 1.3 && Math.abs(y + winH / 2 - muralRow.y) < muralRow.s * 1.3) continue;
        roundRect(g, x, y, winW, winH, winW * 0.22);
        inkFill(g, noise(seed + i, row * 17 + cI) < 0.3 ? '#FFF0B3' : '#FFFFFF', lw * 0.6);
        g.fillStyle = 'rgba(92,200,255,.35)'; g.fillRect(x + winW * 0.18, y + winH * 0.18, winW * 0.2, winH * 0.5);
      }
    }
    if (muralAt >= 0) mural(g, [0, 1, 2, 3, 4, 5][Math.floor(n(10) * 6)], muralRow.x, muralRow.y, muralRow.s, lw);
    if (shop) { // shop front: awning + door
      const ay = h - unit * 0.62;
      g.beginPath(); g.rect(0, ay, w, unit * 0.18); g.save(); g.clip();
      for (let x = 0, k = 0; x < w; x += unit * 0.16, k++) { g.fillStyle = k % 2 ? C.white : accent; g.fillRect(x, ay, unit * 0.16, unit * 0.18); }
      g.restore(); g.beginPath(); g.rect(0, ay, w, unit * 0.18); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
      const dw = unit * 0.28;
      roundRect(g, w * 0.5 - dw / 2, h - unit * 0.4, dw, unit * 0.4, dw * 0.2); inkFill(g, accent, lw);
      roundRect(g, w * 0.12, h - unit * 0.34, w * 0.24, unit * 0.22, 5); inkFill(g, '#D4F0FF', lw * 0.6);
      if (w > unit * 1.2) { roundRect(g, w * 0.66, h - unit * 0.34, w * 0.22, unit * 0.22, 5); inkFill(g, '#D4F0FF', lw * 0.6); }
    }
  });
  c.ax = lw; c.ay = h + roofH;
  return c;
}

/** The far skyline: a tileable strip of soft silhouettes (no outlines, so it sits back). */
function skylineSprite(seed, W, H, dpr) {
  return sprite(W, H, dpr, g => {
    let x = 0, i = 0;
    const draw = (bx, bw, bh, k) => {
      g.fillStyle = '#C7B6F2'; g.beginPath(); roundRect(g, bx, H - bh, bw, bh + 4, 6); g.fill();
      if (k % 3 === 0) { g.fillRect(bx + bw * 0.45, H - bh - bh * 0.18, bw * 0.1, bh * 0.2); }
      g.fillStyle = '#DCCFFB';
      for (let y = H - bh + 12; y < H - 14; y += 20) for (let wx = bx + 8; wx < bx + bw - 12; wx += 16) if (noise(seed + k, y * 7 + wx) < 0.55) g.fillRect(wx, y, 7, 9);
    };
    while (x < W) {
      const bw = 50 + noise(seed, i * 3) * 70, bh = H * (0.35 + noise(seed, i * 3 + 1) * 0.6);
      draw(x, bw, bh, i);
      if (x + bw > W) draw(x - W, bw, bh, i); // wrap so the strip tiles
      x += bw + 6 + noise(seed, i * 3 + 2) * 14; i++;
    }
  });
}

function propSprite(kind, ppm, dpr, lw) {
  if (kind === 'lamp') {
    const w = 1.3 * ppm, h = 4.6 * ppm;
    const c = sprite(w, h, dpr, g => {
      const pw = Math.max(lw * 1.6, 0.14 * ppm);
      roundRect(g, w / 2 - pw / 2, h * 0.12, pw, h * 0.88 - lw, pw / 2); inkFill(g, '#8C7BA6', lw);
      g.beginPath(); g.moveTo(w / 2, h * 0.14); g.quadraticCurveTo(w / 2, lw, w * 0.85, lw * 2); g.strokeStyle = INK; g.lineWidth = pw + lw * 2; g.stroke(); g.strokeStyle = '#8C7BA6'; g.lineWidth = pw; g.stroke();
      g.beginPath(); g.ellipse(w * 0.85, lw * 2 + h * 0.03, w * 0.13, h * 0.035, 0, 0, Math.PI * 2); inkFill(g, C.yellow, lw);
    });
    c.ax = w / 2; c.ay = h; return c;
  }
  if (kind === 'tree') {
    const w = 2.1 * ppm, h = 3.8 * ppm;
    const c = sprite(w, h, dpr, g => {
      roundRect(g, w / 2 - 0.12 * ppm, h * 0.45, 0.24 * ppm, h * 0.55 - lw, 4); inkFill(g, '#B8784A', lw);
      g.beginPath(); g.arc(w / 2, h * 0.34, w * 0.36, 0, Math.PI * 2); g.arc(w * 0.3, h * 0.44, w * 0.2, 0, Math.PI * 2); g.arc(w * 0.7, h * 0.44, w * 0.2, 0, Math.PI * 2);
      inkFill(g, C.mint, lw);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(w * 0.4, h * 0.24, w * 0.08, 0, Math.PI * 2); g.fill();
      roundRect(g, w * 0.3, h - 0.45 * ppm - lw, w * 0.4, 0.45 * ppm, 5); inkFill(g, C.pink, lw);
    });
    c.ax = w / 2; c.ay = h; return c;
  }
  // speaker stack (a dance-city touch)
  const w = 1.2 * ppm, h = 1.9 * ppm;
  const c = sprite(w, h, dpr, g => {
    roundRect(g, lw, lw, w - 2 * lw, h - 2 * lw, 8); inkFill(g, C.grape, lw);
    for (const [cy, r] of [[0.3, 0.2], [0.68, 0.28]]) { g.beginPath(); g.arc(w / 2, h * cy, w * r, 0, Math.PI * 2); inkFill(g, INK, lw * 0.5); g.beginPath(); g.arc(w / 2, h * cy, w * r * 0.4, 0, Math.PI * 2); g.fillStyle = C.sky; g.fill(); }
  });
  c.ax = w / 2; c.ay = h; return c;
}

/** The Showcase stage waiting at the finish. Anchor = bottom-left, width 16 m. */
function stageSprite(ppm, dpr, lw) {
  const w = 16 * ppm, h = 7.2 * ppm, floor = 1.2 * ppm;
  const c = sprite(w + lw * 2, h + lw * 2, dpr, g => {
    g.translate(lw, lw);
    // back wall + curtains
    roundRect(g, w * 0.04, h * 0.14, w * 0.92, h - floor - h * 0.14, 12); inkFill(g, '#3B2A6A', lw);
    g.globalAlpha = 0.35;
    [[0.25, '#FFF0B3'], [0.5, '#D4F0FF'], [0.75, '#FFD9EA']].forEach(([cx, col]) => { g.fillStyle = col; g.beginPath(); g.moveTo(w * cx - w * 0.03, h * 0.16); g.lineTo(w * cx + w * 0.03, h * 0.16); g.lineTo(w * cx + w * 0.11, h - floor); g.lineTo(w * cx - w * 0.11, h - floor); g.closePath(); g.fill(); });
    g.globalAlpha = 1;
    for (const side of [0, 1]) {
      g.beginPath();
      const x0 = side ? w * 0.96 : w * 0.04, dir = side ? -1 : 1;
      g.moveTo(x0, h * 0.14); g.lineTo(x0 + dir * w * 0.16, h * 0.14); g.quadraticCurveTo(x0 + dir * w * 0.1, h * 0.5, x0 + dir * w * 0.14, h - floor); g.lineTo(x0, h - floor); g.closePath();
      inkFill(g, C.pink, lw);
      g.strokeStyle = 'rgba(59,42,74,.3)'; g.lineWidth = lw * 0.6;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0 + dir * w * 0.04 * k, h * 0.16); g.quadraticCurveTo(x0 + dir * w * 0.03 * k, h * 0.5, x0 + dir * w * 0.035 * k, h - floor - 4); g.stroke(); }
    }
    // marquee
    const mw = w * 0.62, mx = (w - mw) / 2, mh = h * 0.2;
    roundRect(g, mx, 0, mw, mh, mh * 0.4); inkFill(g, C.yellow, lw);
    const bulbs = 14;
    for (let k = 0; k < bulbs; k++) { g.beginPath(); g.arc(mx + mh * 0.4 + (mw - mh * 0.8) * k / (bulbs - 1), mh * 0.16, mh * 0.07, 0, Math.PI * 2); inkFill(g, k % 2 ? C.white : C.pink, lw * 0.4); }
    outlinedText(g, 'SHOWCASE', w / 2, mh * 0.58, { size: Math.min(mh * 0.52, mw / 6.2), color: C.white });
    // floor
    roundRect(g, 0, h - floor, w, floor, 10); inkFill(g, C.grape, lw);
    roundRect(g, 0, h - floor, w, floor * 0.28, 8); inkFill(g, C.yellow, lw);
    for (let k = 0; k < 6; k++) { starPath(g, w * (0.1 + k * 0.16), h - floor * 0.4, floor * 0.2); inkFill(g, C.white, lw * 0.5); }
    // steps up from the street
    roundRect(g, -lw, h - floor * 0.5, w * 0.06, floor * 0.5, 4); inkFill(g, C.yellow, lw);
  });
  c.ax = lw; c.ay = h + lw; c.floor = floor;
  return c;
}

/**
 * The sky is a CSS gradient behind the canvas (no full-screen blit every frame): stops in CSS px
 * from the top of the play area down to the back of the sidewalk.
 */
export function skyCSS(backY) {
  return `linear-gradient(#7FD3FF 0px, #BFEBFF ${Math.round(0.7 * backY)}px, #E4F6FF ${Math.round(backY)}px)`;
}

/**
 * Everything for one layout. L = { w, h, dpr, ppm, groundY, backY, unit, farH }.
 */
export function buildArt(L, seed) {
  const { ppm, dpr } = L;
  const lw = lwFor(ppm);
  const farW = Math.max(900, Math.ceil(L.w));
  const art = {
    lw,
    sun: sunSprite(Math.max(26, Math.min(60, L.h * 0.07)), dpr),
    clouds: [cloudSprite(Math.max(0.6, L.unit / 150), dpr), cloudSprite(Math.max(0.45, L.unit / 210), dpr), cloudSprite(Math.max(0.7, L.unit / 120), dpr)],
    far: skylineSprite(seed, farW, L.farH, dpr),
    buildings: Array.from({ length: 9 }, (_, i) => buildingSprite(seed, i, L.unit, L.buildH, dpr, lw)),
    props: { lamp: propSprite('lamp', ppm, dpr, lw), tree: propSprite('tree', ppm, dpr, lw), speaker: propSprite('speaker', ppm, dpr, lw) },
    obstacles: Object.fromEntries(Object.keys(KINDS).map(k => [k, obstacleSprite(k, ppm, dpr)])),
    record: recordSprite(ppm, dpr, C.pink),
    recordAlt: recordSprite(ppm, dpr, C.yellow),
    stage: stageSprite(ppm, dpr, lw),
    scan: sprite(4, 4, 1, g => { g.fillStyle = 'rgba(59,42,74,.16)'; g.fillRect(0, 0, 4, 1.5); }),
  };
  return art;
}

// ---------------------------------------------------------------- the runner
// Poses are the player's own avatar with the arms and legs turned (same SVG, new transforms).
const PIVOT = { legL: '87 212', legR: '113 212', armL: '74 172', armR: '126 172' };
const POSES = {
  run0: { expr: 'focus', legL: 'translate(0 -12) rotate(-16', legR: 'rotate(18', armL: 'rotate(38', armR: 'rotate(18' },
  run1: { expr: 'focus', legL: 'translate(0 -4) rotate(-4', legR: 'translate(0 -4) rotate(4', armL: 'rotate(12', armR: 'rotate(-12' },
  run2: { expr: 'focus', legL: 'rotate(-18', legR: 'translate(0 -12) rotate(16', armL: 'rotate(-18', armR: 'rotate(-38' },
  jump: { expr: 'grin', legL: 'translate(0 -16) rotate(26', legR: 'translate(0 -16) rotate(-26', armL: 'rotate(128', armR: 'rotate(-128' },
  slide: { expr: 'grin', legL: 'rotate(-34', legR: 'rotate(-10', armL: 'rotate(100', armR: 'rotate(-150' },
  crash: { expr: 'wow', legL: 'rotate(16', legR: 'rotate(-16', armL: 'rotate(150', armR: 'rotate(-150' },
  cheer: { expr: 'proud', legL: 'translate(0 -6) rotate(10', legR: 'rotate(-6', armL: 'rotate(160', armR: 'rotate(-160' },
};
export const RUN_FRAMES = ['run0', 'run1', 'run2', 'run1'];

function poseSVG(avatar, pose) {
  const p = POSES[pose];
  // The game draws its own ground shadow, so the avatar's built-in one goes.
  let svg = avatarSVG(avatar, { expr: p.expr }).replace(/<ellipse class="av-shadow"[^>]*\/>/, '');
  for (const part of ['legL', 'legR', 'armL', 'armR']) {
    if (p[part]) svg = svg.replace(`<g class="av-${part}">`, `<g class="av-${part}" transform="${p[part]} ${PIVOT[part]})">`);
  }
  return svg.replace('<svg ', '<svg width="400" height="600" ');
}

function loadSVG(svg) {
  const img = new Image();
  const done = new Promise(res => { img.onload = () => res(img); img.onerror = () => res(img); });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return (img.decode ? img.decode().then(() => img, () => done) : done);
}

/** Load every runner pose for this avatar (resolves to { pose: HTMLImageElement }). */
export async function loadPoses(avatar) {
  const names = Object.keys(POSES);
  const imgs = await Promise.all(names.map(n => loadPose(avatar, n)));
  return Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
}
export const loadPose = (avatar, pose) => loadSVG(poseSVG(avatar, pose));

/** Rasterise loaded pose images at the runner's on-screen height (keeps Safari from re-drawing SVG every frame). */
export function rasterPoses(imgs, heightPx, dpr) {
  const out = {};
  const w = heightPx * (2 / 3);
  for (const [k, img] of Object.entries(imgs)) {
    if (!img || !img.naturalWidth) continue;
    out[k] = sprite(w, heightPx, dpr, g => g.drawImage(img, 0, 0, w, heightPx));
  }
  return out;
}

/** Draw a rasterised avatar pose with squash & stretch around the feet (x = centre, y = feet). */
export function drawPose(g, spr, x, y, { sx = 1, sy = 1, rot = 0, alpha = 1 } = {}) {
  if (!spr) return;
  const w = spr.cssW, h = spr.cssH;
  g.save();
  if (alpha !== 1) g.globalAlpha = alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(sx, sy);
  g.drawImage(spr, -w / 2, -h * (286 / 300), w, h);
  g.restore();
}
