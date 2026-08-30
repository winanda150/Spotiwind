/**
 * Library Page Module (Mobile)
 * Handles Tabs, Real-time Liked Songs, Downloads & Overview statistics.
 */

import { auth, db, onAuthStateChanged, collection, onSnapshot, query, orderBy } from './firebase-config.js';
import { getFavoriteSongs } from '../../services/favoriteService.js';
import { getUserPlaylists } from '../../services/libraryService.js';

let activeLibraryTab = 'overview';
const listeners = [];
let likedSongsUnsubscribe = null;
let playlistsUnsubscribe = null;
let currentLikedSongs = [];
let currentPlaylists = [];

export function switchToLibraryTab(tabKey, options = {}) {
    const tabs = document.querySelectorAll('[data-library-tab]');
    const tabsContainer = document.querySelector('.library-tabs');
    const indicator = document.querySelector('.library-active-indicator');
    const panels = document.querySelectorAll('[data-library-panel]');
    if (!tabs.length) return;

    const targetTab = Array.from(tabs).find(t => t.dataset.libraryTab === tabKey) || tabs[0];
    activeLibraryTab = targetTab.dataset.libraryTab || 'overview';

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
    } else if (activeLibraryTab === 'download') {
        renderDownloadsPanel();
    } else if (activeLibraryTab === 'tracks') {
        renderTracksPanel(currentLikedSongs, !auth.currentUser);
    } else if (activeLibraryTab === 'playlists') {
        renderPlaylistsPanel(currentPlaylists, !auth.currentUser);
    }
}

