/**
 * Call Details Helper
 * 
 * Utility for fetching call details (transcript, AI insights) from the callDetails collection.
 * This keeps the main calls collection lightweight for list queries.
 */

(function() {
  'use strict';

  // In-memory cache for call details
  const detailsCache = new Map();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch call details for a specific call
   * @param {string} callId - The call ID
   * @returns {Promise<Object|null>} Call details or null if not found
   */
  async function fetchCallDetails(callId) {
    if (!callId) {
      console.warn('[CallDetailsHelper] No callId provided');
      return null;
    }

    // Check cache first
    const cached = detailsCache.get(callId);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      console.log('[CallDetailsHelper] Using cached details for', callId);
      return cached.data;
    }

    try {
      const db = window.firebaseDB || firebase.firestore();
      const doc = await db.collection('callDetails').doc(callId).get();

      if (!doc.exists) {
        console.log('[CallDetailsHelper] No details found for', callId);
        return null;
      }

      const data = doc.data();
      
      // Cache the result
      detailsCache.set(callId, {
        data: data,
        timestamp: Date.now()
      });

      console.log('[CallDetailsHelper] Fetched details for', callId);
      return data;
    } catch (error) {
      console.error('[CallDetailsHelper] Error fetching details:', error);
      return null;
    }
  }

  /**
   * Fetch call details for multiple calls
   * @param {string[]} callIds - Array of call IDs
   * @returns {Promise<Map<string, Object>>} Map of callId -> details
   */
  async function fetchMultipleCallDetails(callIds) {
    if (!Array.isArray(callIds) || callIds.length === 0) {
      return new Map();
    }

    const results = new Map();
    const toFetch = [];

    // Check cache first
    for (const callId of callIds) {
      const cached = detailsCache.get(callId);
      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        results.set(callId, cached.data);
      } else {
        toFetch.push(callId);
      }
    }

    if (toFetch.length === 0) {
      console.log('[CallDetailsHelper] All details from cache');
      return results;
    }

    try {
      const db = window.firebaseDB || firebase.firestore();
      
      // Firestore 'in' queries limited to 10 items
      const batchSize = 10;
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);
        const snapshot = await db.collection('callDetails')
          .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
          .get();

        snapshot.forEach(doc => {
          const data = doc.data();
          results.set(doc.id, data);
          
          // Cache it
          detailsCache.set(doc.id, {
            data: data,
            timestamp: Date.now()
          });
        });
      }

      console.log('[CallDetailsHelper] Fetched', results.size, 'details');
      return results;
    } catch (error) {
      console.error('[CallDetailsHelper] Error fetching multiple details:', error);
      return results;
    }
  }

  /**
   * Merge call metadata with details
   * @param {Object} call - Call metadata object
   * @param {Object} details - Call details object
   * @returns {Object} Merged call object
   */
  function mergeCallWithDetails(call, details) {
    if (!details) return call;

    return {
      ...call,
      transcript: details.transcript || call.transcript || '',
      formattedTranscript: details.formattedTranscript || call.formattedTranscript || '',
      aiInsights: details.aiInsights || call.aiInsights || null,
      conversationalIntelligence: details.conversationalIntelligence || call.conversationalIntelligence || null
    };
  }

  /**
   * Clear cache for specific call IDs
   * @param {string[]} callIds - Array of call IDs to invalidate
   */
  function invalidateCache(callIds) {
    if (!Array.isArray(callIds)) {
      callIds = [callIds];
    }

    callIds.forEach(id => {
      detailsCache.delete(id);
    });

    console.log('[CallDetailsHelper] Invalidated cache for', callIds.length, 'calls');
  }

  /**
   * Clear entire cache
   */
  function clearCache() {
    detailsCache.clear();
    console.log('[CallDetailsHelper] Cache cleared');
  }

  // Export public API
  window.CallDetailsHelper = {
    fetchCallDetails,
    fetchMultipleCallDetails,
    mergeCallWithDetails,
    invalidateCache,
    clearCache
  };
})();
