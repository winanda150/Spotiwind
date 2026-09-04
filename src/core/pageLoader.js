/**
 * Spotiwind — Subpage SPA Router & Lifecycle Manager
 * Handles dynamic HTML fetching, stylesheet switching, module loading,
 * history management, and clean page lifecycle mount/unmount.
 */

import { loadStylesheet } from '../utils/domUtils.js';
import { getArtistUniqueId } from '../utils/audioUtils.js';

let activePageCleanup = null;
let pageLoadSequence = 0;
let previousPageUrl = 'home-mobile.html';
let currentPageUrl = 'home-mobile.html';
let homeScrollPosition = Number(sessionStorage.getItem('home_scroll_pos')) || 0;
let initialHomeContent = null;
let activeStyleLinks = new Map();
let isNavigatingOrRestoring = false;

// Pages that preserve user scroll position across navigation
export const PERSISTENT_SCROLL_PAGES = new Set([
    'home-mobile.html',
    'library-mobile.html',
    'search-mobile.html'
]);

const pageScrollPositions = new Map();

export const normalizePageName = (page) => {
    if (!page) return 'home-mobile.html';
    const clean = page.includes('/') ? page.split('/').pop() : page;
    if (clean === '' || clean === 'index.html' || clean === 'mobile.html' || clean === '/') {
        return 'home-mobile.html';
    }
    return clean;
};

export const isPageNavigatingOrRestoring = () => isNavigatingOrRestoring;
export const setNavigatingOrRestoring = (val) => { isNavigatingOrRestoring = Boolean(val); };

export const setPageScrollPosition = (page, pos) => {
    const pageName = normalizePageName(page);
    if (!PERSISTENT_SCROLL_PAGES.has(pageName)) return;

    const scrollNum = Math.max(0, Number(pos) || 0);
    pageScrollPositions.set(pageName, scrollNum);
    try {
        sessionStorage.setItem(`scroll_pos_${pageName}`, String(scrollNum));
    } catch {}

    if (pageName === 'home-mobile.html') {
        homeScrollPosition = scrollNum;
        try { sessionStorage.setItem('home_scroll_pos', String(scrollNum)); } catch {}
    }
};

export const getPageScrollPosition = (page) => {
    const pageName = normalizePageName(page);
    if (!PERSISTENT_SCROLL_PAGES.has(pageName)) return 0;

    if (pageScrollPositions.has(pageName)) {
        return pageScrollPositions.get(pageName);
    }
    try {
        const saved = Number(sessionStorage.getItem(`scroll_pos_${pageName}`));
        if (!isNaN(saved) && saved > 0) return saved;
        if (pageName === 'home-mobile.html') {
            return homeScrollPosition || Number(sessionStorage.getItem('home_scroll_pos')) || 0;
        }
    } catch {}
    return 0;
};

export const setHomeScrollPosition = (pos) => setPageScrollPosition('home-mobile.html', pos);
export const getHomeScrollPosition = () => getPageScrollPosition('home-mobile.html');

export const updateAppUrl = (path, title, state = {}, shouldPushState = true) => {
    if (title) document.title = title;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const currentState = { ...state, path: cleanPath };

    try {
        if (shouldPushState) {
            if (window.location.pathname !== cleanPath) {
                window.history.pushState(currentState, title || document.title, cleanPath);
            }
        } else {
            window.history.replaceState(currentState, title || document.title, cleanPath);
        }
    } catch (e) {
        console.warn("Could not update history state:", e);
    }
};

export const updateBottomNavActive = (targetPage) => {
    if (!targetPage) return;
    const normalizedTarget = String(targetPage).replace(/^.*\//, '');
    if (normalizedTarget.includes('artist') || normalizedTarget.includes('notifications') || normalizedTarget.includes('auth')) {
        return;
    }
    document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(item => {
        const itemTarget = (item.dataset.target || '').replace(/^.*\//, '');
        let isActive = false;
        if (normalizedTarget.includes('search')) {
            isActive = itemTarget.includes('search');
        } else if (normalizedTarget.includes('library')) {
            isActive = itemTarget.includes('library');
        } else if (normalizedTarget.includes('windflow') || normalizedTarget.includes('radio')) {
            isActive = itemTarget.includes('windflow') || itemTarget.includes('radio');
        } else if (normalizedTarget.includes('account')) {
            isActive = itemTarget.includes('account');
        } else if (normalizedTarget.includes('home') || normalizedTarget === 'mobile.html' || normalizedTarget === '/' || normalizedTarget === '') {
            isActive = itemTarget.includes('home');
        } else {
            isActive = itemTarget === normalizedTarget;
        }
        item.classList.toggle('active', isActive);
    });
};

export const updateSidebarActiveState = (targetPage) => {
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.sidebarTarget === targetPage);
    });
};

