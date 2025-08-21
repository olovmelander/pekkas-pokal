/**
 * Achievement Engine - Calculates participant achievements
 */

class AchievementEngine {
  constructor() {
    this.achievements = window.ACHIEVEMENT_DEFINITIONS || [];
    this.cache = new Map();
    this.calculationStats = {
      totalCalculations: 0,
      cacheHits: 0,
      calculationTime: 0
    };
  }

  /**
   * Calculate all achievements for all participants
   */
  calculateAllAchievements(competitions, participants) {
    const startTime = performance.now();
    console.log('🏆 Calculating achievements...');
    
    const participantAchievements = {};
    
    // Initialize achievements for all participants
    participants.forEach(participant => {
      participantAchievements[participant.name] = [];
    });
    
    // Calculate achievements for each participant
    participants.forEach(participant => {
      const achievements = this.calculateParticipantAchievements(
        participant, 
        competitions, 
        participants
      );
      participantAchievements[participant.name] = achievements;
      this.calculationStats.totalCalculations++;
    });
    
    // Calculate comparative achievements (achievements that depend on comparison with others)
    this.calculateComparativeAchievements(participantAchievements, competitions, participants);
    
    const endTime = performance.now();
    this.calculationStats.calculationTime = endTime - startTime;
    
    console.log(`✅ Achievement calculation complete in ${this.calculationStats.calculationTime.toFixed(2)}ms`);
    console.log(`📊 Calculated achievements for ${participants.length} participants`);
    
    return participantAchievements;
  }

  /**
   * Calculate achievements for a single participant
   */
  calculateParticipantAchievements(participant, competitions, participants) {
    const cacheKey = `${participant.id}-${competitions.length}`;
    
    if (this.cache.has(cacheKey)) {
      this.calculationStats.cacheHits++;
      return this.cache.get(cacheKey);
    }
    
    const achievements = [];
    const stats = this.calculateParticipantStats(participant, competitions, participants);
    
    // Medal Achievements
    achievements.push(...this.checkMedalAchievements(stats));
    
    // Streak Achievements
    achievements.push(...this.checkStreakAchievements(stats, competitions, participant));
    
    // Special Achievements
    achievements.push(...this.checkSpecialAchievements(stats, competitions, participant));
    
    // Fun Achievements
    achievements.push(...this.checkFunAchievements(stats, competitions, participant));
    
    // Cache the result
    this.cache.set(cacheKey, achievements);
    
    return achievements;
  }

  /**
   * Calculate comprehensive stats for a participant
   */
  calculateParticipantStats(participant, competitions, participants) {
    const stats = {
      participations: 0,
      gold: 0,
      silver: 0,
      bronze: 0,
      totalMedals: 0,
      positions: [],
      yearPositions: {},
      yearsParticipated: [],
      winYears: [],
      podiumYears: [],
      competitions: [],
      arrangementCount: 0
    };
    
    const sortedComps = [...competitions].sort((a, b) => a.year - b.year);
    
    sortedComps.forEach(comp => {
      const position = comp.scores[participant.id];
      
      if (position) {
        stats.participations++;
        stats.positions.push(position);
        stats.yearPositions[comp.year] = position;
        stats.yearsParticipated.push(comp.year);
        stats.competitions.push(comp);
        
        // Medal counting
        if (position === 1) {
          stats.gold++;
          stats.totalMedals++;
          stats.winYears.push(comp.year);
          stats.podiumYears.push(comp.year);
        } else if (position === 2) {
          stats.silver++;
          stats.totalMedals++;
          stats.podiumYears.push(comp.year);
        } else if (position === 3) {
          stats.bronze++;
          stats.totalMedals++;
          stats.podiumYears.push(comp.year);
        }
      }
      
      // Check if participant arranged this competition
      if (comp.arranger3rd === participant.name || comp.arrangerSecondLast === participant.name) {
        stats.arrangementCount++;
      }
    });
    
    // Calculate additional statistics
    stats.avgPosition = stats.positions.length > 0 ? 
      stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length : 0;
    
    stats.standardDeviation = this.calculateStandardDeviation(stats.positions);
    
    stats.bestPosition = stats.positions.length > 0 ? Math.min(...stats.positions) : null;
    stats.worstPosition = stats.positions.length > 0 ? Math.max(...stats.positions) : null;
    
    return stats;
  }

