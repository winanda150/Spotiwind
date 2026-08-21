import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    arrayRemove
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
        const currentRef = getUserRef(currentUid);
        const targetRef = getUserRef(targetUid);

        await Promise.all([
            updateDoc(currentRef, {
                following: arrayUnion(targetUid)
            }),
            updateDoc(targetRef, {
                followers: arrayUnion(currentUid)
            })
        ]);

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
        const currentRef = getUserRef(currentUid);
        const targetRef = getUserRef(targetUid);

        await Promise.all([
            updateDoc(currentRef, {
                following: arrayRemove(targetUid)
            }),
            updateDoc(targetRef, {
                followers: arrayRemove(currentUid)
            })
        ]);

        return { currentUid, targetUid };
    } catch (error) {
        console.error("Failed to unfollow user:", error);
        return null;
    }
};
