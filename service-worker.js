// KnowledgeVault Service Worker - Offline Support

const CACHE_NAME = 'knowledgevault-v1';
const CACHE_VERSION = '1.0.0';

// Files to cache for offline functionality
const STATIC_CACHE_FILES = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/components.css',
  '/css/responsive.css',
  '/css/print.css',
  '/js/core/EventBus.js',
  '/js/core/StorageManager.js',
  '/js/core/KnowledgeCore.js',
  '/js/features/AudioRecorder.js',
  '/js/features/GeoLocator.js',
  '/js/features/ImageProcessor.js',
  '/js/features/SearchEngine.js',
  '/js/ui/FormController.js',
  '/js/ui/NavigationHandler.js',
  '/js/ui/ViewRenderer.js',
  '/js/utils/DataValidator.js',
  '/js/utils/ExportManager.js',
  '/js/utils/TranslationBridge.js',
  '/manifest.json',
  '/assets/icons/favicon.ico',
  '/assets/icons/apple-touch-icon.png'
];

// External resources to cache
const EXTERNAL_CACHE_FILES = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Runtime caching strategies
const RUNTIME_CACHE_PATTERNS = {
  // Cache OpenStreetMap tiles for offline maps
  maps: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\//,
  // Cache CDN resources
  cdn: /^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//,
  // Cache API responses (with short TTL)
  api: /^https:\/\/(nominatim\.openstreetmap\.org|api\.)/
};

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    Promise.all([
      // Cache static files
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_CACHE_FILES);
      }),
      
      // Cache external resources
      caches.open(`${CACHE_NAME}-external`).then((cache) => {
        console.log('[SW] Caching external resources');
        return cache.addAll(EXTERNAL_CACHE_FILES);
      })
    ]).then(() => {
      console.log('[SW] Installation complete');
      // Take control immediately
      return self.skipWaiting();
    }).catch((error) => {
      console.error('[SW] Installation failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old caches that don't match current version
          if (cacheName.startsWith('knowledgevault-') && 
              cacheName !== CACHE_NAME && 
              !cacheName.startsWith(`${CACHE_NAME}-`)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activation complete');
      // Take control of all clients
      return self.clients.claim();
    })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  const url = new URL(event.request.url);
  
  // Handle different types of requests
  if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(event.request));
  } else if (isMapTile(url)) {
    event.respondWith(handleMapTile(event.request));
  } else if (isCDNResource(url)) {
    event.respondWith(handleCDNResource(event.request));
  } else if (isAPIRequest(url)) {
    event.respondWith(handleAPIRequest(event.request));
  } else if (isNavigationRequest(event.request)) {
    event.respondWith(handleNavigation(event.request));
  }
});

// Check if request is for static asset
function isStaticAsset(url) {
  return url.origin === location.origin && 
         (url.pathname.startsWith('/css/') || 
          url.pathname.startsWith('/js/') || 
          url.pathname.startsWith('/assets/') ||
          url.pathname === '/manifest.json');
}

// Check if request is for map tile
function isMapTile(url) {
  return RUNTIME_CACHE_PATTERNS.maps.test(url.href);
}

// Check if request is for CDN resource
function isCDNResource(url) {
  return RUNTIME_CACHE_PATTERNS.cdn.test(url.href);
}

// Check if request is for API
function isAPIRequest(url) {
  return RUNTIME_CACHE_PATTERNS.api.test(url.href);
}

// Check if request is navigation
function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

// Handle static assets - Cache First strategy
async function handleStaticAsset(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Static asset fetch failed:', error);
    // Return a generic offline page if available
    return caches.match('/index.html');
  }
}

// Handle map tiles - Cache First with long TTL
async function handleMapTile(request) {
  const cache = await caches.open(`${CACHE_NAME}-maps`);
  
  try {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache map tiles for extended period
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return cached version if network fails
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return a placeholder tile if no cache available
    return new Response('', { status: 404 });
  }
}

// Handle CDN resources - Cache First strategy
async function handleCDNResource(request) {
  const cache = await caches.open(`${CACHE_NAME}-external`);
  
  try {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    return cachedResponse || new Response('', { status: 404 });
  }
}

// Handle API requests - Network First with cache fallback
async function handleAPIRequest(request) {
  const cache = await caches.open(`${CACHE_NAME}-api`);
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful API responses
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    // If network request fails, try cache
    const cachedResponse = await cache.match(request);
    return cachedResponse || networkResponse;
    
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return error response if no cache
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle navigation requests - serve index.html for SPA routing
async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] Navigation fetch failed, serving cached index.html');
  }
  
  // Serve cached index.html for SPA routing
  const cache = await caches.open(CACHE_NAME);
  return cache.match('/index.html') || cache.match('/');
}

// Background sync for data synchronization
self.addEventListener('sync', (event) => {
  if (event.tag === 'knowledge-sync') {
    event.waitUntil(syncKnowledgeData());
  }
});

// Sync knowledge data when connection is restored
async function syncKnowledgeData() {
  try {
    console.log('[SW] Syncing knowledge data...');
    
    // Get pending data from IndexedDB
    const pendingData = await getPendingData();
    
    if (pendingData.length > 0) {
      // Send data to server when online
      for (const item of pendingData) {
        try {
          await syncDataItem(item);
          await markDataAsSynced(item.id);
        } catch (error) {
          console.error('[SW] Failed to sync item:', error);
        }
      }
    }
    
    console.log('[SW] Knowledge data sync complete');
  } catch (error) {
    console.error('[SW] Knowledge data sync failed:', error);
  }
}

// Helper functions for data sync (placeholders)
async function getPendingData() {
  // This would integrate with the IndexedDB storage
  return [];
}

async function syncDataItem(item) {
  // This would send data to the server
  console.log('[SW] Syncing item:', item);
}

async function markDataAsSynced(id) {
  // This would mark the item as synced in IndexedDB
  console.log('[SW] Marked as synced:', id);
}

// Handle push notifications (for future enhancement)
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }
  
  const data = event.data.json();
  const title = data.title || 'KnowledgeVault';
  const options = {
    body: data.body || 'You have new knowledge to review',
    icon: '/assets/icons/favicon.ico',
    badge: '/assets/icons/badge.png',
    data: data.url || '/',
    tag: 'knowledge-notification'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data || '/';
  
  event.waitUntil(
    clients.matchAll().then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If app is not open, open it
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});

// Cleanup on unload
self.addEventListener('beforeunload', () => {
  // Cleanup tasks if needed
  console.log('[SW] Service worker unloading');
});

console.log('[SW] Service worker loaded successfully');