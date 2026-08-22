import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase-config.js";

import { toggleFavorite } from '../../services/favoriteService.js';
import { isFavoriteSong } from '../../services/favoriteService.js';
import { updateMyActivity as updateActivityRecord } from '../../services/activityService.js';
import { getFollowingIds, subscribeFriendsActivityByIds } from '../../services/activityService.js';
import { watchUserConnection, watchFriendPresence } from '../../services/presenceService.js';
import { subscribeUnreadNotifications } from '../../services/notificationService.js';
import { getTopArtists as getCatalogTopArtists, getTrendingCatalog, getNewReleaseCatalog, getArtistCatalog, loadLocalCatalog, getFeaturedLocalSongs, getLocalArtistCatalog, retryCatalogRequest } from '../../services/catalogService.js';
import { setContextPlaylist, syncQueueState, setPlaybackModes, nextSong as getNextSong, previousSong as getPreviousSong } from '../../services/playerService.js';
import { searchCatalog } from '../../services/searchService.js';

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let trendingPlaylist = []; // Buffer to store the list of popular songs
let newReleasesPlaylist = []; // Buffer to store the list of new releases
let searchPlaylist = []; // Buffer to store search results
let indonesianSongsPlaylist = []; // NEW: Buffer for all local songs
let indonesianGridPlaylist = []; // NEW: Buffer specifically for the 12 songs in the Indonesian grid
let indonesianArtistsPlaylist = []; // NEW: Buffer for local artists
let unshuffledPlaylist = []; // NEW: To store the original order of the playlist
let currentSongIndex = -1;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;
let currentSongData = null; // Stores the currently active song data
let activityUpdateTimeout = null; // For activity update optimization
let artistPageCurrentSongs = []; // [NEW] Buffer to store songs from the current artist page
let homeScrollPosition = 0; // NEW: To store scroll position of the home page
let artistDataForPageLoad = null; // [NEW] Untuk menyimpan data artis saat navigasi
let friendActivityListeners = []; // Store listeners so they can be cleared
let lastSearchQuery = ''; // [NEW] Variable to store the last search query
let notificationPageStyleLink = null; // [NEW] To store the dynamically added notification page CSS link (using notifications-mobile.css)
let artistPageStyleLink = null; // [NEW] To store the dynamically added artist page CSS link
let libraryPageStyleLink = null; // [NEW] To store the dynamically added library page CSS link
let accountPageStyleLink = null; // [NEW] To store the dynamically added account page CSS link
let radioPageStyleLink = null; // [NEW] To store the dynamically added radio page CSS link
let isTransitioningUpNext = false; // [FIX] Flag to prevent View Transition race conditions
let initialHomeContent = null; // [FIX] Cache untuk menyimpan konten asli halaman Home
let activePageCleanup = null;
let pageLoadSequence = 0;

let previousPageUrl = 'mobile.html'; // [NEW] Untuk melacak halaman sebelumnya saat navigasi ke halaman artis
let unreadNotificationsListener = null; // [NEW] To store the unsubscribe function for unread notifications
// NEW: Tracking RTDB listeners to avoid duplicates (Sync with Desktop)
const activePresenceListeners = new Map();
let userPresenceCleanup = null;

// Cache friend online status (same as desktop)
const friendOnlineStatus = {};

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

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
 * Helper to accurately compare audio URLs (ignore protocol/trailing slash)
 */
const isSameAudio = (url1, url2) => {
    if (!url1 || !url2) return false;
    const clean = u => u.replace(/^https?:/, '').replace(/\/$/, '');
    return clean(url1) === clean(url2);
};

/**
 * Helper to reset play/pause button UI (Sync with Mobile)
 */
const resetBtnUI = (btn) => {
    // Only reset innerHTML if the element is indeed an icon button (play-overlay)
    if (btn && (btn.classList.contains('play-overlay') || btn.classList.contains('play-pause-btn'))) {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    } else if (btn) {
        btn.classList.remove('btn-loading');
    }
};

// Event listener to update the progress bar and time in real-time
const mobileProgressThumbs = document.querySelectorAll('.mobile-mini-progress-bar');
activeAudio.addEventListener('timeupdate', () => {
    if (isDragging) return;

    if (activeAudio.duration) {
        const percent = (activeAudio.currentTime / activeAudio.duration) * 100;
        mobileProgressThumbs.forEach(thumb => thumb.style.width = `${percent}%`);
        
        // Sync Full Player Progress
        document.getElementById('fullProgressBar').style.width = `${percent}%`;
        document.getElementById('fullCurrentTime').textContent = formatTime(activeAudio.currentTime);
    }
});

// Update total duration when song metadata is loaded
activeAudio.addEventListener('loadedmetadata', () => {
    document.getElementById('fullTotalTime').textContent = formatTime(activeAudio.duration);
});

// Toggle is-playing class on the card for CSS animation
activeAudio.addEventListener('play', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    document.querySelectorAll('#mobileMainPlayBtn').forEach(btn => btn.innerHTML = PAUSE_ICON);
    document.getElementById('mobilePlayerBar')?.classList.add('is-playing');
    document.getElementById('mobileFullPlayer')?.classList.add('is-playing');

    // Sync Full Player Play Button
    const fullPlayBtn = document.getElementById('fullMainPlayBtn');
    if (fullPlayBtn) fullPlayBtn.innerHTML = PAUSE_ICON;
    
    // Sync ALL instances of this song (in Grid and Search Dropdown)
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-active-song');
            el.classList.remove('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) overlay.innerHTML = PAUSE_ICON;
        });
    }
});

activeAudio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    document.querySelectorAll('#mobileMainPlayBtn').forEach(btn => btn.innerHTML = PLAY_ICON);
    document.getElementById('mobilePlayerBar')?.classList.remove('is-playing');
    document.getElementById('mobileFullPlayer')?.classList.remove('is-playing');

    // Sync Full Player Pause Button
    const fullPlayBtn = document.getElementById('fullMainPlayBtn');
    if (fullPlayBtn) fullPlayBtn.innerHTML = PLAY_ICON;
    
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) overlay.innerHTML = PLAY_ICON;
        });
    }
});

/**
 * Song navigation function (Next / Previous)
 */
window.playNext = () => {
    const nextSong = getNextSong();
    if (nextSong) triggerSongByIndex(currentPlaylist.findIndex((song) => song.id === nextSong.id));
};

window.playPrevious = () => {
    const previousSong = getPreviousSong();
    if (previousSong) triggerSongByIndex(currentPlaylist.findIndex((song) => song.id === previousSong.id));
};

/**
 * Updates the "Up Next" list in the Full Screen Player
 */
const renderUpNext = () => {
    const listContainer = document.getElementById('upNextList');
    if (!listContainer) return;

    if (!currentPlaylist || currentPlaylist.length === 0 || currentSongIndex === -1) {
        listContainer.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">No upcoming songs</p>';
        return;
    }

    // Problem Solved: Use a Set to track unique songs to avoid visual duplication
    // if the playlist is very short.
    const nextSongs = [];
    const maxItems = Math.min(currentPlaylist.length, 5); // Limit to a maximum of 5 upcoming songs
    const seenIds = new Set();

    for (let i = 0; i < currentPlaylist.length && nextSongs.length < maxItems; i++) {
        const idx = (currentSongIndex + i) % currentPlaylist.length;
        const song = currentPlaylist[idx];
        if (!seenIds.has(song.id)) {
            nextSongs.push({ ...song, originalIndex: idx });
            seenIds.add(song.id);
        }
    }

    const html = nextSongs.map((song, idx) => {
        // isActive is only for the first index (the song that is actually playing now)
        const isActive = idx === 0; 
        // Escape single and double quotes to avoid breaking HTML attributes
        const safeTitle = song.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeArtist = song.artist.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        return `
        <div class="up-next-item ${isActive ? 'active' : ''}" 
            style="animation-delay: ${idx * 0.05}s; view-transition-name: up-next-item-${song.id};" 
            onclick="playPreview(null, '${song.audio}', '${safeTitle}', '${safeArtist}', '${song.cover}', '${song.id}', ${song.duration}, null)">
            <img src="${song.cover}" class="up-next-cover" alt="${song.name}">
            <div class="up-next-info">
                <div class="up-next-name">${song.name}</div>
                <div class="up-next-artist">${song.artist}</div>
            </div>
            <div class="up-next-right">
                <span class="up-next-duration">${formatTime(song.duration)}</span>
                <div class="equalizer">
                    <span></span><span></span><span></span>
                </div>
                <div class="up-next-icon">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                    </svg>
                </div>
            </div>
        </div>
    `;}).join('');

    // Use View Transitions API if available (Chrome/Safari 17.4+)
    if (document.startViewTransition && !isTransitioningUpNext) {
        isTransitioningUpNext = true;
        const transition = document.startViewTransition(() => {
            listContainer.innerHTML = html;
        });

        // The .finished promise resolves when the transition is complete.
        // Use .finally() to ensure the flag is always reset.
        transition.finished.finally(() => {
            isTransitioningUpNext = false;
        });
    } else {
        listContainer.innerHTML = html; // Fallback for browsers without the API or if a transition is active
    }
};