  /**
   * Check medal-based achievements
   */
  checkMedalAchievements(stats) {
    const achievements = [];
    
    // First win
    if (stats.gold >= 1) {
      achievements.push('first_win');
    }
    
    // Gold achievements
    if (stats.gold >= 5) {
      achievements.push('gold_king');
    } else if (stats.gold >= 3) {
      achievements.push('gold_collector');
    }
    
    // Silver achievements
    if (stats.silver >= 3) {
      achievements.push('silver_specialist');
    }
    
    // Bronze achievements
    if (stats.bronze >= 3) {
      achievements.push('bronze_collector');
    }
    
    // Medal collection achievements
    if (stats.totalMedals >= 10) {
      achievements.push('medal_magnet');
    }
    
    // Rainbow medals (at least one of each)
    if (stats.gold > 0 && stats.silver > 0 && stats.bronze > 0) {
      achievements.push('rainbow_medals');
    }
    
    // Bridesmaid (many silvers without gold)
    if (stats.silver >= 5 && stats.gold === 0) {
      achievements.push('bridesmaid');
    }
    
    return achievements;
  }

  /**
   * Check streak-based achievements
   */
  checkStreakAchievements(stats, competitions, participant) {
    const achievements = [];
    
    // Win streaks
    const winStreak = this.calculateMaxStreak(stats.winYears);
    if (winStreak >= 3) {
      achievements.push('win_streak_3');
    } else if (winStreak >= 2) {
      achievements.push('win_streak_2');
    }
    
    // Podium streaks
    const podiumStreak = this.calculateMaxStreak(stats.podiumYears);
    if (podiumStreak >= 5) {
      achievements.push('podium_streak_5');
    } else if (podiumStreak >= 3) {
      achievements.push('podium_streak_3');
    }
    
    // Perfect attendance
    const totalCompetitions = competitions.filter(c => c.name !== 'Covid').length;
    if (stats.participations === totalCompetitions) {
      achievements.push('never_missed');
      achievements.push('perfect_attendance');
    }
    
    // Comeback kid (win after long gap)
    if (this.checkComebackPattern(stats.winYears)) {
      achievements.push('comeback_kid');
    }
    
    // Losing streak
    if (this.checkLosingStreak(stats, competitions)) {
      achievements.push('losing_streak');
    }
    
    return achievements;
  }

  /**
   * Check special achievements
   */
  checkSpecialAchievements(stats, competitions, participant) {
    const achievements = [];
    
    // Veteran
    if (stats.participations >= 10) {
      achievements.push('veteran');
    }
    
    // Founding father
    if (stats.yearsParticipated.includes(2011)) {
      achievements.push('founding_father');
    }
    
    // Rookie winner
    if (stats.gold > 0 && stats.yearsParticipated.length <= 3) {
      achievements.push('rookie_winner');
    }
    
    // Participation trophy
    if (stats.participations >= 10 && stats.totalMedals === 0) {
      achievements.push('participation_trophy');
    }
    
    // Arranger achievements
    if (stats.arrangementCount >= 1) {
      achievements.push('arranger_bronze');
    }
    
    // Untouchable (never worse than 3rd with 5+ participations)
    if (stats.participations >= 5 && stats.positions.every(p => p <= 3)) {
      achievements.push('untouchable');
    }
    
    // Perfect podium (8+ years always on podium)
    if (stats.participations >= 8 && stats.positions.every(p => p <= 3)) {
      achievements.push('perfect_podium');
    }
    
    return achievements;
  }

