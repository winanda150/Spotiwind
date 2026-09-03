/**
 * Spotiwind — Shared Formatting & Text Utilities
 */

/**
 * Helper to format seconds to MM:SS
 * @param {number} seconds
 * @returns {string} Formatted time string (e.g. "3:45")
 */
export const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === null || seconds === undefined) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Helper to debounce function executions
 * @param {Function} func
 * @param {number} delay
 * @returns {Function} Debounced function
 */
export const debounce = (func, delay) => {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

/**
 * Helper to format numbers to Indonesian Rupiah currency string
 * @param {number} amount
 * @returns {string} e.g. "Rp 29.000"
 */
export const formatRupiah = (amount) => {
    if (typeof amount !== 'number') return 'Rp 0';
    return `Rp ${amount.toLocaleString('id-ID')}`;
};

/**
 * Generates a default UI avatar URL based on user's name
 * @param {string} name
 * @returns {string}
 */
export const defaultAvatar = (name = 'User') => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=B91EC9&color=fff&bold=true&size=512`;
};

/**
 * Converts low-res Google Avatar URLs (s96-c) into High-Res HD (s512-c / s1024-c)
 * @param {string} url
 * @param {number} size
 * @returns {string}
 */
export const getHighResAvatarUrl = (url, size = 512) => {
    if (!url) return '';
    let result = String(url).trim();

    // 1. Google User Content photo
    if (result.includes('googleusercontent.com') || result.includes('google.com') || result.includes('ggpht.com')) {
        if (/=s\d+([a-zA-Z0-9_-]*)/.test(result)) {
            result = result.replace(/=s\d+([a-zA-Z0-9_-]*)/, `=s${size}-c`);
        } else if (/([?&])sz=\d+/.test(result)) {
            result = result.replace(/([?&])sz=\d+/, `$1sz=${size}`);
        } else {
            const hasQuery = result.includes('?');
            result = `${result}${hasQuery ? '&' : '?'}sz=${size}`;
        }
    }

    // 2. UI Avatars photo
    if (result.includes('ui-avatars.com/api')) {
        if (result.includes('size=')) {
            result = result.replace(/size=\d+/, `size=${size}`);
        } else {
            const hasQuery = result.includes('?');
            result = `${result}${hasQuery ? '&' : '?'}size=${size}`;
        }
    }

    return result;
};
