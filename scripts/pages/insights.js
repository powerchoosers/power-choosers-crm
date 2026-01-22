// Power Choosers CRM — Web Insights Page
// Minimal initializer so the left-nav Web Insights page is functional

(function(){
  function initInsightsPage(){
    const insightsPage = document.getElementById('insights-page');
    if (!insightsPage) return;

    const quickSearch = document.getElementById('insights-quick-search');
    quickSearch?.addEventListener('input', (e) => {
      const q = e.target.value || '';
      // Placeholder: hook up filtering once insights list/table exists
      if (window.crm && typeof window.crm.showToast === 'function') {
        // Throttle simple feedback
        if (q.length === 0 || q.length === 3) {
          window.crm.showToast(q ? `Searching insights for "${q}"...` : 'Cleared search');
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInsightsPage);
  } else {
    initInsightsPage();
  }
})();
