import {
    auth,
    db,
    doc,
    collection,
    getDocs,
    getDoc,
    setDoc,
    deleteDoc,
    serverTimestamp
} from "../assets/js/firebase-config.js";

const getLikedSongsRef = (uid) => collection(db, "users", uid, "liked_songs");
const getLikedSongRef = (uid, songId) => doc(db, "users", uid, "liked_songs", String(songId));

export const getFavoriteSongs = async (uid) => {
    if (!uid) return [];

    try {
        const snapshot = await getDocs(getLikedSongsRef(uid));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    } catch (error) {
        console.error("Failed to get favorite songs:", error);
        return [];
    }
};

export const toggleFavorite = async (song) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !song?.id) return null;

    try {
        const songId = String(song.id).trim();
        const ref = getLikedSongRef(uid, songId);
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            await deleteDoc(ref);
        } else {
            await setDoc(ref, { ...song, id: songId, likedAt: serverTimestamp() });
        }

        return getFavoriteSongs(uid);
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
