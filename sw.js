/**
 * Enhanced Service Worker for Pekkas Pokal
 * Better caching strategy and offline support
 * Replace sw.js with this version
 */

const CACHE_VERSION = 'v2.3';
const CACHE_NAME = `pekkas-pokal-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `pekkas-pokal-data-${CACHE_VERSION}`;

// Files to cache immediately
const CORE_FILES = [
    './',
    './index.html',
    './manifest.json',
    './csv-import.js',
    './auto-loader.js',
    './cache-manager.js'
];

// Files to cache when possible (non-blocking)
const OPTIONAL_FILES = [
    './default-data.js',
    './quick-start.js',
    './import-utility.html',
    './scripts/main.js',
    './scripts/data-manager.js',
    './scripts/statistics.js',
    './scripts/chart-manager.js',
    './scripts/utils.js',
    './styles/main.css',
    './styles/components.css',
    './styles/responsive.css'
];

// External resources to cache
const EXTERNAL_RESOURCES = [
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.4.1/papaparse.min.js'
];

// Install event - cache core files
self.addEventListener('install', (event) => {
    console.log(`Service Worker ${CACHE_VERSION}: Installing`);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                // Cache core files (required)
                console.log('Caching core files...');
                await cache.addAll(CORE_FILES);
                
                // Cache optional files (non-blocking)
                console.log('Caching optional files...');
                await Promise.allSettled(
                    OPTIONAL_FILES.map(url => 
                        cache.add(url).catch(err => 
                            console.log(`Optional file not cached: ${url}`)
                        )
                    )
                );
                
                // Cache external resources (non-blocking)
                console.log('Caching external resources...');
                await Promise.allSettled(
                    EXTERNAL_RESOURCES.map(url => 
                        fetch(url)
                            .then(response => {
                                if (response.ok) {
                                    return cache.put(url, response);
                                }
                            })
                            .catch(err => 
                                console.log(`External resource not cached: ${url}`)
                            )
                    )
                );
                
                console.log(`Service Worker ${CACHE_VERSION}: Installation complete`);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log(`Service Worker ${CACHE_VERSION}: Activating`);
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            return cacheName.startsWith('pekkas-pokal') && 
                                   cacheName !== CACHE_NAME && 
                                   cacheName !== DATA_CACHE_NAME;
                        })
                        .map(cacheName => {
                            console.log(`Deleting old cache: ${cacheName}`);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => self.clients.claim())
            .then(() => {
                console.log(`Service Worker ${CACHE_VERSION}: Activation complete`);
            })
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Handle API/data requests differently
    if (url.pathname.includes('/api/') || url.pathname.endsWith('.json')) {
        event.respondWith(handleDataRequest(request));
        return;
    }
    
    // Handle CSV files with special caching
    if (url.pathname.endsWith('.csv')) {
        event.respondWith(handleCSVRequest(request));
        return;
    }
    
    // Handle all other requests
    event.respondWith(handleGeneralRequest(request));
});

/**
 * Handle general requests (cache-first strategy)
 */
async function handleGeneralRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // Return cached version and update in background
            updateCacheInBackground(request);
            return cachedResponse;
        }
        
        // Not in cache, try network
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.error('Fetch failed:', error);
        
        // Return offline page if available
        if (request.destination === 'document') {
            const offlineResponse = await caches.match('./index.html');
            if (offlineResponse) {
                return offlineResponse;
            }
        }
        
        // Return a custom offline response
        return new Response('Offline - Content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/**
 * Handle data/API requests (network-first strategy)
 */
async function handleDataRequest(request) {
    const cache = await caches.open(DATA_CACHE_NAME);
    
    try {
        // Try network first for fresh data
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Update cache with fresh data
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        
    } catch (error) {
        console.log('Network request failed, checking cache...');
    }
    
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        console.log('Serving data from cache');
        return cachedResponse;
    }
    
    // Both failed, return error
    return new Response(JSON.stringify({ 
        error: 'Data not available offline' 
    }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Handle CSV requests with smart caching
 */
async function handleCSVRequest(request) {
    const cache = await caches.open(DATA_CACHE_NAME);
    
    try {
        // Check if we have a recent cached version
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            const cachedDate = new Date(cachedResponse.headers.get('date'));
            const now = new Date();
            const hoursSinceCache = (now - cachedDate) / (1000 * 60 * 60);
            
            // If cache is less than 1 hour old, use it
            if (hoursSinceCache < 1) {
                console.log('Using fresh cached CSV');
                return cachedResponse;
            }
        }
        
        // Try to fetch fresh CSV
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the fresh response
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        
    } catch (error) {
        console.log('CSV fetch failed, using cache if available');
    }
    
    // Return cached version if available
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // No cache available, return embedded CSV data
    return new Response(getEmbeddedCSV(), {
        status: 200,
        headers: { 'Content-Type': 'text/csv' }
    });
}

/**
 * Update cache in background without blocking
 */
async function updateCacheInBackground(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            cache.put(request, networkResponse);
        }
    } catch (error) {
        // Silent fail - this is background update
    }
}

/**
 * Get embedded CSV data as fallback
 */
function getEmbeddedCSV() {
    return `År,Tävling,Plats,Arrangör 3:a,Arrangör näst sist,Olov Melander,Mikael Hägglund,Viktor Jones,Per Wikman,Erik Vallgren,Henrik Lundqvist,Rickard Nilsson,Niklas Norberg,Per Olsson,Tobias Lundqvist,Lars Sandin,Ludvig Ulenius,Jonas Eriksson
