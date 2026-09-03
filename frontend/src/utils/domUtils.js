/**
 * Spotiwind — Shared DOM Utilities, Toasts, & Visual Effects
 */

/**
 * Displays a non-intrusive toast notification
 * @param {string} message - Toast message text
 * @param {number} duration - Display duration in ms (default 3000)
 */
export const showToast = (message, duration = 3000) => {
    if (!message) return;

    let toastContainer = document.getElementById('spotiwind-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'spotiwind-toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            bottom: calc(var(--player-bar-height, 64px) + 20px);
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            align-items: center;
            max-width: 90vw;
        `;
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'spotiwind-toast';
    toast.textContent = message;
    toast.style.cssText = `
        background: rgba(15, 23, 42, 0.95);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 500;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        opacity: 0;
        transform: translateY(12px) scale(0.95);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
        text-align: center;
    `;

    toastContainer.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0) scale(1)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px) scale(0.95)';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, duration);
};

/**
 * Dynamically loads a stylesheet link tag into document head
 * @param {string} href - Stylesheet URL
 * @param {HTMLLinkElement|null} currentLink - Existing link reference
 * @returns {Promise<HTMLLinkElement>}
 */
export const loadStylesheet = (href, currentLink) => {
    if (currentLink && currentLink.parentNode) {
        return Promise.resolve(currentLink);
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;

    const loaded = new Promise((resolve, reject) => {
        link.addEventListener('load', () => resolve(link), { once: true });
        link.addEventListener('error', () => reject(new Error(`Could not load stylesheet ${href}`)), { once: true });
    });

    document.head.appendChild(link);
    return loaded;
};

/**
 * Creates heart particle animations originating from a button element
 * @param {HTMLElement} el
 */
export const createHeartParticles = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 5; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart-particle';
        heart.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#22c55e"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

        heart.style.position = 'fixed';
        heart.style.left = `${centerX}px`;
        heart.style.top = `${centerY}px`;
        heart.style.zIndex = '20000';
        heart.style.pointerEvents = 'none';

        heart.style.setProperty('--x-offset', (Math.random() - 0.5) * 80);
        heart.style.setProperty('--y-offset', (Math.random() - 0.5) * 40);
        heart.style.setProperty('--rotate', `${(Math.random() - 0.5) * 45}deg`);

        heart.style.animation = 'heart-float 0.8s ease-out forwards';
        document.body.appendChild(heart);
        setTimeout(() => {
            if (heart.parentNode) heart.parentNode.removeChild(heart);
        }, 800);
    }
};

// Global fallback for existing onclick or inline references
window.showToast = showToast;
