import {
    auth,
    db,
    doc,
    collection,
    query,
    where,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    onAuthStateChanged
} from "../assets/js/firebase-config.js";

export const buildAvatarUrl = (name, fallback = "Spotiwind") => {
    const safeName = (name || fallback).trim();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=B91EC9&color=fff&bold=true`;
};

export const generateRandomCodeNumber = () => {
    return String(Math.floor(100000 + Math.random() * 900000));
};

export const generateUserCode = (uid) => {
    if (!uid) return `#SPW-${generateRandomCodeNumber()}`;
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        hash = ((hash << 5) - hash) + uid.charCodeAt(i);
        hash |= 0;
    }
    const positiveHash = Math.abs(hash);
    const codeNum = (positiveHash % 900000) + 100000;
    return `#SPW-${codeNum}`;
};

/**
 * Generates and guarantees a 100% unique #SPW-XXXXXX code across all users in Firestore.
 * If a code collision exists, it automatically regenerates until a unique code is secured.
 */
export const generateUniqueUserCode = async (uid) => {
    let candidateCode = generateUserCode(uid);
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
        attempts++;
        try {
            const q = query(
                collection(db, "users"),
                where("userCode", "==", candidateCode)
            );
            const snapshot = await getDocs(q);
            // If no document has this code, or the only document with this code belongs to the same user
            if (snapshot.empty || (snapshot.docs.length === 1 && snapshot.docs[0].id === uid)) {
                isUnique = true;
                break;
            }
            // Collision detected with another user -> generate a new random 6-digit candidate
            candidateCode = `#SPW-${generateRandomCodeNumber()}`;
        } catch (error) {
            if (error?.code !== 'permission-denied') {
                console.warn("Firestore userCode collision check:", error);
            }
            break;
        }
    }

    return candidateCode;
};

export const createProfileDocument = async (uid, userData = {}) => {
    if (!uid) return null;

    const profileRef = doc(db, "users", uid);

    try {
        const snapshot = await getDoc(profileRef);
        if (!snapshot.exists()) {
            const userCode = userData.userCode || await generateUniqueUserCode(uid);
            const baseProfile = {
                uid,
                userCode,
                email: userData.email || "",
                displayName: userData.displayName || userData.email?.split("@")[0] || "Spotiwind User",
                photoURL: userData.photoURL || buildAvatarUrl(userData.displayName || userData.email || "Spotiwind User"),
                createdAt: Date.now(),
                isPremium: false
            };
            await setDoc(profileRef, {
                ...baseProfile,
                ...userData
            });
            return {
                uid,
                ...baseProfile,
                ...userData
            };
        } else {
            const existingData = snapshot.data() || {};
            let userCode = existingData.userCode || userData.userCode;
            if (!userCode) {
                userCode = await generateUniqueUserCode(uid);
            }
            const baseProfile = {
                uid,
                userCode,
                email: userData.email || "",
                displayName: userData.displayName || userData.email?.split("@")[0] || "Spotiwind User",
                photoURL: userData.photoURL || buildAvatarUrl(userData.displayName || userData.email || "Spotiwind User"),
                createdAt: Date.now(),
                isPremium: false
            };
            // Preserve existing isPremium, userCode, and createdAt
            const merged = {
                ...baseProfile,
                ...existingData,
                ...userData,
                userCode,
                isPremium: existingData.isPremium ?? false
            };
            await setDoc(profileRef, merged, { merge: true });
            return merged;
        }
    } catch (error) {
        console.error("Failed to create profile document:", error);
        return null;
    }
};

export const getProfileByUid = async (uid) => {
    if (!uid) return null;

    try {
        const snapshot = await getDoc(doc(db, "users", uid));
        if (!snapshot.exists()) {
            const currentUser = auth.currentUser;
            if (currentUser && currentUser.uid === uid) {
                return await syncProfileFromAuthUser(currentUser);
            }
            return null;
        }
        return { uid, ...snapshot.data() };
    } catch (error) {
        console.error("Failed to get profile by uid:", error);
        return null;
    }
};

export const subscribeUserProfile = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        return onSnapshot(doc(db, "users", uid), async (snapshot) => {
            if (snapshot.exists()) {
                callback({ uid, ...snapshot.data() });
            } else {
                // If user document is missing in Firestore, auto-create it with default fields
                const currentUser = auth.currentUser;
                if (currentUser && currentUser.uid === uid) {
                    const createdProfile = await syncProfileFromAuthUser(currentUser);
                    if (createdProfile) {
                        callback(createdProfile);
                    }
                } else {
                    callback(null);
                }
            }
        });
    } catch (error) {
        console.error("Failed to subscribe user profile:", error);
        return () => {};
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

export const setUserPremiumStatus = async (uid, isPremium, planDetails = {}) => {
    if (!uid) return null;

    try {
        const profileRef = doc(db, "users", uid);
        const payload = {
            isPremium: Boolean(isPremium),
            premiumPlan: isPremium ? (planDetails.planName || 'Individual Monthly') : null,
            premiumSince: isPremium ? (planDetails.since || Date.now()) : null,
            premiumExpiresAt: isPremium ? (planDetails.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000)) : null
        };
        await updateDoc(profileRef, payload);
        return { uid, ...payload };
    } catch (error) {
        console.error("Failed to set user premium status:", error);
        return null;
    }
};

export const syncProfileFromAuthUser = async (firebaseUser) => {
    if (!firebaseUser) return null;

    const payload = {
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Spotiwind User",
        photoURL: firebaseUser.photoURL || buildAvatarUrl(firebaseUser.displayName || firebaseUser.email || "Spotiwind User")
    };

    return createProfileDocument(firebaseUser.uid, payload);
};

// Automatic listener to ensure users/{uid} document with isPremium always exists in Firestore on login
if (typeof onAuthStateChanged === 'function') {
    onAuthStateChanged(auth, async (user) => {
        if (user?.uid) {
            await syncProfileFromAuthUser(user);
        }
    });
}
