import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase-config.js";

import { toggleFavorite, isFavoriteSong } from '../../services/favoriteService.js';
import { updateMyActivity as updateActivityRecord } from '../../services/activityService.js';
import { getFollowingIds, subscribeFriendsActivityByIds } from '../../services/activityService.js';
import { watchUserConnection, watchFriendPresence } from '../../services/presenceService.js';
import { subscribeUserPlaylists, createUserPlaylist } from '../../services/libraryService.js';
import { isUserPremium } from '../../services/profileService.js';
import { retryCatalogRequest, loadLocalCatalog, getFeaturedLocalSongs } from '../../services/catalogService.js';
import { setContextPlaylist, syncQueueState, setPlaybackModes, nextSong as getNextSong, previousSong as getPreviousSong } from '../../services/playerService.js';
import { searchCatalogData } from '../../services/searchService.js';
import { recordRecentlyPlayed, subscribeRecentlyPlayed, getRecentlyPlayed } from '../../services/recentlyPlayedService.js';
import { recordTrackPlay, subscribePopularTracks } from '../../services/popularTrackService.js';
import { recordArtistPlay, subscribeTopArtists } from '../../services/topArtistService.js';
import { getMadeForYouMixes } from '../../services/madeForYouService.js';

import { PLAY_ICON, PAUSE_ICON, VOLUME_PATH, MUTE_PATH } from '../../constants/icons.js';
import { formatTime, debounce } from '../../utils/formatters.js';
import { areSameSongs } from '../../utils/audioUtils.js';
import { showToast, loadStylesheet, createHeartParticles } from '../../utils/domUtils.js';
import { initFriendsActivityModal } from '../../components/modals/friendsActivityModal.js';
import { openMixDetailModal, closeMixDetailModal } from '../../components/sheets/mixDetailSheet.js';
import { updateAppUrl } from '../../core/pageLoader.js';

let playlistUnsubscribe = null;
let recentlyPlayedUnsubscribe = null;
let friendActivityListeners = []; // Using an array to track multiple listeners
let currentFriendActivityLimit = 10;
let isLoadingMoreActivity = false;
let hasReachedActivityEnd = false;
let activityUpdateTimeout = null; // For activity update optimization
let lastRecordedActivitySong = '';



// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let desktopMadeForYouMixes = []; // Buffer to store 10 Made for You mixes on desktop
let currentSongIndex = -1;
let activeMixId = null; // Track the active Made for You mix so overlapping songs do not cross-switch between mixes
let isDesktopMixDetailShuffleActive = false; // Track whether shuffle is toggled on in the desktop Mix Detail modal
let currentDesktopPlaybackContext = null; // Track current playback context (e.g. made-for-you, trending, etc.)
let isShuffle = false;
let isRepeat = false;
let isDragging = false;
let isDraggingVolume = false;
let currentSongData = null; // Stores the currently active song data

// NEW: Cache for friend online status from Realtime Database
const friendOnlineStatus = {};
// NEW: Track RTDB listeners to avoid duplicates
const activePresenceListeners = new Map();
let userPresenceCleanup = null;

// Event listener to update the progress bar and time in real-time
const desktopProgressThumbs = document.querySelectorAll('.progress-thumb');
const desktopTimeEls = document.querySelectorAll('.time-info span:first-child, .curr-time');
activeAudio.addEventListener('timeupdate', () => {
    if (isDragging) return; // Don't update UI if being manually dragged

    if (activeAudio.duration) {
        const percent = (activeAudio.currentTime / activeAudio.duration) * 100;
        desktopProgressThumbs.forEach(thumb => thumb.style.width = `${percent}%`);
        desktopTimeEls.forEach(el => el.textContent = formatTime(activeAudio.currentTime));
    }
});

// Update total duration when song metadata is loaded
activeAudio.addEventListener('loadedmetadata', () => {
    const durationEls = document.querySelectorAll('.time-info span:last-child, .total-time');
    durationEls.forEach(el => el.textContent = formatTime(activeAudio.duration));
});

// Logic Event Listeners (Sync with Mobile)
activeAudio.addEventListener('play', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    document.querySelector('.now-playing-card')?.classList.add('is-playing');
    document.querySelector('.bottom-player-bar')?.classList.add('is-playing');

    document.querySelectorAll('.play-pause-btn').forEach(btn => {
        btn.innerHTML = PAUSE_ICON;
        btn.classList.remove('btn-loading', 'btn-disabled');
    });

    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-active-song');
            el.classList.remove('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) {
                overlay.innerHTML = PAUSE_ICON;
                overlay.classList.remove('btn-loading');
            }
        });
    }
});

activeAudio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    document.querySelector('.now-playing-card')?.classList.remove('is-playing');
    document.querySelector('.bottom-player-bar')?.classList.remove('is-playing');

    document.querySelectorAll('.play-pause-btn').forEach(btn => {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    });

    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) {
                overlay.innerHTML = PLAY_ICON;
                overlay.classList.remove('btn-loading');
            }
        });
    }
});

// Global Loading Listeners (Sync with Mobile)
activeAudio.addEventListener('waiting', () => {
    document.querySelectorAll('.play-pause-btn').forEach(btn => btn.classList.add('btn-loading'));
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"] .play-overlay`).forEach(btn => btn.classList.add('btn-loading'));
    }
});

activeAudio.addEventListener('playing', () => {
    document.querySelectorAll('.play-pause-btn').forEach(btn => btn.classList.remove('btn-loading'));
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"] .play-overlay`).forEach(btn => btn.classList.remove('btn-loading'));
    }
});

activeAudio.addEventListener('error', () => {
    document.querySelectorAll('.play-pause-btn').forEach(btn => btn.classList.remove('btn-loading'));
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"] .play-overlay`).forEach(btn => btn.classList.remove('btn-loading'));
    }
});

/**
 * Song navigation function (Next / Previous)
 */
window.playNext = () => {
    const next = getNextSong();
    if (next) triggerSongByIndex(currentPlaylist.findIndex((song) => song.id === next.id));
};

window.playPrevious = () => {
    const previous = getPreviousSong();
    if (previous) triggerSongByIndex(currentPlaylist.findIndex((song) => song.id === previous.id));
};

const triggerSongByIndex = (index, context = null) => {
    const song = currentPlaylist[index];
    if (!song) return;

    const btn = document.querySelector(`.song-card[data-id="${song.id}"] .play-overlay`);
    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration || 0, context || currentDesktopPlaybackContext, currentPlaylist, activeMixId);
};

/**
 * Function to update user activity in Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    const activityKey = songName.trim().toLowerCase();
    if (!activityKey || activityKey === lastRecordedActivitySong) return;

    // Cancel the previous timeout if it exists (Debouncing/Delaying)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Only update if the song has been playing for more than 5 seconds to avoid spam when skipping songs
    activityUpdateTimeout = setTimeout(async () => {
        try {
            await updateActivityRecord(songName);
            lastRecordedActivitySong = activityKey;
            console.log("Activity updated:", songName);
        } catch (error) {
            console.error("Failed to update activity to Firestore:", error);
        }
    }, 5000);
};

/**
 * Function to sync the Like button status in the player (sidebar and bottom bar)
 */
const syncPlayerLikeButtons = (isLiked) => {
    const sidebarLikeBtn = document.querySelector('.now-playing-card .love-btn');
    const bottomLikeBtn = document.querySelector('.bottom-player-bar .love-btn');

    if (sidebarLikeBtn) sidebarLikeBtn.classList.toggle('liked', isLiked);
    if (bottomLikeBtn) bottomLikeBtn.classList.toggle('liked', isLiked);
};

/**
 * Function to check if a song is liked in Firestore
 */
const checkLikedStatus = async (songId) => {
    const user = auth.currentUser;
    if (!user || !songId) {
        syncPlayerLikeButtons(false);
        return false;
    }

    // Ensure ID is a clean string
    const cleanId = String(songId).trim();

    try {
        const isLiked = await isFavoriteSong(cleanId);

        // Update UI based on the actual data from the database, not the current CSS class
        if (currentSongData && String(currentSongData.id) === cleanId) {
            syncPlayerLikeButtons(isLiked);
        }
        return isLiked;
    } catch (error) {
        if (error.code !== 'unavailable' && error.code !== 'permission-denied') {
            console.error("Error checking liked status:", error);
        }
        syncPlayerLikeButtons(false); // Default to false if check fails (offline)
        return false;
    }
};



/**
 * Helper to reset play/pause button UI (Sync with Mobile)
 */
const resetBtnUI = (btn) => {
    if (btn) {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    }
};

const toggleLike = async (e) => {
    const user = auth.currentUser;
    const btn = e.currentTarget; // The clicked button (can be from the sidebar or bottom bar)

    if (!user) {
        alert("Please log in to save your favorite songs.");
        return;
    }

    if (!currentSongData || !btn) {
        return;
    }

    const songId = String(currentSongData.id).trim();
    if (!songId) return;

    // 1. CHECK CURRENT STATUS
    const wasLiked = btn.classList.contains('liked');

    // 2. OPTIMISTIC UPDATE (Change UI instantly)
    // We don't wait for Firebase to finish to make it feel very fast
    syncPlayerLikeButtons(!wasLiked);
    if (!wasLiked) {
        createHeartParticles(btn);
    }

    // 3. RUN FIREBASE PROCESS IN THE BACKGROUND
    try {
        await toggleFavorite(currentSongData);
    } catch (error) {
        // 4. ROLLBACK IF FAILED
        // If the internet is down or permission is denied, revert the button status
        syncPlayerLikeButtons(wasLiked);

        console.error("Firebase Save Error:", error);

        let message = "Failed to sync with database. Check your connection.";
        if (error.code === 'permission-denied') {
            message = "Permission Denied! Check your Firestore Rules.";
        }
    }
};

