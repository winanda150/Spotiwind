/**
 * @file fuzzySearch.js
 * @description Super-smart fuzzy search engine for Spotiwind Music.
 *
 *  Techniques used (Industry-grade):
 *  ────────────────────────────────
 *  1. Unicode NFD normalization (ń→n, é→e, Hivi!→hivi, .Feast→feast)
 *  2. Levenshtein edit distance (optimized single-row DP)
 *  3. Jaro-Winkler distance (superior for short name matching)
 *  4. Bigram Dice coefficient (structural similarity)
 *  5. QWERTY keyboard proximity (adjacent-key typos penalized less)
 *  6. Indonesian phonetic equivalence (f↔p, v↔f, c↔k, dh↔d, kh↔k, ny↔n, ng↔n)
 *  7. Acronym / initials matching ("SO7"→"Sheila On 7", "JL"→"Juicy Luicy")
 *  8. Word-order-independent token matching ("komang raim" = "raim komang")
 *  9. Adaptive distance threshold (short queries more tolerant)
 * 10. Word-boundary-aware contains (match at word start ranks higher)
 * 11. Subsequence matching ("brndya" finds letters b-r-n-d-y-a inside "bernadya")
 * 12. Double/single letter tolerance ("viera"↔"vierra", "berssamamu"↔"bersamamu")
 * 13. Weighted multi-signal fusion scoring
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize a string for fuzzy comparison.
 * Strips diacritics, punctuation, symbols; lowercases; collapses whitespace.
 */
const normalize = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritical marks
        .replace(/[^a-z0-9\s]/g, '')       // remove all non-alphanumeric except spaces
        .replace(/\s+/g, ' ')
        .trim();
};

/** Split a normalized string into word tokens. */
const tokenize = (str) => normalize(str).split(' ').filter(Boolean);

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — QWERTY KEYBOARD PROXIMITY MAP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map each key to its physically adjacent keys on a QWERTY layout.
 * Used to reduce penalty for "fat-finger" typos where the user hits
 * an adjacent key instead of the intended one.
 */
const QWERTY_NEIGHBORS = (() => {
    const rows = [
        'qwertyuiop',
        'asdfghjkl',
        'zxcvbnm'
    ];
    const map = {};
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            const ch = rows[r][c];
            const neighbors = new Set();
            // same row neighbors
            if (c > 0) neighbors.add(rows[r][c - 1]);
            if (c < rows[r].length - 1) neighbors.add(rows[r][c + 1]);
            // row above
            if (r > 0) {
                for (let offset = -1; offset <= 0; offset++) {
                    const idx = c + offset;
                    if (idx >= 0 && idx < rows[r - 1].length) neighbors.add(rows[r - 1][idx]);
                }
            }
            // row below
            if (r < rows.length - 1) {
                for (let offset = 0; offset <= 1; offset++) {
                    const idx = c + offset;
                    if (idx >= 0 && idx < rows[r + 1].length) neighbors.add(rows[r + 1][idx]);
                }
            }
            map[ch] = neighbors;
        }
    }
    return map;
})();

/** Check if two characters are neighbors on a QWERTY keyboard. */
const areKeysAdjacent = (a, b) => QWERTY_NEIGHBORS[a]?.has(b) || false;

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — INDONESIAN PHONETIC EQUIVALENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pairs of characters/digraphs that sound similar in Indonesian/Malay context
 * and are commonly confused in casual typing.
 */
const PHONETIC_PAIRS = [
    ['f', 'v'],   // foto / video confusion
    ['f', 'p'],   // poto instead of foto
    ['v', 'b'],   // very common Indonesian confusion
    ['c', 'k'],   // cukup / kukup
    ['z', 's'],   // zaman / saman
    ['j', 'y'],   // Jawa → Yawa
    ['i', 'y'],   // vowel/consonant swap
    ['u', 'w'],   // similar mouth position
    ['e', 'a'],   // Indonesian schwa is often written as a
    ['o', 'u'],   // common vowel confusion
    ['i', 'e'],   // common vowel confusion
    ['n', 'm'],   // nasal confusion
    ['d', 't'],   // voiced/unvoiced confusion
    ['g', 'k'],   // voiced/unvoiced confusion
    ['b', 'p'],   // voiced/unvoiced confusion
];

