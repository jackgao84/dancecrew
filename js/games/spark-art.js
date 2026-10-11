// Spot the Spark art: the clue overlay (same 200×300 viewBox as the avatar), scene props and a
// few icons. Original SVG only, chunky ink outlines, palette colours.
import { propSVG } from '../scenes.js';
import { CUE_POINTS } from './spark-logic.js';

const INK = '#3B2A4A';
const C = { yellow: '#FFD23F', pink: '#FF7AB6', sky: '#5CC8FF', mint: '#5EE0B0', grape: '#9B6BFF', orange: '#FF9F43', white: '#FFFFFF', cream: '#FFF6E5' };
const o = (w = 4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
// Merged outline (thick ink copy underneath, fill on top) — the same trick the avatar uses.
const blob = (shapes, fill, w = 7) => `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const circles = list => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
const sparkle = (x, y, s, fill = C.yellow) =>
  `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s}Z" fill="${fill}" ${o(2.5)}/>`;
const at = ([x, y], inner, cls = '') => `<g transform="translate(${x} ${y})"><g class="pop"><g class="${cls}">${inner}</g></g></g>`;

// ---------------------------------------------------------------- clues
const fist = skin => `
  <path d="M-14,-6 Q-14,-15 -5,-15 L6,-15 Q15,-15 15,-6 L15,6 Q15,15 6,15 L-5,15 Q-14,15 -14,6 Z" fill="${skin}" ${o(4.5)}/>
  <path d="M-6,-15 L-6,-5 M1,-15 L1,-5 M8,-14 L8,-5" fill="none" ${o(2.5)} opacity=".7"/>
  <path d="M-14,2 Q-3,6 7,1" fill="none" ${o(2.5)} opacity=".7"/>
  <path d="M-21,-15 l-7,-6 M-24,-2 l-9,0 M-21,11 l-7,6" fill="none" ${o(3)}/>`;
const puff = `${blob(circles([[0, 0, 9], [-9, 4, 7], [9, 4, 7]]), '#F3E6D6', 5)}`;
const steamPuff = `${blob(circles([[0, 6, 9], [-8, -4, 8], [5, -10, 7]]), C.white, 5)}`;
const note = color => `<g ${o(3)} transform="scale(1.7)"><path d="M5,5 L5,-14 Q11,-11 14,-4" fill="none"/><ellipse cx="0" cy="6" rx="6.5" ry="5" transform="rotate(-20)" fill="${color}"/></g>`;

/** The clue overlay for one character. Each clue is a group shown by `.sp-body.on-<clue>`. */
export function cueLayer(skin = '#E3A877') {
  const P = CUE_POINTS;
  const mirror = s => `<g transform="scale(-1 1)">${s}</g>`;
  return `
  <g class="cue cue-stomp">
    ${at([62, 286], puff, 'puff')}${at([138, 286], puff, 'puff puff-r')}
    <path d="M52,296 l-10,3 M148,296 l10,3 M58,272 l-8,-4 M142,272 l8,-4" fill="none" ${o(3)}/>
  </g>
  <g class="cue cue-fists">${at(P.fists[0], fist(skin), 'shake')}${at(P.fists[1], mirror(fist(skin)), 'shake shake-r')}</g>
  <g class="cue cue-cheeks">
    ${at(P.cheeks[0], `<ellipse rx="13" ry="8" fill="#FF5E57" opacity=".85"/><path d="M-7,3 l4,-6 M-1,3 l4,-6 M5,3 l4,-6" ${o(2)} opacity=".45"/>`, 'glowpulse')}
    ${at(P.cheeks[1], `<ellipse rx="13" ry="8" fill="#FF5E57" opacity=".85"/><path d="M-7,3 l4,-6 M-1,3 l4,-6 M5,3 l4,-6" ${o(2)} opacity=".45"/>`, 'glowpulse')}
  </g>
  <g class="cue cue-steam">${at(P.steam[0], steamPuff, 'rise')}${at(P.steam[1], mirror(steamPuff), 'rise rise-r')}
    ${at([22, 30], `<circle r="5" fill="#fff" ${o(3)}/>`, 'rise rise-late')}${at([178, 30], `<circle r="5" fill="#fff" ${o(3)}/>`, 'rise rise-late')}</g>
  <g class="cue cue-notes">${at(P.notes[0], note(C.pink), 'float')}${at(P.notes[1], note(C.sky), 'float float-r')}${at([104, 12], note(C.yellow), 'float float-late')}</g>
  <g class="cue cue-hop">${at([58, 282], sparkle(0, 0, 13), 'twinkle')}${at([142, 282], sparkle(0, 0, 13, C.pink), 'twinkle twinkle-r')}${at([100, 298], sparkle(0, 0, 9, C.mint), 'twinkle')}</g>
  <g class="cue cue-cheer">${at([34, 104], sparkle(0, 0, 14), 'twinkle')}${at([166, 104], sparkle(0, 0, 14, C.sky), 'twinkle twinkle-r')}${at([100, 30], sparkle(0, 0, 10, C.pink), 'twinkle')}</g>
  <g class="cue cue-glow">
    ${at(P.glow[0], `<ellipse rx="12" ry="7" fill="${C.pink}" opacity=".7"/>`)}${at(P.glow[1], `<ellipse rx="12" ry="7" fill="${C.pink}" opacity=".7"/>`)}
    ${at([30, 94], sparkle(0, 0, 11), 'twinkle')}${at([172, 98], sparkle(0, 0, 10, C.mint), 'twinkle twinkle-r')}${at([100, 30], sparkle(0, 0, 12, C.pink), 'twinkle')}
  </g>`;
}

