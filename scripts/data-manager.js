/**
 * Data Manager - Handles all data operations and persistence
 * Manages competitions, participants, and application state
 */

class DataManager {
  constructor() {
    this.competitions = [];
    this.participants = [];
    this.isInitialized = false;
    this.storageKey = 'pekkas-pokal-data';
    this.version = '2.0';
    
    // Default participants (can be customized)
    this.defaultParticipants = [
      { name: 'Olov Melander', nickname: 'Olov M.', status: 'active' },
      { name: 'Mikael Hägglund', nickname: 'Mikael H.', status: 'active' },
      { name: 'Viktor Jones', nickname: 'Viktor J.', status: 'active' },
      { name: 'Per Vikman', nickname: 'Per V.', status: 'active' },
      { name: 'Erik Vallgren', nickname: 'Erik V.', status: 'active' },
      { name: 'Henrik Lundqvist', nickname: 'Henrik L.', status: 'active' },
      { name: 'Rickard Nilsson', nickname: 'Rickard N.', status: 'active' },
      { name: 'Niklas Norberg', nickname: 'Niklas N.', status: 'active' },
      { name: 'Per Olsson', nickname: 'Per O.', status: 'active' },
      { name: 'Tobias Lundqvist', nickname: 'Tobias L.', status: 'active' },
      { name: 'Lars Sandin', nickname: 'Lars S.', status: 'active' },
      { name: 'Ludwig Ulenius', nickname: 'Ludwig U.', status: 'active' }
    ];
  }
  
  /**
   * Initialize the data manager
   */
  async init() {
    try {
      await this.loadData();
      
      // Initialize with default participants if none exist
      if (this.participants.length === 0) {
        await this.initializeDefaultParticipants();
      }
      
      this.isInitialized = true;
      console.log('Data Manager initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Data Manager:', error);
      throw error;
    }
  }
  
  /**
   * Load data from localStorage
   */
  async loadData() {
    try {
      const savedData = localStorage.getItem(this.storageKey);
      
      if (savedData) {
        const data = JSON.parse(savedData);
        
        // Validate data structure
        if (this.validateDataStructure(data)) {
          this.competitions = data.competitions || [];
          this.participants = data.participants || [];
          
          // Migrate data if needed
          await this.migrateDataIfNeeded(data);
          
          console.log(`Loaded ${this.competitions.length} competitions and ${this.participants.length} participants`);
        } else {
          console.warn('Invalid data structure found, reinitializing');
          await this.initializeDefaultData();
        }
      } else {
        console.log('No saved data found, initializing defaults');
        await this.initializeDefaultData();
      }
      
    } catch (error) {
      console.error('Failed to load data:', error);
      await this.initializeDefaultData();
    }
  }
  