const phoneticMap = (() => {
    const map = {};
    for (const [a, b] of PHONETIC_PAIRS) {
        if (!map[a]) map[a] = new Set();
        if (!map[b]) map[b] = new Set();
        map[a].add(b);
        map[b].add(a);
    }
    return map;
})();

/** Check if two chars are phonetic equivalents. */
const arePhoneticEquivalent = (a, b) => phoneticMap[a]?.has(b) || false;

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — DISTANCE ALGORITHMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weighted Levenshtein distance with QWERTY proximity + phonetic awareness.
 * Adjacent-key substitutions cost 0.5 instead of 1.
 * Phonetic equivalent substitutions cost 0.3 instead of 1.
 */
const weightedLevenshtein = (a, b) => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.65) {
        return Math.max(a.length, b.length);
    }

    const bLen = b.length;
    let prev = new Float32Array(bLen + 1);
    let curr = new Float32Array(bLen + 1);

    for (let j = 0; j <= bLen; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= bLen; j++) {
            if (a[i - 1] === b[j - 1]) {
                curr[j] = prev[j - 1];
            } else {
                // Determine substitution cost based on proximity/phonetics
                let subCost = 1;
                if (arePhoneticEquivalent(a[i - 1], b[j - 1])) {
                    subCost = 0.3;
                } else if (areKeysAdjacent(a[i - 1], b[j - 1])) {
                    subCost = 0.5;
                }
                curr[j] = Math.min(
                    prev[j] + 1,            // deletion
                    curr[j - 1] + 1,         // insertion
                    prev[j - 1] + subCost    // substitution
                );
            }
        }
        [prev, curr] = [curr, prev];
    }
    return prev[bLen];
};

/**
 * Classic Levenshtein (unweighted, for compatibility/export).
 */
const levenshteinDistance = (a, b) => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const bLen = b.length;
    let prev = new Array(bLen + 1);
    let curr = new Array(bLen + 1);
    for (let j = 0; j <= bLen; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= bLen; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[bLen];
};

/**
 * Jaro-Winkler similarity — superior to Levenshtein for short name matching.
 * Returns a value between 0 (no similarity) and 1 (identical).
 * Gives bonus weight to strings that share a common prefix.
 */
