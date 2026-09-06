/**
 * Spotiwind — Friends Activity Modal Component
 */

import { auth } from '../../assets/js/firebase-config.js';
import { getFollowingIds, getFriendsActivityByIds } from '../../services/activityService.js';

let allFriendsActivityData = [];
let modalDisplayCount = 0;
const MODAL_PAGE_SIZE = 50;

/**
 * Helper to format Firestore timestamp to relative time string
 */
export const formatRelativeTime = (timestamp) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '...';
    const now = new Date();
    const diffInSeconds = Math.floor((now - timestamp.toDate()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d`;
};

export const renderMoreToModal = () => {
    const modalContainer = document.getElementById('modalActivityContainer');
    const loader = document.getElementById('modalLoader');
    if (!modalContainer) return;

    const nextBatch = allFriendsActivityData.slice(modalDisplayCount, modalDisplayCount + MODAL_PAGE_SIZE);

    if (nextBatch.length === 0) {
        if (modalDisplayCount === 0) modalContainer.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-muted);">No friend activity found.</p>';
        loader?.classList.add('hidden');
        return;
    }

    const html = nextBatch.map(friend => `
        <div class="friend-item" style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05)">
            <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" class="friend-avatar" width="40" height="40" alt="${friend.name}">
            <div class="friend-info">
                <div class="friend-header">
                    <span class="friend-name">${friend.name}</span>
                    <span class="friend-time">${formatRelativeTime(friend.timestamp)}</span>
                </div>
                <span class="friend-status">Listening to <strong>${friend.song}</strong></span>
            </div>
        </div>
    `).join('');

    modalContainer.insertAdjacentHTML('beforeend', html);
    modalDisplayCount += nextBatch.length;

    if (modalDisplayCount >= allFriendsActivityData.length) {
        loader?.classList.add('hidden');
    }
};

export const openFriendsModal = async () => {
    const modal = document.getElementById('friendsModal');
    const modalContainer = document.getElementById('modalActivityContainer');
    if (!modal || !modalContainer) return;

    modal.classList.remove('hidden');
    modalContainer.innerHTML = '<div class="loader-container"><span class="loader"></span><p>Fetching all activities...</p></div>';

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
        const followingIds = await getFollowingIds(currentUser.uid);
        allFriendsActivityData = await getFriendsActivityByIds(followingIds, 100);
        allFriendsActivityData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        modalContainer.innerHTML = '';
        modalDisplayCount = 0;
        renderMoreToModal();
    } catch (e) {
        console.error("Error loading friends activity:", e);
        modalContainer.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-muted);">Failed to load activities.</p>';
    }
};

export const closeFriendsModal = () => {
    const modal = document.getElementById('friendsModal');
    if (modal) modal.classList.add('hidden');
};

export const initFriendsActivityModal = () => {
    document.getElementById('modalActivityContainer')?.addEventListener('scroll', (e) => {
        const el = e.target;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
            if (modalDisplayCount < allFriendsActivityData.length) {
                renderMoreToModal();
            }
        }
    });

    const friendSeeAllLink = document.querySelector('.friend-activity-section .see-all-link');
    friendSeeAllLink?.addEventListener('click', (e) => {
        e.preventDefault();
        openFriendsModal();
    });

    document.querySelector('.close-modal')?.addEventListener('click', closeFriendsModal);

    window.openFriendsModal = openFriendsModal;
    window.closeFriendsModal = closeFriendsModal;
};
