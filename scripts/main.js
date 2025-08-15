/**
 * Pekkas Pokal - Main Application Controller
 * Handles navigation, UI interactions, and application lifecycle
 */

class PekkasPokalkApp {
  constructor() {
    this.currentTab = 'results';
    this.isInitialized = false;
    this.settings = {
      theme: 'light',
      autoSave: true,
      notifications: true,
      animations: true,
      scoringSystem: 'placement',
      tieBreaker: 'shared'
    };
    
    // Bind methods
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handleSearch = this.handleSearch.bind(this);
    this.handleSort = this.handleSort.bind(this);
    this.handleModalClose = this.handleModalClose.bind(this);
    this.handleFormSubmit = this.handleFormSubmit.bind(this);
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }
  
  /**
   * Initialize the application
   */
  async init() {
    try {
      // Show loading screen
      this.showLoadingScreen();
      
      // Load settings
      await this.loadSettings();
      
      // Initialize data manager
      await window.dataManager.init();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize components
      this.initializeComponents();
      
      // Load initial data
      await this.loadInitialData();
      
      // Setup PWA
      this.setupPWA();
      
      // Hide loading screen and show app
      setTimeout(() => {
        this.hideLoadingScreen();
        this.isInitialized = true;
        this.showNotification('Välkommen till Pekkas Pokal!', 'success');
      }, 1500);
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showNotification('Fel vid start av appen', 'error');
      this.hideLoadingScreen();
    }
  }
  
  /**
   * Show loading screen with progress animation
   */
  showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const progressBar = loadingScreen.querySelector('.loading-progress');
    
    loadingScreen.classList.remove('hidden');
    
