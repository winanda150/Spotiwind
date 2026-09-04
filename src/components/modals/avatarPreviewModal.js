/**
 * Spotiwind — Avatar Preview Modal Component
 */

import { getHighResAvatarUrl } from '../../utils/formatters.js';
import { showToast } from '../../utils/domUtils.js';

let previousAvatarTriggerEl = null;

/**
 * Opens an avatar preview modal with a high-resolution image
 * @param {Object} options
 */
export const openAvatarPreviewModal = ({
    modalId = 'sidebarAvatarPreviewModal',
    previewImgId = 'sidebarAvatarPreviewImg',
    avatarSourceEl = null,
    triggerElement = null,
    customUrl = null
} = {}) => {
    const modal = document.getElementById(modalId);
    const previewImg = document.getElementById(previewImgId);
    if (!modal || !previewImg) return;

    previousAvatarTriggerEl = triggerElement || document.activeElement;

    previewImg.referrerPolicy = 'no-referrer';
    const rawSrc = customUrl || avatarSourceEl?.src || '';
    previewImg.src = getHighResAvatarUrl(rawSrc, 1024);

    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    void modal.offsetWidth; // Force reflow for smooth CSS transitions
    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

/**
 * Closes an avatar preview modal
 * @param {string} modalId
 */
export const closeAvatarPreviewModal = (modalId = 'sidebarAvatarPreviewModal') => {
    const modal = document.getElementById(modalId);
    if (!modal || modal.classList.contains('hidden')) return;

    if (modal.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    if (previousAvatarTriggerEl && typeof previousAvatarTriggerEl.focus === 'function' && document.body.contains(previousAvatarTriggerEl)) {
        try {
            previousAvatarTriggerEl.focus();
        } catch {}
    }
    previousAvatarTriggerEl = null;

    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    setTimeout(() => {
        if (!modal.classList.contains('is-active')) {
            modal.classList.add('hidden');
            modal.setAttribute('inert', '');
        }
    }, 280);
};

/**
 * Initializes listeners for an avatar preview modal instance
 */
export const initAvatarPreviewModal = ({
    modalId = 'sidebarAvatarPreviewModal',
    previewImgId = 'sidebarAvatarPreviewImg',
    backBtnId = 'sidebarAvatarPreviewBackBtn',
    editBtnId = 'sidebarAvatarPreviewEditBtn',
    shareBtnId = 'sidebarAvatarPreviewShareBtn'
} = {}) => {
    const modal = document.getElementById(modalId);
    const backBtn = document.getElementById(backBtnId);
    const editBtn = document.getElementById(editBtnId);
    const shareBtn = document.getElementById(shareBtnId);

    backBtn?.addEventListener('click', () => closeAvatarPreviewModal(modalId));

    editBtn?.addEventListener('click', () => {
        showToast('Ubah foto profil akan segera hadir');
    });

    shareBtn?.addEventListener('click', async () => {
        const previewImg = document.getElementById(previewImgId);
        const photoUrl = previewImg?.src || window.location.href;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Foto Profil Spotiwind',
                    text: 'Lihat foto profil saya di Spotiwind',
                    url: photoUrl
                });
            } catch {}
        } else if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(photoUrl);
                showToast('Tautan foto profil disalin ke clipboard');
            } catch {
                showToast('Bagikan foto profil');
            }
        } else {
            showToast('Bagikan foto profil');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeAvatarPreviewModal(modalId);
        }
    });
};
