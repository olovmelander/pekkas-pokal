/**
 * Service Worker for Pekkas Pokal PWA
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'pekkas-pokal-v2.0.0';
const STATIC_CACHE = 'pekkas-pokal-static-v2.0.0';
const DYNAMIC_CACHE = 'pekkas-pokal-dynamic-v2.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
  '/pekkas-pokal/',
  '/pekkas-pokal/index.html',
  '/pekkas-pokal/manifest.json',
  '/pekkas-pokal/styles/main.css',
  '/pekkas-pokal/styles/components.css',
  '/pekkas-pokal/styles/responsive.css',
  '/pekkas-pokal/scripts/main.js',
  '/pekkas-pokal/scripts/data-manager.js',
  '/pekkas-pokal/scripts/statistics.js',
  '/pekkas-pokal/scripts/chart-manager.js',
  '/pekkas-pokal/scripts/utils.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve cached files or fetch from network
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('Service Worker: Serving from cache', request.url);
          return cachedResponse;
        }
        
        // Fetch from network and cache dynamic content
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful responses
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              
              caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                  // Only cache specific file types
                  if (shouldCacheRequest(request)) {
                    console.log('Service Worker: Caching dynamic content', request.url);
                    cache.put(request, responseClone);
                  }
                });
            }
            
            return networkResponse;
          })
          .catch((error) => {
            console.log('Service Worker: Network fetch failed', error);
            
            // Return offline fallback for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/pekkas-pokal/index.html');
            }
            
            // Return cached version if available
            return caches.match(request);
          });
      })
  );
});

// Background sync for data updates
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Push notification support
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'Ny uppdatering tillgänglig!',
    icon: '/pekkas-pokal/assets/icons/icon-192x192.png',
    badge: '/pekkas-pokal/assets/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Öppna appen',
        icon: '/pekkas-pokal/assets/icons/action-explore.png'
      },
      {
        action: 'close',
        title: 'Stäng',
        icon: '/pekkas-pokal/assets/icons/action-close.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Pekkas Pokal', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.matchAll()
        .then((clientList) => {
          // Focus existing tab if available
          for (const client of clientList) {
            if (client.url.includes('/pekkas-pokal/') && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Open new tab if no existing tab found
          if (clients.openWindow) {
            return clients.openWindow('/pekkas-pokal/');
          }
        })
    );
  }
});

// Message handler for communication with main app
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    clearAllCaches().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

/**
 * Helper Functions
 */

// Determine if request should be cached
function shouldCacheRequest(request) {
  const url = new URL(request.url);
  
  // Cache same-origin requests
  if (url.origin === location.origin) {
    return true;
  }
  
  // Cache CDN resources
  if (url.hostname === 'cdnjs.cloudflare.com') {
    return true;
  }
  
  // Don't cache external APIs or tracking
  return false;
}

// Background sync functionality
async function doBackgroundSync() {
  try {
    console.log('Service Worker: Performing background sync');
    
    // Check for pending data updates
    const registration = await self.registration;
    if (registration.sync) {
      // Sync any pending data changes
      await syncPendingChanges();
    }
    
    console.log('Service Worker: Background sync completed');
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// Sync pending changes (placeholder for future implementation)
async function syncPendingChanges() {
  // This would sync any pending data changes when back online
  // For now, just log that sync would happen
  console.log('Service Worker: Syncing pending changes...');
  
  // In a real implementation, this would:
  // 1. Check for pending data in IndexedDB
  // 2. Send updates to server
  // 3. Update local cache
  // 4. Notify main app of sync completion
}

// Clear all caches
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    const deletePromises = cacheNames.map(cacheName => caches.delete(cacheName));
    await Promise.all(deletePromises);
    console.log('Service Worker: All caches cleared');
  } catch (error) {
    console.error('Service Worker: Failed to clear caches', error);
  }
}

// Cache management - limit cache size
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    for (const key of keysToDelete) {
      await cache.delete(key);
    }
    console.log(`Service Worker: Trimmed cache ${cacheName} to ${maxItems} items`);
  }
}

// Periodic cache cleanup
setInterval(() => {
  limitCacheSize(DYNAMIC_CACHE, 50);
}, 60000); // Every minute

// Update check
async function checkForUpdates() {
  try {
    const response = await fetch('/pekkas-pokal/manifest.json');
    const manifest = await response.json();
    
    if (manifest.version !== CACHE_NAME.split('-v')[1]) {
      console.log('Service Worker: New version available');
      
      // Notify main app of available update
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_AVAILABLE',
          version: manifest.version
        });
      });
    }
  } catch (error) {
    console.error('Service Worker: Update check failed', error);
  }
}

// Check for updates periodically
setInterval(checkForUpdates, 300000); // Every 5 minutes

// Network status monitoring
self.addEventListener('online', () => {
  console.log('Service Worker: Back online');
  
  // Trigger background sync when back online
  self.registration.sync.register('background-sync');
  
  // Notify main app
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'ONLINE' });
    });
  });
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Gone offline');
  
  // Notify main app
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'OFFLINE' });
    });
  });
});

console.log('Service Worker: Script loaded successfully');