/**
 * Simple Service Worker for Pekkas Pokal
 * Provides basic offline functionality and caching
 */

const CACHE_NAME = 'pekkas-pokal-v2.2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './auto-loader.js',
  './csv-import.js',
  './cache-manager.js',
  './default-data.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.4.1/papaparse.min.js'
];

// Install event - cache files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        // Cache files one by one to avoid failures
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => {
              console.log('Failed to cache:', url, err);
            });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('pekkas-pokal')) {
            console.log('Service Worker: Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request).then((fetchResponse) => {
          // Don't cache non-successful responses
          if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type === 'opaque') {
            return fetchResponse;
          }
          
          // Clone the response
          const responseToCache = fetchResponse.clone();
          
          // Add to cache
          caches.open(CACHE_NAME).then((cache) => {
            // Only cache same-origin and CDN resources
            const url = new URL(event.request.url);
            if (url.origin === location.origin || 
                url.hostname.includes('cdn.jsdelivr.net') || 
                url.hostname.includes('cdnjs.cloudflare.com')) {
              cache.put(event.request, responseToCache);
            }
          });
          
          return fetchResponse;
        });
      })
      .catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      })
  );
});

// Message handler
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
      });
    });
    event.ports[0].postMessage('Cache cleared');
  }
});

console.log('Service Worker loaded');