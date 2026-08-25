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
    deleteDoc
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

export const getRecentSearches = async () => {
    const localSearches = getLocalRecentSearches();
    const uid = auth.currentUser?.uid;
    if (!uid) return localSearches;

    try {
        const recentQuery = firestoreQuery(
            getRecentSearchesRef(uid),
            orderBy('createdAt', 'desc'),
            limit(MAX_RECENT_SEARCHES)
        );
        const snapshot = await getDocs(recentQuery);
        const cloudSearches = snapshot.docs
            .map((item) => item.data().query)
            .filter((queryText) => typeof queryText === 'string' && queryText.trim());
        const mergedSearches = [...cloudSearches, ...localSearches.filter(
            (localQuery) => !cloudSearches.some((cloudQuery) => cloudQuery.toLowerCase() === localQuery.toLowerCase())
        )].slice(0, MAX_RECENT_SEARCHES);
        saveLocalRecentSearches(mergedSearches);
        return mergedSearches;
    } catch (error) {
        console.error('Failed to load recent searches:', error);
        return localSearches;
    }
};

export const saveRecentSearch = async (queryText) => {
    const normalizedQuery = queryText?.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) return;

    const localSearches = [normalizedQuery, ...getLocalRecentSearches().filter(
        (item) => item.toLowerCase() !== normalizedQuery.toLowerCase()
    )];
    saveLocalRecentSearches(localSearches);

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
        await setDoc(doc(getRecentSearchesRef(uid), getQueryId(normalizedQuery.toLowerCase())), {
            query: normalizedQuery,
            createdAt: Date.now()
        });
    } catch (error) {
        console.error('Failed to save recent search:', error);
    }
};

export const clearRecentSearches = async () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
        const snapshot = await getDocs(getRecentSearchesRef(uid));
        await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    } catch (error) {
        console.error('Failed to clear recent searches:', error);
    }
};