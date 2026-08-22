import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    deleteDoc
} from "../assets/js/firebase-config.js";

const getUserRef = (uid) => doc(db, "users", uid);

export const getUserProfile = async (uid) => {
    if (!uid) return null;

    try {
        const snapshot = await getDoc(getUserRef(uid));
        if (!snapshot.exists()) return null;

        return {
            uid,
            ...snapshot.data()
        };
    } catch (error) {
        console.error("Failed to fetch user profile:", error);
        return null;
    }
};

export const getCurrentUserProfile = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    return getUserProfile(uid);
};

export const updateUserProfile = async (uid, updates = {}) => {
    if (!uid) return null;

    try {
        const ref = getUserRef(uid);
        await setDoc(ref, updates, { merge: true });
        return {
            uid,
            ...updates
        };
    } catch (error) {
        console.error("Failed to update user profile:", error);
        return null;
    }
};

export const followUser = async (targetUid) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !targetUid || currentUid === targetUid) return null;

    try {
        const followingRef = doc(db, "users", currentUid, "following", targetUid);
        await setDoc(followingRef, { uid: targetUid, createdAt: Date.now() });

        return { currentUid, targetUid };
    } catch (error) {
        console.error("Failed to follow user:", error);
        return null;
    }
};

export const unfollowUser = async (targetUid) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !targetUid || currentUid === targetUid) return null;

    try {
        const followingRef = doc(db, "users", currentUid, "following", targetUid);
        await deleteDoc(followingRef);

        return { currentUid, targetUid };
    } catch (error) {
        console.error("Failed to unfollow user:", error);
        return null;
    }
};
