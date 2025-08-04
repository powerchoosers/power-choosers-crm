// This file contains the Firebase configuration and initialization.
// It should be loaded before any other script that interacts with Firestore.
[cite_start]// The purpose of this file is to provide universal configuration. [cite: 14]

const firebaseConfig = {
    [cite_start]apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE", [cite: 24]
    authDomain: "power-choosers-crm.firebaseapp.com",
    [cite_start]projectId: "power-choosers-crm", [cite: 21]
    storageBucket: "power-choosers-crm.firebasestorage.app",
    [cite_start]messagingSenderId: "792458658491", [cite: 22]
    appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
    measurementId: "G-XEC3BFHJHW"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// This makes the Firestore database and server timestamp utilities globally available
// for other scripts like 'crm-app.js' to use.