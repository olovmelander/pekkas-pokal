/**
 * UI Components - Handles all UI rendering and DOM manipulation
 */

class UIComponents {
  constructor() {
    this.animationQueue = [];
    this.isAnimating = false;
    this.templates = this.getTemplates();
  }

  /**
   * Get HTML templates for components
   */
  getTemplates() {
    return {
      statCard: (icon, value, label, trend) => `
        <div class="stat-card animate-fade-in">
          <div class="stat-icon">${icon}</div>
          <div class="stat-value counter">${value}</div>
          <div class="stat-label">${label}</div>
          <div class="stat-change">
            <span>📈</span> <span>${trend}</span>
          </div>
        </div>
      `,

      medalRow: (position, name, medals, posClass) => `
        <div class="medal-row animate-slide-in-left" style="animation-delay: ${position * 0.1}s">
          <div class="medal-position ${posClass}">${position}</div>
          <div class="medal-name">${name}</div>
          <div class="medal-counts">
            <div class="medal-count gold">🥇 ${medals.gold}</div>
            <div class="medal-count silver">🥈 ${medals.silver}</div>
            <div class="medal-count bronze">🥉 ${medals.bronze}</div>
          </div>
          <div class="medal-total">${medals.total}</div>
        </div>
      `,

      participantCard: (participant, achievements, progress) => `
        <div class="participant-card animate-scale-in">
          <div class="participant-header">
            <div class="participant-name">${participant.name}</div>
            <div class="achievement-count">${achievements.length} 🏆</div>
          </div>
          <div class="participant-achievements-list">
            ${achievements
              .map((achId) => {
                const ach = window.AchievementHelpers.getById(achId);
                return ach
                  ? `
                <div class="mini-achievement" data-achievement="${achId}">
                  ${ach.icon}
                  <div class="tooltip">${ach.name}</div>
                </div>
              `
                  : "";
              })
              .join("")}
            ${achievements.length === 0 ? '<div class="no-achievements">Inga achievements än...</div>' : ""}
          </div>
          <div class="achievement-progress">
            <div class="progress-text">Framsteg: ${progress}% (${achievements.length}/${window.ACHIEVEMENT_DEFINITIONS.length})</div>
            <div class="progress-bar">
              <div class="progress-fill animate-progress" style="width: ${progress}%"></div>
            </div>
          </div>
        </div>
      `,

      achievement: (ach, isUnlocked, holders) => `
        <div class="achievement ${isUnlocked ? "unlocked" : "locked"} ${ach.rarity === "legendary" ? "legendary" : ""} ${ach.rarity === "mythic" ? "mythic" : ""} animate-scale-in"
             data-achievement="${ach.id}">
          ${ach.rarity !== "common" ? `<div class="rarity-badge rarity-${ach.rarity}">${ach.rarity}</div>` : ""}
          <div class="achievement-icon">${ach.icon}</div>
          <div class="achievement-name">${ach.name}</div>
          <div class="achievement-desc">${ach.desc}</div>
          ${
            holders.length > 0
              ? `
            <div class="achievement-holders">
              ${holders.length === 1 ? holders[0] : holders.length + " deltagare"}
            </div>
          `
              : ""
          }
        </div>
      `,

      competitorCard: (competitor, stats) => `
        <div class="competitor-card animate-fade-in">
          <div class="competitor-header">
            <div class="competitor-avatar">${stats.initials}</div>
            <div class="competitor-info">
              <h4>${competitor.name}</h4>
            </div>
          </div>
          <div class="competitor-medals">
            <div class="medal-badge">🥇 ${stats.gold}</div>
            <div class="medal-badge">🥈 ${stats.silver}</div>
            <div class="medal-badge">🥉 ${stats.bronze}</div>
          </div>
          <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
            Snitt: ${stats.avgPosition.toFixed(1)} | Tävlingar: ${stats.competitions}
          </div>
        </div>
      `,

      funStatItem: (stat) => `
        <div class="fun-stat-item animate-slide-in-left">
          <div class="fun-stat-emoji">${stat.emoji}</div>
          <div class="fun-stat-content">
            <div class="fun-stat-title">${stat.title}</div>
            <div class="fun-stat-desc">${stat.desc}</div>
          </div>
        </div>
      `,
    };
  }

