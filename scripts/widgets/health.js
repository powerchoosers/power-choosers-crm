(function () {
  'use strict';

  // Energy Health Check Widget for Contact Detail and Account Detail
  // Exposes: window.Widgets.openHealth(contactId), window.Widgets.openHealthForAccount(accountId)
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'health-widget';
  let unsub = null; // Firestore unsubscribe for realtime listener
  let currentContactId = null;
  let currentAccountId = null;
  let currentEntityType = 'contact'; // 'contact' or 'account'

  // Use shared supplier data from supplier-data.js
  const supplierData = window.SupplierData || {};
  const supplierNames = window.SupplierNames || [];

  // ==== Date helpers and DOM bridge ====
  function parseDateFlexible(s){
    if (!s) return null;
    const str = String(s).trim();
    // Try ISO first
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/;
    if (isoMatch.test(str)) {
      // For ISO dates, parse components to avoid timezone issues
      const parts = str.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    // Try MM/DD/YYYY
    const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (mdy) {
      const mm = parseInt(mdy[1],10)-1, dd = parseInt(mdy[2],10), yy = parseInt(mdy[3],10);
      const d = new Date(yy, mm, dd);
      return isNaN(d.getTime()) ? null : d;
    }
    // Fallback Date parse - use local timezone to avoid offset issues
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  function toISODate(v){
    const d = parseDateFlexible(v);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function toMDY(v){
    const d = parseDateFlexible(v);
    if (!d) return (v ? String(v) : '');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  function readDetailFieldDOM(field){
    try {
      const id = document.getElementById('account-detail-view') ? 'account-detail-view' : (document.getElementById('contact-detail-view') ? 'contact-detail-view' : '');
      console.log('[Health Widget] readDetailFieldDOM for field:', field, 'detail view:', id);
      if (!id) {
        console.log('[Health Widget] No detail view found');
        return '';
      }
      const root = document.getElementById(id);
      const el = root && root.querySelector(`.info-value-wrap[data-field="${field}"] .info-value-text`);
      const text = el ? el.textContent.trim() : '';
      const result = text === '--' ? '' : text;
      console.log('[Health Widget] readDetailFieldDOM result:', { field, text, result });
      return result;
    } catch(e) { 
      console.log('[Health Widget] Error in readDetailFieldDOM:', e);
      return ''; 
    }
  }

  function getLinkedAccountId(currentEntityType, currentEntityId) {
    try {
      console.log('[Health Widget] getLinkedAccountId called');
      
      // First try to get from window.ContactDetail.state._linkedAccountId
      if (window.ContactDetail && window.ContactDetail.state) {
        console.log('[Health Widget] ContactDetail.state exists:', !!window.ContactDetail.state);
        console.log('[Health Widget] ContactDetail.state._linkedAccountId:', window.ContactDetail.state._linkedAccountId);
        if (window.ContactDetail.state._linkedAccountId) {
          const accountId = window.ContactDetail.state._linkedAccountId;
          console.log('[Health Widget] Found account ID from ContactDetail.state:', accountId);
          return accountId;
        }
      } else {
        console.log('[Health Widget] ContactDetail or state not available');
      }
      
      // Fallback: Try to get from the current contact's accountId field
      if (currentEntityType === 'contact' && currentEntityId && typeof window.getPeopleData === 'function') {
        console.log('[Health Widget] Attempting fallback method - getPeopleData available:', typeof window.getPeopleData);
        const people = window.getPeopleData() || [];
        console.log('[Health Widget] People data length:', people.length);
        const contact = people.find(p => String(p.id || '') === String(currentEntityId));
        console.log('[Health Widget] Found contact:', !!contact, 'Contact data:', contact);
        if (contact && (contact.accountId || contact.account_id)) {
          const accountId = contact.accountId || contact.account_id;
          console.log('[Health Widget] Found account ID from contact data:', accountId);
          return accountId;
        } else {
          console.log('[Health Widget] No accountId found in contact data');
        }
      } else {
        console.log('[Health Widget] Fallback conditions not met:', {
          isContact: currentEntityType === 'contact',
          hasEntityId: !!currentEntityId,
          hasGetPeopleData: typeof window.getPeopleData === 'function'
        });
      }
      
      // Try to get the linked account ID from the contact detail page DOM
      const contactDetailView = document.getElementById('contact-detail-view');
      console.log('[Health Widget] contact-detail-view found:', !!contactDetailView);
      
      // Broad DOM scan: anywhere on the page
      const anyAccountLink = document.querySelector('[data-account-id]');
      console.log('[Health Widget] Global data-account-id element found:', !!anyAccountLink, anyAccountLink);
      if (anyAccountLink) {
        const accountId = anyAccountLink.getAttribute('data-account-id');
        console.log('[Health Widget] Found account ID from global DOM scan:', accountId);
        return accountId;
      }
      
      if (contactDetailView) {
        // Look for the linked account ID inside the contact view
        const accountLink = contactDetailView.querySelector('[data-account-id]');
        console.log('[Health Widget] accountLink element found inside contact view:', !!accountLink);
        if (accountLink) {
          const accountId = accountLink.getAttribute('data-account-id');
          console.log('[Health Widget] Found account ID from contact view DOM:', accountId);
          return accountId;
        }
        
        // Try to find account ID by matching company name with accounts cache
        try {
          const companyLink = contactDetailView.querySelector('#contact-company-link');
          const companyName = companyLink ? (companyLink.getAttribute('data-account-name') || companyLink.textContent || '').trim() : '';
          console.log('[Health Widget] Company name from DOM for fallback:', companyName);
          if (companyName && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            const key = norm(companyName);
            const match = accounts.find(a => norm(a.accountName || a.name || a.companyName) === key);
            if (match && match.id) {
              console.log('[Health Widget] Matched account by company name fallback:', match.id, match);
              return match.id;
            }
          }
        } catch(e) { console.log('[Health Widget] Company name fallback error:', e); }
        
        console.log('[Health Widget] No account ID found in DOM');
      } else {
        console.log('[Health Widget] No contact-detail-view found');
      }
      return null;
    } catch(e) { 
      console.log('[Health Widget] Error in getLinkedAccountId:', e);
      return null; 
    }
  }

  const ESTIMATED_DELIVERY_CHARGE_CENTS = 0.05;

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function removeExistingWidget() {
    try { if (typeof unsub === 'function') { unsub(); } } catch (_) { /* noop */ }
    unsub = null;
    const existing = document.getElementById(WIDGET_ID);
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  function closeHealthWidget() {
    // Unsubscribe first
    try { if (typeof unsub === 'function') { unsub(); } } catch (_) { /* noop */ }
    unsub = null;
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
    card.className = 'widget-card health-card';
    card.id = WIDGET_ID;

    card.innerHTML = `
      <div class="widget-card-header">
        <h4 class="widget-title">Energy Health Check</h4>
        <button type="button" class="btn-text health-close" title="Close" aria-label="Close">×</button>
      </div>
      <div class="health-body">
        <div class="health-entity-info" id="health-entity-info">
          <div class="health-entity-name" id="health-entity-name">Loading...</div>
          <div class="health-entity-type">${entityType === 'account' ? 'Account' : 'Contact'}</div>
        </div>
        <p class="health-subtitle">Calculate potential savings analysis based on key ${entityType} details.</p>
        
        <div class="health-form-sections">
          <!-- Section 1: Current Bill -->
          <div class="health-form-section active" id="health-section1">
            <div class="health-section-header">
              <span class="health-section-pill active">
                <span class="health-section-icon">1</span> Current Bill
              </span>
            </div>
            <div class="health-inputs">
              <div class="health-input-group">
                <label for="health-supplier" class="health-input-label">Current Supplier</label>
                <input type="text" class="health-form-input" id="health-supplier" placeholder="e.g., TXU" list="health-supplier-list">
                <datalist id="health-supplier-list">
                  ${supplierNames.map(name => `<option value="${name}">`).join('')}
                </datalist>
              </div>
              <div class="health-input-group">
                <label for="health-monthly-bill" class="health-input-label">Monthly Bill ($)</label>
                <input type="number" class="health-form-input" id="health-monthly-bill" placeholder="e.g., 1,450.00" step="0.01">
              </div>
              <div class="health-input-group">
                <label for="health-current-rate" class="health-input-label">Current Rate ($/kWh)</label>
                <input type="number" class="health-form-input" id="health-current-rate" placeholder="e.g., 0.062" step="0.001">
                <div id="health-rate-feedback" class="health-input-feedback hidden"></div>
              </div>
            </div>
            <div id="health-usage-display" class="health-usage-display hidden">
              <div class="health-usage-title">📊 Usage Analysis</div>
              <div class="health-usage-details" id="health-usage-details"></div>
            </div>
          </div>

          <!-- Section 2: Contract & Sell Rate -->
          <div class="health-form-section" id="health-section2">
            <div class="health-section-header">
              <span class="health-section-pill">
                <span class="health-section-icon">2</span> Contract & Sell Rate
              </span>
            </div>
            <div class="health-inputs">
              <div class="health-input-group">
                <label for="health-contract-end" class="health-input-label">Contract End Date</label>
                <input type="date" class="health-form-input" id="health-contract-end">
              </div>
              <div class="health-input-group">
                <label for="health-sell-rate" class="health-input-label">Sell Rate ($/kWh)</label>
                <input type="number" class="health-form-input" id="health-sell-rate" placeholder="e.g., 0.088" step="0.001">
              </div>
            </div>
          </div>

          <!-- CTA Section: Calculate button in its own container directly below Step 2 -->
          <div class="health-form-section" id="health-section-cta">
            <button class="health-calculate-btn" id="health-calculate-btn">
              Complete All Sections Above
            </button>
          </div>

          <!-- Section 3: Get Results -->
          <div class="health-form-section" id="health-section3">
            <div class="health-section-header">
              <span class="health-section-pill">
                <span class="health-section-icon">3</span> Get Results
              </span>
            </div>
            <p class="health-ready-text">Ready to see the analysis!</p>
          </div>
        </div>

        <div class="health-button-group">
          <button class="health-reset-btn" id="health-reset-btn">Reset Form</button>
        </div>

        <div id="health-loading" class="health-loading hidden">
          <div class="health-spinner"></div>
          <div class="health-loading-text">Running analysis...</div>
        </div>

        <div id="health-results" class="health-results hidden"></div>
      </div>
    `;

    // Wire up event handlers
    setupHealthCardEvents(card, entityId, entityType);

    return card;
  }

  // Helper to read detail page DOM elements
  function readDetailFieldDOM(field) {
    const contactDetail = document.getElementById('contact-detail-view');
    const accountDetail = document.getElementById('account-detail-view');

    let fieldWrap = null;
    if (contactDetail) {
      fieldWrap = contactDetail.querySelector(`[data-field="${field}"]`);
    }
    if (!fieldWrap && accountDetail) {
      fieldWrap = accountDetail.querySelector(`[data-field="${field}"]`);
    }

    if (fieldWrap) {
      const valueEl = fieldWrap.querySelector('.value');
      if (valueEl) {
        const text = valueEl.textContent?.trim() || '';
        return text === '--' ? '' : text;
      }
    }
    return '';
  }

  // Helper to update detail page DOM elements
  function updateDetailFieldDOM(field, value) {
    const contactDetail = document.getElementById('contact-detail-view');
    const accountDetail = document.getElementById('account-detail-view');

    let fieldWrap = null;
    if (contactDetail) {
      fieldWrap = contactDetail.querySelector(`[data-field="${field}"]`);
    }
    if (!fieldWrap && accountDetail) {
      fieldWrap = accountDetail.querySelector(`[data-field="${field}"]`);
    }

    if (fieldWrap) {
      const valueEl = fieldWrap.querySelector('.value');
      if (valueEl) {
        valueEl.textContent = value !== null ? String(value) : '--';
      }
    }
  }

  function setupHealthCardEvents(card, entityId, entityType) {
    const closeBtn = card.querySelector('.health-close');
    const calculateBtn = card.querySelector('#health-calculate-btn');
    const resetBtn = card.querySelector('#health-reset-btn');
    
    // Form inputs
    const supplierInput = card.querySelector('#health-supplier');
    const monthlyBillInput = card.querySelector('#health-monthly-bill');
    const annualUsageInput = card.querySelector('#health-annual-usage');
    const currentRateInput = card.querySelector('#health-current-rate');
    const contractEndInput = card.querySelector('#health-contract-end');
    const sellRateInput = card.querySelector('#health-sell-rate');

    let section1Complete = false, section2Complete = false;
    let currentAnnualUsage = 0, currentMonthlyBill = 0, currentRate = 0, sellRate = 0, currentSupplier = '';

    // ==== Helpers: Firestore persistence and DOM updates ====
    function getCollectionName(){ return entityType === 'account' ? 'accounts' : 'contacts'; }
    async function saveEntityFields(patch){
      try {
        if (!window.firebaseDB || !entityId) return;
        const db = window.firebaseDB;
        // For contact context, always persist Energy fields to the LINKED ACCOUNT
        if (entityType === 'contact') {
          const linkedAccountId = getLinkedAccountId(entityType, entityId);
          if (!linkedAccountId) { console.warn('[Health] No linked account id found for contact; skipping save'); return; }
          await db.collection('accounts').doc(String(linkedAccountId)).set(patch, { merge: true });
          return;
        }
        // Default: account context saves to accounts
        await db.collection('accounts').doc(String(entityId)).set(patch, { merge: true });
      } catch (e) { console.warn('[Health] saveEntityFields failed', e); }
    }
    function updateDetailFieldDOM(field, value){
      try {
        const scopeId = entityType === 'account' ? 'account-detail-view' : 'contact-detail-view';
        const root = document.getElementById(scopeId);
        if (!root) return;
        
        const fieldWrap = root.querySelector(`.info-value-wrap[data-field="${field}"]`);
        if (!fieldWrap) return;
        
        // Check if field is in editing mode
        const isEditing = fieldWrap.classList.contains('editing');
        
        if (isEditing) {
          // Update the input field value when in editing mode
          const inputEl = fieldWrap.querySelector('.info-edit-input');
          if (inputEl) {
            let inputValue = value || '';
            if (field === 'contractEndDate' && value) {
              // Convert MM/DD/YYYY to YYYY-MM-DD for date input
              const d = parseDateFlexible(value);
              if (d) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                inputValue = `${yyyy}-${mm}-${dd}`;
              }
            }
            inputEl.value = inputValue;
          }
        } else {
          // Update the text element when not in editing mode
          const textEl = fieldWrap.querySelector('.info-value .info-value-text') || fieldWrap.querySelector('.info-value-text');
          if (textEl) {
            let display = (value !== undefined && value !== null && String(value).trim() !== '') ? String(value) : '';
            if (field === 'contractEndDate' && display) display = toMDY(display);
            textEl.textContent = display || '--';
          }
        }
      } catch(_) {}
    }
    
    function debounce(fn, ms){ let t; return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), ms); }; }

    const formatNumber = num => Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Smoothly adjust the card height whenever inner content changes
    function animateAutoHeight() {
      try {
        const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduce) return; // let layout snap on reduced motion

        // Capture current and target heights
        const startHeight = card.offsetHeight;
        // Temporarily clear inline height to measure natural size
        const prevHeight = card.style.height;
        card.style.height = '';
        const targetHeight = card.scrollHeight;
        card.style.height = prevHeight;

        if (!isFinite(startHeight) || !isFinite(targetHeight) || Math.abs(targetHeight - startHeight) < 1) return;

        card.style.overflow = 'hidden';
        card.style.height = startHeight + 'px';
        // Force reflow
        void card.offsetHeight;
        card.style.transition = 'height 320ms ease-out';
        card.style.height = targetHeight + 'px';
        const onEnd = () => {
          card.removeEventListener('transitionend', onEnd);
          card.style.transition = '';
          card.style.height = '';
          card.style.overflow = '';
        };
        card.addEventListener('transitionend', onEnd);
      } catch (_) { /* noop */ }
    }

    // Listen for energy updates from detail pages to populate widget inputs
    const onEnergyUpdated = (e) => {
      try {
        const d = e.detail || {};
        console.log('[Health Widget] Received energy-updated event:', d);
        console.log('[Health Widget] Current entityType:', entityType, 'entityId:', entityId);
        
        // For contacts, energy data is stored in the linked account, so we need to check both
        let matches = false;
        if (entityType === 'contact') {
          // Check if this is an account update for the linked account
          const linkedAccountId = getLinkedAccountId(entityType, entityId);
          console.log('[Health Widget] Contact mode - linkedAccountId:', linkedAccountId);
          matches = (d.entity === 'account') && (String(d.id||'') === String(linkedAccountId||''));
          console.log('[Health Widget] Contact mode - matches:', matches, 'event entity:', d.entity, 'event id:', d.id, 'linked id:', linkedAccountId);
        } else {
          // For accounts, match directly
          matches = (d.entity === entityType) && (String(d.id||'') === String(entityId||''));
          console.log('[Health Widget] Account mode - matches:', matches, 'event entity:', d.entity, 'event id:', d.id, 'current id:', entityId);
        }
        if (!matches) {
          console.log('[Health Widget] Event does not match, ignoring');
          return;
        }
        
        console.log('[Health Widget] Event matches! Updating widget inputs for field:', d.field, 'value:', d.value);
        
        // Update widget inputs based on the field that was updated
        console.log('[Health Widget] Updating widget inputs for field:', d.field, 'value:', d.value);
        if (d.field === 'electricitySupplier' && supplierInput) {
          console.log('[Health Widget] Updating supplier input from:', supplierInput.value, 'to:', (d.value || '').trim());
          supplierInput.value = (d.value || '').trim();
          console.log('[Health Widget] Updated supplier input to:', supplierInput.value);
        }
        if (d.field === 'annualUsage' && annualUsageInput) {
          annualUsageInput.value = (d.value || '').trim();
          console.log('[Health Widget] Updated annual usage input to:', annualUsageInput.value);
        }
        if (d.field === 'currentRate' && currentRateInput) {
          currentRateInput.value = (d.value || '');
          console.log('[Health Widget] Updated current rate input to:', currentRateInput.value);
        }
        if (d.field === 'contractEndDate' && contractEndInput) {
          const contractVal = d.value || '';
          console.log('[Health Widget] Contract end date update - raw value:', contractVal);
          // Date inputs require YYYY-MM-DD format, not MM/DD/YYYY
          const formattedValue = contractVal ? toISODate(contractVal) : '';
          console.log('[Health Widget] Contract end date update - formatted value (ISO):', formattedValue);
          contractEndInput.value = formattedValue;
          console.log('[Health Widget] Updated contract end input to:', contractEndInput.value);
        }
        
        // Re-run validations to update UI state
        validateSection1();
        validateSection2();
      } catch(_) {}
    };
    
    console.log('[Health Widget] Setting up pc:energy-updated event listener');
    
    // Remove any existing listener to prevent duplicates
    document.removeEventListener('pc:energy-updated', onEnergyUpdated);
    document.addEventListener('pc:energy-updated', onEnergyUpdated);
    
    // Add a small delay to ensure event listener is fully registered
    setTimeout(() => {
      console.log('[Health Widget] Event listener setup complete');
    }, 100);
    
    // Clean up listener when widget is closed
    card.addEventListener('health:cleanup', () => { 
      document.removeEventListener('pc:energy-updated', onEnergyUpdated); 
    });

    const validateSection1 = () => {
      const supplierValue = supplierInput.value.trim();
      currentMonthlyBill = parseFloat(monthlyBillInput.value);
      currentRate = parseFloat(currentRateInput.value);
      
      const rateFeedback = card.querySelector('#health-rate-feedback');
      const usageDisplay = card.querySelector('#health-usage-display');
      const usageDetails = card.querySelector('#health-usage-details');

      rateFeedback.className = 'health-input-feedback hidden';
      usageDisplay.classList.add('hidden');
      
      if (supplierValue && supplierNames.includes(supplierValue) && currentMonthlyBill > 0 && currentRate > 0) {
        currentSupplier = supplierValue;
        const effectiveCurrentRateAllIn = currentRate + ESTIMATED_DELIVERY_CHARGE_CENTS;
        
        if (effectiveCurrentRateAllIn <= 0.10) {
          rateFeedback.className = 'health-input-feedback feedback-danger';
          rateFeedback.textContent = '🚨 Very old rate - significant increase expected at renewal';
        } else if (effectiveCurrentRateAllIn <= 0.12) {
          rateFeedback.className = 'health-input-feedback feedback-warning';
          rateFeedback.textContent = '⚠️ Below market rate - likely increase ahead';
        } else if (effectiveCurrentRateAllIn <= 0.145) {
          rateFeedback.className = 'health-input-feedback feedback-success';
          rateFeedback.textContent = '✅ Current market range - competitive rate';
        } else {
          rateFeedback.className = 'health-input-feedback feedback-info';
          rateFeedback.textContent = '💰 Above market - savings opportunity available';
        }
        
        const monthlyUsage = (currentMonthlyBill / effectiveCurrentRateAllIn);
        currentAnnualUsage = monthlyUsage * 12;
        usageDisplay.classList.remove('hidden');
        let businessSize = (currentAnnualUsage < 50000) ? 'Small Business' : (currentAnnualUsage < 200000) ? 'Medium Business' : 'Large Business';
        usageDetails.innerHTML = `<strong>Monthly Usage:</strong> ${formatNumber(monthlyUsage)} kWh<br><strong>Annual Usage:</strong> ${formatNumber(currentAnnualUsage)} kWh<br><strong>Business Size:</strong> ${businessSize}`;
        
        section1Complete = true;
        card.querySelector('#health-section1').classList.add('completed');
        card.querySelector('#health-section1 .health-section-pill').classList.add('completed');
        card.querySelector('#health-section1 .health-section-icon').innerHTML = '✓';
        activateSection(2);
      } else {
        section1Complete = false;
        card.querySelector('#health-section1').classList.remove('completed');
        card.querySelector('#health-section1 .health-section-pill').classList.remove('completed');
        card.querySelector('#health-section1 .health-section-icon').innerHTML = '1';
        
        // Reset subsequent sections
        card.querySelector('#health-section2').classList.remove('active', 'completed');
        card.querySelector('#health-section2 .health-section-pill').classList.remove('active', 'completed');
        card.querySelector('#health-section2 .health-section-icon').innerHTML = '2';
        card.querySelector('#health-section3').classList.remove('active', 'completed');
        card.querySelector('#health-section3 .health-section-pill').classList.remove('active', 'completed');
        card.querySelector('#health-section3 .health-section-icon').innerHTML = '3';
        section2Complete = false;
      }
      updateButton();
      // Ensure the widget grows/shrinks with newly revealed helper boxes
      animateAutoHeight();
    };

    const validateSection2 = () => {
      const contractEndDate = contractEndInput.value;
      sellRate = parseFloat(sellRateInput.value);
      
      if (contractEndDate && sellRate > 0) {
        section2Complete = true;
        card.querySelector('#health-section2').classList.add('completed');
        card.querySelector('#health-section2 .health-section-pill').classList.add('completed');
        card.querySelector('#health-section2 .health-section-icon').innerHTML = '✓';
        activateSection(3);
      } else {
        section2Complete = false;
        card.querySelector('#health-section2').classList.remove('completed');
        card.querySelector('#health-section2 .health-section-pill').classList.remove('completed');
        card.querySelector('#health-section2 .health-section-pill').classList.add('active');
        card.querySelector('#health-section2 .health-section-icon').innerHTML = '2';

        card.querySelector('#health-section3').classList.remove('active', 'completed');
        card.querySelector('#health-section3 .health-section-pill').classList.remove('active', 'completed');
        card.querySelector('#health-section3 .health-section-icon').innerHTML = '3';
      }
      updateButton();
      animateAutoHeight();
    };

    const activateSection = (sectionNumber) => {
      for (let i = 1; i <= 3; i++) {
        const section = card.querySelector(`#health-section${i}`);
        const pill = section.querySelector('.health-section-pill');
        const icon = pill.querySelector('.health-section-icon');
        if (i < sectionNumber) {
          section.classList.remove('active');
          section.classList.add('completed');
          pill.classList.remove('active');
          pill.classList.add('completed');
          icon.innerHTML = '✓';
        } else if (i === sectionNumber) {
          section.classList.add('active');
          section.classList.remove('completed');
          pill.classList.add('active');
          pill.classList.remove('completed');
          icon.innerHTML = i;
        } else {
          section.classList.remove('active', 'completed');
          pill.classList.remove('active', 'completed');
          icon.innerHTML = i;
        }
      }
    };

    const updateButton = () => {
      const isReady = section1Complete && section2Complete;
      calculateBtn.classList.toggle('ready', isReady);
      calculateBtn.textContent = isReady ? 'Calculate Savings Potential' : 'Complete All Sections Above';
    };

    const runCalculation = () => {
      if (!section1Complete || !section2Complete || !isFinite(currentMonthlyBill) || !isFinite(currentRate) || !isFinite(sellRate) || !supplierNames.includes(currentSupplier)) {
        console.warn("Attempted to calculate results before all sections were complete or with invalid data.");
        return;
      }
      
      const loading = card.querySelector('#health-loading');
      loading.classList.remove('hidden');
      
      setTimeout(() => calculateResults(), 1500);
    };

    const calculateResults = async () => {
      try {
        const contractEndDateStr = contractEndInput.value;
        const effectiveSellRateAllIn = sellRate + ESTIMATED_DELIVERY_CHARGE_CENTS;
        const annualCurrentCost = currentMonthlyBill * 12;
        const annualProjectedCost = (currentAnnualUsage * effectiveSellRateAllIn);
        const annualSavingsOrIncrease = annualCurrentCost - annualProjectedCost;
        const monthlySavingsOrIncrease = annualSavingsOrIncrease / 12;
        const percentageChange = (annualSavingsOrIncrease / annualCurrentCost) * 100;
        
        const currentSupplierData = supplierData[currentSupplier] || { bbbRating: 'N/A', popularity: 1, customerService: 1 };
        
        // Calculate Energy Health Score
        const savingsFactor = Math.min(Math.max((percentageChange + 100), 0), 200) / 2;
        const supplierFactor = ((currentSupplierData.popularity || 1) + (currentSupplierData.customerService || 1)) / 10 * 100;
        const energyHealthScore = Math.round((savingsFactor * 0.7) + (supplierFactor * 0.3));

        // Generate actionable tips (simplified version)
        const today = new Date();
        const contractEndDate = new Date(contractEndDateStr);
        const monthsUntilExpiration = (contractEndDate.getFullYear() - today.getFullYear()) * 12 + (contractEndDate.getMonth() - today.getMonth());
        
        let actionableTips = '';
        const tolerancePercentage = 0.5;

        if (monthsUntilExpiration > 36) {
          if (percentageChange > 40) {
            actionableTips = '<strong>Consider Cancelling:</strong> With savings over 40%, it may be worth cancelling your current agreement.';
          } else {
            actionableTips = '<strong>No Action Needed:</strong> Your contract expires far in the future. Monitor the market.';
          }
        } else if (monthsUntilExpiration >= 6 && monthsUntilExpiration <= 12) {
          actionableTips = '<strong>Optimal Renewal Time:</strong> Your contract is approaching its renewal window. Secure a new plan now.';
        } else {
          actionableTips = '<strong>Strategic Planning:</strong> Based on your contract end date, start monitoring rates for renewal.';
        }

        let resultAmountClass = '', resultLabelText = '', mainResultClass = '';
        if (annualSavingsOrIncrease > (annualCurrentCost * (tolerancePercentage / 100))) {
          resultAmountClass = 'positive'; mainResultClass = 'savings'; resultLabelText = 'Potential Annual Savings';
        } else if (annualSavingsOrIncrease < -(annualCurrentCost * (tolerancePercentage / 100))) {
          resultAmountClass = 'negative'; mainResultClass = 'increase'; resultLabelText = 'Projected Annual Increase Risk';
        } else {
          resultAmountClass = 'neutral'; mainResultClass = 'neutral'; resultLabelText = 'No Significant Change Projected';
        }
        
        // Hide the form sections and show only results
        const formSections = card.querySelector('.health-form-sections');
        const calculateBtn = card.querySelector('#health-calculate-btn');
        const resetBtn = card.querySelector('#health-reset-btn');
        
        if (formSections) formSections.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
        // Hide calculate button only after results are shown
        if (calculateBtn) calculateBtn.style.display = 'none';
        
        const resultsContainer = card.querySelector('#health-results');
        resultsContainer.innerHTML = `
          <div class="health-main-result ${mainResultClass}">
            <div class="health-result-amount ${resultAmountClass}">$${formatNumber(Math.abs(annualSavingsOrIncrease))}</div>
            <div class="health-result-label">${resultLabelText}</div>
          </div>
          <div class="health-details-grid">
            <div class="health-detail-item">
              <div class="health-detail-value">${energyHealthScore}%</div>
              <div class="health-detail-label">Energy Health Score</div>
            </div>
            <div class="health-detail-item">
              <div class="health-detail-value">${currentSupplierData.bbbRating}</div>
              <div class="health-detail-label">Supplier BBB Rating</div>
            </div>
            <div class="health-detail-item health-detail-monthly">
              <div class="health-detail-value">$${formatNumber(Math.abs(monthlySavingsOrIncrease))}</div>
              <div class="health-detail-label">${resultLabelText.replace('Annual', 'Monthly')}</div>
            </div>
          </div>
          <div class="health-analysis-box">
            <div class="health-analysis-title">
              <svg class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.7-4.7 1.4 1.4Z"/></svg>
              Recommended Next Steps
            </div>
            <div class="health-analysis-text">${actionableTips}</div>
          </div>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light);">
            <div style="margin-bottom: 12px; font-size: 14px; color: var(--text-secondary); display:flex; align-items:center; gap:8px;">
              <svg class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3Zm0 6h18v2H3Zm0 6h18v2H3Z"/></svg>
              <strong>Analysis Details</strong>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; color: var(--text-muted);">
              <div><strong>Supplier:</strong> ${currentSupplier}</div>
              <div><strong>Monthly Bill:</strong> $${formatNumber(currentMonthlyBill)}</div>
              <div><strong>Current Rate:</strong> $${currentRate.toFixed(3)}/kWh</div>
              <div><strong>Contract Ends:</strong> ${contractEndDateStr}</div>
              <div><strong>Sell Rate:</strong> $${sellRate.toFixed(3)}/kWh</div>
              <div><strong>Annual Usage:</strong> ${formatNumber(currentAnnualUsage)} kWh</div>
            </div>
          </div>
          <button class="health-reset-btn" id="health-reset-bottom" style="margin-top: 20px;">Reset Form</button>
        `;
        
        resultsContainer.classList.remove('hidden');
        
        // Add event listener for the bottom reset button
        const bottomResetBtn = card.querySelector('#health-reset-bottom');
        if (bottomResetBtn) {
          bottomResetBtn.addEventListener('click', resetForm);
        }
        
        // Resize the widget to fit the results content smoothly
        animateAutoHeight();

      } catch (error) {
        console.error("An error occurred during calculation:", error);
        // Show calculate button again if there was an error
        const calculateBtn = card.querySelector('#health-calculate-btn');
        if (calculateBtn) calculateBtn.style.display = 'block';
      } finally {
        card.querySelector('#health-loading').classList.add('hidden');
      }
    };

    const resetForm = () => {
      supplierInput.value = '';
      monthlyBillInput.value = '';
      currentRateInput.value = '';
      sellRateInput.value = '';
      contractEndInput.value = '';
      card.querySelector('#health-usage-display').classList.add('hidden');
      card.querySelector('#health-rate-feedback').className = 'health-input-feedback hidden';
      card.querySelector('#health-results').classList.add('hidden');
      
      // Show the form sections again
      const formSections = card.querySelector('.health-form-sections');
      const calculateBtn = card.querySelector('#health-calculate-btn');
      const resetBtn = card.querySelector('#health-reset-btn');
      
      if (formSections) formSections.style.display = 'block';
      if (calculateBtn) calculateBtn.style.display = 'block';
      if (resetBtn) resetBtn.style.display = 'block';
      
      section1Complete = false;
      section2Complete = false;

      activateSection(1);
      updateButton();
      animateAutoHeight();
    };

    // Event listeners
    if (closeBtn) closeBtn.addEventListener('click', () => closeHealthWidget());
    if (calculateBtn) calculateBtn.addEventListener('click', runCalculation);
    if (resetBtn) resetBtn.addEventListener('click', resetForm);
    
    if (supplierInput) supplierInput.addEventListener('input', validateSection1);
    if (monthlyBillInput) monthlyBillInput.addEventListener('input', validateSection1);
    if (currentRateInput) currentRateInput.addEventListener('input', validateSection1);
    if (contractEndInput) contractEndInput.addEventListener('input', validateSection2);
    if (sellRateInput) sellRateInput.addEventListener('input', validateSection2);

    // Real-time updates to detail page AND Firebase
    if (supplierInput) {
      supplierInput.addEventListener('input', () => {
        const value = supplierInput.value.trim() || null;
        updateDetailFieldDOM('electricitySupplier', value);
        saveToFirebase('electricitySupplier', value);
      });
    }

    if (annualUsageInput) {
      annualUsageInput.addEventListener('input', () => {
        const value = annualUsageInput.value.trim() || null;
        updateDetailFieldDOM('annualUsage', value);
        saveToFirebase('annualUsage', value);
      });
    }

    if (currentRateInput) {
      currentRateInput.addEventListener('input', () => {
        const value = currentRateInput.value !== '' ? currentRateInput.value : null;
        updateDetailFieldDOM('currentRate', value);
        saveToFirebase('currentRate', value);
      });
    }

    if (contractEndInput) {
      contractEndInput.addEventListener('input', () => {
        const contractVal = contractEndInput.value;
        const contractValFormatted = contractVal ? toMDY(contractVal) : null;
        updateDetailFieldDOM('contractEndDate', contractValFormatted);
        saveToFirebase('contractEndDate', contractValFormatted);
      });
    }

    // Save to Firebase function
    async function saveToFirebase(field, value) {
      try {
        console.log('[Health Widget] Saving to Firebase:', { field, value, entityType, entityId });
        
        let targetEntityId = entityId;
        let targetEntityType = entityType;
        
        // For contacts, save to the linked account
        if (entityType === 'contact') {
          const linkedAccountId = getLinkedAccountId(entityType, entityId);
          if (linkedAccountId) {
            targetEntityId = linkedAccountId;
            targetEntityType = 'account';
            console.log('[Health Widget] Contact mode - saving to linked account:', linkedAccountId);
          } else {
            console.log('[Health Widget] No linked account found for contact');
            return;
          }
        }
        
        const db = window.firebaseDB;
        if (!db) {
          console.log('[Health Widget] No Firebase database available');
          return;
        }
        
        const payload = { [field]: value, updatedAt: Date.now() };
        console.log('[Health Widget] Saving payload:', { targetEntityId, payload });
        
        await db.collection('accounts').doc(targetEntityId).update(payload);
        console.log('[Health Widget] Firebase save successful');
        
        // Update local cache if available
        if (typeof window.getAccountsData === 'function') {
          const accounts = window.getAccountsData() || [];
          const idx = accounts.findIndex(a => a.id === targetEntityId);
          if (idx !== -1) {
            try { accounts[idx][field] = value; } catch(_) {}
            console.log('[Health Widget] Updated local cache for account:', targetEntityId);
          }
        }
        
        // Dispatch energy-updated event to sync other components
        try { 
          const eventDetail = { entity: 'account', id: targetEntityId, field, value };
          console.log('[Health Widget] About to dispatch energy-updated event:', eventDetail);
          document.dispatchEvent(new CustomEvent('pc:energy-updated', { detail: eventDetail })); 
          console.log('[Health Widget] Dispatched energy-updated event successfully');
        } catch(e) { 
          console.log('[Health Widget] Error dispatching event:', e);
        }
        
      } catch (error) {
        console.error('[Health Widget] Error saving to Firebase:', error);
      }
    }

    // Two-way sync helpers
    async function applyPatchAndUpdateCaches(patch){
      await saveEntityFields(patch);
      let targetEntity = 'account';
      let targetId = entityId;
      try {
        if (entityType === 'contact') {
          const linkedAccountId = getLinkedAccountId(entityType, entityId);
          if (linkedAccountId) targetId = linkedAccountId;
          // Update account cache since we persist to account when in contact context
          if (typeof window.getAccountsData === 'function'){
            const arr = window.getAccountsData() || [];
            const obj = arr.find(a => String(a.id||'') === String(targetId));
            if (obj) Object.assign(obj, patch);
          }
        } else if (entityType === 'account' && typeof window.getAccountsData === 'function'){
          const arr = window.getAccountsData() || [];
          const obj = arr.find(a => String(a.id||'') === String(entityId));
          if (obj) Object.assign(obj, patch);
        }
      } catch(_) {}
      
      // Dispatch energy-updated events for each field to notify details pages
      try {
        Object.keys(patch).forEach(field => {
          if (['electricitySupplier', 'currentRate', 'contractEndDate'].includes(field)) {
            document.dispatchEvent(new CustomEvent('pc:energy-updated', {
              detail: {
                entity: targetEntity,
                id: targetId,
                field: field,
                value: patch[field]
              }
            }));
          }
        });
      } catch(_) {}
    }

    // Simplified save - only on blur to prevent crashes
    async function simpleSave(){
      try {
        const supplierVal = (supplierInput?.value ?? '').trim();
        const rateVal = currentRateInput?.value ?? '';
        const contractVal = contractEndInput?.value ?? '';
        const contractValFormatted = contractVal ? toMDY(contractVal) : null;
        const patch = {
          electricitySupplier: supplierVal || null,
          currentRate: rateVal !== '' ? rateVal : null,
          contractEndDate: contractValFormatted
        };
        
        await applyPatchAndUpdateCaches(patch);
        try { window.crm?.showToast && window.crm.showToast('Saved'); } catch(_) {}
      } catch(_) {}
    }

    // Only save on blur to prevent crashes
    if (supplierInput) supplierInput.addEventListener('blur', simpleSave);
    if (currentRateInput) currentRateInput.addEventListener('blur', simpleSave);
    if (contractEndInput) contractEndInput.addEventListener('blur', simpleSave);

    // Add click handler to entity info for navigation
    const entityInfoEl = card.querySelector('#health-entity-info');
    if (entityInfoEl) {
      entityInfoEl.addEventListener('click', () => {
        try {
          // Store current page for back navigation
          const currentPage = document.querySelector('.page.active')?.id || 'call-scripts-page';
          sessionStorage.setItem('health-widget-return-page', currentPage);
          
          // Navigate to the appropriate details page
          if (entityType === 'account' && entityId) {
            // Navigate to account details
            if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
              window.AccountDetail.show(entityId);
            }
          } else if (entityType === 'contact' && entityId) {
            // Navigate to people page first, then show contact detail
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Use requestAnimationFrame to ensure the page has started loading
              requestAnimationFrame(() => {
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  window.ContactDetail.show(entityId);
                }
              });
            }
          } else if (entityId) {
            // Default to contact if entityType is unclear
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              requestAnimationFrame(() => {
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  window.ContactDetail.show(entityId);
                }
              });
            }
          }
        } catch (error) {
          console.error('[Health Widget] Navigation error:', error);
        }
      });
    }

    // Initialize
    activateSection(1);
    updateButton();

    // Update entity name display
    const updateEntityName = () => {
      try {
        const entityNameEl = card.querySelector('#health-entity-name');
        if (!entityNameEl) return;
        
        if (entityType === 'account' && typeof window.getAccountsData === 'function') {
          const accounts = window.getAccountsData() || [];
          const account = accounts.find(a => String(a.id || '') === String(entityId));
          if (account) {
            const name = account.accountName || account.name || account.companyName || 'Unknown Account';
            entityNameEl.textContent = name;
          } else {
            entityNameEl.textContent = 'Account Not Found';
          }
        } else if (entityType === 'contact' && typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          const contact = people.find(p => String(p.id || '') === String(entityId));
          if (contact) {
            const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown Contact';
            entityNameEl.textContent = name;
          } else {
            entityNameEl.textContent = 'Contact Not Found';
          }
        }
      } catch (_) {
        const entityNameEl = card.querySelector('#health-entity-name');
        if (entityNameEl) entityNameEl.textContent = 'Error Loading';
      }
    };

    // Pre-populate from entity data if available (supplier, current rate, contract end)
    try {
      console.log('[Health Widget] Pre-populating widget data for entityType:', entityType, 'entityId:', entityId);
      console.log('[Health Widget] Widget initialization context - window.ContactDetail exists:', !!window.ContactDetail);
      console.log('[Health Widget] Widget initialization context - window.AccountDetail exists:', !!window.AccountDetail);
      if (window.ContactDetail && window.ContactDetail.state) {
        console.log('[Health Widget] ContactDetail.state._linkedAccountId:', window.ContactDetail.state._linkedAccountId);
      }
      
      // Update entity name first
      updateEntityName();
      
      // Priority 1: Read from detail page DOM (most current data)
      const domSupplier = readDetailFieldDOM('electricitySupplier');
      const domRate = readDetailFieldDOM('currentRate');
      const domContract = readDetailFieldDOM('contractEndDate');
      
      console.log('[Health Widget] DOM data read:', { domSupplier, domRate, domContract });
      
      // Priority 2: For contacts, try to read from linked account data
      let supplier = domSupplier;
      let rate = domRate;
      let contract = domContract;
      
      if (entityType === 'contact' && (!supplier || !rate || !contract)) {
        const linkedAccountId = getLinkedAccountId(entityType, entityId);
        if (linkedAccountId && typeof window.getAccountsData === 'function') {
          const accounts = window.getAccountsData() || [];
          const linkedAccount = accounts.find(a => String(a.id || '') === String(linkedAccountId));
          if (linkedAccount) {
            console.log('[Health Widget] Found linked account data:', linkedAccount);
            if (!supplier && linkedAccount.electricitySupplier) supplier = linkedAccount.electricitySupplier;
            if (!rate && linkedAccount.currentRate) rate = linkedAccount.currentRate;
            if (!contract && linkedAccount.contractEndDate) contract = linkedAccount.contractEndDate;
            console.log('[Health Widget] Updated from linked account:', { supplier, rate, contract });
          }
        }
      }
      
      if (!supplier || !rate || !contract) {
      if (entityType === 'account' && typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(a => String(a.id || '') === String(entityId));
        if (account) {
            supplier = supplier || account.electricitySupplier || account.supplier || account.currentSupplier || '';
            rate = rate || account.currentRate || account.current_rate || '';
            contract = contract || account.contractEndDate || account.contract_end_date || account.contractEnd || account.contract_end || '';
        }
      } else if (entityType === 'contact' && typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        const contact = people.find(p => String(p.id || '') === String(entityId));
        if (contact) {
            supplier = supplier || contact.electricitySupplier || contact.supplier || contact.currentSupplier || '';
            rate = rate || contact.currentRate || contact.current_rate || '';
            contract = contract || contact.contractEndDate || contact.contract_end_date || contact.contractEnd || contact.contract_end || '';
          }
        }
      }
      
      // Set the values
      if (supplier) supplierInput.value = supplier;
      if (rate) currentRateInput.value = rate;
      if (contract) contractEndInput.value = toISODate(contract);
      validateSection1();
      validateSection2();
    } catch (_) { /* noop */ }

    // If Firestore has a saved result, show it immediately (auto-open results)
    (async () => {
      try {
        if (!window.firebaseDB || !entityId) return;
        const coll = getCollectionName();
        const snap = await window.firebaseDB.collection(coll).doc(String(entityId)).get();
        const data = snap && snap.exists ? (snap.data() || {}) : {};
        const saved = data.energyHealth;
        if (saved && saved.html) {
          const formSections = card.querySelector('.health-form-sections');
          const calculateBtn2 = card.querySelector('#health-calculate-btn');
          const resetBtn2 = card.querySelector('#health-reset-btn');
          if (formSections) formSections.style.display = 'none';
          if (calculateBtn2) calculateBtn2.style.display = 'none';
          if (resetBtn2) resetBtn2.style.display = 'none';
          const resultsContainer = card.querySelector('#health-results');
          resultsContainer.innerHTML = saved.html;
          resultsContainer.classList.remove('hidden');
          animateAutoHeight();
        }
      } catch (e) { console.warn('[Health] Load saved results failed', e); }
    })();
  }

  function openHealth(contactId) {
    currentContactId = contactId;
    currentAccountId = null;
    currentEntityType = 'contact';
    const content = getPanelContentEl();
    if (!content) {
      try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
      return;
    }
    if (!contactId) {
      try { window.crm?.showToast && window.crm.showToast('No contact selected'); } catch (_) {}
      return;
    }

    // Mount widget at the top of the panel content
    removeExistingWidget();
    const card = makeCard(contactId, 'contact');

    // Smooth expand-in animation that pushes other widgets down
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('health-anim'); } catch (_) {}
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      card.dataset._pt = String(pt);
      card.dataset._pb = String(pb);
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';

      requestAnimationFrame(() => {
        const target = card.scrollHeight;
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          card.style.transition = '';
          card.style.height = '';
          card.style.overflow = '';
          card.style.opacity = '';
          card.style.transform = '';
          card.style.paddingTop = '';
          card.style.paddingBottom = '';
          try { delete card.dataset._pt; delete card.dataset._pb; } catch (_) {}
          try { card.classList.remove('health-anim'); } catch (_) {}
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    // Bring panel into view
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    try { window.crm?.showToast && window.crm.showToast('Energy Health Check opened'); } catch (_) {}
  }

  function openHealthForAccount(accountId) {
    currentAccountId = accountId;
    currentContactId = null;
    currentEntityType = 'account';
    const content = getPanelContentEl();
    if (!content) {
      try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
      return;
    }
    if (!accountId) {
      try { window.crm?.showToast && window.crm.showToast('No account selected'); } catch (_) {}
      return;
    }

    // Mount widget at the top of the panel content
    removeExistingWidget();
    const card = makeCard(accountId, 'account');

    // Same animation as openHealth
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('health-anim'); } catch (_) {}
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      card.dataset._pt = String(pt);
      card.dataset._pb = String(pb);
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';

      requestAnimationFrame(() => {
        const target = card.scrollHeight;
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          card.style.transition = '';
          card.style.height = '';
          card.style.overflow = '';
          card.style.opacity = '';
          card.style.transform = '';
          card.style.paddingTop = '';
          card.style.paddingBottom = '';
          try { delete card.dataset._pt; delete card.dataset._pb; } catch (_) {}
          try { card.classList.remove('health-anim'); } catch (_) {}
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    // Bring panel into view
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    try { window.crm?.showToast && window.crm.showToast('Account Energy Health Check opened'); } catch (_) {}
  }

  window.Widgets.openHealth = openHealth;
  window.Widgets.openHealthForAccount = openHealthForAccount;
  // Expose close and is-open helpers for toggle behavior
  window.Widgets.closeHealth = closeHealthWidget;
  window.Widgets.isHealthOpen = function () { return !!document.getElementById(WIDGET_ID); };

  // Test function for debugging - can be called from browser console
  window.testHealthWidget = function() {
    console.log('[Health Widget] Test function called');
    console.log('[Health Widget] Current entityType:', entityType);
    console.log('[Health Widget] Current entityId:', entityId);
    console.log('[Health Widget] getLinkedAccountId test:', getLinkedAccountId(entityType, entityId));
    console.log('[Health Widget] Widget element exists:', !!document.getElementById('energy-health-widget'));
    console.log('[Health Widget] ContactDetail exists:', !!window.ContactDetail);
    console.log('[Health Widget] ContactDetail.state exists:', !!(window.ContactDetail && window.ContactDetail.state));
    console.log('[Health Widget] getPeopleData exists:', typeof window.getPeopleData);
    return {
      entityType,
      entityId,
      linkedAccountId: getLinkedAccountId(entityType, entityId),
      widgetExists: !!document.getElementById('energy-health-widget'),
      contactDetailExists: !!window.ContactDetail,
      contactDetailStateExists: !!(window.ContactDetail && window.ContactDetail.state),
      getPeopleDataExists: typeof window.getPeopleData
    };
  };

})();
