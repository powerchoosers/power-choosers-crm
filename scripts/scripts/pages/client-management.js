'use strict';

// Client Management Dashboard module
(function () {
  const state = {
    loaded: false,
    data: {
      overview: {
        activeClients: 247,
        monthlyRevenue: 2400000,
        kwhManaged: 15200000,
        retentionRate: 94
      },
      contracts: {
        expiring30Days: 12,
        expiring60Days: 28,
        newThisMonth: 8,
        avgContractLength: 24
      },
      energy: {
        peakUsagePeriod: '2-4 PM',
        seasonalVariance: 23,
        costSavings: 847000,
        efficiencyRating: 8.7
      },
      health: {
        excellent: { score: 9.2, count: 156 },
        good: { score: 7.8, count: 67 },
        warning: { score: 5.4, count: 24 }
      },
      satisfaction: {
        score: 4.7,
        supportTickets: 23,
        avgResponseTime: 2.3,
        feedbackTrend: 12
      },
      communication: {
        recentCalls: 47,
        emailOpenRate: 89,
        scheduledMeetings: 12
      },
      service: {
        activeRequests: 15,
        slaCompliance: 98.5,
        avgResolutionTime: 4.2,
        escalationAlerts: 2
      },
      segmentation: {
        enterprise: 45,
        midmarket: 128,
        smb: 74
      },
      growth: {
        upsellOpportunities: 23,
        crossSellPotential: 1200000,
        referralOpportunities: 8,
        expansionPotential: 'High'
      }
    }
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('client-management-page');
    els.dashboard = els.page ? els.page.querySelector('.client-dashboard') : null;
    els.refreshBtn = document.getElementById('refresh-client-data');
    return !!els.page && !!els.dashboard;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  function updateOverviewStats() {
    const statCards = els.dashboard.querySelectorAll('.stat-card');
    
    if (statCards.length >= 4) {
      // Active Clients
      const clientsCard = statCards[0];
      const clientsValue = clientsCard.querySelector('.stat-value');
      if (clientsValue) clientsValue.textContent = state.data.overview.activeClients;

      // Monthly Revenue
      const revenueCard = statCards[1];
      const revenueValue = revenueCard.querySelector('.stat-value');
      if (revenueValue) revenueValue.textContent = formatCurrency(state.data.overview.monthlyRevenue);

      // kWh Managed
      const kwhCard = statCards[2];
      const kwhValue = kwhCard.querySelector('.stat-value');
      if (kwhValue) kwhValue.textContent = formatNumber(state.data.overview.kwhManaged);

      // Retention Rate
      const retentionCard = statCards[3];
      const retentionValue = retentionCard.querySelector('.stat-value');
      if (retentionValue) retentionValue.textContent = state.data.overview.retentionRate + '%';
    }
  }

  function updateContractMetrics() {
    const contractCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Contract Status"))');
    if (!contractCard) return;

    const metricRows = contractCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 4) {
      metricRows[0].querySelector('.metric-value').textContent = state.data.contracts.expiring30Days;
      metricRows[1].querySelector('.metric-value').textContent = state.data.contracts.expiring60Days;
      metricRows[2].querySelector('.metric-value').textContent = state.data.contracts.newThisMonth;
      metricRows[3].querySelector('.metric-value').textContent = state.data.contracts.avgContractLength + ' months';
    }
  }

  function updateEnergyMetrics() {
    const energyCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Energy Usage Analytics"))');
    if (!energyCard) return;

    const metricRows = energyCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 4) {
      metricRows[0].querySelector('.metric-value').textContent = state.data.energy.peakUsagePeriod;
      metricRows[1].querySelector('.metric-value').textContent = '+' + state.data.energy.seasonalVariance + '%';
      metricRows[2].querySelector('.metric-value').textContent = formatCurrency(state.data.energy.costSavings);
      metricRows[3].querySelector('.metric-value').textContent = state.data.energy.efficiencyRating + '/10';
    }
  }

  function updateHealthMetrics() {
    const healthCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Client Health Dashboard"))');
    if (!healthCard) return;

    const healthMetrics = healthCard.querySelectorAll('.health-metric');
    
    if (healthMetrics.length >= 3) {
      // Excellent Health
      const excellent = healthMetrics[0];
      excellent.querySelector('.health-score').textContent = state.data.health.excellent.score;
      excellent.querySelector('.health-count').textContent = state.data.health.excellent.count + ' clients';

      // Good Health
      const good = healthMetrics[1];
      good.querySelector('.health-score').textContent = state.data.health.good.score;
      good.querySelector('.health-count').textContent = state.data.health.good.count + ' clients';

      // Warning
      const warning = healthMetrics[2];
      warning.querySelector('.health-score').textContent = state.data.health.warning.score;
      warning.querySelector('.health-count').textContent = state.data.health.warning.count + ' clients';
    }
  }

  function updateSatisfactionMetrics() {
    const satisfactionCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Client Satisfaction"))');
    if (!satisfactionCard) return;

    const metricRows = satisfactionCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 4) {
      metricRows[0].querySelector('.metric-value').textContent = state.data.satisfaction.score + '/5';
      metricRows[1].querySelector('.metric-value').textContent = state.data.satisfaction.supportTickets;
      metricRows[2].querySelector('.metric-value').textContent = state.data.satisfaction.avgResponseTime + ' hours';
      metricRows[3].querySelector('.metric-value').textContent = '+' + state.data.satisfaction.feedbackTrend + '% this month';
    }
  }

  function updateCommunicationMetrics() {
    const commCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Client Communication"))');
    if (!commCard) return;

    const commStats = commCard.querySelectorAll('.comm-stat');
    
    if (commStats.length >= 3) {
      // Recent calls
      commStats[0].querySelector('.comm-value').textContent = state.data.communication.recentCalls;
      
      // Email open rate
      commStats[1].querySelector('.comm-value').textContent = state.data.communication.emailOpenRate + '%';
      
      // Scheduled meetings
      commStats[2].querySelector('.comm-value').textContent = state.data.communication.scheduledMeetings;
    }
  }

  function updateServiceMetrics() {
    const serviceCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Service Delivery"))');
    if (!serviceCard) return;

    const metricRows = serviceCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 4) {
      metricRows[0].querySelector('.metric-value').textContent = state.data.service.activeRequests;
      metricRows[1].querySelector('.metric-value').textContent = state.data.service.slaCompliance + '%';
      metricRows[2].querySelector('.metric-value').textContent = state.data.service.avgResolutionTime + ' days';
      metricRows[3].querySelector('.metric-value').textContent = state.data.service.escalationAlerts;
    }
  }

  function updateSegmentationMetrics() {
    const segmentCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Client Segmentation"))');
    if (!segmentCard) return;

    const segmentItems = segmentCard.querySelectorAll('.segment-item');
    
    if (segmentItems.length >= 3) {
      // Enterprise
      segmentItems[0].querySelector('.segment-value').textContent = state.data.segmentation.enterprise + ' clients';
      
      // Mid-market
      segmentItems[1].querySelector('.segment-value').textContent = state.data.segmentation.midmarket + ' clients';
      
      // SMB
      segmentItems[2].querySelector('.segment-value').textContent = state.data.segmentation.smb + ' clients';
    }
  }

  function updateGrowthMetrics() {
    const growthCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Growth Opportunities"))');
    if (!growthCard) return;

    const metricRows = growthCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 4) {
      metricRows[0].querySelector('.metric-value').textContent = state.data.growth.upsellOpportunities;
      metricRows[1].querySelector('.metric-value').textContent = formatCurrency(state.data.growth.crossSellPotential);
      metricRows[2].querySelector('.metric-value').textContent = state.data.growth.referralOpportunities;
      metricRows[3].querySelector('.metric-value').textContent = state.data.growth.expansionPotential;
    }
  }

  function refreshData() {
    // Simulate data refresh with slight variations
    const variation = () => Math.floor(Math.random() * 10) - 5; // -5 to +5
    
    state.data.overview.activeClients += variation();
    state.data.overview.monthlyRevenue += variation() * 10000;
    state.data.overview.retentionRate = Math.max(85, Math.min(99, state.data.overview.retentionRate + variation() * 0.5));
    
    state.data.contracts.expiring30Days = Math.max(0, state.data.contracts.expiring30Days + variation());
    state.data.contracts.expiring60Days = Math.max(0, state.data.contracts.expiring60Days + variation());
    state.data.contracts.newThisMonth = Math.max(0, state.data.contracts.newThisMonth + variation());
    
    state.data.communication.recentCalls = Math.max(0, state.data.communication.recentCalls + variation());
    state.data.communication.emailOpenRate = Math.max(70, Math.min(95, state.data.communication.emailOpenRate + variation() * 0.5));
    state.data.communication.scheduledMeetings = Math.max(0, state.data.communication.scheduledMeetings + variation());
    
    state.data.service.activeRequests = Math.max(0, state.data.service.activeRequests + variation());
    state.data.service.slaCompliance = Math.max(90, Math.min(100, state.data.service.slaCompliance + variation() * 0.1));
    
    // Update all metrics
    updateOverviewStats();
    updateContractMetrics();
    updateEnergyMetrics();
    updateHealthMetrics();
    updateSatisfactionMetrics();
    updateCommunicationMetrics();
    updateServiceMetrics();
    updateSegmentationMetrics();
    updateGrowthMetrics();
  }

  function attachEvents() {
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', () => {
        refreshData();
        // Add visual feedback
        els.refreshBtn.style.transform = 'rotate(360deg)';
        setTimeout(() => {
          els.refreshBtn.style.transform = '';
        }, 300);
      });
    }

    // Add click handlers for card actions (future functionality)
    const cardActions = els.dashboard.querySelectorAll('.card-action');
    cardActions.forEach(action => {
      action.addEventListener('click', (e) => {
        e.preventDefault();
        const card = action.closest('.dashboard-card');
        const cardTitle = card.querySelector('.card-title').textContent;
        console.log('Card action clicked:', cardTitle);
        // Future: Implement card-specific actions
      });
    });
  }

  function renderDashboard() {
    if (!initDomRefs()) return;

    // Update all metrics with current data
    updateOverviewStats();
    updateContractMetrics();
    updateEnergyMetrics();
    updateHealthMetrics();
    updateSatisfactionMetrics();
    updateCommunicationMetrics();
    updateServiceMetrics();
    updateSegmentationMetrics();
    updateGrowthMetrics();

    attachEvents();
    state.loaded = true;
  }

  function show() {
    if (!initDomRefs()) return;
    renderDashboard();
  }

  function refresh() {
    if (!state.loaded) return;
    refreshData();
  }

  // Public API
  window.ClientManagement = {
    show,
    refresh,
    getData: () => state.data,
    updateData: (newData) => {
      Object.assign(state.data, newData);
      if (state.loaded) {
        renderDashboard();
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.location.hash === '#client-management' || 
          document.getElementById('client-management-page').classList.contains('active')) {
        show();
      }
    });
  } else {
    if (window.location.hash === '#client-management' || 
        document.getElementById('client-management-page').classList.contains('active')) {
      show();
    }
  }
})();

