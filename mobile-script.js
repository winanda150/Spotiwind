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
const db = getFirestore(app); // Inisialisasi Firestore
const rtdb = getDatabase(app); // Inisialisasi Realtime Database

// Jamendo API Configuration (Free for developers)
const JAMENDO_CLIENT_ID = '17b8da78';
const JAMENDO_API_URL = 'https://api.jamendo.com/v3.0/tracks/';

// Audio Controller Global (Single Instance)
let activeAudio = new Audio();
let currentPlayingBtn = null;
let currentPlaylist = [];
let trendingPlaylist = []; // Buffer untuk menyimpan daftar lagu populer
let newReleasesPlaylist = []; // Buffer untuk menyimpan daftar rilis terbaru
let searchPlaylist = []; // Buffer untuk menyimpan hasil pencarian
let indonesianSongsPlaylist = []; // NEW: Buffer untuk semua lagu lokal
let indonesianGridPlaylist = []; // NEW: Buffer khusus untuk 12 lagu di grid Indonesia
let currentSongIndex = -1;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;
let currentContext = null; // Simpan konteks aktif secara global
let currentSongData = null; // Menyimpan data lagu yang sedang aktif
let activityUpdateTimeout = null; // Untuk optimasi update aktivitas
let friendActivityListeners = []; // Simpan listener agar bisa dibersihkan

// NEW: Tracking listener RTDB agar tidak duplikat (Sinkron dengan Desktop)
const activePresenceListeners = new Set();

// Cache status online teman (sama seperti desktop)
const friendOnlineStatus = {};

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

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
 * Helper untuk membandingkan URL audio secara akurat (ignore protocol/trailing slash)
 */
const isSameAudio = (url1, url2) => {
    if (!url1 || !url2) return false;
    const clean = u => u.replace(/^https?:/, '').replace(/\/$/, '');
    return clean(url1) === clean(url2);
};

/**
 * Helper untuk meriset UI tombol play/pause (Sinkron dengan Mobile)
 */
const resetBtnUI = (btn) => {
    // Hanya reset innerHTML jika elemen memang sebuah tombol icon (play-overlay)
    if (btn && (btn.classList.contains('play-overlay') || btn.classList.contains('play-pause-btn'))) {
        btn.innerHTML = PLAY_ICON;
        btn.classList.remove('btn-loading');
    } else if (btn) {
        btn.classList.remove('btn-loading');
    }
};

// Event listener untuk memperbarui progress bar dan waktu secara real-time
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

// Update total durasi saat metadata lagu dimuat
activeAudio.addEventListener('loadedmetadata', () => {
    document.getElementById('fullTotalTime').textContent = formatTime(activeAudio.duration);
});

