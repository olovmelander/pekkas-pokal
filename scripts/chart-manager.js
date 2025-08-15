/**
 * Chart Manager - Handles all data visualizations and charts
 * Uses Chart.js for creating beautiful, interactive charts
 */

class ChartManager {
  constructor() {
    this.charts = new Map();
    this.defaultColors = [
      '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe',
      '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3', '#d299c2', '#fef9d7',
      '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'
    ];
    
    // Chart.js default configuration
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
  }
  
  /**
   * Initialize all charts for the statistics tab
   */
  async initializeStatisticsCharts(timeframe = 'all') {
    try {
      const participantStats = await window.statisticsCalculator.getParticipantStatistics(timeframe);
      const competitionTrends = await window.statisticsCalculator.getCompetitionTrends(timeframe);
      
      await Promise.all([
        this.createWinsChart(participantStats),
        this.createParticipationChart(competitionTrends),
        this.createAveragePositionChart(participantStats),
        this.createCompetitionTypesChart(competitionTrends)
      ]);
      
      console.log('All statistics charts initialized');
      
    } catch (error) {
      console.error('Failed to initialize statistics charts:', error);
    }
  }
  
  /**
   * Create wins per participant chart
   */
  async createWinsChart(participantStats) {
    const ctx = document.getElementById('wins-chart');
    if (!ctx) return;
    
    // Destroy existing chart
    this.destroyChart('wins-chart');
    
    const activeParticipants = participantStats.filter(p => p.status === 'active');
    const topWinners = activeParticipants
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10);
    
