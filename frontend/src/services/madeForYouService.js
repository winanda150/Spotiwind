import { loadLocalCatalog } from './catalogService.js';

let cachedMixes = null;

const MIX_DEFINITIONS = [
    {
        id: 'mix-your-top',
        title: 'Daily Mix 1',
        tag: 'DAILY MIX 1',
        gradient: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)',
        accentColor: '#10b981',
        defaultArtistKeywords: ['hindia', 'feast', 'barasuara', 'bilal indrajaya', 'adrian khalif'],
        fallbackDescription: 'Hindia, .Feast, Barasuara, and more'
    },
    {
        id: 'mix-chill',
        title: 'Chill Mix',
        tag: 'MOOD MIX',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)',
        accentColor: '#3b82f6',
        defaultArtistKeywords: ['bilal indrajaya', 'aruma', 'nadhif basalamah', 'ghea indrawari', 'idgitaf', 'batas senja'],
        fallbackDescription: 'Bilal Indrajaya, Aruma, Nadhif Basalamah'
    },
    {
        id: 'mix-galau-sad',
        title: 'Galau / Sad Mix',
        tag: 'HEARTBREAK',
        gradient: 'linear-gradient(135deg, #6366f1 0%, #312e81 100%)',
        accentColor: '#6366f1',
        defaultArtistKeywords: ['juicy luicy', 'bernadya', 'aruma', 'mahen', 'stevan pasaribu', 'for revenge'],
        fallbackDescription: 'Juicy Luicy, Bernadya, Aruma, Mahen'
    },
    {
        id: 'mix-throwback',
        title: 'Throwback 2000s',
        tag: 'NOSTALGIA',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #78350f 100%)',
        accentColor: '#f59e0b',
        defaultArtistKeywords: ['vierra', 'sheila on 7', 'backstreet boys', 'radiohead', 'christina perri', 'hivi!'],
        fallbackDescription: 'Vierra, Sheila On 7, Backstreet Boys'
    },
    {
        id: 'mix-rock-energy',
        title: 'Energy & Rock Mix',
        tag: 'POWER MIX',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #4c1d95 100%)',
        accentColor: '#8b5cf6',
        defaultArtistKeywords: ['feast', 'for revenge', 'barasuara', 'radiohead'],
        fallbackDescription: '.Feast, For Revenge, Barasuara'
    },
    {
        id: 'mix-night-drive',
        title: 'Night Drive Mix',
        tag: 'VIBES',
        gradient: 'linear-gradient(135deg, #06b6d4 0%, #164e63 100%)',
        accentColor: '#06b6d4',
        defaultArtistKeywords: ['hindia', 'adrian khalif', 'bilal indrajaya', 'idgitaf', 'bernadya'],
        fallbackDescription: 'Hindia, Adrian Khalif, Bilal Indrajaya'
    },
    {
        id: 'mix-hindia-friends',
        title: 'Hindia & Friends Mix',
        tag: 'ARTIST MIX',
        gradient: 'linear-gradient(135deg, #e11d48 0%, #881337 100%)',
        accentColor: '#e11d48',
        defaultArtistKeywords: ['hindia', 'feast', 'bilal indrajaya', 'adrian khalif', 'barasuara'],
        fallbackDescription: 'Hindia, .Feast, Bilal Indrajaya'
    },
    {
        id: 'mix-juicy-pop',
        title: 'Juicy Luicy & Pop Mix',
        tag: 'ARTIST MIX',
        gradient: 'linear-gradient(135deg, #d946ef 0%, #701a75 100%)',
        accentColor: '#d946ef',
        defaultArtistKeywords: ['juicy luicy', 'bernadya', 'rizky febian', 'andmesh', 'hivi!', 'raim laode'],
        fallbackDescription: 'Juicy Luicy, Bernadya, Rizky Febian'
    },
    {
        id: 'mix-morning-acoustic',
        title: 'Morning Acoustic',
        tag: 'ACOUSTIC',
        gradient: 'linear-gradient(135deg, #ec4899 0%, #831843 100%)',
        accentColor: '#ec4899',
        defaultArtistKeywords: ['ari lesmana', 'raim laode', 'batas senja', 'eńau', 'rizky febian'],
        fallbackDescription: 'Ari Lesmana, Raim Laode, Batas Senja'
    },
    {
        id: 'mix-global-discovery',
        title: 'Global Discovery',
        tag: 'INTERNATIONAL',
        gradient: 'linear-gradient(135deg, #f97316 0%, #7c2d12 100%)',
        accentColor: '#f97316',
        defaultArtistKeywords: ['radiohead', 'backstreet boys', 'christina perri'],
        fallbackDescription: 'Radiohead, Backstreet Boys, Christina Perri'
    }
];

/**
 * Filter and build curated song arrays for each Mix (True Spotify-Style Balanced Blend)
 */
