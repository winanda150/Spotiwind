import { searchTracks, searchTracksByName, searchArtistsByName, searchAlbumsByName, getTrendingTracks } from "./jamendoService.js";
import { searchLocalSongs, searchLocalArtists, searchLocalAlbums, getFuzzyRelevanceScore } from "./fuzzySearch.js";

export const searchSongs = async (query, limit = 10) => {
    if (!query || !query.trim()) return [];
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return [];
    const [tracks, namedTracks] = await Promise.all([
        searchTracks(normalizedQuery, limit),
        searchTracksByName(normalizedQuery, limit)
    ]);
    return [...new Map([...tracks, ...namedTracks].map((song) => [song.id, song])).values()];
};

export const searchArtists = async (query, limit = 3) => {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) return [];
    return searchArtistsByName(normalizedQuery, limit);
};

export const searchAll = async (query, limit = 10) => {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) {
        return {
            songs: [],
            artists: [],
            trending: await getTrendingTracks(limit)
        };
    }
    if (normalizedQuery.length < 2) return { songs: [], artists: [], albums: [] };

    const [songs, artists, albums] = await Promise.all([
        searchSongs(normalizedQuery, limit),
        searchArtists(normalizedQuery, Math.max(1, Math.min(3, limit))),
        searchAlbumsByName(normalizedQuery, limit)
    ]);

    return { songs, artists, albums };
};

export const searchCatalogData = async (query, localSongs = [], localArtists = [], localAlbums = [], limit = 10) => {
    // Backward compatibility: if 4th argument is a number, it represents limit
    if (typeof localAlbums === 'number') {
        limit = localAlbums;
        localAlbums = [];
    }

    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery || normalizedQuery.length < 2) return { songs: [], artists: [], albums: [] };

    // ── Fuzzy search over local data (instant, no network) ──
    const localResults = searchLocalSongs(normalizedQuery, localSongs);
    const localArtistResults = searchLocalArtists(normalizedQuery, localArtists);
    const localAlbumResults = searchLocalAlbums(normalizedQuery, localAlbums);

    // ── Remote search via Jamendo API ──
    const remote = await searchAll(normalizedQuery, limit);
    const remoteSongs = (remote.songs || [])
        .map((song) => {
            const relevance = getFuzzyRelevanceScore(normalizedQuery, song.name, song.artist_name);
            return {
                id: song.id,
                name: song.name,
                artist: song.artist_name,
                album: song.album_name,
                cover: song.image,
                audio: song.audio,
                duration: song.duration || 0,
                plays: String(Math.floor((song.stats?.rate_downloads_total || 0) * 5)),
                type: 'song',
                _relevance: relevance,
                searchRank: 100 + Math.round(relevance * 1.5)
            };
        })
        .filter((song) => song._relevance >= 20);

    const remoteArtists = (remote.artists || [])
        .filter((artist) => artist.image)
        .map((artist) => {
            const relevance = getFuzzyRelevanceScore(normalizedQuery, artist.name);
            return {
                id: artist.id,
                name: artist.name,
                photo: artist.image,
                type: 'artist',
                _relevance: relevance,
                searchRank: 100 + Math.round(relevance * 1.5) + (relevance >= 70 ? 10 : 0)
            };
        })
        .filter((artist) => artist._relevance >= 20);

    // ── Remote Albums via Jamendo API ──
    const remoteAlbums = (remote.albums || [])
        .map((album) => ({ ...album, relevanceScore: getFuzzyRelevanceScore(normalizedQuery, album.name, album.artist_name) }))
        .filter((album) => album.image && album.relevanceScore >= 30)
        .map((album) => ({
            id: album.id,
            name: album.name,
            artist: album.artist_name,
            cover: album.image,
            type: 'album',
            isLocal: false,
            searchRank: 50 + album.relevanceScore // Remote Jamendo rank base is 50-150, local albums are 200-400
        }));

    // ── Merge & deduplicate: local results take priority (higher searchRank) ──
    const uniqueSongs = [...new Map([...localResults, ...remoteSongs].map((song) => [song.id, song])).values()];
    const uniqueAlbums = [...new Map([...localAlbumResults, ...remoteAlbums].map((album) => [album.id, album])).values()];

    return {
        songs: uniqueSongs.sort((left, right) => right.searchRank - left.searchRank).slice(0, limit),
        artists: [...localArtistResults, ...remoteArtists].sort((left, right) => right.searchRank - left.searchRank).slice(0, limit),
        albums: uniqueAlbums.sort((left, right) => right.searchRank - left.searchRank).slice(0, limit)
    };
};

export const searchCatalog = async (query, localSongs = [], localArtists = [], localAlbums = [], limit = 10) => {
    const catalog = await searchCatalogData(query, localSongs, localArtists, localAlbums, limit);
    return [...catalog.artists, ...catalog.songs, ...catalog.albums].slice(0, limit);
};