  /**
   * Check fun/humorous achievements
   */
  checkFunAchievements(stats, competitions, participant) {
    const achievements = [];
    
    // Position-based fun achievements
    const positionCounts = this.countPositions(stats.positions);
    
    // Fourth place curse
    if (positionCounts[4] >= 3) {
      achievements.push('fourth_place');
    }
    
    // Lucky seven
    if (positionCounts[7] >= 3) {
      achievements.push('lucky_seven');
    }
    
    // Mr Average (consistently middle positions)
    if (this.checkMiddlePositionPattern(stats, competitions)) {
      achievements.push('mr_average');
    }
    
    // Gatekeeper (always 4th or 5th)
    if (this.checkGatekeeperPattern(stats.positions)) {
      achievements.push('gatekeeper');
    }
    
    // Pattern-based achievements
    if (this.checkGraceToGrassPattern(stats.positions, competitions, participant)) {
      achievements.push('grace_to_grass');
    }
    
    if (this.checkGrassToGracePattern(stats.positions, competitions, participant)) {
      achievements.push('grass_to_grace');
      achievements.push('phoenix');
    }
    
    if (this.checkElevatorPattern(stats.positions)) {
      achievements.push('elevator');
    }
    
    if (this.checkYoYoPattern(stats.positions)) {
      achievements.push('yo_yo');
    }
    
    if (this.checkConsistentChaosPattern(stats.positions)) {
      achievements.push('consistent_chaos');
    }
    
    if (this.checkOddEvenPattern(stats.yearPositions)) {
      achievements.push('odd_even');
    }
    
    // Sandwich achievement
    if (this.checkSandwichPattern(stats, competitions, participant)) {
      achievements.push('sandwich');
    }
    
    return achievements;
  }

  /**
   * Calculate comparative achievements (requires comparison between all participants)
   */
  calculateComparativeAchievements(participantAchievements, competitions, participants) {
    // Medal hoarder (most total medals)
    const medalCounts = this.calculateTotalMedalsForAll(participants, competitions);
    const medalLeader = this.findLeader(medalCounts);
    if (medalLeader) {
      participantAchievements[medalLeader].push('medal_hoarder');
    }
    
    // GOAT (most wins)
    const winCounts = this.calculateWinCountsForAll(participants, competitions);
    const winLeader = this.findLeader(winCounts);
    if (winLeader && winCounts[winLeader] >= 5) {
      participantAchievements[winLeader].push('goat');
    }
    
    // Mr. Consistent (lowest standard deviation)
    const consistencyStats = this.calculateConsistencyForAll(participants, competitions);
    const mostConsistent = this.findMostConsistent(consistencyStats);
    if (mostConsistent) {
      participantAchievements[mostConsistent].push('mr_consistent');
    }
    
    // Decade champion
    const decadeChampion = this.findDecadeChampion(participants, competitions);
    if (decadeChampion) {
      participantAchievements[decadeChampion].push('decade_champion');
    }
    
    // Host hero (most arrangements)
    const hostCounts = this.calculateHostCounts(participants, competitions);
    const hostLeader = this.findLeader(hostCounts);
    if (hostLeader) {
      participantAchievements[hostLeader].push('host_hero');
    }
    
    // The Closer (won last 3 competitions)
    const closer = this.findTheCloser(participants, competitions);
    if (closer) {
      participantAchievements[closer].push('the_closer');
    }
    
    // Family rivalry
    this.checkFamilyRivalries(participantAchievements, participants, competitions);
  }

  // ===== HELPER METHODS =====

