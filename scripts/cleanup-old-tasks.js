/**
 * Console Script: Delete Old Tasks
 * 
 * Copy and paste this entire script into your browser console to delete tasks older than a specified date.
 * 
 * Usage:
 * 1. Open your browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire file
 * 3. Call: deleteOldTasks(30) // deletes tasks older than 30 days
 * 
 * Or customize with options:
 * deleteOldTasks(30, { dryRun: true }) // preview what would be deleted
 * deleteOldTasks(60, { completed: true }) // only delete completed tasks
 * deleteOldTasks(90, { types: ['linkedin'] }) // only delete LinkedIn tasks
 */

window.deleteOldTasks = async function(daysOld = 30, options = {}) {
  const {
    dryRun = false,
    completed = false,
    types = null,
    status = null
  } = options;
  
  console.log(`[Task Cleanup] Starting ${dryRun ? 'DRY RUN' : 'deletion'} of tasks older than ${daysOld} days...`);
  
  // Calculate cutoff date
  const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  
  // Get all tasks
  let allTasks = [];
  
  // Load from localStorage
  try {
    const getUserEmail = () => {
      try {
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
          return window.DataManager.getCurrentUserEmail();
        }
        return (window.currentUserEmail || '').toLowerCase();
      } catch(_) {
        return (window.currentUserEmail || '').toLowerCase();
      }
    };
    const userEmail = getUserEmail();
    const key = userEmail ? `userTasks:${userEmail}` : 'userTasks';
    const raw = localStorage.getItem(key);
    if (raw) {
      allTasks = JSON.parse(raw);
      console.log(`[Task Cleanup] Found ${allTasks.length} tasks in localStorage`);
    }
  } catch(e) {
    console.warn('[Task Cleanup] Could not load from localStorage:', e);
  }
  
  // Also load from Firebase if available
  let firebaseTasks = [];
  if (window.firebaseDB) {
    try {
      const snapshot = await window.firebaseDB.collection('tasks')
        .orderBy('timestamp', 'desc')
        .get();
      firebaseTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _docId: doc.id }));
      console.log(`[Task Cleanup] Found ${firebaseTasks.length} tasks in Firebase`);
    } catch(e) {
      console.warn('[Task Cleanup] Could not load from Firebase:', e);
    }
  }
  
  // Merge tasks
  const allTasksMap = new Map();
  allTasks.forEach(t => allTasksMap.set(t.id, t));
  firebaseTasks.forEach(t => {
    if (!allTasksMap.has(t.id)) {
      allTasksMap.set(t.id, t);
    }
  });
  
  const mergedTasks = Array.from(allTasksMap.values());
  console.log(`[Task Cleanup] Total unique tasks: ${mergedTasks.length}`);
  
  // Filter tasks to delete
  const tasksToDelete = mergedTasks.filter(task => {
    // Check age
    const taskDate = task.createdAt || task.timestamp || 0;
    const taskTimestamp = typeof taskDate === 'object' && taskDate.toDate 
      ? taskDate.toDate().getTime() 
      : (typeof taskDate === 'object' && taskDate.seconds 
        ? taskDate.seconds * 1000 
        : taskDate);
    
    if (taskTimestamp > cutoffDate) {
      return false; // Too recent
    }
    
    // Check completion status filter
    if (completed && task.status !== 'completed') {
      return false;
    }
    
    // Check status filter
    if (status && task.status !== status) {
      return false;
    }
    
    // Check type filter
    if (types && Array.isArray(types)) {
      const taskType = String(task.type || '').toLowerCase();
      const matchesType = types.some(t => taskType.includes(t.toLowerCase()));
      if (!matchesType) {
        return false;
      }
    }
    
    return true;
  });
  
  console.log(`[Task Cleanup] Found ${tasksToDelete.length} tasks to delete`);
  
  // Show preview
  if (tasksToDelete.length > 0) {
    console.table(tasksToDelete.map(t => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      created: new Date(t.createdAt || t.timestamp || 0).toLocaleDateString()
    })));
  }
  
  if (dryRun) {
    console.log(`[Task Cleanup] DRY RUN complete. ${tasksToDelete.length} tasks would be deleted.`);
    console.log(`[Task Cleanup] To actually delete, run: deleteOldTasks(${daysOld}, { dryRun: false })`);
    return {
      dryRun: true,
      tasksFound: tasksToDelete.length,
      tasks: tasksToDelete
    };
  }
  
  // Delete from localStorage
  let localStorageDeleted = 0;
  if (allTasks.length > 0) {
    try {
      const idsToDelete = new Set(tasksToDelete.map(t => t.id));
      const remaining = allTasks.filter(t => !idsToDelete.has(t.id));
      
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const userEmail = getUserEmail();
      const key = userEmail ? `userTasks:${userEmail}` : 'userTasks';
      
      localStorage.setItem(key, JSON.stringify(remaining));
      localStorageDeleted = allTasks.length - remaining.length;
      console.log(`[Task Cleanup] Deleted ${localStorageDeleted} tasks from localStorage`);
    } catch(e) {
      console.error('[Task Cleanup] Failed to delete from localStorage:', e);
    }
  }
  
  // Delete from Firebase
  let firebaseDeleted = 0;
  if (window.firebaseDB && tasksToDelete.length > 0) {
    try {
      const batch = window.firebaseDB.batch();
      let batchCount = 0;
      
      for (const task of tasksToDelete) {
        // Try to delete by document ID first
        if (task._docId) {
          batch.delete(window.firebaseDB.collection('tasks').doc(task._docId));
          batchCount++;
        } else {
          // Fallback: query by id field
          const snapshot = await window.firebaseDB.collection('tasks').where('id', '==', task.id).limit(1).get();
          if (!snapshot.empty) {
            batch.delete(snapshot.docs[0].ref);
            batchCount++;
          }
        }
        
        // Commit in batches of 500 (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          firebaseDeleted += batchCount;
          console.log(`[Task Cleanup] Committed batch of ${batchCount} deletions...`);
          batchCount = 0;
        }
      }
      
      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
        firebaseDeleted += batchCount;
      }
      
      console.log(`[Task Cleanup] Deleted ${firebaseDeleted} tasks from Firebase`);
    } catch(e) {
      console.error('[Task Cleanup] Failed to delete from Firebase:', e);
    }
  }
  
  // Refresh the tasks page if it's open
  if (window.Tasks && typeof window.Tasks.loadMoreTasks === 'function') {
    console.log('[Task Cleanup] Refreshing tasks page...');
    window.location.reload();
  }
  
  console.log(`[Task Cleanup] ✓ Cleanup complete!`);
  console.log(`  - localStorage: ${localStorageDeleted} tasks deleted`);
  console.log(`  - Firebase: ${firebaseDeleted} tasks deleted`);
  
  return {
    dryRun: false,
    localStorageDeleted,
    firebaseDeleted,
    totalDeleted: localStorageDeleted + firebaseDeleted
  };
};

