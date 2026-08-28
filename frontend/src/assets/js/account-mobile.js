import { auth, onAuthStateChanged } from './firebase-config.js';

let unsubscribeAccountAuth = null;
let settingsBtnHandler = null;
let editProfileBtnHandler = null;

const defaultAvatar = (name = 'User') => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=B91EC9&color=fff&bold=true&size=128`;

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
            accountAvatar.src = 'https://ui-avatars.com/api/?name=Guest&background=1e293b&color=94a3b8&bold=true&size=128';
        }
        return;
    }

    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    if (accountName) accountName.textContent = displayName;
    if (accountEmail) accountEmail.textContent = user.email || 'user@example.com';
    if (accountProBadge) accountProBadge.classList.remove('hidden');

    if (accountAvatar) {
        const avatarUrl = user.photoURL || defaultAvatar(displayName);
        accountAvatar.src = avatarUrl;
        accountAvatar.onerror = () => {
            accountAvatar.src = defaultAvatar(displayName);
        };
    }
};

const bindAccountInteractions = () => {
    const settingsBtn = document.getElementById('accountSettingsBtn');
    if (settingsBtn) {
        settingsBtnHandler = () => {
            showToast('Pengaturan akun');
        };
        settingsBtn.addEventListener('click', settingsBtnHandler);
    }

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
};

export const initAccountPage = () => {
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = onAuthStateChanged(auth, updateAccountUserInfo);
    bindAccountInteractions();
};

export const cleanupAccountPage = () => {
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = null;

    const settingsBtn = document.getElementById('accountSettingsBtn');
    if (settingsBtn && settingsBtnHandler) {
        settingsBtn.removeEventListener('click', settingsBtnHandler);
    }
    settingsBtnHandler = null;

    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn && editProfileBtnHandler) {
        editProfileBtn.removeEventListener('click', editProfileBtnHandler);
    }
    editProfileBtnHandler = null;
};
