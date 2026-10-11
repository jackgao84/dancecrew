// Comic-panel backgrounds and props, drawn in SVG (800×450).
const INK = '#3B2A4A';
const o = `stroke="${INK}" stroke-width="5" stroke-linejoin="round"`;

const floor = (y, a, b) => `<rect x="0" y="${y}" width="800" height="${450 - y}" fill="${a}"/>` +
  Array.from({ length: 9 }, (_, i) => `<rect x="${i * 100 - 20}" y="${y}" width="50" height="${450 - y}" fill="${b}" opacity=".6"/>`).join('') +
  `<line x1="0" y1="${y}" x2="800" y2="${y}" stroke="${INK}" stroke-width="5"/>`;
const cloud = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" ${o}><path d="M0,30 Q-4,6 22,8 Q30,-12 56,0 Q80,-8 88,16 Q108,18 104,36 Q104,46 90,46 L10,46 Q-2,46 0,30 Z"/></g>`;
const starDot = (x, y, r = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFF0B3"/>`;

const BG = {
  studio: () => `
    <rect width="800" height="450" fill="#E8DEFF"/>
    <g ${o} fill="#D4F0FF">${[60, 250, 440, 630].map(x => `<rect x="${x}" y="50" width="160" height="230" rx="10"/>`).join('')}</g>
    <g fill="#fff" opacity=".7">${[80, 270, 460, 650].map(x => `<path d="M${x},70 L${x + 40},70 L${x},140 Z"/>`).join('')}</g>
    <line x1="30" y1="250" x2="770" y2="250" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <line x1="30" y1="250" x2="770" y2="250" stroke="#FFD23F" stroke-width="4" stroke-linecap="round"/>
    ${floor(300, '#E8A15A', '#D98E47')}
    <g transform="translate(690 250)" ${o}><rect x="0" y="0" width="80" height="52" rx="10" fill="#FF7AB6"/><circle cx="22" cy="28" r="13" fill="#fff"/><circle cx="58" cy="28" r="13" fill="#fff"/></g>`,
  street: () => `
    <rect width="800" height="450" fill="#9EE0FF"/>
    <circle cx="690" cy="70" r="44" fill="#FFD23F" ${o}/>
    ${cloud(90, 40, 1)}${cloud(420, 60, .8)}
    <g ${o}>
      <rect x="-10" y="120" width="190" height="230" fill="#FF9F43"/><rect x="180" y="80" width="170" height="270" fill="#FFD9EA"/>
      <rect x="350" y="140" width="200" height="210" fill="#5EE0B0"/><rect x="550" y="100" width="260" height="250" fill="#E8DEFF"/>
    </g>
    <g fill="#fff" ${o} stroke-width="4">${[[20, 150], [100, 150], [20, 240], [100, 240], [210, 110], [290, 110], [210, 200], [290, 200], [380, 170], [470, 170], [580, 130]].map(([x, y]) => `<rect x="${x}" y="${y}" width="44" height="54" rx="6"/>`).join('')}</g>
    <g transform="translate(610 210)"><rect x="0" y="0" width="160" height="110" rx="12" fill="#fff" ${o}/><circle cx="40" cy="55" r="26" fill="#FF7AB6"/><path d="M80,85 L110,25 L140,85 Z" fill="#5CC8FF"/><circle cx="120" cy="40" r="8" fill="#FFD23F"/></g>
    <rect x="0" y="350" width="800" height="100" fill="#C9C1D6"/><line x1="0" y1="350" x2="800" y2="350" stroke="${INK}" stroke-width="5"/>
    <g stroke="#fff" stroke-width="8" stroke-dasharray="40 40"><line x1="0" y1="410" x2="800" y2="410"/></g>`,
  park: () => `
    <rect width="800" height="450" fill="#9EE0FF"/>
    <circle cx="110" cy="80" r="40" fill="#FFD23F" ${o}/>
    ${cloud(520, 40, 1)}
    <path d="M-10,260 Q180,170 400,250 Q600,180 810,250 L810,450 L-10,450 Z" fill="#8FE3B0" ${o}/>
    <g ${o}>${[[90, 230], [230, 210], [640, 215], [740, 235]].map(([x, y]) => `<rect x="${x - 8}" y="${y}" width="16" height="60" fill="#B8784A"/><circle cx="${x}" cy="${y - 20}" r="44" fill="#5EE0B0"/>`).join('')}</g>
    <rect x="0" y="320" width="800" height="130" fill="#FFB36B"/><line x1="0" y1="320" x2="800" y2="320" stroke="${INK}" stroke-width="5"/>
    <g fill="none" stroke="#fff" stroke-width="6"><circle cx="400" cy="390" r="50"/><line x1="400" y1="320" x2="400" y2="450"/></g>`,
  rain: () => `
    <rect width="800" height="450" fill="#8C9BC9"/>
    ${cloud(40, 20, 1.3)}${cloud(320, 10, 1.5)}${cloud(600, 30, 1.2)}
    <path d="M-10,270 Q180,200 400,260 Q600,200 810,260 L810,450 L-10,450 Z" fill="#6FB894" ${o}/>
    <g ${o}><path d="M200,120 L400,70 L600,120 Z" fill="#FF7AB6"/><rect x="215" y="120" width="16" height="200" fill="#fff"/><rect x="569" y="120" width="16" height="200" fill="#fff"/></g>
    <rect x="0" y="330" width="800" height="120" fill="#B78C69"/><line x1="0" y1="330" x2="800" y2="330" stroke="${INK}" stroke-width="5"/>
    <g class="rain-drops" stroke="#D4F0FF" stroke-width="4" stroke-linecap="round">${Array.from({ length: 40 }, (_, i) => { const x = (i * 97) % 800; const y = (i * 53) % 420; return `<line x1="${x}" y1="${y}" x2="${x - 8}" y2="${y + 22}"/>`; }).join('')}</g>`,
  stage: () => `
    <rect width="800" height="450" fill="#2B2045"/>
    <g opacity=".5"><path d="M120,0 L200,0 L330,330 L-20,330 Z" fill="#FFF0B3"/><path d="M600,0 L680,0 L820,330 L470,330 Z" fill="#FFD9EA"/><path d="M360,0 L440,0 L520,330 L280,330 Z" fill="#D4F0FF"/></g>
    <g ${o}><path d="M0,0 L130,0 Q110,160 140,330 L0,330 Z" fill="#FF7AB6"/><path d="M800,0 L670,0 Q690,160 660,330 L800,330 Z" fill="#FF7AB6"/><rect x="0" y="0" width="800" height="40" fill="#E0508F"/></g>
    <g fill="${INK}" opacity=".35">${Array.from({ length: 5 }, (_, i) => `<path d="M${i * 40},0 Q${i * 40 + 20},180 ${i * 40 + 10},330" stroke="#B8508A" stroke-width="3" fill="none"/>`).join('')}</g>
    <rect x="0" y="330" width="800" height="120" fill="#7B4FE0"/><line x1="0" y1="330" x2="800" y2="330" stroke="${INK}" stroke-width="5"/>
    <g ${o} stroke-width="4">${Array.from({ length: 12 }, (_, i) => `<circle cx="${i * 70 + 20}" cy="${440}" r="${30 + (i % 3) * 4}" fill="${['#FFD23F', '#5CC8FF', '#5EE0B0', '#FF9F43', '#FF7AB6'][i % 5]}"/>`).join('')}</g>
    ${[60, 180, 320, 480, 620, 740].map(x => `<circle cx="${x}" cy="20" r="10" fill="#FFF0B3" ${o} stroke-width="3"/>`).join('')}`,
  backstage: () => `
    <rect width="800" height="450" fill="#FFE4C9"/>
    <rect x="60" y="60" width="300" height="200" rx="14" fill="#D4F0FF" ${o}/>
    ${Array.from({ length: 12 }, (_, i) => `<circle cx="${i < 6 ? 60 + i * 60 : 360}" cy="${i < 6 ? 60 : 60 + (i - 5) * 33}" r="11" fill="#FFF0B3" ${o} stroke-width="3"/>`).join('')}
    <g ${o}><line x1="460" y1="80" x2="760" y2="80" stroke-width="8"/>${[480, 540, 600, 660, 720].map((x, i) => `<path d="M${x},80 L${x - 22},110 L${x - 18},230 L${x + 18},230 L${x + 22},110 Z" fill="${['#FF7AB6', '#5CC8FF', '#FFD23F', '#5EE0B0', '#9B6BFF'][i]}"/>`).join('')}</g>
    ${floor(300, '#C98E62', '#B97C52')}
    <g ${o}><rect x="560" y="250" width="110" height="60" fill="#E3A877"/><rect x="600" y="200" width="80" height="50" fill="#F5C9A0"/></g>`,
  home: () => `
    <rect width="800" height="450" fill="#FFF0B3"/>
    <g ${o}><rect x="480" y="50" width="220" height="170" rx="12" fill="#9EE0FF"/><line x1="590" y1="50" x2="590" y2="220"/><line x1="480" y1="135" x2="700" y2="135"/></g>
    <g ${o}><rect x="80" y="70" width="110" height="80" rx="8" fill="#fff"/><circle cx="120" cy="105" r="16" fill="#FF7AB6"/><rect x="150" y="100" width="24" height="30" fill="#5CC8FF"/></g>
    <rect x="0" y="310" width="800" height="140" fill="#E8A15A"/><line x1="0" y1="310" x2="800" y2="310" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="400" cy="390" rx="300" ry="44" fill="#FF9F43" ${o}/>
    <g ${o}><rect x="60" y="210" width="260" height="110" rx="30" fill="#5CC8FF"/><rect x="40" y="240" width="50" height="90" rx="20" fill="#5CC8FF"/><rect x="290" y="240" width="50" height="90" rx="20" fill="#5CC8FF"/></g>
    <g ${o}><rect x="720" y="230" width="44" height="80" rx="6" fill="#FF7AB6"/><path d="M742,230 Q700,170 742,150 Q784,170 742,230" fill="#5EE0B0"/></g>`,
  rooftop: () => `
    <rect width="800" height="450" fill="#2B2045"/>
    ${[[60, 40], [150, 90], [240, 30], [330, 70], [430, 40], [520, 100], [610, 50], [720, 80], [770, 30], [380, 120], [100, 150], [680, 150]].map(([x, y], i) => starDot(x, y, 2 + (i % 3))).join('')}
    <path d="M660,40 C640,44 626,62 626,80 C626,102 644,118 666,118 C678,118 688,112 694,104 C672,104 656,88 656,68 C656,56 660,46 668,40 Z" fill="#FFD23F" ${o} stroke-width="4"/>
    <g fill="#4A3580" ${o} stroke-width="4">${[[0, 200, 90], [90, 160, 70], [160, 220, 110], [270, 180, 80], [350, 140, 90], [440, 210, 100], [540, 170, 90], [630, 200, 80], [710, 150, 100]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${300 - y}"/>`).join('')}</g>
    <g fill="#FFD23F">${Array.from({ length: 24 }, (_, i) => `<rect x="${(i * 67) % 780 + 10}" y="${190 + (i * 29) % 90}" width="10" height="12"/>`).join('')}</g>
    <path d="M0,120 Q200,170 400,120 Q600,170 800,120" fill="none" stroke="${INK}" stroke-width="3"/>
    ${Array.from({ length: 16 }, (_, i) => { const x = i * 52 + 10; const y = 120 + 22 * Math.sin((i % 8) / 8 * Math.PI); return `<circle cx="${x}" cy="${y + 8}" r="8" fill="${['#FFD23F', '#FF7AB6', '#5CC8FF', '#5EE0B0'][i % 4]}" stroke="${INK}" stroke-width="3"/>`; }).join('')}
    <rect x="0" y="300" width="800" height="150" fill="#6B5A7B"/><line x1="0" y1="300" x2="800" y2="300" stroke="${INK}" stroke-width="5"/>`,
};

export function sceneSVG(bg) {
  return `<svg class="scene-bg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${(BG[bg] || BG.studio)()}</svg>`;
}