// Delete RECENT tasks (opposite of deleteOldTasks - deletes tasks from last N hours)
window.deleteRecentTasks = async function(hoursRecent = 24, options = {}) {
  const {
    dryRun = false,
    types = null,
    status = null
  } = options;
  
  console.log(`[Task Cleanup] Starting ${dryRun ? 'DRY RUN' : 'deletion'} of tasks from last ${hoursRecent} hours...`);
  
  // Calculate cutoff time (tasks NEWER than this will be deleted)
  const cutoffTime = Date.now() - (hoursRecent * 60 * 60 * 1000);
  
  // Get all tasks
  let allTasks = [];
  
  // Load from localStorage
  try {
    const getUserEmail = () => {
      try {
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
          return window.DataManager.getCurrentUserEmail();
        }
        return (window.currentUserEmail || '').toLowerCase();
      } catch(_) {
        return (window.currentUserEmail || '').toLowerCase();
      }
    };
    const userEmail = getUserEmail();
    const key = userEmail ? `userTasks:${userEmail}` : 'userTasks';
    const raw = localStorage.getItem(key);
    if (raw) {
      allTasks = JSON.parse(raw);
      console.log(`[Task Cleanup] Found ${allTasks.length} tasks in localStorage`);
    }
  } catch(e) {
    console.warn('[Task Cleanup] Could not load from localStorage:', e);
  }
  
  // Also load from Firebase if available
  let firebaseTasks = [];
  if (window.firebaseDB) {
    try {
      const snapshot = await window.firebaseDB.collection('tasks')
        .orderBy('timestamp', 'desc')
        .get();
      firebaseTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _docId: doc.id }));
      console.log(`[Task Cleanup] Found ${firebaseTasks.length} tasks in Firebase`);
    } catch(e) {
      console.warn('[Task Cleanup] Could not load from Firebase:', e);
    }
  }
  
  // Merge tasks
  const allTasksMap = new Map();
  allTasks.forEach(t => allTasksMap.set(t.id, t));
  firebaseTasks.forEach(t => {
    if (!allTasksMap.has(t.id)) {
      allTasksMap.set(t.id, t);
    }
  });
  
  const mergedTasks = Array.from(allTasksMap.values());
  console.log(`[Task Cleanup] Total unique tasks: ${mergedTasks.length}`);
  
  // Filter tasks to delete (RECENT tasks, not old ones)
  const tasksToDelete = mergedTasks.filter(task => {
    // Check age - DELETE if NEWER than cutoff
    const taskDate = task.createdAt || task.timestamp || 0;
    const taskTimestamp = typeof taskDate === 'object' && taskDate.toDate 
      ? taskDate.toDate().getTime() 
      : (typeof taskDate === 'object' && taskDate.seconds 
        ? taskDate.seconds * 1000 
        : taskDate);
    
    if (taskTimestamp < cutoffTime) {
      return false; // Too old, skip
    }
    
    // Check status filter
    if (status && task.status !== status) {
      return false;
    }
    
    // Check type filter
    if (types && Array.isArray(types)) {
      const taskType = String(task.type || '').toLowerCase();
      const matchesType = types.some(t => taskType.includes(t.toLowerCase()));
      if (!matchesType) {
        return false;
      }
    }
    
    return true;
  });
  
  console.log(`[Task Cleanup] Found ${tasksToDelete.length} recent tasks to delete`);
  
  // Show preview
  if (tasksToDelete.length > 0) {
    console.table(tasksToDelete.map(t => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      created: new Date(t.createdAt || t.timestamp || 0).toLocaleString()
    })));
  }
  
  if (dryRun) {
    console.log(`[Task Cleanup] DRY RUN complete. ${tasksToDelete.length} recent tasks would be deleted.`);
    console.log(`[Task Cleanup] To actually delete, run: deleteRecentTasks(${hoursRecent}, { dryRun: false })`);
    return {
      dryRun: true,
      tasksFound: tasksToDelete.length,
      tasks: tasksToDelete
    };
  }
  
  // Delete from localStorage
  let localStorageDeleted = 0;
  if (allTasks.length > 0) {
    try {
      const idsToDelete = new Set(tasksToDelete.map(t => t.id));
      const remaining = allTasks.filter(t => !idsToDelete.has(t.id));
      
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const userEmail = getUserEmail();
      const key = userEmail ? `userTasks:${userEmail}` : 'userTasks';
      
      localStorage.setItem(key, JSON.stringify(remaining));
      localStorageDeleted = allTasks.length - remaining.length;
      console.log(`[Task Cleanup] Deleted ${localStorageDeleted} recent tasks from localStorage`);
    } catch(e) {
      console.error('[Task Cleanup] Failed to delete from localStorage:', e);
    }
  }
  
  // Delete from Firebase
  let firebaseDeleted = 0;
  if (window.firebaseDB && tasksToDelete.length > 0) {
    try {
      const batch = window.firebaseDB.batch();
      let batchCount = 0;
      
      for (const task of tasksToDelete) {
        // Try to delete by document ID first
        if (task._docId) {
          batch.delete(window.firebaseDB.collection('tasks').doc(task._docId));
          batchCount++;
        } else {
          // Fallback: query by id field
          const snapshot = await window.firebaseDB.collection('tasks').where('id', '==', task.id).limit(1).get();
          if (!snapshot.empty) {
            batch.delete(snapshot.docs[0].ref);
            batchCount++;
          }
        }
        
        // Commit in batches of 500 (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          firebaseDeleted += batchCount;
          console.log(`[Task Cleanup] Committed batch of ${batchCount} deletions...`);
          batchCount = 0;
        }
      }
      
      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
        firebaseDeleted += batchCount;
      }
      
      console.log(`[Task Cleanup] Deleted ${firebaseDeleted} recent tasks from Firebase`);
    } catch(e) {
      console.error('[Task Cleanup] Failed to delete from Firebase:', e);
    }
  }
  
  // Refresh the tasks page if it's open
  if (window.Tasks && typeof window.Tasks.loadMoreTasks === 'function') {
    console.log('[Task Cleanup] Refreshing tasks page...');
    window.location.reload();
  }
  
  console.log(`[Task Cleanup] ✓ Cleanup complete!`);
  console.log(`  - localStorage: ${localStorageDeleted} recent tasks deleted`);
  console.log(`  - Firebase: ${firebaseDeleted} recent tasks deleted`);
  
  return {
    dryRun: false,
    localStorageDeleted,
    firebaseDeleted,
    totalDeleted: localStorageDeleted + firebaseDeleted
  };
};