/**
 * Core Playback Logic - Synchronized with Mobile context-awareness
 */
window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null, customPlaylist = null, mixId = null) => {
    const previousMixId = activeMixId;
    const songId = String(id);
    const targetSong = {
        id: songId,
        audio: audioUrl,
        name: title,
        artist,
        cover,
        duration: Number(duration) || 0
    };
    const wasSameSong = Boolean(currentSongData && areSameSongs(currentSongData, targetSong));
    const isSameSong = Boolean(
        context === 'made-for-you'
            ? (previousMixId && mixId ? String(previousMixId) === String(mixId) : true) && wasSameSong && activeAudio && activeAudio.src
            : (wasSameSong && activeAudio && activeAudio.src)
    );

    if (isSameSong) {
        if (!activeAudio.paused) {
            activeAudio.pause();
        } else {
            if (btn) btn.classList.add('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));
            activeAudio.play().catch(e => {
                console.error("Resume error:", e);
            }).finally(() => {
                if (btn) btn.classList.remove('btn-loading');
                document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
            });
        }
        return;
    }

    if (context === 'made-for-you') {
        activeMixId = mixId || activeMixId || (desktopMadeForYouMixes.find(m => m.songs && m.songs.some(s => String(s.id) === songId || (s.audio && s.audio === audioUrl)))?.id) || null;
        currentDesktopPlaybackContext = 'made-for-you';
    } else if (context) {
        activeMixId = null;
        currentDesktopPlaybackContext = context;
    } else {
        // Context was not explicitly provided (e.g. from playNext / queue / loop):
        if (activeMixId) {
            const activeMix = desktopMadeForYouMixes.find(m => String(m.id) === String(activeMixId));
            if (activeMix && activeMix.songs && activeMix.songs.some(s => String(s.id) === songId || (s.audio && s.audio === audioUrl))) {
                currentDesktopPlaybackContext = 'made-for-you';
            } else {
                activeMixId = null;
                currentDesktopPlaybackContext = null;
            }
        }
    }

    // Context-aware playlist management
    if (context === 'recently-played' && Array.isArray(customPlaylist) && customPlaylist.length > 0) {
        currentPlaylist = [...customPlaylist];
    }
    if (context && currentPlaylist.length > 0) {
        const queueState = setContextPlaylist(currentPlaylist, songId);
        currentPlaylist = queueState.playlist;
        currentSongIndex = queueState.currentIndex;
        currentSongData = queueState.currentSong;
    }

    if (!audioUrl) return;

    activeAudio.pause();
    currentSongData = { id: songId, audio: audioUrl, name: title, artist, cover, duration };
    recordRecentlyPlayed(currentSongData);
    recordTrackPlay(currentSongData);
    recordArtistPlay(currentSongData);
    currentSongIndex = currentPlaylist.findIndex(s => s.audio === audioUrl);
    syncQueueState(currentPlaylist, currentSongData, currentSongIndex);
    window.__spotiwindCurrentPlaylist = currentPlaylist;
    window.__spotiwindCurrentIndex = currentSongIndex;
    window.__spotiwindCurrentSong = currentSongData;
    window.__spotiwindContext = currentDesktopPlaybackContext;
    window.__spotiwindActiveMixId = activeMixId;

    // Reset ALL song UI states (to prevent visual duplicates during fast skipping)
    document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
        el.classList.remove('is-active-song', 'is-paused');
    });
    document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(el => {
        el.classList.remove('btn-loading');
        if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
    });

    // Set loading state
    if (btn) btn.classList.add('btn-loading');
    document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));
    document.querySelectorAll(`[data-id="${songId}"]`).forEach(el => el.classList.add('is-active-song'));

    // Reset Progress Bar and Time to 0 before the new song plays
    desktopProgressThumbs.forEach(t => t.style.width = '0%');
    desktopTimeEls.forEach(e => e.textContent = '0:00');
    // Get duration elements dynamically because total-time is usually static until metadata is loaded
    document.querySelectorAll('.time-info span:last-child, .total-time').forEach(e => e.textContent = '0:00');

    // Set the new active button (for the grid)
    if (btn) btn.classList.add('btn-loading');
    currentPlayingBtn = btn;
    document.querySelectorAll('.play-pause-btn').forEach(b => {
        b.classList.add('btn-loading');
        b.classList.remove('btn-disabled');
    });

    activeAudio.onerror = null;
    activeAudio.onended = null;

    try {
        activeAudio.src = audioUrl;

        // Update Document Title
        document.title = `Spotiwind - Feel The Music, Ride The Wind`;

        // Media Session API integration
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Spotiwind',
                artwork: [
                    { src: cover, sizes: '512x512', type: 'image/webp' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => activeAudio.play());
            navigator.mediaSession.setActionHandler('pause', () => activeAudio.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => window.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => window.playNext());
        }

        // RESET Like UI before checking the new song's status
        syncPlayerLikeButtons(false);

        const playbackPromise = activeAudio.src ? activeAudio.play() : Promise.resolve();
        checkLikedStatus(id);

        // Update UI Sidebars & Bottom Bar
        document.querySelector('.now-playing-card')?.classList.add('active');
        const sidebarTitle = document.querySelector('.now-playing-title');
        const sidebarArtist = document.querySelector('.now-playing-artist');
        const sidebarCover = document.querySelector('.now-playing-cover');
        if (sidebarTitle) sidebarTitle.textContent = title;
        if (sidebarArtist) sidebarArtist.textContent = artist;
        if (sidebarCover) sidebarCover.style.backgroundImage = `url("${cover}")`;

        // Update Bottom Bar
        const bottomTitle = document.getElementById('bottomTrackName');
        const bottomArtist = document.getElementById('bottomTrackArtist');
        const bottomCover = document.getElementById('bottomTrackCover');
        if (bottomTitle) bottomTitle.textContent = title;
        if (bottomArtist) bottomArtist.textContent = artist;
        if (bottomCover) bottomCover.src = cover;

        document.querySelector('.bottom-player-bar')?.classList.add('active');
        document.body.classList.add('player-active');

        activeAudio.onerror = (e) => {
            console.error("Audio playback error:", e);
            if (btn) resetBtnUI(btn);
            document.querySelectorAll('.btn-loading').forEach(el => el.classList.remove('btn-loading'));
        };

        await playbackPromise;
        syncActiveDesktopUI();
        updateMyActivity(title);

        if (btn) btn.classList.remove('btn-loading');
        document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error("Playback error:", error);
        // Clear loading status if a fatal error occurs
        document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
        currentPlayingBtn = null;
    }

    // Event listener untuk saat audio selesai diputar
    activeAudio.onended = () => {
        if (btn) resetBtnUI(btn);
        currentPlayingBtn = null;
        if (isRepeat) {
            if (currentSongIndex !== -1) {
                triggerSongByIndex(currentSongIndex);
            } else if (currentSongData) {
                // Keep repeating even if the song is not in the current playlist/grid
                window.playPreview(null, currentSongData.audio, currentSongData.name, currentSongData.artist, currentSongData.cover, currentSongData.id);
            }
        } else {
            playNext();
        }
    };
};



/**
 * Displays a skeleton loader inside the grid.
 * @param {string} gridSelector - CSS selector for the grid container.
 * @param {string} type - Skeleton type ('song' or 'artist').
 * @param {number} count - Number of skeletons to display.
 */
const showSkeletonLoader = (gridSelector, type, count = 6) => {
    const grid = document.querySelector(gridSelector);
    if (!grid) return;

    let skeletonHTML = '';
    if (type === 'song') {
        skeletonHTML = `
            <div class="song-card-skeleton">
                <div class="skeleton-cover"></div>
                <div class="skeleton-info">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-artist"></div>
                </div>
            </div>
        `;
    } else if (type === 'artist') {
        skeletonHTML = `
            <div class="artist-card-skeleton">
                <div class="skeleton skeleton-photo"></div>
                <div class="skeleton skeleton-name"></div>
            </div>
        `;
    }

    grid.innerHTML = Array(count).fill(skeletonHTML).join('');
};

/**
 * [REFACTOR] Renderer function for a single song card.
 * @param {object} song - Song data object.
 * @returns {string} - HTML string for the song card.
 */
