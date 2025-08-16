/**
 * Improved Auto Data Loader for Pekkas Pokal
 * Consolidates loading logic and provides better error handling
 * Replace auto-loader.js with this version
 */

class AutoDataLoader {
    constructor() {
        this.csvFileName = 'Pekkas Pokal Marathontabell Marathontabell.csv';
        this.storageKey = 'pekkas-pokal-data';
        this.initialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.dataCheckInterval = null;
    }

    /**
     * Initialize and load data automatically
     */
    async init() {
        console.log('🚀 AutoDataLoader: Initializing...');
        
        try {
            // Check if we already have fresh data
            const existingData = this.getStoredData();
            if (existingData && this.isDataFresh(existingData)) {
                console.log('✅ Using cached data (still fresh)');
                window.competitionData = existingData;
                this.initialized = true;
                this.triggerUIUpdate();
                return true;
            }

            // Load new data
            const success = await this.loadData();
            
            if (success) {
                this.initialized = true;
                this.setupAutoRefresh();
                console.log('✅ AutoDataLoader: Successfully initialized');
            } else {
                console.warn('⚠️ AutoDataLoader: Using stale cached data');
            }
            
            return success;
            
        } catch (error) {
            console.error('❌ AutoDataLoader: Failed to initialize', error);
            await this.handleLoadFailure(error);
            return false;
        }
    }

    /**
     * Load data with intelligent retry logic
     */
    async loadData() {
        // Try CSV importer first (it has Papa Parse with fallback)
        if (window.csvImporter) {
            try {
                console.log('📊 Loading via CSV importer...');
                const data = await window.csvImporter.init();
                if (data) {
                    window.competitionData = data;
                    this.saveData(data);
                    this.triggerUIUpdate();
                    return true;
                }
            } catch (error) {
                console.warn('CSV importer failed:', error);
            }
        }

        // Fallback to direct load
        try {
            console.log('📄 Attempting direct CSV load...');
            const csvContent = await this.loadCSVDirect();
            if (csvContent) {
                const data = await this.parseCSVContent(csvContent);
                window.competitionData = data;
                this.saveData(data);
                this.triggerUIUpdate();
                return true;
            }
        } catch (error) {
            console.warn('Direct load failed:', error);
        }

        // Last resort: use cached data even if stale
        const cachedData = this.getStoredData();
        if (cachedData) {
            console.warn('⚠️ Using stale cached data as fallback');
            window.competitionData = cachedData;
            this.triggerUIUpdate();
            return true;
        }

        return false;
    }

