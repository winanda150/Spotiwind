import * as jamendoService from './jamendoService.js';

const uniqueByArtist = (items, maxItems) => {
    const seenArtists = new Set();
    return items.filter((item) => {
        if (seenArtists.has(item.artist_id)) return false;
        seenArtists.add(item.artist_id);
        return seenArtists.size <= maxItems;
    });
};

const formatPlayCount = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(value);
};

const featuredLocalSongs = [
    ['backstreet-boys-shape-of-my-heart', 'Shape Of My Heart', 'Backstreet Boys', 228, 'Backstreet%20Boys/Shape%20Of%20My%20Heart'],
    ['raim-laode-dunia-yang-nanti', 'Dunia Yang Nanti', 'Raim Laode', 200, 'Raim%20Laode/Dunia%20Yang%20Nanti'],
    ['hindia-evaluasi', 'Evaluasi', 'Hindia', 202, 'Hindia/Evaluasi'],
    ['rizky-febian-&-adrian-khalif-alamak', 'Alamak', 'Rizky Febian & Adrian Khalif', 221, 'Rizky%20Febian/Alamak'],
    ['feast-nina', 'Nina', '.Feast', 283, 'Feast/Nina'],
    ['idgitaf-sedia-aku-sebelum-hujan', 'Sedia Aku Sebelum Hujan', 'Idgitaf', 233, 'Idgitaf/Sedia%20Aku%20Sebelum%20Hujan'],
    ['juicy-luicy-lantas', 'Lantas', 'Juicy Luicy', 234, 'Juicy%20Luicy/Lantas'],
    ['vierra-seandainya', 'Seandainya', 'Vierra', 263, 'Vierra/Seandainya'],
    ['for-revenge-&-stereo-wall-jakarta-hari-ini', 'Jakarta Hari Ini', 'For Revenge & Stereo Wall', 224, 'For%20Revenge/Jakarta%20Hari%20Ini'],
    ['radiohead-creep', 'Creep', 'Radiohead', 236, 'Radiohead/Creep'],
    ['batas-senja-kita-usahakan-lagi', 'Kita Usahakan Lagi', 'Batas Senja', 234, 'Batas%20Senja/Kita%20Usahakan%20Lagi'],
    ['bilal-indrajaya-niscaya', 'Niscaya', 'Bilal Indrajaya', 241, 'Bilal%20Indrajaya/Niscaya']
];

