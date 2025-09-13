  // Normalize to last 10 digits
  function normPhone(s){ return (s==null?'':String(s)).replace(/\D/g,'').slice(-10); }
  function isClientAddr(s){ return typeof s==='string' && s.startsWith('client:'); }
  function pickCounterparty(c){
    const toRaw = c.to || '';
    const fromRaw = c.from || '';
    const to = normPhone(toRaw);
    const from = normPhone(fromRaw);
    const bizList = Array.isArray(window.CRM_BUSINESS_NUMBERS) ? window.CRM_BUSINESS_NUMBERS.map(normPhone).filter(Boolean) : [];
    const isBiz = (p)=> bizList.includes(p);
    // Prefer the non-client side
    if (isClientAddr(toRaw) && !isClientAddr(fromRaw)) return from;
    if (isClientAddr(fromRaw) && !isClientAddr(toRaw)) return to;
    // Prefer the non-business side if we know business numbers
    if (bizList.length){
      if (isBiz(to) && !isBiz(from)) return from;
      if (isBiz(from) && !isBiz(to)) return to;
    }
    // Fallbacks: prefer the 'to' number if it's a real phone, else 'from'
    if (to) return to;
    if (from) return from;
    return '';
  }

  // Lookup helpers from client-side datasets
  function getContactById(id){
    try{
      if (!id || typeof window.getPeopleData !== 'function') return null;
      const people = window.getPeopleData() || [];
      return people.find(p => p && (p.id === id));
    }catch(_){ return null; }
  }
  function getAccountById(id){
    try{
      if (!id || typeof window.getAccountsData !== 'function') return null;
      const accounts = window.getAccountsData() || [];
      return accounts.find(a => a && (a.id === id));
    }catch(_){ return null; }
  }

  // Find account by phone using Accounts data
  function findAccountByPhone(phone10){
    try{
      if (typeof window.getAccountsData === 'function'){
        const accounts = window.getAccountsData() || [];
        const hit = accounts.find(a=> normPhone(a.phone||a.primaryPhone||a.mainPhone) === phone10);
        if (hit) return hit;
      }
      // Fallback: attempt lightweight Firestore lookup once and cache
      if (phone10 && window.firebaseDB && !findAccountByPhone._cache) {
        findAccountByPhone._cache = { ready:false, map:new Map() };
        (async ()=>{
          try{
            const snap = await window.firebaseDB.collection('accounts').limit(500).get();
            snap.forEach(doc=>{
              const d = doc.data()||{};
              const ph = normPhone(d.phone||d.primaryPhone||d.mainPhone);
              if (ph && !findAccountByPhone._cache.map.has(ph)) findAccountByPhone._cache.map.set(ph,{ id:doc.id, ...d });
            });
            findAccountByPhone._cache.ready = true;
          }catch(_){ /* ignore */ }
        })();
      }
      if (findAccountByPhone._cache && findAccountByPhone._cache.ready){
        return findAccountByPhone._cache.map.get(phone10) || null;
      }
      return null;
    }catch(_){ return null; }
  }

  // Build a phone -> {name,title,company} map from People. Tries in-memory first then Firestore.
  let _phoneToContactCache = null;
  async function buildPhoneToContactMap(){
    if (_phoneToContactCache) return _phoneToContactCache;
    try{
      // 1) Use in-memory dataset if available
      if (typeof window.getPeopleData === 'function'){
        const people = window.getPeopleData() || [];
        if (Array.isArray(people) && people.length){
          const map = new Map();
          const norm = (p)=>(p||'').toString().replace(/\D/g,'').slice(-10);
          for (const c of people){
            const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || (c.name||'');
            const title = c.title || '';
            const company = c.companyName || '';
            const phones = [c.phone, c.mobile].map(norm).filter(Boolean);
            for (const ph of phones) if (ph && !map.has(ph)) map.set(ph,{ name, title, company });
          }
          _phoneToContactCache = map; return map;
        }
      }
      // 2) Fallback to Firestore (limited) to populate essential mappings
      if (window.firebaseDB){
        const map = new Map();
        const norm = (p)=>(p||'').toString().replace(/\D/g,'').slice(-10);
        // Query contacts with phone
        try{
          const snap1 = await window.firebaseDB.collection('contacts').where('phone','!=',null).limit(500).get();
          snap1.forEach(doc=>{
            const d = doc.data()||{};
            const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || (d.name||'');
            const title = d.title || '';
            const company = d.companyName || d.accountName || '';
            const ph = norm(d.phone);
            if (ph && !map.has(ph)) map.set(ph,{ name, title, company });
          });
        }catch(_){ /* ignore */ }
        // Query contacts with mobile
        try{
          const snap2 = await window.firebaseDB.collection('contacts').where('mobile','!=',null).limit(500).get();
          snap2.forEach(doc=>{
            const d = doc.data()||{};
            const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || (d.name||'');
            const title = d.title || '';
            const company = d.companyName || d.accountName || '';
            const ph = norm(d.mobile);
            if (ph && !map.has(ph)) map.set(ph,{ name, title, company });
          });
        }catch(_){ /* ignore */ }
        _phoneToContactCache = map; return map;
      }
    }catch(_){ }
    return new Map();
  }

  // Choose most recently active contact in an account (best-effort)
  function pickRecentContactForAccount(accountId){
    try{
      if (typeof window.getPeopleData !== 'function') return null;
      const people = window.getPeopleData() || [];
      const list = people.filter(p=> p && (p.accountId===accountId || p.accountID===accountId));
      if (!list.length) return null;
      // Compute recency based on common fields if available
      const scoreTime = (p)=>{
        const cand = [p.lastActivityAt, p.lastContactedAt, p.notesUpdatedAt, p.updatedAt, p.createdAt].map(v=>{
          try{
            if (!v) return 0;
            if (typeof v.toDate==='function') return v.toDate().getTime();
            const d = new Date(v); const t = d.getTime(); return isNaN(t)?0:t;
          }catch(_){ return 0; }
        });
        return Math.max(0, ...cand);
      };
      let best = null, bestT = -1;
      for (const p of list){ const t = scoreTime(p); if (t>bestT){ bestT=t; best=p; } }
      return best || null;
    }catch(_){ return null; }
  }

