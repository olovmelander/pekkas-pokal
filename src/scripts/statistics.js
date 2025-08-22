/**
 * Statistics - Handles all statistical calculations and analysis
 */

class Statistics {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Calculate medal counts for all participants
   */
  calculateMedalCounts(data) {
    const cacheKey = 'medal-counts';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const medals = {};
    
    // Initialize medal counts for all participants
    data.participants.forEach(p => {
      medals[p.name] = { gold: 0, silver: 0, bronze: 0, total: 0 };
    });
    
    // Count medals from competitions
    data.competitions.forEach(comp => {
      Object.entries(comp.scores).forEach(([pId, position]) => {
        const participant = data.participants.find(p => p.id === pId);
        if (participant && position <= 3) {
          const medalType = position === 1 ? 'gold' : position === 2 ? 'silver' : 'bronze';
          medals[participant.name][medalType]++;
          medals[participant.name].total++;
        }
      });
    });

    this.setCache(cacheKey, medals);
    return medals;
  }

  /**
   * Calculate win counts for all participants
   */
  calculateWinCounts(competitions) {
    const cacheKey = `win-counts-${competitions.length}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const winCounts = {};
    
    competitions.forEach(comp => {
      if (comp.winner) {
        winCounts[comp.winner] = (winCounts[comp.winner] || 0) + 1;
      }
    });

    this.setCache(cacheKey, winCounts);
    return winCounts;
  }

  /**
   * Calculate fun statistics
   */
  calculateFunStats(data) {
    const cacheKey = `fun-stats-${data.competitions.length}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const stats = [];
    
    // Most consistent participant
    const consistency = this.calculateConsistency(data);
    const mostConsistent = this.findExtreme(consistency, 'min');
    if (mostConsistent) {
      stats.push({
        emoji: '🎯',
        title: 'Mr. Consistent',
        desc: `${mostConsistent.name} - Mest stabil (σ=${mostConsistent.value.toFixed(1)})`
      });
    }

    // Biggest improvement
    const improvements = this.calculateImprovements(data);
    const biggestImprover = this.findExtreme(improvements, 'max');
    if (biggestImprover && biggestImprover.value > 0) {
      stats.push({
        emoji: '📈',
        title: 'Mest Förbättrad',
        desc: `${biggestImprover.name} - ${biggestImprover.value.toFixed(1)} platsers förbättring`
      });
    }

    // Most silver medals
    const medals = this.calculateMedalCounts(data);
    const silverCounts = Object.entries(medals)
      .map(([name, m]) => ({ name, value: m.silver }))
      .sort((a, b) => b.value - a.value)[0];
    
    if (silverCounts && silverCounts.value >= 2) {
      stats.push({
        emoji: '🥈',
        title: 'Eviga Tvåan',
        desc: `${silverCounts.name} - ${silverCounts.value} silvermedaljer`
      });
    }

    // Competition specialists
    const specialists = this.findSpecialists(data);
    if (specialists.length > 0) {
      stats.push({
        emoji: '🏅',
        title: specialists[0].title,
        desc: specialists[0].desc
      });
    }

    // Biggest rivalry
    const rivalry = this.findBiggestRivalry(data);
    if (rivalry) {
      stats.push({
        emoji: '⚔️',
        title: 'Största Rivaliteten',
        desc: rivalry
      });
    }

    // Age of competition
    const years = data.competitions.map(c => c.year).filter(y => y);
    if (years.length > 0) {
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      const totalYears = maxYear - minYear + 1;
      
      stats.push({
        emoji: '📅',
        title: 'Tävlingens Ålder',
        desc: `${totalYears} år sedan första tävlingen ${minYear}`
      });
    }

    // Most active participant
    const participationCounts = this.calculateParticipationCounts(data);
    const mostActive = this.findExtreme(participationCounts, 'max');
    if (mostActive) {
      stats.push({
        emoji: '🏃',
        title: 'Mest Aktiv',
        desc: `${mostActive.name} - ${mostActive.value} tävlingar`
      });
    }

    this.setCache(cacheKey, stats);
    return stats;
  }

