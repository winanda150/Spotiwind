import {
    rtdb,
    ref,
    onValue,
    rtdbSet,
    onDisconnect,
    rtdbServerTimestamp
} from "../assets/js/firebase-config.js";

export const setPresenceStatus = (uid, status = "online") => {
    if (!uid) return null;

    const userStatusRef = ref(rtdb, `presence/${uid}`);
    const payload = {
        state: status,
        last_changed: rtdbServerTimestamp()
    };

    rtdbSet(userStatusRef, payload);
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

    const unsubscribe = onValue(isConnectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            setOnline();
            onDisconnect(userStatusRef).set({
                state: "offline",
                last_changed: rtdbServerTimestamp()
            });
        }
    });

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
        unsubscribe();
        document.removeEventListener("visibilitychange", visibilityHandler);
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
