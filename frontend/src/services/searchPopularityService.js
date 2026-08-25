import {
    auth,
    db,
    collection,
    query as firestoreQuery,
    onSnapshot,
    orderBy,
    limit,
    doc,
    setDoc,
    increment,
    serverTimestamp
} from "../assets/js/firebase-config.js";

const MAX_RESULTS = 10;
const SEARCH_STATS_COLLECTION = 'search_stats';

const getStatsRef = (type) => collection(db, SEARCH_STATS_COLLECTION, type, 'items');

const getEntityId = (type, item) => `${type}-${String(item.id || item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export const recordSearchSelection = async (type, item) => {
    if (!auth.currentUser || !['songs', 'artists', 'albums'].includes(type) || (!item?.id && !item?.name)) return;

    try {
        const itemRef = doc(getStatsRef(type), getEntityId(type, item));
        const itemData = type === 'artists'
            ? { id: item.id, name: item.name, photo: item.photo || item.image || '' }
            : { id: item.id, name: item.name, artist: item.artist || item.artist_name || '', cover: item.cover || item.image || '', audio: item.audio || '', duration: Number(item.duration) || 0 };
        await setDoc(itemRef, { ...itemData, type, searchCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
        console.error(`Failed to record popular ${type}:`, error);
    }
};

export const subscribePopularSearches = (type, callback, resultLimit = MAX_RESULTS) => {
    const popularQuery = firestoreQuery(getStatsRef(type), orderBy('searchCount', 'desc'), limit(resultLimit));

    return onSnapshot(popularQuery, (snapshot) => {
        const firestoreItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        callback(firestoreItems);
    }, (error) => {
        console.error(`Failed to subscribe to popular ${type}:`, error);
        callback([]);
    });
};