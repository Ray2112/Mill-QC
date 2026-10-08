/* Cache próprio da app de CQ (não partilha com a app de Silos). Mudar CACHE em cada versão. */
const CACHE = 'moagem-cq-v1.1.0';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/logic.js', 'js/prod.js', 'js/i18n.js', 'js/i18n-prod.js', 'js/prod-ui.js', 'js/db.js', 'js/app.js',
  'vendor/xlsx.mini.min.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('moagem-cq-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(e.request, { ignoreSearch: true }).then(r => { if (!done && r) { done = true; resolve(r); } return r; });
    const timer = setTimeout(fallback, 3000);
    fetch(e.request).then(res => {
      clearTimeout(timer);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); fallback().then(r => { if (!done) { done = true; resolve(r || new Response('offline', { status: 503 })); } }); });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
