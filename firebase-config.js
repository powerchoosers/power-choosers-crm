// This file contains the Firebase configuration and initialization.
// It should be loaded before any other script that interacts with Firestore.
// The purpose of this file is to provide universal configuration. 

const firebaseConfig = {
    apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE",
    authDomain: "power-choosers-crm.firebaseapp.com",
    projectId: "power-choosers-crm",
    storageBucket: "power-choosers-crm.appspot.com",
    messagingSenderId: "792458658491",
    appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
    measurementId: "G-XEC3BFHJHW"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// This makes the Firestore database and server timestamp utilities globally available
// for other scripts like 'crm-app.js' to use.