// Deals Page - Kanban Board
(function () {
  const STAGES = [
    { id: 'interested', title: 'Interested' },
    { id: 'call-scheduled', title: 'Call Scheduled' },
    { id: 'invoice-received', title: 'Invoice Received' },
    { id: 'proposal', title: 'Proposal' },
    { id: 'negotiation', title: 'Negotiation' },
    { id: 'won', title: 'Closed Won' },
    { id: 'lost', title: 'Closed Lost' },
  ];

  const sampleDeals = [
    { id: 'd1', title: 'Johnson Electric - Renewal', company: 'Johnson Electric', amount: 42000, owner: 'LP', closeDate: '2025-09-12', stage: 'interested' },
    { id: 'd2', title: 'Metro Industries - Multi-site', company: 'Metro Industries', amount: 98000, owner: 'AM', closeDate: '2025-09-20', stage: 'call-scheduled' },
    { id: 'd3', title: 'Acme Manufacturing - Pilot', company: 'Acme Manufacturing', amount: 52000, owner: 'LP', closeDate: '2025-10-02', stage: 'proposal' },
    { id: 'd4', title: 'Downtown Offices - Solar + Retail', company: 'Downtown Office Complex', amount: 150000, owner: 'JR', closeDate: '2025-10-15', stage: 'negotiation' },
    { id: 'd5', title: 'West Retail Group - Portfolio', company: 'West Retail Group', amount: 275000, owner: 'LP', closeDate: '2025-08-31', stage: 'won' },
  ];

  let state = {
    deals: [...sampleDeals],
    initialized: false,
  };

  // Single placeholder used across lists to indicate drop position
  let placeholderEl = null;
  let dragGhostEl = null;

  function getPlaceholder() {
    if (!placeholderEl) {
      placeholderEl = document.createElement('div');
      placeholderEl.className = 'deal-drop-placeholder';
      // For accessibility, announce insertion marker
      placeholderEl.setAttribute('role', 'separator');
      placeholderEl.setAttribute('aria-label', 'Drop position');
    }
    return placeholderEl;
  }

  function removePlaceholder() {
    if (placeholderEl && placeholderEl.parentElement) {
      placeholderEl.parentElement.removeChild(placeholderEl);
    }
  }

  function createDragGhost(card, e) {
    // Remove any existing ghost first
    removeDragGhost();
    const ghost = card.cloneNode(true);
    ghost.classList.remove('deal-card');
    ghost.classList.add('deal-card-ghost');
    // Match width to card for visual consistency
    const rect = card.getBoundingClientRect();
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    // Position offscreen; setDragImage will handle the cursor offset
    const offsetX = Math.max(12, e.clientX - rect.left);
    const offsetY = Math.max(12, e.clientY - rect.top);
    try { e.dataTransfer.setDragImage(ghost, offsetX, offsetY); } catch {}
    dragGhostEl = ghost;
  }

  function removeDragGhost() {
    if (dragGhostEl && dragGhostEl.parentElement) {
      dragGhostEl.parentElement.removeChild(dragGhostEl);
    }
    dragGhostEl = null;
  }

  // Find the card element that is immediately after the current mouse Y
  function getDragAfterElement(list, y) {
    const cards = [...list.querySelectorAll('.deal-card:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (const child of cards) {
      const box = child.getBoundingClientRect();
      const offset = y - (box.top + box.height / 2);
      if (offset < 0 && offset > closest.offset) {
        closest = { offset, element: child };
      }
    }
    return closest.element;
  }

  function formatCurrency(n) {
    try { return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); } catch { return `$${n}`; }
  }

  function renderBoard() {
    const board = document.getElementById('deals-board');
    if (!board) return;

    board.innerHTML = '';

    STAGES.forEach(stage => {
      const col = document.createElement('div');
      col.className = 'deal-column';
      col.setAttribute('data-stage', stage.id);

      // Header
      const header = document.createElement('div');
      header.className = 'deal-column-header';

      const title = document.createElement('div');
      title.className = 'deal-column-title';
      title.textContent = stage.title;

      const count = document.createElement('div');
      count.className = 'deal-count';
      count.setAttribute('data-count-for', stage.id);
      count.textContent = '0';

      header.appendChild(title);
      header.appendChild(count);

      // List
      const list = document.createElement('div');
      list.className = 'deal-list';
      list.setAttribute('data-stage', stage.id);

      // DnD: drop zone events
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        // vertical auto-scroll inside a column while dragging
        const rect = list.getBoundingClientRect();
        const threshold = Math.min(60, rect.height * 0.2);
        const topDist = e.clientY - rect.top;
        const bottomDist = rect.bottom - e.clientY;
        const maxStep = 18;
        if (topDist < threshold) {
          const factor = 1 - Math.max(0, topDist) / threshold;
          list.scrollTop -= Math.ceil(maxStep * factor);
        } else if (bottomDist < threshold) {
          const factor = 1 - Math.max(0, bottomDist) / threshold;
          list.scrollTop += Math.ceil(maxStep * factor);
        }

        // position placeholder based on cursor
        const afterElement = getDragAfterElement(list, e.clientY);
        const ph = getPlaceholder();
        // Match height to the dragging card live (no global state)
        const draggingEl = document.querySelector('.deal-card.dragging');
        if (draggingEl) {
          ph.style.height = draggingEl.getBoundingClientRect().height + 'px';
        }
        if (afterElement == null) {
          if (ph.parentElement !== list) list.appendChild(ph);
          else if (ph !== list.lastChild) list.appendChild(ph);
        } else {
          if (ph.previousSibling !== afterElement) {
            list.insertBefore(ph, afterElement);
          }
        }
      });
      list.addEventListener('dragenter', (e) => {
        e.preventDefault();
        list.classList.add('drop-target-highlight');
      });
      list.addEventListener('dragleave', (e) => {
        list.classList.remove('drop-target-highlight');
        // If leaving the list entirely, remove placeholder
        const related = e.relatedTarget;
        if (!list.contains(related)) removePlaceholder();
      });
      list.addEventListener('drop', (e) => {
        e.preventDefault();
        list.classList.remove('drop-target-highlight');
        const dealId = e.dataTransfer.getData('text/plain');
        if (!dealId) return;
        const card = document.querySelector(`[data-deal-id="${dealId}"]`);
        if (!card) return;

        const ph = getPlaceholder();
        if (ph && ph.parentElement === list) {
          list.insertBefore(card, ph);
        } else {
          // fallback: append to end
          if (list !== card.parentElement) list.appendChild(card);
        }
        removePlaceholder();
        // update state
        const d = state.deals.find(x => x.id === dealId);
        if (d) d.stage = stage.id;
        updateCounts();
      });

      col.appendChild(header);
      col.appendChild(list);
      board.appendChild(col);
    });

    // Render cards
    state.deals.forEach(deal => {
      const card = createDealCard(deal);
      const targetList = board.querySelector(`.deal-list[data-stage="${deal.stage}"]`) || board.querySelector(`.deal-list[data-stage="new"]`);
      targetList.appendChild(card);
    });

    updateCounts();
  }

  function createDealCard(deal) {
    const card = document.createElement('div');
    card.className = 'deal-card';
    card.setAttribute('data-deal-id', deal.id);
    card.draggable = true;

    // Drag events
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', deal.id);
      e.dataTransfer.effectAllowed = 'move';
      createDragGhost(card, e);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      removePlaceholder();
      removeDragGhost();
    });

    const body = document.createElement('div');
    body.className = 'deal-card-body';

    const title = document.createElement('div');
    title.className = 'deal-card-title';
    title.textContent = deal.title;

    const subtitle = document.createElement('div');
    subtitle.className = 'deal-card-subtitle';
    subtitle.textContent = `${deal.company} • ${formatCurrency(deal.amount)}`;

    const meta = document.createElement('div');
    meta.className = 'deal-card-meta';
    meta.innerHTML = `
      <span>Owner: ${deal.owner}</span>
      <span>Close: ${deal.closeDate}</span>
    `;

    body.appendChild(title);
    body.appendChild(subtitle);
    body.appendChild(meta);
    card.appendChild(body);

    return card;
  }

  function updateCounts() {
    STAGES.forEach(stage => {
      const list = document.querySelector(`.deal-list[data-stage="${stage.id}"]`);
      const countEl = document.querySelector(`[data-count-for="${stage.id}"]`);
      if (list && countEl) {
        const visibleCards = Array.from(list.querySelectorAll('.deal-card')).filter(c => c.style.display !== 'none');
        countEl.textContent = String(visibleCards.length);
      }
    });
  }

  function handleAddDeal() {
    const btn = document.getElementById('add-deal-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      openAddDealModal();
    });
  }

  function handleQuickSearch() {
    const input = document.getElementById('deals-quick-search');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const cards = document.querySelectorAll('.deal-card');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const show = !q || text.includes(q);
        card.style.display = show ? '' : 'none';
      });
      updateCounts();
    });
  }

  // Modal State Management
  let modalState = {
    currentStep: 1,
    selectedAccount: null,
    dealData: {
      title: '',
      stage: 'interested',
      // Step 2 fields
      electricitySupplier: '',
      annualUsage: 0,
      currentRate: '',
      contractEndDate: '',
      serviceAddresses: [],
      // Step 3 fields
      mills: 0,
      contractLength: 0,
      commissionType: 'annual',
      projectedCloseDate: ''
    }
  };

  function openAddDealModal() {
    const modal = document.getElementById('modal-add-deal');
    if (!modal) {
      console.warn('Add Deal modal not found');
      return;
    }

    // Reset modal state
    modalState.currentStep = 1;
    modalState.selectedAccount = null;
    modalState.dealData = {
      title: '',
      stage: 'interested',
      electricitySupplier: '',
      annualUsage: 0,
      currentRate: '',
      contractEndDate: '',
      serviceAddresses: [],
      mills: 0,
      contractLength: 0,
      commissionType: 'annual',
      projectedCloseDate: ''
    };

    // Show modal
    modal.removeAttribute('hidden');
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // Initialize step 1
    navigateToStep(1);
    setupAccountSearch();
    setupServiceAddresses();
    setupDealCalculator();
    setupModalEventListeners();

    // Focus first input
    setTimeout(() => {
      const firstInput = modal.querySelector('input');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function navigateToStep(stepNumber) {
    modalState.currentStep = stepNumber;
    
    // Update step indicators
    document.querySelectorAll('.deal-step').forEach(step => {
      step.classList.remove('active');
    });
    document.querySelector(`.deal-step[data-step="${stepNumber}"]`)?.classList.add('active');

    // Update step content
    document.querySelectorAll('.deal-step-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`deal-step-${stepNumber}`)?.classList.add('active');

    // Update navigation buttons
    const prevBtn = document.getElementById('deal-prev-step');
    const nextBtn = document.getElementById('deal-next-step');
    const createBtn = document.getElementById('deal-create-btn');

    if (prevBtn) prevBtn.style.display = stepNumber > 1 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.style.display = stepNumber < 3 ? 'inline-block' : 'none';
    if (createBtn) createBtn.style.display = stepNumber === 3 ? 'inline-block' : 'none';

    // Update button text
    if (nextBtn) nextBtn.textContent = stepNumber === 2 ? 'Calculate Deal' : 'Next';
  }

  function setupAccountSearch() {
    const searchInput = document.getElementById('deal-account-search');
    const dropdown = document.getElementById('deal-account-dropdown');
    const hiddenId = document.getElementById('deal-account-id');

    if (!searchInput || !dropdown || !hiddenId) return;

    let accountsData = [];
    let selectedAccount = null;

    // Load accounts data
    if (window.getAccountsData) {
      accountsData = window.getAccountsData(true) || [];
    }

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      const matches = accountsData.filter(account => {
        const name = (account.accountName || account.name || '').toLowerCase();
        return name.includes(query);
      }).slice(0, 10);

      if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
      }

      dropdown.innerHTML = matches.map(account => `
        <div class="account-dropdown-item" data-account-id="${account.id}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-light);">
          <div style="font-weight: 500;">${account.accountName || account.name}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary);">${account.city || ''} ${account.state || ''}</div>
        </div>
      `).join('');

      dropdown.style.display = 'block';

      // Add click handlers
      dropdown.querySelectorAll('.account-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          const accountId = item.dataset.accountId;
          selectedAccount = accountsData.find(a => a.id === accountId);
          if (selectedAccount) {
            searchInput.value = selectedAccount.accountName || selectedAccount.name;
            hiddenId.value = accountId;
            modalState.selectedAccount = selectedAccount;
            dropdown.style.display = 'none';
            
            // Auto-populate step 2 if we have account data
            populateFromAccount(selectedAccount);
          }
        });
      });
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  function populateFromAccount(account) {
    if (!account) return;

    // Populate step 2 fields
    const electricitySupplier = document.querySelector('input[name="electricitySupplier"]');
    const annualUsage = document.querySelector('input[name="annualUsage"]');
    const currentRate = document.querySelector('input[name="currentRate"]');
    const contractEndDate = document.querySelector('input[name="contractEndDate"]');

    if (electricitySupplier) electricitySupplier.value = account.electricitySupplier || '';
    if (annualUsage) annualUsage.value = account.annualUsage || '';
    if (currentRate) currentRate.value = account.currentRate || '';
    if (contractEndDate) contractEndDate.value = account.contractEndDate || '';

    // Populate service addresses
    if (account.serviceAddresses && Array.isArray(account.serviceAddresses)) {
      const container = document.getElementById('deal-service-addresses-container');
      if (container) {
        container.innerHTML = '';
        account.serviceAddresses.forEach((addr, index) => {
          addServiceAddressRow(addr.address || '', index);
        });
        if (account.serviceAddresses.length === 0) {
          addServiceAddressRow('', 0);
        }
      }
    }

    // Populate step 3 fields
    const calcAnnualUsage = document.querySelector('input[name="calcAnnualUsage"]');
    if (calcAnnualUsage && account.annualUsage) {
      calcAnnualUsage.value = account.annualUsage.toLocaleString();
    }
  }

  function setupServiceAddresses() {
    const container = document.getElementById('deal-service-addresses-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-service-address-btn')) {
        const currentRows = container.querySelectorAll('.service-address-input-row').length;
        addServiceAddressRow('', currentRows);
      } else if (e.target.classList.contains('remove-service-address-btn')) {
        const row = e.target.closest('.service-address-input-row');
        if (row && container.querySelectorAll('.service-address-input-row').length > 1) {
          row.remove();
        }
      }
    });
  }

  function addServiceAddressRow(value = '', index = 0) {
    const container = document.getElementById('deal-service-addresses-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'service-address-input-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    
    row.innerHTML = `
      <input type="text" name="serviceAddress_${index}" class="input-dark" placeholder="123 Main St, City, State" style="flex: 1;" value="${value}" />
      <button type="button" class="remove-service-address-btn" style="background: var(--grey-600); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Remove this service address">-</button>
      <button type="button" class="add-service-address-btn" style="background: var(--orange-primary); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Add another service address">+</button>
    `;

    container.appendChild(row);
  }

  function setupDealCalculator() {
    const calcAnnualUsage = document.querySelector('input[name="calcAnnualUsage"]');
    const mills = document.querySelector('input[name="mills"]');
    const contractLength = document.querySelector('input[name="contractLength"]');
    const commissionType = document.querySelectorAll('input[name="commissionType"]');

    // Live-format annual usage with commas
    if (calcAnnualUsage) {
      calcAnnualUsage.addEventListener('input', (e) => {
        const input = e.target;
        const prev = input.value;
        const caret = input.selectionStart || 0;

        const digits = prev.replace(/\D/g, '');
        const formatted = digits ? Number(digits).toLocaleString('en-US') : '';
        input.value = formatted;

        const delta = formatted.length - prev.length;
        const nextPos = Math.max(0, caret + delta);
        try { input.setSelectionRange(nextPos, nextPos); } catch (_) {}
        
        calculateDealValues();
      });
    }

    // Calculate on input change
    [mills, contractLength].forEach(input => {
      if (input) {
        input.addEventListener('input', calculateDealValues);
      }
    });

    commissionType.forEach(radio => {
      radio.addEventListener('change', calculateDealValues);
    });
  }

  function calculateDealValues() {
    const calcAnnualUsageRaw = document.querySelector('input[name="calcAnnualUsage"]')?.value || '';
    const annualUsage = parseFloat(calcAnnualUsageRaw.replace(/[^\d.]/g, ''));
    const mills = parseFloat(document.querySelector('input[name="mills"]')?.value || 0);
    const contractLength = parseFloat(document.querySelector('input[name="contractLength"]')?.value || 0);
    const commissionType = document.querySelector('input[name="commissionType"]:checked')?.value || 'annual';

    if (annualUsage > 0 && mills > 0 && contractLength > 0) {
      // Calculate deal values
      const millsDecimal = mills / 1000;
      const grossYearly = annualUsage * millsDecimal;
      const agencyShare = commissionType === 'annual' ? 0.70 : 0.80;
      const yearlyDealValue = grossYearly * agencyShare;
      const totalDealValue = yearlyDealValue * contractLength;
      const yearlyCommission = yearlyDealValue;
      const monthlyCommission = yearlyCommission / 12;

      // Update UI
      const resultsDiv = document.getElementById('deal-calculator-results');
      if (resultsDiv) resultsDiv.style.display = 'block';

      const yearlyValueEl = document.getElementById('deal-yearly-value');
      const totalValueEl = document.getElementById('deal-total-value');
      const yearlyCommissionEl = document.getElementById('deal-yearly-commission');
      const monthlyCommissionEl = document.getElementById('deal-monthly-commission');
      const monthlyCommissionItem = document.getElementById('deal-monthly-commission-item');

      if (yearlyValueEl) yearlyValueEl.textContent = formatCurrency(yearlyDealValue);
      if (totalValueEl) totalValueEl.textContent = formatCurrency(totalDealValue);
      if (yearlyCommissionEl) yearlyCommissionEl.textContent = formatCurrency(yearlyCommission);

      if (commissionType === 'monthly') {
        if (monthlyCommissionItem) monthlyCommissionItem.style.display = 'block';
        if (monthlyCommissionEl) monthlyCommissionEl.textContent = formatCurrency(monthlyCommission);
      } else {
        if (monthlyCommissionItem) monthlyCommissionItem.style.display = 'none';
      }

      // Store calculated values
      modalState.dealData.yearlyDealValue = yearlyDealValue;
      modalState.dealData.totalDealValue = totalDealValue;
      modalState.dealData.yearlyCommission = yearlyCommission;
      modalState.dealData.monthlyCommission = monthlyCommission;
    }
  }

  function setupModalEventListeners() {
    const modal = document.getElementById('modal-add-deal');
    if (!modal) return;

    // Navigation buttons
    const prevBtn = document.getElementById('deal-prev-step');
    const nextBtn = document.getElementById('deal-next-step');
    const createBtn = document.getElementById('deal-create-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (modalState.currentStep > 1) {
          navigateToStep(modalState.currentStep - 1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (validateCurrentStep()) {
          if (modalState.currentStep < 3) {
            navigateToStep(modalState.currentStep + 1);
          }
        }
      });
    }

    if (createBtn) {
      createBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (validateCurrentStep()) {
          await saveDealToFirebase();
        }
      });
    }

    // Close modal handlers
    const closeBtns = modal.querySelectorAll('[data-close="deal"]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    // Close on backdrop click
    const backdrop = modal.querySelector('.pc-modal__backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }
  }

  function validateCurrentStep() {
    switch (modalState.currentStep) {
      case 1:
        const accountId = document.getElementById('deal-account-id')?.value;
        const dealTitle = document.querySelector('input[name="dealTitle"]')?.value;
        const dealStage = document.querySelector('select[name="dealStage"]')?.value;
        
        if (!accountId || !dealTitle.trim()) {
          window.crm?.showToast?.('Please select an account and enter a deal title');
          return false;
        }
        
        modalState.dealData.title = dealTitle.trim();
        modalState.dealData.stage = dealStage;
        return true;

      case 2:
        // Step 2 is optional, always allow proceeding
        return true;

      case 3:
        const calcAnnualUsageRaw = document.querySelector('input[name="calcAnnualUsage"]')?.value || '';
        const annualUsage = parseFloat(calcAnnualUsageRaw.replace(/[^\d.]/g, ''));
        const mills = parseFloat(document.querySelector('input[name="mills"]')?.value || 0);
        const contractLength = parseFloat(document.querySelector('input[name="contractLength"]')?.value || 0);
        
        if (annualUsage <= 0 || mills <= 0 || contractLength <= 0) {
          window.crm?.showToast?.('Please enter valid values for annual usage, mills, and contract length');
          return false;
        }
        
        modalState.dealData.annualUsage = annualUsage;
        modalState.dealData.mills = mills;
        modalState.dealData.contractLength = contractLength;
        modalState.dealData.commissionType = document.querySelector('input[name="commissionType"]:checked')?.value || 'annual';
        modalState.dealData.projectedCloseDate = document.querySelector('input[name="projectedCloseDate"]')?.value || '';
        return true;

      default:
        return true;
    }
  }

  function closeModal() {
    const modal = document.getElementById('modal-add-deal');
    if (!modal) return;

    modal.classList.remove('show');
    setTimeout(() => {
      modal.setAttribute('hidden', '');
    }, 300);
  }

  async function saveDealToFirebase() {
    try {
      const db = window.firebaseDB;
      const user = window.currentUserEmail;
      const fv = window.firebase?.firestore?.FieldValue;
      
      if (!db || !user) {
        window.crm?.showToast?.('Firebase not initialized');
        return;
      }

      const dealId = 'deal_' + Date.now();
      
      // Collect service addresses
      const serviceAddresses = [];
      document.querySelectorAll('[name^="serviceAddress_"]').forEach((input, idx) => {
        if (input.value.trim()) {
          serviceAddresses.push({
            address: input.value.trim(),
            isPrimary: idx === 0
          });
        }
      });

      // Calculate deal values
      const millsDecimal = modalState.dealData.mills / 1000;
      const grossYearly = modalState.dealData.annualUsage * millsDecimal;
      const agencyShare = modalState.dealData.commissionType === 'annual' ? 0.70 : 0.80;
      const yearlyDealValue = grossYearly * agencyShare;
      const totalDealValue = yearlyDealValue * modalState.dealData.contractLength;
      const yearlyCommission = yearlyDealValue;
      const monthlyCommission = yearlyCommission / 12;

      // Save deal to Firebase
      const dealDoc = {
        id: dealId,
        title: modalState.dealData.title,
        accountId: modalState.selectedAccount.id,
        accountName: modalState.selectedAccount.accountName || modalState.selectedAccount.name,
        stage: modalState.dealData.stage,
        annualUsage: modalState.dealData.annualUsage,
        mills: modalState.dealData.mills,
        contractLength: modalState.dealData.contractLength,
        commissionType: modalState.dealData.commissionType,
        yearlyDealValue,
        totalDealValue,
        yearlyCommission,
        monthlyCommission,
        projectedCloseDate: modalState.dealData.projectedCloseDate,
        ownerId: user,
        assignedTo: user,
        createdBy: user,
        createdAt: fv?.serverTimestamp?.() || new Date(),
        updatedAt: fv?.serverTimestamp?.() || new Date()
      };

      await db.collection('deals').doc(dealId).set(dealDoc);

      // Update account with modified energy data
      const accountUpdates = {
        electricitySupplier: document.querySelector('input[name="electricitySupplier"]')?.value || '',
        annualUsage: modalState.dealData.annualUsage,
        currentRate: document.querySelector('input[name="currentRate"]')?.value || '',
        contractEndDate: document.querySelector('input[name="contractEndDate"]')?.value || '',
        serviceAddresses: serviceAddresses,
        updatedAt: fv?.serverTimestamp?.() || new Date()
      };

      await db.collection('accounts').doc(modalState.selectedAccount.id).update(accountUpdates);

      // Add deal to local state
      const newDeal = {
        id: dealId,
        title: modalState.dealData.title,
        company: modalState.selectedAccount.accountName || modalState.selectedAccount.name,
        amount: totalDealValue,
        owner: user.substring(0, 2).toUpperCase(),
        closeDate: modalState.dealData.projectedCloseDate || '',
        stage: modalState.dealData.stage
      };

      state.deals.unshift(newDeal);

      // Dispatch events for real-time updates
      document.dispatchEvent(new CustomEvent('pc:deal-created', { detail: { dealId, deal: dealDoc } }));
      document.dispatchEvent(new CustomEvent('pc:account-updated', { 
        detail: { accountId: modalState.selectedAccount.id, changes: accountUpdates } 
      }));

      // Refresh the board
      renderBoard();

      // Close modal and show success
      closeModal();
      window.crm?.showToast?.('Deal created successfully');

    } catch (error) {
      console.error('Error saving deal:', error);
      window.crm?.showToast?.('Error creating deal: ' + error.message);
    }
  }

  async function loadDealsFromFirebase() {
    try {
      const db = window.firebaseDB;
      const user = window.currentUserEmail;
      const isAdmin = window.currentUserRole === 'admin';
      
      if (!db || !user) {
        console.warn('Firebase not initialized, using sample data');
        return;
      }

      let snapshot;
      if (isAdmin) {
        snapshot = await db.collection('deals').get();
      } else {
        // Load deals owned by or assigned to user
        const [owned, assigned] = await Promise.all([
          db.collection('deals').where('ownerId', '==', user).get(),
          db.collection('deals').where('assignedTo', '==', user).get()
        ]);
        const dealsMap = new Map();
        owned.forEach(doc => dealsMap.set(doc.id, doc.data()));
        assigned.forEach(doc => {
          if (!dealsMap.has(doc.id)) dealsMap.set(doc.id, doc.data());
        });
        snapshot = Array.from(dealsMap.values());
      }
      
      state.deals = [];
      snapshot.forEach(doc => {
        const data = doc.data ? doc.data() : doc;
        state.deals.push({
          id: data.id,
          title: data.title,
          company: data.accountName,
          amount: data.totalDealValue || 0,
          owner: data.ownerId?.substring(0, 2).toUpperCase() || 'NA',
          closeDate: data.projectedCloseDate || '',
          stage: data.stage || 'interested'
        });
      });

      console.log(`Loaded ${state.deals.length} deals from Firebase`);
    } catch (error) {
      console.error('Error loading deals from Firebase:', error);
      // Keep sample data as fallback
    }
  }

  function initDealsPage() {
    if (state.initialized) return;
    const board = document.getElementById('deals-board');
    if (!board) return;

    // Load deals from Firebase first
    loadDealsFromFirebase().then(() => {
      renderBoard();
      enableHorizontalAutoScroll();
      handleAddDeal();
      handleQuickSearch();
      state.initialized = true;
    });
  }

  // Horizontal auto-scroll of the board when dragging near edges
  function enableHorizontalAutoScroll() {
    const container = document.querySelector('.board-container');
    if (!container) return;
    const onDragOver = (e) => {
      // allow drop operations while dragging across container
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const threshold = Math.min(80, rect.width * 0.15);
      const leftDist = e.clientX - rect.left;
      const rightDist = rect.right - e.clientX;
      const maxStep = 24; // px per event
      if (leftDist < threshold) {
        const factor = 1 - Math.max(0, leftDist) / threshold;
        container.scrollLeft -= Math.ceil(maxStep * factor);
      } else if (rightDist < threshold) {
        const factor = 1 - Math.max(0, rightDist) / threshold;
        container.scrollLeft += Math.ceil(maxStep * factor);
      }
    };
    container.addEventListener('dragover', onDragOver);
  }

  function formatCurrency(value) {
    try { 
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value); 
    } catch { 
      return `$${value}`; 
    }
  }

  // Expose functions globally
  if (!window.Deals) window.Deals = {};
  window.Deals.openModal = openAddDealModal;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDealsPage);
  } else {
    initDealsPage();
  }
})();
