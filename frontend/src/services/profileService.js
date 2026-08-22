import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    updateDoc
} from "../assets/js/firebase-config.js";

export const buildAvatarUrl = (name, fallback = "Spotiwind") => {
    const safeName = (name || fallback).trim();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=B91EC9&color=fff&bold=true`;
};

export const createProfileDocument = async (uid, userData = {}) => {
    if (!uid) return null;

    const profileRef = doc(db, "users", uid);
    const baseProfile = {
        uid,
        email: userData.email || "",
        displayName: userData.displayName || userData.email?.split("@")[0] || "Spotiwind User",
        photoURL: userData.photoURL || buildAvatarUrl(userData.displayName || userData.email || "Spotiwind User"),
        createdAt: Date.now(),
        isPremium: false,
        following: [],
        followers: [],
        library: [],
        favorites: []
    };

    try {
        await setDoc(profileRef, {
            ...baseProfile,
            ...userData
        }, { merge: true });

        return {
            uid,
            ...baseProfile,
            ...userData
        };
    } catch (error) {
        console.error("Failed to create profile document:", error);
        return null;
    }
};

export const getProfileByUid = async (uid) => {
    if (!uid) return null;

    try {
        const snapshot = await getDoc(doc(db, "users", uid));
        if (!snapshot.exists()) return null;
        return { uid, ...snapshot.data() };
    } catch (error) {
        console.error("Failed to get profile by uid:", error);
        return null;
    }
};

export const getCurrentProfile = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    return getProfileByUid(uid);
};

export const isUserPremium = async (uid) => {
    const profile = await getProfileByUid(uid);
    return profile?.isPremium === true;
};

export const updateProfileInfo = async (uid, payload = {}) => {
    if (!uid) return null;

    try {
        const profileRef = doc(db, "users", uid);
        await updateDoc(profileRef, payload);
        return {
            uid,
            ...payload
        };
    } catch (error) {
        console.error("Failed to update profile info:", error);
        return null;
    }
};

export const syncProfileFromAuthUser = async (firebaseUser) => {
    if (!firebaseUser) return null;

    const payload = {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Spotiwind User",
        photoURL: firebaseUser.photoURL || buildAvatarUrl(firebaseUser.displayName || firebaseUser.email || "Spotiwind User")
    };

    return createProfileDocument(firebaseUser.uid, payload);
};