// Quick access functions
window.deleteOldTasksDryRun = (days = 30) => deleteOldTasks(days, { dryRun: true });
window.deleteCompletedTasks = (days = 30) => deleteOldTasks(days, { completed: true });
window.deleteLinkedInTasks = (days = 30) => deleteOldTasks(days, { types: ['linkedin', 'li-'] });
window.deleteRecentTasksDryRun = (hours = 24) => deleteRecentTasks(hours, { dryRun: true });
window.deleteLast24Hours = () => deleteRecentTasks(24);

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Task Cleanup Script Loaded');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🗑️  Delete OLD Tasks (older than N days):');
console.log('  deleteOldTasksDryRun(30)       - Preview tasks to delete');
console.log('  deleteOldTasks(30)             - Delete tasks older than 30 days');
console.log('  deleteCompletedTasks(60)       - Delete completed tasks older than 60 days');
console.log('  deleteLinkedInTasks(90)        - Delete LinkedIn tasks older than 90 days');
console.log('');
console.log('🧹 Delete RECENT Tasks (from last N hours):');
console.log('  deleteRecentTasksDryRun(24)    - Preview recent tasks');
console.log('  deleteLast24Hours()            - Delete tasks from last 24 hours');
console.log('  deleteRecentTasks(12)          - Delete tasks from last 12 hours');
console.log('  deleteRecentTasks(48)          - Delete tasks from last 48 hours');
console.log('');
console.log('⚙️  Advanced Options:');
console.log('  deleteOldTasks(30, { dryRun: true })           - Preview only');
console.log('  deleteOldTasks(60, { completed: true })        - Only completed');
console.log('  deleteOldTasks(90, { types: [\'linkedin\'] })    - Filter by type');
console.log('  deleteRecentTasks(24, { types: [\'linkedin\'] }) - Recent LinkedIn only');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');

