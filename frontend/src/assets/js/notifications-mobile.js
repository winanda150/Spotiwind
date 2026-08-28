import { auth, onAuthStateChanged } from './firebase-config.js';
import { subscribeNotifications } from '../../services/notificationService.js';

// [NEW] Variable to hold the unsubscribe function for the Firestore listener
let unsubscribeNotifications = null;
let unsubscribeAuth = null;

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const getSafeImageUrl = (value) => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
};

/**
 * Helper to format Firestore timestamp to relative time (e.g., 2m, 1h)
 */
const formatRelativeTime = (timestamp) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') {
        return '...';
    }
    const now = new Date();
    const date = timestamp.toDate();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
};

/**
 * Creates the HTML for a single notification item.
 * @param {object} notifData - The notification data from Firestore.
 * @returns {string} - The HTML string for the notification item.
 */
const createNotificationItemHTML = (notifData) => {
    const { type, text, timestamp, imageUrl, imageAlt, isRead } = notifData;
    const safeType = escapeHtml(type);
    const safeImageUrl = getSafeImageUrl(imageUrl);

    let iconSvg = '';
    let itemClass = `notification-item ${safeType} ${isRead ? 'is-read' : ''}`;

    switch (type) {
        case 'new-release':
            iconSvg = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>`;
            break;
        case 'playlist-update':
            iconSvg = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>`;
            break;
        case 'new-follower':
            iconSvg = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
                    <line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>
                </svg>`;
            break;
        default: // Fallback icon
            iconSvg = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>`;
    }

    const thumbnailHTML = safeImageUrl ?
        `<img src="${escapeHtml(safeImageUrl)}" alt="${escapeHtml(imageAlt || 'Notification image')}" class="notification-thumbnail ${type === 'new-follower' ? 'is-avatar' : ''}">` :
        '';

    return `
        <div class="${itemClass}">
            <div class="notification-icon">${iconSvg}</div>
            <div class="notification-content">
                <p class="notification-text">${escapeHtml(text)}</p>
                <span class="notification-time">${formatRelativeTime(timestamp)}</span>
            </div>
            ${thumbnailHTML}
        </div>
    `;
};

/**
 * Fetches and renders notifications for the logged-in user.
 * @param {string} userId - The UID of the current user.
 */
const loadNotifications = (userId) => {
    const container = document.querySelector('.notification-list-container');
    if (!container) return;

    unsubscribeNotifications = subscribeNotifications(userId, (notifications) => {
        // Re-query the container inside the snapshot to ensure it's fresh
        const currentContainer = document.querySelector('.notification-list-container');
        if (!currentContainer || currentContainer !== container) return;

        if (notifications.length === 0) {
            currentContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem var(--mobile-horizontal-padding); color: var(--text-muted);">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; opacity: 0.5;">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <h3 style="font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">No Notifications Yet</h3>
                    <p style="font-size: 0.85rem;">You're all caught up! We'll let you know when something new happens.</p>
                </div>`;
            return;
        }

        const notificationsHTML = notifications.map((notification) => createNotificationItemHTML(notification)).join('');
        
        currentContainer.innerHTML = `
            ${notificationsHTML}
            <div class="notification-footer">
                <a href="#">Clear all notifications</a>
            </div>
        `;

    }, (error) => {
        console.error("Error fetching notifications: ", error);
        const currentContainer = document.querySelector('.notification-list-container');
        if (currentContainer === container) {
            currentContainer.innerHTML = `<p style="text-align: center; color: #f87171;">Failed to load notifications.</p>`;
        }
    });
};

// [NEW] Export a cleanup function to be called when navigating away
export const cleanupNotifications = () => {
    if (unsubscribeNotifications) {
        // [FIX] Ensure the listener is unsubscribed
        unsubscribeNotifications();
        unsubscribeNotifications = null;
    }
    if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
    }
};

export const initNotificationsPage = () => {
    cleanupNotifications();
    const container = document.querySelector('.notification-list-container'); // Get fresh reference

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            loadNotifications(user.uid);
        } else {
            if (container) {
                container.innerHTML = `<p style="text-align: center; padding: 2rem var(--mobile-horizontal-padding);">Please <a href="auth-mobile.html" id="notificationAuthLink" style="color: var(--accent-color);">log in</a> to see your notifications.</p>`;
                container.querySelector('#notificationAuthLink')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (typeof window.navigateToAuthPage === 'function') {
                        window.navigateToAuthPage('login');
                    } else {
                        window.location.href = 'auth-mobile.html';
                    }
                });
            }
        }
    });
};