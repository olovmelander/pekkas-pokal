/**
 * Pekkas Pokal - Main Application Controller (ENHANCED FIXED VERSION)
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
    
    console.log('🏆 PekkasPokalApp constructor called');
    
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
      console.log('✅ DOM ready');
      
      // Wait for dependencies
      await this.waitForDependencies();
      console.log('✅ Dependencies loaded');
      
      // Initialize modules in dependency order
      await this.initializeModules();
      console.log('✅ Modules initialized');
      
      // Setup event listeners BEFORE loading data
      this.setupEventListeners();
      console.log('✅ Event listeners setup');
      
      // Load data
      await this.loadData();
      console.log('✅ Data loaded');
      
      // Initial render
      this.render();
      console.log('✅ Initial render complete');
      
      this.state.initialized = true;
      console.log('🎉 Pekkas Pokal initialized successfully!');
      
    } catch (error) {
      console.error('❌ Failed to initialize Pekkas Pokal:', error);
      this.showError(`Failed to initialize application: ${error.message}`);
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
   * Wait for external dependencies to load
   */
  async waitForDependencies() {
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkDependencies = () => {
        const chartLoaded = typeof Chart !== 'undefined';
        const papaLoaded = typeof Papa !== 'undefined';
        
        if (chartLoaded && papaLoaded) {
          console.log('📦 All external dependencies loaded');
          resolve();
        } else {
          const elapsed = Date.now() - startTime;
          if (elapsed > maxWait) {
            const missing = [];
            if (!chartLoaded) missing.push('Chart.js');
            if (!papaLoaded) missing.push('Papa Parse');
            reject(new Error(`Dependencies not loaded after ${maxWait}ms: ${missing.join(', ')}`));
          } else {
            console.log(`⏳ Waiting for dependencies... (${elapsed}ms)`);
            setTimeout(checkDependencies, 100);
          }
        }
      };
      
      checkDependencies();
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
    
    // Initialize modules with error handling
    try {
      this.modules.dataManager = new DataManager();
      console.log('✅ DataManager initialized');
      
      this.modules.achievementEngine = new AchievementEngine();
      console.log('✅ AchievementEngine initialized');
      
      this.modules.chartManager = new ChartManager();
      console.log('✅ ChartManager initialized');
      
      this.modules.uiComponents = new UIComponents();
      console.log('✅ UIComponents initialized');
      
      this.modules.statistics = new Statistics();
      console.log('✅ Statistics initialized');
      
      this.modules.filterManager = new FilterManager();
      console.log('✅ FilterManager initialized');
      
    } catch (error) {
      console.error('❌ Module initialization failed:', error);
      throw error;
    }
    
    console.log('📦 All modules initialized successfully');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    console.log('🎛️ Setting up event listeners...');
    
    // Tab navigation - ENHANCED
    this.setupTabNavigation();
    
    // Filter controls
    this.setupFilterControls();
    
    // Achievement categories
    this.setupAchievementFilters();
    
    // Window events
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('beforeunload', () => this.cleanup());
    
    // Debug event listener
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        this.showDebugInfo();
      }
    });
    
    console.log('🎛️ Event listeners setup complete');
  }

  /**
   * Setup tab navigation - ENHANCED VERSION
   */
  setupTabNavigation() {
    console.log('🎯 Setting up enhanced tab navigation...');
    
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    console.log(`Found ${tabs.length} tabs and ${contents.length} content areas`);

    if (tabs.length === 0) {
      console.error('❌ No tabs found! Check HTML structure.');
      return;
    }

    // Enhanced tab click handling
    tabs.forEach((tab, index) => {
      console.log(`Setting up tab ${index + 1}: ${tab.dataset.tab} (${tab.textContent.trim()})`);
      
      // Remove any existing listeners to prevent duplicates
      tab.removeEventListener('click', this.handleTabClick);
      
      // Create bound event handler
      const boundClickHandler = this.handleTabClick.bind(this);
      tab.addEventListener('click', boundClickHandler);
      
      // Store reference for cleanup
      tab._boundClickHandler = boundClickHandler;
      
      // Add keyboard support
      tab.setAttribute('tabindex', '0');
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          boundClickHandler(e);
        }
      });
    });

    console.log('✅ Enhanced tab navigation setup complete');
  }

  /**
   * Handle tab click events
   */
  handleTabClick(event) {
    event.preventDefault();
    
    const clickedTab = event.currentTarget;
    const targetTab = clickedTab.dataset.tab;
    
    console.log(`🎯 Tab clicked: ${targetTab}`);
    
    if (!targetTab) {
      console.error('❌ Tab missing data-tab attribute:', clickedTab);
      return;
    }
    
    // Don't do anything if already active
    if (clickedTab.classList.contains('active')) {
      console.log('📝 Tab already active, skipping');
      return;
    }
    
    try {
      // Update active states
      const allTabs = document.querySelectorAll('.nav-tab');
      const allContents = document.querySelectorAll('.tab-content');
      
      allTabs.forEach(t => t.classList.remove('active'));
      allContents.forEach(c => c.classList.remove('active'));
      
      clickedTab.classList.add('active');
      const targetContent = document.getElementById(targetTab);
      
      if (targetContent) {
        targetContent.classList.add('active');
        console.log(`✅ Switched to tab: ${targetTab}`);
        
        // Update state and load tab-specific content
        this.state.currentTab = targetTab;
        this.loadTabContent(targetTab);
        
        // Analytics/tracking
        if (window.gtag) {
          window.gtag('event', 'tab_switch', {
            tab_name: targetTab
          });
        }
        
      } else {
        console.error(`❌ Target content not found: ${targetTab}`);
        // Re-activate previous tab
        allTabs.forEach(t => {
          if (t.dataset.tab === this.state.currentTab) {
            t.classList.add('active');
          }
        });
        allContents.forEach(c => {
          if (c.id === this.state.currentTab) {
            c.classList.add('active');
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Error handling tab click:', error);
    }
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
      
      // Show loading state
      this.showLoading();
      
      // Load CSV data with detailed logging
      console.log('🔄 Starting CSV data load...');
      this.state.competitionData = await this.modules.dataManager.loadCSVData();
      
      if (!this.state.competitionData || !this.state.competitionData.competitions) {
        throw new Error('Invalid data structure received');
      }
      
      console.log(`📊 CSV data loaded: ${this.state.competitionData.competitions.length} competitions, ${this.state.competitionData.participants.length} participants`);
      
      console.log('🏆 Calculating achievements...');
      
      // Calculate achievements
      this.state.competitionData.participantAchievements = 
        this.modules.achievementEngine.calculateAllAchievements(
          this.state.competitionData.competitions,
          this.state.competitionData.participants
        );
      
      console.log('🏆 Achievements calculated');
      
      // Populate filter options
      this.populateFilters();
      
      console.log(`✅ Data loading complete - ${this.state.competitionData.competitions.length} competitions and ${this.state.competitionData.participants.length} participants`);
      
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
    
    console.log('🔄 Populating filters...');
    
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
      console.log(`✅ Populated competitor filter with ${this.state.competitionData.participants.length} participants`);
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
      console.log(`✅ Populated competition type filter with ${competitionTypes.length} types`);
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

    console.log('🎨 Rendering application...');

    // Render dashboard by default
    this.loadTabContent('dashboard');
    
    // Update year range display
    this.updateYearRange();
    
    // Hide loading state
    this.hideLoading();
    
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
   * Show debug information
   */
  showDebugInfo() {
    const debugInfo = {
      state: this.state,
      modules: Object.keys(this.modules),
      dataManager: this.modules.dataManager?.getDebugInfo(),
      chartManager: this.modules.chartManager?.getStats(),
      uiComponents: this.modules.uiComponents?.getStats()
    };
    
    console.log('🐛 Debug Information:', debugInfo);
    
    // Show in UI as well
    if (this.modules.uiComponents) {
      this.modules.uiComponents.showToast(
        '🐛 Debug info logged to console (Ctrl+Shift+I)', 
        'info', 
        5000
      );
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
    
    // Clean up event listeners
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      if (tab._boundClickHandler) {
        tab.removeEventListener('click', tab._boundClickHandler);
        delete tab._boundClickHandler;
      }
    });
    
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

// Global initialization function
function initializeApp() {
  console.log('🚀 Starting Pekkas Pokal application...');
  try {
    if (window.app) {
      console.log('⚠️ App already exists, cleaning up...');
      window.app.cleanup();
    }
    
    window.app = new PekkasPokalApp();
    window.PekkasPokalApp = window.app; // Make globally accessible
    
    return window.app;
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    throw error;
  }
}

// Export for manual initialization
window.initializeApp = initializeApp;

// Export the class
window.PekkasPokalApp = PekkasPokalApp;