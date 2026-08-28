import {
    auth,
    rtdb,
    ref,
    onValue,
    rtdbSet,
    onDisconnect,
    rtdbServerTimestamp
} from "../assets/js/firebase-config.js";

export const setPresenceStatus = (uid, status = "online") => {
    if (!uid) return null;

    // Pastikan user masih dalam kondisi terautentikasi sebelum menulis ke RTDB
    const currentUser = auth?.currentUser;
    if (!currentUser || currentUser.uid !== uid) {
        return null;
    }

    const userStatusRef = ref(rtdb, `presence/${uid}`);
    const payload = {
        state: status,
        last_changed: rtdbServerTimestamp()
    };

    // Tangkap error secara aman agar tidak memunculkan uncaught permission warning saat logout
    rtdbSet(userStatusRef, payload).catch(() => {});
    return payload;
};

export const watchUserConnection = (uid, callbacks = {}) => {
    if (!uid) return () => {};

    const userStatusRef = ref(rtdb, `presence/${uid}`);
    const isConnectedRef = ref(rtdb, ".info/connected");
    const { onOnline, onOffline } = callbacks;

    const setOnline = () => {
        if (typeof onOnline === "function") onOnline();
        setPresenceStatus(uid, "online");
    };

    const setOffline = () => {
        if (typeof onOffline === "function") onOffline();
        setPresenceStatus(uid, "offline");
    };

    const visibilityHandler = () => {
        if (document.visibilityState === "visible") {
            setOnline();
        }
    };

    let disconnectRef = null;

    const unsubscribe = onValue(isConnectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            setOnline();
            disconnectRef = onDisconnect(userStatusRef);
            disconnectRef.set({
                state: "offline",
                last_changed: rtdbServerTimestamp()
            }).catch(() => {});
        }
    });

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
        unsubscribe();
        document.removeEventListener("visibilitychange", visibilityHandler);
        if (disconnectRef && typeof disconnectRef.cancel === "function") {
            disconnectRef.cancel().catch(() => {});
        }
        setOffline();
    };
};

export const watchFriendPresence = (friendUid, callback) => {
    if (!friendUid || typeof callback !== "function") return () => {};

    const friendStatusRef = ref(rtdb, `presence/${friendUid}`);
    return onValue(friendStatusRef, (snapshot) => {
        const data = snapshot.val();
        callback({
            uid: friendUid,
            isOnline: data?.state === "online",
            data
        });
    });
};
