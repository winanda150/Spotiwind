/**
 * Artist Page Module
 * Handles all logic for the artist-mobile.html page.
 */

import { defaultAvatar } from '../../utils/formatters.js';
import { showToast } from '../../utils/domUtils.js';
import { getArtistUniqueId } from '../../utils/audioUtils.js';

// These functions are expected to be available in the global scope from home-mobile.js
const {
    fetchWithContinuousRetry = (fn) => (typeof fn === 'function' ? fn() : null),
    fetchLocalArtistSongs,
    fetchArtistSongs,
    loadPageContent = (page, opts) => (typeof window.loadPageContent === 'function' ? window.loadPageContent(page, opts) : null),
    initializeSkeletons = () => {}
} = (window.spotiwind && window.spotiwind.mobile) || {};

import {
    isFollowingArtist as isArtistFollowed,
    toggleFollowArtist
} from '../../services/userService.js';
import { auth, onAuthStateChanged } from './firebase-config.js';

let parallaxHandler = null;
let artistPageTitleVisibilityTimeout = null;
let currentArtistData = null;
const isGlobalShuffleActive = () => {
    if (typeof window.getPlaybackShuffle === 'function') {
        return window.getPlaybackShuffle();
    }
    return Boolean(window.__spotiwindIsShuffle);
};

const setGlobalShuffleState = (val) => {
    if (typeof window.togglePlaybackShuffle === 'function') {
        window.togglePlaybackShuffle(val);
    } else if (typeof window.setPlaybackShuffle === 'function') {
        window.setPlaybackShuffle(val);
    } else {
        window.__spotiwindIsShuffle = Boolean(val);
        const fullBtn = document.getElementById('fullShuffleBtn');
        if (fullBtn) fullBtn.classList.toggle('active', Boolean(val));
    }
};
let authUnsubscribe = null;

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

/**
 * Redirects guest user to authentication page
 */
const redirectToAuth = () => {
    showToast('Silakan login terlebih dahulu untuk mengikuti artis.');
    if (typeof window.navigateToAuthPage === 'function') {
        window.navigateToAuthPage('login');
    } else if (typeof window.loadPageContent === 'function') {
        window.loadPageContent('auth-mobile.html', { pushState: true });
    }
};

/**
 * Synchronize Follow button UI
 */
const syncFollowUI = (isFollowed) => {
    const btn = document.getElementById('artistFollowBtn');
    const text = btn?.querySelector('.artist-follow-text');
    if (btn && text) {
        btn.classList.toggle('is-following', Boolean(isFollowed));
        text.textContent = isFollowed ? 'Following' : 'Follow';
    }
    const optText = document.getElementById('artistOptFollowText');
    if (optText) {
        optText.textContent = isFollowed ? 'Unfollow Artist' : 'Follow Artist';
    }
};

/**
 * Handles follow / unfollow toggle
 */
const handleFollowClick = async (artist) => {
    const user = auth.currentUser;
    if (!user) {
        redirectToAuth();
        return;
    }

    const followBtn = document.getElementById('artistFollowBtn');
    const wasFollowing = followBtn?.classList.contains('is-following');
    const optimisticState = !wasFollowing;

    // Optimistic UI update
    syncFollowUI(optimisticState);

    try {
        const result = await toggleFollowArtist(artist);
        if (result.requireAuth) {
            syncFollowUI(false);
            redirectToAuth();
            return;
        }
        syncFollowUI(result.isFollowing);
        showToast(result.isFollowing ? `Mengikuti ${artist.name}` : `Berhenti mengikuti ${artist.name}`);
    } catch (err) {
        console.error("Failed to toggle follow status:", err);
        // Rollback on error
        syncFollowUI(wasFollowing);
        showToast('Gagal memperbarui status mengikuti');
    }
};

/**
 * Modal options sheet helpers
 */
let sheetPointerDownHandler = null;
let cleanupActiveWindowListeners = null;

