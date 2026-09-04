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
 * Deletes any older search documents in Firestore beyond the MAX_RECENT_SEARCHES limit (6).
 * Ensures Firestore only stores the 6 latest searches and saves database storage.
 */
export const pruneOldRecentSearches = async (uid) => {
    if (!uid) return;

    try {
        const q = firestoreQuery(
            getRecentSearchesRef(uid),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > MAX_RECENT_SEARCHES) {
            const staleDocs = snapshot.docs.slice(MAX_RECENT_SEARCHES);
            await Promise.all(staleDocs.map((docSnap) => deleteDoc(docSnap.ref)));
        }
    } catch (error) {
        console.error('Failed to prune old recent searches in Firestore:', error);
    }
};

import { clearLocalRecentSearches } from "./guestHistoryService.js";
export { clearLocalRecentSearches };

export const getRecentSearches = async () => {
    const uid = auth.currentUser?.uid;

    // GUEST: read exclusively from localStorage
    if (!uid) {
        return getLocalRecentSearches();
    }

    // LOGGED IN USER: read exclusively from Firebase Firestore
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
        
        // Asynchronously clean up any excess old queries that are currently accumulated in Firestore
        pruneOldRecentSearches(uid).catch(() => {});

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

    // LOGGED IN USER: save exclusively to Firebase Firestore and prune older docs
    try {
        await setDoc(doc(getRecentSearchesRef(uid), getQueryId(normalizedQuery.toLowerCase())), {
            query: normalizedQuery,
            createdAt: Date.now()
        });

        // Automatically delete older search documents in Firestore beyond the 6 latest
        await pruneOldRecentSearches(uid);
    } catch (error) {
        console.error('Failed to save recent search to Firebase:', error);
    }
};

export const clearRecentSearches = async () => {
    // Always clear localStorage
    clearLocalRecentSearches();

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // LOGGED IN USER: also clear from Firebase Firestore
    try {
        const snapshot = await getDocs(getRecentSearchesRef(uid));
        await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    } catch (error) {
        console.error('Failed to clear recent searches from Firebase:', error);
    }
};