import {
    auth,
    db,
    collection,
    query as firestoreQuery,
    orderBy,
    limit,
    getDocs,
    doc,
    setDoc,
    deleteDoc,
    onAuthStateChanged
} from "../assets/js/firebase-config.js";

const MAX_RECENT_SEARCHES = 6;
const LOCAL_STORAGE_KEY = 'spotiwind-recent-searches';

const getRecentSearchesRef = (uid) => collection(db, 'users', uid, 'recent_searches');

const getQueryId = (queryText) => {
    let hash = 0;
    for (let index = 0; index < queryText.length; index += 1) {
        hash = ((hash << 5) - hash) + queryText.charCodeAt(index);
        hash |= 0;
    }
    return `query-${Math.abs(hash)}`;
};

export const getLocalRecentSearches = () => {
    try {
        const savedSearches = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        return Array.isArray(savedSearches)
            ? savedSearches.filter((item) => typeof item === 'string' && item.trim()).slice(0, MAX_RECENT_SEARCHES)
            : [];
    } catch {
        return [];
    }
};

const saveLocalRecentSearches = (searches) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
};

/**
 * Migrates any guest recent searches stored in localStorage to Firebase Firestore upon login,
 * then cleans up the localStorage key so subsequent operations purely rely on Firebase.
 */
export const migrateGuestSearchesToCloud = async (uid) => {
    if (!uid) return;
    const localSearches = getLocalRecentSearches();
    if (localSearches.length === 0) return;

    try {
        const now = Date.now();
        // Upload each local search item to Firestore (preserving order with descending timestamps)
        await Promise.all(localSearches.map((queryText, index) => {
            const queryId = getQueryId(queryText.toLowerCase());
            return setDoc(doc(getRecentSearchesRef(uid), queryId), {
                query: queryText,
                createdAt: now - (index * 1000)
            }, { merge: true });
        }));

        // Clean up guest local storage so it is never re-uploaded or mixed with cloud data
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
        console.error('Failed to migrate guest searches to cloud:', error);
    }
};

// Automatic listener to migrate guest search history as soon as user logs in
if (typeof onAuthStateChanged === 'function') {
    onAuthStateChanged(auth, async (user) => {
        if (user?.uid) {
            await migrateGuestSearchesToCloud(user.uid);
        }
    });
}

export const getRecentSearches = async () => {
    const uid = auth.currentUser?.uid;

    // GUEST: read exclusively from localStorage
    if (!uid) {
        return getLocalRecentSearches();
    }

    // LOGGED IN USER: ensure any guest searches are migrated first
    await migrateGuestSearchesToCloud(uid);

    // Read exclusively from Firebase Firestore
    try {
        const recentQuery = firestoreQuery(
            getRecentSearchesRef(uid),
            orderBy('createdAt', 'desc'),
            limit(MAX_RECENT_SEARCHES)
        );
        const snapshot = await getDocs(recentQuery);
        const cloudSearches = snapshot.docs
            .map((item) => item.data()?.query)
            .filter((queryText) => typeof queryText === 'string' && queryText.trim());
        return cloudSearches;
    } catch (error) {
        console.error('Failed to load recent searches from Firebase:', error);
        return [];
    }
};

export const saveRecentSearch = async (queryText) => {
    const normalizedQuery = queryText?.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) return;

    const uid = auth.currentUser?.uid;

    // GUEST: save exclusively to localStorage
    if (!uid) {
        const localSearches = [normalizedQuery, ...getLocalRecentSearches().filter(
            (item) => item.toLowerCase() !== normalizedQuery.toLowerCase()
        )];
        saveLocalRecentSearches(localSearches);
        return;
    }

    // LOGGED IN USER: save exclusively to Firebase Firestore
    try {
        await setDoc(doc(getRecentSearchesRef(uid), getQueryId(normalizedQuery.toLowerCase())), {
            query: normalizedQuery,
            createdAt: Date.now()
        });
    } catch (error) {
        console.error('Failed to save recent search to Firebase:', error);
    }
};

export const clearRecentSearches = async () => {
    const uid = auth.currentUser?.uid;

    // GUEST: clear localStorage
    if (!uid) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return;
    }

    // LOGGED IN USER: clear exclusively from Firebase Firestore
    try {
        const snapshot = await getDocs(getRecentSearchesRef(uid));
        await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    } catch (error) {
        console.error('Failed to clear recent searches from Firebase:', error);
    }
};