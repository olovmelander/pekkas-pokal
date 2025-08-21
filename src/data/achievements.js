/**
 * Achievement Definitions for Pekkas Pokal
 * All possible achievements that can be unlocked
 */

const ACHIEVEMENT_DEFINITIONS = [
  // ===== MEDAL ACHIEVEMENTS =====
  {
    id: 'first_win',
    icon: '🥇',
    name: 'Första Segern',
    desc: 'Vinn din första årliga Pekkas Pokal',
    category: 'medals',
    rarity: 'common',
    points: 10
  },
  {
    id: 'gold_collector',
    icon: '🏆',
    name: 'Guldsamlare',
    desc: '3+ guldmedaljer i Pekkas Pokal',
    category: 'medals',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'gold_king',
    icon: '👑',
    name: 'Guldkungen',
    desc: '5+ guldmedaljer - Pokalens regent',
    category: 'medals',
    rarity: 'legendary',
    points: 100
  },
  {
    id: 'medal_hoarder',
    icon: '🏅',
    name: 'Medaljhamstraren',
    desc: 'Flest medaljer totalt av alla',
    category: 'medals',
    rarity: 'mythic',
    points: 150
  },
  {
    id: 'medal_magnet',
    icon: '🧲',
    name: 'Medaljmagnet',
    desc: '10+ medaljer totalt',
    category: 'medals',
    rarity: 'epic',
    points: 50
  },
  {
    id: 'rainbow_medals',
    icon: '🌈',
    name: 'Regnbågssamlare',
    desc: 'Minst en guld, silver och brons',
    category: 'medals',
    rarity: 'rare',
    points: 25
  },
  {
    id: 'silver_specialist',
    icon: '🥈',
    name: 'Eviga Tvåan',
    desc: '3+ silvermedaljer - alltid nära',
    category: 'medals',
    rarity: 'rare',
    points: 20
  },
  {
    id: 'bronze_collector',
    icon: '🥉',
    name: 'Bronsbaronen',
    desc: '3+ bronsmedaljer',
    category: 'medals',
    rarity: 'common',
    points: 15
  },
  {
    id: 'full_house',
    icon: '🃏',
    name: 'Full House',
    desc: 'Har tagit guld, silver och brons vid olika år',
    category: 'medals',
    rarity: 'rare',
    points: 25
  },
  {
    id: 'triple_crown_medals',
    icon: '🎗️',
    name: 'Triple Crown',
    desc: 'Tre förstaplatser totalt',
    category: 'medals',
    rarity: 'epic',
    points: 60
  },
  {
    id: 'podium_regular',
    icon: '🥉',
    name: 'Pallräven',
    desc: 'Topp 3 totalt fem olika år',
    category: 'medals',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'rising_star',
    icon: '🌠',
    name: 'Stigande Stjärna',
    desc: 'Tre år i rad bättre placering och avslutar med medalj',
    category: 'medals',
    rarity: 'epic',
    points: 55
  },
  {
    id: 'silver_streak',
    icon: '🥈',
    name: 'Silversvit',
    desc: 'Två år i rad som tvåa',
    category: 'medals',
    rarity: 'rare',
    points: 25
  },

  // ===== STREAK ACHIEVEMENTS =====
  {
    id: 'win_streak_3',
    icon: '🔥',
    name: 'Hattrick',
    desc: '3 år i rad som vinnare',
    category: 'streaks',
    rarity: 'legendary',
    points: 200
  },
  {
    id: 'win_streak_2',
    icon: '⚡',
    name: 'Dubbelmästare',
    desc: '2 år i rad som vinnare',
    category: 'streaks',
    rarity: 'epic',
    points: 75
  },
  {
    id: 'podium_streak_5',
    icon: '⭐',
    name: 'Pallplatsmästaren',
    desc: '5 år i rad på pallen',
    category: 'streaks',
    rarity: 'epic',
    points: 80
  },
  {
    id: 'podium_streak_3',
    icon: '🌟',
    name: 'Pall-Konsistens',
    desc: '3 år i rad på pallen',
    category: 'streaks',
    rarity: 'rare',
    points: 40
  },
  {
    id: 'never_missed',
    icon: '🏃',
    name: 'Järnmannen',
    desc: 'Aldrig missat en årlig tävling',
    category: 'streaks',
    rarity: 'legendary',
    points: 120
  },
  {
    id: 'comeback_kid',
    icon: '💪',
    name: 'Comeback Kid',
    desc: 'Vinn efter 3+ år utan vinst',
    category: 'streaks',
    rarity: 'epic',
    points: 60
  },
  {
    id: 'losing_streak',
    icon: '📉',
    name: 'Formsvackan',
    desc: '3+ år i rad utanför pallen',
    category: 'streaks',
    rarity: 'common',
    points: 5
  },
  {
    id: 'consistent_competitor',
    icon: '📅',
    name: 'Konsistent Konkurrent',
    desc: 'Topp 10 fem år i rad',
    category: 'streaks',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'comeback_top3',
    icon: '🔄',
    name: 'Comeback Kid',
    desc: 'Utanför topp 10 ett år, tillbaka på pallen nästa',
    category: 'streaks',
    rarity: 'epic',
    points: 60
  },
  {
    id: 'slow_burner',
    icon: '🐢',
    name: 'Slow Burner',
    desc: 'Förbättrat placeringen fyra år i rad',
    category: 'streaks',
    rarity: 'epic',
    points: 65
  },
  {
    id: 'iron_competitor',
    icon: '🪨',
    name: 'Järnkompassen',
    desc: 'Deltagit tio år i rad utan avbrott',
    category: 'streaks',
    rarity: 'legendary',
    points: 120
  },

  // ===== SPECIAL ACHIEVEMENTS =====
  {
    id: 'perfect_attendance',
    icon: '💯',
    name: 'Aldrig Frånvarande',
    desc: 'Deltagit varje år sedan start',
    category: 'special',
    rarity: 'mythic',
    points: 300
  },
  {
    id: 'decade_champion',
    icon: '🎯',
    name: 'Decenniets Mästare',
    desc: 'Flest vinster senaste 10 åren',
    category: 'special',
    rarity: 'legendary',
    points: 180
  },
  {
    id: 'host_hero',
    icon: '🏠',
    name: 'Värdmästaren',
    desc: 'Arrangerat flest tävlingar',
    category: 'special',
    rarity: 'epic',
    points: 90
  },
  {
    id: 'arranger_bronze',
    icon: '🥉',
    name: 'Tredjeplatsarrangören',
    desc: 'Arrangerar när man kom trea',
    category: 'special',
    rarity: 'rare',
    points: 35
  },
  {
    id: 'arranger_revenge',
    icon: '😈',
    name: 'Hämndarrangören',
    desc: 'Vann året efter att ha arrangerat',
    category: 'special',
    rarity: 'epic',
    points: 70
  },
  {
    id: 'veteran',
    icon: '🎖️',
    name: 'Veteranen',
    desc: 'Deltagit i 10+ årliga tävlingar',
    category: 'special',
    rarity: 'rare',
    points: 45
  },
  {
    id: 'rookie_winner',
    icon: '🌟',
    name: 'Rookiesensationen',
    desc: 'Vann inom sina första 3 år',
    category: 'special',
    rarity: 'epic',
    points: 85
  },
  {
    id: 'family_rivalry',
    icon: '👨‍👦',
    name: 'Familjeduellen',
    desc: 'Slagit sin familjemedlem 5+ gånger',
    category: 'special',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'rookie_sensation',
    icon: '🚀',
    name: 'Rookie Sensation',
    desc: 'Topp 5 på första försöket',
    category: 'special',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'late_bloomer',
    icon: '🌸',
    name: 'Senblomman',
    desc: 'Första medaljen efter minst fem år',
    category: 'special',
    rarity: 'epic',
    points: 50
  },
  {
    id: 'dark_horse',
    icon: '🐎',
    name: 'Dark Horse',
    desc: 'Från utanför topp 20 till topp 3 på ett år',
    category: 'special',
    rarity: 'legendary',
    points: 150
  },
  {
    id: 'tiebreaker',
    icon: '🤝',
    name: 'Delad Pott',
    desc: 'Delat placering med annan spelare',
    category: 'special',
    rarity: 'common',
    points: 10
  },
  {
    id: 'passing_torch',
    icon: '🕯️',
    name: 'Fackelöverlämning',
    desc: 'Familjemedlemmar topp 10 i följd',
    category: 'special',
    rarity: 'rare',
    points: 35
  },

  // ===== FUN & FUNNY ACHIEVEMENTS =====
  {
    id: 'grace_to_grass',
    icon: '📉',
    name: 'Från Topp till Botten',
    desc: 'Gick från 1:a till sist på ett år',
    category: 'fun',
    rarity: 'legendary',
    points: 50
  },
  {
    id: 'grass_to_grace',
    icon: '📈',
    name: 'Från Botten till Topp',
    desc: 'Gick från sist till 1:a på ett år',
    category: 'fun',
    rarity: 'mythic',
    points: 250
  },
  {
    id: 'elevator',
    icon: '🛗',
    name: 'Hissen',
    desc: 'Upp och ner minst 5 placeringar varje år',
    category: 'fun',
    rarity: 'epic',
    points: 40
  },
  {
    id: 'mr_average',
    icon: '😐',
    name: 'Herr Medel',
    desc: 'Alltid placerad mitt i fältet (±1)',
    category: 'fun',
    rarity: 'rare',
    points: 25
  },
  {
    id: 'fourth_place',
    icon: '4️⃣',
    name: 'Fyrans Förbannelse',
    desc: 'Kom 4:a minst 3 gånger - så nära!',
    category: 'fun',
    rarity: 'rare',
    points: 20
  },
  {
    id: 'lucky_seven',
    icon: '7️⃣',
    name: 'Lyckonummer 7',
    desc: 'Kom 7:a minst 3 gånger',
    category: 'fun',
    rarity: 'rare',
    points: 15
  },
  {
    id: 'bridesmaid',
    icon: '👰',
    name: 'Alltid Tärna, Aldrig Brud',
    desc: '5+ silvermedaljer utan guld',
    category: 'fun',
    rarity: 'epic',
    points: 35
  },
  {
    id: 'participation_trophy',
    icon: '🏆',
    name: 'Deltagarmedaljen',
    desc: '10+ år utan pallplats - äran att delta!',
    category: 'fun',
    rarity: 'common',
    points: 10
  },
  {
    id: 'sandwich',
    icon: '🥪',
    name: 'Sandwichen',
    desc: 'Klämd mellan samma två personer 3+ år',
    category: 'fun',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'yo_yo',
    icon: '🪀',
    name: 'Jojo-effekten',
    desc: 'Varannat år på pallen, varannat år utanför',
    category: 'fun',
    rarity: 'epic',
    points: 45
  },
  {
    id: 'consistent_chaos',
    icon: '🎲',
    name: 'Kaosagenten',
    desc: 'Aldrig samma placering två år i rad',
    category: 'fun',
    rarity: 'rare',
    points: 35
  },
  {
    id: 'nemesis',
    icon: '😤',
    name: 'Ärkefienden',
    desc: 'Placerat direkt efter samma person 4+ år',
    category: 'fun',
    rarity: 'epic',
    points: 40
  },
  {
    id: 'gatekeeper',
    icon: '🚪',
    name: 'Grindvakten',
    desc: 'Alltid precis utanför pallen (4-5:a)',
    category: 'fun',
    rarity: 'common',
    points: 15
  },
  {
    id: 'odd_even',
    icon: '🔢',
    name: 'Udda-Jämn',
    desc: 'Udda placering udda år, jämn placering jämna år',
    category: 'fun',
    rarity: 'legendary',
    points: 80
  },
  {
    id: 'same_spot',
    icon: '📍',
    name: 'Mr./Ms. Consistency',
    desc: 'Samma placering tre år i rad',
    category: 'fun',
    rarity: 'rare',
    points: 25
  },
  {
    id: 'edge_of_glory',
    icon: '🪙',
    name: 'Edge of Glory',
    desc: 'Två fjärdeplatser innan första medaljen',
    category: 'fun',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'runner_up_specialist',
    icon: '🥈',
    name: 'Andraplatsproffset',
    desc: 'Fyra silver utan guld',
    category: 'fun',
    rarity: 'epic',
    points: 60
  },
  {
    id: 'bounced_back',
    icon: '🔁',
    name: 'Bounced Back',
    desc: 'Från sista plats till mitten året efter',
    category: 'fun',
    rarity: 'rare',
    points: 30
  },
  {
    id: 'lucky_seven_anniversary',
    icon: '🎰',
    name: 'Lyckotalet Sju',
    desc: 'Sjua exakt sju år efter debut',
    category: 'fun',
    rarity: 'rare',
    points: 25
  },

  // ===== LEGENDARY ACHIEVEMENTS =====
  {
    id: 'goat',
    icon: '🐐',
    name: 'The GOAT',
    desc: 'Flest vinster genom tiderna',
    category: 'legendary',
    rarity: 'mythic',
    points: 500
  },
  {
    id: 'dynasty',
    icon: '👑',
    name: 'Dynastin',
    desc: 'Dominerat ett helt decennium',
    category: 'legendary',
    rarity: 'legendary',
    points: 400
  },
  {
    id: 'phoenix',
    icon: '🔥',
    name: 'Fenixfågeln',
    desc: 'Vann efter att ha kommit sist året innan',
    category: 'legendary',
    rarity: 'legendary',
    points: 200
  },
  {
    id: 'untouchable',
    icon: '🛡️',
    name: 'Den Oberörbare',
    desc: 'Aldrig placerat sämre än 3:a (5+ år)',
    category: 'legendary',
    rarity: 'mythic',
    points: 350
  },
  {
    id: 'triple_crown',
    icon: '👸',
    name: 'Trippelkronan',
    desc: 'Vunnit 3 olika decennier',
    category: 'legendary',
    rarity: 'mythic',
    points: 600
  },
  {
    id: 'rivalry_winner',
    icon: '⚔️',
    name: 'Rivalitetsvinnaren',
    desc: 'Vunnit flest head-to-heads totalt',
    category: 'legendary',
    rarity: 'legendary',
    points: 300
  },
  {
    id: 'decade_of_dominance',
    icon: '🏅',
    name: 'Decennium av Dominans',
    desc: 'Topp 3 tio år i rad',
    category: 'legendary',
    rarity: 'legendary',
    points: 300
  },
  {
    id: 'record_breaker',
    icon: '📈',
    name: 'Record Breaker',
    desc: 'Flest förstaplatser någonsin',
    category: 'legendary',
    rarity: 'mythic',
    points: 400
  },
  {
    id: 'pioneer',
    icon: '🚩',
    name: 'Pionjär',
    desc: 'Vann första tävlingen och tävlar än 10 år senare',
    category: 'legendary',
    rarity: 'legendary',
    points: 250
  },
  {
    id: 'legacy_builder',
    icon: '🏛️',
    name: 'Legacy Builder',
    desc: 'Pallen i tre olika decennier',
    category: 'legendary',
    rarity: 'legendary',
    points: 260
  },
  {
    id: 'two_time_champion',
    icon: '2️⃣',
    name: 'Tvåfaldig Mästare',
    desc: 'Vinner igen efter minst fem års uppehåll',
    category: 'legendary',
    rarity: 'legendary',
    points: 180
  },

  // ===== MYTHIC ACHIEVEMENTS =====
  {
    id: 'founding_father',
    icon: '🎩',
    name: 'Grundaren',
    desc: 'Med sedan första året 2011',
    category: 'mythic',
    rarity: 'mythic',
    points: 1000
  },
  {
    id: 'mr_consistent',
    icon: '📊',
    name: 'Mr. Consistent',
    desc: 'Lägst standardavvikelse i placeringar (10+ år)',
    category: 'mythic',
    rarity: 'mythic',
    points: 400
  },
  {
    id: 'grand_master',
    icon: '🏆',
    name: 'Stormästaren',
    desc: 'Vunnit minst 7 olika årliga tävlingar',
    category: 'mythic',
    rarity: 'mythic',
    points: 750
  },
  {
    id: 'perfect_podium',
    icon: '✨',
    name: 'Perfekta Pallen',
    desc: 'Aldrig utanför pallen (minst 8 år)',
    category: 'mythic',
    rarity: 'mythic',
    points: 800
  },
  {
    id: 'the_closer',
    icon: '🎯',
    name: 'Avslutaren',
    desc: 'Vunnit senaste 3 tävlingarna',
    category: 'mythic',
    rarity: 'mythic',
    points: 500
  },
  {
    id: 'immortal_champion',
    icon: '🗿',
    name: 'Odödlig Mästare',
    desc: 'Vinner varje gång man deltar (minst 3 ggr)',
    category: 'mythic',
    rarity: 'mythic',
    points: 700
  },
  {
    id: 'first_place_five',
    icon: '🔥',
    name: 'Untouchable',
    desc: 'Förstaplats fem år i rad',
    category: 'mythic',
    rarity: 'mythic',
    points: 900
  },
  {
    id: 'timeless_wonder',
    icon: '⏳',
    name: 'Tidlöst Under',
    desc: 'Topp 10 i femton olika år',
    category: 'mythic',
    rarity: 'mythic',
    points: 600
  },
  {
    id: 'mythic_comeback',
    icon: '🔁',
    name: 'Mytisk Comeback',
    desc: 'Vinner igen efter tio år utan seger',
    category: 'mythic',
    rarity: 'mythic',
    points: 650
  },
  {
    id: 'era_definer',
    icon: '📜',
    name: 'Eradefinierare',
    desc: 'Fler titlar än någon annan genom historien',
    category: 'mythic',
    rarity: 'mythic',
    points: 800
  }
];