// Toggle class is-playing pada card untuk animasi CSS
activeAudio.addEventListener('play', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    document.querySelectorAll('#mobileMainPlayBtn').forEach(btn => btn.innerHTML = PAUSE_ICON);
    document.getElementById('mobilePlayerBar')?.classList.add('is-playing');
    document.getElementById('mobileFullPlayer')?.classList.add('is-playing');

    // Sync Full Player Play Button
    const fullPlayBtn = document.getElementById('fullMainPlayBtn');
    if (fullPlayBtn) fullPlayBtn.innerHTML = PAUSE_ICON;
    
    // Sinkronkan SEMUA instance lagu ini (di Grid maupun Search Dropdown)
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
 * Fungsi navigasi lagu (Next / Previous)
 */
window.playNext = () => {
    if (currentPlaylist.length === 0) return;

    // Karena currentPlaylist sudah diacak di array-nya saat Shuffle aktif,
    // kita cukup mengambil urutan berikutnya.
    let nextIndex = currentSongIndex + 1;
    if (nextIndex >= currentPlaylist.length) nextIndex = 0; 

    triggerSongByIndex(nextIndex);
};

window.playPrevious = () => {
    if (currentPlaylist.length === 0) return;
    let prevIndex = currentSongIndex - 1;
    if (prevIndex < 0) prevIndex = currentPlaylist.length - 1; // Ke akhir jika di awal
    triggerSongByIndex(prevIndex);
};

/**
 * Memperbarui daftar putar berikutnya di Full Screen Player
 */
const renderUpNext = () => {
    const listContainer = document.getElementById('upNextList');
    if (!listContainer) return;

    if (!currentPlaylist || currentPlaylist.length === 0 || currentSongIndex === -1) {
        listContainer.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">No upcoming songs</p>';
        return;
    }

    // Masalah Teratasi: Gunakan Set untuk melacak lagu unik agar tidak ada duplikasi visual 
    // jika playlist sangat pendek.
    const nextSongs = [];
    const maxItems = Math.min(currentPlaylist.length, 5); // Batasi maksimal 5 lagu berikutnya
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
        // isActive hanya untuk index pertama (lagu yang benar-benar diputar sekarang)
        const isActive = idx === 0; 
        // Escape kutipan tunggal dan ganda agar tidak merusak HTML atribut
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

    // Menggunakan View Transitions API jika tersedia (Chrome/Safari 17.4+)
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

    // Cari elemen play-overlay yang spesifik agar tidak menimpa kontainer utama
    const activeEl = document.querySelector(`.is-active-song[data-id="${song.id}"]`) || 
                     document.querySelector(`[data-id="${song.id}"]`);
    const btn = activeEl?.querySelector('.play-overlay');

    window.playPreview(btn, song.audio, song.name, song.artist, song.cover, song.id, song.duration);
};
 
/**
 * Fungsi untuk memperbarui aktivitas pengguna di Firestore
 */
const updateMyActivity = async (songName) => {
    const user = auth.currentUser;
    if (!user) return;

    // Batalkan timeout sebelumnya jika ada (Debouncing sesuai desktop)
    if (activityUpdateTimeout) clearTimeout(activityUpdateTimeout);

    // Hanya update jika lagu diputar lebih dari 5 detik
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
 * Fungsi untuk menyinkronkan status tombol Like di player
 */
const syncPlayerLikeButtons = (isLiked) => {
    const mobileLikeBtn = document.getElementById('mobileLoveBtn');
    if (mobileLikeBtn) mobileLikeBtn.classList.toggle('liked', isLiked);
    
    const fullLikeBtn = document.getElementById('fullLoveBtn');
    if (fullLikeBtn) fullLikeBtn.classList.toggle('liked', isLiked);
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
 * Fungsi untuk membuat efek partikel hati (disederhanakan untuk mobile)
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
    
    // Otomatis hapus setelah animasi selesai (3 detik)
    setTimeout(() => {
        toast.remove();
    }, 3000);
};

/**
 * Fungsi untuk mengatur status online/offline pengguna saat ini di Realtime Database
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
            
            // Set onDisconnect untuk mengubah status menjadi offline saat terputus
            onDisconnect(userStatusRef).set({
                state: 'offline',
                last_changed: rtdbServerTimestamp()
            });
        }
        else {
            setOffline();
        }
    });

    // Perbaikan: Hanya set online saat kembali, jangan paksa offline saat sembunyi
    // agar status 'Listening to...' tetap akurat saat background play.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') setOnline();
    });
};

/**
 * Fungsi untuk memantau status online teman secara real-time di mobile
 */
const listenToFriendPresence = (friendUid) => {
    if (activePresenceListeners.has(friendUid)) return;
    activePresenceListeners.add(friendUid);

    const friendStatusRef = ref(rtdb, `presence/${friendUid}`);
    onValue(friendStatusRef, (snapshot) => {
        const data = snapshot.val();
        const isOnline = data?.state === 'online';
        friendOnlineStatus[friendUid] = isOnline;
        
        // Update UI jika elemen teman ada di halaman (misal di daftar aktivitas)
        const statusElements = document.querySelectorAll(`.friend-item[data-uid="${friendUid}"] .online-status`);
        statusElements.forEach(el => {
            if (isOnline) el.classList.remove('offline');
            else el.classList.add('offline');
        });
    });
};

/**
 * Fungsi untuk mengambil aktivitas teman (sama seperti logika desktop)
 */
const renderMobileFriendActivity = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Bersihkan listener lama jika ada untuk mencegah kebocoran memori
    if (friendActivityListeners.length > 0) {
        friendActivityListeners.forEach(unsub => unsub());
        friendActivityListeners = [];
    }

    try {
        // 1. Ambil daftar UID orang yang di-follow (Following)
        const followingRef = collection(db, "users", user.uid, "following");
        const followingSnap = await getDocs(followingRef);
        const followingIds = followingSnap.docs.map(doc => doc.id).filter(id => id !== user.uid);

        // Jika tidak mem-follow siapapun, tidak perlu melanjutkan
        if (followingIds.length === 0) return;

        // 2. Render container (asumsi ada di HTML atau tambahkan secara dinamis)
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
        console.error("Gagal memuat aktivitas teman di mobile:", error);
    }
};

/**
 * Helper untuk format waktu relatif (sama seperti desktop)
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

    let lastHour = -1; // Menyimpan status jam terakhir untuk optimasi render

    const updateGreeting = () => {
        if (!greetingBadge) return;
        const hour = new Date().getHours();
        if (hour === lastHour) return; // Optimasi: Hanya proses jika jam berubah
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
    // Perbarui sapaan setiap 1 menit agar tetap akurat jika halaman dibiarkan terbuka
    setInterval(updateGreeting, 60000);

    // Segera perbarui jika user kembali ke tab ini (Visibility API)
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
     * Fungsi utama untuk toggle Like/Unlike
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
            // Efek feedback visual saat dislike (un-love)
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
 * Fungsi khusus untuk memutar lagu dari hasil pencarian dropdown.
 * Berfungsi untuk memperbarui currentPlaylist agar fitur Next/Prev sinkron dengan hasil cari.
 */
window.playFromSearch = (audioUrl, title, artist, cover, id) => {
    // Ambil durasi dari lastSearchResults jika tersedia
    const songData = window.lastSearchResults?.find(s => String(s.id) === String(id));
    const duration = songData ? songData.duration : 0; // Default ke 0 jika tidak ditemukan
    window.playPreview(null, audioUrl, title, artist, cover, id, duration, 'search');
};

    /**
     * Fungsi untuk memutar/menghentikan audio
     */
    window.playPreview = async (btn, audioUrl, title, artist, cover, id, duration = 0, context = null) => {
        if (!audioUrl) {
            return;
        }

        currentContext = context; // Update global context

        // Jika btn null (dipanggil dari Up Next/Next/Prev), coba cari tombolnya di DOM agar UI tersinkronisasi
        if (!btn) {
            const activeEl = document.querySelector(`.is-active-song[data-id="${id}"]`) || 
                             document.querySelector(`[data-id="${id}"]`);
            btn = activeEl?.querySelector('.play-overlay');
        }

        // Hanya perbarui playlist jika context diberikan (Play baru dari section tertentu)
        // Jika null (misal dari Next/Prev/Repeat), gunakan currentPlaylist yang sudah ada.
        if (context) {
            let baseQueue = [];
            if (context === 'trending' || context === 'new') {
                const masterPool = [...trendingPlaylist, ...newReleasesPlaylist];
                baseQueue = Array.from(new Map(masterPool.map(s => [s.id, s])).values());
            } else if (context === 'search') {
                baseQueue = [...searchPlaylist]; // Gunakan salinan agar antrean saat ini stabil
            } else if (context === 'local') {
                baseQueue = [...indonesianGridPlaylist]; // PERBAIKAN: Gunakan playlist grid lokal
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

        // Logika Toggle Play/Pause untuk lagu yang sama
        if (isSameSong) {
            if (!activeAudio.paused) {
                activeAudio.pause();
            } else {
                try {
                    // Jika lagu sudah selesai (ended), reset ke awal sebelum memutar ulang (Penting untuk Repeat)
                    if (activeAudio.ended) activeAudio.currentTime = 0;
                    await activeAudio.play();
                } catch (e) {
                    console.error("Resume error:", e);
                }
            }
            return;
        }

        // Memutar Lagu Baru
        currentSongData = { id: songId, audio: audioUrl, name: title, artist, cover, duration: duration };

        // Set index lagu dalam playlist yang baru saja dibuat/diacak
        // Ini sangat penting agar tombol Next/Prev tahu posisi relatifnya
        currentSongIndex = currentPlaylist.findIndex(s => isSameAudio(s.audio, audioUrl));

        // Render daftar lagu berikutnya secara instan (tidak menunggu lagu selesai dimuat)
        renderUpNext();

        // Reset SEMUA status lagu (mencegah duplikat visual saat skip cepat)
        document.querySelectorAll('.is-active-song, .is-paused').forEach(el => {
            el.classList.remove('is-active-song', 'is-paused');
        });
        document.querySelectorAll('.play-overlay, .play-pause-btn').forEach(el => {
            el.classList.remove('btn-loading');
            if (el.classList.contains('play-overlay')) el.innerHTML = PLAY_ICON;
        });

        // Aktifkan class pada semua elemen dengan ID ini
        document.querySelectorAll(`[data-id="${songId}"]`).forEach(el => el.classList.add('is-active-song'));

        // Reset Mini Progress Bar ke 0 seketika sebelum lagu baru dimuat
        document.querySelectorAll('.mobile-mini-progress-bar').forEach(thumb => thumb.style.width = '0%');

        currentPlayingBtn = btn;
        if (btn) btn.classList.add('btn-loading');
        document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.add('btn-loading'));

        activeAudio.onerror = null;
        activeAudio.onended = null;

        try {
            activeAudio.src = audioUrl;

        // Update Document Title (Konsisten dengan desktop)
        document.title = `Spotiwind - Feel The Music, Ride The Wind`;

        // Media Session API integration
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Spotiwind', // Atau ambil dari currentSongData jika ada
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

            // Tampilkan dan update Mobile Player Bar
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
                console.error("Kesalahan pemutaran audio:", e);
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
            showToast(error.message || "Gagal memuat lagu.");
            if (btn) btn.classList.remove('btn-loading');
            document.querySelectorAll('.play-pause-btn').forEach(b => b.classList.remove('btn-loading'));
            currentPlayingBtn = null;
        }

        activeAudio.onended = () => {
            resetBtnUI(btn);
            currentPlayingBtn = null;
            if (isRepeat) {
                if (currentSongIndex !== -1) {
                    triggerSongByIndex(currentSongIndex); // Memutar ulang lagu yang sama
                } else if (currentSongData) {
                    // Perbaikan: Pastikan pemutaran ulang lagu dari pencarian tetap bersih
                    window.playPreview(null, currentSongData.audio, currentSongData.name, currentSongData.artist, currentSongData.cover, currentSongData.id, currentSongData.duration);
                }
            } else if (currentPlaylist.length > 0) {
                playNext();
            }
        };
    };

    /**
     * Fungsi untuk menampilkan daftar artis ke UI
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
     * Fungsi untuk mengambil data artis populer dari Jamendo
     */
    const fetchTopArtists = async () => {
        showSkeletonLoader('.artists-grid', 'artist', 5);
        const artistsGrid = document.querySelector('.artists-grid');
        try {
            const url = `https://api.jamendo.com/v3.0/artists/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=popularity_total`;
            const response = await fetchWithRetry(url);
            if (!response.ok) throw new Error("Gagal menghubungi server Jamendo");
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
                
                renderTopArtists(artistsWithPhotos);
                return true; // Berhasil
            }
            return false; // Gagal jika tidak ada hasil
        } catch (error) {
            console.error("Gagal mengambil data artis:", error);
            throw error; // Lemparkan error agar ditangkap oleh fetchWithContinuousRetry
        }
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
     * Fungsi untuk menampilkan daftar lagu ke UI secara otomatis
     */
    const renderPopularSongs = (songs, targetGridSelector = '.song-grid', context = 'trending') => {
        const songGrid = document.querySelector(targetGridSelector);
        if (!songGrid) return;

        // Simpan ke buffer berdasarkan konteks pemanggilan
        if (context === 'new') {
            newReleasesPlaylist = songs;
        } else if (context === 'trending') {
            trendingPlaylist = songs;
        } else if (context === 'search') {
            searchPlaylist = songs;
        }

        const html = songs.map(song => {
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
        }).join('');

        songGrid.innerHTML = html;
        
        // Mobile Event Delegation
        songGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.play-overlay') || e.target.closest('.play-mini-btn');
            if (!btn) return;
            const card = btn.closest('.song-card');
            const overlay = card.querySelector('.play-overlay');
            const d = overlay.dataset;
            window.playPreview(overlay, d.audio, d.name, d.artist, d.cover, card.dataset.id, Number(d.duration), d.context);
        });
    };

    const searchMusic = async (query) => {
        const songGrid = document.querySelector('.song-grid');
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

                renderPopularSongs(rawSongs, '.song-grid', 'search');
            } else {
                songGrid.innerHTML = '<p style="width: 100%; text-align: center; color: var(--text-muted);">Tidak ada hasil ditemukan.</p>';
            }
        } catch (error) {
            console.error("Search Music Error:", error);
            songGrid.innerHTML = `<p style="width: 100%; text-align: center; color: var(--text-muted);">Gagal mencari lagu. Coba lagi nanti.</p>`;
        }
    };

    /**
     * Fungsi untuk mengambil data rilis terbaru dari Jamendo
     */
    const fetchNewReleases = async () => {
        const songGrid = document.getElementById('newReleasesGrid');
        if (!songGrid) return;

        showSkeletonLoader('#newReleasesGrid', 'song', 6);

        try {
            // Kita ambil limit lebih banyak (50) untuk difilter agar setiap artis unik
            const url = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=releasedate_desc&include=stats`;
            const response = await fetchWithRetry(url);
            if (!response.ok) throw new Error("Gagal menghubungi server Jamendo");
            const data = await response.json();

            // Filter agar setiap artis hanya muncul sekali di daftar rilis terbaru
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
                // Rilis baru biasanya memiliki jumlah putar yang lebih rendah
                plays: formatPlayCount(Math.floor(Math.random() * 50000) + 1000)
            }));

            renderPopularSongs(rawSongs, '#newReleasesGrid', 'new');
            return true; // Berhasil
        } catch (error) {
            console.error("Gagal mengambil rilis terbaru:", error);
            throw error; // Lemparkan error agar ditangkap oleh fetchWithContinuousRetry
        }
    };

    /**
     * Fungsi untuk mengambil lagu lokal Indonesia dari manifest JSON.
     * Sumber file audio: Elemen/Lagu .../*.mp3
     * Sumber cover: Elemen/Images Song/*.jpg (nama file sesuai nama lagu)
     */
    const fetchIndonesianSongs = async () => {
        const songGrid = document.getElementById('indonesianSongsGrid');
        if (!songGrid) return;

        showSkeletonLoader('#indonesianSongsGrid', 'song', 6);

        // Daftar 12 lagu yang akan ditampilkan secara manual di grid utama.
        // Data ini tidak lagi diambil dari slice, tetapi didefinisikan langsung di sini.
        const IndonesianGridSongs = [
            {
                "id": "backstreet-boys-shape-of-my-heart", "name": "Shape Of My Heart", "artist": "Backstreet Boys", "plays": "98.1M", "duration": 228,
                "audio": "Elemen/Lagu%20Backstreet%20Boys/Shape%20Of%20My%20Heart.mp3", "cover": "Elemen/Images%20Song/Shape%20Of%20My%20Heart.webp" 
            },
            {
                "id": "riam-laode-dunia-yang-nanti", "name": "Dunia Yang Nanti", "artist": "Raim Laode", "plays": "75.3M", "duration": 200,
                "audio": "Elemen/Lagu%20Raim%20Laode/Dunia%20Yang%20Nanti.mp3", "cover": "Elemen/Images%20Song/Dunia%20Yang%20Nanti.webp"
            },
            {
                "id": "hindia-evaluasi", "name": "Evaluasi", "artist": "Hindia", "plays": "68.9M", "duration": 202,
                "audio": "Elemen/Lagu%20Hindia/Evaluasi.mp3", "cover": "Elemen/Images%20Song/Evaluasi.webp"
            },
            {
                "id": "rizky-febian-&-adrian-khalif-alamak", "name": "Alamak", "artist": "Rizky Febian & Adrian Khalif", "plays": "55.2M", "duration": 221,
                "audio": "Elemen/Lagu%20Rizky%20Febian/Alamak.mp3", "cover": "Elemen/Images%20Song/Alamak.webp"
            },
            {
                "id": ".feast-nina", "name": "Nina", "artist": ".Feast", "plays": "43.1M", "duration": 283,
                "audio": "Elemen/Lagu%20.Feast/Nina.mp3", "cover": "Elemen/Images%20Song/Nina.webp"
            },
            {
                "id": "idgitaf-sedia-aku-sebelum-hujan", "name": "Sedia Aku Sebelum Hujan", "artist": "Idgitaf", "plays": "39.8M", "duration": 233,
                "audio": "Elemen/Lagu%20Idgitaf/Sedia%20Aku%20Sebelum%20Hujan.mp3", "cover": "Elemen/Images%20Song/Sedia%20Aku%20Sebelum%20Hujan.webp"
            },
            {
                "id": "juicy-luicy-lantas", "name": "Lantas", "artist": "Juicy Luicy", "plays": "35.5M", "duration": 234,
                "audio": "Elemen/Lagu%20Juicy%20Luicy/Lantas.mp3", "cover": "Elemen/Images%20Song/Lantas.webp"
            },
            {
                "id": "vierra-seandainya", "name": "Seandainya", "artist": "Vierra", "plays": "31.2M", "duration": 263,
                "audio": "Elemen/Lagu%20Vierra/Seandainya.mp3", "cover": "Elemen/Images%20Song/Seandainya.webp"
            },
            {
                "id": "for-revenge,-stereo-wall-jakarta-hari-ini", "name": "Jakarta Hari Ini", "artist": "For Revenge, Stereo Wall", "plays": "28.9M", "duration": 224,
                "audio": "Elemen/Lagu%20For%20Revenge,%20Stereo%20Wall/Jakarta%20Hari%20Ini.mp3", "cover": "Elemen/Images%20Song/Jakarta%20Hari%20Ini.webp"
            },
            {
                "id": "radiohead-creep", "name": "Creep", "artist": "Radiohead", "plays": "25.7M", "duration": 236,
                "audio": "Elemen/Lagu%20Radiohead/Creep.mp3", "cover": "Elemen/Images%20Song/Creep.webp"
            },
            {
                "id": "batas-senja-kita-usahakan-lagi", "name": "Kita Usahakan Lagi", "artist": "Batas Senja", "plays": "22.4M", "duration": 234,
                "audio": "Elemen/Lagu%20Batas%20Senja/Kita%20Usahakan%20Lagi.mp3", "cover": "Elemen/Images%20Song/Kita%20Usahakan%20Lagi.webp"
            },
            {
                "id": "bilal-indrajaya-niscaya", "name": "Niscaya", "artist": "Bilal Indrajaya", "plays": "19.1M", "duration": 241,
                "audio": "Elemen/Lagu%20Bilal%20Indrajaya/Niscaya.mp3", "cover": "Elemen/Images%20Song/Niscaya.webp"
            }
        ];

        try {
            const res = await fetchWithRetry('./indonesian-songs-manifest.json');
            if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
            const data = await res.json();

            // Simpan SEMUA lagu lokal ke buffer global
            indonesianSongsPlaylist = (data.songs || []).map((s, idx) => ({
                id: s.id || `local-${idx}`,
                name: s.name,
                artist: s.artist,
                cover: s.cover,
                audio: s.audio,
                duration: s.duration || 0, // Ambil durasi dari manifest, atau default ke 0
                plays: formatPlayCount(Math.floor(Math.random() * 99000000) + 1000000)
            }));

            // PERBAIKAN: Simpan 12 lagu grid ke variabel global agar bisa diakses oleh player
            indonesianGridPlaylist = IndonesianGridSongs;

            // Render grid utama dengan daftar lagu yang sudah didefinisikan manual di atas.
            // Konteks 'local' digunakan untuk logika pemutaran.
            // Sekarang data 'plays' sudah statis dan ada di dalam IndonesianGridSongs.
            renderPopularSongs(IndonesianGridSongs, '#indonesianSongsGrid', 'local');

            // Catatan: `indonesianSongsPlaylist` yang berisi SEMUA lagu tetap disimpan
            // untuk digunakan oleh fungsi pencarian di `fetchDropdownResults`.
        } catch (error) {
            console.error('Gagal memuat Indonesian Songs:', error);
            throw error; // Lemparkan error agar ditangkap oleh fetchWithContinuousRetry
        }
    };

    /**
     * Fungsi untuk mengambil data lagu populer dari Jamendo
     */
    const fetchTrendingMusic = async () => {
        const songGrid = document.querySelector('.song-grid');
        const sectionTitle = document.getElementById('sectionTitle');
        showSkeletonLoader('.song-grid', 'song', 6);
        try {
            if (sectionTitle) sectionTitle.textContent = "Popular Right Now";
            // Kita ambil limit lebih banyak (50) untuk difilter agar setiap artis unik di grid
            const url = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=50&order=popularity_total&include=stats`;
            const response = await fetchWithRetry(url);
            if (!response.ok) throw new Error("Gagal menghubungi server Jamendo");
            const data = await response.json();

            // Logika filter: Hanya ambil satu lagu per artis untuk variasi visual
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
                    // Rentang baru: 300 ribu hingga 5 juta agar terasa lebih populer
                    plays: formatPlayCount(Math.floor(Math.random() * 4700000) + 300000)
        }));

        renderPopularSongs(rawSongs, '.song-grid', 'trending');
        return true; // Berhasil
        } catch (error) {
            console.error("Gagal mengambil data musik:", error);
            throw error; // Lemparkan error agar ditangkap oleh fetchWithContinuousRetry
        }
    };

    /**
     * NEW: Wrapper untuk mencoba ulang fungsi fetch secara terus-menerus saat gagal.
     * Ini memastikan skeleton loader tetap ada dan aplikasi terus mencoba memuat data.
     * @param {() => Promise<boolean>} fetchFunction - Fungsi async yang akan dijalankan.
     * @param {number} delay - Jeda waktu (ms) sebelum mencoba lagi.
     */
    const fetchWithContinuousRetry = async (fetchFunction, delay = 10000) => {
        try {
            const success = await fetchFunction();
            if (!success) {
                // Jika fungsi selesai tapi tidak berhasil (misal, API mengembalikan array kosong)
                // kita tetap coba lagi.
                console.warn(`${fetchFunction.name} selesai tetapi tidak ada data, mencoba lagi dalam ${delay}ms...`);
                setTimeout(() => fetchWithContinuousRetry(fetchFunction, delay), delay);
            }
            // Jika berhasil (success is true), fungsi berhenti di sini.
        } catch (error) {
            // Jika terjadi error (misal, jaringan putus), coba lagi setelah jeda.
            console.error(`Terjadi error pada ${fetchFunction.name}, mencoba lagi dalam ${delay}ms...`, error);
            setTimeout(() => fetchWithContinuousRetry(fetchFunction, delay), delay);
        }
    };

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

    // Logic Klik untuk Bottom Navigation
    const bottomNavItems = document.querySelectorAll('.mobile-bottom-nav .nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetPage = item.getAttribute('data-target');
            // Jika target sama dengan halaman saat ini, jangan lakukan apa-apa
            if (window.location.pathname.includes(targetPage)) return;
            
            e.preventDefault();
            navigateTo(targetPage);
        });
    });

    // Fungsi sederhana untuk langsung menyembunyikan overlay loading
    const hideLoadingOverlay = () => {
        const overlay = document.getElementById('pageTransition');
        document.body.classList.remove('is-transitioning');
        if (overlay) {
            overlay.classList.add('fade-out');
        }
    };

    // Listener untuk perubahan ukuran layar secara real-time
    let isNavigating = false;
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && !isNavigating) {
            isNavigating = true;
            navigateTo('desktop.html');
        }
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Proteksi: Jika dibuka di Desktop, lempar balik ke halaman desktop
            if (window.innerWidth > 768) {
                navigateTo('desktop.html');
                return;
            }

            // FIX: Tambahkan jeda saat refresh agar transisi terasa konsisten
            // seperti saat login. Ini akan menahan layar loading selama 1 detik.
            setTimeout(() => {
                hideLoadingOverlay();
            }, 500);
            // Perbarui nama pengguna (Username)
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email.split('@')[0];
            }

            // Setup presence untuk user yang sedang login
            setupUserPresence(user);

            // Mulai memantau aktivitas teman agar status online mereka ter-sync
            renderMobileFriendActivity();

            // Jalankan pengambilan data API secara paralel agar lebih cepat (sinkron dengan pola desktop)
            const initializeData = async () => {
                try {
                    await Promise.all([
                        fetchWithContinuousRetry(fetchTrendingMusic),
                        fetchWithContinuousRetry(fetchTopArtists),
                        fetchWithContinuousRetry(fetchNewReleases),
                        fetchWithContinuousRetry(fetchIndonesianSongs)
                    ]);
                } catch (err) {
                    console.error("Gagal memuat data awal:", err);
                }
            };

            initializeData();

            // Inisialisasi Fitur Search Slidedown
            const searchInput = document.getElementById('searchInput');
            const searchDropdown = document.getElementById('searchDropdown');

            let searchAbortController = null;

            // NEW: Fungsi helper untuk menyinkronkan tinggi dropdown dengan hero-card secara dinamis
            const updateSearchDropdownHeight = () => {
                const heroCard = document.querySelector('.hero-card');
                const searchBox = document.querySelector('.search-box');
                
                if (heroCard && searchDropdown && searchBox) {
                    const heroRect = heroCard.getBoundingClientRect();
                    const searchRect = searchBox.getBoundingClientRect();
                    
                    // Jarak total dari bawah kotak pencarian ke bawah hero card
                    const distanceToBottom = heroRect.bottom - searchRect.bottom;

                    // Ambil nilai margin-top dari dropdown (0.5rem) agar tidak 'offside' ke bawah
                    const dropdownStyle = window.getComputedStyle(searchDropdown);
                    const marginTop = parseFloat(dropdownStyle.marginTop) || 0;
                    
                    // Tinggi maksimal adalah jarak dikurangi margin agar pas di garis bawah hero card
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

                    // --- START: LOGIKA PENCARIAN LOKAL ---
                    const localResults = indonesianSongsPlaylist
                        .filter(song => {
                            const fullText = `${song.name} ${song.artist}`.toLowerCase();
                            return fullText.includes(cleanQuery);
                        })
                        .map(song => ({ // Ubah format agar konsisten dengan Jamendo
                            ...song,
                            artist_name: song.artist,
                            image: song.cover,
                            isLocal: true // Tandai sebagai lagu lokal
                        }));
                    // --- END: LOGIKA PENCARIAN LOKAL ---

                    const baseUrl = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=15&include=stats`;
                    
                    // Gunakan Hybrid Search juga di Dropdown dengan signal pembatalan
                    const [res1, res2] = await Promise.all([
                        fetchWithRetry(`${baseUrl}&search=${encodeURIComponent(cleanQuery)}`, { signal: searchAbortController.signal }),
                        fetchWithRetry(`${baseUrl}&namesearch=${encodeURIComponent(cleanQuery)}`, { signal: searchAbortController.signal })
                    ]);

                    const data1 = await res1.json();
                    const data2 = await res2.json();
                    const combined = [...(data1.results || []), ...(data2.results || []), ...localResults];
                    
                    const qWords = cleanQuery.split(/\s+/);
                    
                    // 1. Hilangkan Duplikat
                    const uniqueMap = new Map();
                    combined.forEach(item => uniqueMap.set(item.id, item));
                    const allTracks = Array.from(uniqueMap.values());

                    // 2. Filter Prioritas (Harus mengandung semua kata yang diketik)
                    const priorityMatches = allTracks.filter(item => {
                        const fullText = `${item.name} ${item.artist_name || item.artist}`.toLowerCase();
                        return qWords.every(word => fullText.includes(word));
                    });

                // 3. Sortir dengan memprioritaskan lagu lokal
                const customSort = (a, b) => {
                    const aIsLocal = a.isLocal || false;
                    const bIsLocal = b.isLocal || false;

                    if (aIsLocal && !bIsLocal) {
                        return -1; // Lagu lokal (a) muncul duluan
                    }
                    if (!aIsLocal && bIsLocal) {
                        return 1; // Lagu lokal (b) muncul duluan
                    }
                    // Jika keduanya lokal atau keduanya eksternal, sortir berdasarkan popularitas
                    return (b.stats?.rate_downloads_total || 0) - (a.stats?.rate_downloads_total || 0);
                };

                const sortedTracks = priorityMatches.sort(customSort);

                    if (sortedTracks.length > 0) {
                        const tracks = sortedTracks;
                        const items = [];
                        
                        // LOGIKA BARU: Tampilkan Artis hanya jika:
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

                        // Batasi hasil lagu agar tidak terlalu panjang di mobile
                        const finalUniqueTracks = [];
                        const seen = new Set();
                        tracks.forEach(t => {
                            const uniqueKey = t.name + (t.artist_name || t.artist);
                            if(!seen.has(uniqueKey)) {
                                finalUniqueTracks.push(t);
                                seen.add(uniqueKey);
                            }
                        });

                        // Simpan hasil lagu ke window agar bisa diakses oleh playFromSearch
                        window.lastSearchResults = finalUniqueTracks.slice(0, 6).map(song => ({
                            id: song.id,
                            name: song.name,
                            artist: song.artist_name || song.artist,
                            album: song.album_name,
                            cover: song.image,
                            audio: song.audio,
                            duration: song.duration,
                            // Data plays disamakan dengan format grid utama
                            plays: song.isLocal ? song.plays : formatPlayCount((song.stats?.rate_downloads_total || 0) * 5)
                        }));
                        searchPlaylist = window.lastSearchResults;

                        finalUniqueTracks.slice(0, 6).forEach(song => {
                            const isActive = currentSongData && String(song.id) === String(currentSongData.id);
                            items.push({
                                type: 'Song',
                                id: song.id, // Tambahkan ID di sini agar data-id terisi di HTML
                                name: song.name,
                                sub: song.artist_name || song.artist,
                                image: song.image,
                                audio: song.audio, // Pastikan audio dan duration ada di sini
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
                        updateSearchDropdownHeight(); // Update tinggi sebelum ditampilkan
                        searchDropdown.classList.add('active');
                        fetchDropdownResults(cleanQuery);
                    } else {
                        searchDropdown.classList.remove('active');
                    }
                }, 500);

                // Pastikan tinggi dropdown tetap akurat jika orientasi layar berubah
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

                searchInput.addEventListener('focus', () => {
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

            // Event Listeners untuk kontrol player mobile
            // Listener untuk Hero Card Play button
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

            // --- LOGIKA FULL SCREEN PLAYER ---
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

            // Buka full player saat klik bar mini player (kecuali klik tombol di dalamnya)
            miniPlayer?.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    openFullPlayer();
                }
            });

            closeFullBtn?.addEventListener('click', closeFullPlayer);

            // Kontrol di Full Player
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
                
                // Perbarui daftar UP NEXT untuk mencerminkan urutan baru
                renderUpNext();
            });

            document.getElementById('fullRepeatBtn')?.addEventListener('click', (e) => {
                isRepeat = !isRepeat;
                if (isRepeat) isShuffle = false; // Matikan shuffle jika repeat aktif
                const btn = e.currentTarget;
                btn.classList.add('btn-pop');
                setTimeout(() => btn.classList.remove('btn-pop'), 400);
                btn.classList.toggle('active', isRepeat);
                document.getElementById('fullShuffleBtn')?.classList.toggle('active', isShuffle);
            });

            // Progress bar seeking untuk Full Player
            const fullProgressTrack = document.getElementById('fullProgressTrack');
            if (fullProgressTrack) {
                const seek = (e) => {
                    if (!activeAudio.duration || activeAudio.duration === Infinity) return;
                    const rect = fullProgressTrack.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const x = clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, x / rect.width));
                    
                    // Update UI secara instan saat digeser
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
                
                // Tambahkan dukungan Mouse untuk drag (penting untuk testing di desktop/tablet)
                fullProgressTrack.addEventListener('mousedown', startDragging);
                window.addEventListener('mousemove', moveDragging);
                window.addEventListener('mouseup', stopDragging);
                
                // Tetap aktifkan klik biasa
                fullProgressTrack.addEventListener('click', seek);
            }

            // --- END LOGIKA FULL SCREEN PLAYER ---

            // Perbarui foto profil (Avatar) - Query langsung di sini agar lebih akurat
            const avatarElement = document.getElementById('userAvatar') || document.querySelector('.mobile-avatar');
            
            if (avatarElement) {
                const nameForAvatar = user.displayName || user.email.split('@')[0];
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=B91EC9&color=fff&bold=true`;
                const originalPhotoURL = user.photoURL;
                
                let originalRetry = 0;
                const maxRetries = 2;

                // Gunakan no-referrer untuk menghindari blokir 403 dari provider seperti Google/Facebook
                avatarElement.referrerPolicy = "no-referrer";

                // Pasang event listener untuk mencoba memuat ulang jika gagal
                avatarElement.onerror = function() {
                    if (originalPhotoURL && this.src.includes(originalPhotoURL.split('?')[0]) && originalRetry < maxRetries) {
                        originalRetry++;
                        console.warn(`Mobile: Gagal memuat foto asli, mencoba lagi (${originalRetry}/${maxRetries})...`);
                        setTimeout(() => {
                            const sep = originalPhotoURL.includes('?') ? '&' : '?';
                            this.src = `${originalPhotoURL}${sep}t=${Date.now()}`;
                        }, 2000);
                    } 
                    else if (this.src !== defaultAvatar && !this.src.includes('ui-avatars.com')) {
                        console.warn("Mobile: Foto asli gagal, beralih ke inisial...");
                        this.src = defaultAvatar;
                    } else {
                        this.onerror = null;
                    }
                };

                avatarElement.src = originalPhotoURL || defaultAvatar;
            }
        } else {
            // Jika tidak login, kembali ke login page
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