/**
 * CSV Import Script for Pekkas Pokal
 * Converts the CSV data to the application's expected format
 */

async function importCSVData() {
  try {
    console.log('Starting CSV import...');
    
    // Read the CSV file
    const csvContent = await window.fs.readFile('Pekkas Pokal Marathontabell  Marathontabell 2.csv', { encoding: 'utf8' });
    
    // Parse the CSV using Papa Parse
    const parsedData = Papa.parse(csvContent, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';']
    });
    
    if (parsedData.errors.length > 0) {
      console.error('CSV parsing errors:', parsedData.errors);
    }
    
    // Extract participant names (excluding År, Tävling, Plats)
    const participantColumns = parsedData.meta.fields.slice(3);
    console.log('Found participants:', participantColumns);
    
    // Create participants data
    const participants = participantColumns.map(name => ({
      id: generateId('participant'),
      name: name.trim(),
      nickname: getNameParts(name).nickname,
      status: 'active',
      createdAt: new Date().toISOString()
    }));
    
    // Create a map of participant names to IDs
    const participantIdMap = {};
    participants.forEach(p => {
      participantIdMap[p.name] = p.id;
    });
    
    // Process competitions
    const competitions = [];
    
    for (const row of parsedData.data) {
      const year = parseInt(row['År']);
      const name = row['Tävling']?.trim();
      const location = row['Plats']?.trim() || '';
      
      if (!year || !name) {
        console.warn('Skipping invalid row:', row);
        continue;
      }
      
      // Process scores for this competition
      const scores = {};
      let winner = null;
      let bestPosition = null;
      
      participantColumns.forEach(participantName => {
        const scoreValue = row[participantName]?.toString()?.trim();
        if (scoreValue && scoreValue !== '' && scoreValue !== '-') {
          const position = parsePosition(scoreValue);
          if (position !== null) {
            const participantId = participantIdMap[participantName];
            scores[participantId] = position;
            
            // Track the winner (position 1)
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
      
      const competition = {
        id: generateId('competition'),
        year: year,
        name: name,
        location: location,
        winner: winner,
        scores: scores,
        createdAt: new Date().toISOString()
      };
      
      competitions.push(competition);
    }
    
    // Adjust special positions (like "näst sist")
    adjustSpecialPositions(competitions);
    
    console.log(`Created ${participants.length} participants and ${competitions.length} competitions`);
    
    // Create the final data structure
    const importData = {
      version: '2.0',
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
    console.error('CSV import failed:', error);
    throw error;
  }
}

/**
 * Parse position value, handling various formats
 */
function parsePosition(value) {
  if (!value || value === '-' || value === '') return null;
  
  // Handle numeric values
  const numValue = parseInt(value);
  if (!isNaN(numValue) && numValue > 0) {
    return numValue;
  }
  
  // Handle text descriptions
  const textValue = value.toLowerCase().trim();
  
  // Swedish text mappings
  const positionMappings = {
    'näst sist': 99,  // Second to last - we'll adjust this later based on total participants
    'sist': 100,      // Last
    'ej deltagit': null,
    'ej start': null,
    'diskad': null,
    'disqualified': null
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
function getNameParts(fullName) {
  const parts = fullName.trim().split(' ');
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  
  return {
    firstName: firstName,
    lastName: lastName,
    nickname: firstName + ' ' + lastName.charAt(0) + '.'
  };
}

/**
 * Generate unique ID
 */
function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
}

/**
 * Adjust special positions based on actual participant count
 */
function adjustSpecialPositions(competitions) {
  competitions.forEach(competition => {
    const positions = Object.values(competition.scores);
    const maxNormalPosition = Math.max(...positions.filter(p => p < 90));
    const participantCount = positions.length;
    
    // Adjust "näst sist" (99) to actual second-to-last position
    Object.keys(competition.scores).forEach(participantId => {
      if (competition.scores[participantId] === 99) {
        competition.scores[participantId] = Math.max(2, participantCount - 1);
      } else if (competition.scores[participantId] === 100) {
        competition.scores[participantId] = participantCount;
      }
    });
  });
  
  return competitions;
}

/**
 * Import CSV data into the application
 */
async function importCSVIntoApp() {
  try {
    // Import the CSV data
    const importData = await importCSVData();
    
    // Clear existing data (optional - you might want to merge instead)
    const confirmClear = confirm(
      'Vill du rensa befintlig data och importera CSV-datan? ' +
      'Detta kommer att ersätta all nuvarande data.'
    );
    
    if (!confirmClear) {
      console.log('Import cancelled by user');
      return;
    }
    
    // Import into the data manager
    if (window.dataManager) {
      await window.dataManager.importData(importData);
      console.log('CSV data imported successfully into application');
      
      // Reload the current view if app is available
      if (window.app) {
        await window.app.loadInitialData();
        window.app.showNotification(
          `Importerat ${importData.competitions.length} tävlingar och ${importData.participants.length} deltagare!`,
          'success'
        );
      }
    } else {
      console.error('Data manager not available');
    }
    
  } catch (error) {
    console.error('Failed to import CSV into app:', error);
    
    if (window.app) {
      window.app.showNotification('Fel vid CSV-import: ' + error.message, 'error');
    }
  }
}

/**
 * Download the imported data as JSON for backup
 */
async function downloadImportedData() {
  try {
    const importData = await importCSVData();
    
    const blob = new Blob([JSON.stringify(importData, null, 2)], { 
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
  }
}

// Make functions available globally
window.importCSVData = importCSVData;
window.importCSVIntoApp = importCSVIntoApp;
window.downloadImportedData = downloadImportedData;

console.log('CSV import script loaded. Available functions:');
console.log('- importCSVData() - Parse CSV and return data structure');
console.log('- importCSVIntoApp() - Import CSV data into the application');
console.log('- downloadImportedData() - Download parsed data as JSON');

// Auto-import if this script is loaded after the main app
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(() => {
    if (window.dataManager && window.app) {
      console.log('Auto-import available - call importCSVIntoApp() to import the CSV data');
    }
  }, 1000);
}