// Firebase Configuration and Initialization
// Using script tag imports instead of ES6 modules to avoid import errors

// Wait for Firebase scripts to load
document.addEventListener('DOMContentLoaded', function() {
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        console.error('Firebase not loaded. Make sure to include Firebase scripts.');
        return;
    }

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

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // Export Firebase functions for use in the main app
    window.FirebaseDB = {
        db: db,
        doc: firebase.firestore.doc,
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
                query = query.where(constraint.field, constraint.op, constraint.value);
            });
            return query;
        },
        orderBy: function(field, direction = 'asc') {
            return { field, direction };
        },
        limit: function(limit) {
            return { limit };
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
            return { field, op, value };
        }
    };

    // Utility function to generate unique IDs
    window.generateId = function() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    };

    // Utility function to format dates
    window.formatDate = function(timestamp) {
        if (!timestamp) return 'Unknown date';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch (e) {
            return 'Invalid date';
        }
    };

    // Utility function to format date only
    window.formatDateOnly = function(timestamp) {
        if (!timestamp) return 'Unknown date';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString();
        } catch (e) {
            return 'Invalid date';
        }
    };

    console.log('Firebase initialized successfully');
    console.log('Available functions:', Object.keys(window.FirebaseDB));
});

// Alternative initialization if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
} else {
    // DOM already loaded, run initialization immediately
    setTimeout(() => {
        const event = new Event('DOMContentLoaded');
        document.dispatchEvent(event);
    }, 100);
}