// Achievement categories with metadata
const ACHIEVEMENT_CATEGORIES = {
  all: {
    name: 'Alla',
    icon: '🏆',
    description: 'Alla tillgängliga achievements'
  },
  medals: {
    name: 'Medaljer',
    icon: '🥇',
    description: 'Achievements relaterade till medaljer och placeringar'
  },
  streaks: {
    name: 'Streaks',
    icon: '🔥',
    description: 'Achievements för serier och konsekutiva prestationer'
  },
  special: {
    name: 'Speciella',
    icon: '⭐',
    description: 'Unika achievements och milstolpar'
  },
  fun: {
    name: 'Roliga',
    icon: '🎉',
    description: 'Humoristiska och ovanliga achievements'
  },
  legendary: {
    name: 'Legendariska',
    icon: '👑',
    description: 'Mycket sällsynta och prestigefulla achievements'
  },
  mythic: {
    name: 'Mytiska',
    icon: '🌟',
    description: 'De mest exklusiva achievements av alla'
  }
};

// Rarity system with point multipliers and visual effects
const ACHIEVEMENT_RARITIES = {
  common: {
    name: 'Vanlig',
    color: '#808080',
    pointMultiplier: 1.0,
    glowEffect: false
  },
  rare: {
    name: 'Sällsynt',
    color: '#0080FF',
    pointMultiplier: 1.5,
    glowEffect: false
  },
  epic: {
    name: 'Episk',
    color: '#8B00FF',
    pointMultiplier: 2.0,
    glowEffect: true
  },
  legendary: {
    name: 'Legendarisk',
    color: '#FFD700',
    pointMultiplier: 3.0,
    glowEffect: true,
    animation: 'shimmer'
  },
  mythic: {
    name: 'Mytisk',
    color: '#FF00FF',
    pointMultiplier: 5.0,
    glowEffect: true,
    animation: 'rainbow'
  }
};