const createSongCardHTML = (song) => {
    const isActive = areSameSongs(song, currentSongData);
    const isPaused = activeAudio.paused;
    const safeName = song.name.replace(/'/g, "\\'");
    const safeArtist = song.artist.replace(/'/g, "\\'");

    return `
    <div class="song-card ${isActive ? 'is-active-song' : ''} ${isActive && isPaused ? 'is-paused' : ''}" data-id="${song.id}" data-audio="${song.audio}">
        <div class="song-cover">
            <img src="${song.cover}" alt="${song.name}" style="width:100%; height:100%; object-fit:cover;">
            <button class="play-overlay" aria-label="Play ${song.name}"
                data-audio="${song.audio}" data-name="${safeName}" data-artist="${safeArtist}" data-cover="${song.cover}">
                ${isActive && !isPaused ? PAUSE_ICON : PLAY_ICON}
            </button>
        </div>
        <div class="song-info">
            <h3 class="song-name">${song.name}</h3>
            <p class="song-artist">${song.artist}</p>
        </div>
    </div>`;
};

/**
 * [REFACTOR] Renderer function for a single artist card.
 * @param {object} artist - Artist data object.
 * @returns {string} - HTML string for the artist card.
 */
const createArtistCardHTML = (artist) => {
    return ` 
    <div class="artist-card" data-artist-id="${artist.id}" data-artist-name="${artist.name.replace(/"/g, '&quot;')}" data-artist-photo="${artist.photo}">
        <div class="artist-photo" style="background-image: url('${artist.photo}')"></div>
        <span class="artist-name">${artist.name}</span>
    </div>`;
};

/**
 * [NEW] Renders items into a grid one by one for a progressive loading effect.
 * It replaces existing skeleton elements sequentially.
 * @param {string} gridSelector - The CSS selector for the grid container.
 * @param {Array} items - The array of data items to render.
 * @param {function(object): string} itemRenderer - The function that returns HTML for one item.
 * @param {string} skeletonSelector - The CSS selector for the skeleton elements within the grid.
 */
const renderGridProgressively = async (gridSelector, items, itemRenderer, skeletonSelector) => {
    const grid = document.querySelector(gridSelector);
    if (!grid) return;

    const skeletons = grid.querySelectorAll(skeletonSelector);

    // Clear any excess skeletons if the number of items is less than skeletons
    for (let i = items.length; i < skeletons.length; i++) {
        skeletons[i].remove();
    }

    for (let i = 0; i < items.length; i++) {
        const itemHTML = itemRenderer(items[i]);
        if (skeletons[i]) {
            skeletons[i].outerHTML = itemHTML;
        } else {
            grid.insertAdjacentHTML('beforeend', itemHTML);
        }
        await new Promise(res => setTimeout(res, 50)); // Small delay for visual effect
    }
};

/**
 * [REFACTOR] Universal grid rendering function with a skeleton loader.
 * @param {string} gridSelector - CSS selector for the grid container.
 * @param {Array|null} items - Data array. If null, show skeleton.
 * @param {(item: object) => string} itemRenderer - Function to render one item into HTML.
 * @param {string} skeletonType - Skeleton type ('song' or 'artist').
 * @param {string} emptyMessage - Message if there are no items.
 * @param {number} skeletonCount - Number of skeletons to display.
 */
const renderGrid = (gridSelector, items, itemRenderer, skeletonType, emptyMessage = "No items found.", skeletonCount = 6) => {
    const grid = document.querySelector(gridSelector);
    if (!grid) return;

    if (items === null) {
        showSkeletonLoader(gridSelector, skeletonType, skeletonCount);
    } else if (items.length === 0) {
        grid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">${emptyMessage}</p>`;
    } else {
        grid.innerHTML = items.map(itemRenderer).join('');
    }
};

let topArtistsUnsubscribe = null;

/**
 * Function to fetch popular artist data from Firebase Firestore in REAL-TIME
 */
const fetchTopArtists = async () => {
    const artistsGrid = document.querySelector('.artists-grid');

    if (topArtistsUnsubscribe) {
        topArtistsUnsubscribe();
        topArtistsUnsubscribe = null;
    }

    return new Promise((resolve) => {
        let isFirstLoad = true;

        topArtistsUnsubscribe = subscribeTopArtists((artists) => {
            const grid = document.querySelector('.artists-grid');
            if (!grid) {
                if (isFirstLoad) {
                    isFirstLoad = false;
                    resolve(true);
                }
                return;
            }

            if (!artists || artists.length === 0) {
                grid.innerHTML = `
                    <div class="popular-empty-state">
                        <div class="popular-empty-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                        <h3 class="popular-empty-title">No top artists yet</h3>
                        <p class="popular-empty-desc">Play songs to see top artists trending here.</p>
                    </div>
                `;
            } else {
                if (isFirstLoad) {
                    renderGridProgressively('.artists-grid', artists, createArtistCardHTML, '.artist-card-skeleton');
                } else {
                    grid.innerHTML = artists.map(createArtistCardHTML).join('');
                }
            }

            if (isFirstLoad) {
                isFirstLoad = false;
                resolve(true);
            }
        }, 10);
    });
};

/**
 * Renderer function for a single Made for You mix card on desktop
 */
const createMixCardHTML = (mix) => {
    const isCurrentMix = activeMixId ? String(mix.id) === String(activeMixId) : false;
    const matchCurrentSong = isCurrentMix && currentSongData && mix.songs && mix.songs.some(s => String(s.id) === String(currentSongData.id) || (s.audio && currentSongData.audio === s.audio));
    const hasAudio = activeAudio && Boolean(activeAudio.src);
    const isPlaying = matchCurrentSong && hasAudio && !activeAudio.paused && !activeAudio.ended;
    const isPaused = matchCurrentSong && hasAudio && activeAudio.paused && !activeAudio.ended;
    const isActive = isPlaying || isPaused;

    // Build cover area: 2x2 collage if ≥2 unique covers, else single image
    const imgs = mix.coverImages || (mix.cover ? [mix.cover] : []);
    let coverContent;
    if (imgs.length >= 2) {
        const cells = [imgs[0], imgs[1], imgs[2] || imgs[0], imgs[3] || imgs[1]];
        coverContent = `
            <div class="mix-collage">
                ${cells.map(src => `<div class="mix-collage-cell"><img src="${src}" alt="" width="95" height="72" loading="lazy"></div>`).join('')}
            </div>`;
    } else {
        coverContent = `<img src="${imgs[0] || '../../public/Elemen/Logo/Spotiwind.webp'}" alt="${mix.title}" width="190" height="145" style="width:100%; height:100%; object-fit:cover; aspect-ratio:4/3;" loading="lazy">`;
    }
    return `
    <div class="song-card mix-card ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-mix-id="${mix.id}" data-context="made-for-you">
        <div class="song-cover mix-cover" style="background: ${mix.gradient};">
            ${coverContent}
            <div class="mix-overlay-gradient"></div>
            <span class="mix-badge">${mix.tag}</span>
            <div class="mix-color-strip" style="background: ${mix.accentColor};"></div>
            <button class="play-overlay mix-play-btn" aria-label="Play ${mix.title}" 
                data-mix-id="${mix.id}" data-context="made-for-you">
                ${isPlaying ? PAUSE_ICON : PLAY_ICON}
            </button>
        </div>
        <div class="song-info mix-info">
            <h3 class="song-name mix-title">${mix.title}</h3>
            <p class="song-artist mix-subtitle">${mix.subtitle}</p>
        </div>
    </div>`;
};

/**
 * Function to fetch and render Made for You mixes on desktop
 */
const fetchMadeForYou = async () => {
    const gridSelector = '#madeForYouGrid';
    try {
        const mixes = await getMadeForYouMixes();
        if (!mixes || mixes.length === 0) return false;
        desktopMadeForYouMixes = mixes;
        renderGridProgressively(gridSelector, mixes, createMixCardHTML, '.song-card-skeleton');
        return true;
    } catch (error) {
        console.error("Failed to load desktop Made for You mixes:", error);
        throw error;
    }
};

let popularTracksUnsubscribe = null;

/**
 * Function to fetch popular song data from Firebase Firestore in REAL-TIME.
 */
const fetchTrendingMusic = async () => {
    const gridSelector = '.popular-section .song-grid';

    if (popularTracksUnsubscribe) {
        popularTracksUnsubscribe();
        popularTracksUnsubscribe = null;
    }

    return new Promise((resolve) => {
        let isFirstLoad = true;

        popularTracksUnsubscribe = subscribePopularTracks((rawSongs) => {
            const grid = document.querySelector(gridSelector);
            if (!grid) {
                if (isFirstLoad) {
                    isFirstLoad = false;
                    resolve(true);
                }
                return;
            }

            if (!rawSongs || rawSongs.length === 0) {
                currentPlaylist = [];
                grid.innerHTML = `
                    <div class="popular-empty-state">
                        <div class="popular-empty-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18V5l12-2v13"></path>
                                <circle cx="6" cy="18" r="3"></circle>
                                <circle cx="18" cy="16" r="3"></circle>
                            </svg>
                        </div>
                        <h3 class="popular-empty-title">No popular songs yet</h3>
                        <p class="popular-empty-desc">Play your favorite songs to see them trending here.</p>
                    </div>
                `;
            } else {
                currentPlaylist = rawSongs;
                syncQueueState(currentPlaylist, null, -1);
                if (isFirstLoad) {
                    renderGridProgressively(gridSelector, rawSongs, createSongCardHTML, '.song-card-skeleton');
                } else {
                    grid.innerHTML = rawSongs.map(createSongCardHTML).join('');
                }
            }

            if (isFirstLoad) {
                isFirstLoad = false;
                resolve(true);
            }
        }, 10);
    });
};

let desktopRecentlyPlayedListCache = [];

/**
 * Render Recently Played songs in vertical layout (Max 3 items) on Desktop
 */
const renderDesktopRecentlyPlayed = () => {
    const container = document.getElementById('desktopRecentlyPlayedList');
    if (!container) return;

    try {
        const rawSongs = getRecentlyPlayed();
        const validSongs = (Array.isArray(rawSongs) ? rawSongs : [])
            .filter(s => s && (s.id || s.audio) && s.audio)
            .slice(0, 3); // Batas maksimal 3 lagu terbaru sesuai permintaan

        desktopRecentlyPlayedListCache = validSongs;

        if (validSongs.length === 0) {
            container.innerHTML = `
                <div class="recent-empty-state">
                    <div class="recent-empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <h3 class="recent-empty-title">No recently played songs</h3>
                    <p class="recent-empty-desc">Songs you listen to will show up here.</p>
                </div>
            `;
            return;
        }

        const isSameList = desktopRecentlyPlayedListCache.length === validSongs.length &&
            validSongs.every((s, i) => String(s.id) === String(desktopRecentlyPlayedListCache[i]?.id));

        desktopRecentlyPlayedListCache = validSongs;

        if (isSameList && container.querySelector('.recent-track-row')) {
            syncActiveDesktopUI();
            return;
        }

        const isAudioPlaying = activeAudio && !activeAudio.paused && !activeAudio.ended;

        container.innerHTML = validSongs.map(song => {
            const isActive = areSameSongs(song, currentSongData);
            const isPaused = isActive && activeAudio.paused;
            const safeName = (song.name || song.title || 'Untitled').replace(/"/g, '&quot;');
            const safeArtist = (song.artist || 'Unknown Artist').replace(/"/g, '&quot;');
            const cover = song.cover || '../../public/Elemen/Logo/Spotiwind.webp';
            const durationFormatted = formatTime(song.duration || 0);

            return `
                <div class="recent-track-row ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}"
                    data-id="${song.id}"
                    data-audio="${song.audio}"
                    data-name="${safeName}"
                    data-artist="${safeArtist}"
                    data-cover="${cover}"
                    data-duration="${song.duration || 0}"
                    data-context="recently-played">
                    <div class="recent-track-cover-wrapper">
                        <img src="${cover}" alt="${safeName}" class="recent-track-cover" width="48" height="48" loading="lazy">
                        <div class="recent-track-play-icon" aria-hidden="true">
                            ${isActive && isAudioPlaying ? PAUSE_ICON : PLAY_ICON}
                        </div>
                    </div>
                    <div class="recent-track-info">
                        <h4 class="recent-track-name">${safeName}</h4>
                        <p class="recent-track-artist">${safeArtist}</p>
                    </div>
                    <div class="recent-track-right">
                        <span class="recent-track-duration">${durationFormatted}</span>
                    </div>
                </div>
            `;
        }).join('');

        syncActiveDesktopUI();
    } catch (e) {
        console.warn("Failed to render desktop recently played:", e);
    }
};

window.addEventListener('recently-played-updated', () => {
    renderDesktopRecentlyPlayed();
}, { passive: true });

let activeDesktopDetailMix = null;

const syncActiveDesktopUI = () => {
    if (!currentSongData) return;
    const isPlaying = activeAudio && !activeAudio.paused && !activeAudio.ended;
    const isPaused = activeAudio && activeAudio.paused && !activeAudio.ended;

    document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
        el.classList.remove('is-active-song', 'is-paused');
    });

    document.querySelectorAll('.play-overlay, .play-pause-btn, .recent-track-play-icon').forEach(el => {
        el.classList.remove('btn-loading');
        if (el.classList.contains('play-overlay') || el.classList.contains('recent-track-play-icon')) el.innerHTML = PLAY_ICON;
    });

    const mixDetailPlayAllBtn = document.getElementById('mixDetailPlayAllBtn');
    if (mixDetailPlayAllBtn) {
        mixDetailPlayAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>`;
    }

    if (isPlaying || isPaused) {
        // Highlight active individual songs
        document.querySelectorAll('[data-id], .song-card, .dropdown-item, .recent-track-row').forEach(el => {
            if (el.classList.contains('mix-card') || el.classList.contains('mix-track-row')) return;
            const cardId = el.dataset.id;
            const cardAudio = el.dataset.audio || el.querySelector('.play-overlay')?.dataset?.audio;
            const cardName = el.dataset.name || el.querySelector('.song-name, .dropdown-song-name, .item-name, .recent-track-name')?.textContent;
            const cardArtist = el.dataset.artist || el.querySelector('.song-artist, .dropdown-song-artist, .item-artist, .recent-track-artist')?.textContent;
            if (areSameSongs(currentSongData, { id: cardId, audio: cardAudio, name: cardName, artist: cardArtist })) {
                el.classList.add('is-active-song');
                if (isPaused) el.classList.add('is-paused');
                const overlay = el.querySelector('.play-overlay');
                if (overlay) overlay.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
                const recentPlayIcon = el.querySelector('.recent-track-play-icon');
                if (recentPlayIcon) recentPlayIcon.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
            }
        });

        // Highlight active mix cards
        document.querySelectorAll('.mix-card').forEach(mixCard => {
            const mixId = mixCard.dataset.mixId;
            const isCurrentMix = activeMixId ? String(mixId) === String(activeMixId) : false;
            const mixData = desktopMadeForYouMixes.find(m => String(m.id) === String(mixId));
            const matchCurrentSong = isCurrentMix && mixData && mixData.songs && mixData.songs.some(s => areSameSongs(s, currentSongData));
            if (matchCurrentSong) {
                mixCard.classList.add('is-active-song');
                if (isPaused) mixCard.classList.add('is-paused');
                const overlay = mixCard.querySelector('.play-overlay');
                if (overlay) {
                    overlay.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
                }
            }
        });

        // Highlight active track rows in modal
        document.querySelectorAll('.mix-track-row').forEach(row => {
            const rowSongId = row.dataset.songId;
            const rowAudio = row.dataset.songAudio;
            const rowMixId = row.dataset.mixId;
            const isRowInActiveMix = activeMixId ? String(rowMixId) === String(activeMixId) : false;
            if (isRowInActiveMix && areSameSongs({ id: rowSongId, audio: rowAudio }, currentSongData)) {
                row.classList.add('is-active-song');
                if (isPaused) row.classList.add('is-paused');
                const playIcon = row.querySelector('.mix-track-play-icon');
                if (playIcon) playIcon.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
                if (mixDetailPlayAllBtn) {
                    mixDetailPlayAllBtn.innerHTML = isPlaying
                        ? `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
                        : `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                }
            }
        });
    }
};

const openDesktopMixDetailModal = (mixId) => {
    activeDesktopDetailMix = desktopMadeForYouMixes.find(m => String(m.id) === String(mixId)) || null;
    openMixDetailModal(mixId, desktopMadeForYouMixes);
};
const closeDesktopMixDetailModal = closeMixDetailModal;

document.addEventListener('DOMContentLoaded', () => {
    activeAudio.addEventListener('play', () => syncActiveDesktopUI());
    activeAudio.addEventListener('pause', () => syncActiveDesktopUI());

    // Implementation of Event Delegation instead of inline onclick
    document.body.addEventListener('click', (e) => {
        // 1. Click on Mix Play Overlay Button -> toggle play mix directly
        const mixPlayOverlay = e.target.closest('.mix-card .play-overlay');
        if (mixPlayOverlay) {
            e.stopPropagation();
            const mixCard = mixPlayOverlay.closest('.mix-card');
            const mixId = mixCard?.dataset.mixId;
            const targetMix = desktopMadeForYouMixes.find(m => m.id === mixId);
            if (targetMix && targetMix.songs && targetMix.songs.length > 0) {
                const isMixActive = activeMixId && String(activeMixId) === String(mixId) && currentSongData && targetMix.songs.some(s => String(s.id) === String(currentSongData.id) || (s.audio && currentSongData.audio === s.audio));
                if (isMixActive) {
                    if (!activeAudio.paused) {
                        activeAudio.pause();
                    } else {
                        activeAudio.play();
                    }
                    syncActiveDesktopUI();
                    return;
                }
                const firstSong = targetMix.songs[0];
                currentPlaylist = [...targetMix.songs];
                activeMixId = targetMix.id;
                window.playPreview(
                    mixPlayOverlay,
                    firstSong.audio,
                    firstSong.name,
                    firstSong.artist,
                    firstSong.cover,
                    firstSong.id,
                    Number(firstSong.duration) || 0,
                    'made-for-you',
                    targetMix.songs,
                    targetMix.id
                );
            }
            return;
        }

        // 2. Click on Mix Card (outside play button) -> Play Mix
        const mixCard = e.target.closest('.mix-card');
        if (mixCard) {
            e.stopPropagation();
            const mixId = mixCard.dataset.mixId;
            const targetMix = desktopMadeForYouMixes.find(m => String(m.id) === String(mixId));
            if (targetMix && targetMix.songs && targetMix.songs.length > 0) {
                const firstSong = targetMix.songs[0];
                currentPlaylist = [...targetMix.songs];
                activeMixId = targetMix.id;
                window.playPreview(
                    mixCard.querySelector('.play-overlay') || null,
                    firstSong.audio,
                    firstSong.name,
                    firstSong.artist,
                    firstSong.cover,
                    firstSong.id,
                    Number(firstSong.duration) || 0,
                    'made-for-you',
                    targetMix.songs,
                    targetMix.id
                );
            }
            return;
        }

        // 3. Click on Close Mix Detail Modal
        if (e.target.closest('#closeMixDetailBtn') || e.target.closest('.mix-detail-backdrop')) {
            closeDesktopMixDetailModal();
            return;
        }

        // 4. Click on Mix Detail Play All / Pause All Button
        const mixDetailPlayAllBtn = e.target.closest('#mixDetailPlayAllBtn');
        if (mixDetailPlayAllBtn && activeDesktopDetailMix && activeDesktopDetailMix.songs.length > 0) {
            e.stopPropagation();
            const isMixActive = activeMixId ? String(activeDesktopDetailMix.id) === String(activeMixId) : false;
            if (isMixActive) {
                if (!activeAudio.paused) {
                    activeAudio.pause();
                } else {
                    activeAudio.play();
                }
                syncActiveDesktopUI();
                return;
            }
            const playlistToPlay = isDesktopMixDetailShuffleActive
                ? [...activeDesktopDetailMix.songs].sort(() => 0.5 - Math.random())
                : [...activeDesktopDetailMix.songs];
            const firstSong = playlistToPlay[0];
            currentPlaylist = [...playlistToPlay];
            window.playPreview(
                null,
                firstSong.audio,
                firstSong.name,
                firstSong.artist,
                firstSong.cover,
                firstSong.id,
                Number(firstSong.duration) || 0,
                'made-for-you',
                playlistToPlay,
                activeDesktopDetailMix.id
            );
            return;
        }

        // 5. Click on Mix Detail Shuffle Button -> Toggle active status, do not play yet
        const mixDetailShuffleBtn = e.target.closest('#mixDetailShuffleBtn');
        if (mixDetailShuffleBtn && activeDesktopDetailMix && activeDesktopDetailMix.songs.length > 0) {
            e.stopPropagation();
            isDesktopMixDetailShuffleActive = !isDesktopMixDetailShuffleActive;
            mixDetailShuffleBtn.classList.toggle('is-active', isDesktopMixDetailShuffleActive);
            return;
        }

        // 6. Click on Mix Tracklist Row in Modal
        const mixTrackRow = e.target.closest('.mix-track-row');
        if (mixTrackRow && activeDesktopDetailMix) {
            e.stopPropagation();
            const songId = mixTrackRow.dataset.songId;
            const song = activeDesktopDetailMix.songs.find(s => String(s.id) === String(songId));
            if (song) {
                currentPlaylist = [...activeDesktopDetailMix.songs];
                window.playPreview(
                    null,
                    song.audio,
                    song.name,
                    song.artist,
                    song.cover,
                    song.id,
                    Number(song.duration) || 0,
                    'made-for-you'
                );
            }
            return;
        }

        // Click handler for Recently Played Vertical Row Item
        const recentRow = e.target.closest('.recent-track-row');
        if (recentRow) {
            e.stopPropagation();
            const { id, audio, name, artist, cover, duration } = recentRow.dataset;
            const playIcon = recentRow.querySelector('.recent-track-play-icon');
            window.playPreview(
                playIcon,
                audio,
                name,
                artist,
                cover,
                id,
                Number(duration) || 0,
                'recently-played',
                desktopRecentlyPlayedListCache
            );
            return;
        }

        const seeAllRecentBtn = e.target.closest('#seeAllRecentDesktopBtn');
        if (seeAllRecentBtn) {
            e.preventDefault();
            const libraryNav = document.querySelector('.sidebar-nav a[href*="library"], .nav-menu a[href*="library"], .nav-item:nth-child(4)');
            if (libraryNav) libraryNav.click();
            return;
        }

        const playBtn = e.target.closest('.play-overlay') || e.target.closest('.play-mini-btn');
        if (!playBtn) return;

        const card = playBtn.closest('.song-card');
        if (!card) return;
        const overlay = card.querySelector('.play-overlay');
        const { audio, name, artist, cover } = overlay.dataset;
        const id = card.dataset.id;

        window.playPreview(overlay, audio, name, artist, cover, id, 0, 'trending');
    });
    /**
     * NEW: Wrapper to continuously retry a fetch function upon failure.
     * This ensures the skeleton loader remains and the app keeps trying to load data.
     * @param {() => Promise<boolean>} fetchFunction - The async function to execute.
     * @param {number} delay - The delay (ms) before retrying.
     */
    const fetchWithContinuousRetry = async (fetchFunction, delay = 5000, maxRetries = 5) => {
        return retryCatalogRequest(fetchFunction, maxRetries, delay);
    };

    const logoutBtn = document.getElementById('logoutBtn');

    let lastGreetingHour = -1;
    let greetingName = 'Guest';
    const updateGreeting = () => {
        const greetingBadge = document.getElementById('greetingBadge');
        if (!greetingBadge) return;

        const hour = new Date().getHours();
        if (hour === lastGreetingHour) return;
        lastGreetingHour = hour;

        let greeting = 'Night';
        if (hour >= 4 && hour < 10) greeting = 'Morning';
        else if (hour >= 10 && hour < 15) greeting = 'Afternoon';
        else if (hour >= 15 && hour < 18) greeting = 'Evening';

        greetingBadge.innerHTML = `Good ${greeting}, ${greetingName} <span aria-hidden="true">👋</span>`;
    };

    updateGreeting();
    setInterval(updateGreeting, 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            lastGreetingHour = -1;
            updateGreeting();
        }
    });

    // Initialize search with Slidedown Dropdown feature
    // Listener for music controls in the sidebar
    document.querySelector('button[title="Next"]')?.addEventListener('click', playNext);
    document.querySelector('button[title="Previous"]')?.addEventListener('click', playPrevious);

    // Listener for Repeat (Sidebar & Bottom)
    document.querySelectorAll('#sidebarRepeat, #bottomRepeat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            isRepeat = !isRepeat;
            if (isRepeat) isShuffle = false; // Sync with Mobile: Turn off shuffle if repeat is active
            setPlaybackModes({ shuffle: isShuffle, repeat: isRepeat });

            // Animate only the clicked button
            e.currentTarget.classList.add('btn-pop');
            setTimeout(() => e.currentTarget.classList.remove('btn-pop'), 300);

            // Sync active state for all corresponding buttons
            document.querySelectorAll('#sidebarRepeat, #bottomRepeat').forEach(b => b.classList.toggle('active', isRepeat));
            document.querySelectorAll('#sidebarShuffle, #bottomShuffle').forEach(b => b.classList.toggle('active', isShuffle));
        });
    });

    // Listener for Shuffle (Sidebar & Bottom)
    document.querySelectorAll('#sidebarShuffle, #bottomShuffle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            isShuffle = !isShuffle;
            if (isShuffle) isRepeat = false; // Sync with Mobile: Turn off repeat if shuffle is active
            setPlaybackModes({ shuffle: isShuffle, repeat: isRepeat });

            // Animate only the clicked button
            e.currentTarget.classList.add('btn-pop');
            setTimeout(() => e.currentTarget.classList.remove('btn-pop'), 300);

            // Sync active state for all corresponding buttons
            document.querySelectorAll('#sidebarShuffle, #bottomShuffle').forEach(b => b.classList.toggle('active', isShuffle));
            document.querySelectorAll('#sidebarRepeat, #bottomRepeat').forEach(b => b.classList.toggle('active', isRepeat));
        });
    });

    const togglePlayPause = async () => {
        // Use the same logic as mobile: prioritize resume if src exists
        if (activeAudio.src && activeAudio.src !== "") {
            try {
                if (activeAudio.paused) await activeAudio.play();
                else activeAudio.pause();
            } catch (err) {
                console.error("Toggle Play error:", err);
            }
        } else if (currentPlaylist.length > 0) {
            // If no song is selected yet, play the first song from the grid
            triggerSongByIndex(0);
        }
    };

    // Connect all Play/Pause buttons (in the Now Playing sidebar and the Bottom Bar)
    document.querySelectorAll('.play-pause-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlayPause();
        });
    });

    // Listener for Like buttons (Sidebar & Bottom)
    document.querySelectorAll('.love-btn').forEach(btn => {
        btn.addEventListener('click', toggleLike);
    });

    /**
     * Function to load playlists from Firestore (Only for the logged-in user)
     */
    const loadUserPlaylists = (uid) => {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;

        // Clear old listener if it exists to prevent ERR_INSUFFICIENT_RESOURCES
        if (playlistUnsubscribe) playlistUnsubscribe();

        playlistUnsubscribe = subscribeUserPlaylists(uid, (playlists) => {
            playlistContainer.innerHTML = '';
            playlists.forEach((playlist) => {
                const item = document.createElement('a');
                item.href = "#";
                item.className = "nav-item";
                item.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                    <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                        <span style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${playlist.name}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">0 songs</span>
                    </div>
                `;
                playlistContainer.appendChild(item);
            });
        }, (error) => {
            console.error("Playlist Snapshot Error:", error);
        });
    };

    // Add Playlist Logic
    const addPlaylistBtn = document.querySelector('.add-playlist-btn');

    addPlaylistBtn?.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;

        const playlistName = prompt("Enter a new playlist name:");
        if (playlistName && playlistName.trim() !== "") {
            try {
                await createUserPlaylist(user.uid, playlistName);
            } catch (error) {
                console.error("Error creating playlist:", error);
            }
        }
    });

    // Progress bar seeking (Seekbar) logic
    const progressTracks = document.querySelectorAll('.progress-track');
    let activeDraggingTrack = null;

    const seek = (e, track) => {
        if (!activeAudio.duration || activeAudio.duration === Infinity) return;
        const rect = track.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));

        // 1. Update UI instantly (Visual Feedback)
        const progressThumbs = document.querySelectorAll('.progress-thumb');
        const currentTimeEls = document.querySelectorAll('.time-info span:first-child, .curr-time');

        progressThumbs.forEach(thumb => thumb.style.width = `${percentage * 100}%`);
        currentTimeEls.forEach(el => el.textContent = formatTime(percentage * activeAudio.duration));

        // 2. Update the actual audio time
        activeAudio.currentTime = percentage * activeAudio.duration;
    };

    const startDragging = (e) => {
        isDragging = true;
        activeDraggingTrack = e.currentTarget;
        document.body.classList.add('is-dragging-progress'); // Add class to body to disable transitions
        seek(e, activeDraggingTrack);
    };

    const moveDragging = (e) => {
        if (isDragging && activeDraggingTrack) {
            if (e.cancelable) e.preventDefault();
            seek(e, activeDraggingTrack);
        }
    };

    const stopDragging = () => {
        isDragging = false;
        activeDraggingTrack = null;
        document.body.classList.remove('is-dragging-progress');
    };

    progressTracks.forEach(track => {
        track.addEventListener('mousedown', startDragging);
        track.addEventListener('touchstart', startDragging, { passive: false });
    });

    window.addEventListener('mousemove', moveDragging);
    window.addEventListener('touchmove', moveDragging, { passive: false });
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);

    // Volume Control Logic
    const volumeSlider = document.querySelector('.volume-slider');
    const volumeLevel = document.querySelector('.volume-level');
    const volumeSvg = document.querySelector('.volume-control svg');

    let lastVolume = 0.7; // Save the last volume for the unmute feature

    // Initialize initial volume (70% according to the default style in HTML)
    activeAudio.volume = 0.7;

    const updateVolumeUI = (percentage) => {
        activeAudio.volume = percentage;
        if (volumeLevel) volumeLevel.style.width = `${percentage * 100}%`;

        // Update Volume Icon secara dinamis
        if (volumeSvg) {
            const volumePath = volumeSvg.querySelector('path');
            if (percentage === 0) {
                volumePath.setAttribute('d', MUTE_PATH);
            } else {
                volumePath.setAttribute('d', VOLUME_PATH);
            }
        }
    };

    const handleVolumeSeek = (e) => {
        if (!volumeSlider) return;
        const rect = volumeSlider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));

        updateVolumeUI(percentage);
        if (percentage > 0) lastVolume = percentage;
    };

    // Icon click feature for Mute/Unmute
    volumeSvg?.addEventListener('click', () => {
        if (activeAudio.volume > 0) {
            lastVolume = activeAudio.volume;
            updateVolumeUI(0);
        } else {
            updateVolumeUI(lastVolume || 0.7);
        }
    });

    volumeSlider?.addEventListener('mousedown', (e) => {
        isDraggingVolume = true;
        document.body.classList.add('is-dragging-volume');
        handleVolumeSeek(e);
    });

    volumeSlider?.addEventListener('touchstart', (e) => {
        isDraggingVolume = true;
        document.body.classList.add('is-dragging-volume');
        handleVolumeSeek(e);
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingVolume) handleVolumeSeek(e);
    });

    window.addEventListener('touchmove', (e) => {
        if (isDraggingVolume) {
            if (e.cancelable) e.preventDefault();
            handleVolumeSeek(e);
        }
    }, { passive: false });

    window.addEventListener('mouseup', () => {
        isDraggingVolume = false;
        document.body.classList.remove('is-dragging-volume');
    });

    window.addEventListener('touchend', () => {
        isDraggingVolume = false;
        document.body.classList.remove('is-dragging-volume');
    });

    /**
     * Helper to format Firestore timestamp to relative time (e.g., 2m, 1h)
     */
    const formatRelativeTime = (timestamp) => {
        // Add robust check to prevent errors if timestamp is not a valid Firestore timestamp
        if (!timestamp || typeof timestamp.toDate !== 'function') {
            return '...';
        }
        const now = new Date();
        const date = timestamp.toDate();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return "now";
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h`;
        return `${Math.floor(diffInHours / 24)}d`;
    };

    // NEW: Function to set the current user's online/offline status in Realtime Database
    const setupUserPresence = (user) => {
        if (!user) return;

        if (typeof userPresenceCleanup === 'function') userPresenceCleanup();
        userPresenceCleanup = watchUserConnection(user.uid);
    };

    // NEW: Function to listen for friend's online status from Realtime Database
    const listenToFriendPresence = (friendUid) => {
        if (activePresenceListeners.has(friendUid)) return;
        const unsubscribe = watchFriendPresence(friendUid, ({ isOnline }) => {

            friendOnlineStatus[friendUid] = isOnline;

            // Find all status elements for this user (in case it appears in more than one place)
            const statusElements = document.querySelectorAll(`.friend-item[data-uid="${friendUid}"] .online-status`);
            statusElements.forEach(el => {
                if (isOnline) el.classList.remove('offline');
                else el.classList.add('offline');
            });
        });
        activePresenceListeners.set(friendUid, unsubscribe);
    }

    /**
     * Function to dynamically render the friend activity list
     */
    const renderFriendActivity = async (displayLimit = 10) => {
        const container = document.getElementById('friendActivityContainer');
        const seeAllLink = document.querySelector('.friend-activity-section .see-all-link');
        if (!container) return;

        isLoadingMoreActivity = true;

        // Clear old listeners if any (Prevents memory/resource leaks)
        if (friendActivityListeners.length > 0) {
            friendActivityListeners.forEach(unsub => unsub());
            friendActivityListeners = [];
        }
        activePresenceListeners.forEach(unsub => unsub());
        activePresenceListeners.clear();

        // Provide a smooth loading indicator in the container
        if (container.innerHTML === "") {
            container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">Loading activity...</p>`;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // 1. Get the list of followed user UIDs
        // Assumed data structure: users/{myUid}/following/{friendUid}
        const followingIds = await getFollowingIds(currentUser.uid);

        // If not following anyone, display an empty message or instructions
        if (followingIds.length === 0) {
            container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">Follow friends to see their activity!</p>`;
            if (seeAllLink) seeAllLink.classList.add('hidden');
            return;
        }

        // Show "See all" link because the user has friends (following > 0)
        if (seeAllLink) seeAllLink.classList.remove('hidden');

        const unsub = subscribeFriendsActivityByIds(followingIds, (activities) => {
            isLoadingMoreActivity = false;
            const finalDisplay = activities.slice(0, displayLimit);

            // Check if we've reached the end of the data (simple check)
            hasReachedActivityEnd = activities.length < displayLimit;

            if (finalDisplay.length === 0) {
                container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">No active friends right now.</p>`;
                return;
            }

            // Ensure the online status listener is active for each friend to be displayed
            finalDisplay.forEach(friend => listenToFriendPresence(friend.id));

            // 4. Render ke UI
            container.innerHTML = finalDisplay.map(friend => {
                const onlineClass = friendOnlineStatus[friend.id] ? '' : 'offline';

                return `
                    <div class="friend-item" data-uid="${friend.id}">
                        <div class="avatar-container">
                            <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" class="friend-avatar" alt="${friend.name}">
                            <span class="online-status ${onlineClass}"></span>
                        </div>
                        <div class="friend-info">
                            <div class="friend-header">
                                <span class="friend-name">${friend.name}</span>
                                <span class="friend-time">${formatRelativeTime(friend.timestamp)}</span>
                            </div>
                            <span class="friend-status">
                                Listening to <strong>${friend.song}</strong>
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        }, { limitCount: displayLimit });
        friendActivityListeners.push(unsub);
    };

    // Add Infinite Scroll Listener to the friend activity container
    const friendActivityContainer = document.getElementById('friendActivityContainer');
    if (friendActivityContainer) {
        friendActivityContainer.addEventListener('scroll', () => {
            // If the user scrolls to the bottom (20px from the bottom)
            const isBottom = friendActivityContainer.scrollHeight - friendActivityContainer.scrollTop <= friendActivityContainer.clientHeight + 20;

            if (isBottom && !isLoadingMoreActivity && !hasReachedActivityEnd && currentFriendActivityLimit >= 10) {
                currentFriendActivityLimit += 50;
                renderFriendActivity(currentFriendActivityLimit);
                console.log("Loading more activities... Limit:", currentFriendActivityLimit);
            }
        });
    }

    initFriendsActivityModal();

    // Helper Function for Navigation with Animation
    const navigateTo = (url) => {
        const overlay = document.getElementById('pageTransition');

        // Immediately hide the main container to avoid a messy look during resize
        document.body.classList.add('is-transitioning');

        if (overlay) {
            overlay.classList.remove('fade-out');
            setTimeout(() => {
                window.location.replace(url);
            }, 500);
        } else {
            window.location.replace(url);
        }
    };

    const waitForPageLoad = (callback) => {
        const run = () => requestAnimationFrame(callback);
        if (document.readyState === 'complete') {
            run();
            return;
        }
        window.addEventListener('load', run, { once: true });
    };

    // Simple function to hide the loading overlay only after the page resources are ready.
    const hideLoadingOverlay = () => {
        const overlay = document.getElementById('pageTransition');
        if (!overlay) {
            document.body.classList.remove('is-transitioning');
            return;
        }

        waitForPageLoad(() => {
            document.body.classList.remove('is-transitioning');
            overlay.classList.add('fade-out');
        });
    };

    // 1. Check Login Status
    // Listener untuk perubahan ukuran layar secara real-time
    let isNavigating = false;
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768 && !isNavigating) {
            isNavigating = true;
            navigateTo('home-mobile.html');
        }
    });

    // ==========================================================================
    // Desktop SPA Router & Dynamic Subpage Loader
    // ==========================================================================
    let initialDesktopHomeContent = null;
    let desktopAuthPageStyleLink = null;
    let activeDesktopPageCleanup = null;
    let desktopPageLoadSequence = 0;
    let desktopPreviousPageUrl = 'home-desktop.html';
    let desktopCurrentPageUrl = 'home-desktop.html';

    const loadDesktopStylesheet = (href, currentLinkElement) => loadStylesheet(href, currentLinkElement);
    const updateDesktopAppUrl = (route, title, state = null, pushState = true) => updateAppUrl(route, title, state, pushState);

    const initializeDesktopDashboardData = () => {
        fetchWithContinuousRetry(fetchTrendingMusic);
        fetchWithContinuousRetry(fetchTopArtists);
        fetchWithContinuousRetry(fetchMadeForYou);
        renderDesktopRecentlyPlayed();
    };

    const initializeDesktopUserUI = async (user) => {
        if (user) {
            console.log("Logged in as:", user.email);
            greetingName = user.displayName || user.email?.split('@')[0] || 'User';
            lastGreetingHour = -1;
            updateGreeting();

            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email.split('@')[0];
            }

            setupUserPresence(user);
            renderFriendActivity();
            loadUserPlaylists(user.uid);
            if (recentlyPlayedUnsubscribe) {
                recentlyPlayedUnsubscribe();
            }
            recentlyPlayedUnsubscribe = subscribeRecentlyPlayed(user.uid, () => {
                renderDesktopRecentlyPlayed();
            });

            const premiumBadgeElement = document.getElementById('premiumBadge');
            if (premiumBadgeElement) {
                const premiumStatus = await isUserPremium(user.uid);
                if (premiumStatus) {
                    premiumBadgeElement.classList.remove('hidden');
                } else {
                    premiumBadgeElement.classList.add('hidden');
                }
            }

            const avatarElement = document.getElementById('userAvatar');
            if (avatarElement) {
                const nameForAvatar = user.displayName || user.email.split('@')[0];
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff&bold=true&size=512`;

                // Konversi Google photoURL dari s96-c menjadi HD s512-c
                let originalPhotoURL = user.photoURL ? String(user.photoURL).trim() : '';
                if (originalPhotoURL && (originalPhotoURL.includes('googleusercontent.com') || originalPhotoURL.includes('google.com') || originalPhotoURL.includes('ggpht.com'))) {
                    if (/=s\d+([a-zA-Z0-9_-]*)/.test(originalPhotoURL)) {
                        originalPhotoURL = originalPhotoURL.replace(/=s\d+([a-zA-Z0-9_-]*)/, '=s512-c');
                    } else if (/([?&])sz=\d+/.test(originalPhotoURL)) {
                        originalPhotoURL = originalPhotoURL.replace(/([?&])sz=\d+/, '$1sz=512');
                    } else {
                        const hasQuery = originalPhotoURL.includes('?');
                        if (hasQuery) {
                            const parts = originalPhotoURL.split('?');
                            originalPhotoURL = `${parts[0]}=s512-c?${parts[1]}`;
                        } else {
                            originalPhotoURL = `${originalPhotoURL}=s512-c`;
                        }
                    }
                } else if (originalPhotoURL && originalPhotoURL.includes('ui-avatars.com')) {
                    if (/size=\d+/.test(originalPhotoURL)) {
                        originalPhotoURL = originalPhotoURL.replace(/size=\d+/, 'size=512');
                    } else {
                        const sep = originalPhotoURL.includes('?') ? '&' : '?';
                        originalPhotoURL = `${originalPhotoURL}${sep}size=512`;
                    }
                }

                let originalRetry = 0;
                const maxRetries = 2;

                avatarElement.referrerPolicy = "no-referrer";
                avatarElement.onerror = function () {
                    if (originalPhotoURL && this.src.includes(originalPhotoURL.split('?')[0]) && originalRetry < maxRetries) {
                        originalRetry++;
                        setTimeout(() => {
                            const sep = originalPhotoURL.includes('?') ? '&' : '?';
                            this.src = `${originalPhotoURL}${sep}t=${Date.now()}`;
                        }, 2000);
                    } else if (this.src !== defaultAvatar && !this.src.includes('ui-avatars.com')) {
                        this.src = defaultAvatar;
                    } else {
                        this.onerror = null;
                    }
                };

                avatarElement.src = originalPhotoURL || defaultAvatar;
            }
        } else {
            greetingName = 'Guest';
            lastGreetingHour = -1;
            updateGreeting();

            const userNameElement = document.getElementById('userName');
            if (userNameElement) userNameElement.textContent = 'Guest (Log In)';

            const avatarElement = document.getElementById('userAvatar');
            if (avatarElement) {
                avatarElement.src = 'https://ui-avatars.com/api/?name=Guest&background=1e293b&color=94a3b8&bold=true';
            }

            if (typeof userPresenceCleanup === 'function') userPresenceCleanup();
            activePresenceListeners.forEach(unsub => unsub());
            activePresenceListeners.clear();
            if (playlistUnsubscribe) {
                playlistUnsubscribe();
                playlistUnsubscribe = null;
            }
            if (document.getElementById('premiumBadge')) document.getElementById('premiumBadge').classList.add('hidden');
            renderDesktopRecentlyPlayed();
            if (recentlyPlayedUnsubscribe) {
                recentlyPlayedUnsubscribe();
                recentlyPlayedUnsubscribe = null;
            }
        }
    };

    const setupDesktopSidebarEvents = () => {
        const userProfileEl = document.querySelector('.user-profile');
        if (userProfileEl) {
            userProfileEl.style.cursor = 'pointer';
            userProfileEl.title = 'Click to log in or manage account';
            userProfileEl.onclick = () => {
                const user = auth.currentUser;
                if (!user) {
                    navigateToDesktopAuthPage('login');
                } else {
                    if (confirm(`Logged in as ${user.email}. Do you want to log out?`)) {
                        if (typeof userPresenceCleanup === 'function') {
                            userPresenceCleanup();
                            userPresenceCleanup = null;
                        }
                        if (recentlyPlayedUnsubscribe) {
                            recentlyPlayedUnsubscribe();
                            recentlyPlayedUnsubscribe = null;
                        }
                        signOut(auth).catch(err => console.error("Logout error:", err));
                    }
                }
            };
        }

        const handleCreatePlaylist = async () => {
            const user = auth.currentUser;
            if (!user) {
                navigateToDesktopAuthPage('login');
                return;
            }
            const name = prompt("Enter playlist name:");
            if (!name || !name.trim()) return;
            try {
                const created = await createUserPlaylist(user.uid, name.trim());
                if (created) {
                    showToast(`Playlist "${name.trim()}" created successfully!`);
                } else {
                    showToast("Failed to create playlist. Please try again.");
                }
            } catch (err) {
                console.error("Error creating desktop playlist:", err);
                showToast("Failed to create playlist.");
            }
        };

        const addPlaylistBtn = document.querySelector('.add-playlist-btn');
        if (addPlaylistBtn) {
            addPlaylistBtn.onclick = () => {
                const user = auth.currentUser;
                if (!user) {
                    navigateToDesktopAuthPage('login');
                } else {
                    handleCreatePlaylist();
                }
            };
        }
    };

    const loadDesktopPageContent = async (page, options = {}) => {
        const dashboardContainer = document.querySelector('.dashboard-container');
        if (!dashboardContainer) return;
        const navigationId = ++desktopPageLoadSequence;

        const {
            pushState = true,
            route = null,
            title = null,
            initialTab = 'login',
            state = null
        } = (typeof options === 'object' && options !== null) ? options : {};

        let targetRoute = route;
        let targetTitle = title;
        if (!targetRoute) {
            if (page === 'home-desktop.html') {
                targetRoute = '/';
                targetTitle = 'Spotiwind - Feel The Music, Ride The Wind';
            } else if (page.includes('auth-desktop.html')) {
                const isReg = initialTab === 'register';
                targetRoute = isReg ? '/register' : '/login';
                targetTitle = isReg ? 'Register | Spotiwind' : 'Login | Spotiwind';
            }
        }

        if (targetRoute) {
            updateDesktopAppUrl(targetRoute, targetTitle, state || { page, route: targetRoute }, pushState);
        }

        // Return to Home Dashboard
        if (page === 'home-desktop.html') {
            dashboardContainer.style.opacity = '0';
            await new Promise(res => setTimeout(res, 200));

            if (typeof activeDesktopPageCleanup === 'function') {
                activeDesktopPageCleanup();
                activeDesktopPageCleanup = null;
            }

            document.body.classList.remove('is-desktop-auth-view');

            if (desktopAuthPageStyleLink && desktopAuthPageStyleLink.parentNode) {
                desktopAuthPageStyleLink.parentNode.removeChild(desktopAuthPageStyleLink);
                desktopAuthPageStyleLink = null;
            }

            if (!initialDesktopHomeContent) {
                try {
                    const response = await fetch(`${window.location.origin}/frontend/src/pages/home-desktop.html`);
                    if (response.ok) {
                        const text = await response.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        const fetchedContainer = doc.querySelector('.dashboard-container');
                        if (fetchedContainer) {
                            initialDesktopHomeContent = fetchedContainer.innerHTML;
                        }
                    }
                } catch (e) {
                    console.warn("Could not fetch home template:", e);
                }
            }

            if (initialDesktopHomeContent) {
                dashboardContainer.innerHTML = initialDesktopHomeContent;
                initializeDesktopDashboardData();
                setupDesktopSidebarEvents();
                initDesktopSearch();
                initializeDesktopUserUI(auth.currentUser);
                dashboardContainer.style.opacity = '1';
                desktopCurrentPageUrl = 'home-desktop.html';
            }
            return;
        }

        // Navigating to Auth or other subpages
        if (!initialDesktopHomeContent && dashboardContainer && (desktopPreviousPageUrl === 'home-desktop.html' || !desktopPreviousPageUrl)) {
            initialDesktopHomeContent = dashboardContainer.innerHTML;
        }

        if (desktopCurrentPageUrl && desktopCurrentPageUrl !== page && !page.includes('auth-desktop.html')) {
            desktopPreviousPageUrl = desktopCurrentPageUrl;
        }
        desktopCurrentPageUrl = page;

        try {
            dashboardContainer.style.opacity = '0';
            await new Promise(res => setTimeout(res, 200));

            const pageFileName = page.includes('/') ? page.split('/').pop() : page;
            const pageFetchUrl = `${window.location.origin}/frontend/src/pages/${pageFileName}`;
            const response = await fetch(pageFetchUrl);
            if (!response.ok) throw new Error(`Could not load ${page}`);
            const text = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const newContent = doc.body.innerHTML;

            if (newContent) {
                if (navigationId !== desktopPageLoadSequence) return;

                if (page.includes('auth-desktop.html')) {
                    document.body.classList.add('is-desktop-auth-view');
                    const cssBase = `${window.location.origin}/frontend/src/assets/css/`;
                    desktopAuthPageStyleLink = await loadDesktopStylesheet(
                        `${cssBase}auth-desktop.css`,
                        desktopAuthPageStyleLink
                    );
                } else {
                    document.body.classList.remove('is-desktop-auth-view');
                }

                dashboardContainer.innerHTML = newContent;
                dashboardContainer.scrollTop = 0;

                if (page.includes('auth-desktop.html')) {
                    try {
                        const authModule = await import('./auth-desktop.js');
                        if (authModule && typeof authModule.initAuthDesktopPage === 'function') {
                            authModule.initAuthDesktopPage({
                                initialTab: options.initialTab || 'login',
                                onBack: async () => {
                                    await loadDesktopPageContent('home-desktop.html', { pushState: true });
                                },
                                onSuccess: async (user) => {
                                    await initializeDesktopUserUI(user);
                                    await loadDesktopPageContent('home-desktop.html', { pushState: true });
                                }
                            });
                            activeDesktopPageCleanup = authModule.cleanupAuthDesktopPage;
                        }
                    } catch (e) {
                        console.error("Error loading auth-desktop.js module:", e);
                    }
                }

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        dashboardContainer.style.opacity = '1';
                    });
                });
            }
        } catch (error) {
            console.error("Error loading desktop page content:", error);
            dashboardContainer.style.opacity = '1';
        }
    };

    const navigateToDesktopAuthPage = (initialTab = 'login', shouldPushState = true) => {
        const isRegister = initialTab === 'register';
        loadDesktopPageContent('auth-desktop.html', {
            pushState: shouldPushState,
            route: isRegister ? '/register' : '/login',
            title: isRegister ? 'Register | Spotiwind' : 'Login | Spotiwind',
            initialTab,
            state: { route: isRegister ? 'register' : 'login' }
        });
    };

    window.navigateToDesktopAuthPage = navigateToDesktopAuthPage;
    window.loadDesktopPageContent = loadDesktopPageContent;

    // Popstate navigation listener for browser Back & Forward buttons
    window.addEventListener('popstate', (e) => {
        const state = e.state;
        const path = window.location.pathname.toLowerCase();
        if (state?.route === 'login' || state?.route === 'register' || path.endsWith('/login') || path.endsWith('/register')) {
            const tab = (state?.route === 'register' || path.endsWith('/register')) ? 'register' : 'login';
            navigateToDesktopAuthPage(tab, false);
        } else {
            loadDesktopPageContent('home-desktop.html', { pushState: false });
        }
    });

    onAuthStateChanged(auth, async (user) => {
        // Protection: If a user on a mobile device tries to access the desktop page
        if (window.innerWidth <= 768) {
            navigateTo('home-mobile.html');
            return;
        }

        // Wait until the page resources finish loading before hiding the dark transition layer.
        hideLoadingOverlay();

        // Initialize User UI, dashboard data, and sidebar event listeners
        await initializeDesktopUserUI(user);
        initializeDesktopDashboardData();
        setupDesktopSidebarEvents();
        initDesktopSearch();

        // Handle initial route if redirected from auth or direct link
        const currentPath = window.location.pathname.toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);
        const targetTab = urlParams.get('tab');
        const initialTargetRoute = sessionStorage.getItem('spotiwind_target_route');

        if (currentPath.endsWith('/login') || currentPath.endsWith('/register') || targetTab || initialTargetRoute?.includes('login') || initialTargetRoute?.includes('register')) {
            const tab = (currentPath.endsWith('/register') || targetTab === 'register' || initialTargetRoute?.includes('register')) ? 'register' : 'login';
            sessionStorage.removeItem('spotiwind_target_route');
            navigateToDesktopAuthPage(tab, false);
        } else {
            try {
                window.history.replaceState({ route: 'home' }, 'Spotiwind - Feel The Music, Ride The Wind', '/');
            } catch (e) { }
        }
    });
});