  /**
   * Render medal tally table
   */
  renderMedalTally(medalCounts) {
    const tallyList = document.getElementById("medal-tally-list");
    if (!tallyList) return;

    // Clear existing content
    tallyList.innerHTML = "";

    const sortedTally = Object.entries(medalCounts).sort((a, b) => {
      // Sort by gold, then silver, then bronze, then total
      if (b[1].gold !== a[1].gold) return b[1].gold - a[1].gold;
      if (b[1].silver !== a[1].silver) return b[1].silver - a[1].silver;
      if (b[1].bronze !== a[1].bronze) return b[1].bronze - a[1].bronze;
      return b[1].total - a[1].total;
    });

    sortedTally.forEach(([name, medals], index) => {
      const posClass =
        index === 0
          ? "first"
          : index === 1
            ? "second"
            : index === 2
              ? "third"
              : "";
      const row = this.templates.medalRow(index + 1, name, medals, posClass);
      tallyList.appendChild(this.createElementFromHTML(row));
    });

    // Trigger stagger animation
    this.triggerStaggerAnimation(".medal-row");
  }

  /**
   * Update achievement statistics
   */
  updateAchievementStats(participantAchievements) {
    const allUnlockedAchievements = new Set();
    Object.values(participantAchievements).forEach((achievements) => {
      achievements.forEach((achId) => allUnlockedAchievements.add(achId));
    });

    const totalUnlocked = allUnlockedAchievements.size;
    const totalAchievements = window.ACHIEVEMENT_DEFINITIONS.length;
    const completionRate = Math.round(
      (totalUnlocked / totalAchievements) * 100,
    );

    this.animateCountUp("total-unlocked", totalUnlocked);
    this.animateCountUp("total-achievements", totalAchievements);
    this.animateCountUp("completion-rate", completionRate, "%");
  }

  /**
   * Render participant achievement cards
   */
  renderParticipantCards(participantAchievements) {
    const container = document.getElementById("participant-cards");
    if (!container) return;

    container.innerHTML = "";

    Object.entries(participantAchievements).forEach(
      ([name, achievements], index) => {
        const progress = Math.round(
          (achievements.length / window.ACHIEVEMENT_DEFINITIONS.length) * 100,
        );

        const participant = { name }; // Simplified participant object
        const cardHTML = this.templates.participantCard(
          participant,
          achievements,
          progress,
        );
        const cardElement = this.createElementFromHTML(cardHTML);

        // Add stagger delay
        cardElement.style.animationDelay = `${index * 0.1}s`;

        container.appendChild(cardElement);
      },
    );

    // Add event listeners for achievement tooltips
    this.setupAchievementTooltips();
  }

  /**
   * Render achievements grid
   */
  renderAchievementsGrid(category = "all") {
    const container = document.getElementById("achievements-grid");
    if (!container) return;

    container.innerHTML = "";

    const filteredAchievements =
      category === "all"
        ? window.ACHIEVEMENT_DEFINITIONS
        : window.ACHIEVEMENT_DEFINITIONS.filter((a) => a.category === category);

    // Get current achievement data
    const participantAchievements =
      window.PekkasPokalApp?.getFilteredParticipantAchievements?.() || {};

    filteredAchievements.forEach((ach, index) => {
      // Find holders of this achievement
      const holders = Object.entries(participantAchievements)
        .filter(([name, achs]) => achs.includes(ach.id))
        .map(([name]) => name);

      const isUnlocked = holders.length > 0;
      const achHTML = this.templates.achievement(ach, isUnlocked, holders);
      const achElement = this.createElementFromHTML(achHTML);

      // Add stagger delay
      achElement.style.animationDelay = `${index * 0.05}s`;

      container.appendChild(achElement);
    });

    // Setup achievement interactions
    this.setupAchievementInteractions();
  }

  /**
   * Update statistics view
   */
  updateStatisticsView(filteredData) {
    const grid = document.getElementById("competitor-stats-grid");
    if (!grid) return;

    grid.innerHTML = "";

    const stats = this.calculateCompetitorStats(filteredData);

    stats.forEach((stat, index) => {
      const competitor = { name: stat.name };
      const cardHTML = this.templates.competitorCard(competitor, stat);
      const cardElement = this.createElementFromHTML(cardHTML);

      // Add stagger delay
      cardElement.style.animationDelay = `${index * 0.1}s`;

      grid.appendChild(cardElement);
    });

    this.renderPlacementHeatmap(filteredData);
  }

