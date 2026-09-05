/**
 * Library Page Module (Mobile)
 * Handles Tabs, Real-time Liked Songs, Downloads & Overview statistics.
 */

import { auth, db, onAuthStateChanged, collection, onSnapshot, query, orderBy, getDocs } from './firebase-config.js';
import { getFavoriteSongs, toggleFavorite } from '../../services/favoriteService.js';
import { getUserPlaylists } from '../../services/libraryService.js';
import { subscribeUserProfile, getProfileByUid } from '../../services/profileService.js';
import { openProSubscriptionModal, closeProSubscriptionModal } from '../../components/modals/proSubscriptionModal.js';
import { isSongDownloaded, toggleDownloadSong } from '../../components/sheets/songOptionsSheet.js';
import { debounce } from '../../utils/formatters.js';

let activeLibraryTab = 'overview';
const listeners = [];
let likedSongsUnsubscribe = null;
let playlistsUnsubscribe = null;
let userProfileUnsubscribe = null;
let isCurrentUserPro = false;
let currentLikedSongs = [];
let currentPlaylists = [];
let playlistSearchQuery = '';
let playlistFilterMode = 'all'; // 'all' | 'create' | 'collab'
let playlistSortMode = 'recently-added'; // 'recently-added' | 'recently-played'
let playlistViewMode = 'list'; // 'list' | 'grid'

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function switchToLibraryTab(tabKey, options = {}) {
    const tabs = document.querySelectorAll('[data-library-tab]');
    const tabsContainer = document.querySelector('.library-tabs');
    const indicator = document.querySelector('.library-active-indicator');
    const panels = document.querySelectorAll('[data-library-panel]');
    if (!tabs.length) return;

    const targetTab = Array.from(tabs).find(t => t.dataset.libraryTab === tabKey) || tabs[0];
    activeLibraryTab = targetTab.dataset.libraryTab || 'overview';
    try {
        sessionStorage.setItem('library_active_tab', activeLibraryTab);
    } catch {}

    tabs.forEach((item) => {
        const isActive = item === targetTab;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-selected', String(isActive));
    });

    const updateIndicatorAndScroll = () => {
        if (indicator && targetTab) {
            indicator.style.width = `${targetTab.offsetWidth}px`;
            indicator.style.transform = `translateX(${targetTab.offsetLeft}px)`;
        }
        if (tabsContainer && targetTab) {
            const containerWidth = tabsContainer.clientWidth;
            const tabLeft = targetTab.offsetLeft;
            const tabWidth = targetTab.offsetWidth;
            const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
            tabsContainer.scrollTo({
                left: Math.max(0, targetScrollLeft),
                behavior: options.instant ? 'auto' : 'smooth'
            });
        }
    };

    requestAnimationFrame(updateIndicatorAndScroll);
    setTimeout(updateIndicatorAndScroll, 50);

    panels.forEach((panel) => {
        const isMatch = panel.dataset.libraryPanel === activeLibraryTab;
        panel.classList.toggle('is-active', isMatch);
    });

    // Refresh contents of active panel
    if (activeLibraryTab === 'overview') {
        updateLocalStats();
        renderRecentPlaylistsOverview(currentPlaylists, !auth.currentUser);
        renderLikedSongsOverview(currentLikedSongs, !auth.currentUser);
    } else if (activeLibraryTab === 'playlists') {
        renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
    } else if (activeLibraryTab === 'albums') {
        renderAlbumsPanel(currentLikedSongs, !auth.currentUser);
    } else if (activeLibraryTab === 'artists') {
        renderArtistsPanel(!auth.currentUser);
    } else if (activeLibraryTab === 'tracks') {
        renderTracksPanel(currentLikedSongs, !auth.currentUser);
    } else if (activeLibraryTab === 'download') {
        renderDownloadsPanel(!auth.currentUser);
    }
}

export async function initLibraryPage(initialTab = 'overview') {
    window.switchToLibraryTab = switchToLibraryTab;
    setupLibraryTabs(initialTab);
    setupOverviewCards();
    setupRealtimeOverviewData();
    setupSongActionListeners();
    setupDownloadOptionsModal();
    setupPlaylistControls();

    // Listen for custom downloads-updated event
    const handleDownloadsUpdated = () => {
        updateLocalStats();
        if (activeLibraryTab === 'download') {
            renderDownloadsPanel(!auth.currentUser);
        }
    };
    window.addEventListener('downloads-updated', handleDownloadsUpdated);
    listeners.push({ element: window, type: 'downloads-updated', handler: handleDownloadsUpdated });

    // Listen for real-time download-progress event
    const handleDownloadProgress = (e) => {
        const { songId, progress, status } = e.detail || {};
        if (!songId) return;

        const track = document.getElementById(`downloadTrack_${songId}`);
        const fill = document.getElementById(`downloadFill_${songId}`);
        const badge = document.getElementById(`downloadBadge_${songId}`);
        const text = document.getElementById(`downloadText_${songId}`);
        const optBtn = document.getElementById(`downloadOptBtn_${songId}`);
        const durationEl = document.getElementById(`downloadDuration_${songId}`);

        if (fill) {
            fill.style.width = `${progress}%`;
        }
        if (text) {
            text.textContent = `${progress}%`;
        }

        if (progress >= 100 || status === 'completed') {
            if (fill) fill.classList.add('is-done');
            setTimeout(() => {
                if (track) track.classList.add('hidden');
                if (badge) badge.classList.add('hidden');
                if (optBtn) optBtn.classList.remove('hidden');
                if (durationEl) durationEl.classList.remove('hidden');
            }, 600);
        } else {
            if (track) track.classList.remove('hidden');
            if (badge) badge.classList.remove('hidden');
            if (optBtn) optBtn.classList.add('hidden');
            if (durationEl) durationEl.classList.add('hidden');
        }
    };
    window.addEventListener('download-progress', handleDownloadProgress);
    listeners.push({ element: window, type: 'download-progress', handler: handleDownloadProgress });
}

function setupLibraryTabs(initialTab = 'overview') {
    const tabs = document.querySelectorAll('[data-library-tab]');
    const indicator = document.querySelector('.library-active-indicator');

    tabs.forEach((tab) => {
        const handler = () => {
            switchToLibraryTab(tab.dataset.libraryTab);
        };
        tab.addEventListener('click', handler);
        listeners.push({ element: tab, type: 'click', handler });
    });

    switchToLibraryTab(initialTab);

    const resizeHandler = () => {
        const currentActive = document.querySelector(`[data-library-tab="${activeLibraryTab}"]`) || tabs[0];
        if (currentActive && indicator) {
            indicator.style.width = `${currentActive.offsetWidth}px`;
            indicator.style.transform = `translateX(${currentActive.offsetLeft}px)`;
        }
    };
    window.addEventListener('resize', resizeHandler);
    listeners.push({ element: window, type: 'resize', handler: resizeHandler });
}

