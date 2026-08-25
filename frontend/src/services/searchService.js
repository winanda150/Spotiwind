import { searchTracks, searchTracksByName, searchArtistsByName, searchAlbumsByName, getTrendingTracks } from "./jamendoService.js";

const getRelevanceScore = (query, ...values) => {
    const normalizedValues = values.filter(Boolean).map((value) => value.toLowerCase());
    if (normalizedValues.some((value) => value === query)) return 100;
    if (normalizedValues.some((value) => value.startsWith(query))) return 80;
    if (normalizedValues.some((value) => value.includes(query))) return 60;
    return 0;
};

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

export const searchCatalogData = async (query, localSongs = [], localArtists = [], limit = 10) => {
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery || normalizedQuery.length < 2) return { songs: [], artists: [], albums: [] };

    const words = normalizedQuery.split(/\s+/);
    const localResults = localSongs
        .filter((song) => words.every((word) => `${song.name} ${song.artist}`.toLowerCase().includes(word)))
        .map((song) => ({ ...song, type: 'song', isLocal: true, searchRank: 200 + getRelevanceScore(normalizedQuery, song.name, song.artist) }));
    const localArtistResults = localArtists
        .filter((artist) => artist.name.toLowerCase().includes(normalizedQuery))
        .map((artist) => ({ ...artist, type: 'artist', isLocal: true, searchRank: 300 + getRelevanceScore(normalizedQuery, artist.name) }));
    const remote = await searchAll(normalizedQuery, limit);
    const remoteSongs = remote.songs.map((song) => ({
        id: song.id,
        name: song.name,
        artist: song.artist_name,
        album: song.album_name,
        cover: song.image,
        audio: song.audio,
        duration: song.duration || 0,
        plays: String(Math.floor((song.stats?.rate_downloads_total || 0) * 5)),
        type: 'song',
        searchRank: 150 + getRelevanceScore(normalizedQuery, song.name, song.artist_name)
    }));
    const remoteArtists = remote.artists
        .filter((artist) => artist.image)
        .map((artist) => ({ id: artist.id, name: artist.name, photo: artist.image, type: 'artist', searchRank: 250 + getRelevanceScore(normalizedQuery, artist.name) }));
    const uniqueSongs = [...new Map([...localResults, ...remoteSongs].map((song) => [song.id, song])).values()];
    const albums = remote.albums
        .map((album) => ({ ...album, relevanceScore: getRelevanceScore(normalizedQuery, album.name, album.artist_name) }))
        .filter((album) => album.image && album.relevanceScore >= 60)
        .map((album) => ({
            id: album.id,
            name: album.name,
            artist: album.artist_name,
            cover: album.image,
            type: 'album',
            searchRank: 50 + album.relevanceScore
        }));

    return {
        songs: uniqueSongs.sort((left, right) => right.searchRank - left.searchRank).slice(0, limit),
        artists: [...localArtistResults, ...remoteArtists].sort((left, right) => right.searchRank - left.searchRank).slice(0, limit),
        albums: albums.sort((left, right) => right.searchRank - left.searchRank).slice(0, limit)
    };
};

export const searchCatalog = async (query, localSongs = [], localArtists = [], limit = 10) => {
    const catalog = await searchCatalogData(query, localSongs, localArtists, limit);
    return [...catalog.artists, ...catalog.songs].slice(0, limit);
};