const triggerSongByIndex = (index) => {
    const song = currentPlaylist[index];
    if (!song) return;

    // Find the specific play-overlay element to avoid overwriting the main container
    const activeEl = document.querySelector(`.is-active-song[data-id="${song.id}"]`) || 
                     document.querySelector(`[data-id="${song.id}"]`);
    const btn = activeEl?.querySelector('.play-overlay');

    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration);
};
 
/**
 * Function to update user activity in Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    // Cancel previous timeout if any (Debouncing as per desktop)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Only update if the song has been playing for more than 5 seconds
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
 * Function to sync the Like button status in the player
 */
const syncPlayerLikeButtons = (isLiked) => {
    const mobileLikeBtn = document.getElementById('mobileLoveBtn');
    if (mobileLikeBtn) mobileLikeBtn.classList.toggle('liked', isLiked);
    
    const fullLikeBtn = document.getElementById('fullLoveBtn');
    if (fullLikeBtn) fullLikeBtn.classList.toggle('liked', isLiked);
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

    const cleanId = String(songId).trim();

    try {
        const isLiked = await isFavoriteSong(cleanId);

        if (currentSongData && String(currentSongData.id) === cleanId) {
            syncPlayerLikeButtons(isLiked);
        }
        return isLiked;
    } catch (error) {
        console.error("Error checking liked status:", error);
        syncPlayerLikeButtons(false);
        return false;
    }
};

/**
 * Function to create heart particle effects (simplified for mobile)
 */
const createHeartParticles = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 5; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart-particle';
        heart.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#22c55e"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

        heart.style.position = 'fixed';
        heart.style.left = `${centerX}px`;
        heart.style.top = `${centerY}px`;
        heart.style.zIndex = '20000';
        heart.style.pointerEvents = 'none';
        
        heart.style.setProperty('--x-offset', (Math.random() - 0.5) * 80);
        heart.style.setProperty('--y-offset', (Math.random() - 0.5) * 40);
        heart.style.setProperty('--rotate', `${(Math.random() - 0.5) * 45}deg`);
        
        heart.style.animation = 'heart-float 0.8s ease-out forwards';
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 800);
    }
};

// Notification System (Konsisten dengan script.js)
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
    
    // Automatically remove after the animation finishes (3 seconds)
    setTimeout(() => {
        toast.remove();
    }, 3000);
};

/**
 * Function to set the current user's online/offline status in the Realtime Database
 */
const setupUserPresence = (user) => {
    if (!user) return;

    if (typeof userPresenceCleanup === 'function') userPresenceCleanup();

    const myStatusIndicator = document.querySelector('.header-right .online-status');
    userPresenceCleanup = watchUserConnection(user.uid, {
        onOnline: () => myStatusIndicator?.classList.remove('offline'),
        onOffline: () => myStatusIndicator?.classList.add('offline')
    });
};

/**
 * Function to monitor friends' online status in real-time on mobile
 */
const listenToFriendPresence = (friendUid) => {
    if (activePresenceListeners.has(friendUid)) return;

    const unsubscribe = watchFriendPresence(friendUid, ({ isOnline }) => {
        friendOnlineStatus[friendUid] = isOnline;
        
        // Update UI if the friend's element is on the page (e.g., in the activity list)
        const statusElements = document.querySelectorAll(`.friend-item[data-uid="${friendUid}"] .online-status`);
        statusElements.forEach(el => {
            if (isOnline) el.classList.remove('offline');
            else el.classList.add('offline');
        });
    });
    activePresenceListeners.set(friendUid, unsubscribe);
};

const clearFriendPresenceListeners = () => {
    activePresenceListeners.forEach((unsubscribe) => unsubscribe());
    activePresenceListeners.clear();
};

/**
 * Function to fetch friend activity (same logic as desktop)
 */
const renderMobileFriendActivity = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Clear old listeners if any to prevent memory leaks
    if (friendActivityListeners.length > 0) {
        friendActivityListeners.forEach(unsub => unsub());
        friendActivityListeners = [];
    }
    clearFriendPresenceListeners();

    try {
        // 1. Get the list of UIDs of people being followed (Following)
        const followingIds = await getFollowingIds(user.uid);

        // If not following anyone, no need to proceed
        if (followingIds.length === 0) return;

        // 2. Render container (assuming it's in the HTML or add it dynamically)
        const container = document.getElementById('mobileFriendActivity');

        const unsub = subscribeFriendsActivityByIds(followingIds, (activities) => {
            activities.forEach(friend => listenToFriendPresence(friend.id));

            if (container) {
                container.innerHTML = activities.map(friend => {
                    const onlineClass = friendOnlineStatus[friend.id] ? '' : 'offline';
                    return `
                        <div class="friend-item" data-uid="${friend.id}" style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
                            <div class="avatar-container">
                                <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" style="width: 35px; height: 35px; border-radius: 50%;">
                                <span class="online-status ${onlineClass}"></span>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                                    <strong>${friend.name}</strong>
                                    <span style="color: var(--text-muted);">${formatRelativeTime(friend.timestamp)}</span>
                                </div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Listening to ${friend.song}</div>
                            </div>
                        </div>`;
                }).join('');
            }
        });

        friendActivityListeners.push(unsub);
    } catch (error) {
        console.error("Failed to load friend activity on mobile:", error);
    }
};

    /**
     * [REFACTOR] Updates the greeting badge based on the time of day.
     * Moved to global scope to be callable on navigation.
     */
    let lastHour = -1; // Stores the last hour's status for rendering optimization
    const updateGreeting = (forceUpdate = false) => {
        const greetingBadge = document.getElementById('greetingBadge');
        if (!greetingBadge) return;
        
        const hour = new Date().getHours();
        if (hour === lastHour && !forceUpdate) return; // Optimization: Only process if the hour has changed or if forced
        lastHour = hour;

        let greeting = "";
        let emoji = "";

        if (hour >= 4 && hour < 10) {
            greeting = "Morning";
            emoji = "🌅";
        } else if (hour >= 10 && hour < 15) {
            greeting = "Afternoon";
            emoji = "☀️";
        } else if (hour >= 15 && hour < 18) {
            greeting = "Evening";
            emoji = "🌇";
        } else {
            greeting = "Night";
            emoji = "🌙";
        }
        greetingBadge.textContent = `Good ${greeting} ${emoji}`;
    };

/**
 * Helper for relative time format (same as desktop)
 */
const formatRelativeTime = (timestamp) => {
    // [FIX] Add null or undefined check for timestamp
    if (!timestamp || typeof timestamp.toDate !== 'function') {
        // If the timestamp is invalid, return a default or empty string
        return '...';
    }
    const now = new Date();
    const date = timestamp.toDate();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return "now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    return `${Math.floor(diffInMinutes / 60)}h`;
};

document.addEventListener('DOMContentLoaded', () => {
    // [FIX] Simpan konten awal dari .app-container saat halaman pertama kali dimuat.
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        initialHomeContent = appContainer.innerHTML;
    }

    // NEW: Centralized Event Delegation for all song cards
    // This prevents multiple listeners from being attached and causing race conditions.
    document.body.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.song-card .play-overlay') || e.target.closest('.song-card .play-mini-btn');
        if (playBtn) {
            // Prevent the click from bubbling up to other potential listeners (like the mini player bar)
            e.stopPropagation();

            const card = playBtn.closest('.song-card');
            const overlay = card.querySelector('.play-overlay'); // Always get data from the main overlay
            const d = overlay.dataset;
            window.playPreview(overlay, d.audio, d.name, d.artist, d.cover, card.dataset.id, Number(d.duration), d.context);
            return;
        }

        const artistCard = e.target.closest('.artist-card');
        if (artistCard) {
            e.preventDefault();

            // Store current scroll position before navigating to artist page
            // We assume that if an artist card is clicked, we are currently on the home page.
            homeScrollPosition = document.documentElement.scrollTop;

            const { artistId, artistName, artistPhoto } = artistCard.dataset;
            navigateToArtistPage({ id: artistId, name: artistName, photo: artistPhoto });
            return;
        }

        // [REFACTOR] Centralized event delegation for dynamic elements
        const target = e.target;

        // 1. Profile Dropdown Toggle
        const avatarContainer = target.closest('.header-right .avatar-container');
        if (avatarContainer) {
            e.stopPropagation();
            document.getElementById('profileDropdown')?.classList.toggle('active');
            return;
        }

        // 2. Logout Button
        if (target.closest('#logoutBtn')) {
            signOut(auth).catch(error => {
                console.error("Logout Error:", error);
                showToast("Failed to log out. Please try again.");
            });
            return;
        }

        // 3. Footer Dropdowns
        const footerHeader = target.closest('.footer-link-header');
        if (footerHeader) {
            const currentGroup = footerHeader.closest('.footer-link-group');
            if (!currentGroup) return;
            // Close other open dropdowns
            document.querySelectorAll('.footer-link-group.expanded').forEach(openGroup => {
                if (openGroup !== currentGroup) openGroup.classList.remove('expanded');
            });
            currentGroup.classList.toggle('expanded');
            return;
        }

        // 4. Close dropdowns when clicking outside
        if (!target.closest('.profile-dropdown-menu')) document.getElementById('profileDropdown')?.classList.remove('active');
        if (!target.closest('.footer-link-group')) document.querySelectorAll('.footer-link-group.expanded').forEach(g => g.classList.remove('expanded'));
    });

    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

    /**
     * Main function to toggle Like/Unlike
     */
    const toggleLike = async (e) => {
        const user = auth.currentUser;
        const btn = e.currentTarget;

        if (!user || !currentSongData || !btn) {
            return;
        }

        const songId = String(currentSongData.id).trim();
        if (!songId) return;

        const wasLiked = btn.classList.contains('liked');
        syncPlayerLikeButtons(!wasLiked);
        if (!wasLiked) {
            createHeartParticles(btn);
        } else {
            // Visual feedback effect on dislike (un-love)
            btn.classList.add('dislike-anim');
            setTimeout(() => btn.classList.remove('dislike-anim'), 400);
        }

        try {
            await toggleFavorite(currentSongData);
        } catch (error) {
            syncPlayerLikeButtons(wasLiked);
            console.error("Firebase Save Error:", error);
        }
    };