function setupOverviewCards() {
    const cards = document.querySelectorAll('[data-overview-item]');
    cards.forEach((card) => {
        const handler = () => {
            const itemType = card.dataset.overviewItem;
            if (itemType === 'downloads') {
                switchToLibraryTab('download');
            } else if (itemType === 'liked-songs') {
                switchToLibraryTab('tracks');
            } else if (itemType === 'favorites') {
                switchToLibraryTab('playlists');
            } else if (itemType === 'recently-played') {
                switchToLibraryTab('overview');
            }
        };
        card.addEventListener('click', handler);
        listeners.push({ element: card, type: 'click', handler });
    });

    const seeAllBtn = document.getElementById('seeAllPlaylistsBtn') || document.getElementById('seeAllRecentBtn');
    if (seeAllBtn) {
        const seeAllHandler = (e) => {
            e.preventDefault();
            switchToLibraryTab('playlists');
        };
        seeAllBtn.addEventListener('click', seeAllHandler);
        listeners.push({ element: seeAllBtn, type: 'click', handler: seeAllHandler });
    }

    const seeAllLikedBtn = document.getElementById('seeAllLikedBtn');
    if (seeAllLikedBtn) {
        const seeAllLikedHandler = (e) => {
            e.preventDefault();
            switchToLibraryTab('tracks');
        };
        seeAllLikedBtn.addEventListener('click', seeAllLikedHandler);
        listeners.push({ element: seeAllLikedBtn, type: 'click', handler: seeAllLikedHandler });
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatCount(count, singular = 'song', plural = 'songs') {
    const n = Number(count) || 0;
    return `${n} ${n === 1 ? singular : plural}`;
}

export function syncAllLikeButtons(songId, isLiked) {
    if (!songId) return;
    const cleanId = String(songId).trim();

    // 1. Sync all like buttons on current DOM
    document.querySelectorAll(`.like-song-btn[data-song-id="${cleanId}"]`).forEach(btn => {
        btn.classList.toggle('is-liked', isLiked);
        btn.setAttribute('title', isLiked ? 'Unlike song' : 'Like song');
        btn.setAttribute('aria-label', isLiked ? 'Unlike song' : 'Like song');
    });

    // 2. Sync player like buttons (Mini player & Full player)
    const currentSong = window.spotiwind?.mobile?.getCurrentSongData?.() || window.__currentSongData || (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : null);
    if (currentSong && (String(currentSong.id).trim() === cleanId || (typeof window.areSameSongs === 'function' && window.areSameSongs(currentSong, { id: cleanId })))) {
        const mobileLikeBtn = document.getElementById('mobileLoveBtn');
        if (mobileLikeBtn) mobileLikeBtn.classList.toggle('liked', isLiked);
        const fullLikeBtn = document.getElementById('fullLoveBtn');
        if (fullLikeBtn) fullLikeBtn.classList.toggle('liked', isLiked);
    }
}
if (typeof window !== 'undefined' && !window.syncAllLikeButtons) {
    window.syncAllLikeButtons = syncAllLikeButtons;
}

function setupRealtimeOverviewData() {
    // 1. Update localStorage-based counts (Downloads & Recently Played)
    updateLocalStats();
    renderDownloadsPanel(!auth.currentUser);

    window.addEventListener('recently-played-updated', updateLocalStats, { passive: true });

    const handleFavoritesUpdated = (e) => {
        const { songId, isLiked, favorites } = e.detail || {};
        if (Array.isArray(favorites)) {
            currentLikedSongs = sortSongsByNewest(favorites);
            setLikedSongsCount(favorites.length);
        }
        if (songId) {
            syncAllLikeButtons(songId, isLiked);
        }
    };
    window.addEventListener('favorites-updated', handleFavoritesUpdated);
    listeners.push({ element: window, type: 'favorites-updated', handler: handleFavoritesUpdated });

    // 2. Listen to Auth State to bind live Firestore data
    const authUnsub = onAuthStateChanged(auth, async (user) => {
        cleanupUserSubscriptions();

        if (user) {
            if (typeof window.isCurrentUserPro === 'function') {
                isCurrentUserPro = window.isCurrentUserPro();
            }

            // Real-time PRO subscription status
            if (userProfileUnsubscribe) {
                userProfileUnsubscribe();
                userProfileUnsubscribe = null;
            }
            userProfileUnsubscribe = subscribeUserProfile(user.uid, (profile) => {
                const wasPro = isCurrentUserPro;
                isCurrentUserPro = profile?.isPremium === true;
                updateLocalStats();
                if (activeLibraryTab === 'download' || wasPro !== isCurrentUserPro) {
                    renderDownloadsPanel(false);
                }
            });

            updateLocalStats();
            bindUserLikedSongs(user.uid);
            bindUserPlaylists(user.uid);
            if (activeLibraryTab === 'download') {
                renderDownloadsPanel(false);
            }
        } else {
            isCurrentUserPro = false;
            if (userProfileUnsubscribe) {
                userProfileUnsubscribe();
                userProfileUnsubscribe = null;
            }
            currentLikedSongs = [];
            currentPlaylists = [];
            setLikedSongsCount(0);
            setFavoritesCount(0);
            setDownloadsCount(0);
            renderTracksPanel([], true);
            renderPlaylistsPanel([], true);
            renderRecentPlaylistsOverview([], true);
            renderLikedSongsOverview([], true);
            renderAlbumsPanel([], true);
            renderArtistsPanel(true);
            if (activeLibraryTab === 'download') {
                renderDownloadsPanel(true);
            }
        }
    });

    listeners.push({ cleanup: authUnsub });
}

function sortSongsByNewest(songs = []) {
    if (!Array.isArray(songs)) return [];
    return [...songs].sort((a, b) => {
        const getTime = (item) => {
            if (!item) return 0;
            if (item.likedAt?.toMillis && typeof item.likedAt.toMillis === 'function') {
                return item.likedAt.toMillis();
            }
            if (item.likedAt?.seconds) {
                return item.likedAt.seconds * 1000;
            }
            if (typeof item.likedAt === 'number') {
                return item.likedAt;
            }
            if (item.likedAt instanceof Date) {
                return item.likedAt.getTime();
            }
            return Date.now() + 10000;
        };
        return getTime(b) - getTime(a);
    });
}

function bindUserLikedSongs(uid) {
    if (!uid) return;

    try {
        const likedRef = collection(db, "users", uid, "liked_songs");
        likedSongsUnsubscribe = onSnapshot(likedRef, (snapshot) => {
            const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const songs = sortSongsByNewest(raw);
            currentLikedSongs = songs;
            setLikedSongsCount(songs.length);
            renderTracksPanel(songs, false);
            renderLikedSongsOverview(songs, false);
            if (activeLibraryTab === 'albums') renderAlbumsPanel(songs, false);
            if (activeLibraryTab === 'artists') renderArtistsPanel(false);
        }, async (error) => {
            console.warn("Firestore snapshot error, falling back to getFavoriteSongs:", error);
            const fallbackSongs = await getFavoriteSongs(uid);
            const sorted = sortSongsByNewest(fallbackSongs);
            currentLikedSongs = sorted;
            setLikedSongsCount(sorted.length);
            renderTracksPanel(sorted, false);
            renderLikedSongsOverview(sorted, false);
            if (activeLibraryTab === 'albums') renderAlbumsPanel(sorted, false);
            if (activeLibraryTab === 'artists') renderArtistsPanel(false);
        });
    } catch (e) {
        console.error("Error setting up liked songs listener:", e);
    }
}

function sortPlaylistsByNewest(playlists = []) {
    if (!Array.isArray(playlists)) return [];
    return [...playlists].sort((a, b) => {
        const getTime = (item) => {
            if (!item) return 0;
            if (item.createdAt?.toMillis && typeof item.createdAt.toMillis === 'function') {
                return item.createdAt.toMillis();
            }
            if (item.createdAt?.seconds) {
                return item.createdAt.seconds * 1000;
            }
            if (typeof item.createdAt === 'number') {
                return item.createdAt;
            }
            if (item.createdAt instanceof Date) {
                return item.createdAt.getTime();
            }
            // If just created (serverTimestamp pending), prioritize as newest
            return Date.now() + 10000;
        };
        return getTime(b) - getTime(a);
    });
}

function bindUserPlaylists(uid) {
    if (!uid) return;

    try {
        const playlistsQuery = query(collection(db, "users", uid, "playlists"), orderBy("createdAt", "desc"));
        playlistsUnsubscribe = onSnapshot(playlistsQuery, (snapshot) => {
            const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const playlists = sortPlaylistsByNewest(raw);
            currentPlaylists = playlists;
            setFavoritesCount(playlists.length);
            renderPlaylistsPanel(playlists, false);
            renderRecentPlaylistsOverview(playlists, false);
        }, async (error) => {
            console.warn("Firestore playlists snapshot error, falling back:", error);
            const fallbackPlaylists = await getUserPlaylists(uid);
            const sorted = sortPlaylistsByNewest(fallbackPlaylists);
            currentPlaylists = sorted;
            setFavoritesCount(sorted.length);
            renderPlaylistsPanel(sorted, false);
            renderRecentPlaylistsOverview(sorted, false);
        });
    } catch (e) {
        console.error("Error setting up playlists listener:", e);
    }
}

function updateLocalStats() {
    // Downloads
    try {
        const isPro = isCurrentUserPro || (typeof window.isCurrentUserPro === 'function' && window.isCurrentUserPro());
        if (!auth.currentUser || !isPro) {
            setDownloadsCount(0);
        } else {
            const savedDownloads = JSON.parse(localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]');
            const count = Array.isArray(savedDownloads) ? savedDownloads.length : 0;
            setDownloadsCount(count);
        }
    } catch {
        setDownloadsCount(0);
    }

    // Recently Played
    try {
        const savedRecent = JSON.parse(localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]');
        const count = Array.isArray(savedRecent) ? savedRecent.length : 0;
        setRecentCount(count);
    } catch {
        setRecentCount(0);
    }
}

function setLikedSongsCount(count) {
    const el = document.getElementById('overviewLikedCount');
    if (el) el.textContent = formatCount(count, 'song', 'songs');
    const badge = document.getElementById('libraryTracksCount');
    if (badge) badge.textContent = formatCount(count, 'song', 'songs');
}

function setDownloadsCount(count) {
    const el = document.getElementById('overviewDownloadsCount');
    if (el) el.textContent = formatCount(count, 'song', 'songs');
    const badge = document.getElementById('libraryDownloadsBadge');
    if (badge) badge.textContent = formatCount(count, 'song', 'songs');
}

function setRecentCount(count) {
    const el = document.getElementById('overviewRecentCount');
    if (el) el.textContent = formatCount(count, 'item', 'items');
}

function setFavoritesCount(count) {
    const el = document.getElementById('overviewFavoritesCount');
    if (el) el.textContent = formatCount(count, 'playlist', 'playlists');
}

export function getLibraryPlaylist() {
    if (activeLibraryTab === 'download') {
        try {
            const raw = localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]';
            const downloads = JSON.parse(raw);
            return Array.isArray(downloads) ? downloads : [];
        } catch {
            return [];
        }
    }
    if (Array.isArray(currentLikedSongs) && currentLikedSongs.length > 0) {
        return currentLikedSongs;
    }
    return [];
}
window.getLibraryPlaylist = getLibraryPlaylist;

function createSongItemHTML(song, options = {}) {
    const { isDownloadView = false, context = 'tracks' } = options;
    const defaultCover = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80';
    const coverUrl = song.cover || song.coverUrl || song.image || defaultCover;
    const songId = song.id || song.songId || '';
    const name = song.name || song.title || 'Unknown Track';
    const artist = song.artist || 'Unknown Artist';
    const audio = song.audio || song.audioUrl || song.songAudio || '';
    const duration = Number(song.duration) || 0;
    const durationText = formatTime(duration);

    const currentSong = window.spotiwind?.mobile?.getCurrentSongData?.() || window.__currentSongData || (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : null);
    const clean = u => u ? u.replace(/^https?:/, '').replace(/\/$/, '') : '';
    const isSame = currentSong && (typeof window.areSameSongs === 'function'
        ? window.areSameSongs(currentSong, { id: songId, audio, name, artist })
        : (String(currentSong.id) === String(songId) || (audio && clean(currentSong.audio) === clean(audio))));
    const activeAudio = window.__activeAudio || document.querySelector('audio');
    const isActive = Boolean(isSame);
    const isPaused = isActive && Boolean(activeAudio?.paused);

    const isLiked = currentLikedSongs && currentLikedSongs.length
        ? currentLikedSongs.some(item => String(item.id || item.songId) === String(songId))
        : true;

    // Per-tab dedicated wrapper class + backwards-compatible library-song-item
    const itemClass = context === 'overview'
        ? 'overview-song-item library-song-item'
        : (context === 'download' ? 'download-item library-song-item' : 'track-item library-song-item');

    return `
        <div class="${itemClass} ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${songId}" data-audio="${audio}" data-song-id="${songId}" data-song-audio="${audio}" data-song-name="${escapeHTML(name)}" data-song-artist="${escapeHTML(artist)}" data-song-cover="${escapeHTML(coverUrl)}" data-song-duration="${duration}">
            <div class="${context === 'overview' ? 'overview-song-cover-wrapper' : (context === 'download' ? 'download-cover-wrapper' : 'track-cover-wrapper')} library-song-cover-wrapper">
                <img src="${coverUrl}" alt="${escapeHTML(name)}" class="${context === 'overview' ? 'overview-song-cover' : (context === 'download' ? 'download-cover' : 'track-cover')} library-song-cover" width="46" height="46" loading="lazy" onerror="this.src='${defaultCover}'">
                <div class="${context === 'overview' ? 'overview-song-play-icon' : (context === 'download' ? 'download-play-icon' : 'track-play-icon')} library-song-play-icon" aria-hidden="true">
                    ${isActive && !isPaused ? `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    ` : `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                    `}
                </div>
            </div>
            <div class="${context === 'overview' ? 'overview-song-info' : (context === 'download' ? 'download-info' : 'track-info')} library-song-info">
                <h3 class="${context === 'overview' ? 'overview-song-name' : (context === 'download' ? 'download-name' : 'track-name')} library-song-name">${escapeHTML(name)}</h3>
                <p class="${context === 'overview' ? 'overview-song-artist' : (context === 'download' ? 'download-artist' : 'track-artist')} library-song-artist">${escapeHTML(artist)}</p>
            </div>
            <div class="${context === 'overview' ? 'overview-song-meta' : (context === 'download' ? 'download-meta' : 'track-meta')} library-song-meta">
                ${isDownloadView ? `
                    <span class="download-status-badge library-download-status-badge ${song.downloadStatus === 'downloading' ? '' : 'hidden'}" id="downloadBadge_${songId}">
                        <svg class="spin-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        <span id="downloadText_${songId}">${song.downloadProgress || 10}%</span>
                    </span>
                    <span class="download-duration library-song-duration ${song.downloadStatus === 'downloading' ? 'hidden' : ''}" id="downloadDuration_${songId}">${durationText}</span>
                    <button class="download-options-btn download-opt-trigger-btn library-song-action-btn ${song.downloadStatus === 'downloading' ? 'hidden' : ''}" id="downloadOptBtn_${songId}" type="button" data-song-id="${songId}" title="Opsi Unduhan" aria-label="Opsi Unduhan">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                ` : `
                    <button class="${context === 'overview' ? 'overview-song-like-btn' : 'track-like-btn'} library-song-action-btn like-song-btn ${isLiked ? 'is-liked' : ''}" type="button" data-song-id="${songId}" title="${isLiked ? 'Unlike song' : 'Like song'}" aria-label="${isLiked ? 'Unlike song' : 'Like song'}">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${isLiked ? '0' : '2'}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
                        </svg>
                    </button>
                    <button class="${context === 'overview' ? 'overview-song-more-btn' : 'track-more-btn'} library-song-action-btn library-song-more-btn" type="button" data-song-id="${songId}" title="More options" aria-label="More options">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="1.75"></circle>
                            <circle cx="12" cy="12" r="1.75"></circle>
                            <circle cx="12" cy="19" r="1.75"></circle>
                        </svg>
                    </button>
                `}
            </div>
            ${isDownloadView ? `
                <div class="download-progress-track library-download-progress-track ${song.downloadStatus === 'downloading' ? '' : 'hidden'}" id="downloadTrack_${songId}">
                    <div class="download-progress-fill library-download-progress-fill ${song.downloadStatus === 'completed' ? 'is-done' : ''}" id="downloadFill_${songId}" style="width: ${song.downloadProgress || 10}%;"></div>
                </div>
            ` : ''}
        </div>
    `;
}

/* =============================================
   Panel Renderers
   ============================================= */

// --- 1. OVERVIEW: Recent Playlists (Separated from Your Playlist) ---
function renderRecentPlaylistsOverview(playlists = [], isGuest = false) {
    const container = document.getElementById('overviewRecentList');
    if (!container) return;

    if (isGuest) {
        container.innerHTML = `
            <div class="overview-empty-state">
                <div class="overview-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <h3 class="overview-empty-title">Create your custom playlists</h3>
                <p class="overview-empty-desc">Log in to create, organize, and view your custom playlists.</p>
                <a href="auth-mobile.html" class="overview-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const sortedPlaylists = sortPlaylistsByNewest(playlists);

    if (!Array.isArray(sortedPlaylists) || sortedPlaylists.length === 0) {
        container.innerHTML = `
            <div class="overview-empty-state">
                <div class="overview-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <h3 class="overview-empty-title">No playlists yet</h3>
                <p class="overview-empty-desc">Create your first custom playlist to see it here.</p>
            </div>
        `;
        return;
    }

    const recentPlaylists = sortedPlaylists.slice(0, 5);

    container.innerHTML = recentPlaylists.map(p => `
        <div class="overview-playlist-item" data-playlist-id="${p.id}">
            <div class="overview-playlist-cover">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div class="overview-playlist-info">
                <h3 class="overview-playlist-name">${escapeHTML(p.name || 'Untitled Playlist')}</h3>
                <p class="overview-playlist-meta">${formatCount(p.songs?.length || 0, 'song', 'songs')}</p>
            </div>
            <div class="overview-playlist-actions">
                <button class="overview-playlist-more-btn playlist-more-btn" type="button" data-playlist-id="${p.id}" data-playlist-name="${escapeHTML(p.name || '')}" title="Playlist options" aria-label="Playlist options">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <circle cx="12" cy="5" r="1.75"></circle>
                        <circle cx="12" cy="12" r="1.75"></circle>
                        <circle cx="12" cy="19" r="1.75"></circle>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

// --- 2. PLAYLISTS: "Your playlist" (Distinct List & Grid Views) ---
function renderPlaylistsPanel(playlists = [], isGuest = false) {
    const container = document.getElementById('libraryPlaylistsList');
    const countEl = document.getElementById('playlistSubheaderCount');
    if (!container) return;

    if (isGuest || !Array.isArray(playlists) || playlists.length === 0) {
        if (countEl) countEl.textContent = '0 playlists';
        container.className = `your-playlists-container ${playlistViewMode === 'grid' ? 'view-grid' : 'view-list'}`;
        container.innerHTML = `
            <div class="your-playlists-empty-state">
                <div class="your-playlists-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </div>
                <h3 class="your-playlists-empty-title">Your playlists are empty</h3>
                <p class="your-playlists-empty-desc">Create a playlist to collect<br>the music you love.</p>
                <button class="your-playlists-empty-btn" type="button" data-action="add-playlist">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>Create playlist</span>
                </button>
            </div>
        `;
        return;
    }

    // 1. Filter by category
    let filtered = [...playlists];
    if (playlistFilterMode === 'create') {
        filtered = filtered.filter(p => !p.isCollaborative && !p.isCollab && !p.collab && (!p.collaboratorIds || p.collaboratorIds.length === 0));
    } else if (playlistFilterMode === 'collab') {
        filtered = filtered.filter(p => Boolean(p.isCollaborative || p.isCollab || p.collab || (p.collaborators && p.collaborators.length > 0) || (p.collaboratorIds && p.collaboratorIds.length > 0)));
    }

    // 2. Filter by search input
    if (playlistSearchQuery) {
        filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(playlistSearchQuery));
    }

    // 3. Sort playlists
    if (playlistSortMode === 'recently-played') {
        filtered.sort((a, b) => {
            const timeA = a.lastPlayedAt?.toMillis ? a.lastPlayedAt.toMillis() : (a.lastPlayedAt || a.updatedAt || a.createdAt || 0);
            const timeB = b.lastPlayedAt?.toMillis ? b.lastPlayedAt.toMillis() : (b.lastPlayedAt || b.updatedAt || b.createdAt || 0);
            return timeB - timeA;
        });
    } else {
        filtered = sortPlaylistsByNewest(filtered);
    }

    // Update count in subheader
    if (countEl) {
        countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'playlist' : 'playlists'}`;
    }

    // Empty search / filter results
    if (filtered.length === 0) {
        container.className = `your-playlists-container ${playlistViewMode === 'grid' ? 'view-grid' : 'view-list'}`;
        container.innerHTML = `
            <div class="your-playlists-empty-state" style="padding: 2.5rem var(--mobile-horizontal-padding) 2rem;">
                <div class="your-playlists-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </div>
                <h3 class="your-playlists-empty-title">No playlists found</h3>
                <p class="your-playlists-empty-desc">${playlistSearchQuery ? `No playlists matching "${escapeHTML(playlistSearchQuery)}".` : 'No playlists in this category.'}</p>
            </div>
        `;
        return;
    }

    // Ensure correct grid/list class
    container.className = `your-playlists-container ${playlistViewMode === 'grid' ? 'view-grid' : 'view-list'}`;

    if (playlistViewMode === 'grid') {
        container.innerHTML = filtered.map(p => {
            const isCollab = Boolean(p.isCollaborative || p.isCollab || p.collab || (p.collaboratorIds && p.collaboratorIds.length > 0));
            const countStr = formatCount(p.songs?.length || 0, 'song', 'songs');
            return `
                <div class="your-playlist-grid-card" data-playlist-id="${p.id}">
                    <div class="your-playlist-grid-cover">
                        ${isCollab ? '<span class="your-playlist-badge">Collab</span>' : ''}
                        <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </div>
                    <div class="your-playlist-grid-info">
                        <div class="your-playlist-grid-text">
                            <h3 class="your-playlist-grid-title">${escapeHTML(p.name || 'Untitled Playlist')}</h3>
                            <p class="your-playlist-grid-meta">${countStr}</p>
                        </div>
                        <button class="your-playlist-grid-more-btn playlist-more-btn" type="button" data-playlist-id="${p.id}" data-playlist-name="${escapeHTML(p.name || '')}" title="Playlist options" aria-label="Playlist options">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <circle cx="12" cy="5" r="1.75"></circle>
                                <circle cx="12" cy="12" r="1.75"></circle>
                                <circle cx="12" cy="19" r="1.75"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = filtered.map(p => {
            const isCollab = Boolean(p.isCollaborative || p.isCollab || p.collab || (p.collaboratorIds && p.collaboratorIds.length > 0));
            const countStr = formatCount(p.songs?.length || 0, 'song', 'songs');
            return `
                <div class="your-playlist-item" data-playlist-id="${p.id}">
                    <div class="your-playlist-cover">
                        ${isCollab ? '<span class="your-playlist-badge">Collab</span>' : ''}
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>
                    <div class="your-playlist-info">
                        <h3 class="your-playlist-title">${escapeHTML(p.name || 'Untitled Playlist')}</h3>
                        <p class="your-playlist-meta">${isCollab ? 'Collab • ' : ''}${countStr}</p>
                    </div>
                    <div class="your-playlist-actions">
                        <button class="your-playlist-more-btn playlist-more-btn" type="button" data-playlist-id="${p.id}" data-playlist-name="${escapeHTML(p.name || '')}" title="Playlist options" aria-label="Playlist options">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <circle cx="12" cy="5" r="1.75"></circle>
                                <circle cx="12" cy="12" r="1.75"></circle>
                                <circle cx="12" cy="19" r="1.75"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// --- 3. ALBUMS: Dedicated Albums Tab Renderer ---
function renderAlbumsPanel(songs = [], isGuest = false) {
    const container = document.getElementById('libraryAlbumsList');
    const badgeEl = document.getElementById('libraryAlbumsCount');
    if (!container) return;

    if (isGuest) {
        if (badgeEl) badgeEl.textContent = '0 albums';
        container.innerHTML = `
            <div class="albums-empty-state">
                <div class="albums-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </div>
                <h3 class="albums-empty-title">Collect your favorite albums</h3>
                <p class="albums-empty-desc">Log in to save and browse your album collection.</p>
                <a href="auth-mobile.html" class="albums-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    // Extract unique albums from currentLikedSongs + downloads
    const allSongs = [...(Array.isArray(songs) ? songs : [])];
    try {
        const rawDl = localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]';
        const dls = JSON.parse(rawDl);
        if (Array.isArray(dls)) allSongs.push(...dls);
    } catch {}

    const albumMap = new Map();
    allSongs.forEach(song => {
        const albumName = song.album || song.album_name || song.albumTitle;
        if (!albumName || albumName === 'Unknown Album' || albumName.trim() === '') return;
        const key = albumName.trim().toLowerCase();
        if (!albumMap.has(key)) {
            albumMap.set(key, {
                id: song.albumId || key,
                name: albumName.trim(),
                artist: song.artist || 'Various Artists',
                cover: song.albumCover || song.cover || song.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80',
                tracks: [song]
            });
        } else {
            const existing = albumMap.get(key);
            if (!existing.tracks.some(t => String(t.id || t.songId) === String(song.id || song.songId))) {
                existing.tracks.push(song);
            }
        }
    });

    const albums = Array.from(albumMap.values());
    if (badgeEl) badgeEl.textContent = `${albums.length} ${albums.length === 1 ? 'album' : 'albums'}`;

    if (albums.length === 0) {
        container.innerHTML = `
            <div class="albums-empty-state">
                <div class="albums-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </div>
                <h3 class="albums-empty-title">No albums saved yet</h3>
                <p class="albums-empty-desc">Albums from songs you like or download will automatically appear here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = albums.map(album => `
        <div class="album-card" data-album-name="${escapeHTML(album.name)}" data-album-artist="${escapeHTML(album.artist)}" data-first-audio="${album.tracks[0]?.audio || ''}">
            <div class="album-cover-wrapper">
                <img src="${album.cover}" alt="${escapeHTML(album.name)}" class="album-cover-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80'">
                <div class="album-play-overlay">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </div>
            </div>
            <div class="album-info">
                <h3 class="album-title">${escapeHTML(album.name)}</h3>
                <p class="album-artist">${escapeHTML(album.artist)}</p>
                <span class="album-track-count">${album.tracks.length} ${album.tracks.length === 1 ? 'track' : 'tracks'}</span>
            </div>
        </div>
    `).join('');
}

// --- 4. ARTISTS: Dedicated Artists Tab Renderer ---
async function renderArtistsPanel(isGuest = false) {
    const container = document.getElementById('libraryArtistsList');
    const badgeEl = document.getElementById('libraryArtistsCount');
    if (!container) return;

    if (isGuest || !auth.currentUser) {
        if (badgeEl) badgeEl.textContent = '0 artists';
        container.innerHTML = `
            <div class="artists-empty-state">
                <div class="artists-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="8" r="5"></circle>
                        <path d="M20 21a8 8 0 0 0-16 0"></path>
                    </svg>
                </div>
                <h3 class="artists-empty-title">Follow your favorite artists</h3>
                <p class="artists-empty-desc">Log in to follow artists and view them in your library.</p>
                <a href="auth-mobile.html" class="artists-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const uid = auth.currentUser.uid;
    const artistMap = new Map();

    // 1. Fetch from Firestore users/{uid}/following
    try {
        const followingRef = collection(db, "users", uid, "following");
        const snap = await getDocs(followingRef);
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.type === 'artist' || !data.type) {
                const name = data.displayName || data.name || docSnap.id;
                const photo = data.photoURL || data.photo || data.image || '';
                const key = name.trim().toLowerCase();
                artistMap.set(key, {
                    id: data.artistId || docSnap.id,
                    name: name,
                    photo: photo,
                    isFollowed: true
                });
            }
        });
    } catch (err) {
        console.warn("Could not fetch followed artists:", err);
    }

    // 2. Also extract artists from currentLikedSongs as suggestions
    if (artistMap.size === 0 && Array.isArray(currentLikedSongs)) {
        currentLikedSongs.forEach(song => {
            const artistName = song.artist || song.artistName;
            if (!artistName || artistName === 'Unknown Artist') return;
            const key = artistName.trim().toLowerCase();
            if (!artistMap.has(key)) {
                artistMap.set(key, {
                    id: song.artistId || key,
                    name: artistName,
                    photo: song.artistPhoto || song.cover || '',
                    isFollowed: false
                });
            }
        });
    }

    const artists = Array.from(artistMap.values());
    if (badgeEl) badgeEl.textContent = `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`;

    if (artists.length === 0) {
        container.innerHTML = `
            <div class="artists-empty-state">
                <div class="artists-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="8" r="5"></circle>
                        <path d="M20 21a8 8 0 0 0-16 0"></path>
                    </svg>
                </div>
                <h3 class="artists-empty-title">No artists followed yet</h3>
                <p class="artists-empty-desc">Follow artists you love to stay up-to-date with their latest music.</p>
            </div>
        `;
        return;
    }

    const defaultAvatar = '../../public/branding/Spotiwind.webp';
    container.innerHTML = artists.map(artist => `
        <div class="artist-card" data-artist-id="${escapeHTML(artist.id)}" data-artist-name="${escapeHTML(artist.name)}" data-artist-photo="${escapeHTML(artist.photo || defaultAvatar)}">
            <div class="artist-avatar-wrapper">
                <img src="${artist.photo || defaultAvatar}" alt="${escapeHTML(artist.name)}" class="artist-avatar-img" loading="lazy" onerror="this.src='${defaultAvatar}'">
            </div>
            <div class="artist-info">
                <h3 class="artist-name">${escapeHTML(artist.name)}</h3>
                <span class="artist-role">Artist</span>
            </div>
        </div>
    `).join('');
}

// --- 5. TRACKS: Dedicated Liked Songs Panel Renderer ---
function renderTracksPanel(songs = [], isGuest = false) {
    const container = document.getElementById('libraryTracksList');
    const countBadge = document.getElementById('libraryTracksCount');
    if (!container) return;

    if (isGuest) {
        if (countBadge) countBadge.textContent = '0 songs';
        container.innerHTML = `
            <div class="tracks-empty-state">
                <div class="tracks-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="tracks-empty-title">Save your favorite tracks</h3>
                <p class="tracks-empty-desc">Log in to like songs and access them on any device.</p>
                <a href="auth-mobile.html" class="tracks-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    if (!Array.isArray(songs) || songs.length === 0) {
        if (countBadge) countBadge.textContent = '0 songs';
        container.innerHTML = `
            <div class="tracks-empty-state">
                <div class="tracks-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="tracks-empty-title">No liked songs yet</h3>
                <p class="tracks-empty-desc">Tap the heart icon on any song you love to save it here.</p>
            </div>
        `;
        return;
    }

    if (countBadge) countBadge.textContent = `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`;
    container.innerHTML = songs.map(song => createSongItemHTML(song, { context: 'tracks' })).join('');
    if (typeof window.syncActiveSongUI === 'function') {
        window.syncActiveSongUI();
    }
}

// --- 6. DOWNLOADS: Dedicated Downloads Panel Renderer ---
function renderDownloadsPanel(isGuest = !auth.currentUser) {
    const container = document.getElementById('libraryDownloadsList');
    const badgeEl = document.getElementById('libraryDownloadsBadge');
    if (!container) return;

    if (isGuest) {
        setDownloadsCount(0);
        if (badgeEl) badgeEl.textContent = '0 songs';
        container.innerHTML = `
            <div class="downloads-empty-state">
                <div class="downloads-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </div>
                <h3 class="downloads-empty-title">Download music for offline listening</h3>
                <p class="downloads-empty-desc">Log in to download your favorite songs and enjoy offline playback anywhere.</p>
                <a href="auth-mobile.html" class="downloads-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const isPro = isCurrentUserPro || (typeof window.isCurrentUserPro === 'function' && window.isCurrentUserPro());
    if (!isPro) {
        setDownloadsCount(0);
        if (badgeEl) badgeEl.textContent = '0 songs';
        container.innerHTML = `
            <div class="downloads-empty-state downloads-pro-state">
                <div class="downloads-empty-icon is-pro" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                        <path d="M5 16h14a1 1 0 0 0 1-1L21 6l-4.5 4L12 3 7.5 10 3 6l1 9a1 1 0 0 0 1 1zm-1 2a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2H4z"/>
                    </svg>
                </div>
                <h3 class="downloads-empty-title">Available with Spotiwind PRO</h3>
                <p class="downloads-empty-desc">Subscribe to Spotiwind PRO to download tracks and listen offline anytime.</p>
                <button id="libraryUpgradeProBtn" class="downloads-empty-btn downloads-pro-upgrade-btn" type="button" aria-label="Upgrade to PRO">
                    <span>Upgrade to PRO</span>
                </button>
            </div>
        `;
        return;
    }

    try {
        const raw = localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]';
        const downloads = JSON.parse(raw);

        if (!Array.isArray(downloads) || downloads.length === 0) {
            setDownloadsCount(0);
            if (badgeEl) badgeEl.textContent = '0 songs';
            container.innerHTML = `
                <div class="downloads-empty-state">
                    <div class="downloads-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </div>
                    <h3 class="downloads-empty-title">No downloaded songs yet</h3>
                    <p class="downloads-empty-desc">Download tracks from the player or song options to listen offline anywhere.</p>
                </div>
            `;
            return;
        }

        setDownloadsCount(downloads.length);
        if (badgeEl) badgeEl.textContent = `${downloads.length} ${downloads.length === 1 ? 'song' : 'songs'}`;
        container.innerHTML = downloads.map(song => createSongItemHTML(song, { isDownloadView: true, context: 'download' })).join('');
        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }
    } catch {
        container.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 1rem;">Unable to load downloads.</p>`;
    }
}

