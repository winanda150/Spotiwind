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

export const cleanupAuthMobilePage = () => {
    document.body.classList.remove('is-auth-view');
    if (authObserverUnsubscribe) {
        authObserverUnsubscribe();
        authObserverUnsubscribe = null;
    }
    if (activeToastTimeout) {
        clearTimeout(activeToastTimeout);
        activeToastTimeout = null;
    }
};

export const initAuthMobilePage = (options = {}) => {
    cleanupAuthMobilePage();

    const {
        initialTab = 'login',
        onBack = null,
        onSuccess = null,
        previousPage = null
    } = options;

    const loginTab = document.getElementById('mLoginTab');
    const registerTab = document.getElementById('mRegisterTab');
    const loginForm = document.getElementById('mLoginForm');
    const registerForm = document.getElementById('mRegisterForm');
    const loginFooter = document.getElementById('mLoginFooter');
    const registerFooter = document.getElementById('mRegisterFooter');
    const loginSwitchBtn = document.getElementById('mLoginSwitchBtn');
    const registerSwitchBtn = document.getElementById('mRegisterSwitchBtn');
    const cardTitle = document.getElementById('mTitle');
    const cardSubtitle = document.getElementById('mSubtitle');
    const toastContainer = document.getElementById('mToastContainer');
    const backBtn = document.getElementById('mBackBtn');

    let suppressAuthRedirect = false;

    // Toast Notification System
    const showToast = (message, type = 'info', duration = 3500) => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `m-toast ${type}`;
        
        let iconSvg = '';
        if (type === 'error') {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        } else if (type === 'success') {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1FE8C4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        } else {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9B4DFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        activeToastTimeout = setTimeout(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };

    // Tab Switcher
    const activateTab = (tabName) => {
        if (tabName === 'register') {
            registerTab?.classList.add('active');
            loginTab?.classList.remove('active');
            registerForm?.classList.remove('hidden');
            loginForm?.classList.add('hidden');
            registerFooter?.classList.remove('hidden');
            loginFooter?.classList.add('hidden');
            if (cardTitle) cardTitle.textContent = 'Create an account';
            if (cardSubtitle) cardSubtitle.textContent = 'Join Spotiwind to start streaming your favorite tunes.';
        } else {
            loginTab?.classList.add('active');
            registerTab?.classList.remove('active');
            loginForm?.classList.remove('hidden');
            registerForm?.classList.add('hidden');
            loginFooter?.classList.remove('hidden');
            registerFooter?.classList.add('hidden');
            if (cardTitle) cardTitle.textContent = 'Welcome back!';
            if (cardSubtitle) cardSubtitle.textContent = 'Good to see you again. Log in to continue your music journey.';
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    loginTab?.addEventListener('click', () => activateTab('login'));
    registerTab?.addEventListener('click', () => activateTab('register'));
    loginSwitchBtn?.addEventListener('click', () => activateTab('login'));
    registerSwitchBtn?.addEventListener('click', () => activateTab('register'));

    activateTab(initialTab === 'register' ? 'register' : 'login');

    // Back button
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (typeof onBack === 'function') {
                await onBack();
                return;
            }

            // Determine target previous page if onBack wasn't provided or in standalone mode
            let targetPage = previousPage;
            if (!targetPage || targetPage.includes('auth')) {
                try {
                    const savedPrev = sessionStorage.getItem('spotiwind_auth_previous_page');
                    if (savedPrev && !savedPrev.includes('auth')) {
                        targetPage = savedPrev;
                    }
                } catch {}
            }

            if (!targetPage && document.referrer) {
                try {
                    const refUrl = new URL(document.referrer);
                    if (refUrl.origin === window.location.origin && !refUrl.pathname.includes('auth')) {
                        const refPage = refUrl.pathname.split('/').pop();
                        if (refPage) targetPage = refPage;
                    }
                } catch {}
            }

            if (!targetPage || targetPage.includes('auth')) {
                targetPage = 'home-mobile.html';
            }

            if (typeof window.loadPageContent === 'function') {
                if (typeof window.updateBottomNavActive === 'function') {
                    window.updateBottomNavActive(targetPage);
                } else {
                    document.querySelectorAll('.mobile-bottom-nav .nav-item.active').forEach(item => item.classList.remove('active'));
                    const targetNavItem = document.querySelector(`.mobile-bottom-nav .nav-item[data-target="${targetPage}"]`);
                    if (targetNavItem) targetNavItem.classList.add('active');
                }
                await window.loadPageContent(targetPage, { pushState: true });
            } else if (window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host) && !document.referrer.includes('auth')) {
                window.history.back();
            } else {
                window.location.href = targetPage;
            }
        });
    }

    // Password Visibility Toggle
    const eyeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    document.querySelectorAll('.m-pwd-toggle').forEach(toggleBtn => {
        toggleBtn.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const input = btn.parentElement.querySelector('input');
            if (input) {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.innerHTML = isPassword ? eyeOffSvg : eyeSvg;
            }
        });
    });

    // Social Auth
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
                showToast('Sign-in popup was closed.', 'info');
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

    document.getElementById('mGoogleBtn')?.addEventListener('click', (e) => handleSocialAuth('google', e.currentTarget));
    document.getElementById('mFacebookBtn')?.addEventListener('click', (e) => handleSocialAuth('facebook', e.currentTarget));
    document.getElementById('mAppleBtn')?.addEventListener('click', (e) => handleSocialAuth('apple', e.currentTarget));

    // Forgot Password
    document.getElementById('mForgotPassword')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('m-login-email');
        const email = emailInput?.value.trim();

        if (!email) {
            showToast('Please enter your email in the field above first.', 'info');
            emailInput?.focus();
            return;
        }

        try {
            await resetPassword(email);
            showToast('Password reset link sent! Check your inbox.', 'success');
        } catch (error) {
            showToast(getErrorMessage(error.code), 'error');
        }
    });

    // Login Form Submit
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = loginForm.querySelector('.m-submit-btn');
        const email = document.getElementById('m-login-email').value.trim();
        const password = document.getElementById('m-login-password').value;
        const rememberMe = document.getElementById('m-login-remember')?.checked;

        if (!email || !password) {
            showToast('Please fill in both email and password.', 'error');
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
                document.getElementById('m-login-password')?.focus();
            } else {
                document.getElementById('m-login-email')?.focus();
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    });

    // Register Form Submit
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = registerForm.querySelector('.m-submit-btn');
        const firstName = document.getElementById('m-reg-firstname').value.trim();
        const lastName = document.getElementById('m-reg-lastname').value.trim();
        const email = document.getElementById('m-reg-email').value.trim();
        const username = document.getElementById('m-reg-username').value.trim();
        const password = document.getElementById('m-reg-password').value;
        const confirmPassword = document.getElementById('m-reg-confirm-password').value;
        const termsChecked = document.getElementById('m-reg-terms')?.checked;

        if (!termsChecked) {
            showToast('Please accept the Terms of Service & Privacy Policy.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showToast('Passwords do not match.', 'error');
            document.getElementById('m-reg-confirm-password')?.focus();
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
            
            showToast('Account created! Please sign in.', 'success', 4000);
            activateTab('login');

            const loginEmailField = document.getElementById('m-login-email');
            if (loginEmailField) {
                loginEmailField.value = email;
                document.getElementById('m-login-password')?.focus();
            }
        } catch (error) {
            suppressAuthRedirect = false;
            console.error("Register error:", error);
            showToast(getErrorMessage(error.code), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    });
};

// Standalone initialization fallback (if auth-mobile.html opened directly outside SPA)
if (typeof window !== 'undefined') {
    const isStandalone = !document.querySelector('.app-container');
    if (isStandalone) {
        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const initialTab = urlParams.get('tab') || 'login';
            let savedPrev = null;
            try {
                savedPrev = sessionStorage.getItem('spotiwind_auth_previous_page');
            } catch {}
            initAuthMobilePage({ initialTab, previousPage: savedPrev });
        });
    }
}
