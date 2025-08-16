/**
 * Cache Manager - Handles browser caching issues
 * Provides tools to force refresh and clear caches
 */

class CacheManager {
  constructor() {
    this.isServiceWorkerSupported = 'serviceWorker' in navigator;
    this.registration = null;
    this.setupServiceWorkerListener();
  }

  /**
   * Initialize cache manager
   */
  async init() {
    if (!this.isServiceWorkerSupported) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      this.registration = await navigator.serviceWorker.getRegistration();
      if (this.registration) {
        console.log('Service Worker found');
        this.checkForUpdates();
      }
    } catch (error) {
      console.error('Failed to get service worker registration:', error);
    }
  }

  /**
   * Setup service worker message listener
   */
  setupServiceWorkerListener() {
    if (!this.isServiceWorkerSupported) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, version } = event.data || {};
      
      switch (type) {
        case 'CACHE_UPDATED':
          console.log('Cache updated to version:', version);
          this.showUpdateNotification();
          break;
          
        case 'CACHE_CLEARED':
          console.log('Cache cleared successfully');
          this.showSuccessNotification('Cache rensad framgångsrikt');
          break;
      }
    });
  }

  /**
   * Force clear all caches
   */
  async clearAllCaches() {
    try {
      console.log('Clearing all caches...');
      
      // Clear browser caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }

      // Clear localStorage
      if ('localStorage' in window) {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('pekkas-pokal')) {
            localStorage.removeItem(key);
          }
        });
      }

      // Clear sessionStorage
      if ('sessionStorage' in window) {
        sessionStorage.clear();
      }

      // Send message to service worker
      if (this.registration && this.registration.active) {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          console.log('Service worker response:', event.data);
        };

        this.registration.active.postMessage(
          { type: 'CLEAR_CACHE' },
          [messageChannel.port2]
        );
      }

      console.log('All caches cleared');
      return true;

    } catch (error) {
      console.error('Failed to clear caches:', error);
      throw error;
    }
  }

  /**
   * Force update service worker
   */
  async forceUpdate() {
    if (!this.registration) {
      throw new Error('No service worker registration found');
    }

    try {
      console.log('Forcing service worker update...');
      
      // Force update
      await this.registration.update();
      
      // Send skip waiting message if there's a waiting worker
      if (this.registration.waiting) {
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      return true;

    } catch (error) {
      console.error('Failed to force update:', error);
      throw error;
    }
  }

  /**
   * Check for service worker updates
   */
  async checkForUpdates() {
    if (!this.registration) return;

    try {
      // Check for updates
      await this.registration.update();
      
      // Listen for new service worker
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New service worker available');
              this.showUpdateNotification();
            }
          });
        }
      });

    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  /**
   * Hard refresh the page (bypasses cache)
   */
  hardRefresh() {
    console.log('Performing hard refresh...');
    
    // Method 1: location.reload with force
    if ('location' in window) {
      window.location.reload(true);
      return;
    }
    
    // Method 2: replace current location
    window.location.replace(window.location.href + '?t=' + Date.now());
  }

  /**
   * Soft refresh (normal reload)
   */
  softRefresh() {
    console.log('Performing soft refresh...');
    window.location.reload();
  }

  /**
   * Show update notification
   */
  showUpdateNotification() {
    if (window.app && window.app.showNotification) {
      window.app.showNotification(
        'Ny version tillgänglig! Ladda om sidan för att använda den.',
        'info',
        0 // Persistent notification
      );
    } else {
      // Fallback notification
      if (confirm('Ny version tillgänglig! Vill du ladda om sidan?')) {
        this.softRefresh();
      }
    }
  }

  /**
   * Show success notification
   */
  showSuccessNotification(message) {
    if (window.app && window.app.showNotification) {
      window.app.showNotification(message, 'success');
    } else {
      console.log(message);
    }
  }

  /**
   * Get cache status
   */
  async getCacheStatus() {
    const status = {
      serviceWorkerSupported: this.isServiceWorkerSupported,
      serviceWorkerRegistered: !!this.registration,
      caches: [],
      localStorage: {},
      sessionStorage: {}
    };

    try {
      // Get cache names
      if ('caches' in window) {
        status.caches = await caches.keys();
      }

      // Get localStorage items
      if ('localStorage' in window) {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('pekkas-pokal')) {
            status.localStorage[key] = localStorage.getItem(key)?.length || 0;
          }
        });
      }

      // Get sessionStorage items
      if ('sessionStorage' in window) {
        Object.keys(sessionStorage).forEach(key => {
          status.sessionStorage[key] = sessionStorage.getItem(key)?.length || 0;
        });
      }

    } catch (error) {
      console.error('Failed to get cache status:', error);
    }

    return status;
  }

  /**
   * Create cache control UI
   */
  createCacheControlUI() {
    const container = document.createElement('div');
    container.id = 'cache-control';
    container.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: white;
      border: 2px solid #667eea;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: Inter, sans-serif;
      display: none;
    `;

    container.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <h3 style="margin: 0; color: #667eea;">🔧 Cache Control</h3>
        <button id="close-cache-control" style="margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="hard-refresh-btn" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🔄 Hard Refresh
        </button>
        <button id="clear-cache-btn" style="padding: 8px 16px; background: #f87171; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🗑️ Clear All Caches
        </button>
        <button id="force-update-btn" style="padding: 8px 16px; background: #4ade80; color: white; border: none; border-radius: 5px; cursor: pointer;">
          ⬆️ Force Update
        </button>
        <button id="cache-status-btn" style="padding: 8px 16px; background: #64748b; color: white; border: none; border-radius: 5px; cursor: pointer;">
          📊 Cache Status
        </button>
      </div>
      
      <div id="cache-status-display" style="margin-top: 10px; padding: 10px; background: #f1f5f9; border-radius: 5px; font-size: 12px; max-height: 200px; overflow-y: auto; display: none;"></div>
    `;

    document.body.appendChild(container);

    // Add event listeners
    document.getElementById('close-cache-control').addEventListener('click', () => {
      container.style.display = 'none';
    });

    document.getElementById('hard-refresh-btn').addEventListener('click', () => {
      this.hardRefresh();
    });

    document.getElementById('clear-cache-btn').addEventListener('click', async () => {
      if (confirm('Är du säker på att du vill rensa alla caches?')) {
        try {
          await this.clearAllCaches();
          alert('Alla caches rensade! Sidan kommer att laddas om.');
          this.hardRefresh();
        } catch (error) {
          alert('Fel vid rensning av cache: ' + error.message);
        }
      }
    });

    document.getElementById('force-update-btn').addEventListener('click', async () => {
      try {
        await this.forceUpdate();
        alert('Uppdatering framtvingad! Sidan kommer att laddas om.');
        this.softRefresh();
      } catch (error) {
        alert('Fel vid uppdatering: ' + error.message);
      }
    });

    document.getElementById('cache-status-btn').addEventListener('click', async () => {
      const statusDisplay = document.getElementById('cache-status-display');
      const status = await this.getCacheStatus();
      
      statusDisplay.innerHTML = `
        <strong>Service Worker:</strong> ${status.serviceWorkerRegistered ? 'Registrerad' : 'Inte registrerad'}<br>
        <strong>Caches:</strong> ${status.caches.length} stycken<br>
        ${status.caches.map(cache => `• ${cache}`).join('<br>')}<br>
        <strong>LocalStorage:</strong> ${Object.keys(status.localStorage).length} objekt<br>
        <strong>SessionStorage:</strong> ${Object.keys(status.sessionStorage).length} objekt
      `;
      
      statusDisplay.style.display = statusDisplay.style.display === 'none' ? 'block' : 'none';
    });

    return container;
  }

  /**
   * Show cache control UI
   */
  showCacheControl() {
    let control = document.getElementById('cache-control');
    
    if (!control) {
      control = this.createCacheControlUI();
    }
    
    control.style.display = 'block';
  }

  /**
   * Add cache control keyboard shortcut
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+C to show cache control
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.showCacheControl();
      }
      
      // Ctrl+Shift+R for hard refresh
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        this.hardRefresh();
      }
    });
  }
}

// Create global instance
window.cacheManager = new CacheManager();

// Global functions
window.clearAllCaches = async function() {
  return await window.cacheManager.clearAllCaches();
};

window.hardRefresh = function() {
  window.cacheManager.hardRefresh();
};

window.showCacheControl = function() {
  window.cacheManager.showCacheControl();
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.cacheManager.init();
    window.cacheManager.setupKeyboardShortcuts();
  });
} else {
  window.cacheManager.init();
  window.cacheManager.setupKeyboardShortcuts();
}

console.log('Cache Manager loaded');
console.log('Keyboard shortcuts:');
console.log('- Ctrl+Shift+C: Show cache control');
console.log('- Ctrl+Shift+R: Hard refresh');
console.log('Available functions:');
console.log('- clearAllCaches() - Clear all browser caches');
console.log('- hardRefresh() - Hard refresh page');
console.log('- showCacheControl() - Show cache control UI');