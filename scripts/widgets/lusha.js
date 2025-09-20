(function () {
  'use strict';

  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'lusha-widget';
  let currentAccountId = null;
  let currentAccountName = null;

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    return panel.querySelector('.widget-content') || panel;
  }

  function removeExistingWidget() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing) existing.remove();
  }

  function closeLushaWidget() {
    const card = document.getElementById(WIDGET_ID);
    if (card) card.remove();
  }

  function makeCard(accountId) {
    currentAccountId = accountId;
    
    // Try to get the account name from the AccountDetail state or the DOM.
    let accountName = '';
    try {
      if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
        const account = window.AccountDetail.state.currentAccount;
        accountName = account.name || account.accountName || '';
      }
      if (!accountName) {
        accountName = document.querySelector('#account-detail-header .page-title')?.textContent?.trim() || '';
      }
    } catch (e) {
      console.error("Error getting account name for Lusha widget:", e);
    }
    currentAccountName = accountName;

    const card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget-card lusha-card';

    card.innerHTML = `
      <div class="widget-card-header">
        <h3 class="widget-title">Lusha Prospecting</h3>
        <button class="lusha-close" type="button" title="Close Lusha" aria-label="Close">×</button>
      </div>
      <div class="lusha-subtitle">Find new contacts at this company.</div>
      
      <div class="lusha-body">
        <div class="lusha-search-section">
          <div class="lusha-input-group">
            <label for="lusha-company-search" class="lusha-input-label">Company Name</label>
            <input type="text" id="lusha-company-search" class="lusha-form-input" placeholder="Enter company name" value="${escapeHtml(currentAccountName)}">
          </div>
          <div class="lusha-button-group">
            <button id="lusha-search-btn" class="lusha-search-btn">Find Contacts</button>
          </div>
        </div>
        
        <div class="lusha-loading" id="lusha-loading" style="display: none;">
          <div class="lusha-spinner"></div>
          <div class="lusha-loading-text">Searching for contacts...</div>
        </div>

        <div class="lusha-results" id="lusha-results" style="display: none;">
          <div class="lusha-results-header">
            <h4>Prospecting Results</h4>
            <div class="lusha-results-count" id="lusha-results-count"></div>
          </div>
          <div class="lusha-contacts-list" id="lusha-contacts-list"></div>
        </div>
      </div>
    `;

    const content = getPanelContentEl();
    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    attachEventListeners(card);
    
    // Automatically start search if a company name is pre-filled
    if (currentAccountName) {
      performLushaSearch();
    }
  }

  function attachEventListeners(card) {
    card.querySelector('.lusha-close')?.addEventListener('click', closeLushaWidget);
    card.querySelector('#lusha-search-btn')?.addEventListener('click', performLushaSearch);
    card.querySelector('#lusha-company-search')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performLushaSearch();
    });
  }

  async function performLushaSearch() {
    const companyInput = document.getElementById('lusha-company-search');
    const companyName = companyInput?.value?.trim();

    if (!companyName) {
      window.crm?.showToast?.('Please enter a company name.');
      return;
    }

    const loadingEl = document.getElementById('lusha-loading');
    const resultsEl = document.getElementById('lusha-results');
    const searchBtn = document.getElementById('lusha-search-btn');

    if (loadingEl) loadingEl.style.display = 'block';
    if (resultsEl) resultsEl.style.display = 'none';
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching...';
    }

    try {
      const base = (window.API_BASE_URL || '').replace(/\/$/, '') || 'https://power-choosers-crm.vercel.app';
      const url = `${base}/api/lusha`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyName })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred' , details: response.statusText}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      displayLushaResults(data);

    } catch (error) {
      console.error('Lusha search error:', error);
      window.crm?.showToast?.(`Lusha Search Failed: ${error.message}`);
      // Ensure results are hidden on error
      if (resultsEl) resultsEl.style.display = 'none';
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Find Contacts';
      }
    }
  }

  function displayLushaResults(data) {
    const resultsEl = document.getElementById('lusha-results');
    const countEl = document.getElementById('lusha-results-count');
    const listEl = document.getElementById('lusha-contacts-list');

    if (!resultsEl || !countEl || !listEl) return;

    const contacts = data.contacts || [];
    countEl.textContent = `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} found`;
    listEl.innerHTML = '';

    if (contacts.length === 0) {
      listEl.innerHTML = `<div class="lusha-no-results"><p>No contacts found for \"${escapeHtml(document.getElementById('lusha-company-search')?.value)}\".</p></div>`;
    } else {
      contacts.forEach(contact => {
        listEl.appendChild(createContactElement(contact));
      });
    }
    resultsEl.style.display = 'block';
  }

    function createContactElement(contact) {
        const div = document.createElement('div');
        div.className = 'lusha-contact-item';

        const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Name not found';
        const title = contact.jobTitle || 'No title provided';
        const email = (contact.emails && contact.emails.length > 0) ? contact.emails[0].address : 'No email';
        const phone = (contact.phones && contact.phones.length > 0) ? contact.phones[0].number : 'No phone';

        div.innerHTML = `
      <div class="lusha-contact-header">
        <div class="lusha-contact-name">${escapeHtml(name)}</div>
        <div class="lusha-contact-title">${escapeHtml(title)}</div>
      </div>
      <div class="lusha-contact-details">
        <div>Email: ${escapeHtml(email)}</div>
        <div>Phone: ${escapeHtml(phone)}</div>
      </div>
      <div class="lusha-contact-actions">
        <button class="lusha-action-btn" data-action="add-contact">Add to CRM</button>
      </div>
    `;

        div.querySelector('[data-action="add-contact"]').addEventListener('click', async () => {
            const companyName = document.getElementById('lusha-company-search')?.value?.trim();
            const contactData = {
                firstName: contact.firstName || '',
                lastName: contact.lastName || '',
                email: (contact.emails && contact.emails.length > 0) ? contact.emails[0].address : '',
                phone: (contact.phones && contact.phones.length > 0) ? contact.phones[0].number : '',
                title: contact.jobTitle || '',
                companyName: companyName, // Associate with the searched company
            };
            
            try {
                // Here you would call your backend to add the contact
                console.log("Adding contact to CRM:", contactData);
                window.crm?.showToast?.(`Contact \"${name}\" added.`);
            } catch (error) {
                console.error("Failed to add contact:", error);
                window.crm?.showToast?.(`Error adding contact: ${error.message}`, 'error');
            }
        });
        return div;
    }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openLushaForAccount(accountId) {
    removeExistingWidget();
    makeCard(accountId);
  }

  // Expose public API
  window.Widgets.openLushaForAccount = openLushaForAccount;
  window.Widgets.closeLusha = closeLushaWidget;
  window.Widgets.isLushaOpen = () => !!document.getElementById(WIDGET_ID);

})();
