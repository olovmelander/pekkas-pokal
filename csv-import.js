/**
 * Fixed CSV Import Script for Pekkas Pokal
 * Robust CSV parsing with comprehensive error handling
 */

class CSVImporter {
  constructor() {
    this.isProcessing = false;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
  }

  /**
   * Import CSV data with retry mechanism
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
          // Try to read the default CSV file
          content = await this.readDefaultCSV();
        }

        if (!content) {
          throw new Error('Ingen CSV-data tillgänglig');
        }

        const result = await this.processCSVContent(content);
        this.isProcessing = false;
        return result;

      } catch (error) {
        attempt++;
        console.error(`Import attempt ${attempt} failed:`, error);
        
        if (attempt >= this.retryAttempts) {
          this.isProcessing = false;
          throw new Error(`Import misslyckades efter ${this.retryAttempts} försök: ${error.message}`);
        }
        
        // Wait before retry
        await this.wait(this.retryDelay * attempt);
      }
    }
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

      if (!file.name.toLowerCase().includes('.csv')) {
        reject(new Error('Endast CSV-filer är tillåtna'));
        return;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Filen är för stor (max 5MB)'));
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
      
      reader.onabort = () => {
        reject(new Error('Filläsning avbruten'));
      };

      // Set timeout for file reading
      setTimeout(() => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
          reject(new Error('Filläsning tog för lång tid'));
        }
      }, 10000); // 10 second timeout

      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Read default CSV file from the project
   */
  async readDefaultCSV() {
    try {
      if (typeof window !== 'undefined' && window.fs && window.fs.readFile) {
        // Try to read from file system API
        return await window.fs.readFile('Pekkas Pokal Marathontabell  Marathontabell 2.csv', { encoding: 'utf8' });
      }
      
      // Fallback: try to fetch the file
      const response = await fetch('Pekkas Pokal Marathontabell  Marathontabell 2.csv');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
      
    } catch (error) {
      console.warn('Could not read default CSV:', error);
      throw new Error('Kunde inte läsa standard CSV-fil');
    }
  }

  /**
   * Process CSV content with improved parsing
   */
  async processCSVContent(csvContent) {
    try {
      // Normalize line endings and trim
      const normalizedContent = csvContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();

      if (!normalizedContent) {
        throw new Error('CSV-innehållet är tomt');
      }

      // Parse CSV with Papa Parse
      const parseResult = await this.parseCSVWithPapa(normalizedContent);
      
      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors);
      }

      const { data, meta } = parseResult;
      
      if (!data || data.length === 0) {
        throw new Error('Ingen data hittades i CSV-filen');
      }

      // Validate headers
      const headers = meta.fields || Object.keys(data[0] || {});
      const requiredHeaders = ['År', 'Tävling'];
      
      const missingHeaders = requiredHeaders.filter(header => 
        !headers.some(h => h.toLowerCase().includes(header.toLowerCase()))
      );
      
      if (missingHeaders.length > 0) {
        throw new Error(`Saknade kolumner: ${missingHeaders.join(', ')}`);
      }

      // Extract participant names (skip År, Tävling, Plats)
      const participantNames = headers.slice(3).filter(name => 
        name && name.trim() && !['', '-', 'undefined', 'null'].includes(name.trim())
      );

      if (participantNames.length === 0) {
        throw new Error('Inga deltagare hittades i CSV-filen');
      }

      console.log('Found participants:', participantNames);

      // Create participants
      const participants = participantNames.map(name => ({
        id: this.generateId('participant'),
        name: name.trim(),
        nickname: this.getNameParts(name).nickname,
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
      const processedYears = new Set();

      for (const row of data) {
        try {
          const year = this.parseYear(row['År']);
          const name = this.parseName(row['Tävling']);
          const location = this.parseLocation(row['Plats'] || '');

          if (!year || !name) {
            console.warn('Skipping invalid row:', row);
            continue;
          }

          // Check for duplicate years
          if (processedYears.has(year)) {
            console.warn(`Duplicate year ${year} found, skipping`);
            continue;
          }
          processedYears.add(year);

          const scores = {};
          let winner = null;
          let bestPosition = null;
          let participantCount = 0;

          // Process scores for each participant
          participantNames.forEach(participantName => {
            const scoreValue = this.getScoreValue(row, participantName);
            
            if (scoreValue && scoreValue !== '' && scoreValue !== '-') {
              const position = this.parsePosition(scoreValue);
              
              if (position !== null && position > 0) {
                const participantId = participantIdMap[participantName];
                scores[participantId] = position;
                participantCount++;

                // Track winner (position 1)
                if (position === 1) {
                  winner = participantName;
                }

                // Track best position for fallback winner detection
                if (bestPosition === null || position < bestPosition) {
                  bestPosition = position;
                  if (!winner) {
                    winner = participantName;
                  }
                }
              }
            }
          });

          if (participantCount === 0) {
            console.warn(`No valid scores for ${year} - ${name}`);
            continue;
          }

          const competition = {
            id: this.generateId('competition'),
            year: year,
            name: name,
            location: location,
            winner: winner,
            scores: scores,
            createdAt: new Date().toISOString()
          };

          competitions.push(competition);

        } catch (error) {
          console.error('Error processing row:', row, error);
          continue;
        }
      }

      if (competitions.length === 0) {
        throw new Error('Inga giltiga tävlingar hittades i CSV-filen');
      }

      // Adjust special positions
      this.adjustSpecialPositions(competitions);

      // Sort competitions by year
      competitions.sort((a, b) => a.year - b.year);

      console.log(`Successfully processed ${participants.length} participants and ${competitions.length} competitions`);

      // Create final data structure
      const importData = {
        version: '2.1',
        exportDate: new Date().toISOString(),
        competitions: competitions,
        participants: participants,
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

      return importData;

    } catch (error) {
      console.error('CSV processing failed:', error);
      throw error;
    }
  }

  /**
   * Parse CSV with Papa Parse and better error handling
   */
  async parseCSVWithPapa(csvContent) {
    return new Promise((resolve, reject) => {
      try {
        // Check if Papa Parse is available
        if (typeof Papa === 'undefined') {
          reject(new Error('Papa Parse library inte laddad'));
          return;
        }

        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          encoding: 'UTF-8',
          delimitersToGuess: [',', '\t', '|', ';'],
          complete: (results) => {
            resolve(results);
          },
          error: (error) => {
            reject(new Error(`CSV parsing error: ${error.message}`));
          }
        });

      } catch (error) {
        reject(new Error(`Papa Parse error: ${error.message}`));
      }
    });
  }

