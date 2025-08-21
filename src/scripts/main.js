/**
 * Pekkas Pokal - Main Application Controller
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
    
    this.initialize();
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log('🏆 Initializing Pekkas Pokal...');
      
      // Initialize modules in dependency order
      await this.initializeModules();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load data
      await this.loadData();
      
      // Initial render
      this.render();
      
      this.state.initialized = true;
      console.log('✅ Pekkas Pokal initialized successfully!');
      
    } catch (error) {
      console.error('❌ Failed to initialize Pekkas Pokal:', error);
      this.showError('Failed to initialize application. Please refresh the page.');
    }
  }

  /**
   * Initialize all modules
   */
  async initializeModules() {
    // Check if modules are available
    const requiredModules = [
      'DataManager', 
      'AchievementEngine', 
      'ChartManager', 
      'UIComponents', 
      'Statistics', 
      'FilterManager'
    ];
    
    for (const moduleName of requiredModules) {
      if (typeof window[moduleName] === 'undefined') {
        throw new Error(`Module ${moduleName} not found. Check script loading order.`);
      }
    }
    
    // Initialize modules
    this.modules.dataManager = new DataManager();
    this.modules.achievementEngine = new AchievementEngine();
    this.modules.chartManager = new ChartManager();
    this.modules.uiComponents = new UIComponents();
    this.modules.statistics = new Statistics();
    this.modules.filterManager = new FilterManager();
    
    console.log('📦 All modules initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Tab navigation
    this.setupTabNavigation();
    
    // Filter controls
    this.setupFilterControls();
    
    // Achievement categories
    this.setupAchievementFilters();
    
    // Window events
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('beforeunload', () => this.cleanup());
    
    console.log('🎛️ Event listeners setup complete');
  }

  /**
   * Setup tab navigation
   */
  setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active states
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
        
        // Update state and load tab-specific content
        this.state.currentTab = targetTab;
        this.loadTabContent(targetTab);
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
      filter?.addEventListener('change', (e) => {
        this.state.filters[e.target.id.replace('-filter', '')] = e.target.value;
        this.applyFilters();
      });
    });

    // Reset filters
    resetBtn?.addEventListener('click', () => {
      this.resetFilters();
    });
  }

  /**
   * Setup achievement filter buttons
   */
  setupAchievementFilters() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-filter')) {
        // Update active state
        document.querySelectorAll('.category-filter').forEach(btn => 
          btn.classList.remove('active')
        );
        e.target.classList.add('active');
        
        // Render filtered achievements
        const category = e.target.dataset.category;
        this.modules.uiComponents.renderAchievementsGrid(category);
      }
    });
  }

  /**
   * Load application data
   */
  async loadData() {
    try {
      console.log('📊 Loading competition data...');
      
      // Load CSV data
      this.state.competitionData = await this.modules.dataManager.loadCSVData();
      
      // Calculate achievements
      this.state.competitionData.participantAchievements = 
        this.modules.achievementEngine.calculateAllAchievements(
          this.state.competitionData.competitions,
          this.state.competitionData.participants
        );
      
      // Populate filter options
      this.populateFilters();
      
      console.log(`✅ Loaded ${this.state.competitionData.competitions.length} competitions`);
      
    } catch (error) {
      console.error('Failed to load data:', error);
      throw error;
    }
  }

  /**
   * Populate filter dropdowns
   */
  populateFilters() {
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
      this.showLoading();
      return;
    }

    // Render dashboard by default
    this.loadTabContent('dashboard');
    
    // Update year range display
    this.updateYearRange();
  }

  /**
   * Load content for specific tab
   */
  loadTabContent(tabName) {
    if (!this.state.competitionData) return;

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
  }

  /**
   * Load dashboard content
   */
  loadDashboard() {
    const data = this.state.competitionData;
    
    // Update stats cards
    this.updateStatsCards(data);
    
    // Load fun stats
    this.loadFunStats(data);
    
    // Create performance chart
    this.modules.chartManager.createPerformanceTrendChart(data);
  }

  /**
   * Update dashboard stats cards
   */
  updateStatsCards(data) {
    // Total competitions
    const totalComps = data.competitions.length;
    document.getElementById('total-competitions').textContent = totalComps;
    document.getElementById('comp-trend').textContent = `${totalComps} totalt`;
    
    // Total participants
    const totalParticipants = data.participants.length;
    document.getElementById('total-participants').textContent = totalParticipants;
    
    // Calculate winner stats
    const winCounts = this.modules.statistics.calculateWinCounts(data.competitions);
    const topWinner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
    
    if (topWinner) {
      document.getElementById('most-wins').textContent = topWinner[0];
      document.getElementById('wins-count').textContent = `${topWinner[1]} vinster`;
    }
    
    // Latest winner
    const latestComp = data.competitions[0];
    if (latestComp && latestComp.winner) {
      document.getElementById('current-champion').textContent = latestComp.winner;
      document.getElementById('champ-comp').textContent = `${latestComp.year} ${latestComp.name}`;
    }
  }

  /**
   * Load medal tally
   */
  loadMedalTally() {
    const data = this.state.competitionData;
    const medalCounts = this.modules.statistics.calculateMedalCounts(data);
    
    // Render medal tally table
    this.modules.uiComponents.renderMedalTally(medalCounts);
    
    // Create medal distribution chart
    this.modules.chartManager.createMedalChart(medalCounts);
  }

  /**
   * Load achievements
   */
  loadAchievements() {
    const data = this.state.competitionData;
    
    // Update achievement stats
    this.modules.uiComponents.updateAchievementStats(data.participantAchievements);
    
    // Render participant cards
    this.modules.uiComponents.renderParticipantCards(data.participantAchievements);
    
    // Render achievements grid
    this.modules.uiComponents.renderAchievementsGrid('all');
  }

  /**
   * Load statistics
   */
  loadStatistics() {
    const filteredData = this.modules.filterManager.applyFilters(
      this.state.competitionData,
      this.state.filters
    );
    
    // Update competitor stats
    this.modules.uiComponents.updateStatisticsView(filteredData);
    
    // Update charts
    this.modules.chartManager.updateStatisticsCharts(filteredData);
  }

  /**
   * Load fun stats
   */
  loadFunStats(data) {
    const funStats = this.modules.statistics.calculateFunStats(data);
    this.modules.uiComponents.renderFunStats(funStats);
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
    document.getElementById('competitor-filter').value = 'all';
    document.getElementById('timeframe-filter').value = 'all';
    document.getElementById('competition-type-filter').value = 'all';
    
    // Apply filters
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
      
      const yearRangeElement = document.getElementById('year-range');
      if (yearRangeElement) {
        yearRangeElement.textContent = `${minYear}-${maxYear}`;
      }
    }
  }

  /**
   * Handle window resize
   */
  handleResize() {
    // Debounce resize events
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (this.modules.chartManager) {
        this.modules.chartManager.handleResize();
      }
    }, 150);
  }

  /**
   * Show loading state
   */
  showLoading() {
    const container = document.querySelector('.container');
    if (container) {
      container.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
        </div>
      `;
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.querySelector('.container');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--danger);">
          <h2>❌ Fel uppstod</h2>
          <p>${message}</p>
          <button onclick="window.location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
            🔄 Ladda om sidan
          </button>
        </div>
      `;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Clean up chart instances
    if (this.modules.chartManager) {
      this.modules.chartManager.cleanup();
    }
    
    // Clear timeouts
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
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

// Initialize application when DOM is ready
let app;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = new PekkasPokalApp();
  });
} else {
  app = new PekkasPokalApp();
}

// Export for global access
window.PekkasPokalApp = app;