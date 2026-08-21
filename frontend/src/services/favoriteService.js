import {
    auth,
    db,
    doc,
    getDoc,
    setDoc
} from "../assets/js/firebase-config.js";

const getUserRef = (uid) => doc(db, "users", uid);

export const getFavoriteSongs = async (uid) => {
    if (!uid) return [];

    try {
        const snapshot = await getDoc(getUserRef(uid));
        if (!snapshot.exists()) return [];

        const data = snapshot.data();
        return Array.isArray(data.favorites) ? data.favorites : [];
    } catch (error) {
        console.error("Failed to get favorite songs:", error);
        return [];
    }
};

export const toggleFavorite = async (song) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !song?.id) return null;

    try {
        const ref = getUserRef(uid);
        const snapshot = await getDoc(ref);
        const favorites = snapshot.exists() ? (snapshot.data().favorites || []) : [];

        const isFavorited = favorites.some((item) => String(item.id ?? item.songId) === String(song.id));
        const nextFavorites = isFavorited
            ? favorites.filter((item) => String(item.id ?? item.songId) !== String(song.id))
            : [...favorites, song];

        await setDoc(ref, {
            favorites: nextFavorites
        }, { merge: true });

        return nextFavorites;
    } catch (error) {
        console.error("Failed to toggle favorite song:", error);
        return null;
    }
};

export const isFavoriteSong = async (songId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !songId) return false;

    const favorites = await getFavoriteSongs(uid);
    return favorites.some((item) => String(item.id ?? item.songId) === String(songId));
};
