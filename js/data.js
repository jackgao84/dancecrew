// Loads the editable JSON content (missions + story). Cached offline by the service worker.
import * as State from './state.js';
import { NPCS, RIVAL_CREW } from './content.js';

export const content = { missions: [], story: [], arcade: { lines: {}, reasons: {} }, sparks: [] };

export async function loadContent() {
  const get = (url, fallback) => fetch(url).then(r => r.json()).catch(() => fallback);
  const [m, s, a, sp] = await Promise.all([
    get('data/missions.json', { missions: [] }),
    get('data/story.json', { chapters: [] }),
    get('data/arcade.json', { lines: {}, reasons: {} }),
    get('data/sparks.json', { scenes: [] }),
  ]);
  content.missions = m.missions || [];
  content.story = s.chapters || [];
  content.arcade = a;
  content.sparks = sp.scenes || [];
}

/**
 * Resolve a cast reference to { name, avatar }.
 * Story roles: hero, sib, p1, p2, gp. Mission roles: me, a1, a2 (other crew members).
 * NPCs: kiko, dash, pip, sunny.
 */
export function castLookup(ctx = {}) {
  const s = State.get();
  const byRole = r => s.players.find(p => p.role === r);
  return who => {
    if (NPCS[who]) return NPCS[who];
    if (who === 'me') return ctx.me;
    if (who === 'a1') return ctx.allies?.[0];
    if (who === 'a2') return ctx.allies?.[1];
    return byRole(who) || null;
  };
}

/** Replace {hero}, {me}, {crew}, {rival}, {a1}… with real names. */
export function fillText(text, lookup) {
  const s = State.get();
  return String(text).replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'crew') return s.crewName;
    if (k === 'game') return s.gameName;
    if (k === 'rival') return RIVAL_CREW;
    const c = lookup(k);
    return c ? c.name : m;
  });
}

/** Two other crew members to appear alongside `me` in a mission (stable per mission). */
export function alliesFor(me, missionIndex) {
  const others = State.get().players.filter(p => p.id !== me.id);
  const a = others[missionIndex % others.length];
  const b = others[(missionIndex + 1) % others.length];
  return [a, b === a ? others[0] : b];
}