export const getPublicAssetUrl = (relativePath) => {
    if (!relativePath) return '';
    if (typeof relativePath !== 'string') return relativePath;

    // If it's an external URL (e.g. Jamendo CDN) and NOT a local domain with /frontend/public/ or /Elemen/
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        if (relativePath.includes('/frontend/public/')) {
            relativePath = relativePath.split('/frontend/public/')[1];
        } else if (relativePath.includes('/Elemen/')) {
            relativePath = 'Elemen/' + relativePath.split('/Elemen/')[1];
        } else {
            return relativePath;
        }
    }

    const cleanPath = String(relativePath)
        .replace(/^(\.\.\/)+public\//, '')
        .replace(/^(\.\.\/)+/, '')
        .replace(/^\/?frontend\/public\//, '')
        .replace(/^\/?public\//, '')
        .replace(/^\/+/, '');

    return `../../public/${cleanPath}`;
};

export const getFeaturedLocalSongs = () => featuredLocalSongs.map(([id, name, artist, duration, path]) => ({
    id,
    name,
    artist,
    plays: '0',
    duration,
    audio: getPublicAssetUrl(`Elemen/${path}.mp3`),
    cover: getPublicAssetUrl(`Elemen/${path.replace(/\/[^/]+$/, '')}/Image%20Songs/${path.split('/').pop()}.webp`)
}));

const normalizeTrack = (item, playCount = 0) => ({
    id: item.id,
    name: item.name,
    artist: item.artist_name,
    album: item.album_name,
    cover: item.image,
    audio: item.audio,
    duration: item.duration || 0,
    plays: formatPlayCount(playCount)
});

export const getTopArtists = async (limit = 10) => {
    const results = await jamendoService.getTopArtists(50);
    return results
        .filter((item) => item.image?.trim())
        .slice(0, limit)
        .map((item) => ({ id: item.id, name: item.name, photo: item.image }));
};

export const getTrendingCatalog = async (limit = 12) => {
    const results = await jamendoService.getTrendingTracks(50);
    return uniqueByArtist(results, limit)
        .map((item) => normalizeTrack(item, Math.floor(Math.random() * 4700000) + 300000));
};

export const getNewReleaseCatalog = async (limit = 12) => {
    const results = await jamendoService.getNewReleases(50);
    return uniqueByArtist(results, limit)
        .map((item) => normalizeTrack(item, Math.floor(Math.random() * 50000) + 1000));
};

export const getArtistCatalog = async (artistId, artistName) => {
    const [byId, byName] = await Promise.all([
        jamendoService.getArtistTracks(artistId, 20),
        jamendoService.getArtistTracksByName(artistName, 20)
    ]);
    const uniqueTracks = [...new Map([...byId, ...byName].map((item) => [item.id, item])).values()];
    return uniqueTracks.map((item) => normalizeTrack(item, (item.stats?.rate_downloads_total || 0) * 5));
};

export const loadLocalCatalog = async (manifestUrl = null) => {
    // If a custom manifestUrl is explicitly provided, load legacy manifest
    if (manifestUrl) {
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error(`Failed to load manifest: ${response.status}`);
        const data = await response.json();
        return {
            artists: (data.artists || []).map((artist) => ({
                ...artist,
                photo: getPublicAssetUrl(artist.photo)
            })),
            songs: (data.songs || []).map((song, index) => ({
                id: song.id || `local-${index}`,
                name: song.name,
                artist: song.artist,
                artistId: song.artistId,
                albumId: song.albumId,
                cover: getPublicAssetUrl(song.cover),
                audio: getPublicAssetUrl(song.audio),
                duration: song.duration || 0,
                plays: formatPlayCount(Math.floor(Math.random() * 99000000) + 1000000)
            })),
            albums: (data.albums || []).map((album) => ({
                ...album,
                cover: getPublicAssetUrl(album.cover)
            }))
        };
    }

    try {
        const artistsUrl = getPublicAssetUrl('data/artists.json');
        const songsUrl = getPublicAssetUrl('data/songs.json');
        const albumsUrl = getPublicAssetUrl('data/albums.json');

        const [artistsRes, songsRes, albumsRes] = await Promise.all([
            fetch(artistsUrl),
            fetch(songsUrl),
            fetch(albumsUrl).catch(() => ({ ok: false }))
        ]);

        if (!artistsRes.ok || !songsRes.ok) {
            throw new Error(`Failed to load data files (artists: ${artistsRes.status}, songs: ${songsRes.status})`);
        }

        const rawArtists = await artistsRes.json();
        const rawSongs = await songsRes.json();
        const rawAlbums = albumsRes.ok ? await albumsRes.json() : [];

        const uniqueSongs = [];
        const seenSongKeys = new Set();

        for (const song of rawSongs || []) {
            const identityCandidates = [
                String(song.id || '').trim().toLowerCase(),
                String(song.audio || '').trim().toLowerCase(),
                `${String(song.name || '').trim().toLowerCase()}|${String(song.artist || '').trim().toLowerCase()}`
            ].filter(Boolean);

            const songKey = identityCandidates.find(Boolean) || '';
            if (!songKey || seenSongKeys.has(songKey)) continue;

            seenSongKeys.add(songKey);
            uniqueSongs.push(song);
        }

        return {
            artists: (rawArtists || []).map((artist) => ({
                ...artist,
                photo: getPublicAssetUrl(artist.photo)
            })),
            songs: uniqueSongs.map((song, index) => ({
                id: song.id || `local-${index}`,
                name: song.name,
                artist: song.artist,
                artistId: song.artistId,
                albumId: song.albumId,
                cover: getPublicAssetUrl(song.cover),
                audio: getPublicAssetUrl(song.audio),
                duration: song.duration || 0,
                plays: formatPlayCount(Math.floor(Math.random() * 99000000) + 1000000)
            })),
            albums: (rawAlbums || []).map((album) => ({
                ...album,
                cover: getPublicAssetUrl(album.cover)
            }))
        };
    } catch (err) {
        console.error('[catalogService] Error loading local catalog:', err);
        return {
            artists: [],
            songs: [],
            albums: []
        };
    }
};

/**
 * Load local albums list
 */
export const loadLocalAlbums = async () => {
    try {
        const albumsUrl = getPublicAssetUrl('data/albums.json');
        const res = await fetch(albumsUrl);
        if (!res.ok) return [];
        const albums = await res.json();
        return albums.map((alb) => ({
            ...alb,
            cover: getPublicAssetUrl(alb.cover)
        }));
    } catch {
        return [];
    }
};

/**
 * Get ordered tracklist for an album
 * @param {Object} album Album entity containing trackIds
 * @param {Array} allSongs List of all available song objects
 * @returns {Array} Ordered songs with track numbers
 */
export const getAlbumTracks = (album, allSongs = []) => {
    if (!album || !Array.isArray(album.trackIds)) return [];
    const songsMap = new Map(allSongs.map((s) => [s.id, s]));

    return album.trackIds
        .map((songId, index) => {
            const song = songsMap.get(songId);
            if (!song) return null;
            return {
                ...song,
                trackNumber: index + 1,
                albumId: album.id,
                albumName: album.name
            };
        })
        .filter(Boolean);
};

export const getLocalArtistCatalog = (songs, artist) => {
    const pathParts = artist.photo?.split('/') || [];
    const elemenIdx = pathParts.indexOf('Elemen');
    const folderName = elemenIdx !== -1 && pathParts[elemenIdx + 1] ? decodeURIComponent(pathParts[elemenIdx + 1]) : artist.name;
    const artistNameLower = (artist.name || '').toLowerCase().trim();

    return songs.filter((song) => {
        try {
            const inFolder = decodeURIComponent(song.audio).includes(`Elemen/${folderName}/`);
            const songArtistLower = (song.artist || '').toLowerCase();
            const isCollaborator = artistNameLower && songArtistLower.includes(artistNameLower);
            
            return inFolder || isCollaborator;
        } catch {
            return false;
        }
    });
};

export const retryCatalogRequest = async (request, maxRetries = 5, delay = 5000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            const result = await request();
            if (result === true || (Array.isArray(result) && result.length > 0)) return result;
        } catch (error) {
            if (attempt === maxRetries) throw error;
        }
        if (attempt < maxRetries) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return false;
};
