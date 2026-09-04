import {
    auth,
    db,
    doc,
    collection,
    getDocs,
    getDoc,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "../assets/js/firebase-config.js";

const LOCAL_STORAGE_KEY = 'recently_played_songs';
const MAX_LOCAL_ITEMS = 30;
const MAX_CLOUD_ITEMS = 30;
const SYNC_DEBOUNCE_MS = 2000;

let syncTimeoutId = null;

const getRecentlyPlayedCollectionRef = (uid) => collection(db, "users", uid, "recently_played");
const getRecentlyPlayedDocRef = (uid, songId) => doc(db, "users", uid, "recently_played", String(songId));

/**
 * Get recently played songs from localStorage (Zero-latency / Offline-first)
 */
export const getRecentlyPlayed = () => {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem('recentlyPlayed') || '[]';
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => ({
            ...item,
            name: String(item.name || item.title || 'Untitled').replace(/\\'/g, "'").trim(),
            artist: String(item.artist || 'Unknown Artist').replace(/\\'/g, "'").trim()
        }));
    } catch {
        return [];
    }
};

/**
 * Record a song to Recently Played (Optimistic localStorage + Cloud Sync per song document)
 */
export const recordRecentlyPlayed = (song) => {
    if (!song || (!song.id && !song.audio)) return;

    try {
        const currentList = getRecentlyPlayed();
        const songId = String(song.id || song.audio).trim();

        const filtered = currentList.filter(item => {
            const itemId = String(item.id || item.audio).trim();
            return itemId !== songId && (item.audio !== song.audio || !item.audio);
        });

        const newEntry = {
            id: songId,
            name: String(song.name || song.title || 'Untitled').replace(/\\'/g, "'").trim(),
            artist: String(song.artist || 'Unknown Artist').replace(/\\'/g, "'").trim(),
            cover: song.cover || '../../public/branding/Spotiwind.webp',
            audio: song.audio || '',
            duration: Number(song.duration) || 0,
            playedAt: Date.now()
        };

        filtered.unshift(newEntry);

        if (filtered.length > MAX_LOCAL_ITEMS) {
            filtered.length = MAX_LOCAL_ITEMS;
        }

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));

        // Dispatch window event for reactive UI updates
        window.dispatchEvent(new CustomEvent('recently-played-updated', { detail: filtered }));

        // Queue debounced cloud sync for this played song document
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.uid) {
            queueSongCloudSync(currentUser.uid, newEntry);
        }
    } catch (e) {
        console.warn("Failed to record recently played song:", e);
    }
};

/**
 * Queue debounced write to Firestore for a specific song in users/{uid}/recently_played/{songId}
 */
const queueSongCloudSync = (uid, song) => {
    if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
    }

    syncTimeoutId = setTimeout(async () => {
        try {
            const songId = String(song.id || song.audio).trim();
            if (!songId) return;

            const docRef = getRecentlyPlayedDocRef(uid, songId);
            await setDoc(docRef, {
                id: songId,
                name: String(song.name || ''),
                artist: String(song.artist || ''),
                cover: String(song.cover || ''),
                audio: String(song.audio || ''),
                duration: Number(song.duration) || 0,
                playedAt: serverTimestamp()
            }, { merge: true });

            // Otomatis hapus lagu tertua jika melebihi batas MAX_CLOUD_ITEMS (30 lagu)
            await pruneOldestCloudSongs(uid);
        } catch (error) {
            if (error?.code !== 'permission-denied') {
                console.warn("Cloud recently played sync notice:", error?.message || error);
            }
        }
    }, SYNC_DEBOUNCE_MS);
};

/**
 * Otomatis menghapus dokumen lagu paling lama dari Firestore jika jumlahnya melebihi MAX_CLOUD_ITEMS (30)
 */
const pruneOldestCloudSongs = async (uid) => {
    try {
        const q = query(
            getRecentlyPlayedCollectionRef(uid),
            orderBy("playedAt", "desc")
        );
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > MAX_CLOUD_ITEMS) {
            const excessDocs = snapshot.docs.slice(MAX_CLOUD_ITEMS);
            const deletePromises = excessDocs.map((docSnap) => deleteDoc(docSnap.ref));
            await Promise.all(deletePromises);
        }
    } catch {
        // Silently handled
    }
};

