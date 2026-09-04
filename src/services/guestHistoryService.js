import {
    auth,
    onAuthStateChanged
} from "../assets/js/firebase-config.js";

const AUTH_SESSION_KEY = 'spotiwind_auth_session_uid';

/**
 * Removes all guest recently played records from localStorage
 * and dispatches the reactive event to update the UI immediately.
 */
export const clearLocalRecentlyPlayed = () => {
    try {
        localStorage.removeItem('recently_played_songs');
        localStorage.removeItem('recentlyPlayed');
        window.dispatchEvent(new CustomEvent('recently-played-updated', { detail: [] }));
    } catch (e) {
        console.warn("Failed to clear local recently played:", e);
    }
};

/**
 * Removes all guest recent searches from localStorage
 * and dispatches the reactive event to update the UI immediately.
 */
export const clearLocalRecentSearches = () => {
    try {
        localStorage.removeItem('spotiwind-recent-searches');
        window.dispatchEvent(new CustomEvent('recent-searches-updated', { detail: [] }));
    } catch (e) {
        console.warn("Failed to clear local recent searches:", e);
    }
};

/**
 * Completely clears all guest history (recently played and recent searches) from localStorage.
 */
export const clearGuestHistory = () => {
    clearLocalRecentlyPlayed();
    clearLocalRecentSearches();
};

/**
 * Handles authentication state transitions:
 * 1. Guest -> Logged In: Wipes guest history from localStorage so guest history never leaks into the user's account.
 * 2. Logged In -> Logout (Guest): Wipes localStorage so the new guest starts with a clean slate.
 * 3. Page Refresh (F5): Detects same user UID and preserves offline-first cache without unnecessary clearing.
 *
 * @param {object|null} user - Firebase user object or null.
 */
export const handleAuthTransition = (user) => {
    let previousUid = null;
    try {
        previousUid = localStorage.getItem(AUTH_SESSION_KEY);
    } catch {
        // Fallback if localStorage is inaccessible
    }

    if (user && user.uid) {
        // User is currently authenticated
        if (!previousUid || previousUid === 'guest' || previousUid !== user.uid) {
            // New login from guest (or switched user account)
            clearGuestHistory();
        }
        try {
            localStorage.setItem(AUTH_SESSION_KEY, user.uid);
        } catch {}
    } else {
        // User is unauthenticated (guest)
        if (previousUid && previousUid !== 'guest') {
            // User just logged out
            clearGuestHistory();
        }
        try {
            localStorage.setItem(AUTH_SESSION_KEY, 'guest');
        } catch {}
    }
};

// Automatic global listener for auth state transitions
if (typeof onAuthStateChanged === 'function') {
    onAuthStateChanged(auth, (user) => {
        handleAuthTransition(user);
    });
}