export const switchPageStyles = async (targetPage) => {
    const cssBase = `${window.location.origin}/src/assets/css/`;
    const styleConfigs = [
        { key: 'search', match: 'search-mobile.html', file: 'search-mobile.css' },
        { key: 'notifications', match: 'notifications-mobile.html', file: 'notifications-mobile.css' },
        { key: 'artist', match: 'artist-mobile.html', file: 'artist-mobile.css' },
        { key: 'library', match: 'library-mobile.html', file: 'library-mobile.css' },
        { key: 'account', match: 'account-mobile.html', file: 'account-mobile.css' },
        { key: 'windflow', match: ['windflow-mobile.html', 'radio-mobile.html'], file: 'windflow-mobile.css' },
        { key: 'auth', match: 'auth-mobile.html', file: 'auth-mobile.css' }
    ];

    for (const config of styleConfigs) {
        const matches = Array.isArray(config.match)
            ? config.match.some(m => targetPage.includes(m))
            : targetPage.includes(config.match);

        if (matches) {
            const currentLink = activeStyleLinks.get(config.key) || null;
            const newLink = await loadStylesheet(`${cssBase}${config.file}`, currentLink);
            activeStyleLinks.set(config.key, newLink);
        } else {
            const existingLink = activeStyleLinks.get(config.key);
            if (existingLink && existingLink.parentNode) {
                existingLink.parentNode.removeChild(existingLink);
                activeStyleLinks.delete(config.key);
            }
        }
    }
};

/**
 * Main function to load a subpage into the mobile SPA shell
 */
