// Adaptive difficulty: quietly eases off after repeated misses and ramps up when the player
// is cruising — always inside fixed bounds. No DOM; unit-tested.
//
//   const a = createAdapt({ min: 0, max: 1, start: 0.4 });
//   a.record(true, tSeconds);   // a hit
//   a.record(false, tSeconds);  // a miss
//   a.level                     // current difficulty, always min ≤ level ≤ max

export function createAdapt({
  min = 0, max = 1, start = null, step = 0.1,
  window = 5,          // look at the last N events…
  missesToEase = 3,    // …ease off if this many were misses
  hitsToRamp = 8,      // ramp up after this many hits in a row
  cooldown = 4,        // seconds between two changes
} = {}) {
  if (!(max >= min)) throw new Error('adapt: max must be ≥ min');
  const clamp = v => Math.min(max, Math.max(min, v));
  let level = clamp(start ?? (min + max) / 2);
  let recent = [];
  let streak = 0;
  let lastChange = -Infinity;
  const changes = [];

  function record(hit, t = 0) {
    recent.push(!!hit);
    if (recent.length > window) recent.shift();
    streak = hit ? streak + 1 : 0;
    if (t - lastChange < cooldown) return level;
    const misses = recent.filter(h => !h).length;
    let next = level;
    if (misses >= missesToEase) next = clamp(level - step);
    else if (streak >= hitsToRamp) next = clamp(level + step);
    if (next !== level) {
      changes.push({ t, from: level, to: next });
      level = next;
      lastChange = t;
      recent = [];
      streak = 0;
    }
    return level;
  }

  return {
    record,
    get level() { return level; },
    get min() { return min; },
    get max() { return max; },
    /** 0..1 position of the level inside its bounds (handy for mixing parameters). */
    get t() { return max === min ? 0 : (level - min) / (max - min); },
    changes,
    reset(v = start) { level = clamp(v ?? (min + max) / 2); recent = []; streak = 0; lastChange = -Infinity; },
  };
}

/** Linear mix helper: lerp(a, b, adapt.t). */
export const lerp = (a, b, t) => a + (b - a) * t;