  /**
   * Calculate consistency (standard deviation) for all participants
   */
  calculateConsistency(data) {
    const consistency = {};
    
    data.participants.forEach(p => {
      const positions = [];
      data.competitions.forEach(comp => {
        if (comp.scores[p.id]) {
          positions.push(comp.scores[p.id]);
        }
      });
      
      if (positions.length >= 3) {
        consistency[p.name] = this.calculateStandardDeviation(positions);
      }
    });
    
    return consistency;
  }

  /**
   * Calculate improvements (better average in second half vs first half)
   */
  calculateImprovements(data) {
    const improvements = {};
    
    data.participants.forEach(p => {
      const positions = [];
      const sortedComps = [...data.competitions].sort((a, b) => a.year - b.year);
      
      sortedComps.forEach(comp => {
        if (comp.scores[p.id]) {
          positions.push(comp.scores[p.id]);
        }
      });
      
      if (positions.length >= 4) {
        const midpoint = Math.floor(positions.length / 2);
        const firstHalf = positions.slice(0, midpoint);
        const secondHalf = positions.slice(midpoint);
        
        const firstAvg = this.calculateMean(firstHalf);
        const secondAvg = this.calculateMean(secondHalf);
        
        // Positive value means improvement (lower position numbers are better)
        improvements[p.name] = firstAvg - secondAvg;
      }
    });
    
    return improvements;
  }

  /**
   * Find competition specialists
   */
  findSpecialists(data) {
    const specialists = [];
    const competitionWins = {};
    
    // Group wins by competition type
    data.competitions.forEach(comp => {
      if (!competitionWins[comp.name]) {
        competitionWins[comp.name] = {};
      }
      
      Object.entries(comp.scores).forEach(([pId, position]) => {
        if (position === 1) {
          const participant = data.participants.find(p => p.id === pId);
          if (participant) {
            competitionWins[comp.name][participant.name] = 
              (competitionWins[comp.name][participant.name] || 0) + 1;
          }
        }
      });
    });
    
    // Find specialists (2+ wins in same competition type)
    Object.entries(competitionWins).forEach(([compName, winners]) => {
      const topWinner = Object.entries(winners)
        .sort((a, b) => b[1] - a[1])[0];
      
      if (topWinner && topWinner[1] >= 2) {
        specialists.push({
          title: `${compName}-specialist`,
          desc: `${topWinner[0]} - ${topWinner[1]} vinster i ${compName}`
        });
      }
    });
    
    return specialists;
  }

  /**
   * Find biggest rivalry
   */
  findBiggestRivalry(data) {
    let maxMeetings = 0;
    let rivalry = null;
    
    for (let i = 0; i < data.participants.length; i++) {
      for (let j = i + 1; j < data.participants.length; j++) {
        const p1 = data.participants[i];
        const p2 = data.participants[j];
        
        let meetings = 0;
        let p1Wins = 0;
        let p2Wins = 0;
        
        data.competitions.forEach(comp => {
          const p1Pos = comp.scores[p1.id];
          const p2Pos = comp.scores[p2.id];
          
          if (p1Pos && p2Pos) {
            meetings++;
            if (p1Pos < p2Pos) p1Wins++;
            else if (p2Pos < p1Pos) p2Wins++;
          }
        });
        
        // Consider it a rivalry if they've met many times and results are close
        if (meetings >= 5 && meetings > maxMeetings && Math.abs(p1Wins - p2Wins) <= 2) {
          maxMeetings = meetings;
          rivalry = `${p1.name} vs ${p2.name} (${p1Wins}-${p2Wins})`;
        }
      }
    }
    
    return rivalry;
  }

  /**
   * Calculate participation counts
   */
  calculateParticipationCounts(data) {
    const counts = {};
    
    data.participants.forEach(p => {
      counts[p.name] = 0;
      data.competitions.forEach(comp => {
        if (comp.scores[p.id]) {
          counts[p.name]++;
        }
      });
    });
    
    return counts;
  }

