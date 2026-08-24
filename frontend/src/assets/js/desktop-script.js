import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase-config.js";

let playlistUnsubscribe = null;
let friendActivityListeners = []; // Using an array to track multiple listeners
let currentFriendActivityLimit = 10;
let isLoadingMoreActivity = false;
let hasReachedActivityEnd = false;
let activityUpdateTimeout = null; // For activity update optimization

let allFriendsActivityData = []; // Buffer for all data from the modal
let modalDisplayCount = 0; // Tracking the number of items rendered in the modal
const MODAL_PAGE_SIZE = 50;

import { toggleFavorite } from '../../services/favoriteService.js';
import { isFavoriteSong } from '../../services/favoriteService.js';
import { updateMyActivity as updateActivityRecord } from '../../services/activityService.js';
import { getFollowingIds, getFriendsActivityByIds, subscribeFriendsActivityByIds } from '../../services/activityService.js';
import { watchUserConnection, watchFriendPresence } from '../../services/presenceService.js';
import { subscribeUserPlaylists, createUserPlaylist } from '../../services/libraryService.js';
import { isUserPremium } from '../../services/profileService.js';
import { getTopArtists as getCatalogTopArtists, getTrendingCatalog, retryCatalogRequest } from '../../services/catalogService.js';
import { setContextPlaylist, syncQueueState, setPlaybackModes, nextSong as getNextSong, previousSong as getPreviousSong } from '../../services/playerService.js';

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let currentSongIndex = -1;
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

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const VOLUME_PATH = "M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07";
const MUTE_PATH = "M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6";

/**
 * Helper to format seconds to MM:SS
 */
const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Helper to debounce a function (prevents excessive calls)
 */
const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

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
    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration || 0, context);
};

/**
 * Function to update user activity in Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    // Cancel the previous timeout if it exists (Debouncing/Delaying)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Only update if the song has been playing for more than 5 seconds to avoid spam when skipping songs
    activityUpdateTimeout = setTimeout(async () => {
        try {
            await updateActivityRecord(songName);
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
 * Function to create heart particle effects
 */
const createHeartParticles = (el) => {
    if (!el) return;
    
    // Get the center position of the clicked button
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 6; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart-particle';
        heart.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" style="fill: currentColor; stroke: none;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        
        heart.style.left = `${centerX}px`;
        heart.style.top = `${centerY}px`;
        
        // Random variations for flight direction using CSS Variables
        heart.style.setProperty('--x-offset', (Math.random() - 0.5) * 120);
        heart.style.setProperty('--y-offset', (Math.random() - 0.5) * 60);
        heart.style.setProperty('--rotate', `${(Math.random() - 0.5) * 60}deg`);
        
        // Random size
        const size = Math.random() * 10 + 15;
        heart.style.width = `${size}px`;
        heart.style.height = `${size}px`;

        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 1000);
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

/**
 * Main function to toggle Like/Unlike
 */