const resetArtistSheetStyles = () => {
    if (typeof cleanupActiveWindowListeners === 'function') {
        cleanupActiveWindowListeners();
    }
    const sheet = document.getElementById('artistOptionsSheet') || document.querySelector('.artist-options-sheet');
    const backdrop = document.getElementById('artistOptionsBackdrop');
    if (sheet) {
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        sheet.style.transition = '';
    }
    if (backdrop) {
        backdrop.style.opacity = '';
        backdrop.style.transition = '';
    }
};

const setupArtistSheetDragToDismiss = () => {
    const sheet = document.getElementById('artistOptionsSheet') || document.querySelector('.artist-options-sheet');
    const backdrop = document.getElementById('artistOptionsBackdrop');
    if (!sheet) return;

    if (sheetPointerDownHandler) {
        sheet.removeEventListener('pointerdown', sheetPointerDownHandler);
        sheetPointerDownHandler = null;
    }
    if (typeof cleanupActiveWindowListeners === 'function') {
        cleanupActiveWindowListeners();
    }

    let isListeningWindow = false;
    let onPointerMove = null;
    let onPointerUp = null;

    const removeWindowListeners = () => {
        if (!isListeningWindow) return;
        isListeningWindow = false;
        cleanupActiveWindowListeners = null;
        if (onPointerMove) window.removeEventListener('pointermove', onPointerMove);
        if (onPointerUp) {
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
        }
    };

    sheetPointerDownHandler = (e) => {
        // Hanya tangani tombol utama (left click atau sentuhan jari tunggal)
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;

        // Abaikan tombol interaktif di dalam modal agar klik/tap tidak terganggu
        if (e.target.closest('button, a, input, [role="button"]')) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();
        let currentDeltaY = 0;
        let isDragging = false;

        const handleWrapper = document.getElementById('artistOptionsHandleWrapper');
        const header = document.getElementById('artistOptionsHeader');
        // Pembeda area: apakah sentuhan dimulai dari handle bar atau header (area utama untuk drag)
        const isTouchOnHandleOrHeader = Boolean(
            (handleWrapper && handleWrapper.contains(e.target)) ||
            (header && header.contains(e.target))
        );

        // Ambang aktivasi drag:
        // Handle bar/header: 12px (responsif tapi aman dari jitter)
        // Badan/list: 24px (membutuhkan tarikan sengaja agar tidak sensitif saat pengguna mengincar tombol)
        const dragStartThreshold = isTouchOnHandleOrHeader ? 12 : 24;

        onPointerMove = (moveEvent) => {
            if (moveEvent.pointerType === 'mouse' && moveEvent.buttons === 0) {
                onPointerUp();
                return;
            }

            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            if (!isDragging) {
                // Jika gerakan didominasi horizontal, abaikan agar usapan diagonal tidak memicu drag
                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
                    return;
                }

                // Hanya aktifkan status dragging jika tarikan ke bawah melampaui ambang batas sengaja
                if (deltaY > dragStartThreshold) {
                    isDragging = true;
                    sheet.classList.add('is-dragging');
                    sheet.style.transition = 'none';
                    if (backdrop) backdrop.style.transition = 'none';
                } else if (deltaY < -10) {
                    // Sedikit tahanan elastis jika jari bergerak sedikit ke atas
                    const rubberBand = Math.max(-12, deltaY * 0.12);
                    sheet.style.transform = `translateY(${rubberBand}px)`;
                    return;
                } else {
                    return;
                }
            }

            if (isDragging) {
                if (moveEvent.cancelable) moveEvent.preventDefault();

                const sheetHeight = sheet.offsetHeight || 320;

                if (deltaY > 0) {
                    currentDeltaY = deltaY;
                    sheet.style.transform = `translateY(${deltaY}px)`;
                    if (backdrop) {
                        const opacity = Math.max(0, 1 - (deltaY / (sheetHeight * 0.95)));
                        backdrop.style.opacity = String(opacity);
                    }
                } else {
                    // Batasi jika ditarik kembali melewati posisi normal
                    currentDeltaY = 0;
                    const rubberBand = Math.max(-12, deltaY * 0.12);
                    sheet.style.transform = `translateY(${rubberBand}px)`;
                    if (backdrop) backdrop.style.opacity = '1';
                }
            }
        };

        onPointerUp = () => {
            removeWindowListeners();

            if (!isDragging) {
                // Kembalikan posisi jika ada sisa rubber-band kecil tanpa status dragging
                resetArtistSheetStyles();
                return;
            }

            const sheetHeight = sheet.offsetHeight || 320;
            const elapsed = Math.max(1, Date.now() - startTime);
            const velocity = currentDeltaY / elapsed; // px/ms

            // Kondisi penutupan (dismiss thresholds):
            // 1. Jarak tarikan cukup jauh: minimal 115px atau 35% tinggi modal
            // 2. Gerakan usap cepat (flick down): velocity > 0.65 px/ms DAN jarak tarikan sudah minimal 45px
            const dismissDistance = Math.max(115, sheetHeight * 0.35);
            const isIntentionalSwipe = (velocity > 0.65 && currentDeltaY >= 45);
            const shouldDismiss = (currentDeltaY >= dismissDistance || isIntentionalSwipe);

            sheet.classList.remove('is-dragging');

            if (shouldDismiss) {
                sheet.style.transition = 'transform 0.24s cubic-bezier(0.32, 1, 0.23, 1)';
                if (backdrop) backdrop.style.transition = 'opacity 0.24s ease';

                sheet.style.transform = 'translateY(100%)';
                if (backdrop) backdrop.style.opacity = '0';

                setTimeout(() => {
                    closeArtistOptions();
                    resetArtistSheetStyles();
                }, 240);
            } else {
                // Snap-back membal lembut ke posisi 0
                sheet.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
                if (backdrop) backdrop.style.transition = 'opacity 0.28s ease';

                sheet.style.transform = 'translateY(0)';
                if (backdrop) backdrop.style.opacity = '1';

                setTimeout(() => {
                    resetArtistSheetStyles();
                }, 280);
            }

            isDragging = false;
        };

        isListeningWindow = true;
        cleanupActiveWindowListeners = removeWindowListeners;
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    };

    sheet.addEventListener('pointerdown', sheetPointerDownHandler);
};

