import { searchTracks, searchTracksByName, searchArtistsByName, getTrendingTracks } from "./jamendoService.js";

export const searchSongs = async (query, limit = 10) => {
    if (!query || !query.trim()) return [];
    const [tracks, namedTracks] = await Promise.all([
        searchTracks(query, limit),
        searchTracksByName(query, limit)
    ]);
    return [...new Map([...tracks, ...namedTracks].map((song) => [song.id, song])).values()];
};

export const searchArtists = async (query, limit = 3) => {
    if (!query || !query.trim()) return [];
    return searchArtistsByName(query, limit);
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

    const [songs, artists] = await Promise.all([
        searchSongs(normalizedQuery, limit),
        searchArtists(normalizedQuery, Math.max(1, Math.min(3, limit)))
    ]);

    return { songs, artists };
};

export const searchCatalog = async (query, localSongs = [], localArtists = [], limit = 10) => {
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const words = normalizedQuery.split(/\s+/);
    const localResults = localSongs
        .filter((song) => words.every((word) => `${song.name} ${song.artist}`.toLowerCase().includes(word)))
        .map((song) => ({ ...song, type: 'song', isLocal: true }));
    const localArtistResults = localArtists
        .filter((artist) => artist.name.toLowerCase().includes(normalizedQuery))
        .map((artist) => ({ ...artist, type: 'artist' }));
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
        type: 'song'
    }));
    const remoteArtists = remote.artists
        .filter((artist) => artist.image)
        .map((artist) => ({ id: artist.id, name: artist.name, photo: artist.image, type: 'artist' }));
    const uniqueSongs = [...new Map([...localResults, ...remoteSongs].map((song) => [song.id, song])).values()];
    return [...localArtistResults, ...remoteArtists, ...uniqueSongs].slice(0, limit);
};
