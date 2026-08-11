const functions = require("firebase-functions");
const admin = require("firebase-admin");

/**
 * Cloud Function yang terpicu (trigger) saat ada pengguna baru dibuat
 * melalui Firebase Authentication.
 * Fungsi ini akan membuat dokumen profil untuk pengguna tersebut di Firestore.
 */
exports.createProfile = functions.region("asia-southeast2").auth.user().onCreate(async (user) => {
    const { uid, email, displayName, photoURL } = user;

    // Siapkan data default untuk disimpan di Firestore
    const nameForAvatar = displayName || email.split('@')[0];
    const newUserProfile = {
        email: email,
        displayName: nameForAvatar,
        // Gunakan photoURL dari provider (Google/Facebook) atau buat avatar default dari nama
        photoURL: photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff&bold=true`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isPremium: false, // Atur status premium default ke false
        following: [], // Array untuk menyimpan UID teman yang diikuti
        followers: [], // Array untuk menyimpan UID pengikut
    };

    try {
        // Buat dokumen di koleksi 'users' dengan ID yang sama dengan UID pengguna
        await admin.firestore().collection("users").doc(uid).set(newUserProfile);
        console.log(`Successfully created profile for user: ${uid}`);
        return null;
    } catch (error) {
        console.error(`Error creating profile for user: ${uid}`, error);
        return null;
    }
});