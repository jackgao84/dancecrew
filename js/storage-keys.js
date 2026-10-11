// Every localStorage key this app uses. The GitHub Pages origin is shared with other apps, so each
// key starts with PREFIX and storage is never cleared wholesale (tests/storage.test.mjs).

export const PREFIX = 'dancecrew:';
export const KEYS = {
  game: PREFIX + 'game-v1',            // the whole family save (state.js)
  calibration: PREFIX + 'calibration', // rhythm tuning, per device (games/calibration.js)
  readAloud: PREFIX + 'readaloud',     // read-aloud on/off, per device (screens/mission.js)
};
// Names used before the prefix. Read only to carry saved data across; never written.
export const LEGACY_KEYS = {
  [KEYS.game]: 'crew-game-v1',
  [KEYS.calibration]: 'crew-calibration',
  [KEYS.readAloud]: 'crew-readaloud',
};

/** Moves data from the old key names to the prefixed ones. The old key is removed only once the
 *  new one reads back identical; if the copy fails (quota, private mode) the old key stays, and
 *  readKey() keeps finding it, so nothing is lost. Safe to run on every load. */
export function migrateLegacyKeys(store = globalThis.localStorage) {
  for (const [key, old] of Object.entries(LEGACY_KEYS)) {
    try {
      const prev = store.getItem(old);
      if (prev === null) continue;
      if (store.getItem(key) === null) {
        store.setItem(key, prev);
        if (store.getItem(key) !== prev) continue;
      }
      // (An existing prefixed key is newer: the old one is never written after the move.)
      store.removeItem(old);
    } catch { /* leave both as they are; readKey() falls back */ }
  }
}

/** Reads a key, falling back to its pre-prefix name while that data hasn't moved yet. */
export function readKey(key, store = globalThis.localStorage) {
  const v = store.getItem(key);
  return v !== null || !LEGACY_KEYS[key] ? v : store.getItem(LEGACY_KEYS[key]);
}

/** Removes a key and its pre-prefix name. */
export function removeKey(key, store = globalThis.localStorage) {
  store.removeItem(key);
  if (LEGACY_KEYS[key]) store.removeItem(LEGACY_KEYS[key]);
}
