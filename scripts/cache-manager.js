// Power Choosers CRM - IndexedDB Cache Manager
// Provides fast local caching with 5-minute expiry and real-time updates

class CacheManager {
  constructor() {
    this.dbName = 'PowerChoosersCRM';
    this.dbVersion = 3; // Bumped for emails collection
    this.db = null;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.collections = ['contacts', 'accounts', 'calls', 'calls-raw', 'tasks', 'sequences', 'lists', 'deals', 'settings', 'badge-data', 'emails'];
    this.initPromise = null;
  }

  // Initialize IndexedDB
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[CacheManager] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[CacheManager] IndexedDB initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores for each collection
        this.collections.forEach(collection => {
          if (!db.objectStoreNames.contains(collection)) {
            db.createObjectStore(collection, { keyPath: 'id' });
          }
        });

        // Create metadata store for tracking timestamps
        if (!db.objectStoreNames.contains('_meta')) {
          db.createObjectStore('_meta', { keyPath: 'collection' });
        }

        console.log('[CacheManager] IndexedDB schema created');
      };
    });

    return this.initPromise;
  }

  // Check if cache data is fresh (less than 5 minutes old)
  async isFresh(collection) {
    try {
      await this.init();
      const tx = this.db.transaction(['_meta'], 'readonly');
      const store = tx.objectStore('_meta');
      const request = store.get(collection);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const meta = request.result;
          if (!meta || !meta.timestamp) {
            resolve(false);
            return;
          }

          const age = Date.now() - meta.timestamp;
          const fresh = age < this.cacheExpiry;
          console.log(`[CacheManager] Cache for ${collection}: ${fresh ? 'FRESH' : 'EXPIRED'} (${Math.round(age / 1000)}s old)`);
          resolve(fresh);
        };

        request.onerror = () => resolve(false);
      });
    } catch (error) {
      console.error('[CacheManager] Error checking freshness:', error);
      return false;
    }
  }

  // Get data from cache or Firestore
  async get(collection) {
    // Emergency fallback: bypass cache if disabled
    if (window.DISABLE_CACHE) {
      console.warn('[CacheManager] Cache disabled, fetching from Firestore');
      return this.fetchFromFirestore(collection);
    }

    try {
      await this.init();

      // Check if cache is fresh
      const fresh = await this.isFresh(collection);

      if (fresh) {
        // Return cached data
        const cached = await this.getFromCache(collection);
        if (cached && cached.length > 0) {
          console.log(`[CacheManager] ✓ Returning ${cached.length} ${collection} from cache`);
          return cached;
        }
      }

      // Cache miss or expired - fetch from Firestore
      console.log(`[CacheManager] Cache miss for ${collection}, fetching from Firestore...`);
      const data = await this.fetchFromFirestore(collection);
      
      // Store in cache
      await this.set(collection, data);
      
      return data;
    } catch (error) {
      console.error(`[CacheManager] Error getting ${collection}:`, error);
      // Fallback to Firestore on error
      return this.fetchFromFirestore(collection);
    }
  }

  // Fetch data from Firestore
  async fetchFromFirestore(collection) {
    if (!window.firebaseDB) {
      console.warn('[CacheManager] Firestore not initialized');
      return [];
    }

    try {
      // Special handling for settings (single document)
      if (collection === 'settings') {
        const doc = await window.firebaseDB.collection('settings').doc('user-settings').get();
        return doc.exists ? [{ id: 'user-settings', ...doc.data() }] : [];
      }

      // Use DataManager for ownership-aware queries if available
      if (collection === 'accounts' && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function' && window.currentUserRole) {
        try {
          const data = await window.DataManager.queryWithOwnership('accounts');
          console.log(`[CacheManager] Fetched ${data.length} ${collection} from Firestore (DataManager)`);
          return data;
        } catch (error) {
          console.error('[CacheManager] DataManager query failed, falling back:', error);
        }
      }

      // Standard Firestore query
      const snapshot = await window.firebaseDB.collection(collection).get();
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[CacheManager] Fetched ${data.length} ${collection} from Firestore`);
      return data;
    } catch (error) {
      console.error(`[CacheManager] Error fetching ${collection} from Firestore:`, error);
      return [];
    }
  }

  // Get data from IndexedDB cache
  async getFromCache(collection) {
    try {
      await this.init();
      const tx = this.db.transaction([collection], 'readonly');
      const store = tx.objectStore(collection);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error reading ${collection} from cache:`, error);
      return [];
    }
  }

  // Store data in cache with timestamp
  async set(collection, data) {
    try {
      await this.init();
      
      // Store data
      const dataTx = this.db.transaction([collection], 'readwrite');
      const dataStore = dataTx.objectStore(collection);
      
      // Clear existing data first
      dataStore.clear();
      
      // Add new data
      data.forEach(item => {
        if (item && item.id) {
          dataStore.put(item);
        }
      });

      await new Promise((resolve, reject) => {
        dataTx.oncomplete = () => resolve();
        dataTx.onerror = () => reject(dataTx.error);
      });

      // Update metadata timestamp
      const metaTx = this.db.transaction(['_meta'], 'readwrite');
      const metaStore = metaTx.objectStore('_meta');
      metaStore.put({ collection, timestamp: Date.now() });

      await new Promise((resolve, reject) => {
        metaTx.oncomplete = () => resolve();
        metaTx.onerror = () => reject(metaTx.error);
      });

      console.log(`[CacheManager] ✓ Cached ${data.length} ${collection} records`);
    } catch (error) {
      console.error(`[CacheManager] Error caching ${collection}:`, error);
    }
  }

  // Update a single record in cache (for real-time updates)
  async updateRecord(collection, id, changes) {
    if (!id || !changes) return;

    try {
      await this.init();
      const tx = this.db.transaction([collection], 'readwrite');
      const store = tx.objectStore(collection);
      
      // Get existing record
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result || { id };
        const updated = { ...existing, ...changes, updatedAt: changes.updatedAt || new Date() };
        
        // Update record
        store.put(updated);
        console.log(`[CacheManager] ✓ Updated ${collection}/${id} in cache`);
      };

      getRequest.onerror = () => {
        console.error(`[CacheManager] Error updating ${collection}/${id}:`, getRequest.error);
      };
    } catch (error) {
      console.error(`[CacheManager] Error updating record in cache:`, error);
    }
  }

  // Delete a record from cache
  async deleteRecord(collection, id) {
    if (!id) return;

    try {
      await this.init();
      const tx = this.db.transaction([collection], 'readwrite');
      const store = tx.objectStore(collection);
      store.delete(id);
      
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          console.log(`[CacheManager] ✓ Deleted ${collection}/${id} from cache`);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error deleting record from cache:`, error);
    }
  }

  // Invalidate cache for a specific collection (force refresh)
  async invalidate(collection) {
    try {
      await this.init();
      
      // Clear data
      const dataTx = this.db.transaction([collection], 'readwrite');
      const dataStore = dataTx.objectStore(collection);
      dataStore.clear();

      await new Promise((resolve, reject) => {
        dataTx.oncomplete = () => resolve();
        dataTx.onerror = () => reject(dataTx.error);
      });

      // Clear metadata
      const metaTx = this.db.transaction(['_meta'], 'readwrite');
      const metaStore = metaTx.objectStore('_meta');
      metaStore.delete(collection);

      await new Promise((resolve, reject) => {
        metaTx.oncomplete = () => resolve();
        metaTx.onerror = () => reject(metaTx.error);
      });

      console.log(`[CacheManager] ✓ Invalidated cache for ${collection}`);
    } catch (error) {
      console.error(`[CacheManager] Error invalidating ${collection}:`, error);
    }
  }

  // Invalidate all caches
  async invalidateAll() {
    console.log('[CacheManager] Invalidating all caches...');
    for (const collection of this.collections) {
      await this.invalidate(collection);
    }
    console.log('[CacheManager] ✓ All caches invalidated');
  }

  // Get cache statistics
  async getStats() {
    try {
      await this.init();
      const stats = {};

      for (const collection of this.collections) {
        const data = await this.getFromCache(collection);
        const meta = await this.getMeta(collection);
        stats[collection] = {
          count: data.length,
          timestamp: meta?.timestamp || null,
          age: meta?.timestamp ? Math.round((Date.now() - meta.timestamp) / 1000) : null,
          fresh: await this.isFresh(collection)
        };
      }

      return stats;
    } catch (error) {
      console.error('[CacheManager] Error getting stats:', error);
      return {};
    }
  }

  // Get metadata for a collection
  async getMeta(collection) {
    try {
      await this.init();
      const tx = this.db.transaction(['_meta'], 'readonly');
      const store = tx.objectStore('_meta');
      const request = store.get(collection);

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      return null;
    }
  }
}

// Initialize global cache manager
if (typeof window !== 'undefined') {
  window.CacheManager = new CacheManager();
  console.log('[CacheManager] Global cache manager initialized');

  // Debug helper: view cache stats
  window.getCacheStats = async () => {
    const stats = await window.CacheManager.getStats();
    console.table(stats);
    return stats;
  };
}

