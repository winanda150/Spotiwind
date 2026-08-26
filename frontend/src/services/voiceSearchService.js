/**
 * @file voiceSearchService.js
 * @description Intelligent Voice Recognition, Phonetic Matcher, Typo Correction,
 *              and Music Knowledge Engine for Spotiwind.
 *              Learns all local songs, artists, and albums (manifest & memory)
 *              as well as Jamendo API global catalog data.
 */

import { searchTracks, searchTracksByName, searchArtistsByName, searchAlbumsByName, getTrendingTracks, getTopArtists } from './jamendoService.js';
import { loadLocalCatalog, getFeaturedLocalSongs } from './catalogService.js';

// =========================================================================
// 1. PHONETIC SKELETON & SOUNDEX ALGORITHMS (Indonesian & English Acoustics)
// =========================================================================

/**
 * Converts a text string into a phonetic skeleton representation
 * to normalize acoustically similar words, speech-to-text confusions,
 * and dialect/accent variations.
 * @param {string} str 
 * @returns {string}
 */
export const toPhoneticSkeleton = (str) => {
    if (!str) return '';
    let s = str.toLowerCase().trim();

    // 1. Remove non-alphanumeric characters
    s = s.replace(/[^a-z0-9\s]/g, ' ');

    // 2. Reduce recurring vowels and common diphthongs
    s = s
        .replace(/ea|ee|ei|ie|ey/g, 'i')
        .replace(/oo|ou|ow/g, 'u')
        .replace(/oa/g, 'o')
        .replace(/ai|ay/g, 'e')
        .replace(/au|aw/g, 'o');

    // 3. Acoustic consonant normalization for speech recognition confusions
    s = s
        .replace(/f|v|ph/g, 'p')
        .replace(/c(?=[eiy])/g, 's')
        .replace(/c/g, 'k')
        .replace(/q/g, 'k')
        .replace(/x/g, 'ks')
        .replace(/z|j/g, 's')
        .replace(/th/g, 't')
        .replace(/dh/g, 'd')
        .replace(/gh/g, 'g')
        .replace(/kh/g, 'k')
        .replace(/sy|sh/g, 's');

    // 4. Compress duplicate characters (e.g., "fiiist" -> "fist", "komannng" -> "komang")
    s = s.replace(/(.)\1+/g, '$1');

    return s.replace(/\s+/g, ' ').trim();
};

/**
 * Cleans punctuation and trims string
 * @param {string} s 
 * @returns {string}
 */
export const cleanPunct = (s) => (s || '')
    .toLowerCase()
    .replace(/[\'\’\‘\"\“\”\,\.\!\?\:\;\(\)\[\]\{\}\-\_\/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// =========================================================================
// 2. DAMERAU-LEVENSHTEIN & N-GRAM FUZZY SIMILARITY (TYPO RECOVERY ENGINE)
// =========================================================================

/**
 * Calculates Damerau-Levenshtein distance with transposition support.
 * Handles inserted, deleted, substituted, and swapped characters.
 * @param {string} source 
 * @param {string} target 
 * @returns {number} Distance (0 = identical)
 */
export const damerauLevenshteinDistance = (source, target) => {
    if (!source) return target ? target.length : 0;
    if (!target) return source ? source.length : 0;

    const s = source.toLowerCase();
    const t = target.toLowerCase();
    const sLen = s.length;
    const tLen = t.length;

    const d = Array.from({ length: sLen + 1 }, () => new Array(tLen + 1).fill(0));

    for (let i = 0; i <= sLen; i++) d[i][0] = i;
    for (let j = 0; j <= tLen; j++) d[0][j] = j;

    for (let i = 1; i <= sLen; i++) {
        for (let j = 1; j <= tLen; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,      // deletion
                d[i][j - 1] + 1,      // insertion
                d[i - 1][j - 1] + cost // substitution
            );

            // Transposition check (swapped adjacent letters, e.g. "teh" vs "the")
            if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
            }
        }
    }

    return d[sLen][tLen];
};

/**
 * Calculates fuzzy similarity between two strings (0.0 to 1.0)
 * Combining Levenshtein similarity with token overlap and phonetic skeleton.
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} 0.0 to 1.0
 */