function setupPlaylistControls() {
    const searchInput = document.getElementById('playlistSearchInput');
    const searchClearBtn = document.getElementById('playlistSearchClearBtn');
    const filterChips = document.querySelectorAll('[data-playlist-filter]');
    const sortDropdown = document.getElementById('playlistSortDropdown');
    const sortBtn = document.getElementById('playlistSortBtn');
    const sortMenu = document.getElementById('playlistSortMenu');
    const sortLabel = document.getElementById('playlistSortLabel');
    const sortItems = document.querySelectorAll('[data-sort-val]');
    const viewListBtn = document.getElementById('playlistViewListBtn');
    const viewGridBtn = document.getElementById('playlistViewGridBtn');
    const playlistsGrid = document.getElementById('libraryPlaylistsList');

    if (searchInput) {
        const debouncedSearch = debounce(() => {
            if (searchInput) {
                playlistSearchQuery = (searchInput.value || '').trim().toLowerCase();
            }
            renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
        }, 250);

        const handleSearchInput = (e) => {
            if (searchClearBtn) {
                searchClearBtn.classList.toggle('hidden', !e.target.value);
            }
            debouncedSearch();
        };
        searchInput.addEventListener('input', handleSearchInput);
        listeners.push({ element: searchInput, type: 'input', handler: handleSearchInput });
    }

    if (searchClearBtn) {
        const handleClearClick = () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            searchClearBtn.classList.add('hidden');
            playlistSearchQuery = '';
            renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
        };
        searchClearBtn.addEventListener('click', handleClearClick);
        listeners.push({ element: searchClearBtn, type: 'click', handler: handleClearClick });
    }

    filterChips.forEach(chip => {
        const handleChipClick = () => {
            filterChips.forEach(c => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            playlistFilterMode = chip.dataset.playlistFilter || 'all';
            renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
        };
        chip.addEventListener('click', handleChipClick);
        listeners.push({ element: chip, type: 'click', handler: handleChipClick });
    });

    if (sortBtn && sortMenu && sortDropdown) {
        const toggleSortMenu = (e) => {
            e.stopPropagation();
            const isOpen = !sortMenu.classList.contains('hidden');
            if (isOpen) {
                sortMenu.classList.add('hidden');
                sortDropdown.classList.remove('is-open');
                sortBtn.setAttribute('aria-expanded', 'false');
            } else {
                sortMenu.classList.remove('hidden');
                sortDropdown.classList.add('is-open');
                sortBtn.setAttribute('aria-expanded', 'true');
            }
        };
        sortBtn.addEventListener('click', toggleSortMenu);
        listeners.push({ element: sortBtn, type: 'click', handler: toggleSortMenu });

        sortItems.forEach(item => {
            const handleSortItemClick = (e) => {
                e.stopPropagation();
                playlistSortMode = item.dataset.sortVal || 'recently-added';
                sortItems.forEach(it => it.classList.toggle('is-selected', it === item));
                if (sortLabel) {
                    sortLabel.textContent = item.querySelector('span')?.textContent || 'Recently added';
                }
                sortMenu.classList.add('hidden');
                sortDropdown.classList.remove('is-open');
                sortBtn.setAttribute('aria-expanded', 'false');
                renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
            };
            item.addEventListener('click', handleSortItemClick);
            listeners.push({ element: item, type: 'click', handler: handleSortItemClick });
        });

        const handleOutsideClick = (e) => {
            if (!sortDropdown.contains(e.target)) {
                sortMenu.classList.add('hidden');
                sortDropdown.classList.remove('is-open');
                sortBtn.setAttribute('aria-expanded', 'false');
            }
        };
        document.addEventListener('click', handleOutsideClick);
        listeners.push({ element: document, type: 'click', handler: handleOutsideClick });
    }

    const setViewMode = (mode) => {
        playlistViewMode = mode;
        if (viewListBtn) viewListBtn.classList.toggle('is-active', mode === 'list');
        if (viewGridBtn) viewGridBtn.classList.toggle('is-active', mode === 'grid');
        if (playlistsGrid) {
            playlistsGrid.classList.toggle('view-list', mode === 'list');
            playlistsGrid.classList.toggle('view-grid', mode === 'grid');
        }
        renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
    };

    if (viewListBtn) {
        const handleListClick = () => setViewMode('list');
        viewListBtn.addEventListener('click', handleListClick);
        listeners.push({ element: viewListBtn, type: 'click', handler: handleListClick });
    }

    if (viewGridBtn) {
        const handleGridClick = () => setViewMode('grid');
        viewGridBtn.addEventListener('click', handleGridClick);
        listeners.push({ element: viewGridBtn, type: 'click', handler: handleGridClick });
    }
}