  /**
   * Render placement heatmap table
   */
  renderPlacementHeatmap(filteredData) {
    const container = document.getElementById("placement-heatmap");
    if (!container) return;

    container.innerHTML = "";

    const state = window.PekkasPokalApp?.getState();
    const participants = state?.competitionData?.participants || [];
    const competitions = filteredData || [];

    const years = [...new Set(competitions.map((c) => c.year))].sort();

    let maxPosition = 0;
    competitions.forEach((c) => {
      Object.values(c.scores || {}).forEach((pos) => {
        const num = Number(pos);
        if (num > maxPosition) maxPosition = num;
      });
    });

    const table = document.createElement("table");
    table.className = "heatmap-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const emptyHead = document.createElement("th");
    headerRow.appendChild(emptyHead);
    years.forEach((year) => {
      const th = document.createElement("th");
      th.textContent = year;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    participants.forEach((p) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("th");
      nameCell.textContent = p.name;
      row.appendChild(nameCell);

      years.forEach((year) => {
        const comp = competitions.find((c) => c.year === year);
        const position = comp?.scores?.[p.id];
        const cell = document.createElement("td");
        cell.classList.add("heatmap-cell");

        if (position) {
          cell.textContent = position;
          cell.dataset.position = position;
          if (Number(position) > 3) {
            cell.style.background = this.getHeatmapColor(
              Number(position),
              maxPosition,
            );
          }
        } else {
          cell.textContent = "-";
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  /**
   * Get heatmap color for position
   */
  getHeatmapColor(position, maxPosition) {
    if (!maxPosition || position < 1) return "";
    const ratio = (position - 1) / (maxPosition - 1 || 1);
    const hue = 120 - ratio * 120;
    return `hsl(${hue}, 70%, 40%)`;
  }

  /**
   * Render fun statistics
   */
  renderFunStats(funStats) {
    const container = document.getElementById("fun-stats-list");
    if (!container) return;

    container.innerHTML = "";

    funStats.forEach((stat, index) => {
      const statHTML = this.templates.funStatItem(stat);
      const statElement = this.createElementFromHTML(statHTML);

      // Add stagger delay
      statElement.style.animationDelay = `${index * 0.1}s`;

      container.appendChild(statElement);
    });
  }

  /**
   * Calculate competitor statistics for UI display
   */
  calculateCompetitorStats(filteredData) {
    const competitionData = window.PekkasPokalApp?.getState()?.competitionData;
    if (!competitionData) return [];

    const stats = [];

    competitionData.participants.forEach((p) => {
      let gold = 0,
        silver = 0,
        bronze = 0,
        total = 0,
        sum = 0;

      filteredData.forEach((comp) => {
        const position = comp.scores[p.id];
        if (position) {
          total++;
          sum += position;
          if (position === 1) gold++;
          else if (position === 2) silver++;
          else if (position === 3) bronze++;
        }
      });

      if (total > 0) {
        stats.push({
          name: p.name,
          initials: p.name
            .split(" ")
            .map((n) => n[0])
            .join(""),
          gold,
          silver,
          bronze,
          competitions: total,
          avgPosition: sum / total,
        });
      }
    });

    return stats.sort((a, b) => {
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      if (b.bronze !== a.bronze) return b.bronze - a.bronze;
      return a.avgPosition - b.avgPosition;
    });
  }

  /**
   * Setup achievement tooltip interactions
   */
  setupAchievementTooltips() {
    document.querySelectorAll(".mini-achievement").forEach((element) => {
      element.addEventListener("mouseenter", (e) => {
        const tooltip = e.target.querySelector(".tooltip");
        if (tooltip) {
          tooltip.style.opacity = "1";
        }
      });

      element.addEventListener("mouseleave", (e) => {
        const tooltip = e.target.querySelector(".tooltip");
        if (tooltip) {
          tooltip.style.opacity = "0";
        }
      });
    });
  }

  /**
   * Setup achievement grid interactions
   */
  setupAchievementInteractions() {
    document.querySelectorAll(".achievement").forEach((element) => {
      element.addEventListener("click", (e) => {
        const achievementId = element.dataset.achievement;
        this.showAchievementDetails(achievementId);
      });

      element.addEventListener("mouseenter", (e) => {
        if (!element.classList.contains("locked")) {
          element.style.transform = "scale(1.05)";
        }
      });

      element.addEventListener("mouseleave", (e) => {
        element.style.transform = "scale(1)";
      });
    });
  }

  /**
   * Show achievement details modal/popup
   */
  showAchievementDetails(achievementId) {
    const achievement = window.AchievementHelpers.getById(achievementId);
    if (!achievement) return;

    // For now, just log to console - could implement modal later
    console.log("Achievement Details:", achievement);

    // Could show a toast notification
    this.showToast(`🏆 ${achievement.name}: ${achievement.desc}`, "info");
  }

  /**
   * Animate count up effect
   */
  animateCountUp(elementId, targetValue, suffix = "") {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = 0;
    const duration = 1000;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(
        startValue + (targetValue - startValue) * easeOut,
      );

      element.textContent = currentValue + suffix;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Trigger stagger animation for elements
   */
  triggerStaggerAnimation(selector, delay = 100) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element, index) => {
      element.style.animationDelay = `${index * delay}ms`;
      element.classList.add("animate-fade-in");
    });
  }

  /**
   * Create element from HTML string
   */
  createElementFromHTML(htmlString) {
    const div = document.createElement("div");
    div.innerHTML = htmlString.trim();
    return div.firstChild;
  }

  /**
   * Show toast notification
   */
  showToast(message, type = "info", duration = 3000) {
    // Create toast element
    const toast = document.createElement("div");
    toast.className = `toast toast-${type} animate-slide-down`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${this.getToastIcon(type)}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    // Add toast styles if not already added
    this.addToastStyles();

    // Add to DOM
    let toastContainer = document.querySelector(".toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.className = "toast-container";
      document.body.appendChild(toastContainer);
    }

    toastContainer.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add("animate-fade-out");
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  /**
   * Get icon for toast type
   */
  getToastIcon(type) {
    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
    };
    return icons[type] || icons.info;
  }

  /**
   * Add toast styles if not already present
   */
  addToastStyles() {
    if (document.querySelector("#toast-styles")) return;

    const styles = document.createElement("style");
    styles.id = "toast-styles";
    styles.textContent = `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .toast {
        background: var(--bg-card);
        border: 1px solid var(--accent);
        border-radius: var(--radius-md);
        padding: var(--spacing-md);
        box-shadow: var(--shadow-lg);
        max-width: 400px;
        min-width: 300px;
      }
      
      .toast-content {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }
      
      .toast-message {
        flex: 1;
        color: var(--text-primary);
        font-size: var(--text-sm);
      }
      
      .toast-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1.2rem;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .toast-close:hover {
        color: var(--text-primary);
      }
      
      .toast-success { border-color: var(--success); }
      .toast-warning { border-color: var(--warning); }
      .toast-error { border-color: var(--danger); }
      
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
      
      .animate-fade-out {
        animation: fadeOut 0.3s ease-out forwards;
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * Show loading state for an element
   */
  showLoading(elementId, message = "Laddar...") {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div style="margin-top: 1rem; color: var(--text-secondary);">${message}</div>
      </div>
    `;
  }

  /**
   * Hide loading state and restore content
   */
  hideLoading(elementId, content = "") {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = content;
  }

  /**
   * Add skeleton loading effect
   */
  addSkeletonLoading(container, count = 3) {
    const skeletons = Array.from(
      { length: count },
      (_, i) => `
      <div class="loading-skeleton animate-fade-in" style="animation-delay: ${i * 0.1}s;">
        <div style="height: 100px; border-radius: var(--radius-md);"></div>
      </div>
    `,
    ).join("");

    container.innerHTML = `<div class="skeleton-container">${skeletons}</div>`;
  }

  /**
   * Smooth scroll to element
   */
  scrollToElement(elementId, offset = 0) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const targetPosition = element.offsetTop - offset;
    window.scrollTo({
      top: targetPosition,
      behavior: "smooth",
    });
  }

  /**
   * Update progress bar
   */
  updateProgressBar(elementId, progress, animated = true) {
    const progressBar = document.querySelector(`#${elementId} .progress-fill`);
    if (!progressBar) return;

    if (animated) {
      progressBar.style.transition = "width 0.5s ease";
    }

    progressBar.style.width = `${progress}%`;
  }

  /**
   * Highlight element temporarily
   */
  highlightElement(element, duration = 2000) {
    element.classList.add("animate-glow");
    setTimeout(() => {
      element.classList.remove("animate-glow");
    }, duration);
  }

  /**
   * Get UI component statistics
   */
  getStats() {
    return {
      animationQueue: this.animationQueue.length,
      isAnimating: this.isAnimating,
      templatesLoaded: Object.keys(this.templates).length,
    };
  }
}

// Export for global access
window.UIComponents = UIComponents;