/**
 * [NEW] Handles clicks on artist items in the search dropdown.
 */
window.handleArtistClick = (id, name, photo) => {
    const searchDropdown = document.getElementById('searchDropdown');
    const searchInput = document.getElementById('searchInput');
    if (searchDropdown) searchDropdown.classList.remove('active');
    if (searchInput) searchInput.blur();

    try {
        // Reconstruct the artist data object from the arguments
        const artistData = { id, name, photo };
        // Store current scroll position before navigating
        homeScrollPosition = document.documentElement.scrollTop;
        navigateToArtistPage(artistData);
    } catch (error) {
        console.error("Failed to handle artist click:", error);
    }
};

/**
 * Special function to play a song from the search dropdown results.
 * It updates currentPlaylist so that the Next/Prev features are in sync with the search results.
 */
window.playFromSearch = (audioUrl, title, artist, cover, id) => {
    // Get duration from lastSearchResults if available
    const songData = window.lastSearchResults?.find(s => String(s.id) === String(id));
    const duration = songData ? songData.duration : 0; // Default to 0 if not found
    window.playPreview(null, audioUrl, title, artist, cover, id, duration, 'search');
};

    /**
     * Function to play/pause audio
     */
    window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null) => {
        if (!audioUrl) {
            return;
        }

        const wasSameSong = currentSongData && String(currentSongData.id) === String(id);
        // If btn is null (called from Up Next/Next/Prev), try to find the button in the DOM to sync the UI
        if (!btn) {
            const activeEl = document.querySelector(`.is-active-song[data-id="${id}"]`) || 
                             document.querySelector(`[data-id="${id}"]`);
            btn = activeEl?.querySelector('.play-overlay');
        }

        // Only update the playlist if a context is given (New play from a specific section)
        // If null (e.g., from Next/Prev/Repeat), use the existing currentPlaylist.
        if (context) {
            let baseQueue = [];
            if (context === 'trending' || context === 'new') {
                const masterPool = [...trendingPlaylist, ...newReleasesPlaylist];
                baseQueue = Array.from(new Map(masterPool.map(s => [s.id, s])).values());
            } else if (context === 'search') {
                baseQueue = [...searchPlaylist]; // Use a copy to keep the current queue stable
            } else if (context === 'local') {
                // [FIX] When playing from the Indonesian grid, the playlist context should be the songs
                // from that specific grid, not the entire local song library.
                baseQueue = [...indonesianGridPlaylist]; // [FIX] Use indonesianGridPlaylist for 'local' context
            } else if (context.startsWith('artist-')) { // [NEW] Handle artist page context
                // Use the songs currently displayed on the artist's page
                baseQueue = [...artistPageCurrentSongs]; // [FIX] Use artistPageCurrentSongs for 'artist-' context
            }

            // [NEW] Store the original, unshuffled order every time a new context is set
            unshuffledPlaylist = [...baseQueue];

            const queueState = setContextPlaylist(baseQueue, id);
            currentPlaylist = queueState.playlist;
            currentSongIndex = queueState.currentIndex;
            currentSongData = queueState.currentSong;
        }

        const songId = String(id);
        const isSameSong = wasSameSong && activeAudio.src;

        // Toggle Play/Pause logic for the same song
        if (isSameSong) {
            if (!activeAudio.paused) {
                activeAudio.pause();
            } else {
                try {
                    // If the song has ended, reset to the beginning before replaying (Important for Repeat)
                    if (activeAudio.ended) activeAudio.currentTime = 0;
                    await activeAudio.play();
                } catch (e) {
                    console.error("Resume error:", e);
                }
            }
            return;
        }

        // Playing a New Song
        currentSongData = { id: songId, audio: audioUrl, name: title, artist, cover, duration: duration };

        // Set the song index in the newly created/shuffled playlist
        // This is very important so that the Next/Prev buttons know their relative position
        currentSongIndex = currentPlaylist.findIndex(s => isSameAudio(s.audio, audioUrl));
        syncQueueState(currentPlaylist, currentSongData, currentSongIndex);

        // Render the list of next songs instantly (don't wait for the song to load)
        renderUpNext();

        // Reset ALL song statuses (prevents visual duplicates during fast skipping)
        document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
            el.classList.remove('is-active-song', 'is-paused');
        });

        document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(el => {
            el.classList.remove('btn-loading');
            if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
        });

        // Activate the class on all elements with this ID
        document.querySelectorAll(`[data-id="${songId}"]`).forEach(el => el.classList.add('is-active-song'));

        // Reset Mini Progress Bar to 0 instantly before the new song loads
        document.querySelectorAll('.mobile-mini-progress-bar').forEach(thumb => thumb.style.width = '0%');

        currentPlayingBtn = btn;
        if (btn) btn.classList.add('btn-loading');
        document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));

        activeAudio.onerror = null;
        activeAudio.onended = null;

        try {
            activeAudio.src = audioUrl;

        // Update Document Title (Consistent with desktop)
        document.title = `Spotiwind - Feel The Music, Ride The Wind`;

        // Media Session API integration
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Spotiwind', // Or get from currentSongData if available
                artwork: [
                    { src: cover, sizes: '512x512', type: 'image/webp' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => activeAudio.play());
            navigator.mediaSession.setActionHandler('pause', () => activeAudio.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => window.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => window.playNext());
        }

            syncPlayerLikeButtons(false);
            checkLikedStatus(id);

            // Show and update Mobile Player Bar
            const mobileBar = document.getElementById('mobilePlayerBar');
            if (mobileBar) {
                mobileBar.classList.add('active');
                document.body.classList.add('player-active');
            }

            document.getElementById('mobileTrackName').textContent = title;
            document.getElementById('mobileTrackArtist').textContent = artist;
            document.getElementById('mobileTrackCover').src = cover;

            // Update Full Player Info
            document.getElementById('fullTrackName').textContent = title;
            document.getElementById('fullTrackArtist').textContent = artist;
            document.getElementById('fullTrackCover').src = cover;
            document.getElementById('fullProgressBar').style.width = '0%';

            activeAudio.onerror = (e) => {
                console.error("Audio playback error:", e);
                resetBtnUI(btn);
                currentPlayingBtn = null;
            };

            await activeAudio.play();
            updateMyActivity(title);

            if (btn) btn.classList.remove('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));

        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error("Playback error:", error);
            showToast(error.message || "Failed to load song.");
            if (btn) btn.classList.remove('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
            currentPlayingBtn = null;
        }

        activeAudio.onended = () => {
            resetBtnUI(btn);
            currentPlayingBtn = null;
            if (isRepeat) {
                if (currentSongIndex !== -1) {
                    triggerSongByIndex(currentSongIndex); // Replay the same song
                } else if (currentSongData) {
                    // Fix: Ensure replaying a song from search is clean
                    window.playPreview(null, currentSongData.audio, currentSongData.name, currentSongData.artist, currentSongData.cover, currentSongData.id, currentSongData.duration);
                }
            } else if (currentPlaylist.length > 0) {
                playNext();
            }
        };
    };

    /**
     * Function to render the artist list to the UI
     */
    const renderTopArtists = (artists) => {
        const artistsGrid = document.querySelector('.artists-grid');
        if (!artistsGrid) return;
        artistsGrid.innerHTML = artists.map(artist => `
            <div class="artist-card" 
                 data-artist-id="${artist.id}" 
                 data-artist-name="${artist.name.replace(/"/g, '&quot;')}" 
                 data-artist-photo="${artist.photo}"
                 style="cursor: pointer;">
                <div class="artist-photo" style="background-image: url('${artist.photo}')"></div>
                <span class="artist-name">${artist.name}</span>
            </div>
        `).join('');
    };

    /**
     * Function to fetch popular artist data from Jamendo
     */
    const fetchTopArtists = async () => {
        const artistsGrid = document.querySelector('.artists-grid');
        try {
            const artistsWithPhotos = await getCatalogTopArtists(10);
            if (artistsWithPhotos.length === 0) return false;
            renderTopArtists(artistsWithPhotos);
            return true;
        } catch (error) {
            console.error("Failed to fetch artist data:", error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * [NEW] Function to fetch artist songs.
     * Extracted from loadArtistPage to be used with fetchWithContinuousRetry.
     */
    const fetchArtistSongs = async (artistId, artistName) => {
        const songsGrid = document.getElementById('artistSongsGrid');
        if (!songsGrid) return false; // Indicate failure if grid not found
    
        try {
            const artistSongs = await getArtistCatalog(artistId, artistName);
            if (artistSongs.length > 0) {
    
                artistPageCurrentSongs = artistSongs; // Store for playPreview
                await renderGridProgressively('#artistSongsGrid', artistSongs, (song) => createArtistSongListItemHTML(song, `artist-${artistId}`), '.artist-song-list-item-skeleton', `artist-${artistId}`);
                return true; // Success, songs rendered.
            } else {
                // No songs found, but API call was successful. Return false to keep retrying.
                console.log(`No popular songs found for artist ${artistName} (ID: ${artistId}). Retrying...`);
                return false; // Signal to fetchWithContinuousRetry to keep trying.
            }
        } catch (songError) {
            console.error(`Failed to fetch songs for artist ${artistName} (ID: ${artistId}):`, songError);
            // On error, return false to keep retrying. The skeleton will remain.
            return false; // Signal to fetchWithContinuousRetry to keep trying.
        }
    };

    /**
     * [NEW] Function to fetch songs for a local Indonesian artist.
     */
    const fetchLocalArtistSongs = async (artist) => {
        const songsGrid = document.getElementById('artistSongsGrid');
        if (!songsGrid) return false; // Indicate failure if grid not found

        // Extract the artist's folder name from their photo path. This is more reliable than using the name,
        // especially for collaborations where folder names might differ.
        const photoPathParts = artist.photo.split('/');
        const artistFolderName = photoPathParts.length > 3 ? decodeURIComponent(photoPathParts[3]) : artist.name; // Fallback to name

        // Filter songs by checking if their audio path is within the artist's specific folder.
        // This is the key to solving the duplicate song issue for collaborations.
        const artistSongs = getLocalArtistCatalog(indonesianSongsPlaylist, artist);

        artistPageCurrentSongs = artistSongs; // Update context for playback

        if (artistSongs.length > 0) {
            // Create a unique context for this local artist's page
            const context = `artist-local-${artist.name.replace(/\s+/g, '-').toLowerCase()}`;
            await renderGridProgressively('#artistSongsGrid', artistSongs, (song) => createArtistSongListItemHTML(song, context), '.artist-song-list-item-skeleton');
            return true; // Success, songs were found and rendered
        } else {
            // If no songs are found, display a message.
            songsGrid.innerHTML = `<p style="width: 100%; text-align: center; color: var(--text-muted);">No songs found for this artist.</p>`;
            return true; // Operation is complete, even if no songs were found.
        }
    };


    /**
     * Displays a skeleton loader in the grid.
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
        } else if (type === 'artist-song-list') { // [NEW] Skeleton for vertical artist song list
            skeletonHTML = `
                <div class="artist-song-list-item-skeleton skeleton">
                    <div class="skeleton-item-left"></div>
                    <div class="skeleton-item-info">
                        <div class="skeleton-item-name"></div>
                        <div class="skeleton-item-artist"></div>
                    </div>
                    <div class="skeleton-item-right"></div>
                </div>
            `;
        }

        grid.innerHTML = Array(count).fill(skeletonHTML).join('');
    };

    /**
     * Generic song card renderer. Returns an HTML string for a single song.
     * This promotes reusability without causing side effects.
     */
    const createSongCardHTML = (song, context) => {
        const isActive = currentSongData && String(song.id) === String(currentSongData.id);
        const safeName = song.name.replace(/'/g, "\\'");
        const safeArtist = song.artist.replace(/'/g, "\\'");

        return `
        <div class="song-card ${isActive ? 'is-active-song' : ''} ${activeAudio.paused ? 'is-paused' : ''}" 
            data-id="${song.id}" data-audio="${song.audio}">
            <div class="song-cover">
                <img src="${song.cover}" alt="${song.name}" style="width:100%; height:100%; object-fit:cover;">
                <button class="play-overlay" aria-label="Play ${song.name}" 
                    data-audio="${song.audio}" data-name="${safeName}" data-artist="${safeArtist}" 
                    data-cover="${song.cover}" data-duration="${song.duration}" data-context="${context}">
                    ${isActive && !activeAudio.paused ? PAUSE_ICON : PLAY_ICON}
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
            </div>
        </div>`;
    };

    /**
     * [REFACTOR] Fungsi renderer untuk satu kartu artis.
     * @param {object} artist - Objek data artis.
     * @returns {string} - String HTML untuk kartu artis.
     */
    const createArtistCardHTML = (artist) => {
        return ` 
        <div class="artist-card">
            <div class="artist-photo" style="background-image: url('${artist.photo}')"></div>
            <span class="artist-name">${artist.name}</span>
        </div>`;
    };

    /**
     * [NEW] Renderer for a single song in the vertical artist song list.
     * This is a custom layout for the artist's popular songs.
     */
    const createArtistSongListItemHTML = (song, context) => {
        const isActive = currentSongData && String(song.id) === String(currentSongData.id);
        const safeName = song.name.replace(/'/g, "\\'");
        const safeArtist = song.artist.replace(/'/g, "\\'");

        return `
        <div class="artist-song-list-item ${isActive ? 'is-active-song' : ''} ${activeAudio.paused ? 'is-paused' : ''}" 
            data-id="${song.id}" data-audio="${song.audio}"
            onclick="playPreview(null, '${song.audio}', '${safeName}', '${safeArtist}', '${song.cover}', '${song.id}', ${song.duration}, '${context}')">
            <div class="item-left">
                <img src="${song.cover}" class="item-cover" alt="${song.name}">                
            </div>
            <div class="item-info">
                <h3 class="item-name">${song.name}</h3>
                <p class="item-artist">${song.artist}</p>
            </div>
            <div class="item-right">
                <button class="more-options-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                    </svg>
                </button>
            </div>
        </div>`;
    };

    /**
     * [NEW & SYNC WITH DESKTOP] Renders items into a grid one by one for a progressive loading effect.
     * It replaces existing skeleton elements sequentially.
     * @param {string} gridSelector - The CSS selector for the grid container.
     * @param {Array} items - The array of data items to render.
     * @param {function(object, string): string} itemRenderer - The function that returns HTML for one item.
     * @param {string} skeletonSelector - The CSS selector for the skeleton elements within the grid.
     * @param {string} [context] - The playback context for the items.
     */
    const renderGridProgressively = async (gridSelector, items, itemRenderer, skeletonSelector, context = '') => {
        const grid = document.querySelector(gridSelector);
        if (!grid) return;

        const skeletons = grid.querySelectorAll(skeletonSelector);

        for (let i = items.length; i < skeletons.length; i++) {
            skeletons[i].remove();
        }

        for (let i = 0; i < items.length; i++) {
            const itemHTML = itemRenderer(items[i], context);
            if (skeletons[i]) {
                skeletons[i].outerHTML = itemHTML;
            } else {
                grid.insertAdjacentHTML('beforeend', itemHTML);
            }
            await new Promise(res => setTimeout(res, 50)); // Small delay for visual effect
        }
    };

    /**
     * [FIX & REFACTOR] Universal grid rendering function synced with desktop.
     * Can handle loading (skeleton), empty, and success states.
     * @param {string} gridSelector - CSS selector for the grid container.
     * @param {Array|null} items - Data array. If null, show skeleton.
     * @param {(item: object, context?: string) => string} itemRenderer - Function to render one item into HTML.
     * @param {string} skeletonType - Skeleton type ('song' or 'artist').
     * @param {string} [context] - Playback context (optional).
     * @param {string} [emptyMessage] - Message if there are no items.
     * @param {number} [skeletonCount] - Number of skeletons to display.
     */
    const renderGrid = (gridSelector, items, itemRenderer, skeletonType, context = '', emptyMessage = "No items found.", skeletonCount = 4) => {
        const grid = document.querySelector(gridSelector);
        if (!grid) return;

        if (items === null) {
            showSkeletonLoader(gridSelector, skeletonType, skeletonCount);
        } else if (items.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem; padding-left: 1.5rem; text-align: center; width: 100%;">${emptyMessage}</p>`;
        } else {
            grid.innerHTML = items.map(item => itemRenderer(item, context)).join('');
        }
    };

    /**
     * Function to fetch the latest release data from Jamendo
     */
    const fetchNewReleases = async () => {
        const gridSelector = '#newReleasesGrid';

        try {
            const rawSongs = await getNewReleaseCatalog(12);

            // [FIX] Only render and return true if there is data to display.
            if (rawSongs.length === 0) {
                console.log("fetchNewReleases: No unique songs found after filtering, retrying...");
                return false; // Signal the retry-wrapper to try again.
            }

            newReleasesPlaylist = rawSongs;
            renderGridProgressively(gridSelector, rawSongs, createSongCardHTML, '.song-card-skeleton', 'new');
            return true; // Success
        } catch (error) {
            console.error("Failed to fetch new releases:", error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * [FIXED & REFACTORED] Function to fetch and render local Indonesian songs.
     * This fixes two critical issues:
     * 1. The Indonesian Songs grid now renders independently, so it will always appear even if the manifest for search fails to load.
     * 2. The path to `indonesian-songs-manifest.json` is corrected to a more robust location, fixing the local search feature.
     */
    const fetchIndonesianSongs = async () => {
        const gridSelector = '#indonesianSongsGrid';

        const IndonesianGridSongs = getFeaturedLocalSongs();

        // [FIX 1] Render the grid immediately. This ensures the grid is always visible.
        indonesianGridPlaylist = IndonesianGridSongs;
        renderGridProgressively(gridSelector, IndonesianGridSongs, createSongCardHTML, '.song-card-skeleton', 'local');

        try {
            const catalog = await loadLocalCatalog();
            indonesianArtistsPlaylist = catalog.artists;
            indonesianSongsPlaylist = catalog.songs;

            return true;

        } catch (error) {
            console.error('Failed to load Indonesian song manifest for search:', error);
            throw error; // Re-throw to allow fetchWithContinuousRetry to work.
        }
    };

    /**
     * Function to fetch popular song data from Jamendo
     */
    const fetchTrendingMusic = async () => {
        const gridSelector = '.popular-section .song-grid'; 
        const sectionTitle = document.getElementById('sectionTitle');
        try {
            if (sectionTitle) sectionTitle.textContent = "Popular Right Now";
            
            const rawSongs = await getTrendingCatalog(12);

        // [FIX] Only render and return true if there is data to display.
        if (rawSongs.length === 0) {
            console.log("fetchTrendingMusic: No unique songs found after filtering, retrying...");
            return false; // Signal the retry-wrapper to try again.
        }

        trendingPlaylist = rawSongs;
        renderGridProgressively(gridSelector, rawSongs, createSongCardHTML, '.song-card-skeleton', 'trending');
        return true; // Success
        } catch (error) {
            console.error("Failed to fetch music data:", error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * NEW: Wrapper to continuously retry a fetch function upon failure.
     * This ensures the skeleton loader remains and the app keeps trying to load data.
     * @param {() => Promise<boolean>} fetchFunction - The async function to execute.
     * @param {number} delay - The delay (ms) before retrying.
     */
    const fetchWithContinuousRetry = async (fetchFunction, delay = 5000, maxRetries = 5) => {
        return retryCatalogRequest(fetchFunction, maxRetries, delay);
    };

    // Click Logic for Bottom Navigation
    const bottomNavItems = document.querySelectorAll('.mobile-bottom-nav .nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetPage = item.dataset.target;
            const currentActive = document.querySelector('.mobile-bottom-nav .nav-item.active');

            // [FIX] Revert logic: If the clicked item is already active, do nothing.
            // This prevents navigation when on a sub-page (like an artist page).
            if (currentActive === item) return;

            // Only navigate if a different item is clicked
            if (currentActive) currentActive.classList.remove('active');
            item.classList.add('active');

            // Store current scroll position if we are navigating away from the home page
            // We check for '.hero-card' as an indicator that we are on the home page content
            if (document.querySelector('.app-container .hero-card')) {
                homeScrollPosition = document.documentElement.scrollTop;
            }
            await loadPageContent(targetPage);
        });
    });

    /**
     * [NEW] Reusable function to update the user's avatar.
     * This is extracted to be called on initial load and on navigation back to home.
     * @param {object} user - The Firebase user object.
     * @param {HTMLElement} avatarElement - The <img> element to update.
     */
    const updateUserAvatar = (user, avatarElement) => {
        if (!user || !avatarElement) return;

            const nameForAvatar = user.displayName || user.email.split('@')[0];
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff&bold=true`;
            const originalPhotoURL = user.photoURL;
            
            let originalRetry = 0; 
            const maxRetries = 2; 

            avatarElement.referrerPolicy = "no-referrer";

            avatarElement.onerror = function() {
                if (originalPhotoURL && this.src.includes(originalPhotoURL.split('?')[0]) && originalRetry < maxRetries) {
                    originalRetry++;
                    console.log(`Mobile: Failed to load original photo, retrying (${originalRetry}/${maxRetries})...`);
                    setTimeout(() => {
                        const sep = originalPhotoURL.includes('?') ? '&' : '?';
                        this.src = `${originalPhotoURL}${sep}t=${Date.now()}`;
                    }, 2000);
                } 
                else if (this.src !== defaultAvatar && !this.src.includes('ui-avatars.com')) {
                    console.log("Mobile: Original photo failed, switching to initials...");
                    this.src = defaultAvatar;
                } else {
                    this.onerror = null;
                }
            };
            avatarElement.src = originalPhotoURL || defaultAvatar;
    };

    /**
     * [NEW] Initializes all dynamic content specific to the home page.
     * This includes the greeting, copyright year, and other UI elements.
     */
    const initializeHomeContent = () => {
        // Set copyright year automatically
        const copyrightYearEl = document.getElementById('copyrightYear');
        if (copyrightYearEl) {
            copyrightYearEl.textContent = new Date().getFullYear();
        }

        // Update the greeting message
        updateGreeting(true); // Force update when home content is re-initialized
    };

    /**
     * [NEW] Updates all user-specific UI elements like avatar and name.
     * @param {object} user - The Firebase user object.
     */
    const initializeUserUI = (user) => {
        if (!user) return;

        // Update main header avatar
        updateUserAvatar(user, document.getElementById('userAvatar'));

        // Update dropdown info
        const dropdownAvatar = document.getElementById('dropdownUserAvatar');
        const dropdownName = document.getElementById('dropdownUserName');
        const dropdownEmail = document.getElementById('dropdownUserEmail');

        if (dropdownAvatar) updateUserAvatar(user, dropdownAvatar);
        if (dropdownName) dropdownName.textContent = user.displayName || 'No Name';
        if (dropdownEmail) dropdownEmail.textContent = user.email;
    };

    const loadStylesheet = (href, currentLink) => {
        if (currentLink) {
            return Promise.resolve(currentLink);
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;

        const loaded = new Promise((resolve, reject) => {
            link.addEventListener('load', () => resolve(link), { once: true });
            link.addEventListener('error', () => reject(new Error(`Could not load stylesheet ${href}`)), { once: true });
        });

        document.head.appendChild(link);
        return loaded;
    };

    const loadPageContent = async (page) => {
        const contentContainer = document.querySelector('.app-container');
        if (!contentContainer) return;
        const navigationId = ++pageLoadSequence;

        // [FIX] Logika baru untuk navigasi kembali ke Home
        if (page === 'mobile.html') {
            if (initialHomeContent) {
                contentContainer.style.opacity = '0';

                await new Promise(res => setTimeout(res, 200));

                if (typeof activePageCleanup === 'function') {
                    activePageCleanup();
                    activePageCleanup = null;
                }
                if (unreadNotificationsListener) {
                    unreadNotificationsListener();
                    unreadNotificationsListener = null;
                }

                contentContainer.innerHTML = initialHomeContent;
                // Restore scroll position for the home page
                document.documentElement.scrollTop = homeScrollPosition;

                // Re-inisialisasi skeleton dan fetch data lagi untuk halaman home
                initializeSkeletons();
                initializeData(); // Panggil fungsi yang memuat semua data API
                initializeSearch();
                initializeHomeContent(); // [FIX] Panggil ulang inisialisasi konten home (copyright, greeting)

                const user = auth.currentUser; // [FIX] Dapatkan user saat ini dari auth

                initializeProfileDropdown();
                if (user) {
                    initializeUserUI(user);
                }

                // [NEW] Setup unread notification badge listener for the home page
                if (user) {
                    setupUnreadNotificationsListener(user.uid);
                }

                // [FIX] Re-attach the notification button listener because it was lost.
                const notificationBtn = document.getElementById('notificationBtn');
                if (notificationBtn) { // [REFACTOR]
                    notificationBtn.addEventListener('click', navigateToNotificationPage);
                }
                
                contentContainer.style.opacity = '1';
            } else {
                // Fallback jika cache kosong, lakukan reload penuh
                window.location.href = 'mobile.html';
            }
            return; // Hentikan eksekusi lebih lanjut
        }

        // [FIX] Capture the current active page's URL before navigating away.
        const currentActiveNav = document.querySelector('.mobile-bottom-nav .nav-item.active');
        if (currentActiveNav) {
            previousPageUrl = currentActiveNav.dataset.target;
        }

        try {
            // [FIX] Start the fade-out transition immediately to hide old content and prevent flicker.
            contentContainer.style.opacity = '0';
            await new Promise(res => setTimeout(res, 200)); // Wait for fade-out animation to complete.

            // Muat konten halaman parsial dari path yang diberikan.
            const response = await fetch(page);
            if (!response.ok) throw new Error(`Could not load ${page}`);
            const text = await response.text();
            
            // Gunakan DOMParser untuk mengekstrak konten yang kita butuhkan
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            // [FIX] Ambil konten dari body, bukan dari .app-container yang tidak ada di file parsial.
            // Ini membuat fungsi lebih fleksibel untuk memuat halaman parsial.
            const newContent = doc.body.innerHTML;

            if (newContent) {
                if (navigationId !== pageLoadSequence) return;

                // Reset scroll to top AFTER the content is hidden and BEFORE new content is shown.
                // This prevents the jarring scroll jump on the old page.
                document.documentElement.scrollTop = 0;
                if (typeof activePageCleanup === 'function') {
                    activePageCleanup();
                    activePageCleanup = null;
                }
                if (unreadNotificationsListener) {
                    unreadNotificationsListener();
                    unreadNotificationsListener = null;
                }
                contentContainer.innerHTML = newContent;

                // [FIX] Re-initialize dropdown listeners first before other UI updates.
                // [NEW] Dynamically load notification page CSS
                if (page.includes('notifications-mobile.html')) {
                    notificationPageStyleLink = await loadStylesheet(
                        'frontend/src/assets/css/notifications-mobile.css',
                        notificationPageStyleLink
                    );
                } else if (page.includes('artist-mobile.html')) {
                    artistPageStyleLink = await loadStylesheet(
                        'frontend/src/assets/css/artist-mobile.css',
                        artistPageStyleLink
                    );
                } else if (page.includes('library-mobile.html')) {
                    // [NEW] Dynamically load library page CSS
                    libraryPageStyleLink = await loadStylesheet(
                        'frontend/src/assets/css/library-mobile.css',
                        libraryPageStyleLink
                    );
                } else if (page.includes('account-mobile.html')) {
                    accountPageStyleLink = await loadStylesheet(
                        'frontend/src/assets/css/account-mobile.css',
                        accountPageStyleLink
                    );
                } else if (page.includes('radio-mobile.html')) {
                    radioPageStyleLink = await loadStylesheet(
                        'frontend/src/assets/css/radio-mobile.css',
                        radioPageStyleLink
                    );
                } else {
                    // Remove notification page CSS if navigating away
                    if (notificationPageStyleLink && notificationPageStyleLink.parentNode) {
                        notificationPageStyleLink.parentNode.removeChild(notificationPageStyleLink);
                        notificationPageStyleLink = null;
                    }
                    // [NEW] Remove artist page CSS if navigating away
                    if (artistPageStyleLink && artistPageStyleLink.parentNode) {
                        artistPageStyleLink.parentNode.removeChild(artistPageStyleLink);
                        artistPageStyleLink = null;
                    }
                    // [NEW] Remove library page CSS if navigating away
                    if (libraryPageStyleLink && libraryPageStyleLink.parentNode) {
                        libraryPageStyleLink.parentNode.removeChild(libraryPageStyleLink);
                        libraryPageStyleLink = null;
                    }
                    if (accountPageStyleLink && accountPageStyleLink.parentNode) {
                        accountPageStyleLink.parentNode.removeChild(accountPageStyleLink);
                        accountPageStyleLink = null;
                    }
                    if (radioPageStyleLink && radioPageStyleLink.parentNode) {
                        radioPageStyleLink.parentNode.removeChild(radioPageStyleLink);
                        radioPageStyleLink = null;
                    }
                }
                initializeProfileDropdown();
                // Now, update user-specific UI elements.
                const user = auth.currentUser;
                if (user) {
                    initializeUserUI(user);
                }

                // [FIX] Re-attach the notification button listener on every page load.
                // This ensures the button works on dynamically loaded pages like search.
                const notificationBtn = document.getElementById('notificationBtn');
                if (notificationBtn) { // [REFACTOR]
                    notificationBtn.addEventListener('click', navigateToNotificationPage);
                }

                // Re-initialize search functionality as it might be on the new page.
                initializeSearch();

                // [FIX] Correct if-else-if chain
                if (page.includes('search-mobile.html')) {
                    // Khusus untuk halaman search, kita tidak perlu memuat data trending/top artist,
                    // cukup inisialisasi fungsi search-nya saja.
                    // Fungsi fetchIndonesianSongs tetap dipanggil agar data lagu lokal tersedia untuk pencarian.
                    fetchWithContinuousRetry(fetchIndonesianSongs); // Diperlukan untuk data lagu lokal di fungsi pencarian
                } else if (page.includes('artist-mobile.html')) {
                    const artistModule = await import('./artist-mobile.js').catch(err => { console.error("Failed to load artist module:", err); return {}; });
                    const { initArtistPage } = artistModule;
                    activePageCleanup = artistModule.cleanupArtistPage;

                    if (typeof initArtistPage === 'function' && artistDataForPageLoad) {
                        initArtistPage(artistDataForPageLoad, previousPageUrl);
                        artistDataForPageLoad = null; // Clean up after initialization
                    } else {
                        console.error("initArtistPage function not found or artist data missing.");
                        contentContainer.innerHTML = `<p style="text-align:center; padding: 2rem;">Failed to initialize artist page.</p>`;
                    }
                } else if (page.includes('notifications-mobile.html')) {
                    // --- LOGIKA YANG DIPINDAHKAN DARI loadNotificationPage ---
                    const notificationsModule = await import('./notifications-mobile.js').catch(err => { console.error("Failed to load notifications module:", err); return {}; });
                    const { cleanupNotifications, initNotificationsPage } = notificationsModule;
                    activePageCleanup = cleanupNotifications;

                    // Add back button functionality
                    contentContainer.querySelector('#backToHomeBtn')?.addEventListener('click', async (e) => {
                        e.preventDefault();
                        
                        // Call the cleanup function before navigating back
                        if (typeof cleanupNotifications === 'function') {
                            cleanupNotifications();
                        }
                        // [NEW] Also try to clean up artist page listeners if they exist
                        const artistModule = await import('./artist-mobile.js').catch(() => ({}));
                        const { cleanupArtistPage } = artistModule;
                        if (typeof cleanupArtistPage === 'function') {
                            cleanupArtistPage();
                        }

                        // Deactivate all current active nav items
                        document.querySelectorAll('.mobile-bottom-nav .nav-item.active').forEach(item => item.classList.remove('active'));

                        // Find and activate the nav item corresponding to the previous page
                        const targetNavItem = document.querySelector(`.mobile-bottom-nav .nav-item[data-target="${previousPageUrl}"]`);
                        if (targetNavItem) {
                            targetNavItem.classList.add('active');
                        } else {
                            // Fallback to home if previous page is not in nav bar
                            document.querySelector('.mobile-bottom-nav .nav-item[data-target="mobile.html"]')?.classList.add('active');
                        }

                        await loadPageContent(previousPageUrl);
                    });

                    // Call the initialization function from the imported module
                    if (typeof initNotificationsPage === 'function') {
                        initNotificationsPage();
                    } else {
                        console.error("initNotificationsPage function not found in module.");
                        contentContainer.innerHTML = `<p style="text-align:center; padding: 2rem;">Failed to initialize notifications.</p>`;
                    }
                } else if (page.includes('library-mobile.html')) {
                    // [NEW] Dynamically import and initialize the library page module
                    const libraryModule = await import('./library-mobile.js').catch(err => { console.error("Failed to load library module:", err); return {}; });
                    const { initLibraryPage } = libraryModule;

                    if (typeof initLibraryPage === 'function') {
                        await initLibraryPage();
                        activePageCleanup = libraryModule.cleanupLibraryPage;
                    } else {
                        console.error("initLibraryPage function not found in module.");
                    }
                } else if (page.includes('account-mobile.html')) {
                    const accountModule = await import('./account-mobile.js').catch(err => { console.error("Failed to load account module:", err); return {}; });
                    const { initAccountPage } = accountModule;

                    if (typeof initAccountPage === 'function') {
                        initAccountPage();
                    } else {
                        console.error("initAccountPage function not found in module.");
                    }
                } else if (page.includes('radio-mobile.html')) {
                    const radioModule = await import('./radio-mobile.js').catch(err => { console.error("Failed to load radio module:", err); return {}; });
                    const { initRadioPage } = radioModule;

                    if (typeof initRadioPage === 'function') {
                        initRadioPage();
                    } else {
                        console.error("initRadioPage function not found in module.");
                    }
                } else {
                    // For any other page (like account, etc. in the future)
                    // or pages that don't have special logic, load the default data.
                    initializeSkeletons();
                    initializeData();
                }

                if (navigationId !== pageLoadSequence) return;
                
                // [FIX] Fade the new content in.
                contentContainer.style.opacity = '1';
            }
        } catch (error) {
            console.error('Failed to load page content:', error);
            contentContainer.innerHTML = `<p style="text-align:center; padding: 2rem;">Failed to load content.</p>`;
            // Ensure the container is visible to show the error message.
            contentContainer.style.opacity = '1';
            artistDataForPageLoad = null; // Clean up on error too
        }
    };

    /**
     * [NEW] Sets up a listener for unread notifications to show a badge.
     * @param {string} userId - The UID of the current user.
     */
    const setupUnreadNotificationsListener = (userId) => {
        // Clean up any existing listener before creating a new one
        if (unreadNotificationsListener) {
            unreadNotificationsListener();
            unreadNotificationsListener = null;
        }

        const notificationBadge = document.getElementById('notificationBadge');
        if (!notificationBadge) return;

        unreadNotificationsListener = subscribeUnreadNotifications(userId, (unreadCount) => {
            notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            notificationBadge.classList.toggle('hidden', unreadCount === 0);
        }, (error) => {
            console.error("Error fetching unread notification count:", error);
        });
    };

    const navigateToArtistPage = (artist) => {
        homeScrollPosition = document.documentElement.scrollTop;
        artistDataForPageLoad = artist;
        loadPageContent('frontend/src/pages/artist-mobile.html');
    };

    /**
     * [NEW] Loads the notification page content dynamically.
     */
    const navigateToNotificationPage = () => {
        // Store current scroll position before navigating
        homeScrollPosition = document.documentElement.scrollTop;
        // Call the main page loader
        loadPageContent('frontend/src/pages/notifications-mobile.html');
    };

    // [REFACTOR] Fungsi navigasi sekarang hanya untuk perpindahan antar file utama (desktop/mobile)
    const navigateTo = (url) => { // Fungsi ini tetap berguna untuk redirect ke desktop.html
        const overlay = document.getElementById('pageTransition');

        // Immediately hide the main container to avoid a messy look during resize
        document.body.classList.add('is-transitioning');

        if (overlay) {
            overlay.classList.remove('fade-out'); // <--- HERE
            setTimeout(() => { window.location.replace(url); }, 500);
        } else {
            window.location.replace(url); // <--- HERE
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

    // Hide the loading overlay only after the page resources have finished loading.
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

    // Listener for real-time screen size changes
    let isNavigating = false;
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && !isNavigating) {
            isNavigating = true;
            navigateTo('desktop.html');
        }
    });

    /**
     * NEW: Display all skeleton loaders synchronously at the start.
     * This ensures skeletons are always visible, even on a quick refresh.
     */
    const initializeSkeletons = () => {
        showSkeletonLoader('.popular-section .song-grid', 'song', 6);
        showSkeletonLoader('#newReleasesGrid', 'song', 6);
        showSkeletonLoader('#indonesianSongsGrid', 'song', 6);
        showSkeletonLoader('.artists-grid', 'artist', 5);
    };

    // [FIX] Pindahkan definisi initializeData ke lingkup yang lebih tinggi (global)
    // agar dapat diakses oleh loadPageContent saat memulihkan halaman Home.
    const initializeData = () => {
        // Hapus Promise.all agar setiap grid dapat dirender secara independen.
        // Ini memungkinkan data muncul satu per satu saat sudah siap, tanpa menunggu yang lain.
        fetchWithContinuousRetry(fetchTrendingMusic);
        fetchWithContinuousRetry(fetchTopArtists);
        fetchWithContinuousRetry(fetchNewReleases);
        fetchWithContinuousRetry(fetchIndonesianSongs);
    };

// [NEW] Expose necessary functions to the global scope for modules
window.spotiwind = {
    mobile: {
        fetchWithContinuousRetry,
        fetchLocalArtistSongs,
        fetchArtistSongs,
        loadPageContent,
        initializeSkeletons
    }
};

    /**
     * [NEW] Initializes the profile dropdown menu functionality.
     * This includes opening, closing, and the logout action.
     */
    const initializeProfileDropdown = () => {
        // Some pages (e.g. notifications page) do not render the profile dropdown.
        // In those cases, this should be a no-op instead of logging a warning.
        const profileDropdown = document.getElementById('profileDropdown');
        if (!profileDropdown) return;
    };

    // Panggil initializeSkeletons sekali saat halaman pertama kali dimuat.
    initializeSkeletons();
    
    // Panggil initializeHomeContent sekali saat halaman pertama kali dimuat.
    initializeHomeContent();

    updateGreeting(true); // Force update on initial load
    // Update the greeting every 1 minute to keep it accurate if the page is left open
    setInterval(updateGreeting, 60000);

    // Immediately update if the user returns to this tab (Visibility API)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateGreeting();
    });

    const initializeSearch = () => {
        const searchInput = document.getElementById('searchInput');
        const searchDropdown = document.getElementById('searchDropdown');
        const clearSearchBtn = document.getElementById('clearSearch');

        if (!searchInput || !searchDropdown || !clearSearchBtn) {
            // If elements are not found (e.g., on a different page), do nothing.
            return;
        }

        // [FIX] Restore the last search query when the search is re-initialized.
        if (searchInput && lastSearchQuery) {
            searchInput.value = lastSearchQuery;
            // Also, make the clear button visible if there's a query.
            clearSearchBtn?.classList.toggle('visible', lastSearchQuery.length > 0);
        }

        let searchAbortController = null;

        const updateSearchDropdownHeight = () => {
            const heroCard = document.querySelector('.hero-card');
            const searchBox = document.querySelector('.search-box');
            
            if (heroCard && searchDropdown && searchBox) {
                const heroRect = heroCard.getBoundingClientRect();
                const searchRect = searchBox.getBoundingClientRect();
                const distanceToBottom = heroRect.bottom - searchRect.bottom;
                const dropdownStyle = window.getComputedStyle(searchDropdown);
                const marginTop = parseFloat(dropdownStyle.marginTop) || 0;
                const finalHeight = Math.max(0, distanceToBottom - marginTop);
                searchDropdown.style.setProperty('--search-dropdown-height', `${finalHeight}px`);
            }
        };

        const fetchDropdownResults = async (query) => {
            if (!searchDropdown) return;

            if (searchAbortController) searchAbortController.abort();
            searchAbortController = new AbortController();

            searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">Searching...</div>';
            try {
                const cleanQuery = query.trim().toLowerCase();
            
                const qWordsForLocal = cleanQuery.split(/\s+/);
                const finalItems = await searchCatalog(cleanQuery, indonesianSongsPlaylist, indonesianArtistsPlaylist, 10);
                const fullMappedResults = finalItems.filter((item) => item.type === 'song');

            if (finalItems.length > 0) {
                searchPlaylist = fullMappedResults.slice(0, 20);
                const dropdownItems = finalItems.slice(0, 7); // Show max 7 items total
                window.lastSearchResults = dropdownItems.filter(i => i.type === 'song');

                searchDropdown.innerHTML = dropdownItems.map(item => {
                    if (item.type === 'artist') {
                        // Pass data to handleArtistClick for navigation
                        const safeName = item.name.replace(/'/g, "\\'");
                        const safePhoto = item.photo.replace(/'/g, "\\'");
                        return `
                        <div class="dropdown-item dropdown-item-artist" onclick="window.handleArtistClick('${item.id}', '${safeName}', '${safePhoto}')">
                            <div class="dropdown-cover-wrapper">
                                <img src="${item.photo}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div class="dropdown-track-info" style="flex: 1; min-width: 0; justify-content: center;">
                                <div class="dropdown-info-name" style="font-size: 0.8rem; font-weight: 600; display: flex; align-items: center;">
                                    <span>${item.name}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="verified-badge-icon" width="1em" height="1em" viewBox="0 0 256 256">
                                        <path d="M0 0h256v256H0z" fill="none" />
                                        <path fill="#0095f6"
                                            d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57c-1.36-3.27-1.44-8.69-1.52-13.94c-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52c-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14c-3.25 1.36-8.69 1.44-13.94 1.52c-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94c-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57c1.36 3.27 1.44 8.69 1.52 13.94c.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52c3.56 1.47 7.63 5.37 11.57 9.14c6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14c3.27-1.36 8.69-1.44 13.94-1.52c9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94c1.47-3.56 5.37-7.63 9.14-11.57c6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18m-52.2 6.84l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32" />
                                    </svg>
                                </div>
                                <div class="dropdown-artist-label">Artist</div>
                            </div>
                        </div>`;
                    } else { // It's a song
                        const song = item;
                        const isActive = currentSongData && String(song.id) === String(currentSongData.id);
                        const isPaused = isActive && activeAudio.paused;
                        return `<div class="dropdown-item ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${song.id || ''}" data-audio="${song.audio || ''}" onclick="playFromSearch('${song.audio}', '${song.name.replace(/'/g, "\\'")}', '${(song.artist).replace(/'/g, "\\'")}', '${song.cover}', '${song.id}')"><div class="dropdown-cover-wrapper"><img src="${song.cover}" style="width: 100%; height: 100%; object-fit: cover;"></div> <div class="dropdown-track-info" style="flex: 1; min-width: 0;"><div class="dropdown-info-name" style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; width: 100%;"><span class="dropdown-song-name" style="overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${song.name}</span><div class="equalizer" style="margin-left: auto;"><span></span><span></span><span></span></div></div><div class="dropdown-song-artist" style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.artist}</div></div></div>`;
                    }
                    }).join('');
                } else {
                    searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">No results.</div>';
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
                searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">Error.</div>';
            }
        };

        const debouncedSearch = debounce((query) => {
            const cleanQuery = query.trim();
            if (cleanQuery.length > 0) {
                updateSearchDropdownHeight();
                searchDropdown.classList.add('active');
                fetchDropdownResults(cleanQuery);
            } else {
                searchDropdown.classList.remove('active');
            }
        }, 500);

        window.addEventListener('resize', debounce(updateSearchDropdownHeight, 250));
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value;
            clearSearchBtn?.classList.toggle('visible', value.length > 0);
            lastSearchQuery = value; // [FIX] Update the global variable on every input
            debouncedSearch(value);
        });
        clearSearchBtn?.addEventListener('click', () => { 
            searchInput.value = ''; 
            lastSearchQuery = ''; // [FIX] Clear the stored query as well
            if (searchAbortController) searchAbortController.abort(); 
            clearSearchBtn.classList.remove('visible'); 
            searchDropdown.classList.remove('active'); searchInput.focus(); 
        });
        
        // [FIX] Modified focus event to also trigger a search if the input already has a value.
        searchInput.addEventListener('focus', (e) => { 
            const query = searchInput.value.trim();
            if (query.length > 0) { 
                updateSearchDropdownHeight(); 
                searchDropdown.classList.add('active');
                fetchDropdownResults(query); // Trigger search to populate the dropdown
            } 
        });
        document.addEventListener('click', (e) => { if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) { searchDropdown.classList.remove('active'); } });
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Protection: If opened on Desktop, redirect back to the desktop page
            if (window.innerWidth > 768) {
                navigateTo('desktop.html');
                return;
            }

            hideLoadingOverlay();

            // [FIX] Call the new initialization functions
            initializeUserUI(user);
            initializeProfileDropdown();

            // [NEW] Setup unread notification badge listener
            setupUnreadNotificationsListener(user.uid);

            setupUserPresence(user);
            initializeData(); // Load API data
            initializeSearch(); // Initialize search functionality

            // Event Listeners for mobile player controls
            // Listener for Hero Card Play button 
            const togglePlayHandler = async () => {
                // [FIX] Logic changed to directly control the global audio object,
                // removing dependency on `currentPlayingBtn` which becomes invalid after page navigation.
                if (activeAudio.src && activeAudio.src !== "") {
                    try {
                        if (activeAudio.paused) await activeAudio.play();
                        else activeAudio.pause();
                    } catch (err) { console.error("Toggle Play error:", err); }
                } else if (currentPlaylist.length > 0) {
                    // If no song is playing yet, play the first song from the current context.
                    triggerSongByIndex(0);
                }
            };

            document.getElementById('mobileMainPlayBtn')?.addEventListener('click', togglePlayHandler);
            document.getElementById('mobileLoveBtn')?.addEventListener('click', toggleLike);

            // --- FULL SCREEN PLAYER LOGIC ---
            const fullPlayer = document.getElementById('mobileFullPlayer');
            const miniPlayer = document.getElementById('mobilePlayerBar');
            const closeFullBtn = document.getElementById('closeFullPlayer');

            const openFullPlayer = () => {
                fullPlayer.classList.add('active');
                document.body.classList.add('full-player-open');
            };

            const closeFullPlayer = () => {
                fullPlayer.classList.remove('active');
                document.body.classList.remove('full-player-open');
            };

            // Open full player on mini player bar click (unless a button inside is clicked)
            miniPlayer?.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    openFullPlayer();
                }
            });

            closeFullBtn?.addEventListener('click', closeFullPlayer);

            // Controls in Full Player
            document.getElementById('fullMainPlayBtn')?.addEventListener('click', togglePlayHandler);
            document.getElementById('fullPrevBtn')?.addEventListener('click', window.playPrevious);
            document.getElementById('fullNextBtn')?.addEventListener('click', window.playNext);
            document.getElementById('fullLoveBtn')?.addEventListener('click', toggleLike);

            document.getElementById('fullShuffleBtn')?.addEventListener('click', (e) => {
                isShuffle = !isShuffle;
                const btn = e.currentTarget;
                btn.classList.add('btn-pop');
                setTimeout(() => btn.classList.remove('btn-pop'), 400);
                btn.classList.toggle('active', isShuffle);

                if (isShuffle) {
                    // When turning shuffle ON: Shuffle the playlist and re-render the list.
                    isRepeat = false;
                    document.getElementById('fullRepeatBtn')?.classList.remove('active');

                    if (unshuffledPlaylist.length > 1 && currentSongData) {
                        const currentSong = unshuffledPlaylist.find(s => String(s.id) === String(currentSongData.id));
                        let others = unshuffledPlaylist.filter(s => String(s.id) !== String(currentSongData.id));
                        
                        for (let i = others.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [others[i], others[j]] = [others[j], others[i]];
                        }
                        
                        currentPlaylist = currentSong ? [currentSong, ...others] : others;
                        currentSongIndex = 0;
                    }
                    renderUpNext();
                }
                setPlaybackModes({ shuffle: isShuffle, repeat: isRepeat });
                // When turning shuffle OFF, we only toggle the button state.
                // The playlist order remains shuffled, and we don't call renderUpNext() to prevent the "vibration".
            });

            document.getElementById('fullRepeatBtn')?.addEventListener('click', (e) => {
                isRepeat = !isRepeat;
                if (isRepeat) isShuffle = false; // Turn off shuffle if repeat is active
                setPlaybackModes({ shuffle: isShuffle, repeat: isRepeat });
                const btn = e.currentTarget;
                btn.classList.add('btn-pop');
                setTimeout(() => btn.classList.remove('btn-pop'), 400);
                btn.classList.toggle('active', isRepeat);
                document.getElementById('fullShuffleBtn')?.classList.toggle('active', isShuffle);
            });

            // Progress bar seeking for Full Player
            const fullProgressTrack = document.getElementById('fullProgressTrack');
            if (fullProgressTrack) {
                const seek = (e) => {
                    if (!activeAudio.duration || activeAudio.duration === Infinity) return;
                    const rect = fullProgressTrack.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const x = clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, x / rect.width));
                    
                    // Update UI instantly when dragging
                    document.getElementById('fullProgressBar').style.width = `${percentage * 100}%`;
                    document.getElementById('fullCurrentTime').textContent = formatTime(percentage * activeAudio.duration);
                    
                    activeAudio.currentTime = percentage * activeAudio.duration;
                };

                const startDragging = (e) => {
                    isDragging = true;
                    document.body.classList.add('is-dragging-progress');
                    seek(e);
                };

                const moveDragging = (e) => {
                    if (isDragging) {
                        if (e.cancelable) e.preventDefault();
                        seek(e);
                    }
                };

                const stopDragging = () => {
                    if (isDragging) {
                        isDragging = false;
                        document.body.classList.remove('is-dragging-progress');
                    }
                };

                fullProgressTrack.addEventListener('touchstart', startDragging, { passive: false });
                window.addEventListener('touchmove', moveDragging, { passive: false });
                window.addEventListener('touchend', stopDragging);
                
                // Add Mouse support for drag (important for testing on desktop/tablet)
                fullProgressTrack.addEventListener('mousedown', startDragging);
                window.addEventListener('mousemove', moveDragging);
                window.addEventListener('mouseup', stopDragging);
                
                // Keep regular click enabled
                fullProgressTrack.addEventListener('click', seek);
            }
        } else {
            // If not logged in, return to the login page
            window.location.href = 'index.html';

            // [NEW] Clean up unread notification listener on logout
            if (unreadNotificationsListener) {
                unreadNotificationsListener();
                unreadNotificationsListener = null;
            }
            if (typeof userPresenceCleanup === 'function') {
                userPresenceCleanup();
            }
            clearFriendPresenceListeners();
        }
    });

        // [FIX] Move listener attachment to the end of DOMContentLoaded
        // to ensure all functions like 'loadNotificationPage' are initialized.
        const notificationBtn = document.getElementById('notificationBtn');
        if (notificationBtn) {
            notificationBtn.addEventListener('click', navigateToNotificationPage);
        }
});