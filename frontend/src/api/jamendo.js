/**
 * @file jamendo.js
 * @description API Hub untuk semua interaksi dengan Jamendo API.
 *              Ini memusatkan semua logika fetch, penambahan client_id,
 *              dan penanganan error dasar.
 */

const CLIENT_ID = '17b8da78';
const BASE_URL = 'https://api.jamendo.com/v3.0';

/**
 * Fungsi dasar untuk melakukan fetch dengan retry.
 * @param {string} url - URL untuk di-fetch.
 * @param {object} options - Opsi untuk fetch.
 * @param {number} retries - Jumlah percobaan ulang.
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
 * Fungsi generik untuk mengambil data dari endpoint Jamendo.
 * @param {string} endpoint - Path API, contoh: '/tracks'.
 * @param {object} params - Parameter query, contoh: { limit: 10, order: 'popularity_total' }.
 * @returns {Promise<Array>} - Hasil dari API dalam bentuk array.
 */
async function fetchFromJamendo(endpoint, params = {}) {
    // Tambahkan client_id dan format secara otomatis ke setiap request
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
        // Mengembalikan array kosong agar UI tidak rusak dan bisa di-retry
        return [];
    }
}

// Ekspor fungsi-fungsi yang lebih spesifik untuk setiap kebutuhan
export const getTopArtists = (limit = 50) => fetchFromJamendo('/artists/', { limit, order: 'popularity_total' });

export const getArtistTracks = (artistId, limit = 20) => fetchFromJamendo('/tracks/', { limit, artist_id: artistId, order: 'popularity_total', include: 'stats' });

export const getArtistTracksByName = (artistName, limit = 20) => fetchFromJamendo('/tracks/', { limit, artist_name: encodeURIComponent(artistName), order: 'popularity_total', include: 'stats' });

export const getTrendingTracks = (limit = 50) => fetchFromJamendo('/tracks/', { limit, order: 'popularity_total', include: 'stats' });

export const getNewReleases = (limit = 50) => fetchFromJamendo('/tracks/', { limit, order: 'releasedate_desc', include: 'stats' });

export const searchTracks = (query, limit = 10) => fetchFromJamendo('/tracks/', { limit, search: encodeURIComponent(query), include: 'stats' });

export const searchTracksByName = (query, limit = 10) => fetchFromJamendo('/tracks/', { limit, namesearch: encodeURIComponent(query), include: 'stats' });

export const searchArtistsByName = (query, limit = 3) => fetchFromJamendo('/artists/', { limit, namesearch: encodeURIComponent(query) });