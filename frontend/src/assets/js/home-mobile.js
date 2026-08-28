import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase-config.js";

import { toggleFavorite, getFavoriteSongs } from '../../services/favoriteService.js';
import { isFavoriteSong } from '../../services/favoriteService.js';
import { subscribeUserPlaylists, createUserPlaylist } from '../../services/libraryService.js';
import { updateMyActivity as updateActivityRecord } from '../../services/activityService.js';
import { getFollowingIds, subscribeFriendsActivityByIds } from '../../services/activityService.js';
import { watchUserConnection, watchFriendPresence } from '../../services/presenceService.js';
import { subscribeUnreadNotifications } from '../../services/notificationService.js';
import { getTopArtists as getCatalogTopArtists, getTrendingCatalog, getNewReleaseCatalog, getArtistCatalog, loadLocalCatalog, getFeaturedLocalSongs, getLocalArtistCatalog, retryCatalogRequest } from '../../services/catalogService.js';
import { searchArtistsByName } from '../../services/jamendoService.js';
import { setContextPlaylist, syncQueueState, setPlaybackModes, nextSong as getNextSong, previousSong as getPreviousSong } from '../../services/playerService.js';

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let trendingPlaylist = []; // Buffer to store the list of popular songs
let newReleasesPlaylist = []; // Buffer to store the list of new releases
let searchPlaylist = []; // Buffer to store search results
let popularPlaylist = []; // Buffer to store Popular Searches song list for Up Next
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
let lastRecordedActivitySong = '';
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
let searchPageStyleLink = null;
let authPageStyleLink = null; // [NEW] To store the dynamically added auth page CSS link
let isTransitioningUpNext = false; // [FIX] Flag to prevent View Transition race conditions
let initialHomeContent = null; // [FIX] Cache untuk menyimpan konten asli halaman Home
let activePageCleanup = null;
let pageLoadSequence = 0;

let previousPageUrl = 'home-mobile.html'; // [NEW] Untuk melacak halaman sebelumnya saat navigasi ke halaman artis
let currentPageUrl = 'home-mobile.html'; // [NEW] Untuk melacak halaman aktif saat ini
let unreadNotificationsListener = null; // [NEW] To store the unsubscribe function for unread notifications
// NEW: Tracking RTDB listeners to avoid duplicates (Sync with Desktop)
const activePresenceListeners = new Map();
let userPresenceCleanup = null;
let sidebarPlaylistsUnsubscribe = null;

