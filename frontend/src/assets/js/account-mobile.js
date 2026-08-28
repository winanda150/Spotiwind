import { auth, onAuthStateChanged } from './firebase-config.js';

let unsubscribeAccountAuth = null;
let editProfileBtnHandler = null;
let avatarClickHandler = null;
let previewBackBtnHandler = null;
let previewEditBtnHandler = null;
let previewShareBtnHandler = null;
let keydownHandler = null;

const defaultAvatar = (name = 'User') => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=B91EC9&color=fff&bold=true&size=512`;

// Mengubah URL Google Avatar beresolusi rendah (s96-c) menjadi resolusi HD (s512-c / s1024-c)
export const getHighResAvatarUrl = (url, size = 512) => {
    if (!url) return '';
    let result = String(url).trim();

    // 1. Jika foto dari Google User Content (Google Login)
    if (result.includes('googleusercontent.com') || result.includes('google.com') || result.includes('ggpht.com')) {
        if (/=s\d+([a-zA-Z0-9_-]*)/.test(result)) {
            result = result.replace(/=s\d+([a-zA-Z0-9_-]*)/, `=s${size}-c`);
        } else if (/([?&])sz=\d+/.test(result)) {
            result = result.replace(/([?&])sz=\d+/, `$1sz=${size}`);
        } else {
            const hasQuery = result.includes('?');
            if (hasQuery) {
                const parts = result.split('?');
                result = `${parts[0]}=s${size}-c?${parts[1]}`;
            } else {
                result = `${result}=s${size}-c`;
            }
        }
        return result;
    }

    // 2. Jika foto dari UI Avatars
    if (result.includes('ui-avatars.com')) {
        if (/size=\d+/.test(result)) {
            result = result.replace(/size=\d+/, `size=${size}`);
        } else {
            const sep = result.includes('?') ? '&' : '?';
            result = `${result}${sep}size=${size}`;
        }
        return result;
    }

    return result;
};

let previousActiveElement = null;

const showToast = (message) => {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 2200);
};

const openAvatarPreview = () => {
    const modal = document.getElementById('avatarPreviewModal');
    const previewImg = document.getElementById('avatarPreviewImg');
    const accountAvatar = document.getElementById('accountAvatar');

    if (!modal || !accountAvatar || !previewImg) return;

    previousActiveElement = document.activeElement;

    previewImg.referrerPolicy = "no-referrer";
    // Minta resolusi Ultra-HD (1024px) untuk preview besar di tengah
    let imgSrc = getHighResAvatarUrl(accountAvatar.src, 1024);

    previewImg.src = imgSrc;

    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    void modal.offsetWidth; // Trigger reflow for smooth animation
    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

const closeAvatarPreview = () => {
    const modal = document.getElementById('avatarPreviewModal');
    if (!modal || modal.classList.contains('hidden')) return;

    // 1. Lepaskan fokus dari elemen tombol dalam modal sebelum mengatur aria-hidden
    if (modal.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    // 2. Kembalikan fokus ke elemen pemicu jika valid
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        try {
            previousActiveElement.focus();
        } catch {
            // Ignored
        }
    }
    previousActiveElement = null;

    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    setTimeout(() => {
        if (!modal.classList.contains('is-active')) {
            modal.classList.add('hidden');
        }
    }, 280);
};

const updateAccountUserInfo = (user) => {
    const accountAvatar = document.getElementById('accountAvatar');
    const accountName = document.getElementById('accountName');
    const accountEmail = document.getElementById('accountEmail');
    const accountProBadge = document.getElementById('accountProBadge');

    if (!user) {
        if (accountName) accountName.textContent = 'Guest';
        if (accountEmail) accountEmail.textContent = 'Sign in to manage your profile';
        if (accountProBadge) accountProBadge.classList.add('hidden');
        if (accountAvatar) {
            accountAvatar.src = 'https://ui-avatars.com/api/?name=Guest&background=1e293b&color=94a3b8&bold=true&size=512';
        }
        return;
    }

    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    if (accountName) accountName.textContent = displayName;
    if (accountEmail) accountEmail.textContent = user.email || 'user@example.com';
    if (accountProBadge) accountProBadge.classList.remove('hidden');

    if (accountAvatar) {
        accountAvatar.referrerPolicy = "no-referrer";
        const avatarUrl = getHighResAvatarUrl(user.photoURL, 512) || defaultAvatar(displayName);
        accountAvatar.src = avatarUrl;
        accountAvatar.onerror = () => {
            accountAvatar.src = defaultAvatar(displayName);
        };
    }
};

const bindAccountInteractions = () => {
    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtnHandler = () => {
            const user = auth.currentUser;
            if (!user) {
                if (typeof window.navigateToAuthPage === 'function') {
                    window.navigateToAuthPage('login');
                } else {
                    showToast('Silakan login terlebih dahulu');
                }
                return;
            }
            showToast('Edit profil akan segera hadir');
        };
        editProfileBtn.addEventListener('click', editProfileBtnHandler);
    }

    // Klik avatar di halaman account untuk membuka modal preview kotak besar di tengah
    const avatarWrapper = document.querySelector('.account-avatar-wrapper');
    if (avatarWrapper) {
        avatarClickHandler = (e) => {
            if (e.target.closest('.avatar-camera-badge')) {
                showToast('Ubah foto profil akan segera hadir');
                return;
            }
            openAvatarPreview();
        };
        avatarWrapper.addEventListener('click', avatarClickHandler);
    }

    // Tombol Kembali di Header Dark Preview
    const backBtn = document.getElementById('avatarPreviewBackBtn');
    if (backBtn) {
        previewBackBtnHandler = () => closeAvatarPreview();
        backBtn.addEventListener('click', previewBackBtnHandler);
    }

    // Tombol Edit Foto di Header Dark Preview
    const editBtn = document.getElementById('avatarPreviewEditBtn');
    if (editBtn) {
        previewEditBtnHandler = () => {
            showToast('Ubah foto profil akan segera hadir');
        };
        editBtn.addEventListener('click', previewEditBtnHandler);
    }

    // Tombol Bagikan Foto di Header Dark Preview
    const shareBtn = document.getElementById('avatarPreviewShareBtn');
    if (shareBtn) {
        previewShareBtnHandler = async () => {
            const previewImg = document.getElementById('avatarPreviewImg');
            const photoUrl = previewImg?.src || window.location.href;
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Foto Profil Spotiwind',
                        text: 'Lihat foto profil saya di Spotiwind',
                        url: photoUrl
                    });
                } catch {
                    // Ignored / user cancelled
                }
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
        };
        shareBtn.addEventListener('click', previewShareBtnHandler);
    }

    keydownHandler = (e) => {
        if (e.key === 'Escape') {
            closeAvatarPreview();
        }
    };
    document.addEventListener('keydown', keydownHandler);
};

export const initAccountPage = () => {
    if (auth.currentUser) {
        updateAccountUserInfo(auth.currentUser);
    }
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = onAuthStateChanged(auth, updateAccountUserInfo);
    bindAccountInteractions();
};

export const cleanupAccountPage = () => {
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = null;

    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn && editProfileBtnHandler) {
        editProfileBtn.removeEventListener('click', editProfileBtnHandler);
    }
    editProfileBtnHandler = null;

    const avatarWrapper = document.querySelector('.account-avatar-wrapper');
    if (avatarWrapper && avatarClickHandler) {
        avatarWrapper.removeEventListener('click', avatarClickHandler);
    }
    avatarClickHandler = null;

    const backBtn = document.getElementById('avatarPreviewBackBtn');
    if (backBtn && previewBackBtnHandler) {
        backBtn.removeEventListener('click', previewBackBtnHandler);
    }
    previewBackBtnHandler = null;

    const editBtn = document.getElementById('avatarPreviewEditBtn');
    if (editBtn && previewEditBtnHandler) {
        editBtn.removeEventListener('click', previewEditBtnHandler);
    }
    previewEditBtnHandler = null;

    const shareBtn = document.getElementById('avatarPreviewShareBtn');
    if (shareBtn && previewShareBtnHandler) {
        shareBtn.removeEventListener('click', previewShareBtnHandler);
    }
    previewShareBtnHandler = null;

    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
    }
    keydownHandler = null;
    previousActiveElement = null;

    document.body.style.overflow = '';
};
