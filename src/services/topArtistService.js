import {
    db,
    collection,
    query as firestoreQuery,
    getDocs,
    onSnapshot,
    orderBy,
    limit,
    doc,
    setDoc,
    increment,
    serverTimestamp
} from "../assets/js/firebase-config.js";

const DEFAULT_LIMIT = 10;
const TOP_ARTISTS_COLLECTION = 'top_artists';

// Cache for known local artists metadata (loaded on demand)
let knownLocalArtistsMap = null;

// Debounce to prevent rapid duplicate writes per artist
const recentlyRecordedArtists = new Map();
const RECORD_COOLDOWN_MS = 15000; // 15 seconds cooldown per artist

const getTopArtistsRef = () => collection(db, TOP_ARTISTS_COLLECTION);

export const getArtistEntityId = (nameOrId = '') => {
    const raw = String(nameOrId || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return raw || 'unknown-artist';
};

export const normalizeArtistPhotoUrl = (url) => {
    if (!url || typeof url !== 'string') return '../../public/branding/Spotiwind.webp';

    if (url.startsWith('http://') || url.startsWith('https://')) {
        if (url.includes('/frontend/public/')) {
            url = url.split('/frontend/public/')[1];
        } else if (url.includes('/public/')) {
            url = url.split('/public/')[1];
        } else if (url.includes('/music/')) {
            url = 'music/' + url.split('/music/')[1];
        } else if (url.includes('/branding/')) {
            url = 'branding/' + url.split('/branding/')[1];
        } else if (url.includes('/Elemen/')) {
            url = 'music/' + url.split('/Elemen/')[1];
        } else {
            return url; // External CDN
        }
    }

    const cleanPath = String(url)
        .replace(/^(\.\.\/)+public\//, '')
        .replace(/^(\.\.\/)+/, '')
        .replace(/^\/?frontend\/public\//, '')
        .replace(/^\/?public\//, '')
        .replace(/^Elemen\/Logo\//, 'branding/')
        .replace(/^Logo\//, 'branding/')
        .replace(/^Elemen\//, 'music/')
        .replace(/Gambar[12]\.webp/gi, 'Hero%20Section.webp')
        .replace(/^\/+/, '');

    return `../../public/${cleanPath}`;
};

/**
 * Load local artists map from manifest if not cached
 */
const loadKnownLocalArtistsMap = async () => {
    if (knownLocalArtistsMap && knownLocalArtistsMap.size > 0) {
        return knownLocalArtistsMap;
    }

    const candidateUrls = [
        '../../public/data/artists.json',
        'public/data/artists.json',
        '/public/data/artists.json',
        `${window.location.origin}/public/data/artists.json`
    ];

    for (const url of candidateUrls) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const artistsList = Array.isArray(data) ? data : (Array.isArray(data.artists) ? data.artists : []);
                if (artistsList.length > 0) {
                    const newMap = new Map();
                    artistsList.forEach(a => {
                        if (a.name) {
                            const artistObj = {
                                id: a.id || getArtistEntityId(a.name),
                                name: a.name,
                                photo: normalizeArtistPhotoUrl(a.photo)
                            };
                            const cleanName = String(a.name).toLowerCase().trim();
                            const cleanId = String(artistObj.id).toLowerCase().trim();
                            const genId = getArtistEntityId(a.name);
                            newMap.set(cleanName, artistObj);
                            newMap.set(cleanId, artistObj);
                            newMap.set(genId, artistObj);
                        }
                    });
                    knownLocalArtistsMap = newMap;
                    return knownLocalArtistsMap;
                }
            }
        } catch {
            // try next candidate URL
        }
    }

    knownLocalArtistsMap = new Map();
    return knownLocalArtistsMap;
};

const getKnownLocalArtist = async (artistNameOrId = '') => {
    if (!artistNameOrId) return null;
    const clean = String(artistNameOrId).toLowerCase().trim();
    const map = await loadKnownLocalArtistsMap();
    if (!map || map.size === 0) return null;

    if (map.has(clean)) {
        return map.get(clean);
    }
    const genId = getArtistEntityId(artistNameOrId);
    if (map.has(genId)) {
        return map.get(genId);
    }
    return null;
};

const isArtistRegistered = async (artistObj) => {
    if (!artistObj) return false;
    const matched = await getKnownLocalArtist(artistObj.name || artistObj.id);
    return !!matched;
};

/**
 * Split a raw artist string into individual artist names.
 * Handles formats: "A & B", "A feat. B", "A ft. B", "A x B", "A and B"
 * Returns an array of trimmed, non-empty artist name strings.
 */
export const splitArtistNames = (rawArtist = '') => {
    if (!rawArtist) return [];
    return String(rawArtist)
        .split(/\s*(?:feat\.?|ft\.?|&|×|✕|\/)\s*/i)
        .map(s => s.trim())
        .filter(Boolean);
};

/**
 * Record a song play for the artist in Firestore top_artists collection.
 * Records play counts for all individual artists so they accumulate rank in database.
 * @param {Object} song - The song object being played
 */
export const recordArtistPlay = async (song) => {
    if (!song) return;

    const rawArtistName = String(song.artist || song.artist_name || '').trim();
    if (!rawArtistName || rawArtistName.toLowerCase() === 'unknown artist') return;

    // Split collaborative artist names into individual artists
    const artistParts = splitArtistNames(rawArtistName);
    if (artistParts.length === 0) return;

    for (const individualArtist of artistParts) {
        const matchedLocal = await getKnownLocalArtist(individualArtist);
        
        // Tetap catat & hitung pemutaran di database walaupun belum ditulis manual di data/artists.json
        const artistId = matchedLocal?.id || getArtistEntityId(individualArtist);
        const artistName = matchedLocal?.name || individualArtist;
        const fallbackPhoto = song.artist_image || song.photo || song.cover || '';
        const artistPhoto = matchedLocal?.photo || normalizeArtistPhotoUrl(fallbackPhoto);

        const now = Date.now();
        if (recentlyRecordedArtists.has(artistId)) {
            const lastRecorded = recentlyRecordedArtists.get(artistId);
            if (now - lastRecorded < RECORD_COOLDOWN_MS) {
                continue; // Skip this artist, still in cooldown
            }
        }
        recentlyRecordedArtists.set(artistId, now);

        try {
            const artistRef = doc(getTopArtistsRef(), artistId);
            const artistData = {
                id: artistId,
                name: artistName,
                photo: artistPhoto,
                playCount: increment(1),
                updatedAt: serverTimestamp()
            };

            await setDoc(artistRef, artistData, { merge: true });
        } catch (error) {
            console.error(`Failed to record artist play for "${artistName}" in Firestore:`, error);
        }
    }
};

/**
 * Stable tie-breaker sorting for top artists
 */
export const sortTopArtists = (list = []) => {
    return [...list].sort((left, right) => {
        const countLeft = Number(left.playCount) || 0;
        const countRight = Number(right.playCount) || 0;

        if (countRight !== countLeft) {
            return countRight - countLeft;
        }

        const getTimestamp = (item) => {
            const ts = item.firstPlayedAt || item.createdAt || item.updatedAt;
            if (!ts) return 0;
            if (typeof ts.toMillis === 'function') return ts.toMillis();
            if (typeof ts.seconds === 'number') return ts.seconds * 1000;
            if (typeof ts === 'number') return ts;
            return 0;
        };

        const timeLeft = getTimestamp(left);
        const timeRight = getTimestamp(right);

        if (timeLeft > 0 && timeRight > 0 && timeLeft !== timeRight) {
            return timeLeft - timeRight; // Yang lebih awal tercatat/diputar tetap di depan
        }

        return 0;
    });
};

/**
 * Automatically syncs & updates artist paths in Firestore if Firestore holds legacy or outdated paths.
 * Checks against both official artists.json metadata and normalizeArtistPhotoUrl.
 * @param {string} docId - Firestore document ID
 * @param {Object} rawData - Raw data stored in Firestore document
 * @param {Object|null} matchedLocal - Matched artist from artists.json if available
 */
export const syncArtistPathToFirestore = async (docId, rawData = {}, matchedLocal = null) => {
    if (!docId) return;

    const rawPhoto = String(rawData.photo || '').trim();
    const rawName = String(rawData.name || '').trim();

    const targetPhoto = matchedLocal?.photo || normalizeArtistPhotoUrl(rawPhoto);
    const targetName = matchedLocal?.name || rawName;

    const hasLegacyPath = !rawPhoto ||
                          rawPhoto.includes('Elemen') ||
                          rawPhoto.includes('frontend') ||
                          rawPhoto.includes('Logo') ||
                          rawPhoto.includes('Gambar1') ||
                          rawPhoto.includes('Gambar2') ||
                          (targetPhoto && rawPhoto !== targetPhoto);

    const hasLegacyName = Boolean(matchedLocal && rawName && rawName !== targetName);

    if (hasLegacyPath || hasLegacyName) {
        try {
            const artistRef = doc(getTopArtistsRef(), docId);
            const updates = {
                photo: targetPhoto,
                updatedAt: serverTimestamp()
            };
            if (targetName) {
                updates.name = targetName;
            }
            await setDoc(artistRef, updates, { merge: true });
        } catch {
            // Background sync is silent to avoid blocking UI
        }
    }
};

/**
 * Fetch top artists once from Firestore.
 * Returns empty array if no data exists in Firestore yet.
 * @param {number} limitCount - Maximum artists to fetch (default: 10)
 * @returns {Promise<Array>} List of top artists
 */
export const getTopArtists = async (limitCount = DEFAULT_LIMIT) => {
    try {
        const q = firestoreQuery(
            getTopArtistsRef(),
            orderBy('playCount', 'desc'),
            limit(100)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return [];
        }

        const processedArtists = [];
        for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data() || {};
            const artistName = String(data.name || '').trim();
            let matched = await getKnownLocalArtist(artistName);
            if (!matched && docSnap.id) {
                matched = await getKnownLocalArtist(docSnap.id);
            }
            if (!matched && data.id) {
                matched = await getKnownLocalArtist(data.id);
            }

            // Filter: Hanya tampilkan artis jika sudah ditulis manual di data/artists.json
            if (!matched) {
                continue;
            }

            // Automatically migrate and fix paths in Firestore background
            syncArtistPathToFirestore(docSnap.id, data, matched);

            const resolvedPhoto = matched.photo || normalizeArtistPhotoUrl(data.photo);
            const resolvedName = matched.name || artistName || 'Unknown Artist';
            const resolvedId = matched.id || docSnap.id;

            processedArtists.push({
                ...data,
                id: resolvedId,
                name: resolvedName,
                photo: resolvedPhoto,
                playCount: Number(data.playCount) || 0
            });
        }

        return sortTopArtists(processedArtists).slice(0, limitCount);
    } catch (error) {
        console.error('Failed to get top artists from Firestore:', error);
        return [];
    }
};

/**
 * Real-time subscription to top artists in Firestore.
 * Returns empty array if no data exists in Firestore yet.
 * @param {Function} callback - Callback function receiving top artists list
 * @param {number} limitCount - Maximum artists to return (default: 10)
 * @returns {Function} Unsubscribe function
 */
export const subscribeTopArtists = (callback, limitCount = DEFAULT_LIMIT) => {
    try {
        const q = firestoreQuery(
            getTopArtistsRef(),
            orderBy('playCount', 'desc'),
            limit(100)
        );

        return onSnapshot(q, async (snapshot) => {
            if (snapshot.empty) {
                callback([]);
                return;
            }

            const processedArtists = [];
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data() || {};
                const artistName = String(data.name || '').trim();
                let matched = await getKnownLocalArtist(artistName);
                if (!matched && docSnap.id) {
                    matched = await getKnownLocalArtist(docSnap.id);
                }
                if (!matched && data.id) {
                    matched = await getKnownLocalArtist(data.id);
                }

                // Filter: Hanya tampilkan artis jika sudah ditulis manual di data/artists.json
                if (!matched) {
                    continue;
                }

                // Automatically migrate and fix paths in Firestore background
                syncArtistPathToFirestore(docSnap.id, data, matched);

                const resolvedPhoto = matched.photo || normalizeArtistPhotoUrl(data.photo);
                const resolvedName = matched.name || artistName || 'Unknown Artist';
                const resolvedId = matched.id || docSnap.id;

                processedArtists.push({
                    ...data,
                    id: resolvedId,
                    name: resolvedName,
                    photo: resolvedPhoto,
                    playCount: Number(data.playCount) || 0
                });
            }

            const sorted = sortTopArtists(processedArtists);
            callback(sorted.slice(0, limitCount));
        }, (error) => {
            console.error('Failed to subscribe to top artists in Firestore:', error);
            callback([]);
        });
    } catch (error) {
        console.error('Failed to set up top artists listener:', error);
        callback([]);
        return () => {};
    }
};
