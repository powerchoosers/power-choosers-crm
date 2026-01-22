/**
 * KPI Tracker Widget
 * Shows monthly call statistics (1st to current day)
 * 
 * Data Source: 
 * - Primary: window.BackgroundCallsLoader (Enriched, cached, user-filtered)
 * - Fallback: /api/calls
 */

(function() {
    if (window._pcKpiTrackerInitialized) return;
    window._pcKpiTrackerInitialized = true;
    // console.log('[KPI Tracker] Initializing...');

    let chartInstance = null;
    let isInitialized = false;
    let filteredLogCount = 0;
    let chartContextYear = null;
    let chartContextMonth = null;

    // Initialize widget
    function init() {
        if (isInitialized) return;
        
        if (typeof Chart === 'undefined') {
            // console.warn('[KPI Tracker] Chart.js not loaded, retrying...');
            setTimeout(init, 500);
            return;
        }
        
        const canvas = document.getElementById('kpiCallChart');
        if (!canvas) {
            // console.warn('[KPI Tracker] Canvas element not found');
            return;
        }

        isInitialized = true;
        loadDataAndRender(canvas);

        // Listen for data updates
        document.addEventListener('pc:calls-loaded', () => loadDataAndRender(canvas));
        document.addEventListener('pc:calls-loaded-more', () => loadDataAndRender(canvas));
        document.addEventListener('pc:call-logged', () => {
            // console.log('[KPI Tracker] Call logged, refreshing chart...');
            // Add a small delay to allow background loader to update
            setTimeout(() => loadDataAndRender(canvas), 1000);
        });
    }

    function getCallDate(call) {
        const timeStr = call && (call.callTime || call.timestamp || call.createdAt);
        if (!timeStr) return null;
        const d = new Date(timeStr);
        if (isNaN(d.getTime())) return null;
        return d;
    }

    async function getAuthHeaders() {
        try {
            const user = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
            if (user) {
                const token = await user.getIdToken();
                if (token) return { Authorization: `Bearer ${token}` };
            }
        } catch (_) {}
        return {};
    }

    async function fetchCallsPage({ limit, offset }) {
        const headers = await getAuthHeaders();
        const params = new URLSearchParams();
        if (limit) params.set('limit', String(limit));
        if (offset) params.set('offset', String(offset));
        const response = await fetch(`/api/calls?${params.toString()}`, { headers });
        const data = await response.json();
        if (data && data.ok && Array.isArray(data.calls)) return data.calls;
        return [];
    }

    function getOldestDate(calls) {
        let oldest = null;
        for (const c of (calls || [])) {
            const d = getCallDate(c);
            if (!d) continue;
            if (!oldest || d < oldest) oldest = d;
        }
        return oldest;
    }

    async function ensureCallsCoverMonth(calls, monthStart) {
        const maxPages = 20;
        const pageSize = 200;

        const hasBg = window.BackgroundCallsLoader && typeof window.BackgroundCallsLoader.loadMore === 'function' && typeof window.BackgroundCallsLoader.getCallsData === 'function';

        for (let i = 0; i < maxPages; i++) {
            const oldest = getOldestDate(calls);
            if (oldest && oldest <= monthStart) return calls;

            if (hasBg && window.BackgroundCallsLoader.hasMore && window.BackgroundCallsLoader.hasMore()) {
                const r = await window.BackgroundCallsLoader.loadMore();
                const next = window.BackgroundCallsLoader.getCallsData() || [];
                calls = next;
                if (!r || !r.loaded) break;
                continue;
            }

            const offset = Array.isArray(calls) ? calls.length : 0;
            const page = await fetchCallsPage({ limit: pageSize, offset });
            if (!page.length) break;
            calls = [...(calls || []), ...page];
        }

        return calls;
    }

    // Helper to get current user email
    function getCurrentUserEmail() {
        let email = '';
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            email = window.DataManager.getCurrentUserEmail();
        }
        if (!email) {
            email = (window.currentUserEmail || localStorage.getItem('pc:lastUserEmail') || '');
        }
        const finalEmail = email.toLowerCase().trim();
        return finalEmail;
    }

    // Ownership check per firestore-rules-FINAL.txt
    function isOwnerOrAssigned(data, userEmail) {
        if (!userEmail) return false;
        const email = userEmail.toLowerCase();
        
        const ownerId = String(data.ownerId || '').toLowerCase();
        const assignedTo = String(data.assignedTo || '').toLowerCase();
        const createdBy = String(data.createdBy || '').toLowerCase();

        const match = ownerId === email ||
                     assignedTo === email ||
                     createdBy === email ||
                     ownerId === 'unassigned';
        
        return match;
    }

    async function loadDataAndRender(canvas) {
        try {
            let calls = [];
            const userEmail = getCurrentUserEmail();

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            const currentDay = now.getDate();
            const monthStart = new Date(currentYear, currentMonth, 1);

            // 1. Try BackgroundCallsLoader (Best source: cached, enriched)
            if (window.BackgroundCallsLoader && typeof window.BackgroundCallsLoader.getCallsData === 'function') {
                calls = window.BackgroundCallsLoader.getCallsData() || [];
            } 
            
            // 2. Fallback to API if no data yet (and not loading)
            if ((!calls || calls.length === 0) && (!window.BackgroundCallsLoader || !window.BackgroundCallsLoader.hasMore())) {
                try {
                    calls = await fetchCallsPage({ limit: 500, offset: 0 });
                } catch (e) {
                    console.error('[KPI Tracker] API fallback failed:', e);
                }
            }

            if (calls && calls.length > 0) {
                calls = await ensureCallsCoverMonth(calls, monthStart);
            }

            // Apply Ownership Filtering
            if (calls && calls.length > 0 && userEmail) {
                calls = calls.filter(call => isOwnerOrAssigned(call, userEmail));
            }

            if (!calls || calls.length === 0) {
                renderChart(canvas, [], []);
                return;
            }

            // Process data for Monthly View (1st to Current Day)
            chartContextMonth = currentMonth;
            chartContextYear = currentYear;

            // Initialize labels and data for days 1 to currentDay
            const dayLabels = [];
            const dayCounts = [];
            
            for (let i = 1; i <= currentDay; i++) {
                dayLabels.push(String(i));
                dayCounts.push(0);
            }

            let monthMatchCount = 0;
            calls.forEach(call => {
                const callDate = getCallDate(call);
                if (!callDate) return;

                if (callDate.getMonth() === currentMonth && callDate.getFullYear() === currentYear) {
                    monthMatchCount++;
                    const day = callDate.getDate();
                    if (day >= 1 && day <= currentDay) {
                        dayCounts[day - 1]++;
                    }
                }
            });

            renderChart(canvas, dayLabels, dayCounts);

        } catch (error) {
            console.error('[KPI Tracker] Error processing data:', error);
        }
    }

    function renderChart(canvas, labels, data) {
        const ctx = canvas.getContext('2d');
        
        // Gradient fill matching CRM theme (Orange Primary: #f18335)
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(241, 131, 53, 0.45)');
        gradient.addColorStop(1, 'rgba(241, 131, 53, 0.0)');

        if (chartInstance) {
            // Update existing chart data smoothly
            chartInstance.data.labels = labels;
            chartInstance.data.datasets[0].data = data;
            chartInstance.data.datasets[0].backgroundColor = gradient;
            chartInstance.data.datasets[0].borderColor = '#f18335';
            chartInstance.data.datasets[0].pointBorderColor = '#f18335';
            chartInstance.update();
            return;
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Calls This Month',
                    data: data,
                    borderColor: '#f18335',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    tension: 0.4, // Smooth curve
                    fill: true,
                    pointBackgroundColor: '#1e293b', // Dark background
                    pointBorderColor: '#f18335',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(30, 41, 59, 0.9)', // Slate-800
                        titleColor: '#f8fafc', // Slate-50
                        bodyColor: '#f8fafc',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                const day = parseInt(context[0].label, 10);
                                if (!chartContextYear || chartContextMonth == null || !day) return context[0].label;
                                const d = new Date(chartContextYear, chartContextMonth, day);
                                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                                return `${dayName} ${day}`;
                            },
                            label: function(context) {
                                return `Calls: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: 'rgba(148, 163, 184, 1)', // Slate-400
                            font: {
                                family: "'Inter', sans-serif",
                                size: 11
                            },
                            maxTicksLimit: 16
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: 'rgba(148, 163, 184, 1)',
                            font: {
                                family: "'Inter', sans-serif",
                                size: 11
                            },
                            stepSize: 1,
                            precision: 0
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
            }
        });
    }

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
