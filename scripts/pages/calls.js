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
            const phones = [c.workDirectPhone, c.mobile, c.otherPhone, c.phone].map(norm).filter(Boolean);
            for (const ph of phones) if (ph && !map.has(ph)) map.set(ph,{ id: c.id, name, title, company });
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
            if (ph && !map.has(ph)) map.set(ph,{ id: doc.id, name, title, company });
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
            if (ph && !map.has(ph)) map.set(ph,{ id: doc.id, name, title, company });
          });
        }catch(_){ /* ignore */ }
        // Query contacts with workDirectPhone
        try{
          const snap3 = await window.firebaseDB.collection('contacts').where('workDirectPhone','!=',null).limit(500).get();
          snap3.forEach(doc=>{
            const d = doc.data()||{};
            const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || (d.name||'');
            const title = d.title || '';
            const company = d.companyName || d.accountName || '';
            const ph = norm(d.workDirectPhone);
            if (ph && !map.has(ph)) map.set(ph,{ id: doc.id, name, title, company });
          });
        }catch(_){ /* ignore */ }
        // Query contacts with otherPhone
        try{
          const snap4 = await window.firebaseDB.collection('contacts').where('otherPhone','!=',null).limit(500).get();
          snap4.forEach(doc=>{
            const d = doc.data()||{};
            const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || (d.name||'');
            const title = d.title || '';
            const company = d.companyName || d.accountName || '';
            const ph = norm(d.otherPhone);
            if (ph && !map.has(ph)) map.set(ph,{ id: doc.id, name, title, company });
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
(function bootstrapDebugFlags(){
  try {
    if (window.CRM_DEBUG_CALLS == null) window.CRM_DEBUG_CALLS = true;
    if (window.CRM_DEBUG_TRANSCRIPTS == null) window.CRM_DEBUG_TRANSCRIPTS = true;
    if (window.CRM_DEBUG_LIVE == null) window.CRM_DEBUG_LIVE = true;
  } catch(_) {}
})();

function dbgCalls(){ try { if (window.CRM_DEBUG_CALLS) console.log.apply(console, arguments); } catch(_) {} }
(function () {
  const state = { data: [], filtered: [], selected: new Set(), currentPage: 1, pageSize: 25, tokens: { city: [], title: [], company: [], state: [], employees: [], industry: [], visitorDomain: [], seniority: [], department: [] } };
  const els = {};
  const chips = [
    { k: 'city', i: 'calls-filter-city', c: 'calls-filter-city-chips', x: 'calls-filter-city-clear', s: 'calls-filter-city-suggest', acc: r => r.contactCity || '' },
    { k: 'title', i: 'calls-filter-title', c: 'calls-filter-title-chips', x: 'calls-filter-title-clear', s: 'calls-filter-title-suggest', acc: r => r.contactTitle || '' },
    { k: 'company', i: 'calls-filter-company', c: 'calls-filter-company-chips', x: 'calls-filter-company-clear', s: 'calls-filter-company-suggest', acc: r => r.company || '' },
    { k: 'state', i: 'calls-filter-state', c: 'calls-filter-state-chips', x: 'calls-filter-state-clear', s: 'calls-filter-state-suggest', acc: r => r.contactState || '' },
    { k: 'employees', i: 'calls-filter-employees', c: 'calls-filter-employees-chips', x: 'calls-filter-employees-clear', s: 'calls-filter-employees-suggest', acc: r => (r.accountEmployees != null ? r.accountEmployees : r.employees) },
    { k: 'industry', i: 'calls-filter-industry', c: 'calls-filter-industry-chips', x: 'calls-filter-industry-clear', s: 'calls-filter-industry-suggest', acc: r => r.industry || '' },
    { k: 'visitorDomain', i: 'calls-filter-visitor-domain', c: 'calls-filter-visitor-domain-chips', x: 'calls-filter-visitor-domain-clear', s: 'calls-filter-visitor-domain-suggest', acc: r => r.visitorDomain || '' },
    { k: 'seniority', i: 'calls-filter-seniority', c: 'calls-filter-seniority-chips', x: 'calls-filter-seniority-clear', s: 'calls-filter-seniority-suggest', acc: r => r.contactSeniority || '' },
    { k: 'department', i: 'calls-filter-department', c: 'calls-filter-department-chips', x: 'calls-filter-department-clear', s: 'calls-filter-department-suggest', acc: r => r.contactDepartment || '' }
  ];
  const pool = { city: [], title: [], company: [], state: [], employees: [], industry: [], visitorDomain: [], seniority: [], department: [] };
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
    console.log('[Calls Filter Debug] Initializing DOM references...');
    els.page = document.getElementById('calls-page'); if (!els.page) return false;
    els.table = document.getElementById('calls-table'); els.tbody = els.table ? els.table.querySelector('tbody') : null;
    els.container = els.page.querySelector('.table-container');
    els.pag = document.getElementById('calls-pagination'); els.summary = document.getElementById('calls-pagination-summary');
    els.selectAll = document.getElementById('select-all-calls');
    els.toggle = document.getElementById('toggle-calls-filters'); els.panel = document.getElementById('calls-filters'); els.count = document.getElementById('calls-filter-count');
    
    console.log('[Calls Filter Debug] els.toggle found:', !!els.toggle);
    console.log('[Calls Filter Debug] els.panel found:', !!els.panel);
    if (els.panel) {
      console.log('[Calls Filter Debug] panel initial classes:', els.panel.className);
      console.log('[Calls Filter Debug] panel initial hidden attribute:', els.panel.hasAttribute('hidden'));
      console.log('[Calls Filter Debug] panel initial computed style:', window.getComputedStyle(els.panel).display, window.getComputedStyle(els.panel).opacity, window.getComputedStyle(els.panel).transform);
    }
    
    // Tabs + grid to mirror People page
    els.tabsRow = els.panel ? els.panel.querySelector('.filter-tabs-row') : null;
    els.tabs = els.tabsRow ? Array.from(els.tabsRow.querySelectorAll('.filter-tab')) : [];
    els.grid = els.panel ? els.panel.querySelector('.filter-grid') : null;
    els.btnClear = document.getElementById('clear-calls-filters'); els.btnApply = document.getElementById('apply-calls-filters');
    els.hasEmail = document.getElementById('calls-filter-has-email'); els.hasPhone = document.getElementById('calls-filter-has-phone');
    chips.forEach(d => { d.ie = document.getElementById(d.i); d.ce = document.getElementById(d.c); d.xe = document.getElementById(d.x); d.se = document.getElementById(d.s); });
    return true;
  }

  function attachEvents() {
    if (els.toggle && els.panel) els.toggle.addEventListener('click', () => {
      console.log('[Calls Filter Debug] Toggle clicked');
      console.log('[Calls Filter Debug] els.toggle:', els.toggle);
      console.log('[Calls Filter Debug] els.panel:', els.panel);
      
      const isHidden = els.panel.hasAttribute('hidden');
      console.log('[Calls Filter Debug] isHidden:', isHidden);
      console.log('[Calls Filter Debug] panel classes before:', els.panel.className);
      console.log('[Calls Filter Debug] panel style before:', els.panel.style.cssText);
      
      const textEl = els.toggle.querySelector('.filter-text');
      console.log('[Calls Filter Debug] textEl:', textEl);
      
      if (isHidden) {
        console.log('[Calls Filter Debug] Opening filter panel...');
        els.panel.removeAttribute('hidden');
        console.log('[Calls Filter Debug] Removed hidden attribute');
        console.log('[Calls Filter Debug] panel classes after removing hidden:', els.panel.className);
        
        setTimeout(()=>{ 
          console.log('[Calls Filter Debug] Adding show class...');
          els.panel.classList.add('show'); 
          console.log('[Calls Filter Debug] panel classes after adding show:', els.panel.className);
          console.log('[Calls Filter Debug] panel computed style after show:', window.getComputedStyle(els.panel).display, window.getComputedStyle(els.panel).opacity, window.getComputedStyle(els.panel).transform);
          
          // Force a reflow to ensure the transition starts
          els.panel.offsetHeight;
          
          // Check if transition is working after a short delay
          setTimeout(() => {
            console.log('[Calls Filter Debug] panel computed style after transition start:', window.getComputedStyle(els.panel).display, window.getComputedStyle(els.panel).opacity, window.getComputedStyle(els.panel).transform);
          }, 50);
        }, 10);
        if (textEl) textEl.textContent = 'Hide Filters';
      } else {
        console.log('[Calls Filter Debug] Closing filter panel...');
        els.panel.classList.remove('show');
        console.log('[Calls Filter Debug] Removed show class');
        setTimeout(()=>{ 
          console.log('[Calls Filter Debug] Adding hidden attribute...');
          els.panel.setAttribute('hidden',''); 
        }, 300);
        if (textEl) textEl.textContent = 'Show Filters';
      }
    });
    if (els.btnClear) els.btnClear.addEventListener('click', () => { clearFilters(); applyFilters(); });
    if (els.btnApply) els.btnApply.addEventListener('click', applyFilters);
    if (els.selectAll) els.selectAll.addEventListener('change', () => { if (els.selectAll.checked) openBulkPopover(); else { state.selected.clear(); render(); closeBulkPopover(); hideBulkBar(); } });
    chips.forEach(d => setupChip(d));
    // Tab toggle behavior to exactly mirror People
    if (els.tabs && els.tabs.length && els.grid) {
      els.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          els.tabs.forEach(t => t.classList.toggle('active', t === tab));
          const mode = tab.getAttribute('data-mode') || 'simple';
          els.grid.setAttribute('data-mode', mode);
          tab.setAttribute('aria-selected', 'true');
          els.tabs.filter(t => t !== tab).forEach(t => t.setAttribute('aria-selected','false'));
        });
      });
    }
  }

  function setupChip(d) {
    if (!d.ie) return; renderChips(d);
    d.ie.addEventListener('input', () => { buildPool(d); showSuggest(d, d.ie.value); });
    d.ie.addEventListener('keydown', (e) => { if (e.key === 'Enter' && d.ie.value.trim()) { e.preventDefault(); addToken(d.k, d.ie.value.trim()); d.ie.value = ''; applyFilters(); } else if (e.key === 'Backspace' && !d.ie.value) { const arr = state.tokens[d.k]; if (arr && arr.length) { arr.pop(); renderChips(d); applyFilters(); } } });
    if (d.xe) d.xe.addEventListener('click', () => { state.tokens[d.k] = []; renderChips(d); applyFilters(); });
  }
  function buildPool(d) { const set = new Set(), arr = []; for (const r of state.data) { const v0 = d.acc(r); const v = v0 == null ? '' : String(v0).trim(); if (!v) continue; const k = N(v); if (!set.has(k)) { set.add(k); arr.push(v); } if (arr.length > 1500) break; } pool[d.k] = arr; }
  function showSuggest(d, q) {
    if (!d.se) return;
    const items = (pool[d.k] || []).filter(v => N(v).includes(N(q))).slice(0, 8);
    if (!items.length) { hideSuggest(d); return; }
    // Match People page dropdown item class for identical styling
    d.se.innerHTML = items.map(v => `<div class="chip-suggest-item" data-v="${v.replace(/"/g,'&quot;')}">${v}</div>`).join('');
    d.se.removeAttribute('hidden');
    d.se.querySelectorAll('.chip-suggest-item').forEach(it => it.addEventListener('mousedown', (e) => {
      e.preventDefault();
      addToken(d.k, it.getAttribute('data-v'));
      if (d.ie) d.ie.value = '';
      hideSuggest(d);
      applyFilters();
    }));
  }
  function hideSuggest(d) { if (d.se) { d.se.setAttribute('hidden', ''); d.se.innerHTML = ''; } }
  function renderChips(d) { 
    if (!d.ce) return; 
    const arr = state.tokens[d.k] || []; 
    d.ce.innerHTML = arr.map((t,i)=>`<span class="chip" data-idx="${i}"><span class="chip-label">${t}</span><button type="button" class="chip-remove" aria-label="Remove">&times;</button></span>`).join(''); 
    
    // Add click handlers with proper animation like people page
    d.ce.querySelectorAll('.chip-remove').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Disable button to prevent double-clicks
        btn.disabled = true;
        
        // Add removal animation
        const chip = btn.closest('.chip');
        if (chip && !chip.classList.contains('chip-removing')) {
          // If another chip is already removing, ignore to avoid layout churn
          const existing = d.ce.querySelector('.chip-removing');
          if (existing && existing !== chip) {
            return;
          }
          // If this chip is already removing, ignore
          if (chip.classList.contains('chip-removing')) {
            return;
          }
          
          // Set explicit starting width so width -> 0 is smooth
          chip.style.width = chip.offsetWidth + 'px';
          void chip.offsetWidth; // force reflow
          
          requestAnimationFrame(() => {
            chip.classList.add('chip-removing');
          });
          
          // After transition, remove chip from tokens and re-render
          let handled = false;
          const onTransitionEnd = (ev) => {
            // Only handle once, and only for the width transition of this chip
            if (handled) return;
            if (ev && ev.target !== chip) return;
            if (ev && ev.propertyName && ev.propertyName !== 'width') return;
            handled = true;
            chip.removeEventListener('transitionend', onTransitionEnd);
            
            // Remove from array and re-render
            arr.splice(i, 1);
            renderChips(d);
            applyFilters();
          };
          
          chip.addEventListener('transitionend', onTransitionEnd);
          // Fallback in case transitionend doesn't fire
          setTimeout(() => { onTransitionEnd(); }, 300);
        }
      });
    });
    
    if (d.xe) { 
      if (arr.length) d.xe.removeAttribute('hidden'); 
      else d.xe.setAttribute('hidden',''); 
    } 
    updateFilterCount(); 
  }
  function addToken(k, v) { 
    const t = (v==null?'':String(v)).trim(); 
    if (!t) return; 
    const arr = state.tokens[k] || (state.tokens[k]=[]); 
    if (!arr.some(x=>N(x)===N(t))) { 
      arr.push(t); 
      const d = chips.find(x=>x.k===k); 
      if (d) {
        // Add chip with animation like people page
        addChipWithAnimation(d, t);
      }
    } 
  }
  
  function addChipWithAnimation(d, token) {
    if (!d.ce) return;
    
    const container = d.ce;
    const inputField = d.ie;
    const tokens = state.tokens[d.k] || [];
    
    // Create chip HTML with chip-new class for animation
    const chipHTML = `
      <span class="chip chip-new" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${tokens.length}">
        <span class="chip-label">${token}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${token}" data-idx="${tokens.length}">&#215;</button>
      </span>
    `;
    container.insertAdjacentHTML('beforeend', chipHTML);
    
    // Add click handler to the new chip
    const newChip = container.lastElementChild;
    const removeBtn = newChip.querySelector('.chip-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!removeBtn.disabled) {
          // Disable button to prevent double-clicks
          removeBtn.disabled = true;
          
          const chip = removeBtn.closest('.chip');
          if (chip && !chip.classList.contains('chip-removing')) {
            // Set explicit starting width so width -> 0 is smooth
            chip.style.width = chip.offsetWidth + 'px';
            void chip.offsetWidth; // force reflow
            
            requestAnimationFrame(() => { 
              chip.classList.add('chip-removing'); 
            });
            
            let handled = false;
            const onTransitionEnd = (ev) => {
              if (handled) return;
              if (ev && ev.target !== chip) return;
              if (ev && ev.propertyName && ev.propertyName !== 'width') return;
              handled = true;
              chip.removeEventListener('transitionend', onTransitionEnd);
              
              // Remove from array and re-render
              const index = tokens.indexOf(token);
              if (index > -1) {
                tokens.splice(index, 1);
                renderChips(d);
                applyFilters();
              }
            };
            
            chip.addEventListener('transitionend', onTransitionEnd);
            // Fallback in case transitionend doesn't fire
            setTimeout(() => { onTransitionEnd(); }, 300);
          }
        }
      });
    }
    
    // Remove the animation class after animation completes
    setTimeout(() => {
      newChip.classList.remove('chip-new');
      newChip.classList.add('chip-existing');
    }, 300);
    
    // Update clear button visibility
    if (d.xe) {
      if (tokens.length) d.xe.removeAttribute('hidden');
      else d.xe.setAttribute('hidden','');
    }
    updateFilterCount();
  }

  async function loadData() {
    // Enable debugging for contact ID resolution
    window.CRM_DEBUG_CALLS = true;
    console.log('[Calls] Debug mode enabled - will show detailed contact data mapping');
    
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
          console.log('[Calls] Sample call data from API:', j.calls[0]);
          const playbackBase = /localhost|127\.0\.0\.1/.test(base) ? 'https://power-choosers-crm.vercel.app' : base;
          const rows = j.calls.map((c, idx) => {
            const id = c.id || `call_${Date.now()}_${idx}`;
            const party = pickCounterparty(c);
            const debug = { id, to: c.to, from: c.from, party, accountId: c.accountId || null, contactId: c.contactId || null };

            // Contact name resolution
            let contactName = '';
            let resolvedContactId = c.contactId || null;
            
            // Debug logging for contact ID resolution
            if (window.CRM_DEBUG_CALLS) {
              console.log('[Calls][contactId] Starting resolution:', {
                originalContactId: c.contactId,
                contactName: c.contactName,
                resolvedContactId
              });
            }
            
            if (c.contactName) { 
              contactName = c.contactName; 
              debug.contactSource = 'api.contactName';
              
              // Try to find contact ID by name if not provided
              if (!resolvedContactId && typeof window.getPeopleData === 'function') {
                const people = window.getPeopleData() || [];
                const foundContact = people.find(p => {
                  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
                  return fullName === contactName || p.name === contactName;
                });
                if (foundContact) {
                  resolvedContactId = foundContact.id;
                  debug.contactIdSource = 'people.byName';
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

            // Determine direction and counterparty number (for display and columns)
            const to10 = normPhone(c.to);
            const from10 = normPhone(c.from);
            const bizList = Array.isArray(window.CRM_BUSINESS_NUMBERS) ? window.CRM_BUSINESS_NUMBERS.map(normPhone).filter(Boolean) : [];
            const isBizNum = (p) => bizList.includes(p);
            let direction = 'unknown';
            if (isClientAddr(c.from) || isBizNum(from10)) direction = 'outbound';
            else if (isClientAddr(c.to) || isBizNum(to10)) direction = 'inbound';
            const counter10 = direction === 'outbound' ? to10 : (direction === 'inbound' ? from10 : party);
            const counterPretty = counter10 ? `+1 (${counter10.slice(0,3)}) ${counter10.slice(3,6)}-${counter10.slice(6)}` : '';
            // Pretty print phone (backwards-compat field)
            const contactPhone = counterPretty;

            // DEBUG: per-call enrichment
            dbgCalls('[Calls][enrich]', {
              id,
              to: c.to,
              from: c.from,
              to10,
              from10,
              direction,
              counter10,
              counterPretty,
              resolvedContactId,
              contactName,
              company
            });

            // Fallback: Generate a contact ID if none was found
            if (!resolvedContactId && contactName) {
              // Create a temporary contact ID for calls without existing contacts
              resolvedContactId = `call_contact_${id}_${Date.now()}`;
              if (window.CRM_DEBUG_CALLS) {
                console.log('[Calls][contactId] Generated fallback contact ID:', resolvedContactId);
              }
            }
            
            // Debug logging for final contact ID
            if (window.CRM_DEBUG_CALLS) {
              console.log('[Calls][contactId] Final resolution:', {
                id,
                resolvedContactId,
                contactName,
                originalContactId: c.contactId
              });
            }
            
            // Try to get additional contact information from existing contact data
            let contactEmail = '';
            let contactCity = '';
            let contactState = '';
            let contactSeniority = '';
            let contactDepartment = '';
            let industry = '';
            let accountEmployees = null;
            let visitorDomain = '';
            
            // If we have a resolved contact ID, try to get more data from the contact
            if (resolvedContactId && !resolvedContactId.startsWith('call_contact_')) {
              const existingContact = getContactById(resolvedContactId);
              if (existingContact) {
                contactEmail = existingContact.email || '';
                contactCity = existingContact.city || '';
                contactState = existingContact.state || '';
                contactSeniority = existingContact.seniority || '';
                contactDepartment = existingContact.department || '';
                industry = existingContact.industry || '';
                accountEmployees = existingContact.accountEmployees || null;
                visitorDomain = existingContact.visitorDomain || '';
              }
            }
            
            // Try to find contact by phone number in people data
            if (typeof window.getPeopleData === 'function') {
              const people = window.getPeopleData() || [];
              const norm = (p) => (p || '').toString().replace(/\D/g, '').slice(-10);
              const lookupNum = counter10 || party;
              const partyNorm = norm(lookupNum);
              
              console.log('[Calls] Looking for contact by phone:', lookupNum, 'Normalized:', partyNorm, 'People data count:', people.length);
              
              const foundContact = people.find(p => {
                const phoneNorms = [p.workDirectPhone, p.mobile, p.otherPhone, p.phone].map(norm);
                return phoneNorms.includes(partyNorm);
              });
              
              if (foundContact) {
                if (!contactName) contactName = [foundContact.firstName, foundContact.lastName].filter(Boolean).join(' ') || foundContact.name || '';
                if (!resolvedContactId && foundContact.id) resolvedContactId = foundContact.id;
                if (!contactTitle && foundContact.title) contactTitle = foundContact.title;
                if (!company) company = foundContact.companyName || foundContact.accountName || foundContact.company || '';
                contactEmail = contactEmail || foundContact.email || '';
                contactCity = contactCity || foundContact.city || '';
                contactState = contactState || foundContact.state || '';
                contactSeniority = contactSeniority || foundContact.seniority || '';
                contactDepartment = contactDepartment || foundContact.department || '';
                industry = industry || foundContact.industry || '';
                accountEmployees = accountEmployees || foundContact.accountEmployees || null;
                visitorDomain = visitorDomain || foundContact.visitorDomain || '';
                console.log('[Calls] Found contact by phone in people data:', contactName, 'Phone:', lookupNum, 'Email:', contactEmail, 'City:', contactCity);
              } else {
                console.log('[Calls] No contact found by phone:', lookupNum, 'in people data');
              }
            }
            
            // Try to get account information if we have a company
            if (company && !contactEmail && !contactCity && !contactState && !industry) {
              const account = getAccountById(c.accountId) || findAccountByPhone(party);
              if (account) {
                contactCity = account.city || '';
                contactState = account.state || '';
                contactSeniority = account.seniority || '';
                contactDepartment = account.department || '';
                industry = account.industry || '';
                accountEmployees = account.employees || account.employeeCount || account.numEmployees || null;
                visitorDomain = account.domain || account.website || '';
              }
            }

            const row = {
              id,
              contactId: resolvedContactId,
              contactName,
              contactTitle,
              company,
              contactEmail,
              contactPhone,
              counterparty: counter10,
              counterpartyPretty: counterPretty,
              direction,
              contactCity,
              contactState,
              contactSeniority,
              contactDepartment,
              accountEmployees,
              industry,
              visitorDomain,
              callTime: c.callTime || new Date().toISOString(),
              durationSec: c.durationSec || 0,
              outcome: c.outcome || '',
              transcript: c.transcript || '',
              aiSummary: c.aiSummary || '',
              aiInsights: c.aiInsights || null,
              conversationalIntelligence: c.conversationalIntelligence || null,
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
                  originalContactTitle: c.contactTitle,
                  // Debug the populated fields
                  contactEmail: row.contactEmail,
                  contactCity: row.contactCity,
                  contactState: row.contactState,
                  industry: row.industry,
                  accountEmployees: row.accountEmployees
                }); 
              } catch(_) {}
            }

            return row;
          });
          // Always use API data, even if empty
          dbgCalls('[Calls] Rows mapped count:', rows.length);
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
        contactSeniority:['Senior', 'Manager', 'Director', 'VP', 'C-Level'][j], 
        contactDepartment:['Sales', 'Marketing', 'Engineering', 'Operations', 'Finance'][j], 
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

  function render(){ if(!els.tbody) return; const rows=getPageItems(); els.tbody.innerHTML= rows.map(r=>rowHtml(r)).join('');
    // DEBUG: header sanity and row sample
    try {
      const header = document.querySelector('#calls-table thead tr');
      if (window.CRM_DEBUG_CALLS && header) {
        const cols = Array.from(header.children).map(th => (th.textContent||'').trim());
        console.log('[Calls][header]', cols);
      }
      if (window.CRM_DEBUG_CALLS && rows.length) {
        console.log('[Calls][render sample]', {
          id: rows[0].id,
          name: rows[0].contactName,
          company: rows[0].company,
          number: rows[0].counterpartyPretty || rows[0].contactPhone,
          direction: rows[0].direction
        });
      }
    } catch(_) {}
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
    console.log('[Calls] Attaching event listeners to', els.tbody.querySelectorAll('.name-cell').length, 'name cells');
    els.tbody.querySelectorAll('.name-cell').forEach(cell => {
      const contactId = cell.getAttribute('data-contact-id');
      console.log('[Calls] Found name cell with contactId:', contactId, 'HTML:', cell.outerHTML.substring(0, 100));
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
          
          // Check if this is a generated contact ID (from calls without existing contacts)
          if (contactId.startsWith('call_contact_')) {
            console.log('[Calls] Generated contact ID detected, creating contact detail from call data');
            // For generated contact IDs, we need to create a contact detail from the call data
            // Navigate to people page first, then create a temporary contact detail
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Use requestAnimationFrame to ensure the page has started loading
              requestAnimationFrame(() => {
                // Create a temporary contact object from the call data
                const callRow = state.filtered.find(r => r.contactId === contactId);
                const tempContact = callRow ? {
                  id: contactId,
                  firstName: callRow.contactName.split(' ')[0] || '',
                  lastName: callRow.contactName.split(' ').slice(1).join(' ') || '',
                  name: callRow.contactName,
                  email: callRow.contactEmail || '',
                  phone: callRow.contactPhone || '',
                  mobile: callRow.contactPhone || '',
                  companyName: callRow.company || '',
                  company: callRow.company || '',
                  title: callRow.contactTitle || '',
                  city: callRow.contactCity || '',
                  state: callRow.contactState || '',
                  seniority: callRow.contactSeniority || '',
                  department: callRow.contactDepartment || '',
                  industry: callRow.industry || ''
                } : null;

                const start = Date.now();
                const tryOpen = () => {
                  if (tempContact && window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                    console.log('[Calls] Showing temporary contact detail (generated ID):', contactId);
                    try { window.ContactDetail.show(contactId, tempContact); } catch (error) { console.error('[Calls] Error showing temporary contact detail:', error); }
                    return;
                  }
                  if (Date.now() - start < 2000) { setTimeout(tryOpen, 80); }
                };
                tryOpen();
              });
            }
          } else {
            // Navigate to contact detail for existing contacts
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
                      // Try to get contact data from calls first, then fall back to just ID
                      const callContact = getCallContactById(contactId);
                      if (callContact) {
                        console.log('[Calls] Passing contact data from calls:', callContact);
                        console.log('[Calls] Contact data fields:', {
                          email: callContact.email,
                          phone: callContact.phone,
                          mobile: callContact.mobile,
                          companyName: callContact.companyName,
                          title: callContact.title,
                          city: callContact.city,
                          state: callContact.state,
                          industry: callContact.industry
                        });
                        window.ContactDetail.show(contactId, callContact);
                      } else {
                        console.log('[Calls] No contact data found for:', contactId);
                        window.ContactDetail.show(contactId);
                      }
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
    const dur = `${Math.floor(r.durationSec/60)}m ${r.durationSec%60}s`;
    const id = escapeHtml(r.id);
    const name = escapeHtml(r.contactName || r.to || '');
    const title = escapeHtml(r.contactTitle || '');
    const company = escapeHtml(r.company || '');
    const callTimeStr = new Date(r.callTime).toLocaleString();
    const updatedStr = new Date(r.callTime).toLocaleDateString();
    const outcome = escapeHtml(r.outcome || '');
    
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
    
    // Safe account favicon helper (fallback icon when shared helper missing)
    const safeAccountIcon = (() => {
      try {
        if (typeof window.__pcAccountsIcon === 'function') return window.__pcAccountsIcon();
      } catch(_) {}
      // Minimal white vector icon placeholder inside proper container
      return '<span class="company-favicon" aria-hidden="true" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:var(--bg-item);position:relative;overflow:hidden">\
        <svg viewBox="0 0 24 24" width="14" height="14" style="position:absolute;left:1px;top:1px" fill="none" stroke="#fff" stroke-width="1.5"><rect x="4" y="8" width="6" height="10" rx="1"></rect><rect x="14" y="6" width="6" height="12" rx="1"></rect></svg>\
      </span>';
    })();

    // New columns: Number and Direction
    const numberCell = escapeHtml(r.counterpartyPretty || r.contactPhone || String(r.to||r.from||''));
    const directionCell = escapeHtml((r.direction || '').charAt(0).toUpperCase() + (r.direction || '').slice(1));
    return `
    <tr>
      <td class="col-select"><input type="checkbox" class="row-select" data-id="${id}" ${state.selected.has(r.id)?'checked':''}></td>
      <td class="name-cell" data-contact-id="${r.contactId || ''}"><div class="name-cell__wrap"><span class="avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span><span class="name-text">${name}</span></div></td>
      <td>${title}</td>
      <td><a href="#account-details" class="company-link" data-company="${escapeHtml(company)}" data-domain="${escapeHtml(favDomain)}"><span class="company-cell__wrap">${favDomain ? `<img class="company-favicon" src="https://www.google.com/s2/favicons?sz=64&domain=${escapeHtml(favDomain)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'; var fb=this.nextElementSibling; if(fb){ fb.style.display='inline-block'; }" />${safeAccountIcon.replace('display:inline-block','display:none')}` : `${safeAccountIcon}`}<span class="company-name">${company}</span></span></a></td>
      <td>${numberCell}</td>
      <td>${directionCell || '—'}</td>
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

      /* Modern 2025 Transcript Styling */
      .pc-transcript-container {
        background: var(--bg-card);
        border: 1px solid var(--border-light);
        border-radius: 16px;
        padding: 20px;
        max-height: 400px;
        overflow-y: auto;
        margin: 16px 0;
      }
      
      .transcript-message {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: flex-start;
      }
      
      .transcript-message:last-child {
        margin-bottom: 0;
      }
      
      .transcript-avatar {
        flex-shrink: 0;
      }
      
      .transcript-avatar-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
        letter-spacing: 0.5px;
      }
      
      .transcript-avatar-circle.agent-avatar {
        background: var(--orange-subtle);
        color: #fff;
      }
      
      .transcript-avatar-circle.contact-avatar {
        background: var(--orange-subtle);
        color: #fff;
      }
      
      .transcript-avatar-circle.company-avatar {
        background: var(--bg-item);
        padding: 2px;
        border-radius: 50%;
      }
      
      .transcript-avatar-circle.company-avatar img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }
      
      .transcript-avatar-circle.company-avatar .company-favicon-fallback {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: var(--bg-item);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
      }
      
      .transcript-content {
        flex: 1;
        min-width: 0;
      }
      
      .transcript-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      
      .transcript-speaker {
        font-weight: 600;
        font-size: 13px;
        color: var(--text-primary);
      }
      
      .transcript-time {
        font-size: 11px;
        color: var(--text-secondary);
        font-weight: 400;
      }
      
      .transcript-text {
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-primary);
        word-wrap: break-word;
      }
      
      .transcript-message.agent .transcript-content {
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        border-radius: 12px;
        padding: 12px 16px;
        margin-left: 8px;
      }
      
      .transcript-message.customer .transcript-content {
        background: var(--bg-card);
        border: 1px solid var(--border-light);
        border-radius: 12px;
        padding: 12px 16px;
        margin-right: 8px;
      }
      
      .transcript-message.other .transcript-content {
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        border-radius: 12px;
        padding: 12px 16px;
      }

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

  // Lightweight terminal-visible heartbeat for live insights (polling stub)
  try {
    if (window.CRM_DEBUG_LIVE) {
      console.log('[LiveInsights] Debug enabled');
    }
  } catch(_) {}
  function closeInsightsModal(){
    const bd=document.querySelector('.pc-insights-backdrop'); if(bd&&bd.parentNode) bd.parentNode.removeChild(bd);
    const md=document.querySelector('.pc-insights-modal'); if(md&&md.parentNode) md.parentNode.removeChild(md);
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e){ if(e.key==='Escape') closeInsightsModal(); }
  
  // Avatar helper functions for transcript
  function getAgentAvatar() {
    return `<div class="transcript-avatar-circle agent-avatar" aria-hidden="true">Y</div>`;
  }
  
  function getContactAvatar(contactName, callData) {
    // Try to get contact info from call data or lookup
    let contact = null;
    if (callData && callData.contactId) {
      contact = getContactById(callData.contactId);
    }
    
    if (contact && contact.firstName) {
      // Known contact - use orange letter glyph
      const initials = (contact.firstName.charAt(0) + (contact.lastName ? contact.lastName.charAt(0) : '')).toUpperCase();
      return `<div class="transcript-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
    } else {
      // Unknown contact - use company favicon
      const companyName = callData?.companyName || callData?.contactName || contactName;
      const domain = extractDomainFromCompany(companyName);
      if (domain) {
        return `<div class="transcript-avatar-circle company-avatar" aria-hidden="true">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}" 
               alt="" loading="lazy" referrerpolicy="no-referrer" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="company-favicon-fallback" style="display:none;">${svgIcon('accounts')}</div>
        </div>`;
      } else {
        // Fallback to first letter of contact name
        const initial = (contactName || 'C').charAt(0).toUpperCase();
        return `<div class="transcript-avatar-circle contact-avatar" aria-hidden="true">${initial}</div>`;
      }
    }
  }
  
  function extractDomainFromCompany(companyName) {
    if (!companyName) return null;
    // Simple domain extraction - could be enhanced
    const clean = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const commonDomains = {
      'google': 'google.com',
      'microsoft': 'microsoft.com',
      'apple': 'apple.com',
      'amazon': 'amazon.com',
      'facebook': 'facebook.com',
      'meta': 'meta.com'
    };
    return commonDomains[clean] || null;
  }
  
  // Normalize supplier tokens in free text (e.g., "T X U" → "TXU", "N R G" → "NRG")
  function normalizeSupplierTokens(s){
    try {
      if (!s) return '';
      let out = String(s);
      // Common spaced-letter patterns
      out = out.replace(/\bT\s*X\s*U\b/gi, 'TXU');
      out = out.replace(/\bN\s*R\s*G\b/gi, 'NRG');
      // ASR mis-hear of TXU as "T X you"
      out = out.replace(/\bT\s*X\s*you\b/gi, 'TXU');
      return out;
    } catch(_) { return String(s||''); }
  }

  function isWeekdayWord(s){
    const w = String(s||'').toLowerCase();
    return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(w);
  }

  function canonicalizeSupplierName(s){
    if (!s) return '';
    const raw = normalizeSupplierTokens(s).trim();
    const key = raw.replace(/[^a-z0-9]/gi,'').toLowerCase();
    const map = {
      'txu':'TXU', 'txuenergy':'TXU',
      'nrg':'NRG',
      'reliant':'Reliant', 'reliantenergy':'Reliant',
      'constellation':'Constellation',
      'directenergy':'Direct Energy',
      'greenmountain':'Green Mountain', 'greenmountainenergy':'Green Mountain',
      'cirro':'Cirro',
      'engie':'Engie',
      'shellenergy':'Shell Energy',
      'championenergy':'Champion Energy', 'champion':'Champion Energy',
      'gexa':'Gexa',
      'taraenergy':'Tara Energy', 'apg&e':'APG & E', 'apge':'APG & E'
    };
    const canon = map[key] || raw;
    return isWeekdayWord(canon) ? '' : canon;
  }

  function getKnownSuppliers(){
    const out = new Set();
    try {
      if (Array.isArray(window.SupplierNames)) {
        window.SupplierNames.forEach(n => { if (n) out.add(String(n).trim()); });
      }
    } catch(_) {}
    try {
      const data = window.SupplierData || {};
      Object.keys(data).forEach(n => { if (n) out.add(String(n).trim()); });
    } catch(_) {}
    return out;
  }

  function findSupplierInTextFromKnown(text){
    try {
      if (!text) return '';
      const known = Array.from(getKnownSuppliers());
      const hay = normalizeSupplierTokens(String(text));
      let found = '';
      for (const name of known){
        const rx = new RegExp(`\\b${name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}\\b`, 'i');
        if (rx.test(hay)) found = name; // last match wins (use later mention)
      }
      return canonicalizeSupplierName(found);
    } catch(_) { return ''; }
  }

  function acceptSupplierName(s){
    const canon = canonicalizeSupplierName(s);
    if (!canon) return '';
    const known = getKnownSuppliers();
    // Exact match against known set (case-insensitive by normalizing)
    const has = (() => {
      const lc = canon.toLowerCase();
      for (const name of known){ if (String(name).toLowerCase() === lc) return true; }
      return false;
    })();
    return has ? canon : '';
  }

  function parseBestRate(t){
    const s = t.replace(/(\d)\s+(\d)/g, '$1$2');
    const nums = [];
    const re = /\b\$?\d{1,2}\.\d{2,3}\b/g;
    let m; while ((m = re.exec(s))){ nums.push(m[0]); }
    // Prefer numbers in realistic $/kWh range 0.03–0.25, otherwise choose smallest decimal with 3 digits
    let pick = '';
    let best = Infinity;
    for (const v of nums){ const n = parseFloat(v.replace('$','')); if (n>=0.03 && n<=0.25 && n<best){ best=n; pick=v; } }
    if (!pick){
      for (const v of nums){ const n = parseFloat(v.replace('$','')); if (n<best){ best=n; pick=v; } }
    }
    if (!pick) return '';
    const p = pick.startsWith('$') ? pick : ('$'+pick);
    return /kwh|cents|¢/i.test(s) ? p.replace(/\s+/g,'') : (p.replace(/\s+/g,'') + '/kWh');
  }

  function wordOrdinalToNumber(word){
    const map = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9, tenth:10, eleventh:11, twelfth:12, thirteenth:13, fourteenth:14, fifteenth:15, sixteenth:16, seventeenth:17, eighteenth:18, nineteenth:19, twentieth:20, twentyfirst:21, twentysecond:22, twentythird:23, twentyfourth:24, twentyfifth:25, twentysixth:26, twentyseventh:27, twentyeighth:28, twentyninth:29, thirtieth:30, thirtyfirst:31 };
    const k = String(word||'').toLowerCase().replace(/\s+/g,'');
    return map[k] || null;
  }

  function extractContractFromTranscriptText(text){
    const out = { currentRate: '', rateType: '', supplier: '', contractEnd: '', usageKWh: '', contractLength: '' };
    if (!text) return out;
    const t = normalizeSupplierTokens(String(text));
    // Rate like 0.075 near "rate" or explicit $/kWh
    try {
      const val = parseBestRate(t);
      if (val) out.currentRate = val;
    } catch(_) {}
    // Rate type
    if (/\bfixed\b/i.test(t)) out.rateType = 'fixed';
    else if (/\bvariable\b/i.test(t)) out.rateType = 'variable';
    else if (/\bindex(ed)?\b/i.test(t)) out.rateType = 'indexed';
    // Supplier
    try {
      const near = t.match(/\b(?:supplier|utility)\b[^\n\r]{0,60}?([A-Za-z &]+)\b/i)?.[1] || '';
      let accepted = acceptSupplierName(near);
      if (!accepted) accepted = findSupplierInTextFromKnown(t);
      if (accepted) out.supplier = accepted;
    } catch(_) {}
    // Usage
    try {
      let u = t.match(/\b([\d,.]{4,})\s*(kwh|kilowatt\s*hours?)\b/i);
      if (!u) {
        // Near the word usage/annual usage without unit
        const near = t.match(/\b(annual\s+usage|usage)\b[^\n\r]{0,30}?([\d,.]{4,})/i);
        if (near) u = [near[0], near[2], 'kwh'];
        else {
          const nearYear = t.match(/\b([\d,.]{4,})\b[^\n\r]{0,10}\b(for the year|per year|a year)\b/i);
          if (nearYear) u = [nearYear[0], nearYear[1], 'kwh'];
        }
      }
      if (u) {
        const num = u[1].replace(/[,\s]/g,'');
        const formatted = Number(num).toLocaleString();
        out.usageKWh = `${formatted} kWh`;
      }
    } catch(_) {}
    // Contract end date (Month day, year), allow spoken numbers with spaces
    try {
      let s = t.replace(/(\d)\s+(\d)/g, '$1$2');
      let m = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-9]{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})/i);
      if (!m) {
        const m2 = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([A-Za-z\s-]{3,15})\s*,?\s*(20\d{2})/i);
        if (m2) {
          const day = wordOrdinalToNumber(m2[2]);
          if (day) m = [m2[0], m2[1], String(day), m2[3]];
        }
      }
      if (m) out.contractEnd = `${m[1]} ${m[2]}, ${m[3]}`;
    } catch(_) {}
    // Term
    try {
      const cl = t.match(/\b(\d{1,2})\s*(years?|months?)\b/i);
      if (cl) out.contractLength = `${cl[1]} ${/year/i.test(cl[2]) ? 'years' : 'months'}`;
    } catch(_) {}
    return out;
  }

  // Extract normalized contract fields from AI insights
  function extractContractFromAI(ai){
    const A = ai || {};
    const get = (obj, keys, d='') => { for (const k of keys) { if (obj && obj[k] != null && obj[k] !== '') return obj[k]; } return d; };
    const c = A.contract || {};
    const result = {
      currentRate: get(c, ['currentRate','current_rate','rate'], ''),
      rateType: get(c, ['rateType','rate_type'], ''),
      supplier: acceptSupplierName(get(c, ['supplier','utility'], '')),
      contractEnd: get(c, ['contractEnd','contract_end','endDate'], ''),
      usageKWh: get(c, ['usageKWh','usage_k_wh','usage'], ''),
      contractLength: get(c, ['contractLength','contract_length'], '')
    };
    return result;
  }

  function extractContractFromAll(ai, transcript){
    const primary = extractContractFromAI(ai);
    const fallback = extractContractFromTranscriptText(transcript || '');
    return {
      currentRate: primary.currentRate || fallback.currentRate,
      rateType: primary.rateType || fallback.rateType,
      supplier: primary.supplier || fallback.supplier,
      contractEnd: primary.contractEnd || fallback.contractEnd,
      usageKWh: primary.usageKWh || fallback.usageKWh,
      contractLength: primary.contractLength || fallback.contractLength
    };
  }

  function extractBudgetFromTranscript(text){
    try {
      if(!text) return '';
      const s = String(text).replace(/(\d)\s+(\d)/g,'$1$2');
      const m = s.match(/\b(\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b\s*(dollars)?\s*(a|per|\/)?\s*(month|mo\.?|mth|year|yr\.?)/i);
      if (!m) return '';
      const amt = m[1].startsWith('$') ? m[1] : ('$'+m[1]);
      const per = /year|yr/i.test(m[4]||'') ? '/year' : '/month';
      return `${amt}${per}`;
    } catch(_) { return ''; }
  }

  // Resolve account ID for a call row using direct id or by company name lookup
  function resolveAccountIdForCall(r){
    try { if (r && r.accountId) return r.accountId; } catch(_) {}
    try {
      const company = String(r && r.company || '').trim();
      if (!company) return '';
      if (typeof window.getAccountsData === 'function'){
        const accounts = window.getAccountsData() || [];
        const acc = accounts.find(a => (a.accountName === company) || (a.name === company));
        return acc && acc.id ? acc.id : '';
      }
    } catch(_) {}
    try {
      // Fallback: resolve via contact → account
      const name = String(r && r.contactName || '').trim();
      const phone = String(r && (r.contactPhone || r.to || r.from) || '').replace(/\D/g,'').slice(-10);
      if (typeof window.getPeopleData === 'function'){
        const people = window.getPeopleData() || [];
        let person = null;
        if (name) person = people.find(p => (p.name === name) || ((p.firstName||p.first_name||'') + ' ' + (p.lastName||p.last_name||'')).trim() === name);
        if (!person && phone) person = people.find(p => String(p.mobile||p.mobile_phone||p.workDirectPhone||p.otherPhone||'').replace(/\D/g,'').slice(-10) === phone);
        const accId = person && (person.accountId || person.account_id || person.companyId);
        if (accId) return accId;
      }
    } catch(_) {}
    return '';
  }

  // Persist extracted contract fields to the linked Account and notify UI
  async function persistEnergyFromAI(r){
    try {
      if (!r || !r.aiInsights || r._energySaved) return;
      const contract = extractContractFromAll(r.aiInsights, r.transcript);
      const payload = {};
      if (contract.supplier && contract.supplier !== 'Unknown' && !isWeekdayWord(contract.supplier)) payload.electricitySupplier = contract.supplier;
      if (contract.currentRate && contract.currentRate !== 'Unknown') payload.currentRate = contract.currentRate;
      if (contract.contractEnd && contract.contractEnd !== 'Not discussed') payload.contractEndDate = contract.contractEnd;
      if (!Object.keys(payload).length) return;
      const accountId = resolveAccountIdForCall(r);
      if (!accountId) return;
      const db = window.firebaseDB;
      if (!db || !db.collection) return;
      await db.collection('accounts').doc(accountId).update(payload);
      // Toast
      try {
        if (window.ToastManager && window.ToastManager.showSaveNotification) {
          window.ToastManager.showSaveNotification('Energy contract details saved');
        } else if (window.crm && window.crm.showToast) {
          window.crm.showToast('Saved');
        }
      } catch(_) {}
      // Dispatch energy-updated events per field
      try {
        for (const [field, value] of Object.entries(payload)){
          document.dispatchEvent(new CustomEvent('pc:energy-updated', { detail: { entity: 'account', id: accountId, field, value } }));
        }
      } catch(_) {}
      r._energySaved = true;
    } catch(e){ console.warn('[Calls] persistEnergyFromAI error:', e); }
  }

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
    // DEBUG: verify all insight sections present
    try {
      const A = r.aiInsights || {};
      const completeness = {
        sentiment: !!A.sentiment,
        disposition: !!A.disposition,
        keyTopics: Array.isArray(A.keyTopics) && A.keyTopics.length>0,
        nextSteps: Array.isArray(A.nextSteps) && A.nextSteps.length>0,
        painPoints: Array.isArray(A.painPoints) && A.painPoints.length>0,
        contract: !!A.contract,
        entities: Array.isArray(A.entities) && A.entities.length>0,
        flags: !!A.flags
      };
      console.log('[Call Insights][completeness]', completeness);
      if (window.CRM_DEBUG_TRANSCRIPTS) {
        const turns = Array.isArray(A.speakerTurns) ? A.speakerTurns : [];
        const sample = turns.slice(0, 6).map(t=>({ role:t.role, t:t.t, text:(t.text||'').slice(0,80) }));
        console.log('[Call Insights][speakerTurns sample]', sample);
      }
    } catch(_) {}
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

    // Persist Energy & Contract fields to Account (supplier, current rate, contract end) once per call
    persistEnergyFromAI(r);
    // Auto-create follow-up task if timeline date/time detected
    try { createFollowupTaskFromTimeline(r, r.aiInsights || {}); } catch(_) {}

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

    const contract = (()=>{ const mapped = extractContractFromAll(A, r.transcript); console.log('[Insights Debug] Mapped contract:', mapped); return mapped; })();

    const sentiment = get(A, ['sentiment'], 'Unknown');
    const disposition = get(A, ['disposition'], '');
    const keyTopics = toArr(get(A, ['keyTopics','key_topics'], []));
    const nextStepsArr = toArr(get(A, ['nextSteps','next_steps'], []));
    const painPointsArr = toArr(get(A, ['painPoints','pain_points'], []));
    const budget = get(A, ['budget'], '') || extractBudgetFromTranscript(r.transcript || '');
    const timeline = get(A, ['timeline'], 'Not specified');
    const entities = toArr(get(A, ['entities'], []));
    const flags = get(A, ['flags'], {});

    // Always build UI summary from structured data
    let summarySource = get(A, ['summary','conversation_summary','Conversation Summary'], r.aiSummary || '');
    let summaryText = '';
    if (summarySource) {
      const parts = String(summarySource).split('•');
      summaryText = (parts[0] || summarySource).trim();
      } else {
      summaryText = `Conversation ${disposition ? `(${disposition.toLowerCase()}) ` : ''}about energy services. ${sentiment} sentiment detected.`;
    }

    // Transcript rendering with consistent speaker/timestamp lines across pages
    const toMMSS = (s)=>{ const m=Math.floor((s||0)/60), ss=(s||0)%60; return `${String(m)}:${String(ss).padStart(2,'0')}`; };
    function parseSpeakerTranscript(text){
      const out=[]; if(!text) return out;
      // Insert line breaks before Speaker/Agent/Customer markers if transcript is one big line
      let pre = String(text).replace(/\s*(Speaker\s+\d*\s*\d?:\d{2}:)/g, '\n$1')
                            .replace(/\s*(Agent\s+\d?:\d{2}:)/g, '\n$1')
                            .replace(/\s*(Customer\s+\d?:\d{2}:)/g, '\n$1');
      const lines = pre.split(/\r?\n/);
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
      let turns = Array.isArray(A?.speakerTurns) ? A.speakerTurns : [];
      // Fallback: build from conversationalIntelligence sentences if available
      if (!turns.length) {
        try {
          const sentences = Array.isArray(r?.conversationalIntelligence?.sentences) ? r.conversationalIntelligence.sentences : [];
          if (sentences.length) {
            const grouped = [];
            let current = null;
            for (const s of sentences){
              const ch = (s.channel != null ? String(s.channel) : '');
              const role = (ch === '1') ? 'agent' : 'customer';
              const ts = Math.max(0, Math.floor((s.startTime || 0)));
              const txt = normalizeSupplierTokens(s.text || s.transcript || '');
              if (current && current.role === role){ current.text += (current.text?' ':'') + txt; current.t = ts; }
              else { if (current) grouped.push(current); current = { role, t: ts, text: txt }; }
            }
            if (current) grouped.push(current);
            turns = grouped;
          }
        } catch(_) {}
      }
      // If we have turns but roles are blank/unknown, alternate roles agent/customer
      if (turns.length) {
        const hasKnownRoles = turns.some(t => t && (t.role === 'agent' || t.role === 'customer'));
        if (!hasKnownRoles) {
          const patched = [];
          let next = 'customer';
          for (const t of turns){
            patched.push({ t: Number(t.t) || 0, role: next, text: t.text || '' });
            next = (next === 'agent') ? 'customer' : 'agent';
          }
          turns = patched;
        }
      }
      // Helper: heuristic splitter when only one generic "Speaker" or no diarization at all
      function heuristicSplitByPunctuation(text){
        const out=[]; if(!text) return out; const contactFirst = (String(r.contactName || r.to || '').trim().split(/\s+/)[0]) || 'Customer';
        let t = String(text).replace(/\s+/g,' ').trim();
        // Normalize common filler tokens as gentle boundaries
        t = t.replace(/\[(?:hes|noise|crosstalk)\]/gi, '. ');
        // Hard split on sentence punctuation
        let segs = t.split(/(?<=[\.\?\!])\s+(?=[A-Z0-9])/g);
        if (segs.length <= 1) {
          // Soft split every ~12-20 words if no punctuation
          const words = t.split(/\s+/); const chunks=[]; let cur=[];
          for (const w of words){
            cur.push(w);
            if (cur.length >= 16){ chunks.push(cur.join(' ')); cur=[]; }
          }
          if (cur.length) chunks.push(cur.join(' '));
          segs = chunks;
        }
        let role = 'customer';
        for (const s of segs){
          const txt = (s||'').trim(); if(!txt) continue; const label = role==='agent' ? 'You' : contactFirst; out.push({ label, text: txt }); role = (role==='agent') ? 'customer' : 'agent';
        }
        return out;
      }
      if(turns.length){
        const contactFirst = (String(r.contactName || r.to || '').trim().split(/\s+/)[0]) || 'Customer';
        const groups = [];
        let current = null;
        for (const t of turns){
          const roleKey = t.role==='agent' ? 'agent' : (t.role==='customer' ? 'customer' : 'other');
          const text = normalizeSupplierTokens(t.text || '');
          const ts = Number(t.t) || 0;
          if (current && current.role === roleKey){
            current.texts.push(text);
            current.end = ts;
          } else {
            if (current) groups.push(current);
            current = { role: roleKey, start: ts, end: ts, texts: [text] };
          }
        }
        if (current) groups.push(current);
        return groups.map(g => {
          const label = g.role === 'agent' ? 'You' : (g.role === 'customer' ? contactFirst : 'Speaker');
          const avatar = g.role === 'agent' ? getAgentAvatar() : getContactAvatar(contactFirst, r);
          return `<div class=\"transcript-message ${g.role}\">
            <div class=\"transcript-avatar\">${avatar}</div>
            <div class=\"transcript-content\">
              <div class=\"transcript-header\">
                <span class=\"transcript-speaker\">${label}</span>
                <span class=\"transcript-time\">${toMMSS(g.start)}</span>
              </div>
              <div class=\"transcript-text\">${escapeHtml(g.texts.join(' ').trim())}</div>
            </div>
          </div>`;
        }).join('');
      }
      const parsed = parseSpeakerTranscript(raw||'');
      if(parsed.some(p=>p.label && p.t!=null)){
        const contactFirst = (String(r.contactName || r.to || '').trim().split(/\s+/)[0]) || 'Customer';
        // Heuristic diarization when labels are all "Speaker": alternate roles by turn order
        let toggle = 'customer'; // start with customer speaking
        return parsed.map(p=> {
          if (!p.label) return `<div class=\"transcript-message\"><div class=\"transcript-content\"><div class=\"transcript-text\">${escapeHtml(p.text||'')}</div></div></div>`;
          let roleLabel = p.label;
          let role = 'other';
          if (/^speaker\b/i.test(roleLabel)) {
            roleLabel = (toggle === 'agent') ? 'You' : contactFirst;
            role = toggle;
            toggle = (toggle === 'agent') ? 'customer' : 'agent';
          }
          const avatar = role === 'agent' ? getAgentAvatar() : getContactAvatar(contactFirst, r);
          return `<div class=\"transcript-message ${role}\">
            <div class=\"transcript-avatar\">${avatar}</div>
            <div class=\"transcript-content\">
              <div class=\"transcript-header\">
                <span class=\"transcript-speaker\">${escapeHtml(roleLabel)}</span>
                <span class=\"transcript-time\">${toMMSS(p.t)}</span>
              </div>
              <div class=\"transcript-text\">${escapeHtml(p.text||'')}</div>
            </div>
          </div>`;
        }).join('');
      }
      // Final heuristic: split by punctuation and alternate roles
      const heur = heuristicSplitByPunctuation(raw||'');
      if (heur.length){
        return heur.map(h => {
          const role = h.label === 'You' ? 'agent' : 'customer';
          const avatar = role === 'agent' ? getAgentAvatar() : getContactAvatar(h.label, r);
          return `<div class=\"transcript-message ${role}\">
            <div class=\"transcript-avatar\">${avatar}</div>
            <div class=\"transcript-content\">
              <div class=\"transcript-header\">
                <span class=\"transcript-speaker\">${escapeHtml(h.label)}</span>
              </div>
              <div class=\"transcript-text\">${escapeHtml(h.text)}</div>
            </div>
          </div>`;
        }).join('');
      }
      const fallback = raw || (A && Object.keys(A).length ? 'Transcript processing...' : 'Transcript not available');
      return escapeHtml(fallback);
    }
    const transcriptHtml = renderTranscriptHtml(A, normalizeSupplierTokens(r.transcript || ''));

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
            <div class=\"pc-transcript-container\">${transcriptHtml}</div>
          </div>
        </div>

        <div class="pc-col-right">
          <div class="pc-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
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
              ${contract.supplier ? `<span class="pc-chip">Supplier: ${escapeHtml(contract.supplier)}</span>` : ''}
              ${contract.contractEnd ? `<span class="pc-chip">Contract end: ${escapeHtml(contract.contractEnd)}</span>` : ''}
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
              <div class=\"k\">Current rate</div><div class=\"v\">${escapeHtml(contract.currentRate || 'Unknown')}</div>
              <div class=\"k\">Supplier/Utility</div><div class=\"v\">${escapeHtml(contract.supplier || 'Unknown')}</div>
              <div class=\"k\">Contract end</div><div class=\"v\">${escapeHtml(contract.contractEnd || 'Not discussed')}</div>
              <div class=\"k\">Usage</div><div class=\"v\">${escapeHtml(String(contract.usageKWh || 'Not provided'))}</div>
              <div class=\"k\">Rate type</div><div class=\"v\">${escapeHtml(contract.rateType || 'Unknown')}</div>
              <div class=\"k\">Term</div><div class=\"v\">${escapeHtml(String(contract.contractLength || 'Unknown'))}</div>
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
  // Expose a helper for email generator to get the most relevant transcript for a recipient
  try {
    window.getRecentCallForEmail = function(recipient){
      try {
        const email = String(recipient?.email || '').toLowerCase();
        const name = String(recipient?.name || recipient?.fullName || '').toLowerCase();
        const calls = Array.isArray(window.__callsData) ? window.__callsData : [];
        // Prefer most recent completed call with transcript that matches email or contact name
        const now = Date.now();
        const scored = calls.map(c => {
          let score = 0;
          const t = (new Date(c.timestamp || c.callTime || 0)).getTime() || 0;
          score += Math.max(0, (t ? (t / 1e13) : 0));
          if (c.transcript && String(c.transcript).trim()) score += 10;
          const cName = String(c.contactName || '').toLowerCase();
          const cEmail = String(c.contactEmail || '').toLowerCase();
          if (email && cEmail && cEmail === email) score += 5;
          if (name && cName && cName.includes(name.split(' ')[0] || '')) score += 2;
          return { c, score };
        }).sort((a,b)=>b.score-a.score);
        return scored.length ? scored[0].c : null;
      } catch(_) { return null; }
    }
  } catch(_) { /* noop */ }

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

    // Ensure table header has Number and Direction columns (idempotent)
    try {
      const table = document.getElementById('calls-table');
      const thead = table ? table.querySelector('thead tr') : null;
      if (thead && !thead._pcNumberDirection) {
        const headers = Array.from(thead.children).map(th => (th.textContent||'').trim().toLowerCase());
        const ensureTh = (label, afterLabel) => {
          if (headers.includes(label.toLowerCase())) return;
          const th = document.createElement('th');
          th.textContent = label;
          // Insert after a specific column if found; otherwise append near time
          let ref = null;
          if (afterLabel) {
            for (const child of thead.children) {
              if ((child.textContent||'').trim().toLowerCase() === afterLabel.toLowerCase()) { ref = child.nextSibling; break; }
            }
          }
          if (!ref) {
            for (const child of thead.children) {
              if ((child.textContent||'').trim().toLowerCase().includes('company')) { ref = child.nextSibling; break; }
            }
          }
          thead.insertBefore(th, ref);
        };
        // Add Number right after Company, Direction after Number
        ensureTh('Number', 'Company');
        ensureTh('Direction', 'Number');
        thead._pcNumberDirection = true;
      }
    } catch (_) { /* noop */ }
    
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
  
  // Helper function to get contact data by ID from calls data
  function getCallContactById(contactId) {
    if (!contactId) return null;
    
    // First try to find in current calls data
    const callData = state.data.find(call => call.contactId === contactId);
    if (callData) {
      console.log('[Calls] getCallContactById - callData:', callData);
      
      // Convert call data to contact format
      const contactData = {
        id: contactId,
        firstName: callData.contactName ? callData.contactName.split(' ')[0] : '',
        lastName: callData.contactName ? callData.contactName.split(' ').slice(1).join(' ') : '',
        name: callData.contactName || '',
        email: callData.contactEmail || '',
        phone: callData.contactPhone || '',
        mobile: callData.contactPhone || '', // Use same as phone
        companyName: callData.company || '', // Map company to companyName (contact detail page expects this)
        company: callData.company || '', // Also keep company field
        title: callData.contactTitle || '',
        city: callData.contactCity || '',
        state: callData.contactState || '',
        seniority: callData.contactSeniority || '',
        department: callData.contactDepartment || '',
        industry: callData.industry || ''
      };
      
      console.log('[Calls] getCallContactById - converted contactData:', contactData);
      return contactData;
    }
    
    return null;
  }

  function getCurrentState(){
    return {
      page: 'calls',
      scroll: window.scrollY || 0,
      currentPage: state.currentPage || 1,
      filters: {
        // Add any call-specific filters here
      },
      searchTerm: els.quickSearch?.value || '',
      selectedItems: getSelectedCalls().map(c => c.id || c.callId || c._id),
      sortColumn: state.sortColumn || '',
      sortDirection: state.sortDirection || 'asc',
      timestamp: Date.now()
    };
  }

  // Expose loadData and controls for external use
  window.callsModule = { 
    loadData, 
    startAutoRefresh, 
    stopAutoRefresh,
    getCallContactById,
    getCurrentState,
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
    },
    debugContactData: function(contactId) {
      console.log('=== Contact Data Debug for:', contactId, '===');
      const callData = state.data.find(call => call.contactId === contactId);
      if (callData) {
        console.log('Call data found:', callData);
        const contactData = getCallContactById(contactId);
        console.log('Converted contact data:', contactData);
        return { callData, contactData };
      } else {
        console.log('No call data found for contact ID:', contactId);
        return null;
      }
    }
  };
  
  document.addEventListener('DOMContentLoaded', init);
})();

  function parseTimelineToTask(text){
    try{
      if(!text) return null;
      const t = String(text);
      // Date: try explicit month day year first, then weekday + day, else today
      let s = t.replace(/(\d)\s+(\d)/g,'$1$2');
      let m = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-9]{1,2}|[A-Za-z\- ]{3,15})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})?/i);
      let year = new Date().getFullYear();
      let month = null; let day = null;
      if(m){
        month = m[1];
        if(/^[A-Za-z]/.test(m[2])){ const maybe = wordOrdinalToNumber(m[2]); if(maybe) day = maybe; }
        else day = parseInt(m[2],10);
        if(m[3]) year = parseInt(m[3],10);
      }
      // Fallback: next weekday (e.g., Wednesday)
      if(!month){
        const wd = s.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)?.[1];
        if(wd){
          const idx = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(wd.charAt(0).toUpperCase()+wd.slice(1).toLowerCase());
          const now = new Date();
          const cur = now.getDay();
          let add = (idx - cur + 7) % 7; if(add===0) add = 7;
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+add);
          month = d.toLocaleString('en-US',{month:'long'});
          day = d.getDate();
          year = d.getFullYear();
        }
      }
      if(!month || !day) return null;
      // Time: e.g., 5 PM, 2:30 PM
      const timeMatch = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
      const hour = timeMatch ? parseInt(timeMatch[1],10) : 10;
      const minute = timeMatch && timeMatch[2] ? parseInt(timeMatch[2],10) : 0;
      const ap = timeMatch ? timeMatch[3].toUpperCase() : 'AM';
      const dueDate = new Date(`${month} ${day}, ${year}`);
      let h24 = hour % 12; if(ap==='PM') h24 += 12;
      const hh = String(((hour%12)||12)).padStart(2,'0');
      const mm = String(minute).padStart(2,'0');
      const dueDateStr = `${String(dueDate.getMonth()+1).padStart(2,'0')}/${String(dueDate.getDate()).padStart(2,'0')}/${dueDate.getFullYear()}`;
      const dueTimeStr = `${hh}:${mm} ${ap}`;
      return { dueDate: dueDateStr, dueTime: dueTimeStr };
    }catch(_){ return null; }
  }

  function inferTaskTypeFromContext(A){
    try{
      const ns = (A && (A.nextSteps || A.next_steps)) || [];
      const arr = Array.isArray(ns) ? ns.map(x=>String(x).toLowerCase()) : [];
      if(arr.some(s=>/email|send (an )?email|follow(-|\s)?up email/.test(s))) return 'auto-email';
      if(arr.some(s=>/call|phone|ring/.test(s))) return 'phone-call';
      // Heuristic: if timeline mentions a time, prefer call
      return 'phone-call';
    }catch(_){ return 'phone-call'; }
  }

  async function createFollowupTaskFromTimeline(r, A){
    try {
      const timelineText = A && (A.timeline || A.nextSteps || A.next_steps);
      const asText = Array.isArray(timelineText) ? timelineText.join(' ') : String(timelineText||'');
      const parsed = parseTimelineToTask(asText || (r.transcript||''));
      if(!parsed) return;
      const type = inferTaskTypeFromContext(A);
      const contact = String(r.contactName||'');
      const account = String(r.company||'');
      const title = type==='phone-call' ? `Call ${contact||account||'contact'}` : `Email ${contact||account||'contact'}`;
      const notes = `Auto-created from call timeline for ${contact||account}.`;
      if (window.createTask) {
        await window.createTask({ title, type, priority: 'medium', contact, account, dueDate: parsed.dueDate, dueTime: parsed.dueTime, notes });
      } else if (window.Tasks && typeof window.Tasks.createTask === 'function'){
        await window.Tasks.createTask({ title, type, priority: 'medium', contact, account, dueDate: parsed.dueDate, dueTime: parsed.dueTime, notes });
      } else if (window.crm && window.crm.createTask){
        await window.crm.createTask({ title, type, priority: 'medium', contact, account, dueDate: parsed.dueDate, dueTime: parsed.dueTime, notes });
      } else if (window.openCreateTaskModal) {
        // As a fallback, write to local storage directly via tasks module if available
        try {
          if (window.dispatchEvent) {
            const evt = new CustomEvent('pc:auto-task', { detail: { title, type, contact, account, dueDate: parsed.dueDate, dueTime: parsed.dueTime, notes } });
            window.dispatchEvent(evt);
          }
        } catch(_){ }
      }
      try { window.ToastManager?.showSaveNotification && window.ToastManager.showSaveNotification('Follow-up task created'); } catch(_){ }
    } catch(_) {}
  }