    const data = {
      labels: topWinners.map(p => p.name.split(' ')[0]), // First name only for space
      datasets: [{
        label: 'Antal Vinster',
        data: topWinners.map(p => p.wins),
        backgroundColor: this.createGradients(ctx, topWinners.length),
        borderColor: this.defaultColors.slice(0, topWinners.length),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    };
    
    const config = {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Totala Vinster per Deltagare',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const participant = topWinners[context.dataIndex];
                return [
                  `Vinster: ${participant.wins}`,
                  `Totala tävlingar: ${participant.totalCompetitions}`,
                  `Vinstprocent: ${participant.winRate.toFixed(1)}%`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            },
            title: {
              display: true,
              text: 'Antal Vinster'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Deltagare'
            }
          }
        },
        animation: {
          duration: 2000,
          easing: 'easeInOutQuart'
        }
      }
    };
    
    const chart = new Chart(ctx, config);
    this.charts.set('wins-chart', chart);
    
    return chart;
  }
  
  /**
   * Create participation over time chart
   */
  async createParticipationChart(competitionTrends) {
    const ctx = document.getElementById('participation-chart');
    if (!ctx) return;
    
    this.destroyChart('participation-chart');
    
    const years = Object.keys(competitionTrends.averageParticipationByYear).sort();
    const participation = years.map(year => competitionTrends.averageParticipationByYear[year]);
    
    const data = {
      labels: years,
      datasets: [{
        label: 'Genomsnittligt Deltagande',
        data: participation,
        borderColor: '#667eea',
        backgroundColor: this.createGradient(ctx, '#667eea', 0.1),
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    };
    
    const config = {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Deltagande över Tid',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Genomsnitt: ${context.parsed.y.toFixed(1)} deltagare`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Antal Deltagare'
            }
          },
          x: {
            title: {
              display: true,
              text: 'År'
            }
          }
        },
        animation: {
          duration: 2000,
          easing: 'easeInOutQuart'
        }
      }
    };
    
    const chart = new Chart(ctx, config);
    this.charts.set('participation-chart', chart);
    
    return chart;
  }
  
  /**
   * Create average position chart
   */
  async createAveragePositionChart(participantStats) {
    const ctx = document.getElementById('avg-placement-chart');
    if (!ctx) return;
    
    this.destroyChart('avg-placement-chart');
    
    const activeParticipants = participantStats
      .filter(p => p.status === 'active' && p.totalCompetitions > 0)
      .sort((a, b) => a.averagePosition - b.averagePosition)
      .slice(0, 10);
    
    const data = {
      labels: activeParticipants.map(p => p.name.split(' ')[0]),
      datasets: [{
        label: 'Genomsnittlig Placering',
        data: activeParticipants.map(p => p.averagePosition),
        backgroundColor: this.createGradients(ctx, activeParticipants.length, '#f093fb'),
        borderColor: activeParticipants.map((_, i) => this.defaultColors[i % this.defaultColors.length]),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    };
    
    const config = {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // Horizontal bar chart
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Genomsnittlig Placering (Lägre = Bättre)',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const participant = activeParticipants[context.dataIndex];
                return [
                  `Genomsnitt: ${participant.averagePosition.toFixed(2)}`,
                  `Bästa: ${participant.bestPosition}`,
                  `Tävlingar: ${participant.totalCompetitions}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Genomsnittlig Placering'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Deltagare'
            }
          }
        },
        animation: {
          duration: 2000,
          easing: 'easeInOutQuart'
        }
      }
    };
    
    const chart = new Chart(ctx, config);
    this.charts.set('avg-placement-chart', chart);
    
    return chart;
  }
  
  /**
   * Create competition types chart
   */
  async createCompetitionTypesChart(competitionTrends) {
    const ctx = document.getElementById('competition-types-chart');
    if (!ctx) return;
    
    this.destroyChart('competition-types-chart');
    
    const types = Object.entries(competitionTrends.competitionTypePopularity)
      .sort((a, b) => b[1] - a[1]);
    
    const data = {
      labels: types.map(([type]) => type),
      datasets: [{
        data: types.map(([, count]) => count),
        backgroundColor: this.defaultColors.slice(0, types.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 8
      }]
    };
    
    const config = {
      type: 'doughnut',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true,
              font: {
                size: 12
              }
            }
          },
          title: {
            display: true,
            text: 'Fördelning av Tävlingstyper',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((context.parsed / total) * 100).toFixed(1);
                return `${context.label}: ${context.parsed} (${percentage}%)`;
              }
            }
          }
        },
        animation: {
          duration: 2000,
          easing: 'easeInOutQuart'
        }
      }
    };
    
    const chart = new Chart(ctx, config);
    this.charts.set('competition-types-chart', chart);
    
    return chart;
  }
  
  /**
   * Create participant performance over time chart
   */
  async createParticipantPerformanceChart(participantId, containerId) {
    const ctx = document.getElementById(containerId);
    if (!ctx) return;
    
    this.destroyChart(containerId);
    
    const participant = await window.dataManager.getParticipant(participantId);
    const competitions = await window.dataManager.getCompetitions();
    
    const participantCompetitions = competitions
      .filter(comp => comp.scores && comp.scores[participantId] !== undefined)
      .sort((a, b) => a.year - b.year);
    
    const data = {
      labels: participantCompetitions.map(comp => `${comp.year} - ${comp.name}`),
      datasets: [{
        label: 'Placering',
        data: participantCompetitions.map(comp => comp.scores[participantId]),
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: participantCompetitions.map(comp => 
          comp.scores[participantId] === 1 ? '#FFD700' : 
          comp.scores[participantId] <= 3 ? '#C0C0C0' : '#667eea'
        ),
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    };
    
    const config = {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: `${participant.name} - Prestationer över Tid`,
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const position = context.parsed.y;
                const competition = participantCompetitions[context.dataIndex];
                return [
                  `Placering: ${position}`,
                  `Tävling: ${competition.name}`,
                  `År: ${competition.year}`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            reverse: true, // Lower positions (1st place) at top
            beginAtZero: false,
            title: {
              display: true,
              text: 'Placering (Lägre = Bättre)'
            },
            ticks: {
              stepSize: 1
            }
          },
          x: {
            title: {
              display: true,
              text: 'Tävlingar'
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        animation: {
          duration: 2000,
          easing: 'easeInOutQuart'
        }
      }
    };
    
    const chart = new Chart(ctx, config);
    this.charts.set(containerId, chart);
    
    return chart;
  }
  
  /**
   * Create head-to-head comparison chart
   */
  async createHeadToHeadChart(participant1Id, participant2Id, containerId) {
    const ctx = document.getElementById(containerId);
    if (!ctx) return;
    
    this.destroyChart(containerId);
    
    const comparison = await window.statisticsCalculator.getHeadToHeadComparison(
      participant1Id, 
      participant2Id
    );
    
    const data = {
      labels: ['Vinster', 'Bättre Placeringar', 'Pallplatser'],
      datasets: [
        {
          label: comparison.participant1.name,
          data: [
            comparison.participant1.wins,
            comparison.participant1.betterFinishes,
            comparison.participant1.podiumFinishes || 0
          ],
          backgroundColor: 'rgba(102, 126, 234, 0.8)',
          borderColor: '#667eea',
          borderWidth: 2
        },
        {
          label: comparison.participant2.name,
          data: [
            comparison.participant2.wins,
            comparison.participant2.betterFinishes,
            comparison.participant2.podiumFinishes || 0
          ],
          backgroundColor: 'rgba(240, 147, 251, 0.8)',
          borderColor: '#f093fb',
          borderWidth: 2
        }
      ]
    };
    
    const config = {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top'
          },
          title: {
            display: true,
            text: 'Direkt Jämförelse',
            font: {
              size: 16,
              weight: 'bold'
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    };
    
    const chart = new Chart(ctx, config);
    this.charts.set(containerId, chart);
    
    return chart;
  }
  
  /**
   * Update charts when data changes
   */
  async updateAllCharts(timeframe = 'all') {
    try {
      await this.initializeStatisticsCharts(timeframe);
    } catch (error) {
      console.error('Failed to update charts:', error);
    }
  }
  
  /**
   * Resize all charts (useful for responsive design)
   */
  resizeCharts() {
    this.charts.forEach(chart => {
      chart.resize();
    });
  }
  
  /**
   * Destroy a specific chart
   */
  destroyChart(chartId) {
    if (this.charts.has(chartId)) {
      this.charts.get(chartId).destroy();
      this.charts.delete(chartId);
    }
  }
  
  /**
   * Destroy all charts
   */
  destroyAllCharts() {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }
  
  /**
   * Create gradient backgrounds for charts
   */
  createGradient(ctx, color, alpha = 0.2) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
    gradient.addColorStop(1, color + '00');
    return gradient;
  }
  
  /**
   * Create multiple gradients for multiple data points
   */
  createGradients(ctx, count, baseColor = '#667eea') {
    const gradients = [];
    for (let i = 0; i < count; i++) {
      const color = this.defaultColors[i % this.defaultColors.length];
      gradients.push(this.createGradient(ctx, color, 0.8));
    }
    return gradients;
  }
  
  /**
   * Export chart as image
   */
  exportChart(chartId, filename) {
    const chart = this.charts.get(chartId);
    if (!chart) {
      console.error('Chart not found:', chartId);
      return;
    }
    
    const canvas = chart.canvas;
    const url = canvas.toDataURL('image/png');
    
    const link = document.createElement('a');
    link.download = filename || `${chartId}-${new Date().toISOString().split('T')[0]}.png`;
    link.href = url;
    link.click();
  }
  
  /**
   * Get chart configuration for external use
   */
  getChartConfig(chartId) {
    const chart = this.charts.get(chartId);
    return chart ? chart.config : null;
  }
  
  /**
   * Update theme colors for all charts
   */
  updateThemeColors() {
    const textColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-primary').trim();
    const borderColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--border-color').trim();
    
    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = borderColor;
    
    // Update existing charts
    this.charts.forEach(chart => {
      chart.options.plugins.title.color = textColor;
      chart.options.plugins.legend.labels.color = textColor;
      chart.options.scales.x.ticks.color = textColor;
      chart.options.scales.y.ticks.color = textColor;
      chart.options.scales.x.title.color = textColor;
      chart.options.scales.y.title.color = textColor;
      chart.update('none');
    });
  }
  
  /**
   * Create sparkline chart for small spaces
   */
  createSparkline(ctx, data, color = '#667eea') {
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data: data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        elements: {
          point: { radius: 0 }
        }
      }
    });
  }
}

// Initialize global chart manager
window.ChartManager = ChartManager;