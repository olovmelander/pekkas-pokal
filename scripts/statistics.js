/**
 * Statistics Calculator - Advanced statistical analysis for competitions
 * Provides comprehensive statistics and trend analysis
 */

class StatisticsCalculator {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }
  
  /**
   * Get comprehensive participant statistics
   */
  async getParticipantStatistics(timeframe = 'all') {
    const cacheKey = `participant-stats-${timeframe}`;
    
    if (this.isValidCache(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }
    
    const participants = await window.dataManager.getParticipants();
    const competitions = await this.getFilteredCompetitions(timeframe);
    
    const statistics = [];
    
    for (const participant of participants) {
      const stats = await this.calculateParticipantStats(participant, competitions);
      statistics.push(stats);
    }
    
    // Sort by total wins, then by average position
    statistics.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.averagePosition - b.averagePosition;
    });
    
    this.setCache(cacheKey, statistics);
    return statistics;
  }
  
  /**
   * Calculate detailed statistics for a single participant
   */
  async calculateParticipantStats(participant, competitions) {
    const participantCompetitions = competitions.filter(comp => 
      comp.scores && comp.scores[participant.id] !== undefined
    );
    
    const stats = {
      id: participant.id,
      name: participant.name,
      status: participant.status,
      totalCompetitions: participantCompetitions.length,
      wins: 0,
      podiumFinishes: 0,
      top5Finishes: 0,
      averagePosition: 0,
      bestPosition: null,
      worstPosition: null,
      winRate: 0,
      podiumRate: 0,
      participationRate: 0,
      consistency: 0,
      improvement: 0,
      positions: [],
      yearlyStats: {},
      competitionTypeStats: {},
      recentForm: [],
      streaks: {
        currentWinStreak: 0,
        longestWinStreak: 0,
        currentPodiumStreak: 0,
        longestPodiumStreak: 0
      }
    };
    
    if (participantCompetitions.length === 0) {
      stats.participationRate = competitions.length > 0 
        ? 0 
        : 100;
      return stats;
    }
    
    let totalPosition = 0;
    const positions = [];
    let currentWinStreak = 0;
    let currentPodiumStreak = 0;
    let longestWinStreak = 0;
    let longestPodiumStreak = 0;
    
    // Sort competitions by year for streak calculations
    const sortedCompetitions = [...participantCompetitions].sort((a, b) => b.year - a.year);
    
    sortedCompetitions.forEach((competition, index) => {
      const position = competition.scores[participant.id];
      
      if (position !== null && position !== undefined) {
        positions.push(position);
        totalPosition += position;
        
        // Count achievements
        if (position === 1) {
          stats.wins++;
          currentWinStreak++;
          currentPodiumStreak++;
        } else {
          if (currentWinStreak > longestWinStreak) {
            longestWinStreak = currentWinStreak;
          }
          currentWinStreak = 0;
        }
        
        if (position <= 3) {
          stats.podiumFinishes++;
          if (position !== 1) {
            currentPodiumStreak++;
          }
        } else {
          if (currentPodiumStreak > longestPodiumStreak) {
            longestPodiumStreak = currentPodiumStreak;
          }
          currentPodiumStreak = 0;
        }
        
        if (position <= 5) {
          stats.top5Finishes++;
        }
        
        // Track best and worst positions
        if (stats.bestPosition === null || position < stats.bestPosition) {
          stats.bestPosition = position;
        }
        if (stats.worstPosition === null || position > stats.worstPosition) {
          stats.worstPosition = position;
        }
        
        // Yearly statistics
        const year = competition.year;
        if (!stats.yearlyStats[year]) {
          stats.yearlyStats[year] = {
            competitions: 0,
            wins: 0,
            podiumFinishes: 0,
            totalPosition: 0,
            averagePosition: 0
          };
        }
        
        stats.yearlyStats[year].competitions++;
        stats.yearlyStats[year].totalPosition += position;
        if (position === 1) stats.yearlyStats[year].wins++;
        if (position <= 3) stats.yearlyStats[year].podiumFinishes++;
        
        // Competition type statistics
        const compType = competition.name || 'Unknown';
        if (!stats.competitionTypeStats[compType]) {
          stats.competitionTypeStats[compType] = {
            competitions: 0,
            wins: 0,
            averagePosition: 0,
            totalPosition: 0
          };
        }
        
        stats.competitionTypeStats[compType].competitions++;
        stats.competitionTypeStats[compType].totalPosition += position;
        if (position === 1) stats.competitionTypeStats[compType].wins++;
      }
    });
    
    // Calculate averages and rates
    if (positions.length > 0) {
      stats.averagePosition = totalPosition / positions.length;
      stats.winRate = (stats.wins / positions.length) * 100;
      stats.podiumRate = (stats.podiumFinishes / positions.length) * 100;
      
      // Calculate consistency (lower standard deviation = more consistent)
      const variance = positions.reduce((sum, pos) => {
        return sum + Math.pow(pos - stats.averagePosition, 2);
      }, 0) / positions.length;
      stats.consistency = Math.sqrt(variance);
    }
    
    // Participation rate
    stats.participationRate = competitions.length > 0 
      ? (participantCompetitions.length / competitions.length) * 100 
      : 0;
    
    // Calculate yearly averages
    Object.values(stats.yearlyStats).forEach(yearStats => {
      if (yearStats.competitions > 0) {
        yearStats.averagePosition = yearStats.totalPosition / yearStats.competitions;
      }
    });
    
    // Calculate competition type averages
    Object.values(stats.competitionTypeStats).forEach(typeStats => {
      if (typeStats.competitions > 0) {
        typeStats.averagePosition = typeStats.totalPosition / typeStats.competitions;
      }
    });
    
    // Calculate improvement trend (comparing first half vs second half of competitions)
    if (positions.length >= 4) {
      const midPoint = Math.floor(positions.length / 2);
      const firstHalf = positions.slice(0, midPoint);
      const secondHalf = positions.slice(midPoint);
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      // Positive improvement means better positions (lower numbers)
      stats.improvement = firstHalfAvg - secondHalfAvg;
    }
    
    // Recent form (last 5 competitions)
    stats.recentForm = sortedCompetitions.slice(0, 5).map(comp => ({
      year: comp.year,
      competition: comp.name,
      position: comp.scores[participant.id],
      isWin: comp.scores[participant.id] === 1,
      isPodium: comp.scores[participant.id] <= 3
    }));
    
    // Finalize streaks
    if (currentWinStreak > longestWinStreak) {
      longestWinStreak = currentWinStreak;
    }
    if (currentPodiumStreak > longestPodiumStreak) {
      longestPodiumStreak = currentPodiumStreak;
    }
    
    stats.streaks = {
      currentWinStreak,
      longestWinStreak,
      currentPodiumStreak,
      longestPodiumStreak
    };
    
    stats.positions = positions;
    
    return stats;
  }
  
  /**
   * Get competition trends and analysis
   */
  async getCompetitionTrends(timeframe = 'all') {
    const cacheKey = `competition-trends-${timeframe}`;
    
    if (this.isValidCache(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }
    
    const competitions = await this.getFilteredCompetitions(timeframe);
    const participants = await window.dataManager.getParticipants();
    
    const trends = {
      participationByYear: {},
      averageParticipationByYear: {},
      competitionTypePopularity: {},
      locationPopularity: {},
      monthlyDistribution: {},
      competitiveBalance: 0,
      diversityIndex: 0,
      winnerDistribution: {},
      dominanceScore: {},
      yearlyWinners: {}
    };
    
    // Analyze each competition
    competitions.forEach(competition => {
      const year = competition.year;
      const participantCount = Object.keys(competition.scores || {}).length;
      
      // Participation by year
      if (!trends.participationByYear[year]) {
        trends.participationByYear[year] = [];
      }
      trends.participationByYear[year].push(participantCount);
      
      // Competition type popularity
      const type = competition.name || 'Unknown';
      trends.competitionTypePopularity[type] = (trends.competitionTypePopularity[type] || 0) + 1;
      
      // Location popularity
      const location = competition.location || 'Unknown';
      trends.locationPopularity[location] = (trends.locationPopularity[location] || 0) + 1;
      
      // Monthly distribution (if date is available)
      if (competition.date) {
        const month = new Date(competition.date).getMonth();
        const monthName = new Date(2024, month, 1).toLocaleDateString('sv-SE', { month: 'long' });
        trends.monthlyDistribution[monthName] = (trends.monthlyDistribution[monthName] || 0) + 1;
      }
      
      // Winner analysis
      if (competition.winner) {
        trends.winnerDistribution[competition.winner] = (trends.winnerDistribution[competition.winner] || 0) + 1;
        
        if (!trends.yearlyWinners[year]) {
          trends.yearlyWinners[year] = [];
        }
        trends.yearlyWinners[year].push(competition.winner);
      }
    });
    
    // Calculate average participation by year
    Object.keys(trends.participationByYear).forEach(year => {
      const participations = trends.participationByYear[year];
      trends.averageParticipationByYear[year] = 
        participations.reduce((a, b) => a + b, 0) / participations.length;
    });
    
    // Calculate competitive balance (how evenly distributed are the wins?)
    const winCounts = Object.values(trends.winnerDistribution);
    if (winCounts.length > 0) {
      const totalWins = winCounts.reduce((a, b) => a + b, 0);
      const expectedWinsPerPlayer = totalWins / participants.length;
      
      // Calculate Gini coefficient for win distribution
      trends.competitiveBalance = this.calculateGiniCoefficient(winCounts);
      
      // Calculate dominance scores for each winner
      Object.entries(trends.winnerDistribution).forEach(([winner, wins]) => {
        trends.dominanceScore[winner] = (wins / totalWins) * 100;
      });
    }
    
    // Calculate diversity index (how many different competition types?)
    const typeCount = Object.keys(trends.competitionTypePopularity).length;
    const totalCompetitions = competitions.length;
    trends.diversityIndex = totalCompetitions > 0 ? typeCount / totalCompetitions : 0;
    
    this.setCache(cacheKey, trends);
    return trends;
  }
  
  /**
   * Get head-to-head comparison between two participants
   */
  async getHeadToHeadComparison(participant1Id, participant2Id, timeframe = 'all') {
    const competitions = await this.getFilteredCompetitions(timeframe);
    const participant1 = await window.dataManager.getParticipant(participant1Id);
    const participant2 = await window.dataManager.getParticipant(participant2Id);
    
    if (!participant1 || !participant2) {
      throw new Error('One or both participants not found');
    }
    
    const comparison = {
      participant1: {
        name: participant1.name,
        wins: 0,
        betterFinishes: 0,
        averagePosition: 0,
        bestPosition: null,
        totalCompetitions: 0
      },
      participant2: {
        name: participant2.name,
        wins: 0,
        betterFinishes: 0,
        averagePosition: 0,
        bestPosition: null,
        totalCompetitions: 0
      },
      headToHeadResults: [],
      summary: {
        totalMeetings: 0,
        ties: 0
      }
    };
    
    const bothParticipatedCompetitions = competitions.filter(comp => 
      comp.scores && 
      comp.scores[participant1Id] !== undefined && 
      comp.scores[participant2Id] !== undefined
    );
    
    comparison.summary.totalMeetings = bothParticipatedCompetitions.length;
    
    let p1TotalPosition = 0;
    let p2TotalPosition = 0;
    
    bothParticipatedCompetitions.forEach(competition => {
      const p1Position = competition.scores[participant1Id];
      const p2Position = competition.scores[participant2Id];
      
      p1TotalPosition += p1Position;
      p2TotalPosition += p2Position;
      
      comparison.participant1.totalCompetitions++;
      comparison.participant2.totalCompetitions++;
      
      // Track best positions
      if (comparison.participant1.bestPosition === null || p1Position < comparison.participant1.bestPosition) {
        comparison.participant1.bestPosition = p1Position;
      }
      if (comparison.participant2.bestPosition === null || p2Position < comparison.participant2.bestPosition) {
        comparison.participant2.bestPosition = p2Position;
      }
      
      // Head-to-head result
      let result = 'tie';
      if (p1Position < p2Position) {
        comparison.participant1.betterFinishes++;
        result = 'participant1';
      } else if (p2Position < p1Position) {
        comparison.participant2.betterFinishes++;
        result = 'participant2';
      } else {
        comparison.summary.ties++;
      }
      
      comparison.headToHeadResults.push({
        year: competition.year,
        competition: competition.name,
        participant1Position: p1Position,
        participant2Position: p2Position,
        winner: result
      });
    });
    
    // Calculate averages
    if (comparison.summary.totalMeetings > 0) {
      comparison.participant1.averagePosition = p1TotalPosition / comparison.summary.totalMeetings;
      comparison.participant2.averagePosition = p2TotalPosition / comparison.summary.totalMeetings;
    }
    
    return comparison;
  }
  
  /**
   * Get performance predictions based on historical data
   */
  async getPerformancePredictions(participantId, timeframe = 'recent') {
    const participant = await window.dataManager.getParticipant(participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }
    
    const competitions = await this.getFilteredCompetitions(timeframe);
    const participantCompetitions = competitions.filter(comp => 
      comp.scores && comp.scores[participantId] !== undefined
    );
    
    if (participantCompetitions.length < 3) {
      return {
        error: 'Insufficient data for prediction',
        minimumRequired: 3,
        available: participantCompetitions.length
      };
    }
    
    const positions = participantCompetitions
      .sort((a, b) => a.year - b.year)
      .map(comp => comp.scores[participantId]);
    
    const predictions = {
      trendDirection: 'stable',
      expectedNextPosition: 0,
      confidenceLevel: 0,
      improvementRate: 0,
      seasonalPatterns: {},
      competitionTypePreferences: {},
      recommendations: []
    };
    
    // Calculate trend using linear regression
    const { slope, intercept, rSquared } = this.calculateLinearRegression(
      positions.map((_, i) => i),
      positions
    );
    
    predictions.expectedNextPosition = Math.max(1, Math.round(slope * positions.length + intercept));
    predictions.confidenceLevel = rSquared * 100;
    predictions.improvementRate = -slope; // Negative slope means improvement (lower positions)
    
    if (slope < -0.1) {
      predictions.trendDirection = 'improving';
    } else if (slope > 0.1) {
      predictions.trendDirection = 'declining';
    }
    
    // Analyze seasonal patterns and competition preferences
    participantCompetitions.forEach(comp => {
      const position = comp.scores[participantId];
      const compType = comp.name || 'Unknown';
      
      if (!predictions.competitionTypePreferences[compType]) {
        predictions.competitionTypePreferences[compType] = {
          competitions: 0,
          totalPosition: 0,
          averagePosition: 0,
          bestPosition: null
        };
      }
      
      const typeStats = predictions.competitionTypePreferences[compType];
      typeStats.competitions++;
      typeStats.totalPosition += position;
      
      if (typeStats.bestPosition === null || position < typeStats.bestPosition) {
        typeStats.bestPosition = position;
      }
    });
    
    // Calculate averages for competition types
    Object.values(predictions.competitionTypePreferences).forEach(typeStats => {
      if (typeStats.competitions > 0) {
        typeStats.averagePosition = typeStats.totalPosition / typeStats.competitions;
      }
    });
    
    // Generate recommendations
    if (predictions.trendDirection === 'improving') {
      predictions.recommendations.push('Fortsätt med nuvarande strategi - du förbättras!');
    } else if (predictions.trendDirection === 'declining') {
      predictions.recommendations.push('Överväg att ändra träningsmetoder eller strategi');
    }
    
    // Find best competition types
    const bestTypes = Object.entries(predictions.competitionTypePreferences)
      .sort((a, b) => a[1].averagePosition - b[1].averagePosition)
      .slice(0, 2);
    
    if (bestTypes.length > 0) {
      predictions.recommendations.push(`Du presterar bäst i: ${bestTypes.map(([type]) => type).join(', ')}`);
    }
    
    return predictions;
  }
  
  /**
   * Calculate Gini coefficient for measuring inequality
   */
  calculateGiniCoefficient(values) {
    if (values.length === 0) return 0;
    
    const sortedValues = [...values].sort((a, b) => a - b);
    const n = sortedValues.length;
    const sum = sortedValues.reduce((a, b) => a + b, 0);
    
    if (sum === 0) return 0;
    
    let gini = 0;
    for (let i = 0; i < n; i++) {
      gini += (2 * (i + 1) - n - 1) * sortedValues[i];
    }
    
    return gini / (n * sum);
  }
  
  /**
   * Calculate linear regression
   */
  calculateLinearRegression(xValues, yValues) {
    const n = xValues.length;
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    const sumYY = yValues.reduce((sum, y) => sum + y * y, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const ssRes = yValues.reduce((sum, y, i) => {
      const predicted = slope * xValues[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    
    const rSquared = ssTotal > 0 ? 1 - (ssRes / ssTotal) : 0;
    
    return { slope, intercept, rSquared };
  }
  
  /**
   * Get filtered competitions based on timeframe
   */
  async getFilteredCompetitions(timeframe) {
    const allCompetitions = await window.dataManager.getCompetitions();
    const currentYear = new Date().getFullYear();
    
    switch (timeframe) {
      case 'recent':
        return allCompetitions.filter(comp => comp.year >= currentYear - 5);
      case 'decade':
        return allCompetitions.filter(comp => comp.year >= currentYear - 10);
      case 'all':
      default:
        return allCompetitions;
    }
  }
  
  /**
   * Cache management
   */
  isValidCache(key) {
    if (!this.cache.has(key)) return false;
    
    const cached = this.cache.get(key);
    return Date.now() - cached.timestamp < this.cacheTimeout;
  }
  
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  clearCache() {
    this.cache.clear();
  }
  
  /**
   * Export statistics to various formats
   */
  async exportStatistics(format = 'json', timeframe = 'all') {
    const participantStats = await this.getParticipantStatistics(timeframe);
    const competitionTrends = await this.getCompetitionTrends(timeframe);
    
    const exportData = {
      exportDate: new Date().toISOString(),
      timeframe,
      participantStatistics: participantStats,
      competitionTrends,
      summary: {
        totalParticipants: participantStats.length,
        activeParticipants: participantStats.filter(p => p.status === 'active').length,
        totalCompetitions: competitionTrends.participationByYear 
          ? Object.values(competitionTrends.participationByYear).flat().length 
          : 0
      }
    };
    
    switch (format) {
      case 'csv':
        return this.convertToCSV(participantStats);
      case 'json':
      default:
        return JSON.stringify(exportData, null, 2);
    }
  }
  
  /**
   * Convert participant statistics to CSV format
   */
  convertToCSV(participantStats) {
    const headers = [
      'Namn', 'Status', 'Totala Tävlingar', 'Vinster', 'Pallplatser', 
      'Genomsnittlig Placering', 'Bästa Placering', 'Sämsta Placering',
      'Vinstprocent', 'Pallplatsprocent', 'Deltagandeprocent'
    ];
    
    const rows = participantStats.map(stats => [
      stats.name,
      stats.status,
      stats.totalCompetitions,
      stats.wins,
      stats.podiumFinishes,
      stats.averagePosition.toFixed(2),
      stats.bestPosition || 'N/A',
      stats.worstPosition || 'N/A',
      stats.winRate.toFixed(1) + '%',
      stats.podiumRate.toFixed(1) + '%',
      stats.participationRate.toFixed(1) + '%'
    ]);
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

// Initialize global statistics calculator
window.StatisticsCalculator = StatisticsCalculator;