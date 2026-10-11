// Beat tuning maths (pure, unit-tested): turns tap-minus-click differences into a per-device
// offset, or asks to run it back when the taps were too spread out to trust or sat further from
// the clicks than an offset can fix (±0.4 s) — then nothing is saved.

// 72 BPM: half a click (0.42 s) is more than the ±0.4 s offset we can store, so a tap is always
// matched to the click it belongs to, even on a laggy Bluetooth speaker.
export const TUNE = { clicks: 12, bpm: 72, discard: 3, minTaps: 5, maxSpread: 0.06, maxLag: 0.4 };

/** Linear-interpolated quantile (0..1) of a list. */
const quantile = (a, q) => {
  const d = [...a].sort((x, y) => x - y);
  const i = (d.length - 1) * q, lo = Math.floor(i);
  return d[lo] + (d[Math.min(d.length - 1, lo + 1)] - d[lo]) * (i - lo);
};
const median = a => quantile(a, 0.5);

/**
 * Seconds a tap landed after (+) or before (−) its nearest click. Clicks sit on beats
 * −clicks … −1 of the rhythm clock; `tapBeat` is the tap's beat on that clock.
 */
export function tapDiff(tapBeat, { bpm = TUNE.bpm, clicks = TUNE.clicks } = {}) {
  const k = Math.max(-clicks, Math.min(-1, Math.round(tapBeat)));
  return (tapBeat - k) * 60 / bpm;
}

/**
 * diffs: seconds each tap landed after (+) or before (−) its nearest click, in tap order.
 * The first taps are warm-up and ignored. Returns { ok, offset, spread, n, reason }:
 * ok only with a finite offset inside ±maxLag; reason 'few' | 'spread' | 'range' otherwise.
 */
export function evaluateTaps(diffs, { discard = TUNE.discard, minTaps = TUNE.minTaps, maxSpread = TUNE.maxSpread, maxLag = TUNE.maxLag } = {}) {
  const used = diffs.slice(discard).filter(d => Number.isFinite(d) && Math.abs(d) <= maxLag + 0.01);
  if (used.length < minTaps) return { ok: false, reason: 'few', n: used.length };
  const mid = median(used);
  // Median absolute deviation, or half the inter-quartile range when the taps split into an
  // early bunch and a late bunch (MAD alone would call that "tight").
  const spread = Math.max(median(used.map(d => Math.abs(d - mid))), (quantile(used, 0.75) - quantile(used, 0.25)) / 2);
  if (spread >= maxSpread) return { ok: false, reason: 'spread', offset: mid, spread, n: used.length };
  // Steady, but further from the clicks than an offset can fix: run it back (never save a clamp).
  if (!Number.isFinite(mid) || Math.abs(mid) > maxLag + 1e-9) return { ok: false, reason: 'range', offset: mid, spread, n: used.length };
  return { ok: true, offset: mid, spread, n: used.length };
}
