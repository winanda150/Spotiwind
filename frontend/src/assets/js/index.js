import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    FacebookAuthProvider,
    OAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    onAuthStateChanged,
    setPersistence, 
    browserLocalPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Masukkan konfigurasi Firebase Anda di sini
const firebaseConfig = {
    apiKey: "AIzaSyDPytasOsMlHemXBbmsmcu_RJDhrZPbefg",
    authDomain: "spotiwind-music-2686a.firebaseapp.com",
    projectId: "spotiwind-music-2686a",
    storageBucket: "spotiwind-music-2686a.firebasestorage.app",
    messagingSenderId: "421626384106",
    appId: "1:421626384106:web:28207fb4476fb327039193",
    measurementId: "G-16NYW0QSGV",
    databaseURL: "https://spotiwind-music-2686a-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // Element Selectors
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const formTitle = document.querySelector('.title');
    const formSubtitle = document.querySelector('.subtitle');
    const overlay = document.getElementById('pageTransition');

    const hideLoadingOverlay = () => {
        if (overlay) {
            overlay.classList.add('fade-out');
        }
    };

    const showLoadingOverlay = () => {
        if (overlay) {
            overlay.classList.remove('fade-out');
        }
    };

    // Auth Observer: Check if the user was previously logged in
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("User detected:", user.email);
            document.body.classList.add('is-transitioning'); // Add this class
            showLoadingOverlay();

            // Automatic redirect if already logged in
            setTimeout(() => {
                // Detect if the device is mobile based on screen width
                const isMobile = window.innerWidth <= 768;
                const targetPage = isMobile ? 'mobile.html' : 'desktop.html';
                window.location.replace(targetPage);
            }, 1000);
        } else {
            // Jika tidak ada user (Logged Out), langsung sembunyikan overlay
            // dan tampilkan halaman login.
            hideLoadingOverlay();
        }
    });

    // SVG Paths for Eye and Eye-Slash
    const eyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />`;
    const eyeSlashPath = `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />`;

    // Tab Switching Logic
    const switchTab = (activeBtn, inactiveBtn, showForm, hideForm, title, subtitle) => {
        activeBtn.classList.add('active');
        inactiveBtn.classList.remove('active');
        showForm.classList.remove('hidden');
        hideForm.classList.add('hidden');
        formTitle.textContent = title;
        formSubtitle.textContent = subtitle;
    };

    loginTab.addEventListener('click', () => {
        switchTab(loginTab, registerTab, loginForm, registerForm, 'Welcome Back 👋', 'Login to continue your music journey');
    });

    registerTab.addEventListener('click', () => {
        switchTab(registerTab, loginTab, registerForm, loginForm, 'Create Account ✨', 'Start your musical journey today');
    });

    // Helper: Firebase Error Mapping
    const getErrorMessage = (code) => {
        switch (code) {
            case 'auth/email-already-in-use': return 'Email is already registered.';
            case 'auth/invalid-email': return 'Invalid email format. Please check your email address.';
            case 'auth/weak-password': return 'Password is too weak (min 6 characters).';
            case 'auth/user-not-found': 
                return 'Email not found. Please check it or sign up for a new account.';
            case 'auth/wrong-password':
                return 'Incorrect password. Please try again or reset your password.';
            case 'auth/invalid-credential':
                return 'Invalid credentials. Your email or password may be incorrect.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Access has been temporarily suspended. Try again later.';
            default: return `Error: ${code}. Please try again.`;
        }
    };

    // Generic Social Login Handler
    const handleSocialLogin = async (providerInstance, btn) => {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        
        try {
            const result = await signInWithPopup(auth, providerInstance);
            showLoadingOverlay(); // Show overlay on successful popup
            const user = result.user;
            // Redirect is handled automatically by onAuthStateChanged
        } catch (error) {
            console.error("Social Auth Error Details:", error.code, error.message);
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };

    // Social Login Bindings
    document.getElementById('googleBtn').addEventListener('click', (e) => {
        handleSocialLogin(new GoogleAuthProvider(), e.currentTarget);
    });

    document.getElementById('facebookBtn').addEventListener('click', (e) => {
        handleSocialLogin(new FacebookAuthProvider(), e.currentTarget);
    });

    document.getElementById('appleBtn').addEventListener('click', (e) => {
        handleSocialLogin(new OAuthProvider('apple.com'), e.currentTarget);
    });

    // Forgot Password
    const forgotLink = document.getElementById('forgotPassword');
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        if (!email) {
            alert("Please enter your email address first.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email); // Use await here
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

    // Form Handling
    const handleSubmission = (form, type) => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Reset visual errors (red border) before processing
            form.querySelectorAll('.input-field').forEach(input => {
                input.style.borderColor = 'transparent';
            });

            const submitBtn = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            if (type === 'register' && data.password !== data['confirm-password']) {
                return;
            }

            submitBtn.disabled = true;
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Processing...';

            try {
                // Handle Persistence (Remember Me)
                const persistence = data['remember-me'] ? browserLocalPersistence : browserSessionPersistence;
                await setPersistence(auth, persistence);

                const email = data.email.trim();
                const password = data.password;

                if (type === 'register') {
                    console.log("Attempting registration for:", email);
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    // Save full name to Firebase profile
                    await updateProfile(userCredential.user, {
                        displayName: data.name.trim()
                    });
                    loginTab.click(); // Switch to login tab
                } else {
                    console.log("Attempting manual login for:", email);
                    await signInWithEmailAndPassword(auth, email, password);
                    showLoadingOverlay(); // Show loader after successful login
                    // Redirect is handled automatically by onAuthStateChanged
                }
            } catch (error) {
                console.error("Login/Register Error:", error.code, error.message);
                const errorMessage = getErrorMessage(error.code);

                // Provide visual feedback: Red border on the incorrect input
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