import {
    auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    FacebookAuthProvider,
    OAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from "../assets/js/firebase-config.js";

/**
 * Maps Firebase error codes to user-friendly messages.
 * @param {string} code - The Firebase error code.
 * @returns {string} A user-friendly error message.
 */
export const getErrorMessage = (code) => {
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

/**
 * Handles user registration with email and password.
 * @param {string} name - The user's full name.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @param {boolean} rememberMe - Whether to persist the session.
 */
export const registerWithEmail = async (name, email, password, rememberMe) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, {
        displayName: name
    });
    return userCredential.user;
};

/**
 * Handles user login with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @param {boolean} rememberMe - Whether to persist the session.
 */
export const loginWithEmail = async (email, password, rememberMe) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
};

/**
 * Handles social media login popup.
 * @param {string} providerName - The name of the provider ('google', 'facebook', 'apple').
 */
export const loginWithSocial = (providerName) => {
    const provider = providerName === 'google' ? new GoogleAuthProvider()
        : providerName === 'facebook' ? new FacebookAuthProvider()
        : new OAuthProvider('apple.com');
    return signInWithPopup(auth, provider);
};

export const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
};