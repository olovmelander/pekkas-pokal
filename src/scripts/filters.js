/**
 * Filter Manager - Handles all data filtering functionality
 */

class FilterManager {
  constructor() {
    this.filters = {
      competitor: 'all',
      timeframe: 'all',
      competitionType: 'all',
      achievement: 'all',
      rarity: 'all'
    };
    
    this.filterHistory = [];
    this.maxHistorySize = 20;
    this.callbacks = new Map();
  }

  /**
   * Apply all filters to competition data
   */
  applyFilters(competitionData, filters = this.filters) {
    const startTime = performance.now();
    
    let filteredCompetitions = [...competitionData.competitions];
    let filteredParticipants = [...competitionData.participants];
    
    // Apply timeframe filter
    filteredCompetitions = this.applyTimeframeFilter(filteredCompetitions, filters.timeframe);
    
    // Apply competition type filter
    filteredCompetitions = this.applyCompetitionTypeFilter(filteredCompetitions, filters.competitionType);
    
    // Apply competitor filter (affects both competitions and participants)
    if (filters.competitor !== 'all') {
      const ids = Array.isArray(filters.competitor)
        ? filters.competitor
        : [filters.competitor];
      filteredParticipants = filteredParticipants.filter(p => ids.includes(p.id));
      filteredCompetitions = this.applyCompetitorFilter(filteredCompetitions, ids);
    }
    
    const endTime = performance.now();
    console.log(`🔍 Filters applied in ${(endTime - startTime).toFixed(2)}ms`);
    
    return {
      competitions: filteredCompetitions,
      participants: filteredParticipants,
      originalData: competitionData
    };
  }

  /**
   * Apply timeframe filter
   */
  applyTimeframeFilter(competitions, timeframe) {
    if (timeframe === 'all') return competitions;
    
    const currentYear = new Date().getFullYear();
    let startYear;
    
    switch (timeframe) {
      case 'recent5':
        startYear = currentYear - 4;
        break;
      case 'recent3':
        startYear = currentYear - 2;
        break;
      case 'recent1':
        startYear = currentYear;
        break;
      default:
        // Assume it's a specific year
        const year = parseInt(timeframe);
        if (!isNaN(year)) {
          return competitions.filter(c => c.year === year);
        }
        return competitions;
    }
    
    return competitions.filter(c => c.year >= startYear);
  }

  /**
   * Apply competition type filter
   */
  applyCompetitionTypeFilter(competitions, competitionType) {
    if (competitionType === 'all') return competitions;
    
    return competitions.filter(c => c.name === competitionType);
  }

  /**
   * Apply competitor filter
   */
  applyCompetitorFilter(competitions, competitorIds) {
    if (competitorIds === 'all') return competitions;

    const ids = Array.isArray(competitorIds) ? competitorIds : [competitorIds];

    return competitions
      .map(comp => ({
        ...comp,
        scores: Object.fromEntries(
          Object.entries(comp.scores).filter(([pId]) => ids.includes(pId))
        )
      }))
      .filter(comp => Object.keys(comp.scores).length > 0);
  }

  /**
   * Apply achievement filters
   */
  applyAchievementFilters(achievements, filters) {
    let filtered = [...achievements];
    
    // Filter by category
    if (filters.achievement && filters.achievement !== 'all') {
      filtered = filtered.filter(ach => ach.category === filters.achievement);
    }
    
    // Filter by rarity
    if (filters.rarity && filters.rarity !== 'all') {
      filtered = filtered.filter(ach => ach.rarity === filters.rarity);
    }
    
    return filtered;
  }

  /**
   * Create advanced search functionality
   */
  createSearchFilter(searchTerm, searchFields = ['name', 'location', 'arranger3rd']) {
    const normalizedTerm = searchTerm.toLowerCase().trim();
    
    if (!normalizedTerm) return () => true;
    
    return (competition) => {
      return searchFields.some(field => {
        const value = competition[field];
        return value && value.toLowerCase().includes(normalizedTerm);
      });
    };
  }

