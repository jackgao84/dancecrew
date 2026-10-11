// Offline support. Everything the game needs is cached on first load.
// Strategy: serve from cache instantly, refresh the cache in the background
// (so edits to e.g. data/missions.json arrive after one extra reload).
// Bump VERSION when files are added or removed, then run `npm run sw` to refresh FILES.
// Cache Storage is shared with the other apps on this origin: only names with this app's prefix
// (or its pre-prefix `crew-v<n>` names) are ever deleted.
const PREFIX = 'dancecrew-';
const VERSION = PREFIX + 'v3';
const ours = k => k.startsWith(PREFIX) || /^crew-v\d+$/.test(k);
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/arcade.css',
  './css/games/beat.css',
  './css/games/combo.css',
  './css/games/dash.css',
  './css/games/showdown.css',
  './css/games/spark.css',
  './css/screens/closet.css',
  './css/screens/home.css',
  './css/screens/mission.css',
  './css/screens/practice.css',
  './css/screens/wall.css',
  './js/app.js',
  './js/avatar.js',
  './js/comic.js',
  './js/content.js',
  './js/data.js',
  './js/fx.js',
  './js/games/adapt.js',
  './js/games/beat-model.js',
  './js/games/beat-tune.js',
  './js/games/beat.js',
  './js/games/calibration.js',
  './js/games/combo-logic.js',
  './js/games/combo.js',
  './js/games/dash-art.js',
  './js/games/dash-logic.js',
  './js/games/dash.js',
  './js/games/engine.js',
  './js/games/ghost.js',
  './js/games/progress.js',
  './js/games/rare-art.js',
  './js/games/registry.js',
  './js/games/rhythm.js',
  './js/games/shell.js',
  './js/games/showdown-logic.js',
  './js/games/showdown.js',
  './js/games/spark-art.js',
  './js/games/spark-logic.js',
  './js/games/spark.js',
  './js/i18n.js',
  './js/rules.js',
  './js/scenes.js',
  './js/screens/arcade.js',
  './js/screens/calibrate.js',
  './js/screens/chapter.js',
  './js/screens/closet.js',
  './js/screens/home.js',
  './js/screens/mission-rt.js',
  './js/screens/mission.js',
  './js/screens/moves.js',
  './js/screens/onboarding.js',
  './js/screens/parent.js',
  './js/screens/pin.js',
  './js/screens/play.js',
  './js/screens/player.js',
  './js/screens/practice.js',
  './js/screens/rest.js',
  './js/screens/rewards.js',
  './js/screens/story.js',
  './js/screens/wall.js',
  './js/sound.js',
  './js/state.js',
  './js/storage-keys.js',
  './js/ui.js',
  './data/arcade.json',
  './data/missions.json',
  './data/sparks.json',
  './data/story.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && ours(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate';
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(isPage ? './index.html' : req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(isPage ? './index.html' : req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
