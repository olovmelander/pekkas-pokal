/**
 * Pekkas Pokal - Main Application Controller (FIXED VERSION)
 * Entry point and coordination between modules
 */

class PekkasPokalApp {
  constructor() {
    this.modules = {};
    this.state = {
      initialized: false,
      currentTab: "dashboard",
      competitionData: null,
      filters: {
        competitor: "all",
        timeframe: "all",
        competitionType: "all",
      },
    };

    console.log("🏆 PekkasPokalApp starting...");

    // Initialize immediately
    this.initialize();
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log("🏆 Initializing Pekkas Pokal...");

      // Initialize modules
      await this.initializeModules();
      console.log("✅ Modules initialized");

      // Setup event listeners
      this.setupEventListeners();
      console.log("✅ Event listeners setup");

      // Load data
      await this.loadData();
      console.log("✅ Data loaded");

      // Initial render
      this.render();
      console.log("✅ Initial render complete");

      // Hide loading screen
      const loadingScreen = document.getElementById("loading-screen");
      if (loadingScreen) {
        loadingScreen.style.display = "none";
      }

      this.state.initialized = true;
      console.log("🎉 Pekkas Pokal initialized successfully!");
    } catch (error) {
      console.error("❌ Failed to initialize:", error);
      this.showError(`Fel vid initialisering: ${error.message}`);
    }
  }

  /**
   * Initialize all modules
   */
  async initializeModules() {
    console.log("📦 Initializing modules...");

    // Initialize modules with safe fallbacks
    try {
      // Critical module - DataManager
      if (typeof DataManager !== "undefined") {
        this.modules.dataManager = new DataManager();
        console.log("✅ DataManager initialized");
      } else {
        // Create a minimal DataManager if missing
        console.warn("DataManager missing, creating minimal version");
        this.modules.dataManager = {
          loadCSVData: () => this.getEmbeddedData(),
          processData: (data, headers) => this.getEmbeddedData(),
        };
      }

      // Optional modules - create safely
      if (typeof AchievementEngine !== "undefined") {
        this.modules.achievementEngine = new AchievementEngine();
        console.log("✅ AchievementEngine initialized");
      }

      if (typeof ChartManager !== "undefined" && typeof Chart !== "undefined") {
        this.modules.chartManager = new ChartManager();
        console.log("✅ ChartManager initialized");
      }

      if (typeof UIComponents !== "undefined") {
        this.modules.uiComponents = new UIComponents();
        console.log("✅ UIComponents initialized");
      }

      if (typeof Statistics !== "undefined") {
        this.modules.statistics = new Statistics();
        console.log("✅ Statistics initialized");
      }

      if (typeof FilterManager !== "undefined") {
        this.modules.filterManager = new FilterManager();
        console.log("✅ FilterManager initialized");
      }

      console.log("📦 Module initialization complete");
    } catch (error) {
      console.error("⚠️ Non-critical module initialization failed:", error);
      // Continue anyway - the app can work with reduced functionality
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    console.log("🎛️ Setting up event listeners...");

    // Tab navigation
    this.setupTabNavigation();

    // Filter controls
    this.setupFilterControls();

    // Achievement categories
    this.setupAchievementFilters();

    // Window events
    window.addEventListener("resize", () => this.handleResize());

    console.log("🎛️ Event listeners setup complete");
  }

  /**
   * Setup tab navigation
   */
  setupTabNavigation() {
    const tabs = document.querySelectorAll(".nav-tab");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        const targetTab = tab.dataset.tab;

        if (!targetTab) return;

        // Update active states
        tabs.forEach((t) => t.classList.remove("active"));
        contents.forEach((c) => c.classList.remove("active"));

        tab.classList.add("active");
        const targetContent = document.getElementById(targetTab);

        if (targetContent) {
          targetContent.classList.add("active");
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
    const competitorFilter = document.getElementById("competitor-filter");
    const achievementCompetitorFilter = document.getElementById(
      "achievement-competitor-filter",
    );
    const timeframeFilter = document.getElementById("timeframe-filter");
    const competitionTypeFilter = document.getElementById(
      "competition-type-filter",
    );
    const resetBtn = document.getElementById("reset-filters-btn");

    const updateSelectSize = () => {
      const isDesktop = window.matchMedia("(min-width: 769px)").matches;
      const size = isDesktop
        ? Math.min(8, competitorFilter?.options.length || 8)
        : 1;
      [competitorFilter, achievementCompetitorFilter].forEach((select) => {
        if (select) {
          select.size = size;
        }
      });
    };
    this.updateSelectSize = updateSelectSize;
    updateSelectSize();
    window.addEventListener("resize", updateSelectSize);

    // Filter change handlers
    [
      competitorFilter,
      achievementCompetitorFilter,
      timeframeFilter,
      competitionTypeFilter,
    ].forEach((filter) => {
      if (filter) {
        filter.addEventListener("change", (e) => {
          let filterType;
          if (
            e.target.id === "competitor-filter" ||
            e.target.id === "achievement-competitor-filter"
          ) {
            filterType = "competitor";

            // Get selected values
            let values = Array.from(e.target.selectedOptions).map(
              (opt) => opt.value,
            );
            if (values.length === 0 || values.includes("all")) {
              values = ["all"];
            }

            // Sync both competitor filters
            const syncSelect = (select) => {
              if (!select) return;
              Array.from(select.options).forEach((opt) => {
                opt.selected = values.includes(opt.value);
              });
            };
            syncSelect(competitorFilter);
            syncSelect(achievementCompetitorFilter);

            this.state.filters[filterType] = values.includes("all")
              ? "all"
              : values;
          } else {
            filterType = e.target.id
              .replace("-filter", "")
              .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            this.state.filters[filterType] = e.target.value;
          }

          this.applyFilters();
        });
      }
    });

    // Reset filters
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.resetFilters();
      });
    }
  }

  /**
   * Setup achievement filter buttons
   */
  setupAchievementFilters() {
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("category-filter")) {
        document
          .querySelectorAll(".category-filter")
          .forEach((btn) => btn.classList.remove("active"));
        e.target.classList.add("active");

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
      console.log("📊 Loading competition data...");

      if (this.modules.dataManager && this.modules.dataManager.loadCSVData) {
        // Try to load via DataManager
        this.state.competitionData =
          await this.modules.dataManager.loadCSVData();
      } else {
        // Use embedded data directly
        console.log("Using embedded data directly");
        this.state.competitionData = this.getEmbeddedData();
      }

      if (
        !this.state.competitionData ||
        !this.state.competitionData.competitions
      ) {
        throw new Error("Invalid data structure");
      }

      console.log(
        `📊 Data loaded: ${this.state.competitionData.competitions.length} competitions`,
      );

      // Calculate achievements if engine is available
      if (
        this.modules.achievementEngine &&
        this.modules.achievementEngine.calculateAllAchievements
      ) {
        try {
          this.state.competitionData.participantAchievements =
            this.modules.achievementEngine.calculateAllAchievements(
              this.state.competitionData.competitions,
              this.state.competitionData.participants,
            );
        } catch (e) {
          console.warn("Achievement calculation failed:", e);
          this.state.competitionData.participantAchievements = {};
        }
      } else {
        this.state.competitionData.participantAchievements = {};
      }

      // Populate filter options
      this.populateFilters();
    } catch (error) {
      console.error("❌ Failed to load data:", error);
      // Use embedded data as final fallback
      console.log("Using embedded data as final fallback...");
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

    // Simple parsing without dependencies
    const lines = csvContent.split("\n");
    const headers = lines[0].split(",");
    const participantNames = headers.slice(5);

    const participants = participantNames.map((name, i) => ({
      id: `p${i + 1}`,
      name: name.trim(),
      nickname: name.trim(),
    }));

    const competitions = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      const year = parseInt(values[0]);
      const name = values[1];

      if (!year || !name) continue;

      const scores = {};
      let winner = null;

      for (let j = 0; j < participantNames.length; j++) {
        const score = values[j + 5];
        if (score && score !== "-" && score !== "") {
          const position = parseInt(score);
          if (!isNaN(position)) {
            scores[`p${j + 1}`] = position;
            if (position === 1) {
              winner = participantNames[j].trim();
            }
          }
        }
      }

      competitions.push({
        id: `c${competitions.length + 1}`,
        year: year,
        name: name,
        location: values[2] || "",
        winner: winner,
        scores: scores,
        arranger3rd: values[3] || "",
        arrangerSecondLast: values[4] || "",
        participantCount: Object.keys(scores).length,
      });
    }

    competitions.sort((a, b) => b.year - a.year);

    return {
      participants,
      competitions,
      participantAchievements: {},
      initialized: true,
    };
  }

  /**
   * Populate filter dropdowns
   */
  populateFilters() {
    if (!this.state.competitionData) return;

    // Competitor filters
    const competitorFilter = document.getElementById("competitor-filter");
    const achievementCompetitorFilter = document.getElementById(
      "achievement-competitor-filter",
    );
    [competitorFilter, achievementCompetitorFilter].forEach((filter) => {
      if (filter) {
        filter.innerHTML =
          '<option value="all" selected>Alla Deltagare</option>';
      }
    });
    this.state.competitionData.participants.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      if (competitorFilter)
        competitorFilter.appendChild(option.cloneNode(true));
      if (achievementCompetitorFilter)
        achievementCompetitorFilter.appendChild(option);
    });

    if (this.updateSelectSize) {
      this.updateSelectSize();
    }

    // Competition type filter
    const competitionTypes = [
      ...new Set(this.state.competitionData.competitions.map((c) => c.name)),
    ];
    const typeFilter = document.getElementById("competition-type-filter");
    if (typeFilter) {
      typeFilter.innerHTML = '<option value="all">Alla Tävlingar</option>';
      competitionTypes.forEach((type) => {
        const option = document.createElement("option");
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

    console.log("🎨 Rendering application...");

    // Render dashboard by default
    this.loadTabContent("dashboard");

    // Update year range display
    this.updateYearRange();

    console.log("✅ Application render complete");
  }

  /**
   * Load content for specific tab
   */
  loadTabContent(tabName) {
    console.log(`📄 Loading content for tab: ${tabName}`);

    if (!this.state.competitionData) {
      console.warn("No data available for tab content");
      return;
    }

    try {
      switch (tabName) {
        case "dashboard":
          this.loadDashboard();
          break;
        case "medals":
          this.loadMedalTally();
          break;
        case "achievements":
          this.loadAchievements();
          break;
        case "statistics":
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
    console.log("📊 Loading dashboard...");
    const data = this.state.competitionData;

    // Update stats cards
    this.updateStatsCards(data);

    // Load fun stats
    if (this.modules.statistics && this.modules.uiComponents) {
      const funStats = this.modules.statistics.calculateFunStats(data);
      this.modules.uiComponents.renderFunStats(funStats);
    }

    // Create charts
    if (this.modules.chartManager) {
      this.modules.chartManager.createWinsChart(data);
      this.modules.chartManager.createDashboardParticipationChart(data);
    }

    // Render additional dashboard sections
    this.renderUpcomingEvent(data);
    this.renderAchievementsHighlight(data);
    this.renderRecords(data);
  }

  /**
   * Update dashboard stats cards
   */
  updateStatsCards(data) {
    // Total competitions
    const totalComps = data.competitions.length;
    this.updateElement("total-competitions", totalComps);
    this.updateElement("comp-trend", `${totalComps} totalt`);

    // Total participants
    const totalParticipants = data.participants.length;
    this.updateElement("total-participants", totalParticipants);

    // Calculate winner stats
    if (this.modules.statistics) {
      const winCounts = this.modules.statistics.calculateWinCounts(
        data.competitions,
      );
      const topWinner = Object.entries(winCounts).sort(
        (a, b) => b[1] - a[1],
      )[0];

      if (topWinner) {
        this.updateElement("most-wins", topWinner[0]);
        this.updateElement("wins-count", `${topWinner[1]} vinster`);
      }
    }

    // Latest winner
    const latestComp = data.competitions[0];
    if (latestComp && latestComp.winner) {
      this.updateElement("current-champion", latestComp.winner);
      this.updateElement("champ-comp", `${latestComp.year} ${latestComp.name}`);
    }
  }

  /**
   * Render upcoming event and countdown
   */
  renderUpcomingEvent(data) {
    const nameEl = document.getElementById("next-event-name");
    const countdownEl = document.getElementById("next-event-countdown");
    if (!nameEl || !countdownEl) return;

    const now = new Date();
    const upcoming = data.competitions
      .filter((c) => c.date && c.date > now)
      .sort((a, b) => a.date - b.date)[0];

    if (!upcoming) {
      nameEl.textContent = "Ingen planerad";
      countdownEl.textContent = "";
      return;
    }

    nameEl.textContent = `${upcoming.year} ${upcoming.name}`;

    const updateCountdown = () => {
      const diff = upcoming.date - new Date();
      if (diff <= 0) {
        countdownEl.textContent = "Pågår!";
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      countdownEl.textContent = `${days}d ${hours}h`;
    };

    updateCountdown();
    setInterval(updateCountdown, 60 * 60 * 1000);
  }

  /**
   * Highlight recent achievements
   */
  renderAchievementsHighlight(data) {
    const list = document.getElementById("recent-achievements-list");
    if (!list) return;

    const latestComp = data.competitions[0];
    const achievementsData = data.participantAchievements || {};
    let achievements = [];

    if (latestComp && latestComp.winner) {
      achievements = achievementsData[latestComp.winner] || [];
    }

    list.innerHTML = "";
    achievements.slice(0, 3).forEach((achId) => {
      const def = window.ACHIEVEMENT_DEFINITIONS?.find((a) => a.id === achId);
      if (def) {
        const li = document.createElement("li");
        li.textContent = `${def.icon} ${def.name}`;
        list.appendChild(li);
      }
    });

    if (list.childElementCount === 0) {
      const li = document.createElement("li");
      li.textContent = "Inga nya achievements";
      list.appendChild(li);
    }
  }

  /**
   * Render record book section
   */
  renderRecords(data) {
    const list = document.getElementById("record-list");
    if (!list || !this.modules.statistics) return;

    list.innerHTML = "";

    // Longest winning streak
    const comps = [...data.competitions].sort((a, b) => a.year - b.year);
    let bestStreak = 0;
    let streakHolder = null;
    let currentWinner = null;
    let currentStreak = 0;

    comps.forEach((comp) => {
      if (comp.winner) {
        if (comp.winner === currentWinner) {
          currentStreak++;
        } else {
          currentWinner = comp.winner;
          currentStreak = 1;
        }
        if (currentStreak > bestStreak) {
          bestStreak = currentStreak;
          streakHolder = currentWinner;
        }
      } else {
        currentWinner = null;
        currentStreak = 0;
      }
    });

    if (streakHolder) {
      const li = document.createElement("li");
      li.textContent = `Längsta segersvit: ${streakHolder} (${bestStreak})`;
      list.appendChild(li);
    }

    // Most participants in a year
    const mostPart = comps.reduce(
      (max, comp) =>
        comp.participantCount > (max?.participantCount || 0) ? comp : max,
      null,
    );
    if (mostPart) {
      const li = document.createElement("li");
      li.textContent = `Flest deltagare: ${mostPart.year} (${mostPart.participantCount})`;
      list.appendChild(li);
    }

    // Most wins overall
    const winCounts = this.modules.statistics.calculateWinCounts(
      data.competitions,
    );
    const topWinner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
    if (topWinner) {
      const li = document.createElement("li");
      li.textContent = `Flest vinster: ${topWinner[0]} (${topWinner[1]})`;
      list.appendChild(li);
    }

    if (list.childElementCount === 0) {
      const li = document.createElement("li");
      li.textContent = "Inga rekord";
      list.appendChild(li);
    }
  }

  /**
   * Load medal tally
   */
  loadMedalTally() {
    console.log("🥇 Loading medal tally...");
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
    console.log("🏆 Loading achievements...");
    const participantAchievements = this.getFilteredParticipantAchievements();

    if (this.modules.uiComponents) {
      this.modules.uiComponents.updateAchievementStats(participantAchievements);
      this.modules.uiComponents.renderParticipantCards(participantAchievements);
      this.modules.uiComponents.renderAchievementsGrid("all");
    }
  }

  /**
   * Load statistics
   */
  loadStatistics() {
    console.log("📈 Loading statistics...");

    if (
      this.modules.filterManager &&
      this.modules.uiComponents &&
      this.modules.chartManager
    ) {
      const filteredData = this.modules.filterManager.applyFilters(
        this.state.competitionData,
        this.state.filters,
      );
      // FilterManager returns an object containing competitions, participants and the
      // original data. The statistics components only need the competitions array,
      // so pass that to avoid runtime errors when iterating over the result.
      this.modules.uiComponents.updateStatisticsView(filteredData.competitions);
      this.modules.chartManager.updateStatisticsCharts(
        filteredData.competitions,
      );
    }
  }

  /**
   * Apply current filters
   */
  applyFilters() {
    if (this.state.currentTab === "statistics") {
      this.loadStatistics();
    } else if (this.state.currentTab === "achievements") {
      this.loadAchievements();
    }
  }

  /**
   * Reset all filters
   */
  resetFilters() {
    this.state.filters = {
      competitor: "all",
      timeframe: "all",
      competitionType: "all",
    };

    // Update UI
    this.updateElement("competitor-filter", ["all"], "value");
    this.updateElement("achievement-competitor-filter", ["all"], "value");
    this.updateElement("timeframe-filter", "all", "value");
    this.updateElement("competition-type-filter", "all", "value");

    this.applyFilters();
  }

  /**
   * Update year range display
   */
  updateYearRange() {
    const data = this.state.competitionData;
    if (data && data.competitions.length > 0) {
      const years = data.competitions.map((c) => c.year).filter((y) => y);
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);

      this.updateElement("year-range", `${minYear}-${maxYear}`);
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
    const loadingScreen = document.getElementById("loading-screen");
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
  updateElement(id, content, property = "textContent") {
    const element = document.getElementById(id);
    if (!element) return;

    if (property === "value" && element.multiple) {
      const values = Array.isArray(content) ? content : [content];
      Array.from(element.options).forEach((opt) => {
        opt.selected = values.includes(opt.value);
      });
    } else {
      element[property] = content;
    }
  }

  /**
   * Get participant achievements filtered by current competitor
   */
  getFilteredParticipantAchievements() {
    const data = this.state.competitionData;
    if (!data || !data.participantAchievements) return {};

    const selected = this.state.filters.competitor;
    if (selected === "all") return data.participantAchievements;

    const ids = Array.isArray(selected) ? selected : [selected];
    const result = {};
    ids.forEach((id) => {
      const participant = data.participants.find((p) => p.id === id);
      if (participant) {
        result[participant.name] =
          data.participantAchievements[participant.name] || [];
      }
    });
    return result;
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
