/**
 * Entry Point Router
 * Redirects visitors instantly based on screen viewport width
 */
const redirectToApp = () => {
    const isMobile = window.innerWidth <= 768;
    const currentPath = window.location.pathname;
    let cleanRoute = '';

    if (currentPath && !currentPath.endsWith('/index.html') && currentPath !== '/') {
        cleanRoute = currentPath + window.location.search + window.location.hash;
    }

    if (cleanRoute) {
        sessionStorage.setItem('spotiwind_target_route', cleanRoute);
    }

    const normalizedRoute = cleanRoute.toLowerCase().replace(/^\/+|\/+$/g, '').split('?')[0].split('#')[0];
    if (normalizedRoute === 'auth' || normalizedRoute === 'login' || normalizedRoute === 'register') {
        const subTab = normalizedRoute === 'register' ? '?tab=register' : '?tab=login';
        const targetAuth = `/src/pages/${isMobile ? 'home-mobile.html' : 'home-desktop.html'}${subTab}`;
        window.location.replace(targetAuth);
        return;
    }

    const target = `/src/pages/${isMobile ? 'home-mobile.html' : 'home-desktop.html'}`;
    window.location.replace(target);
};

// Immediate execution
redirectToApp();

window.addEventListener('resize', redirectToApp);