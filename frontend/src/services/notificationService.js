import {
    auth,
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    onSnapshot
} from "../assets/js/firebase-config.js";

export const getNotificationsByUser = async (uid) => {
    if (!uid) return [];

    try {
            const q = query(collection(db, "users", uid, "notifications"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    } catch (error) {
        console.error("Failed to fetch notifications:", error);
        return [];
    }
};

export const markNotificationAsRead = async (notificationId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !notificationId) return null;

    try {
        const ref = doc(db, "users", uid, "notifications", notificationId);
        await updateDoc(ref, {
            isRead: true,
            readAt: Date.now()
        });

        return { notificationId, uid, read: true };
    } catch (error) {
        console.error("Failed to mark notification as read:", error);
        return null;
    }
};

export const subscribeNotifications = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        const q = query(collection(db, "users", uid, "notifications"), orderBy("timestamp", "desc"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            callback(items);
        });
    } catch (error) {
        console.error("Failed to subscribe notifications:", error);
        return () => {};
    }
};

export const subscribeUnreadNotifications = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    const q = query(
        collection(db, "users", uid, "notifications"),
        where("isRead", "==", false)
    );

    return onSnapshot(q, (snapshot) => callback(snapshot.size), (error) => {
        console.error("Failed to subscribe unread notifications:", error);
    });
};
