/**
 * Service Worker for Pekkas Pokal - Fixed Version
 * Provides offline functionality with better cache management
 */

const CACHE_VERSION = '2.1.0'; // Update this when you make changes
const STATIC_CACHE_NAME = `pekkas-pokal-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `pekkas-pokal-dynamic-v${CACHE_VERSION}`;

// Files to cache immediately
const STATIC_FILES = [
  '/pekkas-pokal/',
  '/pekkas-pokal/index.html',
  '/pekkas-pokal/styles/main.css',
  '/pekkas-pokal/styles/components.css',
  '/pekkas-pokal/styles/responsive.css',
  '/pekkas-pokal/scripts/utils.js',
  '/pekkas-pokal/scripts/data-manager.js',
  '/pekkas-pokal/scripts/statistics.js',
  '/pekkas-pokal/scripts/chart-manager.js',
  '/pekkas-pokal/scripts/main.js',
  '/pekkas-pokal/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

/**
 * Install event - cache static files
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting(); // Force activation immediately
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating v' + CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('pekkas-pokal-') && 
                cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control immediately
      self.clients.claim()
    ]).then(() => {
      console.log('Service Worker: Activation complete');
      // Notify all clients to reload
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'CACHE_UPDATED', version: CACHE_VERSION });
        });
      });
    })
  );
});

/**
 * Fetch event - Network first for development, cache first for production
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external resources (except CDN)
  if (url.origin !== location.origin && 
      !url.hostname.includes('cdn.jsdelivr.net') &&
      !url.hostname.includes('cdnjs.cloudflare.com')) {
    return;
  }
  
  // Use different strategies based on file type
  if (isStaticFile(request.url)) {
    event.respondWith(networkFirstWithCache(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Network-first strategy for development (checks server first)
 */
async function networkFirstWithCache(request) {
  try {
    console.log('Service Worker: Network first for', request.url);
    
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.status === 200) {
      // Update cache with fresh content
      const responseClone = networkResponse.clone();
      const cache = await caches.open(STATIC_CACHE_NAME);
      await cache.put(request, responseClone);
      console.log('Service Worker: Updated cache for', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache for', request.url);
    
    // Fall back to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline fallback for HTML requests
    if (request.destination === 'document') {
      const fallback = await caches.match('/pekkas-pokal/index.html');
      return fallback || new Response(
        '<!DOCTYPE html><html><body><h1>Offline</h1><p>Du är offline. Ladda om när du har internetanslutning.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    
    throw error;
  }
}

/**
 * Cache-first strategy for dynamic content
 */
async function cacheFirst(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fetch from network and cache
    const networkResponse = await fetch(request);
    
    if (networkResponse.status === 200) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      await cache.put(request, responseClone);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('Service Worker: Fetch failed', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Check if URL is a static file
 */
function isStaticFile(url) {
  const staticExtensions = ['.css', '.js', '.html', '.json'];
  const pathname = new URL(url).pathname;
  
  return staticExtensions.some(ext => pathname.endsWith(ext)) ||
         STATIC_FILES.some(file => url.includes(file.replace('/pekkas-pokal/', '')));
}

/**
 * Message handling from main thread
 */
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CHECK_UPDATE':
      // Force cache update
      event.waitUntil(
        caches.delete(STATIC_CACHE_NAME).then(() => {
          return self.registration.update();
        })
      );
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => {
              if (cacheName.startsWith('pekkas-pokal-')) {
                return caches.delete(cacheName);
              }
            })
          );
        }).then(() => {
          event.ports[0]?.postMessage({ type: 'CACHE_CLEARED' });
        })
      );
      break;
  }
});

console.log('Service Worker v' + CACHE_VERSION + ' loaded');