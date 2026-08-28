import {
    auth,
    db,
    doc,
    collection,
    query,
    orderBy,
    onSnapshot,
    getDocs,
    getDoc,
    setDoc,
    deleteDoc,
    addDoc,
    serverTimestamp
} from "../assets/js/firebase-config.js";

const getLikedSongsRef = (uid) => collection(db, "users", uid, "liked_songs");
const getLikedSongRef = (uid, songId) => doc(db, "users", uid, "liked_songs", String(songId));
const getUserPlaylistsRef = (uid) => collection(db, "users", uid, "playlists");

export const getLibrarySongs = async (uid) => {
    if (!uid) return [];

    try {
        const snapshot = await getDocs(getLikedSongsRef(uid));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    } catch (error) {
        console.error("Failed to get library songs:", error);
        return [];
    }
};

export const addSongToLibrary = async (song) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !song?.id) return null;

    try {
        const songId = String(song.id).trim();
        await setDoc(getLikedSongRef(uid, songId), {
            ...song,
            id: songId,
            likedAt: serverTimestamp()
        });
        return getLibrarySongs(uid);
    } catch (error) {
        console.error("Failed to add song to library:", error);
        return null;
    }
};

export const removeSongFromLibrary = async (songId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !songId) return null;

    try {
        await deleteDoc(getLikedSongRef(uid, songId));
        return getLibrarySongs(uid);
    } catch (error) {
        console.error("Failed to remove song from library:", error);
        return null;
    }
};

export const isSongInLibrary = async (songId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !songId) return false;

    const library = await getLibrarySongs(uid);
    return library.some((item) => String(item.id ?? item.songId) === String(songId));
};

export const getUserPlaylists = async (uid) => {
    if (!uid) return [];

    try {
        const q = query(getUserPlaylistsRef(uid), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    } catch (error) {
        console.error("Failed to fetch user playlists:", error);
        return [];
    }
};

export const subscribeUserPlaylists = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        const q = query(getUserPlaylistsRef(uid), orderBy("createdAt", "desc"));
        return onSnapshot(q, (snapshot) => {
            const playlists = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            callback(playlists);
        });
    } catch (error) {
        console.error("Failed to subscribe user playlists:", error);
        return () => {};
    }
};

export const createUserPlaylist = async (uid, playlistName) => {
    const name = playlistName?.trim();
    if (!uid || !name) return null;

    try {
        const ref = await addDoc(getUserPlaylistsRef(uid), {
            name,
            createdAt: serverTimestamp()
        });

        return { id: ref.id, name, createdAt: Date.now() };
    } catch (error) {
        console.error("Failed to create user playlist:", error);
        return null;
    }
};

export const subscribeLikedSongs = (uid, callback) => {
    if (!uid || typeof callback !== "function") return () => {};

    try {
        return onSnapshot(getLikedSongsRef(uid), (snapshot) => {
            const songs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            callback(songs);
        });
    } catch (error) {
        console.error("Failed to subscribe liked songs:", error);
        return () => {};
    }
};
