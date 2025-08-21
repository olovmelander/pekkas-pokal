/**
 * Pekkas Pokal - Main Application Controller (FIXED VERSION)
 * Entry point and coordination between modules
 */

class PekkasPokalApp {
  constructor() {
    this.modules = {};
    this.state = {
      initialized: false,
      currentTab: 'dashboard',
      competitionData: null,
      filters: {
        competitor: 'all',
        timeframe: 'all',
        competitionType: 'all'
      }
    };
    
    console.log('🏆 PekkasPokalApp starting...');
    
    // Initialize immediately
    this.initialize();
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log('🏆 Initializing Pekkas Pokal...');
      
      // Initialize modules
      await this.initializeModules();
      console.log('✅ Modules initialized');
      
      // Setup event listeners
      this.setupEventListeners();
      console.log('✅ Event listeners setup');
      
      // Load data
      await this.loadData();
      console.log('✅ Data loaded');
      
      // Initial render
      this.render();
      console.log('✅ Initial render complete');
      
      // Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }
      
      this.state.initialized = true;
      console.log('🎉 Pekkas Pokal initialized successfully!');
      
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      this.showError(`Fel vid initialisering: ${error.message}`);
    }
  }

  /**
   * Initialize all modules
   */
  async initializeModules() {
    console.log('📦 Initializing modules...');
    
    // Initialize modules with fallbacks
    try {
      this.modules.dataManager = typeof DataManager !== 'undefined' ? new DataManager() : null;
      this.modules.achievementEngine = typeof AchievementEngine !== 'undefined' ? new AchievementEngine() : null;
      this.modules.chartManager = typeof ChartManager !== 'undefined' ? new ChartManager() : null;
      this.modules.uiComponents = typeof UIComponents !== 'undefined' ? new UIComponents() : null;
      this.modules.statistics = typeof Statistics !== 'undefined' ? new Statistics() : null;
      this.modules.filterManager = typeof FilterManager !== 'undefined' ? new FilterManager() : null;
      
      // Check critical modules
      if (!this.modules.dataManager) {
        throw new Error('DataManager not available');
      }
      
      console.log('📦 All modules initialized');
    } catch (error) {
      console.error('❌ Module initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    console.log('🎛️ Setting up event listeners...');
    
    // Tab navigation
    this.setupTabNavigation();
    
    // Filter controls
    this.setupFilterControls();
    
    // Achievement categories
    this.setupAchievementFilters();
    
    // Window events
    window.addEventListener('resize', () => this.handleResize());
    
    console.log('🎛️ Event listeners setup complete');
  }

  /**
   * Setup tab navigation
   */
  setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = tab.dataset.tab;
        
        if (!targetTab) return;
        
        // Update active states
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const targetContent = document.getElementById(targetTab);
        
        if (targetContent) {
          targetContent.classList.add('active');
          this.state.currentTab = targetTab;
          this.loadTabContent(targetTab);
        }
      });
    });
  }

  /**
   * Setup filter controls
   */
  setupFilterControls() {
    const competitorFilter = document.getElementById('competitor-filter');
    const timeframeFilter = document.getElementById('timeframe-filter');
    const competitionTypeFilter = document.getElementById('competition-type-filter');
    const resetBtn = document.getElementById('reset-filters-btn');

    // Filter change handlers
    [competitorFilter, timeframeFilter, competitionTypeFilter].forEach(filter => {
      if (filter) {
        filter.addEventListener('change', (e) => {
          const filterType = e.target.id.replace('-filter', '').replace('-', '');
          this.state.filters[filterType] = e.target.value;
          this.applyFilters();
        });
      }
    });

    // Reset filters
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }
  }

  /**
   * Setup achievement filter buttons
   */
  setupAchievementFilters() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-filter')) {
        document.querySelectorAll('.category-filter').forEach(btn => 
          btn.classList.remove('active')
        );
        e.target.classList.add('active');
        
        const category = e.target.dataset.category;
        if (this.modules.uiComponents) {
          this.modules.uiComponents.renderAchievementsGrid(category);
        }
      }
    });
  }

  /**
   * Load application data
   */
  async loadData() {
    try {
      console.log('📊 Loading competition data...');
      
      if (!this.modules.dataManager) {
        throw new Error('DataManager not initialized');
      }
      
      // Load CSV data
      this.state.competitionData = await this.modules.dataManager.loadCSVData();
      
      if (!this.state.competitionData || !this.state.competitionData.competitions) {
        throw new Error('Invalid data structure received');
      }
      
      console.log(`📊 Data loaded: ${this.state.competitionData.competitions.length} competitions`);
      
      // Calculate achievements if engine is available
      if (this.modules.achievementEngine) {
        this.state.competitionData.participantAchievements = 
          this.modules.achievementEngine.calculateAllAchievements(
            this.state.competitionData.competitions,
            this.state.competitionData.participants
          );
      }
      
      // Populate filter options
      this.populateFilters();
      
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      // Use embedded data as fallback
      console.log('Using embedded data as fallback...');
      this.state.competitionData = this.getEmbeddedData();
      this.populateFilters();
    }
  }

  /**
   * Get embedded data as fallback
   */
  getEmbeddedData() {
    const csvContent = `År,Tävling,Plats,Arrangör 3:a,Arrangör näst sist,Olov Melander,Mikael Hägglund,Viktor Jones,Per Wikman,Erik Vallgren,Henrik Lundqvist,Rickard Nilsson,Niklas Norberg,Per Olsson,Tobias Lundqvist,Lars Sandin,Ludvig Ulenius,Jonas Eriksson
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
    
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    return this.modules.dataManager.processData(parsed.data, parsed.meta.fields);
  }

  /**
   * Populate filter dropdowns
   */
  populateFilters() {
    if (!this.state.competitionData) return;
    
    // Competitor filter
    const competitorFilter = document.getElementById('competitor-filter');
    if (competitorFilter) {
      competitorFilter.innerHTML = '<option value="all">Alla Deltagare</option>';
      this.state.competitionData.participants.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        competitorFilter.appendChild(option);
      });
    }

    // Competition type filter
    const competitionTypes = [...new Set(
      this.state.competitionData.competitions.map(c => c.name)
    )];
    const typeFilter = document.getElementById('competition-type-filter');
    if (typeFilter) {
      typeFilter.innerHTML = '<option value="all">Alla Tävlingar</option>';
      competitionTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeFilter.appendChild(option);
      });
    }
  }

  /**
   * Render the application
   */
  render() {
    if (!this.state.competitionData) {
      return;
    }

    console.log('🎨 Rendering application...');

    // Render dashboard by default
    this.loadTabContent('dashboard');
    
    // Update year range display
    this.updateYearRange();
    
    console.log('✅ Application render complete');
  }

  /**
   * Load content for specific tab
   */
  loadTabContent(tabName) {
    console.log(`📄 Loading content for tab: ${tabName}`);
    
    if (!this.state.competitionData) {
      console.warn('No data available for tab content');
      return;
    }

    try {
      switch (tabName) {
        case 'dashboard':
          this.loadDashboard();
          break;
        case 'medals':
          this.loadMedalTally();
          break;
        case 'achievements':
          this.loadAchievements();
          break;
        case 'statistics':
          this.loadStatistics();
          break;
      }
    } catch (error) {
      console.error(`❌ Error loading ${tabName} content:`, error);
    }
  }

  /**
   * Load dashboard content
   */
  loadDashboard() {
    console.log('📊 Loading dashboard...');
    const data = this.state.competitionData;
    
    // Update stats cards
    this.updateStatsCards(data);
    
    // Load fun stats
    if (this.modules.statistics && this.modules.uiComponents) {
      const funStats = this.modules.statistics.calculateFunStats(data);
      this.modules.uiComponents.renderFunStats(funStats);
    }
    
    // Create performance chart
    if (this.modules.chartManager) {
      this.modules.chartManager.createPerformanceTrendChart(data);
    }
  }

  /**
   * Update dashboard stats cards
   */
  updateStatsCards(data) {
    // Total competitions
    const totalComps = data.competitions.length;
    this.updateElement('total-competitions', totalComps);
    this.updateElement('comp-trend', `${totalComps} totalt`);
    
    // Total participants
    const totalParticipants = data.participants.length;
    this.updateElement('total-participants', totalParticipants);
    
    // Calculate winner stats
    if (this.modules.statistics) {
      const winCounts = this.modules.statistics.calculateWinCounts(data.competitions);
      const topWinner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
      
      if (topWinner) {
        this.updateElement('most-wins', topWinner[0]);
        this.updateElement('wins-count', `${topWinner[1]} vinster`);
      }
    }
    
    // Latest winner
    const latestComp = data.competitions[0];
    if (latestComp && latestComp.winner) {
      this.updateElement('current-champion', latestComp.winner);
      this.updateElement('champ-comp', `${latestComp.year} ${latestComp.name}`);
    }
  }

  /**
   * Load medal tally
   */
  loadMedalTally() {
    console.log('🥇 Loading medal tally...');
    const data = this.state.competitionData;
    
    if (this.modules.statistics && this.modules.uiComponents) {
      const medalCounts = this.modules.statistics.calculateMedalCounts(data);
      this.modules.uiComponents.renderMedalTally(medalCounts);
    }
    
    if (this.modules.chartManager && this.modules.statistics) {
      const medalCounts = this.modules.statistics.calculateMedalCounts(data);
      this.modules.chartManager.createMedalChart(medalCounts);
    }
  }

  /**
   * Load achievements
   */
  loadAchievements() {
    console.log('🏆 Loading achievements...');
    const data = this.state.competitionData;
    
    if (this.modules.uiComponents && data.participantAchievements) {
      this.modules.uiComponents.updateAchievementStats(data.participantAchievements);
      this.modules.uiComponents.renderParticipantCards(data.participantAchievements);
      this.modules.uiComponents.renderAchievementsGrid('all');
    }
  }

  /**
   * Load statistics
   */
  loadStatistics() {
    console.log('📈 Loading statistics...');
    
    if (this.modules.filterManager && this.modules.uiComponents && this.modules.chartManager) {
      const filteredData = this.modules.filterManager.applyFilters(
        this.state.competitionData,
        this.state.filters
      );
      
      this.modules.uiComponents.updateStatisticsView(filteredData);
      this.modules.chartManager.updateStatisticsCharts(filteredData);
    }
  }

  /**
   * Apply current filters
   */
  applyFilters() {
    if (this.state.currentTab === 'statistics') {
      this.loadStatistics();
    }
  }

  /**
   * Reset all filters
   */
  resetFilters() {
    this.state.filters = {
      competitor: 'all',
      timeframe: 'all',
      competitionType: 'all'
    };
    
    // Update UI
    this.updateElement('competitor-filter', 'all', 'value');
    this.updateElement('timeframe-filter', 'all', 'value');
    this.updateElement('competition-type-filter', 'all', 'value');
    
    this.applyFilters();
  }

  /**
   * Update year range display
   */
  updateYearRange() {
    const data = this.state.competitionData;
    if (data && data.competitions.length > 0) {
      const years = data.competitions.map(c => c.year).filter(y => y);
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      
      this.updateElement('year-range', `${minYear}-${maxYear}`);
    }
  }

  /**
   * Handle window resize
   */
  handleResize() {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (this.modules.chartManager) {
        this.modules.chartManager.handleResize();
      }
    }, 150);
  }

  /**
   * Show error message
   */
  showError(message) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <h2>❌ Fel uppstod</h2>
          <p style="margin: 1rem 0; color: #a8b2d1;">${message}</p>
          <button onclick="window.location.reload()" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 1rem;
          ">
            🔄 Ladda om sidan
          </button>
        </div>
      `;
    }
  }

  /**
   * Utility function to update element content
   */
  updateElement(id, content, property = 'textContent') {
    const element = document.getElementById(id);
    if (element) {
      element[property] = content;
    }
  }

  /**
   * Get current application state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get module instance
   */
  getModule(name) {
    return this.modules[name];
  }
}

// Export the class
window.PekkasPokalApp = PekkasPokalApp;