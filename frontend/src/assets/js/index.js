/**
 * Entry Point Router
 * Redirects visitors instantly based on screen viewport width
 */
const redirectToApp = () => {
    const isMobile = window.innerWidth <= 768;
    const target = isMobile ? 'frontend/src/pages/home-mobile.html' : 'frontend/src/pages/home-desktop.html';
    window.location.replace(target);
};

// Immediate execution
redirectToApp();

window.addEventListener('resize', redirectToApp);