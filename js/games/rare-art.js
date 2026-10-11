// Art for the six rare Showdown items (RARE_ITEMS in content.js), registered into avatar.js.
// Same construction as the base closet: shapes drawn once thick in ink, then filled on top, so
// every item has one clean merged outline; flat bright fills, small white shines.
import { EXTRA_ART, shade, INK } from '../avatar.js';

const NIGHT = '#2B2045';
const blob = (shapes, fill, sw = 10) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const line = (d, color, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
/** A neon tube: soft wide glow under a bright core. */
const neon = (d, color, w = 3.5) => line(d, color, w * 2.6, 'opacity=".35"') + line(d, color, w);
const glint = (x, y, s, fill = '#fff') =>
  `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s}Z" fill="${fill}"/>`;
const lum = hex => { const n = parseInt(hex.replace('#', ''), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
/** The player's colour when it glows on a dark jacket, else electric sky. */
const glow = c => (c && lum(c) > 145 ? c : '#5CC8FF');
let clipN = 0;

// ---- Neon Owl Jacket: a night-purple bomber with neon piping and the Owls' crest.
const TORSO = '<rect x="68" y="156" width="64" height="72" rx="24"/>';
function owlCrest(x, y, c) {
  return `<g transform="translate(${x} ${y})">
    <path d="M-8,-6 L-7,-13 L-2,-8 Z M8,-6 L7,-13 L2,-8 Z" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle r="9.5" fill="${NIGHT}" stroke="${c}" stroke-width="2.6"/>
    <circle cx="-3.8" cy="-1" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="3.8" cy="-1" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="-3.4" cy="-.6" r="1.5" fill="${INK}"/><circle cx="4.2" cy="-.6" r="1.5" fill="${INK}"/>
    <path d="M-2,3 L2,3 L0,6.5 Z" fill="#FFD23F"/></g>`;
}
EXTRA_ART.outfit.neonjacket = c => {
  const n = glow(c);
  return {
    torso: blob(TORSO, NIGHT)
      + `<rect x="70" y="214" width="60" height="13" rx="6" fill="${shade(NIGHT, 0.14)}"/>`
      + line('M78,216 L78,226 M86,216 L86,227 M94,216 L94,227 M106,216 L106,227 M114,216 L114,227 M122,216 L122,226', shade(NIGHT, 0.32), 1.6)
      + neon('M72,196 L100,210 L128,196', n)
      + neon('M73,176 Q70,196 74,214', n, 2.4) + neon('M127,176 Q130,196 126,214', n, 2.4)
      + `<path d="M80,157 L100,180 L120,157 L112,154 L100,168 L88,154 Z" fill="${shade(NIGHT, 0.22)}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
      + line('M100,180 L100,227', INK, 3)
      + `<rect x="97" y="182" width="6" height="9" rx="2" fill="${n}" stroke="${INK}" stroke-width="1.8"/>`
      + owlCrest(116, 178, n)
      + line('M76,166 Q80,161 86,160', '#fff', 2.5, 'opacity=".35"'),
    sleeve: NIGHT, long: true, cuff: n, stripe: n,
  };
};

// ---- Holo Kicks: pearly sneakers with a rainbow shimmer and a sparkle.
const SHOE_D = 'M62,276 Q60,258 76,254 L94,254 Q102,256 102,266 L102,276 Q102,282 96,282 L68,282 Q62,282 62,276 Z';
const HOLO = ['#FFB3D9', '#FFE89A', '#B8F3DC', '#BDE6FF', '#D9C8FF'];
EXTRA_ART.shoes.holo = c => {
  const id = `holo-${++clipN}`;
  const bands = Array.from({ length: 9 }, (_, i) => {
    const x = 42 + i * 8;
    return `<path d="M${x},288 L${x + 22},248 L${x + 30},248 L${x + 8},288 Z" fill="${HOLO[i % HOLO.length]}"/>`;
  }).join('');
  return blob(`<path d="${SHOE_D}"/>`, '#F4FBFF', 9)
    + `<clipPath id="${id}"><path d="${SHOE_D}"/></clipPath><g clip-path="url(#${id})">${bands}`
    + line('M68,262 Q74,256 84,256', '#fff', 3.5, 'opacity=".9"') + '</g>'
    + `<path d="M62,272 L102,272 L102,277 Q102,282 96,282 L68,282 Q62,282 62,277 Z" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
    + line('M65,277 L99,277', c && lum(c) < 235 ? c : '#9B6BFF', 2.4)
    + line('M84,258 L94,258 M84,264 L94,264', INK, 3)
    + glint(70, 264, 4.5) + glint(97, 251, 5, '#FFE89A');
};

// ---- Neon Visor: a night band with a tinted, glowing shield.
const SHIELD = 'M34,98 Q100,72 166,98 Q172,110 160,115 Q100,92 40,115 Q28,110 34,98 Z';
EXTRA_ART.head.visor = () => ({
  front: blob('<path d="M45,90 Q100,68 155,90 L157,100 Q100,79 43,100 Z"/>', NIGHT, 8)
    + `<path d="${SHIELD}" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`
    + `<path d="${SHIELD}" fill="#5CC8FF" fill-opacity=".72"/>`
    + neon('M40,111 Q100,88 160,111', '#D4F0FF', 2)
    + line('M44,101 Q70,88 96,84', '#fff', 3.5, 'opacity=".85"') + line('M110,84 Q118,84 124,86', '#fff', 3.5, 'opacity=".6"')
    + neon('M72,84 Q100,74 128,84', '#FF7AB6', 1.6)
    + glint(150, 96, 5),
});

// ---- Lightning Streak: a swept quiff with a bold bolt dyed through it.
EXTRA_ART.hair.lightning = c => {
  const bolt = lum(c) > 170 ? '#5CC8FF' : '#FFD23F';
  return {
    front: blob('<path d="M40,120 C34,84 44,56 70,46 C80,30 104,20 132,24 C121,30 116,36 118,43 C138,38 158,46 166,62 C154,58 147,60 143,64 C157,77 164,96 158,120 C152,102 144,94 132,90 C118,98 100,100 86,92 C72,100 54,108 40,120 Z"/>', c)
      + line('M52,84 Q58,62 78,52', shade(c, 0.35), 5, 'opacity=".8"')
      + line('M124,46 Q140,46 152,56', shade(c, -0.25), 3)
      + `<path d="M111,31 L91,63 L105,63 L89,94 L135,54 L118,54 L132,31 Z" fill="${bolt}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
      + line('M113,36 L103,54', '#fff', 2.5, 'opacity=".85"')
      + glint(123, 60, 4.5), // sparkle stays inside the hair, so hats sit on it cleanly
  };
};

// ---- Owl-Eye Shades: round purple frames with owl ear-tufts and a little beak bridge.
EXTRA_ART.face.owlshades = () =>
  line('M61,117 L45,114 M139,117 L155,114', INK, 4)
  + blob('<circle cx="79" cy="120" r="19"/><circle cx="121" cy="120" r="19"/><path d="M59,107 L54,89 L71,101 Z"/><path d="M141,107 L146,89 L129,101 Z"/>', '#9B6BFF', 6)
  + `<g fill="#2B2233"><circle cx="79" cy="120" r="13"/><circle cx="121" cy="120" r="13"/></g>`
  + `<g fill="none" stroke="#5CC8FF" stroke-width="2"><circle cx="79" cy="120" r="11"/><circle cx="121" cy="120" r="11"/></g>`
  + line('M71,114 Q74,110 79,109', '#fff', 3) + line('M113,114 Q116,110 121,109', '#fff', 3)
  + `<circle cx="86" cy="126" r="1.8" fill="#fff" opacity=".7"/><circle cx="128" cy="126" r="1.8" fill="#fff" opacity=".7"/>`
  + line('M66,103 Q79,97 92,103', '#C9B0FF', 2.5) + line('M108,103 Q121,97 134,103', '#C9B0FF', 2.5)
  + `<path d="M94,113 L106,113 L100,124 Z" fill="#FFD23F" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;

// ---- Champion Snapback: a gold forward cap with a grape brim and the Rewind badge.
const GOLD = '#FFD23F';
EXTRA_ART.head.champcap = () => ({
  front: blob('<path d="M44,98 C42,56 70,38 100,38 C130,38 158,56 156,98 Q100,82 44,98 Z"/>', GOLD)
    + line('M100,40 L100,84', shade(GOLD, -0.28), 2.5) + line('M70,50 Q64,70 66,90', shade(GOLD, -0.28), 2.5) + line('M130,50 Q136,70 134,90', shade(GOLD, -0.28), 2.5)
    + line('M58,64 Q66,50 80,45', '#fff', 4, 'opacity=".7"')
    + `<circle cx="100" cy="40" r="5" fill="#9B6BFF" stroke="${INK}" stroke-width="3"/>`
    + `<circle cx="100" cy="66" r="14" fill="#fff" stroke="${INK}" stroke-width="3.5"/>`
    + `<path d="M99,59 L89,66 L99,73 Z M110,59 L100,66 L110,73 Z" fill="#9B6BFF" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + blob('<path d="M35,95 Q100,75 165,95 Q171,105 162,109 Q100,91 38,109 Q29,105 35,95 Z"/>', '#9B6BFF', 8)
    + line('M42,100 Q100,83 158,100', GOLD, 2.2, 'stroke-dasharray="4 4"')
    + glint(142, 56, 6) + glint(58, 86, 3.5),
});
