import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase-config.js";

import { toggleFavorite, isFavoriteSong, getFavoriteSongs } from '../../services/favoriteService.js';
import { subscribeUserPlaylists } from '../../services/libraryService.js';
import { subscribeUserProfile } from '../../services/profileService.js';
import { updateMyActivity as updateActivityRecord } from '../../services/activityService.js';
import { getFollowingIds, subscribeFriendsActivityByIds } from '../../services/activityService.js';
import { watchUserConnection, watchFriendPresence } from '../../services/presenceService.js';
import { subscribeUnreadNotifications } from '../../services/notificationService.js';
import { getArtistCatalog, loadLocalCatalog, getFeaturedLocalSongs, getLocalArtistCatalog, retryCatalogRequest } from '../../services/catalogService.js';
import { searchArtistsByName } from '../../services/jamendoService.js';
import { setContextPlaylist, syncQueueState, setPlaybackModes, nextSong as getNextSong, previousSong as getPreviousSong } from '../../services/playerService.js';
import { downloadMp3ToDevice, getCachedAudioBlobUrl } from '../../services/offlineAudioService.js';
import { recordRecentlyPlayed, subscribeRecentlyPlayed, getRecentlyPlayed } from '../../services/recentlyPlayedService.js';
import { recordTrackPlay, subscribePopularTracks } from '../../services/popularTrackService.js';
import { recordArtistPlay, subscribeTopArtists } from '../../services/topArtistService.js';
import { getMadeForYouMixes } from '../../services/madeForYouService.js';

import { PLAY_ICON, PAUSE_ICON } from '../../constants/icons.js';
import { formatTime, debounce } from '../../utils/formatters.js';
import { areSameSongs, getArtistUniqueId } from '../../utils/audioUtils.js';
import { showToast, createHeartParticles } from '../../utils/domUtils.js';
import { openCreatePlaylistModal, initCreatePlaylistModal } from '../../components/modals/createPlaylistModal.js';
import { openAvatarPreviewModal, initAvatarPreviewModal } from '../../components/modals/avatarPreviewModal.js';
import { renderUpNextQueue, initQueueModal } from '../../components/modals/queueModal.js';
import { isSongDownloaded, toggleDownloadSong, initSongOptionsSheet } from '../../components/sheets/songOptionsSheet.js';
import { openMixDetailModal, closeMixDetailModal, forceCloseMixDetailModal } from '../../components/sheets/mixDetailSheet.js';
import { initPageRouter, loadSubpage, updateAppUrl, updateBottomNavActive, updateSidebarActiveState, setHomeScrollPosition, getHomeScrollPosition, isPageNavigatingOrRestoring, setPageScrollPosition, getPageScrollPosition } from '../../core/pageLoader.js';

// Prevent browser from overriding custom scroll restoration in SPA
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// Expose direct MP3 download globally for the 3-dots option menu
window.downloadMp3ToDevice = downloadMp3ToDevice;

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let trendingPlaylist = []; // Buffer to store the list of popular songs
let madeForYouMixes = []; // Buffer to store the 10 Made for You mixes
let activeMixId = null; // Track the Mix currently playing so only that card stays active
let currentPlaybackContext = null; // Track current playback context (e.g. made-for-you, trending, etc.)
let searchPlaylist = []; // Buffer to store search results
let popularPlaylist = []; // Buffer to store Popular Searches song list for Up Next
let indonesianSongsPlaylist = []; // Buffer for all local songs (for search)
let indonesianArtistsPlaylist = []; // NEW: Buffer for local artists
let indonesianAlbumsPlaylist = []; // NEW: Buffer for local albums
let unshuffledPlaylist = []; // NEW: To store the original order of the playlist
let currentSongIndex = -1;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;
let currentSongData = null; // Stores the currently active song data
let activityUpdateTimeout = null; // For activity update optimization
let lastRecordedActivitySong = '';
let artistPageCurrentSongs = []; // [NEW] Buffer to store songs from the current artist page
let homeScrollPosition = getHomeScrollPosition(); // Stores scroll position of the home page for returning from subpages

const isGenuineHomeView = () => {
    const container = document.querySelector('.app-container');
    if (!container) return false;
    return Boolean(
        container.querySelector('.top-artists-section') ||
        container.querySelector('.made-for-you-section') ||
        container.querySelector('#dailyTrendingGrid') ||
        container.querySelector('.popular-section')
    );
};

const saveCurrentPageScroll = () => {
    if (typeof isPageNavigatingOrRestoring === 'function' && isPageNavigatingOrRestoring()) {
        return;
    }
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollPos < 0) return;

    if (isGenuineHomeView()) {
        homeScrollPosition = scrollPos;
        setPageScrollPosition('home-mobile.html', scrollPos);
    } else if (document.querySelector('.library-tabs')) {
        setPageScrollPosition('library-mobile.html', scrollPos);
    } else if (document.querySelector('#searchInput')) {
        setPageScrollPosition('search-mobile.html', scrollPos);
    } else if (document.querySelector('.windflow-page, .windflow-header, #windflowController')) {
        setPageScrollPosition('windflow-mobile.html', scrollPos);
    }
};

const saveCurrentHomeScroll = saveCurrentPageScroll;

window.addEventListener('scroll', () => {
    saveCurrentPageScroll();
}, { passive: true });

let artistDataForPageLoad = null; // Buffer to pass artist data into artist-mobile module
let lastSearchQuery = ''; // Variable to preserve search input query
let friendActivityListeners = []; // Store listeners so they can be cleared
let currentUserIsPro = false;
let currentUserProfile = null;

let unreadNotificationsListener = null; // [NEW] To store the unsubscribe function for unread notifications
// NEW: Tracking RTDB listeners to avoid duplicates (Sync with Desktop)
const activePresenceListeners = new Map();
let userPresenceCleanup = null;
let sidebarPlaylistsUnsubscribe = null;
let sidebarProfileUnsubscribe = null;
let recentlyPlayedUnsubscribe = null;

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
    recordRecentlyPlayed(song);
    recordTrackPlay(song);
    recordArtistPlay(song);
    updateSidebarMusicCounts();
};

const loadLikedSongsCount = async (uid) => {
    updateLikedSongsCount(await getFavoriteSongs(uid));
    updateSidebarMusicCounts();
};



// Cache friend online status (same as desktop)
const friendOnlineStatus = {};

const isSameSongForContext = (currentSong, targetSong, context = null, contextMixId = null, previousMixId = null) => {
    if (!currentSong || !targetSong) return false;
    const sameSong = areSameSongs(currentSong, targetSong);
    if (!sameSong) return false;

    if (context !== 'made-for-you') {
        return true;
    }

    const baselineMixId = previousMixId ?? activeMixId;

    if (!contextMixId && !baselineMixId) {
        return true;
    }

    if (!contextMixId) {
        return true;
    }

    return String(baselineMixId || contextMixId) === String(contextMixId);
};