  calculateAverageRankings(data) {
    const averageRankings = {};

    data.participants.forEach(p => {
      const positions = [];
      data.competitions.forEach(comp => {
        if (comp.scores[p.id]) {
          positions.push(comp.scores[p.id]);
        }
      });

      if (positions.length > 0) {
        averageRankings[p.name] = this.calculateMean(positions);
      }
    });

    return averageRankings;
  }

  /**
   * Calculate head-to-head records between participants
   */
  calculateHeadToHead(data) {
    const records = {};
    
    data.participants.forEach(p1 => {
      records[p1.name] = {};
      data.participants.forEach(p2 => {
        if (p1.id !== p2.id) {
          records[p1.name][p2.name] = { wins: 0, losses: 0, ties: 0 };
        }
      });
    });
    
    data.competitions.forEach(comp => {
      const participantScores = Object.entries(comp.scores)
        .map(([pId, score]) => {
          const participant = data.participants.find(p => p.id === pId);
          return { participant, score };
        })
        .filter(item => item.participant);
      
      // Compare each pair
      for (let i = 0; i < participantScores.length; i++) {
        for (let j = i + 1; j < participantScores.length; j++) {
          const p1 = participantScores[i];
          const p2 = participantScores[j];
          
          if (p1.score < p2.score) {
            records[p1.participant.name][p2.participant.name].wins++;
            records[p2.participant.name][p1.participant.name].losses++;
          } else if (p2.score < p1.score) {
            records[p2.participant.name][p1.participant.name].wins++;
            records[p1.participant.name][p2.participant.name].losses++;
          } else {
            records[p1.participant.name][p2.participant.name].ties++;
            records[p2.participant.name][p1.participant.name].ties++;
          }
        }
      }
    });
    
    return records;
  }

  /**
   * Calculate performance trends over time
   */
  calculatePerformanceTrends(data) {
    const trends = {};
    
    data.participants.forEach(p => {
      const yearlyPerformance = [];
      const sortedComps = [...data.competitions].sort((a, b) => a.year - b.year);
      
      sortedComps.forEach(comp => {
        if (comp.scores[p.id]) {
          yearlyPerformance.push({
            year: comp.year,
            position: comp.scores[p.id],
            totalParticipants: Object.keys(comp.scores).length
          });
        }
      });
      
      if (yearlyPerformance.length >= 3) {
        // Calculate trend using linear regression
        const trend = this.calculateLinearTrend(yearlyPerformance);
        trends[p.name] = {
          slope: trend.slope,
          direction: trend.slope < 0 ? 'improving' : trend.slope > 0 ? 'declining' : 'stable',
          confidence: trend.rSquared,
          recentForm: yearlyPerformance.slice(-3).map(p => p.position)
        };
      }
    });
    
    return trends;
  }

  /**
   * Calculate competition difficulty over years
   */
  calculateCompetitionDifficulty(data) {
    const difficulty = {};
    
    data.competitions.forEach(comp => {
      const participantCount = Object.keys(comp.scores).length;
      const competitiveness = this.calculateCompetitiveness(comp.scores);
      
      difficulty[comp.year] = {
        participants: participantCount,
        competitiveness: competitiveness,
        competition: comp.name
      };
    });
    
    return difficulty;
  }

  /**
   * Calculate competitiveness based on score distribution
   */
  calculateCompetitiveness(scores) {
    const positions = Object.values(scores);
    if (positions.length < 3) return 0;
    
    // Lower standard deviation means more competitive (closer results)
    const stdDev = this.calculateStandardDeviation(positions);
    const maxPossibleStdDev = Math.sqrt((positions.length - 1) * positions.length / 12);
    
    // Return competitiveness as percentage (100% = perfectly even, 0% = very spread out)
    return Math.max(0, (1 - stdDev / maxPossibleStdDev) * 100);
  }

