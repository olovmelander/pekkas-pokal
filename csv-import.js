/**
 * Enhanced CSV Import System with Native Fallback and Arranger Support
 * Replaces the existing csv-import.js file
 * Handles arrangers and provides reliable cross-browser support
 */

class EnhancedCSVImporter {
    constructor() {
        this.csvFileName = 'Pekkas Pokal Marathontabell Marathontabell.csv';
        this.papaParseLoaded = false;
        this.data = null;
        this.isProcessing = false;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }
    
    /**
     * Initialize and auto-import CSV data
     */
    async init() {
        console.log('🚀 Enhanced CSV Importer initializing...');
        
        try {
            // Try to load Papa Parse, but have fallback
            await this.ensurePapaParseLoaded();
            
            // Load and process CSV
            const csvContent = await this.loadCSVContent();
            if (csvContent) {
                this.data = await this.processCSV(csvContent);
                console.log('✅ CSV data loaded successfully!');
                
                // Store in global variable for app access
                window.competitionData = this.data;
                
                // Save to localStorage for persistence
                this.saveToLocalStorage(this.data);
                
                // Trigger app update if available
                if (window.updateAllViews) {
                    window.updateAllViews();
                }
                
                return this.data;
            }
        } catch (error) {
            console.error('CSV import error:', error);
            // Try to load from localStorage as fallback
            return this.loadFromLocalStorage();
        }
    }
    
    /**
     * Import CSV data with retry mechanism (legacy compatibility)
     */
    async importCSVData(file = null, csvContent = null) {
        if (this.isProcessing) {
            throw new Error('Import redan pågår');
        }

        this.isProcessing = true;
        let attempt = 0;

        while (attempt < this.retryAttempts) {
            try {
                console.log(`Import attempt ${attempt + 1}/${this.retryAttempts}`);
                
                let content = csvContent;
                
                if (!content && file) {
                    content = await this.readFile(file);
                } else if (!content && !file) {
                    content = await this.loadCSVContent();
                }

                if (!content) {
                    throw new Error('Ingen CSV-data tillgänglig');
                }

                const result = await this.processCSV(content);
                this.isProcessing = false;
                return result;

            } catch (error) {
                attempt++;
                console.error(`Import attempt ${attempt} failed:`, error);
                
                if (attempt >= this.retryAttempts) {
                    this.isProcessing = false;
                    // Don't throw Papa Parse error, use fallback
                    if (error.message.includes('Papa Parse')) {
                        console.log('Using native parser instead of Papa Parse');
                        const content = csvContent || await this.loadCSVContent();
                        return this.processWithNativeParser(content);
                    }
                    throw new Error(`Import misslyckades: ${error.message}`);
                }
                
                await this.wait(this.retryDelay * attempt);
            }
        }
    }
    
    /**
     * Ensure Papa Parse is loaded with multiple fallback CDNs
     */
    async ensurePapaParseLoaded() {
        if (typeof Papa !== 'undefined') {
            this.papaParseLoaded = true;
            return;
        }
        
        const cdnUrls = [
            'https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.4.1/papaparse.min.js',
            'https://unpkg.com/papaparse@5.4.1/papaparse.min.js',
            'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'
        ];
        
        for (const url of cdnUrls) {
            try {
                await this.loadScript(url);
                if (typeof Papa !== 'undefined') {
                    this.papaParseLoaded = true;
                    console.log('✅ Papa Parse loaded from:', url);
                    return;
                }
            } catch (error) {
                console.warn('Failed to load Papa Parse from:', url);
            }
        }
        
        console.warn('⚠️ Papa Parse not available, using native parser');
        this.papaParseLoaded = false;
    }
    
