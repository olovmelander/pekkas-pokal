/**
 * Data Manager - Handles CSV loading and data processing
 */

class DataManager {
  constructor() {
    this.csvFileName = 'Pekkas Pokal Marathontabell Marathontabell.csv';
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load CSV data with multiple fallback methods
   */
  async loadCSVData() {
    try {
      // Check cache first
      const cached = this.getCachedData();
      if (cached) {
        console.log('📋 Using cached data');
        return cached;
      }

      console.log('📥 Loading CSV data...');
      let csvContent = null;
      
      // Method 1: Try window.fs API if available (from artifacts environment)
      if (window.fs && window.fs.readFile) {
        try {
          csvContent = await window.fs.readFile(this.csvFileName, { encoding: 'utf8' });
          console.log('✅ CSV loaded via fs.readFile');
        } catch (e) {
          console.log('⚠️ fs.readFile not available');
        }
      }
      
      // Method 2: Try fetch from relative path
      if (!csvContent) {
        try {
          const response = await fetch(`src/data/${this.csvFileName}`);
          if (response.ok) {
            csvContent = await response.text();
            console.log('✅ CSV loaded via fetch');
          }
        } catch (e) {
          console.log('⚠️ Fetch failed:', e.message);
        }
      }
      
      // Method 3: Try fetch from current directory
      if (!csvContent) {
        try {
          const response = await fetch(this.csvFileName);
          if (response.ok) {
            csvContent = await response.text();
            console.log('✅ CSV loaded via fetch (current dir)');
          }
        } catch (e) {
          console.log('⚠️ Direct fetch failed:', e.message);
        }
      }
      
      // Method 4: Use embedded data as fallback
      if (!csvContent) {
        console.log('🔄 Using embedded CSV data as fallback');
        csvContent = this.getEmbeddedCSV();
      }
      
      // Parse CSV content
      const processedData = await this.parseCSVContent(csvContent);
      
      // Cache the result
      this.setCachedData(processedData);
      
      return processedData;
      
    } catch (error) {
      console.error('❌ Failed to load CSV:', error);
      
      // Final fallback to embedded data
      console.log('🆘 Using embedded data as final fallback');
      const embeddedData = this.parseCSVContent(this.getEmbeddedCSV());
      return embeddedData;
    }
  }

  /**
   * Parse CSV content using Papa Parse or native parser
   */
  async parseCSVContent(csvContent) {
    let parsedData;
    
    if (typeof Papa !== 'undefined') {
      // Use Papa Parse if available
      console.log('📊 Parsing with Papa Parse...');
      parsedData = await new Promise((resolve, reject) => {
        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false, // Keep as strings for better control
          complete: (results) => {
            if (results.errors.length > 0) {
              console.warn('⚠️ Papa Parse warnings:', results.errors);
            }
            resolve({
              data: results.data,
              headers: results.meta.fields
            });
          },
          error: (error) => {
            console.error('❌ Papa Parse error:', error);
            reject(error);
          }
        });
      });
    } else {
      // Use native parser
      console.log('🔧 Parsing with native parser...');
      parsedData = this.parseCSVNative(csvContent);
    }
    
