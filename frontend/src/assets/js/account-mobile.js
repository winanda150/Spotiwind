import { auth, onAuthStateChanged, signOut } from './firebase-config.js';

let unsubscribeAccountAuth = null;

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

const updateAccountUserInfo = (user) => {
    const accountAvatar = document.getElementById('accountAvatar');
    const accountName = document.getElementById('accountName');
    const accountEmail = document.getElementById('accountEmail');
    const logoutButton = document.getElementById('logoutBtnBottom');

    if (!user) {
        if (accountName) accountName.textContent = 'Guest';
        if (accountEmail) accountEmail.textContent = 'Sign in to access your profile & synced favorites';
        if (accountAvatar) accountAvatar.src = 'https://ui-avatars.com/api/?name=Guest&background=1e293b&color=94a3b8&bold=true&size=128';
        if (logoutButton) {
            logoutButton.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                </svg>
                <span>Log In / Sign Up</span>`;
            logoutButton.onclick = () => {
                window.location.href = 'auth.html';
            };
        }
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

    if (logoutButton) {
        logoutButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Log Out</span>`;
        logoutButton.onclick = async () => {
            try {
                await signOut(auth);
                showPageToast('Logged out successfully');
            } catch (error) {
                console.error('Failed to sign out from account page:', error);
                showPageToast('Failed to log out');
            }
        };
    }
};

const bindAccountInteractions = () => {
    const editProfileBtn = document.querySelector('.edit-profile-btn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) {
                window.location.href = 'auth.html';
                return;
            }
            showPageToast('Edit profile is coming soon');
        });
    }

    const editAvatarBtn = document.querySelector('.edit-avatar-btn');
    if (editAvatarBtn) {
        editAvatarBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) {
                window.location.href = 'auth.html';
                return;
            }
            showPageToast('Avatar upload is coming soon');
        });
    }

    document.querySelectorAll('.settings-item').forEach((item) => {
        item.addEventListener('click', () => {
            const label = item.querySelector('.settings-item-text')?.textContent || 'Setting';
            showPageToast(`${label} selected`);
        });
    });
};

export const initAccountPage = () => {
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = onAuthStateChanged(auth, updateAccountUserInfo);
    bindAccountInteractions();
};

export const cleanupAccountPage = () => {
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = null;
};