const PROPS = {
  flyer: `<svg viewBox="0 0 120 150"><g ${o}><rect x="5" y="5" width="110" height="140" rx="8" fill="#fff" transform="rotate(-4 60 75)"/></g><g transform="rotate(-4 60 75)"><rect x="18" y="18" width="84" height="30" rx="6" fill="#FF7AB6"/><text x="60" y="40" font-size="17" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">BIG</text><text x="60" y="72" font-size="16" font-weight="900" text-anchor="middle" fill="${INK}" font-family="sans-serif">SHOWCASE</text><polygon points="60,82 67,98 84,98 70,108 76,125 60,115 44,125 50,108 36,98 53,98" fill="#FFD23F" stroke="${INK}" stroke-width="3"/></g><circle cx="60" cy="10" r="6" fill="#FF9F43" ${o} stroke-width="3"/></svg>`,
  boombox: `<svg viewBox="0 0 140 100"><g ${o}><path d="M40,30 Q40,6 70,6 Q100,6 100,30" fill="none" stroke-width="7"/><rect x="5" y="28" width="130" height="68" rx="14" fill="#FF7AB6"/><circle cx="38" cy="62" r="20" fill="#fff"/><circle cx="102" cy="62" r="20" fill="#fff"/></g><circle cx="38" cy="62" r="7" fill="${INK}"/><circle cx="102" cy="62" r="7" fill="${INK}"/><rect x="58" y="40" width="24" height="10" rx="3" fill="#FFD23F"/></svg>`,
  lace: `<svg viewBox="0 0 120 60"><path d="M6,40 C30,10 50,50 70,26 C84,10 100,20 114,12" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M6,40 C30,10 50,50 70,26 C84,10 100,20 114,12" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`,
  trophy: `<svg viewBox="0 0 100 120"><g ${o}><path d="M24,8 H76 V38 Q76,66 50,68 Q24,66 24,38 Z" fill="#FFD23F"/><path d="M24,18 H8 Q8,44 26,46 M76,18 H92 Q92,44 74,46" fill="none"/><rect x="42" y="66" width="16" height="22" fill="#FFD23F"/><rect x="24" y="88" width="52" height="24" rx="6" fill="#9B6BFF"/></g><polygon points="50,20 55,32 68,32 58,40 62,52 50,45 38,52 42,40 32,32 45,32" fill="#fff"/></svg>`,
  mic: `<svg viewBox="0 0 50 110"><g ${o}><rect x="18" y="40" width="14" height="66" rx="6" fill="#3B2A4A"/><circle cx="25" cy="24" r="20" fill="#C9CED6"/></g><path d="M12,18 L38,30 M12,30 L38,18" stroke="#8a8f99" stroke-width="3"/></svg>`,
};

export function propSVG(type) { return PROPS[type] || ''; }
