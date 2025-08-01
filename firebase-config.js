// Universal Firebase Configuration
// Works for both CRM Dashboard and Calling Hub

// Your Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE",
    authDomain: "power-choosers-crm.firebaseapp.com",
    projectId: "power-choosers-crm",
    storageBucket: "power-choosers-crm.firebasestorage.app",
    messagingSenderId: "792458658491",
    appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
    measurementId: "G-XEC3BFHJHW"
};

// Initialize Firebase only if not already initialized
let app;
let db;

// Check if we're in a Firebase v9 environment (CRM) or v8 environment (Calling Hub)
if (typeof firebase !== 'undefined') {
    // Firebase v8 (script tags) - for Calling Hub
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
    } else {
        app = firebase.app();
    }
    db = firebase.firestore();

    // Export Firebase functions for v8
    window.FirebaseDB = {
        db: db,
        doc: function(db, collection, id) {
            return db.collection(collection).doc(id);
        },
        setDoc: function(docRef, data) {
            return docRef.set(data);
        },
        getDoc: function(docRef) {
            return docRef.get();
        },
        getDocs: function(query) {
            return query.get();
        },
        collection: function(db, path) {
            return db.collection(path);
        },
        query: function(collection, ...constraints) {
            let query = collection;
            constraints.forEach(constraint => {
                if (constraint && constraint.type === 'orderBy') {
                    query = query.orderBy(constraint.field, constraint.direction);
                } else if (constraint && constraint.type === 'limit') {
                    query = query.limit(constraint.limit);
                } else if (constraint && constraint.type === 'where') {
                    query = query.where(constraint.field, constraint.op, constraint.value);
                }
            });
            return query;
        },
        orderBy: function(field, direction = 'asc') {
            return { type: 'orderBy', field, direction };
        },
        limit: function(limit) {
            return { type: 'limit', limit };
        },
        serverTimestamp: firebase.firestore.FieldValue.serverTimestamp,
        updateDoc: function(docRef, data) {
            return docRef.update(data);
        },
        deleteDoc: function(docRef) {
            return docRef.delete();
        },
        arrayUnion: firebase.firestore.FieldValue.arrayUnion,
        Timestamp: firebase.firestore.Timestamp,
        where: function(field, op, value) {
            return { type: 'where', field, op, value };
        },
        addDoc: function(collectionRef, data) {
            return collectionRef.add(data);
        }
    };
} else {
    // Firebase v9 (modules) - for CRM Dashboard
    // This will be handled by import statements in the CRM
    console.log('Firebase v9 module environment detected');
}

// Universal utility functions
window.generateId = function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

window.formatDate = function(timestamp) {
    if (!timestamp) return 'Unknown date';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (e) {
        return 'Invalid date';
    }
};

window.formatDateOnly = function(timestamp) {
    if (!timestamp) return 'Unknown date';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString();
    } catch (e) {
        return 'Invalid date';
    }
};

console.log('Universal Firebase config loaded successfully');
if (window.FirebaseDB) {
    console.log('Firebase v8 functions available:', Object.keys(window.FirebaseDB));
}
