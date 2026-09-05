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

const getEntityId = (type, item) => {
    let raw = '';
    if (type === 'songs' && item.artist && item.name) {
        raw = `${item.artist}-${item.name}`;
    } else if (type === 'artists') {
        raw = item.name || item.id || '';
    } else if (type === 'albums') {
        raw = item.artist ? `${item.artist}-${item.name}` : (item.name || item.id || '');
    } else {
        raw = item.id || item.name || '';
    }

    const clean = String(raw)
        .toLowerCase()
        .replace(/^(songs|artists|albums)-+/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return clean || 'unknown';
};

export const normalizePopularityAssetUrl = (url) => {
    if (!url || typeof url !== 'string') return '';

    // If it's an absolute URL containing local asset path (from localhost, vercel, github pages, etc.)
    if (url.startsWith('http://') || url.startsWith('https://')) {
        if (url.includes('/frontend/public/')) {
            url = url.split('/frontend/public/')[1];
        } else if (url.includes('/public/')) {
            url = url.split('/public/')[1];
        } else if (url.includes('/music/')) {
            url = 'music/' + url.split('/music/')[1];
        } else if (url.includes('/images/')) {
            url = 'images/' + url.split('/images/')[1];
        } else if (url.includes('/branding/')) {
            url = 'branding/' + url.split('/branding/')[1];
        } else if (url.includes('/Elemen/')) {
            url = 'music/' + url.split('/Elemen/')[1];
        } else {
            return url; // External CDN (e.g. Jamendo)
        }
    }

    const cleanPath = String(url)
        .replace(/^(\.\.\/)+public\//, '')
        .replace(/^(\.\.\/)+/, '')
        .replace(/^\/?frontend\/public\//, '')
        .replace(/^\/?public\//, '')
        .replace(/^Elemen\/Logo\//, 'branding/')
        .replace(/^Elemen\//, 'music/')
        .replace(/^\/+/, '');

    return `../../public/${cleanPath}`;
};

export const recordSearchSelection = async (type, item) => {
    if (!['songs', 'artists', 'albums'].includes(type) || (!item?.id && !item?.name)) return;

    try {
        const itemRef = doc(getStatsRef(type), getEntityId(type, item));
        const itemData = type === 'artists'
            ? { 
                id: item.id, 
                name: item.name, 
                photo: normalizePopularityAssetUrl(item.photo || item.image || '') 
              }
            : { 
                id: item.id, 
                name: item.name, 
                artist: item.artist || item.artist_name || '', 
                cover: normalizePopularityAssetUrl(item.cover || item.image || ''), 
                audio: normalizePopularityAssetUrl(item.audio || ''), 
                duration: Number(item.duration) || 0 
              };
        await setDoc(itemRef, { ...itemData, type, searchCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
        console.error(`Failed to record popular ${type}:`, error);
    }
};

export const subscribePopularSearches = (type, callback, resultLimit = MAX_RESULTS) => {
    const popularQuery = firestoreQuery(getStatsRef(type), orderBy('searchCount', 'desc'), limit(resultLimit));

    return onSnapshot(popularQuery, (snapshot) => {
        const firestoreItems = snapshot.docs.map((docSnap) => {
            const data = docSnap.data() || {};
            return {
                id: docSnap.id,
                ...data,
                audio: normalizePopularityAssetUrl(data.audio),
                cover: normalizePopularityAssetUrl(data.cover),
                photo: normalizePopularityAssetUrl(data.photo),
                searchCount: Number(data.searchCount) || 0
            };
        });
        callback(firestoreItems);
    }, (error) => {
        console.error(`Failed to subscribe to popular ${type}:`, error);
        callback([]);
    });
};