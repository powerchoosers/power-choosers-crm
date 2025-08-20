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

  // Helpers to recognize when we truly have an associated contact
  function normalizePhone(p) {
    return (p || '').replace(/[^0-9]/g, '');
  }
  function looksLikePhone(s) {
    const d = normalizePhone(s);
    return d.length >= 7; // treat as phone if mostly digits
  }
  function computeIsRecognizedContact(c) {
    const name = (c.contactName || '').trim();
    const phone = (c.contactPhone || c.to || '').trim();
    // Recognized if backend provided an identifier or a type, or a non-phone-like name
    if (c.contactId || c.contactType) return true;
    if (!name) return false;
    // If name equals phone after normalization, it's not a real name
    if (normalizePhone(name) && normalizePhone(name) === normalizePhone(phone)) return false;
    // If the name doesn't look like a phone, assume it's a real contact name
    return !looksLikePhone(name);
  }
  function pick(...vals) {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (s !== '') return v;
    }
    return '';
  }

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

      /* Company link styling (match People page hover behavior) */
      #calls-page a.company-link { color: var(--text-inverse); text-decoration: none; }
      #calls-page a.company-link:hover { color: #ffffff; text-decoration: none; }
      #calls-page .company-cell__wrap { display: inline-flex; align-items: center; gap: 6px; }
      #calls-page img.company-favicon { width: 16px; height: 16px; border-radius: 3px; }

      /* Click-to-call number styling */
      #calls-page .phone-click { color: var(--text-secondary); cursor: pointer; }
      #calls-page .phone-click:hover { color: var(--text-inverse); }
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

  // Enrich rows missing contact info using any local contacts cache
  async function enrichUnknowns() {
    try {
      const cacheRaw = localStorage.getItem('crm_contacts') || localStorage.getItem('contacts_cache') || localStorage.getItem('contacts');
      if (!cacheRaw) return;
      const contacts = JSON.parse(cacheRaw);
      if (!Array.isArray(contacts) || contacts.length === 0) return;
      const index = new Map();
      const addIdx = (p, c) => { const k = normalizePhone(p); if (k) index.set(k, c); };
      for (const c of contacts) {
        const entry = {
          name: c.name || c.fullName || c.contactName || '',
          company: c.company || c.companyName || '',
          id: c.id || c.contactId || '',
          type: c.type || c.contactType || 'contact'
        };
        const phones = [];
        if (c.phone) phones.push(c.phone);
        if (c.phoneNumber) phones.push(c.phoneNumber);
        if (Array.isArray(c.phones)) phones.push(...c.phones);
        if (Array.isArray(c.phoneNumbers)) phones.push(...c.phoneNumbers);
        if (!phones.length && c.primaryPhone) phones.push(c.primaryPhone);
        phones.forEach(p => addIdx(p, entry));
      }
      let enriched = 0;
      for (const r of state.data) {
        if (!r || !r.contactPhone || computeIsRecognizedContact(r)) continue;
        const hit = index.get(normalizePhone(r.contactPhone));
        if (hit && hit.name) {
          r.contactName = hit.name;
          r.company = r.company || hit.company || '';
          r.contactId = r.contactId || hit.id || '';
          r.contactType = r.contactType || hit.type || 'contact';
          r.isRecognizedContact = computeIsRecognizedContact(r);
          enriched++;
        }
      }
      if (enriched) {
        console.debug(`[Calls] Enriched ${enriched} calls from local contacts cache`);
      }
    } catch (e) {
      console.warn('[Calls] Enrich failed:', e);
    }
  }

  async function loadData() {
    // 1) Try to load real calls from backend if API_BASE_URL is set
    try {
      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (base) {
        const r = await fetch(`${base}/api/calls`, { method: 'GET' });
        const j = await r.json().catch(()=>( {}));
        const arr = Array.isArray(j) ? j : (Array.isArray(j.calls) ? j.calls : (Array.isArray(j.data) ? j.data : []));
        if (r.ok && Array.isArray(arr)) {
          const rows = arr.map((c, idx) => {
            const row = {
              id: pick(c.id, c.callId, `call_${Date.now()}_${idx}`),
              contactName: pick(c.contactName, c.contact_name, c.name, ''),
              contactTitle: pick(c.contactTitle, c.title, ''),
              company: pick(c.contactCompany, c.company, c.companyName, ''),
              contactEmail: pick(c.contactEmail, c.email, ''),
              contactPhone: pick(c.contactPhone, c.to, c.phone, ''),
              contactCity: '',
              contactState: '',
              accountEmployees: null,
              industry: '',
              visitorDomain: '',
              callTime: pick(c.callTime, c.timestamp, new Date().toISOString()),
              durationSec: pick(c.durationSec, c.duration, 0),
              outcome: pick(c.outcome, c.status, ''),
              transcript: c.transcript || '',
              aiSummary: c.aiSummary || '',
              aiInsights: c.aiInsights || null,
              audioUrl: c.audioUrl ? `${base}/api/recording?url=${encodeURIComponent(c.audioUrl)}` : '',
              // Add contact metadata for better display
              contactId: pick(c.contactId, c.contact_id, ''),
              contactType: pick(c.contactType, c.contact_type, ''),
              companyDomain: pick(c.companyDomain, c.domain, ''),
              website: pick(c.website, c.companyWebsite, '')
            };
            row.isRecognizedContact = computeIsRecognizedContact(row);
            return row;
          });
          // Always use API data, even if empty
          if (rows.length) {
            console.debug('[Calls] Loaded from API:', rows.slice(0, 3).map(r => ({ contactName: r.contactName, contactId: r.contactId, contactType: r.contactType, contactPhone: r.contactPhone })));
          }
          state.data = rows; state.filtered = rows.slice(); chips.forEach(buildPool); await enrichUnknowns(); render();
          return;
        }
      }
    } catch (_) { /* fall back to local storage or demo data */ }

    // 2) Try localStorage backup
    try {
      const localCalls = JSON.parse(localStorage.getItem('crm_calls') || '[]');
      if (localCalls.length > 0) {
        console.log(`[Calls] Found ${localCalls.length} local backup calls`);
        const rows = localCalls.map((c, idx) => {
          const row = {
            id: pick(c.callSid, c.id, `local_call_${Date.now()}_${idx}`),
            contactName: pick(c.contactName, c.contact_name, c.name, ''),
            contactTitle: pick(c.contactTitle, c.title, ''),
            company: pick(c.contactCompany, c.company, c.companyName, ''),
            contactEmail: pick(c.contactEmail, c.email, ''),
            contactPhone: pick(c.contactPhone, c.to, c.phone, ''),
            contactCity: '',
            contactState: '',
            accountEmployees: null,
            industry: '',
            visitorDomain: '',
            callTime: pick(c.callTime, c.timestamp, new Date().toISOString()),
            durationSec: pick(c.durationSec, c.duration, 0),
            outcome: (() => { const s = (pick(c.outcome, c.status, '')||'').toLowerCase(); if (s==='completed') return 'Connected'; if (s==='failed') return 'Failed'; if (s==='busy') return 'Busy'; if (s==='no-answer' || s==='no_answer') return 'No Answer'; return s || 'Connected'; })(),
            transcript: c.transcript || '',
            aiSummary: c.aiSummary || '',
            aiInsights: c.aiInsights || null,
            audioUrl: '',
            // Add contact metadata for better display
            contactId: pick(c.contactId, c.contact_id, ''),
            contactType: pick(c.contactType, c.contact_type, '')
          };
          row.isRecognizedContact = computeIsRecognizedContact(row);
          return row;
        });
        if (rows.length) {
          console.debug('[Calls] Loaded from local backup:', rows.slice(0, 3).map(r => ({ contactName: r.contactName, contactId: r.contactId, contactType: r.contactType, contactPhone: r.contactPhone })));
        }
        state.data = rows; state.filtered = rows.slice(); chips.forEach(buildPool); await enrichUnknowns(); render();
        return;
      }
    } catch (localError) {
      console.warn('[Calls] Failed to load local backup calls:', localError);
    }

    // 3) Final fallback: demo data
    const cos = ['Acme Manufacturing','Metro Industries','Johnson Electric','Downtown Office','Northwind Traders'];
    const cities = ['Austin','Dallas','Houston','San Antonio','Fort Worth'];
    const states = ['TX','TX','TX','TX','TX'];
    const titles = ['Operations Manager','Facilities Director','Procurement Lead','Energy Analyst','CFO'];
    const industries = ['Industrial','Commercial','Electrical','Real Estate','Trading'];
    const rows = [];
    for (let i=1;i<=60;i++){ const j=i%cos.length; const dur=60+Math.floor(Math.random()*900); rows.push({ id:'call_'+i, contactName:`Contact ${i}`, contactTitle:titles[j], company:cos[j], contactEmail:`c${i}@ex.com`, contactPhone:Math.random()>0.5?`512-555-${(1000+i).toString().slice(-4)}`:'', contactCity:cities[j], contactState:states[j], accountEmployees:[10,50,120,400,900][j], industry:industries[j], visitorDomain:'', callTime:new Date(Date.now()-i*3600*1000).toISOString(), durationSec:dur, outcome:['Connected','Voicemail','No Answer'][i%3], transcript:`Transcript for call ${i} with ${cos[j]}...`, aiSummary:`AI summary for call ${i}...`, audioUrl:'' }); }
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
  function paginate(){ if(!els.pag) return; const total=state.filtered.length; const pages=Math.max(1,Math.ceil(total/state.pageSize)); state.currentPage=Math.min(state.currentPage,pages); if(els.summary){ const st=total===0?0:(state.currentPage-1)*state.pageSize+1; const en=Math.min(state.currentPage*state.pageSize,total); els.summary.textContent=`${st}-${en} of ${total}`; } let html=''; const btn=(l,d,p)=>`<button class="page-btn" ${d?'disabled':''} data-page="${p}">${l}</button>`; html+=btn('Prev',state.currentPage===1,state.currentPage-1); for(let p=1;p<=pages;p++){ html+=`<button class="page-btn ${p===state.currentPage?'active':''}" data-page="${p}">${p}</button>`;} html+=btn('Next',state.currentPage===pages,state.currentPage+1); els.pag.innerHTML=html; els.pag.querySelectorAll('.page-btn').forEach(b=>b.addEventListener('click',()=>{ const n=parseInt(b.getAttribute('data-page')||'1',10); if(!isNaN(n)&&n>=1&&n<=pages){ state.currentPage=n; render(); }})); }

  function render(){ if(!els.tbody) return; const rows=getPageItems(); els.tbody.innerHTML= rows.map(r=>rowHtml(r)).join('');
    // row events
    els.tbody.querySelectorAll('input.row-select').forEach(cb=>cb.addEventListener('change',()=>{ const id=cb.getAttribute('data-id'); if(cb.checked) state.selected.add(id); else state.selected.delete(id); updateBulkBar(); }));
    els.tbody.querySelectorAll('button.insights-btn').forEach(btn=>btn.addEventListener('click',()=>openInsightsModal(btn.getAttribute('data-id'))));
    // click-to-call on number under contact name
    els.tbody.querySelectorAll('.phone-click').forEach(el=> el.addEventListener('click', () => {
      const num = el.getAttribute('data-number') || '';
      const name = el.getAttribute('data-name') || '';
      try { if (window.Widgets && typeof window.Widgets.callNumber === 'function') { window.Widgets.callNumber(num, name); return; } } catch(_) {}
      // Fallback to tel: link
      const a = document.createElement('a'); a.href = 'tel:' + num; a.style.display='none'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }));
    // header select state
    if(els.selectAll){ const pageIds=new Set(rows.map(r=>r.id)); const allSelected=[...pageIds].every(id=>state.selected.has(id)); els.selectAll.checked = allSelected && rows.length>0; }
    paginate(); updateBulkBar(); }

  function rowHtml(r){
    const dur = `${Math.floor(r.durationSec/60)}m ${r.durationSec%60}s`;
    const id = escapeHtml(r.id);
    
    // Determine what to display in the contact column
    let displayName = '';
    let displaySubtext = '';
    
    if (computeIsRecognizedContact(r) && r.contactName) {
      // Show contact name with phone number as subtext
      displayName = escapeHtml(r.contactName);
      displaySubtext = `\n      <div class="phone-click" data-number="${escapeHtml(r.contactPhone || r.to || '')}" data-name="${escapeHtml(r.contactName || '')}" style="font-size: 0.8em; margin-top: 2px;">${escapeHtml(r.contactPhone || '')}</div>`;
    } else {
      // Show phone number only (unrecognized contact)
      displayName = escapeHtml(r.contactPhone || r.to || '');
      displaySubtext = '';
    }
    
    const name = displayName;
    const nameWithSubtext = displayName + displaySubtext;
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
    
    return `
    <tr>
      <td class="col-select"><input type="checkbox" class="row-select" data-id="${id}" ${state.selected.has(r.id)?'checked':''}></td>
      <td>${nameWithSubtext}</td>
      <td>${title}</td>
      <td>${(function(){
        const domain = (r.companyDomain || (r.website||'').replace(/^https?:\/\//,'').split('/')[0] || '').trim();
        const fav = domain ? `<img class="company-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${escapeHtml(domain)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : '';
        return company ? `<a href="#account-details" class="company-link" data-company="${company}" data-domain="${escapeHtml(domain)}"><span class="company-cell__wrap">${fav}<span class="company-name">${company}</span></span></a>` : '';
      })()}</td>
      <td>${callTimeStr}</td>
      <td>${dur}</td>
      <td><span class="outcome-badge outcome-${outcome.toLowerCase().replace(' ', '-')}">${outcome}</span></td>
      <td class="qa-cell"><div class="qa-actions">
        <button type="button" class="qa-btn insights-btn" data-id="${id}" aria-label="View insights" title="View AI insights">${svgIcon('insights')}</button>
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
      .pc-insights-modal{position:fixed;inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1000px,92vw);max-height:86vh;overflow:auto;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-light);border-radius:12px;box-shadow:var(--elevation-card);z-index:1210}
      .pc-insights-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-light)}
      .pc-insights-title{font-weight:700}
      .pc-insights-body{padding:16px}
      .pc-insights-close{background:transparent;border:1px solid var(--border-light);border-radius:8px;color:var(--text-secondary);height:30px;padding:0 10px}
      .pc-insights-close:hover{background:var(--bg-item);}
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
    const r = (state.filtered||[]).find(x=>x.id===id) || (state.data||[]).find(x=>x.id===id); if(!r) return;
    const bd=document.createElement('div'); bd.className='pc-insights-backdrop'; bd.addEventListener('click', closeInsightsModal);
    const md=document.createElement('div'); md.className='pc-insights-modal';
    md.innerHTML = `
      <div class="pc-insights-header">
        <div class="pc-insights-title">Call insights for ${escapeHtml(r.contactName || r.to || '')}</div>
        <button type="button" class="pc-insights-close" aria-label="Close">Close</button>
      </div>
      <div class="pc-insights-body">${insightsContentHtml(r)}</div>
    `;
    document.body.appendChild(bd); document.body.appendChild(md);
    md.querySelector('.pc-insights-close').addEventListener('click', closeInsightsModal);
    document.addEventListener('keydown', escClose);
  }
  function insightsContentHtml(r){
    const aiInsights = r.aiInsights || {}; const sentiment = aiInsights.sentiment || 'Unknown';
    const keyTopics = (aiInsights.keyTopics || []).join(', ');
    const nextSteps = (aiInsights.nextSteps || []).join(', ');
    const painPoints = (aiInsights.painPoints || []).join(', ');
    const budget = aiInsights.budget || 'Not discussed';
    const timeline = aiInsights.timeline || 'Not specified';
    return `
      <div class="insights-container" style="background:var(--bg-item); border-radius:var(--border-radius); padding:20px;">
        <div style="display:flex; gap:25px;">
          <div style="flex:2;">
            <div class="insights-section">
              <h4 style="color:var(--text-primary); margin:0 0 8px; font-size:14px; font-weight:600;">📋 AI Call Summary</h4>
              <div style="color:var(--text-secondary); margin-bottom:15px; line-height:1.4;">${escapeHtml(r.aiSummary || 'No summary available')}</div>
            </div>
            <div class="insights-section">
              <h4 style="color:var(--text-primary); margin:0 0 8px; font-size:14px; font-weight:600;">💬 Call Transcript</h4>
              <div style="color:var(--text-secondary); max-height:300px; overflow-y:auto; border:1px solid var(--border-light); padding:12px; border-radius:6px; background:var(--bg-card); font-family:monospace; font-size:13px; line-height:1.3;">${escapeHtml(r.transcript || 'Transcript not available')}</div>
            </div>
          </div>
          <div style="flex:1;">
            <div class="insights-section">
              <h4 style="color:var(--text-primary); margin:0 0 8px; font-size:14px; font-weight:600;">🎵 Call Recording</h4>
              <div style="color:var(--text-secondary); font-style:italic;">${r.audioUrl ? `<audio controls style="width:100%; margin-top:8px;"><source src="${r.audioUrl}" type="audio/mpeg">Your browser does not support audio playback.</audio>` : 'No recording available'}</div>
              ${r.audioUrl ? '' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Recording may take 1-2 minutes to process after call completion</div>'}
            </div>
            <div class="insights-grid" style="display:grid; gap:10px;">
              <div class="insight-item"><span style="font-weight:600; color:var(--text-primary); font-size:12px;">😊 Sentiment:</span><span style="color:var(--text-secondary); font-size:12px;"> ${sentiment}</span></div>
              <div class="insight-item"><span style="font-weight:600; color:var(--text-primary); font-size:12px;">🏷️ Key Topics:</span><span style="color:var(--text-secondary); font-size:12px;"> ${keyTopics || 'None identified'}</span></div>
              <div class="insight-item"><span style="font-weight:600; color:var(--text-primary); font-size:12px;">⏭️ Next Steps:</span><span style="color:var(--text-secondary); font-size:12px;"> ${nextSteps || 'None identified'}</span></div>
              <div class="insight-item"><span style="font-weight:600; color:var(--text-primary); font-size:12px;">⚠️ Pain Points:</span><span style="color:var(--text-secondary); font-size:12px;"> ${painPoints || 'None mentioned'}</span></div>
              <div class="insight-item"><span style="font-weight:600; color:var(--text-primary); font-size:12px;">💰 Budget:</span><span style="color:var(--text-secondary); font-size:12px;"> ${budget}</span></div>
              <div class="insight-item"><span style="font-weight:600; color:var(--text-primary); font-size:12px;">⏰ Timeline:</span><span style="color:var(--text-secondary); font-size:12px;"> ${timeline}</span></div>
            </div>
          </div>
        </div>
      </div>`;
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
    container.querySelector('#bulk-delete').addEventListener('click', () => console.log('Bulk delete', Array.from(state.selected)));
  }

  function init(){ if(!initDomRefs()) return; attachEvents(); injectCallsBulkStyles(); loadData(); }
  
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
  
  // Expose loadData and controls for external use
  window.callsModule = { 
    loadData, 
    startAutoRefresh, 
    stopAutoRefresh
  };
  
  document.addEventListener('DOMContentLoaded', init);
})();