  /**
   * Calculate achievement completion rates
   */
  calculateAchievementStats(participantAchievements) {
    const stats = {
      totalPossible: window.ACHIEVEMENT_DEFINITIONS.length,
      unlockedCount: 0,
      participantStats: {},
      categoryStats: {},
      rarityStats: {}
    };
    
    // Track unlocked achievements
    const unlockedAchievements = new Set();
    
    Object.entries(participantAchievements).forEach(([name, achievements]) => {
      stats.participantStats[name] = {
        count: achievements.length,
        percentage: (achievements.length / stats.totalPossible) * 100,
        points: this.calculateAchievementPoints(achievements)
      };
      
      achievements.forEach(achId => unlockedAchievements.add(achId));
    });
    
    stats.unlockedCount = unlockedAchievements.size;
    stats.completionRate = (stats.unlockedCount / stats.totalPossible) * 100;
    
    // Category statistics
    Object.keys(window.ACHIEVEMENT_CATEGORIES).forEach(category => {
      if (category === 'all') return;
      
      const categoryAchievements = window.ACHIEVEMENT_DEFINITIONS.filter(a => a.category === category);
      const unlockedInCategory = categoryAchievements.filter(a => unlockedAchievements.has(a.id));
      
      stats.categoryStats[category] = {
        total: categoryAchievements.length,
        unlocked: unlockedInCategory.length,
        percentage: (unlockedInCategory.length / categoryAchievements.length) * 100
      };
    });
    
    // Rarity statistics
    Object.keys(window.ACHIEVEMENT_RARITIES).forEach(rarity => {
      const rarityAchievements = window.ACHIEVEMENT_DEFINITIONS.filter(a => a.rarity === rarity);
      const unlockedByRarity = rarityAchievements.filter(a => unlockedAchievements.has(a.id));
      
      stats.rarityStats[rarity] = {
        total: rarityAchievements.length,
        unlocked: unlockedByRarity.length,
        percentage: rarityAchievements.length > 0 ? (unlockedByRarity.length / rarityAchievements.length) * 100 : 0
      };
    });
    
    return stats;
  }

  /**
   * Calculate achievement points for a list of achievements
   */
  calculateAchievementPoints(achievementIds) {
    return achievementIds.reduce((total, achId) => {
      const achievement = window.AchievementHelpers.getById(achId);
      if (achievement) {
        const rarity = window.ACHIEVEMENT_RARITIES[achievement.rarity];
        const multiplier = rarity ? rarity.pointMultiplier : 1;
        return total + (achievement.points * multiplier);
      }
      return total;
    }, 0);
  }

  // ===== MATHEMATICAL HELPER FUNCTIONS =====

  /**
   * Calculate mean (average) of an array
   */
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate median
   */
  calculateMedian(values) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Calculate linear trend using least squares regression
   */
  calculateLinearTrend(data) {
    if (data.length < 2) return { slope: 0, intercept: 0, rSquared: 0 };
    
    const n = data.length;
    const xValues = data.map((_, i) => i); // Use indices as x values
    const yValues = data.map(d => d.position);
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    const sumYY = yValues.reduce((sum, y) => sum + y * y, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const totalSumSquares = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const residualSumSquares = yValues.reduce((sum, y, i) => {
      const predicted = slope * xValues[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    
    const rSquared = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
    
    return { slope, intercept, rSquared };
  }

  /**
   * Find extreme value (min or max) in an object
   */
  findExtreme(obj, type = 'max') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return null;
    
    const sortedEntries = entries.sort((a, b) => 
      type === 'max' ? b[1] - a[1] : a[1] - b[1]
    );
    
    return {
      name: sortedEntries[0][0],
      value: sortedEntries[0][1]
    };
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    
    if (Number.isInteger(index)) {
      return sorted[index];
    } else {
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }
  }

  /**
   * Calculate correlation coefficient between two arrays
   */
  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const meanX = this.calculateMean(x);
    const meanY = this.calculateMean(y);
    
    const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
    const denomX = Math.sqrt(x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0));
    const denomY = Math.sqrt(y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0));
    
    if (denomX === 0 || denomY === 0) return 0;
    
    return numerator / (denomX * denomY);
  }

  // ===== CACHE MANAGEMENT =====

  /**
   * Get value from cache
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.value;
    }
    return null;
  }

  /**
   * Set value in cache
   */
  setCache(key, value) {
    this.cache.set(key, {
      value: value,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export for global access
window.Statistics = Statistics;