2011,Fantasy Premier League,,,,-,3,2,-,-,-,1,-,-,-,-,-,-
2012,Gokart,Varggropen,,,-,7,3,4,2,,5,-,-,-,-,,1
2013,Femkamp,Kroksta,,,-,4,6,2,1,3,5,7,-,-,-,-,-
2014,Mångkamp Uppsala,Uppsala,,,,,,,1,,,,,,,,-
2015,Bondespelen,Billsta,,,,,,1,,,3,,,,,,2
2016,Mångkamp Lundqvist,,,,7,5,9,3,10,11,4,1,,2,,8,6
2017,Triathlon,Lomsjön,,,-,3,1,2,6,8,7,9,-,4,-,5,-
2018,Kortspel Ambition,Kungsholmen,,,5,3,4,8,2,6,-,1,-,7,,-,-
2019,Pingis,Bredbyn,,,8,9,1,10,6,3,2,7,5,4,-,11,-
2020,Covid,,,,,,,,,,,,,,,,-
2021,Målning,Ås,,,1,-,6,5,7,9,10,8,4,2,-,3,-
2022,Skytte,Arnäsvall,,,5,9,3,10,-,7,4,8,6,2,-,1,-
2023,Fäkting,Stockholm,Viktor Jones,Mikael Hägglund,,3,10,1,,,2,,9,4,-,-,-
2024-08-17,Fisketävling,Själevad,Tobias Lundqvist,Per Olsson,7,10,4,9,1,2,12,5,3,11,8,6,-
2025-08-16,Flipper,Eskilstuna/Västerås,Viktor Jones,Mikael Hägglund,2,7,1,11,10,5,9,12,3,6,4,8,-`;
}

// Message handler for cache control
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CLEAR_CACHE':
            event.waitUntil(
                caches.keys()
                    .then(names => Promise.all(
                        names.map(name => caches.delete(name))
                    ))
                    .then(() => {
                        event.ports[0].postMessage({ 
                            success: true, 
                            message: 'All caches cleared' 
                        });
                    })
                    .catch(error => {
                        event.ports[0].postMessage({ 
                            success: false, 
                            error: error.message 
                        });
                    })
            );
            break;
            
        case 'CACHE_STATUS':
            event.waitUntil(
                caches.keys()
                    .then(async names => {
                        const status = {};
                        for (const name of names) {
                            const cache = await caches.open(name);
                            const keys = await cache.keys();
                            status[name] = keys.length;
                        }
                        event.ports[0].postMessage({ 
                            success: true, 
                            caches: status 
                        });
                    })
            );
            break;
            
        case 'UPDATE_CHECK':
            event.waitUntil(
                self.registration.update()
                    .then(() => {
                        event.ports[0].postMessage({ 
                            success: true, 
                            message: 'Update check complete' 
                        });
                    })
            );
            break;
    }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-data') {
        console.log('Background sync: Updating data...');
        event.waitUntil(updateDataInBackground());
    }
});

/**
 * Update data in background
 */
async function updateDataInBackground() {
    try {
        const cache = await caches.open(DATA_CACHE_NAME);
        
        // Update CSV file
        const csvResponse = await fetch('./Pekkas Pokal Marathontabell Marathontabell.csv');
        if (csvResponse.ok) {
            await cache.put('./Pekkas Pokal Marathontabell Marathontabell.csv', csvResponse);
        }
        
        // Notify clients of update
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'DATA_UPDATED',
                timestamp: new Date().toISOString()
            });
        });
        
    } catch (error) {
        console.error('Background update failed:', error);
    }
}

console.log(`Service Worker ${CACHE_VERSION} loaded`);