    // Process the parsed data
    return this.processData(parsedData.data, parsedData.headers);
  }

  /**
   * Native CSV parser fallback
   */
  parseCSVNative(csvContent) {
    const lines = csvContent.trim().split(/\r?\n/);
    const headers = this.parseCSVLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = this.parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }
    
    return { data, headers };
  }

  /**
   * Parse a single CSV line handling quotes and commas
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
   * Process raw CSV data into application format
   */
  processData(rows, headers) {
    console.log('🔄 Processing data...');
    
    // Fixed columns that aren't participants
    const fixedColumns = ['År', 'Tävling', 'Plats', 'Arrangör 3:a', 'Arrangör näst sist'];
    
    // Extract participant names from headers
    const participantNames = headers.filter(h => 
      h && !fixedColumns.includes(h) && h.trim() !== ''
    );
    
    console.log(`👥 Found ${participantNames.length} participants:`, participantNames);
    
    // Create participants with IDs
    const participants = participantNames.map((name, index) => ({
      id: `p${index + 1}`,
      name: name.trim(),
      nickname: this.createNickname(name)
    }));
    
    // Create participant name to ID mapping
    const participantIdMap = {};
    participants.forEach(p => {
      participantIdMap[p.name] = p.id;
    });
    
    // Process competitions
    const competitions = [];
    
    rows.forEach((row, index) => {
      try {
        const year = this.parseYear(row['År']);
        const name = row['Tävling']?.trim();
        const location = row['Plats']?.trim() || '';
        const arranger3rd = row['Arrangör 3:a']?.trim() || '';
        const arrangerSecondLast = row['Arrangör näst sist']?.trim() || '';
        
        if (!year || !name) {
          console.warn(`⚠️ Skipping invalid row ${index + 2}:`, row);
          return;
        }
        
        // Special handling for Covid year
        if (name.toLowerCase() === 'covid') {
          competitions.push({
            id: `c${competitions.length + 1}`,
            year: year,
            name: 'Covid',
            location: '',
            winner: null,
            scores: {},
            arranger3rd: '',
            arrangerSecondLast: '',
            participantCount: 0
          });
          return;
        }
        
        const scores = {};
        let winner = null;
        let participantCount = 0;
        
        // Process scores for each participant
        participantNames.forEach(participantName => {
          const value = row[participantName];
          if (value && value !== '' && value !== '-') {
            const score = this.parseScore(value);
            if (score !== null) {
              const pId = participantIdMap[participantName];
              scores[pId] = score;
              participantCount++;
              
              if (score === 1) {
                winner = participantName;
              }
            }
          }
        });
        
        // Adjust special positions (näst sist = second to last)
        Object.entries(scores).forEach(([pId, score]) => {
          if (score === 99) { // Näst sist marker
            scores[pId] = Math.max(2, participantCount - 1);
          } else if (score === 100) { // Sist marker
            scores[pId] = participantCount;
          }
        });
        
        competitions.push({
          id: `c${competitions.length + 1}`,
          year: year,
          name: name,
          location: location,
          winner: winner,
          scores: scores,
          arranger3rd: arranger3rd,
          arrangerSecondLast: arrangerSecondLast,
          participantCount: participantCount
        });
        
      } catch (error) {
        console.error(`❌ Error processing row ${index + 2}:`, error, row);
      }
    });
    
    // Sort competitions by year (newest first)
    competitions.sort((a, b) => b.year - a.year);
    
    const result = {
      participants,
      competitions,
      participantAchievements: {}, // Will be calculated later
      initialized: true
    };
    
    console.log(`✅ Processed ${competitions.length} competitions and ${participants.length} participants`);
    
    return result;
  }

  /**
   * Parse year from string, handling date formats
   */
  parseYear(yearString) {
    if (!yearString) return null;
    
    const str = yearString.toString().trim();
    
    // Handle date formats like "2024-08-17"
    if (str.includes('-')) {
      const parts = str.split('-');
      return parseInt(parts[0]);
    }
    
    // Handle simple year
    const year = parseInt(str);
    return isNaN(year) ? null : year;
  }

  /**
   * Parse score value with special handling
   */
  parseScore(value) {
    if (!value || value === '-' || value === '') return null;
    
    const textValue = value.toString().toLowerCase().trim();
    
    // Handle special text values
    if (textValue === 'näst sist' || textValue === 'nest sist') return 99;
    if (textValue === 'sist' || textValue === 'last') return 100;
    
    // Handle numeric values
    const numValue = parseInt(value);
    return isNaN(numValue) ? null : numValue;
  }

  /**
   * Create nickname from full name
   */
  createNickname(fullName) {
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return parts[0];
    
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    return firstName + ' ' + lastName.charAt(0) + '.';
  }

  /**
   * Get embedded CSV data as fallback
   */
  getEmbeddedCSV() {
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

  /**
   * Cache management
   */
  getCachedData() {
    const cached = this.cache.get('competitionData');
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  setCachedData(data) {
    this.cache.set('competitionData', {
      data: data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Data validation
   */
  validateData(data) {
    const errors = [];
    
    if (!data.participants || data.participants.length === 0) {
      errors.push('No participants found');
    }
    
    if (!data.competitions || data.competitions.length === 0) {
      errors.push('No competitions found');
    }
    
    // Check for duplicate participant IDs
    const participantIds = data.participants.map(p => p.id);
    const uniqueIds = new Set(participantIds);
    if (uniqueIds.size !== participantIds.length) {
      errors.push('Duplicate participant IDs found');
    }
    
    // Check for valid years
    const invalidYears = data.competitions.filter(c => 
      !c.year || c.year < 2000 || c.year > new Date().getFullYear() + 1
    );
    if (invalidYears.length > 0) {
      errors.push(`Invalid years found: ${invalidYears.map(c => c.year).join(', ')}`);
    }
    
    if (errors.length > 0) {
      console.warn('⚠️ Data validation warnings:', errors);
    }
    
    return errors.length === 0;
  }

  /**
   * Export data to CSV format
   */
  exportToCSV(data) {
    // Implementation for exporting processed data back to CSV
    // Useful for data backup or sharing
    const headers = ['År', 'Tävling', 'Plats', 'Arrangör 3:a', 'Arrangör näst sist'];
    const participantHeaders = data.participants.map(p => p.name);
    const allHeaders = [...headers, ...participantHeaders];
    
    let csv = allHeaders.join(',') + '\n';
    
    data.competitions.forEach(comp => {
      const row = [
        comp.year,
        comp.name,
        comp.location,
        comp.arranger3rd,
        comp.arrangerSecondLast
      ];
      
      // Add participant scores
      data.participants.forEach(p => {
        const score = comp.scores[p.id];
        row.push(score || '-');
      });
      
      csv += row.join(',') + '\n';
    });
    
    return csv;
  }
}

// Export for global access
window.DataManager = DataManager;