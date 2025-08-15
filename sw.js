/**
 * Service Worker for Pekkas Pokal
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'pekkas-pokal-v2.0.0';
const STATIC_CACHE_NAME = 'pekkas-pokal-static-v2.0.0';
const DYNAMIC_CACHE_NAME = 'pekkas-pokal-dynamic-v2.0.0';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/styles/components.css',
  '/styles/responsive.css',
  '/scripts/utils.js',
  '/scripts/data-manager.js',
  '/scripts/statistics.js',
  '/scripts/chart-manager.js',
  '/scripts/main.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js'
];

// Files to cache on demand
const DYNAMIC_FILES = [
  // API endpoints if any
  // External resources
];

/**
 * Install event - cache static files
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
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
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME &&
                cacheName.startsWith('pekkas-pokal-')) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activation complete');
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('Service Worker: Activation failed', error);
      })
  );
});

/**
 * Fetch event - serve from cache with network fallback
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
      !url.hostname.includes('cdnjs.cloudflare.com')) {
    return;
  }
  
  event.respondWith(
    cacheFirst(request)
  );
});

/**
 * Cache-first strategy for static files
 */
async function cacheFirst(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Service Worker: Serving from cache', request.url);
      return cachedResponse;
    }
    
    // If not in cache, fetch from network
    console.log('Service Worker: Fetching from network', request.url);
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.status === 200) {
      const responseClone = networkResponse.clone();
      
      // Determine which cache to use
      const cacheName = isStaticFile(request.url) 
        ? STATIC_CACHE_NAME 
        : DYNAMIC_CACHE_NAME;
      
      const cache = await caches.open(cacheName);
      await cache.put(request, responseClone);
      console.log('Service Worker: Cached response', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('Service Worker: Fetch failed', error);
    
    // Return offline fallback for HTML requests
    if (request.destination === 'document') {
      const fallback = await caches.match('/index.html');
      return fallback || new Response(
        'Du är offline. Applikationen kräver internetanslutning för första gången.',
        { status: 503, statusText: 'Service Unavailable' }
      );
    }
    
    // Return generic offline response for other requests
    return new Response('Offline - resursen är inte tillgänglig', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Check if URL is a static file
 */
function isStaticFile(url) {
  const staticExtensions = ['.css', '.js', '.html', '.json'];
  const pathname = new URL(url).pathname;
  
  return staticExtensions.some(ext => pathname.endsWith(ext)) ||
         STATIC_FILES.some(file => url.includes(file));
}

/**
 * Background sync for data persistence
 */
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'background-sync-data') {
    event.waitUntil(syncData());
  }
});

/**
 * Sync data when back online
 */
async function syncData() {
  try {
    // Get pending changes from IndexedDB or localStorage
    const pendingChanges = JSON.parse(
      self.localStorage?.getItem('pekkas-pokal-pending') || '[]'
    );
    
    if (pendingChanges.length > 0) {
      console.log('Service Worker: Syncing pending changes', pendingChanges);
      
      // Process pending changes
      for (const change of pendingChanges) {
        // Implementation would depend on your backend API
        console.log('Service Worker: Processing change', change);
      }
      
      // Clear pending changes
      self.localStorage?.removeItem('pekkas-pokal-pending');
      console.log('Service Worker: Sync complete');
    }
    
  } catch (error) {
    console.error('Service Worker: Sync failed', error);
  }
}

/**
 * Push notification handling
 */
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  let title = 'Pekkas Pokal';
  let options = {
    body: 'Du har nya meddelanden',
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' fill='%23667eea' rx='20'/><text x='96' y='140' text-anchor='middle' font-size='120' fill='white'>🏆</text></svg>",
    badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><rect width='96' height='96' fill='%23667eea' rx='10'/><text x='48' y='70' text-anchor='middle' font-size='60' fill='white'>🏆</text></svg>",
    vibrate: [200, 100, 200],
    tag: 'pekkas-pokal-notification',
    renotify: true,
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'Visa',
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'/></svg>"
      },
      {
        action: 'dismiss',
        title: 'Stäng',
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/></svg>"
      }
    ]
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      options.body = data.body || options.body;
      options.data = data;
    } catch (error) {
      console.error('Service Worker: Failed to parse push data', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Notification click handling
 */
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event);
  
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data || {};
  
  if (action === 'dismiss') {
    return;
  }
  
  // Default action or 'view' action
  const urlToOpen = data.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Check if app is already open
        for (const client of clients) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

/**
 * Message handling from main thread
 */
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({
        type: 'VERSION',
        payload: { version: CACHE_NAME }
      });
      break;
      
    case 'CACHE_DATA':
      // Cache important data
      event.waitUntil(
        caches.open(DYNAMIC_CACHE_NAME)
          .then(cache => cache.put('/data', new Response(JSON.stringify(payload))))
      );
      break;
      
    default:
      console.log('Service Worker: Unknown message type', type);
  }
});

console.log('Service Worker: Script loaded');

/**
 * Error handling
 */
self.addEventListener('error', (event) => {
  console.error('Service Worker: Error', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker: Unhandled promise rejection', event.reason);
});

// Periodic background sync (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'background-data-sync') {
      event.waitUntil(syncData());
    }
  });
}