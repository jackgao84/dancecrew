import * as State from './state.js';
import * as Sound from './sound.js';
import { $ } from './ui.js';
import { loadContent } from './data.js';
import { lockParent } from './screens/pin.js';
import onboarding from './screens/onboarding.js';
import home from './screens/home.js';
import player from './screens/player.js';
import closet from './screens/closet.js';
import moves from './screens/moves.js';
import story from './screens/story.js';
import chapter from './screens/chapter.js';
import mission from './screens/mission.js';
import practice from './screens/practice.js';
import wall from './screens/wall.js';
import rewards from './screens/rewards.js';
import parent from './screens/parent.js';
import rest from './screens/rest.js';
import arcade from './screens/arcade.js';
import play from './screens/play.js';
import calibrate from './screens/calibrate.js';
import './games/rare-art.js';

const routes = { home, player, closet, moves, story, chapter, mission, practice, wall, rewards, parent, rest, arcade, play, calibrate };
let cleanup = null;
let lastRoute = '';

function render() {
  try { cleanup?.(); } catch (e) { console.warn(e); }
  cleanup = null;
  const root = $('#app');
  root.innerHTML = '';
  const s = State.get();
  if (!State.hasGame()) {
    document.title = 'Dance Crew';
    cleanup = onboarding(root, () => { location.hash = '#/chapter/1/first'; });
    return;
  }
  const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  State.settleTickets();
  const route = routes[name] ? name : 'home';
  // Tuning the beat from Parent settings is a round trip: the PIN stays in until parent mode is left.
  const tuning = lastRoute === 'parent' && route === 'calibrate' && /^\/parent(\/|$)/.test(decodeURIComponent(args[0] || ''));
  if (lastRoute === 'parent' && route !== 'parent' && !tuning) lockParent();
  lastRoute = tuning ? 'parent' : route;
  document.title = s.gameName || 'Dance Crew';
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', s.gameName || 'Dance Crew');
  window.scrollTo(0, 0);
  cleanup = routes[route](root, ...args.map(decodeURIComponent)) || null;
}

async function boot() {
  State.load();
  Sound.setEnabled(State.get()?.sound ?? true);
  const wake = () => Sound.unlock();
  window.addEventListener('pointerdown', wake, { capture: true });
  window.addEventListener('touchend', wake, { capture: true });
  window.addEventListener('keydown', wake, { capture: true });
  // Stop long-press/double-tap zoom oddities on iPad buttons.
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  await loadContent();
  window.addEventListener('hashchange', render);
  render();
  State.requestPersistentStorage();
  // The offline cache is for the real site. On localhost it only gets in the way of development
  // and parallel test servers, unless a test opts in with ?sw=1.
  const localDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !new URLSearchParams(location.search).has('sw');
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !localDev) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW', e));
  }
}

window.__crew = { State, render }; // handy for debugging in the console
boot();