/**
 * Helper to generate canonical artist share URL (clean Spotify-like format: /artist/<22CharHash>)
 */
export const getArtistShareUrl = (artist) => {
    const origin = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : window.location.href.split('/frontend')[0];
    const uniqueId = getArtistUniqueId(artist);
    return `${origin}/artist/${uniqueId || encodeURIComponent(artist?.name || '')}`;
};

/**
 * Helper to sanitize and resolve official artist photo.
 * Filters out song covers (e.g. Image Songs folder) and finds official artist photo.
 */
const resolveArtistPhoto = (artist) => {
    let photo = artist?.photo || artist?.image || '';
    // If it points to Image Songs, it is an album/track cover, NOT an artist photo!
    if (photo && (photo.includes('Image%20Songs') || photo.includes('Image Songs'))) {
        photo = '';
    }

    if (!photo && artist?.name) {
        const localArtists = (typeof window.spotiwind?.mobile?.getArtists === 'function')
            ? window.spotiwind.mobile.getArtists()
            : (Array.isArray(window.__indonesianArtistsPlaylist) ? window.__indonesianArtistsPlaylist : []);
        const targetName = artist.name.toLowerCase().trim();
        const found = localArtists.find(a => (a.name || '').toLowerCase().trim() === targetName);
        if (found && found.photo && !found.photo.includes('Image%20Songs') && !found.photo.includes('Image Songs')) {
            photo = found.photo;
        }
    }

    if (photo && !photo.startsWith('http://') && !photo.startsWith('https://') && !photo.startsWith('data:')) {
        const cleanPath = String(photo)
            .replace(/^(\.\.\/)+public\//, '')
            .replace(/^(\.\.\/)+/, '')
            .replace(/^\/?frontend\/public\//, '')
            .replace(/^\/?public\//, '')
            .replace(/^\/+/, '');
        photo = `../../public/${cleanPath}`;
    }

    return photo;
};

const openArtistOptions = async (artist) => {
    const modal = document.getElementById('artistOptionsModal');
    if (!modal) return;
    resetArtistSheetStyles();

    const photo = modal.querySelector('#artistOptionsPhoto');
    const name = modal.querySelector('#artistOptionsName');
    const cleanPhoto = resolveArtistPhoto(artist);
    if (photo) photo.src = cleanPhoto || defaultAvatar(artist.name || 'Artist');
    if (name) name.textContent = artist.name || 'Artist';

    if (auth.currentUser) {
        const followed = await isArtistFollowed(artist);
        syncFollowUI(followed);
    } else {
        syncFollowUI(false);
    }

    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
};

const closeArtistOptions = () => {
    const modal = document.getElementById('artistOptionsModal');
    if (!modal) return;
    if (modal.contains(document.activeElement)) {
        document.activeElement?.blur();
    }
    const moreBtn = document.getElementById('artistMoreBtn');
    if (moreBtn && document.contains(moreBtn)) {
        moreBtn.focus();
    }
    modal.classList.add('hidden');
    modal.setAttribute('inert', '');
    modal.removeAttribute('aria-hidden');
    resetArtistSheetStyles();
};

/**
 * Share artist profile
 */
const shareArtistProfile = async (artist) => {
    const artistName = artist?.name || 'Artist';
    const shareUrl = getArtistShareUrl(artist);
    const shareData = {
        title: `Spotiwind - ${artistName}`,
        text: `Dengarkan lagu-lagu ${artistName} di Spotiwind!`,
        url: shareUrl
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast(`Tautan profil ${artistName} disalin ke clipboard`);
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            try {
                await navigator.clipboard.writeText(shareUrl);
                showToast(`Tautan profil ${artistName} disalin ke clipboard`);
            } catch {
                showToast('Gagal membagikan profil');
            }
        }
    }
};

/**
 * Helper to get currently loaded songs for the artist
 */
const getAvailableArtistSongs = () => {
    if (typeof window.getArtistPageCurrentSongs === 'function') {
        const s = window.getArtistPageCurrentSongs();
        if (Array.isArray(s) && s.length > 0) return s;
    }
    if (Array.isArray(window.__artistPageCurrentSongs) && window.__artistPageCurrentSongs.length > 0) {
        return window.__artistPageCurrentSongs;
    }
    const rows = Array.from(document.querySelectorAll('#artistSongsGrid .artist-song-list-item'));
    return rows.map(r => ({
        id: r.dataset.id || r.dataset.songId,
        audio: r.dataset.audio || r.dataset.songAudio,
        name: r.querySelector('.item-name')?.textContent || 'Untitled',
        artist: r.querySelector('.item-artist')?.textContent || 'Unknown Artist',
        cover: r.querySelector('.item-cover')?.src || '',
        duration: Number(r.dataset.duration) || 0
    })).filter(s => s.audio);
};

const isArtistCurrentlyPlaying = (artist) => {
    const activeAudio = window.__activeAudio || (typeof activeAudio !== 'undefined' ? activeAudio : null);
    const currentSongData = (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : window.__currentSongData);
    if (!activeAudio || !activeAudio.src || !currentSongData) return false;
    const currentArtist = currentSongData.artist?.trim()?.toLowerCase();
    const pageArtist = artist?.name?.trim()?.toLowerCase();
    return Boolean(currentArtist && pageArtist && (currentArtist === pageArtist || currentArtist.includes(pageArtist) || pageArtist.includes(currentArtist)));
};

/**
 * Play/pause handler for the main artist play button
 */
const handleArtistPlayAllClick = (artist) => {
    const activeAudio = window.__activeAudio || (typeof activeAudio !== 'undefined' ? activeAudio : null);
    const isPlayingCurrentArtist = isArtistCurrentlyPlaying(artist);

    if (isPlayingCurrentArtist && activeAudio) {
        if (!activeAudio.paused) {
            activeAudio.pause();
        } else {
            activeAudio.play().catch(e => console.error("Play error:", e));
        }
        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }
        return;
    }

    const songs = getAvailableArtistSongs();
    if (!songs || songs.length === 0) {
        showToast('Memuat lagu artis, mohon tunggu sebentar...');
        return;
    }

    const context = `artist-${artist.id || artist.name.replace(/\s+/g, '-').toLowerCase()}`;
    let targetSong = songs[0];
    let playlistToPlay = [...songs];

    if (isGlobalShuffleActive()) {
        // Algoritma Fisher-Yates shuffle agar seluruh urutan lagu teracak sempurna
        const shuffled = [...songs];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        targetSong = shuffled[0];
        playlistToPlay = shuffled;
    }

    if (typeof window.playPreview === 'function') {
        window.playPreview(
            null,
            targetSong.audio,
            targetSong.name,
            targetSong.artist,
            targetSong.cover,
            targetSong.id,
            Number(targetSong.duration) || 0,
            context,
            playlistToPlay
        );
    }
};

/**
 * Initializes the artist page with the provided artist data.
 * @param {object} artist - The artist data object.
 * @param {string} previousPage - The URL of the page to return to.
 */
export const initArtistPage = (artist, previousPage) => {
    const contentContainer = document.querySelector('.app-container');
    if (!contentContainer) return;

    currentArtistData = artist;
    initializeSkeletons();

    parallaxHandler = () => {
        const hero = document.getElementById('artistHero');
        const heroImage = document.getElementById('artistHeroImage');
        const header = document.querySelector('.artist-page-header');
        const backButton = document.querySelector('.artist-page-header .back-btn');
        const artistPageTitle = document.getElementById('artistPageName');
        const artistNameWrapper = document.getElementById('artistNameWrapper');

        if (!hero || !header || !artistNameWrapper || !artistPageTitle || !backButton) {
            cleanupArtistPage();
            return;
        }

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const heroHeight = hero.offsetHeight || 320;

        // Gambar tetap diam di posisinya saat scroll ke bawah
        if (heroImage) {
            if (scrollTop > 0) {
                const fadeOpacity = Math.max(0, 1 - (scrollTop / (heroHeight * 1.25)));
                heroImage.style.transform = 'translate3d(0, 0, 0)';
                heroImage.style.opacity = fadeOpacity;
            } else if (scrollTop < 0) {
                const scale = 1 + Math.abs(scrollTop) / 260;
                heroImage.style.transform = `translate3d(0, 0, 0) scale(${scale})`;
                heroImage.style.opacity = '1';
            } else {
                heroImage.style.transform = 'translate3d(0, 0, 0)';
                heroImage.style.opacity = '1';
            }
        }

        const artistNameWrapperBottom = artistNameWrapper.getBoundingClientRect().bottom;
        const headerHeight = header.offsetHeight || 50;
        const shouldShowArtistNameInHeader = artistNameWrapperBottom <= headerHeight;

        if (shouldShowArtistNameInHeader) {
            if (!artistPageTitle.classList.contains('visible')) {
                clearTimeout(artistPageTitleVisibilityTimeout);
                artistPageTitleVisibilityTimeout = setTimeout(() => {
                    artistPageTitle.classList.add('visible');
                    artistPageTitle.setAttribute('aria-hidden', 'false');
                }, 40);
            }
        } else {
            clearTimeout(artistPageTitleVisibilityTimeout);
            artistPageTitle.classList.remove('visible');
            artistPageTitle.setAttribute('aria-hidden', 'true');
        }

        header.classList.toggle('scrolled', shouldShowArtistNameInHeader);
        backButton.classList.toggle('transparent-bg', shouldShowArtistNameInHeader);

        const hasScrolled = scrollTop > 0;
        const artistNameWrapperTop = artistNameWrapper.getBoundingClientRect().top;
        const shouldShowShadow = hasScrolled && (artistNameWrapperTop < 0 || artistNameWrapperBottom <= headerHeight);
        artistNameWrapper.classList.toggle('has-dynamic-shadow', shouldShowShadow);
    };

    // 1. Header
    const pageTitle = document.getElementById('artistPageName');
    if (pageTitle) pageTitle.textContent = artist.name;
    const backButton = contentContainer.querySelector('.back-btn');
    if (backButton) {
        backButton.addEventListener('click', async (e) => {
            e.preventDefault();
            cleanupArtistPage();
            const targetPage = (previousPage && !previousPage.includes('artist')) ? previousPage : 'home-mobile.html';
            document.querySelectorAll('.mobile-bottom-nav .nav-item.active').forEach(item => item.classList.remove('active'));
            const targetNavItem = document.querySelector(`.mobile-bottom-nav .nav-item[data-target="${targetPage}"]`);
            if (targetNavItem) targetNavItem.classList.add('active');
            await loadPageContent(targetPage, { pushState: true });
        });
    }

    // 2. Hero Section
    const heroImage = document.getElementById('artistHeroImage');
    if (heroImage) {
        const rawPhoto = resolveArtistPhoto(artist);
        heroImage.referrerPolicy = "no-referrer";
        heroImage.alt = artist.name || 'Artist';

        const fallbackAvatar = defaultAvatar(artist.name || 'Artist');
        heroImage.onerror = () => {
            heroImage.src = fallbackAvatar;
        };
        heroImage.src = rawPhoto || fallbackAvatar;
    }

    // 3. Artist Name Wrapper
    const artistNameWrapper = document.getElementById('artistNameWrapper');
    if (artistNameWrapper) {
        artistNameWrapper.innerHTML = `
            <h1 class="artist-hero-name">${artist.name}</h1>
            <div class="artist-verified-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 256 256">
                    <path d="M0 0h256v256H0z" fill="none" />
                    <path fill="#0095f6"
                        d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57c-1.36-3.27-1.44-8.69-1.52-13.94c-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52c-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14c-3.25 1.36-8.69 1.44-13.94 1.52c-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94c-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57c1.36 3.27 1.44 8.69 1.52 13.94c.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52c3.56 1.47 7.63 5.37 11.57 9.14c6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14c3.27-1.36 8.69-1.44 13.94-1.52c9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94c1.47-3.56 5.37-7.63 9.14-11.57c6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18m-52.2 6.84l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32" />
                </svg>
                <span>Diverifikasi oleh Spotiwind</span>
            </div>
        `;
    }

    // 4. Action Controls Bar Setup
    // A. Follow Button & Auth State
    syncFollowUI(false);

    const updateFollowStatusForUser = async (user) => {
        if (!user) {
            syncFollowUI(false);
            return;
        }
        try {
            const isFollowed = await isArtistFollowed(artist);
            syncFollowUI(isFollowed);
        } catch (e) {
            console.warn("Failed to check follow status:", e);
        }
    };

    if (auth.currentUser) {
        updateFollowStatusForUser(auth.currentUser);
    }

    if (authUnsubscribe) {
        authUnsubscribe();
    }
    authUnsubscribe = onAuthStateChanged(auth, (user) => {
        updateFollowStatusForUser(user);
    });

    const followBtn = document.getElementById('artistFollowBtn');
    if (followBtn) {
        followBtn.onclick = (e) => {
            e.preventDefault();
            handleFollowClick(artist);
        };
    }

    // B. More Options (Three dots)
    const moreBtn = document.getElementById('artistMoreBtn');
    if (moreBtn) {
        moreBtn.onclick = (e) => {
            e.preventDefault();
            openArtistOptions(artist);
        };
    }

    // C. Share Button
    const shareBtn = document.getElementById('artistShareBtn');
    if (shareBtn) {
        shareBtn.onclick = (e) => {
            e.preventDefault();
            shareArtistProfile(artist);
        };
    }

    // D. Shuffle Button
    const shuffleBtn = document.getElementById('artistShuffleBtn');
    if (shuffleBtn) {
        shuffleBtn.classList.toggle('is-active', isGlobalShuffleActive());
        shuffleBtn.onclick = (e) => {
            e.preventDefault();
            if (typeof window.togglePlaybackShuffle === 'function') {
                window.togglePlaybackShuffle();
            } else {
                const nextState = !isGlobalShuffleActive();
                setGlobalShuffleState(nextState);
                shuffleBtn.classList.toggle('is-active', nextState);
                showToast(nextState ? `Shuffle diaktifkan untuk lagu ${artist.name}` : 'Shuffle dinonaktifkan');
            }
        };
    }

    // E. Play / Pause Button (Default: paused / play icon)
    const playAllBtn = document.getElementById('artistPlayAllBtn');
    if (playAllBtn) {
        const activeAudio = window.__activeAudio || (typeof activeAudio !== 'undefined' ? activeAudio : null);
        const isPlaying = isArtistCurrentlyPlaying(artist) && activeAudio && !activeAudio.paused;
        playAllBtn.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;

        playAllBtn.onclick = (e) => {
            e.preventDefault();
            handleArtistPlayAllClick(artist);
        };
    }

    // F. Modal Options Handlers
    const optionsBackdrop = document.getElementById('artistOptionsBackdrop');
    const optionsCloseBtn = document.getElementById('artistOptionsCloseBtn');
    if (optionsBackdrop) optionsBackdrop.onclick = closeArtistOptions;
    if (optionsCloseBtn) optionsCloseBtn.onclick = closeArtistOptions;

    const optFollow = document.getElementById('artistOptFollow');
    if (optFollow) {
        optFollow.onclick = () => {
            closeArtistOptions();
            handleFollowClick(artist);
        };
    }

    const optShare = document.getElementById('artistOptShare');
    if (optShare) {
        optShare.onclick = () => {
            closeArtistOptions();
            shareArtistProfile(artist);
        };
    }

    const optCopyLink = document.getElementById('artistOptCopyLink');
    if (optCopyLink) {
        optCopyLink.onclick = async () => {
            closeArtistOptions();
            const shareUrl = getArtistShareUrl(artist);
            try {
                await navigator.clipboard.writeText(shareUrl);
                showToast(`Tautan profil ${artist.name} disalin ke clipboard`);
            } catch {
                showToast('Gagal menyalin tautan');
            }
        };
    }

    // G. Setup Drag-to-dismiss gesture for options modal
    setupArtistSheetDragToDismiss();

    // 5. Fetch and Render Songs
    const mobileOps = (window.spotiwind && window.spotiwind.mobile) || {};
    const retryFn = mobileOps.fetchWithContinuousRetry || fetchWithContinuousRetry;
    const localFn = mobileOps.fetchLocalArtistSongs || fetchLocalArtistSongs;
    const artistFn = mobileOps.fetchArtistSongs || fetchArtistSongs;

    const isLocalArtist = isNaN(parseInt(artist.id));
    if (isLocalArtist) {
        if (typeof localFn === 'function') {
            retryFn(() => localFn(artist));
        }
    } else {
        if (typeof artistFn === 'function') {
            retryFn(() => artistFn(artist.id, artist.name));
        }
    }

    // 6. Attach parallax scroll listener
    window.addEventListener('scroll', parallaxHandler);
};

/**
 * Cleans up event listeners specific to the artist page.
 */
export const cleanupArtistPage = () => {
    closeArtistOptions();
    if (sheetPointerDownHandler) {
        const sheet = document.getElementById('artistOptionsSheet') || document.querySelector('.artist-options-sheet');
        if (sheet) sheet.removeEventListener('pointerdown', sheetPointerDownHandler);
        sheetPointerDownHandler = null;
    }
    if (authUnsubscribe) {
        authUnsubscribe();
        authUnsubscribe = null;
    }
    if (parallaxHandler) {
        window.removeEventListener('scroll', parallaxHandler);
        parallaxHandler = null;
    }
    if (artistPageTitleVisibilityTimeout) {
        clearTimeout(artistPageTitleVisibilityTimeout);
    }
};