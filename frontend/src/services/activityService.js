import {
    auth,
    db,
    doc,
    setDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    onSnapshot,
    documentId
} from "../assets/js/firebase-config.js";

export const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user || !songName) return null;

    try {
        const activityRef = doc(db, "userActivity", user.uid);
        const payload = {
            uid: user.uid,
            displayName: user.displayName || user.email || "Spotiwind User",
            songName,
            updatedAt: Date.now()
        };

        await setDoc(activityRef, payload, { merge: true });
        return payload;
    } catch (error) {
        console.error("Failed to update activity:", error);
        return null;
    }
};

export const getRecentActivityByUser = async (uid) => {
    if (!uid) return [];

    try {
        const q = query(
            collection(db, "userActivity"),
            where("uid", "==", uid),
            orderBy("updatedAt", "desc"),
            limit(10)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    } catch (error) {
        console.error("Failed to fetch recent activity:", error);
        return [];
    }
};

export const subscribeFriendActivity = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        const q = query(
            collection(db, "userActivity"),
            where("uid", "==", uid),
            orderBy("updatedAt", "desc"),
            limit(10)
        );

        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            callback(items);
        });
    } catch (error) {
        console.error("Failed to subscribe activity:", error);
        return () => {};
    }
};

export const getFollowingIds = async (uid) => {
    if (!uid) return [];

    try {
        const snapshot = await getDocs(collection(db, "users", uid, "following"));
        return snapshot.docs.map((item) => item.id).filter((id) => id && id !== uid);
    } catch (error) {
        console.error("Failed to fetch following ids:", error);
        return [];
    }
};

export const getFriendsActivityByIds = async (friendIds, maxItems = 10) => {
    if (!Array.isArray(friendIds) || friendIds.length === 0) return [];

    const uniqueIds = [...new Set(friendIds.filter(Boolean))].slice(0, 30);
    if (!uniqueIds.length) return [];

    try {
        const chunks = [];
        for (let i = 0; i < uniqueIds.length; i += 30) {
            chunks.push(uniqueIds.slice(i, i + 30));
        }

        const results = await Promise.all(
            chunks.map((chunk) => getDocs(
                query(
                    collection(db, "friends_activity"),
                    where(documentId(), "in", chunk),
                    orderBy("timestamp", "desc"),
                    limit(maxItems)
                )
            ))
        );

        const combined = results.flatMap((snapshot) =>
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        );

        return combined
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
            .slice(0, maxItems);
    } catch (error) {
        console.error("Failed to fetch friends activity:", error);
        return [];
    }
};

export const subscribeFriendsActivityByIds = (friendIds, callback, options = {}) => {
    const { limitCount = 10 } = options;
    if (!Array.isArray(friendIds) || friendIds.length === 0 || typeof callback !== "function") {
        return () => {};
    }

    const uniqueIds = [...new Set(friendIds.filter(Boolean))];
    if (!uniqueIds.length) return () => {};

    const listeners = [];
    const chunkResults = new Map();

    const emit = () => {
        let combined = [];
        chunkResults.forEach((results) => {
            combined = [...combined, ...results];
        });

        combined.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        callback(combined.slice(0, limitCount));
    };

    try {
        const chunks = [];
        for (let i = 0; i < uniqueIds.length; i += 30) {
            chunks.push(uniqueIds.slice(i, i + 30));
        }

        chunks.forEach((chunkIds, index) => {
            const q = query(
                collection(db, "friends_activity"),
                where(documentId(), "in", chunkIds),
                orderBy("timestamp", "desc"),
                limit(limitCount)
            );

            const unsub = onSnapshot(q, (snapshot) => {
                chunkResults.set(index, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
                emit();
            }, (error) => {
                console.error("Friend activity stream error:", error);
            });

            listeners.push(unsub);
        });

        return () => {
            listeners.forEach((unsub) => unsub && unsub());
        };
    } catch (error) {
        console.error("Failed to subscribe friends activity:", error);
        return () => {};
    }
};