export async function initLibraryPage(initialTab = 'overview') {
    window.switchToLibraryTab = switchToLibraryTab;
    setupLibraryTabs(initialTab);
    setupOverviewCards();
    setupRealtimeOverviewData();
    setupSongActionListeners();
    setupDownloadOptionsModal();

    // Listen for custom downloads-updated event
    const handleDownloadsUpdated = () => {
        updateLocalStats();
        if (activeLibraryTab === 'download') {
            renderDownloadsPanel();
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

function setupRealtimeOverviewData() {
    // 1. Update localStorage-based counts (Downloads)
    updateLocalStats();
    renderDownloadsPanel();

    // 2. Listen to Auth State to bind live Firestore data
    const authUnsub = onAuthStateChanged(auth, async (user) => {
        cleanupUserSubscriptions();

        if (user) {
            bindUserLikedSongs(user.uid);
            bindUserPlaylists(user.uid);
        } else {
            currentLikedSongs = [];
            currentPlaylists = [];
            setLikedSongsCount(0);
            setFavoritesCount(0);
            renderTracksPanel([], true);
            renderPlaylistsPanel([], true);
            renderRecentPlaylistsOverview([], true);
            renderLikedSongsOverview([], true);
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
        }, async (error) => {
            console.warn("Firestore snapshot error, falling back to getFavoriteSongs:", error);
            const fallbackSongs = await getFavoriteSongs(uid);
            const sorted = sortSongsByNewest(fallbackSongs);
            currentLikedSongs = sorted;
            setLikedSongsCount(sorted.length);
            renderTracksPanel(sorted, false);
            renderLikedSongsOverview(sorted, false);
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
        const savedDownloads = JSON.parse(localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]');
        const count = Array.isArray(savedDownloads) ? savedDownloads.length : 0;
        setDownloadsCount(count);
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
    const { isDownloadView = false } = options;
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

    return `
        <div class="library-song-item ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${songId}" data-audio="${audio}" data-song-id="${songId}" data-song-audio="${audio}" data-song-name="${name}" data-song-artist="${artist}" data-song-cover="${coverUrl}" data-song-duration="${duration}">
            <div class="library-song-cover-wrapper">
                <img src="${coverUrl}" alt="${name}" class="library-song-cover" width="46" height="46" loading="lazy" onerror="this.src='${defaultCover}'">
                <div class="library-song-play-icon" aria-hidden="true">
                    ${isActive && !isPaused ? `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    ` : `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                    `}
                </div>
            </div>
            <div class="library-song-info">
                <h3 class="library-song-name">${name}</h3>
                <p class="library-song-artist">${artist}</p>
                ${isDownloadView ? `
                    <div class="library-download-progress-track ${song.downloadStatus === 'downloading' ? '' : 'hidden'}" id="downloadTrack_${songId}">
                        <div class="library-download-progress-fill ${song.downloadStatus === 'completed' ? 'is-done' : ''}" id="downloadFill_${songId}" style="width: ${song.downloadProgress || 10}%;"></div>
                    </div>
                ` : ''}
            </div>
            <div class="library-song-meta">
                ${isDownloadView ? `
                    <span class="library-download-status-badge ${song.downloadStatus === 'downloading' ? '' : 'hidden'}" id="downloadBadge_${songId}">
                        <svg class="spin-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        <span id="downloadText_${songId}">${song.downloadProgress || 10}%</span>
                    </span>
                    <span class="library-song-duration ${song.downloadStatus === 'downloading' ? 'hidden' : ''}" id="downloadDuration_${songId}">${durationText}</span>
                    <button class="library-song-action-btn download-options-btn ${song.downloadStatus === 'downloading' ? 'hidden' : ''}" id="downloadOptBtn_${songId}" type="button" data-song-id="${songId}" title="Opsi Unduhan" aria-label="Opsi Unduhan">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                ` : `
                    ${duration ? `<span class="library-song-duration">${durationText}</span>` : ''}
                    <button class="library-song-action-btn download-song-btn" type="button" data-song-id="${songId}" title="Download song" aria-label="Download song">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                `}
            </div>
        </div>
    `;
}

/* =============================================
   Panel Renderers
   ============================================= */

function renderRecentPlaylistsOverview(playlists = [], isGuest = false) {
    const container = document.getElementById('overviewRecentList');
    if (!container) return;

    if (isGuest) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <h3 class="library-empty-title">Create your custom playlists</h3>
                <p class="library-empty-desc">Log in to create, organize, and view your custom playlists.</p>
                <a href="auth-mobile.html" class="library-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const sortedPlaylists = sortPlaylistsByNewest(playlists);

    if (!Array.isArray(sortedPlaylists) || sortedPlaylists.length === 0) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <h3 class="library-empty-title">No playlists yet</h3>
                <p class="library-empty-desc">Create your first custom playlist to see it here.</p>
            </div>
        `;
        return;
    }

    const recentPlaylists = sortedPlaylists.slice(0, 5);

    container.innerHTML = recentPlaylists.map(p => `
        <div class="library-song-item" data-playlist-id="${p.id}">
            <div class="library-song-cover-wrapper" style="background: linear-gradient(135deg, #B91EC9, #8B5CF6); display: flex; align-items: center; justify-content: center; color: #fff;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div class="library-song-info">
                <h3 class="library-song-name">${p.name || 'Untitled Playlist'}</h3>
                <p class="library-song-artist">${formatCount(p.songs?.length || 0, 'song', 'songs')}</p>
            </div>
            <div class="library-song-meta">
                <button class="library-song-action-btn playlist-more-btn" type="button" data-playlist-id="${p.id}" data-playlist-name="${p.name || ''}" title="Playlist options" aria-label="Playlist options">
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

function renderTracksPanel(songs = [], isGuest = false) {
    const container = document.getElementById('libraryTracksList');
    if (!container) return;

    if (isGuest) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="library-empty-title">Save your favorite tracks</h3>
                <p class="library-empty-desc">Log in to like songs and access them on any device.</p>
                <a href="auth-mobile.html" class="library-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    if (!Array.isArray(songs) || songs.length === 0) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="library-empty-title">No liked songs yet</h3>
                <p class="library-empty-desc">Tap the heart icon on any song you love to save it here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = songs.map(song => createSongItemHTML(song)).join('');
    if (typeof window.syncActiveSongUI === 'function') {
        window.syncActiveSongUI();
    }
}

function renderDownloadsPanel() {
    const container = document.getElementById('libraryDownloadsList');
    if (!container) return;

    try {
        const raw = localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]';
        const downloads = JSON.parse(raw);

        if (!Array.isArray(downloads) || downloads.length === 0) {
            container.innerHTML = `
                <div class="library-empty-state">
                    <div class="library-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </div>
                    <h3 class="library-empty-title">No downloaded songs</h3>
                    <p class="library-empty-desc">Download tracks to listen offline wherever you go.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = downloads.map(song => createSongItemHTML(song, { isDownloadView: true })).join('');
        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }
    } catch {
        container.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 1rem;">Unable to load downloads.</p>`;
    }
}

function renderPlaylistsPanel(playlists = [], isGuest = false) {
    const container = document.getElementById('libraryPlaylistsList');
    if (!container) return;

    if (isGuest) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <h3 class="library-empty-title">Create your custom playlists</h3>
                <p class="library-empty-desc">Log in to create, edit, and organize your favorite music.</p>
                <a href="auth-mobile.html" class="library-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const sortedPlaylists = sortPlaylistsByNewest(playlists);

    if (!Array.isArray(sortedPlaylists) || sortedPlaylists.length === 0) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </div>
                <h3 class="library-empty-title">No playlists created</h3>
                <p class="library-empty-desc">Create custom playlists to organize your favorite music.</p>
                <button class="library-empty-btn" type="button" data-action="add-playlist">+ Create Playlist</button>
            </div>
        `;
        return;
    }

    container.innerHTML = sortedPlaylists.map(p => `
        <div class="library-song-item" data-playlist-id="${p.id}">
            <div class="library-song-cover-wrapper" style="background: linear-gradient(135deg, #B91EC9, #8B5CF6); display: flex; align-items: center; justify-content: center; color: #fff;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div class="library-song-info">
                <h3 class="library-song-name">${p.name || 'Untitled Playlist'}</h3>
                <p class="library-song-artist">${formatCount(p.songs?.length || 0, 'song', 'songs')}</p>
            </div>
            <div class="library-song-meta">
                <button class="library-song-action-btn playlist-more-btn" type="button" data-playlist-id="${p.id}" data-playlist-name="${p.name || ''}" title="Playlist options" aria-label="Playlist options">
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

function renderLikedSongsOverview(songs = [], isGuest = false) {
    const container = document.getElementById('overviewLikedList');
    if (!container) return;

    if (isGuest) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="library-empty-title">Save your favorite tracks</h3>
                <p class="library-empty-desc">Log in to like songs and access them on any device.</p>
                <a href="auth-mobile.html" class="library-empty-btn">Log In / Sign Up</a>
            </div>
        `;
        return;
    }

    const sortedSongs = sortSongsByNewest(songs);

    if (!Array.isArray(sortedSongs) || sortedSongs.length === 0) {
        container.innerHTML = `
            <div class="library-empty-state">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <h3 class="library-empty-title">No liked songs yet</h3>
                <p class="library-empty-desc">Tap the heart icon on any song you love to save it here.</p>
            </div>
        `;
        return;
    }

    const recentLiked = sortedSongs.slice(0, 5);
    container.innerHTML = recentLiked.map(song => createSongItemHTML(song)).join('');
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

    const clickHandler = (e) => {
        const emptyAuthBtn = e.target.closest('a.library-empty-btn, a[href*="auth"]');
        if (emptyAuthBtn) {
            e.preventDefault();
            if (typeof window.navigateToAuthPage === 'function') {
                window.navigateToAuthPage('login');
            } else {
                window.location.href = 'auth-mobile.html';
            }
            return;
        }

        const createPlaylistBtn = e.target.closest('#createPlaylistBtn, [data-action="add-playlist"], .library-create-btn');
        if (createPlaylistBtn) {
            e.preventDefault();
            if (typeof window.openCreatePlaylistModal === 'function') {
                window.openCreatePlaylistModal(createPlaylistBtn);
            }
            return;
        }

        const playlistMoreBtn = e.target.closest('.playlist-more-btn');
        if (playlistMoreBtn) {
            e.stopPropagation();
            const playlistName = playlistMoreBtn.dataset.playlistName || 'Playlist';
            if (typeof window.showToast === 'function') {
                window.showToast(`Options for ${playlistName}`);
            }
            return;
        }

        const optionsBtn = e.target.closest('.download-options-btn');
        if (optionsBtn) {
            e.stopPropagation();
            const songItem = optionsBtn.closest('.library-song-item');
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

        const downloadBtn = e.target.closest('.download-song-btn');
        if (downloadBtn) {
            e.stopPropagation();
            const songItem = downloadBtn.closest('.library-song-item');
            if (songItem && window.toggleDownloadSong) {
                const song = {
                    id: songItem.dataset.songId,
                    name: songItem.dataset.songName,
                    artist: songItem.dataset.songArtist,
                    cover: songItem.dataset.songCover,
                    audio: songItem.dataset.songAudio,
                    duration: Number(songItem.dataset.songDuration) || 0
                };
                window.toggleDownloadSong(song);
            }
            return;
        }

        const songItem = e.target.closest('.library-song-item');
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

function openDownloadOptions(song) {
    selectedDownloadSong = song;
    const modal = document.getElementById('downloadOptionsModal');
    const titleEl = document.getElementById('optionsSongTitle');
    const artistEl = document.getElementById('optionsSongArtist');
    const coverEl = document.getElementById('optionsSongCover');

    if (titleEl) titleEl.textContent = song.name || song.title || 'Track';
    if (artistEl) artistEl.textContent = song.artist || 'Unknown Artist';
    if (coverEl) coverEl.src = song.cover || '../../public/Elemen/Logo/Spotiwind.webp';

    if (modal) {
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
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
        document.body.classList.remove('modal-open');
    }
}

function setupDownloadOptionsModal() {
    const backdrop = document.getElementById('downloadOptionsBackdrop');
    const cancelBtn = document.getElementById('optCancelBtn');
    const saveToDeviceBtn = document.getElementById('optSaveToDeviceBtn');
    const deleteOfflineBtn = document.getElementById('optDeleteOfflineBtn');

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
            if (selectedDownloadSong && typeof window.toggleDownloadSong === 'function') {
                const song = { ...selectedDownloadSong };
                closeDownloadOptions();
                window.toggleDownloadSong(song);
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
}

export function cleanupLibraryPage() {
    closeDownloadOptions();
    cleanupUserSubscriptions();

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
