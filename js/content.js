// Static game content: palettes, closet items, dance moves, defaults.

export const SKIN = ['#FFE3CC', '#F5C9A0', '#E3A877', '#C68650', '#98613A', '#6A4128'];

export const HAIR_COLORS = ['#2B2233', '#4A2E22', '#7A4A2A', '#B5502E', '#F2C14E', '#B8B4BE', '#F4F1EA', '#FF7AB6', '#4FA8FF', '#9B6BFF'];

export const OUTFIT_COLORS = ['#FFD23F', '#FF7AB6', '#5CC8FF', '#5EE0B0', '#9B6BFF', '#FF9F43', '#FF6F61', '#3D5A98'];

export const SHOE_COLORS = ['#FFFFFF', '#FFD23F', '#FF7AB6', '#5CC8FF', '#5EE0B0', '#9B6BFF', '#FF9F43', '#2B2233'];

// Earned one per level after every item is unlocked (L22+).
export const BONUS_COLORS = [
  { color: '#C6F432', name: 'Neon Lime' },
  { color: '#FF3FA4', name: 'Hot Magenta' },
  { color: '#2F6BFF', name: 'Electric Blue' },
  { color: '#FF7B54', name: 'Sunset' },
  { color: '#5B3FA8', name: 'Galaxy' },
  { color: '#FFB3D9', name: 'Bubblegum' },
  { color: '#1FD1C1', name: 'Lagoon' },
  { color: '#F5B700', name: 'Solid Gold' },
  { color: '#C9CED6', name: 'Chrome' },
  { color: '#8B5A3C', name: 'Cocoa' },
];
export const BONUS_COLOR_START_LEVEL = 22;

export const SLOTS = [
  { id: 'hair', name: 'Hair' },
  { id: 'outfit', name: 'Outfit' },
  { id: 'shoes', name: 'Sneakers' },
  { id: 'head', name: 'Hats' },
  { id: 'face', name: 'Face' },
];

