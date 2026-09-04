import { getFeaturedLocalSongs, loadLocalCatalog, getTrendingCatalog } from '../../services/catalogService.js';
import { showToast } from '../../utils/domUtils.js';

/**
 * Spotiwind — WindFlow Radio Module
 * Implements continuous flow-matching, BPM/Energy alignment,
 * interactive steering (Steer Toward / Away), and Gust Mode.
 */

let windflowSongsPool = [];
let activeCurrentKey = 'gentle-breeze';
let activeSeedTrack = null;
let upcomingFlowQueue = [];
let isGustModeActive = false;
let steeredTrackBias = null;
let playedSongIds = new Set();
let cleanupListeners = [];

const CURRENTS_CONFIG = {
    'gentle-breeze': {
        name: 'Gentle Breeze',
        targetBpmMin: 70,
        targetBpmMax: 95,
        defaultBpm: 84,
        vibeCategory: 'chill',
        desc: 'Lo-Fi, Chill Pop, & alunan santai'
    },
    'zephyr-flow': {
        name: 'Zephyr Flow',
        targetBpmMin: 95,
        targetBpmMax: 115,
        defaultBpm: 104,
        vibeCategory: 'indie',
        desc: 'Acoustic, Indie Folk, & melodi hangat'
    },
    'mistral-drift': {
        name: 'Mistral Drift',
        targetBpmMin: 110,
        targetBpmMax: 128,
        defaultBpm: 120,
        vibeCategory: 'electronic',
        desc: 'Deep Focus, Synthwave, & Electronic'
    },
    'gale-force': {
        name: 'Gale Force',
        targetBpmMin: 125,
        targetBpmMax: 160,
        defaultBpm: 138,
        vibeCategory: 'workout',
        desc: 'High Energy, Workout, & Rock'
    },
    'solar-wind': {
        name: 'Solar Wind',
        targetBpmMin: 85,
        targetBpmMax: 130,
        defaultBpm: 112,
        vibeCategory: 'local',
        desc: 'Koleksi Lagu Populer Indonesia'
    },
    'aurora-night': {
        name: 'Aurora Night',
        targetBpmMin: 80,
        targetBpmMax: 105,
        defaultBpm: 92,
        vibeCategory: 'night',
        desc: 'Midnight R&B & Dream Pop'
    }
};

/**
 * Generates a pseudo-deterministic BPM and Vibe score from song ID/name
 */
const assignSongFlowMetadata = (song, index) => {
    const rawId = String(song.id || song.name || index);
    let hash = 0;
    for (let i = 0; i < rawId.length; i++) {
        hash = (hash << 5) - hash + rawId.charCodeAt(i);
        hash |= 0;
    }
    const absHash = Math.abs(hash);
    const bpm = 75 + (absHash % 75); // Range 75 - 150 BPM
    const vibeMatch = 88 + (absHash % 12); // Range 88% - 99%

    return {
        ...song,
        bpm: song.bpm || bpm,
        vibeMatch: vibeMatch,
        energyScore: (bpm - 70) / 80
    };
};

/**
 * Loads and combines the catalog from multiple sources
 */
const initCatalogPool = async () => {
    if (windflowSongsPool.length > 0) return windflowSongsPool;

    try {
        const localSongs = getFeaturedLocalSongs();
        let manifestSongs = [];
        try {
            const manifestData = await loadLocalCatalog();
            if (manifestData && manifestData.songs) {
                manifestSongs = manifestData.songs;
            }
        } catch (e) {
            console.warn("Manifest loading skipped, using featured:", e);
        }

        let trendingSongs = [];
        try {
            trendingSongs = await getTrendingCatalog(15);
        } catch (e) {
            console.warn("Trending fetch fallback:", e);
        }

        const combined = [...localSongs, ...manifestSongs, ...trendingSongs];
        const unique = [];
        const seenIds = new Set();

        combined.forEach((s, idx) => {
            const id = s.id || `song-${idx}`;
            if (!seenIds.has(id) && s.audio) {
                seenIds.add(id);
                unique.push(assignSongFlowMetadata(s, idx));
            }
        });

        windflowSongsPool = unique.length > 0 ? unique : localSongs.map(assignSongFlowMetadata);
        return windflowSongsPool;
    } catch (err) {
        console.error("Failed to initialize WindFlow catalog pool:", err);
        windflowSongsPool = getFeaturedLocalSongs().map(assignSongFlowMetadata);
        return windflowSongsPool;
    }
};