// Achievement validation rules
const ACHIEVEMENT_VALIDATION = {
  // Required fields for each achievement
  requiredFields: ['id', 'icon', 'name', 'desc', 'category', 'rarity'],
  
  // Valid categories
  validCategories: Object.keys(ACHIEVEMENT_CATEGORIES).filter(cat => cat !== 'all'),
  
  // Valid rarities
  validRarities: Object.keys(ACHIEVEMENT_RARITIES),
  
  // Point ranges by rarity
  pointRanges: {
    common: [5, 25],
    rare: [20, 50],
    epic: [40, 100],
    legendary: [80, 400],
    mythic: [300, 1000]
  }
};

// Helper functions for achievement system
const AchievementHelpers = {
  /**
   * Get achievement by ID
   */
  getById(id) {
    return ACHIEVEMENT_DEFINITIONS.find(ach => ach.id === id);
  },

  /**
   * Get achievements by category
   */
  getByCategory(category) {
    if (category === 'all') return ACHIEVEMENT_DEFINITIONS;
    return ACHIEVEMENT_DEFINITIONS.filter(ach => ach.category === category);
  },

  /**
   * Get achievements by rarity
   */
  getByRarity(rarity) {
    return ACHIEVEMENT_DEFINITIONS.filter(ach => ach.rarity === rarity);
  },

  /**
   * Calculate total possible points
   */
  getTotalPoints() {
    return ACHIEVEMENT_DEFINITIONS.reduce((total, ach) => {
      const multiplier = ACHIEVEMENT_RARITIES[ach.rarity].pointMultiplier;
      return total + (ach.points * multiplier);
    }, 0);
  },

  /**
   * Get category stats
   */
  getCategoryStats() {
    const stats = {};
    
    Object.keys(ACHIEVEMENT_CATEGORIES).forEach(category => {
      if (category === 'all') return;
      
      const achievements = this.getByCategory(category);
      stats[category] = {
        count: achievements.length,
        totalPoints: achievements.reduce((sum, ach) => {
          const multiplier = ACHIEVEMENT_RARITIES[ach.rarity].pointMultiplier;
          return sum + (ach.points * multiplier);
        }, 0)
      };
    });
    
    return stats;
  },

  /**
   * Get rarity distribution
   */
  getRarityDistribution() {
    const distribution = {};
    
    Object.keys(ACHIEVEMENT_RARITIES).forEach(rarity => {
      distribution[rarity] = this.getByRarity(rarity).length;
    });
    
    return distribution;
  },

  /**
   * Validate achievement definition
   */
  validateAchievement(achievement) {
    const errors = [];
    
    // Check required fields
    ACHIEVEMENT_VALIDATION.requiredFields.forEach(field => {
      if (!achievement[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    // Check valid category
    if (achievement.category && !ACHIEVEMENT_VALIDATION.validCategories.includes(achievement.category)) {
      errors.push(`Invalid category: ${achievement.category}`);
    }
    
    // Check valid rarity
    if (achievement.rarity && !ACHIEVEMENT_VALIDATION.validRarities.includes(achievement.rarity)) {
      errors.push(`Invalid rarity: ${achievement.rarity}`);
    }
    
    // Check point range
    if (achievement.points && achievement.rarity) {
      const range = ACHIEVEMENT_VALIDATION.pointRanges[achievement.rarity];
      if (achievement.points < range[0] || achievement.points > range[1]) {
        errors.push(`Points ${achievement.points} out of range for ${achievement.rarity} (${range[0]}-${range[1]})`);
      }
    }
    
    return errors;
  }
};

// Export for global access
window.ACHIEVEMENT_DEFINITIONS = ACHIEVEMENT_DEFINITIONS;
window.ACHIEVEMENT_CATEGORIES = ACHIEVEMENT_CATEGORIES;
window.ACHIEVEMENT_RARITIES = ACHIEVEMENT_RARITIES;
window.AchievementHelpers = AchievementHelpers;
