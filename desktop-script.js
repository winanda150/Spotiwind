import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { // NEW: Import untuk Realtime Database
    getDatabase,
    ref,
    onValue,
    set as rtdbSet, // Menggunakan alias untuk fungsi set RTDB
    onDisconnect,
    serverTimestamp as rtdbServerTimestamp // Menggunakan alias untuk serverTimestamp RTDB
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

// Mencegah inisialisasi ganda yang bisa memicu error heartbeats undefined
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const rtdb = getDatabase(app); // Inisialisasi Realtime Database

// FIX: Inisialisasi Firestore dengan Cache Modern untuk mencegah error offline & heartbeat
// Gunakan getFirestore langsung jika initializeFirestore bermasalah di beberapa browser
const db = getFirestore(app);

let playlistUnsubscribe = null;
let friendActivityListeners = []; // Menggunakan array untuk melacak banyak listener
let currentFriendActivityLimit = 10;
let isLoadingMoreActivity = false;
let hasReachedActivityEnd = false;
let activityUpdateTimeout = null; // Untuk optimasi update aktivitas

let allFriendsActivityData = []; // Buffer untuk semua data dari modal
let modalDisplayCount = 0; // Tracking jumlah yang sudah dirender di modal
const MODAL_PAGE_SIZE = 50;

// Jamendo API Configuration (Free for developers)
const JAMENDO_CLIENT_ID = '17b8da78';
const JAMENDO_API_URL = 'https://api.jamendo.com/v3.0/tracks/';

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let currentSongIndex = -1;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;
let isDraggingVolume = false;
let currentSongData = null; // Menyimpan data lagu yang sedang aktif

// NEW: Cache untuk status online teman dari Realtime Database
const friendOnlineStatus = {};
// NEW: Tracking listener RTDB agar tidak duplikat
const activePresenceListeners = new Set();

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const VOLUME_PATH = "M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07";
const MUTE_PATH = "M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6";

/**
 * Helper untuk format waktu detik ke MM:SS
 */
const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Helper untuk debounce fungsi (mencegah pemanggilan berlebih)
 */
const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

// Event listener untuk memperbarui progress bar dan waktu secara real-time
const desktopProgressThumbs = document.querySelectorAll('.progress-thumb');
const desktopTimeEls = document.querySelectorAll('.time-info span:first-child, .curr-time');
activeAudio.addEventListener('timeupdate', () => {
    if (isDragging) return; // Jangan update UI jika sedang digeser manual
    
    if (activeAudio.duration) {
        const percent = (activeAudio.currentTime / activeAudio.duration) * 100;
        desktopProgressThumbs.forEach(thumb => thumb.style.width = `${percent}%`);
        desktopTimeEls.forEach(el => el.textContent = formatTime(activeAudio.currentTime));
    }
});

// Update total durasi saat metadata lagu dimuat
activeAudio.addEventListener('loadedmetadata', () => {
    const durationEls = document.querySelectorAll('.time-info span:last-child, .total-time');
    durationEls.forEach(el => el.textContent = formatTime(activeAudio.duration));
});

// Logic Event Listeners (Sync dengan Mobile)
activeAudio.addEventListener('play', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    document.querySelector('.now-playing-card')?.classList.add('is-playing');
    document.querySelector('.bottom-player-bar')?.classList.add('is-playing');

    document.querySelectorAll('.play-pause-btn').forEach(btn => {
        btn.innerHTML = PAUSE_ICON;
        btn.classList.remove('btn-loading', 'btn-disabled');
    });

    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-active-song');
            el.classList.remove('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) {
                overlay.innerHTML = PAUSE_ICON;
                overlay.classList.remove('btn-loading');
            }
        });
    }
});

activeAudio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    document.querySelector('.now-playing-card')?.classList.remove('is-playing');
    document.querySelector('.bottom-player-bar')?.classList.remove('is-playing');

    document.querySelectorAll('.play-pause-btn').forEach(btn => {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    });

    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"]`).forEach(el => {
            el.classList.add('is-paused');
            const overlay = el.querySelector('.play-overlay');
            if (overlay) {
                overlay.innerHTML = PLAY_ICON;
                overlay.classList.remove('btn-loading');
            }
        });
    }
});

// Global listeners untuk menangani status loading audio secara akurat
// Global Loading Listeners (Sync dengan Mobile)
activeAudio.addEventListener('waiting', () => {
    document.querySelectorAll('.play-pause-btn').forEach(btn => btn.classList.add('btn-loading'));
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"] .play-overlay`).forEach(btn => btn.classList.add('btn-loading'));
    }
});

activeAudio.addEventListener('playing', () => {
    document.querySelectorAll('.play-pause-btn').forEach(btn => btn.classList.remove('btn-loading'));
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"] .play-overlay`).forEach(btn => btn.classList.remove('btn-loading'));
    }
});

activeAudio.addEventListener('error', () => {
    document.querySelectorAll('.play-pause-btn').forEach(btn => btn.classList.remove('btn-loading'));
    if (currentSongData) {
        document.querySelectorAll(`[data-id="${currentSongData.id}"] .play-overlay`).forEach(btn => btn.classList.remove('btn-loading'));
    }
});

/**
 * Fungsi navigasi lagu (Next / Previous)
 */
window.playNext = () => {
    if (currentPlaylist.length === 0) return;
    
    let nextIndex;
    if (isShuffle && currentPlaylist.length > 1) {
        // Pilih indeks acak yang bukan lagu yang sekarang sedang diputar
        do {
            nextIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (String(currentPlaylist[nextIndex].id) === String(currentSongData?.id));
    } else {
        nextIndex = currentSongIndex + 1;
        if (nextIndex >= currentPlaylist.length) nextIndex = 0; // Kembali ke awal jika sudah di akhir
    }

    triggerSongByIndex(nextIndex);
};

window.playPrevious = () => {
    if (currentPlaylist.length === 0) return;
    let prevIndex = currentSongIndex - 1;
    if (prevIndex < 0) prevIndex = currentPlaylist.length - 1; // Ke akhir jika di awal
    triggerSongByIndex(prevIndex);
};

const triggerSongByIndex = (index, context = null) => {
    const song = currentPlaylist[index];
    if (!song) return;

    const btn = document.querySelector(`.song-card[data-id="${song.id}"] .play-overlay`);
    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration || 0, context);
};

