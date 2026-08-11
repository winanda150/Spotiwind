import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDPytasOsMlHemXBbmsmcu_RJDhrZPbefg",
    authDomain: "spotiwind-music-2686a.firebaseapp.com",
    projectId: "spotiwind-music-2686a",
    storageBucket: "spotiwind-music-2686a.firebasestorage.app",
    messagingSenderId: "421626384106",
    appId: "1:421626384106:web:28207fb4476fb327039193",
    measurementId: "G-16NYW0QSGV",
    databaseURL: "https://spotiwind-music-2686a-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };