'use strict';

// News Updates page module: filtering + table render, Firestore-backed (admin-only)
(function () {
  const state = {
    data: [], // raw posts
    filtered: [],
    loaded: false,
    selected: new Set(), // ids of selected posts
    pageSize: 50, // UI pagination size - consistent throughout
    currentPage: 1,
    errorMsg: '',
    totalCount: 0, // Total posts in database (for footer display)
    hasAnimated: false // Track if initial animation has played
  };

  const els = {};

  function qs(id) { return document.getElementById(id); }

  function initDomRefs() {
    els.page = document.getElementById('news-page');
    if (!els.page) return false;

    els.table = els.page.querySelector('#news-table');
    els.thead = els.page.querySelector('#news-table thead');
    els.headerRow = els.thead ? els.thead.querySelector('tr') : null;
    els.tbody = els.page.querySelector('#news-table tbody');
    els.tableContainer = els.page.querySelector('.table-container');
    els.tableScroll = els.page.querySelector('.table-scroll');
    els.quickSearch = qs('news-quick-search');
    els.toggleFilters = qs('toggle-news-filters');
    els.filterPanel = qs('news-filters');
    els.filterCountBadge = qs('news-filter-count');
    els.clearFilters = qs('clear-news-filters');
    els.applyFilters = qs('apply-news-filters');
    els.createPostBtn = qs('create-post-btn');
    els.selectAll = qs('select-all-news');
    els.pagination = qs('news-pagination');
    els.paginationSummary = qs('news-pagination-summary');
    
    // Filter inputs
    els.filterTitle = qs('filter-post-title');
    els.filterCategory = qs('filter-post-category');
    els.filterStatus = qs('filter-post-status');
    els.filterPublished = qs('filter-post-published');

    return !!els.page && !!els.table && !!els.tbody;
  }

  // Admin-only access check
  function isAdmin() {
    return window.currentUserRole === 'admin';
  }

  function normalize(s) { return (s || '').toString().trim().toLowerCase(); }

  function safe(val) { return (val == null ? '' : String(val)); }

  function formatDateOrNA(dateVal) {
    if (!dateVal) return '—';
    try {
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      if (isNaN(d.getTime())) return '—';
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const postDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      
      if (postDate.getTime() === today.getTime()) {
        return `Today, ${timeStr}`;
      } else if (postDate.getTime() === yesterday.getTime()) {
        return `Yesterday, ${timeStr}`;
      } else {
        // More than 2 days ago - show full date
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${dateStr}, ${timeStr}`;
      }
    } catch (_) {
      return '—';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function loadDataOnce() {
    if (state.loaded || !window.firebaseDB) return;
    await reloadData();
  }

  async function reloadData() {
    if (!window.firebaseDB) return;
    
    // Admin-only access check
    if (!isAdmin()) {
      console.warn('[News] Access denied - admin only');
      state.errorMsg = 'Access denied. Admin privileges required.';
      render();
      return;
    }

    try {
      console.log('[News] Loading posts from Firestore...');
      const snapshot = await window.firebaseDB.collection('posts')
        .orderBy('createdAt', 'desc')
        .get();
      
      state.data = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        state.data.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt || window.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: data.updatedAt || data.createdAt || window.firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      
      state.totalCount = state.data.length;
      state.filtered = state.data.slice();
      state.loaded = true;
      
      console.log('[News] Loaded', state.data.length, 'posts');
      applyFilters();
    } catch (error) {
      console.error('[News] Error loading posts:', error);
      state.errorMsg = error.message || 'Failed to load posts';
      render();
    }
  }

  function applyFilters() {
    if (!state.data || !Array.isArray(state.data)) {
      state.filtered = [];
      state.totalCount = 0;
      render();
      return;
    }

    const q = normalize(els.quickSearch?.value || '');
    const titleFilter = normalize(els.filterTitle?.value || '');
    const categoryFilter = normalize(els.filterCategory?.value || '');
    const statusFilter = els.filterStatus?.value || '';
    const publishedOnly = els.filterPublished?.checked || false;

    state.filtered = state.data.filter(post => {
      const title = normalize(post.title || '');
      const category = normalize(post.category || '');
      const status = post.status || 'draft';
      const slug = normalize(post.slug || '');

      // Quick search matches title, category, or slug
      if (q && !title.includes(q) && !category.includes(q) && !slug.includes(q)) {
        return false;
      }

      // Title filter
      if (titleFilter && !title.includes(titleFilter)) {
        return false;
      }

      // Category filter
      if (categoryFilter && !category.includes(categoryFilter)) {
        return false;
      }

      // Status filter
      if (statusFilter && status !== statusFilter) {
        return false;
      }

      // Published only
      if (publishedOnly && status !== 'published') {
        return false;
      }

      return true;
    });

    state.totalCount = state.filtered.length;
    state.currentPage = 1; // Reset to first page when filters change
    render();
    updateFilterCount();
  }

  function clearFilters() {
    if (els.quickSearch) els.quickSearch.value = '';
    if (els.filterTitle) els.filterTitle.value = '';
    if (els.filterCategory) els.filterCategory.value = '';
    if (els.filterStatus) els.filterStatus.value = '';
    if (els.filterPublished) els.filterPublished.checked = false;
    applyFilters();
  }

  function updateFilterCount() {
    const activeFilters = [];
    if (els.quickSearch?.value) activeFilters.push('search');
    if (els.filterTitle?.value) activeFilters.push('title');
    if (els.filterCategory?.value) activeFilters.push('category');
    if (els.filterStatus?.value) activeFilters.push('status');
    if (els.filterPublished?.checked) activeFilters.push('published');

    const count = activeFilters.length;
    if (els.filterCountBadge) {
      if (count > 0) {
        els.filterCountBadge.textContent = count;
        els.filterCountBadge.hidden = false;
      } else {
        els.filterCountBadge.hidden = true;
      }
    }
  }

  function getPageItems() {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return state.filtered.slice(start, end);
  }

  function getTotalPages() {
    return Math.ceil(state.filtered.length / state.pageSize) || 1;
  }

  function renderPagination() {
    if (!els.pagination) return;
    const totalPages = getTotalPages();
    const current = Math.min(state.currentPage, totalPages);
    state.currentPage = current;
    // Show total count
    const total = state.filtered.length;
    const start = total === 0 ? 0 : (current - 1) * state.pageSize + 1;
    const end = total === 0 ? 0 : Math.min(total, current * state.pageSize);

    // Use unified pagination component (exactly like accounts.js)
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(current, totalPages, (page) => {
        state.currentPage = page;
        render();
        // Scroll to top after page change via unified paginator
        try {
          requestAnimationFrame(() => {
            const scroller = (els.page && els.page.querySelector) ? els.page.querySelector('.table-scroll') : null;
            if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0, behavior: 'auto' });
            else if (scroller) scroller.scrollTop = 0;
            const main = document.getElementById('main-content');
            if (main && typeof main.scrollTo === 'function') main.scrollTo({ top: 0, behavior: 'auto' });
            const contentArea = document.querySelector('.content-area');
            if (contentArea && typeof contentArea.scrollTo === 'function') contentArea.scrollTo({ top: 0, behavior: 'auto' });
            window.scrollTo(0, 0);
          });
        } catch (_) { /* noop */ }
      }, els.pagination.id);
    } else {
      // Fallback to simple pagination if unified component not available
      els.pagination.innerHTML = `<div class="unified-pagination">
        <button class="pagination-arrow" ${current <= 1 ? 'disabled' : ''} onclick="if(${current} > 1) { state.currentPage = ${current - 1}; render(); (function(){ var s=document.querySelector('#news-page .table-scroll'); if(s){ s.scrollTop=0; } window.scrollTo(0,0); })(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
        </button>
        <div class="pagination-current">${current}</div>
        <button class="pagination-arrow" ${current >= totalPages ? 'disabled' : ''} onclick="if(${current} < ${totalPages}) { state.currentPage = ${current + 1}; render(); (function(){ var s=document.querySelector('#news-page .table-scroll'); if(s){ s.scrollTop=0; } window.scrollTo(0,0); })(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
        </button>
      </div>`;
    }

    if (els.paginationSummary) {
      const label = total === 1 ? 'post' : 'posts';
      els.paginationSummary.textContent = `Showing ${start}\u2013${end} of ${total} ${label}`;
    }
  }

  function rowHtml(post) {
    if (!post) return '';
    
    const title = safe(post.title || 'Untitled');
    const category = safe(post.category || '');
    const status = post.status || 'draft';
    const slug = safe(post.slug || '');
    const publishDate = formatDateOrNA(post.publishDate);
    const updatedStr = formatDateOrNA(post.updatedAt || post.createdAt);
    
    const isSelected = state.selected.has(post.id);
    const checked = isSelected ? ' checked' : '';
    const rowClass = isSelected ? ' class="row-selected"' : '';
    const pid = escapeHtml(post.id);
    
    const statusBadge = status === 'published' 
      ? '<span class="status-badge published">Published</span>'
      : '<span class="status-badge draft">Draft</span>';
    
    return `
<tr${rowClass} data-post-id="${pid}">
  <td class="col-select"><input type="checkbox" class="row-select" data-id="${pid}" aria-label="Select post"${checked}></td>
  <td class="name-cell"><a href="#post-detail" class="post-link" data-id="${pid}" title="View post details"><span class="name-text">${escapeHtml(title)}</span></a></td>
  <td>${escapeHtml(category)}</td>
  <td>${statusBadge}</td>
  <td><code style="font-size: 0.875rem; color: var(--text-secondary);">${escapeHtml(slug)}</code></td>
  <td>${escapeHtml(publishDate)}</td>
  <td>${escapeHtml(updatedStr)}</td>
  <td class="qa-cell">
    <div class="qa-actions">
      <button type="button" class="qa-btn" data-action="edit" data-id="${pid}" aria-label="Edit" title="Edit">${svgIcon('edit')}</button>
      <button type="button" class="qa-btn" data-action="publish" data-id="${pid}" data-status="${status}" aria-label="${status === 'published' ? 'Unpublish' : 'Publish'}" title="${status === 'published' ? 'Unpublish' : 'Publish'}">${svgIcon(status === 'published' ? 'unpublish' : 'publish')}</button>
      <button type="button" class="qa-btn" data-action="delete" data-id="${pid}" aria-label="Delete" title="Delete">${svgIcon('delete')}</button>
    </div>
  </td>
</tr>`;
  }

  function svgIcon(name) {
    const icons = {
      edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
      publish: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5,12 10,17 19,8"></polyline></svg>',
      unpublish: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      delete: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"></path><path d="M10,11v6M14,11v6"></path></svg>'
    };
    return icons[name] || '';
  }

  function emptyHtml() {
    const msg = state.errorMsg || 'No posts found.';
    return `
<tr>
  <td colspan="8" style="opacity:.75; text-align: center; padding: 2rem;">${escapeHtml(msg)}</td>
</tr>`;
  }

  function render() {
    if (!els.tbody) return;
    
    const items = getPageItems();
    
    if (items.length === 0) {
      els.tbody.innerHTML = emptyHtml();
    } else {
      els.tbody.innerHTML = items.map(rowHtml).join('');
      
      // Attach event listeners
      attachRowEvents();
    }
    
    renderPagination();
  }

  function attachRowEvents() {
    // Checkbox selection
    els.tbody.querySelectorAll('.row-select').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        if (e.target.checked) {
          state.selected.add(id);
        } else {
          state.selected.delete(id);
        }
        updateSelectAllState();
        render();
      });
    });
    
    // Quick actions
    els.tbody.querySelectorAll('.qa-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        handleQuickAction(action, id, btn);
      });
    });
    
    // Post link clicks
    els.tbody.querySelectorAll('.post-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = link.getAttribute('data-id');
        // TODO: Navigate to post detail page
        console.log('[News] Navigate to post:', id);
      });
    });
  }

  function handleQuickAction(action, id, btn) {
    const post = state.data.find(p => p.id === id);
    if (!post) return;
    
    switch (action) {
      case 'edit':
        if (window.PostEditor && typeof window.PostEditor.openEdit === 'function') {
          window.PostEditor.openEdit(id, post);
        } else {
          console.warn('[News] PostEditor not available');
        }
        break;
      case 'publish':
      case 'unpublish':
        togglePublishStatus(post);
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete "${post.title}"?`)) {
          deletePost(id);
        }
        break;
    }
  }

  async function togglePublishStatus(post) {
    try {
      const newStatus = post.status === 'published' ? 'draft' : 'published';
      await window.firebaseDB.collection('posts').doc(post.id).update({
        status: newStatus,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        ...(newStatus === 'published' && !post.publishDate ? { publishDate: window.firebase.firestore.FieldValue.serverTimestamp() } : {})
      });
      
      post.status = newStatus;
      if (newStatus === 'published' && !post.publishDate) {
        post.publishDate = new Date();
      }
      
      // If published, trigger static HTML generation
      // If unpublished, also regenerate posts-list.json to remove it
      if (newStatus === 'published' || newStatus === 'draft') {
        try {
          const apiBase = window.API_BASE_URL || 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:3000'
              : 'https://power-choosers-crm-792458658491.us-south1.run.app');
          
          if (newStatus === 'published') {
            // Generate static HTML for published post
            const response = await fetch(`${apiBase}/api/posts/generate-static`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ postId: post.id })
            });
            
            if (response.ok) {
              const result = await response.json();
              if (!result.skipped) {
                console.log('[News] Static HTML generated for post:', post.id);
                if (window.crm && typeof window.crm.showToast === 'function') {
                  window.crm.showToast('Post published and static HTML generated', 'success');
                }
              }
            } else {
              const errorText = await response.text();
              console.error('[News] Failed to generate static HTML:', response.status, errorText);
            }
          } else {
            // Unpublished - regenerate posts-list.json to remove this post
            // Call generate-static for any published post to trigger list update
            const publishedResponse = await fetch(`${apiBase}/api/posts/generate-static`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ regenerateList: true })
            });
            
            if (publishedResponse.ok) {
              console.log('[News] Posts list regenerated after unpublish');
            }
          }
        } catch (error) {
          console.error('[News] Error generating static HTML:', error);
          // Don't fail the publish/unpublish if static generation fails
        }
      }
      
      // Reload data to get fresh post list
      await reloadData();
      
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast(`Post ${newStatus === 'published' ? 'published' : 'unpublished'} successfully`, 'success');
      } else if (window.showToast) {
        window.showToast(`Post ${newStatus === 'published' ? 'published' : 'unpublished'} successfully`, 'success');
      }
    } catch (error) {
      console.error('[News] Error toggling publish status:', error);
      if (window.showToast) {
        window.showToast('Failed to update post status', 'error');
      }
    }
  }

  async function deletePost(id) {
    try {
      await window.firebaseDB.collection('posts').doc(id).delete();
      state.data = state.data.filter(p => p.id !== id);
      state.selected.delete(id);
      // Reload data to ensure consistency
      await reloadData();
      if (window.showToast) {
        window.showToast('Post deleted successfully', 'success');
      }
    } catch (error) {
      console.error('[News] Error deleting post:', error);
      if (window.showToast) {
        window.showToast('Failed to delete post', 'error');
      }
    }
  }

  function updateSelectAllState() {
    if (!els.selectAll) return;
    const pageItems = getPageItems();
    const allSelected = pageItems.length > 0 && pageItems.every(item => state.selected.has(item.id));
    els.selectAll.checked = allSelected;
    els.selectAll.indeterminate = !allSelected && pageItems.some(item => state.selected.has(item.id));
  }

  function toggleSelectAll(checked) {
    const pageItems = getPageItems();
    if (checked) {
      pageItems.forEach(item => state.selected.add(item.id));
    } else {
      pageItems.forEach(item => state.selected.delete(item.id));
    }
    render();
  }

  function attachEvents() {
    // Quick search
    if (els.quickSearch) {
      let searchTimeout;
      els.quickSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          applyFilters();
        }, 300);
      });
    }
    
    // Filter toggle
    if (els.toggleFilters) {
      els.toggleFilters.addEventListener('click', () => {
        if (els.filterPanel) {
          const isHidden = els.filterPanel.hidden;
          els.filterPanel.hidden = !isHidden;
          els.toggleFilters.querySelector('.filter-text').textContent = isHidden ? 'Hide Filters' : 'Show Filters';
        }
      });
    }
    
    // Clear filters
    if (els.clearFilters) {
      els.clearFilters.addEventListener('click', clearFilters);
    }
    
    // Apply filters
    if (els.applyFilters) {
      els.applyFilters.addEventListener('click', applyFilters);
    }
    
    // Create post button
    if (els.createPostBtn) {
      els.createPostBtn.addEventListener('click', () => {
        if (window.PostEditor && typeof window.PostEditor.openCreate === 'function') {
          window.PostEditor.openCreate();
        } else {
          console.warn('[News] PostEditor not available');
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Post editor is loading...', 'info');
          }
        }
      });
    }
    
    // Select all checkbox
    if (els.selectAll) {
      els.selectAll.addEventListener('change', (e) => {
        toggleSelectAll(e.target.checked);
      });
    }
  }

  function init() {
    if (!initDomRefs()) return;
    
    // Admin-only access check
    if (!isAdmin()) {
      console.warn('[News] Access denied - admin only');
      if (els.tbody) {
        els.tbody.innerHTML = '<tr><td colspan="8" style="opacity:.75; text-align: center; padding: 2rem;">Access denied. Admin privileges required.</td></tr>';
      }
      return;
    }
    
    attachEvents();
    loadDataOnce();
    
    // Listen for page visibility
    const pageObserver = new MutationObserver(() => {
      if (els.page && els.page.classList.contains('active') && !state.loaded) {
        loadDataOnce();
      }
    });
    
    if (els.page) {
      pageObserver.observe(els.page, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external access
  window.newsModule = {
    init,
    loadDataOnce,
    reloadData,
    applyFilters,
    render
  };
})();