  /**
   * Save data to localStorage
   */
  async saveData() {
    try {
      const dataToSave = {
        version: this.version,
        timestamp: new Date().toISOString(),
        competitions: this.competitions,
        participants: this.participants
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
      console.log('Data saved successfully');
      
    } catch (error) {
      console.error('Failed to save data:', error);
      throw error;
    }
  }
  
  /**
   * Validate data structure
   */
  validateDataStructure(data) {
    if (!data || typeof data !== 'object') return false;
    
    // Check if competitions is an array
    if (!Array.isArray(data.competitions)) return false;
    
    // Check if participants is an array
    if (!Array.isArray(data.participants)) return false;
    
    // Validate competition structure
    for (const comp of data.competitions) {
      if (!comp.id || !comp.year || !comp.name) return false;
    }
    
    // Validate participant structure
    for (const participant of data.participants) {
      if (!participant.id || !participant.name) return false;
    }
    
    return true;
  }
  
  /**
   * Migrate data to newer version if needed
   */
  async migrateDataIfNeeded(data) {
    const dataVersion = data.version || '1.0';
    
    if (dataVersion === this.version) return;
    
    console.log(`Migrating data from version ${dataVersion} to ${this.version}`);
    
    // Add IDs to items that don't have them
    this.competitions.forEach(comp => {
      if (!comp.id) {
        comp.id = this.generateId();
      }
    });
    
    this.participants.forEach(participant => {
      if (!participant.id) {
        participant.id = this.generateId();
      }
    });
    
    // Save migrated data
    await this.saveData();
  }
  
  /**
   * Initialize default data
   */
  async initializeDefaultData() {
    this.competitions = [];
    await this.initializeDefaultParticipants();
    await this.saveData();
  }
  
  /**
   * Initialize default participants
   */
  async initializeDefaultParticipants() {
    this.participants = this.defaultParticipants.map(participant => ({
      ...participant,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    }));
    
    await this.saveData();
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  }
  
  // ===== COMPETITION METHODS =====
  
  /**
   * Get all competitions
   */
  async getCompetitions() {
    return [...this.competitions].sort((a, b) => b.year - a.year);
  }
  
  /**
   * Get competition by ID
   */
  async getCompetition(id) {
    return this.competitions.find(comp => comp.id === id);
  }
  
  /**
   * Add new competition
   */
  async addCompetition(competitionData) {
    const competition = {
      ...competitionData,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      scores: competitionData.scores || {}
    };
    
    this.competitions.push(competition);
    await this.saveData();
    
    return competition;
  }
  
  /**
   * Update competition
   */
  async updateCompetition(id, updates) {
    const index = this.competitions.findIndex(comp => comp.id === id);
    
    if (index === -1) {
      throw new Error('Competition not found');
    }
    
    this.competitions[index] = {
      ...this.competitions[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await this.saveData();
    return this.competitions[index];
  }
  
  /**
   * Update competition score for a participant
   */
  async updateCompetitionScore(competitionId, participantId, score) {
    const competition = await this.getCompetition(competitionId);
    
    if (!competition) {
      throw new Error('Competition not found');
    }
    
    if (!competition.scores) {
      competition.scores = {};
    }
    
    // Parse score value
    const parsedScore = score === '' || score === '-' ? null : parseFloat(score);
    
    if (parsedScore === null || isNaN(parsedScore)) {
      delete competition.scores[participantId];
    } else {
      competition.scores[participantId] = parsedScore;
    }
    
    // Auto-determine winner if all scores are placements (1, 2, 3, etc.)
    await this.updateCompetitionWinner(competitionId);
    
    await this.saveData();
    return competition;
  }
  
  /**
   * Auto-update competition winner based on scores
   */
  async updateCompetitionWinner(competitionId) {
    const competition = await this.getCompetition(competitionId);
    
    if (!competition || !competition.scores) return;
    
    const scores = competition.scores;
    const scoreEntries = Object.entries(scores);
    
    if (scoreEntries.length === 0) return;
    
    // Find the best score (lowest number for placement, highest for points)
    let bestScore = null;
    let winnerId = null;
    
    scoreEntries.forEach(([participantId, score]) => {
      if (score !== null && score !== undefined) {
        if (bestScore === null || score < bestScore) { // Assuming lower is better (placement)
          bestScore = score;
          winnerId = participantId;
        }
      }
    });
    
    if (winnerId) {
      const winner = await this.getParticipant(winnerId);
      if (winner) {
        competition.winner = winner.name;
        await this.saveData();
      }
    }
  }
  
  /**
   * Delete competition
   */
  async deleteCompetition(id) {
    const index = this.competitions.findIndex(comp => comp.id === id);
    
    if (index === -1) {
      throw new Error('Competition not found');
    }
    
    this.competitions.splice(index, 1);
    await this.saveData();
  }
  
  // ===== PARTICIPANT METHODS =====
  
  /**
   * Get all participants
   */
  async getParticipants() {
    return [...this.participants].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }
  
  /**
   * Get participant by ID
   */
  async getParticipant(id) {
    return this.participants.find(p => p.id === id);
  }
  
  /**
   * Add new participant
   */
  async addParticipant(participantData) {
    const participant = {
      ...participantData,
      id: this.generateId(),
      status: participantData.status || 'active',
      createdAt: new Date().toISOString()
    };
    
    this.participants.push(participant);
    await this.saveData();
    
    return participant;
  }
  
  /**
   * Update participant
   */
  async updateParticipant(id, updates) {
    const index = this.participants.findIndex(p => p.id === id);
    
    if (index === -1) {
      throw new Error('Participant not found');
    }
    
    this.participants[index] = {
      ...this.participants[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await this.saveData();
    return this.participants[index];
  }
  
  /**
   * Delete participant
   */
  async deleteParticipant(id) {
    const index = this.participants.findIndex(p => p.id === id);
    
    if (index === -1) {
      throw new Error('Participant not found');
    }
    
    // Remove participant from all competition scores
    this.competitions.forEach(competition => {
      if (competition.scores && competition.scores[id]) {
        delete competition.scores[id];
      }
    });
    
    this.participants.splice(index, 1);
    await this.saveData();
  }
  
  // ===== DATA ANALYSIS METHODS =====
  
  /**
   * Get participant statistics
   */
  async getParticipantStats(participantId) {
    const participant = await this.getParticipant(participantId);
    if (!participant) return null;
    
    const stats = {
      totalCompetitions: 0,
      wins: 0,
      podiumFinishes: 0,
      averagePosition: 0,
      bestPosition: null,
      worstPosition: null,
      participationRate: 0,
      recentForm: [], // Last 5 competitions
      yearlyStats: {}
    };
    
    const competitionsWithParticipant = this.competitions.filter(comp => 
      comp.scores && comp.scores[participantId] !== undefined
    );
    
    stats.totalCompetitions = competitionsWithParticipant.length;
    
    if (stats.totalCompetitions === 0) {
      return stats;
    }
    
    let totalPosition = 0;
    const positions = [];
    
    competitionsWithParticipant.forEach(competition => {
      const score = competition.scores[participantId];
      if (score !== null && score !== undefined) {
        positions.push(score);
        totalPosition += score;
        
        if (score === 1) stats.wins++;
        if (score <= 3) stats.podiumFinishes++;
        
        if (stats.bestPosition === null || score < stats.bestPosition) {
          stats.bestPosition = score;
        }
        if (stats.worstPosition === null || score > stats.worstPosition) {
          stats.worstPosition = score;
        }
        
        // Yearly stats
        const year = competition.year;
        if (!stats.yearlyStats[year]) {
          stats.yearlyStats[year] = {
            competitions: 0,
            wins: 0,
            averagePosition: 0,
            totalPosition: 0
          };
        }
        stats.yearlyStats[year].competitions++;
        stats.yearlyStats[year].totalPosition += score;
        if (score === 1) stats.yearlyStats[year].wins++;
      }
    });
    
    // Calculate averages
    if (positions.length > 0) {
      stats.averagePosition = totalPosition / positions.length;
    }
    
    // Calculate yearly averages
    Object.values(stats.yearlyStats).forEach(yearStats => {
      if (yearStats.competitions > 0) {
        yearStats.averagePosition = yearStats.totalPosition / yearStats.competitions;
      }
    });
    
    // Recent form (last 5 competitions)
    const recentCompetitions = [...competitionsWithParticipant]
      .sort((a, b) => b.year - a.year)
      .slice(0, 5);
    
    stats.recentForm = recentCompetitions.map(comp => ({
      year: comp.year,
      competition: comp.name,
      position: comp.scores[participantId]
    }));
    
    // Participation rate
    stats.participationRate = this.competitions.length > 0 
      ? (stats.totalCompetitions / this.competitions.length) * 100 
      : 0;
    
    return stats;
  }
  
  /**
   * Get competition statistics
   */
  async getCompetitionStats() {
    const stats = {
      totalCompetitions: this.competitions.length,
      totalParticipants: this.participants.length,
      activeParticipants: this.participants.filter(p => p.status === 'active').length,
      yearRange: { start: null, end: null },
      competitionTypes: {},
      locations: {},
      participationTrends: {},
      winnerStats: {}
    };
    
    if (this.competitions.length === 0) {
      return stats;
    }
    
    // Year range
    const years = this.competitions.map(c => c.year).sort((a, b) => a - b);
    stats.yearRange.start = years[0];
    stats.yearRange.end = years[years.length - 1];
    
    // Analyze competitions
    this.competitions.forEach(competition => {
      // Competition types
      const type = competition.name || 'Unknown';
      stats.competitionTypes[type] = (stats.competitionTypes[type] || 0) + 1;
      
      // Locations
      const location = competition.location || 'Unknown';
      stats.locations[location] = (stats.locations[location] || 0) + 1;
      
      // Participation trends by year
      const year = competition.year;
      const participantCount = Object.keys(competition.scores || {}).length;
      
      if (!stats.participationTrends[year]) {
        stats.participationTrends[year] = {
          competitions: 0,
          totalParticipants: 0,
          averageParticipants: 0
        };
      }
      
      stats.participationTrends[year].competitions++;
      stats.participationTrends[year].totalParticipants += participantCount;
      
      // Winner stats
      if (competition.winner) {
        stats.winnerStats[competition.winner] = (stats.winnerStats[competition.winner] || 0) + 1;
      }
    });
    
    // Calculate averages for participation trends
    Object.values(stats.participationTrends).forEach(trend => {
      if (trend.competitions > 0) {
        trend.averageParticipants = trend.totalParticipants / trend.competitions;
      }
    });
    
    return stats;
  }
  
  // ===== IMPORT/EXPORT METHODS =====
  
  /**
   * Export all data
   */
  async exportData() {
    return {
      version: this.version,
      exportDate: new Date().toISOString(),
      competitions: this.competitions,
      participants: this.participants,
      metadata: {
        totalCompetitions: this.competitions.length,
        totalParticipants: this.participants.length
      }
    };
  }
  
  /**
   * Import data from external source
   */
  async importData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }
    
    // Validate imported data
    if (!Array.isArray(data.competitions) || !Array.isArray(data.participants)) {
      throw new Error('Invalid data structure');
    }
    
    // Backup current data
    const backup = await this.exportData();
    
    try {
      // Import competitions
      if (data.competitions) {
        this.competitions = data.competitions.map(comp => ({
          ...comp,
          id: comp.id || this.generateId(),
          importedAt: new Date().toISOString()
        }));
      }
      
      // Import participants
      if (data.participants) {
        this.participants = data.participants.map(participant => ({
          ...participant,
          id: participant.id || this.generateId(),
          importedAt: new Date().toISOString()
        }));
      }
      
      await this.saveData();
      console.log('Data imported successfully');
      
    } catch (error) {
      // Restore backup on error
      this.competitions = backup.competitions;
      this.participants = backup.participants;
      await this.saveData();
      
      throw new Error('Import failed: ' + error.message);
    }
  }
  
  /**
   * Clear all data
   */
  async clearAllData() {
    this.competitions = [];
    this.participants = [];
    await this.saveData();
  }
  
  /**
   * Load sample data for demonstration
   */
  async loadSampleData() {
    // Clear existing data
    await this.clearAllData();
    
    // Initialize default participants
    await this.initializeDefaultParticipants();
    
    // Add sample competitions
    const sampleCompetitions = [
      {
        year: 2024,
        name: 'Fisketävling',
        location: 'Själevad',
        date: '2024-07-15',
        winner: 'Viktor Jones',
        scores: {
          [this.participants[2].id]: 1, // Viktor
          [this.participants[8].id]: 2, // Per O.
          [this.participants[0].id]: 3, // Olov
          [this.participants[1].id]: 4, // Mikael
          [this.participants[3].id]: 5, // Per V.
          [this.participants[5].id]: 6, // Henrik
          [this.participants[6].id]: 7, // Rickard
          [this.participants[4].id]: 8  // Erik
        }
      },
      {
        year: 2023,
        name: 'Fäktning',
        location: 'Stockholm',
        date: '2023-06-20',
        winner: 'Erik Vallgren',
        scores: {
          [this.participants[4].id]: 1, // Erik
          [this.participants[5].id]: 2, // Henrik
          [this.participants[1].id]: 3, // Mikael
          [this.participants[6].id]: 4, // Rickard
          [this.participants[0].id]: 5, // Olov
          [this.participants[7].id]: 6, // Niklas
          [this.participants[3].id]: 7, // Per V.
          [this.participants[2].id]: 8  // Viktor
        }
      },
      {
        year: 2022,
        name: 'Bowling',
        location: 'Göteborg',
        date: '2022-05-14',
        winner: 'Henrik Lundqvist',
        scores: {
          [this.participants[5].id]: 1, // Henrik
          [this.participants[3].id]: 2, // Per V.
          [this.participants[2].id]: 3, // Viktor
          [this.participants[0].id]: 4, // Olov
          [this.participants[6].id]: 5, // Rickard
          [this.participants[1].id]: 6, // Mikael
          [this.participants[4].id]: 7, // Erik
          [this.participants[8].id]: 8  // Per O.
        }
      }
    ];
    
    for (const compData of sampleCompetitions) {
      await this.addCompetition(compData);
    }
    
    console.log('Sample data loaded successfully');
  }
  
  /**
   * Get storage usage information
   */
  getStorageInfo() {
    const data = localStorage.getItem(this.storageKey);
    const size = data ? new Blob([data]).size : 0;
    
    return {
      size: size,
      sizeFormatted: this.formatBytes(size),
      lastUpdated: this.competitions.length > 0 || this.participants.length > 0 
        ? new Date().toISOString() 
        : null
    };
  }
  
  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

// Initialize global data manager
window.dataManager = new DataManager();