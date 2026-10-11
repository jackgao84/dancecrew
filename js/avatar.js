// Original cartoon avatar, drawn entirely in SVG.
// Big head, expressive face, chunky outlines, sneakers.
// Body parts are grouped so CSS dance moves can animate them (see css/moves.css).

export const INK = '#3B2A4A';
const PANTS = '#4A4270';
const DENIM = '#4C74D9';
const GOLD = '#FFC83D';

// ---- colour helpers ----
function hexToRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  // amt < 0 darkens toward ink, amt > 0 lightens toward white
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? hexToRgb('#2A1B3A') : [255, 255, 255];
  const a = Math.abs(amt);
  const m = (c, i) => Math.round(c + (t[i] - c) * a);
  return '#' + [m(r, 0), m(g, 1), m(b, 2)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const isLight = hex => { const [r, g, b] = hexToRgb(hex); return r * 0.299 + g * 0.587 + b * 0.114 > 200; };

// Merged outline: draw shapes once thick in ink, then filled on top → one clean silhouette.
const blob = (shapes, fill, sw = 10) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const circles = list => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
const line = (d, color, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const mirror = s => `<g transform="translate(200 0) scale(-1 1)">${s}</g>`;
const star = (cx, cy, r, fill, stroke = INK, sw = 3) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.48 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
};
const sparkle = (x, y, s, fill = '#fff') =>
  `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s}Z" fill="${fill}"/>`;

// ---- hair ----
// Each style may return: back (behind the body), behind (behind the face, moves with head), front.
const hl = c => line('M68,76 Q82,64 98,62', shade(c, 0.35), 5, 'opacity=".8"');
const HAIR = {
  crop: c => ({ front: blob('<path d="M42,116 C38,68 68,46 100,46 C134,46 164,68 158,116 C152,98 146,90 138,86 C124,94 110,90 104,82 C96,92 76,96 62,88 C54,94 46,104 42,116 Z"/>', c) + hl(c) }),
  buzz: c => ({ front: blob('<path d="M47,106 C48,70 72,53 100,53 C128,53 152,70 153,106 C140,84 120,78 100,78 C80,78 60,84 47,106 Z"/>', c, 8) }),
  curly: c => ({
    front: blob(circles([[52, 100, 15], [58, 78, 18], [76, 62, 19], [100, 55, 20], [124, 62, 19], [142, 78, 18], [148, 100, 15], [88, 72, 14], [112, 72, 14]]), c)
      + line('M70,66 q6,-6 12,0', shade(c, 0.3), 4) + line('M112,60 q6,-6 12,0', shade(c, 0.3), 4) + line('M92,52 q6,-6 12,0', shade(c, 0.3), 4),
  }),
  pony: c => ({
    behind: blob('<path d="M134,70 C178,58 194,116 176,156 C168,172 150,176 150,160 C162,134 160,100 136,88 Z"/>', c),
    front: blob('<path d="M42,116 C38,66 70,46 102,46 C136,46 162,66 158,116 C150,96 138,84 120,80 C104,92 78,100 58,98 C50,104 44,110 42,116 Z"/>', c)
      + `<circle cx="146" cy="76" r="7" fill="#FF7AB6" stroke="${INK}" stroke-width="4"/>` + hl(c),
  }),
  long: c => ({
    back: blob('<path d="M38,116 C32,58 68,40 100,40 C132,40 168,58 162,116 L170,196 Q152,208 136,196 L134,150 L66,150 L64,196 Q48,208 30,196 Z"/>', c),
    front: blob('<path d="M42,122 C38,66 70,46 100,48 C130,46 162,66 158,122 C150,94 128,76 104,70 C100,78 94,82 88,76 C70,82 50,98 42,122Z"/>', c) + hl(c),
  }),
  bun: c => ({
    behind: blob(circles([[100, 44, 22]]), c),
    front: blob('<path d="M44,110 C42,68 70,50 100,50 C130,50 158,68 156,110 C146,86 124,76 100,76 C76,76 54,86 44,110 Z"/>', c)
      + line('M84,58 Q100,52 116,58', shade(c, 0.3), 4),
  }),
  side: c => ({
    front: blob('<path d="M44,126 C36,100 42,82 58,74 C60,90 56,106 58,126 Z"/><path d="M156,126 C164,100 158,82 142,74 C140,90 144,106 142,126 Z"/>', c)
      + line('M96,58 C90,46 104,40 108,50', c, 5),
  }),
  spiky: c => ({
    front: blob('<path d="M42,116 C40,90 46,76 54,68 L44,42 L72,56 L74,26 L96,50 L108,20 L120,50 L142,28 L142,58 L168,48 L152,76 C158,86 160,100 158,116 C150,98 140,90 128,86 C112,94 88,94 72,86 C58,92 48,102 42,116 Z"/>', c)
      + line('M92,46 L100,34', shade(c, 0.35), 4),
  }),
  spacebuns: c => ({
    behind: blob(circles([[54, 58, 22], [146, 58, 22]]), c) + line('M46,48 q8,-8 16,0', shade(c, 0.3), 4) + line('M138,48 q8,-8 16,0', shade(c, 0.3), 4),
    front: blob('<path d="M44,110 C42,68 70,50 100,50 C130,50 158,68 156,110 C146,86 124,76 100,76 C76,76 54,86 44,110 Z"/>', c) + hl(c),
  }),
  bigcurls: c => ({
    behind: blob(circles([[100, 104, 72], [38, 118, 26], [162, 118, 26], [48, 76, 28], [152, 76, 28], [100, 40, 30], [72, 48, 28], [128, 48, 28], [36, 148, 22], [164, 148, 22]]), c),
    front: blob(circles([[60, 90, 15], [78, 78, 17], [100, 74, 18], [122, 78, 17], [140, 90, 15]]), c)
      + line('M92,70 q6,-6 12,0', shade(c, 0.3), 4),
  }),
  flattop: c => ({
    front: blob('<path d="M44,112 C42,90 48,76 56,70 L56,38 Q56,30 64,30 L136,30 Q144,30 144,38 L144,70 C152,76 158,90 156,112 C146,94 128,86 100,86 C72,86 54,94 44,112 Z"/>', c)
      + line('M68,42 L68,64', shade(c, 0.3), 5),
  }),
};

// ---- outfits: torso + sleeves ----
function arm(skin, sleeve, long, extra = '') {
  const path = 'M74,172 Q58,192 60,214';
  let s = line(path, INK, 26) + line(path, skin, 16);
  if (sleeve) s += line(long ? path : 'M74,172 Q66,182 64,190', sleeve, 16);
  s += extra;
  s += `<circle cx="60" cy="217" r="11" fill="${skin}" stroke="${INK}" stroke-width="5"/>`;
  return s;
}
const TORSO = '<rect x="68" y="156" width="64" height="72" rx="24"/>';

const OUTFITS = {
  tee: c => ({
    torso: blob(TORSO, c) + line('M86,160 Q100,174 114,160', shade(c, -0.25), 5) + star(100, 198, 10, '#fff', shade(c, -0.3), 2.5),
    sleeve: c, long: false,
  }),
  hoodie: c => ({
    under: blob('<path d="M64,172 Q62,150 84,150 L116,150 Q138,150 136,172 Z"/>', shade(c, -0.15)),
    torso: blob(TORSO, c) + `<path d="M80,202 L120,202 L126,224 L74,224 Z" fill="${shade(c, -0.12)}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
      + line('M92,164 L90,186', '#fff', 4) + line('M108,164 L110,186', '#fff', 4),
    sleeve: c, long: true,
    cuff: shade(c, -0.15),
  }),
  track: c => ({
    torso: blob(TORSO, c) + line('M100,164 L100,226', INK, 3) + `<path d="M84,156 L92,170 L100,162 L108,170 L116,156" fill="${shade(c, 0.25)}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
      + line('M74,176 L74,214', '#fff', 4) + line('M126,176 L126,214', '#fff', 4),
    sleeve: c, long: true, stripe: '#fff',
  }),
  overalls: c => ({
    torso: blob(TORSO, c)
      + `<path d="M76,190 L124,190 L126,226 Q100,234 74,226 Z" fill="${DENIM}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
      + line('M80,192 L78,160', DENIM, 7) + line('M120,192 L122,160', DENIM, 7)
      + `<circle cx="81" cy="194" r="4" fill="#FFD23F" stroke="${INK}" stroke-width="2.5"/><circle cx="119" cy="194" r="4" fill="#FFD23F" stroke="${INK}" stroke-width="2.5"/>`
      + `<rect x="90" y="202" width="20" height="14" rx="4" fill="${shade(DENIM, 0.15)}" stroke="${INK}" stroke-width="3"/>`,
    sleeve: c, long: false, pants: DENIM,
  }),
  bomber: c => ({
    torso: blob(TORSO, c) + `<rect x="68" y="212" width="64" height="14" rx="6" fill="${shade(c, -0.3)}"/>`
      + line('M76,214 L76,224 M84,214 L84,224 M92,214 L92,224 M100,214 L100,224 M108,214 L108,224 M116,214 L116,224 M124,214 L124,224', shade(c, -0.45), 2)
      + line('M84,160 Q100,172 116,160', shade(c, -0.3), 7) + star(84, 190, 9, '#FFD23F', INK, 3),
    sleeve: c, long: true, cuff: shade(c, -0.3),
  }),
  vest: c => ({
    torso: blob(TORSO, '#FFFFFF')
      + blob('<path d="M68,178 Q68,158 88,156 L96,228 L84,228 Q68,226 68,212 Z"/><path d="M132,178 Q132,158 112,156 L104,228 L116,228 Q132,226 132,212 Z"/>', c, 7)
      + sparkle(78, 176, 5) + sparkle(122, 198, 5) + sparkle(82, 210, 4) + sparkle(120, 170, 4)
      + `<circle cx="76" cy="194" r="2.5" fill="#fff"/><circle cx="124" cy="182" r="2.5" fill="#fff"/><circle cx="88" cy="220" r="2" fill="#fff"/>`,
    sleeve: '#FFFFFF', long: false, sparkly: true,
  }),
  crewjacket: c => ({
    torso: blob(TORSO, GOLD) + `<rect x="95" y="160" width="10" height="66" fill="${c}"/>` + line('M100,162 L100,226', INK, 2.5)
      + line('M84,158 Q100,172 116,158', c, 8) + star(118, 186, 11, c, INK, 3) + sparkle(80, 200, 5),
    sleeve: GOLD, long: true, cuff: c,
  }),
};

// ---- sneakers (left foot; right is mirrored) ----
const SHOE = '<path d="M62,276 Q60,258 76,254 L94,254 Q102,256 102,266 L102,276 Q102,282 96,282 L68,282 Q62,282 62,276 Z"/>';
const SOLE = (col = '#fff') => `<path d="M62,272 L102,272 L102,277 Q102,282 96,282 L68,282 Q62,282 62,277 Z" fill="${col}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`;
const laces = c => line('M84,258 L94,258 M84,264 L94,264', isLight(c) ? INK : '#fff', 3);
const SHOES = {
  classic: c => blob(SHOE, c, 9) + SOLE() + laces(c),
  stripe: c => blob('<path d="M62,276 Q60,258 72,254 L74,236 Q74,232 78,232 L98,232 Q102,232 102,236 L102,276 Q102,282 96,282 L68,282 Q62,282 62,276 Z"/>', c, 9)
    + `<path d="M64,264 L102,254 L102,262 L64,272 Z" fill="${isLight(c) ? '#FF7AB6' : '#fff'}"/>` + SOLE() + laces(c),
  cloud: c => blob(SHOE, c, 9) + blob(circles([[66, 278, 7], [77, 280, 7], [88, 280, 7], [98, 278, 7]]) + '<rect x="62" y="270" width="40" height="10" rx="5"/>', '#fff', 7) + laces(c),
  lightup: c => blob(SHOE, c, 9) + SOLE('#2B2233')
    + `<g class="av-glow"><circle cx="70" cy="277" r="3" fill="#FF7AB6"/><circle cx="82" cy="277" r="3" fill="#FFD23F"/><circle cx="94" cy="277" r="3" fill="#5CC8FF"/></g>` + laces(c),
  rocket: c => blob('<path d="M76,256 Q58,250 52,234 Q64,238 70,242 Q60,228 62,216 Q74,232 82,252 Z"/>', '#fff', 7) + blob(SHOE, c, 9) + SOLE('#FF9F43') + laces(c),
  gold: () => blob(SHOE, '#F5C542', 9) + SOLE('#fff') + line('M70,264 Q74,258 82,258', '#fff', 3.5) + laces('#F5C542') + sparkle(66, 250, 5, '#FFE89A'),
};

// ---- hats & face accessories ----
const HEAD = {
  none: () => ({}),
  cap: () => ({
    behind: blob('<path d="M128,62 Q178,50 186,70 Q164,78 134,78 Z"/>', '#FFD23F'),
    front: blob('<path d="M44,96 C44,56 70,40 100,40 C130,40 156,56 156,96 Q100,78 44,96 Z"/>', '#FF7AB6')
      + `<path d="M86,86 Q100,70 114,86 Z" fill="${INK}"/>` + line('M88,86 L112,86', '#FFD23F', 4)
      + `<circle cx="100" cy="42" r="5" fill="#FFD23F" stroke="${INK}" stroke-width="3"/>` + line('M60,60 Q76,50 92,48', '#FFB3D9', 4),
  }),
  phones: () => ({
    front: line('M42,112 C36,30 164,30 158,112', INK, 16) + line('M42,112 C36,30 164,30 158,112', '#9B6BFF', 7)
      + blob('<rect x="28" y="96" width="24" height="42" rx="11"/><rect x="148" y="96" width="24" height="42" rx="11"/>', '#5EE0B0', 9)
      + `<rect x="33" y="104" width="6" height="26" rx="3" fill="#fff" opacity=".8"/>`,
  }),
  band: () => ({
    front: blob('<path d="M44,88 Q100,66 156,88 L157,102 Q100,80 43,102 Z"/>', '#5EE0B0', 8) + line('M50,94 Q100,74 150,94', '#fff', 3),
  }),
  bucket: () => ({
    front: blob('<path d="M58,78 C56,42 144,42 142,78 Z"/>', '#FFD23F') + blob('<path d="M30,86 Q100,58 170,86 L162,98 Q100,76 38,98 Z"/>', '#FFD23F', 9)
      + `<path d="M58,70 Q100,58 142,70 L142,78 Q100,66 58,78 Z" fill="#FF7AB6"/>`,
  }),
  crown: () => ({
    front: blob('<path d="M62,64 L60,26 L80,44 L100,18 L120,44 L140,26 L138,64 Q100,56 62,64 Z"/>', '#FFD23F')
      + `<circle cx="100" cy="50" r="6" fill="#FF7AB6" stroke="${INK}" stroke-width="3"/><circle cx="76" cy="54" r="4" fill="#5CC8FF" stroke="${INK}" stroke-width="2.5"/><circle cx="124" cy="54" r="4" fill="#5EE0B0" stroke="${INK}" stroke-width="2.5"/>`
      + sparkle(146, 22, 6, '#FFE89A'),
  }),
};
const FACE = {
  noface: () => '',
  glasses: () => `<g fill="#fff" fill-opacity=".25" stroke="${INK}" stroke-width="4.5"><circle cx="80" cy="120" r="17"/><circle cx="120" cy="120" r="17"/></g>` + line('M97,118 Q100,114 103,118', INK, 4),
  shades: () => star(80, 121, 21, '#2B2233', '#FF7AB6', 5) + star(120, 121, 21, '#2B2233', '#FF7AB6', 5) + line('M97,118 L103,118', '#FF7AB6', 5)
    + line('M72,114 L78,110', '#fff', 3) + line('M112,114 L118,110', '#fff', 3),
};

// Extra art registered by other modules (e.g. rare Showdown items in js/games/rare-art.js).
export const EXTRA_ART = { hair: {}, outfit: {}, shoes: {}, head: {}, face: {} };

// ---- faces ----
function face(expr, skin) {
  const eyeOpen = (dx = 0, dy = 0, pr = 7) =>
    `<g class="av-eyes"><ellipse cx="80" cy="120" rx="12" ry="14" fill="#fff" stroke="${INK}" stroke-width="4"/><ellipse cx="120" cy="120" rx="12" ry="14" fill="#fff" stroke="${INK}" stroke-width="4"/>`
    + `<circle cx="${82 + dx}" cy="${122 + dy}" r="${pr}" fill="${INK}"/><circle cx="${122 + dx}" cy="${122 + dy}" r="${pr}" fill="${INK}"/>`
    + `<circle cx="${84 + dx}" cy="${118 + dy}" r="2.6" fill="#fff"/><circle cx="${124 + dx}" cy="${118 + dy}" r="2.6" fill="#fff"/></g>`;
  const closedHappy = line('M70,122 Q80,110 90,122', INK, 5) + line('M110,122 Q120,110 130,122', INK, 5);
  const closedSleepy = line('M70,120 Q80,128 90,120', INK, 5) + line('M110,120 Q120,128 130,120', INK, 5);
  const cheeks = (col = '#FF8FB1', o = 0.55) => `<ellipse cx="64" cy="140" rx="9" ry="5.5" fill="${col}" opacity="${o}"/><ellipse cx="136" cy="140" rx="9" ry="5.5" fill="${col}" opacity="${o}"/>`;
  const brows = d => line(d, INK, 5);
  const bigMouth = `<path d="M84,138 Q100,164 116,138 Z" fill="#5A2440" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M92,150 Q100,158 108,150 Q100,146 92,150Z" fill="#FF7AB6"/><path d="M87,140 L113,140 L111,144 L89,144 Z" fill="#fff"/>`;
  switch (expr) {
    case 'grin': return brows('M70,100 Q80,94 90,99 M110,99 Q120,94 130,100') + eyeOpen(0, -1) + cheeks() + bigMouth;
    case 'wow': return brows('M70,96 Q80,88 90,95 M110,95 Q120,88 130,96') + eyeOpen(0, 0, 5.5) + cheeks() + `<ellipse cx="100" cy="148" rx="7" ry="9" fill="#5A2440" stroke="${INK}" stroke-width="4"/>`;
    case 'focus': return brows('M70,102 Q80,100 91,104 M109,104 Q120,100 130,102') + eyeOpen(1, 1) + cheeks('#FF8FB1', 0.35) + line('M90,146 Q102,152 112,142', INK, 4.5);
    case 'heated': return brows('M68,98 L91,106 M132,98 L109,106') + eyeOpen(0, 2, 6) + cheeks('#FF7A45', 0.8)
      + `<rect x="84" y="140" width="32" height="13" rx="5" fill="#fff" stroke="${INK}" stroke-width="4"/>` + line('M94,141 L94,152 M100,141 L100,152 M106,141 L106,152', INK, 2.5)
      + `<g class="av-steam">${blob(circles([[30, 66, 9], [22, 56, 8], [34, 52, 7], [170, 66, 9], [178, 56, 8], [166, 52, 7]]), '#fff', 6)}</g>`;
    case 'calm': return brows('M70,102 Q80,98 90,102 M110,102 Q120,98 130,102') + closedHappy + cheeks() + line('M88,142 Q100,152 112,142', INK, 4.5);
    case 'proud': return brows('M70,98 Q80,92 90,98 M110,98 Q120,92 130,98') + closedHappy + cheeks() + bigMouth;
    case 'sleepy': return closedSleepy + cheeks('#FF8FB1', 0.4) + `<ellipse cx="100" cy="146" rx="5" ry="6" fill="#5A2440" stroke="${INK}" stroke-width="3.5"/>`;
    case 'wink': return brows('M70,100 Q80,95 90,100 M110,100 Q120,95 130,100')
      + `<ellipse cx="80" cy="120" rx="12" ry="14" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="82" cy="122" r="7" fill="${INK}"/><circle cx="84" cy="118" r="2.6" fill="#fff"/>`
      + line('M110,122 Q120,112 130,122', INK, 5) + cheeks() + line('M86,140 Q100,154 114,140', INK, 4.5);
    case 'worried': return brows('M70,104 Q80,96 90,98 M110,98 Q120,96 130,104') + eyeOpen(0, 0, 6) + cheeks('#FF8FB1', 0.4) + line('M90,148 Q100,142 110,148', INK, 4.5);
    default: return brows('M70,100 Q80,95 90,100 M110,100 Q120,95 130,100') + eyeOpen() + cheeks() + line('M86,140 Q100,156 114,140', INK, 4.5);
  }
}

const FALLBACK = { skin: '#E3A877', hair: 'crop', hairColor: '#2B2233', outfit: 'tee', outfitColor: '#FFD23F', shoes: 'classic', shoeColor: '#FFFFFF', head: 'none', face: 'noface' };

/**
 * Render an avatar as an SVG string.
 * opts.expr: happy|grin|wow|focus|heated|calm|proud|sleepy|wink|worried
 * opts.crop: 'head' for a portrait crop.
 */
export function avatarSVG(avIn, opts = {}) {
  const av = { ...FALLBACK, ...(avIn || {}) };
  const { expr = 'happy', crop = null, cls = '', label = '' } = opts;
  const skin = av.skin;
  const hair = (HAIR[av.hair] || EXTRA_ART.hair[av.hair] || HAIR.crop)(av.hairColor);
  const out = (OUTFITS[av.outfit] || EXTRA_ART.outfit[av.outfit] || OUTFITS.tee)(av.outfitColor);
  const shoe = (SHOES[av.shoes] || EXTRA_ART.shoes[av.shoes] || SHOES.classic)(av.shoeColor);
  const hat = (HEAD[av.head] || EXTRA_ART.head[av.head] || HEAD.none)();
  const faceAcc = (FACE[av.face] || EXTRA_ART.face[av.face] || FACE.noface)();
  const pants = out.pants || PANTS;
  const armExtra = (out.stripe ? line('M74,172 Q58,192 60,214', out.stripe, 4) : '')
    + (out.cuff ? line('M61,202 L60,207', out.cuff, 16) : '')
    + (out.sparkly ? '' : '');

  const vb = { head: '16 26 168 168', face: '30 44 140 140', body: '24 138 152 152', feet: '44 208 112 84' }[crop] || '0 0 200 300';
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';

  return `<svg class="av ${crop ? 'crop' : ''} ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" ${aria}>
<ellipse class="av-shadow" cx="100" cy="286" rx="52" ry="8" fill="${INK}" opacity=".15"/>
<g class="av-all">
  <g class="av-hd av-hd-back">${hair.back || ''}</g>
  <g class="av-legL">${blob('<rect x="76" y="210" width="22" height="52" rx="9"/>', pants, 9)}${shoe}</g>
  <g class="av-legR">${mirror(blob('<rect x="76" y="210" width="22" height="52" rx="9"/>', pants, 9) + shoe)}</g>
  <g class="av-torso">${out.under || ''}${out.torso}</g>
  <g class="av-armL">${arm(skin, out.sleeve, out.long, armExtra)}</g>
  <g class="av-armR">${mirror(arm(skin, out.sleeve, out.long, armExtra))}</g>
  <g class="av-hd">
    ${hair.behind || ''}${hat.behind || ''}
    <circle cx="43" cy="120" r="12" fill="${skin}" stroke="${INK}" stroke-width="5"/>
    <circle cx="157" cy="120" r="12" fill="${skin}" stroke="${INK}" stroke-width="5"/>
    <circle cx="100" cy="112" r="58" fill="${skin}" stroke="${INK}" stroke-width="5"/>
    ${line('M40,116 q4,4 6,8', shade(skin, -0.25), 3)}${line('M160,116 q-4,4 -6,8', shade(skin, -0.25), 3)}
    <g class="av-face">${face(expr, skin)}</g>
    ${hair.front || ''}
    ${faceAcc}
    ${hat.front || ''}
  </g>
</g>
</svg>`;
}

// Tiny helper for item previews in the closet: avatar wearing the item.
export function previewWith(av, slot, itemId) {
  return { ...av, [slot]: itemId };
}
