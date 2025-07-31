// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs,
    collection,
    query,
    orderBy,
    limit,
    serverTimestamp, 
    updateDoc, 
    deleteDoc,
    arrayUnion,
    Timestamp,
    where 
} from "https://www.gstatic.com/firebasejs/9.1.0/firebase-firestore.js";

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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export Firebase functions for use in the main app
window.FirebaseDB = {
    db,
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    query,
    orderBy,
    limit,
    serverTimestamp,
    updateDoc,
    deleteDoc,
    arrayUnion,
    Timestamp,
    where
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