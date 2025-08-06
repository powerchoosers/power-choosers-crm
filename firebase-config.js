// Firebase Configuration and Initialization
// This file contains the Firebase configuration and initialization.

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
try {
    const app = firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
    
    console.log('Firebase initialized successfully');
    
    // Make these globally available
    window.firebaseApp = app;
    window.db = db;
    window.serverTimestamp = serverTimestamp;
} catch (error) {
    console.error('Firebase initialization error:', error);
}