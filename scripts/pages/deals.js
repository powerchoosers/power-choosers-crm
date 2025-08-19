// Deals Page - Kanban Board
(function () {
  const STAGES = [
    { id: 'new', title: 'New' },
    { id: 'qualified', title: 'Qualified' },
    { id: 'proposal', title: 'Proposal' },
    { id: 'negotiation', title: 'Negotiation' },
    { id: 'won', title: 'Closed Won' },
    { id: 'lost', title: 'Closed Lost' },
  ];

  const sampleDeals = [
    { id: 'd1', title: 'Johnson Electric - Renewal', company: 'Johnson Electric', amount: 42000, owner: 'LP', closeDate: '2025-09-12', stage: 'new' },
    { id: 'd2', title: 'Metro Industries - Multi-site', company: 'Metro Industries', amount: 98000, owner: 'AM', closeDate: '2025-09-20', stage: 'qualified' },
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
      const id = 'd' + Math.random().toString(36).slice(2, 9);
      const newDeal = {
        id,
        title: 'New Deal',
        company: 'Untitled Company',
        amount: 10000,
        owner: 'LP',
        closeDate: new Date().toISOString().slice(0, 10),
        stage: 'new'
      };
      state.deals.unshift(newDeal);
      const list = document.querySelector('.deal-list[data-stage="new"]');
      if (list) list.prepend(createDealCard(newDeal));
      updateCounts();
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Deal created');
      }
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

  function initDealsPage() {
    if (state.initialized) return;
    const board = document.getElementById('deals-board');
    if (!board) return;

    renderBoard();
    enableHorizontalAutoScroll();
    handleAddDeal();
    handleQuickSearch();

    state.initialized = true;
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

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDealsPage);
  } else {
    initDealsPage();
  }
})();
