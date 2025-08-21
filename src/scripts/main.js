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
    
    // Add error handling for initialization
    this.initialize().catch(error => {
      console.error('❌ App initialization failed:', error);
      this.showError('Failed to initialize application. Please refresh the page.');
    });
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log('🏆 Initializing Pekkas Pokal...');
      
      // Wait for DOM to be ready
      await this.waitForDOM();
      
      // Initialize modules in dependency order
      await this.initializeModules();
      
      // Setup event listeners BEFORE loading data
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
      throw error;
    }
  }

  /**
   * Wait for DOM to be ready
   */
  async waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Initialize all modules
   */
  async initializeModules() {
    console.log('📦 Initializing modules...');
    
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
    console.log('🎛️ Setting up event listeners...');
    
    // Tab navigation - FIXED
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
   * Setup tab navigation - FIXED VERSION
   */
  setupTabNavigation() {
    console.log('🎯 Setting up tab navigation...');
    
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    console.log(`Found ${tabs.length} tabs and ${contents.length} content areas`);

    if (tabs.length === 0) {
      console.error('❌ No tabs found! Check HTML structure.');
      return;
    }

    tabs.forEach((tab, index) => {
      console.log(`Setting up tab ${index + 1}: ${tab.dataset.tab}`);
      
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        console.log(`🎯 Tab clicked: ${tab.dataset.tab}`);
        
        const targetTab = tab.dataset.tab;
        
        if (!targetTab) {
          console.error('❌ Tab missing data-tab attribute:', tab);
          return;
        }
        
        // Update active states
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const targetContent = document.getElementById(targetTab);
        
        if (targetContent) {
          targetContent.classList.add('active');
          console.log(`✅ Switched to tab: ${targetTab}`);
        } else {
          console.error(`❌ Target content not found: ${targetTab}`);
        }
        
        // Update state and load tab-specific content
        this.state.currentTab = targetTab;
        this.loadTabContent(targetTab);
      });
    });

    console.log('✅ Tab navigation setup complete');
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
          console.log(`Filter changed: ${filterType} = ${e.target.value}`);
          this.applyFilters();
        });
      }
    });

    // Reset filters
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        console.log('🔄 Resetting filters');
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
        // Update active state
        document.querySelectorAll('.category-filter').forEach(btn => 
          btn.classList.remove('active')
        );
        e.target.classList.add('active');
        
        // Render filtered achievements
        const category = e.target.dataset.category;
        console.log(`Achievement filter: ${category}`);
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
      
      // Show loading state
      this.showLoading();
      
      // Load CSV data
      this.state.competitionData = await this.modules.dataManager.loadCSVData();
      
      if (!this.state.competitionData || !this.state.competitionData.competitions) {
        throw new Error('Invalid data structure received');
      }
      
      console.log('🏆 Calculating achievements...');
      
      // Calculate achievements
      this.state.competitionData.participantAchievements = 
        this.modules.achievementEngine.calculateAllAchievements(
          this.state.competitionData.competitions,
          this.state.competitionData.participants
        );
      
      // Populate filter options
      this.populateFilters();
      
      console.log(`✅ Loaded ${this.state.competitionData.competitions.length} competitions and ${this.state.competitionData.participants.length} participants`);
      
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      throw error;
    }
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
      this.showLoading();
      return;
    }

    // Render dashboard by default
    this.loadTabContent('dashboard');
    
    // Update year range display
    this.updateYearRange();
    
    // Hide loading state
    this.hideLoading();
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
        default:
          console.warn(`Unknown tab: ${tabName}`);
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
    this.updateElement('total-competitions', totalComps);
    this.updateElement('comp-trend', `${totalComps} totalt`);
    
    // Total participants
    const totalParticipants = data.participants.length;
    this.updateElement('total-participants', totalParticipants);
    
    // Calculate winner stats
    const winCounts = this.modules.statistics.calculateWinCounts(data.competitions);
    const topWinner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
    
    if (topWinner) {
      this.updateElement('most-wins', topWinner[0]);
      this.updateElement('wins-count', `${topWinner[1]} vinster`);
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
    console.log('🏆 Loading achievements...');
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
    console.log('📈 Loading statistics...');
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
    this.updateElement('competitor-filter', 'all', 'value');
    this.updateElement('timeframe-filter', 'all', 'value');
    this.updateElement('competition-type-filter', 'all', 'value');
    
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
      
      this.updateElement('year-range', `${minYear}-${maxYear}`);
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
        <div style="display: flex; justify-content: center; align-items: center; min-height: 300px; flex-direction: column;">
          <div class="spinner"></div>
          <div style="margin-top: 1rem; color: var(--text-secondary); font-size: 1.1rem;">
            Laddar tävlingsdata...
          </div>
        </div>
      `;
    }
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    // Loading will be replaced by actual content
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
          <p style="margin: 1rem 0; color: var(--text-secondary);">${message}</p>
          <button onclick="window.location.reload()" style="
            background: var(--epic-gradient);
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
    } else {
      console.warn(`Element not found: ${id}`);
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

function initializeApp() {
  console.log('🚀 Starting Pekkas Pokal application...');
  try {
    app = new PekkasPokalApp();
    window.PekkasPokalApp = app; // Make globally accessible
  } catch (error) {
    console.error('❌ Failed to start application:', error);
  }
}

// Initialize based on document state
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded
  initializeApp();
}