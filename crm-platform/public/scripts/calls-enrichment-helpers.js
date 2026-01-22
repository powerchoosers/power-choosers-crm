/**
 * Calls Enrichment Helpers
 * 
 * Reusable helper functions for enriching call data with contact and account information.
 * Used by both BackgroundCallsLoader and calls.js to avoid code duplication.
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Uses only cached/in-memory data (zero Firebase queries)
 * - Eliminates expensive enrichment delays on page load
 * - Enables instant display of pre-enriched call data
 */

(function() {
  'use strict';

  // Normalize phone number to last 10 digits
  function normPhone(s) { 
    return (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10); 
  }

  // Check if address is a client address
  function isClientAddr(s) { 
    return typeof s === 'string' && s.startsWith('client:'); 
  }

  // Pick the most relevant counterparty phone number from call data
  function pickCounterparty(c) {
    const toRaw = c.to || '';
    const fromRaw = c.from || '';
    const to = normPhone(toRaw);
    const from = normPhone(fromRaw);
    const bizList = Array.isArray(window.CRM_BUSINESS_NUMBERS) ? 
      window.CRM_BUSINESS_NUMBERS.map(normPhone).filter(Boolean) : [];
    const isBiz = (p) => bizList.includes(p);
    
    // Prefer the non-client side
    if (isClientAddr(toRaw) && !isClientAddr(fromRaw)) return from;
    if (isClientAddr(fromRaw) && !isClientAddr(toRaw)) return to;
    
    // Prefer the non-business side if we know business numbers
    if (bizList.length) {
      if (isBiz(to) && !isBiz(from)) return from;
      if (isBiz(from) && !isBiz(to)) return to;
    }
    
    // Fallbacks: prefer the 'to' number if it's a real phone, else 'from'
    if (to) return to;
    if (from) return from;
    return '';
  }

  // Lookup contact by ID from in-memory data
  function getContactById(id) {
    try {
      if (!id || typeof window.getPeopleData !== 'function') return null;
      const people = window.getPeopleData() || [];
      return people.find(p => p && (p.id === id));
    } catch (_) { 
      return null; 
    }
  }

  // Lookup account by ID from in-memory data
  function getAccountById(id) {
    try {
      if (!id || typeof window.getAccountsData !== 'function') return null;
      const accounts = window.getAccountsData() || [];
      return accounts.find(a => a && (a.id === id));
    } catch (_) { 
      return null; 
    }
  }

  // Find account by phone using cached accounts data only (no Firebase fallback)
  function findAccountByPhone(phone10) {
    try {
      if (typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const hit = accounts.find(a => 
          normPhone(a.companyPhone || a.phone || a.primaryPhone || a.mainPhone) === phone10
        );
        if (hit) {
          console.log('[CallsEnrichment] Found account for phone:', {
            phone: phone10,
            accountId: hit.id,
            accountName: hit.accountName || hit.name
          });
          return hit;
        }
      }
      
      // No Firebase fallback - return null if not found in cache
      console.log('[CallsEnrichment] No account found for phone:', phone10);
      return null;
    } catch (_) { 
      return null; 
    }
  }

  // Build phone-to-contact mapping from cached contacts data
  let _phoneToContactCache = null;
  async function buildPhoneToContactMap() {
    if (_phoneToContactCache) return _phoneToContactCache;
    
    try {
      let people = [];
      
      // 1) Try in-memory dataset first (fastest)
      if (typeof window.getPeopleData === 'function') {
        people = window.getPeopleData() || [];
      }
      
      // 2) Fallback to BackgroundContactsLoader (still fast, loads from cache)
      if (!people.length && window.BackgroundContactsLoader && 
          typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        people = window.BackgroundContactsLoader.getContactsData() || [];
        console.log('[CallsEnrichment] Using BackgroundContactsLoader for phone mapping:', people.length, 'contacts');
      }
      
      // 3) Last resort: CacheManager direct access (still zero Firebase queries)
      if (!people.length && window.CacheManager && typeof window.CacheManager.get === 'function') {
        try {
          people = await window.CacheManager.get('contacts') || [];
          console.log('[CallsEnrichment] Using CacheManager for phone mapping:', people.length, 'contacts');
        } catch (_) { /* ignore */ }
      }
      
      // Build the map from the contacts data (no Firebase queries needed!)
      if (people.length > 0) {
        const map = new Map();
        const norm = (p) => (p || '').toString().replace(/\D/g, '').slice(-10);
        
        for (const c of people) {
          const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || (c.name || '');
          const title = c.title || '';
          const company = c.companyName || c.accountName || '';
          const phones = [c.workDirectPhone, c.mobile, c.otherPhone, c.phone].map(norm).filter(Boolean);
          for (const ph of phones) {
            if (ph && !map.has(ph)) {
              map.set(ph, { id: c.id, name, title, company });
            }
          }
        }
        
        console.log('[CallsEnrichment] ✓ Built phone map with', map.size, 'entries (zero Firebase queries)');
        _phoneToContactCache = map;
        return map;
      }
      
      // If no data available, return empty map (avoid Firestore fallback)
      console.warn('[CallsEnrichment] No contacts data available for phone mapping - enrichment will be limited');
      _phoneToContactCache = new Map();
      return _phoneToContactCache;
    } catch (e) {
      console.error('[CallsEnrichment] Error building phone map:', e);
    }
    return new Map();
  }

  // Choose most recently active contact in an account (best-effort)
  function pickRecentContactForAccount(accountId) {
    try {
      if (typeof window.getPeopleData !== 'function') return null;
      const people = window.getPeopleData() || [];
      const list = people.filter(p => p && (p.accountId === accountId || p.accountID === accountId));
      if (!list.length) return null;
      
      // Compute recency based on common fields if available
      const scoreTime = (p) => {
        const cand = [p.lastActivityAt, p.lastContactedAt, p.notesUpdatedAt, p.updatedAt, p.createdAt].map(v => {
          try {
            if (!v) return 0;
            if (typeof v.toDate === 'function') return v.toDate().getTime();
            const d = new Date(v);
            const t = d.getTime();
            return isNaN(t) ? 0 : t;
          } catch (_) { 
            return 0; 
          }
        });
        return Math.max(0, ...cand);
      };
      
      let best = null, bestT = -1;
      for (const p of list) {
        const t = scoreTime(p);
        if (t > bestT) {
          bestT = t;
          best = p;
        }
      }
      return best || null;
    } catch (_) { 
      return null; 
    }
  }

  // Clear the phone-to-contact cache (useful for testing or when data changes)
  function clearPhoneToContactCache() {
    _phoneToContactCache = null;
  }

  // Export all helper functions to global scope
  window.CallsEnrichmentHelpers = {
    normPhone,
    isClientAddr,
    pickCounterparty,
    getContactById,
    getAccountById,
    findAccountByPhone,
    buildPhoneToContactMap,
    pickRecentContactForAccount,
    clearPhoneToContactCache
  };
})();

