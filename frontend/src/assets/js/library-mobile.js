/**
 * Library Page Module (Mobile)
 * Handles Tabs, Real-time Liked Songs & Overview statistics.
 */

import { auth, db, onAuthStateChanged, collection, onSnapshot } from './firebase-config.js';
import { getFavoriteSongs } from '../../services/favoriteService.js';
import { getUserPlaylists } from '../../services/libraryService.js';

let activeLibraryTab = 'overview';
const listeners = [];
let likedSongsUnsubscribe = null;
let playlistsUnsubscribe = null;

export async function initLibraryPage() {
    setupLibraryTabs();
    setupOverviewCards();
    setupRealtimeOverviewData();
}

function setupLibraryTabs() {
    const tabs = document.querySelectorAll('[data-library-tab]');
    const indicator = document.querySelector('.library-active-indicator');
    const panels = document.querySelectorAll('[data-library-panel]');

    const moveIndicator = (tab) => {
        if (!tab || !indicator) return;
        indicator.style.width = `${tab.offsetWidth}px`;
        indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
    };

    const switchPanel = (tabKey) => {
        panels.forEach((panel) => {
            const isMatch = panel.dataset.libraryPanel === tabKey;
            panel.classList.toggle('is-active', isMatch);
        });
    };

    tabs.forEach((tab) => {
        const handler = () => {
            activeLibraryTab = tab.dataset.libraryTab;
            tabs.forEach((item) => {
                const isActive = item === tab;
                item.classList.toggle('is-active', isActive);
                item.setAttribute('aria-selected', String(isActive));
            });
            moveIndicator(tab);
            switchPanel(activeLibraryTab);
        };
        tab.addEventListener('click', handler);
        listeners.push({ element: tab, type: 'click', handler });
    });

    const activeTabEl = document.querySelector('[data-library-tab].is-active') || tabs[0];
    if (activeTabEl) {
        requestAnimationFrame(() => moveIndicator(activeTabEl));
        switchPanel(activeTabEl.dataset.libraryTab || 'overview');
    }

    const resizeHandler = () => {
        const currentActive = document.querySelector(`[data-library-tab="${activeLibraryTab}"]`) || tabs[0];
        moveIndicator(currentActive);
    };
    window.addEventListener('resize', resizeHandler);
    listeners.push({ element: window, type: 'resize', handler: resizeHandler });
}

function setupOverviewCards() {
    const cards = document.querySelectorAll('[data-overview-item]');
    cards.forEach((card) => {
        const handler = () => {
            const itemType = card.dataset.overviewItem;
            console.log(`[Library] Overview item clicked: ${itemType}`);
            // Navigasi atau filter jika diperlukan
        };
        card.addEventListener('click', handler);
        listeners.push({ element: card, type: 'click', handler });
    });
}

function formatCount(count, singular = 'song', plural = 'songs') {
    const n = Number(count) || 0;
    const formattedNumber = (n > 0 && n < 10) ? `0${n}` : `${n}`;
    return `${formattedNumber} ${n === 1 ? singular : plural}`;
}

function setupRealtimeOverviewData() {
    // 1. Update localStorage-based counts (Downloads & Recently Played)
    updateLocalStats();

    // 2. Listen to Auth State to bind live Firestore data
    const authUnsub = onAuthStateChanged(auth, async (user) => {
        cleanupUserSubscriptions();

        if (user) {
            bindUserLikedSongs(user.uid);
            bindUserPlaylists(user.uid);
        } else {
            setLikedSongsCount(0);
            setFavoritesCount(0);
        }
    });

    listeners.push({ cleanup: authUnsub });
}

function bindUserLikedSongs(uid) {
    if (!uid) return;

    try {
        const likedRef = collection(db, "users", uid, "liked_songs");
        likedSongsUnsubscribe = onSnapshot(likedRef, (snapshot) => {
            const count = snapshot.docs.length;
            setLikedSongsCount(count);
        }, async (error) => {
            console.warn("Firestore snapshot error, falling back to getFavoriteSongs:", error);
            const fallbackSongs = await getFavoriteSongs(uid);
            setLikedSongsCount(fallbackSongs.length);
        });
    } catch (e) {
        console.error("Error setting up liked songs listener:", e);
    }
}

function bindUserPlaylists(uid) {
    if (!uid) return;

    try {
        const playlistsRef = collection(db, "users", uid, "playlists");
        playlistsUnsubscribe = onSnapshot(playlistsRef, (snapshot) => {
            const count = snapshot.docs.length;
            setFavoritesCount(count);
        }, async (error) => {
            console.warn("Firestore playlists snapshot error, falling back:", error);
            const fallbackPlaylists = await getUserPlaylists(uid);
            setFavoritesCount(fallbackPlaylists.length);
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
}

function setDownloadsCount(count) {
    const el = document.getElementById('overviewDownloadsCount');
    if (el) el.textContent = formatCount(count, 'song', 'songs');
}

function setRecentCount(count) {
    const el = document.getElementById('overviewRecentCount');
    if (el) el.textContent = formatCount(count, 'song', 'songs');
}

function setFavoritesCount(count) {
    const el = document.getElementById('overviewFavoritesCount');
    if (el) el.textContent = formatCount(count, 'playlist', 'playlists');
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
