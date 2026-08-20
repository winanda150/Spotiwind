import { auth, signOut } from './firebase-config.js';

const defaultAvatar = (name = 'User') => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=B91EC9&color=fff&bold=true&size=128`;

const showPageToast = (message) => {
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

const updateAccountUserInfo = () => {
    const user = auth.currentUser;
    const accountAvatar = document.getElementById('accountAvatar');
    const accountName = document.getElementById('accountName');
    const accountEmail = document.getElementById('accountEmail');

    if (!user) {
        if (accountName) accountName.textContent = 'Guest User';
        if (accountEmail) accountEmail.textContent = 'guest@spotiwind.com';
        if (accountAvatar) accountAvatar.src = defaultAvatar('Guest User');
        return;
    }

    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    if (accountName) accountName.textContent = displayName;
    if (accountEmail) accountEmail.textContent = user.email || 'user@example.com';

    if (accountAvatar) {
        const avatarUrl = user.photoURL || defaultAvatar(displayName);
        accountAvatar.src = avatarUrl;
        accountAvatar.onerror = () => {
            accountAvatar.src = defaultAvatar(displayName);
        };
    }
};

const bindAccountInteractions = () => {
    const editProfileBtn = document.querySelector('.edit-profile-btn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            showPageToast('Edit profile is coming soon');
        });
    }

    const editAvatarBtn = document.querySelector('.edit-avatar-btn');
    if (editAvatarBtn) {
        editAvatarBtn.addEventListener('click', () => {
            showPageToast('Avatar upload is coming soon');
        });
    }

    document.querySelectorAll('.settings-item').forEach((item) => {
        item.addEventListener('click', () => {
            const label = item.querySelector('.settings-item-text')?.textContent || 'Setting';
            showPageToast(`${label} selected`);
        });
    });

    const logoutButton = document.getElementById('logoutBtnBottom');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Failed to sign out from account page:', error);
                showPageToast('Failed to log out');
            }
        });
    }
};

export const initAccountPage = () => {
    updateAccountUserInfo();
    bindAccountInteractions();
};