// level 0 = starter (always available). Unlockables: exactly one per level 2–21.
export const ITEMS = [
  // starters
  { id: 'crop',    slot: 'hair',   name: 'Short Crop',     level: 0 },
  { id: 'curly',   slot: 'hair',   name: 'Curly Top',      level: 0 },
  { id: 'pony',    slot: 'hair',   name: 'Ponytail',       level: 0 },
  { id: 'long',    slot: 'hair',   name: 'Long & Straight', level: 0 },
  { id: 'bun',     slot: 'hair',   name: 'Top Bun',        level: 0 },
  { id: 'buzz',    slot: 'hair',   name: 'Buzz Cut',       level: 0 },
  { id: 'side',    slot: 'hair',   name: 'Side Tufts',     level: 0 },
  { id: 'tee',     slot: 'outfit', name: 'Crew Tee',       level: 0 },
  { id: 'hoodie',  slot: 'outfit', name: 'Comfy Hoodie',   level: 0 },
  { id: 'classic', slot: 'shoes',  name: 'Classic Kicks',  level: 0 },
  { id: 'none',    slot: 'head',   name: 'No Hat',         level: 0 },
  { id: 'noface',  slot: 'face',   name: 'Nothing',        level: 0 },
  { id: 'glasses', slot: 'face',   name: 'Round Glasses',  level: 0 },
  // unlockables (XP levels)
  { id: 'cap',       slot: 'head',   name: 'Backwards Cap',   level: 2,  blurb: 'Classic crew style.' },
  { id: 'stripe',    slot: 'shoes',  name: 'Stripe Hi-Tops',  level: 3,  blurb: 'Fast stripes, faster feet.' },
  { id: 'spiky',     slot: 'hair',   name: 'Spiky Top',       level: 4,  blurb: 'Electric hair energy!' },
  { id: 'track',     slot: 'outfit', name: 'Track Jacket',    level: 5,  blurb: 'Zip up, step up.' },
  { id: 'phones',    slot: 'head',   name: 'Big Headphones',  level: 6,  blurb: 'Hear the beat everywhere.' },
  { id: 'cloud',     slot: 'shoes',  name: 'Cloud Runners',   level: 7,  blurb: 'Bouncy like a cloud.' },
  { id: 'spacebuns', slot: 'hair',   name: 'Space Buns',      level: 8,  blurb: 'Two buns, zero gravity.' },
  { id: 'overalls',  slot: 'outfit', name: 'Dance Overalls',  level: 9,  blurb: 'Pockets for pocket-sized moves.' },
  { id: 'shades',    slot: 'face',   name: 'Star Shades',     level: 10, blurb: 'Too cool to handle.' },
  { id: 'lightup',   slot: 'shoes',  name: 'Light-Up Kicks',  level: 11, blurb: 'Every step sparkles.' },
  { id: 'bigcurls',  slot: 'hair',   name: 'Cloud Curls',     level: 12, blurb: 'Big, bold and bouncy.' },
  { id: 'bomber',    slot: 'outfit', name: 'Star Bomber',     level: 13, blurb: 'With a shiny star patch.' },
  { id: 'band',      slot: 'head',   name: 'Sweatband',       level: 14, blurb: 'For serious practice.' },
  { id: 'rocket',    slot: 'shoes',  name: 'Rocket Kicks',    level: 15, blurb: 'Little wings for big jumps.' },
  { id: 'flattop',   slot: 'hair',   name: 'Tall Flat-Top',   level: 16, blurb: 'Stand tall. Like, really tall.' },
  { id: 'vest',      slot: 'outfit', name: 'Sparkle Vest',    level: 17, blurb: 'Catches every spotlight.' },
  { id: 'bucket',    slot: 'head',   name: 'Bucket Hat',      level: 18, blurb: 'Chill vibes only.' },
  { id: 'gold',      slot: 'shoes',  name: 'Golden Kicks',    level: 19, blurb: 'Shine from the floor up.' },
  { id: 'crewjacket',slot: 'outfit', name: 'Crew Jacket',     level: 20, blurb: 'Official Big Showcase gear.' },
  { id: 'crown',     slot: 'head',   name: 'Showcase Crown',  level: 21, blurb: 'For a true crew legend.' },
];
// v2: rare items, won in the weekly Showdown (one per win, in this order). Kept separate from
// ITEMS so the level-unlock table stays exactly one item per level.
export const RARE_ITEMS = [
  { id: 'neonjacket', slot: 'outfit', name: 'Neon Owl Jacket',   rare: true, blurb: 'Glows like a spotlight.' },
  { id: 'holo',       slot: 'shoes',  name: 'Holo Kicks',        rare: true, blurb: 'Rainbow shine on every step.' },
  { id: 'visor',      slot: 'head',   name: 'Neon Visor',        rare: true, blurb: 'Showdown-ready.' },
  { id: 'lightning',  slot: 'hair',   name: 'Lightning Streak',  rare: true, blurb: 'A bolt of pure style.' },
  { id: 'owlshades',  slot: 'face',   name: 'Owl-Eye Shades',    rare: true, blurb: 'A gift from the Neon Owls.' },
  { id: 'champcap',   slot: 'head',   name: 'Champion Snapback', rare: true, blurb: 'For crews who run it back.' },
];
export const itemById = id => ITEMS.find(i => i.id === id) || RARE_ITEMS.find(i => i.id === id);

