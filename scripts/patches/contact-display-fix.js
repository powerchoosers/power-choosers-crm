(function(){
  'use strict';

  function normalizeName(s){
    try{
      const raw = String(s||'')
        .toLowerCase()
        .replace(/&/g,'and')
        .replace(/[^a-z0-9\s]/g,' ')
        .replace(/\b(inc|incorporated|llc|l\.?l\.?c\.?|llp|l\.?l\.?p\.?|ltd|co|corp|corporation|company|limited|the)\b/g,' ')
        .replace(/\s+/g,' ') // collapse spaces
        .trim();
      return raw;
    }catch(_){ return String(s||'').toLowerCase().trim(); }
  }

  function escapeAttr(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function fixCallsTable(){
    try{
      const tbody = document.querySelector('#calls-table tbody');
      if (!tbody) return;
      const rows = tbody.querySelectorAll('tr');
      rows.forEach(tr => {
        try{
          const nameCell = tr.querySelector('td.name-cell');
          if (!nameCell) return;
          // If the cell already shows the CTA, skip
          if (nameCell.querySelector('.add-contact-cta')) return;

          const contactId = nameCell.getAttribute('data-contact-id') || '';
          const isGenerated = contactId.startsWith('call_contact_');

          // Extract rendered contact name (if any)
          const nameText = (nameCell.querySelector('.name-text')?.textContent || '').trim();

          // Get company name from the row
          const companyNameEl = tr.querySelector('.company-name');
          const companyAttr = tr.querySelector('.company-link')?.getAttribute('data-company') || '';
          const company = (companyNameEl?.textContent || companyAttr || '').trim();

          if (!company) return; // nothing to compare against

          const same = nameText && normalizeName(nameText) === normalizeName(company);

          // If contactId is an auto-generated fallback OR name equals company, treat as no contact
          if (isGenerated || same) {
            nameCell.setAttribute('data-contact-id','');
            const btnHtml = `
              <button type="button" class="add-contact-cta" data-company="${escapeAttr(company)}">
                <span class="add-contact-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </span>
                <span class="add-contact-text">Add Contact</span>
              </button>`;
            nameCell.innerHTML = btnHtml;

            // Wire click to open the existing Add Contact modal and prefill company
            const btn = nameCell.querySelector('.add-contact-cta');
            if (btn && !btn._bound) {
              btn._bound = true;
              btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const company = btn.getAttribute('data-company') || '';
                try {
                  if (window.crm && typeof window.crm.createAddContactModal === 'function') {
                    window.crm.createAddContactModal();
                  } else if (typeof window.createAddContactModal === 'function') {
                    window.createAddContactModal();
                  }
                  // Prefill the company
                  setTimeout(() => {
                    try {
                      const modal = document.getElementById('modal-add-contact');
                      if (modal) {
                        const companyInput = modal.querySelector('input[name="companyName"], input[name="company"], input[data-field="companyName"]');
                        if (companyInput) companyInput.value = company;
                        const firstNameInput = modal.querySelector('input[name="firstName"]');
                        if (firstNameInput) firstNameInput.focus();
                      }
                    } catch(_) {}
                  }, 60);
                } catch(_) {}
              });
            }
          }
        }catch(_){}
      });
    }catch(_){}
  }

  function fixAccountRecentCalls(){
    try{
      const list = document.getElementById('account-recent-calls-list');
      if (!list) return;
      list.querySelectorAll('.rc-title').forEach(el => {
        try{
          const txt = (el.textContent || '').trim();
          if (!txt) return;
          const parts = txt.split(' • ').map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2) {
            if (normalizeName(parts[0]) === normalizeName(parts[1])) {
              el.textContent = parts[0];
            }
          }
        }catch(_){}
      });
    }catch(_){}
  }

  function installObservers(){
    // Calls table observer
    try{
      const tbody = document.querySelector('#calls-table tbody');
      if (tbody && !tbody._contactFixObserver) {
        const obs = new MutationObserver(() => { fixCallsTable(); });
        obs.observe(tbody, { childList: true, subtree: true });
        tbody._contactFixObserver = obs;
        // Initial pass
        fixCallsTable();
      }
    }catch(_){}

    // Account recent calls observer
    try{
      const rcList = document.getElementById('account-recent-calls-list');
      if (rcList && !rcList._recentFixObserver) {
        const obs2 = new MutationObserver(() => { fixAccountRecentCalls(); });
        obs2.observe(rcList, { childList: true, subtree: true });
        rcList._recentFixObserver = obs2;
        // Initial pass
        fixAccountRecentCalls();
      }
    }catch(_){}
  }

  function onReady(){
    installObservers();
    // Re-run when SPA pages refresh their content
    try { document.addEventListener('pc:calls-restore', installObservers); } catch(_) {}
    try { document.addEventListener('pc:recent-calls-refresh', installObservers); } catch(_) {}
    try { document.addEventListener('callStateChanged', installObservers); } catch(_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
