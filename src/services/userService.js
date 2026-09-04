import {
    auth,
    db,
    doc,
    collection,
    query,
    where,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot
} from "../assets/js/firebase-config.js";

const getUserRef = (uid) => doc(db, "users", uid);
export const getUserFollowersRef = (uid) => collection(db, "users", uid, "followers");
export const getUserFollowingRef = (uid) => collection(db, "users", uid, "following");

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

/**
 * Realtime subscription to user's followers subcollection
 */
export const subscribeUserFollowers = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        return onSnapshot(getUserFollowersRef(uid), (snapshot) => {
            const followers = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            callback(followers);
        }, (error) => {
            console.error("Failed to subscribe user followers:", error);
            callback([]);
        });
    } catch (error) {
        console.error("Failed to subscribe user followers:", error);
        return () => {};
    }
};

/**
 * Realtime subscription to user's following subcollection
 */
export const subscribeUserFollowing = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        return onSnapshot(getUserFollowingRef(uid), (snapshot) => {
            const following = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            callback(following);
        }, (error) => {
            console.error("Failed to subscribe user following:", error);
            callback([]);
        });
    } catch (error) {
        console.error("Failed to subscribe user following:", error);
        return () => {};
    }
};

export const getUserFollowers = async (uid) => {
    if (!uid) return [];
    try {
        const snapshot = await getDocs(getUserFollowersRef(uid));
        return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (error) {
        console.error("Failed to get user followers:", error);
        return [];
    }
};

export const getUserFollowing = async (uid) => {
    if (!uid) return [];
    try {
        const snapshot = await getDocs(getUserFollowingRef(uid));
        return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (error) {
        console.error("Failed to get user following:", error);
        return [];
    }
};

export const followUser = async (targetUid, targetUserData = {}) => {
    const currentUser = auth.currentUser;
    const currentUid = currentUser?.uid;
    if (!currentUid || !targetUid || currentUid === targetUid) return null;

    try {
        const now = Date.now();
        // 1. Add to current user's "following" subcollection
        const followingRef = doc(db, "users", currentUid, "following", targetUid);
        await setDoc(followingRef, {
            uid: targetUid,
            displayName: targetUserData.displayName || "User",
            photoURL: targetUserData.photoURL || "",
            followedAt: now
        }, { merge: true });

        // 2. Add to target user's "followers" subcollection
        const followerRef = doc(db, "users", targetUid, "followers", currentUid);
        await setDoc(followerRef, {
            uid: currentUid,
            displayName: currentUser.displayName || currentUser.email?.split("@")[0] || "User",
            photoURL: currentUser.photoURL || "",
            followedAt: now
        }, { merge: true });

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
        // 1. Remove from current user's "following" subcollection
        const followingRef = doc(db, "users", currentUid, "following", targetUid);
        await deleteDoc(followingRef);

        // 2. Remove from target user's "followers" subcollection
        const followerRef = doc(db, "users", targetUid, "followers", currentUid);
        await deleteDoc(followerRef);

        return { currentUid, targetUid };
    } catch (error) {
        console.error("Failed to unfollow user:", error);
        return null;
    }
};

/**
 * Searches for a user by their exact unique userCode (e.g. "#SPW-849201") in Firestore.
 * Requires an exact match without any typos.
 */
export const findUserByCode = async (code) => {
    if (!code || typeof code !== 'string') return null;
    let cleanCode = code.trim().toUpperCase();
    if (!cleanCode.startsWith('#')) {
        cleanCode = `#${cleanCode}`;
    }

    try {
        const q = query(
            collection(db, "users"),
            where("userCode", "==", cleanCode)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const userDoc = snapshot.docs[0];
        return {
            id: userDoc.id,
            uid: userDoc.id,
            ...userDoc.data()
        };
    } catch (error) {
        console.error("Failed to find user by code:", error);
        return null;
    }
};

/**
 * Standardize artist identifier for following subcollection ID
 */
export const getArtistFollowingId = (artist) => {
    if (!artist) return '';
    const raw = String(artist.id || artist.name || '').trim().toLowerCase();
    return encodeURIComponent(raw).replace(/%/g, '_');
};

/**
 * Check if current user is following an artist in their existing "following" subcollection
 */
export const isFollowingArtist = async (artist) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !artist) return false;

    const artistKey = getArtistFollowingId(artist);
    if (!artistKey) return false;

    try {
        const ref = doc(db, "users", currentUid, "following", artistKey);
        const snapshot = await getDoc(ref);
        return snapshot.exists();
    } catch (error) {
        console.error("Failed to check if following artist:", error);
        return false;
    }
};

/**
 * Follow an artist (saved to user's existing "following" subcollection)
 */
export const followArtist = async (artist) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !artist) return null;

    const artistKey = getArtistFollowingId(artist);
    if (!artistKey) return null;

    try {
        const followingRef = doc(db, "users", currentUid, "following", artistKey);
        const rawName = String(artist.name || "Artist").slice(0, 60);
        const rawPhoto = String(artist.photo || artist.image || artist.cover || "").slice(0, 1500);

        await setDoc(followingRef, {
            uid: artistKey,
            displayName: rawName,
            photoURL: rawPhoto,
            type: "artist",
            artistId: String(artist.id || ''),
            followedAt: Date.now()
        }, { merge: true });

        return { currentUid, artistKey };
    } catch (error) {
        console.error("Failed to follow artist:", error);
        return null;
    }
};

/**
 * Unfollow an artist (removed from user's existing "following" subcollection)
 */
export const unfollowArtist = async (artist) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !artist) return null;

    const artistKey = getArtistFollowingId(artist);
    if (!artistKey) return null;

    try {
        const followingRef = doc(db, "users", currentUid, "following", artistKey);
        await deleteDoc(followingRef);
        return { currentUid, artistKey };
    } catch (error) {
        console.error("Failed to unfollow artist:", error);
        return null;
    }
};

/**
 * Toggle follow artist in the existing "following" subcollection
 */
export const toggleFollowArtist = async (artist) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
        return { requireAuth: true, isFollowing: false };
    }

    const currentlyFollowing = await isFollowingArtist(artist);
    if (currentlyFollowing) {
        await unfollowArtist(artist);
        return { success: true, isFollowing: false };
    } else {
        await followArtist(artist);
        return { success: true, isFollowing: true };
    }
};
