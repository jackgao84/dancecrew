// Rhythm calibration, stored per device (not in family backups — every iPad's audio differs).
import { KEYS, readKey } from '../storage-keys.js';

const KEY = KEYS.calibration;

/** Seconds to subtract from tap times so they line up with what the ear heard. */
export function getOffset() {
  try {
    const v = JSON.parse(readKey(KEY) || 'null');
    return v && Number.isFinite(v.offset) ? v.offset : 0;
  } catch { return 0; }
}
export function isCalibrated() {
  try { return !!readKey(KEY); } catch { return false; }
}
export function setOffset(seconds) {
  const offset = Math.max(-0.4, Math.min(0.4, Number(seconds) || 0));
  try { localStorage.setItem(KEY, JSON.stringify({ offset, at: Date.now() })); } catch { /* private mode */ }
  return offset;
}
/** Median of (tap − beat) differences, ignoring wild outliers (> 400 ms). */
export function offsetFrom(diffs) {
  const d = diffs.filter(x => Number.isFinite(x) && Math.abs(x) < 0.4).sort((a, b) => a - b);
  if (d.length < 3) return null;
  const m = Math.floor(d.length / 2);
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2;
}