/**
 * Desktop Search System
 */
let desktopLocalSongs = [];
let desktopLocalArtists = [];
let desktopLocalAlbums = [];

const initDesktopSearch = async () => {
    const searchInput = document.getElementById('searchInput');
    const searchDropdown = document.getElementById('searchDropdown');

    if (!searchInput || !searchDropdown) return;

    // Load local catalog in background
    loadLocalCatalog().then((cat) => {
        desktopLocalArtists = cat.artists || [];
        desktopLocalSongs = cat.songs || [];
        desktopLocalAlbums = cat.albums || [];
    }).catch(() => { });

    window.handleDesktopAlbumClick = (albumId) => {
        const album = desktopLocalAlbums.find((a) => a.id === albumId);
        if (album && Array.isArray(album.trackIds) && album.trackIds.length > 0) {
            const songsMap = new Map(desktopLocalSongs.map((s) => [s.id, s]));
            const tracks = album.trackIds.map((id) => songsMap.get(id)).filter(Boolean);
            if (tracks.length > 0 && typeof window.playPreview === 'function') {
                window.playPreview(null, tracks[0].audio, tracks[0].name, tracks[0].artist, tracks[0].cover, tracks[0].id, tracks[0].duration || 0, 'search');
            }
        }
        if (searchDropdown) searchDropdown.classList.remove('active');
    };

    const renderResults = (results) => {
        if (!searchDropdown) return;
        const { songs = [], artists = [], albums = [] } = results;

        if (songs.length === 0 && artists.length === 0 && albums.length === 0) {
            searchDropdown.innerHTML = `<div class="dropdown-no-results">No music found. Try another search.</div>`;
            searchDropdown.classList.add('active');
            return;
        }

        let html = '';

        // Artists
        artists.slice(0, 2).forEach((a) => {
            html += `
                <div class="dropdown-item dropdown-item-artist" onclick="window.playPreview(null, '', '${a.name.replace(/'/g, "\\'")}', '', '${a.photo || ''}', '${a.id}', 0, 'artist')">
                    <div class="dropdown-cover-wrapper" style="border-radius: 50%;">
                        <img src="${a.photo || '../../public/Elemen/Logo/Spotiwind.webp'}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="dropdown-track-info">
                        <div class="dropdown-info-name">${a.name}</div>
                        <div class="dropdown-song-artist">Artist</div>
                    </div>
                </div>
            `;
        });

        // Albums
        albums.slice(0, 2).forEach((alb) => {
            const safeName = alb.name.replace(/'/g, "\\'");
            const safeArtist = (alb.artist || 'Album').replace(/'/g, "\\'");
            html += `
                <div class="dropdown-item dropdown-item-album" onclick="window.handleDesktopAlbumClick('${alb.id}')">
                    <div class="dropdown-cover-wrapper" style="border-radius: 4px;">
                        <img src="${alb.cover || '../../public/Elemen/Logo/Spotiwind.webp'}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="dropdown-track-info">
                        <div class="dropdown-info-name">${safeName}</div>
                        <div class="dropdown-song-artist">${safeArtist} • Album</div>
                    </div>
                </div>
            `;
        });

        // Songs
        songs.slice(0, 6).forEach((s) => {
            html += `
                <div class="dropdown-item" onclick="window.playPreview(null, '${s.audio}', '${s.name.replace(/'/g, "\\'")}', '${(s.artist || '').replace(/'/g, "\\'")}', '${s.cover}', '${s.id}', ${s.duration || 0}, 'search'); document.getElementById('searchDropdown').classList.remove('active');">
                    <div class="dropdown-cover-wrapper">
                        <img src="${s.cover}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="dropdown-track-info">
                        <div class="dropdown-info-name">${s.name}</div>
                        <div class="dropdown-song-artist">${s.artist || 'Unknown'}</div>
                    </div>
                </div>
            `;
        });

        searchDropdown.innerHTML = html;
        searchDropdown.classList.add('active');
    };

    const performSearch = async (query) => {
        const q = (query || '').trim();
        if (q.length < 2) {
            searchDropdown.classList.remove('active');
            searchDropdown.innerHTML = '';
            return;
        }

        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();

        try {
            const results = await searchCatalogData(q, desktopLocalSongs, desktopLocalArtists, desktopLocalAlbums, 8);
            renderResults(results);
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.warn('Search error:', e);
            }
        }
    };

    searchInput.addEventListener('input', debounce((e) => {
        performSearch(e.target.value);
    }, 250));

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.remove('active');
        }
    });
};