/**
 * Helper to parse snapshot documents into clean song objects
 */
const parseCloudDocs = (docs) => {
    return docs.map(docSnap => {
        const data = docSnap.data();
        let playedAtMillis = Date.now();
        if (data.playedAt?.toMillis && typeof data.playedAt.toMillis === 'function') {
            playedAtMillis = data.playedAt.toMillis();
        } else if (data.playedAt?.seconds) {
            playedAtMillis = data.playedAt.seconds * 1000;
        } else if (typeof data.playedAt === 'number') {
            playedAtMillis = data.playedAt;
        }

        return {
            id: docSnap.id,
            name: String(data.name || 'Untitled').replace(/\\'/g, "'").trim(),
            artist: String(data.artist || 'Unknown Artist').replace(/\\'/g, "'").trim(),
            cover: data.cover || '../../public/branding/Spotiwind.webp',
            audio: data.audio || '',
            duration: Number(data.duration) || 0,
            playedAt: playedAtMillis
        };
    });
};

/**
 * Subscribe to realtime Recently Played changes from Cloud Firestore across all devices
 */
export const subscribeRecentlyPlayed = (uid, callback) => {
    if (!uid) return () => {};

    try {
        const q = query(
            getRecentlyPlayedCollectionRef(uid),
            orderBy("playedAt", "desc"),
            limit(MAX_CLOUD_ITEMS)
        );

        return onSnapshot(q, (snapshot) => {
            const cloudItems = parseCloudDocs(snapshot.docs);

            if (cloudItems.length > 0) {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloudItems));
                window.dispatchEvent(new CustomEvent('recently-played-updated', { detail: cloudItems }));
            }

            if (typeof callback === 'function') {
                callback(cloudItems);
            }
        }, (error) => {
            if (error?.code !== 'permission-denied') {
                console.warn("Realtime recently played listener notice:", error?.message || error);
            }
        });
    } catch (e) {
        console.warn("Failed to subscribe to recently played:", e);
        return () => {};
    }
};

/**
 * Sync recently played songs from Cloud Firestore into local storage on login / app start
 */
export const syncRecentlyPlayedFromCloud = async (uid) => {
    if (!uid) return [];

    try {
        const q = query(
            getRecentlyPlayedCollectionRef(uid),
            orderBy("playedAt", "desc"),
            limit(MAX_CLOUD_ITEMS)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return getRecentlyPlayed();
        }

        const cloudItems = parseCloudDocs(snapshot.docs);
        const localItems = getRecentlyPlayed();

        // Merge cloud and local items uniquely, sorted by latest playedAt
        const itemMap = new Map();

        // Add local first
        localItems.forEach(item => {
            const key = String(item.id || item.audio).trim();
            if (key) itemMap.set(key, item);
        });

        // Merge cloud items (override if newer or missing)
        cloudItems.forEach(item => {
            const key = String(item.id || item.audio).trim();
            if (!key) return;
            if (!itemMap.has(key)) {
                itemMap.set(key, item);
            } else {
                const existing = itemMap.get(key);
                if ((item.playedAt || 0) > (existing.playedAt || 0)) {
                    itemMap.set(key, item);
                }
            }
        });

        const mergedList = Array.from(itemMap.values())
            .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
            .slice(0, MAX_LOCAL_ITEMS);

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedList));
        window.dispatchEvent(new CustomEvent('recently-played-updated', { detail: mergedList }));

        return mergedList;
    } catch (error) {
        if (error?.code !== 'permission-denied') {
            console.warn("Cloud recently played fetch notice:", error?.message || error);
        }
        return getRecentlyPlayed();
    }
};

/**
 * Clear recently played history locally and in the cloud
 */
export const clearRecentlyPlayed = async (uid) => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('recently-played-updated', { detail: [] }));

    if (uid) {
        try {
            const snapshot = await getDocs(getRecentlyPlayedCollectionRef(uid));
            const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
            await Promise.all(deletePromises);
        } catch (error) {
            if (error?.code !== 'permission-denied') {
                console.warn("Failed to clear recently played from cloud:", error);
            }
        }
    }
};
