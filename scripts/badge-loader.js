// Power Choosers CRM - Badge Data Loader
// Lightweight loader for "No Calls" badges on People and Accounts pages
// Only fetches minimal fields needed for badge logic, dramatically faster than loading full calls

class BadgeLoader {
  constructor() {
    this.cacheKey = 'badge-data';
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load minimal badge data (contactId, accountId, counterparty only)
   * Uses CacheManager for performance, falls back to Firestore if needed
   */
  async loadBadgeData() {
    try {
      // Try cache first (instant)
      if (window.CacheManager && typeof window.CacheManager.get === 'function') {
        const cached = await window.CacheManager.get(this.cacheKey);
        if (cached && cached.length > 0) {
          console.log('[BadgeLoader] Using cached badge data:', cached.length, 'records');
          return cached;
        }
      }

      console.log('[BadgeLoader] Cache miss, fetching from Firestore...');

      // Fetch minimal fields from Firestore
      if (!window.firebaseDB) {
        console.warn('[BadgeLoader] Firestore not initialized');
        return [];
      }

      // Query calls with only the fields we need for badges
      // This is 10x faster than loading full call records with transcripts/AI data
      const snapshot = await window.firebaseDB.collection('calls')
        .select('contactId', 'accountId', 'counterparty', 'to', 'from', 'targetPhone')
        .get();

      const badgeData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          contactId: data.contactId || null,
          accountId: data.accountId || null,
          counterparty: data.counterparty || this.extractCounterparty(data),
          // Keep phone fields for fallback counterparty extraction
          to: data.to || '',
          from: data.from || ''
        };
      });

      console.log('[BadgeLoader] Fetched', badgeData.length, 'badge records from Firestore');

      // Cache for future requests
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set(this.cacheKey, badgeData);
      }

      return badgeData;
    } catch (error) {
      console.error('[BadgeLoader] Error loading badge data:', error);
      
      // Fallback to full calls data if available
      if (window.callsModule && typeof window.callsModule.getCallsData === 'function') {
        console.log('[BadgeLoader] Falling back to full calls data');
        return window.callsModule.getCallsData() || [];
      }
      
      return [];
    }
  }

  /**
   * Extract counterparty phone from to/from fields
   * Simplified version of the logic in calls.js
   */
  extractCounterparty(call) {
    const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
    const to10 = norm(call.to);
    const from10 = norm(call.from);
    
    // Simple heuristic: prefer the non-business number
    // If we have business numbers configured, use them
    if (window.CRM_BUSINESS_NUMBERS && Array.isArray(window.CRM_BUSINESS_NUMBERS)) {
      const bizList = window.CRM_BUSINESS_NUMBERS.map(norm).filter(Boolean);
      const isBiz = (p) => bizList.includes(p);
      
      if (isBiz(to10) && !isBiz(from10)) return from10;
      if (isBiz(from10) && !isBiz(to10)) return to10;
    }
    
    // Fallback: prefer 'to' field
    return to10 || from10 || '';
  }

  /**
   * Invalidate badge data cache (call this when new calls arrive)
   */
  async invalidate() {
    if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
      await window.CacheManager.invalidate(this.cacheKey);
      console.log('[BadgeLoader] Badge data cache invalidated');
    }
  }
}

// Initialize global badge loader
if (typeof window !== 'undefined') {
  window.BadgeLoader = new BadgeLoader();
  console.log('[BadgeLoader] Global badge loader initialized');
}