const renderSidebarPlaylists = (playlists = []) => {
    const listContainer = document.getElementById('sidebarPlaylistList');
    const seeAllBtn = document.getElementById('sidebarSeeAllPlaylists');
    if (!listContainer) return;

    if (!Array.isArray(playlists) || playlists.length === 0) {
        const isGuest = !auth.currentUser;
        listContainer.innerHTML = `
            <p style="font-size: 0.75rem; color: var(--text-muted); padding: 0.4rem 0.85rem; margin: 0;">
                ${isGuest ? 'Sign in to create playlists' : 'No playlists yet'}
            </p>
        `;
        if (seeAllBtn) {
            seeAllBtn.classList.add('hidden');
            seeAllBtn.style.display = 'none';
        }
        return;
    }

    const top3 = playlists.slice(0, 3);
    listContainer.innerHTML = top3.map(p => {
        const songCount = p.songs?.length || 0;
        const songText = `${songCount} ${songCount === 1 ? 'Song' : 'Songs'}`;
        const pName = p.name || 'Untitled Playlist';
        return `
            <div class="sidebar-playlist-item" data-sidebar-target="library-mobile.html" data-library-initial-tab="playlists" data-playlist-id="${p.id}">
                <div class="sidebar-playlist-cover" style="width: 2.5rem; height: 2.5rem; border-radius: 0.4rem; background: linear-gradient(135deg, #B91EC9, #8B5CF6); display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </div>
                <span class="sidebar-playlist-info">
                    <span class="sidebar-playlist-name">${pName}</span>
                    <span class="sidebar-playlist-count">${songText}</span>
                </span>
                <button class="sidebar-playlist-menu" type="button" data-playlist-id="${p.id}" data-playlist-name="${pName}" aria-label="More options for ${pName}">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.5"></circle>
                        <circle cx="12" cy="12" r="1.5"></circle>
                        <circle cx="19" cy="12" r="1.5"></circle>
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    // If more than 3 playlists (e.g. 4 or more), show See all playlists; otherwise hide it
    if (seeAllBtn) {
        if (playlists.length > 3) {
            seeAllBtn.classList.remove('hidden');
            seeAllBtn.style.display = 'flex';
        } else {
            seeAllBtn.classList.add('hidden');
            seeAllBtn.style.display = 'none';
        }
    }
};

const updateLikedSongsCount = (songs) => {
    const countElement = document.getElementById('likedSongsCount');
    if (countElement) countElement.textContent = String(songs?.length ?? 0);
};

const updateSidebarMusicCounts = () => {
    // 1. Downloads count
    try {
        const savedDownloads = JSON.parse(localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]');
        const count = Array.isArray(savedDownloads) ? savedDownloads.length : 0;
        const downloadsEl = document.getElementById('sidebarDownloadsCount');
        if (downloadsEl) downloadsEl.textContent = String(count);
    } catch {
        const downloadsEl = document.getElementById('sidebarDownloadsCount');
        if (downloadsEl) downloadsEl.textContent = '0';
    }

    // 2. Recently Played count
    try {
        const savedRecent = JSON.parse(localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]');
        const count = Array.isArray(savedRecent) ? savedRecent.length : 0;
        const recentEl = document.getElementById('sidebarRecentCount');
        if (recentEl) recentEl.textContent = String(count);
    } catch {
        const recentEl = document.getElementById('sidebarRecentCount');
        if (recentEl) recentEl.textContent = '0';
    }
};

const recordRecentlyPlayedSong = (song) => {
    if (!song || !song.id) return;
    try {
        const raw = localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]';
        const list = JSON.parse(raw);
        const validList = Array.isArray(list) ? list : [];
        const filtered = validList.filter(item => String(item.id) !== String(song.id));
        filtered.unshift({
            id: String(song.id),
            name: song.name || song.title || '',
            artist: song.artist || '',
            cover: song.cover || '',
            audio: song.audio || '',
            duration: song.duration || 0,
            playedAt: Date.now()
        });
        if (filtered.length > 50) filtered.length = 50;
        localStorage.setItem('recently_played_songs', JSON.stringify(filtered));
        updateSidebarMusicCounts();
    } catch (e) {
        console.warn("Failed to record recently played song:", e);
    }
};

const loadLikedSongsCount = async (uid) => {
    updateLikedSongsCount(await getFavoriteSongs(uid));
    updateSidebarMusicCounts();
};

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
 * Helper to accurately normalize audio URLs for comparison
 */
const normalizeAudio = (url) => {
    if (!url || typeof url !== 'string') return '';
    try {
        let clean = decodeURIComponent(url.trim().toLowerCase());
        clean = clean.replace(/^https?:\/\/[^/]+/, '');
        clean = clean.split('?')[0].split('#')[0];
        clean = clean.replace(/^(\.\.\/)+/, '').replace(/^\/?frontend\//, '').replace(/^\/?public\//, '').replace(/^\/+/, '');
        return clean;
    } catch {
        return url.toLowerCase().trim();
    }
};

const normalizeText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

const isSameAudio = (url1, url2) => {
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

const areSameSongs = (song, otherSong) => {
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

const getSongElements = (song) => {
    if (!song) return [];
    const elements = Array.from(document.querySelectorAll('[data-id], [data-song-id], .library-song-item, .popular-search-card, .dropdown-item, .song-card, .artist-song-list-item'));
    return elements.filter(element => {
        const id = element.dataset.id || element.dataset.songId || element.dataset.popularId;
        const audio = element.dataset.audio || element.dataset.songAudio || element.querySelector('.play-overlay')?.dataset?.audio;
        const name = element.dataset.name || element.dataset.songName || element.querySelector('.song-name, .library-song-name, .dropdown-song-name, .popular-search-title-row strong, .item-name')?.textContent;
        const artist = element.dataset.artist || element.dataset.songArtist || element.querySelector('.song-artist, .library-song-artist, .dropdown-song-artist, .popular-search-info span, .item-artist')?.textContent;
        return areSameSongs(song, { id, audio, name, artist });
    });
};

const syncActiveSongUI = () => {
    if (!currentSongData) return;
    const hasAudio = activeAudio && Boolean(activeAudio.src);
    const isPlaying = hasAudio && !activeAudio.paused && !activeAudio.ended;
    const isPaused = hasAudio && activeAudio.paused && !activeAudio.ended;

    document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
        el.classList.remove('is-active-song', 'is-paused');
    });

    document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(el => {
        el.classList.remove('btn-loading');
        if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
    });

    document.querySelectorAll('.library-song-play-icon, .popular-search-play-icon, .artist-song-play-icon').forEach(el => {
        el.innerHTML = PLAY_ICON;
    });

    if (isPlaying || isPaused) {
        const activeElements = getSongElements(currentSongData);
        activeElements.forEach(el => {
            el.classList.add('is-active-song');
            if (isPaused) {
                el.classList.add('is-paused');
            } else {
                el.classList.remove('is-paused');
            }
            const overlay = el.querySelector('.play-overlay');
            if (overlay) {
                overlay.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
            }
            const playIcon = el.querySelector('.library-song-play-icon, .popular-search-play-icon, .artist-song-play-icon');
            if (playIcon) {
                playIcon.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
            }
        });
    }
};
window.syncActiveSongUI = syncActiveSongUI;
window.__activeAudio = activeAudio;
window.areSameSongs = areSameSongs;
window.getCurrentSongData = () => currentSongData;
window.__currentSongData = currentSongData;

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
    
    // Sync ALL instances of this song across all pages
    syncActiveSongUI();
});

activeAudio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    document.querySelectorAll('#mobileMainPlayBtn').forEach(btn => btn.innerHTML = PLAY_ICON);
    document.getElementById('mobilePlayerBar')?.classList.remove('is-playing');
    document.getElementById('mobileFullPlayer')?.classList.remove('is-playing');

    // Sync Full Player Pause Button
    const fullPlayBtn = document.getElementById('fullMainPlayBtn');
    if (fullPlayBtn) fullPlayBtn.innerHTML = PLAY_ICON;
    
    syncActiveSongUI();
});

activeAudio.addEventListener('ended', () => {
    syncActiveSongUI();
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
    // Guard against: document hidden (tab in background), page visibility changes,
    // or rapid successive calls that can cause InvalidStateError.
    if (document.startViewTransition && !isTransitioningUpNext && !document.hidden) {
        isTransitioningUpNext = true;
        try {
            const transition = document.startViewTransition(() => {
                listContainer.innerHTML = html;
            });

            // The .finished promise resolves when the transition is complete.
            // Use .finally() to ensure the flag is always reset even on error.
            transition.finished.finally(() => {
                isTransitioningUpNext = false;
            });
        } catch (e) {
            // InvalidStateError can occur if the document becomes hidden mid-transition
            // or if another transition starts unexpectedly. Fall back gracefully.
            isTransitioningUpNext = false;
            listContainer.innerHTML = html;
        }
    } else {
        listContainer.innerHTML = html; // Fallback: no API, tab hidden, or transition in progress
    }
};

const triggerSongByIndex = (index) => {
    const song = currentPlaylist[index];
    if (!song) return;

    // Find the specific play-overlay element to avoid overwriting the main container
    const activeEl = getSongElements(song).find(element => element.classList.contains('is-active-song')) ||
                     getSongElements(song)[0];
    const btn = activeEl?.querySelector('.play-overlay');

    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration);
};
 
/**
 * Function to update user activity in Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    const activityKey = songName.trim().toLowerCase();
    if (!activityKey || activityKey === lastRecordedActivitySong) return;

    // Cancel previous timeout if any (Debouncing as per desktop)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Only update if the song has been playing for more than 5 seconds
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

    const myStatusIndicators = document.querySelectorAll('.sidebar-profile .online-status');
    const updateMyStatus = (isOnline) => {
        myStatusIndicators.forEach((indicator) => {
            indicator.classList.toggle('offline', !isOnline);
        });
    };

    userPresenceCleanup = watchUserConnection(user.uid, {
        onOnline: () => updateMyStatus(true),
        onOffline: () => updateMyStatus(false)
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
    // Keep shared sidebar elements outside the page content that gets replaced during navigation.
    document.querySelectorAll('.sidebar-overlay, .mobile-sidebar').forEach((element) => {
        document.body.appendChild(element);
    });

    let playlistModalTriggerEl = null;

    const openCreatePlaylistModal = (triggerElement = null) => {
        const user = auth.currentUser;
        if (!user) {
            showToast("Please log in to create and manage playlists.");
            return;
        }
        playlistModalTriggerEl = triggerElement || document.activeElement;

        // Explicitly blur any element inside sidebar before closing to prevent aria-hidden focus conflict
        const sidebar = document.querySelector('.mobile-sidebar');
        if (sidebar && sidebar.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        closeSidebar();

        const modal = document.getElementById('createPlaylistModal');
        const input = document.getElementById('playlistNameInput');
        const form = document.getElementById('createPlaylistForm');
        const submitBtn = document.getElementById('submitPlaylistBtn');
        if (!modal) return;

        if (form) form.reset();
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Playlist</span>';
        }
        modal.removeAttribute('inert');
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => input?.focus(), 120);
    };

    const closeCreatePlaylistModal = () => {
        const modal = document.getElementById('createPlaylistModal');
        if (!modal) return;

        // Blur element inside modal before setting aria-hidden to avoid browser warning
        if (modal.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');

        if (playlistModalTriggerEl && typeof playlistModalTriggerEl.focus === 'function' && document.body.contains(playlistModalTriggerEl)) {
            playlistModalTriggerEl.focus();
        }
    };

    window.openCreatePlaylistModal = openCreatePlaylistModal;
    window.closeCreatePlaylistModal = closeCreatePlaylistModal;

    const setupPlaylistModalListeners = () => {
        const modal = document.getElementById('createPlaylistModal');
        const form = document.getElementById('createPlaylistForm');
        const cancelBtn = modal?.querySelector('.playlist-btn-cancel');
        const closeBtn = modal?.querySelector('.playlist-modal-close-btn');

        cancelBtn?.addEventListener('click', closeCreatePlaylistModal);
        closeBtn?.addEventListener('click', closeCreatePlaylistModal);

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCreatePlaylistModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                closeCreatePlaylistModal();
            }
        });

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if (!user) {
                showToast("Please log in to create playlists.");
                closeCreatePlaylistModal();
                return;
            }

            const input = document.getElementById('playlistNameInput');
            const submitBtn = document.getElementById('submitPlaylistBtn');
            const playlistName = input?.value?.trim();
            if (!playlistName) return;

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span>Creating...</span>';
            }

            try {
                const created = await createUserPlaylist(user.uid, playlistName);
                if (created) {
                    showToast(`Playlist "${playlistName}" created!`);
                    closeCreatePlaylistModal();
                } else {
                    showToast("Failed to create playlist. Please try again.");
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<span>Create Playlist</span>';
                    }
                }
            } catch (error) {
                console.error("Error creating playlist:", error);
                showToast("Failed to create playlist.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>Create Playlist</span>';
                }
            }
        });
    };

    setupPlaylistModalListeners();

    // [FIX] Simpan konten awal dari .app-container saat halaman pertama kali dimuat.
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        initialHomeContent = appContainer.innerHTML;
    }

    const closeSidebar = () => {
        const sidebar = document.querySelector('.mobile-sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        const menuButton = document.querySelector('.menu-btn');
        
        // Remove focus from inside sidebar BEFORE setting aria-hidden
        if (sidebar && sidebar.contains(document.activeElement)) {
            if (menuButton && typeof menuButton.focus === 'function' && document.body.contains(menuButton)) {
                menuButton.focus();
            } else if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
        }

        sidebar?.classList.remove('is-open');
        overlay?.classList.remove('is-visible');
        sidebar?.setAttribute('aria-hidden', 'true');
        sidebar?.setAttribute('inert', '');
    };

    // Automatically hide mobile sidebar immediately if viewport transitions/resizes to desktop width
    const desktopBreakpointQuery = window.matchMedia('(min-width: 1024px)');
    const handleDesktopBreakpointChange = (e) => {
        if (e.matches) {
            closeSidebar();
        }
    };
    if (typeof desktopBreakpointQuery.addEventListener === 'function') {
        desktopBreakpointQuery.addEventListener('change', handleDesktopBreakpointChange);
    } else if (typeof desktopBreakpointQuery.addListener === 'function') {
        desktopBreakpointQuery.addListener(handleDesktopBreakpointChange);
    }

    const updateSidebarActiveState = (targetPage) => {
        document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.sidebarTarget === targetPage);
        });
    };

    // NEW: Centralized Event Delegation for all song cards
    // This prevents multiple listeners from being attached and causing race conditions.
    document.body.addEventListener('click', async (e) => {
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

        // 1. Home sidebar controls and navigation
        if (target.closest('.menu-btn')) {
            const sidebar = document.querySelector('.mobile-sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            sidebar?.removeAttribute('inert');
            sidebar?.classList.add('is-open');
            overlay?.classList.add('is-visible');
            sidebar?.setAttribute('aria-hidden', 'false');
            updateSidebarMusicCounts();
            return;
        }

        if (target.closest('[data-sidebar-close]')) {
            closeSidebar();
            return;
        }

        const playlistMenuBtn = target.closest('.sidebar-playlist-menu');
        if (playlistMenuBtn) {
            e.preventDefault();
            e.stopPropagation();
            const playlistName = playlistMenuBtn.dataset.playlistName || 'Playlist';
            showToast(`Options for ${playlistName}`);
            return;
        }

        const sidebarItem = target.closest('[data-sidebar-target]');
        if (sidebarItem) {
            e.preventDefault();
            const targetPage = sidebarItem.dataset.sidebarTarget;
            const initialTab = sidebarItem.dataset.libraryInitialTab || null;
            if (initialTab) {
                window.__initialLibraryTab = initialTab;
            }
            if (sidebarItem.classList.contains('sidebar-nav-item') && sidebarItem.classList.contains('active') && !initialTab) {
                return;
            }
            if (sidebarItem.classList.contains('sidebar-nav-item')) {
                updateSidebarActiveState(targetPage);
            }
            document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.target === targetPage);
            });
            closeSidebar();

            // If already on library page, directly switch tab with auto-scroll
            if (targetPage.includes('library-mobile.html') && typeof window.switchToLibraryTab === 'function' && document.querySelector('.library-tabs')) {
                window.switchToLibraryTab(initialTab || 'overview');
                return;
            }

            await loadPageContent(targetPage, { pushState: true, initialTab });
            return;
        }

        // Playlist creation trigger
        if (target.closest('.sidebar-add-playlist-btn, #libraryAddBtn, #createPlaylistBtn, [data-action="add-playlist"]')) {
            e.preventDefault();
            openCreatePlaylistModal();
            return;
        }

        // 2. Auth Button (Log In / Log Out)
        if (target.closest('#logoutBtn, .sidebar-logout-item, #sidebarAuthBtn')) {
            e.preventDefault();
            e.stopPropagation();
            closeSidebar();
            const user = auth.currentUser;
            if (user) {
                signOut(auth).then(() => {
                    showToast("Logged out successfully.");
                }).catch(error => {
                    console.error("Logout Error:", error);
                    showToast("Failed to log out. Please try again.");
                });
            } else {
                if (typeof window.navigateToAuthPage === 'function') {
                    window.navigateToAuthPage('login');
                } else {
                    window.location.href = 'auth-mobile.html';
                }
            }
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

        if (!user) {
            showToast("Please log in to save favorite songs.");
            return;
        }

        if (!currentSongData || !btn) {
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
            const favorites = await toggleFavorite(currentSongData);
            updateLikedSongsCount(favorites);
        } catch (error) {
            syncPlayerLikeButtons(wasLiked);
            console.error("Firebase Save Error:", error);
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
    const isSameActiveSong = currentSongData && areSameSongs(currentSongData, { id, audio: audioUrl }) && activeAudio.src;
    window.playPreview(null, audioUrl, title, artist, cover, id, duration, isSameActiveSong ? null : 'search');
};

window.isSongDownloaded = (songId) => {
    if (!songId) return false;
    try {
        const saved = JSON.parse(localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]');
        return Array.isArray(saved) && saved.some(s => String(s.id) === String(songId));
    } catch {
        return false;
    }
};

window.toggleDownloadSong = (song) => {
    const user = auth.currentUser;
    if (!user) {
        showToast("Please log in to download songs for offline listening.");
        return false;
    }

    if (!song || !song.id) {
        showToast("Cannot download song: invalid metadata.");
        return false;
    }

    try {
        const raw = localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]';
        let list = JSON.parse(raw);
        if (!Array.isArray(list)) list = [];

        const index = list.findIndex(s => String(s.id) === String(song.id));
        if (index > -1) {
            list.splice(index, 1);
            localStorage.setItem('downloaded_songs', JSON.stringify(list));
            updateSidebarMusicCounts();
            showToast(`Removed "${song.name || song.title || 'Song'}" from downloads.`);
            window.dispatchEvent(new CustomEvent('downloads-updated', { detail: { list } }));
            return false;
        } else {
            list.unshift({
                id: String(song.id),
                name: song.name || song.title || 'Unknown Track',
                artist: song.artist || 'Unknown Artist',
                cover: song.cover || '',
                audio: song.audio || '',
                duration: song.duration || 0,
                downloadedAt: Date.now()
            });
            localStorage.setItem('downloaded_songs', JSON.stringify(list));
            updateSidebarMusicCounts();
            showToast(`Downloaded "${song.name || song.title || 'Song'}" for offline listening.`);
            window.dispatchEvent(new CustomEvent('downloads-updated', { detail: { list } }));
            return true;
        }
    } catch (e) {
        console.error("Error toggling download:", e);
        showToast("Failed to update download.");
        return false;
    }
};

    /**
     * Function to play/pause audio
     */
    window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null) => {
        if (!audioUrl) {
            return;
        }

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
        const isSameSong = Boolean(wasSameSong && activeAudio && activeAudio.src);

        // If btn is null (called from Up Next/Next/Prev/Library/Search), try to find the button in the DOM to sync the UI
        if (!btn) {
            const activeEl = getSongElements(targetSong).find(element => element.classList.contains('is-active-song')) ||
                             getSongElements(targetSong)[0];
            btn = activeEl?.querySelector('.play-overlay');
        }

        // Toggle Play/Pause logic for the same song FIRST (never wipe or re-shuffle queue on same song)
        if (isSameSong) {
            if (!activeAudio.paused) {
                activeAudio.pause();
            } else {
                try {
                    // If the song has ended, reset to the beginning before replaying (Important for Repeat)
                    if (activeAudio.ended) activeAudio.currentTime = 0;
                    if (btn) btn.classList.add('btn-loading');
                    document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));
                    await activeAudio.play();
                } catch (e) {
                    console.error("Resume error:", e);
                } finally {
                    if (btn) btn.classList.remove('btn-loading');
                    document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
                }
            }
            return;
        }

        // Only update the playlist if a context is given and it's a NEW song
        if (context) {
            let baseQueue = [];
            if (context === 'trending' || context === 'new') {
                const masterPool = [...trendingPlaylist, ...newReleasesPlaylist];
                baseQueue = Array.from(new Map(masterPool.map(s => [s.id, s])).values());
            } else if (context === 'search') {
                baseQueue = [...searchPlaylist]; // Use a copy to keep the current queue stable
            } else if (context === 'popular') {
                baseQueue = [...popularPlaylist]; // Playlist dari Popular Searches
            } else if (context === 'local') {
                // [FIX] When playing from the Indonesian grid, the playlist context should be the songs
                // from that specific grid, not the entire local song library.
                baseQueue = [...indonesianGridPlaylist]; // [FIX] Use indonesianGridPlaylist for 'local' context
            } else if (context.startsWith('artist-')) { // [NEW] Handle artist page context
                // Use the songs currently displayed on the artist's page
                baseQueue = [...artistPageCurrentSongs]; // [FIX] Use artistPageCurrentSongs for 'artist-' context
            } else if (context === 'library') {
                const libSongs = typeof window.getLibraryPlaylist === 'function' ? window.getLibraryPlaylist() : [];
                baseQueue = Array.isArray(libSongs) ? [...libSongs] : [];
            }

            if (baseQueue.length === 0) {
                baseQueue = [targetSong];
            }

            // [NEW] Store the original, unshuffled order every time a new context is set
            unshuffledPlaylist = [...baseQueue];

            const queueState = setContextPlaylist(baseQueue, songId);
            currentPlaylist = queueState.playlist;
            currentSongIndex = queueState.currentIndex;
            currentSongData = queueState.currentSong || targetSong;
        } else {
            if (!currentPlaylist.some(s => areSameSongs(s, targetSong))) {
                currentPlaylist = [targetSong];
                unshuffledPlaylist = [targetSong];
                currentSongIndex = 0;
                currentSongData = targetSong;
                syncQueueState(currentPlaylist, currentSongData, currentSongIndex);
            }
        }

        // Playing a New Song
        currentSongData = targetSong;
        window.__currentSongData = currentSongData;
        recordRecentlyPlayedSong(currentSongData);

        // Set the song index in the newly created/shuffled playlist
        // This is very important so that the Next/Prev buttons know their relative position
        currentSongIndex = currentPlaylist.findIndex(s => areSameSongs(s, targetSong));
        if (currentSongIndex === -1 && currentPlaylist.length > 0) {
            currentPlaylist.unshift(targetSong);
            currentSongIndex = 0;
        }
        syncQueueState(currentPlaylist, currentSongData, currentSongIndex);

        // Render the list of next songs instantly (don't wait for the song to load)
        renderUpNext();

        // Sync active song class across all elements
        syncActiveSongUI();

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
            checkLikedStatus(songId);

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

        const photoPathParts = artist.photo ? artist.photo.split('/') : [];
        const elemenIdx = photoPathParts.indexOf('Elemen');
        const artistFolderName = elemenIdx !== -1 && photoPathParts[elemenIdx + 1] ? decodeURIComponent(photoPathParts[elemenIdx + 1]) : artist.name;

        // Filter songs by checking if their audio path is within the artist's specific folder.
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
        const isActive = areSameSongs(song, currentSongData);
        const safeName = song.name.replace(/'/g, "\\'");
        const safeArtist = song.artist.replace(/'/g, "\\'");

        return `
        <div class="song-card ${isActive ? 'is-active-song' : ''} ${isActive && activeAudio.paused ? 'is-paused' : ''}" 
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
        const isActive = areSameSongs(song, currentSongData);
        const safeName = song.name.replace(/'/g, "\\'");
        const safeArtist = song.artist.replace(/'/g, "\\'");

        return `
        <div class="artist-song-list-item ${isActive ? 'is-active-song' : ''} ${isActive && activeAudio.paused ? 'is-paused' : ''}" 
            data-id="${song.id}" data-audio="${song.audio}"
            onclick="playPreview(null, '${song.audio}', '${safeName}', '${safeArtist}', '${song.cover}', '${song.id}', ${song.duration}, '${context}')">
            <div class="item-left">
                <img src="${song.cover}" class="item-cover" alt="${song.name}">
                <div class="artist-song-play-icon" aria-hidden="true">
                    ${isActive && !activeAudio.paused ? PAUSE_ICON : PLAY_ICON}
                </div>
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
        syncActiveSongUI();
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
            grid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem; padding-left: var(--mobile-horizontal-padding); text-align: center; width: 100%;">${emptyMessage}</p>`;
        } else {
            grid.innerHTML = items.map(item => itemRenderer(item, context)).join('');
            syncActiveSongUI();
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
            updateSidebarActiveState(targetPage);
            await loadPageContent(targetPage, { pushState: true });
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

        updateGreeting();
        updateSidebarMusicCounts();
    };

    const initializeGuestUI = () => {
        if (sidebarPlaylistsUnsubscribe) {
            sidebarPlaylistsUnsubscribe();
            sidebarPlaylistsUnsubscribe = null;
        }
        renderSidebarPlaylists([]);

        const avatarEl = document.getElementById('sidebarUserAvatar');
        if (avatarEl) {
            avatarEl.src = `https://ui-avatars.com/api/?name=Guest&background=1e293b&color=94a3b8&bold=true`;
        }
        const sidebarName = document.getElementById('sidebarUserName');
        const sidebarEmail = document.getElementById('sidebarUserEmail');
        if (sidebarName) sidebarName.textContent = 'Guest';
        if (sidebarEmail) sidebarEmail.textContent = 'Sign in for full access';

        const proBadge = document.getElementById('sidebarProBadge');
        if (proBadge) proBadge.classList.add('hidden');

        greetingName = 'Guest';
        lastGreetingHour = -1;
        updateGreeting();

        updateLikedSongsCount([]);
        updateSidebarMusicCounts();

        const notificationBadge = document.getElementById('notificationBadge');
        if (notificationBadge) notificationBadge.classList.add('hidden');

        const authBtnText = document.getElementById('sidebarAuthText');
        if (authBtnText) authBtnText.textContent = 'Log In / Sign Up';
    };

    /**
     * [NEW] Updates all user-specific UI elements like avatar and name.
     * @param {object} user - The Firebase user object.
     */
    const initializeUserUI = (user) => {
        if (!user) {
            initializeGuestUI();
            return;
        }

        if (sidebarPlaylistsUnsubscribe) {
            sidebarPlaylistsUnsubscribe();
            sidebarPlaylistsUnsubscribe = null;
        }
        sidebarPlaylistsUnsubscribe = subscribeUserPlaylists(user.uid, (playlists) => {
            renderSidebarPlaylists(playlists);
        });

        updateUserAvatar(user, document.getElementById('sidebarUserAvatar'));

        const sidebarName = document.getElementById('sidebarUserName');
        const sidebarEmail = document.getElementById('sidebarUserEmail');
        const proBadge = document.getElementById('sidebarProBadge');

        greetingName = user.displayName || user.email?.split('@')[0] || 'User';
        lastGreetingHour = -1;
        updateGreeting();
        if (sidebarName) sidebarName.textContent = user.displayName || user.email?.split('@')[0] || 'User';
        if (sidebarEmail) sidebarEmail.textContent = user.email || '';
        if (proBadge) proBadge.classList.remove('hidden');

        updateSidebarMusicCounts();

        const authBtnText = document.getElementById('sidebarAuthText');
        if (authBtnText) authBtnText.textContent = 'Log Out';
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

    const getAppBasePath = () => '';

    const updateAppUrl = (path, title, state = {}, shouldPushState = true) => {
        if (title) document.title = title;
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const fullCleanPath = cleanPath;
        const currentState = { ...state, path: fullCleanPath };
        
        try {
            if (shouldPushState) {
                if (window.location.pathname !== fullCleanPath) {
                    window.history.pushState(currentState, title || document.title, fullCleanPath);
                }
            } else {
                window.history.replaceState(currentState, title || document.title, fullCleanPath);
            }
        } catch (e) {
            console.warn("Could not update history state:", e);
        }
    };

    const updateBottomNavActive = (targetPage) => {
        document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetPage);
        });
    };

    /**
     * [AUTO-HASH] Base62 22-Character Artist ID Generator
     * Menghasilkan ID 22 karakter Base62 secara matematis dan permanen
     * untuk artis apa pun (baik lokal sekarang maupun ribuan artis baru di masa depan)
     * tanpa perlu mendaftarkan nama artis secara manual di JavaScript.
     */
    const getArtistUniqueId = (artist) => {
        if (!artist) return '';
        // Jika data artis sudah memiliki ID 22 karakter Base62, gunakan langsung
        const rawId = String(artist.id || '').trim();
        if (/^[0-9a-zA-Z]{22}$/.test(rawId)) {
            return rawId;
        }

        // Buat seed unik berdasarkan nama atau ID artis
        const key = String(artist.name || artist.id || '').trim().toLowerCase();
        if (!key) return '';

        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        
        // FNV-1a 32-bit Hash
        let hash = 2166136261;
        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        // Deterministic Pseudo-Random Generator (LCG) dengan unsigned 32-bit
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

    const resolveAndNavigateToArtist = async (artistIdOrSlug, shouldPushState = true) => {
        if (!artistIdOrSlug) return;
        const queryId = decodeURIComponent(artistIdOrSlug).trim();
        const lowerQuery = queryId.toLowerCase();

        // 1. Cari di daftar artis lokal yang sedang aktif (cocokkan Hash 22-char, ID asli, atau Nama)
        let matchedArtist = indonesianArtistsPlaylist.find(a => {
            const uniqueId = getArtistUniqueId(a);
            const aId = String(a.id || '').toLowerCase();
            const aName = (a.name || '').toLowerCase();
            const aSlug = aName.replace(/\s+/g, '-');
            return uniqueId === queryId || aId === lowerQuery || aSlug === lowerQuery || aName === lowerQuery;
        });

        // 2. Jika belum ketemu (misal data lokal masih loading), cari di katalog featured songs
        if (!matchedArtist) {
            const localFeatured = getFeaturedLocalSongs();
            const songMatch = localFeatured.find(s => {
                const tempArtist = { id: s.artist.toLowerCase().replace(/\s+/g, '-'), name: s.artist };
                const uniqueId = getArtistUniqueId(tempArtist);
                const sArtistLower = (s.artist || '').toLowerCase();
                const sArtistSlug = sArtistLower.replace(/\s+/g, '-');
                return uniqueId === queryId || sArtistSlug === lowerQuery || sArtistLower === lowerQuery;
            });
            if (songMatch) {
                matchedArtist = {
                    id: songMatch.artist.toLowerCase().replace(/\s+/g, '-'),
                    name: songMatch.artist,
                    photo: songMatch.cover
                };
            }
        }

        // 3. Jika artis dari Jamendo API
        if (!matchedArtist) {
            try {
                if (!isNaN(parseInt(queryId))) {
                    const tracks = await getArtistCatalog(queryId, '');
                    if (tracks && tracks.length > 0) {
                        matchedArtist = {
                            id: queryId,
                            name: tracks[0].artist || 'Artist',
                            photo: tracks[0].cover || ''
                        };
                    }
                } else {
                    const results = await searchArtistsByName(queryId, 1);
                    if (results && results.length > 0) {
                        matchedArtist = {
                            id: results[0].id,
                            name: results[0].name,
                            photo: results[0].image
                        };
                    }
                }
            } catch (err) {
                console.warn("Could not resolve artist from API:", err);
            }
        }

        // 4. Fallback object jika URL tidak ditemukan di katalog
        if (!matchedArtist) {
            const formattedName = queryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            matchedArtist = {
                id: queryId,
                name: formattedName,
                photo: ''
            };
        }

        navigateToArtistPage(matchedArtist, shouldPushState);
    };

    const handleRoutePath = async (rawPath, state = null, shouldPushState = true) => {
        let cleanPath = rawPath || '/';
        if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
        cleanPath = cleanPath.replace(/\/(index|home-mobile|home-desktop)\.html$/, '');
        if (!cleanPath) cleanPath = '/';

        if (cleanPath.startsWith('/artist/')) {
            const artistIdOrSlug = cleanPath.replace('/artist/', '').split(/[?#]/)[0];
            if (state && state.artist) {
                navigateToArtistPage(state.artist, shouldPushState);
            } else {
                await resolveAndNavigateToArtist(artistIdOrSlug, shouldPushState);
            }
        } else if (cleanPath === '/search' || cleanPath.startsWith('/search')) {
            updateSidebarActiveState('search-mobile.html');
            updateBottomNavActive('search-mobile.html');
            await loadPageContent('search-mobile.html', {
                pushState: shouldPushState,
                route: '/search',
                title: 'Search | Spotiwind',
                state: { route: 'search' }
            });
        } else if (cleanPath === '/library' || cleanPath.startsWith('/library')) {
            const urlParams = new URLSearchParams(window.location.search);
            const queryTab = urlParams.get('tab');
            const targetTab = (state && state.initialTab) || queryTab || window.__initialLibraryTab || 'overview';
            updateSidebarActiveState('library-mobile.html');
            updateBottomNavActive('library-mobile.html');
            await loadPageContent('library-mobile.html', {
                pushState: shouldPushState,
                route: '/library',
                title: 'Library | Spotiwind',
                initialTab: targetTab,
                state: { route: 'library', initialTab: targetTab }
            });
        } else if (cleanPath === '/radio') {
            updateSidebarActiveState('radio-mobile.html');
            updateBottomNavActive('radio-mobile.html');
            await loadPageContent('radio-mobile.html', {
                pushState: shouldPushState,
                route: '/radio',
                title: 'Radio | Spotiwind',
                state: { route: 'radio' }
            });
        } else if (cleanPath === '/account') {
            updateSidebarActiveState('account-mobile.html');
            updateBottomNavActive('account-mobile.html');
            await loadPageContent('account-mobile.html', {
                pushState: shouldPushState,
                route: '/account',
                title: 'Account | Spotiwind',
                state: { route: 'account' }
            });
        } else if (cleanPath === '/notifications') {
            navigateToNotificationPage(shouldPushState);
        } else if (cleanPath === '/login' || cleanPath === '/register' || cleanPath === '/auth') {
            const isRegister = cleanPath === '/register';
            await loadPageContent('auth-mobile.html', {
                pushState: shouldPushState,
                route: isRegister ? '/register' : '/login',
                title: isRegister ? 'Register | Spotiwind' : 'Login | Spotiwind',
                initialTab: isRegister ? 'register' : 'login',
                state: { route: isRegister ? 'register' : 'login' }
            });
        } else {
            // Default: Home
            updateSidebarActiveState('home-mobile.html');
            updateBottomNavActive('home-mobile.html');
            await loadPageContent('home-mobile.html', {
                pushState: shouldPushState,
                route: '/',
                title: 'Spotiwind - Feel The Music, Ride The Wind',
                state: { route: 'home' }
            });
        }
    };

    const loadPageContent = async (page, options = {}) => {
        const contentContainer = document.querySelector('.app-container');
        if (!contentContainer) return;
        const navigationId = ++pageLoadSequence;
        updateSidebarActiveState(page);

        const {
            pushState = true,
            route = null,
            title = null,
            state = null
        } = (typeof options === 'object' && options !== null) ? options : {};

        // Helper to determine route & title
        let targetRoute = route;
        let targetTitle = title;
        if (!targetRoute) {
            if (page === 'home-mobile.html' || page === 'mobile.html') {
                targetRoute = '/';
                targetTitle = 'Spotiwind - Feel The Music, Ride The Wind';
            } else if (page.includes('search-mobile.html')) {
                targetRoute = '/search';
                targetTitle = 'Search | Spotiwind';
            } else if (page.includes('library-mobile.html')) {
                targetRoute = '/library';
                targetTitle = 'Library | Spotiwind';
            } else if (page.includes('notifications-mobile.html')) {
                targetRoute = '/notifications';
                targetTitle = 'Notifications | Spotiwind';
            } else if (page.includes('radio-mobile.html')) {
                targetRoute = '/radio';
                targetTitle = 'Radio | Spotiwind';
            } else if (page.includes('account-mobile.html')) {
                targetRoute = '/account';
                targetTitle = 'Account | Spotiwind';
            } else if (page.includes('auth-mobile.html')) {
                const initialTab = options.initialTab || 'login';
                targetRoute = initialTab === 'register' ? '/register' : '/login';
                targetTitle = initialTab === 'register' ? 'Register | Spotiwind' : 'Login | Spotiwind';
            } else if (page.includes('artist-mobile.html') && artistDataForPageLoad) {
                const artistUniqueId = getArtistUniqueId(artistDataForPageLoad);
                targetRoute = `/artist/${artistUniqueId}`;
                targetTitle = `${artistDataForPageLoad.name} | Spotiwind`;
            }
        }

        if (targetRoute) {
            updateAppUrl(targetRoute, targetTitle, state || { page, route: targetRoute }, pushState);
        }

        // [FIX] Logika baru untuk navigasi kembali ke Home
        if (page === 'home-mobile.html' || page === 'mobile.html') {
            document.body.classList.remove('is-auth-view');
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
            if (searchPageStyleLink && searchPageStyleLink.parentNode) {
                searchPageStyleLink.parentNode.removeChild(searchPageStyleLink);
                searchPageStyleLink = null;
            }
            if (notificationPageStyleLink && notificationPageStyleLink.parentNode) {
                notificationPageStyleLink.parentNode.removeChild(notificationPageStyleLink);
                notificationPageStyleLink = null;
            }
            if (artistPageStyleLink && artistPageStyleLink.parentNode) {
                artistPageStyleLink.parentNode.removeChild(artistPageStyleLink);
                artistPageStyleLink = null;
            }
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
            if (authPageStyleLink && authPageStyleLink.parentNode) {
                authPageStyleLink.parentNode.removeChild(authPageStyleLink);
                authPageStyleLink = null;
            }

            if (!initialHomeContent) {
                try {
                    const response = await fetch(`${window.location.origin}/frontend/src/pages/home-mobile.html`);
                    if (response.ok) {
                        const text = await response.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        const fetchedContainer = doc.querySelector('.app-container');
                        if (fetchedContainer) {
                            initialHomeContent = fetchedContainer.innerHTML;
                        }
                    }
                } catch (e) {
                    console.warn("Could not fetch home template:", e);
                }
            }

            if (initialHomeContent) {
                contentContainer.innerHTML = initialHomeContent;
                document.documentElement.scrollTop = homeScrollPosition;

                initializeSkeletons();
                initializeData();
                initializeHomeContent();

                const user = auth.currentUser;
                if (user) {
                    initializeUserUI(user);
                    setupUnreadNotificationsListener(user.uid);
                }

                const notificationBtn = document.getElementById('notificationBtn');
                if (notificationBtn) {
                    notificationBtn.addEventListener('click', () => navigateToNotificationPage(true));
                }
                
                contentContainer.style.opacity = '1';
                currentPageUrl = 'home-mobile.html';
            }
            return;
        }

        if (!initialHomeContent && contentContainer && (previousPageUrl === 'home-mobile.html' || !previousPageUrl)) {
            initialHomeContent = contentContainer.innerHTML;
        }

        // [FIX] Capture the current active page's URL before navigating away.
        const currentActiveNav = document.querySelector('.mobile-bottom-nav .nav-item.active');
        if (currentPageUrl && currentPageUrl !== page && !page.includes('auth-mobile.html')) {
            previousPageUrl = currentPageUrl;
        } else if (currentActiveNav && currentActiveNav.dataset.target) {
            previousPageUrl = currentActiveNav.dataset.target;
        }
        currentPageUrl = page;
        closeSidebar();

        try {
            // [FIX] Start the fade-out transition immediately to hide old content and prevent flicker.
            contentContainer.style.opacity = '0';
            await new Promise(res => setTimeout(res, 200)); // Wait for fade-out animation to complete.

            // Muat konten halaman parsial dari path yang diberikan secara aman
            const pageFileName = page.includes('/') ? page.split('/').pop() : page;
            const pageFetchUrl = `${window.location.origin}/frontend/src/pages/${pageFileName}`;
            const response = await fetch(pageFetchUrl);
            if (!response.ok) throw new Error(`Could not load ${page}`);
            const text = await response.text();
            
            // Gunakan DOMParser untuk mengekstrak konten yang kita butuhkan
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            // [FIX] Ambil konten dari body, bukan dari .app-container yang tidak ada di file parsial.
            // Ini membuat fungsi lebih fleksibel untuk memuat halaman parsial.
            const newContent = doc.body.innerHTML;

            if (typeof newContent === 'string') {
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

                // [NEW] Dynamically load active page CSS using absolute URL BEFORE inserting HTML
                const cssBase = `${window.location.origin}/frontend/src/assets/css/`;
                if (page.includes('search-mobile.html')) {
                    searchPageStyleLink = await loadStylesheet(
                        `${cssBase}search-mobile.css`,
                        searchPageStyleLink
                    );
                } else if (page.includes('notifications-mobile.html')) {
                    notificationPageStyleLink = await loadStylesheet(
                        `${cssBase}notifications-mobile.css`,
                        notificationPageStyleLink
                    );
                } else if (page.includes('artist-mobile.html')) {
                    artistPageStyleLink = await loadStylesheet(
                        `${cssBase}artist-mobile.css`,
                        artistPageStyleLink
                    );
                } else if (page.includes('library-mobile.html')) {
                    libraryPageStyleLink = await loadStylesheet(
                        `${cssBase}library-mobile.css`,
                        libraryPageStyleLink
                    );
                } else if (page.includes('account-mobile.html')) {
                    accountPageStyleLink = await loadStylesheet(
                        `${cssBase}account-mobile.css`,
                        accountPageStyleLink
                    );
                } else if (page.includes('radio-mobile.html')) {
                    radioPageStyleLink = await loadStylesheet(
                        `${cssBase}radio-mobile.css`,
                        radioPageStyleLink
                    );
                } else if (page.includes('auth-mobile.html')) {
                    authPageStyleLink = await loadStylesheet(
                        `${cssBase}auth-mobile.css`,
                        authPageStyleLink
                    );
                }

                // [FIX] Clean up all inactive subpage stylesheets to avoid style leaking
                if (!page.includes('search-mobile.html') && searchPageStyleLink && searchPageStyleLink.parentNode) {
                    searchPageStyleLink.parentNode.removeChild(searchPageStyleLink);
                    searchPageStyleLink = null;
                }
                if (!page.includes('notifications-mobile.html') && notificationPageStyleLink && notificationPageStyleLink.parentNode) {
                    notificationPageStyleLink.parentNode.removeChild(notificationPageStyleLink);
                    notificationPageStyleLink = null;
                }
                if (!page.includes('artist-mobile.html') && artistPageStyleLink && artistPageStyleLink.parentNode) {
                    artistPageStyleLink.parentNode.removeChild(artistPageStyleLink);
                    artistPageStyleLink = null;
                }
                if (!page.includes('library-mobile.html') && libraryPageStyleLink && libraryPageStyleLink.parentNode) {
                    libraryPageStyleLink.parentNode.removeChild(libraryPageStyleLink);
                    libraryPageStyleLink = null;
                }
                if (!page.includes('account-mobile.html') && accountPageStyleLink && accountPageStyleLink.parentNode) {
                    accountPageStyleLink.parentNode.removeChild(accountPageStyleLink);
                    accountPageStyleLink = null;
                }
                if (!page.includes('radio-mobile.html') && radioPageStyleLink && radioPageStyleLink.parentNode) {
                    radioPageStyleLink.parentNode.removeChild(radioPageStyleLink);
                    radioPageStyleLink = null;
                }
                if (!page.includes('auth-mobile.html') && authPageStyleLink && authPageStyleLink.parentNode) {
                    authPageStyleLink.parentNode.removeChild(authPageStyleLink);
                    authPageStyleLink = null;
                }

                contentContainer.innerHTML = newContent;

                // [NEW] Seamlessly toggle bottom navigation & player bar visibility on auth page
                if (page.includes('auth-mobile.html')) {
                    document.body.classList.add('is-auth-view');
                } else {
                    document.body.classList.remove('is-auth-view');
                }
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

                // [FIX] Correct if-else-if chain
                if (page.includes('search-mobile.html')) {
                    // Khusus untuk halaman search, kita tidak perlu memuat data trending/top artist,
                    // cukup inisialisasi fungsi search-nya saja.
                    // Fungsi fetchIndonesianSongs tetap dipanggil agar data lagu lokal tersedia untuk pencarian.
                    const searchModule = await import('./search-mobile.js');
                    searchModule.initSearchPage({
                        debounce,
                        activeAudio,
                        getCurrentSongData: () => currentSongData,
                        getSongs: () => indonesianSongsPlaylist,
                        getArtists: () => indonesianArtistsPlaylist,
                        navigateToArtistPage,
                        setHomeScrollPosition: (value) => { homeScrollPosition = value; },
                        getLastSearchQuery: () => lastSearchQuery,
                        setLastSearchQuery: (value) => { lastSearchQuery = value; },
                        setSearchPlaylist: (value) => { searchPlaylist = value; },
                        setPopularPlaylist: (value) => { popularPlaylist = value; }
                    });
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
                            document.querySelector('.mobile-bottom-nav .nav-item[data-target="home-mobile.html"]')?.classList.add('active');
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
                        const targetTab = options.initialTab || window.__initialLibraryTab || 'overview';
                        window.__initialLibraryTab = null;
                        await initLibraryPage(targetTab);
                        activePageCleanup = libraryModule.cleanupLibraryPage;
                    } else {
                        console.error("initLibraryPage function not found in module.");
                    }
                } else if (page.includes('account-mobile.html')) {
                    const accountModule = await import('./account-mobile.js').catch(err => { console.error("Failed to load account module:", err); return {}; });
                    const { initAccountPage } = accountModule;

                    if (typeof initAccountPage === 'function') {
                        initAccountPage();
                        activePageCleanup = accountModule.cleanupAccountPage;
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
                } else if (page.includes('auth-mobile.html')) {
                    const authModule = await import('./auth-mobile.js').catch(err => { console.error("Failed to load auth module:", err); return {}; });
                    const { initAuthMobilePage, cleanupAuthMobilePage } = authModule;
                    activePageCleanup = cleanupAuthMobilePage;

                    if (typeof initAuthMobilePage === 'function') {
                        initAuthMobilePage({
                            initialTab: options.initialTab || 'login',
                            onBack: async () => {
                                const target = previousPageUrl || 'home-mobile.html';
                                updateSidebarActiveState(target);
                                updateBottomNavActive(target);
                                await loadPageContent(target);
                            },
                            onSuccess: async (user) => {
                                initializeUserUI(user);
                                showToast(`Welcome back, ${user.displayName || user.email?.split('@')[0] || 'User'}!`, 'success');
                                const target = previousPageUrl || 'home-mobile.html';
                                updateSidebarActiveState(target);
                                updateBottomNavActive(target);
                                await loadPageContent(target);
                            }
                        });
                    } else {
                        console.error("initAuthMobilePage function not found in module.");
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

                // Sync active playback indicators on newly loaded page
                setTimeout(() => {
                    if (typeof syncActiveSongUI === 'function') {
                        syncActiveSongUI();
                    }
                }, 80);
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
            notificationBadge.textContent = '';
            notificationBadge.classList.toggle('hidden', unreadCount <= 0);
        }, (error) => {
            console.error("Error fetching unread notification count:", error);
        });
    };

    const navigateToArtistPage = (artist, shouldPushState = true) => {
        if (!artist) return;
        homeScrollPosition = document.documentElement.scrollTop;
        artistDataForPageLoad = artist;

        const artistUniqueId = getArtistUniqueId(artist);
        const cleanPath = `/artist/${artistUniqueId}`;
        const title = `${artist.name} | Spotiwind`;

        loadPageContent('artist-mobile.html', {
            pushState: shouldPushState,
            route: cleanPath,
            title: title,
            state: { route: 'artist', artist }
        });
    };

    /**
     * [NEW] Loads the notification page content dynamically.
     */
    const navigateToNotificationPage = (shouldPushState = true) => {
        // Store current scroll position before navigating
        homeScrollPosition = document.documentElement.scrollTop;
        // Call the main page loader
        loadPageContent('notifications-mobile.html', {
            pushState: shouldPushState,
            route: '/notifications',
            title: 'Notifications | Spotiwind',
            state: { route: 'notifications' }
        });
    };

    /**
     * [NEW] Loads the auth page content dynamically within SPA shell.
     */
    const navigateToAuthPage = (initialTab = 'login', shouldPushState = true) => {
        homeScrollPosition = document.documentElement.scrollTop;
        const isRegister = initialTab === 'register';
        loadPageContent('auth-mobile.html', {
            pushState: shouldPushState,
            route: isRegister ? '/register' : '/login',
            title: isRegister ? 'Register | Spotiwind' : 'Login | Spotiwind',
            initialTab,
            state: { route: isRegister ? 'register' : 'login' }
        });
    };

    window.navigateToAuthPage = navigateToAuthPage;
    window.loadPageContent = loadPageContent;

    // [REFACTOR] Fungsi navigasi sekarang hanya untuk perpindahan antar file utama (desktop/mobile)
    const navigateTo = (url) => { // Fungsi ini tetap berguna untuk redirect ke home-desktop.html
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
            navigateTo('home-desktop.html');
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
        initializeSkeletons,
        syncActiveSongUI,
        getCurrentSongData: () => currentSongData
    }
};

    // Panggil initializeSkeletons sekali saat halaman pertama kali dimuat.
    initializeSkeletons();
    
    // Panggil initializeHomeContent sekali saat halaman pertama kali dimuat.
    initializeHomeContent();

    setInterval(updateGreeting, 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            lastGreetingHour = -1;
            updateGreeting();
        }
    });

    // Event Listeners for mobile player controls
    const togglePlayHandler = async () => {
        if (activeAudio.src && activeAudio.src !== "") {
            try {
                if (activeAudio.paused) await activeAudio.play();
                else activeAudio.pause();
            } catch (err) { console.error("Toggle Play error:", err); }
        } else if (currentPlaylist.length > 0) {
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
        fullPlayer?.classList.add('active');
        document.body.classList.add('full-player-open');
    };

    const closeFullPlayer = () => {
        fullPlayer?.classList.remove('active');
        document.body.classList.remove('full-player-open');
    };

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
                syncQueueState(currentPlaylist, currentSongData, currentSongIndex);
            }
            renderUpNext();
        }
        setPlaybackModes({ shuffle: isShuffle, repeat: isRepeat });
    });

    document.getElementById('fullRepeatBtn')?.addEventListener('click', (e) => {
        isRepeat = !isRepeat;
        if (isRepeat) isShuffle = false;
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
        
        fullProgressTrack.addEventListener('mousedown', startDragging);
        window.addEventListener('mousemove', moveDragging);
        window.addEventListener('mouseup', stopDragging);
        
        fullProgressTrack.addEventListener('click', seek);
    }

    onAuthStateChanged(auth, (user) => {
        // Protection: If opened on Desktop, redirect back to desktop page
        if (window.innerWidth > 768) {
            navigateTo('home-desktop.html');
            return;
        }

        hideLoadingOverlay();

        if (user) {
            initializeUserUI(user);
            loadLikedSongsCount(user.uid);
            setupUnreadNotificationsListener(user.uid);
            setupUserPresence(user);
        } else {
            initializeGuestUI();
            if (unreadNotificationsListener) {
                unreadNotificationsListener();
                unreadNotificationsListener = null;
            }
            if (typeof userPresenceCleanup === 'function') {
                userPresenceCleanup();
            }
            clearFriendPresenceListeners();
        }

        initializeData(); // Always load music data for both guest and authenticated users
    });

        // [ROUTER] Popstate listener for browser Back / Forward buttons
        window.addEventListener('popstate', async (event) => {
            const currentPath = window.location.pathname;
            await handleRoutePath(currentPath, event.state, false);
        });

        // [ROUTER] Handle initial deep link or route stored in sessionStorage
        const pendingRoute = sessionStorage.getItem('spotiwind_target_route');
        if (pendingRoute) {
            sessionStorage.removeItem('spotiwind_target_route');
            handleRoutePath(pendingRoute, null, false);
        } else {
            const currentPath = window.location.pathname;
            const cleanPath = currentPath;
            if (cleanPath && cleanPath !== '/' && !cleanPath.endsWith('.html')) {
                handleRoutePath(cleanPath, null, false);
            } else {
                updateAppUrl('/', 'Spotiwind - Feel The Music, Ride The Wind', { route: 'home' }, false);
            }
        }

        // [FIX] Move listener attachment to the end of DOMContentLoaded
        // to ensure all functions like 'loadNotificationPage' are initialized.
        const notificationBtn = document.getElementById('notificationBtn');
        if (notificationBtn) {
            notificationBtn.addEventListener('click', () => navigateToNotificationPage(true));
        }
});