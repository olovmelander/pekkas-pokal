/**
 * Quick Start Script for Pekkas Pokal
 * Automatically sets up the application and imports CSV data
 */

class QuickStart {
  constructor() {
    this.steps = [
      { name: 'Kontrollera filer', action: this.checkFiles },
      { name: 'Ladda CSV-script', action: this.loadCSVScript },
      { name: 'Analysera CSV-data', action: this.analyzeCSV },
      { name: 'Importera data', action: this.importData },
      { name: 'Verifiera installation', action: this.verifyInstallation }
    ];
    this.currentStep = 0;
    this.csvData = null;
  }

  /**
   * Start the quick setup process
   */
  async start() {
    console.log('🚀 Startar Pekkas Pokal Quick Start...');
    
    // Create progress UI
    this.createProgressUI();
    
    try {
      for (let i = 0; i < this.steps.length; i++) {
        this.currentStep = i;
        this.updateProgress();
        
        await this.steps[i].action.call(this);
        await this.wait(500); // Brief pause between steps
      }
      
      this.showSuccess();
      
    } catch (error) {
      this.showError(error);
    }
  }

  /**
   * Check if required files exist
   */
  async checkFiles() {
    this.log('Kontrollerar nödvändiga filer...');
    
    const requiredFiles = [
      'manifest.json',
      'sw.js',
      'csv-import.js',
      'Pekkas Pokal Marathontabell  Marathontabell 2.csv'
    ];
    
    const missing = [];
    
    for (const file of requiredFiles) {
      try {
        if (file.endsWith('.csv')) {
          await window.fs.readFile(file, { encoding: 'utf8' });
        } else {
          const response = await fetch(file);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        this.log(`✅ ${file} hittad`);
      } catch (error) {
        missing.push(file);
        this.log(`❌ ${file} saknas`);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Saknade filer: ${missing.join(', ')}`);
    }
    
    this.log('Alla nödvändiga filer hittade!');
  }

  /**
   * Load CSV import script
   */
  async loadCSVScript() {
    this.log('Laddar CSV-import script...');
    
    if (typeof window.importCSVData === 'function') {
      this.log('CSV-script redan laddat');
      return;
    }
    
    // Load Papa Parse if not available
    if (typeof Papa === 'undefined') {
      this.log('Laddar Papa Parse...');
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.4.1/papaparse.min.js');
    }
    
    // Load CSV import script
    this.log('Laddar CSV-import funktioner...');
    await this.loadScript('csv-import.js');
    
    if (typeof window.importCSVData !== 'function') {
      throw new Error('CSV-import script laddades inte korrekt');
    }
    
    this.log('CSV-script laddat framgångsrikt!');
  }

  /**
   * Analyze CSV data
   */
  async analyzeCSV() {
    this.log('Analyserar CSV-data...');
    
    try {
      this.csvData = await window.importCSVData();
      
      const { participants, competitions, metadata } = this.csvData;
      
      this.log(`✅ CSV analyserad:`);
      this.log(`   - ${participants.length} deltagare`);
      this.log(`   - ${competitions.length} tävlingar`);
      this.log(`   - År ${metadata.yearRange.start}-${metadata.yearRange.end}`);
      
      // Show some winners
      const recentWinners = competitions
        .filter(c => c.winner)
        .slice(-3)
        .map(c => `${c.year}: ${c.winner} (${c.name})`)
        .join('\n   ');
      
      this.log(`Senaste vinnare:\n   ${recentWinners}`);
      
    } catch (error) {
      throw new Error(`CSV-analys misslyckades: ${error.message}`);
    }
  }

  /**
   * Import data into application
   */
  async importData() {
    this.log('Importerar data till applikationen...');
    
    if (!this.csvData) {
      throw new Error('Ingen CSV-data att importera');
    }
    
    // Wait for data manager to be ready
    let retries = 0;
    while (!window.dataManager && retries < 10) {
      this.log('Väntar på data manager...');
      await this.wait(1000);
      retries++;
    }
    
    if (!window.dataManager) {
      throw new Error('Data manager inte tillgänglig');
    }
    
    try {
      await window.dataManager.importData(this.csvData);
      this.log('✅ Data importerad framgångsrikt!');
      
      // Reload app if available
      if (window.app) {
        this.log('Laddar om applikationen...');
        await window.app.loadInitialData();
      }
      
    } catch (error) {
      throw new Error(`Import misslyckades: ${error.message}`);
    }
  }

  /**
   * Verify installation
   */
  async verifyInstallation() {
    this.log('Verifierar installation...');
    
    // Check data
    const competitions = await window.dataManager.getCompetitions();
    const participants = await window.dataManager.getParticipants();
    
    if (competitions.length === 0 || participants.length === 0) {
      throw new Error('Data verifiering misslyckades - ingen data hittad');
    }
    
    this.log(`✅ Verifiering lyckad:`);
    this.log(`   - ${competitions.length} tävlingar laddade`);
    this.log(`   - ${participants.length} deltagare laddade`);
    
    // Check service worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('sw.js');
        this.log('✅ Service Worker registrerad');
      } catch (error) {
        this.log('⚠️ Service Worker registrering misslyckades');
      }
    }
    
    this.log('Installation verifierad!');
  }

  /**
   * Helper: Load external script
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Kunde inte ladda ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Helper: Wait for specified time
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create progress UI
   */
  createProgressUI() {
    const existingUI = document.getElementById('quickstart-ui');
    if (existingUI) existingUI.remove();
    
    const ui = document.createElement('div');
    ui.id = 'quickstart-ui';
    ui.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 2px solid #667eea;
        border-radius: 1rem;
        padding: 1.5rem;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        z-index: 10000;
        min-width: 300px;
        font-family: 'Inter', sans-serif;
      ">
        <div style="display: flex; align-items: center; margin-bottom: 1rem;">
          <span style="font-size: 1.5rem; margin-right: 0.5rem;">🚀</span>
          <h3 style="margin: 0; color: #667eea;">Quick Start</h3>
        </div>
        
        <div id="quickstart-progress" style="margin-bottom: 1rem;">
          <div style="background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;">
            <div id="progress-bar" style="
              background: linear-gradient(90deg, #667eea, #764ba2);
              height: 100%;
              width: 0%;
              transition: width 0.3s ease;
            "></div>
          </div>
          <div id="progress-text" style="margin-top: 0.5rem; font-size: 0.875rem; color: #64748b;">
            Förbereder...
          </div>
        </div>
        
        <div id="quickstart-log" style="
          background: #1e293b;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 0.5rem;
          max-height: 200px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 0.75rem;
          line-height: 1.4;
        "></div>
        
        <div id="quickstart-actions" style="margin-top: 1rem; display: none;">
          <button id="close-quickstart" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 600;
          ">Stäng</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(ui);
    
    // Add close handler
    document.getElementById('close-quickstart')?.addEventListener('click', () => {
      ui.remove();
    });
  }

  /**
   * Update progress UI
   */
  updateProgress() {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar && progressText) {
      const progress = ((this.currentStep + 1) / this.steps.length) * 100;
      progressBar.style.width = progress + '%';
      progressText.textContent = `Steg ${this.currentStep + 1}/${this.steps.length}: ${this.steps[this.currentStep].name}`;
    }
  }

  /**
   * Log message to UI
   */
  log(message) {
    console.log(message);
    
    const logEl = document.getElementById('quickstart-log');
    if (logEl) {
      const timestamp = new Date().toLocaleTimeString('sv-SE');
      logEl.innerHTML += `<div>[${timestamp}] ${message}</div>`;
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  /**
   * Show success message
   */
  showSuccess() {
    const progressText = document.getElementById('progress-text');
    const actionsEl = document.getElementById('quickstart-actions');
    
    if (progressText) {
      progressText.innerHTML = '✅ <strong style="color: #059669;">Setup slutförd!</strong>';
    }
    
    if (actionsEl) {
      actionsEl.style.display = 'block';
    }
    
    this.log('🎉 Pekkas Pokal är redo att användas!');
    this.log('Du kan nu:');
    this.log('- Visa statistik i Statistics-fliken');
    this.log('- Hantera deltagare i Participants-fliken');
    this.log('- Lägga till nya tävlingar i Results-fliken');
    
    // Show notification if app is available
    if (window.app) {
      window.app.showNotification(
        'Quick Start slutförd! Applikationen är redo att användas.',
        'success',
        8000
      );
    }
  }

  /**
   * Show error message
   */
  showError(error) {
    const progressText = document.getElementById('progress-text');
    const actionsEl = document.getElementById('quickstart-actions');
    
    if (progressText) {
      progressText.innerHTML = '❌ <strong style="color: #dc2626;">Setup misslyckades</strong>';
    }
    
    if (actionsEl) {
      actionsEl.style.display = 'block';
    }
    
    this.log(`❌ Fel: ${error.message}`);
    this.log('Kontrollera att alla filer finns och försök igen.');
    
    // Show notification if app is available
    if (window.app) {
      window.app.showNotification(
        'Quick Start misslyckades: ' + error.message,
        'error',
        10000
      );
    }
  }
}

// Make QuickStart available globally
window.QuickStart = QuickStart;

// Auto-start if called directly
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('QuickStart script loaded. Run new QuickStart().start() to begin setup.');
  });
} else {
  console.log('QuickStart script loaded. Run new QuickStart().start() to begin setup.');
}

// Add quick start button to existing UI if possible
function addQuickStartButton() {
  // Try to add to settings if available
  const settingsActions = document.querySelector('#settings-tab .data-actions');
  if (settingsActions && !document.getElementById('quick-start-btn')) {
    const button = document.createElement('button');
    button.id = 'quick-start-btn';
    button.className = 'btn primary';
    button.innerHTML = '<span>🚀</span> Quick Start';
    button.addEventListener('click', () => {
      new QuickStart().start();
    });
    settingsActions.appendChild(button);
  }
}

// Try to add button when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addQuickStartButton);
} else {
  addQuickStartButton();
}

// Also try to add button after a delay (in case app loads later)
setTimeout(addQuickStartButton, 2000);