function renderLikedSongsOverview(songs = [], isGuest = false) {
    const container = document.getElementById('overviewLikedList');
    if (!container) return;

    if (isGuest) {
        container.innerHTML = `
            <div class="overview-empty-state">
                <div class="overview-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="overview-empty-title">Save your favorite tracks</h3>
                <p class="overview-empty-desc">Log in to like songs and access them on any device.</p>
                <a href="auth-mobile.html" class="overview-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const sortedSongs = sortSongsByNewest(songs);

    if (!Array.isArray(sortedSongs) || sortedSongs.length === 0) {
        container.innerHTML = `
            <div class="overview-empty-state">
                <div class="overview-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="overview-empty-title">No liked songs yet</h3>
                <p class="overview-empty-desc">Tap the heart icon on any song you love to save it here.</p>
            </div>
        `;
        return;
    }

    const recentLiked = sortedSongs.slice(0, 5);
    container.innerHTML = recentLiked.map(song => createSongItemHTML(song, { context: 'overview' })).join('');
    if (typeof window.syncActiveSongUI === 'function') {
        window.syncActiveSongUI();
    }
}

/* =============================================
   Song Interactions & Playback
   ============================================= */

function setupSongActionListeners() {
    const libraryContainer = document.querySelector('.library-panels');
    if (!libraryContainer) return;

    const clickHandler = async (e) => {
        const emptyAuthBtn = e.target.closest('a.library-empty-btn, a.overview-empty-btn, a.your-playlists-empty-btn, a.albums-empty-btn, a.artists-empty-btn, a.tracks-empty-btn, a.downloads-empty-btn, a[href*="auth"]');
        if (emptyAuthBtn) {
            e.preventDefault();
            try {
                sessionStorage.setItem('spotiwind_auth_previous_page', 'library-mobile.html');
            } catch {}
            if (typeof window.navigateToAuthPage === 'function') {
                window.navigateToAuthPage('login');
            } else {
                window.location.href = 'auth-mobile.html';
            }
            return;
        }

        const upgradeProBtn = e.target.closest('#libraryUpgradeProBtn, .library-pro-upgrade-btn, .downloads-pro-upgrade-btn');
        if (upgradeProBtn) {
            e.preventDefault();
            openProSubscriptionModal({
                onSubscribed: () => {
                    isCurrentUserPro = true;
                    updateLocalStats();
                    renderDownloadsPanel(false);
                }
            });
            return;
        }

        const createPlaylistBtn = e.target.closest('#createPlaylistBtn, [data-action="add-playlist"], .playlists-create-btn, .library-create-btn');
        if (createPlaylistBtn) {
            e.preventDefault();
            if (!auth.currentUser) {
                if (typeof window.showToast === 'function') {
                    window.showToast("Please log in to create and manage playlists.");
                }
                try {
                    sessionStorage.setItem('spotiwind_auth_previous_page', 'library-mobile.html');
                } catch {}
                setTimeout(() => {
                    if (typeof window.navigateToAuthPage === 'function') {
                        window.navigateToAuthPage('login');
                    } else {
                        window.location.href = 'auth-mobile.html';
                    }
                }, 700);
                return;
            }
            if (typeof window.openCreatePlaylistModal === 'function') {
                window.openCreatePlaylistModal(createPlaylistBtn);
            }
            return;
        }

        // Play All Liked Songs in Tracks tab
        const playAllBtn = e.target.closest('#tracksPlayAllBtn, .tracks-play-all-btn');
        if (playAllBtn) {
            e.preventDefault();
            if (!currentLikedSongs || currentLikedSongs.length === 0) {
                if (typeof window.showToast === 'function') {
                    window.showToast("Belum ada lagu yang disukai untuk diputar.");
                }
                return;
            }
            const firstSong = currentLikedSongs[0];
            if (typeof window.playPreview === 'function') {
                window.playPreview(
                    null,
                    firstSong.audio || firstSong.audioUrl || firstSong.songAudio,
                    firstSong.name || firstSong.title,
                    firstSong.artist,
                    firstSong.cover || firstSong.coverUrl || firstSong.image,
                    firstSong.id,
                    Number(firstSong.duration) || 0,
                    'library'
                );
            }
            return;
        }

        // Artist card click -> navigate to artist profile page
        const artistCard = e.target.closest('.artist-card');
        if (artistCard) {
            const artistName = artistCard.dataset.artistName;
            const artistId = artistCard.dataset.artistId;
            const artistPhoto = artistCard.dataset.artistPhoto;
            const artist = { id: artistId, name: artistName, photo: artistPhoto, image: artistPhoto };
            if (typeof window.loadPageContent === 'function') {
                window.loadPageContent('artist-mobile.html', {
                    pushState: true,
                    route: `/artist/${encodeURIComponent(artistId || artistName)}`,
                    title: `${artistName} | Spotiwind`,
                    state: { route: 'artist', artist }
                });
            }
            return;
        }

        // Album card click -> preview first song or show info
        const albumCard = e.target.closest('.album-card');
        if (albumCard) {
            const firstAudio = albumCard.dataset.firstAudio;
            const albumName = albumCard.dataset.albumName;
            if (firstAudio && typeof window.playPreview === 'function') {
                const songItem = currentLikedSongs.find(s => (s.album || s.album_name) === albumName);
                if (songItem) {
                    window.playPreview(null, songItem.audio, songItem.name, songItem.artist, songItem.cover, songItem.id, Number(songItem.duration) || 0, 'library');
                }
            } else if (typeof window.showToast === 'function') {
                window.showToast(`Album: ${albumName}`);
            }
            return;
        }

        // Playlist options more button
        const playlistMoreBtn = e.target.closest('.playlist-more-btn, .overview-playlist-more-btn, .your-playlist-more-btn, .your-playlist-grid-more-btn');
        if (playlistMoreBtn) {
            e.stopPropagation();
            const playlistName = playlistMoreBtn.dataset.playlistName || 'Playlist';
            if (typeof window.showToast === 'function') {
                window.showToast(`Options for ${playlistName}`);
            }
            return;
        }

        // Playlist item click (Recent playlist or Your playlist)
        const playlistItem = e.target.closest('.overview-playlist-item, .your-playlist-item, .your-playlist-grid-card');
        if (playlistItem && !e.target.closest('.playlist-more-btn')) {
            const playlistId = playlistItem.dataset.playlistId;
            const targetPlaylist = currentPlaylists.find(p => String(p.id) === String(playlistId));
            const playlistName = targetPlaylist?.name || playlistItem.querySelector('.overview-playlist-name, .your-playlist-title, .your-playlist-grid-title')?.textContent?.trim() || 'Playlist';
            if (targetPlaylist && targetPlaylist.songs && targetPlaylist.songs.length > 0) {
                const first = targetPlaylist.songs[0];
                if (typeof window.playPreview === 'function') {
                    window.playPreview(null, first.audio, first.name, first.artist, first.cover, first.id, Number(first.duration) || 0, 'library');
                }
            } else if (typeof window.showToast === 'function') {
                window.showToast(`Membuka playlist: ${playlistName}`);
            }
            return;
        }

        const optionsBtn = e.target.closest('.download-options-btn, .download-opt-trigger-btn');
        if (optionsBtn) {
            e.stopPropagation();
            const songItem = optionsBtn.closest('.library-song-item, .download-item');
            if (songItem) {
                const song = {
                    id: songItem.dataset.songId,
                    name: songItem.dataset.songName,
                    artist: songItem.dataset.songArtist,
                    cover: songItem.dataset.songCover,
                    audio: songItem.dataset.songAudio,
                    duration: Number(songItem.dataset.songDuration) || 0
                };
                openDownloadOptions(song);
            }
            return;
        }

        const likeBtn = e.target.closest('.like-song-btn, .track-like-btn, .overview-song-like-btn');
        if (likeBtn) {
            e.stopPropagation();
            const songItem = likeBtn.closest('.library-song-item, .track-item, .overview-song-item');
            if (!songItem) return;

            const songId = songItem.dataset.songId;
            const song = {
                id: songId,
                name: songItem.dataset.songName,
                artist: songItem.dataset.songArtist,
                cover: songItem.dataset.songCover,
                audio: songItem.dataset.songAudio,
                duration: Number(songItem.dataset.songDuration) || 0
            };

            const user = auth.currentUser;
            if (!user) {
                if (typeof window.showToast === 'function') {
                    window.showToast("Silakan login untuk mengelola lagu favorit.");
                }
                return;
            }

            const wasLiked = likeBtn.classList.contains('is-liked');
            const targetLiked = !wasLiked;

            // Optimistic update instan ke SEMUA tombol like (di halaman dan di player)
            syncAllLikeButtons(songId, targetLiked);

            try {
                const updatedList = await toggleFavorite(song);
                const isNowLiked = Array.isArray(updatedList) && updatedList.some(item => String(item.id || item.songId) === String(songId));
                syncAllLikeButtons(songId, isNowLiked);

                if (typeof window.showToast === 'function') {
                    window.showToast(isNowLiked ? `Menambahkan "${song.name}" ke Lagu yang Disukai` : `Menghapus "${song.name}" dari Lagu yang Disukai`);
                }
            } catch (err) {
                console.error("Error toggling favorite from library:", err);
                syncAllLikeButtons(songId, wasLiked);
            }
            return;
        }

        const songMoreBtn = e.target.closest('.library-song-more-btn, .track-more-btn, .overview-song-more-btn');
        if (songMoreBtn) {
            e.stopPropagation();
            const songItem = songMoreBtn.closest('.library-song-item, .track-item, .overview-song-item');
            if (songItem) {
                const song = {
                    id: songItem.dataset.songId,
                    name: songItem.dataset.songName,
                    artist: songItem.dataset.songArtist,
                    cover: songItem.dataset.songCover,
                    audio: songItem.dataset.songAudio,
                    duration: Number(songItem.dataset.songDuration) || 0
                };
                openDownloadOptions(song);
            }
            return;
        }

        const songItem = e.target.closest('.library-song-item, .track-item, .download-item, .overview-song-item');
        if (songItem && songItem.dataset.songAudio) {
            const { songId, songAudio, songName, songArtist, songCover, songDuration } = songItem.dataset;
            const currentSong = window.spotiwind?.mobile?.getCurrentSongData?.() || window.__currentSongData || (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : null);
            const isSameActiveSong = currentSong && (typeof window.areSameSongs === 'function'
                ? window.areSameSongs(currentSong, { id: songId, audio: songAudio, name: songName, artist: songArtist })
                : String(currentSong.id) === String(songId)) && window.__activeAudio && window.__activeAudio.src;

            if (typeof window.playPreview === 'function') {
                window.playPreview(
                    null,
                    songAudio,
                    songName,
                    songArtist,
                    songCover,
                    songId,
                    Number(songDuration) || 0,
                    isSameActiveSong ? null : 'library'
                );
            }
        }
    };

    libraryContainer.addEventListener('click', clickHandler);
    listeners.push({ element: libraryContainer, type: 'click', handler: clickHandler });
}

/* =============================================
   Download Options Bottom Sheet Modal Logic
   ============================================= */

let selectedDownloadSong = null;
let cleanupDownloadOptionsDrag = null;

/**
 * Setup swipe-down (collapse / dismiss) gesture only for download options bottom sheet modal
 */
function setupDownloadOptionsDrag(modalEl, onCloseCallback) {
    if (!modalEl) return () => {};

    const sheet = modalEl.querySelector('.download-options-sheet');
    const backdrop = modalEl.querySelector('.download-options-backdrop');
    if (!sheet) return () => {};

    let startX = 0;
    let startY = 0;
    let currentDeltaY = 0;
    let isDragging = false;
    let startTime = 0;
    let isListeningWindow = false;

    const resetDragStyles = () => {
        isDragging = false;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        sheet.style.transition = '';
        if (backdrop) {
            backdrop.style.opacity = '';
            backdrop.style.transition = '';
        }
        removeWindowListeners();
    };

    const removeWindowListeners = () => {
        if (!isListeningWindow) return;
        isListeningWindow = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (e) => {
        if (e.pointerType === 'mouse' && e.buttons === 0) {
            onPointerUp(e);
            return;
        }

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (!isDragging) {
            // Abaikan gesture jika dominan horizontal (touch-slop)
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
                return;
            }

            const handle = sheet.querySelector('.download-options-handle');
            const header = sheet.querySelector('.download-options-header');
            const isHandleOrHeader = Boolean(
                (handle && handle.contains(e.target)) ||
                (header && header.contains(e.target))
            );
            const dragStartThreshold = isHandleOrHeader ? 12 : 24;

            if (deltaY > dragStartThreshold) {
                isDragging = true;
                sheet.classList.add('is-dragging');
                sheet.style.transition = 'none';
                if (backdrop) backdrop.style.transition = 'none';
            } else if (deltaY < -10) {
                const rubberBand = Math.max(-12, deltaY * 0.12);
                sheet.style.transform = `translateY(${rubberBand}px)`;
                return;
            } else {
                return;
            }
        }

        if (isDragging) {
            if (e.cancelable) e.preventDefault();
            const sheetHeight = sheet.offsetHeight || 300;
            if (deltaY > 0) {
                currentDeltaY = deltaY;
                sheet.style.transform = `translateY(${deltaY}px)`;
                if (backdrop) {
                    const opacity = Math.max(0, 1 - (deltaY / (sheetHeight * 0.95)));
                    backdrop.style.opacity = String(opacity);
                }
            } else {
                currentDeltaY = 0;
                const rubberBand = Math.max(-12, deltaY * 0.12);
                sheet.style.transform = `translateY(${rubberBand}px)`;
                if (backdrop) backdrop.style.opacity = '1';
            }
        }
    };

    const onPointerUp = () => {
        removeWindowListeners();

        if (!isDragging) {
            resetDragStyles();
            return;
        }

        const sheetHeight = sheet.offsetHeight || 300;
        const elapsed = Math.max(1, Date.now() - startTime);
        const velocityY = currentDeltaY / elapsed;

        sheet.classList.remove('is-dragging');

        // Ambang penutupan: minimal 115px (atau 35% tinggi sheet), atau usapan cepat sengaja (velocity > 0.65 DAN jarak >= 45px)
        const dismissDistance = Math.max(115, sheetHeight * 0.35);
        const isIntentionalSwipe = (velocityY > 0.65 && currentDeltaY >= 45);
        const shouldDismiss = (currentDeltaY >= dismissDistance || isIntentionalSwipe);

        if (shouldDismiss) {
            sheet.style.transition = 'transform 0.24s cubic-bezier(0.32, 1, 0.23, 1)';
            if (backdrop) backdrop.style.transition = 'opacity 0.24s ease';
            sheet.style.transform = 'translateY(100%)';
            if (backdrop) backdrop.style.opacity = '0';
            setTimeout(() => {
                resetDragStyles();
                if (typeof onCloseCallback === 'function') {
                    onCloseCallback();
                }
            }, 240);
        } else {
            sheet.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
            if (backdrop) backdrop.style.transition = 'opacity 0.28s ease';
            sheet.style.transform = 'translateY(0)';
            if (backdrop) backdrop.style.opacity = '1';
            setTimeout(() => {
                resetDragStyles();
            }, 280);
        }

        isDragging = false;
    };

    const onPointerCancel = () => {
        resetDragStyles();
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        // Abaikan tombol dan elemen interaktif di dalam modal
        if (e.target.closest('button, a, input, [role="button"]')) return;

        startX = e.clientX;
        startY = e.clientY;
        currentDeltaY = 0;
        startTime = Date.now();

        if (!isListeningWindow) {
            isListeningWindow = true;
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
        }
    };

    sheet.addEventListener('pointerdown', onPointerDown);

    return () => {
        sheet.removeEventListener('pointerdown', onPointerDown);
        removeWindowListeners();
        resetDragStyles();
    };
}

function openDownloadOptions(song) {
    selectedDownloadSong = song;
    const modal = document.getElementById('downloadOptionsModal');
    const titleEl = document.getElementById('optionsSongTitle');
    const artistEl = document.getElementById('optionsSongArtist');
    const coverEl = document.getElementById('optionsSongCover');

    if (titleEl) titleEl.textContent = song.name || song.title || 'Track';
    if (artistEl) artistEl.textContent = song.artist || 'Unknown Artist';
    if (coverEl) coverEl.src = song.cover || '../../public/branding/Spotiwind.webp';

    const deleteOfflineBtn = document.getElementById('optDeleteOfflineBtn');
    if (deleteOfflineBtn) {
        const isDownloaded = typeof isSongDownloaded === 'function'
            ? isSongDownloaded(song.id)
            : (typeof window.isSongDownloaded === 'function' ? window.isSongDownloaded(song.id) : false);
        const titleSpan = deleteOfflineBtn.querySelector('.opt-title');
        const descSpan = deleteOfflineBtn.querySelector('.opt-desc');
        const iconContainer = deleteOfflineBtn.querySelector('.opt-btn-icon');

        if (isDownloaded) {
            deleteOfflineBtn.classList.add('btn-danger');
            if (titleSpan) titleSpan.textContent = 'Hapus dari Unduhan Offline';
            if (descSpan) descSpan.textContent = 'Hapus audio dari penyimpanan aplikasi';
            if (iconContainer) {
                iconContainer.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                `;
            }
        } else {
            deleteOfflineBtn.classList.remove('btn-danger');
            if (titleSpan) titleSpan.textContent = 'Unduh untuk Offline';
            if (descSpan) descSpan.textContent = 'Simpan audio agar bisa diputar tanpa internet';
            if (iconContainer) {
                iconContainer.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                `;
            }
        }
    }

    if (modal) {
        const sheet = modal.querySelector('.download-options-sheet');
        if (sheet) {
            sheet.classList.remove('is-dragging');
            sheet.style.transform = '';
        }
        modal.classList.remove('hidden');
        modal.removeAttribute('aria-hidden');
        modal.removeAttribute('inert');
        document.body.classList.add('modal-open');
    }
}

function closeDownloadOptions() {
    selectedDownloadSong = null;
    const modal = document.getElementById('downloadOptionsModal');
    if (modal) {
        if (document.activeElement && modal.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        const sheet = modal.querySelector('.download-options-sheet');
        if (sheet) {
            sheet.classList.remove('is-dragging');
            sheet.style.transform = '';
        }
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
        document.body.classList.remove('modal-open');
    }
}

function setupDownloadOptionsModal() {
    const modal = document.getElementById('downloadOptionsModal');
    const backdrop = document.getElementById('downloadOptionsBackdrop');
    const cancelBtn = document.getElementById('optCancelBtn');
    const saveToDeviceBtn = document.getElementById('optSaveToDeviceBtn');
    const deleteOfflineBtn = document.getElementById('optDeleteOfflineBtn');

    if (modal) {
        if (cleanupDownloadOptionsDrag) {
            cleanupDownloadOptionsDrag();
            cleanupDownloadOptionsDrag = null;
        }
        cleanupDownloadOptionsDrag = setupDownloadOptionsDrag(modal, closeDownloadOptions);
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeDownloadOptions);
        listeners.push({ element: backdrop, type: 'click', handler: closeDownloadOptions });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeDownloadOptions);
        listeners.push({ element: cancelBtn, type: 'click', handler: closeDownloadOptions });
    }

    if (saveToDeviceBtn) {
        const handleSave = async () => {
            if (selectedDownloadSong && typeof window.downloadMp3ToDevice === 'function') {
                const song = { ...selectedDownloadSong };
                const originalHtml = saveToDeviceBtn.innerHTML;

                // Animate to saving/loading state
                saveToDeviceBtn.disabled = true;
                saveToDeviceBtn.innerHTML = `
                    <div class="opt-btn-icon icon-save">
                        <svg class="spin-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </div>
                    <div class="opt-btn-text">
                        <span class="opt-title">Menyiapkan File MP3...</span>
                        <span class="opt-desc">Mengekspor file musik ke penyimpanan HP</span>
                    </div>
                `;

                try {
                    await window.downloadMp3ToDevice(song);

                    // Animate to success checkmark
                    saveToDeviceBtn.innerHTML = `
                        <div class="opt-btn-icon icon-save" style="background: rgba(34, 197, 94, 0.25);">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="opt-btn-text">
                            <span class="opt-title" style="color: #22c55e;">File MP3 Berhasil Disimpan!</span>
                            <span class="opt-desc">Tersimpan di folder Download perangkat</span>
                        </div>
                    `;

                    setTimeout(() => {
                        saveToDeviceBtn.disabled = false;
                        saveToDeviceBtn.innerHTML = originalHtml;
                        closeDownloadOptions();
                        if (typeof window.showToast === 'function') {
                            window.showToast(`File MP3 "${song.name || 'Lagu'}" berhasil disimpan ke perangkat!`);
                        }
                    }, 800);
                } catch (err) {
                    console.error("Save to device error:", err);
                    saveToDeviceBtn.disabled = false;
                    saveToDeviceBtn.innerHTML = originalHtml;
                    closeDownloadOptions();
                    if (typeof window.showToast === 'function') {
                        window.showToast("Gagal menyimpan file ke perangkat.");
                    }
                }
            } else {
                closeDownloadOptions();
            }
        };
        saveToDeviceBtn.addEventListener('click', handleSave);
        listeners.push({ element: saveToDeviceBtn, type: 'click', handler: handleSave });
    }

    if (deleteOfflineBtn) {
        const handleDelete = () => {
            if (selectedDownloadSong) {
                const song = { ...selectedDownloadSong };
                closeDownloadOptions();
                if (typeof toggleDownloadSong === 'function') {
                    toggleDownloadSong(song);
                } else if (typeof window.toggleDownloadSong === 'function') {
                    window.toggleDownloadSong(song);
                }
                renderDownloadsPanel();
            } else {
                closeDownloadOptions();
            }
        };
        deleteOfflineBtn.addEventListener('click', handleDelete);
        listeners.push({ element: deleteOfflineBtn, type: 'click', handler: handleDelete });
    }
}

function cleanupUserSubscriptions() {
    if (typeof likedSongsUnsubscribe === 'function') {
        likedSongsUnsubscribe();
        likedSongsUnsubscribe = null;
    }
    if (typeof playlistsUnsubscribe === 'function') {
        playlistsUnsubscribe();
        playlistsUnsubscribe = null;
    }
    if (typeof userProfileUnsubscribe === 'function') {
        userProfileUnsubscribe();
        userProfileUnsubscribe = null;
    }
}

export function cleanupLibraryPage() {
    closeDownloadOptions();
    closeProSubscriptionModal();
    cleanupUserSubscriptions();

    if (cleanupDownloadOptionsDrag) {
        cleanupDownloadOptionsDrag();
        cleanupDownloadOptionsDrag = null;
    }

    listeners.forEach((item) => {
        if (item.element && item.type && item.handler) {
            item.element.removeEventListener(item.type, item.handler);
        }
        if (typeof item.cleanup === 'function') {
            item.cleanup();
        }
    });
    listeners.length = 0;
}