/**
 * Continuous Flow-Matching Algorithm
 */
const generateFlowQueue = (seedTrack = null, currentKey = activeCurrentKey, isGust = isGustModeActive, bias = steeredTrackBias) => {
    const config = CURRENTS_CONFIG[currentKey] || CURRENTS_CONFIG['gentle-breeze'];
    let pool = [...windflowSongsPool];

    // Filter out recently played if pool is large enough
    if (pool.length > 5 && playedSongIds.size > 0) {
        const filtered = pool.filter(s => !playedSongIds.has(s.id));
        if (filtered.length >= 4) pool = filtered;
    }

    // Score each song based on compatibility with current flow settings
    const scoredPool = pool.map(song => {
        let score = 0;

        // 1. Gust Mode Bonus (prioritize higher BPM)
        if (isGust) {
            if (song.bpm >= 120) score += 50;
            if (song.bpm >= 135) score += 30;
        } else {
            // Normal Current BPM matching
            if (song.bpm >= config.targetBpmMin && song.bpm <= config.targetBpmMax) {
                score += 40;
            } else {
                const diff = Math.min(Math.abs(song.bpm - config.targetBpmMin), Math.abs(song.bpm - config.targetBpmMax));
                score += Math.max(0, 30 - diff);
            }
        }

        // 2. Steered Bias Compatibility
        if (bias && bias.bpm) {
            const bpmDiff = Math.abs(song.bpm - bias.bpm);
            score += Math.max(0, 35 - bpmDiff);
            if (bias.artist && song.artist === bias.artist) {
                score += 25;
            }
        }

        // 3. Seed Track Continuity
        if (seedTrack) {
            if (song.id === seedTrack.id) score -= 1000; // Do not replay current
            const bpmProximity = Math.abs(song.bpm - (seedTrack.bpm || config.defaultBpm));
            score += Math.max(0, 30 - bpmProximity);
        }

        // Subtle organic variation
        score += (Math.random() * 8);

        return { song, score };
    });

    scoredPool.sort((a, b) => b.score - a.score);
    return scoredPool.map(item => item.song).slice(0, 8);
};

/**
 * Updates the UI with current track info
 */
const updateFlowUI = () => {
    const trackArt = document.getElementById('flowTrackArt');
    const trackTitle = document.getElementById('flowTrackTitle');
    const trackArtist = document.getElementById('flowTrackArtist');
    const bpmValue = document.getElementById('flowBpmValue');
    const vibeValue = document.getElementById('flowVibeValue');
    const currentBadge = document.getElementById('flowCurrentBadge');
    const controllerCard = document.getElementById('windflowController');
    const gustBtn = document.getElementById('btnGustMode');
    const steerBtn = document.getElementById('btnSteerToward');

    const config = CURRENTS_CONFIG[activeCurrentKey] || CURRENTS_CONFIG['gentle-breeze'];

    if (currentBadge) currentBadge.textContent = config.name;

    if (activeSeedTrack) {
        if (trackArt && activeSeedTrack.cover) trackArt.src = activeSeedTrack.cover;
        if (trackTitle) trackTitle.textContent = activeSeedTrack.name || 'Unknown Track';
        if (trackArtist) trackArtist.textContent = activeSeedTrack.artist || 'Unknown Artist';
        if (bpmValue) bpmValue.textContent = `${activeSeedTrack.bpm || config.defaultBpm} BPM`;
        if (vibeValue) vibeValue.textContent = `${activeSeedTrack.vibeMatch || 96}% Vibe Match`;
        if (controllerCard) controllerCard.classList.add('is-playing');
    }

    if (controllerCard) {
        controllerCard.classList.toggle('is-gust-active', isGustModeActive);
    }

    if (gustBtn) {
        gustBtn.classList.toggle('is-active', isGustModeActive);
    }

    if (steerBtn) {
        steerBtn.classList.toggle('is-steered', Boolean(steeredTrackBias && activeSeedTrack && steeredTrackBias.id === activeSeedTrack.id));
    }

    renderUpcomingQueueList();
};

