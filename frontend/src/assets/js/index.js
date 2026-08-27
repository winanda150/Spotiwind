/**
 * Entry Point Router
 * Redirects visitors instantly based on screen viewport width
 */
const redirectToApp = () => {
    const isMobile = window.innerWidth <= 768;
    const target = isMobile ? 'frontend/src/pages/home-mobile.html' : 'frontend/src/pages/home-desktop.html';

    // Preserve any initial route from pathname, search, or hash
    const currentPath = window.location.pathname;
    let cleanRoute = '';

    if (currentPath && !currentPath.endsWith('/index.html') && !currentPath.endsWith('/spotiwind-music/') && !currentPath.endsWith('/spotiwind-music') && currentPath !== '/') {
        const pathAfterRepo = currentPath.replace(/^\/spotiwind-music/, '');
        if (pathAfterRepo && pathAfterRepo !== '/') {
            cleanRoute = pathAfterRepo + window.location.search + window.location.hash;
        }
    }

    if (cleanRoute) {
        sessionStorage.setItem('spotiwind_target_route', cleanRoute);
    }

    window.location.replace(target);
};

// Immediate execution
redirectToApp();

window.addEventListener('resize', redirectToApp);