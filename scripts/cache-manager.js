// Power Choosers CRM - IndexedDB Cache Manager
// Provides fast local caching with 5-minute expiry and real-time updates

class CacheManager {
  constructor() {
    this.dbName = 'PowerChoosersCRM';
    this.dbVersion = 4; // Bumped for tasks, sequences, lists collections
    this.db = null;
    // INCREASED CACHE EXPIRY: 4-8 hours instead of 45 minutes for better performance
    this.cacheExpiry = 8 * 60 * 60 * 1000; // 8 hours in milliseconds (default for most collections)
    this.tasksCacheExpiry = 8 * 60 * 60 * 1000; // 8 hours for tasks (budget-friendly)
    this.emailsCacheExpiry = 4 * 60 * 60 * 1000; // 4 hours for emails (moderate volatility)
    this.collections = ['contacts', 'accounts', 'calls', 'calls-raw', 'tasks', 'sequences', 'lists', 'deals', 'settings', 'badge-data', 'emails', 'agents', 'agent_activities'];
    // List members change relatively often, but we also have explicit invalidation events
    // (bulk import complete, remove from list, etc). Increase to reduce Firestore reads/cost.
    this.listMembersExpiry = 60 * 60 * 1000; // 60 minutes for list members
    this.initPromise = null;

    // REQUEST DEDUPLICATION: Prevent multiple simultaneous fetches for same collection
    this.activeRequests = new Map(); // collection -> Promise

    // DEBUGGING: Track cache performance
    this.requestStats = new Map(); // collection -> {hits: 0, misses: 0, duplicates: 0}
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
      };
    });

    return this.initPromise;
  }

  // Cache list members by list ID
  async cacheListMembers(listId, peopleIds, accountIds) {
    const cacheKey = `list-members-${listId}`;
    const data = [{
      id: listId,
      people: Array.from(peopleIds || []),
      accounts: Array.from(accountIds || []),
      timestamp: Date.now()
    }];

    try {
      await this.init();
      const tx = this.db.transaction(['lists'], 'readwrite');
      const store = tx.objectStore('lists');

      // Store with special key format
      store.put({ id: cacheKey, ...data[0] });

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error caching list members:`, error);
    }
  }

  // Get cached list members
  async getCachedListMembers(listId) {
    try {
      await this.init();
      const cacheKey = `list-members-${listId}`;
      const tx = this.db.transaction(['lists'], 'readonly');
      const store = tx.objectStore('lists');
      const request = store.get(cacheKey);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const cached = request.result;
          if (!cached || !cached.timestamp) {
            resolve(null);
            return;
          }

          const age = Date.now() - cached.timestamp;
          const fresh = age < this.listMembersExpiry;
  
          if (fresh) {
            resolve({
              people: new Set(cached.people || []),
              accounts: new Set(cached.accounts || [])
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error('[CacheManager] Error getting cached list members:', error);
      return null;
    }
  }

  // Invalidate list members cache for a specific list
  async invalidateListCache(listId) {
    try {
      await this.init();
      const cacheKey = `list-members-${listId}`;
      const tx = this.db.transaction(['lists'], 'readwrite');
      const store = tx.objectStore('lists');

      // Delete the cached data
      store.delete(cacheKey);

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error invalidating list cache:`, error);
    }
  }

  // UPDATED FRESHNESS CHECK WITH COLLECTION-SPECIFIC EXPIRY
  async isFresh(collection) {
    try {
      await this.init();

      // Check if database is still open
      if (!this.db || this.db.version === 0) {
        console.warn(`[CacheManager] Database not available for freshness check on ${collection}`);
        return false;
      }

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

          // Use collection-specific expiry
          let expiry;
          if (collection === 'tasks') {
            expiry = this.tasksCacheExpiry;
          } else if (collection === 'emails') {
            expiry = this.emailsCacheExpiry;
          } else {
            expiry = this.cacheExpiry;
          }

          const age = Date.now() - meta.timestamp;
          const fresh = age < expiry;
          resolve(fresh);
        };

        request.onerror = () => resolve(false);
      });
    } catch (error) {
      console.error('[CacheManager] Error checking freshness:', error);
      return false;
    }
  }

  // OPTIMIZED GET WITH DEDUPLICATION AND DEBUGGING
  async get(collection) {
    // Emergency fallback: bypass cache if disabled
    if (window.DISABLE_CACHE) {
      console.warn('[CacheManager] Cache disabled, fetching from Firestore');
      return this.fetchFromFirestore(collection);
    }

    // REQUEST DEDUPLICATION: If another request for this collection is in flight, wait for it
    if (this.activeRequests.has(collection)) {
      this._incrementStat(collection, 'duplicates');
      return this.activeRequests.get(collection);
    }

    // Create and track the request
    const requestPromise = this._performGet(collection);
    this.activeRequests.set(collection, requestPromise);

    try {
      return await requestPromise;
    } finally {
      // Always clean up, even on error
      this.activeRequests.delete(collection);
    }
  }

  // Internal get implementation
  async _performGet(collection) {
    try {
      await this.init();

      // Check if cache is fresh
      const fresh = await this.isFresh(collection);

      if (fresh) {
        // Return cached data
        const cached = await this.getFromCache(collection);
        if (cached && cached.length > 0) {
          this._incrementStat(collection, 'hits');
          return cached;
        }
      }
      // Cache miss or expired - fetch from Firestore
      this._incrementStat(collection, 'misses');
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

  // Helper to track statistics
  _incrementStat(collection, type) {
    if (!this.requestStats.has(collection)) {
      this.requestStats.set(collection, { hits: 0, misses: 0, duplicates: 0 });
    }
    const stats = this.requestStats.get(collection);
    stats[type]++;
  }

  // Fetch data from Firestore
  async fetchFromFirestore(collection) {
    const startTime = performance.now();

    if (!window.firebaseDB) {
      console.warn('[CacheManager] Firestore not initialized');
      return [];
    }

    try {
      // Special handling for settings (per-user documents)
      if (collection === 'settings') {
        try {
          // Try per-user settings doc first (employees), then fallback to 'user-settings' (admin/legacy)
          const email = (window.currentUserEmail || '').toLowerCase();
          const isAdmin = window.currentUserRole === 'admin';

          let doc = null;
          let docId = null;

          if (!isAdmin && email) {
            docId = `user-settings-${email}`;
            try {
              doc = await window.firebaseDB.collection('settings').doc(docId).get();
              // Document doesn't exist yet - that's fine, will be created on first save
              if (!doc.exists) {
                return [];
              }
            } catch (err) {
              // Permission errors are expected if document doesn't exist yet or user doesn't have access
              if (err.code === 'permission-denied') {
                // Expected for new employees - document will be created on first save
                return [];
              }
              console.warn('[CacheManager] Error loading per-user settings:', err);
              // Don't fallback to legacy for employees - they should have their own doc
              return [];
            }
          }

          // Only fallback to legacy 'user-settings' for admin users
          if (isAdmin) {
            docId = 'user-settings';
            try {
              doc = await window.firebaseDB.collection('settings').doc(docId).get();
            } catch (err) {
              console.warn('[CacheManager] Error loading legacy settings:', err);
              return [];
            }
          }

          if (doc.exists) {
            const data = doc.data();
            // Check ownership for non-admin users (only needed for legacy 'user-settings')
            if (!isAdmin && docId === 'user-settings') {
              const ownerId = (data.ownerId || '').toLowerCase();
              const userId = data.userId;
              const currentUserId = window.firebase && window.firebase.auth && window.firebase.auth().currentUser ? window.firebase.auth().currentUser.uid : null;
              if (ownerId !== email && userId !== currentUserId) {
                // User doesn't own this settings doc, return empty
                return [];
              }
            }
            return [{ id: docId, ...data }];
          }
          return [];
        } catch (error) {
          // Permission errors are expected for non-admin users accessing settings they don't own
          if (error.code === 'permission-denied' || error.message.includes('permission')) {
            console.warn('[CacheManager] Permission denied for settings (expected for non-admin), returning empty');
            return [];
          }
          throw error;
        }
      }

      // Use DataManager for ownership-aware queries if available
      if (collection === 'accounts' && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function' && window.currentUserRole) {
        try {
          const data = await window.DataManager.queryWithOwnership('accounts');
          return data;
        } catch (error) {
          console.error('[CacheManager] DataManager query failed, falling back:', error);
        }
      }

      // Use scoped queries for user-specific collections
      if (['contacts', 'tasks', 'accounts', 'emails', 'lists', 'sequences', 'calls', 'agent_activities', 'deals'].includes(collection)) {
        const email = (window.currentUserEmail || '').toLowerCase();
        if (window.currentUserRole !== 'admin' && email) {
          // Non-admin: use scoped queries - check multiple ownership fields
          const queries = [];

          // Check ownerId field
          queries.push(window.firebaseDB.collection(collection).where('ownerId', '==', email).get());
          // Check assignedTo field  
          queries.push(window.firebaseDB.collection(collection).where('assignedTo', '==', email).get());

          // For lists, also check createdBy field (legacy field)
          if (collection === 'lists') {
            queries.push(window.firebaseDB.collection(collection).where('createdBy', '==', email).get());
          }

          if (collection === 'tasks') {
            queries.push(window.firebaseDB.collection(collection).where('createdBy', '==', email).get());
          }

          const snapshots = await Promise.all(queries.map(q => q.catch(e => {
            return { docs: [], empty: true, size: 0 };
          })));
          const map = new Map();

          snapshots.forEach((snap, idx) => {
            snap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
          });

          const data = Array.from(map.values());
          return data;
        } else {
          // OPTIMIZED: Admin query with limit to prevent loading entire collection
          // Background loaders handle pagination, but this provides safety for direct calls
          // 5000 is reasonable for most collections while keeping costs down
          const snapshot = await window.firebaseDB.collection(collection).limit(5000).get();
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const endTime = performance.now();
          return data;
        }
      }
  
      // For other collections, use standard query (admin only) with limit
      if (window.currentUserRole === 'admin') {
        // OPTIMIZED: Add limit to prevent loading entire collection
        const snapshot = await window.firebaseDB.collection(collection).limit(5000).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return data;
      } else {
        console.warn(`[CacheManager] Non-admin access denied for collection: ${collection}`);
        return [];
      }
    } catch (error) {
      console.error(`[CacheManager] Error fetching ${collection} from Firestore:`, error);
      return [];
    }

    const endTime = performance.now();
  }

  // Get data from IndexedDB cache
  async getFromCache(collection) {
    try {
      await this.init();

      // Check if database is still open
      if (!this.db || this.db.version === 0) {
        console.warn(`[CacheManager] Database not available for reading ${collection}`);
        return [];
      }

      const tx = this.db.transaction([collection], 'readonly');
      const store = tx.objectStore(collection);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const data = request.result || [];
          
          // CRITICAL FIX: Validate tasks to prevent blank rendering
          if (collection === 'tasks') {
            const validTasks = data.filter(task => {
              if (!task || typeof task !== 'object' || !task.id) return false;
              // Ensure task has at least title or type to prevent blank rendering
              if (!task.title && !task.type) return false;
              return true;
            });
            
            if (validTasks.length !== data.length) {
              console.warn(`[CacheManager] Filtered ${data.length - validTasks.length} invalid tasks from cache`);
            }
            
            resolve(validTasks);
          } else {
            resolve(data);
          }
        };
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

      // Check if database is still open
      if (!this.db || this.db.version === 0) {
        console.warn(`[CacheManager] Database not available for ${collection}, skipping cache`);
        return;
      }

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
    } catch (error) {
      console.error(`[CacheManager] Error caching ${collection}:`, error);
    }
  }

  // Update a single record in cache (for real-time updates)
  async updateRecord(collection, id, changes) {
    if (!id || !changes) return false;

    try {
      await this.init();
      if (!this.db || this.db.version === 0) return false;

      const ok = await new Promise((resolve) => {
        const tx = this.db.transaction([collection], 'readwrite');
        const store = tx.objectStore(collection);

        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const existing = getRequest.result || { id };
          const updated = { ...existing, ...changes, updatedAt: changes.updatedAt || new Date() };
          store.put(updated);
        };

        getRequest.onerror = () => {
          console.error(`[CacheManager] Error updating ${collection}/${id}:`, getRequest.error);
          resolve(false);
        };

        tx.oncomplete = () => {
          resolve(true);
        };

        tx.onerror = () => {
          console.error(`[CacheManager] Error updating ${collection}/${id}:`, tx.error);
          resolve(false);
        };
      });

      if (ok) {
        try {
          const metaTx = this.db.transaction(['_meta'], 'readwrite');
          const metaStore = metaTx.objectStore('_meta');
          metaStore.put({ collection, timestamp: Date.now() });
        } catch (_) { }
      }

      return ok;
    } catch (error) {
      console.error(`[CacheManager] Error updating record in cache:`, error);
      return false;
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
    } catch (error) {
      console.error(`[CacheManager] Error invalidating ${collection}:`, error);
    }
  }

  // Invalidate all caches
  async invalidateAll() {
    for (const collection of this.collections) {
      await this.invalidate(collection);
    }
  }

  // Get cache statistics with debugging info
  async getStats() {
    try {
      await this.init();
      const stats = {};

      for (const collection of this.collections) {
        const data = await this.getFromCache(collection);
        const meta = await this.getMeta(collection);
        const requestStats = this.requestStats.get(collection) || { hits: 0, misses: 0, duplicates: 0 };

        stats[collection] = {
          count: data.length,
          timestamp: meta?.timestamp || null,
          age: meta?.timestamp ? Math.round((Date.now() - meta.timestamp) / 1000) : null,
          fresh: await this.isFresh(collection),
          requests: requestStats,
          activeRequest: this.activeRequests.has(collection)
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

  // ===== AGENT-SPECIFIC CACHING METHODS =====

  // Cache agent metrics (separate from full agent data for performance)
  async cacheAgentMetrics(agentEmail, metrics) {
    const cacheKey = `agent-metrics-${agentEmail}`;
    const data = {
      id: cacheKey,
      agentEmail,
      ...metrics,
      timestamp: Date.now(),
      expiry: Date.now() + (5 * 60 * 1000) // 5 minutes
    };

    try {
      await this.init();
      const tx = this.db.transaction(['agents'], 'readwrite');
      const store = tx.objectStore('agents');
      store.put(data);

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error caching agent metrics:`, error);
    }
  }

  // Get cached agent metrics
  async getCachedAgentMetrics(agentEmail) {
    try {
      await this.init();
      const cacheKey = `agent-metrics-${agentEmail}`;
      const tx = this.db.transaction(['agents'], 'readonly');
      const store = tx.objectStore('agents');
      const request = store.get(cacheKey);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const cached = request.result;
          if (!cached || !cached.expiry || cached.expiry < Date.now()) {
            resolve(null);
            return;
          }

          resolve(cached);
        };

        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error(`[CacheManager] Error getting cached agent metrics:`, error);
      return null;
    }
  }

  // Cache recent agent activities (last 50 per agent)
  async cacheAgentActivities(agentEmail, activities) {
    const cacheKey = `agent-activities-${agentEmail}`;
    const data = {
      id: cacheKey,
      agentEmail,
      activities: activities.slice(0, 50), // Limit to 50 most recent
      timestamp: Date.now(),
      expiry: Date.now() + (2 * 60 * 1000) // 2 minutes (more frequent updates)
    };

    try {
      await this.init();
      const tx = this.db.transaction(['agent_activities'], 'readwrite');
      const store = tx.objectStore('agent_activities');
      store.put(data);

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error caching agent activities:`, error);
    }
  }

  // Get cached agent activities
  async getCachedAgentActivities(agentEmail) {
    try {
      await this.init();
      const cacheKey = `agent-activities-${agentEmail}`;
      const tx = this.db.transaction(['agent_activities'], 'readonly');
      const store = tx.objectStore('agent_activities');
      const request = store.get(cacheKey);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const cached = request.result;
          if (!cached || !cached.expiry || cached.expiry < Date.now()) {
            resolve(null);
            return;
          }

          resolve(cached.activities || []);
        };

        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error(`[CacheManager] Error getting cached agent activities:`, error);
      return null;
    }
  }

  // Cache Twilio phone numbers (longer expiry - changes infrequently)
  async cacheTwilioNumbers(numbers) {
    const data = {
      id: 'twilio-numbers',
      numbers,
      timestamp: Date.now(),
      expiry: Date.now() + (30 * 60 * 1000) // 30 minutes
    };

    try {
      await this.init();
      const tx = this.db.transaction(['agents'], 'readwrite');
      const store = tx.objectStore('agents');
      store.put(data);

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error caching Twilio numbers:`, error);
    }
  }

  // Get cached Twilio numbers
  async getCachedTwilioNumbers() {
    try {
      await this.init();
      const tx = this.db.transaction(['agents'], 'readonly');
      const store = tx.objectStore('agents');
      const request = store.get('twilio-numbers');

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const cached = request.result;
          if (!cached || !cached.expiry || cached.expiry < Date.now()) {
            resolve(null);
            return;
          }

          resolve(cached.numbers || []);
        };

        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error(`[CacheManager] Error getting cached Twilio numbers:`, error);
      return null;
    }
  }

  // Cache SendGrid email addresses (longer expiry - changes infrequently)
  async cacheSendGridEmails(emails) {
    const data = {
      id: 'sendgrid-emails',
      emails,
      timestamp: Date.now(),
      expiry: Date.now() + (30 * 60 * 1000) // 30 minutes
    };

    try {
      await this.init();
      const tx = this.db.transaction(['agents'], 'readwrite');
      const store = tx.objectStore('agents');
      store.put(data);

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error(`[CacheManager] Error caching SendGrid emails:`, error);
    }
  }

  // Get cached SendGrid emails
  async getCachedSendGridEmails() {
    try {
      await this.init();
      const tx = this.db.transaction(['agents'], 'readonly');
      const store = tx.objectStore('agents');
      const request = store.get('sendgrid-emails');

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const cached = request.result;
          if (!cached || !cached.expiry || cached.expiry < Date.now()) {
            resolve(null);
            return;
          }

          resolve(cached.emails || []);
        };

        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error(`[CacheManager] Error getting cached SendGrid emails:`, error);
      return null;
    }
  }

  // Update agent status in cache (for real-time updates)
  async updateAgentStatus(agentEmail, status, lastActive) {
    try {
      await this.init();
      const tx = this.db.transaction(['agents'], 'readwrite');
      const store = tx.objectStore('agents');

      // Get existing agent data
      const getRequest = store.get(agentEmail);

      getRequest.onsuccess = () => {
        const existing = getRequest.result || { id: agentEmail };
        const updated = {
          ...existing,
          status,
          lastActive: lastActive || new Date(),
          updatedAt: new Date()
        };

        store.put(updated);
      };

      getRequest.onerror = () => {
        console.error(`[CacheManager] Error updating agent status:`, getRequest.error);
      };
    } catch (error) {
      console.error(`[CacheManager] Error updating agent status:`, error);
    }
  }

  // Add new agent activity to cache (for real-time updates)
  async addAgentActivity(activity) {
    try {
      await this.init();
      const tx = this.db.transaction(['agent_activities'], 'readwrite');
      const store = tx.objectStore('agent_activities');

      // Store individual activity
      store.put({
        id: activity.id || `activity-${Date.now()}-${Math.random()}`,
        ...activity,
        timestamp: activity.timestamp || new Date()
      });


    } catch (error) {
      console.error(`[CacheManager] Error adding agent activity:`, error);
    }
  }
}

// Initialize global cache manager
if (typeof window !== 'undefined') {
  window.CacheManager = new CacheManager();

  // Debug helper: view cache stats
  window.getCacheStats = async () => {
    const stats = await window.CacheManager.getStats();
    // console.table(stats); // silenced
    return stats;
  };
}