/**
 * Fungsi untuk memperbarui aktivitas pengguna di Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    // Batalkan timeout sebelumnya jika ada (Debouncing/Delaying)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Hanya update jika lagu diputar lebih dari 5 detik untuk menghindari spam saat skip lagu
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
            console.error("Gagal memperbarui aktivitas ke Firestore:", error);
        }
    }, 5000); 
};

/**
 * Fungsi untuk menyinkronkan status tombol Like di player (sidebar dan bottom bar)
 */
const syncPlayerLikeButtons = (isLiked) => {
    const sidebarLikeBtn = document.querySelector('.now-playing-card .love-btn');
    const bottomLikeBtn = document.querySelector('.bottom-player-bar .love-btn');

    if (sidebarLikeBtn) sidebarLikeBtn.classList.toggle('liked', isLiked);
    if (bottomLikeBtn) bottomLikeBtn.classList.toggle('liked', isLiked);
};

/**
 * Fungsi untuk mengecek apakah lagu sudah di-like di Firestore
 */
const checkLikedStatus = async (songId) => {
    const user = auth.currentUser;
    if (!user || !songId || !db) {
        syncPlayerLikeButtons(false);
        return false;
    }

    // Pastikan ID berupa string bersih
    const cleanId = String(songId).trim();

    try {
        const likeRef = doc(db, "users", user.uid, "liked_songs", cleanId);
        const docSnap = await getDoc(likeRef);
        const isLiked = docSnap.exists();
        
        // Update UI berdasarkan data asli dari database, bukan class CSS saat ini
        if (currentSongData && String(currentSongData.id) === cleanId) {
            syncPlayerLikeButtons(isLiked);
        }
        return isLiked;
    } catch (error) {
        if (error.code !== 'unavailable' && error.code !== 'permission-denied') {
            console.error("Error checking liked status:", error);
        }
        syncPlayerLikeButtons(false); // Default ke false jika gagal cek (offline)
        return false;
    }
};

/**
 * Fungsi untuk membuat efek partikel hati
 */
const createHeartParticles = (el) => {
    if (!el) return;
    
    // Ambil posisi tengah dari tombol yang diklik
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 6; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart-particle';
        heart.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" style="fill: currentColor; stroke: none;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        
        heart.style.left = `${centerX}px`;
        heart.style.top = `${centerY}px`;
        
        // Variasi acak untuk arah terbang menggunakan CSS Variables
        heart.style.setProperty('--x-offset', (Math.random() - 0.5) * 120);
        heart.style.setProperty('--y-offset', (Math.random() - 0.5) * 60);
        heart.style.setProperty('--rotate', `${(Math.random() - 0.5) * 60}deg`);
        
        // Ukuran acer/random
        const size = Math.random() * 10 + 15;
        heart.style.width = `${size}px`;
        heart.style.height = `${size}px`;

        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 1000);
    }
};

/**
 * Helper untuk meriset UI tombol play/pause (Sinkron dengan Mobile)
 */
const resetBtnUI = (btn) => {
    if (btn) {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    }
};

/**
 * Fungsi utama untuk toggle Like/Unlike
 */
const toggleLike = async (e) => {
    const user = auth.currentUser;
    const btn = e.currentTarget; // Tombol yang diklik (bisa dari sidebar atau bottom bar)
    
    if (!user || !currentSongData || !btn || !db) {
        return;
    }

    const songId = String(currentSongData.id).trim();
    if (!songId) return;

    // 1. CEK STATUS SAAT INI
    const wasLiked = btn.classList.contains('liked');
    
    // 2. OPTIMISTIC UPDATE (Ubah UI Seketika)
    // Kita tidak menunggu Firebase selesai agar terasa sangat cepat
    syncPlayerLikeButtons(!wasLiked);
    if (!wasLiked) {
        createHeartParticles(btn);
    }

    // 3. JALANKAN PROSES FIREBASE DI BACKGROUND
    const likeRef = doc(db, "users", user.uid, "liked_songs", songId);
    try {
        // Gunakan setDoc/deleteDoc tanpa 'await' di sini jika ingin UI terasa instan, 
        // atau tetap gunakan 'await' untuk memastikan data benar-benar sampai.
        if (wasLiked) {
            await deleteDoc(likeRef);
        } else {
            // Proses Like
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
        // 4. ROLLBACK JIKA GAGAL
        // Jika internet mati atau permission denied, kembalikan status tombol
        syncPlayerLikeButtons(wasLiked);
        
        console.error("Firebase Save Error:", error);
        
        let message = "Failed to sync with database. Check your connection.";
        if (error.code === 'permission-denied') {
            message = "Permission Denied! Check your Firestore Rules.";
        } 
    }
};

/**
 * Fungsi untuk memutar/menghentikan audio
 */
/**
 * Core Playback Logic - Synchronized with Mobile context-awareness
 */
window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null) => {
    // Context-aware playlist management
    if (context && currentPlaylist.length > 0) {
        if (isShuffle) {
            const selectedTrack = currentPlaylist.find(s => String(s.id) === songId) || 
                                { id, audio: audioUrl, name: title, artist, cover, duration };
            const remainingTracks = currentPlaylist.filter(s => String(s.id) !== songId);
            
            for (let i = remainingTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
            }
            currentPlaylist = [selectedTrack, ...remainingTracks];
        }
    }

    if (!audioUrl) return;

    const songId = String(id);
    const isSameSong = currentSongData && String(currentSongData.id) === songId;

    if (isSameSong) {
        if (!activeAudio.paused) {
            activeAudio.pause();
        } else {
            if (btn) btn.classList.add('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));
            activeAudio.play().catch(e => {
                console.error("Resume error:", e);
                if (btn) btn.classList.remove('btn-loading');
                document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
            });
        }
        return;
    }

    activeAudio.pause();
    currentSongData = { id: songId, audio: audioUrl, name: title, artist, cover };
    currentSongIndex = currentPlaylist.findIndex(s => s.audio === audioUrl);

    // Reset SEMUA UI state lagu (untuk mencegah duplikat visual saat skip cepat)
    document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
        el.classList.remove('is-active-song', 'is-paused');
    });
    document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(el => {
        el.classList.remove('btn-loading');
        if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
    });

    // Set loading state
    if (btn) btn.classList.add('btn-loading');
    document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));
    document.querySelectorAll(`[data-id="${songId}"]`).forEach(el => el.classList.add('is-active-song'));

    // Reset Progres Bar dan Waktu ke 0 sebelum lagu baru diputar
    desktopProgressThumbs.forEach(t => t.style.width = '0%');
    desktopTimeEls.forEach(e => e.textContent = '0:00');
    // Ambil durasi elemen secara dinamis karena total-time biasanya statis hingga metadata termuat
    document.querySelectorAll('.time-info span:last-child, .total-time').forEach(e => e.textContent = '0:00');

    // Set tombol aktif baru (untuk grid)
    if (btn) btn.classList.add('btn-loading');
    currentPlayingBtn = btn;
    document.querySelectorAll('.play-pause-btn').forEach(b => {
        b.classList.add('btn-loading');
        b.classList.remove('btn-disabled');
    });

    activeAudio.onerror = null;
    activeAudio.onended = null;

    try {
        activeAudio.src = audioUrl;

        // Update Document Title
        document.title = `Spotiwind - Feel The Music, Ride The Wind`;

        // Media Session API integration
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Spotiwind',
                artwork: [
                    { src: cover, sizes: '512x512', type: 'image/webp' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => activeAudio.play());
            navigator.mediaSession.setActionHandler('pause', () => activeAudio.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => window.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => window.playNext());
        }

        // RESET UI Like sebelum mengecek status lagu baru
        syncPlayerLikeButtons(false);

        // Cek status Like lagu ini di Firestore
        await checkLikedStatus(id);

        // Update UI Sidebars & Bottom Bar
        document.querySelector('.now-playing-card')?.classList.add('active');
        const sidebarTitle = document.querySelector('.now-playing-title');
        const sidebarArtist = document.querySelector('.now-playing-artist');
        const sidebarCover = document.querySelector('.now-playing-cover');
        if (sidebarTitle) sidebarTitle.textContent = title;
        if (sidebarArtist) sidebarArtist.textContent = artist;
        if (sidebarCover) sidebarCover.style.backgroundImage = `url("${cover}")`;
        
        // Update Bottom Bar
        const bottomTitle = document.getElementById('bottomTrackName');
        const bottomArtist = document.getElementById('bottomTrackArtist');
        const bottomCover = document.getElementById('bottomTrackCover');
        if (bottomTitle) bottomTitle.textContent = title;
        if (bottomArtist) bottomArtist.textContent = artist;
        if (bottomCover) bottomCover.src = cover;

        document.querySelector('.bottom-player-bar')?.classList.add('active');
        document.body.classList.add('player-active');

        activeAudio.onerror = (e) => {
            console.error("Kesalahan pemutaran audio:", e);
            if (btn) resetBtnUI(btn);
            document.querySelectorAll('.btn-loading').forEach(el => el.classList.remove('btn-loading'));
        };

        if (activeAudio.src) await activeAudio.play();
        updateMyActivity(title);

        if (btn) btn.classList.remove('btn-loading');
        document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error("Playback error:", error);
        // Bersihkan status loading jika terjadi error fatal
        document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
        currentPlayingBtn = null;
    }

    // Event listener untuk saat audio selesai diputar
    activeAudio.onended = () => {
        if (btn) resetBtnUI(btn);
        currentPlayingBtn = null;
        if (isRepeat) {
            if (currentSongIndex !== -1) {
                triggerSongByIndex(currentSongIndex);
            } else if (currentSongData) {
                // Tetap repeat meskipun lagu tidak ada di playlist/grid saat ini
                window.playPreview(null, currentSongData.audio, currentSongData.name, currentSongData.artist, currentSongData.cover, currentSongData.id);
            }
        } else {
            playNext();
        }
    };
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
    setTimeout(() => toast.remove(), 4000);
};

