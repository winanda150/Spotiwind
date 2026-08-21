import { searchTracks, searchArtistsByName, getTrendingTracks } from "./jamendoService.js";

export const searchSongs = async (query, limit = 10) => {
    if (!query || !query.trim()) return [];
    return searchTracks(query, limit);
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