    /**
     * Load CSV directly with multiple methods
     */
    async loadCSVDirect() {
        const methods = [
            () => this.loadViaFetch(),
            () => this.loadViaXHR(),
            () => this.loadViaFileAPI()
        ];

        for (const method of methods) {
            try {
                const content = await method();
                if (content) return content;
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    /**
     * Load via fetch API
     */
    async loadViaFetch() {
        const response = await fetch(this.csvFileName);
        if (response.ok) {
            return await response.text();
        }
        throw new Error('Fetch failed');
    }

    /**
     * Load via XMLHttpRequest (older browser support)
     */
    loadViaXHR() {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', this.csvFileName, true);
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(xhr.responseText);
                } else {
                    reject(new Error('XHR failed'));
                }
            };
            xhr.onerror = reject;
            xhr.send();
        });
    }

    /**
     * Load via File API if available
     */
    async loadViaFileAPI() {
        if (window.fs && window.fs.readFile) {
            return await window.fs.readFile(this.csvFileName, { encoding: 'utf8' });
        }
        throw new Error('File API not available');
    }

    /**
     * Parse CSV content (native fallback parser)
     */
    async parseCSVContent(csvContent) {
        // This is a simplified version - the csv-import.js has the full implementation
        const lines = csvContent.trim().split(/\r?\n/);
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index]?.trim() || '';
            });
            data.push(row);
        }

        // Transform to app format
        return this.transformToAppFormat(data, headers);
    }

    /**
     * Transform CSV data to app format
     */
    transformToAppFormat(rows, headers) {
        // Simplified transformation - full version in csv-import.js
        const fixedColumns = ['År', 'Tävling', 'Plats', 'Arrangör 3:a', 'Arrangör näst sist'];
        const participantNames = headers.filter(h => 
            h && !fixedColumns.includes(h) && h.trim() !== ''
        );

        const participants = participantNames.map(name => ({
            id: 'p_' + Math.random().toString(36).substr(2, 9),
            name: name.trim(),
            nickname: name.split(' ')[0] + ' ' + (name.split(' ').pop()[0] || '') + '.',
            status: 'active'
        }));

        const competitions = rows.map(row => ({
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            year: parseInt(row['År']),
            name: row['Tävling'],
            location: row['Plats'] || '',
            winner: null,
            scores: {},
            arranger3rd: row['Arrangör 3:a'] || '',
            arrangerSecondLast: row['Arrangör näst sist'] || ''
        })).filter(c => c.year && c.name);

        return {
            competitions,
            participants,
            initialized: true,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Check if stored data is fresh (less than 1 hour old)
     */
    isDataFresh(data) {
        if (!data.lastUpdated) return false;
        
        const dataAge = Date.now() - new Date(data.lastUpdated).getTime();
        const oneHour = 60 * 60 * 1000;
        
        return dataAge < oneHour;
    }

    /**
     * Get stored data from localStorage with validation
     */
    getStoredData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return null;
            
            const data = JSON.parse(stored);
            
            // Validate data structure
            if (data && data.competitions && data.participants) {
                return data;
            }
            
            console.warn('Invalid stored data structure');
            return null;
            
        } catch (error) {
            console.error('Failed to parse stored data:', error);
            localStorage.removeItem(this.storageKey); // Clear corrupted data
            return null;
        }
    }

    /**
     * Save data to localStorage with compression
     */
    saveData(data) {
        try {
            // Add metadata
            data.lastUpdated = new Date().toISOString();
            data.version = '2.1';
            
            const dataStr = JSON.stringify(data);
            
            // Check localStorage quota
            const sizeInBytes = new Blob([dataStr]).size;
            console.log(`💾 Saving data (${(sizeInBytes / 1024).toFixed(2)} KB)`);
            
            localStorage.setItem(this.storageKey, dataStr);
            
            // Also save a backup
            this.saveBackup(data);
            
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('localStorage quota exceeded, clearing old data...');
                this.clearOldData();
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify(data));
                } catch (e) {
                    console.error('Failed to save even after clearing:', e);
                }
            } else {
                console.error('Failed to save data:', error);
            }
        }
    }

    /**
     * Save backup to IndexedDB (more storage space)
     */
    async saveBackup(data) {
        if (!window.indexedDB) return;
        
        try {
            const db = await this.openDB();
            const tx = db.transaction(['backups'], 'readwrite');
            const store = tx.objectStore('backups');
            
            await store.put({
                id: 'latest',
                data: data,
                timestamp: Date.now()
            });
            
            console.log('✅ Backup saved to IndexedDB');
        } catch (error) {
            console.warn('Failed to save backup:', error);
        }
    }

    /**
     * Open IndexedDB
     */
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PekkasPokalDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('backups')) {
                    db.createObjectStore('backups', { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Clear old data from localStorage
     */
    clearOldData() {
        const keysToKeep = [this.storageKey, 'pekkas-pokal-settings'];
        const allKeys = Object.keys(localStorage);
        
        allKeys.forEach(key => {
            if (!keysToKeep.includes(key) && key.startsWith('pekkas-pokal')) {
                localStorage.removeItem(key);
            }
        });
    }

    /**
     * Trigger UI update
     */
    triggerUIUpdate() {
        // Trigger various update methods if they exist
        const updateMethods = [
            'updateAllViews',
            'loadDashboard',
            'loadCompetitions',
            'refreshUI'
        ];

        updateMethods.forEach(method => {
            if (typeof window[method] === 'function') {
                try {
                    window[method]();
                } catch (error) {
                    console.warn(`Failed to call ${method}:`, error);
                }
            }
        });

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('dataLoaded', { 
            detail: { 
                competitions: window.competitionData?.competitions?.length || 0,
                participants: window.competitionData?.participants?.length || 0
            } 
        }));
    }

    /**
     * Handle load failure with user notification
     */
    async handleLoadFailure(error) {
        console.error('Load failure:', error);
        
        // Try to restore from IndexedDB backup
        if (window.indexedDB) {
            try {
                const db = await this.openDB();
                const tx = db.transaction(['backups'], 'readonly');
                const store = tx.objectStore('backups');
                const backup = await store.get('latest');
                
                if (backup && backup.data) {
                    console.log('📦 Restored from IndexedDB backup');
                    window.competitionData = backup.data;
                    this.triggerUIUpdate();
                    return;
                }
            } catch (e) {
                console.warn('Failed to restore from backup:', e);
            }
        }

        // Show user notification if app is ready
        if (window.app && window.app.showNotification) {
            window.app.showNotification(
                'Kunde inte ladda data. Använder cached version.',
                'warning'
            );
        }
    }

    /**
     * Setup auto-refresh every hour
     */
    setupAutoRefresh() {
        // Clear any existing interval
        if (this.dataCheckInterval) {
            clearInterval(this.dataCheckInterval);
        }

        // Check for updates every hour
        this.dataCheckInterval = setInterval(() => {
            console.log('🔄 Checking for data updates...');
            this.checkForUpdates();
        }, 60 * 60 * 1000); // 1 hour
    }

    /**
     * Check for updates
     */
    async checkForUpdates() {
        try {
            const currentData = window.competitionData;
            const newData = await this.loadData();
            
            if (newData && this.hasDataChanged(currentData, newData)) {
                console.log('📊 New data available, updating...');
                this.triggerUIUpdate();
                
                if (window.app && window.app.showNotification) {
                    window.app.showNotification(
                        'Data uppdaterad!',
                        'success'
                    );
                }
            }
        } catch (error) {
            console.warn('Update check failed:', error);
        }
    }

    /**
     * Check if data has changed
     */
    hasDataChanged(oldData, newData) {
        if (!oldData || !newData) return true;
        
        // Simple comparison - can be made more sophisticated
        return (
            oldData.competitions?.length !== newData.competitions?.length ||
            oldData.participants?.length !== newData.participants?.length ||
            oldData.lastUpdated !== newData.lastUpdated
        );
    }

    /**
     * Manual refresh
     */
    async refresh() {
        console.log('🔄 Manual refresh triggered');
        this.retryCount = 0;
        return await this.loadData();
    }
}

// Create and initialize global instance
window.autoDataLoader = new AutoDataLoader();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await window.autoDataLoader.init();
    });
} else {
    // DOM already loaded
    window.autoDataLoader.init();
}

// Listen for data update requests
window.addEventListener('requestDataUpdate', async () => {
    await window.autoDataLoader.refresh();
});

// Provide global refresh function
window.refreshData = async function() {
    return await window.autoDataLoader.refresh();
};

console.log('✨ Improved AutoDataLoader ready');
console.log('Use window.refreshData() to manually refresh');