/**
 * Chart Manager - Handles all Chart.js visualizations
 */

class ChartManager {
  constructor() {
    this.charts = new Map();
    this.defaultOptions = this.getDefaultOptions();
    this.colorPalette = this.getColorPalette();
    this.themeConfig = this.getThemeConfig();
    this.initialized = false;
    
    this.init();
  }

  /**
   * Initialize Chart.js with global defaults
   */
  init() {
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return;
    }

    // Set global Chart.js defaults
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#a8b2d1';
    Chart.defaults.backgroundColor = 'rgba(102, 126, 234, 0.1)';
    Chart.defaults.borderColor = '#667eea';

    // NOTE: Using the UMD/auto build — components are already registered.
    // Removing the faulty "Chart.register(...Chart.controllers, ...)" call
    // which attempted to spread non-iterable objects and caused a runtime error.

    // Listen for theme changes
    window.addEventListener('themechange', (e) => this._applyTheme(e.detail.theme));

    // Apply initial theme
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    this._applyTheme(initialTheme);
    
    this.initialized = true;
    console.log('📊 Chart Manager initialized');
  }

  /**
   * Get default chart options
   */
  getDefaultOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          labels: {
            color: '#a8b2d1',
            usePointStyle: true,
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 26, 46, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#a8b2d1',
          borderColor: '#667eea',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#a8b2d1'
          },
          grid: {
            color: 'rgba(102, 126, 234, 0.1)'
          }
        },
        y: {
          ticks: {
            color: '#a8b2d1'
          },
          grid: {
            color: 'rgba(102, 126, 234, 0.1)'
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart'
      }
    };
  }

  /**
   * Get color palette for charts
   */
  getColorPalette() {
    return {
      primary: '#667eea',
      secondary: '#764ba2',
      success: '#4ade80',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#3b82f6',
      gold: '#FFD700',
      silver: '#C0C0C0',
      bronze: '#CD7F32',
      gradients: {
        epic: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        fire: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
        ice: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        nature: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
      },
      participants: [
        '#667eea', '#f093fb', '#4facfe', '#43e97b', '#feca57', 
        '#ff6b6b', '#a8edea', '#fed6e3', '#d299c2', '#ffecd2'
      ]
    };
  }

  /**
   * Create performance trend chart
   */
  createPerformanceTrendChart(data) {
    const ctx = document.getElementById('performance-trend-chart');
    if (!ctx) {
      console.warn('Performance trend chart canvas not found');
      return;
    }

    this.destroyChart('performance-trend-chart');

    const years = data.competitions.map(c => c.year).sort((a, b) => a - b);
    const topPerformers = this.getTopPerformers(data, 3);
    
    const datasets = topPerformers.map((performer, index) => ({
      label: performer.name,
      data: years.map(year => {
        const comp = data.competitions.find(c => c.year === year);
        return comp?.scores[performer.id] || null;
      }),
      borderColor: this.colorPalette.participants[index],
      backgroundColor: this.colorPalette.participants[index] + '20',
      tension: 0.4,
      pointRadius: 6,
      pointHoverRadius: 8,
      pointBackgroundColor: this.colorPalette.participants[index],
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      fill: false
    }));

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          reverse: true,
          min: 1,
          max: Math.max(...data.competitions.map(c => Object.keys(c.scores).length)) + 1,
          title: {
            display: true,
            text: 'Placering',
            color: '#a8b2d1'
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      },
      plugins: {
        ...this.defaultOptions.plugins,
        tooltip: {
          ...this.defaultOptions.plugins.tooltip,
          callbacks: {
            title: (tooltipItems) => `År ${tooltipItems[0].label}`,
            label: (context) => {
              const competition = data.competitions.find(c => c.year == context.label);
              return `${context.dataset.label}: ${context.parsed.y}:a plats${competition ? ` (${competition.name})` : ''}`;
            }
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: datasets
      },
      options: options
    });

    this.charts.set('performance-trend-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create wins distribution chart
   */
  createWinsChart(data) {
    const ctx = document.getElementById('wins-chart');
    if (!ctx) {
      console.warn('Wins chart canvas not found');
      return;
    }

    this.destroyChart('wins-chart');

    const winCounts = {};
    data.competitions.forEach(comp => {
      if (comp.winner) {
        winCounts[comp.winner] = (winCounts[comp.winner] || 0) + 1;
      }
    });

    const topWinners = Object.entries(winCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const options = {
      ...this.defaultOptions,
      plugins: {
        ...this.defaultOptions.plugins,
        legend: { display: false }
      },
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          beginAtZero: true,
          title: { display: true, text: 'Antal Vinster', color: '#a8b2d1' }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: { display: true, text: 'Deltagare', color: '#a8b2d1' }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topWinners.map(([name]) => name),
        datasets: [
          {
            label: 'Vinster',
            data: topWinners.map(([, wins]) => wins),
            backgroundColor: this.colorPalette.primary,
            borderColor: this.colorPalette.primary,
            borderWidth: 1
          }
        ]
      },
      options: options
    });

    this.charts.set('wins-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create medal distribution chart
   */
  createMedalChart(medalCounts) {
    const ctx = document.getElementById('medal-distribution-chart');
    if (!ctx) {
      console.warn('Medal distribution chart canvas not found');
      return;
    }

    this.destroyChart('medal-distribution-chart');

    const topMedalists = Object.entries(medalCounts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);

    const options = {
      ...this.defaultOptions,
      plugins: {
        ...this.defaultOptions.plugins,
        legend: {
          ...this.defaultOptions.plugins.legend,
          position: 'top'
        },
        tooltip: {
          ...this.defaultOptions.plugins.tooltip,
          callbacks: {
            label: (context) => {
              const medal = context.dataset.label;
              const count = context.parsed.y;
              return `${medal}: ${count} st`;
            },
            footer: (tooltipItems) => {
              const name = tooltipItems[0].label;
              const total = medalCounts[name].total;
              return `Totalt: ${total} medaljer`;
            }
          }
        }
      },
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          stacked: true,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Antal medaljer',
            color: '#a8b2d1'
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          stacked: true,
          title: {
            display: true,
            text: 'Deltagare',
            color: '#a8b2d1'
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topMedalists.map(([name]) => name),
        datasets: [
          {
            label: 'Guld',
            data: topMedalists.map(([, m]) => m.gold),
            backgroundColor: this.colorPalette.gold,
            borderColor: this.colorPalette.gold,
            borderWidth: 1
          },
          {
            label: 'Silver',
            data: topMedalists.map(([, m]) => m.silver),
            backgroundColor: this.colorPalette.silver,
            borderColor: this.colorPalette.silver,
            borderWidth: 1
          },
          {
            label: 'Brons',
            data: topMedalists.map(([, m]) => m.bronze),
            backgroundColor: this.colorPalette.bronze,
            borderColor: this.colorPalette.bronze,
            borderWidth: 1
          }
        ]
      },
      options: options
    });

    this.charts.set('medal-distribution-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create average position chart
   */
  createAveragePositionChart(filteredData) {
    const ctx = document.getElementById('avg-position-chart');
    if (!ctx) {
      console.warn('Average position chart canvas not found');
      return;
    }

    this.destroyChart('avg-position-chart');

    // Get competitor filter to determine chart type
    const selected = Array.from(document.getElementById('competitor-filter')?.selectedOptions || []).map(o => o.value);
    const competitorFilter = selected.length === 1 ? selected[0] : 'all';

    if (competitorFilter === 'all') {
      this.createOverallAverageChart(ctx, filteredData);
    } else {
      this.createIndividualPositionChart(ctx, filteredData, competitorFilter);
    }
  }

  /**
   * Create overall average position chart
   */
  createOverallAverageChart(ctx, filteredData) {
    const yearStats = {};
    
    filteredData.forEach(comp => {
      if (!yearStats[comp.year]) {
        yearStats[comp.year] = { sum: 0, count: 0 };
      }
      Object.values(comp.scores).forEach(pos => {
        yearStats[comp.year].sum += pos;
        yearStats[comp.year].count++;
      });
    });
    
    const years = Object.keys(yearStats).sort();
    const avgPositions = years.map(year => 
      yearStats[year].count > 0 ? yearStats[year].sum / yearStats[year].count : null
    );

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          reverse: true,
          title: {
            display: true,
            text: 'Genomsnittlig placering',
            color: '#a8b2d1'
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'Genomsnittlig Placering',
          data: avgPositions,
          borderColor: this.colorPalette.primary,
          backgroundColor: this.colorPalette.primary + '20',
          tension: 0.4,
          pointRadius: 6,
          pointHoverRadius: 8,
          fill: true
        }]
      },
      options: options
    });

    this.charts.set('avg-position-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create individual position chart
   */
  createIndividualPositionChart(ctx, filteredData, competitorId) {
    // Find competitor
    const competitor = window.PekkasPokalApp?.getState()?.competitionData?.participants?.find(p => p.id === competitorId);
    const competitorName = competitor ? competitor.name : 'Okänd';
    
    const data = [];

    filteredData.forEach(comp => {
      if (comp.scores[competitorId]) {
        data.push({ year: comp.year, position: comp.scores[competitorId] });
      }
    });

    // Sort chronologically so earliest year appears first on x-axis
    data.sort((a, b) => a.year - b.year);

    const years = data.map(d => d.year);
    const positions = data.map(d => d.position);

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          reverse: true,
          beginAtZero: false,
          title: {
            display: true,
            text: 'Placering',
            color: '#a8b2d1'
          },
          ticks: {
            ...this.defaultOptions.scales.y.ticks,
            stepSize: 1
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: `${competitorName}s Placeringar`,
          data: positions,
          borderColor: this.colorPalette.primary,
          backgroundColor: this.colorPalette.primary + '20',
          tension: 0.4,
          pointBackgroundColor: this.colorPalette.primary,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10
        }]
      },
      options: options
    });

    this.charts.set('avg-position-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create participation chart
   */
  createParticipationChart(filteredData) {
    const ctx = document.getElementById('participation-chart');
    if (!ctx) {
      console.warn('Participation chart canvas not found');
      return;
    }

    this.destroyChart('participation-chart');

    const selected = Array.from(document.getElementById('competitor-filter')?.selectedOptions || []).map(o => o.value);
    const competitorFilter = selected.length === 1 ? selected[0] : 'all';

    if (competitorFilter === 'all') {
      this.createOverallParticipationChart(ctx, filteredData);
    } else {
      this.createIndividualParticipationChart(ctx, filteredData, competitorFilter);
    }
  }

  /**
   * Create overall participation chart
   */
  createOverallParticipationChart(ctx, filteredData) {
    const yearParticipation = {};
    filteredData.forEach(comp => {
      yearParticipation[comp.year] = Object.keys(comp.scores).length;
    });
    
    const years = Object.keys(yearParticipation).sort();
    const participation = years.map(year => yearParticipation[year]);

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Antal deltagare',
            color: '#a8b2d1'
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: years,
        datasets: [{
          label: 'Antal Deltagare',
          data: participation,
          backgroundColor: this.colorPalette.primary + '80',
          borderColor: this.colorPalette.primary,
          borderWidth: 2,
          borderRadius: 4
        }]
      },
      options: options
    });

    this.charts.set('participation-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create individual participation chart
   */
  createIndividualParticipationChart(ctx, filteredData, competitorId) {
    const competitor = window.PekkasPokalApp?.getState()?.competitionData?.participants?.find(p => p.id === competitorId);
    const competitorName = competitor ? competitor.name : 'Okänd';
    
    // Get all years and mark participation
    const allYears = [...new Set(window.PekkasPokalApp?.getState()?.competitionData?.competitions?.map(c => c.year) || [])].sort();
    const participationData = [];
    const positionData = [];
    
    allYears.forEach(year => {
      const comp = filteredData.find(c => c.year === year);
      if (comp && comp.scores[competitorId]) {
        participationData.push(1);
        positionData.push(comp.scores[competitorId]);
      } else {
        participationData.push(0);
        positionData.push(null);
      }
    });

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          beginAtZero: true,
          max: 1.2,
          title: {
            display: true,
            text: 'Deltagande',
            color: '#a8b2d1'
          },
          ticks: {
            ...this.defaultOptions.scales.y.ticks,
            callback: function(value) {
              return value === 1 ? 'Deltog' : value === 0 ? 'Deltog inte' : '';
            }
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      },
      plugins: {
        ...this.defaultOptions.plugins,
        tooltip: {
          ...this.defaultOptions.plugins.tooltip,
          callbacks: {
            label: (context) => {
              const year = context.label;
              const participated = context.raw === 1;
              if (participated) {
                const comp = filteredData.find(c => c.year == year);
                const position = comp ? comp.scores[competitorId] : null;
                return `${competitorName}: Deltog (Placering: ${position})`;
              } else {
                return `${competitorName}: Deltog inte`;
              }
            }
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: allYears,
        datasets: [{
          label: `${competitorName} - Deltagande`,
          data: participationData,
          backgroundColor: participationData.map(val => 
            val === 1 ? this.colorPalette.primary + '80' : this.colorPalette.danger + '40'
          ),
          borderColor: participationData.map(val => 
            val === 1 ? this.colorPalette.primary : this.colorPalette.danger
          ),
          borderWidth: 2,
          borderRadius: 4
        }]
      },
      options: options
    });

    this.charts.set('participation-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create placement trend chart for multiple competitors
   */
  createPlacementTrendChart(filteredData) {
    const ctx = document.getElementById('placement-trend-chart');
    if (!ctx) {
      console.warn('Placement trend chart canvas not found');
      return;
    }

    this.destroyChart('placement-trend-chart');

    // Determine which participants have data in the filtered competitions
    const participantsInData = new Set();
    filteredData.forEach(comp => {
      Object.keys(comp.scores || {}).forEach(id => participantsInData.add(id));
    });

    // Determine competitors to show
    let selected = Array.from(
      document.getElementById('competitor-filter')?.selectedOptions || []
    ).map(o => o.value);

    if (selected.length === 0 || selected.includes('all')) {
      selected = [...participantsInData];
    } else {
      selected = selected.filter(id => participantsInData.has(id));
    }

    const allYears = [...new Set(filteredData.map(c => c.year))].sort();

    const datasets = selected.map((id, idx) => {
      const participant = window.PekkasPokalApp?.getState()?.competitionData?.participants?.find(p => p.id === id);
      const name = participant ? participant.name : id;
      const color = this.colorPalette.participants[idx % this.colorPalette.participants.length];
      const data = allYears.map(year => {
        const comp = filteredData.find(c => c.year === year);
        return comp && comp.scores[id] ? comp.scores[id] : null;
      });
      return {
        label: name,
        data,
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.4,
        spanGaps: true,
        pointRadius: 6,
        pointHoverRadius: 8
      };
    });

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          reverse: true,
          title: {
            display: true,
            text: 'Placering',
            color: '#a8b2d1'
          },
          ticks: {
            ...this.defaultOptions.scales.y.ticks,
            stepSize: 1
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: allYears,
        datasets
      },
      options
    });

    this.charts.set('placement-trend-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Create dashboard participation overview chart
   */
  createDashboardParticipationChart(data) {
    const ctx = document.getElementById('dashboard-participation-chart');
    if (!ctx) {
      console.warn('Dashboard participation chart canvas not found');
      return;
    }

    this.destroyChart('dashboard-participation-chart');

    const yearParticipation = {};
    data.competitions.forEach(comp => {
      yearParticipation[comp.year] = comp.participantCount;
    });

    const years = Object.keys(yearParticipation).sort();
    const participation = years.map(year => yearParticipation[year]);

    const options = {
      ...this.defaultOptions,
      scales: {
        ...this.defaultOptions.scales,
        y: {
          ...this.defaultOptions.scales.y,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Antal deltagare',
            color: '#a8b2d1'
          }
        },
        x: {
          ...this.defaultOptions.scales.x,
          title: {
            display: true,
            text: 'År',
            color: '#a8b2d1'
          }
        }
      }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: years,
        datasets: [{
          label: 'Antal Deltagare',
          data: participation,
          backgroundColor: this.colorPalette.primary + '80',
          borderColor: this.colorPalette.primary,
          borderWidth: 2,
          borderRadius: 4
        }]
      },
      options: options
    });

    this.charts.set('dashboard-participation-chart', chart);
    if (ctx.parentElement) {
      ctx.parentElement.dataset.chartRendered = 'true';
    }
  }

  /**
   * Update statistics charts
   */
  updateStatisticsCharts(filteredData) {
    this.createAveragePositionChart(filteredData);
    this.createParticipationChart(filteredData);
    this.createPlacementTrendChart(filteredData);
  }

  /**
   * Get top performers
   */
  getTopPerformers(data, count = 3) {
    const medalCounts = {};
    
    data.participants.forEach(p => {
      medalCounts[p.name] = { participant: p, total: 0 };
      data.competitions.forEach(comp => {
        const position = comp.scores[p.id];
        if (position && position <= 3) {
          medalCounts[p.name].total++;
        }
      });
    });
    
    return Object.values(medalCounts)
      .sort((a, b) => b.total - a.total)
      .slice(0, count)
      .map(item => item.participant);
  }

  /**
   * Destroy a specific chart
   */
  destroyChart(chartId) {
    const chart = this.charts.get(chartId);
    if (chart) {
      chart.destroy();
      this.charts.delete(chartId);
    }
  }

  /**
   * Handle window resize
   */
  handleResize() {
    this.charts.forEach((chart, id) => {
      if (chart && typeof chart.resize === 'function') {
        setTimeout(() => chart.resize(), 100);
      }
    });
  }

  /**
   * Clean up all charts
   */
  cleanup() {
    this.charts.forEach((chart, id) => {
      chart.destroy();
    });
    this.charts.clear();
    console.log('📊 All charts cleaned up');
  }

  /**
   * Get chart instance
   */
  getChart(chartId) {
    return this.charts.get(chartId);
  }

  /**
   * Get all chart instances
   */
  getAllCharts() {
    return new Map(this.charts);
  }

  /**
   * Export chart as image
   */
  exportChart(chartId, filename = 'chart.png') {
    const chart = this.charts.get(chartId);
    if (!chart) {
      console.warn(`Chart ${chartId} not found`);
      return;
    }

    const url = chart.toBase64Image();
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
  }

  /**
   * Get theme-specific color configurations
   */
  getThemeConfig() {
    return {
      dark: {
        textColor: '#a8b2d1',
        gridColor: 'rgba(102, 126, 234, 0.1)',
        tooltipBg: 'rgba(26, 26, 46, 0.95)',
        tooltipTitle: '#ffffff',
        tooltipBody: '#a8b2d1',
      },
      light: {
        textColor: '#495057',
        gridColor: 'rgba(0, 0, 0, 0.1)',
        tooltipBg: 'rgba(255, 255, 255, 0.95)',
        tooltipTitle: '#212529',
        tooltipBody: '#495057',
      }
    };
  }

  /**
   * Apply theme colors to charts
   * @private
   */
  _applyTheme(theme = 'dark') {
    const config = this.themeConfig[theme] || this.themeConfig.dark;

    // Update Chart.js global defaults
    Chart.defaults.color = config.textColor;
    
    // Update default options for new charts
    this.defaultOptions.plugins.legend.labels.color = config.textColor;
    this.defaultOptions.plugins.tooltip.backgroundColor = config.tooltipBg;
    this.defaultOptions.plugins.tooltip.titleColor = config.tooltipTitle;
    this.defaultOptions.plugins.tooltip.bodyColor = config.tooltipBody;
    this.defaultOptions.scales.x.ticks.color = config.textColor;
    this.defaultOptions.scales.x.grid.color = config.gridColor;
    this.defaultOptions.scales.y.ticks.color = config.textColor;
    this.defaultOptions.scales.y.grid.color = config.gridColor;

    // Update existing charts
    this.charts.forEach((chart) => {
      if (chart.options.plugins?.legend?.labels) {
        chart.options.plugins.legend.labels.color = config.textColor;
      }
      if (chart.options.plugins?.tooltip) {
        chart.options.plugins.tooltip.backgroundColor = config.tooltipBg;
        chart.options.plugins.tooltip.titleColor = config.tooltipTitle;
        chart.options.plugins.tooltip.bodyColor = config.tooltipBody;
      }
      if (chart.options.scales?.x) {
        chart.options.scales.x.ticks.color = config.textColor;
        chart.options.scales.x.grid.color = config.gridColor;
        if (chart.options.scales.x.title) {
          chart.options.scales.x.title.color = config.textColor;
        }
      }
      if (chart.options.scales?.y) {
        chart.options.scales.y.ticks.color = config.textColor;
        chart.options.scales.y.grid.color = config.gridColor;
        if (chart.options.scales.y.title) {
          chart.options.scales.y.title.color = config.textColor;
        }
      }
      chart.update('none'); // Update without animation
    });
  }

  /**
   * Get chart statistics
   */
  getStats() {
    return {
      totalCharts: this.charts.size,
      chartIds: Array.from(this.charts.keys()),
      initialized: this.initialized
    };
  }
}

// Export for global access
window.ChartManager = ChartManager;
