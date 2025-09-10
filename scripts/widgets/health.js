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

  // Supplier data from the original file
  const supplierData = {
    "NRG": { bbbRating: "A+", popularity: 4, customerService: 3 },
    "TXU": { bbbRating: "A+", popularity: 5, customerService: 4 },
    "APG & E": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
    "Reliant": { bbbRating: "A+", popularity: 5, customerService: 3 },
    "Hudson": { bbbRating: "Unaccredited", popularity: 2, customerService: 2 },
    "Green Mountain": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
    "Constellation": { bbbRating: "A+", popularity: 4, customerService: 4 },
    "Tara Energy": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
    "Cirro": { bbbRating: "A+", popularity: 3, customerService: 4 },
    "Engie": { bbbRating: "A+", popularity: 3, customerService: 1 },
    "Gexa": { bbbRating: "Unaccredited", popularity: 4, customerService: 2 },
    "Freepoint": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Shell Energy": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
    "Ironhorse": { bbbRating: "4.0 stars", popularity: 1, customerService: 3 },
    "Ammper Power": { bbbRating: "Unaccredited", popularity: 1, customerService: 1 }
  };
  const supplierNames = Object.keys(supplierData);

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

  function setupHealthCardEvents(card, entityId, entityType) {
    const closeBtn = card.querySelector('.health-close');
    const calculateBtn = card.querySelector('#health-calculate-btn');
    const resetBtn = card.querySelector('#health-reset-btn');
    
    // Form inputs
    const supplierInput = card.querySelector('#health-supplier');
    const monthlyBillInput = card.querySelector('#health-monthly-bill');
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
        const coll = getCollectionName();
        await window.firebaseDB.collection(coll).doc(String(entityId)).set(patch, { merge: true });
      } catch (e) { console.warn('[Health] saveEntityFields failed', e); }
    }
    function updateDetailFieldDOM(field, value){
      try {
        const scopeId = entityType === 'account' ? 'account-detail-view' : 'contact-detail-view';
        const root = document.getElementById(scopeId);
        if (!root) return;
        const wrap = root.querySelector(`.info-value-wrap[data-field="${field}"] .info-value-text`);
        if (wrap) wrap.textContent = (value !== undefined && value !== null && String(value).trim() !== '') ? String(value) : '--';
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

    // Two-way sync helpers
    async function applyPatchAndUpdateCaches(patch){
      await saveEntityFields(patch);
      try {
        if (entityType === 'account' && typeof window.getAccountsData === 'function'){
          const arr = window.getAccountsData() || [];
          const obj = arr.find(a => String(a.id||'') === String(entityId));
          if (obj) Object.assign(obj, patch);
        } else if (entityType === 'contact' && typeof window.getPeopleData === 'function'){
          const arr = window.getPeopleData() || [];
          const obj = arr.find(p => String(p.id||'') === String(entityId));
          if (obj) Object.assign(obj, patch);
        }
      } catch(_) {}
    }

    // Debounced save for continuous typing
    const debouncedSave = debounce(async () => {
      const supplierVal = (supplierInput?.value ?? '').trim();
      const rateVal = currentRateInput?.value ?? '';
      const contractVal = contractEndInput?.value ?? '';
      const patch = {
        electricitySupplier: supplierVal || null,
        currentRate: rateVal !== '' ? rateVal : null,
        contractEndDate: contractVal || null
      };
      updateDetailFieldDOM('electricitySupplier', supplierVal || null);
      updateDetailFieldDOM('currentRate', rateVal !== '' ? rateVal : null);
      updateDetailFieldDOM('contractEndDate', contractVal || null);
      await applyPatchAndUpdateCaches(patch);
    }, 500);

    // Immediate save on blur/change to avoid losing edits on re-render
    async function immediateSave(){
      try {
        const supplierVal = (supplierInput?.value ?? '').trim();
        const rateVal = currentRateInput?.value ?? '';
        const contractVal = contractEndInput?.value ?? '';
        const patch = {
          electricitySupplier: supplierVal || null,
          currentRate: rateVal !== '' ? rateVal : null,
          contractEndDate: contractVal || null
        };
        updateDetailFieldDOM('electricitySupplier', supplierVal || null);
        updateDetailFieldDOM('currentRate', rateVal !== '' ? rateVal : null);
        updateDetailFieldDOM('contractEndDate', contractVal || null);
        await applyPatchAndUpdateCaches(patch);
        try { window.crm?.showToast && window.crm.showToast('Saved'); } catch(_) {}
      } catch(_) {}
    }

    if (supplierInput){
      supplierInput.addEventListener('input', debouncedSave);
      supplierInput.addEventListener('change', immediateSave);
      supplierInput.addEventListener('blur', immediateSave);
    }
    if (currentRateInput){
      currentRateInput.addEventListener('input', debouncedSave);
      currentRateInput.addEventListener('change', immediateSave);
      currentRateInput.addEventListener('blur', immediateSave);
    }
    if (contractEndInput){
      contractEndInput.addEventListener('input', debouncedSave);
      contractEndInput.addEventListener('change', immediateSave);
      contractEndInput.addEventListener('blur', immediateSave);
    }

    // Initialize
    activateSection(1);
    updateButton();

    // Pre-populate from entity data if available (supplier, current rate, contract end)
    try {
      if (entityType === 'account' && typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(a => String(a.id || '') === String(entityId));
        if (account) {
          if (account.electricitySupplier) supplierInput.value = account.electricitySupplier;
          if (account.currentRate || account.current_rate) currentRateInput.value = account.currentRate || account.current_rate;
          if (account.contractEndDate || account.contract_end_date || account.contractEnd) contractEndInput.value = account.contractEndDate || account.contract_end_date || account.contractEnd;
          validateSection1();
          validateSection2();
        }
      } else if (entityType === 'contact' && typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        const contact = people.find(p => String(p.id || '') === String(entityId));
        if (contact) {
          if (contact.electricitySupplier) supplierInput.value = contact.electricitySupplier;
          if (contact.currentRate || contact.current_rate) currentRateInput.value = contact.currentRate || contact.current_rate;
          if (contact.contractEndDate || contact.contract_end_date || contact.contractEnd) contractEndInput.value = contact.contractEndDate || contact.contract_end_date || contact.contractEnd;
          validateSection1();
          validateSection2();
        }
      }
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

})();