    // Animate progress bar
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress > 100) progress = 100;
      progressBar.style.width = progress + '%';
      
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 200);
  }
  
  /**
   * Hide loading screen and show main app
   */
  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');
  }
  
  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', this.handleTabClick);
    });
    
    // Search functionality
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    
    searchInput?.addEventListener('input', this.handleSearch);
    searchClear?.addEventListener('click', () => {
      searchInput.value = '';
      this.handleSearch();
    });
    
    // Table sorting
    document.querySelectorAll('.sortable').forEach(header => {
      header.addEventListener('click', this.handleSort);
    });
    
    // Toolbar buttons
    this.setupToolbarEvents();
    
    // Modal events
    this.setupModalEvents();
    
    // Settings events
    this.setupSettingsEvents();
    
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      this.toggleTheme();
    });
    
    // Fullscreen toggle
    document.getElementById('fullscreen-toggle')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });
    
    // Window events
    window.addEventListener('resize', () => {
      this.handleResize();
    });
    
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  
  /**
   * Setup toolbar event listeners
   */
  setupToolbarEvents() {
    // Add competition
    document.getElementById('add-competition')?.addEventListener('click', () => {
      this.showCompetitionModal();
    });
    
    // Export data
    document.getElementById('export-data')?.addEventListener('click', () => {
      this.exportData();
    });
    
    // Import data
    document.getElementById('import-trigger')?.addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    
    document.getElementById('import-file')?.addEventListener('change', (e) => {
      this.importData(e.target.files[0]);
    });
    
    // Bulk edit
    document.getElementById('bulk-edit')?.addEventListener('click', () => {
      this.toggleBulkEdit();
    });
  }
  
  /**
   * Setup modal event listeners
   */
  setupModalEvents() {
    const modalOverlay = document.getElementById('modal-overlay');
    
    // Close modal on overlay click
    modalOverlay?.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        this.closeModal();
      }
    });
    
    // Close buttons
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', this.handleModalClose);
    });
    
    // Form submissions
    document.getElementById('competition-form')?.addEventListener('submit', this.handleFormSubmit);
    document.getElementById('participant-form')?.addEventListener('submit', this.handleFormSubmit);
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });
  }
  
  /**
   * Setup settings event listeners
   */
  setupSettingsEvents() {
    // Settings toggles
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        this.updateSetting(e.target.id, e.target.checked);
      });
    });
    
    // Settings selects
    document.querySelectorAll('#settings-tab select').forEach(select => {
      select.addEventListener('change', (e) => {
        this.updateSetting(e.target.id, e.target.value);
      });
    });
    
    // Data management buttons
    document.getElementById('backup-data')?.addEventListener('click', () => {
      this.backupData();
    });
    
    document.getElementById('restore-data')?.addEventListener('click', () => {
      document.getElementById('restore-file').click();
    });
    
    document.getElementById('restore-file')?.addEventListener('change', (e) => {
      this.restoreData(e.target.files[0]);
    });
    
    document.getElementById('clear-data')?.addEventListener('click', () => {
      this.clearAllData();
    });
    
    document.getElementById('sample-data')?.addEventListener('click', () => {
      this.loadSampleData();
    });
    
    // Add participant
    document.getElementById('add-participant')?.addEventListener('click', () => {
      this.showParticipantModal();
    });
  }
  
  /**
   * Handle navigation tab clicks
   */
  handleTabClick(e) {
    const tab = e.target.closest('.nav-tab');
    const targetTab = tab.dataset.tab;
    
    if (targetTab === this.currentTab) return;
    
    // Update active states
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(`${targetTab}-tab`).classList.add('active');
    
    this.currentTab = targetTab;
    
    // Load tab-specific data
    this.loadTabData(targetTab);
    
    // Update URL without page reload
    history.pushState({ tab: targetTab }, '', `#${targetTab}`);
  }
  
  /**
   * Handle search input
   */
  handleSearch(e) {
    const query = e?.target?.value?.toLowerCase() || '';
    const table = document.getElementById('results-table');
    const rows = table?.querySelectorAll('tbody tr') || [];
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const shouldShow = text.includes(query);
      row.style.display = shouldShow ? '' : 'none';
    });
    
    // Update clear button visibility
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) {
      clearBtn.style.display = query ? 'block' : 'none';
    }
  }
  
  /**
   * Handle table sorting
   */
  handleSort(e) {
    const header = e.target.closest('.sortable');
    const table = header.closest('table');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const columnIndex = Array.from(header.parentNode.children).indexOf(header);
    const sortBy = header.dataset.sort;
    
    // Determine sort direction
    const currentSort = header.dataset.sortDirection || 'none';
    const newDirection = currentSort === 'asc' ? 'desc' : 'asc';
    
    // Clear all sort indicators
    table.querySelectorAll('.sortable').forEach(h => {
      h.dataset.sortDirection = 'none';
      h.querySelector('.sort-indicator').textContent = '↕️';
    });
    
    // Set new sort direction
    header.dataset.sortDirection = newDirection;
    header.querySelector('.sort-indicator').textContent = newDirection === 'asc' ? '↑' : '↓';
    
    // Sort rows
    rows.sort((a, b) => {
      const aVal = a.children[columnIndex].textContent.trim();
      const bVal = b.children[columnIndex].textContent.trim();
      
      let comparison = 0;
      
      if (sortBy === 'year') {
        comparison = parseInt(aVal) - parseInt(bVal);
      } else {
        comparison = aVal.localeCompare(bVal, 'sv');
      }
      
      return newDirection === 'asc' ? comparison : -comparison;
    });
    
    // Reorder rows in DOM
    rows.forEach(row => tbody.appendChild(row));
  }
  
  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'e':
          e.preventDefault();
          this.exportData();
          break;
        case 'i':
          e.preventDefault();
          document.getElementById('import-file').click();
          break;
        case 'n':
          e.preventDefault();
          this.showCompetitionModal();
          break;
      }
    }
  }
  
  /**
   * Handle window resize
   */
  handleResize() {
    // Update charts if needed
    if (this.currentTab === 'statistics' && window.chartManager) {
      window.chartManager.resizeCharts();
    }
    
    // Update table column visibility based on screen size
    this.updateTableResponsiveness();
  }
  
  /**
   * Initialize various components
   */
  initializeComponents() {
    // Initialize chart manager
    if (window.ChartManager) {
      window.chartManager = new window.ChartManager();
    }
    
    // Initialize statistics calculator
    if (window.StatisticsCalculator) {
      window.statisticsCalculator = new window.StatisticsCalculator();
    }
    
    // Setup editable cells
    this.setupEditableCells();
    
    // Setup context menus
    this.setupContextMenus();
  }
  
  /**
   * Load initial application data
   */
  async loadInitialData() {
    try {
      // Load competitions
      await this.loadCompetitions();
      
      // Load participants
      await this.loadParticipants();
      
      // Update statistics
      await this.updateStatistics();
      
      // Set initial tab from URL
      const hash = window.location.hash.slice(1);
      if (hash && ['results', 'statistics', 'participants', 'settings'].includes(hash)) {
        this.currentTab = hash;
        document.querySelector(`[data-tab="${hash}"]`)?.click();
      }
      
    } catch (error) {
      console.error('Failed to load initial data:', error);
      this.showNotification('Fel vid laddning av data', 'error');
    }
  }
  
  /**
   * Load data for specific tab
   */
  async loadTabData(tabName) {
    switch (tabName) {
      case 'results':
        await this.loadCompetitions();
        break;
      case 'statistics':
        await this.loadStatistics();
        break;
      case 'participants':
        await this.loadParticipants();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  }
  
  /**
   * Load and display competitions
   */
  async loadCompetitions() {
    try {
      const competitions = await window.dataManager.getCompetitions();
      const participants = await window.dataManager.getParticipants();
      
      this.renderCompetitionsTable(competitions, participants);
      this.updateSummaryStats(competitions, participants);
      
    } catch (error) {
      console.error('Failed to load competitions:', error);
      this.showNotification('Fel vid laddning av tävlingar', 'error');
    }
  }
  
  /**
   * Render competitions table
   */
  renderCompetitionsTable(competitions, participants) {
    const tbody = document.getElementById('results-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    competitions.forEach(competition => {
      const row = this.createCompetitionRow(competition, participants);
      tbody.appendChild(row);
    });
    
    // Update table header with participants
    this.updateTableHeader(participants);
  }
  
  /**
   * Create a competition table row
   */
  createCompetitionRow(competition, participants) {
    const row = document.createElement('tr');
    row.dataset.competitionId = competition.id;
    
    // Year cell
    const yearCell = document.createElement('td');
    yearCell.className = 'year-cell';
    yearCell.textContent = competition.year;
    row.appendChild(yearCell);
    
    // Competition cell
    const compCell = document.createElement('td');
    compCell.className = 'competition-cell editable-cell';
    compCell.contentEditable = true;
    compCell.textContent = competition.name;
    compCell.addEventListener('blur', () => this.updateCompetition(competition.id, 'name', compCell.textContent));
    row.appendChild(compCell);
    
    // Location cell
    const locCell = document.createElement('td');
    locCell.className = 'location-cell editable-cell';
    locCell.contentEditable = true;
    locCell.textContent = competition.location;
    locCell.addEventListener('blur', () => this.updateCompetition(competition.id, 'location', locCell.textContent));
    row.appendChild(locCell);
    
    // Winner cell
    const winnerCell = document.createElement('td');
    winnerCell.className = 'winner-cell editable-cell';
    winnerCell.contentEditable = true;
    winnerCell.textContent = competition.winner || 'TBD';
    winnerCell.addEventListener('blur', () => this.updateCompetition(competition.id, 'winner', winnerCell.textContent));
    row.appendChild(winnerCell);
    
    // Participant score cells
    participants.forEach(participant => {
      const scoreCell = document.createElement('td');
      scoreCell.className = 'participant-score editable-cell';
      scoreCell.contentEditable = true;
      
      const score = competition.scores?.[participant.id];
      scoreCell.textContent = score || '-';
      
      if (score && competition.winner === participant.name) {
        scoreCell.classList.add('first-place');
      } else if (score && score <= 3) {
        scoreCell.classList.add('podium');
      } else if (!score || score === '-') {
        scoreCell.classList.add('empty');
      }
      
      scoreCell.addEventListener('blur', () => {
        this.updateCompetitionScore(competition.id, participant.id, scoreCell.textContent);
      });
      
      row.appendChild(scoreCell);
    });
    
    // Actions cell
    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-col';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Ta bort tävling';
    deleteBtn.addEventListener('click', () => this.deleteCompetition(competition.id));
    
    actionsCell.appendChild(deleteBtn);
    row.appendChild(actionsCell);
    
    return row;
  }
  
  /**
   * Update table header with participant columns
   */
  updateTableHeader(participants) {
    const headerRow = document.querySelector('#results-table thead tr');
    if (!headerRow) return;
    
    // Remove existing participant headers
    const existingHeaders = headerRow.querySelectorAll('.participant-header');
    existingHeaders.forEach(header => header.remove());
    
    // Add new participant headers
    const actionsHeader = headerRow.querySelector('.actions-col');
    
    participants.forEach(participant => {
      const th = document.createElement('th');
      th.className = 'participant-header sortable';
      th.dataset.sort = 'participant';
      th.innerHTML = `${participant.name} <span class="sort-indicator">↕️</span>`;
      th.addEventListener('click', this.handleSort);
      
      headerRow.insertBefore(th, actionsHeader);
    });
  }
  
  /**
   * Update summary statistics
   */
  updateSummaryStats(competitions, participants) {
    const totalYears = competitions.length;
    const activeParticipants = participants.filter(p => p.status === 'active').length;
    const totalParticipations = competitions.reduce((sum, comp) => {
      return sum + Object.keys(comp.scores || {}).length;
    }, 0);
    const avgParticipation = totalYears > 0 ? Math.round((totalParticipations / (totalYears * participants.length)) * 100) : 0;
    
    document.getElementById('total-years').textContent = totalYears;
    document.getElementById('active-participants').textContent = activeParticipants;
    document.getElementById('avg-participation').textContent = avgParticipation + '%';
  }
  
  /**
   * Show competition modal
   */
  showCompetitionModal(competition = null) {
    const modal = document.getElementById('competition-modal');
    const overlay = document.getElementById('modal-overlay');
    const form = document.getElementById('competition-form');
    
    // Reset form
    form.reset();
    
    if (competition) {
      // Edit mode
      document.getElementById('modal-title').textContent = 'Redigera Tävling';
      document.getElementById('comp-year').value = competition.year;
      document.getElementById('comp-name').value = competition.name;
      document.getElementById('comp-location').value = competition.location;
      document.getElementById('comp-date').value = competition.date || '';
      document.getElementById('comp-notes').value = competition.notes || '';
      form.dataset.competitionId = competition.id;
    } else {
      // Add mode
      document.getElementById('modal-title').textContent = 'Lägg till Ny Tävling';
      document.getElementById('comp-year').value = new Date().getFullYear();
      delete form.dataset.competitionId;
    }
    
    overlay.classList.remove('hidden');
    overlay.classList.add('active');
    
    // Focus first input
    setTimeout(() => {
      document.getElementById('comp-year').focus();
    }, 100);
  }
  
  /**
   * Show participant modal
   */
  showParticipantModal(participant = null) {
    const modal = document.getElementById('participant-modal');
    const overlay = document.getElementById('modal-overlay');
    const form = document.getElementById('participant-form');
    
    // Reset form
    form.reset();
    
    if (participant) {
      // Edit mode
      document.querySelector('#participant-modal .modal-header h2').textContent = 'Redigera Deltagare';
      document.getElementById('participant-name').value = participant.name;
      document.getElementById('participant-nickname').value = participant.nickname || '';
      document.getElementById('participant-email').value = participant.email || '';
      document.getElementById('participant-status').value = participant.status;
      form.dataset.participantId = participant.id;
    } else {
      // Add mode
      document.querySelector('#participant-modal .modal-header h2').textContent = 'Lägg till Deltagare';
      delete form.dataset.participantId;
    }
    
    overlay.classList.remove('hidden');
    overlay.classList.add('active');
    
    // Focus first input
    setTimeout(() => {
      document.getElementById('participant-name').focus();
    }, 100);
  }
  
  /**
   * Close modal
   */
  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('active');
    
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 300);
  }
  
  /**
   * Handle modal close events
   */
  handleModalClose(e) {
    e.preventDefault();
    this.closeModal();
  }
  
  /**
   * Handle form submissions
   */
  async handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    try {
      if (form.id === 'competition-form') {
        await this.saveCompetition(form, formData);
      } else if (form.id === 'participant-form') {
        await this.saveParticipant(form, formData);
      }
      
      this.closeModal();
      this.showNotification('Sparad!', 'success');
      
    } catch (error) {
      console.error('Form submission error:', error);
      this.showNotification('Fel vid sparning', 'error');
    }
  }
  
  /**
   * Save competition data
   */
  async saveCompetition(form, formData) {
    const competitionData = {
      year: parseInt(document.getElementById('comp-year').value),
      name: document.getElementById('comp-name').value,
      location: document.getElementById('comp-location').value,
      date: document.getElementById('comp-date').value || null,
      notes: document.getElementById('comp-notes').value || null,
      scores: {}
    };
    
    const competitionId = form.dataset.competitionId;
    
    if (competitionId) {
      // Update existing
      await window.dataManager.updateCompetition(competitionId, competitionData);
    } else {
      // Create new
      await window.dataManager.addCompetition(competitionData);
    }
    
    await this.loadCompetitions();
  }
  
  /**
   * Save participant data
   */
  async saveParticipant(form, formData) {
    const participantData = {
      name: document.getElementById('participant-name').value,
      nickname: document.getElementById('participant-nickname').value || null,
      email: document.getElementById('participant-email').value || null,
      status: document.getElementById('participant-status').value
    };
    
    const participantId = form.dataset.participantId;
    
    if (participantId) {
      // Update existing
      await window.dataManager.updateParticipant(participantId, participantData);
    } else {
      // Create new
      await window.dataManager.addParticipant(participantData);
    }
    
    await this.loadParticipants();
    await this.loadCompetitions(); // Refresh to update table headers
  }
  
  /**
   * Update competition field
   */
  async updateCompetition(competitionId, field, value) {
    try {
      const updateData = { [field]: value };
      await window.dataManager.updateCompetition(competitionId, updateData);
      
      if (this.settings.autoSave) {
        this.showNotification('Sparat automatiskt', 'success', 2000);
      }
    } catch (error) {
      console.error('Failed to update competition:', error);
      this.showNotification('Fel vid sparning', 'error');
    }
  }
  
  /**
   * Update competition score
   */
  async updateCompetitionScore(competitionId, participantId, score) {
    try {
      await window.dataManager.updateCompetitionScore(competitionId, participantId, score);
      
      if (this.settings.autoSave) {
        this.showNotification('Poäng sparad', 'success', 2000);
      }
    } catch (error) {
      console.error('Failed to update score:', error);
      this.showNotification('Fel vid sparning av poäng', 'error');
    }
  }
  
  /**
   * Delete competition
   */
  async deleteCompetition(competitionId) {
    if (!confirm('Är du säker på att du vill ta bort denna tävling?')) {
      return;
    }
    
    try {
      await window.dataManager.deleteCompetition(competitionId);
      await this.loadCompetitions();
      this.showNotification('Tävling borttagen', 'success');
    } catch (error) {
      console.error('Failed to delete competition:', error);
      this.showNotification('Fel vid borttagning', 'error');
    }
  }
  
  /**
   * Toggle theme between light and dark
   */
  toggleTheme() {
    const newTheme = this.settings.theme === 'light' ? 'dark' : 'light';
    this.settings.theme = newTheme;
    
    document.documentElement.setAttribute('data-theme', newTheme);
    
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = newTheme === 'light' ? '🌙' : '☀️';
    
    this.saveSettings();
    this.showNotification(`${newTheme === 'light' ? 'Ljust' : 'Mörkt'} tema aktiverat`, 'info');
  }
  
  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
  
  /**
   * Show notification toast
   */
  showNotification(message, type = 'info', duration = 5000) {
    if (!this.settings.notifications) return;
    
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-message">
          <div class="toast-description">${message}</div>
        </div>
        <button class="toast-close">✕</button>
      </div>
      <div class="toast-progress"></div>
    `;
    
    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.removeToast(toast);
    });
    
    container.appendChild(toast);
    
    // Show with animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove
    setTimeout(() => this.removeToast(toast), duration);
  }
  
  /**
   * Remove toast notification
   */
  removeToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
  
  /**
   * Setup PWA functionality
   */
  setupPWA() {
    // Install prompt
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      
      const installBtn = document.getElementById('install-btn');
      installBtn?.classList.remove('hidden');
      
      installBtn?.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          
          if (outcome === 'accepted') {
            this.showNotification('App installerad!', 'success');
          }
          
          deferredPrompt = null;
          installBtn.classList.add('hidden');
        }
      });
    });
    
    // Service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/pekkas-pokal/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed'));
    }
  }
  
  /**
   * Load application settings
   */
  async loadSettings() {
    const savedSettings = localStorage.getItem('pekkas-pokal-settings');
    
    if (savedSettings) {
      this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
    }
    
    // Apply settings to UI
    document.documentElement.setAttribute('data-theme', this.settings.theme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.textContent = this.settings.theme === 'light' ? '🌙' : '☀️';
    }
    
    // Update settings form
    Object.keys(this.settings).forEach(key => {
      const element = document.getElementById(key);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = this.settings[key];
        } else {
          element.value = this.settings[key];
        }
      }
    });
  }
  
  /**
   * Save application settings
   */
  saveSettings() {
    localStorage.setItem('pekkas-pokal-settings', JSON.stringify(this.settings));
  }
  
  /**
   * Update individual setting
   */
  updateSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    
    // Apply setting immediately if needed
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', value);
    }
  }
  
  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges() {
    // Implementation would check for dirty forms or pending saves
    return false;
  }
  
  /**
   * Additional methods for data management, statistics, etc.
   * These will be called from other modules
   */
  
  async exportData() {
    try {
      const data = await window.dataManager.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `pekkas-pokal-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showNotification('Data exporterad!', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification('Fel vid export', 'error');
    }
  }
  
  async importData(file) {
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      await window.dataManager.importData(data);
      await this.loadInitialData();
      
      this.showNotification('Data importerad!', 'success');
    } catch (error) {
      console.error('Import failed:', error);
      this.showNotification('Fel vid import', 'error');
    }
  }
  
  // Additional utility methods...
}

// Initialize the application
window.app = new PekkasPokalkApp();