  /**
   * Filter participants by various criteria
   */
  filterParticipants(participants, criteria) {
    let filtered = [...participants];
    
    // Filter by minimum participations
    if (criteria.minParticipations) {
      const competitionData = window.PekkasPokalApp?.getState()?.competitionData;
      if (competitionData) {
        filtered = filtered.filter(p => {
          const participations = competitionData.competitions.reduce((count, comp) => {
            return comp.scores[p.id] ? count + 1 : count;
          }, 0);
          return participations >= criteria.minParticipations;
        });
      }
    }
    
    // Filter by medal count
    if (criteria.minMedals) {
      const competitionData = window.PekkasPokalApp?.getState()?.competitionData;
      if (competitionData) {
        filtered = filtered.filter(p => {
          const medals = competitionData.competitions.reduce((count, comp) => {
            const position = comp.scores[p.id];
            return position && position <= 3 ? count + 1 : count;
          }, 0);
          return medals >= criteria.minMedals;
        });
      }
    }
    
    // Filter by name pattern
    if (criteria.namePattern) {
      const pattern = new RegExp(criteria.namePattern, 'i');
      filtered = filtered.filter(p => pattern.test(p.name));
    }
    
    return filtered;
  }

  /**
   * Create date range filter
   */
  createDateRangeFilter(startYear, endYear) {
    return (competition) => {
      return competition.year >= startYear && competition.year <= endYear;
    };
  }

  /**
   * Create position range filter
   */
  createPositionRangeFilter(participantId, minPosition = 1, maxPosition = 10) {
    return (competition) => {
      const position = competition.scores[participantId];
      return position && position >= minPosition && position <= maxPosition;
    };
  }

  /**
   * Create medal filter (only competitions where participant got a medal)
   */
  createMedalFilter(participantId) {
    return (competition) => {
      const position = competition.scores[participantId];
      return position && position <= 3;
    };
  }

  /**
   * Create win filter (only competitions where participant won)
   */
  createWinFilter(participantId) {
    return (competition) => {
      return competition.scores[participantId] === 1;
    };
  }

  /**
   * Combine multiple filters with AND logic
   */
  combineFiltersAnd(...filters) {
    return (item) => {
      return filters.every(filter => filter(item));
    };
  }

  /**
   * Combine multiple filters with OR logic
   */
  combineFiltersOr(...filters) {
    return (item) => {
      return filters.some(filter => filter(item));
    };
  }

  /**
   * Create filter presets for common use cases
   */
  getFilterPresets() {
    return {
      recentPerformance: {
        name: 'Senaste Prestationer',
        filters: {
          timeframe: 'recent3',
          competitor: 'all',
          competitionType: 'all'
        }
      },
      topPerformers: {
        name: 'Topprestationer',
        filters: {
          timeframe: 'all',
          competitor: 'all',
          competitionType: 'all'
        },
        customFilter: (data) => {
          // Only include participants with medals
          return this.filterParticipants(data.participants, { minMedals: 1 });
        }
      },
      veterans: {
        name: 'Veteraner',
        filters: {
          timeframe: 'all',
          competitor: 'all',
          competitionType: 'all'
        },
        customFilter: (data) => {
          return this.filterParticipants(data.participants, { minParticipations: 5 });
        }
      },
      currentDecade: {
        name: 'Senaste Decenniet',
        filters: {
          timeframe: 'recent10',
          competitor: 'all',
          competitionType: 'all'
        }
      },
      goldMedalists: {
        name: 'Guldmedaljörer',
        filters: {
          timeframe: 'all',
          competitor: 'all',
          competitionType: 'all'
        },
        customFilter: (data) => {
          const winners = new Set();
          data.competitions.forEach(comp => {
            Object.entries(comp.scores).forEach(([pId, position]) => {
              if (position === 1) {
                const participant = data.participants.find(p => p.id === pId);
                if (participant) winners.add(participant.name);
              }
            });
          });
          return data.participants.filter(p => winners.has(p.name));
        }
      }
    };
  }