export const calculateFuzzySimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    const s1 = cleanPunct(str1);
    const s2 = cleanPunct(str2);
    if (s1 === s2) return 1.0;

    // Substring contains bonus
    if (s1.includes(s2) || s2.includes(s1)) {
        const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
        return Math.max(0.85, 0.75 + (ratio * 0.25));
    }

    const dist = damerauLevenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const rawSim = 1.0 - (dist / maxLen);

    // Phonetic similarity check
    const p1 = toPhoneticSkeleton(s1);
    const p2 = toPhoneticSkeleton(s2);
    if (p1 === p2 && p1.length > 0) {
        return Math.max(rawSim, 0.95);
    }
    const pDist = damerauLevenshteinDistance(p1, p2);
    const pMax = Math.max(p1.length, p2.length);
    const pSim = pMax === 0 ? 1.0 : 1.0 - (pDist / pMax);

    return Math.max(rawSim, pSim * 0.92);
};

// =========================================================================
// 3. EXTENSIVE MUSIC DICTIONARY & COMMON SPELLING/TYPO CORRECTIONS
// =========================================================================

/**
 * Normalizes frequent music terms, artist aliases, number-based band names,
 * and spoken Indonesian/English voice variations.
 * @param {string} text 
 * @returns {string}
 */
export const normalizeMusicVocabulary = (text) => {
    if (!text) return '';
    let t = text;

    // .Feast and spoken variations
    t = t.replace(/\b(dot\s+feast|titik\s+feast|\.feast|feast|fist|feest|pist|vist|pest|fis|fiss|feis|feist|peist|dist|pencuri)\b/gi, '.Feast');

    // Sheila On 7 and variations
    t = t.replace(/\b(sheila|sela|seila|sila|shela|sheilla)\s+(on|on\s+the)?\s+(seven|7|sefen|sepen|tujuh)\b/gi, 'Sheila On 7');
    t = t.replace(/\bso7\b/gi, 'Sheila On 7');

    // Hindia
    t = t.replace(/\b(india|hinda|hindya|hindia|baskara|baskara\s+putra)\b/gi, 'Hindia');

    // Raim Laode
    t = t.replace(/\b(raim\s+laode|raim\s+la\s+ode|raim\s+laude|rayem\s+laode|rahim\s+laode|rhyme\s+laode|raem\s+laode)\b/gi, 'Raim Laode');

    // Juicy Luicy
    t = t.replace(/\b(jusi\s+luisi|jusi\s+luici|juicy\s+luisy|jucy\s+luci|juisi\s+luisi|jusiluisi|juicyluicy)\b/gi, 'Juicy Luicy');

    // Sal Priadi
    t = t.replace(/\b(sal\s+priyadi|sal\s+priadi|sal\s+pribadi|salpriadi)\b/gi, 'Sal Priadi');

    // Bernadya
    t = t.replace(/\b(bernadia|bernadya|bernadhia|bernada|bernadya\s+ribka)\b/gi, 'Bernadya');

    // Mahalini
    t = t.replace(/\b(maha\s+lini|mahalini)\b/gi, 'Mahalini');

    // Nadin Amizah
    t = t.replace(/\b(nadin\s+hamzah|nadin\s+amizah|nadin\s+amijah|nadin)\b/gi, 'Nadin Amizah');

    // Vierra / Vierratale
    t = t.replace(/\b(viera|vierra|vieratal|vieratale|viera\s+tale)\b/gi, 'Vierra');

    // For Revenge
    t = t.replace(/\b(for\s+rivens|for\s+revenge|por\s+ripens|por\s+revenge|4\s+revenge)\b/gi, 'For Revenge');

    // Bilal Indrajaya
    t = t.replace(/\b(bilal\s+indra\s+jaya|bilal\s+indrajaya|bilal)\b/gi, 'Bilal Indrajaya');

    // Feby Putri
    t = t.replace(/\b(febi\s+putri|feby\s+putri|febi)\b/gi, 'Feby Putri');

    // Fiersa Besari
    t = t.replace(/\b(pirsa\s+besari|fiersa\s+besari|fersa\s+besari)\b/gi, 'Fiersa Besari');

    // Barasuara
    t = t.replace(/\b(bara\s+suara|barasuara)\b/gi, 'Barasuara');

    // DHOT DESIGN
    t = t.replace(/\b(dhot|dot|dot\s+design|dhot\s+desain|dot\s+desain|dhot\s+design)\b/gi, 'DHOT DESIGN');

    // Guyon Waton & Denny Caknan
    t = t.replace(/\bguyon\s+waton\b/gi, 'Guyon Waton');
    t = t.replace(/\b(deni|denny)\s+caknan\b/gi, 'Denny Caknan');

    // Radiohead
    t = t.replace(/\b(rediohed|redio\s+hed|radio\s+hed|radiohead)\b/gi, 'Radiohead');
    t = t.replace(/\b(krip|klip|crip|kriip)\b/gi, 'Creep');
    t = t.replace(/\b(karma\s+polis|karma\s+police)\b/gi, 'Karma Police');
    t = t.replace(/\bno\s+(seprais|serpres|surpres|surprise|surprises)\b/gi, 'No Surprises');
    t = t.replace(/\bol\s+ai\s+nid\b/gi, 'All I Need');
    t = t.replace(/\blet\s+(dawn|don|daun|down)\b/gi, 'Let Down');

    // Backstreet Boys
    t = t.replace(/\b(bekstrit\s+bois|bekstrit\s+boy|back\s+street\s+boys|backstreet\s+boys)\b/gi, 'Backstreet Boys');
    t = t.replace(/\b(sep\s+of\s+mai\s+hart|seip\s+of\s+my\s+heart|shape\s+of\s+my\s+heart)\b/gi, 'Shape Of My Heart');

    // Western Bands & Numbers
    t = t.replace(/\bmaroon\s+(five|5|lima)\b/gi, 'Maroon 5');
    t = t.replace(/\bblink\s+(one\s+eighty\s+two|182|seratus\s+delapan\s+puluh\s+dua)\b/gi, 'Blink-182');
    t = t.replace(/\b(twenty\s+one|21|dua\s+puluh\s+satu)\s+pilots\b/gi, 'Twenty One Pilots');
    t = t.replace(/\bone\s+direction\b/gi, 'One Direction');
    t = t.replace(/\bthe\s+(1975|nineteen\s+seventy\s+five|sembilan\s+belas\s+tujuh\s+puluh\s+lima)\b/gi, 'The 1975');

    // Popular Indonesian Song Titles
    t = t.replace(/\b(evaluasi|epaluasi|epaluasih)\b/gi, 'Evaluasi');
    t = t.replace(/\b(komang|koma|komangg)\b/gi, 'Komang');
    t = t.replace(/\b(nina|nyna|nyna)\b/gi, 'Nina');
    t = t.replace(/\b(secukupnya|sekukupnya)\b/gi, 'Secukupnya');
    t = t.replace(/\b(rumah\s+ke\s+rumah|rumah\s+k\s+rumah)\b/gi, 'Rumah Ke Rumah');
    t = t.replace(/\btarian\s+penghancur\s+raya\b/gi, 'Tarian Penghancur Raya');
    t = t.replace(/\b(peradaban|pradaban)\b/gi, 'Peradaban');
    t = t.replace(/\b(sephia|sepia)\b/gi, 'Sephia');
    t = t.replace(/\bmelompat\s+lebih\s+tinggi\b/gi, 'Melompat Lebih Tinggi');
    t = t.replace(/\b(sebuah\s+kisah\s+klasik|kisah\s+klasik)\b/gi, 'Sebuah Kisah Klasik');
    t = t.replace(/\bsahabat\s+sejati\b/gi, 'Sahabat Sejati');
    t = t.replace(/\blapang\s+dada\b/gi, 'Lapang Dada');
    t = t.replace(/\bgala\s+bunga\s+matahari\b/gi, 'Gala Bunga Matahari');
    t = t.replace(/\buntungnya\s+hidup\s+harus\s+tetap\s+berjalan\b/gi, 'Untungnya, Hidup Harus Tetap Berjalan');
    t = t.replace(/\b(runtuh|runtu)\b/gi, 'Runtuh');
    t = t.replace(/\b(serana|srana)\b/gi, 'Serana');
    t = t.replace(/\brayuan\s+perempuan\s+gila\b/gi, 'Rayuan Perempuan Gila');
    t = t.replace(/\bbertaut\b/gi, 'Bertaut');
    t = t.replace(/\b(niscaya|niskaya)\b/gi, 'Niscaya');
    t = t.replace(/\b(alamak|ala\s+mak)\b/gi, 'Alamak');
    t = t.replace(/\b(lantas|lanta|lantaz)\b/gi, 'Lantas');
    t = t.replace(/\b(sialan|syalan)\b/gi, 'Sialan');
    t = t.replace(/\b(sedia\s+aku\s+sebelum\s+hujan|sedia\s+ku\s+sebelum\s+hujan)\b/gi, 'Sedia Aku Sebelum Hujan');
    t = t.replace(/\b(jakarta\s+hari\s+ini|jkt\s+hari\s+ini)\b/gi, 'Jakarta Hari Ini');
    t = t.replace(/\b(a\s+thousand\s+years|thousand\s+years)\b/gi, 'A Thousand Years');
    t = t.replace(/\b(wives\s+of\s+godzilla|wives\s+of\s+gojira)\b/gi, 'Wives of ゴジラ (We Belong Dead)');

    return t;
};

