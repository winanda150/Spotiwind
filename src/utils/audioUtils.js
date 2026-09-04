/**
 * Spotiwind — Shared Audio & Song Comparison Utilities
 */

/**
 * Helper to accurately normalize audio URLs for comparison
 * @param {string} url
 * @returns {string}
 */
export const normalizeAudio = (url) => {
    if (!url || typeof url !== 'string') return '';
    try {
        let clean = decodeURIComponent(url.trim().toLowerCase());
        clean = clean.replace(/^https?:\/\/[^/]+/, '');
        clean = clean.split('?')[0].split('#')[0];
        clean = clean.replace(/^(\.\.\/)+/, '').replace(/^\/?frontend\//, '').replace(/^\/?public\//, '').replace(/^elemen\//, 'music/').replace(/^\/+/, '');
        return clean;
    } catch {
        return url.toLowerCase().trim();
    }
};

/**
 * Helper to normalize alphanumeric text for fuzzy matching
 * @param {string} text
 * @returns {string}
 */
export const normalizeText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

/**
 * Helper to check if two audio URLs reference the same file
 * @param {string} url1
 * @param {string} url2
 * @returns {boolean}
 */
export const isSameAudio = (url1, url2) => {
    if (!url1 || !url2) return false;
    const n1 = normalizeAudio(url1);
    const n2 = normalizeAudio(url2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    const file1 = n1.split('/').pop();
    const file2 = n2.split('/').pop();
    if (file1 && file2 && file1 === file2) return true;
    return n1.endsWith(n2) || n2.endsWith(n1);
};

/**
 * Helper to check if two song objects refer to the same song
 * @param {Object} song
 * @param {Object} otherSong
 * @returns {boolean}
 */
export const areSameSongs = (song, otherSong) => {
    if (!song || !otherSong) return false;

    // 1. Direct ID match or prefix-stripped match
    const s1Id = String(song.id || song.songId || song.docId || '').trim().toLowerCase();
    const s2Id = String(otherSong.id || otherSong.songId || otherSong.docId || '').trim().toLowerCase();
    if (s1Id && s2Id) {
        if (s1Id === s2Id) return true;
        const cleanId1 = s1Id.replace(/^songs?-/, '');
        const cleanId2 = s2Id.replace(/^songs?-/, '');
        if (cleanId1 && cleanId2 && cleanId1 === cleanId2) return true;
    }

    // 2. Audio URL match (normalized relative path or filename)
    const s1Audio = song.audio || song.audioUrl || song.songAudio;
    const s2Audio = otherSong.audio || otherSong.audioUrl || otherSong.songAudio;
    if (s1Audio && s2Audio && isSameAudio(s1Audio, s2Audio)) {
        return true;
    }

    // 3. Name & Artist match
    const s1Name = normalizeText(song.name || song.title);
    const s2Name = normalizeText(otherSong.name || otherSong.title);
    const s1Artist = normalizeText(song.artist || song.artist_name);
    const s2Artist = normalizeText(otherSong.artist || otherSong.artist_name);

    if (s1Name && s2Name && s1Name === s2Name) {
        if (!s1Artist || !s2Artist || s1Artist === s2Artist || s1Artist.includes(s2Artist) || s2Artist.includes(s1Artist)) {
            return true;
        }
    }

    return false;
};

/**
 * [AUTO-HASH] Base62 22-Character Artist ID Generator
 * Generates a deterministic 22-char Base62 ID for any artist
 * @param {Object} artist
 * @returns {string}
 */
export const getArtistUniqueId = (artist) => {
    if (!artist) return '';
    const rawId = String(artist.id || '').trim();
    if (/^[0-9a-zA-Z]{22}$/.test(rawId)) {
        return rawId;
    }

    const key = String(artist.name || artist.id || '').trim().toLowerCase();
    if (!key) return '';

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    // FNV-1a 32-bit Hash
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    // Deterministic Pseudo-Random Generator (LCG) with unsigned 32-bit
    let state = hash >>> 0;
    let result = '';
    for (let i = 0; i < 22; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const code = key.charCodeAt(i % key.length) || 0;
        const index = Math.abs((state + code + i) % chars.length);
        result += chars.charAt(index % chars.length);
    }
    return result;
};