export const MOVES = [
  { id: 'bounce', name: 'Bounce Step',  level: 1,  color: 'yellow', blurb: 'Knees soft, bounce to the beat.' },
  { id: 'wave',   name: 'Wave Ripple',  level: 3,  color: 'sky',    blurb: 'A wave rolls from one hand to the other.' },
  { id: 'pop',    name: 'Shoulder Pop', level: 5,  color: 'pink',   blurb: 'Pop, pop! Shoulders hit the snare.' },
  { id: 'kick',   name: 'Kick-Step',    level: 8,  color: 'mint',   blurb: 'Kick, step, kick, step — sharp and neat.' },
  { id: 'robot',  name: 'Robo Lock',    level: 11, color: 'grape',  blurb: 'Click into place like a robot.' },
  { id: 'spin',   name: 'Spin Out',     level: 14, color: 'orange', blurb: 'One big spin, land it with style.' },
  { id: 'glide',  name: 'Glide Slide',  level: 17, color: 'sky',    blurb: 'Slide sideways like the floor is ice.' },
  { id: 'freeze', name: 'Star Freeze',  level: 20, color: 'yellow', blurb: 'Jump into a star and HOLD it.' },
];
export const moveById = id => MOVES.find(m => m.id === id);

export const DEFAULT_REWARDS = [
  { id: 'r-music',   icon: '🎵', name: 'Pick the music in the car', cost: 3 },
  { id: 'r-dessert', icon: '🍨', name: 'Choose tonight\'s dessert', cost: 5 },
  { id: 'r-dinner',  icon: '🍝', name: 'Pick dinner', cost: 6 },
  { id: 'r-drum',    icon: '🥁', name: 'An extra drum session', cost: 8 },
  { id: 'r-late',    icon: '🌙', name: 'Stay up 15 minutes later (weekend)', cost: 8 },
  { id: 'r-weekend', icon: '🎡', name: 'Choose the weekend activity', cost: 12 },
];
export const REWARD_ICONS = ['🎵', '🍨', '🍝', '🥁', '🌙', '🎡', '🎮', '📚', '🎨', '⚽', '🍕', '🧁', '🎬', '🛝', '🚲', '🧩', '🏊', '🌮', '🍿', '⭐'];

export const GAME_NAME_IDEAS = ['Crew Goals', 'Beat Squad', 'Groove Up', 'Step It Up', 'Bounce Back'];
export const CREW_NAME_IDEAS = ['The Groove Rockets', 'Bounce Squad', 'The Funky Sneakers', 'Beat Buddies', 'The Rewinders'];

// Setup order. Index 0 is the kid who does onboarding.
export const ROLES = ['hero', 'sib', 'p1', 'p2', 'gp'];

// Friendly non-player characters used in story and missions.
export const NPCS = {
  kiko:  { name: 'Kiko',     avatar: { skin: SKIN[3], hair: 'spacebuns', hairColor: '#4FA8FF', outfit: 'bomber', outfitColor: '#9B6BFF', shoes: 'lightup', shoeColor: '#5CC8FF', head: 'none', face: 'noface' } },
  dash:  { name: 'Dash',     avatar: { skin: SKIN[1], hair: 'spiky', hairColor: '#B5502E', outfit: 'track', outfitColor: '#3D5A98', shoes: 'stripe', shoeColor: '#FFFFFF', head: 'band', face: 'noface' } },
  pip:   { name: 'Pip',      avatar: { skin: SKIN[5], hair: 'curly', hairColor: '#2B2233', outfit: 'hoodie', outfitColor: '#5EE0B0', shoes: 'cloud', shoeColor: '#FFD23F', head: 'phones', face: 'glasses' } },
  sunny: { name: 'MC Sunny', avatar: { skin: SKIN[2], hair: 'flattop', hairColor: '#4A2E22', outfit: 'vest', outfitColor: '#FFD23F', shoes: 'gold', shoeColor: '#FFD23F', head: 'none', face: 'shades' } },
};
export const RIVAL_CREW = 'The Neon Owls';

export function randomAvatar() {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(SKIN), hair: pick(['crop', 'curly', 'pony', 'long', 'bun', 'buzz']),
    hairColor: pick(HAIR_COLORS.slice(0, 5)), outfit: pick(['tee', 'hoodie']),
    outfitColor: pick(OUTFIT_COLORS), shoes: 'classic', shoeColor: pick(SHOE_COLORS),
    head: 'none', face: 'noface',
  };
}