export const loadSubpage = async (page, options = {}, context = {}) => {
    const contentContainer = document.querySelector('.app-container') || document.getElementById('mobileMainContent');
    if (!contentContainer) return;

    // 1. Capture scroll of current page BEFORE any transition or DOM manipulation
    const leavingPage = normalizePageName(currentPageUrl);
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (PERSISTENT_SCROLL_PAGES.has(leavingPage) && currentScroll > 0) {
        setPageScrollPosition(leavingPage, currentScroll);
    }

    // Special capture for Home: save rendered HTML for instant restoration
    const isGenuineHome = Boolean(
        contentContainer.querySelector('.top-artists-section') ||
        contentContainer.querySelector('.made-for-you-section') ||
        contentContainer.querySelector('#dailyTrendingGrid') ||
        contentContainer.querySelector('.popular-section')
    );
    if (isGenuineHome) {
        initialHomeContent = contentContainer.innerHTML;
        if (currentScroll > 0) {
            setPageScrollPosition('home-mobile.html', currentScroll);
        }
    }
    isNavigatingOrRestoring = true;

    const navigationId = ++pageLoadSequence;
    updateSidebarActiveState(page);
    updateBottomNavActive(page);

    const {
        pushState = true,
        route = null,
        title = null,
        state = null
    } = (typeof options === 'object' && options !== null) ? options : {};

    // Route title determination
    let targetRoute = route;
    let targetTitle = title;
    if (!targetRoute) {
        if (page === 'home-mobile.html' || page === 'mobile.html' || page === '/') {
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
        } else if (page.includes('windflow-mobile.html') || page.includes('radio-mobile.html')) {
            targetRoute = '/windflow';
            targetTitle = 'WindFlow | Spotiwind';
        } else if (page.includes('account-mobile.html')) {
            targetRoute = '/account';
            targetTitle = 'Account | Spotiwind';
        } else if (page.includes('auth-mobile.html')) {
            const initialTab = options.initialTab || 'login';
            targetRoute = initialTab === 'register' ? '/register' : '/login';
            targetTitle = initialTab === 'register' ? 'Register | Spotiwind' : 'Login | Spotiwind';
        } else if (page.includes('artist-mobile.html')) {
            const artist = context.artistData;
            const artistUniqueId = artist ? getArtistUniqueId(artist) : '';
            targetRoute = artistUniqueId ? `/artist/${artistUniqueId}` : '/artist';
            targetTitle = artist?.name ? `${artist.name} | Spotiwind` : 'Artist | Spotiwind';
        }
    }

    if (targetRoute) {
        updateAppUrl(targetRoute, targetTitle, state || { page, route: targetRoute }, pushState);
    }

    // Return to Home
    if (page === 'home-mobile.html' || page === 'mobile.html' || page === '/') {
        const targetScroll = getPageScrollPosition('home-mobile.html');

        // 1. Fade OUT first while styles are still attached (Prevents unstyled flash)
        contentContainer.style.transition = 'opacity 0.16s cubic-bezier(0.4, 0, 0.2, 1)';
        contentContainer.style.opacity = '0';
        await new Promise(res => setTimeout(res, 160));

        // 2. Cleanup while completely invisible
        document.body.classList.remove('is-auth-view');
        if (typeof activePageCleanup === 'function') {
            activePageCleanup();
            activePageCleanup = null;
        }

        // Cleanup subpage stylesheets while invisible
        activeStyleLinks.forEach((link) => {
            if (link && link.parentNode) link.parentNode.removeChild(link);
        });
        activeStyleLinks.clear();

        // 3. Restore Home DOM content while invisible
        if (initialHomeContent) {
            contentContainer.innerHTML = initialHomeContent;
        } else {
            try {
                const response = await fetch(`${window.location.origin}/src/pages/home-mobile.html`);
                if (response.ok) {
                    const text = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    const fetchedAppContainer = doc.querySelector('.app-container');
                    if (fetchedAppContainer) {
                        initialHomeContent = fetchedAppContainer.innerHTML;
                        contentContainer.innerHTML = initialHomeContent;
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch fresh home content:", err);
            }
        }

        // Sinkronisasi status lagu aktif segera setelah snapshot DOM Home dipulihkan
        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }

        if (typeof context.onHomeMounted === 'function') {
            context.onHomeMounted();
        }

        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }

        // Multi-phase scroll restoration to ensure accurate positioning even during layout reflow
        const applyScroll = () => {
            if (targetScroll > 0) {
                window.scrollTo({ top: targetScroll, behavior: 'instant' });
                document.documentElement.scrollTop = targetScroll;
                document.body.scrollTop = targetScroll;
            } else {
                window.scrollTo({ top: 0, behavior: 'instant' });
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
            }
        };

        applyScroll();
        requestAnimationFrame(() => {
            applyScroll();
            setTimeout(() => {
                applyScroll();
                isNavigatingOrRestoring = false;
            }, 80);
        });

        // 4. Force browser reflow to commit DOM layout before fading in
        void contentContainer.offsetHeight;

        contentContainer.style.opacity = '1';
        currentPageUrl = 'home-mobile.html';

        if (typeof window.syncActiveSongUI === 'function') {
            requestAnimationFrame(window.syncActiveSongUI);
        }
        return;
    }

    if (currentPageUrl && currentPageUrl !== page && !page.includes('auth-mobile.html')) {
        previousPageUrl = currentPageUrl;
    }
    currentPageUrl = page;

    if (typeof window.closeSidebar === 'function') {
        window.closeSidebar();
    }

    try {
        contentContainer.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        contentContainer.style.opacity = '0';
        await new Promise(res => setTimeout(res, 200));

        const pageFileName = page.includes('/') ? page.split('/').pop() : page;
        const pageFetchUrl = `${window.location.origin}/src/pages/${pageFileName}`;
        let text = '';

        try {
            const response = await fetch(pageFetchUrl);
            if (response.ok) {
                text = await response.text();
            } else {
                throw new Error(`Could not load ${page}`);
            }
        } catch (fetchErr) {
            if ('caches' in window) {
                const cachedRes = await caches.match(pageFetchUrl) || await caches.match(`/src/pages/${pageFileName}`);
                if (cachedRes) {
                    text = await cachedRes.text();
                }
            }
            if (!text) throw fetchErr;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const newContent = doc.body.innerHTML;

        if (typeof newContent === 'string') {
            if (navigationId !== pageLoadSequence) return;

            const targetPageName = normalizePageName(page);
            const isPersistentPage = PERSISTENT_SCROLL_PAGES.has(targetPageName);
            const subpageTargetScroll = isPersistentPage ? getPageScrollPosition(targetPageName) : 0;

            if (typeof activePageCleanup === 'function') {
                activePageCleanup();
                activePageCleanup = null;
            }

            await switchPageStyles(page);
            contentContainer.innerHTML = newContent;

            if (page.includes('auth-mobile.html')) {
                document.body.classList.add('is-auth-view');
            } else {
                document.body.classList.remove('is-auth-view');
            }

            // Mount page module
            if (page.includes('search-mobile.html')) {
                const searchModule = await import('../assets/js/search-mobile.js');
                if (typeof searchModule.initSearchPage === 'function') {
                    searchModule.initSearchPage(context.searchParams || {});
                }
            } else if (page.includes('artist-mobile.html')) {
                const artistModule = await import('../assets/js/artist-mobile.js');
                activePageCleanup = artistModule.cleanupArtistPage;
                if (typeof artistModule.initArtistPage === 'function' && context.artistData) {
                    artistModule.initArtistPage(context.artistData, previousPageUrl);
                }
            } else if (page.includes('notifications-mobile.html')) {
                const notificationsModule = await import('../assets/js/notifications-mobile.js');
                activePageCleanup = notificationsModule.cleanupNotifications;
                if (typeof notificationsModule.initNotificationsPage === 'function') {
                    notificationsModule.initNotificationsPage(previousPageUrl);
                }
            } else if (page.includes('library-mobile.html')) {
                const libraryModule = await import('../assets/js/library-mobile.js');
                if (typeof libraryModule.initLibraryPage === 'function') {
                    const savedLibraryTab = sessionStorage.getItem('library_active_tab') || 'overview';
                    const targetTab = options.initialTab || window.__initialLibraryTab || savedLibraryTab;
                    window.__initialLibraryTab = null;
                    await libraryModule.initLibraryPage(targetTab);
                    activePageCleanup = libraryModule.cleanupLibraryPage;
                }
            } else if (page.includes('account-mobile.html')) {
                const accountModule = await import('../assets/js/account-mobile.js');
                if (typeof accountModule.initAccountPage === 'function') {
                    await accountModule.initAccountPage();
                    activePageCleanup = accountModule.cleanupAccountPage;
                }
            } else if (page.includes('windflow-mobile.html') || page.includes('radio-mobile.html')) {
                const windflowModule = await import('../assets/js/windflow-mobile.js');
                const initFunc = windflowModule.initWindFlowPage || windflowModule.initRadioPage;
                if (typeof initFunc === 'function') {
                    initFunc();
                    activePageCleanup = windflowModule.cleanupWindFlowPage;
                }
            } else if (page.includes('auth-mobile.html')) {
                const authModule = await import('../assets/js/auth-mobile.js');
                activePageCleanup = authModule.cleanupAuthMobilePage;
                if (typeof authModule.initAuthMobilePage === 'function') {
                    authModule.initAuthMobilePage({
                        initialTab: options.initialTab || 'login',
                        onSuccess: () => loadSubpage('home-mobile.html', { pushState: true })
                    });
                }
            }

            if (navigationId !== pageLoadSequence) return;
            void contentContainer.offsetHeight; // Force reflow
            contentContainer.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            contentContainer.style.opacity = '1';

            // Multi-phase scroll restoration for subpage
            const applySubpageScroll = () => {
                if (subpageTargetScroll > 0) {
                    window.scrollTo({ top: subpageTargetScroll, behavior: 'instant' });
                    document.documentElement.scrollTop = subpageTargetScroll;
                    document.body.scrollTop = subpageTargetScroll;
                } else {
                    window.scrollTo({ top: 0, behavior: 'instant' });
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                }
            };

            applySubpageScroll();
            requestAnimationFrame(() => {
                applySubpageScroll();
                setTimeout(() => {
                    applySubpageScroll();
                    isNavigatingOrRestoring = false;
                }, 80);
            });

            if (typeof window.syncActiveSongUI === 'function') {
                setTimeout(window.syncActiveSongUI, 80);
            }
        }
    } catch (error) {
        isNavigatingOrRestoring = false;
        console.error('Failed to load subpage content:', error);
        contentContainer.innerHTML = `<p style="text-align:center; padding: 2rem;">Failed to load content.</p>`;
        contentContainer.style.opacity = '1';
    }
};

export const initPageRouter = (context = {}) => {
    window.loadPageContent = (page, options) => loadSubpage(page, options, context);
    window.setPageScrollPosition = setPageScrollPosition;
    window.getPageScrollPosition = getPageScrollPosition;
    window.setHomeScrollPosition = (pos) => setPageScrollPosition('home-mobile.html', pos);
    window.getHomeScrollPosition = () => getPageScrollPosition('home-mobile.html');
    window.getPreviousPageUrl = () => previousPageUrl;
    window.getCurrentPageUrl = () => currentPageUrl;
};