  /**
   * Apply a filter preset
   */
  applyPreset(presetName, competitionData) {
    const presets = this.getFilterPresets();
    const preset = presets[presetName];
    
    if (!preset) {
      console.warn(`Filter preset "${presetName}" not found`);
      return competitionData;
    }
    
    // Apply standard filters
    let result = this.applyFilters(competitionData, preset.filters);
    
    // Apply custom filter if present
    if (preset.customFilter) {
      result.participants = preset.customFilter(result);
    }
    
    return result;
  }

  /**
   * Get filter suggestions based on current data
   */
  getFilterSuggestions(competitionData) {
    const suggestions = {
      years: [],
      competitions: [],
      participants: [],
      achievements: []
    };
    
    // Year suggestions
    const years = [...new Set(competitionData.competitions.map(c => c.year))].sort((a, b) => b - a);
    suggestions.years = years.slice(0, 10); // Last 10 years
    
    // Competition suggestions
    const competitions = [...new Set(competitionData.competitions.map(c => c.name))];
    suggestions.competitions = competitions.filter(name => name !== 'Covid');
    
    // Participant suggestions (most active)
    const participationCounts = {};
    competitionData.participants.forEach(p => {
      participationCounts[p.name] = competitionData.competitions.reduce((count, comp) => {
        return comp.scores[p.id] ? count + 1 : count;
      }, 0);
    });
    
    suggestions.participants = Object.entries(participationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, participations: count }));
    
    // Achievement suggestions (most common categories)
    if (window.ACHIEVEMENT_CATEGORIES) {
      suggestions.achievements = Object.keys(window.ACHIEVEMENT_CATEGORIES)
        .filter(cat => cat !== 'all');
    }
    
    return suggestions;
  }

  /**
   * Set filter value
   */
  setFilter(filterName, value) {
    const oldValue = this.filters[filterName];
    this.filters[filterName] = value;
    
    // Add to history
    this.addToHistory({
      action: 'set',
      filter: filterName,
      oldValue: oldValue,
      newValue: value,
      timestamp: Date.now()
    });
    
    // Trigger callbacks
    this.triggerCallbacks('filterChanged', { filterName, oldValue, newValue: value });
  }

  /**
   * Get current filter value
   */
  getFilter(filterName) {
    return this.filters[filterName];
  }

  /**
   * Get all current filters
   */
  getAllFilters() {
    return { ...this.filters };
  }

  /**
   * Reset all filters
   */
  resetAllFilters() {
    const oldFilters = { ...this.filters };
    
    this.filters = {
      competitor: 'all',
      timeframe: 'all',
      competitionType: 'all',
      achievement: 'all',
      rarity: 'all'
    };
    
    this.addToHistory({
      action: 'reset',
      oldFilters: oldFilters,
      newFilters: { ...this.filters },
      timestamp: Date.now()
    });
    
    this.triggerCallbacks('filtersReset', { oldFilters, newFilters: this.filters });
  }

  /**
   * Reset specific filter
   */
  resetFilter(filterName) {
    this.setFilter(filterName, 'all');
  }

  /**
   * Check if any filters are active
   */
  hasActiveFilters() {
    return Object.values(this.filters).some(value => value !== 'all');
  }

  /**
   * Get active filters summary
   */
  getActiveFiltersSummary() {
    const active = Object.entries(this.filters)
      .filter(([key, value]) => value !== 'all')
      .map(([key, value]) => ({ filter: key, value }));
    
    return {
      count: active.length,
      filters: active,
      hasActiveFilters: active.length > 0
    };
  }

  /**
   * Save current filter state
   */
  saveFilterState(name) {
    const state = {
      name: name,
      filters: { ...this.filters },
      timestamp: Date.now()
    };
    
    const savedStates = this.getSavedFilterStates();
    savedStates[name] = state;
    
    try {
      // Note: localStorage not available in Claude.ai environment
      // This would work in a real browser environment
      // localStorage.setItem('pekkasPokalFilterStates', JSON.stringify(savedStates));
      console.log('Filter state saved:', name, state);
    } catch (e) {
      console.warn('Could not save filter state to localStorage');
    }
    
    return state;
  }

  /**
   * Load saved filter state
   */
  loadFilterState(name) {
    const savedStates = this.getSavedFilterStates();
    const state = savedStates[name];
    
    if (state) {
      const oldFilters = { ...this.filters };
      this.filters = { ...state.filters };
      
      this.addToHistory({
        action: 'load',
        stateName: name,
        oldFilters: oldFilters,
        newFilters: { ...this.filters },
        timestamp: Date.now()
      });
      
      this.triggerCallbacks('filtersLoaded', { stateName: name, filters: this.filters });
      return true;
    }
    
    return false;
  }

  /**
   * Get saved filter states
   */
  getSavedFilterStates() {
    try {
      // const saved = localStorage.getItem('pekkasPokalFilterStates');
      // return saved ? JSON.parse(saved) : {};
      return {}; // Fallback for Claude.ai environment
    } catch (e) {
      return {};
    }
  }

  /**
   * Delete saved filter state
   */
  deleteFilterState(name) {
    const savedStates = this.getSavedFilterStates();
    delete savedStates[name];
    
    try {
      // localStorage.setItem('pekkasPokalFilterStates', JSON.stringify(savedStates));
      console.log('Filter state deleted:', name);
    } catch (e) {
      console.warn('Could not delete filter state from localStorage');
    }
  }

  /**
   * Register callback for filter events
   */
  onFilterChange(callback) {
    return this.registerCallback('filterChanged', callback);
  }

  /**
   * Register callback for filter reset events
   */
  onFiltersReset(callback) {
    return this.registerCallback('filtersReset', callback);
  }

  /**
   * Register callback
   */
  registerCallback(event, callback) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    
    const callbacks = this.callbacks.get(event);
    callbacks.push(callback);
    
    // Return unregister function
    return () => {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Trigger callbacks for an event
   */
  triggerCallbacks(event, data) {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in filter callback:', error);
        }
      });
    }
  }

  /**
   * Add entry to filter history
   */
  addToHistory(entry) {
    this.filterHistory.push(entry);
    
    // Keep history size manageable
    if (this.filterHistory.length > this.maxHistorySize) {
      this.filterHistory.shift();
    }
  }

  /**
   * Get filter history
   */
  getFilterHistory() {
    return [...this.filterHistory];
  }

  /**
   * Clear filter history
   */
  clearFilterHistory() {
    this.filterHistory = [];
  }

  /**
   * Export filter configuration
   */
  exportFilters() {
    return {
      filters: { ...this.filters },
      timestamp: Date.now(),
      version: '1.0'
    };
  }

  /**
   * Import filter configuration
   */
  importFilters(config) {
    if (config && config.filters) {
      const oldFilters = { ...this.filters };
      this.filters = { ...config.filters };
      
      this.addToHistory({
        action: 'import',
        oldFilters: oldFilters,
        newFilters: { ...this.filters },
        timestamp: Date.now()
      });
      
      this.triggerCallbacks('filtersImported', { filters: this.filters });
      return true;
    }
    
    return false;
  }

  /**
   * Get filter statistics
   */
  getFilterStats() {
    return {
      currentFilters: { ...this.filters },
      activeFiltersCount: Object.values(this.filters).filter(v => v !== 'all').length,
      historySize: this.filterHistory.length,
      callbacksRegistered: Array.from(this.callbacks.entries()).map(([event, callbacks]) => ({
        event,
        count: callbacks.length
      }))
    };
  }
}

// Export for global access
window.FilterManager = FilterManager;