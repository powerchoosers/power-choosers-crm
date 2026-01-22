// Deal Calculator Widget
// Calculates deal value and commissions based on usage, mills, and contract terms

(function() {
    'use strict';

    let currentContactId = null;
    let currentAccountId = null;
    let currentEntityType = 'contact'; // 'contact' or 'account'

    // Widget state management
    let isDealOpen = false;

    // Helper functions for widget panel management
    function getPanelContentEl() {
        return document.querySelector('.widget-content');
    }

    function removeExistingWidget() {
        const existing = document.querySelector('.deal-card');
        if (existing && existing.parentElement) {
            existing.parentElement.removeChild(existing);
        }
        isDealOpen = false;
    }

    function openDeal(contactId) {
        currentContactId = contactId;
        currentAccountId = null;
        currentEntityType = 'contact';
        makeCard(contactId, 'contact');
    }

    async function openDealForAccount(accountId) {
        currentAccountId = accountId;
        currentContactId = null;
        currentEntityType = 'account';
        
        // Load existing deal data from Firebase if available
        const db = window.firebaseDB;
        let existingDealData = null;
        
        if (db) {
            try {
                const dealsSnapshot = await db.collection('deals')
                    .where('accountId', '==', accountId)
                    .limit(1)
                    .get();
                
                if (!dealsSnapshot.empty) {
                    existingDealData = dealsSnapshot.docs[0].data();
                }
            } catch (error) {
                console.warn('Error loading deal data:', error);
            }
        }
        
        makeCard(accountId, 'account', existingDealData);
    }

    function closeDeal() {
        const dealCard = document.querySelector('.deal-card');
        if (!dealCard) {
            isDealOpen = false;
            return;
        }

        // Prevent multiple close attempts
        if (dealCard.classList.contains('closing')) {
            return;
        }
        
        // Immediately set state to prevent further interactions
        isDealOpen = false;
        dealCard.classList.add('closing');

        // Animate out
        const currentHeight = dealCard.offsetHeight;
        dealCard.style.height = currentHeight + 'px';
        dealCard.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
            dealCard.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
            dealCard.style.height = '0px';
            dealCard.style.opacity = '0';
            
            setTimeout(() => {
                try {
                    if (dealCard && dealCard.parentNode) {
                        dealCard.parentNode.removeChild(dealCard);
                    }
                } catch (e) {
                    // Element might already be removed
                    console.warn('Deal card removal failed:', e);
                }
            }, 300);
        });
    }

    function isDealOpenFunc() {
        return isDealOpen;
    }

    // Smoothly animate inner body height when content changes size
    function animateDealBodyHeight(changeFn) {
        const body = document.querySelector('.deal-card .deal-body');
        if (!body || typeof changeFn !== 'function') { changeFn && changeFn(); return; }

        const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduce) { changeFn(); return; }

        const startHeight = body.offsetHeight;
        body.style.height = startHeight + 'px';
        body.style.overflow = 'hidden';
        void body.getBoundingClientRect();

        changeFn();

        const endHeight = body.scrollHeight;
        requestAnimationFrame(() => {
            body.style.transition = 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            body.style.height = endHeight + 'px';
            const onEnd = () => {
                body.style.transition = '';
                body.style.height = '';
                body.style.overflow = '';
                body.removeEventListener('transitionend', onEnd);
            };
            body.addEventListener('transitionend', onEnd);
        });
    }

    function makeCard(entityId, entityType, existingDealData = null) {
        // Remove existing deal card if any
        removeExistingWidget();

        const content = getPanelContentEl();
        if (!content) {
            try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
            return;
        }

        // Create the deal card
        const dealCard = document.createElement('div');
        dealCard.className = 'widget-card deal-card deal-anim';

        dealCard.innerHTML = `
            <div class="widget-card-header">
                <h3 class="widget-title">Deal Calculator</h3>
                <button class="deal-close" type="button" title="Close Deal Calculator" aria-label="Close">×</button>
            </div>
            <div class="deal-subtitle">Calculate deal value and commission based on usage, mills, and contract terms.</div>
            
            <div class="deal-body">
                <div class="deal-form-sections">
                    <!-- Deal Input Section -->
                    <div class="deal-form-section active" id="deal-input-section">
                        <div class="deal-section-header">
                            <span class="deal-section-pill active">
                                <span class="deal-section-icon" aria-hidden="true">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="1" x2="12" y2="23"></line>
                                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                    </svg>
                                </span> Deal Details
                            </span>
                        </div>
                        
                        <div class="deal-input-group">
                            <label for="annual-usage" class="deal-input-label">Annual Usage (kWh)</label>
                            <input type="text" id="annual-usage" class="deal-form-input" placeholder="Enter annual usage (kWh)" value="${existingDealData?.annualUsage ? existingDealData.annualUsage.toLocaleString() : ''}">
                        </div>
                        
                        <div class="deal-input-group">
                            <label for="mills" class="deal-input-label">Mills (Margin)</label>
                            <input type="number" id="mills" class="deal-form-input" placeholder="Enter mills (e.g., 8 for 0.008)" min="0" step="0.1" value="${existingDealData?.mills || ''}">
                            <small class="deal-input-note">Note: 8 mills = $0.008 per kWh</small>
                        </div>
                        
                        <div class="deal-input-group">
                            <label for="contract-length" class="deal-input-label">Contract Length (Years)</label>
                            <input type="number" id="contract-length" class="deal-form-input" placeholder="Enter contract length in years" min="0.5" step="0.5" value="${existingDealData?.contractLength || ''}">
                        </div>
                        
                        <div class="deal-commission-type">
                            <label class="deal-commission-label">Commission Type</label>
                            <div class="deal-radio-group">
                                <label class="deal-radio-label">
                                    <input type="radio" name="commission-type" value="annual" ${(!existingDealData || existingDealData.commissionType === 'annual') ? 'checked' : ''}>
                                    <span class="deal-radio-text">Annual</span>
                                </label>
                                <label class="deal-radio-label">
                                    <input type="radio" name="commission-type" value="monthly" ${existingDealData?.commissionType === 'monthly' ? 'checked' : ''}>
                                    <span class="deal-radio-text">Monthly</span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="deal-button-group">
                            <button id="calculate-deal" class="deal-calculate-btn">Calculate Deal</button>
                            <button id="reset-deal" class="deal-reset-btn">Reset</button>
                        </div>
                    </div>
                </div>
                
                <!-- Loading state -->
                <div class="deal-loading" id="deal-loading" style="display: none;">
                    <div class="deal-spinner"></div>
                    <div class="deal-loading-text">Calculating…</div>
                </div>

                <!-- Results Section -->
                <div class="deal-results" id="deal-results" style="display: none;">
                    <div class="deal-section-header">
                        <span class="deal-section-pill completed">
                            <span class="deal-section-icon">✓</span> Results
                        </span>
                    </div>
                    
                    <div class="deal-result-grid">
                        <div class="deal-result-item">
                            <div class="deal-result-label">Agency Yearly Value</div>
                            <div class="deal-result-value" id="yearly-deal-value">$0</div>
                        </div>
                        
                        <div class="deal-result-item">
                            <div class="deal-result-label">Agency Total Value</div>
                            <div class="deal-result-value deal-total" id="total-deal-value">$0</div>
                        </div>
                        
                        <div class="deal-result-item">
                            <div class="deal-result-label">Commission Per Year</div>
                            <div class="deal-result-value" id="yearly-commission">$0</div>
                        </div>
                        
                        <div class="deal-result-item" id="monthly-commission-item" style="display: none;">
                            <div class="deal-result-label">Commission Per Month</div>
                            <div class="deal-result-value" id="monthly-commission">$0</div>
                        </div>
                    </div>
                    
                    <div class="deal-summary-box">
                        <div class="deal-summary-title">💰 Deal Summary</div>
                        <div class="deal-summary-content" id="deal-summary">
                            Enter deal details above to see summary.
                        </div>
                    </div>

                    <div class="deal-button-group" style="margin-top: 12px;">
                        <button id="deal-reset-bottom" class="deal-reset-btn">Reset</button>
                    </div>
                </div>
            </div>
        `;

        // Smooth expand-in animation that pushes other widgets down
        const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReduce) {
            try { dealCard.classList.add('deal-anim'); } catch (_) {}
            dealCard.style.opacity = '0';
            dealCard.style.transform = 'translateY(-6px)';
        }

        if (content.firstChild) content.insertBefore(dealCard, content.firstChild);
        else content.appendChild(dealCard);

        if (!prefersReduce) {
            // Measure natural height and animate to it
            requestAnimationFrame(() => {
                const targetHeight = dealCard.scrollHeight;
                dealCard.style.height = '0px';
                dealCard.style.overflow = 'hidden';
                
                requestAnimationFrame(() => {
                    dealCard.style.transition = 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, transform 0.35s ease';
                    dealCard.style.height = targetHeight + 'px';
                    dealCard.style.opacity = '1';
                    dealCard.style.transform = 'translateY(0)';
                    
                    const onEnd = () => {
                        dealCard.style.height = 'auto';
                        dealCard.style.overflow = 'visible';
                        dealCard.removeEventListener('transitionend', onEnd);
                    };
                    dealCard.addEventListener('transitionend', onEnd);
                });
            });
        }

        // Bring panel into view
        try {
            const panel = document.getElementById('widget-panel');
            if (panel) panel.scrollTop = 0;
        } catch (_) { /* noop */ }

        isDealOpen = true;
        attachEventListeners();
        
        // Auto-calculate if we have existing data
        if (existingDealData && existingDealData.annualUsage && existingDealData.mills && existingDealData.contractLength) {
            setTimeout(() => {
                calculateDeal();
            }, 500);
        }
        
        return dealCard;
    }

    function attachEventListeners() {
        const calculateBtn = document.getElementById('calculate-deal');
        const resetBtn = document.getElementById('reset-deal');
        const resetBottomBtn = document.getElementById('deal-reset-bottom');
        const closeBtn = document.querySelector('.deal-close');
        const inputs = document.querySelectorAll('.deal-form-input');
        const annualUsageInput = document.getElementById('annual-usage');
        const radioInputs = document.querySelectorAll('input[name="commission-type"]');

        if (calculateBtn) {
            calculateBtn.addEventListener('click', calculateDeal);
        }

        if (resetBtn) { resetBtn.addEventListener('click', resetForm); }
        if (resetBottomBtn) { resetBottomBtn.addEventListener('click', resetForm); }
        
        // Add reliable close button event listener with multiple event types
        if (closeBtn) {
            const handleClose = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                closeDeal();
                return false;
            };
            
            // Add multiple event listeners for better reliability
            ['click','pointerup','mouseup','mousedown','touchstart','keydown'].forEach(type => {
                closeBtn.addEventListener(type, (ev) => {
                    if (type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
                    handleClose(ev);
                }, true);
            });
            
            // Ensure button is properly styled and accessible
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.pointerEvents = 'auto';
            closeBtn.setAttribute('tabindex', '0');
            // Expand hit area invisibly
            try {
                const hit = document.createElement('span');
                hit.setAttribute('aria-hidden', 'true');
                hit.style.position = 'absolute';
                hit.style.inset = '-6px';
                hit.style.borderRadius = '8px';
                hit.style.content = '""';
                closeBtn.style.position = 'relative';
                closeBtn.appendChild(hit);
            } catch(_) {}
        }

        // Live-format annual usage with commas while typing
        if (annualUsageInput) {
            annualUsageInput.addEventListener('input', (e) => {
                const input = e.target;
                const prev = input.value;
                const caret = input.selectionStart || 0;

                // Keep only digits
                const digits = prev.replace(/\D/g, '');
                // Format with locale commas
                const formatted = digits ? Number(digits).toLocaleString('en-US') : '';
                input.value = formatted;

                // Try to restore caret position relative to the end
                const delta = formatted.length - prev.length;
                const nextPos = Math.max(0, caret + delta);
                try { input.setSelectionRange(nextPos, nextPos); } catch (_) {}
            });
        }

        // Update button state only; do not auto-calculate
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                updateButtonState();
            });
        });

        radioInputs.forEach(radio => {
            radio.addEventListener('change', () => {
                updateButtonState();
            });
        });

        // Initial button state
        updateButtonState();
    }

    function areAllFieldsFilled() {
        const annualUsageRaw = document.getElementById('annual-usage')?.value || '';
        const annualUsage = parseFloat(annualUsageRaw.replace(/[^\d.]/g, ''));
        const mills = parseFloat(document.getElementById('mills')?.value || 0);
        const contractLength = parseFloat(document.getElementById('contract-length')?.value || 0);

        return annualUsage > 0 && mills > 0 && contractLength > 0;
    }

    function updateButtonState() {
        const calculateBtn = document.getElementById('calculate-deal');
        if (calculateBtn) {
            if (areAllFieldsFilled()) {
                calculateBtn.classList.add('ready');
            } else {
                calculateBtn.classList.remove('ready');
            }
        }
    }

    function calculateDeal() {
        const calculateBtn = document.getElementById('calculate-deal');
        if (!calculateBtn?.classList.contains('ready')) {
            // Don't calculate if button is not ready
            return;
        }

        // Show loading spinner (with smooth container resize)
        const formSectionsEl = document.querySelector('.deal-form-sections');
        const loadingEl = document.getElementById('deal-loading');
        const resultsSection = document.getElementById('deal-results');
        animateDealBodyHeight(() => {
            if (formSectionsEl) formSectionsEl.style.display = 'none';
            if (resultsSection) resultsSection.style.display = 'none';
            if (loadingEl) loadingEl.style.display = 'flex';
        });

        const annualUsageRaw = document.getElementById('annual-usage')?.value || '';
        const annualUsage = parseFloat(annualUsageRaw.replace(/[^\d.]/g, ''));
        const mills = parseFloat(document.getElementById('mills')?.value || 0);
        const contractLength = parseFloat(document.getElementById('contract-length')?.value || 0);
        const commissionType = document.querySelector('input[name="commission-type"]:checked')?.value || 'annual';

        if (!areAllFieldsFilled()) {
            return;
        }

        // Convert mills to decimal (8 mills = 0.008)
        const millsDecimal = mills / 1000;

        // Calculate Gross Yearly Deal Value: Annual Usage * Mills
        const grossYearlyDealValue = annualUsage * millsDecimal;

        // Calculate Agency's share based on commission type
        let agencyShare;
        if (commissionType === 'annual') {
            // Annual: 70% split (we keep 70%)
            agencyShare = 0.70;
        } else {
            // Monthly: 80% split (we keep 80%)
            agencyShare = 0.80;
        }

        // Calculate Agency's Yearly Deal Value (after partner split)
        const yearlyDealValue = grossYearlyDealValue * agencyShare;

        // Calculate Total Deal Value for Agency: Agency's Yearly DV * Contract Length
        const totalDealValue = yearlyDealValue * contractLength;

        // Commission is the same as the yearly deal value (since it's already after split)
        const yearlyCommission = yearlyDealValue;
        const monthlyCommission = yearlyCommission / 12;

        // Update UI after short delay to show spinner
        setTimeout(() => {
            animateDealBodyHeight(() => {
                if (loadingEl) loadingEl.style.display = 'none';
                // updateResults will reveal the results section and hide form
                updateResults(yearlyDealValue, totalDealValue, yearlyCommission, monthlyCommission, commissionType, annualUsage, mills, contractLength);
            });
        }, 3000);
    }

    function updateResults(yearlyDV, totalDV, yearlyComm, monthlyComm, commType, usage, mills, contractYears) {
        // Show results section and replace inputs (hide the form area)
        const resultsSection = document.getElementById('deal-results');
        if (resultsSection) {
            resultsSection.style.display = 'block';
        }
        const inputSectionEl = document.getElementById('deal-input-section');
        const formSectionsEl = inputSectionEl ? (inputSectionEl.closest('.deal-form-sections') || inputSectionEl) : null;
        if (formSectionsEl) {
            formSectionsEl.style.display = 'none';
        }

        // Update values
        const yearlyDealValueEl = document.getElementById('yearly-deal-value');
        const totalDealValueEl = document.getElementById('total-deal-value');
        const yearlyCommissionEl = document.getElementById('yearly-commission');
        const monthlyCommissionEl = document.getElementById('monthly-commission');
        const monthlyCommissionItem = document.getElementById('monthly-commission-item');
        const summaryEl = document.getElementById('deal-summary');

        if (yearlyDealValueEl) yearlyDealValueEl.textContent = formatCurrency(yearlyDV);
        if (totalDealValueEl) totalDealValueEl.textContent = formatCurrency(totalDV);
        if (yearlyCommissionEl) yearlyCommissionEl.textContent = formatCurrency(yearlyComm);

        // Show/hide monthly commission based on type
        if (commType === 'monthly') {
            if (monthlyCommissionItem) monthlyCommissionItem.style.display = 'block';
            if (monthlyCommissionEl) monthlyCommissionEl.textContent = formatCurrency(monthlyComm);
        } else {
            if (monthlyCommissionItem) monthlyCommissionItem.style.display = 'none';
        }

        // Update summary
        const splitPercentage = commType === 'annual' ? '70%' : '80%';
        const paymentType = commType === 'annual' ? 'Annual (upfront)' : 'Monthly';
        
        if (summaryEl) {
            summaryEl.innerHTML = `
                <strong>Deal Terms:</strong> ${formatNumber(usage)} kWh @ ${mills} mills over ${contractYears} years<br>
                <strong>Agency Share:</strong> ${splitPercentage} (${paymentType} payments)<br>
                <strong>Agency Total Value:</strong> ${formatCurrency(totalDV)}
            `;
        }

        // Mark input section as completed
        const inputSection = document.getElementById('deal-input-section');
        if (inputSection) {
            inputSection.classList.add('completed');
        }
    }

    function resetForm() {
        // Clear all inputs
        document.getElementById('annual-usage').value = '';
        document.getElementById('mills').value = '';
        document.getElementById('contract-length').value = '';
        
        // Reset radio to annual
        const annualRadio = document.querySelector('input[name="commission-type"][value="annual"]');
        if (annualRadio) annualRadio.checked = true;

        // Hide results (animate back to form)
        const resultsSection = document.getElementById('deal-results');
        const loadingEl = document.getElementById('deal-loading');
        const formSectionsEl = document.querySelector('.deal-form-sections');
        animateDealBodyHeight(() => {
            if (resultsSection) resultsSection.style.display = 'none';
            if (loadingEl) loadingEl.style.display = 'none';
            if (formSectionsEl) formSectionsEl.style.display = '';
        });

        // Inputs already revealed via animation section above

        // Remove completed class
        const inputSection = document.getElementById('deal-input-section');
        if (inputSection) {
            inputSection.classList.remove('completed');
        }

        // Reset button state
        updateButtonState();
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('en-US').format(value);
    }

    // Expose functions globally
    if (!window.Widgets) window.Widgets = {};
    window.Widgets.openDeal = openDeal;
    window.Widgets.openDealForAccount = openDealForAccount;
    window.Widgets.closeDeal = closeDeal;
    window.Widgets.isDealOpen = isDealOpenFunc;

    // Listen for deal updates from deals page
    document.addEventListener('pc:deal-created', async (e) => {
        const dealId = e.detail?.dealId;
        if (!dealId) return;
        
        // Reload deal data if widget is open for same account
        if (isDealOpen && currentAccountId) {
            const db = window.firebaseDB;
            if (db) {
                try {
                    const dealDoc = await db.collection('deals').doc(dealId).get();
                    const dealData = dealDoc.data();
                    
                    if (dealData && dealData.accountId === currentAccountId) {
                        // Refresh widget with updated data
                        openDealForAccount(currentAccountId);
                    }
                } catch (error) {
                    console.warn('Error refreshing deal widget:', error);
                }
            }
        }
    });

})();