  /**
   * Get score value with multiple fallback methods
   */
  getScoreValue(row, participantName) {
    // Try exact match first
    if (row[participantName] !== undefined) {
      return row[participantName];
    }

    // Try trimmed match
    const trimmedName = participantName.trim();
    if (row[trimmedName] !== undefined) {
      return row[trimmedName];
    }

    // Try case-insensitive match
    const keys = Object.keys(row);
    const matchingKey = keys.find(key => 
      key.toLowerCase().trim() === participantName.toLowerCase().trim()
    );
    
    if (matchingKey) {
      return row[matchingKey];
    }

    return null;
  }

  /**
   * Parse year with validation
   */
  parseYear(value) {
    if (!value) return null;
    
    const year = parseInt(value.toString().trim());
    
    if (isNaN(year) || year < 2000 || year > 2100) {
      return null;
    }
    
    return year;
  }

  /**
   * Parse competition name
   */
  parseName(value) {
    if (!value) return null;
    
    const name = value.toString().trim();
    return name.length > 0 ? name : null;
  }

  /**
   * Parse location
   */
  parseLocation(value) {
    if (!value) return '';
    return value.toString().trim();
  }

  /**
   * Parse position value with improved handling
   */
  parsePosition(value) {
    if (!value || value === '-' || value === '') return null;

    // Handle numeric values
    const numValue = parseInt(value.toString().trim());
    if (!isNaN(numValue) && numValue > 0) {
      return numValue;
    }

    // Handle Swedish text descriptions
    const textValue = value.toString().toLowerCase().trim();
    
    const positionMappings = {
      'näst sist': 99,
      'sist': 100,
      'ej deltagit': null,
      'ej start': null,
      'diskad': null,
      'disqualified': null,
      'dns': null,
      'dnf': null
    };

    if (positionMappings.hasOwnProperty(textValue)) {
      return positionMappings[textValue];
    }

    console.warn('Could not parse position value:', value);
    return null;
  }

  /**
   * Extract name parts for nickname generation
   */
  getNameParts(fullName) {
    const parts = fullName.trim().split(' ').filter(part => part.length > 0);
    const firstName = parts[0] || '';
    const lastName = parts[parts.length - 1] || '';

    return {
      firstName: firstName,
      lastName: lastName,
      nickname: firstName + (lastName && lastName !== firstName ? ' ' + lastName.charAt(0) + '.' : '')
    };
  }

  /**
   * Generate unique ID
   */
  generateId(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
  }

  /**
   * Adjust special positions based on actual participant count
   */
  adjustSpecialPositions(competitions) {
    competitions.forEach(competition => {
      const positions = Object.values(competition.scores).filter(p => p < 90);
      const participantCount = positions.length;

      if (participantCount === 0) return;

      Object.keys(competition.scores).forEach(participantId => {
        const position = competition.scores[participantId];
        
        if (position === 99) {
          // "Näst sist" - second to last
          competition.scores[participantId] = Math.max(2, participantCount - 1);
        } else if (position === 100) {
          // "Sist" - last
          competition.scores[participantId] = participantCount;
        }
      });
    });

    return competitions;
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Import data into application with better error handling
   */
  async importIntoApp(importData) {
    try {
      if (!importData) {
        throw new Error('Ingen data att importera');
      }

      // Validate data structure
      if (!importData.competitions || !Array.isArray(importData.competitions)) {
        throw new Error('Ogiltig datastruktur: tävlingar saknas');
      }

      if (!importData.participants || !Array.isArray(importData.participants)) {
        throw new Error('Ogiltig datastruktur: deltagare saknas');
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
}

// Create global instance
window.csvImporter = new CSVImporter();

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

window.downloadImportedData = async function() {
  try {
    const data = await window.csvImporter.importCSVData();
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `pekkas-pokal-import-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log('Import data downloaded as JSON');
    
  } catch (error) {
    console.error('Failed to download import data:', error);
    throw error;
  }
};

console.log('Enhanced CSV Import script loaded');