'use strict';
(function () {
  const state = { data: [], filtered: [], selected: new Set(), currentPage: 1, pageSize: 25, tokens: { city: [], title: [], company: [], state: [], employees: [], industry: [], visitorDomain: [] } };
  const els = {};
  const chips = [
    { k: 'city', i: 'calls-filter-city', c: 'calls-filter-city-chips', x: 'calls-filter-city-clear', s: 'calls-filter-city-suggest', acc: r => r.contactCity || '' },
    { k: 'title', i: 'calls-filter-title', c: 'calls-filter-title-chips', x: 'calls-filter-title-clear', s: 'calls-filter-title-suggest', acc: r => r.contactTitle || '' },
    { k: 'company', i: 'calls-filter-company', c: 'calls-filter-company-chips', x: 'calls-filter-company-clear', s: 'calls-filter-company-suggest', acc: r => r.company || '' },
    { k: 'state', i: 'calls-filter-state', c: 'calls-filter-state-chips', x: 'calls-filter-state-clear', s: 'calls-filter-state-suggest', acc: r => r.contactState || '' },
    { k: 'employees', i: 'calls-filter-employees', c: 'calls-filter-employees-chips', x: 'calls-filter-employees-clear', s: 'calls-filter-employees-suggest', acc: r => (r.accountEmployees != null ? r.accountEmployees : r.employees) },
    { k: 'industry', i: 'calls-filter-industry', c: 'calls-filter-industry-chips', x: 'calls-filter-industry-clear', s: 'calls-filter-industry-suggest', acc: r => r.industry || '' },
    { k: 'visitorDomain', i: 'calls-filter-visitor-domain', c: 'calls-filter-visitor-domain-chips', x: 'calls-filter-visitor-domain-clear', s: 'calls-filter-visitor-domain-suggest', acc: r => r.visitorDomain || '' }
  ];
  const pool = { city: [], title: [], company: [], state: [], employees: [], industry: [], visitorDomain: [] };
  const N = s => (s == null ? '' : String(s)).trim().toLowerCase();

  // Small inline SVG icons (inherit currentColor -> white on dark)
  function svgIcon(name) {
    switch (name) {
      case 'clear':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      case 'email':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none"></path><polyline points="22,6 12,13 2,6" fill="none"></polyline></svg>';
      case 'sequence':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      case 'call':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.5v2a3 3 0 0 1-3.3 3 a19 19 0 0 1-8.3-3.2 19 19 0 0 1-6-6A19 19 0 0 1 1.5 4.3 3 3 0 0 1 4.5 1h2a2 2 0 0 1 2 1.7l.4 2.3a2 2 0 0 1-.5 1.8L7 8a16 16 0 0 0 9 9l1.2-1.3a2 2 0 0 1 1.8-.5l2.3.4A2 2 0 0 1 22 16.5z"/></svg>';
      case 'addlist':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>';
      case 'export':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      case 'ai':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block"><text x="12" y="12" dy="-0.12em" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="18" font-weight="800" letter-spacing="0.05" font-family="Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif">AI</text></svg>';
      case 'delete':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      case 'linkedin':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5z" transform="translate(4 4)"/><path d="M2 8h4v10H2z" transform="translate(4 4)"/><path d="M9 8h3v1.7c.6-1 1.6-1.7 3.2-1.7 3 0 4.8 2 4.8 5.6V18h-4v-3.7c0-1.4-.5-2.4-1.7-2.4-1 0-1.5.7-1.8 1.4-.1.2-.1.6-.1.9V18H9z" transform="translate(4 4)"/></svg>';
      case 'link':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg>';
      case 'task':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6a2 2 0 0 1 2 2v2h2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h2V4a2 2 0 0 1 2-2z"/><path d="M9 4h6"/><path d="M9 12l2 2 4-4"/></svg>';
      case 'insights':
        // Eye icon for viewing insights
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      default:
        return '';
    }
  }

  // Inject CRM-themed styles for bulk selection/backdrop and actions bar (Calls)
  function injectCallsBulkStyles() {
    const id = 'calls-bulk-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = `
      /* Bulk selection backdrop */
      .bulk-select-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.35);
        z-index: 800;
      }

      /* Bulk selection popover */
      .bulk-select-popover {
        position: absolute;
        z-index: 900;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        box-shadow: var(--elevation-card);
        padding: var(--spacing-md);
        min-width: 320px;
        max-width: 480px;
      }
      .bulk-select-popover .option { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      .bulk-select-popover .option:last-of-type { margin-bottom: 0; }
      .bulk-select-popover label { font-weight: 600; color: var(--text-primary); }
      .bulk-select-popover .hint { color: var(--text-secondary); font-size: 12px; }
      .bulk-select-popover input[type="number"] {
        width: 120px; height: 32px; padding: 0 10px;
        background: var(--grey-700); color: var(--text-inverse);
        border: 1px solid var(--grey-600); border-radius: var(--border-radius-sm);
      }
      .bulk-select-popover .actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
      .bulk-select-popover .btn-text { height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm); background: transparent; color: var(--text-secondary); border: 1px solid transparent; }
      .bulk-select-popover .btn-text:hover { background: var(--grey-700); border-color: var(--border-light); color: var(--text-inverse); }
      .bulk-select-popover .btn-primary { height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm); background: var(--grey-700); color: var(--text-inverse); border: 1px solid var(--grey-600); font-weight: 600; }
      .bulk-select-popover .btn-primary:hover { background: var(--grey-600); border-color: var(--grey-500); }

      /* Ensure positioning context and avoid clipping */
      #calls-page .table-container { position: relative; overflow: visible; }

      /* Disabled insights button styles */
      .qa-btn.insights-btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }
      .qa-btn.insights-btn.disabled:hover {
        background: var(--grey-800);
        border-color: var(--grey-700);
      }

      /* Bulk actions bar inside table container */
      #calls-bulk-actions.bulk-actions-modal {
        position: absolute;
        left: 50%; transform: translateX(-50%);
        top: 8px;
        width: max-content; max-width: none;
        padding: 8px 12px;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--elevation-card);
        z-index: 850;
      }
      #calls-bulk-actions .bar { display: flex; align-items: center; gap: var(--spacing-sm); flex-wrap: nowrap; white-space: nowrap; width: auto; overflow: visible; }
      #calls-bulk-actions .spacer { display: none; }
      #calls-bulk-actions .action-btn-sm { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); font-size: 0.85rem; flex: 0 0 auto; }
      #calls-bulk-actions .action-btn-sm:hover { background: var(--grey-700); }
      #calls-bulk-actions .action-btn-sm.danger { background: var(--red-muted); border-color: var(--red-subtle); color: var(--text-inverse); }
      #calls-bulk-actions .action-btn-sm svg { display: block; }
      #calls-bulk-actions .action-btn-sm span { display: inline-block; white-space: nowrap; }
      #calls-bulk-actions #bulk-ai svg { transform: translateY(2px); }

      /* Delete confirmation popover */
      .delete-popover {
        position: fixed; z-index: 960; background: var(--bg-modal, #262a30);
        color: var(--text-inverse); border: 1px solid var(--grey-700);
        border-radius: var(--border-radius); box-shadow: var(--shadow-xl);
        padding: 0; min-width: 280px; max-width: 360px;
      }
      .delete-popover::before {
        content: ''; position: absolute; top: -6px; left: var(--arrow-left, 50%);
        width: 12px; height: 12px; background: var(--bg-modal, #262a30);
        border: 1px solid var(--grey-700); border-bottom: none; border-right: none;
        transform: rotate(45deg); transform-origin: center;
      }
      .delete-popover-inner { padding: 20px; }
      .delete-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text-inverse); }
      .btn-row { display: flex; justify-content: flex-end; gap: 8px; }
      .btn-cancel, .btn-danger {
        padding: 8px 16px; border-radius: var(--border-radius-sm); font-size: 14px;
        font-weight: 500; cursor: pointer; border: 1px solid transparent;
        transition: all 0.2s ease;
      }
      .btn-cancel {
        background: var(--bg-item); color: var(--text-inverse);
        border-color: var(--border-light);
      }
      .btn-cancel:hover { background: var(--grey-700); border-color: var(--grey-600); }
      .btn-danger {
        background: var(--red-muted); color: var(--text-inverse);
        border-color: var(--red-subtle);
      }
      .btn-danger:hover { background: var(--red-600); border-color: var(--red-500); }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function initDomRefs() {
    els.page = document.getElementById('calls-page'); if (!els.page) return false;
    els.table = document.getElementById('calls-table'); els.tbody = els.table ? els.table.querySelector('tbody') : null;
    els.container = els.page.querySelector('.table-container');
    els.pag = document.getElementById('calls-pagination'); els.summary = document.getElementById('calls-pagination-summary');
    els.selectAll = document.getElementById('select-all-calls');
    els.toggle = document.getElementById('toggle-calls-filters'); els.panel = document.getElementById('calls-filters'); els.count = document.getElementById('calls-filter-count');
    els.btnClear = document.getElementById('clear-calls-filters'); els.btnApply = document.getElementById('apply-calls-filters');
    els.hasEmail = document.getElementById('calls-filter-has-email'); els.hasPhone = document.getElementById('calls-filter-has-phone');
    chips.forEach(d => { d.ie = document.getElementById(d.i); d.ce = document.getElementById(d.c); d.xe = document.getElementById(d.x); d.se = document.getElementById(d.s); });
    return true;
  }

  function attachEvents() {
    if (els.toggle && els.panel) els.toggle.addEventListener('click', () => { const h = els.panel.hasAttribute('hidden'); if (h) { els.panel.removeAttribute('hidden'); els.toggle.querySelector('.filter-text').textContent = 'Hide Filters'; } else { els.panel.setAttribute('hidden', ''); els.toggle.querySelector('.filter-text').textContent = 'Show Filters'; } });
    if (els.btnClear) els.btnClear.addEventListener('click', () => { clearFilters(); applyFilters(); });
    if (els.btnApply) els.btnApply.addEventListener('click', applyFilters);
    if (els.selectAll) els.selectAll.addEventListener('change', () => { if (els.selectAll.checked) openBulkPopover(); else { state.selected.clear(); render(); closeBulkPopover(); hideBulkBar(); } });
    chips.forEach(d => setupChip(d));
  }

  function setupChip(d) {
    if (!d.ie) return; renderChips(d);
    d.ie.addEventListener('input', () => { buildPool(d); showSuggest(d, d.ie.value); });
    d.ie.addEventListener('keydown', (e) => { if (e.key === 'Enter' && d.ie.value.trim()) { e.preventDefault(); addToken(d.k, d.ie.value.trim()); d.ie.value = ''; applyFilters(); } else if (e.key === 'Backspace' && !d.ie.value) { const arr = state.tokens[d.k]; if (arr && arr.length) { arr.pop(); renderChips(d); applyFilters(); } } });
    if (d.xe) d.xe.addEventListener('click', () => { state.tokens[d.k] = []; renderChips(d); applyFilters(); });
  }
  function buildPool(d) { const set = new Set(), arr = []; for (const r of state.data) { const v0 = d.acc(r); const v = v0 == null ? '' : String(v0).trim(); if (!v) continue; const k = N(v); if (!set.has(k)) { set.add(k); arr.push(v); } if (arr.length > 1500) break; } pool[d.k] = arr; }
  function showSuggest(d, q) { if (!d.se) return; const items = (pool[d.k] || []).filter(v => N(v).includes(N(q))).slice(0, 8); if (!items.length) { hideSuggest(d); return; } d.se.innerHTML = items.map(v => `<div class="suggest-item" data-v="${v.replace(/"/g,'&quot;')}">${v}</div>`).join(''); d.se.removeAttribute('hidden'); d.se.querySelectorAll('.suggest-item').forEach(it => it.addEventListener('mousedown', (e) => { e.preventDefault(); addToken(d.k, it.getAttribute('data-v')); if (d.ie) d.ie.value = ''; hideSuggest(d); applyFilters(); })); }
  function hideSuggest(d) { if (d.se) { d.se.setAttribute('hidden', ''); d.se.innerHTML = ''; } }
  function renderChips(d) { if (!d.ce) return; const arr = state.tokens[d.k] || []; d.ce.innerHTML = arr.map((t,i)=>`<span class="chip" data-idx="${i}"><span class="chip-label">${t}</span><button type="button" class="chip-remove" aria-label="Remove">&times;</button></span>`).join(''); d.ce.querySelectorAll('.chip-remove').forEach((b,i)=>b.addEventListener('click',()=>{ arr.splice(i,1); renderChips(d); applyFilters(); })); if (d.xe) { if (arr.length) d.xe.removeAttribute('hidden'); else d.xe.setAttribute('hidden',''); } updateFilterCount(); }
  function addToken(k, v) { const t = (v==null?'':String(v)).trim(); if (!t) return; const arr = state.tokens[k] || (state.tokens[k]=[]); if (!arr.some(x=>N(x)===N(t))) { arr.push(t); const d = chips.find(x=>x.k===k); if (d) renderChips(d); } }

  async function loadData() {
    // 1) Try to load real calls from backend - use current origin by default
    try {
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      console.log('[Calls] Loading real call data from:', `${base}/api/calls`);
        const r = await fetch(`${base}/api/calls`, { method: 'GET' });
        const j = await r.json().catch(()=>({}));
        if (r.ok && j && j.ok && Array.isArray(j.calls)) {
          // Build quick phone → contact map from People data (if available), else Firestore
          const phoneToContact = await buildPhoneToContactMap();

          console.log('[Calls] Found', j.calls.length, 'real calls from API');
          const playbackBase = /localhost|127\.0\.0\.1/.test(base) ? 'https://power-choosers-crm.vercel.app' : base;
          const rows = j.calls.map((c, idx) => {
            const id = c.id || `call_${Date.now()}_${idx}`;
            const party = pickCounterparty(c);
            const debug = { id, to: c.to, from: c.from, party, accountId: c.accountId || null, contactId: c.contactId || null };
            
            // Debug: Log the raw API call data to see what's available (remove in production)
            // console.log('[Calls] Raw API call data:', c);
            // console.log('[Calls] Available people data:', typeof window.getPeopleData === 'function' ? window.getPeopleData()?.length : 'getPeopleData not available');

            // Contact name resolution
            let contactName = '';
            let resolvedContactId = c.contactId || null;
            
            if (c.contactName) { 
              contactName = c.contactName; 
              debug.contactSource = 'api.contactName';
              
              // Try to find contact ID by name if not provided
              if (!resolvedContactId && typeof window.getPeopleData === 'function') {
                const people = window.getPeopleData() || [];
                // console.log('[Calls] Searching for contact by name:', contactName, 'in', people.length, 'people');
                const foundContact = people.find(p => {
                  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
                  const match = fullName === contactName || p.name === contactName;
                  // if (match) {
                  //   console.log('[Calls] Found matching contact:', p);
                  // }
                  return match;
                });
                if (foundContact) {
                  resolvedContactId = foundContact.id;
                  debug.contactIdSource = 'people.byName';
                  // console.log('[Calls] Resolved contactId from name lookup:', resolvedContactId);
                } else {
                  // console.log('[Calls] No matching contact found for name:', contactName);
                }
              }
            }
            else if (c.contactId) {
              const pc = getContactById(c.contactId);
              const full = pc ? ([pc.firstName, pc.lastName].filter(Boolean).join(' ') || pc.name || '') : '';
              if (full) { contactName = full; debug.contactSource = 'people.byId'; }
            }
            if (!contactName) {
              const m = phoneToContact.get(party);
              if (m && m.name) { 
                contactName = m.name; 
                debug.contactSource = 'people.byPhone';
                if (!resolvedContactId && m.id) {
                  resolvedContactId = m.id;
                  debug.contactIdSource = 'phoneMap.byPhone';
                }
              }
            }
            if (!contactName) {
              const acct = findAccountByPhone(party);
              if (acct){
                const p = pickRecentContactForAccount(acct.id || acct.accountId || acct.accountID);
                if (p){
                  const full = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '';
                  if (full) { 
                    contactName = full; 
                    debug.contactSource = 'account.recentContact';
                    if (!resolvedContactId) {
                      resolvedContactId = p.id;
                      debug.contactIdSource = 'account.recentContact';
                    }
                  }
                }
              }
            }
            
            // Debug: Log the resolved contact ID (remove in production)
            // console.log('[Calls] Resolved contactId:', resolvedContactId, 'for contactName:', contactName);
            // console.log('[Calls] Debug info:', debug);

            // Contact title resolution with fallback and debugging
            let contactTitle = '';
            
            // Try from call data first
            if (c.contactTitle) {
              contactTitle = c.contactTitle;
              debug.titleSource = 'api.contactTitle';
            }
            
            // Try from contact ID lookup
            if (!contactTitle && c.contactId) {
              const pc = getContactById(c.contactId);
              if (pc && pc.title) { 
                contactTitle = pc.title; 
                debug.titleSource = 'people.byId'; 
              }
            }
            
            // Try from phone to contact map
            if (!contactTitle && party) {
              const m = phoneToContact.get(party);
              if (m && m.title) { 
                contactTitle = m.title; 
                debug.titleSource = 'people.byPhone'; 
              }
            }
            
            // Try from account lookup
            if (!contactTitle && party) {
              const acct = findAccountByPhone(party);
              if (acct){
                const p = pickRecentContactForAccount(acct.id || acct.accountId || acct.accountID);
                if (p && p.title) { 
                  contactTitle = p.title; 
                  debug.titleSource = 'account.recentContact'; 
                }
              }
            }
            
            // Debug logging for title resolution issues
            if (window.CRM_DEBUG_CALLS && !contactTitle && (c.contactId || party)) {
              console.debug('[Calls][title] No title found for:', {
                callId: id,
                contactId: c.contactId,
                party,
                phoneMapSize: phoneToContact.size
              });
            }

            // Company resolution
            let company = '';
            if (c.accountName) { company = c.accountName; debug.companySource = 'api.accountName'; }
            else if (c.accountId) {
              const a = getAccountById(c.accountId);
              if (a) { company = a.accountName || a.name || a.companyName || ''; debug.companySource = 'accounts.byId'; }
            }
            if (!company && c.contactId) {
              const pc = getContactById(c.contactId);
              if (pc) { company = pc.companyName || pc.accountName || pc.company || ''; debug.companySource = 'people.companyFromContactId'; }
            }
            if (!company) {
              const m = phoneToContact.get(party);
              if (m && m.company) { company = m.company; debug.companySource = 'people.byPhone'; }
            }
            if (!company) {
              const acct = findAccountByPhone(party);
              if (acct){ company = acct.accountName || acct.name || acct.companyName || ''; debug.companySource = 'accounts.byPhone'; }
            }

            // Pretty print phone
            const contactPhone = party ? `+1 (${party.slice(0,3)}) ${party.slice(3,6)}-${party.slice(6)}` : '';

            const row = {
              id,
              contactId: resolvedContactId,
              contactName,
              contactTitle,
              company,
              contactEmail: '',
              contactPhone,
              contactCity: '',
              contactState: '',
              accountEmployees: null,
              industry: '',
              visitorDomain: '',
              callTime: c.callTime || new Date().toISOString(),
              durationSec: c.durationSec || 0,
              outcome: c.outcome || '',
              transcript: c.transcript || '',
              aiSummary: c.aiSummary || '',
              aiInsights: c.aiInsights || null,
              audioUrl: c.audioUrl ? `${playbackBase}/api/recording?url=${encodeURIComponent(c.audioUrl)}` : ''
            };

            // Enhanced debugging for title issues
            if (window.CRM_DEBUG_CALLS) {
              try { 
                console.debug('[Calls][map]', { 
                  ...debug, 
                  contactName, 
                  contactTitle, 
                  company, 
                  duration: row.durationSec, 
                  outcome: row.outcome, 
                  audio: !!row.audioUrl,
                  hasTitle: !!contactTitle,
                  originalContactTitle: c.contactTitle
                }); 
              } catch(_) {}
            }

            return row;
          });
          // Always use API data, even if empty
          state.data = rows; state.filtered = rows.slice(); chips.forEach(buildPool); render();
          return;
        } else {
          console.log('[Calls] API returned no calls or error:', j);
        }
    } catch (error) { 
      console.warn('[Calls] Failed to load real call data:', error);
      console.log('[Calls] Falling back to demo data');
    }

    // 2) Fallback: demo data (only used when no real API data available)
    console.log('[Calls] Using demo data - configure Twilio/Gemini APIs for real call insights');
    const cos = ['Acme Manufacturing','Metro Industries','Johnson Electric','Downtown Office','Northwind Traders'];
    const cities = ['Austin','Dallas','Houston','San Antonio','Fort Worth'];
    const states = ['TX','TX','TX','TX','TX'];
    const titles = ['Operations Manager','Facilities Director','Procurement Lead','Energy Analyst','CFO'];
    const industries = ['Industrial','Commercial','Electrical','Real Estate','Trading'];
    const rows = [];
    for (let i=1;i<=60;i++){ 
      const j=i%cos.length; 
      const dur=60+Math.floor(Math.random()*900); 
      const outcomes = ['Connected','Voicemail','No Answer'];
      const outcome = outcomes[i%3];
      
      // Generate sample AI insights for demo purposes
      const sampleInsights = {
        sentiment: ['Positive', 'Neutral', 'Negative'][i%3],
        keyTopics: ['Energy costs', 'Contract terms', 'Renewable options', 'Budget planning', 'Timeline'][i%5] ? [['Energy costs', 'Contract terms', 'Renewable options', 'Budget planning', 'Timeline'][i%5]] : [],
        nextSteps: ['Follow up next week', 'Send proposal', 'Schedule site visit', 'Review contract', 'Discuss pricing'][i%5] ? [['Follow up next week', 'Send proposal', 'Schedule site visit', 'Review contract', 'Discuss pricing'][i%5]] : [],
        painPoints: ['High energy costs', 'Outdated equipment', 'Long contracts', 'Poor service', 'Limited options'][i%5] ? [['High energy costs', 'Outdated equipment', 'Long contracts', 'Poor service', 'Limited options'][i%5]] : [],
        budget: ['$5,000-10,000', '$10,000-25,000', '$25,000-50,000', 'Not discussed', 'Flexible'][i%5],
        timeline: ['1-3 months', '3-6 months', '6-12 months', 'ASAP', 'Not specified'][i%5]
      };
      
      rows.push({ 
        id:'call_'+i, 
        contactId: `demo_contact_${i}`, // Demo contact ID for testing
        contactName:`Contact ${i}`, 
        contactTitle:titles[j], 
        company:cos[j], 
        contactEmail:`c${i}@ex.com`, 
        contactPhone:Math.random()>0.5?`512-555-${(1000+i).toString().slice(-4)}`:'', 
        contactCity:cities[j], 
        contactState:states[j], 
        accountEmployees:[10,50,120,400,900][j], 
        industry:industries[j], 
        visitorDomain:'', 
        callTime:new Date(Date.now()-i*3600*1000).toISOString(), 
        durationSec:dur, 
        outcome:outcome, 
        transcript:outcome === 'Connected' ? `Call transcript for ${cos[j]}:\n\nContact: "Hi, I'm interested in learning more about your energy services."\n\nRep: "Great! I'd be happy to help. What's your current energy situation?"\n\nContact: "We're paying about $0.12 per kWh and our contract expires in 6 months. We're looking for better rates."\n\nRep: "I can definitely help with that. Based on your usage, I think we can save you 15-20% on your energy costs."\n\nContact: "That sounds promising. What would the next steps be?"\n\nRep: "I'll send you a detailed proposal with our rates and terms. Would you like to schedule a follow-up call next week?"\n\nContact: "Yes, that works for me."` : 'No transcript available - call not connected',
        aiSummary:outcome === 'Connected' ? `Call with ${cos[j]} went well. Contact expressed interest in energy services and is looking to reduce costs. Current rate is $0.12/kWh with contract expiring in 6 months. Discussed potential 15-20% savings. Next steps: send proposal and schedule follow-up call.` : 'No summary available - call not connected',
        aiInsights:outcome === 'Connected' ? sampleInsights : null,
        audioUrl:outcome === 'Connected' ? '' : '' // No demo audio files
      }); 
    }
    console.log('[Calls] Demo data loaded:', rows.length, 'calls');
    console.log('[Calls] Sample call data:', rows[0]);
    state.data = rows; state.filtered = rows.slice(); chips.forEach(buildPool); render();
  }

  function applyFilters() {
    if ((state.tokens.visitorDomain||[]).length>0) { state.filtered=[]; state.currentPage=1; return render(); }
    let arr = state.data.filter(r=>{
      if (els.hasEmail && els.hasEmail.checked && !r.contactEmail) return false;
      if (els.hasPhone && els.hasPhone.checked && !r.contactPhone) return false;
      for (const k of Object.keys(state.tokens)){
        const toks = state.tokens[k]||[]; if (!toks.length) continue; const d = chips.find(x=>x.k===k); const val = N(d?d.acc(r):''); if (!toks.some(t=>val.includes(N(t)))) return false;
      }
      return true;
    });
    state.filtered = arr; state.currentPage=1; render();
  }
  function clearFilters(){ Object.keys(state.tokens).forEach(k=>state.tokens[k]=[]); if(els.hasEmail) els.hasEmail.checked=false; if(els.hasPhone) els.hasPhone.checked=false; chips.forEach(renderChips); updateFilterCount(); }
  function updateFilterCount(){ if(!els.count) return; const n = Object.values(state.tokens).reduce((a,b)=>a+(b?b.length:0),0)+(els.hasEmail&&els.hasEmail.checked?1:0)+(els.hasPhone&&els.hasPhone.checked?1:0); if(n){ els.count.textContent=String(n); els.count.removeAttribute('hidden'); } else { els.count.textContent='0'; els.count.setAttribute('hidden',''); } }

  function getPageItems(){ const s=(state.currentPage-1)*state.pageSize; return state.filtered.slice(s,s+state.pageSize); }
  
  // Navigation helper functions (following project rules)
  function getCurrentFilters() {
    return {
      hasEmail: els.hasEmail ? els.hasEmail.checked : false,
      hasPhone: els.hasPhone ? els.hasPhone.checked : false,
      tokens: { ...state.tokens }
    };
  }
  
  function getSelectedItems() {
    return Array.from(state.selected);
  }
  
  function getCurrentSort() {
    // Calls page doesn't have sorting yet, but return empty for consistency
    return null;
  }
  
  function getCurrentSearch() {
    return els.quickSearch ? els.quickSearch.value : '';
  }
  function paginate(){ 
    if(!els.pag) return; 
    const total=state.filtered.length; 
    const pages=Math.max(1,Math.ceil(total/state.pageSize)); 
    state.currentPage=Math.min(state.currentPage,pages); 
    if(els.summary){ 
      const st=total===0?0:(state.currentPage-1)*state.pageSize+1; 
      const en=Math.min(state.currentPage*state.pageSize,total); 
      els.summary.textContent=`${st}-${en} of ${total}`; 
    } 
    
    // Use unified pagination component
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(state.currentPage, pages, (page) => {
        state.currentPage = page;
        render();
      }, els.pag.id);
    } else {
      // Fallback to simple pagination if unified component not available
      els.pag.innerHTML = `<div class="unified-pagination">
        <button class="pagination-arrow" ${state.currentPage <= 1 ? 'disabled' : ''} onclick="if(${state.currentPage} > 1) { state.currentPage = ${state.currentPage - 1}; render(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
        </button>
        <div class="pagination-current">${state.currentPage}</div>
        <button class="pagination-arrow" ${state.currentPage >= pages ? 'disabled' : ''} onclick="if(${state.currentPage} < ${pages}) { state.currentPage = ${state.currentPage + 1}; render(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
        </button>
      </div>`;
    }
  }

  function render(){ if(!els.tbody) return; const rows=getPageItems(); 
    // Debug: Log first row to see if contactId is present (remove in production)
    // if (rows.length > 0) {
    //   console.log('[Calls] First row data:', rows[0]);
    //   console.log('[Calls] First row contactId:', rows[0].contactId);
    // }
    els.tbody.innerHTML= rows.map(r=>rowHtml(r)).join('');
    // row events
    els.tbody.querySelectorAll('input.row-select').forEach(cb=>cb.addEventListener('change',()=>{ const id=cb.getAttribute('data-id'); if(cb.checked) state.selected.add(id); else state.selected.delete(id); updateBulkBar(); }));
    els.tbody.querySelectorAll('button.insights-btn').forEach(btn=>btn.addEventListener('click',(e)=>{
      if(btn.disabled) {
        e.preventDefault();
        return;
      }
      openInsightsModal(btn.getAttribute('data-id'));
    }));
    
    // Navigation event handlers (following project rules)
    els.tbody.querySelectorAll('.name-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        const contactId = cell.getAttribute('data-contact-id');
        console.log('[Calls] Contact name clicked, contactId:', contactId);
        
        console.log('[Calls] ContactDetail module available:', !!window.ContactDetail);
        console.log('[Calls] ContactDetail.show function available:', !!(window.ContactDetail && typeof window.ContactDetail.show === 'function'));
        
        if (contactId && contactId.trim()) {
          // Store navigation source before navigating (using same pattern as other pages)
          window._contactNavigationSource = 'calls';
          window._contactNavigationContactId = contactId;
          
          console.log('[Calls] Navigation source stored for contact:', window._contactNavigationSource, contactId);
          
          // Navigate to contact detail
          if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
            console.log('[Calls] Navigating to ContactDetail with ID:', contactId);
            // Navigate to people page first, then show contact detail (same pattern as account-detail.js)
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Use requestAnimationFrame to ensure the page has started loading
              requestAnimationFrame(() => {
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  console.log('[Calls] Showing contact detail:', contactId);
                  try {
                    window.ContactDetail.show(contactId);
                  } catch (error) {
                    console.error('[Calls] Error showing contact detail:', error);
                  }
                } else {
                  console.log('[Calls] ContactDetail not available after navigation');
                }
              });
            }
          } else {
            console.log('[Calls] ContactDetail not available, trying fallback navigation');
            // Fallback: navigate to people page
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
            }
          }
        } else {
          console.log('[Calls] No contact ID available for navigation, contactId:', contactId);
        }
      });
    });
    
    els.tbody.querySelectorAll('.company-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const companyName = link.getAttribute('data-company');
        console.log('[Calls] Company name clicked, companyName:', companyName);
        
        if (companyName && companyName.trim()) {
          // Store navigation source before navigating (using same pattern as other pages)
          window._accountNavigationSource = 'calls';
          window._callsReturn = {
            page: state.currentPage,
            scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
            filters: getCurrentFilters(),
            selectedItems: getSelectedItems(),
            sortColumn: getCurrentSort(),
            searchTerm: getCurrentSearch()
          };
          
          console.log('[Calls] Navigation source stored for company:', window._accountNavigationSource, window._callsReturn);
          
          // Navigate to account detail
          if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
            // Try to find account by name first
            if (typeof window.getAccountsData === 'function') {
              const accounts = window.getAccountsData() || [];
              const account = accounts.find(acc => acc.accountName === companyName || acc.name === companyName);
              if (account && account.id) {
                console.log('[Calls] Found account, navigating to AccountDetail with ID:', account.id);
                window.AccountDetail.show(account.id);
                return;
              }
            }
            console.log('[Calls] Account not found, trying fallback navigation');
            // Fallback: navigate to account details page
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('account-details');
            }
          } else {
            console.log('[Calls] AccountDetail not available, trying fallback navigation');
            // Fallback: navigate to accounts page
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('accounts');
            }
          }
        } else {
          console.log('[Calls] No company name available for navigation');
        }
      });
    });
    
    // header select state
    if(els.selectAll){ const pageIds=new Set(rows.map(r=>r.id)); const allSelected=[...pageIds].every(id=>state.selected.has(id)); els.selectAll.checked = allSelected && rows.length>0; }
    paginate(); updateBulkBar(); }

  function rowHtml(r){
    // Debug: Log the row data being processed (remove in production)
    // console.log('[Calls] rowHtml processing row:', r);
    // console.log('[Calls] rowHtml contactId:', r.contactId);
    
    const dur = `${Math.floor(r.durationSec/60)}m ${r.durationSec%60}s`;
    const id = escapeHtml(r.id);
    const name = escapeHtml(r.contactName || r.to || '');
    const title = escapeHtml(r.contactTitle || '');
    const company = escapeHtml(r.company || '');
    const callTimeStr = new Date(r.callTime).toLocaleString();
    const updatedStr = new Date(r.callTime).toLocaleDateString();
    const outcome = escapeHtml(r.outcome || '');
    const website = '';
    const linkedin = '';
    
    // Enhanced AI insights display
    const aiInsights = r.aiInsights || {};
    const sentiment = aiInsights.sentiment || 'Unknown';
    const keyTopics = (aiInsights.keyTopics || []).join(', ');
    const nextSteps = (aiInsights.nextSteps || []).join(', ');
    const painPoints = (aiInsights.painPoints || []).join(', ');
    const budget = aiInsights.budget || 'Not discussed';
    const timeline = aiInsights.timeline || 'Not specified';
    
    // Compute initials for contact avatar (following project rules)
    const initials = (() => {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : (parts[0] ? [parts[0][0]] : []);
      const str = chars.join('').toUpperCase();
      if (str) return str;
      const phone = String(r.to || r.from || '').trim();
      return phone ? phone[0].toUpperCase() : '?';
    })();
    
    // Compute favicon domain for company (following project rules)
    const favDomain = (() => {
      // Try to find the account for this company to get its domain
      if (typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(acc => acc.accountName === company || acc.name === company);
        if (account) {
          let d = String(account.domain || account.website || '').trim();
          if (/^https?:\/\//i.test(d)) {
            try { d = new URL(d).hostname; } catch(_) { d = d.replace(/^https?:\/\//i, '').split('/')[0]; }
          }
          return d ? d.replace(/^www\./i, '') : '';
        }
      }
      return '';
    })();
    
    return `
    <tr>
      <td class="col-select"><input type="checkbox" class="row-select" data-id="${id}" ${state.selected.has(r.id)?'checked':''}></td>
      <td class="name-cell" data-contact-id="${r.contactId || ''}"><div class="name-cell__wrap"><span class="avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span><span class="name-text">${name}</span></div></td>
      <td>${title}</td>
      <td><a href="#account-details" class="company-link" data-company="${escapeHtml(company)}" data-domain="${escapeHtml(favDomain)}"><span class="company-cell__wrap">${favDomain ? `<img class="company-favicon" src="https://www.google.com/s2/favicons?sz=64&domain=${escapeHtml(favDomain)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.replaceWith(window.__pcAccountsIcon())" />` : `${window.__pcAccountsIcon()}`}<span class="company-name">${company}</span></span></a></td>
      <td>${callTimeStr}</td>
      <td>${dur}</td>
      <td><span class="outcome-badge outcome-${outcome.toLowerCase().replace(' ', '-')}">${outcome}</span></td>
      <td class="qa-cell"><div class="qa-actions">
        <button type="button" class="qa-btn insights-btn ${(!r.transcript || !r.aiInsights || Object.keys(r.aiInsights).length === 0) ? 'disabled' : ''}" data-id="${id}" aria-label="View insights" title="${(!r.transcript || !r.aiInsights || Object.keys(r.aiInsights).length === 0) ? 'Insights processing...' : 'View AI insights'}" ${(!r.transcript || !r.aiInsights || Object.keys(r.aiInsights).length === 0) ? 'disabled' : ''}>${svgIcon('insights')}</button>
      </div></td>
      <td class="qa-cell"><div class="qa-actions">
        <button type="button" class="qa-btn" data-action="addlist" data-id="${id}" aria-label="Add to list" title="Add to list">${svgIcon('addlist')}</button>
        <button type="button" class="qa-btn" data-action="sequence" data-id="${id}" aria-label="Add to sequence" title="Add to sequence">${svgIcon('sequence')}</button>
        <button type="button" class="qa-btn" data-action="task" data-id="${id}" aria-label="Create task" title="Create task">${svgIcon('task')}</button>
        <button type="button" class="qa-btn" data-action="linkedin" data-id="${id}" data-linkedin="${linkedin}" data-name="${name}" data-company="${company}" aria-label="LinkedIn" title="LinkedIn">${svgIcon('linkedin')}</button>
        <button type="button" class="qa-btn" data-action="ai" data-id="${id}" aria-label="Research with AI" title="Research with AI">${svgIcon('ai')}</button>
        <button type="button" class="qa-btn" data-action="website" data-id="${id}" data-website="${website}" data-company="${company}" aria-label="Company website" title="Company website">${svgIcon('link')}</button>
      </div></td>
      <td>${updatedStr}</td>
    </tr>`; }

  // Insights modal
  function injectInsightsModalStyles(){
    const id='calls-insights-modal-styles'; if(document.getElementById(id)) return;
    const style=document.createElement('style'); style.id=id; style.type='text/css';
    style.textContent=`
      .pc-insights-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1200}
      .pc-insights-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1100px,92vw);max-height:86vh;overflow:auto;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-light);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45);z-index:1210}
      .pc-insights-header{position:sticky;top:0;background:linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0));backdrop-filter:saturate(1.4) blur(6px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border-light);z-index:1}
      .pc-insights-title{font-weight:700;font-size:16px;display:flex;align-items:center;gap:10px}
      .pc-insights-sub{color:var(--text-secondary);font-size:12px}
      .pc-insights-body{padding:18px}
      .pc-insights-close{background:transparent;border:1px solid var(--border-light);border-radius:10px;color:var(--text-secondary);height:32px;padding:0 12px}
      .pc-insights-close:hover{background:var(--bg-item);}

      /* Modern cards and grid */
      .pc-sec-grid{display:grid;grid-template-columns:2fr 1fr;gap:18px}
      @media (max-width: 960px){ .pc-sec-grid{grid-template-columns:1fr} }
      .pc-card{background:var(--bg-item);border:1px solid var(--border-light);border-radius:12px;padding:16px}
      .pc-card h4{margin:0 0 10px 0;font-size:13px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px}
      .pc-kv{display:grid;grid-template-columns:160px 1fr;gap:8px 12px}
      .pc-kv .k{color:var(--text-secondary);font-size:12px}
      .pc-kv .v{color:var(--text-primary);font-size:12px}

      /* Chips and badges */
      .pc-chips{display:flex;flex-wrap:wrap;gap:8px}
      .pc-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border-light);background:var(--bg-card);font-size:12px;color:var(--text-secondary)}
      .pc-chip.ok{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.25);color:#16c088}
      .pc-chip.warn{background:rgba(234,179,8,.15);border-color:rgba(234,179,8,.25);color:#eab308}
      .pc-chip.danger{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.25);color:#ef4444}
      .pc-chip.info{background:rgba(59,130,246,.13);border-color:rgba(59,130,246,.25);color:#60a5fa}

      /* Transcript panel */
      .pc-transcript{color:var(--text-secondary);max-height:360px;overflow:auto;border:1px solid var(--border-light);padding:12px;border-radius:8px;background:var(--bg-card);font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:13px;line-height:1.35}
    `; document.head.appendChild(style);
  }
  function closeInsightsModal(){
    const bd=document.querySelector('.pc-insights-backdrop'); if(bd&&bd.parentNode) bd.parentNode.removeChild(bd);
    const md=document.querySelector('.pc-insights-modal'); if(md&&md.parentNode) md.parentNode.removeChild(md);
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e){ if(e.key==='Escape') closeInsightsModal(); }
  function openInsightsModal(id){
    injectInsightsModalStyles();
    console.log('[Call Insights] Opening modal for ID:', id);
    console.log('[Call Insights] State data length:', state.data?.length || 0);
    console.log('[Call Insights] State filtered length:', state.filtered?.length || 0);
    const r = (state.filtered||[]).find(x=>x.id===id) || (state.data||[]).find(x=>x.id===id);
    if(!r) {
      console.error('[Call Insights] No call data found for ID:', id);
      return;
    }
    console.log('[Call Insights] Found call data:', r);
    console.log('[Call Insights] AI Summary:', r.aiSummary);
    console.log('[Call Insights] Transcript:', r.transcript);
    console.log('[Call Insights] AI Insights:', r.aiInsights);
    const bd=document.createElement('div'); bd.className='pc-insights-backdrop'; bd.addEventListener('click', closeInsightsModal);
    const md=document.createElement('div'); md.className='pc-insights-modal';
    md.innerHTML = `
      <div class="pc-insights-header">
            <div class="pc-insights-title">Call insights for ${escapeHtml(r.contactName || r.to || '')}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button type="button" class="pc-insights-close" aria-label="Close">Close</button>
          <button type="button" class="pc-insights-close" id="copy-summary" aria-label="Copy summary">Copy</button>
        </div>
      </div>
      <div class="pc-insights-body">${insightsContentHtml(r)}</div>
    `;
    document.body.appendChild(bd); document.body.appendChild(md);
    md.querySelector('.pc-insights-close').addEventListener('click', closeInsightsModal);
    const copyBtn = md.querySelector('#copy-summary');
    if (copyBtn) copyBtn.addEventListener('click', ()=>{
      try{
        const text = md.querySelector('.pc-insights-body')?.innerText || '';
        navigator.clipboard.writeText(text);
        (window.crm && window.crm.showToast) ? window.crm.showToast('Summary copied') : null;
      }catch(_){ /* ignore */ }
    });
    document.addEventListener('keydown', escClose);

    // Background fetch: if transcript is missing but we have a Twilio SID, try to generate/fetch it
    try {
      const candidateSid = r.twilioSid || r.callSid || (typeof r.id==='string' && /^CA[0-9a-zA-Z]+$/.test(r.id) ? r.id : '');
      if ((!r.transcript || String(r.transcript).trim()==='') && candidateSid) {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const url = base ? `${base}/api/twilio/ai-insights` : '/api/twilio/ai-insights';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: candidateSid })
        }).then(res => res.json()).then(data => {
          if (data && data.transcript) {
            r.transcript = data.transcript;
            const tEl = md.querySelector('.pc-transcript');
            if (tEl) tEl.textContent = data.transcript;
          }
          if (data && data.aiInsights) {
            r.aiInsights = data.aiInsights;
            // We won't re-render full modal to avoid flicker; transcript is the main missing piece.
          }
        }).catch(()=>{});
      }
    } catch(_) {}
  }
  function insightsContentHtml(r){
    // Normalize AI payload (supports snake_case from Twilio Operator and camelCase)
    const A = r.aiInsights || {};
    console.log('[Insights Debug] Full AI insights object:', A);
    const get = (obj, keys, d='') => { for (const k of keys) { if (obj && obj[k] != null && obj[k] !== '') return obj[k]; } return d; };
    const toArr = (v)=> Array.isArray(v)?v:(v? [v]:[]);

    // Fallback extraction from raw transcript for missing/incorrect fields
    function extractFromTranscript(text){
      const out = {};
      if (!text || typeof text !== 'string') return out;
      const s = text;

      // Current rate (e.g., 0.07, $0.07, 7 cents)
      let m = s.match(/(?:current\s+rate\s*(?:is|:)?\s*)?(\$?0?\.[0-9]{2,3})\b/i);
      if (!m) m = s.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s*kwh|\/\s*kwh)?/i);
      if (!m) m = s.match(/([0-9]+)\s*cents\b/i);
      if (m) {
        let rate = m[1];
        if (/cents/i.test(m[0])) rate = (parseFloat(rate)/100).toFixed(2);
        if (rate && !rate.startsWith('$')) rate = rate;
        out.currentRate = rate.replace(/\s+/g,'');
      }

      // Supplier / Utility (e.g., "Supplier is T X U")
      m = s.match(/\b(?:supplier|provider|utility)\s*(?:is|:)?\s*([A-Za-z .&-]{2,30})/i);
      if (m) {
        let sup = m[1].trim();
        // Normalize spaced letters like "T X U" -> "TXU"
        if (/^(?:[A-Za-z]\s+){1,}[A-Za-z]$/.test(sup)) sup = sup.replace(/\s+/g, '');
        out.supplier = sup.toUpperCase();
      }

      // Contract end date (e.g., April nineteenth, 20 26)
      const ordMap = {
        'first':1,'second':2,'third':3,'fourth':4,'fifth':5,'sixth':6,'seventh':7,'eighth':8,'ninth':9,'tenth':10,
        'eleventh':11,'twelfth':12,'thirteenth':13,'fourteenth':14,'fifteenth':15,'sixteenth':16,'seventeenth':17,'eighteenth':18,'nineteenth':19,
        'twentieth':20,'twenty first':21,'twenty-first':21,'twenty second':22,'twenty-second':22,'twenty third':23,'twenty-third':23,
        'twenty fourth':24,'twenty-fourth':24,'twenty fifth':25,'twenty-fifth':25,'twenty sixth':26,'twenty-sixth':26,'twenty seventh':27,'twenty-seventh':27,
        'twenty eighth':28,'twenty-eighth':28,'twenty ninth':29,'twenty-ninth':29,'thirtieth':30,'thirty first':31,'thirty-first':31
      };
      m = s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([A-Za-z\- ]+|\d{1,2})(?:,\s*)?(\d{2}\s?\d{2}|\d{4})/i);
      if (m) {
        const month = m[1];
        let dayRaw = String(m[2]).toLowerCase().trim();
        let yearRaw = String(m[3]).replace(/\s+/g,'');
        let dayNum = parseInt(dayRaw,10);
        if (isNaN(dayNum)) {
          // Try ordinal words
          dayNum = ordMap[dayRaw] || null;
        }
        if (dayNum && yearRaw.length === 4) {
          out.contractEnd = `${month} ${dayNum}, ${yearRaw}`;
        }
      }

      // Usage (e.g., 100,000 kilo watts/year or kWh)
      m = s.match(/(\d[\d,\.]{2,})\s*(?:kwh|kilowatt(?:-)?hours?|kilo\s*watts?)\b/i);
      if (!m) m = s.match(/(?:using|usage)\s*(?:is|:)?\s*(\d[\d,\.]{2,})/i);
      if (m) {
        const raw = m[1].replace(/[,\s]/g,'');
        const num = parseInt(raw,10);
        if (!isNaN(num)) out.usageKWh = String(num);
      }

      // Term (e.g., For 5 years)
      m = s.match(/\b(\d{1,2})\s*years?\b/i);
      if (m) out.contractLength = `${m[1]} years`;

      // Budget / Monthly bill (e.g., 1,000 dollars a month)
      m = s.match(/monthly\s*(?:bill|budget)[^\d]*\$?([\d,]+)\b/i);
      if (!m) m = s.match(/\$?([\d,]+)\s*(?:dollars?)\s*(?:a|per)\s*month/i);
      if (m) out.budget = `$${m[1].replace(/[,\s]/g,',')}/month`;

      // Timeline (simple phrases)
      m = s.match(/\b(next\s+week(?:\s+on\s+\w+)?|tomorrow|this\s+\w+|next\s+\w+)\b/i);
      if (m) out.timeline = m[1].replace(/\s+/g,' ').trim();

      return out;
    }

    const contract = (()=>{ const c = A.contract || {}; 
      console.log('[Insights Debug] Contract object:', c);
      const result = {
        currentRate: get(c, ['currentRate','current_rate','rate']),
        rateType: get(c, ['rateType','rate_type']),
        supplier: get(c, ['supplier','utility']),
        contractEnd: get(c, ['contractEnd','contract_end','endDate']),
        usageKWh: get(c, ['usageKWh','usage_k_wh','usage']),
        contractLength: get(c, ['contractLength','contract_length'])
      };
      console.log('[Insights Debug] Mapped contract:', result);
      return result;
    })();

    const sentiment = get(A, ['sentiment'], 'Unknown');
    const disposition = get(A, ['disposition'], '');
    const keyTopics = toArr(get(A, ['keyTopics','key_topics'], []));
    const nextStepsArr = toArr(get(A, ['nextSteps','next_steps'], []));
    const painPointsArr = toArr(get(A, ['painPoints','pain_points'], []));
    let budget = get(A, ['budget'], 'Not Mentioned');
    let timeline = get(A, ['timeline'], 'Not specified');
    
    // Merge transcript-derived values when AI fields are missing or clearly wrong
    const fx = extractFromTranscript(r.transcript || '');
    const C = { ...contract };
    if ((!C.currentRate || String(C.currentRate).trim()==='') && fx.currentRate) C.currentRate = fx.currentRate;
    if ((!C.supplier || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(String(C.supplier))) && fx.supplier) C.supplier = fx.supplier;
    if ((!C.contractEnd || String(C.contractEnd).trim()==='') && fx.contractEnd) C.contractEnd = fx.contractEnd;
    if ((!C.usageKWh || String(C.usageKWh).trim()==='') && fx.usageKWh) C.usageKWh = fx.usageKWh;
    if ((!C.contractLength || String(C.contractLength).trim()==='') && fx.contractLength) C.contractLength = fx.contractLength;
    if ((!budget || /not\s+mentioned/i.test(budget)) && fx.budget) budget = fx.budget;
    if ((!timeline || /discussed|not\s+specified/i.test(timeline)) && fx.timeline) timeline = fx.timeline;
    const entities = toArr(get(A, ['entities'], []));
    const flags = get(A, ['flags'], {});

    // Summary paragraph: prefer AI summary; otherwise build one
    let summaryText = get(A, ['summary'], r.aiSummary || '');
    if (!summaryText) {
      // Build comprehensive summary with bullet points
      const contract = get(A, ['contract'], {});
      const supplier = get(contract, ['supplier'], '');
      const rate = get(contract, ['current_rate'], '');
      const usage = get(contract, ['usage_k_wh'], '');
      const contractEnd = get(contract, ['contract_end'], '');
      
      // Create paragraph summary
      let paragraph = `Call with ${disposition.toLowerCase()} disposition`;
      if (supplier && supplier !== 'Unknown') {
        paragraph += ` regarding energy services with ${supplier}`;
      } else {
        paragraph += ` about energy services`;
      }
      paragraph += `. ${sentiment} sentiment detected.`;
      
      // Create bullet points
      const bullets = [];
      if (supplier && supplier !== 'Unknown') {
        bullets.push(`Current supplier: ${supplier}`);
      }
      if (rate && rate !== 'Unknown') {
        bullets.push(`Current rate: ${rate}`);
      }
      if (usage && usage !== 'Not provided') {
        bullets.push(`Usage: ${usage}`);
      }
      if (contractEnd && contractEnd !== 'Not discussed') {
        bullets.push(`Contract expires: ${contractEnd}`);
      }
      if (keyTopics.length > 0) {
        bullets.push(`Topics discussed: ${keyTopics.slice(0,3).join(', ')}`);
      }
      if (nextSteps.length > 0) {
        bullets.push(`Next steps: ${nextSteps.slice(0,2).join(', ')}`);
      }
      if (painPoints.length > 0) {
        bullets.push(`Pain points: ${painPoints.slice(0,2).join(', ')}`);
      }
      if (budget && budget !== 'Unclear' && budget !== '') {
        bullets.push(`Budget: ${budget}`);
      }
      if (timeline && timeline !== 'Not specified' && timeline !== '') {
        bullets.push(`Timeline: ${timeline}`);
      }
      
      // Combine paragraph and bullets
      summaryText = paragraph + (bullets.length > 0 ? ' • ' + bullets.join(' • ') : '');
    }

    // Transcript rendering with consistent speaker/timestamp lines across pages
    const toMMSS = (s)=>{ const m=Math.floor((s||0)/60), ss=(s||0)%60; return `${String(m)}:${String(ss).padStart(2,'0')}`; };
    function parseSpeakerTranscript(text){
      const out=[]; if(!text) return out; const lines=String(text).split(/\r?\n/);
      for(const raw of lines){
        const line = raw.trim(); if(!line) continue;
        // Pattern: "Agent 1:23: text" or "Speaker 0:03: text"
        let m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+(\d+):(\d{2}):\s*(.*)$/);
        // Pattern: "Speaker 1 0:45: text" (optional speaker id before time)
        if(!m){ m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+\d+\s+(\d+):(\d{2}):\s*(.*)$/); if(m) { m = [m[0], m[1], m[2], m[3], m[4]]; } }
        if(m){ const label=m[1].trim(); const mm=parseInt(m[2],10)||0; const ss=parseInt(m[3],10)||0; const txt=m[4]||''; out.push({label, t:mm*60+ss, text:txt}); continue; }
        // Fallback: keep as free text line
        out.push({label:'', t:null, text:line});
      }
      return out;
    }
    function renderTranscriptHtml(A, raw){
      const contactFirst = String(r.contactName||'').trim().split(/\s+/)[0] || 'customer';
      const turns = Array.isArray(A?.speakerTurns) ? A.speakerTurns : [];
      if(turns.length){
        // Group consecutive turns by role and relabel speakers (agent/customer)
        const groups = [];
        for(const t of turns){
          const roleRaw = String(t.role||'').toLowerCase();
          const label = roleRaw==='agent' ? 'agent' : (roleRaw==='customer' ? contactFirst : 'Speaker');
          const roleClass = roleRaw==='agent' ? 'agent' : (roleRaw==='customer' ? 'customer' : '');
          const text = String(t.text||'');
          const time = Number(t.t)||0;
          const last = groups[groups.length-1];
          if(last && last.label===label && last.roleClass===roleClass){
            last.texts.push(text);
            if(time>last.endTime) last.endTime = time;
          } else {
            groups.push({ label, roleClass, startTime: time, endTime: time, texts: [text] });
          }
        }
        return groups.map(g=>`<div class=\"transcript-line ${g.roleClass}\"><span class=\"speaker\">${escapeHtml(g.label)} ${toMMSS(g.startTime)}:</span> <span class=\"text\">${escapeHtml(g.texts.join(' '))}</span></div>`).join('');
      }
      const parsed = parseSpeakerTranscript(raw||'');
      if(parsed.some(p=>p.label && p.t!=null)){
        // Normalize labels and group consecutive lines by speaker label
        const normalize = (s)=>{
          const x = String(s||'').trim();
          if(/^agent$/i.test(x) || /^rep$/i.test(x) || /^sales/i.test(x)) return 'agent';
          if(/^customer$/i.test(x) || /^contact$/i.test(x)) return contactFirst;
          if(/^speaker\b/i.test(x)) return 'Speaker';
          return x;
        };
        const groups = [];
        for(const p of parsed){
          const labelN = normalize(p.label);
          const roleClass = labelN==='agent' ? 'agent' : (labelN===contactFirst ? 'customer' : '');
          const text = String(p.text||'');
          const time = Number(p.t)||0;
          const last = groups[groups.length-1];
          if(last && last.label===labelN && last.roleClass===roleClass){
            last.texts.push(text);
            if(time>last.endTime) last.endTime = time;
          } else {
            groups.push({ label: labelN, roleClass, startTime: time, endTime: time, texts: [text] });
          }
        }
        return groups.map(g=>`<div class=\"transcript-line ${g.roleClass}\"><span class=\"speaker\">${escapeHtml(g.label)} ${toMMSS(g.startTime)}:</span> <span class=\"text\">${escapeHtml(g.texts.join(' '))}</span></div>`).join('');
      }
      const fallback = raw || (A && Object.keys(A).length ? 'Transcript processing...' : 'Transcript not available');
      return escapeHtml(fallback);
    }
    const transcriptHtml = renderTranscriptHtml(A, r.transcript);

    const hasAIInsights = r.aiInsights && Object.keys(r.aiInsights).length > 0;

    const chipsHtml = [
      `<span class=\"pc-chip ${sentiment==='Positive'?'ok':sentiment==='Negative'?'danger':'info'}\">Sentiment: ${escapeHtml(sentiment)}</span>`,
      disposition ? `<span class=\"pc-chip info\">Disposition: ${escapeHtml(disposition)}</span>` : '',
      (flags.nonEnglish||flags.isNonEnglish) ? '<span class=\"pc-chip warn\">Non‑English</span>' : '',
      (flags.voicemailDetected||flags.voicemail) ? '<span class=\"pc-chip warn\">Voicemail</span>' : '',
      (flags.callTransfer||flags.transferred) ? '<span class=\"pc-chip info\">Transferred</span>' : '',
      (flags.doNotContact||flags.dnc) ? '<span class=\"pc-chip danger\">Do Not Contact</span>' : '',
      flags.recordingDisclosure ? '<span class=\"pc-chip ok\">Recording Disclosure</span>' : ''
    ].filter(Boolean).join('');

    const topicsHtml = keyTopics.length ? keyTopics.map(t=>`<span class=\"pc-chip\">${escapeHtml(t)}</span>`).join('') : '<span class=\"pc-chip\">None</span>';
    const nextStepsHtml = nextStepsArr.length ? nextStepsArr.map(t=>`<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None</div>';
    const painHtml = painPointsArr.length ? painPointsArr.map(t=>`<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None mentioned</div>';
    const entitiesHtml = entities.length ? entities.slice(0,20).map(e=>`<span class=\"pc-chip\">${escapeHtml(e.type||'Entity')}: ${escapeHtml(e.text||'')}</span>`).join('') : '<span class=\"pc-chip\">None</span>';

    return `
      <div class=\"pc-sec-grid\">
        <div class="pc-col-left">
          <div class="pc-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline></svg>
              AI Call Summary
            </h4>
            <div class="pc-chips" style="margin:6px 0 12px 0;">${chipsHtml}</div>
            <div style="color:var(--text-secondary); line-height:1.5;">${escapeHtml(summaryText)}</div>
          </div>

          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Call Transcript
            </h4>
            <div class=\"pc-transcript\">${transcriptHtml}</div>
          </div>
        </div>

        <div class="pc-col-right">
          <div class="pc-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              Call Recording
            </h4>
            <div style="color:var(--text-secondary); font-style:italic;">${r.audioUrl ? `<audio controls style="width:100%; margin-top:8px;"><source src="${r.audioUrl}" type="audio/mpeg">Your browser does not support audio playback.</audio>` : 'No recording available'}</div>
            ${r.audioUrl ? '' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Recording may take 1-2 minutes to process after call completion</div>'}
            ${hasAIInsights ? '<div style="color:var(--orange-subtle); font-size:12px; margin-top:4px;">✓ AI analysis completed</div>' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">AI analysis in progress...</div>'}
          </div>

          <!-- Highlights Bar -->
          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"/></svg>
              Highlights
            </h4>
            <div class="pc-chips">
              ${C.supplier ? `<span class="pc-chip">Supplier: ${escapeHtml(C.supplier)}</span>` : ''}
              ${C.contractEnd ? `<span class="pc-chip">Contract end: ${escapeHtml(C.contractEnd)}</span>` : ''}
              ${budget ? `<span class="pc-chip">Budget: ${escapeHtml(budget)}</span>` : ''}
              ${timeline ? `<span class="pc-chip">Next: ${escapeHtml(timeline)}</span>` : ''}
            </div>
          </div>

          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Energy & Contract Details
            </h4>
            <div class="pc-kv">
              <div class=\"k\">Current rate</div><div class=\"v\">${escapeHtml(C.currentRate || 'Unknown')}</div>
              <div class=\"k\">Supplier/Utility</div><div class=\"v\">${escapeHtml(C.supplier || 'Unknown')}</div>
              <div class=\"k\">Contract end</div><div class=\"v\">${escapeHtml(C.contractEnd || 'Not discussed')}</div>
              <div class=\"k\">Usage</div><div class=\"v\">${escapeHtml(String(C.usageKWh || 'Not provided'))}</div>
              <div class=\"k\">Rate type</div><div class=\"v\">${escapeHtml(C.rateType || 'Unknown')}</div>
              <div class=\"k\">Term</div><div class=\"v\">${escapeHtml(String(C.contractLength || 'Unknown'))}</div>
              <div class=\"k\">Budget</div><div class=\"v\">${escapeHtml(budget)}</div>
              <div class=\"k\">Timeline</div><div class=\"v\">${escapeHtml(timeline)}</div>
            </div>
          </div>

          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
              Key Topics
            </h4>
            <div class="pc-chips">${topicsHtml}</div>
          </div>

          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              Next Steps
            </h4>
            <div style="color:var(--text-secondary);font-size:12px;line-height:1.5;">${nextStepsHtml}</div>
          </div>

          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              Pain Points
            </h4>
            <div style="color:var(--text-secondary);font-size:12px;line-height:1.5;">${painHtml}</div>
          </div>

          <div class="pc-card" style="margin-top:14px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>
              Entities
            </h4>
            <div class="pc-chips">${entitiesHtml}</div>
          </div>
        </div>
      </div>`
  }

  // Bulk selection popover (refined with backdrop and cleanup)
  function openBulkPopover(){
    if(!els.container) return;
    closeBulkPopover();
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'bulk-select-backdrop';
    backdrop.addEventListener('click', () => {
      if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
      closeBulkPopover();
    });
    document.body.appendChild(backdrop);

    const total = state.filtered.length; const page = getPageItems().length;
    const pop = document.createElement('div');
    pop.id = 'calls-bulk-popover';
    pop.className = 'bulk-select-popover';
    pop.setAttribute('role','dialog');
    pop.setAttribute('aria-label','Bulk selection');
    pop.innerHTML = `
      <div class="option"><label><input type="radio" name="bulk-mode" value="custom" checked/> Select</label>
      <input type="number" id="bulk-custom-count" min="1" max="${total}" value="${Math.min(50,total)}"/>
      <span class="hint">items from current filters</span></div>
      <div class="option"><label><input type="radio" name="bulk-mode" value="page"/> Select current page</label><span class="hint">${page} visible</span></div>
      <div class="option"><label><input type="radio" name="bulk-mode" value="all"/> Select all</label><span class="hint">${total} items</span></div>
      <div class="actions"><button class="btn-text" id="bulk-cancel">Cancel</button><button class="btn-primary" id="bulk-apply">Apply</button></div>`;
    els.container.appendChild(pop);

    function positionPopover(){ if(!els.selectAll) return; const cb=els.selectAll.getBoundingClientRect(); const ct=els.container.getBoundingClientRect(); pop.style.left=(cb.left-ct.left)+'px'; pop.style.top=(cb.bottom-ct.top+8)+'px'; }
    positionPopover();
    const reposition = () => positionPopover();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (els.page) {
      if (els.page._bulkPopoverCleanup) els.page._bulkPopoverCleanup();
      els.page._bulkPopoverCleanup = () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      };
    }

    const firstInput = pop.querySelector('#bulk-custom-count') || pop.querySelector('input,button');
    if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();

    pop.querySelector('#bulk-cancel').addEventListener('click',()=>{ if(els.selectAll) els.selectAll.checked=false; closeBulkPopover(); });
    pop.querySelector('#bulk-apply').addEventListener('click',()=>{
      const m=(pop.querySelector('input[name="bulk-mode"]:checked')||{}).value;
      if(m==='custom'){
        const n=Math.max(1,parseInt(pop.querySelector('#bulk-custom-count').value||'0',10));
        selectIds(state.filtered.slice(0,Math.min(n,total)).map(r=>r.id));
      } else if(m==='page'){
        selectIds(getPageItems().map(r=>r.id));
      } else {
        selectIds(state.filtered.map(r=>r.id));
      }
      closeBulkPopover(); render(); showBulkBar();
    });

    setTimeout(()=>{ function outside(e){ if(!pop.contains(e.target) && e.target!==els.selectAll){ document.removeEventListener('mousedown',outside); if(els.selectAll) els.selectAll.checked = state.selected.size>0; closeBulkPopover(); } } document.addEventListener('mousedown',outside); },0);
  }
  function closeBulkPopover(){
    const ex = els.page ? els.page.querySelector('#calls-bulk-popover') : null; if(ex&&ex.parentNode) ex.parentNode.removeChild(ex);
    if (els.page && typeof els.page._bulkPopoverCleanup === 'function') { els.page._bulkPopoverCleanup(); delete els.page._bulkPopoverCleanup; }
    const backdrop = document.querySelector('.bulk-select-backdrop'); if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  }
  function selectIds(ids){ state.selected = new Set(ids); }

  // Bulk actions bar (refined)
  function showBulkBar(){ updateBulkBar(true); }
  function hideBulkBar(){ const bar = els.page ? els.page.querySelector('#calls-bulk-actions') : document.getElementById('calls-bulk-actions'); if(bar&&bar.parentNode) bar.parentNode.removeChild(bar); }
  function updateBulkBar(force=false){
    if(!els.container) return;
    const count = state.selected.size;
    const shouldShow = force || count > 0;
    let container = els.page ? els.page.querySelector('#calls-bulk-actions') : null;
    if (!shouldShow) { if (container) container.remove(); return; }
    const html = `
      <div class="bar">
        <button class="action-btn-sm" id="bulk-clear">${svgIcon('clear')}<span>Clear ${count} selected</span></button>
        <span class="spacer"></span>
        <button class="action-btn-sm" id="bulk-email">${svgIcon('email')}<span>Email</span></button>
        <button class="action-btn-sm" id="bulk-sequence">${svgIcon('sequence')}<span>Sequence ▾</span></button>
        <button class="action-btn-sm" id="bulk-call">${svgIcon('call')}<span>Call</span></button>
        <button class="action-btn-sm" id="bulk-addlist">${svgIcon('addlist')}<span>Add to list</span></button>
        <button class="action-btn-sm" id="bulk-export">${svgIcon('export')}<span>Export</span></button>
        <button class="action-btn-sm" id="bulk-ai">${svgIcon('ai')}<span>Research with AI</span></button>
        <button class="action-btn-sm danger" id="bulk-delete">${svgIcon('delete')}<span>Delete</span></button>
      </div>`;
    if (!container) {
      container = document.createElement('div');
      container.id = 'calls-bulk-actions';
      container.className = 'bulk-actions-modal';
      els.container.appendChild(container);
    }
    container.innerHTML = html;
    // Wire events
    const clearBtn = container.querySelector('#bulk-clear');
    clearBtn.addEventListener('click', () => {
      state.selected.clear();
      render();
      hideBulkBar();
      if (els.selectAll) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
    });
    container.querySelector('#bulk-email').addEventListener('click', () => console.log('Bulk email', Array.from(state.selected)));
    container.querySelector('#bulk-sequence').addEventListener('click', () => console.log('Bulk add to sequence', Array.from(state.selected)));
    container.querySelector('#bulk-call').addEventListener('click', () => console.log('Bulk call', Array.from(state.selected)));
    container.querySelector('#bulk-addlist').addEventListener('click', () => console.log('Bulk add to list', Array.from(state.selected)));
    container.querySelector('#bulk-export').addEventListener('click', () => console.log('Bulk export', Array.from(state.selected)));
    container.querySelector('#bulk-ai').addEventListener('click', () => console.log('Bulk research with AI', Array.from(state.selected)));
    container.querySelector('#bulk-delete').addEventListener('click', () => openBulkDeleteConfirm());
  }

  // ===== Bulk Delete Confirmation Modal =====
  let _onDelKeydown = null;
  let _onDelOutside = null;
  
  function closeBulkDeleteConfirm() {
    const pop = document.getElementById('calls-delete-popover');
    const backdrop = document.getElementById('calls-delete-backdrop');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (_onDelKeydown) { document.removeEventListener('keydown', _onDelKeydown); _onDelKeydown = null; }
    if (_onDelOutside) { document.removeEventListener('mousedown', _onDelOutside, true); _onDelOutside = null; }
  }

  function openBulkDeleteConfirm() {
    if (document.getElementById('calls-delete-popover')) return;
    const bar = els.page && els.page.querySelector('#calls-bulk-actions');
    if (!bar) return;
    const delBtn = bar.querySelector('#bulk-delete');
    
    // Backdrop for click-away
    const backdrop = document.createElement('div');
    backdrop.id = 'calls-delete-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'transparent';
    backdrop.style.zIndex = '955';
    document.body.appendChild(backdrop);

    const pop = document.createElement('div');
    pop.id = 'calls-delete-popover';
    pop.className = 'delete-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Confirm delete');
    pop.dataset.placement = 'bottom';
    pop.innerHTML = `
      <div class="delete-popover-inner">
        <div class="delete-title">Delete ${state.selected.size} ${state.selected.size===1 ? 'call' : 'calls'}?</div>
        <div class="btn-row">
          <button type="button" id="del-cancel" class="btn-cancel">Cancel</button>
          <button type="button" id="del-confirm" class="btn-danger">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(pop);

    // Position under the delete button and center horizontally to its center
    const anchorRect = (delBtn || bar).getBoundingClientRect();
    const preferredLeft = anchorRect.left + (anchorRect.width / 2) - (pop.offsetWidth / 2);
    const clampedLeft = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, preferredLeft));
    const top = anchorRect.bottom + 8; // fixed, viewport coords
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(clampedLeft)}px`;
    // Arrow: center to the button's center within the popover, clamped to popover width
    const rawArrowLeft = (anchorRect.left + (anchorRect.width / 2)) - clampedLeft;
    const maxArrow = Math.max(0, pop.offsetWidth - 12);
    const clampedArrow = Math.max(12, Math.min(maxArrow, rawArrowLeft));
    pop.style.setProperty('--arrow-left', `${Math.round(clampedArrow)}px`);

    const cancel = pop.querySelector('#del-cancel');
    const confirm = pop.querySelector('#del-confirm');
    if (cancel) cancel.addEventListener('click', () => closeBulkDeleteConfirm());
    if (confirm) confirm.addEventListener('click', async () => {
      closeBulkDeleteConfirm();
      await deleteSelectedCalls();
    });

    // Focus mgmt and esc
    const f = confirm || cancel;
    f && f.focus && f.focus();
    _onDelKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeBulkDeleteConfirm(); }
    };
    document.addEventListener('keydown', _onDelKeydown);
    _onDelOutside = (e) => {
      const t = e.target;
      if (!pop.contains(t)) closeBulkDeleteConfirm();
    };
    document.addEventListener('mousedown', _onDelOutside, true);
  }

  // Delete selected calls from Firestore and local state
  async function deleteSelectedCalls() {
    const ids = Array.from(state.selected || []);
    if (!ids.length) return;
    
    console.log('[Bulk Delete] Starting deletion of', ids.length, 'calls:', ids);
    
    // Show progress toast
    const progressToast = window.crm?.showProgressToast ? 
      window.crm.showProgressToast(`Deleting ${ids.length} ${ids.length === 1 ? 'call' : 'calls'}...`, ids.length, 0) : null;
    
    let failed = 0;
    let completed = 0;

    // Always use production API for calls (critical data operations)
    const base = 'https://power-choosers-crm.vercel.app';
    const url = `${base}/api/calls`;
    console.log('[Bulk Delete] Using endpoint:', url);
    
    try {
      // Delete from backend
      for (const id of ids) {
        try {
          console.log(`[Bulk Delete] Deleting call: ${id}`);
          const requestBody = { id, twilioSid: id };
          console.log(`[Bulk Delete] Request body:`, requestBody);
          
          const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            // Send both id and twilioSid to maximize backend match chances
            body: JSON.stringify(requestBody)
          });
          
          console.log(`[Bulk Delete] Response for ${id}:`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
          });
          
          if (response.ok) {
            completed++;
            console.log(`[Bulk Delete] Successfully deleted call ${id}`);
            // Update progress toast
            if (progressToast && typeof progressToast.update === 'function') {
              progressToast.update(completed, ids.length);
            }
          } else {
            failed++;
            const errorText = await response.text().catch(()=>'');
            console.error(`[Bulk Delete] Failed to delete call ${id}:`, response.status, errorText);
          }
        } catch (error) {
          failed++;
          console.error(`[Bulk Delete] Error deleting call ${id}:`, error);
        }
      }
      
      // Clear selection and refresh
      state.selected.clear();
      hideBulkBar();
      await loadData(); // Refresh the data
      
      // Show completion toast
      if (progressToast && typeof progressToast.complete === 'function') {
        progressToast.complete();
      }
      
      if (failed > 0) {
        window.crm?.showToast ? window.crm.showToast(`Deleted ${completed} calls, ${failed} failed`, 'warning') : 
          console.warn(`Deleted ${completed} calls, ${failed} failed`);
      } else {
        window.crm?.showToast ? window.crm.showToast(`Successfully deleted ${completed} ${completed === 1 ? 'call' : 'calls'}`, 'success') :
          console.log(`Successfully deleted ${completed} calls`);
      }
      
    } catch (error) {
      console.error('Bulk delete error:', error);
      if (progressToast && typeof progressToast.error === 'function') {
        progressToast.error();
      }
      window.crm?.showToast ? window.crm.showToast('Failed to delete calls', 'error') :
        console.error('Failed to delete calls');
    }
  }

  function init(){ 
    if(!initDomRefs()) return; 
    attachEvents(); 
    injectCallsBulkStyles(); 
    loadData(); 
    
    // Listen for restore events from back navigation
    document.addEventListener('pc:calls-restore', (e) => {
      const { page, scroll, filters, selectedItems, searchTerm } = e.detail || {};
      console.log('[Calls] Restoring state from back navigation:', e.detail);
      
      // Restore pagination
      if (page && page > 0) {
        state.currentPage = page;
      }
      
      // Restore scroll position
      if (scroll && scroll > 0) {
        setTimeout(() => {
          window.scrollTo(0, scroll);
        }, 100);
      }
      
      // Restore filters
      if (filters) {
        if (filters.hasEmail !== undefined && els.hasEmail) {
          els.hasEmail.checked = filters.hasEmail;
        }
        if (filters.hasPhone !== undefined && els.hasPhone) {
          els.hasPhone.checked = filters.hasPhone;
        }
        if (filters.tokens) {
          state.tokens = { ...filters.tokens };
          chips.forEach(renderChips);
        }
        updateFilterCount();
        applyFilters();
      }
      
      // Restore selected items
      if (selectedItems && Array.isArray(selectedItems)) {
        state.selected.clear();
        selectedItems.forEach(id => state.selected.add(id));
        updateBulkBar();
      }
      
      // Restore search term
      if (searchTerm && els.quickSearch) {
        els.quickSearch.value = searchTerm;
      }
    });
  }
  
  // Manual refresh only - no auto-refresh to prevent UI disruption
  let refreshInterval = null;
  
  function startAutoRefresh() {
    // Disabled auto-refresh to prevent insights from closing
    return;
  }
  
  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }
  
  // Start auto-refresh when calls page becomes active
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
  
  // Buttons removed per request (no-op)
  function addRefreshButton() { /* intentionally empty */ }
  
  // Process all calls with AI insights
  async function processAllCalls() {
    const processBtn = document.querySelector('.process-ai-btn');
    if (!processBtn) return;
    
    // Disable button and show loading state
    processBtn.disabled = true;
    processBtn.innerHTML = '⏳ Processing...';
    
    try {
      console.log('🤖 Starting AI processing for all calls...');
      
      // Get calls that need processing
      const callsToProcess = state.data.filter(call => 
        !call.aiInsights && call.status === 'completed' && call.duration > 0
      );
      
      if (callsToProcess.length === 0) {
        alert('✅ All calls already have AI insights!');
        return;
      }
      
      console.log(`📞 Processing ${callsToProcess.length} calls...`);
      
      let processed = 0;
      let failed = 0;
      
      // Process each call
      for (const call of callsToProcess) {
        try {
          console.log(`🔄 Processing call: ${call.id}`);
          
          const response = await fetch('/api/process-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callSid: call.id })
          });
          
          const data = await response.json();
          
          if (data.success) {
            processed++;
            console.log(`✅ Processed: ${call.id}`);
          } else {
            failed++;
            console.log(`❌ Failed: ${call.id} - ${data.error}`);
          }
          
          // Update button text with progress
          processBtn.innerHTML = `⏳ Processing... (${processed + failed}/${callsToProcess.length})`;
          
          // Wait between calls to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          failed++;
          console.error(`❌ Error processing ${call.id}:`, error);
        }
      }
      
      // Show completion message
      alert(`🎉 AI processing complete!\n✅ Processed: ${processed}\n❌ Failed: ${failed}\n\nRefresh the page to see the results.`);
      
      // Reload data to show updated insights
      await loadData();
      
    } catch (error) {
      console.error('❌ AI processing error:', error);
      alert('❌ Error processing calls. Check console for details.');
    } finally {
      // Reset button
      processBtn.disabled = false;
      processBtn.innerHTML = '🤖 Process AI';
    }
  }
  
  // Expose loadData and controls for external use
  window.callsModule = { 
    loadData, 
    startAutoRefresh, 
    stopAutoRefresh,
    // Debug functions
    testApiEndpoint: async function() {
      const base = 'https://power-choosers-crm.vercel.app';
      console.log('Testing API endpoint:', `${base}/api/calls`);
      try {
        const response = await fetch(`${base}/api/calls`);
        const data = await response.json();
        console.log('API Test Result:', { status: response.status, ok: response.ok, calls: data.calls?.length || 0 });
        return data;
      } catch (error) {
        console.error('API Test Error:', error);
        return null;
      }
    },
    deleteTestCall: async function(callId) {
      const base = 'https://power-choosers-crm.vercel.app';
      console.log('Testing DELETE for call:', callId);
      try {
        const response = await fetch(`${base}/api/calls`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: callId, twilioSid: callId })
        });
        const result = await response.text();
        console.log('DELETE Test Result:', { status: response.status, ok: response.ok, response: result });
        return result;
      } catch (error) {
        console.error('DELETE Test Error:', error);
        return null;
      }
    },
    debugTitles: function() {
      console.log('=== Calls Title Debug Info ===');
      console.log('Current calls data:', state.data?.length || 0, 'calls');
      console.log('Filtered calls:', state.filtered?.length || 0, 'calls');
      
      const callsWithoutTitle = (state.data || []).filter(call => !call.contactTitle);
      const callsWithTitle = (state.data || []).filter(call => !!call.contactTitle);
      
      console.log('Calls without title:', callsWithoutTitle.length);
      console.log('Calls with title:', callsWithTitle.length);
      
      if (callsWithoutTitle.length > 0) {
        console.log('Sample calls without title:', callsWithoutTitle.slice(0, 3).map(c => ({
          id: c.id,
          contactName: c.contactName,
          contactTitle: c.contactTitle,
          company: c.company
        })));
      }
      
      if (callsWithTitle.length > 0) {
        console.log('Sample calls with title:', callsWithTitle.slice(0, 3).map(c => ({
          id: c.id,
          contactName: c.contactName,
          contactTitle: c.contactTitle,
          company: c.company
        })));
      }
      
      // Enable debugging for next render
      window.CRM_DEBUG_CALLS = true;
      console.log('Enabled CRM_DEBUG_CALLS - refresh the page or reload data to see detailed logs');
      
      return { withTitle: callsWithTitle.length, withoutTitle: callsWithoutTitle.length };
    }
  };
  
  document.addEventListener('DOMContentLoaded', init);
})();