const toggleLike = async (e) => {
    const user = auth.currentUser;
    const btn = e.currentTarget; // The clicked button (can be from the sidebar or bottom bar)
    
    if (!user || !currentSongData || !btn) {
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
window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null) => {
    const songId = String(id);
    const wasSameSong = currentSongData && String(currentSongData.id) === songId;

    // Context-aware playlist management
    if (context && currentPlaylist.length > 0) {
        const queueState = setContextPlaylist(currentPlaylist, songId);
        currentPlaylist = queueState.playlist;
        currentSongIndex = queueState.currentIndex;
        currentSongData = queueState.currentSong;
    }

    if (!audioUrl) return;

    const isSameSong = wasSameSong && activeAudio.src;

    if (isSameSong) {
        if (!activeAudio.paused) {
            activeAudio.pause();
        } else {
            if (btn) btn.classList.add('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));
            activeAudio.play().catch(e => {
                console.error("Resume error:", e);
                if (btn) btn.classList.remove('btn-loading');
                document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
            });
        }
        return;
    }

    activeAudio.pause();
    currentSongData = { id: songId, audio: audioUrl, name: title, artist, cover, duration };
    currentSongIndex = currentPlaylist.findIndex(s => s.audio === audioUrl);
    syncQueueState(currentPlaylist, currentSongData, currentSongIndex);

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

// Notification System (Consistent with mobile script)
const showToast = (message) => {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
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
    const isActive = currentSongData && String(song.id) === String(currentSongData.id);
    const isPaused = activeAudio.paused;
    const safeName = song.name.replace(/'/g, "\\'");
    const safeArtist = song.artist.replace(/'/g, "\\'");

    return `
    <div class="song-card ${isActive ? 'is-active-song' : ''} ${isActive && isPaused ? 'is-paused' : ''}" data-id="${song.id}">
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
        <div class="song-footer">
            <div class="song-stats">
                <button class="play-mini-btn" aria-label="Play ${song.name}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </button>
                <span class="play-count">${song.plays || '0'}</span>
            </div>
            <button class="more-btn" aria-label="More options">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                </svg>
            </button>
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
    <div class="artist-card">
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

/**
 * Function to fetch popular artist data from Jamendo
 */
const fetchTopArtists = async () => {
    try {
        const artistsWithPhotos = await getCatalogTopArtists(10);
        if (artistsWithPhotos.length === 0) return false;
        renderGridProgressively('.artists-grid', artistsWithPhotos, createArtistCardHTML, '.artist-card-skeleton');
        return true;
    } catch (error) {
        console.error("Failed to fetch artist data:", error);
        throw error; // Throw error to be caught by fetchWithContinuousRetry
    }
};

/**
 * Function to fetch popular song data from Jamendo.
 */
const fetchTrendingMusic = async () => {
    try {
        const rawSongs = await getTrendingCatalog(12);

        // [FIX] Only render and return true if there is data to display.
        if (rawSongs.length === 0) {
            console.log("fetchTrendingMusic: No unique songs found after filtering, retrying...");
            return false; // Signal the retry-wrapper to try again.
        }

        currentPlaylist = rawSongs; // Save playlist for navigation
        syncQueueState(currentPlaylist, null, -1);
        renderGridProgressively('.popular-section .song-grid', rawSongs, createSongCardHTML, '.song-card-skeleton');
        return true; // Success
    } catch (error) {
        console.error("Failed to fetch music data:", error);
        throw error; // Throw error to be caught by fetchWithContinuousRetry
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Implementation of Event Delegation instead of inline onclick
    document.body.addEventListener('click', (e) => {
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
    let greetingName = 'User';
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

    /**
     * Function to open the modal and load activities in bulk
     */
    const openFriendsModal = async () => {
        const modal = document.getElementById('friendsModal');
        const modalContainer = document.getElementById('modalActivityContainer');
        if (!modal || !modalContainer) return;

        modal.classList.remove('hidden');
        modalContainer.innerHTML = '<div class="loader-container"><span class="loader"></span><p>Fetching all activities...</p></div>';
        
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // 1. Get all following
        const followingIds = await getFollowingIds(currentUser.uid);
        allFriendsActivityData = await getFriendsActivityByIds(followingIds, 100);

        // 3. Sort by Latest Time
        allFriendsActivityData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        // 4. Render the first 50
        modalContainer.innerHTML = '';
        modalDisplayCount = 0;
        renderMoreToModal();
    };

    const renderMoreToModal = () => {
        const modalContainer = document.getElementById('modalActivityContainer');
        const loader = document.getElementById('modalLoader');
        
        const nextBatch = allFriendsActivityData.slice(modalDisplayCount, modalDisplayCount + MODAL_PAGE_SIZE);
        
        if (nextBatch.length === 0) {
            if (modalDisplayCount === 0) modalContainer.innerHTML = '<p>No activity found.</p>';
            loader.classList.add('hidden');
            return;
        }

        const html = nextBatch.map(friend => `
            <div class="friend-item" style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05)">
                <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" class="friend-avatar">
                <div class="friend-info">
                    <div class="friend-header">
                        <span class="friend-name">${friend.name}</span>
                        <span class="friend-time">${formatRelativeTime(friend.timestamp)}</span>
                    </div>
                    <span class="friend-status">Listening to <strong>${friend.song}</strong></span>
                </div>
            </div>
        `).join('');

        modalContainer.insertAdjacentHTML('beforeend', html);
        modalDisplayCount += nextBatch.length;

        if (modalDisplayCount >= allFriendsActivityData.length) {
            loader.classList.add('hidden');
        }
    };

    // Modal Scroll Listener (Infinite Scroll)
    document.getElementById('modalActivityContainer')?.addEventListener('scroll', (e) => {
        const el = e.target;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
            if (modalDisplayCount < allFriendsActivityData.length) {
                renderMoreToModal();
            }
        }
    });

    // Add Event Listener for the "See All" link in Friends Activity
    const friendSeeAllLink = document.querySelector('.friend-activity-section .see-all-link');
    if (friendSeeAllLink) {
        friendSeeAllLink.addEventListener('click', (e) => {
            e.preventDefault();
            openFriendsModal();
        });
    };

    document.querySelector('.close-modal')?.addEventListener('click', () => {
        document.getElementById('friendsModal').classList.add('hidden');
    });

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
            navigateTo('mobile.html');
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Protection: If a user on a mobile device tries to access the desktop page
            if (window.innerWidth <= 768) {
                navigateTo('mobile.html');
                return;
            }

            // Wait until the page resources finish loading before hiding the dark transition layer.
            hideLoadingOverlay();

            // Username display is replaced by a notification icon in HTML
            console.log("Logged in as:", user.email);

            // Update username
            const userNameElement = document.getElementById('userName');
            greetingName = user.displayName || user.email?.split('@')[0] || 'User';
            lastGreetingHour = -1;
            updateGreeting();
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email.split('@')[0];
            }

            // NEW: Setup presence for the currently logged-in user
            setupUserPresence(user);

            // Run activity rendering after the user is confirmed to be logged in
            renderFriendActivity();

            // Load the user's playlists
            loadUserPlaylists(user.uid);

            // Fetch API data in parallel for faster loading
            const initializeData = () => {
                // [FIX] Remove Promise.all so each grid can render independently.
                // This allows data to appear one by one as it's ready, without waiting for others.
                fetchWithContinuousRetry(fetchTrendingMusic);
                fetchWithContinuousRetry(fetchTopArtists);
            };

            initializeData();

            // Periksa dan tampilkan status premium
            const premiumBadgeElement = document.getElementById('premiumBadge');
            if (premiumBadgeElement) {
                const premiumStatus = await isUserPremium(user.uid); // Wait for the premium check result
                if (premiumStatus) {
                    premiumBadgeElement.classList.remove('hidden');
                } else {
                    premiumBadgeElement.classList.add('hidden');
                }
            }

            // Update profile picture (Avatar) with a default fallback and automatic retry logic
            const avatarElement = document.getElementById('userAvatar');
            if (avatarElement) {
                const nameForAvatar = user.displayName || user.email.split('@')[0];
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff&bold=true`;
                const originalPhotoURL = user.photoURL;
                
                let originalRetry = 0;
                const maxRetries = 2;

                // Use no-referrer to avoid 403 blocks from providers like Google/Facebook
                avatarElement.referrerPolicy = "no-referrer";

                // Set up an event listener to try reloading if it fails (retry logic)
                avatarElement.onerror = function() {
                    // Logic 1: If the original photo fails, try reloading with a cache-buster before giving up
                    if (originalPhotoURL && this.src.includes(originalPhotoURL.split('?')[0]) && originalRetry < maxRetries) {
                        originalRetry++;
                        console.warn(`Failed to load original photo, retrying (${originalRetry}/${maxRetries})...`);
                        setTimeout(() => {
                            const sep = originalPhotoURL.includes('?') ? '&' : '?';
                            // Add a timestamp to force the browser to fetch new data from the server
                            this.src = `${originalPhotoURL}${sep}t=${Date.now()}`;
                        }, 2000);
                    } 
                    // Logic 2: If the original photo still fails after retries, then use the default avatar
                    else if (this.src !== defaultAvatar && !this.src.includes('ui-avatars.com')) {
                        console.warn("Original photo failed to load permanently, switching to default...");
                        this.src = defaultAvatar;
                    } else {
                        // If even the default avatar fails, stop to prevent a loop
                        this.onerror = null;
                    }
                };

                // Set initial source: Prioritize photoURL if available
                avatarElement.src = originalPhotoURL || defaultAvatar;
            }

        } else {
            // If there is no user, redirect back to index.html
            window.location.href = 'index.html';
            if (typeof userPresenceCleanup === 'function') userPresenceCleanup();
            activePresenceListeners.forEach(unsub => unsub());
            activePresenceListeners.clear();
            if (playlistUnsubscribe) {
                playlistUnsubscribe();
                playlistUnsubscribe = null;
            }
            // Bersihkan info pengguna jika logout
            if (document.getElementById('userName')) document.getElementById('userName').textContent = ''; // Clear user info on logout
            if (document.getElementById('premiumBadge')) document.getElementById('premiumBadge').classList.add('hidden');
            if (document.getElementById('userAvatar')) document.getElementById('userAvatar').src = '';
            
            // Opsional: Set status offline secara manual di RTDB saat logout jika diinginkan
            // However, onDisconnect usually handles this well enough.
        }
    });
});