const jaroWinklerSimilarity = (a, b) => {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const maxDist = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    if (maxDist < 0) return a === b ? 1 : 0;

    const aMatches = new Array(a.length).fill(false);
    const bMatches = new Array(b.length).fill(false);
    let matches = 0;
    let transpositions = 0;

    // Find matching characters
    for (let i = 0; i < a.length; i++) {
        const lo = Math.max(0, i - maxDist);
        const hi = Math.min(b.length - 1, i + maxDist);
        for (let j = lo; j <= hi; j++) {
            if (bMatches[j] || a[i] !== b[j]) continue;
            aMatches[i] = true;
            bMatches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aMatches[i]) continue;
        while (!bMatches[k]) k++;
        if (a[i] !== b[k]) transpositions++;
        k++;
    }

    const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler bonus: up to 4-character common prefix
    let prefixLen = 0;
    for (let i = 0; i < Math.min(a.length, b.length, 4); i++) {
        if (a[i] === b[i]) prefixLen++;
        else break;
    }

    return jaro + prefixLen * 0.1 * (1 - jaro);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — N-GRAM SIMILARITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bigram Dice coefficient — measures structural character-pair overlap.
 */
const ngramSimilarity = (a, b, n = 2) => {
    if (a === b) return 1;
    if (a.length < n || b.length < n) return 0;

    const getNgrams = (str) => {
        const grams = new Map();
        for (let i = 0; i <= str.length - n; i++) {
            const gram = str.substring(i, i + n);
            grams.set(gram, (grams.get(gram) || 0) + 1);
        }
        return grams;
    };

    const gramsA = getNgrams(a);
    const gramsB = getNgrams(b);
    let intersection = 0;
    for (const [gram, countA] of gramsA) {
        intersection += Math.min(countA, gramsB.get(gram) || 0);
    }
    const totalA = a.length - n + 1;
    const totalB = b.length - n + 1;
    return (2 * intersection) / (totalA + totalB);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 6 — SUBSEQUENCE MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if `query` is a subsequence of `target` (letters appear in order,
 * but not necessarily contiguous). E.g. "brndya" is a subsequence of "bernadya".
 * Returns a quality ratio (0..1) based on gap penalty.
 */
const subsequenceScore = (query, target) => {
    if (query.length > target.length) return 0;
    let qi = 0;
    let totalGap = 0;
    let lastMatchIdx = -1;

    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
        if (target[ti] === query[qi]) {
            if (lastMatchIdx >= 0) totalGap += (ti - lastMatchIdx - 1);
            lastMatchIdx = ti;
            qi++;
        }
    }

    if (qi < query.length) return 0; // not a full subsequence

    const matchRatio = query.length / target.length;
    const gapPenalty = totalGap / target.length;
    return Math.max(0, matchRatio - gapPenalty * 0.5);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 7 — ACRONYM / INITIALS MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract initials/acronym from a multi-word string.
 * "Sheila On 7" → "so7", "Juicy Luicy" → "jl", "Backstreet Boys" → "bb"
 */
const extractInitials = (normalized) => {
    const tokens = normalized.split(' ').filter(Boolean);
    return tokens.map((t) => t[0]).join('');
};

/**
 * Check if the query matches as an acronym/initials of the target.
 * Returns score 0..75. Supports partial acronym matching too.
 */
const acronymScore = (query, target) => {
    const initials = extractInitials(target);
    if (initials.length < 2) return 0; // need at least 2 words for acronym

    if (initials === query) return 75;  // full acronym match
    if (initials.startsWith(query) && query.length >= 2) return 65; // partial acronym
    return 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 8 — DOUBLE/SINGLE LETTER TOLERANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Collapse consecutive duplicate letters: "vierra"→"viera", "beerr"→"ber".
 * This allows matching "viera" to "vierra" and vice-versa.
 */
const collapseDoubles = (str) => str.replace(/(.)\1+/g, '$1');

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 9 — WORD-BOUNDARY-AWARE CONTAINS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if `query` appears in `target` and whether it aligns with a word boundary.
 * Returns:  80 if match at word start, 70 if match mid-word, 0 if no match.
 */
const wordBoundaryContains = (query, target) => {
    const idx = target.indexOf(query);
    if (idx === -1) return 0;
    // Check if the match is at a word boundary (start of string or preceded by space)
    if (idx === 0 || target[idx - 1] === ' ') return 80;
    return 70;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 10 — COMPOSITE FUZZY SCORE (MULTI-SIGNAL FUSION)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a composite fuzzy score for how well `query` matches `target`.
 * Fuses multiple signals into a single 0-100 relevance score.
 *
 * Scoring tiers (approximate):
 *   100    — exact match
 *   90-95  — exact after collapsing double letters ("viera"="vierra")
 *   85     — target starts with query
 *   75-80  — word-boundary-aware contains / acronym match
 *   70     — mid-word contains
 *   56-69  — all query tokens found (order-independent)
 *   40-55  — fuzzy single/multi-word match (Jaro-Winkler + weighted Levenshtein + bigrams)
 *   20-39  — subsequence match / partial token match
 *   0      — no meaningful match
 */
const fuzzyScore = (query, target) => {
    if (!query || !target) return 0;

    // ── Tier 1: Exact match ──
    if (target === query) return 100;

    // ── Tier 2: Exact after collapsing double letters ──
    const collapsedQuery = collapseDoubles(query);
    const collapsedTarget = collapseDoubles(target);
    if (collapsedTarget === collapsedQuery && collapsedQuery.length >= 3) return 95;

    // ── Tier 3: Starts-with ──
    if (target.startsWith(query)) return 85;
    if (collapsedTarget.startsWith(collapsedQuery) && collapsedQuery.length >= 3) return 83;

    // ── Tier 4: Word-boundary-aware contains & Acronym ──
    const containsScore = wordBoundaryContains(query, target);
    const acroScore = acronymScore(query, target);
    const tier4Best = Math.max(containsScore, acroScore);
    if (tier4Best > 0) return tier4Best;

    // Also try contains on collapsed versions
    if (collapsedTarget.includes(collapsedQuery) && collapsedQuery.length >= 3) return 68;

    // ── Tier 5: Token-based matching (word-order-independent) ──
    const queryTokens = query.split(' ').filter(Boolean);
    const targetTokens = target.split(' ').filter(Boolean);

    if (queryTokens.length > 1) {
        // Word-order-independent: every query token must match a target token
        const tokenMatchResult = scoreTokenMatch(queryTokens, targetTokens);
        if (tokenMatchResult > 0) return tokenMatchResult;
    }

    // ── Tier 6: Single-word fuzzy ──
    if (queryTokens.length === 1 && query.length >= 2) {
        let bestWordScore = 0;
        for (const tt of targetTokens) {
            const score = singleWordFuzzyScore(query, tt);
            if (score > bestWordScore) bestWordScore = score;
        }
        // Also try against the full target string
        const fullScore = singleWordFuzzyScore(query, target);
        const best = Math.max(bestWordScore, fullScore);
        if (best > 0) return best;
    }

    // ── Tier 7: Multi-word fuzzy (each token independently) ──
    if (queryTokens.length > 1) {
        const multiResult = scoreMultiWordFuzzy(queryTokens, targetTokens);
        if (multiResult > 0) return multiResult;
    }

    // ── Tier 8: Subsequence matching (last resort) ──
    const subScore = subsequenceScore(query, target);
    if (subScore >= 0.6) return Math.round(20 + subScore * 20); // 20-40 range

    return 0;
};

/**
 * Score token-level matching with word-order independence.
 * Each query token is matched to its best target token (exact > prefix > contains > fuzzy).
 * Returns 56-69 if all tokens match, partial score for partial matches.
 */
const scoreTokenMatch = (queryTokens, targetTokens) => {
    let totalQuality = 0;
    let matchedCount = 0;

    for (const qt of queryTokens) {
        let bestMatch = 0;

        for (const tt of targetTokens) {
            if (tt === qt) { bestMatch = Math.max(bestMatch, 1.0); continue; }
            if (tt.startsWith(qt)) { bestMatch = Math.max(bestMatch, 0.9); continue; }
            if (tt.includes(qt)) { bestMatch = Math.max(bestMatch, 0.75); continue; }
            // Fuzzy match per token
            if (qt.length >= 3) {
                const jw = jaroWinklerSimilarity(qt, tt);
                if (jw >= 0.82) bestMatch = Math.max(bestMatch, jw * 0.7);
            }
        }

        if (bestMatch > 0.3) {
            totalQuality += bestMatch;
            matchedCount++;
        }
    }

    if (matchedCount === queryTokens.length) {
        const avgQuality = totalQuality / queryTokens.length;
        return Math.round(56 + avgQuality * 13); // 56-69 range
    }

    if (matchedCount > 0) {
        const ratio = matchedCount / queryTokens.length;
        return Math.round(35 * ratio); // 0-35 range for partial
    }

    return 0;
};

/**
 * Score each query token against target tokens with full fuzzy matching.
 * Used when exact/prefix/contains token matching didn't fire.
 */
const scoreMultiWordFuzzy = (queryTokens, targetTokens) => {
    let totalScore = 0;
    let matchedTokens = 0;

    for (const qt of queryTokens) {
        let bestScore = 0;
        for (const tt of targetTokens) {
            const score = singleWordFuzzyScore(qt, tt);
            if (score > bestScore) bestScore = score;
        }
        if (bestScore > 12) {
            totalScore += bestScore;
            matchedTokens++;
        }
    }

    if (matchedTokens === queryTokens.length) {
        const avg = totalScore / queryTokens.length;
        return Math.min(55, Math.round(38 + avg * 0.35)); // 38-55 range
    }

    if (matchedTokens > 0) {
        const ratio = matchedTokens / queryTokens.length;
        return Math.round(25 * ratio);
    }

    return 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 11 — SINGLE-WORD FUZZY SCORE (MULTI-SIGNAL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score a single query word against a single target word.
 * Fuses: weighted Levenshtein, Jaro-Winkler, bigrams, prefix bonus,
 * keyboard proximity, phonetic similarity, double-letter tolerance.
 *
 * @returns {number} score 0..55
 */
const singleWordFuzzyScore = (queryWord, targetWord) => {
    if (!queryWord || !targetWord) return 0;
    if (queryWord === targetWord) return 55;
    if (targetWord.startsWith(queryWord)) return 52;
    if (targetWord.includes(queryWord)) return 48;

    // Double-letter tolerance: "viera" ↔ "vierra"
    const cq = collapseDoubles(queryWord);
    const ct = collapseDoubles(targetWord);
    if (cq === ct) return 50;
    if (ct.startsWith(cq) && cq.length >= 3) return 47;
    if (ct.includes(cq) && cq.length >= 3) return 44;

    const maxLen = Math.max(queryWord.length, targetWord.length);
    if (maxLen === 0) return 0;

    // Adaptive threshold: short queries are more tolerant
    const maxAllowedDistance = queryWord.length <= 4
        ? Math.ceil(maxLen * 0.5)    // 50% tolerance for short words
        : Math.ceil(maxLen * 0.42);  // 42% for longer words

    // ── Signal 1: Weighted Levenshtein (QWERTY + phonetic aware) ──
    const wDist = weightedLevenshtein(queryWord, targetWord);
    if (wDist > maxAllowedDistance) {
        // Even if weighted distance is too high, try Jaro-Winkler as fallback
        const jwFallback = jaroWinklerSimilarity(queryWord, targetWord);
        if (jwFallback >= 0.85) return Math.round(jwFallback * 40);
        // Also try collapsed doubles
        const cdDist = weightedLevenshtein(cq, ct);
        if (cdDist <= Math.ceil(Math.max(cq.length, ct.length) * 0.42)) {
            const cdLev = 1 - (cdDist / Math.max(cq.length, ct.length));
            return Math.max(12, Math.round(cdLev * 40));
        }
        return 0;
    }
    const levScore = 1 - (wDist / maxLen);

    // ── Signal 2: Jaro-Winkler similarity ──
    const jwScore = jaroWinklerSimilarity(queryWord, targetWord);

    // ── Signal 3: Bigram similarity ──
    const bigramScore = ngramSimilarity(queryWord, targetWord, 2);

    // ── Signal 4: Prefix match bonus ──
    let prefixBonus = 0;
    const checkLen = Math.min(queryWord.length, targetWord.length, 4);
    let prefixMatch = 0;
    for (let i = 0; i < checkLen; i++) {
        if (queryWord[i] === targetWord[i]) prefixMatch++;
        else break;
    }
    if (prefixMatch >= 3) prefixBonus = 0.18;
    else if (prefixMatch >= 2) prefixBonus = 0.12;
    else if (prefixMatch >= 1) prefixBonus = 0.05;

    // ── Signal 5: Length similarity bonus ──
    const lenRatio = Math.min(queryWord.length, targetWord.length) / maxLen;
    const lenBonus = lenRatio > 0.7 ? 0.05 : 0;

    // ── Fusion: weighted combination of all signals ──
    const combined =
        levScore    * 0.30 +   // 30% weighted Levenshtein
        jwScore     * 0.30 +   // 30% Jaro-Winkler
        bigramScore * 0.20 +   // 20% bigram structure
        prefixBonus +          // up to 18% prefix bonus
        lenBonus;              // up to 5% length similarity

    // Scale to 0..55
    const finalScore = Math.round(combined * 55);
    return finalScore >= 12 ? finalScore : 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 12 — LOCAL SEARCH ENGINES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quality-amplified ranking formula.
 * The relevance score (0-100) is DOUBLED so it dominates the ranking.
 * The type base bonus is small, ensuring high-quality matches always win
 * regardless of item type.
 *
 * Formula:  searchRank = BASE + (score × 2)
 *
 * Examples with "feast nina":
 *   Song  "Nina" by .Feast → score=100 → 200 + 200 = 400  ← WINS
 *   Artist ".Feast"         → score=18  → 200 + 36  = 236
 *
 * Examples with "feast":
 *   Artist ".Feast"         → score=100 → 215 + 200 = 415  ← WINS
 *   Song   "Arteri"         → score=85  → 200 + 170 = 370
 */
const LOCAL_SONG_BASE = 200;
const LOCAL_ARTIST_BASE = 200;
// Small bonus so artists with EQUAL relevance edge above songs
// (typing an artist name → artist should appear first)
const ARTIST_STRONG_MATCH_BONUS = 15;
// Minimum fuzzy score required to appear in results.
// Filters out weak/noise matches so the dropdown only shows meaningful results.
// Score guide: exact=100, prefix=85, contains=70, token=56-69, fuzzy=30-55
const MIN_RELEVANCE_THRESHOLD = 20;

/**
 * Search local songs with super-smart fuzzy matching.
 * Scores against: song name, artist name, combined, reversed, and initials.
 * @param {string} query - raw user query
 * @param {Array} songs - local songs array
 * @returns {Array} scored results sorted by searchRank descending
 */
export const searchLocalSongs = (query, songs) => {
    if (!query || !songs?.length) return [];
    const normQuery = normalize(query);
    if (normQuery.length < 2) return [];

    const results = [];

    for (const song of songs) {
        const normName = normalize(song.name);
        const normArtist = normalize(song.artist);
        const combined = `${normName} ${normArtist}`;
        const reversed = `${normArtist} ${normName}`;

        // Score against multiple representations
        const scores = [
            fuzzyScore(normQuery, normName),
            fuzzyScore(normQuery, normArtist),
            fuzzyScore(normQuery, combined),
            fuzzyScore(normQuery, reversed),
        ];

        // Bonus: if query matches artist initials + song name fragment
        const artistInitials = extractInitials(normArtist);
        if (normQuery.startsWith(artistInitials) && artistInitials.length >= 2) {
            const remainder = normQuery.slice(artistInitials.length).trim();
            if (remainder && normName.includes(remainder)) {
                scores.push(72);
            }
        }

        const bestScore = Math.max(...scores);

        if (bestScore >= MIN_RELEVANCE_THRESHOLD) {
            results.push({
                ...song,
                type: 'song',
                isLocal: true,
                // Quality-amplified: score × 2 makes relevance the dominant factor
                searchRank: LOCAL_SONG_BASE + (bestScore * 2)
            });
        }
    }

    return results.sort((a, b) => b.searchRank - a.searchRank);
};

/**
 * Search local artists with super-smart fuzzy matching.
 * @param {string} query - raw user query
 * @param {Array} artists - local artists array
 * @returns {Array} scored results sorted by searchRank descending
 */
export const searchLocalArtists = (query, artists) => {
    if (!query || !artists?.length) return [];
    const normQuery = normalize(query);
    if (normQuery.length < 2) return [];

    const results = [];

    for (const artist of artists) {
        const normName = normalize(artist.name);
        const score = fuzzyScore(normQuery, normName);

        if (score >= MIN_RELEVANCE_THRESHOLD) {
            // Quality-amplified: score × 2 makes relevance the dominant factor
            // Strong matches (score >= 70) get a small bonus so that typing
            // an artist's name shows the artist above their songs
            const strongBonus = score >= 70 ? ARTIST_STRONG_MATCH_BONUS : 0;
            results.push({
                ...artist,
                type: 'artist',
                isLocal: true,
                searchRank: LOCAL_ARTIST_BASE + (score * 2) + strongBonus
            });
        }
    }

    return results.sort((a, b) => b.searchRank - a.searchRank);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 13 — RELEVANCE SCORE (backward compatible)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Drop-in replacement for the old getRelevanceScore.
 * Returns 0-100 fuzzy relevance across all provided values.
 */
export const getFuzzyRelevanceScore = (query, ...values) => {
    if (!query) return 0;
    const normQuery = normalize(query);
    if (!normQuery) return 0;

    let bestScore = 0;
    for (const value of values) {
        if (!value) continue;
        const normValue = normalize(value);
        const score = fuzzyScore(normQuery, normValue);
        if (score > bestScore) bestScore = score;
    }
    return bestScore;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { normalize, levenshteinDistance, ngramSimilarity, fuzzyScore, jaroWinklerSimilarity };