export const getMadeForYouMixes = async () => {
    try {
        const catalog = await loadLocalCatalog();
        const allSongs = catalog.songs || [];
        if (allSongs.length === 0) return [];

        // Check user's recently played history to personalize 'Daily Mix 1'
        let recentArtists = [];
        try {
            const raw = localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]';
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                recentArtists = parsed
                    .map(s => String(s.artist || '').toLowerCase().trim())
                    .filter(Boolean);
            }
        } catch {
            recentArtists = [];
        }

        const mixes = MIX_DEFINITIONS.map((def) => {
            let targetKeywords = def.defaultArtistKeywords;
            if (def.id === 'mix-your-top' && recentArtists.length > 0) {
                const uniqueRecent = Array.from(new Set(recentArtists));
                targetKeywords = [...uniqueRecent, ...def.defaultArtistKeywords];
            }

            // Group all songs in catalog by matching keyword
            const songsByKeyword = new Map();
            targetKeywords.forEach(kw => songsByKeyword.set(kw, []));

            allSongs.forEach(song => {
                const rawArtist = String(song.artist || '');
                // Split collaborative artist names into individual parts for matching
                // e.g. "For Revenge & Stereo Wall" → ["For Revenge", "Stereo Wall"]
                const artistParts = rawArtist
                    .split(/\s*(?:feat\.?|ft\.?|&|×|✕|\/)\s*/i)
                    .map(s => s.toLowerCase().trim())
                    .filter(Boolean);

                const songName = String(song.name || '').toLowerCase();

                for (const kw of targetKeywords) {
                    // Match only if keyword matches one of the individual artist parts (exact segment),
                    // NOT the full collab string. Also allow title-based matching.
                    const artistMatch = artistParts.some(part => part.includes(kw) || kw.includes(part));
                    const nameMatch = songName.includes(kw);
                    if (artistMatch || nameMatch) {
                        songsByKeyword.get(kw).push(song);
                        break;
                    }
                }
            });

            // True Spotify Blend: Pick max 1-2 songs from each artist so it's a balanced mix
            const blendedSongs = [];
            const maxRounds = 2; // At most 2 songs per artist
            for (let round = 1; round <= maxRounds; round++) {
                for (const kw of targetKeywords) {
                    const pool = songsByKeyword.get(kw) || [];
                    if (pool.length >= round) {
                        blendedSongs.push(pool[round - 1]);
                        if (blendedSongs.length >= 10) break;
                    }
                }
                if (blendedSongs.length >= 10) break;
            }

            let matchedSongs = [...blendedSongs];

            // If not enough songs, fill with unique random songs from catalog
            if (matchedSongs.length < 8) {
                const matchedIds = new Set(matchedSongs.map(s => s.id));
                const remaining = allSongs.filter(s => !matchedIds.has(s.id));
                const shuffledRemaining = [...remaining].sort(() => 0.5 - Math.random());
                matchedSongs = [...matchedSongs, ...shuffledRemaining].slice(0, 10);
            }

            // [CRITICAL] Shuffle the mixed songs so different artists alternate seamlessly!
            matchedSongs = matchedSongs.sort(() => 0.5 - Math.random()).slice(0, 10);

            // Extract top 3 unique artist names for subtitle preview
            const artistNames = Array.from(new Set(matchedSongs.map(s => s.artist).filter(Boolean)));
            const subtitle = artistNames.length > 0 
                ? artistNames.slice(0, 3).join(', ') + (artistNames.length > 3 ? ', and more' : '')
                : def.fallbackDescription;

            // [SPOTIFY STYLE] Pick 1 unique cover per artist for a 2x2 collage
            // This prevents duplicate covers across different mixes
            const seenArtists = new Set();
            const collageCovers = [];
            for (const song of matchedSongs) {
                const artistKey = String(song.artist || '').toLowerCase().trim();
                if (artistKey && !seenArtists.has(artistKey) && song.cover) {
                    seenArtists.add(artistKey);
                    collageCovers.push(song.cover);
                    if (collageCovers.length >= 4) break;
                }
            }
            // Fill remaining slots if needed
            if (collageCovers.length < 4) {
                for (const song of matchedSongs) {
                    if (!collageCovers.includes(song.cover) && song.cover) {
                        collageCovers.push(song.cover);
                        if (collageCovers.length >= 4) break;
                    }
                }
            }
            const primaryCover = collageCovers[0] || '../../public/Elemen/Logo/Spotiwind.webp';

            return {
                id: def.id,
                title: def.title,
                tag: def.tag,
                subtitle,
                cover: primaryCover,
                coverImages: collageCovers,
                gradient: def.gradient,
                accentColor: def.accentColor,
                songsCount: matchedSongs.length,
                songs: matchedSongs
            };
        });

        cachedMixes = mixes;
        return mixes;
    } catch (error) {
        console.error('Failed to generate Made for You mixes:', error);
        return [];
    }
};

export const getCachedMadeForYouMixes = () => cachedMixes || [];
