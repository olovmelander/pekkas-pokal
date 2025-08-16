// app-config.js - Centralized configuration
window.AppConfig = {
    // Data settings
    csvFileName: 'Pekkas Pokal Marathontabell Marathontabell.csv',
    cacheTimeout: 60 * 60 * 1000, // 1 hour
    maxRetries: 3,
    retryDelay: 1000,
    
    // Storage keys
    storageKeys: {
        data: 'pekkas-pokal-data',
        settings: 'pekkas-pokal-settings',
        backup: 'pekkas-pokal-backup'
    },
    
    // Feature flags
    features: {
        autoRefresh: true,
        backgroundSync: true,
        offlineMode: true,
        achievements: true,
        arrangerTracking: true
    },
    
    // Performance settings
    performance: {
        debounceDelay: 300,
        throttleDelay: 1000,
        animationDuration: 300
    },
    
    // Debug settings
    debug: location.hostname === 'localhost',
    
    // Version
    version: '2.3.0'
};