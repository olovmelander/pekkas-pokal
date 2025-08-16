/**
 * Auto Loader - Automatically loads CSV data on app startup
 * Ensures data is always available, especially on mobile
 */

class AutoDataLoader {
  constructor() {
    this.csvFileName = 'Pekkas Pokal Marathontabell  Marathontabell 2.csv';
    this.storageKey = 'pekkas-pokal-data';
    this.initialized = false;
  }

  /**
   * Initialize and load data automatically
   */
  async init() {
    console.log('AutoDataLoader: Initializing...');
    
    try {
      // Check if data already exists in localStorage
      const existingData = this.getStoredData();
      
      if (existingData && existingData.initialized && existingData.competitions && existingData.competitions.length > 0) {
        console.log('AutoDataLoader: Found existing data with', existingData.competitions.length, 'competitions');
        window.competitionData = existingData;
        return true;
      }

      console.log('AutoDataLoader: No existing data found, loading CSV...');
      
      // Load CSV data
      const csvData = await this.loadCSVData();
      
      if (csvData) {
        // Store in localStorage
        this.saveData(csvData);
        
        // Set global competition data
        window.competitionData = csvData;
        
        console.log('AutoDataLoader: Successfully loaded', csvData.competitions.length, 'competitions');
        
        // Trigger UI update if app is ready
        if (window.updateAllViews) {
          window.updateAllViews();
        }
        
        return true;
      }
      
    } catch (error) {
      console.error('AutoDataLoader: Failed to initialize', error);
      
      // Load fallback data
      await this.loadFallbackData();
    }
    
    return false;
  }

