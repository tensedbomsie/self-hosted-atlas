self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => new Response('Network error', { status: 503, statusText: 'Service Unavailable' }))
  )
})
