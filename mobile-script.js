import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
    getDatabase,
    ref,
    onValue,
    set as rtdbSet,
    onDisconnect,
    serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import {
    getFirestore,
    collection,
    query,
    onSnapshot,
    orderBy,
    getDocs,
    where,
    doc,
    documentId,
    setDoc,
    limit,
    serverTimestamp,
    getDoc,
    deleteDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app); // Initialize Firestore
const rtdb = getDatabase(app); // Initialize Realtime Database

// Jamendo API Configuration (Free for developers)
const JAMENDO_CLIENT_ID = '17b8da78';
const JAMENDO_API_URL = 'https://api.jamendo.com/v3.0/tracks/';

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let trendingPlaylist = []; // Buffer to store the list of popular songs
let newReleasesPlaylist = []; // Buffer to store the list of new releases
let searchPlaylist = []; // Buffer to store search results
let indonesianSongsPlaylist = []; // NEW: Buffer for all local songs
let indonesianGridPlaylist = []; // NEW: Buffer specifically for the 12 songs in the Indonesian grid
let currentSongIndex = -1;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;
let currentContext = null; // Store the active context globally
let currentSongData = null; // Stores the currently active song data
let activityUpdateTimeout = null; // For activity update optimization
let friendActivityListeners = []; // Store listeners so they can be cleared

// NEW: Tracking RTDB listeners to avoid duplicates (Sync with Desktop)
const activePresenceListeners = new Set();

// Cache friend online status (same as desktop)
const friendOnlineStatus = {};

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

/**
 * Helper to format seconds to MM:SS
 */
