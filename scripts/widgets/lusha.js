(function () {
  'use strict';

  // Lusha API Widget for Contact Detail and Account Detail
  // Exposes: window.Widgets.openLusha(contactId), window.Widgets.openLushaForAccount(accountId)
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'lusha-widget';
  let currentContactId = null;
  let currentAccountId = null;
  let currentEntityType = 'contact'; // 'contact' or 'account'
  let currentAccountName = null;

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function removeExistingWidget() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  function closeLushaWidget() {
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    
    // Prepare collapse animation from current height and paddings
    const cs = window.getComputedStyle(card);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    
    // Force reflow
    void card.offsetHeight;
    card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
    card.style.height = '0px';
    card.style.paddingTop = '0px';
    card.style.paddingBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    
    const pending = new Set(['height', 'padding-top', 'padding-bottom']);
    const onEnd = (e) => {
      if (!e) return;
      if (pending.has(e.propertyName)) pending.delete(e.propertyName);
      if (pending.size > 0) return;
      card.removeEventListener('transitionend', onEnd);
      if (card.parentElement) card.parentElement.removeChild(card);
    };
    card.addEventListener('transitionend', onEnd);
  }

  function makeCard(entityId, entityType = 'contact') {
    const card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget-card lusha-card';
    
    // Get account name for search
    let accountName = '';
    if (entityType === 'contact') {
      // Try to get account name from contact data
      try {
        if (window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state.currentContact) {
          const contact = window.ContactDetail.state.currentContact;
          accountName = contact.companyName || contact.company || contact.account || '';
        }
        // Fallback: try to get from DOM
        if (!accountName) {
          const companyLink = document.querySelector('#contact-company-link');
          if (companyLink) {
            accountName = companyLink.textContent?.trim() || '';
          }
        }
      } catch (_) {}
    } else {
      // Try to get account name from account data
      try {
        if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
          const account = window.AccountDetail.state.currentAccount;
          accountName = account.name || account.accountName || '';
        }
        // Fallback: try to get from DOM
        if (!accountName) {
          const accountTitle = document.querySelector('#account-detail-header .contact-header-profile .contact-name');
          if (accountTitle) {
            accountName = accountTitle.textContent?.trim() || '';
          }
        }
      } catch (_) {}
    }
    
    currentAccountName = accountName;

    card.innerHTML = `
      <div class="widget-card-header">
        <h3 class="widget-title">Lusha Contact Search</h3>
        <button class="lusha-close" type="button" title="Close Lusha Search" aria-label="Close">×</button>
      </div>
      <div class="lusha-subtitle">Search for contact information using Lusha API</div>
      
      <div class="lusha-body">
        <div class="lusha-search-section">
          <div class="lusha-input-group">
            <label for="lusha-company-search" class="lusha-input-label">Company Name</label>
            <input type="text" id="lusha-company-search" class="lusha-form-input" placeholder="Enter company name" value="${escapeHtml(accountName)}">
          </div>
          
          <div class="lusha-input-group">
            <label for="lusha-contact-name" class="lusha-input-label">Contact Name (Optional)</label>
            <input type="text" id="lusha-contact-name" class="lusha-form-input" placeholder="First Last">
          </div>
          
          <div class="lusha-input-group">
            <label for="lusha-contact-email" class="lusha-input-label">Email (Optional)</label>
            <input type="email" id="lusha-contact-email" class="lusha-form-input" placeholder="contact@company.com">
          </div>
          
          <div class="lusha-button-group">
            <button id="lusha-search-btn" class="lusha-search-btn">Search Contacts</button>
            <button id="lusha-reset-btn" class="lusha-reset-btn">Reset</button>
          </div>
        </div>
        
        <!-- Loading state -->
        <div class="lusha-loading" id="lusha-loading" style="display: none;">
          <div class="lusha-spinner"></div>
          <div class="lusha-loading-text">Searching Lusha database...</div>
        </div>

        <!-- Results Section -->
        <div class="lusha-results" id="lusha-results" style="display: none;">
          <div class="lusha-results-header">
            <h4>Search Results</h4>
            <div class="lusha-results-count" id="lusha-results-count">0 contacts found</div>
          </div>
          
          <div class="lusha-contacts-list" id="lusha-contacts-list">
            <!-- Results will be populated here -->
          </div>
        </div>
      </div>
    `;

    // Smooth expand-in animation
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('lusha-anim'); } catch (_) {}
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    const content = getPanelContentEl();
    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      // Measure natural height and animate to it
      requestAnimationFrame(() => {
        const targetHeight = card.scrollHeight;
        card.style.height = '0px';
        card.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
          card.style.transition = 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, transform 0.35s ease';
          card.style.height = targetHeight + 'px';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
          
          const onEnd = () => {
            card.style.height = 'auto';
            card.style.overflow = 'visible';
            card.removeEventListener('transitionend', onEnd);
          };
          card.addEventListener('transitionend', onEnd);
        });
      });
    }

    // Bring panel into view
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    attachEventListeners();
    return card;
  }

  function attachEventListeners() {
    // Close button
    const closeBtn = document.getElementById(WIDGET_ID)?.querySelector('.lusha-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLushaWidget);
    }

    // Search button
    const searchBtn = document.getElementById('lusha-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', performLushaSearch);
    }

    // Reset button
    const resetBtn = document.getElementById('lusha-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetLushaForm);
    }

    // Enter key on inputs
    const inputs = document.querySelectorAll('#lusha-widget .lusha-form-input');
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          performLushaSearch();
        }
      });
    });
  }

  async function performLushaSearch() {
    const companyInput = document.getElementById('lusha-company-search');
    const nameInput = document.getElementById('lusha-contact-name');
    const emailInput = document.getElementById('lusha-contact-email');
    const loadingEl = document.getElementById('lusha-loading');
    const resultsEl = document.getElementById('lusha-results');
    const searchBtn = document.getElementById('lusha-search-btn');

    const companyName = companyInput?.value?.trim();
    const contactName = nameInput?.value?.trim();
    const contactEmail = emailInput?.value?.trim();

    if (!companyName) {
      try { window.crm?.showToast && window.crm.showToast('Please enter a company name'); } catch (_) {}
      return;
    }

    // Show loading state
    if (loadingEl) loadingEl.style.display = 'block';
    if (resultsEl) resultsEl.style.display = 'none';
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching...';
    }

    try {
      // Prepare search parameters
      const searchParams = {
        companyName: companyName
      };

      if (contactName) {
        const nameParts = contactName.split(' ');
        if (nameParts.length >= 2) {
          searchParams.firstName = nameParts[0];
          searchParams.lastName = nameParts.slice(1).join(' ');
        } else {
          searchParams.firstName = contactName;
        }
      }

      if (contactEmail) {
        searchParams.email = contactEmail;
      }

      // Call backend API
      const response = await fetch('/api/lusha/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Display results
      displayLushaResults(data);

    } catch (error) {
      console.error('Lusha search error:', error);
      try { window.crm?.showToast && window.crm.showToast('Search failed: ' + error.message); } catch (_) {}
    } finally {
      // Hide loading state
      if (loadingEl) loadingEl.style.display = 'none';
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search Contacts';
      }
    }
  }

  function displayLushaResults(data) {
    const resultsEl = document.getElementById('lusha-results');
    const countEl = document.getElementById('lusha-results-count');
    const listEl = document.getElementById('lusha-contacts-list');

    if (!resultsEl || !countEl || !listEl) return;

    const contacts = data.contacts || [];
    const count = contacts.length;

    // Update count
    countEl.textContent = `${count} contact${count !== 1 ? 's' : ''} found`;

    // Clear previous results
    listEl.innerHTML = '';

    if (count === 0) {
      listEl.innerHTML = `
        <div class="lusha-no-results">
          <p>No contacts found for this search.</p>
          <p>Try adjusting your search criteria.</p>
        </div>
      `;
    } else {
      // Display contacts
      contacts.forEach((contact, index) => {
        const contactEl = createContactElement(contact, index);
        listEl.appendChild(contactEl);
      });
    }

    // Show results
    resultsEl.style.display = 'block';
  }

  function createContactElement(contact, index) {
    const div = document.createElement('div');
    div.className = 'lusha-contact-item';
    
    const name = contact.firstName && contact.lastName 
      ? `${contact.firstName} ${contact.lastName}` 
      : contact.fullName || 'Unknown Name';
    
    const title = contact.title || contact.jobTitle || 'No title';
    const email = contact.email || 'No email';
    const phone = contact.phone || contact.phoneNumber || 'No phone';
    const company = contact.company || contact.companyName || 'No company';
    const location = contact.location || contact.city || 'No location';

    div.innerHTML = `
      <div class="lusha-contact-header">
        <div class="lusha-contact-name">${escapeHtml(name)}</div>
        <div class="lusha-contact-title">${escapeHtml(title)}</div>
      </div>
      <div class="lusha-contact-details">
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Company:</span>
          <span class="lusha-detail-value">${escapeHtml(company)}</span>
        </div>
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Email:</span>
          <span class="lusha-detail-value">${escapeHtml(email)}</span>
        </div>
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Phone:</span>
          <span class="lusha-detail-value">${escapeHtml(phone)}</span>
        </div>
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Location:</span>
          <span class="lusha-detail-value">${escapeHtml(location)}</span>
        </div>
      </div>
      <div class="lusha-contact-actions">
        <button class="lusha-action-btn" data-action="add-contact" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Add to CRM
        </button>
        <button class="lusha-action-btn" data-action="copy-info" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Copy Info
        </button>
      </div>
    `;

    // Add event listeners for action buttons
    const addBtn = div.querySelector('[data-action="add-contact"]');
    const copyBtn = div.querySelector('[data-action="copy-info"]');

    if (addBtn) {
      addBtn.addEventListener('click', () => addContactToCRM(contact));
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyContactInfo(contact));
    }

    return div;
  }

  async function addContactToCRM(contact) {
    try {
      // Prepare contact data for CRM
      const contactData = {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email || '',
        phone: contact.phone || contact.phoneNumber || '',
        company: contact.company || contact.companyName || '',
        title: contact.title || contact.jobTitle || '',
        location: contact.location || contact.city || ''
      };

      // Call backend to add contact
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactData)
      });

      if (response.ok) {
        try { window.crm?.showToast && window.crm.showToast('Contact added to CRM successfully'); } catch (_) {}
      } else {
        throw new Error('Failed to add contact');
      }

    } catch (error) {
      console.error('Error adding contact:', error);
      try { window.crm?.showToast && window.crm.showToast('Failed to add contact: ' + error.message); } catch (_) {}
    }
  }

  function copyContactInfo(contact) {
    const info = [
      `Name: ${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      `Title: ${contact.title || contact.jobTitle || ''}`,
      `Company: ${contact.company || contact.companyName || ''}`,
      `Email: ${contact.email || ''}`,
      `Phone: ${contact.phone || contact.phoneNumber || ''}`,
      `Location: ${contact.location || contact.city || ''}`
    ].filter(line => line.split(': ')[1]).join('\n');

    navigator.clipboard.writeText(info).then(() => {
      try { window.crm?.showToast && window.crm.showToast('Contact info copied to clipboard'); } catch (_) {}
    }).catch(() => {
      try { window.crm?.showToast && window.crm.showToast('Failed to copy to clipboard'); } catch (_) {}
    });
  }

  function resetLushaForm() {
    const companyInput = document.getElementById('lusha-company-search');
    const nameInput = document.getElementById('lusha-contact-name');
    const emailInput = document.getElementById('lusha-contact-email');
    const resultsEl = document.getElementById('lusha-results');

    if (companyInput) companyInput.value = currentAccountName || '';
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (resultsEl) resultsEl.style.display = 'none';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Public API
  function openLusha(contactId) {
    currentContactId = contactId;
    currentEntityType = 'contact';
    removeExistingWidget();
    makeCard(contactId, 'contact');
    try { window.crm?.showToast && window.crm.showToast('Lusha Contact Search opened'); } catch (_) {}
  }

  function openLushaForAccount(accountId) {
    currentAccountId = accountId;
    currentEntityType = 'account';
    removeExistingWidget();
    makeCard(accountId, 'account');
    try { window.crm?.showToast && window.crm.showToast('Lusha Contact Search opened'); } catch (_) {}
  }

  function closeLusha() {
    closeLushaWidget();
  }

  function isLushaOpen() {
    return !!document.getElementById(WIDGET_ID);
  }

  // Expose public API
  window.Widgets.openLusha = openLusha;
  window.Widgets.openLushaForAccount = openLushaForAccount;
  window.Widgets.closeLusha = closeLusha;
  window.Widgets.isLushaOpen = isLushaOpen;

})();
