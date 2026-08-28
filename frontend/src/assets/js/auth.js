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

document.addEventListener('DOMContentLoaded', () => {
    // Element Selectors
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const registerLink = document.getElementById('registerLink');
    const loginLink = document.getElementById('loginLink');
    const loginBrand = document.querySelector('.login-brand');
    const formTitle = document.querySelector('.title');
    const formSubtitle = document.querySelector('.subtitle');
    const overlay = document.getElementById('pageTransition');
    let suppressAuthRedirect = false;

    const waitForPageLoad = (callback) => {
        const waitForFonts = document.fonts?.ready || Promise.resolve();
        const run = () => waitForFonts.then(() => requestAnimationFrame(callback));

        if (document.readyState === 'complete') {
            run();
            return;
        }

        window.addEventListener('load', run, { once: true });
    };

    const hideLoadingOverlay = () => {
        if (!overlay) return;

        waitForPageLoad(() => {
            document.body.classList.remove('is-transitioning');
            overlay.classList.add('fade-out');
        });
    };

    const showLoadingOverlay = () => {
        if (overlay) {
            overlay.classList.remove('fade-out');
        }
    };

    // Auth Observer: Check if the user was previously logged in
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (suppressAuthRedirect) {
                hideLoadingOverlay();
                return;
            }

            document.body.classList.add('is-transitioning');
            console.log("User detected:", user.email);
            showLoadingOverlay();

            // Automatic redirect to app if logged in
            setTimeout(() => {
                const isMobile = window.innerWidth <= 768;
                const targetPage = isMobile ? 'home-mobile.html' : 'home-desktop.html';
                window.location.replace(targetPage);
            }, 800);
        } else {
            suppressAuthRedirect = false;
            document.body.classList.remove('is-transitioning');
            hideLoadingOverlay();
        }
    });

    // SVG Paths for Eye and Eye-Slash
    const eyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />`;
    const eyeSlashPath = `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />`;

    const getAppBasePath = () => window.location.pathname.startsWith('/spotiwind-music') ? '/spotiwind-music' : '';
    const updateAuthUrl = (subRoute = 'login') => {
        const base = getAppBasePath();
        const target = base ? `${base}/${subRoute}` : `/${subRoute}`;
        try {
            window.history.replaceState({ route: subRoute }, document.title, target);
        } catch (e) {}
    };

    // Ensure clean URL on initial load
    updateAuthUrl('login');

    // Tab Switching Logic
    const switchTab = (activeBtn, inactiveBtn, showForm, hideForm, title, subtitle) => {
        activeBtn.classList.add('active');
        inactiveBtn.classList.remove('active');
        showForm.classList.remove('hidden');
        hideForm.classList.add('hidden');
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.querySelector('.login-switch').classList.toggle('hidden', showForm === registerForm);
        document.querySelector('.register-switch').classList.toggle('hidden', showForm === loginForm);
        loginBrand.classList.toggle('hidden', showForm === registerForm);
        formTitle.textContent = title;
        formSubtitle.textContent = subtitle;
        updateAuthUrl(showForm === registerForm ? 'register' : 'login');
    };

    // Check if initial route was /register to auto-switch tab
    const initialRoute = (sessionStorage.getItem('spotiwind_target_route') || window.location.pathname).toLowerCase();
    if (initialRoute.includes('register')) {
        switchTab(registerTab, loginTab, registerForm, loginForm, 'Create account', 'Create your account to start streaming music today.');
    }

    // Generic Social Login Handler
    const handleSocialLogin = async (providerInstance, btn) => {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        
        try {
            await loginWithSocial(providerInstance);
            showLoadingOverlay();
        } catch (error) {
            if (error.code === 'auth/popup-closed-by-user') {
                console.info('Sign-in cancelled: popup was closed before login completed.');
            } else if (error.code === 'auth/popup-blocked') {
                console.warn('Sign-in popup was blocked by browser.');
            } else {
                console.error("Social Auth Error Details:", error.code, error.message);
            }
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };

    // Tab Event Listeners
    loginTab?.addEventListener('click', () => {
        switchTab(loginTab, registerTab, loginForm, registerForm, 'Welcome back!', 'Good to see you again. Login to continue your music journey.');
    });

    registerTab?.addEventListener('click', () => {
        switchTab(registerTab, loginTab, registerForm, loginForm, 'Create your account', 'Join Spotiwind and start your music adventure.');
    });

    registerLink?.addEventListener('click', () => registerTab?.click());
    loginLink?.addEventListener('click', () => loginTab?.click());

    // Social Login Bindings
    document.getElementById('googleBtn')?.addEventListener('click', (e) => {
        handleSocialLogin('google', e.currentTarget);
    });

    document.getElementById('facebookBtn')?.addEventListener('click', (e) => {
        handleSocialLogin('facebook', e.currentTarget);
    });

    document.getElementById('appleBtn')?.addEventListener('click', (e) => {
        handleSocialLogin('apple', e.currentTarget);
    });

    const forgotLink = document.getElementById('forgotPassword');
    forgotLink?.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        if (!email) {
            alert("Please enter your email address first.");
            return;
        }
        try {
            await resetPassword(email);
            alert("A password reset email has been sent. Please check your inbox.");
        } catch (error) {
            console.error("Reset Password Error:", error);
            alert("Failed to send reset email: " + getErrorMessage(error.code));
        }
    });

    // Password Visibility Toggle (Using Event Delegation)
    document.body.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.password-toggle');
        if (toggleBtn) {
            const input = toggleBtn.parentElement.querySelector('input');
            const icon = toggleBtn.querySelector('.eye-icon');
            const isPassword = input.type === 'password';
            
            input.type = isPassword ? 'text' : 'password';
            icon.innerHTML = isPassword ? eyeSlashPath : eyePath;
        }
    });

    // Back to music button dynamic handler
    const backBtn = document.getElementById('authBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.history.length > 1) {
                window.history.back();
            } else {
                const isMobile = window.innerWidth <= 768;
                window.location.href = isMobile ? 'home-mobile.html' : 'home-desktop.html';
            }
        });
    }

    // Form Handling
    const handleSubmission = (form, type) => {
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Reset visual errors
            form.querySelectorAll('.input-field').forEach(input => {
                input.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            });

            const submitBtn = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            if (type === 'register' && data.password !== data['confirm-password']) {
                alert("Passwords do not match.");
                return;
            }

            submitBtn.disabled = true;
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Processing...';

            try {
                const rememberMe = data['remember-me'] === 'on';
                const email = data.email.trim();
                const password = data.password;

                if (type === 'register') {
                    console.log("Attempting registration for:", email);
                    suppressAuthRedirect = true;
                    const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();
                    await registerWithEmail(fullName, email, password, rememberMe, data.username);
                    await signOut(auth);
                    loginTab.click();
                    alert("Account created successfully! Please log in.");
                } else {
                    console.log("Attempting manual login for:", email);
                    await loginWithEmail(email, password, rememberMe);
                    showLoadingOverlay();
                }
            } catch (error) {
                if (type === 'register') {
                    suppressAuthRedirect = false;
                }
                console.error("Login/Register Error:", error.code, error.message);
                alert(getErrorMessage(error.code));

                if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                    const emailInput = form.querySelector('input[name="email"]');
                    if (emailInput) emailInput.style.borderColor = '#ef4444';
                } else if (error.code === 'auth/wrong-password') {
                    const passwordInput = form.querySelector('input[name="password"]');
                    if (passwordInput) passwordInput.style.borderColor = '#ef4444';
                } else if (error.code === 'auth/invalid-credential') {
                    form.querySelectorAll('.input-field').forEach(i => i.style.borderColor = '#ef4444');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    };

    handleSubmission(loginForm, 'login');
    handleSubmission(registerForm, 'register');
});
