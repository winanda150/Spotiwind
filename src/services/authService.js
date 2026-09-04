import {
    auth,
    db,
    createUserWithEmailAndPassword,
    doc,
    getDoc,
    signInWithEmailAndPassword,
    setDoc,
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
        case 'auth/username-already-in-use': return 'Username is already registered.';
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

import { clearGuestHistory } from "./guestHistoryService.js";

/**
 * Handles user registration with email and password.
 * @param {string} name - The user's full name.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @param {boolean} rememberMe - Whether to persist the session.
 * @param {string} username - The user's unique username.
 */
export const registerWithEmail = async (name, email, password, rememberMe, username) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    const normalizedUsername = username.trim().toLowerCase();
    const usernameRef = doc(db, "usernames", normalizedUsername);
    const existingUsername = await getDoc(usernameRef);

    if (existingUsername.exists()) {
        const error = new Error('Username is already registered');
        error.code = 'auth/username-already-in-use';
        throw error;
    }

    await setPersistence(auth, persistence);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    clearGuestHistory();
    await updateProfile(userCredential.user, {
        displayName: name
    });

    await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        email,
        username: normalizedUsername,
        displayName: name,
        createdAt: Date.now()
    }, { merge: true });

    await setDoc(usernameRef, {
        uid: userCredential.user.uid,
        email
    });

    return userCredential.user;
};

const resolveLoginEmail = async (identifier) => {
    if (identifier.includes('@')) return identifier;

    const usernameSnapshot = await getDoc(doc(db, "usernames", identifier.toLowerCase()));
    const profile = usernameSnapshot.exists() ? usernameSnapshot.data() : null;

    if (!profile?.email) {
        const error = new Error('User not found');
        error.code = 'auth/user-not-found';
        throw error;
    }

    return profile.email;
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
    const loginEmail = await resolveLoginEmail(email.trim());
    const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
    clearGuestHistory();
    return userCredential.user;
};

/**
 * Handles social media login popup.
 * @param {string} providerName - The name of the provider ('google', 'facebook', 'apple').
 */
export const loginWithSocial = async (providerName) => {
    await setPersistence(auth, browserLocalPersistence);
    const provider = providerName === 'google' ? new GoogleAuthProvider()
        : providerName === 'facebook' ? new FacebookAuthProvider()
        : new OAuthProvider('apple.com');
    const result = await signInWithPopup(auth, provider);
    clearGuestHistory();
    return result;
};

export const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
};