// ---------------------------------------------------------------- props (viewBox 0 0 120 120)
const box = inner => `<svg viewBox="0 0 120 120" aria-hidden="true">${inner}</svg>`;
const PROPS = {
  blocks: box(`<g ${o(5)}>
    <rect x="10" y="84" width="34" height="30" rx="6" fill="${C.yellow}"/><rect x="46" y="84" width="34" height="30" rx="6" fill="${C.sky}"/>
    <rect x="26" y="54" width="34" height="30" rx="6" fill="${C.pink}" transform="rotate(-16 43 69)"/>
    <rect x="64" y="20" width="30" height="28" rx="6" fill="${C.mint}" transform="rotate(30 79 34)"/></g>
    <g fill="#fff" opacity=".8"><circle cx="20" cy="93" r="3.5"/><circle cx="56" cy="93" r="3.5"/></g>
    <path d="M100,14 q7,8 2,17 M108,36 q6,6 1,13" fill="none" ${o(3.5)}/>`),
  tablet: box(`<g ${o(5)}><rect x="8" y="22" width="104" height="74" rx="12" fill="${C.grape}"/><rect x="18" y="31" width="84" height="56" rx="6" fill="#fff"/>
    <path d="M44,96 L40,112 L80,112 L76,96" fill="${C.grape}"/></g>
    <g fill="${INK}">${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<circle cx="${(60 + Math.cos(a) * 15).toFixed(1)}" cy="${(59 + Math.sin(a) * 15).toFixed(1)}" r="4" opacity="${(0.15 + i * 0.11).toFixed(2)}"/>`; }).join('')}</g>`),
  homework: box(`<g ${o(5)}><rect x="14" y="14" width="80" height="100" rx="8" fill="#fff" transform="rotate(-6 54 64)"/></g>
    <g transform="rotate(-6 54 64)"><path d="M26,34 H80 M26,48 H72 M26,62 H78" stroke="${C.sky}" stroke-width="4" stroke-linecap="round"/>
    <path d="M30,84 q8,-14 16,0 t16,0 t16,0" fill="none" ${o(4)}/></g>
    <g ${o(4.5)} transform="rotate(38 98 76)"><rect x="90" y="40" width="14" height="60" rx="3" fill="${C.yellow}"/><path d="M90,100 L97,114 L104,100 Z" fill="#FFE3CC"/><rect x="90" y="36" width="14" height="10" rx="3" fill="${C.pink}"/></g>`),
  puzzle: box(`<g ${o(5)}><rect x="8" y="30" width="104" height="80" rx="10" fill="${C.orange}"/></g>
    <g ${o(4)}><rect x="18" y="40" width="40" height="30" rx="4" fill="${C.sky}"/><rect x="62" y="40" width="40" height="30" rx="4" fill="${C.mint}"/>
    <rect x="18" y="72" width="40" height="30" rx="4" fill="${C.yellow}"/><circle cx="58" cy="55" r="6" fill="${C.sky}"/><circle cx="38" cy="71" r="6" fill="${C.yellow}"/></g>
    <rect x="62" y="72" width="40" height="30" rx="4" fill="#fff" opacity=".7" stroke="${INK}" stroke-width="3.5" stroke-dasharray="6 6"/>`),
  tree: `<svg viewBox="0 0 120 180" aria-hidden="true"><g ${o(5)}><rect x="50" y="90" width="20" height="86" rx="6" fill="#B8784A"/>
    ${blob(circles([[60, 58, 44], [26, 76, 26], [94, 76, 26], [44, 30, 24], [80, 30, 24]]), C.mint, 10)}</g>
    <g ${o(4)}><circle cx="74" cy="48" r="14" fill="#fff"/><path d="M68,42 L74,38 L80,42 L78,50 L70,50 Z" fill="${INK}"/></g>
    <path d="M98,30 l8,-6 M100,44 l10,0" fill="none" ${o(3)}/></svg>`,
  drawing: box(`<g ${o(5)}><rect x="10" y="16" width="100" height="92" rx="8" fill="#fff" transform="rotate(4 60 62)"/></g>
    <g transform="rotate(4 60 62)"><circle cx="34" cy="38" r="10" fill="${C.yellow}" ${o(3)}/><path d="M52,78 L70,58 L88,78 Z" fill="${C.pink}" ${o(3)}/><rect x="56" y="78" width="28" height="18" fill="${C.sky}" ${o(3)}/>
    <path d="M40,64 Q58,50 74,66 Q90,84 68,92 Q46,100 38,84 Q30,72 40,64 Z" fill="#8C8496" opacity=".75"/></g>`),
  keys: box(`<g ${o(5)}><rect x="8" y="12" width="90" height="34" rx="9" fill="#B8784A"/></g>
    <g fill="none" ${o(4)}><path d="M28,38 v10 q0,6 6,6"/><path d="M53,38 v10 q0,6 6,6"/><path d="M78,38 v10 q0,6 6,6"/></g>
    <g ${o(3.5)}><circle cx="34" cy="64" r="8" fill="${C.yellow}"/><rect x="31" y="70" width="6" height="22" rx="2" fill="${C.yellow}"/><circle cx="84" cy="64" r="8" fill="${C.sky}"/><rect x="81" y="70" width="6" height="22" rx="2" fill="${C.sky}"/></g>
    <g fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"><circle cx="59" cy="64" r="8"/><path d="M59,72 v20"/></g>
    <g ${o(5)} fill="none"><path d="M100,62 q0,-10 8,-10 q8,0 8,9 q0,7 -8,9 v7"/></g><circle cx="108" cy="92" r="3.5" fill="${INK}"/>`),
  cereal: box(`<g ${o(5)}><rect x="22" y="10" width="54" height="76" rx="6" fill="${C.pink}" transform="rotate(-22 49 48)"/>
    <path d="M18,86 Q60,118 102,86 Z" fill="${C.sky}"/><path d="M14,86 H106" /></g>
    <g transform="rotate(-22 49 48)"><circle cx="49" cy="40" r="12" fill="${C.yellow}" ${o(3)}/><rect x="32" y="62" width="34" height="10" rx="4" fill="#fff" ${o(3)}/></g>
    <g fill="${C.yellow}" ${o(2.5)}><circle cx="84" cy="80" r="3.5"/><circle cx="94" cy="76" r="3"/></g>`),
  ball: box(`<g ${o(5)}><circle cx="60" cy="74" r="38" fill="#fff"/></g><path d="M50,62 L60,54 L70,62 L66,74 L54,74 Z" fill="${INK}"/>
    <path d="M60,54 L60,38 M70,62 L92,58 M66,74 L78,94 M54,74 L42,94 M50,62 L28,58" fill="none" ${o(3)}/>
    <path d="M18,40 l-8,-6 M24,26 l-4,-9" fill="none" ${o(3)}/>`),
};
// Size of each prop relative to the character's height.
const PROP_SIZE = { tree: 0.62, tablet: 0.3, keys: 0.28, homework: 0.3, blocks: 0.34, puzzle: 0.3, drawing: 0.3, cereal: 0.3, ball: 0.24, lace: 0.2, mic: 0.36, boombox: 0.3, trophy: 0.3, flyer: 0.28 };
export const PROP_IDS = Object.keys(PROP_SIZE);

export function propArt(id) {
  return PROPS[id] || propSVG(id) || '';
}
export const propSize = id => PROP_SIZE[id] || 0.3;

// ---------------------------------------------------------------- icons (48×48, like ui.icon)
const ICONS = {
  walk: blob('<ellipse cx="15" cy="33" rx="7" ry="10" transform="rotate(-10 15 33)"/><ellipse cx="33" cy="21" rx="7" ry="10" transform="rotate(10 33 21)"/>'
    + '<circle cx="10" cy="19" r="3"/><circle cx="17" cy="18" r="3"/><circle cx="30" cy="7" r="3"/><circle cx="37" cy="8" r="3"/>', C.orange, 6),
  squeeze: blob('<ellipse cx="24" cy="26" rx="19" ry="14"/>', C.pink, 6)
    + `<path d="M14,22 Q18,18 22,21" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M4,8 l5,5 M44,8 l-5,5 M24,4 v5" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
  eye: blob('<path d="M3,24 Q24,4 45,24 Q24,44 3,24 Z"/>', C.white, 6) + `<circle cx="24" cy="24" r="8" fill="${C.sky}" stroke="${INK}" stroke-width="3"/><circle cx="24" cy="24" r="3.5" fill="${INK}"/><circle cx="27" cy="21" r="1.8" fill="#fff"/>`,
  thumbs: blob('<rect x="6" y="20" width="10" height="22" rx="4"/><path d="M18,42 L18,22 L26,6 Q31,4 31,11 L29,19 L40,19 Q45,19 44,25 L41,38 Q40,42 35,42 Z"/>', C.mint, 6),
};
export function sparkIcon(name) {
  return ICONS[name] ? `<svg class="ic" viewBox="0 0 48 48" aria-hidden="true">${ICONS[name]}</svg>` : '';
}
export const hasSparkIcon = name => !!ICONS[name];
