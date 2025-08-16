/**
 * Default Data Loader for Pekkas Pokal
 * Loads default competitor data from Google Sheets or fallback data
 */

class DefaultDataLoader {
  constructor() {
    // Google Sheets CSV export URL (you need to make your sheet public)
    // Replace YOUR_SHEET_ID with your actual sheet ID from the URL
    this.googleSheetsURL = null; // Will be set when you make sheet public
    
    // Fallback default data based on your current CSV structure
    this.fallbackData = this.createFallbackData();
  }

  /**
   * Load default data - tries Google Sheets first, then fallback
   */
  async loadDefaultData() {
    try {
      console.log('Loading default data...');
      
      // Try Google Sheets first if URL is configured
      if (this.googleSheetsURL) {
        try {
          const sheetsData = await this.loadFromGoogleSheets();
          if (sheetsData) {
            console.log('Loaded data from Google Sheets');
            return sheetsData;
          }
        } catch (error) {
          console.warn('Failed to load from Google Sheets:', error);
        }
      }
      
      // Fallback to local data
      console.log('Using fallback default data');
      return this.fallbackData;
      
    } catch (error) {
      console.error('Failed to load default data:', error);
      throw error;
    }
  }

  /**
   * Load data from Google Sheets (requires public sheet)
   */
  async loadFromGoogleSheets() {
    if (!this.googleSheetsURL) {
      throw new Error('Google Sheets URL inte konfigurerad');
    }

    try {
      const response = await fetch(this.googleSheetsURL);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const csvContent = await response.text();
      
      // Use CSV importer to process the data
      if (window.csvImporter) {
        return await window.csvImporter.processCSVContent(csvContent);
      } else {
        throw new Error('CSV importer inte tillgänglig');
      }
      
    } catch (error) {
      console.error('Google Sheets load failed:', error);
      throw error;
    }
  }

  /**
   * Configure Google Sheets URL
   * Instructions for user to set up their public sheet
   */
  configureGoogleSheets(sheetId) {
    // Format: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv
    this.googleSheetsURL = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    console.log('Google Sheets URL configured:', this.googleSheetsURL);
  }

  /**
   * Create fallback data based on your existing structure
   */
  createFallbackData() {
    const participants = [
      { name: 'Olov Melander', nickname: 'Olov M.', status: 'active' },
      { name: 'Mikael Hägglund', nickname: 'Mikael H.', status: 'active' },
      { name: 'Viktor Jones', nickname: 'Viktor J.', status: 'active' },
      { name: 'Per Wikman', nickname: 'Per W.', status: 'active' },
      { name: 'Erik Vallgren', nickname: 'Erik V.', status: 'active' },
      { name: 'Henrik Lundqvist', nickname: 'Henrik L.', status: 'active' },
      { name: 'Rickard Nilsson', nickname: 'Rickard N.', status: 'active' },
      { name: 'Niklas Norberg', nickname: 'Niklas N.', status: 'active' },
      { name: 'Per Olsson', nickname: 'Per O.', status: 'active' },
      { name: 'Tobias Lundqvist', nickname: 'Tobias L.', status: 'active' },
      { name: 'Lars Sandin', nickname: 'Lars S.', status: 'active' },
      { name: 'Ludvig Ulenius', nickname: 'Ludvig U.', status: 'active' },
      { name: 'Jonas Eriksson', nickname: 'Jonas E.', status: 'active' }
    ];

    // Add IDs to participants
    const participantsWithIds = participants.map(p => ({
      ...p,
      id: this.generateId('participant'),
      createdAt: new Date().toISOString()
    }));

    // Create participant ID map
    const participantIdMap = {};
    participantsWithIds.forEach(p => {
      participantIdMap[p.name] = p.id;
    });

    // Sample competitions based on your CSV data
    const competitions = [
      {
        year: 2024,
        name: 'Fisketävling',
        location: 'Själevad',
        winner: 'Erik Vallgren',
        scores: {
          [participantIdMap['Erik Vallgren']]: 1,
          [participantIdMap['Henrik Lundqvist']]: 2,
          [participantIdMap['Viktor Jones']]: 3,
          [participantIdMap['Per Wikman']]: 4,
          [participantIdMap['Olov Melander']]: 5,
          [participantIdMap['Mikael Hägglund']]: 6,
          [participantIdMap['Ludvig Ulenius']]: 7,
          [participantIdMap['Rickard Nilsson']]: 8,
          [participantIdMap['Per Olsson']]: 9,
          [participantIdMap['Tobias Lundqvist']]: 10,
          [participantIdMap['Lars Sandin']]: 11,
          [participantIdMap['Niklas Norberg']]: 12
        }
      },
      {
        year: 2023,
        name: 'Fäkting',
        location: 'Stockholm',
        winner: 'Per Wikman',
        scores: {
          [participantIdMap['Per Wikman']]: 1,
          [participantIdMap['Henrik Lundqvist']]: 2,
          [participantIdMap['Viktor Jones']]: 3,
          [participantIdMap['Mikael Hägglund']]: 4,
          [participantIdMap['Erik Vallgren']]: 5,
          [participantIdMap['Olov Melander']]: 6,
          [participantIdMap['Rickard Nilsson']]: 7,
          [participantIdMap['Niklas Norberg']]: 8,
          [participantIdMap['Per Olsson']]: 9,
          [participantIdMap['Tobias Lundqvist']]: 10,
          [participantIdMap['Lars Sandin']]: 11
        }
      },
      {
        year: 2022,
        name: 'Skytte',
        location: 'Arnäsvall',
        winner: 'Ludvig Ulenius',
        scores: {
          [participantIdMap['Ludvig Ulenius']]: 1,
          [participantIdMap['Per Olsson']]: 2,
          [participantIdMap['Viktor Jones']]: 3,
          [participantIdMap['Rickard Nilsson']]: 4,
          [participantIdMap['Olov Melander']]: 5,
          [participantIdMap['Per Wikman']]: 6,
          [participantIdMap['Henrik Lundqvist']]: 7,
          [participantIdMap['Niklas Norberg']]: 8,
          [participantIdMap['Mikael Hägglund']]: 9,
          [participantIdMap['Erik Vallgren']]: 10
        }
      },
      {
        year: 2021,
        name: 'Målning',
        location: 'Ås',
        winner: 'Olov Melander',
        scores: {
          [participantIdMap['Olov Melander']]: 1,
          [participantIdMap['Tobias Lundqvist']]: 2,
          [participantIdMap['Ludvig Ulenius']]: 3,
          [participantIdMap['Per Olsson']]: 4,
          [participantIdMap['Per Wikman']]: 5,
          [participantIdMap['Viktor Jones']]: 6,
          [participantIdMap['Erik Vallgren']]: 7,
          [participantIdMap['Niklas Norberg']]: 8,
          [participantIdMap['Henrik Lundqvist']]: 9,
          [participantIdMap['Rickard Nilsson']]: 10
        }
      },
      {
        year: 2020,
        name: 'Covid (Online Quiz)',
        location: 'Hemma (Zoom)',
        winner: 'Per Wikman',
        scores: {
          [participantIdMap['Per Wikman']]: 1,
          [participantIdMap['Viktor Jones']]: 2,
          [participantIdMap['Olov Melander']]: 3,
          [participantIdMap['Mikael Hägglund']]: 4,
          [participantIdMap['Erik Vallgren']]: 5
        }
      }
    ];

    // Add IDs and metadata to competitions
    const competitionsWithIds = competitions.map(comp => ({
      ...comp,
      id: this.generateId('competition'),
      createdAt: new Date().toISOString()
    }));

    return {
      version: '2.1',
      exportDate: new Date().toISOString(),
      competitions: competitionsWithIds,
      participants: participantsWithIds,
      metadata: {
        totalCompetitions: competitionsWithIds.length,
        totalParticipants: participantsWithIds.length,
        importSource: 'Default',
        yearRange: {
          start: Math.min(...competitionsWithIds.map(c => c.year)),
          end: Math.max(...competitionsWithIds.map(c => c.year))
        }
      }
    };
  }

