// Retires the old A.R.C. service worker on the old address.
//
// The game registered /sw.js here, and that worker answers page visits from its own cache. Without
// this file a player who had played, or installed the game, would keep getting the old game and
// never see the "we've moved" page. The browser re-fetches /sw.js on a visit, sees that it has
// changed, runs this one, and this one clears the caches, removes itself and reloads the open tabs
// so the moved page shows. After that nothing is registered and every request goes to the network.
//
// It deletes caches only, never IndexedDB or localStorage, so anything saved on this device is
// left exactly as it was.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: 'window' });
      for (const tab of tabs) {
        tab.navigate(tab.url);
      }
    })(),
  );
});
