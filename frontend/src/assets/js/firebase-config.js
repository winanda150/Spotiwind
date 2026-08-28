import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    FacebookAuthProvider,
    OAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
    initializeFirestore,
    getFirestore,
    collection,
    writeBatch,
    query,
    onSnapshot,
    orderBy,
    getDocs,
    where,
    doc,
    documentId,
    setDoc,
    limit,
    serverTimestamp,
    getDoc,
    deleteDoc,
    addDoc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
    getDatabase,
    ref,
    onValue,
    set as rtdbSet,
    onDisconnect,
    serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

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
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});
const rtdb = getDatabase(app);

export {
    app, auth, db, rtdb,
    // Auth
    onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    updateProfile, GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, signInWithPopup,
    sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence,
    // Firestore
    collection, writeBatch, query, onSnapshot, orderBy, getDocs, where, doc, documentId, setDoc,
    limit, serverTimestamp, getDoc, deleteDoc, addDoc, updateDoc, arrayUnion, arrayRemove, increment,
    // Realtime Database
    ref, onValue, rtdbSet, onDisconnect, rtdbServerTimestamp
};