  /**
   * Load default data into the application
   */
  async loadDefaultIntoApp() {
    try {
      console.log('Loading default data into application...');
      
      const confirmLoad = confirm(
        'Detta kommer att ersätta all befintlig data med standarddata. ' +
        'Är du säker på att du vill fortsätta?'
      );
      
      if (!confirmLoad) {
        console.log('Default data load cancelled by user');
        return false;
      }

      const defaultData = await this.loadDefaultData();
      
      // Wait for data manager
      let retries = 0;
      while (!window.dataManager && retries < 10) {
        await this.wait(1000);
        retries++;
      }

      if (!window.dataManager) {
        throw new Error('Data manager inte tillgänglig');
      }

      await window.dataManager.importData(defaultData);
      
      // Reload app
      if (window.app && typeof window.app.loadInitialData === 'function') {
        await window.app.loadInitialData();
      }

      if (window.app && window.app.showNotification) {
        window.app.showNotification(
          `Standarddata laddad: ${defaultData.competitions.length} tävlingar och ${defaultData.participants.length} deltagare!`,
          'success'
        );
      }

      console.log('Default data loaded successfully');
      return true;

    } catch (error) {
      console.error('Failed to load default data into app:', error);
      
      if (window.app && window.app.showNotification) {
        window.app.showNotification('Fel vid laddning av standarddata: ' + error.message, 'error');
      }
      
      throw error;
    }
  }

  /**
   * Generate unique ID
   */
  generateId(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Instructions for setting up Google Sheets
   */
  getGoogleSheetsInstructions() {
    return `
För att använda din Google Sheets som datakälla:

1. Öppna ditt Google Sheets dokument
2. Klicka på "Dela" (Share) i övre högra hörnet
3. Ändra behörigheter till "Vem som helst med länken kan visa"
4. Kopiera sheet-ID från URL:en (den långa strängen mellan /d/ och /edit)
   Exempel: https://docs.google.com/spreadsheets/d/DENNA_STRÄNG_ÄR_SHEET_ID/edit
5. Använd setGoogleSheetsId('SHEET_ID') för att konfigurera

Alternativt kan du exportera sheetet som CSV och använda vanlig CSV-import.
    `;
  }
}

// Create global instance
window.defaultDataLoader = new DefaultDataLoader();

// Global functions for easy access
window.loadDefaultData = async function() {
  return await window.defaultDataLoader.loadDefaultIntoApp();
};

window.setGoogleSheetsId = function(sheetId) {
  window.defaultDataLoader.configureGoogleSheets(sheetId);
  console.log('Google Sheets konfigurerat. Använd loadDefaultData() för att ladda data.');
};

window.getGoogleSheetsInstructions = function() {
  console.log(window.defaultDataLoader.getGoogleSheetsInstructions());
  return window.defaultDataLoader.getGoogleSheetsInstructions();
};

console.log('Default Data Loader loaded');
console.log('Available functions:');
console.log('- loadDefaultData() - Load default competition data');
console.log('- setGoogleSheetsId(sheetId) - Configure Google Sheets data source');
console.log('- getGoogleSheetsInstructions() - Show setup instructions');