/**
 * Menampilkan skeleton loader di dalam grid.
 * @param {string} gridSelector - Selector CSS untuk container grid.
 * @param {string} type - Tipe skeleton ('song' atau 'artist').
 * @param {number} count - Jumlah skeleton yang akan ditampilkan.
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
 * Fungsi fetch dengan mekanisme retry dan exponential backoff.
 * @param {string} url - URL API yang akan di-fetch.
 * @param {object} options - Opsi untuk fetch.
 * @param {number} retries - Jumlah percobaan ulang.
 * @returns {Promise<Response>}
 */
const fetchWithRetry = async (url, options = {}, retries = 3) => {
    let lastError;
    for (let i = 0; i < retries; i++) { // Melakukan percobaan sebanyak 'retries' kali
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response; // Jika berhasil, kembalikan response
        } catch (error) {
            lastError = error;
            console.warn(`Fetch attempt ${i + 1} failed for ${url}. Retrying in ${2 ** i * 1000}ms...`);
            if (i < retries - 1) await new Promise(res => setTimeout(res, 2 ** i * 1000)); // Exponential backoff: 1s, 2s, 4s...
        }
    }
    throw lastError; // Lemparkan error terakhir setelah semua percobaan gagal
};
// Helper function to format play counts (e.g., 1.2M, 500K, 300)
const formatPlayCount = (count) => {
    if (typeof count !== 'number' || isNaN(count)) {
        return '0'; // Default jika data tidak valid
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
 * [REFACTOR] Fungsi renderer untuk satu kartu lagu.
 * @param {object} song - Objek data lagu.
 * @returns {string} - String HTML untuk kartu lagu.
 */
const createSongCardHTML = (song) => {
    const isActive = currentSongData && String(song.id) === String(currentSongData.id);
    const isPaused = activeAudio.paused;
    const safeName = song.name.replace(/'/g, "\\'");
    const safeArtist = song.artist.replace(/'/g, "\\'");

    return `
    <div class="song-card ${isActive ? 'is-active-song' : ''} ${isActive && isPaused ? 'is-paused' : ''}" data-id="${song.id}">
        <div class="song-cover">
            <img src="${song.cover}" alt="${song.name}" style="width:100%; height:100%; object-fit:cover;">
            <button class="play-overlay" aria-label="Play ${song.name}"
                data-audio="${song.audio}" data-name="${safeName}" data-artist="${safeArtist}" data-cover="${song.cover}">
                ${isActive && !isPaused ? PAUSE_ICON : PLAY_ICON}
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
            <button class="more-btn" aria-label="More options">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                </svg>
            </button>
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
 * [NEW] Renders items into a grid one by one for a progressive loading effect.
 * It replaces existing skeleton elements sequentially.
 * @param {string} gridSelector - The CSS selector for the grid container.
 * @param {Array} items - The array of data items to render.
 * @param {function(object): string} itemRenderer - The function that returns HTML for one item.
 * @param {string} skeletonSelector - The CSS selector for the skeleton elements within the grid.
 */
const renderGridProgressively = async (gridSelector, items, itemRenderer, skeletonSelector) => {
    const grid = document.querySelector(gridSelector);
    if (!grid) return;

    const skeletons = grid.querySelectorAll(skeletonSelector);
    
    // Clear any excess skeletons if the number of items is less than skeletons
    for (let i = items.length; i < skeletons.length; i++) {
        skeletons[i].remove();
    }

    for (let i = 0; i < items.length; i++) {
        const itemHTML = itemRenderer(items[i]);
        if (skeletons[i]) {
            skeletons[i].outerHTML = itemHTML;
        } else {
            grid.insertAdjacentHTML('beforeend', itemHTML);
        }
        await new Promise(res => setTimeout(res, 50)); // Small delay for visual effect
    }
};

/**
 * [REFACTOR] Fungsi render grid universal dengan skeleton loader.
 * @param {string} gridSelector - Selector CSS untuk container grid.
 * @param {Array|null} items - Array data. Jika null, tampilkan skeleton.
 * @param {(item: object) => string} itemRenderer - Fungsi untuk merender satu item menjadi HTML.
 * @param {string} skeletonType - Tipe skeleton ('song' atau 'artist').
 * @param {string} emptyMessage - Pesan jika tidak ada item.
 * @param {number} skeletonCount - Jumlah skeleton yang ditampilkan.
 */
const renderGrid = (gridSelector, items, itemRenderer, skeletonType, emptyMessage = "No items found.", skeletonCount = 6) => {
    const grid = document.querySelector(gridSelector);
    if (!grid) return;

    if (items === null) {
        showSkeletonLoader(gridSelector, skeletonType, skeletonCount);
    } else if (items.length === 0) {
        grid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">${emptyMessage}</p>`;
    } else {
        grid.innerHTML = items.map(itemRenderer).join('');
    }
};

/**
 * Fungsi untuk mengambil data artis populer dari Jamendo
 */
const fetchTopArtists = async () => {
    try {
        // Kita ambil limit lebih banyak (50) agar bisa memfilter artis yang benar-benar punya foto asli
        const url = `https://api.jamendo.com/v3.0/artists/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=popularity_total`;
        const response = await fetchWithRetry(url);
        if (!response.ok) throw new Error("Gagal menghubungi server Jamendo");
        const data = await response.json();
        
        if (data.results) {
            // Filter: Hanya ambil artis yang memiliki link gambar asli dari Jamendo
            const artistsWithPhotos = data.results
                .filter(item => item.image && item.image.trim() !== "")
                .slice(0, 10) // Ambil 10 teratas dari daftar yang sudah difilter
                .map(item => ({
                    id: item.id,
                    name: item.name,
                    photo: item.image
                }));
            
            // [FIX] Hanya render dan return true jika ada data untuk ditampilkan.
            if (artistsWithPhotos.length === 0) {
                return false; // Beri sinyal ke retry-wrapper untuk mencoba lagi.
            }
            
            renderGridProgressively('.artists-grid', artistsWithPhotos, createArtistCardHTML, '.artist-card-skeleton');
            return true; // Berhasil
        }
    } catch (error) {
        console.error("Gagal mengambil data artis:", error);
        throw error; // Lemparkan error agar ditangkap oleh fetchWithContinuousRetry
    }
};

/**
 * Fungsi untuk mengambil data lagu populer dari Jamendo.
 */
const fetchTrendingMusic = async () => {
    try {
        // Kita ambil limit lebih banyak (50) untuk difilter agar setiap artis unik di grid
        const url = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=popularity_total&include=stats`;
        const response = await fetchWithRetry(url);
        if (!response.ok) throw new Error("Gagal menghubungi server Jamendo");
        const data = await response.json(); // Parse JSON here
        
        // Logika filter: Hanya ambil satu lagu per artis agar tampilan grid lebih bervariasi
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
                cover: item.image,
                audio: item.audio,
                // Rentang baru: 300 ribu hingga 5 juta agar terasa lebih populer dan bervariasi
                plays: formatPlayCount(Math.floor(Math.random() * 4700000) + 300000)
        }));

        // [FIX] Hanya render dan return true jika ada data untuk ditampilkan.
        if (rawSongs.length === 0) {
            console.warn("fetchTrendingMusic: Tidak ada lagu unik ditemukan setelah filter, mencoba lagi...");
            return false; // Beri sinyal ke retry-wrapper untuk mencoba lagi.
        }

        currentPlaylist = rawSongs; // Simpan playlist untuk navigasi
        renderGridProgressively('.popular-section .song-grid', rawSongs, createSongCardHTML, '.song-card-skeleton');
        return true; // Berhasil
    } catch (error) {
        console.error("Gagal mengambil data musik:", error);
        throw error; // Lemparkan error agar ditangkap oleh fetchWithContinuousRetry
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Implementation of Event Delegation instead of inline onclick
    document.body.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.play-overlay') || e.target.closest('.play-mini-btn');
        if (!playBtn) return;

        const card = playBtn.closest('.song-card');
        if (!card) return;
        const overlay = card.querySelector('.play-overlay');
        const { audio, name, artist, cover } = overlay.dataset;
        const id = card.dataset.id;

        window.playPreview(overlay, audio, name, artist, cover, id, 0, 'trending');
    });
/**
 * NEW: Wrapper untuk mencoba ulang fungsi fetch secara terus-menerus saat gagal.
 * Ini memastikan skeleton loader tetap ada dan aplikasi terus mencoba memuat data.
 * @param {() => Promise<boolean>} fetchFunction - Fungsi async yang akan dijalankan.
 * @param {number} delay - Jeda waktu (ms) sebelum mencoba lagi.
 */
const fetchWithContinuousRetry = async (fetchFunction, delay = 5000) => {
    // [FIX] Menggunakan implementasi Promise-based retry loop yang benar (sinkron dengan mobile)
    // Ini akan menahan Promise.all sampai fetch benar-benar berhasil.
    while (true) {
        try {
            const success = await fetchFunction();
            if (success) {
                return true; // Berhasil! Keluar dari loop dan resolve promise.
            }
            // Jika fetchFunction mengembalikan false (misal, hasil kosong), log dan coba lagi.
            console.warn(`${fetchFunction.name} tidak mengembalikan data. Mencoba lagi dalam ${delay}ms...`);
        } catch (error) {
            // Jika fetchFunction melempar error (misal, jaringan gagal), log dan coba lagi.
            console.error(`Error pada ${fetchFunction.name}. Mencoba lagi dalam ${delay}ms...`, error);
        }
        // Tunggu sesuai jeda waktu sebelum iterasi loop berikutnya.
        await new Promise(resolve => setTimeout(resolve, delay));
    }
};

// Dalam aplikasi nyata, ini akan mengambil data dari database (misalnya Firestore)
// untuk memeriksa status langganan pengguna berdasarkan UID mereka.
// Untuk demonstrasi, kita akan menggunakan logika sederhana.
const isUserPremium = async (uid) => {
    if (!uid) return false;
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        return userDoc.exists() && userDoc.data().isPremium === true;
    } catch (e) {
        return false;
    }
};

    const logoutBtn = document.getElementById('logoutBtn');
    const greetingBadge = document.getElementById('greetingBadge');

    let lastHour = -1; // Menyimpan status jam terakhir untuk optimasi render

    /**
     * Memperbarui teks salam berdasarkan waktu lokal perangkat
     */
    const updateGreeting = () => {
        if (!greetingBadge) return;
        const hour = new Date().getHours();
        if (hour === lastHour) return; // Optimasi: Jangan lakukan apa-apa jika jam belum berubah
        lastHour = hour;

        let greeting = "";
        let emoji = "";

        // Logika pembagian waktu: Pagi (4-10), Siang (10-15), Sore (15-18), Malam (18-04)
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

        // Tampilkan salam tanpa nama user (Contoh: Good Morning 🌅)
        greetingBadge.textContent = `Good ${greeting} ${emoji}`;
    };

    updateGreeting();
    // Perbarui sapaan setiap 1 menit agar tetap akurat jika halaman dibiarkan terbuka
    setInterval(updateGreeting, 60000);

    // Segera perbarui jika user kembali ke tab ini (Visibility API)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateGreeting();
    });

    // Inisialisasi pencarian dengan fitur Slidedown Dropdown
    const searchInput = document.getElementById('searchInput');
    const searchDropdown = document.getElementById('searchDropdown');
    // Listener untuk kontrol musik di sidebar
    document.querySelector('button[title="Next"]')?.addEventListener('click', playNext);
    document.querySelector('button[title="Previous"]')?.addEventListener('click', playPrevious);

    // Fungsi helper untuk sinkronisasi tombol Shuffle & Repeat
    const syncControlButtons = () => {
        document.querySelectorAll('button[title="Repeat"], #bottomRepeat').forEach(btn => {
            btn.classList.toggle('active', isRepeat);
            btn.classList.add('btn-pop');
            setTimeout(() => btn.classList.remove('btn-pop'), 300);
        });
        document.querySelectorAll('button[title="Shuffle"], #bottomShuffle').forEach(btn => {
            btn.classList.toggle('active', isShuffle);
            btn.classList.add('btn-pop');
            setTimeout(() => btn.classList.remove('btn-pop'), 300);
        });
    };

    // Listener untuk Repeat (Sidebar & Bottom)
    document.querySelectorAll('button[title="Repeat"], #bottomRepeat').forEach(btn => {
        btn.addEventListener('click', () => {
            isRepeat = !isRepeat;
            if (isRepeat) isShuffle = false; // Sinkron dengan Mobile: Matikan shuffle jika repeat aktif
            syncControlButtons();
        });
    });

    // Listener untuk Shuffle (Sidebar & Bottom)
    document.querySelectorAll('button[title="Shuffle"], #bottomShuffle').forEach(btn => {
        btn.addEventListener('click', () => {
            isShuffle = !isShuffle;
            if (isShuffle) isRepeat = false; // Sinkron dengan Mobile: Matikan repeat jika shuffle aktif
            syncControlButtons();
        });
    });
    
    const togglePlayPause = async () => {
        // Gunakan logika yang sama dengan mobile: prioritaskan resume jika src ada
        if (activeAudio.src && activeAudio.src !== "") {
            try {
                if (activeAudio.paused) await activeAudio.play();
                else activeAudio.pause();
            } catch (err) {
                console.error("Toggle Play error:", err);
            }
        } else if (currentPlaylist.length > 0) {
            // Jika belum ada lagu terpilih, putar lagu pertama dari grid
            triggerSongByIndex(0);
        }
    };

    // Hubungkan semua tombol Play/Pause (di sidebar Now Playing dan di Bottom Bar)
    document.querySelectorAll('.play-pause-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlayPause();
        });
    });

    // Listener untuk tombol Like (Sidebar & Bottom)
    document.querySelectorAll('.love-btn').forEach(btn => {
        btn.addEventListener('click', toggleLike);
    });

    /**
     * Fungsi untuk memuat playlist dari Firestore (Hanya milik user login)
     */
    const loadUserPlaylists = (uid) => {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;

        // Bersihkan listener lama jika ada untuk mencegah ERR_INSUFFICIENT_RESOURCES
        if (playlistUnsubscribe) playlistUnsubscribe();

        const q = query(collection(db, "users", uid, "playlists"), orderBy("createdAt", "desc"));

        playlistUnsubscribe = onSnapshot(q, (snapshot) => {
            playlistContainer.innerHTML = '';
            snapshot.forEach((doc) => {
                const playlist = doc.data();
                const item = document.createElement('a');
                item.href = "#";
                item.className = "nav-item";
                item.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                    <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                        <span style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${playlist.name}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">0 songs</span>
                    </div>
                `;
                playlistContainer.appendChild(item);
            });
        }, (error) => {
            console.error("Playlist Snapshot Error:", error);
        });
    };

    // Add Playlist Logic
    const addPlaylistBtn = document.querySelector('.add-playlist-btn');

    addPlaylistBtn?.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;

        const playlistName = prompt("Masukkan nama playlist baru:");
        if (playlistName && playlistName.trim() !== "") {
            try {
                await addDoc(collection(db, "users", user.uid, "playlists"), {
                    name: playlistName,
                    createdAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error creating playlist:", error);
            }
        }
    });

    // Progress bar seeking (Seekbar) logic
    const progressTracks = document.querySelectorAll('.progress-track');
    let activeDraggingTrack = null;

    const seek = (e, track) => {
        if (!activeAudio.duration || activeAudio.duration === Infinity) return;
        const rect = track.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));

        // 1. Update UI secara instan (Visual Feedback)
        const progressThumbs = document.querySelectorAll('.progress-thumb');
        const currentTimeEls = document.querySelectorAll('.time-info span:first-child, .curr-time');
        
        progressThumbs.forEach(thumb => thumb.style.width = `${percentage * 100}%`);
        currentTimeEls.forEach(el => el.textContent = formatTime(percentage * activeAudio.duration));

        // 2. Update waktu audio sesungguhnya
        activeAudio.currentTime = percentage * activeAudio.duration;
    };

    const startDragging = (e) => {
        isDragging = true;
        activeDraggingTrack = e.currentTarget;
        document.body.classList.add('is-dragging-progress'); // Tambahkan class ke body untuk matikan transisi
        seek(e, activeDraggingTrack);
    };

    const moveDragging = (e) => {
        if (isDragging && activeDraggingTrack) {
            if (e.cancelable) e.preventDefault();
            seek(e, activeDraggingTrack);
        }
    };

    const stopDragging = () => {
        isDragging = false;
        activeDraggingTrack = null;
        document.body.classList.remove('is-dragging-progress');
    };

    progressTracks.forEach(track => {
        track.addEventListener('mousedown', startDragging);
        track.addEventListener('touchstart', startDragging, { passive: false });
    });

    window.addEventListener('mousemove', moveDragging);
    window.addEventListener('touchmove', moveDragging, { passive: false });
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);

    // Volume Control Logic
    const volumeSlider = document.querySelector('.volume-slider');
    const volumeLevel = document.querySelector('.volume-level');
    const volumeSvg = document.querySelector('.volume-control svg');
    
    let lastVolume = 0.7; // Simpan volume terakhir untuk fitur unmute
    
    // Inisialisasi volume awal (70% sesuai dengan style bawaan di HTML)
    activeAudio.volume = 0.7;

    const updateVolumeUI = (percentage) => {
        activeAudio.volume = percentage;
        if (volumeLevel) volumeLevel.style.width = `${percentage * 100}%`;

        // Update Volume Icon secara dinamis
        if (volumeSvg) {
            const volumePath = volumeSvg.querySelector('path');
            if (percentage === 0) {
                volumePath.setAttribute('d', MUTE_PATH);
            } else {
                volumePath.setAttribute('d', VOLUME_PATH);
            }
        }
    };

    const handleVolumeSeek = (e) => {
        if (!volumeSlider) return;
        const rect = volumeSlider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        
        updateVolumeUI(percentage);
        if (percentage > 0) lastVolume = percentage;
    };

    // Fitur klik ikon untuk Mute/Unmute
    volumeSvg?.addEventListener('click', () => {
        if (activeAudio.volume > 0) {
            lastVolume = activeAudio.volume;
            updateVolumeUI(0);
        } else {
            updateVolumeUI(lastVolume || 0.7);
        }
    });

    volumeSlider?.addEventListener('mousedown', (e) => {
        isDraggingVolume = true;
        document.body.classList.add('is-dragging-volume');
        handleVolumeSeek(e);
    });

    volumeSlider?.addEventListener('touchstart', (e) => {
        isDraggingVolume = true;
        document.body.classList.add('is-dragging-volume');
        handleVolumeSeek(e);
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingVolume) handleVolumeSeek(e);
    });

    window.addEventListener('touchmove', (e) => {
        if (isDraggingVolume) {
            if (e.cancelable) e.preventDefault();
            handleVolumeSeek(e);
        }
    }, { passive: false });

    window.addEventListener('mouseup', () => {
        isDraggingVolume = false;
        document.body.classList.remove('is-dragging-volume');
    });

    window.addEventListener('touchend', () => {
        isDraggingVolume = false;
        document.body.classList.remove('is-dragging-volume');
    });

    /**
     * Helper untuk memformat timestamp Firestore ke waktu relatif (misal: 2m, 1h)
     */
    const formatRelativeTime = (timestamp) => {
        if (!timestamp) return "now";
        const now = new Date();
        const date = timestamp.toDate();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return "now";
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h`;
        return `${Math.floor(diffInHours / 24)}d`;
    };

    // NEW: Fungsi untuk mengatur status online/offline pengguna saat ini di Realtime Database
    const setupUserPresence = (user) => {
        if (!user) return;

        const userStatusRef = ref(rtdb, `presence/${user.uid}`);
        const isConnectedRef = ref(rtdb, '.info/connected');

        onValue(isConnectedRef, (snapshot) => {
            if (snapshot.val() === true) {
                // Set status online saat terhubung
                rtdbSet(userStatusRef, { // Menggunakan rtdbSet
                    state: 'online',
                    last_changed: rtdbServerTimestamp() // Menggunakan rtdbServerTimestamp
                });

                // Set onDisconnect untuk mengubah status menjadi offline saat terputus
                onDisconnect(userStatusRef).set({
                    state: 'offline',
                    last_changed: rtdbServerTimestamp() // Menggunakan rtdbServerTimestamp
                });
            } else {
                // Klien terputus dari RTDB, onDisconnect akan dipicu secara otomatis
                // Tidak perlu melakukan apa-apa di sini, onDisconnect sudah menangani.
            }
        });
    };

    // NEW: Fungsi untuk mendengarkan status online teman dari Realtime Database
    const listenToFriendPresence = (friendUid) => {
        if (activePresenceListeners.has(friendUid)) return;
        activePresenceListeners.add(friendUid);

        const friendStatusRef = ref(rtdb, `presence/${friendUid}`);
        onValue(friendStatusRef, (snapshot) => {
            const data = snapshot.val();
            const isOnline = data?.state === 'online';

            friendOnlineStatus[friendUid] = isOnline;
            
            // Cari semua elemen status untuk user ini (antisipasi jika ada lebih dari satu tempat)
            const statusElements = document.querySelectorAll(`.friend-item[data-uid="${friendUid}"] .online-status`);
            statusElements.forEach(el => {
                if (isOnline) el.classList.remove('offline');
                else el.classList.add('offline');
            });
        });
    }

    /**
     * Fungsi untuk merender daftar aktivitas teman secara dinamis
     */
    const renderFriendActivity = async (displayLimit = 10) => {
        const container = document.getElementById('friendActivityContainer');
        const seeAllLink = document.querySelector('.friend-activity-section .see-all-link');
        if (!container) return;

        isLoadingMoreActivity = true;

        // Bersihkan listener lama jika ada (Mencegah kebocoran memori/sumber daya)
        if (friendActivityListeners.length > 0) {
            friendActivityListeners.forEach(unsub => unsub());
            friendActivityListeners = [];
        }

        // Berikan indikator loading halus di container
        if (container.innerHTML === "") {
            container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">Loading activity...</p>`;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // 1. Ambil daftar UID orang yang di-follow
        // Asumsi struktur data: users/{myUid}/following/{friendUid}
        const followingRef = collection(db, "users", currentUser.uid, "following");
        const followingSnap = await getDocs(followingRef);
        // Filter: Hanya ambil ID teman, pastikan ID kita sendiri tidak masuk jika tidak sengaja ter-follow
        const followingIds = followingSnap.docs.map(doc => doc.id).filter(id => id !== currentUser.uid);

        // Jika tidak mem-follow siapapun, tampilkan pesan kosong atau instruksi
        if (followingIds.length === 0) {
            container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">Follow friends to see their activity!</p>`;
            if (seeAllLink) seeAllLink.classList.add('hidden');
            return;
        }

        // Munculkan link "See all" karena user sudah memiliki teman (following > 0)
        if (seeAllLink) seeAllLink.classList.remove('hidden');

        // 2. CHUNKING: Bagi ID menjadi kelompok berisi maksimal 30 (limit Firestore 'in' query)
        const chunks = [];
        for (let i = 0; i < followingIds.length; i += 30) {
            chunks.push(followingIds.slice(i, i + 30));
        }

        // Map untuk menyimpan hasil dari setiap chunk
        const chunkResultsMap = new Map();

        // 3. Jalankan Snapshot untuk setiap chunk
        chunks.forEach((chunkIds, index) => {
            const q = query(
                collection(db, "friends_activity"),
                where(documentId(), "in", chunkIds),
                orderBy("timestamp", "desc"),
                limit(displayLimit) // Optimasi: jangan ambil terlalu banyak per chunk
            );

            const unsub = onSnapshot(q, (snapshot) => {
                isLoadingMoreActivity = false;
                // Simpan/Update data dari chunk ini ke dalam Map
                chunkResultsMap.set(index, snapshot.docs.map(d => ({ id: d.id, ...d.data() })));

                // Gabungkan semua data dari semua chunk
                let combinedData = [];
                chunkResultsMap.forEach(results => {
                    combinedData = [...combinedData, ...results];
                });

                // Urutkan ulang secara global berdasarkan timestamp terbaru
                combinedData.sort((a, b) => {
                    const timeA = a.timestamp?.seconds || 0;
                    const timeB = b.timestamp?.seconds || 0;
                    return timeB - timeA;
                });

                // Ambil hanya sejumlah displayLimit teratas
                const finalDisplay = combinedData.slice(0, displayLimit);

                // Cek apakah sudah sampai ujung data (sederhana)
                hasReachedActivityEnd = combinedData.length < displayLimit;

                if (finalDisplay.length === 0) {
                    container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">No active friends right now.</p>`;
                    return;
                }

                // Pastikan listener status online aktif untuk setiap teman yang akan ditampilkan
                finalDisplay.forEach(friend => listenToFriendPresence(friend.id));

                // 4. Render ke UI
                container.innerHTML = finalDisplay.map(friend => {
                    const onlineClass = friendOnlineStatus[friend.id] ? '' : 'offline';
                    
                return `
                    <div class="friend-item" data-uid="${friend.id}">
                        <div class="avatar-container">
                            <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" class="friend-avatar" alt="${friend.name}">
                            <span class="online-status ${onlineClass}"></span>
                        </div>
                        <div class="friend-info">
                            <div class="friend-header">
                                <span class="friend-name">${friend.name}</span>
                                <span class="friend-time">${formatRelativeTime(friend.timestamp)}</span>
                            </div>
                            <span class="friend-status">
                                Listening to <strong>${friend.song}</strong>
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
            }, (error) => {
                isLoadingMoreActivity = false;
                console.error("Friend Activity Chunk Error:", error);
            });

            friendActivityListeners.push(unsub);
        });
    };

    // Tambahkan Infinite Scroll Listener ke container aktivitas teman
    const friendActivityContainer = document.getElementById('friendActivityContainer');
    if (friendActivityContainer) {
        friendActivityContainer.addEventListener('scroll', () => {
            // Jika user scroll sampai bawah (jarak 20px dari bawah)
            const isBottom = friendActivityContainer.scrollHeight - friendActivityContainer.scrollTop <= friendActivityContainer.clientHeight + 20;
            
            if (isBottom && !isLoadingMoreActivity && !hasReachedActivityEnd && currentFriendActivityLimit >= 10) {
                currentFriendActivityLimit += 50;
                renderFriendActivity(currentFriendActivityLimit);
                console.log("Loading more activities... Limit:", currentFriendActivityLimit);
            }
        });
    }

    /**
     * Fungsi untuk membuka modal dan memuat aktivitas secara masif
     */
    const openFriendsModal = async () => {
        const modal = document.getElementById('friendsModal');
        const modalContainer = document.getElementById('modalActivityContainer');
        if (!modal || !modalContainer) return;

        modal.classList.remove('hidden');
        modalContainer.innerHTML = '<div class="loader-container"><span class="loader"></span><p>Fetching all activities...</p></div>';
        
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // 1. Ambil semua following
        const followingRef = collection(db, "users", currentUser.uid, "following");
        const followingSnap = await getDocs(followingRef);
        // Filter: Pastikan tidak menampilkan diri sendiri di modal
        const followingIds = followingSnap.docs.map(doc => doc.id).filter(id => id !== currentUser.uid);

        // 2. Fetch semua data activity dalam chunks
        const chunks = [];
        for (let i = 0; i < followingIds.length; i += 30) {
            chunks.push(followingIds.slice(i, i + 30));
        }

        const fetchPromises = chunks.map(chunk => {
            const q = query(collection(db, "friends_activity"), where(documentId(), "in", chunk));
            return getDocs(q);
        });

        const results = await Promise.all(fetchPromises);
        allFriendsActivityData = results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. Sortir Berdasarkan Waktu Terbaru
        allFriendsActivityData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        // 4. Render 50 Pertama
        modalContainer.innerHTML = '';
        modalDisplayCount = 0;
        renderMoreToModal();
    };

    const renderMoreToModal = () => {
        const modalContainer = document.getElementById('modalActivityContainer');
        const loader = document.getElementById('modalLoader');
        
        const nextBatch = allFriendsActivityData.slice(modalDisplayCount, modalDisplayCount + MODAL_PAGE_SIZE);
        
        if (nextBatch.length === 0) {
            if (modalDisplayCount === 0) modalContainer.innerHTML = '<p>No activity found.</p>';
            loader.classList.add('hidden');
            return;
        }

        const html = nextBatch.map(friend => `
            <div class="friend-item" style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05)">
                <img src="${friend.avatar || 'https://i.pravatar.cc/150'}" class="friend-avatar">
                <div class="friend-info">
                    <div class="friend-header">
                        <span class="friend-name">${friend.name}</span>
                        <span class="friend-time">${formatRelativeTime(friend.timestamp)}</span>
                    </div>
                    <span class="friend-status">Listening to <strong>${friend.song}</strong></span>
                </div>
            </div>
        `).join('');

        modalContainer.insertAdjacentHTML('beforeend', html);
        modalDisplayCount += nextBatch.length;

        if (modalDisplayCount >= allFriendsActivityData.length) {
            loader.classList.add('hidden');
        }
    };

    // Listener Scroll Modal (Infinite Scroll)
    document.getElementById('modalActivityContainer')?.addEventListener('scroll', (e) => {
        const el = e.target;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
            if (modalDisplayCount < allFriendsActivityData.length) {
                renderMoreToModal();
            }
        }
    });

    // Tambahkan Event Listener untuk link "See All" di Friends Activity
    const friendSeeAllLink = document.querySelector('.friend-activity-section .see-all-link');
    if (friendSeeAllLink) {
        friendSeeAllLink.addEventListener('click', (e) => {
            e.preventDefault();
            openFriendsModal();
        });
    };

    document.querySelector('.close-modal')?.addEventListener('click', () => {
        document.getElementById('friendsModal').classList.add('hidden');
    });

    // Fungsi Helper untuk Navigasi dengan Animasi
    const navigateTo = (url) => {
        const overlay = document.getElementById('pageTransition');

        // Segera sembunyikan container utama agar tidak terlihat berantakan saat resize
        document.body.classList.add('is-transitioning');
        
        if (overlay) {
            overlay.classList.remove('fade-out');
            setTimeout(() => {
                window.location.href = url;
            }, 500);
        } else {
            window.location.href = url;
        }
    };

    // Fungsi sederhana untuk langsung menyembunyikan overlay loading
    const hideLoadingOverlay = () => {
        const overlay = document.getElementById('pageTransition');
        document.body.classList.remove('is-transitioning');
        if (overlay) {
            overlay.classList.add('fade-out');
        }
    };

    // 1. Cek Status Login
    // Listener untuk perubahan ukuran layar secara real-time
    let isNavigating = false;
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768 && !isNavigating) {
            isNavigating = true;
            navigateTo('mobile.html');
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Proteksi: Jika user di perangkat mobile mencoba akses halaman desktop
            if (window.innerWidth <= 768) {
                navigateTo('mobile.html');
                return;
            }

            // FIX: Tambahkan jeda saat refresh agar transisi terasa konsisten
            setTimeout(() => {
                hideLoadingOverlay();
            }, 500);

            // Username display diganti menjadi ikon notifikasi di HTML
            console.log("Logged in as:", user.email);

            // Perbarui nama pengguna
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email.split('@')[0];
            }

            // NEW: Setup presence untuk user yang sedang login
            setupUserPresence(user);

            // Jalankan render activity setelah user dipastikan login
            renderFriendActivity();

            // Muat playlist milik user
            loadUserPlaylists(user.uid);

            // Jalankan pengambilan data API secara paralel agar lebih cepat
            const initializeData = () => {
                // [FIX] Hapus Promise.all agar setiap grid bisa render secara independen.
                // Ini memungkinkan data tampil satu per satu saat sudah siap, tanpa menunggu yang lain.
                fetchWithContinuousRetry(fetchTrendingMusic);
                fetchWithContinuousRetry(fetchTopArtists);
            };

            initializeData();

            // Periksa dan tampilkan status premium
            const premiumBadgeElement = document.getElementById('premiumBadge');
            if (premiumBadgeElement) {
                const premiumStatus = await isUserPremium(user.uid); // Tunggu hasil pengecekan premium
                if (premiumStatus) {
                    premiumBadgeElement.classList.remove('hidden');
                } else {
                    premiumBadgeElement.classList.add('hidden');
                }
            }

            // Perbarui foto profil (Avatar) dengan fallback default dan logika retry otomatis
            const avatarElement = document.getElementById('userAvatar');
            if (avatarElement) {
                const nameForAvatar = user.displayName || user.email.split('@')[0];
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff`;
                const originalPhotoURL = user.photoURL;
                
                let originalRetry = 0;
                const maxRetries = 2;

                // Gunakan no-referrer untuk menghindari blokir 403 dari provider seperti Google/Facebook
                avatarElement.referrerPolicy = "no-referrer";

                // Pasang event listener untuk mencoba memuat ulang jika gagal (retry logic)
                avatarElement.onerror = function() {
                    // Logika 1: Jika foto asli gagal, coba muat ulang dengan cache-buster sebelum menyerah
                    if (originalPhotoURL && this.src.includes(originalPhotoURL.split('?')[0]) && originalRetry < maxRetries) {
                        originalRetry++;
                        console.warn(`Gagal memuat foto asli, mencoba lagi (${originalRetry}/${maxRetries})...`);
                        setTimeout(() => {
                            const sep = originalPhotoURL.includes('?') ? '&' : '?';
                            // Tambahkan timestamp untuk memaksa browser mengambil data baru dari server
                            this.src = `${originalPhotoURL}${sep}t=${Date.now()}`;
                        }, 2000);
                    } 
                    // Logika 2: Jika foto asli tetap gagal setelah retry, baru gunakan default avatar
                    else if (this.src !== defaultAvatar && !this.src.includes('ui-avatars.com')) {
                        console.warn("Foto asli gagal dimuat permanen, beralih ke default...");
                        this.src = defaultAvatar;
                    } else {
                        // Jika default avatar pun gagal, hentikan agar tidak looping
                        this.onerror = null;
                    }
                };

                // Set sumber awal: Prioritaskan photoURL jika tersedia
                avatarElement.src = originalPhotoURL || defaultAvatar;
            }

        } else {
            // Jika tidak ada user, tendang balik ke index.html
            window.location.href = 'index.html';
            // Bersihkan info pengguna jika logout
            if (document.getElementById('userName')) document.getElementById('userName').textContent = '';
            if (document.getElementById('premiumBadge')) document.getElementById('premiumBadge').classList.add('hidden');
            if (document.getElementById('userAvatar')) document.getElementById('userAvatar').src = '';
            
            // Opsional: Set status offline secara manual di RTDB saat logout jika diinginkan
            // Namun onDisconnect biasanya sudah menangani ini dengan cukup baik.
        }
    });

    // 2. Fungsi Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await signOut(auth);
                console.log("User signed out");
                // Setelah sign out, onAuthStateChanged akan otomatis mengalihkan ke index.html
            } catch (error) {
                console.error("Logout Error:", error);
            }
        });
    }
});