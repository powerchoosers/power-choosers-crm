// Power Choosers CRM — Emails Page
// Minimal initializer so the left-nav Emails page is functional

(function(){
  function initEmailsPage(){
    const emailsPage = document.getElementById('emails-page');
    if (!emailsPage) return;

    const composeBtn = document.getElementById('compose-email-btn');
    composeBtn?.addEventListener('click', () => {
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Compose Email — coming soon');
      } else {
        alert('Compose Email — coming soon');
      }
    });

    const quickSearch = document.getElementById('emails-quick-search');
    quickSearch?.addEventListener('input', (e) => {
      const q = e.target.value || '';
      // Placeholder: hook up filtering once email list/table exists
      if (window.crm && typeof window.crm.showToast === 'function') {
        // Throttle simple feedback
        if (q.length === 0 || q.length === 3) {
          window.crm.showToast(q ? `Searching emails for "${q}"...` : 'Cleared search');
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailsPage);
  } else {
    initEmailsPage();
  }
})();