/**
 * Renders the upcoming queue list in DOM
 */
const renderUpcomingQueueList = () => {
    const listContainer = document.getElementById('upcomingStreamList');
    if (!listContainer) return;

    if (!upcomingFlowQueue || upcomingFlowQueue.length === 0) {
        listContainer.innerHTML = `
            <div class="stream-loading-placeholder">
                <p>Tidak ada antrean lagu selanjutnya.</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = upcomingFlowQueue.map((track, idx) => `
        <div class="stream-track-card" data-song-id="${track.id}" data-index="${idx}">
            <span class="stream-track-order">${String(idx + 1).padStart(2, '0')}</span>
            <div class="stream-track-art-wrap">
                <img class="stream-track-art" src="${track.cover || '../../public/branding/Hero%20Section.webp'}" alt="${track.name}" width="44" height="44" loading="lazy">
            </div>
            <div class="stream-track-info">
                <h4 class="stream-track-title">${track.name}</h4>
                <p class="stream-track-artist">${track.artist}</p>
            </div>
            <div class="stream-track-match">
                <span class="match-pill">${track.vibeMatch || 94}% Flow</span>
                <span class="match-bpm">${track.bpm || 110} BPM</span>
            </div>
        </div>
    `).join('');

    // Attach click event for upcoming stream cards
    const trackCards = listContainer.querySelectorAll('.stream-track-card');
    trackCards.forEach(card => {
        const handler = () => {
            const idx = Number(card.dataset.index);
            const selectedTrack = upcomingFlowQueue[idx];
            if (selectedTrack) {
                rideTrackInFlow(selectedTrack, true);
            }
        };
        card.addEventListener('click', handler);
        cleanupListeners.push(() => card.removeEventListener('click', handler));
    });
};

/**
 * Plays a track and recalculates the flow
 */
const rideTrackInFlow = (track, userInitiated = false) => {
    if (!track) return;

    activeSeedTrack = track;
    playedSongIds.add(track.id);

    // Keep played history capped to last 30 songs
    if (playedSongIds.size > 30) {
        const oldest = playedSongIds.values().next().value;
        playedSongIds.delete(oldest);
    }

    // Recalculate upcoming queue based on this seed track
    upcomingFlowQueue = generateFlowQueue(track, activeCurrentKey, isGustModeActive, steeredTrackBias);

    updateFlowUI();

    // Trigger audio playback using Spotiwind Global Preview Player
    if (typeof window.playPreview === 'function') {
        const dummyOverlay = document.createElement('div');
        dummyOverlay.dataset.audio = track.audio;
        dummyOverlay.dataset.name = track.name;
        dummyOverlay.dataset.artist = track.artist;
        dummyOverlay.dataset.cover = track.cover;
        dummyOverlay.dataset.duration = track.duration || 200;
        dummyOverlay.dataset.context = 'windflow_radio';

        window.playPreview(
            dummyOverlay,
            track.audio,
            track.name,
            track.artist,
            track.cover,
            track.id,
            track.duration || 200,
            'windflow_radio'
        );
    }

    if (userInitiated) {
        showToast(`Riding ${track.name} in the flow 🍃`);
    }
};

/**
 * Initializes the WindFlow Page
 */
export const initWindFlowPage = async () => {
    cleanupWindFlowPage();

    await initCatalogPool();

    // Setup Current Cards Click Listeners
    const currentCards = document.querySelectorAll('.current-card');
    currentCards.forEach(card => {
        const handler = (e) => {
            e.preventDefault();
            const currentKey = card.dataset.current;
            if (!currentKey || !CURRENTS_CONFIG[currentKey]) return;

            currentCards.forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');

            activeCurrentKey = currentKey;
            isGustModeActive = (currentKey === 'gale-force');
            steeredTrackBias = null;

            // Generate new queue and play first song
            upcomingFlowQueue = generateFlowQueue(null, activeCurrentKey, isGustModeActive);
            if (upcomingFlowQueue.length > 0) {
                rideTrackInFlow(upcomingFlowQueue[0], true);
            }
        };

        card.addEventListener('click', handler);
        cleanupListeners.push(() => card.removeEventListener('click', handler));
    });

    // Setup Steer Toward Button (❤️)
    const btnSteerToward = document.getElementById('btnSteerToward');
    if (btnSteerToward) {
        const handler = (e) => {
            e.preventDefault();
            if (!activeSeedTrack) {
                showToast("Pilih aliran lagu terlebih dahulu");
                return;
            }

            steeredTrackBias = {
                id: activeSeedTrack.id,
                bpm: activeSeedTrack.bpm,
                artist: activeSeedTrack.artist,
                vibe: activeSeedTrack.vibeCategory
            };

            upcomingFlowQueue = generateFlowQueue(activeSeedTrack, activeCurrentKey, isGustModeActive, steeredTrackBias);
            updateFlowUI();
            showToast(`Aliran diselaraskan ke arah musik ${activeSeedTrack.name} ✨`);
        };
        btnSteerToward.addEventListener('click', handler);
        cleanupListeners.push(() => btnSteerToward.removeEventListener('click', handler));
    }

    // Setup Steer Away Button (💨)
    const btnSteerAway = document.getElementById('btnSteerAway');
    if (btnSteerAway) {
        const handler = (e) => {
            e.preventDefault();
            if (upcomingFlowQueue.length > 0) {
                const nextTrack = upcomingFlowQueue[0];
                showToast("Membelokkan aliran ke lagu berikutnya 💨");
                rideTrackInFlow(nextTrack, false);
            } else {
                upcomingFlowQueue = generateFlowQueue(null, activeCurrentKey, isGustModeActive);
                if (upcomingFlowQueue.length > 0) {
                    rideTrackInFlow(upcomingFlowQueue[0], false);
                }
            }
        };
        btnSteerAway.addEventListener('click', handler);
        cleanupListeners.push(() => btnSteerAway.removeEventListener('click', handler));
    }

    // Setup Gust Mode Button (⚡)
    const btnGustMode = document.getElementById('btnGustMode');
    if (btnGustMode) {
        const handler = (e) => {
            e.preventDefault();
            isGustModeActive = !isGustModeActive;

            if (isGustModeActive) {
                showToast("Gust Mode Aktif! Lonjakan energi & tempo tinggi ⚡");
            } else {
                showToast("Gust Mode Dinonaktifkan, kembali ke hembusan normal 🍃");
            }

            upcomingFlowQueue = generateFlowQueue(activeSeedTrack, activeCurrentKey, isGustModeActive, steeredTrackBias);
            if (isGustModeActive && upcomingFlowQueue.length > 0) {
                rideTrackInFlow(upcomingFlowQueue[0], false);
            } else {
                updateFlowUI();
            }
        };
        btnGustMode.addEventListener('click', handler);
        cleanupListeners.push(() => btnGustMode.removeEventListener('click', handler));
    }

    // Setup Refresh Flow Button
    const refreshBtn = document.getElementById('refreshFlowBtn');
    if (refreshBtn) {
        const handler = (e) => {
            e.preventDefault();
            upcomingFlowQueue = generateFlowQueue(activeSeedTrack, activeCurrentKey, isGustModeActive, steeredTrackBias);
            renderUpcomingQueueList();
            showToast("Hembusan antrean berhasil diacak ulang 🌀");
        };
        refreshBtn.addEventListener('click', handler);
        cleanupListeners.push(() => refreshBtn.removeEventListener('click', handler));
    }

    // Auto-seed initial queue if empty
    if (!activeSeedTrack && windflowSongsPool.length > 0) {
        upcomingFlowQueue = generateFlowQueue(null, activeCurrentKey, false);
        if (upcomingFlowQueue.length > 0) {
            activeSeedTrack = upcomingFlowQueue[0];
            updateFlowUI();
        }
    } else {
        updateFlowUI();
    }
};

/**
 * Cleanup Page Handler
 */
export const cleanupWindFlowPage = () => {
    while (cleanupListeners.length > 0) {
        const cleanup = cleanupListeners.pop();
        try {
            if (typeof cleanup === 'function') cleanup();
        } catch (e) {
            console.warn("Cleanup listener error:", e);
        }
    }
};

// Backward compatibility alias
export const initRadioPage = initWindFlowPage;