// =========================================================================
// 4. NATURAL LANGUAGE INTENT & COMMAND PARSER
// =========================================================================

/**
 * Cleans command prefixes and fillers from spoken voice query.
 * @param {string} rawText 
 * @returns {string}
 */
export const cleanVoiceQuery = (rawText) => {
    if (!rawText) return '';
    let text = rawText.trim();

    // 1. Punctuation cleanup
    text = text.replace(/[\,\?\!\;\"\“\”\‘\’\:]+/g, ' ').replace(/\s+/g, ' ').trim();

    // 2. Music vocabulary normalization
    text = normalizeMusicVocabulary(text);

    // 3. Multi-language command prefixes (Indonesian, English, Spanish, etc.)
    const commandPrefixPattern = /^(tolong\s+)?(putarkan|putar|puterin|mainkan|setelkan|setel|dengarkan|dengerin|bunyikan|nyalakan|play|carikan|cari|temukan|search|buka|lihat|tampilkan|buscar|reproducir|escuchar|listen\s+to)\s*(kan\s+)?(semua|seluruh|semuanya|koleksi|daftar|all|todos)?\s*(lagu-lagu|lagu|musik|track|songs|music|cancion|canciones|musica)?\s*(dari|punya|milik|oleh|artis|penyanyi|musisi|band|album|judul|tentang|for|by|from|de|por)?\s*/i;
    text = text.replace(commandPrefixPattern, '').trim();

    // 4. Remove conversational ending particles
    text = text.replace(/\s+(dong|ya|tolong|please|deh|nih|yah|por\s+favor)$/i, '').trim();
    return text;
};

/**
 * Extracts intent from raw utterance:
 * - PLAY_TRACK (e.g. "Putar lagu Nina dari Feast")
 * - SEARCH_ARTIST (e.g. "Artis Sheila On 7")
 * - SEARCH_ALBUM (e.g. "Album Menari Dengan Bayangan")
 * - GENERAL_SEARCH (e.g. "Nina")
 * @param {string} rawText 
 * @returns {{ intent: string, query: string, song?: string, artist?: string, album?: string }}
 */
export const parseVoiceIntent = (rawText) => {
    if (!rawText) return { intent: 'GENERAL_SEARCH', query: '' };
    const raw = rawText.trim();
    const isPlayCommand = /^(tolong\s+)?(putarkan|putar|puterin|mainkan|setelkan|setel|dengarkan|dengerin|play|bunyikan|nyalakan|reproducir|listen\s+to)/i.test(raw);
    const cleaned = cleanVoiceQuery(raw);

    // Check "Song [X] by/dari Artist [Y]"
    const separatorPattern = /\s+(dari|oleh|milik|punya|ciptaan|by|from|feat\.?|ft\.?|de|por)\s+/i;
    if (separatorPattern.test(cleaned)) {
        const parts = cleaned.split(separatorPattern);
        if (parts.length >= 3) {
            return {
                intent: isPlayCommand ? 'PLAY_TRACK' : 'GENERAL_SEARCH',
                query: cleaned,
                song: parts[0].trim(),
                artist: parts[2].trim()
            };
        }
    }

    // Check "Artist [X] yang judulnya Song [Y]"
    const yangJudulnyaPattern = /\s+(yang\s+judulnya|yang\s+nyanyi|lagunya)\s+/i;
    if (yangJudulnyaPattern.test(cleaned)) {
        const parts = cleaned.split(yangJudulnyaPattern);
        if (parts.length >= 3) {
            return {
                intent: isPlayCommand ? 'PLAY_TRACK' : 'GENERAL_SEARCH',
                query: cleaned,
                artist: parts[0].trim(),
                song: parts[2].trim()
            };
        }
    }

    // Check Album prefix
    if (/^(album|koleksi\s+album)\s+/i.test(cleaned)) {
        return {
            intent: 'SEARCH_ALBUM',
            query: cleaned.replace(/^(album|koleksi\s+album)\s+/i, '').trim(),
            album: cleaned.replace(/^(album|koleksi\s+album)\s+/i, '').trim()
        };
    }

    // Check Artist prefix
    if (/^(artis|penyanyi|musisi|band)\s+/i.test(cleaned)) {
        return {
            intent: 'SEARCH_ARTIST',
            query: cleaned.replace(/^(artis|penyanyi|musisi|band)\s+/i, '').trim(),
            artist: cleaned.replace(/^(artis|penyanyi|musisi|band)\s+/i, '').trim()
        };
    }

    return {
        intent: isPlayCommand ? 'PLAY_TRACK' : 'GENERAL_SEARCH',
        query: cleaned
    };
};

// =========================================================================
// 5. UNIFIED MUSIC KNOWLEDGE BASE & CATALOG LEARNER
// =========================================================================

class VoiceCatalogKnowledgeBase {
    constructor() {
        this.isInitialized = false;
        this.localArtists = [];
        this.localSongs = [];
        this.localAlbums = [];
        this.jamendoCache = {
            artists: [],
            tracks: [],
            albums: []
        };
        this.catalogPool = [];
        this.grammarTerms = new Set();
        this.initPromise = null;
    }

    /**
     * Initializes and indexes the entire music knowledge base.
     * Combines local songs, artists, albums with Jamendo API global cache.
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                // 1. Load local catalog (manifest and featured songs)
                const localCatalog = await loadLocalCatalog().catch(() => ({ artists: [], songs: [] }));
                const featured = getFeaturedLocalSongs();

                this.localArtists = localCatalog.artists || [];
                
                // Merge unique local songs
                const songMap = new Map();
                (localCatalog.songs || []).forEach((s) => songMap.set(String(s.id || s.name), s));
                featured.forEach((s) => {
                    if (!songMap.has(String(s.id || s.name))) {
                        songMap.set(String(s.id || s.name), s);
                    }
                });
                this.localSongs = Array.from(songMap.values());

                // Derive local albums
                const albumSet = new Set();
                this.localSongs.forEach((s) => {
                    if (s.album) albumSet.add(s.album);
                });
                // Add well-known Indonesian album classics
                [
                    'Membangun & Menghancurkan',
                    'Menari Dengan Bayangan',
                    'Duka Bersama',
                    'Kisah Klasik Untuk Masa Depan',
                    'Pejantan Tangguh',
                    'OK Computer',
                    'The Bends',
                    'Millennium',
                    'Sentimental',
                    'Berbunga',
                    'Untungnya, Hidup Harus Tetap Berjalan',
                    'First Love',
                    'Love, String & Symphony',
                    '07 Des',
                    'Musim Yang Baik'
                ].forEach((alb) => albumSet.add(alb));

                this.localAlbums = Array.from(albumSet).map((name) => ({
                    id: `album-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    name,
                    type: 'album'
                }));

                // 2. Pre-fetch Jamendo Global Trending & Top Artists in Background
                this.fetchJamendoBackgroundCache();

                // 3. Build fast in-memory index pool
                this.rebuildIndexPool();
                this.isInitialized = true;
            } catch (err) {
                console.warn('Voice Knowledge Base initialization notice:', err);
                this.rebuildIndexPool();
                this.isInitialized = true;
            }
        })();

        return this.initPromise;
    }

    /**
     * Pre-fetches Jamendo trending tracks and top artists for immediate access.
     */
    async fetchJamendoBackgroundCache() {
        try {
            const [topArtistsData, trendingTracksData] = await Promise.allSettled([
                getTopArtists(30),
                getTrendingTracks(30)
            ]);

            if (topArtistsData.status === 'fulfilled' && Array.isArray(topArtistsData.value)) {
                this.jamendoCache.artists = topArtistsData.value.map((a) => ({
                    id: a.id,
                    name: a.name,
                    photo: a.image,
                    type: 'artist',
                    isJamendo: true
                }));
            }

            if (trendingTracksData.status === 'fulfilled' && Array.isArray(trendingTracksData.value)) {
                this.jamendoCache.tracks = trendingTracksData.value.map((t) => ({
                    id: t.id,
                    name: t.name,
                    artist: t.artist_name,
                    album: t.album_name,
                    cover: t.image,
                    audio: t.audio,
                    duration: t.duration || 0,
                    type: 'song',
                    isJamendo: true
                }));
            }

            this.rebuildIndexPool();
        } catch (e) {
            // Background cache non-fatal
        }
    }

    /**
     * Rebuilds the search and phonetic pool from all data sources.
     */
    rebuildIndexPool() {
        const pool = [];
        const grammarTerms = new Set();

        const addTerm = (term) => {
            if (!term || typeof term !== 'string') return;
            const cleaned = cleanPunct(term);
            if (cleaned.length >= 2) {
                grammarTerms.add(cleaned);
            }
        };

        // 1. Local Songs
        this.localSongs.forEach((song) => {
            if (song.name) {
                const normName = cleanPunct(song.name);
                pool.push({
                    name: song.name,
                    normName,
                    phonName: toPhoneticSkeleton(song.name),
                    type: 'song',
                    isLocal: true,
                    item: song
                });
                addTerm(song.name);
            }

            if (song.artist) {
                const normArtist = cleanPunct(song.artist);
                pool.push({
                    name: song.artist,
                    normName: normArtist,
                    phonName: toPhoneticSkeleton(song.artist),
                    type: 'artist',
                    isLocal: true,
                    item: { id: `artist-${song.artist}`, name: song.artist, photo: song.cover, type: 'artist' }
                });
                addTerm(song.artist);
            }

            if (song.name && song.artist) {
                const combined = `${song.name} ${song.artist}`;
                pool.push({
                    name: song.name,
                    combined,
                    normCombined: cleanPunct(combined),
                    phonCombined: toPhoneticSkeleton(combined),
                    type: 'song',
                    isLocal: true,
                    item: song
                });
                addTerm(combined);
            }
        });

        // 2. Local Artists
        this.localArtists.forEach((artist) => {
            if (artist.name) {
                pool.push({
                    name: artist.name,
                    normName: cleanPunct(artist.name),
                    phonName: toPhoneticSkeleton(artist.name),
                    type: 'artist',
                    isLocal: true,
                    item: artist
                });
                addTerm(artist.name);
            }
        });

        // 3. Local Albums
        this.localAlbums.forEach((album) => {
            if (album.name) {
                pool.push({
                    name: album.name,
                    normName: cleanPunct(album.name),
                    phonName: toPhoneticSkeleton(album.name),
                    type: 'album',
                    isLocal: true,
                    item: album
                });
                addTerm(album.name);
            }
        });

        // 4. Jamendo Cache Items
        this.jamendoCache.tracks.forEach((track) => {
            if (track.name) {
                pool.push({
                    name: track.name,
                    normName: cleanPunct(track.name),
                    phonName: toPhoneticSkeleton(track.name),
                    type: 'song',
                    isJamendo: true,
                    item: track
                });
                addTerm(track.name);
            }
            if (track.artist) {
                addTerm(track.artist);
            }
        });

        this.jamendoCache.artists.forEach((artist) => {
            if (artist.name) {
                pool.push({
                    name: artist.name,
                    normName: cleanPunct(artist.name),
                    phonName: toPhoneticSkeleton(artist.name),
                    type: 'artist',
                    isJamendo: true,
                    item: artist
                });
                addTerm(artist.name);
            }
        });

        this.catalogPool = pool;
        this.grammarTerms = grammarTerms;
    }

    /**
     * Generates a dynamic JSGF grammar string for SpeechGrammarList.
     * @returns {string}
     */
    generateJSGFGrammar() {
        const terms = Array.from(this.grammarTerms).slice(0, 150);
        if (terms.length === 0) return '';
        const escaped = terms.map((t) => t.replace(/[^a-zA-Z0-9\s]/g, '')).filter(Boolean);
        return `#JSGF V1.0; grammar music; public <music> = ${escaped.join(' | ')};`;
    }

    /**
     * Performs multi-tiered fuzzy & phonetic matching with typo tolerance.
     * @param {string[]} speechCandidates 
     * @returns {Promise<{ text: string, score: number, isMatch: boolean, item: any, type: string, intent: string, originalUtterance: string }>}
     */
    async matchVoiceQuery(speechCandidates = []) {
        await this.initialize();

        if (!speechCandidates || speechCandidates.length === 0) {
            return { text: '', score: 0, isMatch: false, item: null, type: null, intent: 'GENERAL_SEARCH', originalUtterance: '' };
        }

        const primaryRaw = speechCandidates[0] || '';
        const intentResult = parseVoiceIntent(primaryRaw);
        let bestMatch = null;
        let highestScore = 0;

        for (const rawCandidate of speechCandidates) {
            if (!rawCandidate) continue;
            const cleaned = cleanVoiceQuery(rawCandidate);
            if (!cleaned) continue;

            const lowerCleaned = cleaned.toLowerCase();
            const normCleaned = cleanPunct(cleaned);
            const phonCleaned = toPhoneticSkeleton(cleaned);

            // ==========================================================
            // Tier A: Check Specific Intent (Song [X] by Artist [Y] or Combined [Artist] [Song])
            // ==========================================================
            const parsed = parseVoiceIntent(rawCandidate);
            if (parsed.song && parsed.artist) {
                const normSong = cleanPunct(parsed.song);
                const normArtist = cleanPunct(parsed.artist);
                const phonSong = toPhoneticSkeleton(parsed.song);
                const phonArtist = toPhoneticSkeleton(parsed.artist);

                for (const entry of this.catalogPool) {
                    if (entry.type === 'song' && entry.item) {
                        const songName = cleanPunct(entry.item.name || '');
                        const songArtist = cleanPunct(entry.item.artist || '');
                        const songPhonName = toPhoneticSkeleton(entry.item.name || '');
                        const songPhonArtist = toPhoneticSkeleton(entry.item.artist || '');

                        const sSim = Math.max(
                            calculateFuzzySimilarity(songName, normSong),
                            calculateFuzzySimilarity(songPhonName, phonSong)
                        );
                        const aSim = Math.max(
                            calculateFuzzySimilarity(songArtist, normArtist),
                            calculateFuzzySimilarity(songPhonArtist, phonArtist)
                        );

                        if (sSim >= 0.75 && aSim >= 0.75) {
                            return {
                                text: entry.item.name,
                                score: (sSim + aSim) / 2,
                                isMatch: true,
                                item: entry.item,
                                type: 'song',
                                intent: parsed.intent,
                                originalUtterance: rawCandidate
                            };
                        }
                    }
                }
            }

            // Check if utterance contains both Song AND Artist keywords (e.g. "radiohead creep", "juicy luicy lantas", "dhot design kau pergi")
            for (const s of this.localSongs) {
                if (!s.name || !s.artist) continue;
                const sNameNorm = cleanPunct(s.name);
                const sArtistNorm = cleanPunct(s.artist);
                const sNamePhon = toPhoneticSkeleton(s.name);
                const sArtistPhon = toPhoneticSkeleton(s.artist);

                const songMatch = normCleaned.includes(sNameNorm) || phonCleaned.includes(sNamePhon) || (sNameNorm.length >= 4 && calculateFuzzySimilarity(normCleaned, sNameNorm) >= 0.82);
                const artistMatch = normCleaned.includes(sArtistNorm) || phonCleaned.includes(sArtistPhon) || (sArtistNorm.length >= 4 && calculateFuzzySimilarity(normCleaned, sArtistNorm) >= 0.82);

                if (songMatch && artistMatch) {
                    return {
                        text: s.name,
                        score: 1.0,
                        isMatch: true,
                        item: s,
                        type: 'song',
                        intent: intentResult.intent,
                        originalUtterance: rawCandidate
                    };
                }
            }

            // ==========================================================
            // Tier B: High Confidence Exact & Phonetic Match in Catalog
            // ==========================================================
            for (const entry of this.catalogPool) {
                // 1. Exact string match
                if (normCleaned === entry.normName || lowerCleaned === entry.name.toLowerCase()) {
                    return {
                        text: entry.name,
                        score: 1.0,
                        isMatch: true,
                        item: entry.item,
                        type: entry.type,
                        intent: intentResult.intent,
                        originalUtterance: rawCandidate
                    };
                }

                // 2. Exact phonetic skeleton match (e.g. "feis" -> ".Feast", "koma" -> "Komang")
                if (phonCleaned === entry.phonName && Math.abs(normCleaned.length - entry.normName.length) <= 3) {
                    return {
                        text: entry.name,
                        score: 0.98,
                        isMatch: true,
                        item: entry.item,
                        type: entry.type,
                        intent: intentResult.intent,
                        originalUtterance: rawCandidate
                    };
                }

                // 3. Typo fuzzy similarity (Levenshtein + Phonetic Damerau distance)
                const sim = calculateFuzzySimilarity(normCleaned, entry.normName);
                if (sim >= 0.80 && sim > highestScore) {
                    highestScore = sim;
                    bestMatch = {
                        text: entry.name,
                        score: sim,
                        isMatch: true,
                        item: entry.item,
                        type: entry.type,
                        intent: intentResult.intent,
                        originalUtterance: rawCandidate
                    };
                }

                // 4. Combined Name + Artist match (e.g. user says "nina feast")
                if (entry.combined) {
                    const combSim = calculateFuzzySimilarity(normCleaned, entry.normCombined);
                    if (combSim >= 0.78 && combSim > highestScore) {
                        highestScore = combSim;
                        bestMatch = {
                            text: entry.name,
                            score: combSim,
                            isMatch: true,
                            item: entry.item,
                            type: 'song',
                            intent: intentResult.intent,
                            originalUtterance: rawCandidate
                        };
                    }
                }
            }
        }

        if (bestMatch && highestScore >= 0.78) {
            return bestMatch;
        }

        // ==========================================================
        // Tier C: Fallback to Jamendo Global API Remote Search
        // ==========================================================
        const fallbackQuery = cleanVoiceQuery(primaryRaw);
        if (fallbackQuery && fallbackQuery.length >= 2) {
            try {
                const [remoteTracks, remoteArtists, remoteAlbums] = await Promise.all([
                    searchTracksByName(fallbackQuery, 3).catch(() => []),
                    searchArtistsByName(fallbackQuery, 2).catch(() => []),
                    searchAlbumsByName(fallbackQuery, 2).catch(() => [])
                ]);

                // Check remote artists
                for (const a of remoteArtists) {
                    const aSim = calculateFuzzySimilarity(fallbackQuery, a.name);
                    if (aSim >= 0.75) {
                        return {
                            text: a.name,
                            score: aSim,
                            isMatch: true,
                            item: { id: a.id, name: a.name, photo: a.image, type: 'artist', isJamendo: true },
                            type: 'artist',
                            intent: intentResult.intent,
                            originalUtterance: primaryRaw
                        };
                    }
                }

                // Check remote tracks
                for (const t of remoteTracks) {
                    const tSim = calculateFuzzySimilarity(fallbackQuery, t.name);
                    if (tSim >= 0.75) {
                        return {
                            text: t.name,
                            score: tSim,
                            isMatch: true,
                            item: {
                                id: t.id,
                                name: t.name,
                                artist: t.artist_name,
                                album: t.album_name,
                                cover: t.image,
                                audio: t.audio,
                                duration: t.duration || 0,
                                type: 'song',
                                isJamendo: true
                            },
                            type: 'song',
                            intent: intentResult.intent,
                            originalUtterance: primaryRaw
                        };
                    }
                }

                // Check remote albums
                for (const alb of remoteAlbums) {
                    const albSim = calculateFuzzySimilarity(fallbackQuery, alb.name);
                    if (albSim >= 0.75) {
                        return {
                            text: alb.name,
                            score: albSim,
                            isMatch: true,
                            item: { id: alb.id, name: alb.name, artist: alb.artist_name, cover: alb.image, type: 'album', isJamendo: true },
                            type: 'album',
                            intent: intentResult.intent,
                            originalUtterance: primaryRaw
                        };
                    }
                }
            } catch (e) {
                console.warn('Voice Jamendo remote lookup error:', e);
            }
        }

        // ==========================================================
        // Tier D: Natural Default (Cleaned text without prefixes)
        // ==========================================================
        return {
            text: fallbackQuery || primaryRaw.toLowerCase().trim(),
            score: 0,
            isMatch: false,
            item: null,
            type: null,
            intent: intentResult.intent,
            originalUtterance: primaryRaw
        };
    }
}

// Global Singleton Instance
export const voiceCatalogKnowledge = new VoiceCatalogKnowledgeBase();

// Initialize in background when module is loaded
if (typeof window !== 'undefined') {
    setTimeout(() => {
        voiceCatalogKnowledge.initialize().catch(() => {});
    }, 500);
}
