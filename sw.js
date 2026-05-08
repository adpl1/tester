// ===== ادبل Service Worker =====
// يتم تحديث الإصدار تلقائياً عند رفع نسخة جديدة (build timestamp)
const CACHE_VERSION = 'adpl-v-20260507-1430';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const CACHE_NAME = 'adpl-v1';
const STATIC_ASSETS = [
  './index.html',
  './login.html',
  './favicon.png',
  './manifest.json'
];


// تثبيت: تحميل الموارد + skipWaiting لتفعيل الإصدار الجديد فوراً
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(()=>{}))
  );
});

// تفعيل: حذف الكاش القديم بالكامل + clientsClaim لاستلام كل الصفحات المفتوحة
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => keep.has(k) ? Promise.resolve() : caches.delete(k)));
    await self.clients.claim();
    // إخطار جميع الصفحات بأن هناك تحديث جديد
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
  })());
});

// رسائل من الصفحة (للتحكم بالتحديث الفوري)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// استراتيجية: Network First للصفحات (HTML) + Cache First للموارد
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // تجاهل طلبات Firebase/Firestore والتتبع الخارجي
  if (url.hostname.includes('firestore') || url.hostname.includes('firebaseio') ||
      url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return;

  // HTML: Network First
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html') || Response.error();
      }
    })());
    return;
  }

  // باقي الموارد: Cache First مع تحديث في الخلفية
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
      }
      return res;
    }).catch(() => cached);
    return cached || fetchPromise;
  })());
});

// إشعارات Push (جاهزة لاستخدام VAPID مستقبلاً)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(_) { data = { title: 'ادبل', body: event.data?.text() || '' }; }
  const title = data.title || 'ادبل';
  const options = {
    body: data.body || '',
    icon: data.icon || './favicon.png',
    badge: './favicon.png',
    vibrate: [200, 100, 200],
    data: data.url || './',
    tag: data.tag || 'adpl-notif',
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