    /**
     * Load script dynamically
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * Read file with better error handling
     */
    async readFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('Ingen fil vald'));
                return;
            }

            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    if (!content || content.length === 0) {
                        reject(new Error('Filen är tom'));
                        return;
                    }
                    resolve(content);
                } catch (error) {
                    reject(new Error('Kunde inte läsa filinnehåll'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Fel vid filläsning'));
            };
            
            reader.readAsText(file, 'UTF-8');
        });
    }
    
    /**
     * Load CSV content from file or embedded data
     */
    async loadCSVContent() {
        // Try multiple methods to get CSV content
        
        // Method 1: Try window.fs API if available
        if (window.fs && window.fs.readFile) {
            try {
                const content = await window.fs.readFile(this.csvFileName, { encoding: 'utf8' });
                console.log('CSV loaded via fs.readFile');
                return content;
            } catch (e) {
                console.log('fs.readFile not available');
            }
        }
        
        // Method 2: Try fetch
        try {
            const response = await fetch(this.csvFileName);
            if (response.ok) {
                const content = await response.text();
                console.log('CSV loaded via fetch');
                return content;
            }
        } catch (e) {
            console.log('Fetch failed:', e);
        }
        
        // Method 3: Use embedded data as fallback
        console.log('Using embedded CSV data');
        return this.getEmbeddedCSV();
    }
    
    /**
     * Process CSV content using Papa Parse or native parser
     */
    async processCSV(csvContent) {
        if (this.papaParseLoaded && typeof Papa !== 'undefined') {
            try {
                return await this.processWithPapaParse(csvContent);
            } catch (error) {
                console.warn('Papa Parse failed, using native parser:', error);
                return this.processWithNativeParser(csvContent);
            }
        } else {
            return this.processWithNativeParser(csvContent);
        }
    }
    
    /**
     * Process CSV with Papa Parse
     */
    processWithPapaParse(csvContent) {
        return new Promise((resolve, reject) => {
            if (typeof Papa === 'undefined') {
                reject(new Error('Papa Parse not loaded'));
                return;
            }
            
            Papa.parse(csvContent, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                complete: (results) => {
                    const data = this.transformData(results.data, results.meta.fields);
                    resolve(data);
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }
    
    /**
     * Native CSV parser (fallback when Papa Parse isn't available)
     */
    processWithNativeParser(csvContent) {
        const lines = csvContent.trim().split(/\r?\n/);
        if (lines.length < 2) return null;
        
        // Parse headers
        const headers = this.parseCSVLine(lines[0]);
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                data.push(row);
            }
        }
        
        return this.transformData(data, headers);
    }
    
    /**
     * Parse a single CSV line handling commas in quotes
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }
    
    /**
     * Transform CSV data into application format
     */
    transformData(rows, headers) {
        // Find the participant columns (after the fixed columns)
        const fixedColumns = ['År', 'Tävling', 'Plats', 'Arrangör 3:a', 'Arrangör näst sist'];
        const participantNames = headers.filter(h => 
            h && !fixedColumns.includes(h) && h.trim() !== ''
        );
        
        // Create participants
        const participants = participantNames.map(name => ({
            id: this.generateId('p'),
            name: name.trim(),
            nickname: this.createNickname(name),
            status: 'active',
            createdAt: new Date().toISOString()
        }));
        
        // Create participant ID map
        const participantIdMap = {};
        participants.forEach(p => {
            participantIdMap[p.name] = p.id;
        });
        
        // Process competitions
        const competitions = [];
        const arrangerStats = {};
        const achievements = [];
        
        rows.forEach(row => {
            const year = parseInt(row['År']);
            const name = row['Tävling'];
            const location = row['Plats'] || '';
            const arranger3rd = row['Arrangör 3:a'] || '';
            const arrangerSecondLast = row['Arrangör näst sist'] || '';
            
            if (!year || !name) return;
            
            const scores = {};
            let winner = null;
            let thirdPlace = null;
            let secondLast = null;
            let last = null;
            let participantCount = 0;
            
            // Process scores
            participantNames.forEach(participantName => {
                const value = row[participantName];
                if (value && value !== '' && value !== '-') {
                    const score = this.parseScore(value);
                    if (score !== null) {
                        const pId = participantIdMap[participantName];
                        scores[pId] = score;
                        participantCount++;
                        
                        if (score === 1) winner = participantName;
                        if (score === 3) thirdPlace = participantName;
                    }
                }
            });
            
            // Adjust special positions
            Object.entries(scores).forEach(([pId, score]) => {
                if (score === 99) { // Näst sist
                    scores[pId] = Math.max(2, participantCount - 1);
                    const participant = participants.find(p => p.id === pId);
                    if (participant) secondLast = participant.name;
                } else if (score === 100) { // Sist
                    scores[pId] = participantCount;
                    const participant = participants.find(p => p.id === pId);
                    if (participant) last = participant.name;
                }
            });
            
            // Track arranger statistics
            if (arranger3rd) {
                if (!arrangerStats[arranger3rd]) {
                    arrangerStats[arranger3rd] = { arranged3rd: 0, arrangedSecondLast: 0 };
                }
                arrangerStats[arranger3rd].arranged3rd++;
            }
            
            if (arrangerSecondLast) {
                if (!arrangerStats[arrangerSecondLast]) {
                    arrangerStats[arrangerSecondLast] = { arranged3rd: 0, arrangedSecondLast: 0 };
                }
                arrangerStats[arrangerSecondLast].arrangedSecondLast++;
            }
            
            competitions.push({
                id: this.generateId('c'),
                year: year,
                name: name,
                location: location,
                winner: winner,
                arranger3rd: arranger3rd || thirdPlace,
                arrangerSecondLast: arrangerSecondLast || secondLast,
                scores: scores,
                participantCount: participantCount,
                createdAt: new Date().toISOString()
            });
        });
        
        // Sort by year
        competitions.sort((a, b) => a.year - b.year);
        
        // Generate fun achievements based on arrangers
        achievements.push(...this.generateArrangerAchievements(arrangerStats, competitions));
        
        return {
            version: '2.1',
            exportDate: new Date().toISOString(),
            competitions: competitions,
            participants: participants,
            arrangerStats: arrangerStats,
            achievements: achievements,
            initialized: true,
            lastUpdated: new Date().toISOString(),
            metadata: {
                totalCompetitions: competitions.length,
                totalParticipants: participants.length,
                importSource: 'CSV',
                yearRange: {
                    start: Math.min(...competitions.map(c => c.year)),
                    end: Math.max(...competitions.map(c => c.year))
                }
            }
        };
    }
    
    /**
     * Generate fun achievements based on arranger data
     */
    generateArrangerAchievements(arrangerStats, competitions) {
        const achievements = [];
        
        // Most arrangements of 3rd place
        const most3rd = Object.entries(arrangerStats)
            .sort((a, b) => b[1].arranged3rd - a[1].arranged3rd)[0];
        if (most3rd && most3rd[1].arranged3rd > 0) {
            achievements.push({
                icon: '🥉',
                title: 'Bronsvärd',
                description: `${most3rd[0]} har arrangerat flest tävlingar när hen kom trea (${most3rd[1].arranged3rd} gånger)`,
                type: 'arranger'
            });
        }
        
        // Most arrangements of second-to-last
        const mostSecondLast = Object.entries(arrangerStats)
            .sort((a, b) => b[1].arrangedSecondLast - a[1].arrangedSecondLast)[0];
        if (mostSecondLast && mostSecondLast[1].arrangedSecondLast > 0) {
            achievements.push({
                icon: '🎭',
                title: 'Ironisk Arrangör',
                description: `${mostSecondLast[0]} har arrangerat flest tävlingar när hen kom näst sist (${mostSecondLast[1].arrangedSecondLast} gånger)`,
                type: 'arranger'
            });
        }
        
        // Both 3rd and second-to-last arranger
        const versatileArrangers = Object.entries(arrangerStats)
            .filter(([name, stats]) => stats.arranged3rd > 0 && stats.arrangedSecondLast > 0);
        if (versatileArrangers.length > 0) {
            achievements.push({
                icon: '🎪',
                title: 'Mångsidig Arrangör',
                description: `${versatileArrangers.map(([name]) => name).join(', ')} har arrangerat både som trea och näst sist`,
                type: 'arranger'
            });
        }
        
        // Revenge arrangement (arranged after coming last)
        competitions.forEach((comp, index) => {
            if (index > 0 && comp.arranger3rd) {
                const prevComp = competitions[index - 1];
                const arranger3rdId = Object.entries(comp.scores)
                    .find(([id, score]) => score === 3)?.[0];
                if (arranger3rdId && prevComp.scores[arranger3rdId] === Object.keys(prevComp.scores).length) {
                    achievements.push({
                        icon: '💪',
                        title: 'Revansch!',
                        description: `${comp.arranger3rd} arrangerade ${comp.year} efter att ha kommit sist ${prevComp.year}`,
                        type: 'special'
                    });
                }
            }
        });
        
        // Pattern detector
        const arrangementPattern = competitions
            .filter(c => c.arranger3rd || c.arrangerSecondLast)
            .slice(-3);
        if (arrangementPattern.length >= 3) {
            const sameArranger = arrangementPattern.every(c => 
                c.arranger3rd === arrangementPattern[0].arranger3rd
            );
            if (sameArranger && arrangementPattern[0].arranger3rd) {
                achievements.push({
                    icon: '👑',
                    title: 'Arrangörsdynasti',
                    description: `${arrangementPattern[0].arranger3rd} har arrangerat de senaste 3 tävlingarna som trea`,
                    type: 'streak'
                });
            }
        }
        
        return achievements;
    }
    
    /**
     * Parse score value
     */
    parseScore(value) {
        if (!value || value === '-' || value === '') return null;
        
        const numValue = parseInt(value);
        if (!isNaN(numValue)) return numValue;
        
        const textValue = value.toString().toLowerCase().trim();
        if (textValue === 'näst sist') return 99;
        if (textValue === 'sist') return 100;
        
        return null;
    }
    
    /**
     * Create nickname from name
     */
    createNickname(fullName) {
        const parts = fullName.trim().split(' ');
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];
        return lastName && lastName !== firstName 
            ? firstName + ' ' + lastName.charAt(0) + '.'
            : firstName;
    }
    
    /**
     * Generate unique ID
     */
    generateId(prefix) {
        return prefix + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Save to localStorage
     */
    saveToLocalStorage(data) {
        try {
            localStorage.setItem('pekkas-pokal-data', JSON.stringify(data));
            console.log('Data saved to localStorage');
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }
    
    /**
     * Load from localStorage
     */
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('pekkas-pokal-data');
            if (saved) {
                const data = JSON.parse(saved);
                console.log('Loaded data from localStorage');
                window.competitionData = data;
                return data;
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
        return null;
    }
    
    /**
     * Import data into application (legacy support)
     */
    async importIntoApp(importData) {
        try {
            if (!importData) {
                throw new Error('Ingen data att importera');
            }

            // Wait for data manager to be ready
            let retries = 0;
            const maxRetries = 10;
            
            while (!window.dataManager && retries < maxRetries) {
                console.log('Waiting for data manager...');
                await this.wait(1000);
                retries++;
            }

            if (!window.dataManager) {
                throw new Error('Data manager inte tillgänglig');
            }

            console.log('Importing data into application...');
            await window.dataManager.importData(importData);
            
            console.log('Data imported successfully');

            // Reload app if available
            if (window.app && typeof window.app.loadInitialData === 'function') {
                console.log('Reloading application...');
                await window.app.loadInitialData();
            }

            return true;

        } catch (error) {
            console.error('Failed to import into app:', error);
            throw error;
        }
    }
    
    /**
     * Wait utility
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get embedded CSV data (fallback)
     */
    getEmbeddedCSV() {
        // Your actual CSV data embedded as a string
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
}

// Create global instance
window.csvImporter = new EnhancedCSVImporter();

// Legacy compatibility functions
window.importCSVData = async function() {
    return await window.csvImporter.importCSVData();
};

window.importCSVIntoApp = async function() {
    try {
        const data = await window.csvImporter.importCSVData();
        await window.csvImporter.importIntoApp(data);
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification(
                `Importerat ${data.competitions.length} tävlingar och ${data.participants.length} deltagare!`,
                'success'
            );
        }
        
        return data;
    } catch (error) {
        if (window.app && window.app.showNotification) {
            window.app.showNotification('Fel vid CSV-import: ' + error.message, 'error');
        }
        throw error;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        const data = await window.csvImporter.init();
        console.log('Competition data loaded:', data);
        
        // Display arranger achievements if container exists
        if (data && data.achievements) {
            displayAchievements(data.achievements);
        }
    });
} else {
    window.csvImporter.init().then(data => {
        console.log('Competition data loaded:', data);
        if (data && data.achievements) {
            displayAchievements(data.achievements);
        }
    });
}

// Function to display achievements in the UI
function displayAchievements(achievements) {
    // Check if there's an achievements container in the DOM
    const container = document.getElementById('achievements-list') || 
                     document.querySelector('.achievements-container');
    
    if (container && achievements.length > 0) {
        const achievementsHTML = achievements.map(ach => `
            <div class="achievement-item" style="padding: 1rem; margin: 0.5rem 0; background: rgba(102, 126, 234, 0.1); border-radius: 8px;">
                <span style="font-size: 2rem; margin-right: 1rem;">${ach.icon}</span>
                <div style="display: inline-block;">
                    <strong style="color: #667eea;">${ach.title}</strong><br>
                    <span style="color: #666; font-size: 0.9rem;">${ach.description}</span>
                </div>
            </div>
        `).join('');
        
        container.innerHTML += achievementsHTML;
    }
    
    // Log achievements to console for debugging
    console.log('🏆 Arranger Achievements:', achievements);
}

// Global function to manually reload CSV
window.reloadCSVData = async function() {
    const data = await window.csvImporter.init();
    console.log('CSV data reloaded:', data);
    return data;
};

// Global function to get arranger statistics
window.getArrangerStats = function() {
    if (window.competitionData && window.competitionData.arrangerStats) {
        return window.competitionData.arrangerStats;
    }
    return null;
};

console.log('Enhanced CSV Import script loaded');
console.log('Use window.reloadCSVData() to manually reload');
console.log('Use window.getArrangerStats() to see arranger statistics');