import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase-config.js";

import {
    getErrorMessage,
    registerWithEmail,
    loginWithEmail,
    loginWithSocial,
    resetPassword
} from "../../services/authService.js";

let authObserverUnsubscribe = null;
let activeToastTimeout = null;

export const cleanupAuthDesktopPage = () => {
    document.body.classList.remove('is-desktop-auth-view');
    if (authObserverUnsubscribe) {
        authObserverUnsubscribe();
        authObserverUnsubscribe = null;
    }
    if (activeToastTimeout) {
        clearTimeout(activeToastTimeout);
        activeToastTimeout = null;
    }
};

export const initAuthDesktopPage = (options = {}) => {
    cleanupAuthDesktopPage();

    const {
        initialTab = 'login',
        onBack = null,
        onSuccess = null
    } = options;

    // Elements
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginSwitchBtn = document.getElementById('loginSwitchBtn');
    const registerSwitchBtn = document.getElementById('registerSwitchBtn');
    const loginFooter = document.getElementById('loginFooter');
    const registerFooter = document.getElementById('registerFooter');
    const cardTitle = document.getElementById('cardTitle');
    const cardSubtitle = document.getElementById('cardSubtitle');
    const toastContainer = document.getElementById('authToastContainer');
    const regPasswordInput = document.getElementById('reg-password');
    const backToMusicBtn = document.getElementById('backToMusicBtn');

    let suppressAuthRedirect = false;

    // Toast Notification System
    const showToast = (message, type = 'info', duration = 4000) => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `auth-toast ${type}`;
        
        let iconSvg = '';
        if (type === 'error') {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        } else if (type === 'success') {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1FE8C4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        } else {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9B4DFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12.01" y2="8"/></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        activeToastTimeout = setTimeout(() => {
            toast.style.transition = 'all 0.35s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 350);
        }, duration);
    };

    // Clean URL updater
    const updateAuthUrl = (subRoute = 'login') => {
        try {
            window.history.replaceState({ route: subRoute }, document.title, `/${subRoute}`);
        } catch (e) {}
    };

    // Tab Switching
    const activateTab = (tabName) => {
        const scrollContainer = document.getElementById('authCardScrollBody') || document.querySelector('.auth-card-body-scroll') || document.querySelector('.auth-glass-card');
        if (scrollContainer) scrollContainer.scrollTop = 0;

        if (tabName === 'register') {
            registerTab?.classList.add('active');
            loginTab?.classList.remove('active');
            registerForm?.classList.remove('hidden');
            loginForm?.classList.add('hidden');
            registerFooter?.classList.remove('hidden');
            loginFooter?.classList.add('hidden');
            if (cardTitle) cardTitle.textContent = 'Create an account';
            if (cardSubtitle) cardSubtitle.textContent = 'Join Spotiwind to start streaming your favorite tunes.';
            updateAuthUrl('register');
        } else {
            loginTab?.classList.add('active');
            registerTab?.classList.remove('active');
            loginForm?.classList.remove('hidden');
            registerForm?.classList.add('hidden');
            loginFooter?.classList.remove('hidden');
            registerFooter?.classList.add('hidden');
            if (cardTitle) cardTitle.textContent = 'Welcome back!';
            if (cardSubtitle) cardSubtitle.textContent = 'Good to see you again. Log in to continue your music journey.';
            updateAuthUrl('login');
        }
    };

    loginTab?.addEventListener('click', () => activateTab('login'));
    registerTab?.addEventListener('click', () => activateTab('register'));
    loginSwitchBtn?.addEventListener('click', () => activateTab('login'));
    registerSwitchBtn?.addEventListener('click', () => activateTab('register'));

    // Set initial tab
    if (initialTab === 'register') {
        activateTab('register');
    } else {
        activateTab('login');
    }

    // Back to Music Handler
    if (backToMusicBtn) {
        backToMusicBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onBack === 'function') {
                onBack();
            } else if (typeof window.loadDesktopPageContent === 'function') {
                window.loadDesktopPageContent('home-desktop.html');
            } else if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.replace('home-desktop.html');
            }
        });
    }

    // Password Visibility Toggle
    const eyeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    document.querySelectorAll('.pwd-toggle-btn').forEach(toggleBtn => {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = toggleBtn.parentElement?.querySelector('input');
            if (input) {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                toggleBtn.innerHTML = isPassword ? eyeOffSvg : eyeSvg;
            }
        });
    });

    // Social Login Handler
    const handleSocialAuth = async (provider, btn) => {
        if (!btn) return;
        btn.disabled = true;
        btn.style.opacity = '0.6';

        try {
            const result = await loginWithSocial(provider);
            showToast('Signed in successfully!', 'success');
            if (typeof onSuccess === 'function' && result?.user) {
                setTimeout(() => onSuccess(result.user), 400);
            }
        } catch (error) {
            if (error.code === 'auth/popup-closed-by-user') {
                showToast('Sign in popup was closed.', 'info');
            } else if (error.code === 'auth/popup-blocked') {
                showToast('Popup was blocked by your browser. Please allow popups.', 'error');
            } else {
                showToast(getErrorMessage(error.code), 'error');
            }
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };

    document.getElementById('googleLoginBtn')?.addEventListener('click', (e) => handleSocialAuth('google', e.currentTarget));
    document.getElementById('facebookLoginBtn')?.addEventListener('click', (e) => handleSocialAuth('facebook', e.currentTarget));
    document.getElementById('appleLoginBtn')?.addEventListener('click', (e) => handleSocialAuth('apple', e.currentTarget));

    // Forgot Password Flow
    document.getElementById('forgotPasswordLink')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('login-email');
        const email = emailInput?.value.trim();

        if (!email) {
            showToast('Please enter your email address in the input above first.', 'info');
            emailInput?.focus();
            return;
        }

        try {
            await resetPassword(email);
            showToast('Password reset link has been sent to your email inbox.', 'success');
        } catch (error) {
            showToast(getErrorMessage(error.code), 'error');
        }
    });

    // Login Form Submit
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = loginForm.querySelector('.auth-submit-btn');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('login-remember')?.checked;

        if (!email || !password) {
            showToast('Please provide both email/username and password.', 'error');
            return;
        }

        submitBtn.disabled = true;
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span>Signing in...</span>`;

        try {
            const userCredential = await loginWithEmail(email, password, rememberMe);
            showToast('Signed in successfully!', 'success');
            if (typeof onSuccess === 'function' && userCredential?.user) {
                setTimeout(() => onSuccess(userCredential.user), 400);
            }
        } catch (error) {
            console.error("Login error:", error);
            showToast(getErrorMessage(error.code), 'error');
            
            if (error.code === 'auth/wrong-password') {
                document.getElementById('login-password')?.focus();
            } else {
                document.getElementById('login-email')?.focus();
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    });

    // Register Form Submit
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = registerForm.querySelector('.auth-submit-btn');
        const firstName = document.getElementById('reg-firstname').value.trim();
        const lastName = document.getElementById('reg-lastname').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;
        const termsChecked = document.getElementById('reg-terms')?.checked;

        if (!termsChecked) {
            showToast('Please agree to the Terms of Service & Privacy Policy.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showToast('Passwords do not match. Please verify.', 'error');
            document.getElementById('reg-confirm-password')?.focus();
            return;
        }

        submitBtn.disabled = true;
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span>Creating account...</span>`;

        try {
            suppressAuthRedirect = true;
            const fullName = `${firstName} ${lastName}`.trim();
            await registerWithEmail(fullName, email, password, true, username);
            await signOut(auth);
            
            showToast('Account created successfully! Please sign in.', 'success', 5000);
            activateTab('login');
            
            // Prefill email
            const loginEmailField = document.getElementById('login-email');
            if (loginEmailField) {
                loginEmailField.value = email;
                document.getElementById('login-password')?.focus();
            }
        } catch (error) {
            suppressAuthRedirect = false;
            console.error("Registration error:", error);
            showToast(getErrorMessage(error.code), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    });
};

// Standalone fallback (if auth-desktop.html opened directly)
if (typeof window !== 'undefined') {
    const isStandalone = !document.querySelector('.dashboard-container');
    if (isStandalone) {
        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const initialTab = urlParams.get('tab') || 'login';
            initAuthDesktopPage({ initialTab });
        });
    }
}