  /**
   * Get stored data from localStorage
   */
  getStoredData() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('AutoDataLoader: Failed to parse stored data', error);
    }
    return null;
  }

  /**
   * Save data to localStorage
   */
  saveData(data) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      console.log('AutoDataLoader: Data saved to localStorage');
    } catch (error) {
      console.error('AutoDataLoader: Failed to save data', error);
    }
  }

  /**
   * Load and process CSV data
   */
  async loadCSVData() {
    try {
      // First ensure Papa Parse is loaded
      if (typeof Papa === 'undefined') {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.4.1/papaparse.min.js');
      }

      // Try to read CSV file
      let csvContent = null;
      
      // Method 1: Try window.fs API (if available in your environment)
      if (window.fs && window.fs.readFile) {
        try {
          csvContent = await window.fs.readFile(this.csvFileName, { encoding: 'utf8' });
          console.log('AutoDataLoader: CSV loaded via fs.readFile');
        } catch (e) {
          console.log('AutoDataLoader: fs.readFile not available');
        }
      }
      
      // Method 2: Try fetching the CSV file
      if (!csvContent) {
        try {
          const response = await fetch(this.csvFileName);
          if (response.ok) {
            csvContent = await response.text();
            console.log('AutoDataLoader: CSV loaded via fetch');
          }
        } catch (e) {
          console.log('AutoDataLoader: Fetch failed', e);
        }
      }
      
      // If no CSV content, return fallback data
      if (!csvContent) {
        console.log('AutoDataLoader: No CSV content available, using fallback');
        return this.createFallbackData();
      }

      // Parse CSV
      return await this.parseCSVContent(csvContent);
      
    } catch (error) {
      console.error('AutoDataLoader: Failed to load CSV', error);
      return null;
    }
  }

  /**
   * Parse CSV content
   */
  async parseCSVContent(csvContent) {
    return new Promise((resolve) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const processedData = this.processCSVData(results.data, results.meta.fields);
          resolve(processedData);
        },
        error: (error) => {
          console.error('AutoDataLoader: CSV parsing error', error);
          resolve(this.createFallbackData());
        }
      });
    });
  }

  /**
   * Process parsed CSV data
   */
  processCSVData(data, headers) {
    // Extract participant names (skip År, Tävling, Plats columns)
    const participantNames = headers.slice(3).filter(name => 
      name && name.trim() && name !== ''
    );

    // Create participants
    const participants = participantNames.map(name => ({
      id: this.generateId('p'),
      name: name.trim(),
      nickname: this.createNickname(name),
      status: 'active'
    }));

    // Create participant ID map
    const participantIdMap = {};
    participants.forEach(p => {
      participantIdMap[p.name] = p.id;
    });

    // Process competitions
    const competitions = [];
    
    data.forEach(row => {
      const year = parseInt(row['År']);
      const name = row['Tävling'];
      const location = row['Plats'] || '';
      
      if (!year || !name) return;

      const scores = {};
      let winner = null;
      let bestScore = null;

      participantNames.forEach(participantName => {
        const scoreValue = row[participantName];
        if (scoreValue && scoreValue !== '' && scoreValue !== '-') {
          const score = this.parseScore(scoreValue);
          if (score !== null) {
            const participantId = participantIdMap[participantName];
            scores[participantId] = score;
            
            if (score === 1) {
              winner = participantName;
            }
            
            if (bestScore === null || score < bestScore) {
              bestScore = score;
              if (!winner) {
                winner = participantName;
              }
            }
          }
        }
      });

      competitions.push({
        id: this.generateId('c'),
        year: year,
        name: name,
        location: location,
        winner: winner,
        scores: scores
      });
    });

    // Sort by year
    competitions.sort((a, b) => a.year - b.year);

    return {
      competitions: competitions,
      participants: participants,
      initialized: true
    };
  }

  /**
   * Parse score value
   */
  parseScore(value) {
    if (!value || value === '-' || value === '') return null;
    
    const numValue = parseInt(value);
    if (!isNaN(numValue)) return numValue;
    
    // Handle Swedish text
    const textValue = value.toString().toLowerCase().trim();
    if (textValue === 'näst sist') return 99;
    if (textValue === 'sist') return 100;
    
    return null;
  }

  /**
   * Create nickname from full name
   */
  createNickname(fullName) {
    const parts = fullName.trim().split(' ');
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    if (lastName && lastName !== firstName) {
      return firstName + ' ' + lastName.charAt(0) + '.';
    }
    return firstName;
  }

  /**
   * Generate unique ID
   */
  generateId(prefix) {
    return prefix + '_' + Math.random().toString(36).substr(2, 9);
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
   * Create fallback data
   */
  createFallbackData() {
    console.log('AutoDataLoader: Using fallback data');
    
    const participants = [
      { id: 'p_1', name: 'Olov Melander', nickname: 'Olov M.', status: 'active' },
      { id: 'p_2', name: 'Mikael Hägglund', nickname: 'Mikael H.', status: 'active' },
      { id: 'p_3', name: 'Viktor Jones', nickname: 'Viktor J.', status: 'active' },
      { id: 'p_4', name: 'Per Wikman', nickname: 'Per W.', status: 'active' },
      { id: 'p_5', name: 'Erik Vallgren', nickname: 'Erik V.', status: 'active' },
      { id: 'p_6', name: 'Henrik Lundqvist', nickname: 'Henrik L.', status: 'active' },
      { id: 'p_7', name: 'Rickard Nilsson', nickname: 'Rickard N.', status: 'active' },
      { id: 'p_8', name: 'Niklas Norberg', nickname: 'Niklas N.', status: 'active' },
      { id: 'p_9', name: 'Per Olsson', nickname: 'Per O.', status: 'active' },
      { id: 'p_10', name: 'Tobias Lundqvist', nickname: 'Tobias L.', status: 'active' },
      { id: 'p_11', name: 'Lars Sandin', nickname: 'Lars S.', status: 'active' },
      { id: 'p_12', name: 'Ludvig Ulenius', nickname: 'Ludvig U.', status: 'active' },
      { id: 'p_13', name: 'Jonas Eriksson', nickname: 'Jonas E.', status: 'active' }
    ];

    const competitions = [
      {
        id: 'c_2024',
        year: 2024,
        name: 'Fisketävling',
        location: 'Själevad',
        winner: 'Erik Vallgren',
        scores: {
          'p_5': 1, 'p_6': 2, 'p_9': 3, 'p_3': 4, 'p_1': 5,
          'p_10': 6, 'p_4': 7, 'p_11': 8, 'p_2': 9, 'p_7': 10
        }
      },
      {
        id: 'c_2023',
        year: 2023,
        name: 'Fäkting',
        location: 'Stockholm',
        winner: 'Per Wikman',
        scores: {
          'p_4': 1, 'p_7': 2, 'p_2': 3, 'p_3': 11
        }
      },
      {
        id: 'c_2022',
        year: 2022,
        name: 'Skytte',
        location: 'Arnäsvall',
        winner: 'Ludvig Ulenius',
        scores: {
          'p_12': 1, 'p_10': 2, 'p_3': 3, 'p_7': 4, 'p_1': 5
        }
      },
      {
        id: 'c_2021',
        year: 2021,
        name: 'Målning',
        location: 'Ås',
        winner: 'Olov Melander',
        scores: {
          'p_1': 1, 'p_10': 2, 'p_12': 3, 'p_9': 4, 'p_4': 5
        }
      },
      {
        id: 'c_2020',
        year: 2020,
        name: 'Covid',
        location: '',
        winner: null,
        scores: {}
      }
    ];

    return {
      competitions: competitions,
      participants: participants,
      initialized: true
    };
  }

  /**
   * Load fallback data as last resort
   */
  async loadFallbackData() {
    console.log('AutoDataLoader: Loading fallback data');
    const fallbackData = this.createFallbackData();
    
    // Save to localStorage
    this.saveData(fallbackData);
    
    // Set global competition data
    window.competitionData = fallbackData;
    
    // Trigger UI update
    if (window.updateAllViews) {
      window.updateAllViews();
    }
    
    return fallbackData;
  }
}

// Create and initialize auto loader
window.autoDataLoader = new AutoDataLoader();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await window.autoDataLoader.init();
  });
} else {
  window.autoDataLoader.init();
}

console.log('AutoDataLoader: Script loaded');