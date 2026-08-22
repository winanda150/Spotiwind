/**
 * @file jamendoService.js
 * @description API Hub for all interactions with the Jamendo API.
 *              This centralizes all fetch logic, client_id addition,
 *              and basic error handling.
 */

const CLIENT_ID = '17b8da78';
const BASE_URL = 'https://api.jamendo.com/v3.0';

/**
 * Basic fetch function with a retry mechanism.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Options for fetch.
 * @param {number} retries - Number of retry attempts.
 * @returns {Promise<Response>}
 */
const fetchWithRetry = async (url, options = {}, retries = 3) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } catch (error) {
            lastError = error;
            if (i < retries - 1) await new Promise(res => setTimeout(res, 2 ** i * 1000));
        }
    }
    throw lastError;
};

/**
 * Generic function to get data from a Jamendo endpoint.
 * @param {string} endpoint - API path, e.g., '/tracks'.
 * @param {object} params - Query parameters, e.g., { limit: 10, order: 'popularity_total' }.
 * @returns {Promise<Array>} - The API results as an array.
 */
async function fetchFromJamendo(endpoint, params = {}) {
    params.client_id = CLIENT_ID;
    params.format = 'json';

    const queryString = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${endpoint}?${queryString}`;

    try {
        const response = await fetchWithRetry(url);
        const data = await response.json();
        if (data.headers.status !== 'success') {
            throw new Error(`Jamendo Logic Error: ${data.headers.error_message || 'Unknown error'}`);
        }
        return data.results || [];
    } catch (error) {
        console.error(`Failed to fetch from ${url}:`, error);
        return []; // Return an empty array so the UI doesn't break and can be retried.
    }
}

export const getTopArtists = (limit = 50) => fetchFromJamendo('/artists/', { limit, order: 'popularity_total' });
export const getArtistTracks = (artistId, limit = 20) => fetchFromJamendo('/tracks/', { limit, artist_id: artistId, order: 'popularity_total', include: 'stats' });
export const getArtistTracksByName = (artistName, limit = 20) => fetchFromJamendo('/tracks/', { limit, artist_name: artistName, order: 'popularity_total', include: 'stats' });
export const getTrendingTracks = (limit = 50) => fetchFromJamendo('/tracks/', { limit, order: 'popularity_total', include: 'stats' });
export const getNewReleases = (limit = 50) => fetchFromJamendo('/tracks/', { limit, order: 'releasedate_desc', include: 'stats' });
export const searchTracks = (query, limit = 10) => fetchFromJamendo('/tracks/', { limit, search: query, include: 'stats' });
export const searchTracksByName = (query, limit = 10) => fetchFromJamendo('/tracks/', { limit, namesearch: query, include: 'stats' });
export const searchArtistsByName = (query, limit = 3) => fetchFromJamendo('/artists/', { limit, namesearch: query });