const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`; 
};

/**
 * Helper to accurately compare audio URLs (ignore protocol/trailing slash)
 */
const isSameAudio = (url1, url2) => {
    if (!url1 || !url2) return false;
    const clean = u => u.replace(/^https?:/, '').replace(/\/$/, '');
    return clean(url1) === clean(url2);
};

/**
 * Helper to reset play/pause button UI (Sync with Mobile)
 */
const resetBtnUI = (btn) => {
    // Only reset innerHTML if the element is indeed an icon button (play-overlay)
    if (btn && (btn.classList.contains('play-overlay') || btn.classList.contains('play-pause-btn'))) {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    } else if (btn) {
        btn.classList.remove('btn-loading');
    }
};

// Event listener to update the progress bar and time in real-time
const mobileProgressThumbs = document.querySelectorAll('.mobile-mini-progress-bar');
activeAudio.addEventListener('timeupdate', () => {
    if (isDragging) return;

    if (activeAudio.duration) {
        const percent = (activeAudio.currentTime / activeAudio.duration) * 100;
        mobileProgressThumbs.forEach(thumb => thumb.style.width = `${percent}%`);
        
        // Sync Full Player Progress
        document.getElementById('fullProgressBar').style.width = `${percent}%`;
        document.getElementById('fullCurrentTime').textContent = formatTime(activeAudio.currentTime);
    }
});

// Update total duration when song metadata is loaded
activeAudio.addEventListener('loadedmetadata', () => {
    document.getElementById('fullTotalTime').textContent = formatTime(activeAudio.duration);
});

// Toggle is-playing class on the card for CSS animation
activeAudio.addEventListener('play', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    document.querySelectorAll('#mobileMainPlayBtn').forEach(btn => btn.innerHTML = PAUSE_ICON);
    document.getElementById('mobilePlayerBar')?.classList.add('is-playing');
    document.getElementById('mobileFullPlayer')?.classList.add('is-playing');

    // Sync Full Player Play Button
    const fullPlayBtn = document.getElementById('fullMainPlayBtn');
    if (fullPlayBtn) fullPlayBtn.innerHTML = PAUSE_ICON;
    
    // Sync ALL instances of this song (in Grid and Search Dropdown)
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-active-song');
            el.classList.remove('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) overlay.innerHTML = PAUSE_ICON;
        });
    }
});

activeAudio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    document.querySelectorAll('#mobileMainPlayBtn').forEach(btn => btn.innerHTML = PLAY_ICON);
    document.getElementById('mobilePlayerBar')?.classList.remove('is-playing');
    document.getElementById('mobileFullPlayer')?.classList.remove('is-playing');

    // Sync Full Player Pause Button
    const fullPlayBtn = document.getElementById('fullMainPlayBtn');
    if (fullPlayBtn) fullPlayBtn.innerHTML = PLAY_ICON;
    
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) overlay.innerHTML = PLAY_ICON;
        });
    }
});

/**
 * Song navigation function (Next / Previous)
 */
window.playNext = () => {
    if (currentPlaylist.length === 0) return;

    // Since currentPlaylist is already shuffled in its array when Shuffle is active,
    // we just need to take the next in order.
    let nextIndex = currentSongIndex + 1;
    if (nextIndex >= currentPlaylist.length) nextIndex = 0; 

    triggerSongByIndex(nextIndex);
};

window.playPrevious = () => {
    if (currentPlaylist.length === 0) return;
    let prevIndex = currentSongIndex - 1;
    if (prevIndex < 0) prevIndex = currentPlaylist.length - 1; // Go to the end if at the beginning
    triggerSongByIndex(prevIndex);
};

/**
 * Updates the "Up Next" list in the Full Screen Player
 */
const renderUpNext = () => {
    const listContainer = document.getElementById('upNextList');
    if (!listContainer) return;

    if (!currentPlaylist || currentPlaylist.length === 0 || currentSongIndex === -1) {
        listContainer.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">No upcoming songs</p>';
        return;
    }

    // Problem Solved: Use a Set to track unique songs to avoid visual duplication
    // if the playlist is very short.
    const nextSongs = [];
    const maxItems = Math.min(currentPlaylist.length, 5); // Limit to a maximum of 5 upcoming songs
    const seenIds = new Set();

    for (let i = 0; i < currentPlaylist.length && nextSongs.length < maxItems; i++) {
        const idx = (currentSongIndex + i) % currentPlaylist.length;
        const song = currentPlaylist[idx];
        if (!seenIds.has(song.id)) {
            nextSongs.push({ ...song, originalIndex: idx });
            seenIds.add(song.id);
        }
    }

    const html = nextSongs.map((song, idx) => {
        // isActive is only for the first index (the song that is actually playing now)
        const isActive = idx === 0; 
        // Escape single and double quotes to avoid breaking HTML attributes
        const safeTitle = song.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeArtist = song.artist.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        return `
        <div class="up-next-item ${isActive ? 'active' : ''}" 
            style="animation-delay: ${idx * 0.05}s; view-transition-name: up-next-item-${song.id};" 
            onclick="playPreview(null, '${song.audio}', '${safeTitle}', '${safeArtist}', '${song.cover}', '${song.id}', ${song.duration}, null)">
            <img src="${song.cover}" class="up-next-cover" alt="${song.name}">
            <div class="up-next-info">
                <div class="up-next-name">${song.name}</div>
                <div class="up-next-artist">${song.artist}</div>
            </div>
            <div class="up-next-right">
                <span class="up-next-duration">${formatTime(song.duration)}</span>
                <div class="equalizer">
                    <span></span><span></span><span></span>
                </div>
                <div class="up-next-icon">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                    </svg>
                </div>
            </div>
        </div>
    `;}).join('');

    // Use View Transitions API if available (Chrome/Safari 17.4+)
    if (document.startViewTransition) {
        document.startViewTransition(() => {
            listContainer.innerHTML = html;
        });
    } else {
        listContainer.innerHTML = html;
    }
};

const triggerSongByIndex = (index) => {
    const song = currentPlaylist[index];
    if (!song) return;

    // Find the specific play-overlay element to avoid overwriting the main container
    const activeEl = document.querySelector(`.is-active-song[data-id="${song.id}"]`) || 
                     document.querySelector(`[data-id="${song.id}"]`);
    const btn = activeEl?.querySelector('.play-overlay');

    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration);
};
 
/**
 * Function to update user activity in Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    // Cancel previous timeout if any (Debouncing as per desktop)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Only update if the song has been playing for more than 5 seconds
    activityUpdateTimeout = setTimeout(async () => {
        try {
            await setDoc(doc(db, "friends_activity", user.uid), {
                name: user.displayName || user.email.split('@')[0],
                song: songName,
                avatar: user.photoURL || "",
                timestamp: serverTimestamp()
            }, { merge: true });
            console.log("Activity updated:", songName);
        } catch (error) {
            console.error("Failed to update activity to Firestore:", error);
        }
    }, 5000);
};

/**
 * Function to sync the Like button status in the player
 */
const syncPlayerLikeButtons = (isLiked) => {
    const mobileLikeBtn = document.getElementById('mobileLoveBtn');
    if (mobileLikeBtn) mobileLikeBtn.classList.toggle('liked', isLiked);
    
    const fullLikeBtn = document.getElementById('fullLoveBtn');
    if (fullLikeBtn) fullLikeBtn.classList.toggle('liked', isLiked);
};

/**
 * Function to check if a song is liked in Firestore
 */
const checkLikedStatus = async (songId) => {
    const user = auth.currentUser;
    if (!user || !songId || !db) {
        syncPlayerLikeButtons(false);
        return false;
    }

    const cleanId = String(songId).trim();

    try {
        const likeRef = doc(db, "users", user.uid, "liked_songs", cleanId);
        const docSnap = await getDoc(likeRef);
        const isLiked = docSnap.exists();

        if (currentSongData && String(currentSongData.id) === cleanId) {
            syncPlayerLikeButtons(isLiked);
        }
        return isLiked;
    } catch (error) {
        console.error("Error checking liked status:", error);
        syncPlayerLikeButtons(false);
        return false;
    }
};

/**
 * Function to create heart particle effects (simplified for mobile)
 */
const createHeartParticles = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 5; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart-particle';
        heart.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#22c55e"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

        heart.style.position = 'fixed';
        heart.style.left = `${centerX}px`;
        heart.style.top = `${centerY}px`;
        heart.style.zIndex = '20000';
        heart.style.pointerEvents = 'none';
        
        heart.style.setProperty('--x-offset', (Math.random() - 0.5) * 80);
        heart.style.setProperty('--y-offset', (Math.random() - 0.5) * 40);
        heart.style.setProperty('--rotate', `${(Math.random() - 0.5) * 45}deg`);
        
        heart.style.animation = 'heart-float 0.8s ease-out forwards';
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 800);
    }
};

// Notification System (Konsisten dengan script.js)
const showToast = (message) => {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    
    // Automatically remove after the animation finishes (3 seconds)
    setTimeout(() => {
        toast.remove();
    }, 3000);
};

/**
 * Function to set the current user's online/offline status in the Realtime Database
 */
const setupUserPresence = (user) => {
    if (!user) return;

    const userStatusRef = ref(rtdb, `presence/${user.uid}`);
    const isConnectedRef = ref(rtdb, '.info/connected');
    const myStatusIndicator = document.querySelector('.header-right .online-status');

    const setOnline = () => {
        if (myStatusIndicator) myStatusIndicator.classList.remove('offline');
        rtdbSet(userStatusRef, {
            state: 'online',
            last_changed: rtdbServerTimestamp()
        });
    };

    const setOffline = () => {
        if (myStatusIndicator) myStatusIndicator.classList.add('offline');
        rtdbSet(userStatusRef, {
            state: 'offline',
            last_changed: rtdbServerTimestamp()
        });
    };

    onValue(isConnectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            setOnline();
            
            // Set onDisconnect to change status to offline when disconnected
            onDisconnect(userStatusRef).set({
                state: 'offline',
                last_changed: rtdbServerTimestamp()
            });
        }
        else {
            // setOffline(); // This is handled by onDisconnect
        }
    });

    // Fix: Only set online on return, don't force offline on hide
    // so that 'Listening to...' status remains accurate during background play.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') setOnline();
    });
};

/**
 * Function to monitor friends' online status in real-time on mobile
 */
const listenToFriendPresence = (friendUid) => {
    if (activePresenceListeners.has(friendUid)) return;
    activePresenceListeners.add(friendUid);

    const friendStatusRef = ref(rtdb, `presence/${friendUid}`);
    onValue(friendStatusRef, (snapshot) => {
        const data = snapshot.val();
        const isOnline = data?.state === 'online';
        friendOnlineStatus[friendUid] = isOnline;
        
        // Update UI if the friend's element is on the page (e.g., in the activity list)
        const statusElements = document.querySelectorAll(`.friend-item[data-uid="${friendUid}"] .online-status`);
        statusElements.forEach(el => {
            if (isOnline) el.classList.remove('offline');
            else el.classList.add('offline');
        });
    });
};

/**
 * Function to fetch friend activity (same logic as desktop)
 */
const renderMobileFriendActivity = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Clear old listeners if any to prevent memory leaks
    if (friendActivityListeners.length > 0) {
        friendActivityListeners.forEach(unsub => unsub());
        friendActivityListeners = [];
    }

    try {
        // 1. Get the list of UIDs of people being followed (Following)
        const followingRef = collection(db, "users", user.uid, "following");
        const followingSnap = await getDocs(followingRef);
        const followingIds = followingSnap.docs.map(doc => doc.id).filter(id => id !== user.uid);

        // If not following anyone, no need to proceed
        if (followingIds.length === 0) return;

        // 2. Render container (assuming it's in the HTML or add it dynamically)
        const container = document.getElementById('mobileFriendActivity');

        const q = query(collection(db, "friends_activity"), where(documentId(), "in", followingIds.slice(0, 30)), limit(5));

        const unsub = onSnapshot(q, (snapshot) => {
            const activities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            activities.forEach(friend => listenToFriendPresence(friend.id));

            if (container) {
                container.innerHTML = activities.map(friend => {
                    const onlineClass = friendOnlineStatus[friend.id] ? '' : 'offline';
                    return `
                        <div class="friend-item" data-uid="${friend.id}" style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
                            <div class="avatar-container">
                                <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" style="width: 35px; height: 35px; border-radius: 50%;">
                                <span class="online-status ${onlineClass}"></span>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                                    <strong>${friend.name}</strong>
                                    <span style="color: var(--text-muted);">${formatRelativeTime(friend.timestamp)}</span>
                                </div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Listening to ${friend.song}</div>
                            </div>
                        </div>`;
                }).join('');
            }
        });

        friendActivityListeners.push(unsub);
    } catch (error) {
        console.error("Failed to load friend activity on mobile:", error);
    }
};

/**
 * Helper for relative time format (same as desktop)
 */
const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "now";
    const now = new Date();
    const date = timestamp.toDate();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return "now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    return `${Math.floor(diffInMinutes / 60)}h`;
};

document.addEventListener('DOMContentLoaded', () => {
    // NEW: Set copyright year automatically
    const copyrightYearEl = document.getElementById('copyrightYear');
    if (copyrightYearEl) {
        copyrightYearEl.textContent = new Date().getFullYear();
    }

    // NEW: Centralized Event Delegation for all song cards
    // This prevents multiple listeners from being attached and causing race conditions.
    document.body.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.song-card .play-overlay') || e.target.closest('.song-card .play-mini-btn');
        if (!playBtn) return;

        // Prevent the click from bubbling up to other potential listeners (like the mini player bar)
        e.stopPropagation();

        const card = playBtn.closest('.song-card');
        const overlay = card.querySelector('.play-overlay'); // Always get data from the main overlay
        const d = overlay.dataset;
        window.playPreview(overlay, d.audio, d.name, d.artist, d.cover, card.dataset.id, Number(d.duration), d.context);
    });

    // NEW: Footer Dropdown Logic
    const footerLinkHeaders = document.querySelectorAll('.footer-link-header');
    footerLinkHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.footer-link-group');
            if (group) {
                group.classList.toggle('expanded');
            }
        });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    const greetingBadge = document.getElementById('greetingBadge');

    let lastHour = -1; // Stores the last hour's status for rendering optimization

    const updateGreeting = () => {
        if (!greetingBadge) return;
        const hour = new Date().getHours();
        if (hour === lastHour) return; // Optimization: Only process if the hour has changed
        lastHour = hour;

        let greeting = "";
        let emoji = "";

        if (hour >= 4 && hour < 10) {
            greeting = "Morning";
            emoji = "🌅";
        } else if (hour >= 10 && hour < 15) {
            greeting = "Afternoon";
            emoji = "☀️";
        } else if (hour >= 15 && hour < 18) {
            greeting = "Evening";
            emoji = "🌇";
        } else {
            greeting = "Night";
            emoji = "🌙";
        }
        greetingBadge.textContent = `Good ${greeting} ${emoji}`;
    };

    updateGreeting();
    // Update the greeting every 1 minute to keep it accurate if the page is left open
    setInterval(updateGreeting, 60000);

    // Immediately update if the user returns to this tab (Visibility API)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateGreeting();
    });

    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

    /**
     * Main function to toggle Like/Unlike
     */
    const toggleLike = async (e) => {
        const user = auth.currentUser;
        const btn = e.currentTarget;

        if (!user || !currentSongData || !btn || !db) {
            return;
        }

        const songId = String(currentSongData.id).trim();
        if (!songId) return;

        const wasLiked = btn.classList.contains('liked');
        syncPlayerLikeButtons(!wasLiked);
        if (!wasLiked) {
            createHeartParticles(btn);
        } else {
            // Visual feedback effect on dislike (un-love)
            btn.classList.add('dislike-anim');
            setTimeout(() => btn.classList.remove('dislike-anim'), 400);
        }

        const likeRef = doc(db, "users", user.uid, "liked_songs", songId);
        try {
            if (wasLiked) {
                await deleteDoc(likeRef);
            } else {
                const cleanData = {
                    id: songId,
                    name: String(currentSongData.name || "Unknown Title"),
                    artist: String(currentSongData.artist || "Unknown Artist"),
                    cover: currentSongData.cover || "",
                    audio: currentSongData.audio || "",
                    likedAt: serverTimestamp()
                };
                await setDoc(likeRef, cleanData);
            }
        } catch (error) {
            syncPlayerLikeButtons(wasLiked);
            console.error("Firebase Save Error:", error);
        }
    };

/**
 * Special function to play a song from the search dropdown results.
 * It updates currentPlaylist so that the Next/Prev features are in sync with the search results.
 */
window.playFromSearch = (audioUrl, title, artist, cover, id) => {
    // Get duration from lastSearchResults if available
    const songData = window.lastSearchResults?.find(s => String(s.id) === String(id));
    const duration = songData ? songData.duration : 0; // Default to 0 if not found
    window.playPreview(null, audioUrl, title, artist, cover, id, duration, 'search');
};

    /**
     * Function to play/pause audio
     */
    window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null) => {
        if (!audioUrl) {
            return;
        }

        currentContext = context; // Update global context

        // If btn is null (called from Up Next/Next/Prev), try to find the button in the DOM to sync the UI
        if (!btn) {
            const activeEl = document.querySelector(`.is-active-song[data-id="${id}"]`) || 
                             document.querySelector(`[data-id="${id}"]`);
            btn = activeEl?.querySelector('.play-overlay');
        }

        // Only update the playlist if a context is given (New play from a specific section)
        // If null (e.g., from Next/Prev/Repeat), use the existing currentPlaylist.
        if (context) {
            let baseQueue = [];
            if (context === 'trending' || context === 'new') {
                const masterPool = [...trendingPlaylist, ...newReleasesPlaylist];
                baseQueue = Array.from(new Map(masterPool.map(s => [s.id, s])).values());
            } else if (context === 'search') {
                baseQueue = [...searchPlaylist]; // Use a copy to keep the current queue stable
            } else if (context === 'local') {
                baseQueue = [...indonesianGridPlaylist]; // FIX: Use the local grid playlist
            }

            if (isShuffle) {
                const selectedTrack = baseQueue.find(s => String(s.id) === String(id)) || 
                            { id, audio: audioUrl, name: title, artist, cover, duration: duration };
                const remainingTracks = baseQueue.filter(s => String(s.id) !== String(id));
                
                for (let i = remainingTracks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
                }
                currentPlaylist = [selectedTrack, ...remainingTracks];
            } else {
                currentPlaylist = baseQueue;
            }
        }

        const songId = String(id);
        const isSameSong = currentSongData && String(currentSongData.id) === songId;

        // Toggle Play/Pause logic for the same song
        if (isSameSong) {
            if (!activeAudio.paused) {
                activeAudio.pause();
            } else {
                try {
                    // If the song has ended, reset to the beginning before replaying (Important for Repeat)
                    if (activeAudio.ended) activeAudio.currentTime = 0;
                    await activeAudio.play();
                } catch (e) {
                    console.error("Resume error:", e);
                }
            }
            return;
        }

        // Playing a New Song
        currentSongData = { id: songId, audio: audioUrl, name: title, artist, cover, duration: duration };

        // Set the song index in the newly created/shuffled playlist
        // This is very important so that the Next/Prev buttons know their relative position
        currentSongIndex = currentPlaylist.findIndex(s => isSameAudio(s.audio, audioUrl));

        // Render the list of next songs instantly (don't wait for the song to load)
        renderUpNext();

        // Reset ALL song statuses (prevents visual duplicates during fast skipping)
        document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
            el.classList.remove('is-active-song', 'is-paused');
        });

        document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(el => {
            el.classList.remove('btn-loading');
            if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
        });

        // Activate the class on all elements with this ID
        document.querySelectorAll(`[data-id="${songId}"]`).forEach(el => el.classList.add('is-active-song'));

        // Reset Mini Progress Bar to 0 instantly before the new song loads
        document.querySelectorAll('.mobile-mini-progress-bar').forEach(thumb => thumb.style.width = '0%');

        currentPlayingBtn = btn;
        if (btn) btn.classList.add('btn-loading');
        document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));

        activeAudio.onerror = null;
        activeAudio.onended = null;

        try {
            activeAudio.src = audioUrl;

        // Update Document Title (Consistent with desktop)
        document.title = `Spotiwind - Feel The Music, Ride The Wind`;

        // Media Session API integration
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Spotiwind', // Or get from currentSongData if available
                artwork: [
                    { src: cover, sizes: '512x512', type: 'image/webp' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => activeAudio.play());
            navigator.mediaSession.setActionHandler('pause', () => activeAudio.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => window.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => window.playNext());
        }

            syncPlayerLikeButtons(false);
            checkLikedStatus(id);

            // Show and update Mobile Player Bar
            const mobileBar = document.getElementById('mobilePlayerBar');
            if (mobileBar) {
                mobileBar.classList.add('active');
                document.body.classList.add('player-active');
            }

            document.getElementById('mobileTrackName').textContent = title;
            document.getElementById('mobileTrackArtist').textContent = artist;
            document.getElementById('mobileTrackCover').src = cover;

            // Update Full Player Info
            document.getElementById('fullTrackName').textContent = title;
            document.getElementById('fullTrackArtist').textContent = artist;
            document.getElementById('fullTrackCover').src = cover;
            document.getElementById('fullProgressBar').style.width = '0%';

            activeAudio.onerror = (e) => {
                console.error("Audio playback error:", e);
                resetBtnUI(btn);
                currentPlayingBtn = null;
            };

            await activeAudio.play();
            updateMyActivity(title);

            if (btn) btn.classList.remove('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));

        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error("Playback error:", error);
            showToast(error.message || "Failed to load song.");
            if (btn) btn.classList.remove('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
            currentPlayingBtn = null;
        }

        activeAudio.onended = () => {
            resetBtnUI(btn);
            currentPlayingBtn = null;
            if (isRepeat) {
                if (currentSongIndex !== -1) {
                    triggerSongByIndex(currentSongIndex); // Replay the same song
                } else if (currentSongData) {
                    // Fix: Ensure replaying a song from search is clean
                    window.playPreview(null, currentSongData.audio, currentSongData.name, currentSongData.artist, currentSongData.cover, currentSongData.id, currentSongData.duration);
                }
            } else if (currentPlaylist.length > 0) {
                playNext();
            }
        };
    };

    /**
     * Function to render the artist list to the UI
     */
    const renderTopArtists = (artists) => {
        const artistsGrid = document.querySelector('.artists-grid');
        if (!artistsGrid) return;
        artistsGrid.innerHTML = artists.map(artist => ` 
            <div class="artist-card">
                <div class="artist-photo" style="background-image: url('${artist.photo}')"></div>
                <span class="artist-name">${artist.name}</span>
            </div>
        `).join('');
    };

    /**
     * Function to fetch popular artist data from Jamendo
     */
    const fetchTopArtists = async () => {
        const artistsGrid = document.querySelector('.artists-grid');
        try {
            const url = `https://api.jamendo.com/v3.0/artists/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=popularity_total`;
            const response = await fetchWithRetry(url);
            if (!response.ok) throw new Error("Failed to contact Jamendo server");
            const data = await response.json();
            
            if (data.results) {
                const artistsWithPhotos = data.results
                    .filter(item => item.image && item.image.trim() !== "")
                    .slice(0, 10)
                    .map(item => ({
                        id: item.id,
                        name: item.name,
                        photo: item.image
                    }));
                
                if (artistsWithPhotos.length === 0) {
                    return false; // Signal to retry if no artists with photos are found.
                }
                renderTopArtists(artistsWithPhotos);
                return true; // Success
            }
        } catch (error) {
            console.error("Failed to fetch artist data:", error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * Displays a skeleton loader in the grid.
     * @param {string} gridSelector - CSS selector for the grid container.
     * @param {string} type - Skeleton type ('song' or 'artist').
     * @param {number} count - Number of skeletons to display.
     */
    const showSkeletonLoader = (gridSelector, type, count = 6) => { 
        const grid = document.querySelector(gridSelector);
        if (!grid) return;

        let skeletonHTML = '';
        if (type === 'song') {
            skeletonHTML = `
                <div class="song-card-skeleton">
                    <div class="skeleton-cover"></div>
                    <div class="skeleton-info">
                        <div class="skeleton skeleton-title"></div>
                        <div class="skeleton skeleton-artist"></div>
                    </div>
                </div>
            `;
        } else if (type === 'artist') {
            skeletonHTML = `
                <div class="artist-card-skeleton">
                    <div class="skeleton skeleton-photo"></div>
                    <div class="skeleton skeleton-name"></div>
                </div>
            `;
        }

        grid.innerHTML = Array(count).fill(skeletonHTML).join('');
    };

    /**
     * Fetch function with a retry mechanism and exponential backoff.
     * @param {string} url - The API URL to fetch.
     * @param {object} options - Options for fetch.
     * @param {number} retries - Number of retry attempts.
     * @returns {Promise<Response>}
     */
    const fetchWithRetry = async (url, options = {}, retries = 3) => {
        let lastError;
        for (let i = 0; i < retries; i++) { // Attempt 'retries' times
            try {
                const response = await fetch(url, options);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response; // If successful, return the response
            } catch (error) {
                lastError = error;
                console.warn(`Fetch attempt ${i + 1} failed for ${url}. Retrying in ${2 ** i * 1000}ms...`);
                if (i < retries - 1) await new Promise(res => setTimeout(res, 2 ** i * 1000)); // Exponential backoff: 1s, 2s, 4s...
            }
        }
        throw lastError; // Throw the last error after all attempts fail
    };
    // Helper function to format play counts (e.g., 1.2M, 500K, 300)
    const formatPlayCount = (count) => {
        if (typeof count !== 'number' || isNaN(count)) {
            return '0';
        }
        if (count >= 1000000) { // Handle jutaan (M)
            return (count / 1000000).toFixed(1) + 'M';
        }
        if (count >= 1000) { // Handle ribuan (K)
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    };

    /**
     * Generic song card renderer. Returns an HTML string for a single song.
     * This promotes reusability without causing side effects.
     */
    const createSongCardHTML = (song, context) => {
        const isActive = currentSongData && String(song.id) === String(currentSongData.id);
        const safeName = song.name.replace(/'/g, "\\'");
        const safeArtist = song.artist.replace(/'/g, "\\'");

        return `
        <div class="song-card ${isActive ? 'is-active-song' : ''} ${activeAudio.paused ? 'is-paused' : ''}" 
            data-id="${song.id}" data-audio="${song.audio}">
            <div class="song-cover">
                <img src="${song.cover}" alt="${song.name}" style="width:100%; height:100%; object-fit:cover;">
                <button class="play-overlay" aria-label="Play ${song.name}" 
                    data-audio="${song.audio}" data-name="${safeName}" data-artist="${safeArtist}" 
                    data-cover="${song.cover}" data-duration="${song.duration}" data-context="${context}">
                    ${isActive && !activeAudio.paused ? PAUSE_ICON : PLAY_ICON}
                </button>
            </div>
            <div class="song-info">
                <h3 class="song-name">${song.name}</h3>
                <p class="song-artist">${song.artist}</p>
            </div>
            <div class="song-footer">
                <div class="song-stats">
                    <button class="play-mini-btn" aria-label="Play ${song.name}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>
                    <span class="play-count">${song.plays || '0'}</span>
                </div>
            </div>
        </div>`;
    };

    /**
     * [REFACTOR] Fungsi renderer untuk satu kartu artis.
     * @param {object} artist - Objek data artis.
     * @returns {string} - String HTML untuk kartu artis.
     */
    const createArtistCardHTML = (artist) => {
        return ` 
        <div class="artist-card">
            <div class="artist-photo" style="background-image: url('${artist.photo}')"></div>
            <span class="artist-name">${artist.name}</span>
        </div>`;
    };

    /**
     * [NEW & SYNC WITH DESKTOP] Renders items into a grid one by one for a progressive loading effect.
     * It replaces existing skeleton elements sequentially.
     * @param {string} gridSelector - The CSS selector for the grid container.
     * @param {Array} items - The array of data items to render.
     * @param {function(object, string): string} itemRenderer - The function that returns HTML for one item.
     * @param {string} skeletonSelector - The CSS selector for the skeleton elements within the grid.
     * @param {string} [context] - The playback context for the items.
     */
    const renderGridProgressively = async (gridSelector, items, itemRenderer, skeletonSelector, context = '') => {
        const grid = document.querySelector(gridSelector);
        if (!grid) return;

        const skeletons = grid.querySelectorAll(skeletonSelector);

        for (let i = items.length; i < skeletons.length; i++) {
            skeletons[i].remove();
        }

        for (let i = 0; i < items.length; i++) {
            const itemHTML = itemRenderer(items[i], context);
            if (skeletons[i]) {
                skeletons[i].outerHTML = itemHTML;
            } else {
                grid.insertAdjacentHTML('beforeend', itemHTML);
            }
            await new Promise(res => setTimeout(res, 50)); // Small delay for visual effect
        }
    };

    /**
     * [FIX & REFACTOR] Universal grid rendering function synced with desktop.
     * Can handle loading (skeleton), empty, and success states.
     * @param {string} gridSelector - CSS selector for the grid container.
     * @param {Array|null} items - Data array. If null, show skeleton.
     * @param {(item: object, context?: string) => string} itemRenderer - Function to render one item into HTML.
     * @param {string} skeletonType - Skeleton type ('song' or 'artist').
     * @param {string} [context] - Playback context (optional).
     * @param {string} [emptyMessage] - Message if there are no items.
     * @param {number} [skeletonCount] - Number of skeletons to display.
     */
    const renderGrid = (gridSelector, items, itemRenderer, skeletonType, context = '', emptyMessage = "No items found.", skeletonCount = 4) => {
        const grid = document.querySelector(gridSelector);
        if (!grid) return;

        if (items === null) {
            showSkeletonLoader(gridSelector, skeletonType, skeletonCount);
        } else if (items.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem; padding-left: 1.5rem; text-align: center; width: 100%;">${emptyMessage}</p>`;
        } else {
            grid.innerHTML = items.map(item => itemRenderer(item, context)).join('');
        }
    };

    const searchMusic = async (query) => {
        const songGrid = document.querySelector('.popular-section .song-grid'); // TARGET SPECIFIC GRID
        const sectionTitle = document.getElementById('sectionTitle');
        if (!songGrid) return;
        
        const cleanQuery = query.trim().replace(/\s+/g, ' ');
        if (!cleanQuery) {
            fetchTrendingMusic();
            return;
        }

        showSkeletonLoader('.song-grid', 'song', 6);
        if (sectionTitle) sectionTitle.textContent = "Search Results";

        try {
            const baseUrl = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=40&include=stats&order=popularity_total`;
            const qWords = cleanQuery.toLowerCase().split(' ');
            
            // Pencarian Hybrid: Global search + Name search
            const [res1, res2] = await Promise.all([
                fetchWithRetry(`${baseUrl}&search=${encodeURIComponent(cleanQuery)}`),
                fetchWithRetry(`${baseUrl}&namesearch=${encodeURIComponent(cleanQuery)}`)
            ]);

            const data1 = await res1.json();
            const data2 = await res2.json();
            const combined = [...(data1.results || []), ...(data2.results || [])];

            const uniqueMap = new Map();
            combined.forEach(item => {
                if (!uniqueMap.has(item.id)) {
                    let score = 0;
                    const title = (item.name || "").toLowerCase();
                    const artist = (item.artist_name || "").toLowerCase();
                    const album = (item.album_name || "").toLowerCase();

                    // 1. Exact Match Priority (Paling Tinggi)
                    if (title === cleanQuery.toLowerCase()) score += 500; 
                    if (artist === cleanQuery.toLowerCase()) score += 200;

                    // 2. Cross-Field Match (Kunci untuk "Survive Jekk")
                    // Jika kata-kata yang diketik user tersebar di Judul DAN Artis
                    const matchInTitle = qWords.some(word => title.includes(word));
                    const matchInArtist = qWords.some(word => artist.includes(word));
                    
                    if (matchInTitle && matchInArtist) {
                        score += 400; // Bonus besar jika menemukan kombinasi Lagu + Artis
                    }
                    
                    // Bonus tambahan jika input user persis mengikuti pola "NamaArtis NamaLagu" atau sebaliknya
                    const combinedString = `${artist} ${title}`.toLowerCase();
                    const reversedString = `${title} ${artist}`.toLowerCase();
                    if (combinedString.includes(cleanQuery.toLowerCase()) || reversedString.includes(cleanQuery.toLowerCase())) {
                        score += 250;
                    }

                    // 3. Pengecekan kata per kata secara menyeluruh
                    const fullText = `${title} ${artist} ${album}`;
                    const matchesAll = qWords.every(word => fullText.includes(word));
                    if (matchesAll) score += 100; 

                    // 4. Phrase Matching (Urutan kata sesuai)
                    if (title.includes(cleanQuery.toLowerCase())) score += 100;

                    // 5. Start-with Bonus
                    if (title.startsWith(qWords[0])) score += 80;

                    // 6. Popularity Tie-breaker
                    score += (item.stats.rate_downloads_total / 1000);
                    
                    item.relevanceScore = score;
                    uniqueMap.set(item.id, item);
                }
            });

            const finalResults = Array.from(uniqueMap.values())
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, 15);

            if (finalResults.length > 0) {
                const rawSongs = finalResults.map(item => ({
                        id: item.id,
                        name: item.name,
                        artist: item.artist_name,
                        album: item.album_name,
                        cover: item.image || 'https://via.placeholder.com/400',
                        audio: item.audio || '',
                        duration: item.duration,
                        plays: formatPlayCount(item.stats.rate_downloads_total * 5) // Data real dari Jamendo
                    }));

                searchPlaylist = rawSongs;
                renderGridProgressively('.popular-section .song-grid', rawSongs, createSongCardHTML, '.song-card-skeleton', 'search');
            } else {
                songGrid.innerHTML = '<p style="width: 100%; text-align: center; color: var(--text-muted);">No results found.</p>';
            }
        } catch (error) {
            console.error("Search Music Error:", error);
            songGrid.innerHTML = `<p style="width: 100%; text-align: center; color: var(--text-muted);">Failed to search for songs. Try again later.</p>`;
        }
    };

    /**
     * Function to fetch the latest release data from Jamendo
     */
    const fetchNewReleases = async () => {
        const gridSelector = '#newReleasesGrid';

        try {
            // We take a higher limit (50) to filter for unique artists
            const url = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=releasedate_desc&include=stats`;
            const response = await fetchWithRetry(url);
            if (!response.ok) throw new Error("Failed to contact Jamendo server");
            const data = await response.json();

            // Filter to ensure each artist appears only once in the new releases list
            const seenArtists = new Set();
            const uniqueResults = [];
            for (const item of data.results) {
                if (!seenArtists.has(item.artist_id)) {
                    seenArtists.add(item.artist_id);
                    uniqueResults.push(item);
                }
                if (uniqueResults.length >= 12) break;
            }

            const rawSongs = uniqueResults.map((item) => ({
                id: item.id,
                name: item.name,
                artist: item.artist_name,
                album: item.album_name,
                cover: item.image,
                audio: item.audio,
                duration: item.duration,
                // New releases usually have a lower play count
                plays: formatPlayCount(Math.floor(Math.random() * 50000) + 1000)
            }));

            // [FIX] Only render and return true if there is data to display.
            if (rawSongs.length === 0) {
                console.warn("fetchNewReleases: No unique songs found after filtering, retrying...");
                return false; // Signal the retry-wrapper to try again.
            }

            newReleasesPlaylist = rawSongs;
            renderGridProgressively(gridSelector, rawSongs, createSongCardHTML, '.song-card-skeleton', 'new');
            return true; // Success
        } catch (error) {
            console.error("Failed to fetch new releases:", error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * Function to fetch local Indonesian songs from a JSON manifest.
     * Audio file source: Elemen/Lagu .../*.mp3
     * Cover source: Elemen/Images Song/*.jpg (filename matches song name)
     */
    const fetchIndonesianSongs = async () => {
        const gridSelector = '#indonesianSongsGrid';

        // List of 12 songs to be manually displayed in the main grid.
        // This data is no longer taken from a slice, but defined directly here.
        const IndonesianGridSongs = [
            {
                "id": "backstreet-boys-shape-of-my-heart", "name": "Shape Of My Heart", "artist": "Backstreet Boys", "plays": "98.1M", "duration": 228,
                "audio": "Elemen/Backstreet%20Boys/Shape%20Of%20My%20Heart.mp3", "cover": "Elemen/Backstreet%20Boys/Image%20Songs/Shape%20Of%20My%20Heart.webp" 
            },
            {
                "id": "riam-laode-dunia-yang-nanti", "name": "Dunia Yang Nanti", "artist": "Raim Laode", "plays": "75.3M", "duration": 200,
                "audio": "Elemen/Raim%20Laode/Dunia%20Yang%20Nanti.mp3", "cover": "Elemen/Raim%20Laode/Image%20Songs/Dunia%20Yang%20Nanti.webp"
            },
            {
                "id": "hindia-evaluasi", "name": "Evaluasi", "artist": "Hindia", "plays": "68.9M", "duration": 202,
                "audio": "Elemen/Hindia/Evaluasi.mp3", "cover": "Elemen/Hindia/Image%20Songs/Evaluasi.webp"
            },
            {
                "id": "rizky-febian-&-adrian-khalif-alamak", "name": "Alamak", "artist": "Rizky Febian & Adrian Khalif", "plays": "55.2M", "duration": 221,
                "audio": "Elemen/Rizky%20Febian/Alamak.mp3", "cover": "Elemen/Rizky%20Febian/Image%20Songs/Alamak.webp"
            },
            {
                "id": "feast-nina", "name": "Nina", "artist": ".Feast", "plays": "43.1M", "duration": 283,
                "audio": "Elemen/Feast/Nina.mp3", "cover": "Elemen/Feast/Image%20Songs/Nina.webp"
            },
            {
                "id": "idgitaf-sedia-aku-sebelum-hujan", "name": "Sedia Aku Sebelum Hujan", "artist": "Idgitaf", "plays": "39.8M", "duration": 233,
                "audio": "Elemen/Idgitaf/Sedia%20Aku%20Sebelum%20Hujan.mp3", "cover": "Elemen/Idgitaf/Image%20Songs/Sedia%20Aku%20Sebelum%20Hujan.webp"
            },
            {
                "id": "juicy-luicy-lantas", "name": "Lantas", "artist": "Juicy Luicy", "plays": "35.5M", "duration": 234,
                "audio": "Elemen/Juicy%20Luicy/Lantas.mp3", "cover": "Elemen/Juicy%20Luicy/Image%20Songs/Lantas.webp"
            },
            {
                "id": "vierra-seandainya", "name": "Seandainya", "artist": "Vierra", "plays": "31.2M", "duration": 263,
                "audio": "Elemen/Vierra/Seandainya.mp3", "cover": "Elemen/Vierra/Image%20Songs/Seandainya.webp"
            },
            {
                "id": "for-revenge,-stereo-wall-jakarta-hari-ini", "name": "Jakarta Hari Ini", "artist": "For Revenge, Stereo Wall", "plays": "28.9M", "duration": 224,
                "audio": "Elemen/For%20Revenge,%20Stereo%20Wall/Jakarta%20Hari%20Ini.mp3", "cover": "Elemen/For%20Revenge,%20Stereo%20Wall/Image%20Songs/Jakarta%20Hari%20Ini.webp"
            },
            {
                "id": "radiohead-creep", "name": "Creep", "artist": "Radiohead", "plays": "25.7M", "duration": 236,
                "audio": "Elemen/Radiohead/Creep.mp3", "cover": "Elemen/Radiohead/Image%20Songs/Creep.webp"
            },
            {
                "id": "batas-senja-kita-usahakan-lagi", "name": "Kita Usahakan Lagi", "artist": "Batas Senja", "plays": "22.4M", "duration": 234,
                "audio": "Elemen/Batas%20Senja/Kita%20Usahakan%20Lagi.mp3", "cover": "Elemen//Batas%20Senja/Image%20Songs/Kita%20Usahakan%20Lagi.webp"
            },
            {
                "id": "bilal-indrajaya-niscaya", "name": "Niscaya", "artist": "Bilal Indrajaya", "plays": "19.1M", "duration": 241,
                "audio": "Elemen/Bilal%20Indrajaya/Niscaya.mp3", "cover": "Elemen/Bilal%20Indrajaya/Image%20Songs/Niscaya.webp"
            }
        ];

        try {
            const res = await fetchWithRetry('./indonesian-songs-manifest.json');
            if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
            const data = await res.json();

            // Save ALL local songs to the global buffer
            indonesianSongsPlaylist = (data.songs || []).map((s, idx) => ({
                id: s.id || `local-${idx}`,
                name: s.name,
                artist: s.artist,
                cover: s.cover,
                audio: s.audio,
                duration: s.duration || 0, // Get duration from manifest, or default to 0
                plays: formatPlayCount(Math.floor(Math.random() * 99000000) + 1000000)
            }));

            // FIX: Save the 12 grid songs to a global variable so the player can access them
            indonesianGridPlaylist = IndonesianGridSongs;

            // Render the main grid with the manually defined song list above.
            // The 'local' context is used for playback logic.
            // The 'plays' data is now static and inside IndonesianGridSongs.
            renderGridProgressively(gridSelector, IndonesianGridSongs, createSongCardHTML, '.song-card-skeleton', 'local');
            return true; // NEW: Signal successful loading to fetchWithContinuousRetry

            // Note: `indonesianSongsPlaylist` which contains ALL songs is still stored
            // to be used by the search function in `fetchDropdownResults`.
        } catch (error) {
            console.error('Failed to load Indonesian Songs:', error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * Function to fetch popular song data from Jamendo
     */
    const fetchTrendingMusic = async () => {
        const gridSelector = '.popular-section .song-grid'; 
        const sectionTitle = document.getElementById('sectionTitle');
        try {
            if (sectionTitle) sectionTitle.textContent = "Popular Right Now";
            // We take a higher limit (50) to filter for unique artists in the grid
            const url = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=popularity_total&include=stats`;
            const response = await fetchWithRetry(url);
            if (!response.ok) throw new Error("Failed to contact Jamendo server");
            const data = await response.json();

            // Filter logic: Only take one song per artist for visual variety
            const seenArtists = new Set();
            const uniqueResults = [];
            for (const item of data.results) {
                if (!seenArtists.has(item.artist_id)) {
                    seenArtists.add(item.artist_id);
                    uniqueResults.push(item);
                }
                if (uniqueResults.length >= 12) break;
            }

            const rawSongs = uniqueResults.map((item) => ({
                    id: item.id,
                    name: item.name,
                    artist: item.artist_name,
                    album: item.album_name,
                    cover: item.image,
                    audio: item.audio,
                    duration: item.duration,
                    // New range: 300k to 5 million to feel more popular
                    plays: formatPlayCount(Math.floor(Math.random() * 4700000) + 300000)
        }));

        // [FIX] Only render and return true if there is data to display.
        if (rawSongs.length === 0) {
            console.warn("fetchTrendingMusic: No unique songs found after filtering, retrying...");
            return false; // Signal the retry-wrapper to try again.
        }

        trendingPlaylist = rawSongs;
        renderGridProgressively(gridSelector, rawSongs, createSongCardHTML, '.song-card-skeleton', 'trending');
        return true; // Success
        } catch (error) {
            console.error("Failed to fetch music data:", error);
            throw error; // Throw error to be caught by fetchWithContinuousRetry
        }
    };

    /**
     * NEW: Wrapper to continuously retry a fetch function upon failure.
     * This ensures the skeleton loader remains and the app keeps trying to load data.
     * @param {() => Promise<boolean>} fetchFunction - The async function to execute.
     * @param {number} delay - The delay (ms) before retrying.
     */
    const fetchWithContinuousRetry = async (fetchFunction, delay = 5000) => {
    // NEW: True Promise-based retry loop. This will hold Promise.all until success.
    while (true) {
        try {
            const success = await fetchFunction();
            if (success) {
                return true; // Success! Exit the loop and resolve the promise.
            }
            // If fetchFunction returns false (e.g., empty results), log and retry.
            console.warn(`${fetchFunction.name} returned no data. Retrying in ${delay}ms...`);
        } catch (error) {
            // If fetchFunction throws an error (e.g., network failure), log and retry.
            console.error(`Error in ${fetchFunction.name}. Retrying in ${delay}ms...`, error);
            }
        // Wait for the specified delay before the next iteration of the loop.
        await new Promise(resolve => setTimeout(resolve, delay));
        }
    };

    // Click Logic for Bottom Navigation
    const bottomNavItems = document.querySelectorAll('.mobile-bottom-nav .nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetPage = item.dataset.target; // Gunakan data-target
            const currentActive = document.querySelector('.mobile-bottom-nav .nav-item.active');

            if (currentActive === item) return; // Jangan lakukan apa-apa jika item yang sama diklik

            // Pindahkan kelas 'active'
            if (currentActive) currentActive.classList.remove('active');
            item.classList.add('active');

            // Muat konten halaman baru
            await loadPageContent(targetPage);
        });
    });

    // [REFACTOR] Fungsi untuk memuat konten halaman secara dinamis (SPA-style)
    const loadPageContent = async (page) => {
        const contentContainer = document.querySelector('.app-container');
        if (!contentContainer) return;

        // Tambahkan efek transisi keluar
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(10px)';

        try {
            // Ambil hanya bagian <div class="app-container"> dari file HTML target
            const response = await fetch(page);
            if (!response.ok) throw new Error(`Could not load ${page}`);
            const text = await response.text();
            
            // Gunakan DOMParser untuk mengekstrak konten yang kita butuhkan
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const newContent = doc.querySelector('.app-container')?.innerHTML;

            if (newContent) {
                // Tunggu animasi keluar selesai
                await new Promise(res => setTimeout(res, 200));

                contentContainer.innerHTML = newContent;

                // Re-inisialisasi skeleton loaders dan fetch data untuk halaman baru
                initializeSkeletons();
                initializeData();

                // Efek transisi masuk
                contentContainer.style.opacity = '1';
                contentContainer.style.transform = 'translateY(0)';
            }
        } catch (error) {
            console.error('Failed to load page content:', error);
            contentContainer.innerHTML = `<p style="text-align:center; padding: 2rem;">Failed to load content.</p>`;
            contentContainer.style.opacity = '1'; // Tampilkan pesan error
        }
    };

    // [REFACTOR] Fungsi navigasi sekarang hanya untuk perpindahan antar file utama (desktop/mobile)
    const navigateTo = (url) => { // Fungsi ini tetap berguna untuk redirect ke desktop.html
        const overlay = document.getElementById('pageTransition');

        // Immediately hide the main container to avoid a messy look during resize
        document.body.classList.add('is-transitioning');

        if (overlay) {
            overlay.classList.remove('fade-out');
            setTimeout(() => { window.location.href = url; }, 500);
        } else {
            window.location.href = url;
        }
    };
    // Simple function to immediately hide the loading overlay
    const hideLoadingOverlay = () => {
        const overlay = document.getElementById('pageTransition');
        document.body.classList.remove('is-transitioning');
        if (overlay) {
            overlay.classList.add('fade-out');
        }
    };

    // Listener for real-time screen size changes
    let isNavigating = false;
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && !isNavigating) {
            isNavigating = true;
            navigateTo('desktop.html');
        }
    });

    /**
     * NEW: Display all skeleton loaders synchronously at the start.
     * This ensures skeletons are always visible, even on a quick refresh.
     */
    const initializeSkeletons = () => {
        showSkeletonLoader('.popular-section .song-grid', 'song', 6);
        showSkeletonLoader('#newReleasesGrid', 'song', 6);
        showSkeletonLoader('#indonesianSongsGrid', 'song', 6);
        showSkeletonLoader('.artists-grid', 'artist', 5);
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Protection: If opened on Desktop, redirect back to the desktop page
            if (window.innerWidth > 768) {
                navigateTo('desktop.html');
                return;
            }

            // FIX: Add a delay on refresh to make the transition feel consistent
            // like on login. This will hold the loading screen for 1 second.
            setTimeout(() => {
                hideLoadingOverlay();
            }, 500);
            // Update username
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email.split('@')[0];
            }

            // Setup presence for the currently logged-in user
            setupUserPresence(user);

            // Start monitoring friend activity to sync their online status
            renderMobileFriendActivity();

            // Run API data fetching in parallel for faster loading (sync with desktop pattern)
            const initializeData = () => {
                // [FIX] Remove Promise.all so each grid can render independently.
                // This allows data to appear one by one as it's ready, without waiting for others.
                fetchWithContinuousRetry(fetchTrendingMusic);
                fetchWithContinuousRetry(fetchTopArtists);
                fetchWithContinuousRetry(fetchNewReleases);
                fetchWithContinuousRetry(fetchIndonesianSongs);
            };

            initializeData();

            // Initialize Search Slidedown Feature
            const searchInput = document.getElementById('searchInput');
            const searchDropdown = document.getElementById('searchDropdown');

            let searchAbortController = null;

            // NEW: Helper function to dynamically sync dropdown height with the hero-card
            const updateSearchDropdownHeight = () => {
                const heroCard = document.querySelector('.hero-card');
                const searchBox = document.querySelector('.search-box');
                
                if (heroCard && searchDropdown && searchBox) {
                    const heroRect = heroCard.getBoundingClientRect();
                    const searchRect = searchBox.getBoundingClientRect();
                    
                    // Jarak total dari bawah kotak pencarian ke bawah hero card
                    const distanceToBottom = heroRect.bottom - searchRect.bottom;

                    // Get the margin-top value of the dropdown (0.5rem) to prevent it from going 'offside' downwards
                    const dropdownStyle = window.getComputedStyle(searchDropdown);
                    const marginTop = parseFloat(dropdownStyle.marginTop) || 0;
                    
                    // The maximum height is the distance minus the margin to fit perfectly at the bottom line of the hero card
                    const finalHeight = Math.max(0, distanceToBottom - marginTop);
                    searchDropdown.style.setProperty('--search-dropdown-height', `${finalHeight}px`);
                }
            };

            const fetchDropdownResults = async (query) => {
                if (!searchDropdown) return;

                if (searchAbortController) searchAbortController.abort();
                searchAbortController = new AbortController();

                searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">Searching...</div>';
                try {
                    const cleanQuery = query.trim().toLowerCase();

                    // --- START: LOCAL SEARCH LOGIC --- 
                    const localResults = indonesianSongsPlaylist
                        .filter(song => {
                            const fullText = `${song.name} ${song.artist}`.toLowerCase();
                            return fullText.includes(cleanQuery);
                        })
                        .map(song => ({ // Change format to be consistent with Jamendo
                            ...song, 
                            artist_name: song.artist,
                            image: song.cover,
                            isLocal: true // Mark as a local song
                        }));
                    // --- END: LOCAL SEARCH LOGIC --- 

                    const baseUrl = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=15&include=stats`;
                    
                    // Use Hybrid Search in the Dropdown as well, with a cancellation signal
                    const [res1, res2] = await Promise.all([
                        fetchWithRetry(`${baseUrl}&search=${encodeURIComponent(cleanQuery)}`, { signal: searchAbortController.signal }),
                        fetchWithRetry(`${baseUrl}&namesearch=${encodeURIComponent(cleanQuery)}`, { signal: searchAbortController.signal })
                    ]);

                    const data1 = await res1.json();
                    const data2 = await res2.json();
                    const combined = [...(data1.results || []), ...(data2.results || []), ...localResults];
                    
                    const qWords = cleanQuery.split(/\s+/);
                    
                    // 1. Remove Duplicates
                    const uniqueMap = new Map();
                    combined.forEach(item => uniqueMap.set(item.id, item));
                    const allTracks = Array.from(uniqueMap.values());

                    // 2. Priority Filter (Must contain all typed words)
                    const priorityMatches = allTracks.filter(item => {
                        const fullText = `${item.name} ${item.artist_name || item.artist}`.toLowerCase();
                        return qWords.every(word => fullText.includes(word));
                    });

                // 3. Sort by prioritizing local songs 
                const customSort = (a, b) => {
                    const aIsLocal = a.isLocal || false;
                    const bIsLocal = b.isLocal || false;

                    if (aIsLocal && !bIsLocal) {
                        return -1; // Local song (a) comes first
                    }
                    if (!aIsLocal && bIsLocal) {
                        return 1; // Local song (b) comes first
                    }
                    // If both are local or both are external, sort by popularity
                    return (b.stats?.rate_downloads_total || 0) - (a.stats?.rate_downloads_total || 0);
                };

                const sortedTracks = priorityMatches.sort(customSort);

                    if (sortedTracks.length > 0) {
                        const tracks = sortedTracks;
                        const items = [];
                        
                        // NEW LOGIC: Show Artist only if:
                        // 1. Input user SANGAT mirip dengan nama artis (Exact match)
                        // 2. Atau input user pendek dan belum mengandung spasi (User baru mulai mengetik nama artis)
                        const topTrack = tracks[0];
                        const artistName = topTrack.artist_name || topTrack.artist;
                        const isExactArtistMatch = artistName.toLowerCase() === cleanQuery;
                        const isPotentialArtistTyping = !cleanQuery.includes(' ') && artistName.toLowerCase().startsWith(cleanQuery);
                        if (!topTrack.isLocal && (isExactArtistMatch || (isPotentialArtistTyping && cleanQuery.length >= 3))) {
                            items.push({
                                type: 'Artist',
                                name: `All songs by ${topTrack.artist_name}`,
                                sub: 'Artist',
                                image: topTrack.image,
                                // MODIFIED: Remove action to prevent grid update. This item becomes informational.
                                action: `event.preventDefault();`
                            });
                        }

                        // Limit song results to avoid being too long on mobile
                        const finalUniqueTracks = [];
                        const seen = new Set();
                        tracks.forEach(t => {
                            const uniqueKey = t.name + (t.artist_name || t.artist);
                            if(!seen.has(uniqueKey)) {
                                finalUniqueTracks.push(t);
                                seen.add(uniqueKey);
                            }
                        });

                        // Save song results to window so they can be accessed by playFromSearch
                        window.lastSearchResults = finalUniqueTracks.slice(0, 6).map(song => ({
                            id: song.id,
                            name: song.name,
                            artist: song.artist_name || song.artist,
                            album: song.album_name,
                            cover: song.image,
                            audio: song.audio,
                            duration: song.duration,
                            // Plays data matched to the main grid format
                            plays: song.isLocal ? song.plays : formatPlayCount((song.stats?.rate_downloads_total || 0) * 5)
                        }));
                        searchPlaylist = window.lastSearchResults;

                        finalUniqueTracks.slice(0, 6).forEach(song => {
                            const isActive = currentSongData && String(song.id) === String(currentSongData.id);
                            items.push({
                                type: 'Song',
                                id: song.id, // Add ID here so data-id is populated in HTML
                                name: song.name, // Ensure name is here
                                sub: song.artist_name || song.artist,
                                image: song.image,
                                audio: song.audio, // Ensure audio and duration are here
                                duration: song.duration,
                                action: `playFromSearch('${song.audio}', '${song.name.replace(/'/g, "\\'")}', '${(song.artist_name || song.artist).replace(/'/g, "\\'")}', '${song.image}', '${song.id}')`,
                                isActive: isActive,
                                isPaused: isActive && activeAudio.paused
                            });
                        });

                        searchDropdown.innerHTML = items.map(item => `
                            <div class="dropdown-item ${item.isActive ? 'is-active-song' : ''} ${item.isPaused ? 'is-paused' : ''}" data-id="${item.id || ''}" data-audio="${item.audio || ''}" onclick="${item.action}">
                                <div class="dropdown-cover-wrapper">
                                    <img src="${item.image}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div> 
                            <div class="dropdown-track-info" style="flex: 1; min-width: 0;">
                                    <div class="dropdown-info-name" style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; width: 100%;">
                                        <span class="dropdown-song-name" style="overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${item.name}</span>
                                        <div class="equalizer" style="margin-left: auto;">
                                            <span></span><span></span><span></span>
                                        </div>
                                    </div>
                                    ${item.sub ? `<div class="dropdown-song-artist" style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.sub}</div>` : ''}
                                </div>
                            </div>
                        `).join('');
                    } else {
                        searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">No results.</div>';
                    }
                } catch (e) {
                    if (e.name === 'AbortError') return;
                    searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">Error.</div>';
                }
            };

            if (searchInput && searchDropdown) {
                const clearSearchBtn = document.getElementById('clearSearch');

                const debouncedSearch = debounce((query) => {
                    const cleanQuery = query.trim(); 
                    if (cleanQuery.length > 0) {
                        updateSearchDropdownHeight(); // Update height before displaying
                        searchDropdown.classList.add('active');
                        fetchDropdownResults(cleanQuery);
                    } else {
                        searchDropdown.classList.remove('active');
                    } 
                }, 500);

                // Ensure dropdown height remains accurate if screen orientation changes
                window.addEventListener('resize', debounce(updateSearchDropdownHeight, 250));

                searchInput.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (value.length > 0) {
                        clearSearchBtn?.classList.add('visible');
                    } else {
                        clearSearchBtn?.classList.remove('visible');
                    }
                    debouncedSearch(value);
                });

                const performClear = () => {
                    searchInput.value = '';
                    if (searchAbortController) searchAbortController.abort();
                    clearSearchBtn.classList.remove('visible');
                    searchDropdown.classList.remove('active');
                    // MODIFIED: Do not reload the main grid when clearing search.
                    // fetchTrendingMusic(); 
                };

                clearSearchBtn?.addEventListener('click', () => {
                    performClear();
                    searchInput.focus();
                });

                searchInput.addEventListener('focus', (e) => {
                    if (searchInput.value.trim().length > 0) {
                        updateSearchDropdownHeight();
                        searchDropdown.classList.add('active');
                    }
                });

                document.addEventListener('click', (e) => {
                    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
                        searchDropdown.classList.remove('active');
                    }
                });
            }

            // Event Listeners for mobile player controls
            // Listener for Hero Card Play button 
            const togglePlayHandler = async () => {
                if (currentPlayingBtn) {
                    currentPlayingBtn.click();
                } else if (activeAudio.src && activeAudio.src !== "") { 
                    // Jika sedang memutar lagu (misal via auto-next) tapi tidak ada tombol grid aktif
                    try {
                        if (activeAudio.paused) await activeAudio.play();
                        else activeAudio.pause();
                    } catch (err) { console.error("Toggle Play error:", err); }
                } else if (currentPlaylist.length > 0) {
                    triggerSongByIndex(0);
                }
            };

            document.getElementById('mobileMainPlayBtn')?.addEventListener('click', togglePlayHandler);
            document.getElementById('mobileLoveBtn')?.addEventListener('click', toggleLike);

            // --- FULL SCREEN PLAYER LOGIC ---
            const fullPlayer = document.getElementById('mobileFullPlayer');
            const miniPlayer = document.getElementById('mobilePlayerBar');
            const closeFullBtn = document.getElementById('closeFullPlayer');

            const openFullPlayer = () => {
                fullPlayer.classList.add('active');
                document.body.classList.add('full-player-open');
            };

            const closeFullPlayer = () => {
                fullPlayer.classList.remove('active');
                document.body.classList.remove('full-player-open');
            };

            // Open full player on mini player bar click (unless a button inside is clicked)
            miniPlayer?.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    openFullPlayer();
                }
            });

            closeFullBtn?.addEventListener('click', closeFullPlayer);

            // Controls in Full Player
            document.getElementById('fullMainPlayBtn')?.addEventListener('click', togglePlayHandler);
            document.getElementById('fullPrevBtn')?.addEventListener('click', window.playPrevious);
            document.getElementById('fullNextBtn')?.addEventListener('click', window.playNext);
            document.getElementById('fullLoveBtn')?.addEventListener('click', toggleLike);

            document.getElementById('fullShuffleBtn')?.addEventListener('click', (e) => {
                isShuffle = !isShuffle;
                if (isShuffle) {
                    isRepeat = false;
                    // Jika shuffle diaktifkan saat lagu sedang diputar, acak sisa antrean
                    if (currentPlaylist.length > 1 && currentSongIndex !== -1) {
                        const currentSong = currentPlaylist[currentSongIndex];
                        let others = currentPlaylist.filter((_, i) => i !== currentSongIndex);
                        
                        // Algoritma Fisher-Yates Shuffle
                        for (let i = others.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [others[i], others[j]] = [others[j], others[i]];
                        }
                        
                        // Gabungkan kembali: Lagu sekarang tetap di index 0, sisanya acak
                        currentPlaylist = [currentSong, ...others];
                        currentSongIndex = 0;
                    }
                }
                const btn = e.currentTarget;
                btn.classList.add('btn-pop');
                setTimeout(() => btn.classList.remove('btn-pop'), 400);
                btn.classList.toggle('active', isShuffle);
                document.getElementById('fullRepeatBtn')?.classList.toggle('active', isRepeat);
                
                // Update the UP NEXT list to reflect the new order
                renderUpNext();
            });

            document.getElementById('fullRepeatBtn')?.addEventListener('click', (e) => {
                isRepeat = !isRepeat;
                if (isRepeat) isShuffle = false; // Turn off shuffle if repeat is active
                const btn = e.currentTarget;
                btn.classList.add('btn-pop');
                setTimeout(() => btn.classList.remove('btn-pop'), 400);
                btn.classList.toggle('active', isRepeat);
                document.getElementById('fullShuffleBtn')?.classList.toggle('active', isShuffle);
            });

            // Progress bar seeking for Full Player
            const fullProgressTrack = document.getElementById('fullProgressTrack');
            if (fullProgressTrack) {
                const seek = (e) => {
                    if (!activeAudio.duration || activeAudio.duration === Infinity) return;
                    const rect = fullProgressTrack.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const x = clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, x / rect.width));
                    
                    // Update UI instantly when dragging
                    document.getElementById('fullProgressBar').style.width = `${percentage * 100}%`;
                    document.getElementById('fullCurrentTime').textContent = formatTime(percentage * activeAudio.duration);
                    
                    activeAudio.currentTime = percentage * activeAudio.duration;
                };

                const startDragging = (e) => {
                    isDragging = true;
                    document.body.classList.add('is-dragging-progress');
                    seek(e);
                };

                const moveDragging = (e) => {
                    if (isDragging) {
                        if (e.cancelable) e.preventDefault();
                        seek(e);
                    }
                };

                const stopDragging = () => {
                    if (isDragging) {
                        isDragging = false;
                        document.body.classList.remove('is-dragging-progress');
                    }
                };

                fullProgressTrack.addEventListener('touchstart', startDragging, { passive: false });
                window.addEventListener('touchmove', moveDragging, { passive: false });
                window.addEventListener('touchend', stopDragging);
                
                // Add Mouse support for drag (important for testing on desktop/tablet)
                fullProgressTrack.addEventListener('mousedown', startDragging);
                window.addEventListener('mousemove', moveDragging);
                window.addEventListener('mouseup', stopDragging);
                
                // Keep regular click enabled
                fullProgressTrack.addEventListener('click', seek);
            }

            // --- END FULL SCREEN PLAYER LOGIC --- 

            // Update profile picture (Avatar) - Query directly here for more accuracy
            const avatarElement = document.getElementById('userAvatar') || document.querySelector('.mobile-avatar');
            
            if (avatarElement) {
                const nameForAvatar = user.displayName || user.email.split('@')[0];
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff&bold=true`;
                const originalPhotoURL = user.photoURL;
                
                let originalRetry = 0; 
                const maxRetries = 2; 

                // Use no-referrer to avoid 403 blocks from providers like Google/Facebook
                avatarElement.referrerPolicy = "no-referrer";

                // Set up an event listener to try reloading if it fails
                avatarElement.onerror = function() {
                    if (originalPhotoURL && this.src.includes(originalPhotoURL.split('?')[0]) && originalRetry < maxRetries) {
                        originalRetry++;
                        console.warn(`Mobile: Failed to load original photo, retrying (${originalRetry}/${maxRetries})...`);
                        setTimeout(() => {
                            const sep = originalPhotoURL.includes('?') ? '&' : '?';
                            this.src = `${originalPhotoURL}${sep}t=${Date.now()}`;
                        }, 2000);
                    } 
                    else if (this.src !== defaultAvatar && !this.src.includes('ui-avatars.com')) {
                        console.warn("Mobile: Original photo failed, switching to initials...");
                        this.src = defaultAvatar;
                    } else {
                        this.onerror = null;
                    }
                };

                avatarElement.src = originalPhotoURL || defaultAvatar;
            }
        } else {
            // If not logged in, return to the login page
            window.location.href = 'index.html';
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
        });
    }
});