const getSongElements = (song) => {
    if (!song) return [];
    const elements = Array.from(document.querySelectorAll('[data-id], [data-song-id], .library-song-item, .popular-search-card, .dropdown-item, .song-card, .artist-song-list-item, .recent-track-row'));
    return elements.filter(element => {
        // Exclude mix cards and mix track rows because they are strictly scoped by activeMixId
        if (element.classList.contains('mix-card') || element.classList.contains('mix-track-row')) {
            return false;
        }
        const id = element.dataset.id || element.dataset.songId || element.dataset.popularId;
        const audio = element.dataset.audio || element.dataset.songAudio || element.querySelector('.play-overlay')?.dataset?.audio;
        const name = element.dataset.name || element.dataset.songName || element.querySelector('.song-name, .library-song-name, .dropdown-song-name, .popular-search-title-row strong, .item-name, .recent-track-name')?.textContent;
        const artist = element.dataset.artist || element.dataset.songArtist || element.querySelector('.song-artist, .library-song-artist, .dropdown-song-artist, .popular-search-info span, .item-artist, .recent-track-artist')?.textContent;
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

    document.querySelectorAll('.play-overlay, .play-pause-btn, .library-song-play-icon, .popular-search-play-icon, .artist-song-play-icon, .mix-track-play-icon, .recent-track-play-icon').forEach(el => {
        if (!isAudioBuffering) {
            el.classList.remove('btn-loading');
        }
        if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
    });

    document.querySelectorAll('.library-song-play-icon, .popular-search-play-icon, .artist-song-play-icon, .mix-track-play-icon, .recent-track-play-icon').forEach(el => {
        el.innerHTML = PLAY_ICON;
    });

    const mixDetailPlayAllBtn = document.getElementById('mixDetailPlayAllBtn');
    if (mixDetailPlayAllBtn) {
        mixDetailPlayAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>`;
    }

    const artistPlayAllBtn = document.getElementById('artistPlayAllBtn');
    if (artistPlayAllBtn) {
        artistPlayAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>`;
    }

    const artistShuffleBtn = document.getElementById('artistShuffleBtn');
    if (artistShuffleBtn) {
        artistShuffleBtn.classList.toggle('is-active', isShuffle);
    }

    const mixDetailShuffleBtn = document.getElementById('mixDetailShuffleBtn');
    if (mixDetailShuffleBtn) {
        mixDetailShuffleBtn.classList.toggle('is-active', isShuffle);
    }

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
            const playIcon = el.querySelector('.library-song-play-icon, .popular-search-play-icon, .artist-song-play-icon, .recent-track-play-icon');
            if (playIcon) {
                playIcon.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
            }
        });

        // [FIX] Only the active mix card should remain highlighted, even if multiple mixes contain the same song
        document.querySelectorAll('.mix-card').forEach(mixCard => {
            const mixId = mixCard.dataset.mixId;
            const isCurrentMix = activeMixId ? String(mixId) === String(activeMixId) : false;
            const mixData = (typeof madeForYouMixes !== 'undefined' ? madeForYouMixes : []).find(m => String(m.id) === String(mixId));
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

        // [NEW] Sync active state for Mix Detail Modal tracklist rows
        document.querySelectorAll('.mix-track-row').forEach(row => {
            const rowSongId = row.dataset.songId;
            const rowAudio = row.dataset.songAudio;
            const rowMixId = row.dataset.mixId;
            const isRowInActiveMix = activeMixId ? String(rowMixId) === String(activeMixId) : false;
            if (isRowInActiveMix && (rowSongId === String(currentSongData.id) || (rowAudio && currentSongData.audio === rowAudio))) {
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

        // [NEW] Sync active state for Artist Page main play/pause button
        if (artistPlayAllBtn && currentSongData) {
            const pageArtistTitle = document.getElementById('artistPageName')?.textContent?.trim() ||
                                    document.querySelector('.artist-hero-name')?.textContent?.trim();
            const currentArtist = currentSongData.artist?.trim();
            const isCurrentArtist = pageArtistTitle && currentArtist && (
                pageArtistTitle.toLowerCase() === currentArtist.toLowerCase() ||
                currentArtist.toLowerCase().includes(pageArtistTitle.toLowerCase()) ||
                pageArtistTitle.toLowerCase().includes(currentArtist.toLowerCase())
            );
            if (isCurrentArtist) {
                artistPlayAllBtn.innerHTML = isPlaying 
                    ? `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
                    : `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
            }
        }
    }
};
window.syncActiveSongUI = syncActiveSongUI;
window.__activeAudio = activeAudio;
window.areSameSongs = areSameSongs;
window.getCurrentSongData = () => currentSongData;
window.__currentSongData = currentSongData;
window.getArtistPageCurrentSongs = () => artistPageCurrentSongs;
window.setArtistPageCurrentSongs = (songs) => { artistPageCurrentSongs = songs; window.__artistPageCurrentSongs = songs; };

/**
 * Toggles global playback shuffle mode and synchronizes all shuffle buttons in the app.
 * If playback is active, instantly re-shuffles the upcoming queue (or restores original track order).
 * @param {boolean|null} forceState - Optional explicit state (true/false) to set
 * @returns {boolean} The new shuffle state
 */
const togglePlaybackShuffle = (forceState = null) => {
    isShuffle = forceState !== null ? Boolean(forceState) : !isShuffle;
    window.__spotiwindIsShuffle = isShuffle;

    // Sync all shuffle buttons currently in the DOM
    document.getElementById('fullShuffleBtn')?.classList.toggle('active', isShuffle);
    document.getElementById('artistShuffleBtn')?.classList.toggle('is-active', isShuffle);
    document.getElementById('mixDetailShuffleBtn')?.classList.toggle('is-active', isShuffle);

    if (isShuffle) {
        isRepeat = false;
        document.getElementById('fullRepeatBtn')?.classList.remove('active');

        const sourcePool = (unshuffledPlaylist && unshuffledPlaylist.length > 1)
            ? unshuffledPlaylist
            : (currentPlaylist && currentPlaylist.length > 1 ? currentPlaylist : (window.__artistPageCurrentSongs || []));

        if (sourcePool.length > 1 && currentSongData) {
            const currentSong = sourcePool.find(s => areSameSongs(s, currentSongData) || String(s.id) === String(currentSongData.id)) || currentSongData;
            let others = sourcePool.filter(s => !areSameSongs(s, currentSongData) && String(s.id) !== String(currentSongData.id));

            for (let i = others.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [others[i], others[j]] = [others[j], others[i]];
            }

            currentPlaylist = [currentSong, ...others];
            currentSongIndex = 0;
            syncQueueState(currentPlaylist, currentSongData, currentSongIndex);
            window.__spotiwindCurrentPlaylist = currentPlaylist;
            window.__spotiwindCurrentIndex = currentSongIndex;
            window.__spotiwindCurrentSong = currentSongData;
            window.currentPlaylist = currentPlaylist;
            window.currentSongIndex = currentSongIndex;
        }
        renderUpNextQueue('upNextList');
        showToast('Shuffle diaktifkan');
    } else {
        const sourcePool = (unshuffledPlaylist && unshuffledPlaylist.length > 1)
            ? unshuffledPlaylist
            : (window.__artistPageCurrentSongs || []);

        if (sourcePool.length > 1 && currentSongData) {
            currentPlaylist = [...sourcePool];
            currentSongIndex = currentPlaylist.findIndex(s => areSameSongs(s, currentSongData) || String(s.id) === String(currentSongData.id));
            if (currentSongIndex === -1) currentSongIndex = 0;
            syncQueueState(currentPlaylist, currentSongData, currentSongIndex);
            window.__spotiwindCurrentPlaylist = currentPlaylist;
            window.__spotiwindCurrentIndex = currentSongIndex;
            window.__spotiwindCurrentSong = currentSongData;
            window.currentPlaylist = currentPlaylist;
            window.currentSongIndex = currentSongIndex;
        }
        renderUpNextQueue('upNextList');
        showToast('Shuffle dinonaktifkan');
    }

    setPlaybackModes({ shuffle: isShuffle, repeat: isRepeat });
    return isShuffle;
};
window.togglePlaybackShuffle = togglePlaybackShuffle;
window.getPlaybackShuffle = () => isShuffle;
window.setPlaybackShuffle = (val) => togglePlaybackShuffle(val);
window.__spotiwindIsShuffle = isShuffle;

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

let isAudioBuffering = false;

/**
 * Sync play icon loading spinner with audio buffering & loading states
 */
const setAudioLoadingState = (isLoading) => {
    isAudioBuffering = isLoading;
    const playPauseBtns = document.querySelectorAll('.play-pause-btn, #mobileMainPlayBtn, #fullMainPlayBtn');
    if (isLoading) {
        playPauseBtns.forEach(b => b.classList.add('btn-loading'));
        if (currentSongData) {
            const activeElements = getSongElements(currentSongData);
            activeElements.forEach(el => {
                const overlay = el.querySelector('.play-overlay');
                if (overlay) overlay.classList.add('btn-loading');
                const rowIcon = el.querySelector('.library-song-play-icon, .popular-search-play-icon, .artist-song-play-icon, .recent-track-play-icon, .mix-track-play-icon');
                if (rowIcon) rowIcon.classList.add('btn-loading');
            });
            if (activeMixId) {
                document.querySelectorAll(`.mix-card[data-mix-id="${activeMixId}"] .play-overlay`).forEach(o => o.classList.add('btn-loading'));
            }
        }
        if (currentPlayingBtn) {
            currentPlayingBtn.classList.add('btn-loading');
        }
    } else {
        playPauseBtns.forEach(b => b.classList.remove('btn-loading'));
        document.querySelectorAll('.btn-loading').forEach(el => el.classList.remove('btn-loading'));
    }
};

// Global audio loading and buffering listeners
activeAudio.addEventListener('loadstart', () => {
    setAudioLoadingState(true);
});

activeAudio.addEventListener('waiting', () => {
    setAudioLoadingState(true);
});

activeAudio.addEventListener('playing', () => {
    setAudioLoadingState(false);
});

activeAudio.addEventListener('canplay', () => {
    if (!activeAudio.paused) {
        setAudioLoadingState(false);
    }
});

activeAudio.addEventListener('error', () => {
    setAudioLoadingState(false);
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
    setAudioLoadingState(false);
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
    setAudioLoadingState(false);
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
    renderUpNextQueue('upNextList');
};

const triggerSongByIndex = (index) => {
    const song = currentPlaylist[index];
    if (!song) return;

    // Find the specific play-overlay element to avoid overwriting the main container
    const activeEl = getSongElements(song).find(element => element.classList.contains('is-active-song')) ||
                     getSongElements(song)[0];
    const btn = activeEl?.querySelector('.play-overlay');

    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration, currentPlaybackContext, currentPlaylist, activeMixId);
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
 * Universal function to sync all Like buttons across player and page lists
 */
const syncAllLikeButtons = (songId, isLiked) => {
    if (!songId) return;
    const cleanId = String(songId).trim();

    // 1. Sync player like buttons if current song matches
    if (currentSongData && (String(currentSongData.id).trim() === cleanId || areSameSongs(currentSongData, { id: cleanId }))) {
        const mobileLikeBtn = document.getElementById('mobileLoveBtn');
        if (mobileLikeBtn) mobileLikeBtn.classList.toggle('liked', isLiked);
        const fullLikeBtn = document.getElementById('fullLoveBtn');
        if (fullLikeBtn) fullLikeBtn.classList.toggle('liked', isLiked);
    }

    // 2. Sync all song-list like buttons in DOM (Library, Search, etc.)
    document.querySelectorAll(`.like-song-btn[data-song-id="${cleanId}"]`).forEach(btn => {
        btn.classList.toggle('is-liked', isLiked);
        btn.setAttribute('title', isLiked ? 'Unlike song' : 'Like song');
        btn.setAttribute('aria-label', isLiked ? 'Unlike song' : 'Like song');
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
            svg.setAttribute('stroke-width', isLiked ? '0' : '2');
        }
    });
};
window.syncAllLikeButtons = syncAllLikeButtons;

/**
 * Function to sync the Like button status in the player
 */
const syncPlayerLikeButtons = (isLiked) => {
    const mobileLikeBtn = document.getElementById('mobileLoveBtn');
    if (mobileLikeBtn) mobileLikeBtn.classList.toggle('liked', isLiked);
    
    const fullLikeBtn = document.getElementById('fullLoveBtn');
    if (fullLikeBtn) fullLikeBtn.classList.toggle('liked', isLiked);

    if (currentSongData && currentSongData.id) {
        syncAllLikeButtons(currentSongData.id, isLiked);
    }
};
window.syncPlayerLikeButtons = syncPlayerLikeButtons;

// Listen to global favorites updates across modules/pages
window.addEventListener('favorites-updated', (e) => {
    const { songId, isLiked, favorites } = e.detail || {};
    if (favorites && typeof updateLikedSongsCount === 'function') {
        updateLikedSongsCount(favorites);
    }
    if (songId) {
        syncAllLikeButtons(songId, isLiked);
    }
});

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

    initCreatePlaylistModal();
    initSongOptionsSheet();
    initQueueModal();

    initAvatarPreviewModal({
        modalId: 'sidebarAvatarPreviewModal',
        previewImgId: 'sidebarAvatarPreviewImg',
        backBtnId: 'sidebarAvatarPreviewBackBtn',
        editBtnId: 'sidebarAvatarPreviewEditBtn',
        shareBtnId: 'sidebarAvatarPreviewShareBtn'
    });

    const avatarWrapper = document.querySelector('.sidebar-profile-avatar-wrapper');
    avatarWrapper?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAvatarPreviewModal({
            modalId: 'sidebarAvatarPreviewModal',
            previewImgId: 'sidebarAvatarPreviewImg',
            avatarSourceEl: document.getElementById('sidebarUserAvatar'),
            triggerElement: avatarWrapper
        });
    });

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
    window.closeSidebar = closeSidebar;

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



    let activeDetailMix = null;
    const openLocalMixDetail = (mixId) => {
        activeDetailMix = madeForYouMixes.find(m => String(m.id) === String(mixId)) || null;
        openMixDetailModal(mixId, madeForYouMixes);
    };
    window.openMixDetailModal = openLocalMixDetail;
    window.closeMixDetailModal = closeMixDetailModal;

    // NEW: Centralized Event Delegation for all song cards
    // This prevents multiple listeners from being attached and causing race conditions.
    document.body.addEventListener('click', async (e) => {
        // 1. Click on Mix Play Overlay Button -> toggle play mix directly
        const mixPlayOverlay = e.target.closest('.mix-card .play-overlay');
        if (mixPlayOverlay) {
            e.stopPropagation();
            const mixCard = mixPlayOverlay.closest('.mix-card');
            const mixId = mixCard?.dataset.mixId;
            const targetMix = madeForYouMixes.find(m => m.id === mixId);
            if (targetMix && targetMix.songs && targetMix.songs.length > 0) {
                const isMixActive = activeMixId && String(activeMixId) === String(mixId) && currentSongData && targetMix.songs.some(s => areSameSongs(s, currentSongData));
                if (isMixActive) {
                    if (!activeAudio.paused) {
                        activeAudio.pause();
                    } else {
                        activeAudio.play();
                    }
                    syncActiveSongUI();
                    return;
                }
                const firstSong = targetMix.songs[0];
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

        // 2. Click on Mix Card (outside play button) -> Open Mix Detail Modal View
        const mixCard = e.target.closest('.mix-card');
        if (mixCard) {
            e.stopPropagation();
            const mixId = mixCard.dataset.mixId;
            openLocalMixDetail(mixId);
            return;
        }

        // 3. Click on Close Mix Detail Modal
        if (e.target.closest('#closeMixDetailBtn') || e.target.closest('.mix-detail-backdrop')) {
            closeMixDetailModal();
            return;
        }

        // 4. Click on Mix Detail Play All / Pause All Button
        const mixDetailPlayAllBtn = e.target.closest('#mixDetailPlayAllBtn');
        if (mixDetailPlayAllBtn) {
            e.stopPropagation();
            if (!activeDetailMix && madeForYouMixes.length > 0) {
                activeDetailMix = madeForYouMixes.find(m => String(m.id) === String(activeMixId)) || madeForYouMixes[0];
            }
            if (activeDetailMix && activeDetailMix.songs.length > 0) {
                const isMixActive = activeMixId ? String(activeDetailMix.id) === String(activeMixId) : false;
                if (isMixActive) {
                    if (!activeAudio.paused) {
                        activeAudio.pause();
                    } else {
                        activeAudio.play();
                    }
                    syncActiveSongUI();
                    return;
                }
                let playlistToPlay = [...activeDetailMix.songs];
                if (isShuffle) {
                    // Fisher-Yates shuffle algorithm
                    for (let i = playlistToPlay.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [playlistToPlay[i], playlistToPlay[j]] = [playlistToPlay[j], playlistToPlay[i]];
                    }
                }
                const firstSong = playlistToPlay[0];
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
                    activeDetailMix.id
                );
            }
            return;
        }

        // 5. Click on Mix Detail Shuffle Button -> Toggle active status and re-shuffle live queue if playing
        const mixDetailShuffleBtn = e.target.closest('#mixDetailShuffleBtn');
        if (mixDetailShuffleBtn) {
            e.stopPropagation();
            togglePlaybackShuffle();
            return;
        }

        // 6. Click on Mix Tracklist Row in Modal
        const mixTrackRow = e.target.closest('.mix-track-row');
        if (mixTrackRow) {
            e.stopPropagation();
            const rowMixId = mixTrackRow.dataset.mixId || activeMixId;
            const targetMix = (activeDetailMix && String(activeDetailMix.id) === String(rowMixId))
                ? activeDetailMix
                : (madeForYouMixes.find(m => String(m.id) === String(rowMixId)) || activeDetailMix);
            if (targetMix) {
                activeDetailMix = targetMix;
                const songId = mixTrackRow.dataset.songId;
                const song = targetMix.songs.find(s => String(s.id) === String(songId));
                if (song) {
                    window.playPreview(
                        null,
                        song.audio,
                        song.name,
                        song.artist,
                        song.cover,
                        song.id,
                        Number(song.duration) || 0,
                        'made-for-you',
                        targetMix.songs,
                        targetMix.id
                    );
                }
            }
            return;
        }

        const playBtn = e.target.closest('.song-card .play-overlay');
        if (playBtn) {
            // Prevent the click from bubbling up to other potential listeners (like the mini player bar)
            e.stopPropagation();

            const card = playBtn.closest('.song-card');
            const overlay = card ? card.querySelector('.play-overlay') : playBtn;
            const d = overlay.dataset;
            window.playPreview(overlay, d.audio, d.name, d.artist, d.cover, card?.dataset?.id || '', Number(d.duration), d.context);
            return;
        }

        // Click handler for Recently Played Vertical Row Item
        const recentRow = e.target.closest('.recent-track-row');
        if (recentRow) {
            const optionsBtn = e.target.closest('.recent-track-options-btn');
            if (optionsBtn) {
                e.stopPropagation();
                const d = recentRow.dataset;
                initSongOptionsSheet({
                    id: d.id,
                    name: d.name,
                    artist: d.artist,
                    cover: d.cover,
                    audio: d.audio,
                    duration: Number(d.duration) || 0
                });
                return;
            }

            e.stopPropagation();
            const d = recentRow.dataset;
            const playOverlay = recentRow.querySelector('.recent-track-play-icon');
            const recentSongs = homeRecentlyPlayedListCache || [];
            window.playPreview(playOverlay, d.audio, d.name, d.artist, d.cover, d.id, Number(d.duration) || 0, 'recently-played', recentSongs);
            return;
        }

        const seeAllRecentBtn = e.target.closest('#seeAllRecentHomeBtn');
        if (seeAllRecentBtn) {
            e.preventDefault();
            const libraryNav = document.querySelector('.mobile-bottom-nav .nav-item[data-target="library-mobile.html"]');
            if (libraryNav) {
                libraryNav.click();
            } else if (typeof window.navigateToLibraryPage === 'function') {
                window.navigateToLibraryPage('overview');
            }
            return;
        }

        const artistCard = e.target.closest('.artist-card');
        if (artistCard) {
            e.preventDefault();

            // Store current scroll position before navigating to artist page
            // We assume that if an artist card is clicked, we are currently on the home page.
            saveCurrentHomeScroll();

            const { artistId, artistName, artistPhoto } = artistCard.dataset;
            navigateToArtistPage({ id: artistId, name: artistName, photo: artistPhoto });
            return;
        }

        // [REFACTOR] Centralized event delegation for dynamic elements
        const target = e.target;

        if (target.closest('#notificationBtn')) {
            navigateToNotificationPage(true);
            return;
        }

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
                closeSidebar();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
                document.body.scrollTo({ top: 0, behavior: 'smooth' });
                const appContainer = document.querySelector('.app-container');
                if (appContainer && appContainer.scrollTop > 0) {
                    appContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
                return;
            }
            forceCloseMixDetailModal();
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

            saveCurrentHomeScroll();
            await loadPageContent(targetPage, { pushState: true, initialTab });
            return;
        }

        // Library header search button
        if (target.closest('#librarySearchBtn')) {
            e.preventDefault();
            updateSidebarActiveState('search-mobile.html');
            updateBottomNavActive('search-mobile.html');
            await loadPageContent('search-mobile.html', { pushState: true });
            return;
        }

        // Playlist creation trigger
        if (target.closest('.sidebar-add-playlist-btn, #libraryAddBtn, #createPlaylistBtn, [data-action="add-playlist"]')) {
            e.preventDefault();
            closeSidebar();
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
                if (typeof userPresenceCleanup === 'function') {
                    userPresenceCleanup();
                    userPresenceCleanup = null;
                }
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

window.isSongDownloaded = isSongDownloaded;
window.toggleDownloadSong = toggleDownloadSong;

    /**
     * Function to play/pause audio
     */
    window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null, customPlaylist = null, mixId = null) => {
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
        const isSameSong = Boolean(isSameSongForContext(currentSongData, targetSong, context, mixId, activeMixId) && activeAudio && activeAudio.src);

        // If btn is null (called from Up Next/Next/Prev/Library/Search), try to find the button in the DOM to sync the UI
        if (!btn) {
            const activeEl = getSongElements(targetSong).find(element => element.classList.contains('is-active-song')) ||
                             getSongElements(targetSong)[0];
            btn = activeEl?.querySelector('.play-overlay');
        }

        // Toggle Play/Pause logic for the same song FIRST (preserve activeMixId, queue, and playback state)
        if (isSameSong) {
            if (!activeAudio.paused) {
                activeAudio.pause();
            } else {
                try {
                    // If the song has ended, reset to the beginning before replaying (Important for Repeat)
                    if (activeAudio.ended) activeAudio.currentTime = 0;
                    setAudioLoadingState(true);
                    await activeAudio.play();
                } catch (e) {
                    console.error("Resume error:", e);
                    setAudioLoadingState(false);
                }
            }
            return;
        }

        // Only update activeMixId and playback context when playing a DIFFERENT song/mix:
        if (context === 'made-for-you') {
            activeMixId = mixId || activeMixId || (madeForYouMixes.find(m => m.songs && m.songs.some(s => areSameSongs(s, targetSong)))?.id) || null;
            currentPlaybackContext = 'made-for-you';
        } else if (context) {
            activeMixId = null;
            currentPlaybackContext = context;
        } else {
            // Context was not explicitly provided (e.g. from playNext / queue / loop):
            if (activeMixId) {
                const activeMix = madeForYouMixes.find(m => String(m.id) === String(activeMixId));
                if (activeMix && activeMix.songs && activeMix.songs.some(s => areSameSongs(s, targetSong))) {
                    currentPlaybackContext = 'made-for-you';
                } else {
                    activeMixId = null;
                    currentPlaybackContext = null;
                }
            }
        }

        // Build a fresh queue from the selected context so a different Mix cannot inherit the previous playlist state.
        let baseQueue = [];
        if (context) {
            if (context === 'trending') {
                baseQueue = [...trendingPlaylist];
            } else if (context === 'made-for-you') {
                if (Array.isArray(customPlaylist) && customPlaylist.length > 0) {
                    baseQueue = [...customPlaylist];
                } else {
                    const exactMix = mixId ? madeForYouMixes.find(m => String(m.id) === String(mixId)) : null;
                    const matchedMix = exactMix || madeForYouMixes.find(m => m.songs && m.songs.some(s => String(s.id) === String(songId) || (s.audio && s.audio === audioUrl)));
                    baseQueue = matchedMix ? [...matchedMix.songs] : [targetSong];
                }
            } else if (context === 'search') {
                baseQueue = [...searchPlaylist];
            } else if (context === 'popular') {
                baseQueue = [...popularPlaylist];
            } else if (context.startsWith('artist-')) {
                if (Array.isArray(customPlaylist) && customPlaylist.length > 0) {
                    baseQueue = [...customPlaylist];
                } else {
                    baseQueue = [...artistPageCurrentSongs];
                }
            } else if (context === 'library') {
                const libSongs = typeof window.getLibraryPlaylist === 'function' ? window.getLibraryPlaylist() : [];
                baseQueue = Array.isArray(libSongs) ? [...libSongs] : [];
            } else if (context === 'account-recent' || context === 'recently-played' || context === 'recent') {
                if (Array.isArray(customPlaylist) && customPlaylist.length > 0) {
                    baseQueue = [...customPlaylist];
                } else {
                    let allRecentSongs = [];
                    try {
                        const raw = localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]';
                        const list = JSON.parse(raw);
                    allRecentSongs = (Array.isArray(list) ? list : []).map(s => ({
                        id: String(s.id),
                        audio: s.audio,
                        name: s.name || s.title || 'Untitled',
                        artist: s.artist || 'Unknown Artist',
                        cover: s.cover || '../../public/branding/Spotiwind.webp',
                        duration: Number(s.duration) || 0
                    })).filter(s => s.audio);
                } catch {
                    allRecentSongs = [];
                }

                const recentGrid = document.getElementById('accountRecentList');
                if (recentGrid) {
                    const cards = Array.from(recentGrid.querySelectorAll('.song-card'));
                    const gridSongs = cards.map(card => {
                        const ov = card.querySelector('.play-overlay');
                        const dt = ov ? ov.dataset : {};
                        const titleEl = card.querySelector('.song-name');
                        const artistEl = card.querySelector('.song-artist');
                        const imgEl = card.querySelector('.song-cover img');
                        return {
                            id: String(card.dataset.id || dt.id || ''),
                            audio: card.dataset.audio || dt.audio || '',
                            name: dt.name || titleEl?.textContent?.trim() || 'Untitled',
                            artist: dt.artist || artistEl?.textContent?.trim() || 'Unknown Artist',
                            cover: dt.cover || imgEl?.src || '../../public/branding/Spotiwind.webp',
                            duration: Number(dt.duration) || 0
                        };
                    }).filter(s => s.audio);

                    if (gridSongs.length > 0) {
                        const gridIds = new Set(gridSongs.map(s => String(s.id)));
                        const remainingHistorySongs = allRecentSongs.filter(s => !gridIds.has(String(s.id)));
                        allRecentSongs = [...gridSongs, ...remainingHistorySongs];
                    }
                }

                const clickedIdx = allRecentSongs.findIndex(s => areSameSongs(s, targetSong) || String(s.id) === String(songId) || (s.audio && s.audio === targetSong.audio));
                if (clickedIdx !== -1) {
                    baseQueue = [
                        ...allRecentSongs.slice(clickedIdx),
                        ...allRecentSongs.slice(0, clickedIdx)
                    ];
                } else {
                    baseQueue = [targetSong, ...allRecentSongs.filter(s => !areSameSongs(s, targetSong))];
                }
            }
        }

            if (baseQueue.length === 0) {
                baseQueue = [targetSong];
            }

            unshuffledPlaylist = (context && context.startsWith('artist-') && Array.isArray(artistPageCurrentSongs) && artistPageCurrentSongs.length > 0)
                ? [...artistPageCurrentSongs]
                : [...baseQueue];
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
        window.__spotiwindCurrentPlaylist = currentPlaylist;
        window.__spotiwindCurrentIndex = currentSongIndex;
        window.__spotiwindCurrentSong = currentSongData;
        window.__spotiwindContext = currentPlaybackContext;
        window.__spotiwindActiveMixId = activeMixId;

        // Sinkronkan status tombol shuffle di Full Player sesuai context
        if (context && context.startsWith('artist-')) {
            const hasCustomShuffledQueue = Array.isArray(customPlaylist) && customPlaylist.length > 1;
            if (hasCustomShuffledQueue) {
                isShuffle = true;
                document.getElementById('fullShuffleBtn')?.classList.add('active');
                setPlaybackModes({ shuffle: true, repeat: isRepeat });
            }
        }

        // Render the list of next songs instantly (don't wait for the song to load)
        renderUpNextQueue('upNextList');

        // Sync active song class across all elements
        syncActiveSongUI();

        // Reset Mini Progress Bar to 0 instantly before the new song loads
        document.querySelectorAll('.mobile-mini-progress-bar').forEach(thumb => thumb.style.width = '0%');

        currentPlayingBtn = btn;
        setAudioLoadingState(true);

        activeAudio.onerror = null;
        activeAudio.onended = null;

        try {
            // Check if audio is cached in offline CacheStorage for 100% offline playback
            const cachedBlobUrl = await getCachedAudioBlobUrl(audioUrl);
            activeAudio.src = cachedBlobUrl || audioUrl;

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
                setAudioLoadingState(false);
                resetBtnUI(btn);
                currentPlayingBtn = null;
            };

            await activeAudio.play();
            syncActiveSongUI();
            renderUpNextQueue('upNextList');
            updateMyActivity(title);

        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error("Playback error:", error);
            showToast(error.message || "Failed to load song.");
            setAudioLoadingState(false);
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
                    renderTopArtists(artists);
                }

                if (isFirstLoad) {
                    isFirstLoad = false;
                    resolve(true);
                }
            }, 10);
        });
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
                window.__artistPageCurrentSongs = artistSongs;
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

        if (!indonesianSongsPlaylist || indonesianSongsPlaylist.length === 0) {
            await loadLocalCatalogData();
        }

        const photoPathParts = artist.photo ? artist.photo.split('/') : [];
        const musicIdx = photoPathParts.indexOf('music');
        const elemenIdx = photoPathParts.indexOf('Elemen');
        const targetIdx = musicIdx !== -1 ? musicIdx : elemenIdx;
        const artistFolderName = targetIdx !== -1 && photoPathParts[targetIdx + 1] ? decodeURIComponent(photoPathParts[targetIdx + 1]) : artist.name;

        // Filter songs by checking if their audio path is within the artist's specific folder.
        const artistSongs = getLocalArtistCatalog(indonesianSongsPlaylist, artist);

        artistPageCurrentSongs = artistSongs; // Update context for playback
        window.__artistPageCurrentSongs = artistSongs;

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
        const safeName = (song.name || '').replace(/"/g, '&quot;');
        const safeArtist = (song.artist || '').replace(/"/g, '&quot;');

        return `
        <div class="song-card ${isActive ? 'is-active-song' : ''} ${isActive && activeAudio.paused ? 'is-paused' : ''}" 
            data-id="${song.id}" data-audio="${song.audio}">
            <div class="song-cover">
                <img src="${song.cover}" alt="${song.name}" width="160" height="120" style="width:100%; height:100%; object-fit:cover; aspect-ratio:4/3;">
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

        // Jika tidak ada skeleton (misal halaman dipulihkan dari cache snapshot DOM),
        // langsung ganti konten agar tidak menduplikasi kartu di bawah kartu lama
        if (skeletons.length === 0) {
            grid.innerHTML = items.map(item => itemRenderer(item, context)).join('');
            syncActiveSongUI();
            return;
        }

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
     * Function to render one Made for You mix card
     */
    const createMixCardHTML = (mix) => {
        const isCurrentMix = activeMixId ? String(mix.id) === String(activeMixId) : false;
        const matchCurrentSong = isCurrentMix && currentSongData && mix.songs && mix.songs.some(s => areSameSongs(s, currentSongData));
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
                    ${cells.map(src => `<div class="mix-collage-cell"><img src="${src}" alt="" width="80" height="60" loading="lazy"></div>`).join('')}
                </div>`;
        } else {
            coverContent = `<img src="${imgs[0] || '../../public/branding/Spotiwind.webp'}" alt="${mix.title}" width="160" height="120" style="width:100%; height:100%; object-fit:cover; aspect-ratio:4/3;" loading="lazy">`;
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
     * Function to fetch and render Made for You mixes (10 Mix playlists)
     */
    const fetchMadeForYou = async () => {
        const gridSelector = '#madeForYouGrid';
        try {
            const mixes = await getMadeForYouMixes();
            if (!mixes || mixes.length === 0) return false;
            madeForYouMixes = mixes;
            const hasSkeletons = Boolean(document.querySelector(`${gridSelector} .song-card-skeleton`));
            if (hasSkeletons) {
                renderGridProgressively(gridSelector, mixes, createMixCardHTML, '.song-card-skeleton', 'made-for-you');
            } else {
                const grid = document.querySelector(gridSelector);
                if (grid) {
                    grid.innerHTML = mixes.map(mix => createMixCardHTML(mix)).join('');
                    syncActiveSongUI();
                }
            }
            return true;
        } catch (error) {
            console.error("Failed to load Made for You mixes:", error);
            throw error;
        }
    };

    let localCatalogPromise = null;
    /**
     * Load catalog data in background for search and artist pages.
     * Caches the promise (singleton) so callers can await it reliably.
     */
    const loadLocalCatalogData = () => {
        if (!localCatalogPromise) {
            localCatalogPromise = (async () => {
                try {
                    const catalog = await loadLocalCatalog();
                    indonesianArtistsPlaylist = catalog.artists || [];
                    indonesianSongsPlaylist = catalog.songs || [];
                    indonesianAlbumsPlaylist = catalog.albums || [];
                    window.__indonesianArtistsPlaylist = indonesianArtistsPlaylist;
                    return catalog;
                } catch (error) {
                    console.error('Failed to load local song catalog:', error);
                    localCatalogPromise = null;
                    return null;
                }
            })();
        }
        return localCatalogPromise;
    };

    let popularTracksUnsubscribe = null;

    /**
     * Function to fetch popular song data from Firebase Firestore in REAL-TIME
     */
    const fetchTrendingMusic = async () => {
        const gridSelector = '.popular-section .song-grid'; 
        const sectionTitle = document.getElementById('sectionTitle');
        if (sectionTitle) sectionTitle.textContent = "Popular Right Now";

        if (popularTracksUnsubscribe) {
            popularTracksUnsubscribe();
            popularTracksUnsubscribe = null;
        }

        return new Promise((resolve, reject) => {
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
                    trendingPlaylist = [];
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
                    trendingPlaylist = rawSongs;
                    const hasSkeletons = Boolean(grid.querySelector('.song-card-skeleton'));
                    if (isFirstLoad && hasSkeletons) {
                        renderGridProgressively(gridSelector, rawSongs, createSongCardHTML, '.song-card-skeleton', 'trending');
                    } else {
                        // Realtime update atau pemulihan DOM: update grid langsung dan sinkronkan UI
                        grid.innerHTML = rawSongs.map(song => createSongCardHTML(song, 'trending')).join('');
                        syncActiveSongUI();
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
            if (!targetPage) return;

            const isCurrentlyOnArtistPage = Boolean(
                document.querySelector('.artist-page-header, #artistHero, .artist-content-scroll-wrapper') ||
                (typeof window.getCurrentPageUrl === 'function' && window.getCurrentPageUrl()?.includes('artist')) ||
                window.location.pathname.includes('/artist')
            );

            // Jika sedang di halaman artis dan item navigasi bawah yang diklik dalam kondisi aktif:
            // Tidak terjadi apa-apa dan scroll kembali ke atas secara mulus
            if (isCurrentlyOnArtistPage && item.classList.contains('active')) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
                document.body.scrollTo({ top: 0, behavior: 'smooth' });
                const appContainer = document.querySelector('.app-container');
                if (appContainer && appContainer.scrollTop > 0) {
                    appContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
                return;
            }

            // Cek jika sedang membuka mix-detail-modal
            const mixDetailModal = document.getElementById('mixDetailModal');
            const isMixDetailModalOpen = Boolean(
                document.body.classList.contains('mix-detail-open') ||
                (mixDetailModal && !mixDetailModal.classList.contains('hidden'))
            );

            // Jika sedang membuka mix detail modal dan item navigasi bawah yang diklik dalam kondisi aktif:
            // Tidak terjadi apa-apa (modal tidak tertutup/navigasi batal) dan scroll isi modal kembali ke atas secara mulus
            if (isMixDetailModalOpen && item.classList.contains('active')) {
                const scrollable = mixDetailModal?.querySelector('.mix-detail-scrollable');
                if (scrollable) {
                    scrollable.scrollTo({ top: 0, behavior: 'smooth' });
                }
                if (mixDetailModal && mixDetailModal.scrollTop > 0) {
                    mixDetailModal.scrollTo({ top: 0, behavior: 'smooth' });
                }
                return;
            }

            // Cek jika sedang berada di halaman windflow
            const isCurrentlyOnWindflowPage = Boolean(
                document.querySelector('.windflow-page, .windflow-header, #windflowController') ||
                (typeof window.getCurrentPageUrl === 'function' && (window.getCurrentPageUrl()?.includes('windflow') || window.getCurrentPageUrl()?.includes('radio'))) ||
                window.location.pathname.includes('/windflow') ||
                window.location.pathname.includes('/radio')
            );

            // Jika sedang di halaman windflow dan item navigasi bawah yang diklik dalam kondisi aktif:
            // Tidak terjadi apa-apa dan scroll kembali ke atas secara mulus
            if (isCurrentlyOnWindflowPage && item.classList.contains('active')) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
                document.body.scrollTo({ top: 0, behavior: 'smooth' });
                const appContainer = document.querySelector('.app-container');
                if (appContainer && appContainer.scrollTop > 0) {
                    appContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
                setPageScrollPosition('windflow-mobile.html', 0);
                return;
            }

            // Check if we are already viewing the primary content of that tab
            const isAlreadyOnHome = (targetPage === 'home-mobile.html' || targetPage === '/' || targetPage === 'mobile.html') && isGenuineHomeView();
            const isAlreadyOnSearch = targetPage.includes('search') && document.querySelector('.app-container #searchInput');
            const isAlreadyOnLibrary = targetPage.includes('library') && document.querySelector('.app-container .library-tabs');
            const isAlreadyOnWindflow = (targetPage.includes('windflow') || targetPage.includes('radio')) && Boolean(
                document.querySelector('.app-container .windflow-page, .app-container .windflow-header, .app-container #windflowController, .app-container .radio-container, .app-container .windflow-container')
            );
            const isAlreadyOnAccount = targetPage.includes('account') && document.querySelector('.app-container .account-profile-section, .app-container #accountAvatar');

            if (isAlreadyOnHome || isAlreadyOnSearch || isAlreadyOnLibrary || isAlreadyOnWindflow || isAlreadyOnAccount) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
                document.body.scrollTo({ top: 0, behavior: 'smooth' });
                const appContainer = document.querySelector('.app-container');
                if (appContainer && appContainer.scrollTop > 0) {
                    appContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
                if (isAlreadyOnHome) {
                    homeScrollPosition = 0;
                    setPageScrollPosition('home-mobile.html', 0);
                } else if (isAlreadyOnLibrary) {
                    setPageScrollPosition('library-mobile.html', 0);
                } else if (isAlreadyOnSearch) {
                    setPageScrollPosition('search-mobile.html', 0);
                } else if (isAlreadyOnWindflow) {
                    setPageScrollPosition('windflow-mobile.html', 0);
                }
                return;
            }

            // Tutup modal mix detail secara instan saat berpindah halaman
            forceCloseMixDetailModal();

            // Only navigate if a different item is clicked
            document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Store current scroll position if we are navigating away from the home page
            saveCurrentHomeScroll();
            updateSidebarActiveState(targetPage);
            if (typeof window.loadPageContent === 'function') {
                await window.loadPageContent(targetPage, { pushState: true });
            } else {
                await loadSubpage(targetPage, { pushState: true });
            }
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
    const updateGreeting = (force = false) => {
        const greetingBadge = document.getElementById('greetingBadge');
        if (!greetingBadge) return;

        const hour = new Date().getHours();
        if (!force && hour === lastGreetingHour) return;
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
        if (sidebarProfileUnsubscribe) {
            sidebarProfileUnsubscribe();
            sidebarProfileUnsubscribe = null;
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
        const sidebarAvatarWrapper = document.querySelector('.sidebar-profile-avatar-wrapper');
        if (sidebarAvatarWrapper) sidebarAvatarWrapper.classList.remove('is-pro');
        const sidebarProfileContainer = document.querySelector('.sidebar-profile');
        if (sidebarProfileContainer) sidebarProfileContainer.classList.remove('is-pro');
        const mobileSidebar = document.querySelector('.mobile-sidebar');
        if (mobileSidebar) mobileSidebar.classList.remove('is-pro');

        greetingName = 'Guest';
        currentUserProfile = null;
        currentUserIsPro = false;
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

        if (sidebarProfileUnsubscribe) {
            sidebarProfileUnsubscribe();
            sidebarProfileUnsubscribe = null;
        }
        sidebarProfileUnsubscribe = subscribeUserProfile(user.uid, (profile) => {
            currentUserProfile = profile;
            currentUserIsPro = profile?.isPremium === true;
            if (profile?.displayName) {
                greetingName = profile.displayName;
            } else {
                greetingName = user.displayName || user.email?.split('@')[0] || 'User';
            }
            lastGreetingHour = -1;
            updateGreeting(true);
            if (sidebarName) sidebarName.textContent = greetingName;

            const proBadge = document.getElementById('sidebarProBadge');
            const sidebarAvatarWrapper = document.querySelector('.sidebar-profile-avatar-wrapper');
            const sidebarProfileContainer = document.querySelector('.sidebar-profile');
            const mobileSidebar = document.querySelector('.mobile-sidebar');
            if (currentUserIsPro) {
                proBadge?.classList.remove('hidden');
                sidebarAvatarWrapper?.classList.add('is-pro');
                sidebarProfileContainer?.classList.add('is-pro');
                mobileSidebar?.classList.add('is-pro');
            } else {
                proBadge?.classList.add('hidden');
                sidebarAvatarWrapper?.classList.remove('is-pro');
                sidebarProfileContainer?.classList.remove('is-pro');
                mobileSidebar?.classList.remove('is-pro');
            }
        });

        updateUserAvatar(user, document.getElementById('sidebarUserAvatar'));

        const sidebarName = document.getElementById('sidebarUserName');
        const sidebarEmail = document.getElementById('sidebarUserEmail');

        greetingName = user.displayName || user.email?.split('@')[0] || 'User';
        lastGreetingHour = -1;
        updateGreeting(true);
        if (sidebarName) sidebarName.textContent = user.displayName || user.email?.split('@')[0] || 'User';
        if (sidebarEmail) sidebarEmail.textContent = user.email || '';

        updateSidebarMusicCounts();

        const authBtnText = document.getElementById('sidebarAuthText');
        if (authBtnText) authBtnText.textContent = 'Log Out';
    };





    const resolveAndNavigateToArtist = async (artistIdOrSlug, shouldPushState = true, queryName = '') => {
        if (!artistIdOrSlug) return;
        const queryId = decodeURIComponent(artistIdOrSlug).trim();
        const lowerQuery = queryId.toLowerCase();
        const cleanQueryName = decodeURIComponent(queryName || '').trim();
        const lowerQueryName = cleanQueryName.toLowerCase();

        // 0. Pastikan data katalog lokal dimuat sebelum proses pencarian dilakukan
        await loadLocalCatalogData();

        // 1. Cari di daftar artis lokal yang sedang aktif (cocokkan Hash 22-char, ID asli, Nama, atau QueryName)
        let matchedArtist = indonesianArtistsPlaylist.find(a => {
            const uniqueId = getArtistUniqueId(a);
            const aId = String(a.id || '').toLowerCase().trim();
            const aName = String(a.name || '').toLowerCase().trim();
            const aSlug = aName.replace(/\s+/g, '-');

            const matchesId = (uniqueId && uniqueId === queryId) ||
                              (aId && aId === lowerQuery) ||
                              (aSlug && aSlug === lowerQuery) ||
                              (aName && aName === lowerQuery);

            const matchesName = cleanQueryName && (
                aName === lowerQueryName ||
                aSlug === lowerQueryName.replace(/\s+/g, '-') ||
                aId === lowerQueryName.replace(/\s+/g, '-') ||
                (lowerQueryName.length >= 3 && (aName.includes(lowerQueryName) || lowerQueryName.includes(aName)))
            );

            return matchesId || matchesName;
        });

        // 2. Jika belum ketemu, cari di katalog lagu lokal (misal artis lagu kolaborasi atau nama folder)
        if (!matchedArtist && indonesianSongsPlaylist.length > 0) {
            const songMatch = indonesianSongsPlaylist.find(s => {
                const sArtist = String(s.artist || '').trim();
                const sArtistLower = sArtist.toLowerCase();
                const sArtistSlug = sArtistLower.replace(/\s+/g, '-');
                const tempArtist = { id: sArtistSlug, name: sArtist };
                const uniqueId = getArtistUniqueId(tempArtist);

                return (uniqueId && uniqueId === queryId) ||
                       sArtistSlug === lowerQuery ||
                       sArtistLower === lowerQuery ||
                       (cleanQueryName && (sArtistLower === lowerQueryName || sArtistLower.includes(lowerQueryName)));
            });

            if (songMatch) {
                // Cari apakah ada artis terdaftar di artists.json yang cocok dengan kolaborasi ini
                const candidateLocal = indonesianArtistsPlaylist.find(a => {
                    const aName = (a.name || '').toLowerCase().trim();
                    return aName && (songMatch.artist.toLowerCase().includes(aName) || aName.includes(songMatch.artist.toLowerCase()));
                });

                // Path foto resmi artis (bukan cover lagu!)
                let officialPhoto = candidateLocal?.photo || '';
                if (!officialPhoto) {
                    const folderName = songMatch.artist.split('&')[0].trim();
                    officialPhoto = getPublicAssetUrl(`music/${folderName}/Artis/${folderName}.webp`);
                }

                matchedArtist = {
                    id: candidateLocal?.id || songMatch.artist.toLowerCase().replace(/\s+/g, '-'),
                    name: candidateLocal?.name || songMatch.artist,
                    photo: officialPhoto
                };
            }
        }

        // 3. Jika artis dari Jamendo API
        if (!matchedArtist) {
            try {
                if (!isNaN(parseInt(queryId)) && queryId.length <= 10) {
                    const results = await searchArtistsByName(cleanQueryName || queryId, 1);
                    if (results && results.length > 0) {
                        matchedArtist = {
                            id: results[0].id,
                            name: results[0].name,
                            photo: results[0].image || ''
                        };
                    }
                } else if (cleanQueryName) {
                    const results = await searchArtistsByName(cleanQueryName, 1);
                    if (results && results.length > 0) {
                        matchedArtist = {
                            id: results[0].id,
                            name: results[0].name,
                            photo: results[0].image || ''
                        };
                    }
                }
            } catch (err) {
                console.warn("Could not resolve artist from API:", err);
            }
        }

        // 4. Fallback object jika URL tidak ditemukan di katalog
        if (!matchedArtist) {
            const formattedName = cleanQueryName || queryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            matchedArtist = {
                id: queryId,
                name: formattedName,
                photo: '' // Jangan gunakan cover lagu! defaultAvatar akan otomatis dipakai
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
            const urlQuery = (rawPath && rawPath.includes('?')) ? rawPath.split('?')[1] : (window.location.search || '').replace(/^\?/, '');
            const params = new URLSearchParams(urlQuery);
            const queryName = params.get('name') || '';

            if (state && state.artist) {
                navigateToArtistPage(state.artist, shouldPushState);
            } else {
                await resolveAndNavigateToArtist(artistIdOrSlug, shouldPushState, queryName);
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
        } else if (cleanPath === '/windflow' || cleanPath === '/radio') {
            updateSidebarActiveState('windflow-mobile.html');
            updateBottomNavActive('windflow-mobile.html');
            await loadPageContent('windflow-mobile.html', {
                pushState: shouldPushState,
                route: cleanPath === '/radio' ? '/radio' : '/windflow',
                title: 'WindFlow | Spotiwind',
                state: { route: 'windflow' }
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
        forceCloseMixDetailModal();
        const context = {
            searchParams: {
                debounce,
                activeAudio,
                getCurrentSongData: () => currentSongData,
                getSongs: () => currentPlaylist,
                getArtists: () => indonesianArtistsPlaylist,
                getAlbums: () => indonesianAlbumsPlaylist,
                navigateToArtistPage,
                setHomeScrollPosition: (value) => {
                    homeScrollPosition = value;
                    setHomeScrollPosition(value);
                },
                getLastSearchQuery: () => lastSearchQuery,
                setLastSearchQuery: (value) => { lastSearchQuery = value; },
                setSearchPlaylist: (value) => { searchPlaylist = value; },
                setPopularPlaylist: (value) => { popularPlaylist = value; }
            },
            artistData: artistDataForPageLoad,
            onHomeMounted: () => {
                initializeHomeContent();
                syncActiveSongUI();
                initializeData();
                const user = auth.currentUser;
                if (user) {
                    initializeUserUI(user);
                    loadLikedSongsCount(user.uid);
                    renderHomeRecentlyPlayed(true);
                    setupUnreadNotificationsListener(user.uid);
                    setupUserPresence(user);
                } else {
                    initializeGuestUI();
                    renderHomeRecentlyPlayed(true);
                }
                const notificationBtn = document.getElementById('notificationBtn');
                if (notificationBtn) {
                    notificationBtn.addEventListener('click', () => navigateToNotificationPage(true));
                }
            }
        };
        await loadSubpage(page, options, context);
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
        saveCurrentHomeScroll();
        artistDataForPageLoad = artist;

        const artistUniqueId = getArtistUniqueId(artist);
        const cleanPath = `/artist/${artistUniqueId}`;
        const title = `${artist.name} | Spotiwind`;

        if (typeof window.loadPageContent === 'function') {
            window.loadPageContent('artist-mobile.html', {
                pushState: shouldPushState,
                route: cleanPath,
                title: title,
                state: { route: 'artist', artist }
            });
        }
    };

    /**
     * [NEW] Loads the notification page content dynamically.
     */
    const navigateToNotificationPage = (shouldPushState = true) => {
        // Store current scroll position before navigating
        saveCurrentHomeScroll();
        // Call the main page loader
        if (typeof window.loadPageContent === 'function') {
            window.loadPageContent('notifications-mobile.html', {
                pushState: shouldPushState,
                route: '/notifications',
                title: 'Notifications | Spotiwind',
                state: { route: 'notifications' }
            });
        }
    };

    /**
     * [NEW] Loads the auth page content dynamically within SPA shell.
     */
    const navigateToAuthPage = (initialTab = 'login', shouldPushState = true) => {
        saveCurrentHomeScroll();
        const isRegister = initialTab === 'register';
        if (typeof window.loadPageContent === 'function') {
            window.loadPageContent('auth-mobile.html', {
                pushState: shouldPushState,
                route: isRegister ? '/register' : '/login',
                title: isRegister ? 'Register | Spotiwind' : 'Login | Spotiwind',
                initialTab,
                state: { route: isRegister ? 'register' : 'login' }
            });
        }
    };

    window.navigateToAuthPage = navigateToAuthPage;
    window.loadPageContent = loadPageContent;
    window.closeMixDetailModal = closeMixDetailModal;
    window.forceCloseMixDetailModal = forceCloseMixDetailModal;

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
        showSkeletonLoader('.popular-section .song-grid', 'song', 10);
        showSkeletonLoader('.artists-grid', 'artist', 10);
        showSkeletonLoader('#madeForYouGrid', 'song', 10);
    };

    let homeRecentlyPlayedListCache = [];

    /**
     * Render Recently Played songs in vertical layout (Max 3 items)
     */
    const renderHomeRecentlyPlayed = (force = false) => {
        const container = document.getElementById('homeRecentlyPlayedList');
        if (!container) return;

        try {
            const rawSongs = getRecentlyPlayed();
            const validSongs = (Array.isArray(rawSongs) ? rawSongs : [])
                .filter(s => s && (s.id || s.audio) && s.audio)
                .slice(0, 3); // Hanya 3 lagu terbaru sesuai permintaan

            if (validSongs.length === 0) {
                homeRecentlyPlayedListCache = [];
                container.innerHTML = `
                    <div class="recent-empty-state">
                        <div class="recent-empty-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <h3 class="recent-empty-title">No recently played songs</h3>
                        <p class="recent-empty-desc">Songs you play will appear here.</p>
                    </div>
                `;
                return;
            }

            const isSameList = !force && homeRecentlyPlayedListCache.length === validSongs.length &&
                validSongs.every((s, i) => {
                    const cached = homeRecentlyPlayedListCache[i];
                    if (!cached) return false;
                    return String(s.id || s.audio) === String(cached.id || cached.audio);
                });

            if (isSameList && container.querySelector('.recent-track-row')) {
                syncActiveSongUI();
                return;
            }

            homeRecentlyPlayedListCache = [...validSongs];

            const isAudioPlaying = activeAudio && !activeAudio.paused && !activeAudio.ended;

            container.innerHTML = validSongs.map(song => {
                const isActive = areSameSongs(song, currentSongData);
                const isPaused = isActive && activeAudio.paused;
                const safeName = (song.name || song.title || 'Untitled').replace(/"/g, '&quot;');
                const safeArtist = (song.artist || 'Unknown Artist').replace(/"/g, '&quot;');
                const cover = song.cover || '../../public/branding/Spotiwind.webp';
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
                            <img src="${cover}" alt="${safeName}" class="recent-track-cover" width="46" height="46" loading="lazy">
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
                            <button class="recent-track-options-btn" type="button" aria-label="More options for ${safeName}">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                    <circle cx="12" cy="12" r="1.5" />
                                    <circle cx="12" cy="5" r="1.5" />
                                    <circle cx="12" cy="19" r="1.5" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            syncActiveSongUI();
        } catch (e) {
            console.warn("Failed to render home recently played:", e);
        }
    };

    window.addEventListener('recently-played-updated', () => {
        renderHomeRecentlyPlayed();
    }, { passive: true });

    // [FIX] Pindahkan definisi initializeData ke lingkup yang lebih tinggi (global)
    // agar dapat diakses oleh loadPageContent saat memulihkan halaman Home.
    const initializeData = () => {
        // Hapus Promise.all agar setiap grid dapat dirender secara independen.
        // Ini memungkinkan data muncul satu per satu saat sudah siap, tanpa menunggu yang lain.
        fetchWithContinuousRetry(fetchTrendingMusic);
        fetchWithContinuousRetry(fetchTopArtists);
        fetchWithContinuousRetry(fetchMadeForYou);
        renderHomeRecentlyPlayed();
        loadLocalCatalogData(); // Load catalog data in background for search & artist pages
    };

// [NEW] Expose necessary functions to the global scope for modules
window.isCurrentUserPro = () => Boolean(currentUserIsPro);
window.spotiwind = {
    mobile: {
        fetchWithContinuousRetry,
        fetchLocalArtistSongs,
        fetchArtistSongs,
        loadPageContent,
        initializeSkeletons,
        syncActiveSongUI,
        getCurrentSongData: () => currentSongData,
        isCurrentUserPro: () => Boolean(currentUserIsPro)
    }
};

    // Panggil initializeSkeletons sekali saat halaman pertama kali dimuat.
    initializeSkeletons();
    
    // Panggil initializeHomeContent dan initializeData sekali saat halaman pertama kali dimuat.
    initializeHomeContent();
    initializeData();

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
                if (activeAudio.paused) {
                    setAudioLoadingState(true);
                    await activeAudio.play();
                } else {
                    activeAudio.pause();
                }
            } catch (err) {
                console.error("Toggle Play error:", err);
                setAudioLoadingState(false);
            }
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
        const btn = e.currentTarget;
        btn.classList.add('btn-pop');
        setTimeout(() => btn.classList.remove('btn-pop'), 400);
        togglePlaybackShuffle();
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

    // Secondary full player buttons (Lyrics, Queue, Connect to Device)
    document.querySelector('.full-secondary-controls button[title="Lyrics"]')?.addEventListener('click', () => {
        showToast('Fitur lirik lagu akan segera hadir');
    });

    document.querySelector('.full-secondary-controls button[title="Queue"]')?.addEventListener('click', () => {
        const upNextSec = document.querySelector('.full-up-next-section');
        if (upNextSec) {
            upNextSec.scrollIntoView({ behavior: 'smooth' });
        }
    });

    document.querySelector('.full-secondary-controls button[title="Connect to a Device"]')?.addEventListener('click', () => {
        showToast('Hubungkan ke perangkat audio akan segera hadir');
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
            if (recentlyPlayedUnsubscribe) {
                recentlyPlayedUnsubscribe();
            }
            recentlyPlayedUnsubscribe = subscribeRecentlyPlayed(user.uid, () => {
                updateSidebarMusicCounts();
                renderHomeRecentlyPlayed();
            });
            setupUnreadNotificationsListener(user.uid);
            setupUserPresence(user);
        } else {
            initializeGuestUI();
            renderHomeRecentlyPlayed();
            if (recentlyPlayedUnsubscribe) {
                recentlyPlayedUnsubscribe();
                recentlyPlayedUnsubscribe = null;
            }
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

        // [ROUTER] Initialize SPA Router Context
        const routerContext = {
            searchParams: {
                debounce,
                activeAudio,
                getCurrentSongData: () => currentSongData,
                getSongs: () => indonesianSongsPlaylist,
                getArtists: () => indonesianArtistsPlaylist,
                getAlbums: () => indonesianAlbumsPlaylist,
                navigateToArtistPage: (artist) => {
                    navigateToArtistPage(artist, true);
                },
                setHomeScrollPosition: (pos) => {
                    homeScrollPosition = pos;
                    setHomeScrollPosition(pos);
                },
                setPageScrollPosition: (page, pos) => {
                    setPageScrollPosition(page, pos);
                },
                getPageScrollPosition: (page) => getPageScrollPosition(page),
                getLastSearchQuery: () => lastSearchQuery,
                setLastSearchQuery: (query) => { lastSearchQuery = query; },
                setSearchPlaylist: (playlist) => { searchPlaylist = playlist; },
                setPopularPlaylist: (playlist) => { popularPlaylist = playlist; }
            },
            get artistData() {
                return artistDataForPageLoad;
            },
            onHomeMounted: () => {
                // Callback when home is restored (e.g. from sub-page back to home)
                initializeHomeContent();
                syncActiveSongUI();
                initializeData();
                const user = auth.currentUser;
                if (user) {
                    initializeUserUI(user);
                    loadLikedSongsCount(user.uid);
                    renderHomeRecentlyPlayed(true);
                    setupUnreadNotificationsListener(user.uid);
                    setupUserPresence(user);
                } else {
                    initializeGuestUI();
                    renderHomeRecentlyPlayed(true);
                }
                const notificationBtn = document.getElementById('notificationBtn');
                if (notificationBtn) {
                    notificationBtn.addEventListener('click', () => navigateToNotificationPage(true));
                }
            }
        };

        // Legacy support for modules relying on window.spotiwind.mobile
        window.spotiwind = window.spotiwind || {};
        window.spotiwind.mobile = {
            fetchWithContinuousRetry,
            fetchLocalArtistSongs,
            fetchArtistSongs,
            getArtists: () => indonesianArtistsPlaylist,
            getSongs: () => indonesianSongsPlaylist,
            loadPageContent: (page, opts) => window.loadPageContent && window.loadPageContent(page, opts),
            initializeSkeletons: () => {
                if (typeof showSkeletonLoader === 'function') showSkeletonLoader('#artistSongsGrid', 'artist-song-list', 6);
            }
        };

        initPageRouter(routerContext);

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
});