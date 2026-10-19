const CACHE = 'jornada-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/login','/activate'])));
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title.slice(0,80) : 'Jornada · Engenharia';
  const body = typeof payload.body === 'string' ? payload.body.slice(0,160) : 'Uma revisão técnica está disponível.';
  event.waitUntil(self.registration.showNotification(title,{
    body,icon:'/devops-icon.svg',badge:'/devops-icon.svg',
    tag:'jornada-devops-review',renotify:false,
    data:{url:'/desenvolvimento'},
  }));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  const existing=windows.find(w=>new URL(w.url).pathname==='/desenvolvimento');
  return existing ? existing.focus() : self.clients.openWindow('/desenvolvimento');
 }));
});
