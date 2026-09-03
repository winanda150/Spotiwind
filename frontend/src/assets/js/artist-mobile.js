/**
 * Artist Page Module
 * Handles all logic for the artist-mobile.html page.
 */

import { defaultAvatar } from '../../utils/formatters.js';

// These functions are expected to be available in the global scope from home-mobile.js
const {
    fetchWithContinuousRetry = (fn) => (typeof fn === 'function' ? fn() : null),
    fetchLocalArtistSongs,
    fetchArtistSongs,
    loadPageContent = (page, opts) => (typeof window.loadPageContent === 'function' ? window.loadPageContent(page, opts) : null),
    initializeSkeletons = () => {}
} = (window.spotiwind && window.spotiwind.mobile) || {};

let parallaxHandler = null;
let artistPageTitleVisibilityTimeout = null;

/**
 * Initializes the artist page with the provided artist data.
 * @param {object} artist - The artist data object.
 * @param {string} previousPage - The URL of the page to return to.
 */
export const initArtistPage = (artist, previousPage) => {
    const contentContainer = document.querySelector('.app-container');
    if (!contentContainer) return;

    initializeSkeletons();

    parallaxHandler = () => {
        const hero = document.getElementById('artistHero');
        const heroImage = document.getElementById('artistHeroImage');
        const header = document.querySelector('.artist-page-header');
        const backButton = document.querySelector('.artist-page-header .back-btn');
        const artistPageTitle = document.getElementById('artistPageName');
        const artistNameWrapper = document.getElementById('artistNameWrapper');

        if (!hero || !header || !artistNameWrapper || !artistPageTitle || !backButton) {
            cleanupArtistPage(); // Clean up if elements are gone
            return;
        }

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const heroHeight = hero.offsetHeight || 320;

        // Gambar tetap diam di posisinya (stationary) saat scroll ke bawah
        if (heroImage) {
            if (scrollTop > 0) {
                const fadeOpacity = Math.max(0, 1 - (scrollTop / (heroHeight * 1.25)));
                heroImage.style.transform = 'translate3d(0, 0, 0)';
                heroImage.style.opacity = fadeOpacity;
            } else if (scrollTop < 0) {
                // Efek zoom elastis saat ditarik ke bawah (overscroll)
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
    document.getElementById('artistPageName').textContent = artist.name;
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
        let rawPhoto = artist.photo || artist.image || artist.cover || '';
        if (rawPhoto && !rawPhoto.startsWith('http://') && !rawPhoto.startsWith('https://') && !rawPhoto.startsWith('data:')) {
            const cleanPath = String(rawPhoto)
                .replace(/^(\.\.\/)+public\//, '')
                .replace(/^(\.\.\/)+/, '')
                .replace(/^\/?frontend\/public\//, '')
                .replace(/^\/?public\//, '')
                .replace(/^\/+/, '');
            rawPhoto = `../../public/${cleanPath}`;
        }

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

    // 4. Fetch and Render Songs
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

    // 5. Attach parallax scroll listener
    window.addEventListener('scroll', parallaxHandler);
};

/**
 * Cleans up event listeners specific to the artist page.
 */
export const cleanupArtistPage = () => {
    if (parallaxHandler) {
        window.removeEventListener('scroll', parallaxHandler);
        parallaxHandler = null;
    }
    if (artistPageTitleVisibilityTimeout) {
        clearTimeout(artistPageTitleVisibilityTimeout);
    }
};