  /**
   * Calculate maximum consecutive streak from array of years
   */
  calculateMaxStreak(years) {
    if (years.length === 0) return 0;
    
    const sortedYears = [...years].sort((a, b) => a - b);
    let maxStreak = 1;
    let currentStreak = 1;
    
    for (let i = 1; i < sortedYears.length; i++) {
      if (sortedYears[i] === sortedYears[i - 1] + 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    
    return maxStreak;
  }

  /**
   * Calculate standard deviation of positions
   */
  calculateStandardDeviation(positions) {
    if (positions.length === 0) return 0;
    
    const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
    const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) / positions.length;
    return Math.sqrt(variance);
  }

  /**
   * Count occurrences of each position
   */
  countPositions(positions) {
    const counts = {};
    positions.forEach(pos => {
      counts[pos] = (counts[pos] || 0) + 1;
    });
    return counts;
  }

  /**
   * Check comeback pattern (win after 3+ years without win)
   */
  checkComebackPattern(winYears) {
    if (winYears.length < 2) return false;
    
    const sortedWins = [...winYears].sort((a, b) => a - b);
    for (let i = 1; i < sortedWins.length; i++) {
      if (sortedWins[i] - sortedWins[i - 1] >= 3) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check losing streak pattern
   */
  checkLosingStreak(stats, competitions) {
    const lastThreeComps = competitions.slice(0, 3);
    let consecutiveOffPodium = 0;
    
    for (const comp of lastThreeComps) {
      const position = comp.scores[stats.participantId];
      if (position && position > 3) {
        consecutiveOffPodium++;
      } else {
        break;
      }
    }
    
    return consecutiveOffPodium >= 3;
  }

  /**
   * Check middle position pattern
   */
  checkMiddlePositionPattern(stats, competitions) {
    let middleCount = 0;
    
    stats.competitions.forEach(comp => {
      const totalParticipants = Object.keys(comp.scores).length;
      const middle = Math.ceil(totalParticipants / 2);
      const position = comp.scores[stats.participantId];
      
      if (Math.abs(position - middle) <= 1) {
        middleCount++;
      }
    });
    
    return middleCount >= 3 && middleCount >= stats.participations * 0.6;
  }

  /**
   * Check gatekeeper pattern (always 4th or 5th)
   */
  checkGatekeeperPattern(positions) {
    if (positions.length < 5) return false;
    
    const gatekeeperPositions = positions.filter(pos => pos === 4 || pos === 5);
    return gatekeeperPositions.length >= positions.length * 0.6;
  }

  /**
   * Check grace to grass pattern
   */
  checkGraceToGrassPattern(positions, competitions, participant) {
    for (let i = 1; i < positions.length; i++) {
      const prevComp = competitions[i - 1];
      const currentComp = competitions[i];
      
      if (positions[i - 1] === 1 && 
          positions[i] === Object.keys(currentComp.scores).length) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check grass to grace pattern
   */
  checkGrassToGracePattern(positions, competitions, participant) {
    for (let i = 1; i < positions.length; i++) {
      const prevComp = competitions[i - 1];
      const currentComp = competitions[i];
      
      if (positions[i - 1] === Object.keys(prevComp.scores).length && 
          positions[i] === 1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check elevator pattern (big position swings)
   */
  checkElevatorPattern(positions) {
    if (positions.length < 3) return false;
    
    let bigSwings = 0;
    for (let i = 1; i < positions.length; i++) {
      if (Math.abs(positions[i] - positions[i - 1]) >= 5) {
        bigSwings++;
      }
    }
    
    return bigSwings >= positions.length * 0.5;
  }

  /**
   * Check yo-yo pattern (alternating podium/non-podium)
   */
  checkYoYoPattern(positions) {
    if (positions.length < 4) return false;
    
    let alternatingCount = 0;
    for (let i = 1; i < positions.length; i++) {
      const prevOnPodium = positions[i - 1] <= 3;
      const currentOnPodium = positions[i] <= 3;
      
      if (prevOnPodium !== currentOnPodium) {
        alternatingCount++;
      }
    }
    
    return alternatingCount >= positions.length - 1;
  }

  /**
   * Check consistent chaos pattern (never same position twice)
   */
  checkConsistentChaosPattern(positions) {
    if (positions.length < 5) return false;
    
    const uniquePositions = new Set(positions);
    return uniquePositions.size === positions.length;
  }

  /**
   * Check odd-even pattern
   */
  checkOddEvenPattern(yearPositions) {
    const years = Object.keys(yearPositions).map(Number).sort();
    if (years.length < 4) return false;
    
    let matches = 0;
    years.forEach(year => {
      const position = yearPositions[year];
      const yearIsOdd = year % 2 === 1;
      const positionIsOdd = position % 2 === 1;
      
      if (yearIsOdd === positionIsOdd) {
        matches++;
      }
    });
    
    return matches >= years.length * 0.8;
  }

  /**
   * Check sandwich pattern
   */
  checkSandwichPattern(stats, competitions, participant) {
    // This is complex and would need detailed implementation
    // For now, return false
    return false;
  }

  /**
   * Find leader in a counts object
   */
  findLeader(counts) {
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  /**
   * Find most consistent player
   */
  findMostConsistent(consistencyStats) {
    const entries = Object.entries(consistencyStats);
    if (entries.length === 0) return null;
    
    const sorted = entries.sort((a, b) => a[1] - b[1]); // Lower is better
    return sorted[0][0];
  }

  /**
   * Calculate total medals for all participants
   */
  calculateTotalMedalsForAll(participants, competitions) {
    const medalCounts = {};
    
    participants.forEach(p => {
      medalCounts[p.name] = 0;
      competitions.forEach(comp => {
        const position = comp.scores[p.id];
        if (position && position <= 3) {
          medalCounts[p.name]++;
        }
      });
    });
    
    return medalCounts;
  }

  /**
   * Calculate win counts for all participants
   */
  calculateWinCountsForAll(participants, competitions) {
    const winCounts = {};
    
    participants.forEach(p => {
      winCounts[p.name] = 0;
      competitions.forEach(comp => {
        if (comp.scores[p.id] === 1) {
          winCounts[p.name]++;
        }
      });
    });
    
    return winCounts;
  }

  /**
   * Calculate consistency stats for all participants
   */
  calculateConsistencyForAll(participants, competitions) {
    const consistencyStats = {};
    
    participants.forEach(p => {
      const positions = [];
      competitions.forEach(comp => {
        if (comp.scores[p.id]) {
          positions.push(comp.scores[p.id]);
        }
      });
      
      if (positions.length >= 10) {
        consistencyStats[p.name] = this.calculateStandardDeviation(positions);
      }
    });
    
    return consistencyStats;
  }

  /**
   * Find decade champion
   */
  findDecadeChampion(participants, competitions) {
    const last10Years = competitions.filter(c => c.year >= 2016);
    const winCounts = {};
    
    participants.forEach(p => {
      winCounts[p.name] = 0;
      last10Years.forEach(comp => {
        if (comp.scores[p.id] === 1) {
          winCounts[p.name]++;
        }
      });
    });
    
    const leader = this.findLeader(winCounts);
    return winCounts[leader] >= 3 ? leader : null;
  }

  /**
   * Calculate host counts
   */
  calculateHostCounts(participants, competitions) {
    const hostCounts = {};
    
    participants.forEach(p => {
      hostCounts[p.name] = 0;
      competitions.forEach(comp => {
        if (comp.arranger3rd === p.name || comp.arrangerSecondLast === p.name) {
          hostCounts[p.name]++;
        }
      });
    });
    
    return hostCounts;
  }

  /**
   * Find "The Closer" (won last 3 competitions)
   */
  findTheCloser(participants, competitions) {
    const last3Comps = competitions.slice(0, 3);
    if (last3Comps.length !== 3) return null;
    
    for (const participant of participants) {
      let wonAll = true;
      for (const comp of last3Comps) {
        if (comp.scores[participant.id] !== 1) {
          wonAll = false;
          break;
        }
      }
      if (wonAll) {
        return participant.name;
      }
    }
    
    return null;
  }

  /**
   * Check family rivalries
   */
  checkFamilyRivalries(participantAchievements, participants, competitions) {
    // Find family members (same last name)
    const families = {};
    participants.forEach(p => {
      const lastName = p.name.split(' ').pop();
      if (!families[lastName]) families[lastName] = [];
      families[lastName].push(p);
    });
    
    // Check rivalries within families
    Object.values(families).forEach(family => {
      if (family.length > 1) {
        family.forEach(p1 => {
          let totalWins = 0;
          family.forEach(p2 => {
            if (p1.id !== p2.id) {
              competitions.forEach(comp => {
                if (comp.scores[p1.id] && comp.scores[p2.id]) {
                  if (comp.scores[p1.id] < comp.scores[p2.id]) {
                    totalWins++;
                  }
                }
              });
            }
          });
          
          if (totalWins >= 5) {
            participantAchievements[p1.name].push('family_rivalry');
          }
        });
      }
    });
  }

  /**
   * Clear achievement cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get calculation statistics
   */
  getStats() {
    return { ...this.calculationStats };
  }
}

// Export for global access
window.AchievementEngine = AchievementEngine;