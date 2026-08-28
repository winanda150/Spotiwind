/**
 * Entry Point Router
 * Redirects visitors instantly based on screen viewport width
 */
const redirectToApp = () => {
    const isMobile = window.innerWidth <= 768;
    const isGitHub = window.location.pathname.startsWith('/spotiwind-music');
    const appBase = isGitHub ? '/spotiwind-music/' : '/';
    const target = `${appBase}frontend/src/pages/${isMobile ? 'home-mobile.html' : 'home-desktop.html'}`;

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

    const normalizedRoute = cleanRoute.toLowerCase().replace(/^\/+|\/+$/g, '').split('?')[0].split('#')[0];
    if (normalizedRoute === 'auth' || normalizedRoute === 'login' || normalizedRoute === 'register') {
        window.location.replace(`${appBase}frontend/src/pages/auth.html`);
        return;
    }

    window.location.replace(target);
};

// Immediate execution
redirectToApp();

window.addEventListener('resize', redirectToApp);