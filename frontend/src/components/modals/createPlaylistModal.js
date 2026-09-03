/**
 * Spotiwind — Create Playlist Modal Component
 */

import { auth } from '../../assets/js/firebase-config.js';
import { createUserPlaylist } from '../../services/libraryService.js';
import { showToast } from '../../utils/domUtils.js';

let playlistModalTriggerEl = null;

export const openCreatePlaylistModal = (triggerElement = null) => {
    const user = auth.currentUser;
    if (!user) {
        showToast("Please log in to create and manage playlists.");
        return;
    }
    playlistModalTriggerEl = triggerElement || document.activeElement;

    // Blur active element inside sidebar to prevent aria-hidden focus conflict
    const sidebar = document.querySelector('.mobile-sidebar');
    if (sidebar && sidebar.contains(document.activeElement)) {
        document.activeElement.blur();
    }
    if (typeof window.closeSidebar === 'function') {
        window.closeSidebar();
    }

    const modal = document.getElementById('createPlaylistModal');
    const input = document.getElementById('playlistNameInput');
    const form = document.getElementById('createPlaylistForm');
    const submitBtn = document.getElementById('submitPlaylistBtn');
    if (!modal) return;

    if (form) form.reset();
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Create Playlist</span>';
    }
    modal.removeAttribute('inert');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input?.focus(), 120);
};

export const closeCreatePlaylistModal = () => {
    const modal = document.getElementById('createPlaylistModal');
    if (!modal) return;

    if (modal.contains(document.activeElement)) {
        document.activeElement.blur();
    }
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');

    if (playlistModalTriggerEl && typeof playlistModalTriggerEl.focus === 'function' && document.body.contains(playlistModalTriggerEl)) {
        playlistModalTriggerEl.focus();
    }
};

export const initCreatePlaylistModal = () => {
    const modal = document.getElementById('createPlaylistModal');
    const form = document.getElementById('createPlaylistForm');
    const cancelBtn = modal?.querySelector('.playlist-btn-cancel');
    const closeBtn = modal?.querySelector('.playlist-modal-close-btn');

    cancelBtn?.addEventListener('click', closeCreatePlaylistModal);
    closeBtn?.addEventListener('click', closeCreatePlaylistModal);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeCreatePlaylistModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeCreatePlaylistModal();
        }
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            showToast("Please log in to create playlists.");
            closeCreatePlaylistModal();
            return;
        }

        const input = document.getElementById('playlistNameInput');
        const submitBtn = document.getElementById('submitPlaylistBtn');
        const playlistName = input?.value?.trim();
        if (!playlistName) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Creating...</span>';
        }

        try {
            const created = await createUserPlaylist(user.uid, playlistName);
            if (created) {
                showToast(`Playlist "${playlistName}" created!`);
                closeCreatePlaylistModal();
            } else {
                showToast("Failed to create playlist. Please try again.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>Create Playlist</span>';
                }
            }
        } catch (error) {
            console.error("Error creating playlist:", error);
            showToast("Failed to create playlist.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>Create Playlist</span>';
            }
        }
    });

    window.openCreatePlaylistModal = openCreatePlaylistModal;
    window.closeCreatePlaylistModal = closeCreatePlaylistModal;
};
