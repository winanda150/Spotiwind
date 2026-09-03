import { auth, onAuthStateChanged } from './firebase-config.js';
import { subscribeUserPlaylists, subscribeLikedSongs } from '../../services/libraryService.js';
import { subscribeUserProfile, getProfileByUid, generateUserCode, setUserPremiumStatus } from '../../services/profileService.js';
import { subscribeUserFollowers, subscribeUserFollowing } from '../../services/userService.js';
import { loadLocalCatalog } from '../../services/catalogService.js';
import { clearRecentlyPlayed } from '../../services/recentlyPlayedService.js';
import { defaultAvatar, getHighResAvatarUrl, formatRupiah } from '../../utils/formatters.js';
import { showToast } from '../../utils/domUtils.js';
import { openAvatarPreviewModal, closeAvatarPreviewModal, initAvatarPreviewModal } from '../../components/modals/avatarPreviewModal.js';

let unsubscribeAccountAuth = null;
let unsubscribePlaylists = null;
let unsubscribeLikedSongs = null;
let unsubscribeFollowers = null;
let unsubscribeFollowing = null;
let unsubscribeProfile = null;
let editProfileBtnHandler = null;
let managePlanBtnHandler = null;
let accountCodeClickHandler = null;
let avatarClickHandler = null;
let previewBackBtnHandler = null;
let previewEditBtnHandler = null;
let previewShareBtnHandler = null;
let keydownHandler = null;

// Subscription Modal Handlers
let closeSubModalBtnHandler = null;
let closeManageModalBtnHandler = null;
let activateTrialBtnHandler = null;
let cancelSubBtnHandler = null;
let seeAllRecentBtnHandler = null;
let seeAllArtistsBtnHandler = null;
let recentlyPlayedUpdateHandler = null;
let isModalGestureActive = false;
let planCardClickHandlers = [];
let subModalBackdropHandler = null;
let manageModalBackdropHandler = null;
let cleanupSubSheetDrag = null;
let cleanupManageSheetDrag = null;

let currentProfileData = null;
let selectedPlanData = {
    id: 'individual',
    name: 'Individual Monthly',
    price: 'Rp 29.000'
};

let previousActiveElement = null;

const openAvatarPreview = () => openAvatarPreviewModal({
    modalId: 'avatarPreviewModal',
    previewImgId: 'avatarPreviewImg',
    avatarSourceEl: document.getElementById('accountAvatar')
});

const closeAvatarPreview = () => closeAvatarPreviewModal('avatarPreviewModal');

// ==========================================================================
// Spotiwind PRO Modals (Subscription & Management)
// ==========================================================================

/**
 * Setup swipe-up (fullscreen) & swipe-down (collapse / dismiss) gesture for bottom sheet modal
 */
const setupBottomSheetDrag = (modalEl, onCloseCallback) => {
    if (!modalEl) return () => {};

    const sheet = modalEl.querySelector('.pro-modal-sheet');
    const handleBar = modalEl.querySelector('.pro-modal-handle-bar');
    const header = modalEl.querySelector('.pro-modal-header');

    if (!sheet) return () => {};

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let isTouchOnHandleOrHeader = false;
    let startTime = 0;
    let startScrollTop = 0;
    let initialSheetHeight = 0;
    let canExpandToFullscreen = false;
    let isListeningWindow = false;

    const resetDragStyles = () => {
        isDragging = false;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
        removeWindowListeners();
        setTimeout(() => { isModalGestureActive = false; }, 60);
    };

    const removeWindowListeners = () => {
        if (!isListeningWindow) return;
        isListeningWindow = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (e) => {
        if (e.pointerType === 'mouse' && e.buttons === 0) {
            onPointerUp(e);
            return;
        }

        currentY = e.clientY;
        const deltaY = e.clientY - startY;

        if (Math.abs(deltaY) > 8) {
            isModalGestureActive = true;
        }

        const isFullscreen = sheet.classList.contains('is-fullscreen');

        // Gesture 1: Tarik ke ATAS (deltaY < 0)
        // HANYA diproses jika konten memang panjang & melebihi layar (canExpandToFullscreen) dan ditarik pada handle/header!
        if (deltaY < -6) {
            if (isFullscreen) {
                const rubberBand = deltaY * 0.08;
                sheet.style.transform = `translateY(${rubberBand}px)`;
            } else if (canExpandToFullscreen && isTouchOnHandleOrHeader) {
                if (!isDragging) {
                    isDragging = true;
                    sheet.classList.add('is-dragging');
                }
                const pullDistance = Math.abs(deltaY);
                const targetHeight = Math.min(window.innerHeight, initialSheetHeight + pullDistance);
                sheet.style.transform = 'translateY(0)';
                sheet.style.maxHeight = '100dvh';
                sheet.style.height = `${targetHeight}px`;
                if (e.cancelable) e.preventDefault();
            }
            // Jika konten sudah muat semua (canExpandToFullscreen === false): Diam di tempat, tidak ada lonjakan sama sekali!
        }
        // Gesture 2: Tarik ke BAWAH (deltaY > 0)
        else if (deltaY > 0) {
            if (isTouchOnHandleOrHeader) {
                // Tarik langsung dari handle bar / header: respon instan
                if (deltaY > 4) {
                    if (!isDragging) {
                        isDragging = true;
                        sheet.classList.add('is-dragging');
                    }
                    sheet.style.height = '';
                    sheet.style.maxHeight = '';
                    sheet.style.transform = `translateY(${deltaY}px)`;
                    if (e.cancelable) e.preventDefault();
                }
            } else if (sheet.scrollTop <= 0 && deltaY > 28) {
                // Sentuhan di area konten saat posisi sudah di puncak paling atas:
                // Butuh tarikan sengaja (> 28px) agar scroll balik ke atas tidak membuat modal turun lalu membal naik!
                if (!isDragging) {
                    isDragging = true;
                    sheet.classList.add('is-dragging');
                }
                sheet.style.height = '';
                sheet.style.maxHeight = '';
                sheet.style.transform = `translateY(${deltaY - 28}px)`;
                if (e.cancelable) e.preventDefault();
            }
        }
    };

    const onPointerUp = (e) => {
        removeWindowListeners();

        const deltaY = (e ? e.clientY : currentY) - startY;
        const deltaTime = Math.max(1, Date.now() - startTime);
        const velocityY = deltaY / deltaTime;
        const isFullscreen = sheet.classList.contains('is-fullscreen');

        if (!isDragging && Math.abs(deltaY) < 10) {
            resetDragStyles();
            return;
        }

        isDragging = false;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';

        // Kasus 1: Tarik ke ATAS -> HANYA masuk fullscreen jika konten memang panjang dan ditarik pada Handle Bar/Header!
        if (deltaY < -35 || velocityY < -0.3) {
            if (!isFullscreen && canExpandToFullscreen && isTouchOnHandleOrHeader) {
                sheet.classList.add('is-fullscreen');
            }
            setTimeout(() => { isModalGestureActive = false; }, 80);
            return;
        }

        // Kasus 2: Tarik ke BAWAH (Swipe down threshold)
        if (isFullscreen) {
            if (deltaY > 50 || velocityY > 0.28) {
                sheet.classList.remove('is-fullscreen');
                sheet.scrollTop = 0;
            }
        } else {
            const dismissThreshold = isTouchOnHandleOrHeader ? 50 : 80;
            if (deltaY > dismissThreshold || (isTouchOnHandleOrHeader && velocityY > 0.28)) {
                if (typeof onCloseCallback === 'function') {
                    onCloseCallback();
                }
            }
        }

        setTimeout(() => { isModalGestureActive = false; }, 80);
    };

    const onPointerCancel = () => {
        resetDragStyles();
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        // Abaikan tombol close & submit
        if (e.target.closest('#closeSubscriptionModalBtn, #closeManageModalBtn, #activateProTrialBtn, #cancelSubscriptionBtn')) return;

        startY = e.clientY;
        currentY = e.clientY;
        startTime = Date.now();
        startScrollTop = sheet.scrollTop;
        initialSheetHeight = sheet.offsetHeight;
        isModalGestureActive = false;

        // Cek ketat: Apakah konten modal memang lebih panjang dari layar dan butuh scroll?
        const isContentScrollable = (sheet.scrollHeight - sheet.clientHeight) > 20;
        canExpandToFullscreen = isContentScrollable;

        isTouchOnHandleOrHeader = Boolean(
            (handleBar && handleBar.contains(e.target)) || 
            (header && header.contains(e.target) && !e.target.closest('button, a'))
        );

        if (!isListeningWindow) {
            isListeningWindow = true;
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
        }
    };

    sheet.addEventListener('pointerdown', onPointerDown);

    return () => {
        sheet.removeEventListener('pointerdown', onPointerDown);
        removeWindowListeners();
        resetDragStyles();
    };
};

const openSubscriptionModal = () => {
    const modal = document.getElementById('proSubscriptionModal');
    if (!modal) return;

    previousActiveElement = document.activeElement;

    const sheet = modal.querySelector('.pro-modal-sheet');
    if (sheet) {
        sheet.classList.remove('is-fullscreen');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
    }

    document.body.classList.add('pro-modal-open');
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    void modal.offsetWidth;
    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

const closeSubscriptionModal = () => {
    const modal = document.getElementById('proSubscriptionModal');
    if (!modal || modal.classList.contains('hidden')) return;

    // 1. Lepaskan fokus dari elemen tombol dalam modal sebelum mengatur aria-hidden
    if (modal.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    // 2. Kembalikan fokus ke elemen pemicu jika valid
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        try {
            previousActiveElement.focus();
        } catch {
            // Ignored
        }
    }
    previousActiveElement = null;

    const sheet = modal.querySelector('.pro-modal-sheet');
    if (sheet) {
        sheet.classList.remove('is-fullscreen');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
    }

    document.body.classList.remove('pro-modal-open');
    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    document.body.style.overflow = '';

    setTimeout(() => {
        if (!modal.classList.contains('is-active')) {
            modal.classList.add('hidden');
        }
    }, 320);
};

const openManageModal = () => {
    const modal = document.getElementById('proManageModal');
    if (!modal) return;

    previousActiveElement = document.activeElement;

    const sheet = modal.querySelector('.pro-modal-sheet');
    if (sheet) {
        sheet.classList.remove('is-fullscreen');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
    }

    const planNameEl = document.getElementById('managePlanName');
    const planExpiryEl = document.getElementById('managePlanExpiry');

    if (planNameEl) {
        planNameEl.textContent = currentProfileData?.premiumPlan || 'Spotiwind PRO Individual';
    }

    if (planExpiryEl) {
        if (currentProfileData?.premiumExpiresAt) {
            const diffMs = currentProfileData.premiumExpiresAt - Date.now();
            const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            planExpiryEl.textContent = `${daysRemaining} Hari tersisa`;
        } else {
            planExpiryEl.textContent = '30 Hari tersisa';
        }
    }

    document.body.classList.add('pro-modal-open');
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    void modal.offsetWidth;
    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

const closeManageModal = () => {
    const modal = document.getElementById('proManageModal');
    if (!modal || modal.classList.contains('hidden')) return;

    // 1. Lepaskan fokus dari elemen tombol dalam modal sebelum mengatur aria-hidden
    if (modal.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    // 2. Kembalikan fokus ke elemen pemicu jika valid
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        try {
            previousActiveElement.focus();
        } catch {
            // Ignored
        }
    }
    previousActiveElement = null;

    const sheet = modal.querySelector('.pro-modal-sheet');
    if (sheet) {
        sheet.classList.remove('is-fullscreen');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
    }

    document.body.classList.remove('pro-modal-open');
    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    document.body.style.overflow = '';

    setTimeout(() => {
        if (!modal.classList.contains('is-active')) {
            modal.classList.add('hidden');
        }
    }, 320);
};

const updateProBannerUI = (isPro) => {
    const proTitle = document.querySelector('.pro-banner-title');
    const proDesc = document.querySelector('.pro-banner-desc');
    const managePlanBtn = document.getElementById('managePlanBtn');
    const managePlanBtnText = managePlanBtn?.querySelector('span');
    const profileHeader = document.querySelector('.account-profile-header');

    if (isPro) {
        if (proTitle) proTitle.textContent = 'Spotiwind PRO Active';
        if (proDesc) proDesc.textContent = 'Status langganan aktif. Nikmati seluruh fitur eksklusif.';
        if (managePlanBtnText) managePlanBtnText.textContent = 'Manage plan';
        if (managePlanBtn) managePlanBtn.setAttribute('aria-label', 'Manage plan');
        profileHeader?.classList.add('is-pro');
    } else {
        if (proTitle) proTitle.textContent = 'Spotiwind PRO';
        if (proDesc) proDesc.textContent = 'Banner profil eksklusif, badge PRO, dan download offline.';
        if (managePlanBtnText) managePlanBtnText.textContent = 'Upgrade to PRO';
        if (managePlanBtn) managePlanBtn.setAttribute('aria-label', 'Upgrade to PRO');
        profileHeader?.classList.remove('is-pro');
    }
};

const updateAccountStats = (user) => {
    const statPlaylists = document.getElementById('statPlaylists');
    const statFollowers = document.getElementById('statFollowers');
    const statFollowing = document.getElementById('statFollowing');
    const statLikes = document.getElementById('statLikes');
    const accountProBadge = document.getElementById('accountProBadge');

    unsubscribePlaylists?.();
    unsubscribePlaylists = null;
    unsubscribeLikedSongs?.();
    unsubscribeLikedSongs = null;
    unsubscribeFollowers?.();
    unsubscribeFollowers = null;
    unsubscribeFollowing?.();
    unsubscribeFollowing = null;
    unsubscribeProfile?.();
    unsubscribeProfile = null;

    if (!user) {
        if (statPlaylists) statPlaylists.textContent = '0';
        if (statFollowers) statFollowers.textContent = '0';
        if (statFollowing) statFollowing.textContent = '0';
        if (statLikes) statLikes.textContent = '0';
        if (accountProBadge) accountProBadge.classList.add('hidden');
        updateProBannerUI(false);
        const profileHeader = document.querySelector('.account-profile-header');
        profileHeader?.classList.remove('is-pro');
        return;
    }

    // 1. Realtime Playlists count from Firestore subcollection
    unsubscribePlaylists = subscribeUserPlaylists(user.uid, (playlists) => {
        if (statPlaylists) {
            statPlaylists.textContent = Array.isArray(playlists) ? String(playlists.length) : '0';
        }
    });

    // 2. Realtime Liked Songs count from Firestore subcollection
    unsubscribeLikedSongs = subscribeLikedSongs(user.uid, (songs) => {
        if (statLikes) {
            statLikes.textContent = Array.isArray(songs) ? String(songs.length) : '0';
        }
    });

    // 3. Realtime Followers count from Firestore subcollection
    unsubscribeFollowers = subscribeUserFollowers(user.uid, (followers) => {
        if (statFollowers) {
            statFollowers.textContent = Array.isArray(followers) ? String(followers.length) : '0';
        }
    });

    // 4. Realtime Following count from Firestore subcollection
    unsubscribeFollowing = subscribeUserFollowing(user.uid, (following) => {
        if (statFollowing) {
            statFollowing.textContent = Array.isArray(following) ? String(following.length) : '0';
        }
    });

    // 5. Realtime Profile info (isPremium check and userCode) from Firestore
    unsubscribeProfile = subscribeUserProfile(user.uid, (profile) => {
        if (!profile) return;
        currentProfileData = profile;

        const badge = document.getElementById('accountProBadge');
        const avatarWrapper = document.querySelector('.account-avatar-wrapper');
        const profileHeader = document.querySelector('.account-profile-header');
        const accountCode = document.getElementById('accountCode');
        
        if (accountCode) {
            accountCode.textContent = profile.userCode || generateUserCode(user.uid);
        }

        const isPro = profile.isPremium === true;
        updateProBannerUI(isPro);

        if (isPro) {
            badge?.classList.remove('hidden');
            avatarWrapper?.classList.add('is-pro');
            profileHeader?.classList.add('is-pro');
        } else {
            badge?.classList.add('hidden');
            avatarWrapper?.classList.remove('is-pro');
            profileHeader?.classList.remove('is-pro');
        }
    });
};

const updateAccountUserInfo = (user) => {
    const accountAvatar = document.getElementById('accountAvatar');
    const accountName = document.getElementById('accountName');
    const accountEmail = document.getElementById('accountEmail');
    const accountProBadge = document.getElementById('accountProBadge');
    const avatarWrapper = document.querySelector('.account-avatar-wrapper');
    const accountCodeWrapper = document.getElementById('accountCodeWrapper');
    const accountCode = document.getElementById('accountCode');

    updateAccountStats(user);

    if (!user) {
        currentProfileData = null;
        if (accountName) accountName.textContent = 'Guest';
        if (accountEmail) accountEmail.textContent = 'Sign in to manage your profile';
        if (accountProBadge) accountProBadge.classList.add('hidden');
        if (accountCodeWrapper) accountCodeWrapper.classList.add('hidden');
        if (avatarWrapper) avatarWrapper.classList.remove('is-pro');
        const profileHeader = document.querySelector('.account-profile-header');
        profileHeader?.classList.remove('is-pro');
        if (accountAvatar) {
            accountAvatar.src = 'https://ui-avatars.com/api/?name=Guest&background=1e293b&color=94a3b8&bold=true&size=512';
        }
        return;
    }

    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    if (accountName) accountName.textContent = displayName;
    if (accountEmail) accountEmail.textContent = user.email || 'user@example.com';
    if (accountCodeWrapper) accountCodeWrapper.classList.remove('hidden');
    if (accountCode) accountCode.textContent = generateUserCode(user.uid);

    if (accountAvatar) {
        accountAvatar.referrerPolicy = "no-referrer";
        const avatarUrl = getHighResAvatarUrl(user.photoURL, 512) || defaultAvatar(displayName);
        accountAvatar.src = avatarUrl;
        accountAvatar.onerror = () => {
            accountAvatar.src = defaultAvatar(displayName);
        };
    }
};

const bindAccountInteractions = () => {
    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtnHandler = () => {
            const user = auth.currentUser;
            if (!user) {
                if (typeof window.navigateToAuthPage === 'function') {
                    window.navigateToAuthPage('login');
                } else {
                    showToast('Silakan login terlebih dahulu');
                }
                return;
            }
            showToast('Edit profil akan segera hadir');
        };
        editProfileBtn.addEventListener('click', editProfileBtnHandler);
    }

    // Klik ID Akun untuk menyalin kode ke clipboard
    const accountCodeWrapper = document.getElementById('accountCodeWrapper');
    if (accountCodeWrapper) {
        accountCodeClickHandler = () => {
            const codeEl = document.getElementById('accountCode');
            const codeText = codeEl?.textContent?.trim();
            if (!codeText) return;
            if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(codeText).then(() => {
                    showToast(`ID Akun ${codeText} disalin!`);
                }).catch(() => {
                    showToast(`ID Akun: ${codeText}`);
                });
            } else {
                showToast(`ID Akun: ${codeText}`);
            }
        };
        accountCodeWrapper.addEventListener('click', accountCodeClickHandler);
    }

    // Tombol Aksi di Banner Spotiwind PRO (Upgrade to PRO / Manage Plan)
    const managePlanBtn = document.getElementById('managePlanBtn');
    if (managePlanBtn) {
        managePlanBtnHandler = () => {
            const user = auth.currentUser;
            if (!user) {
                if (typeof window.navigateToAuthPage === 'function') {
                    window.navigateToAuthPage('login');
                } else {
                    showToast('Silakan login terlebih dahulu');
                }
                return;
            }

            if (currentProfileData?.isPremium === true) {
                openManageModal();
            } else {
                openSubscriptionModal();
            }
        };
        managePlanBtn.addEventListener('click', managePlanBtnHandler);
    }

    // Modal Close Buttons & Backdrops
    const closeSubModalBtn = document.getElementById('closeSubscriptionModalBtn');
    if (closeSubModalBtn) {
        closeSubModalBtnHandler = () => closeSubscriptionModal();
        closeSubModalBtn.addEventListener('click', closeSubModalBtnHandler);
    }

    const subBackdrop = document.querySelector('#proSubscriptionModal .pro-modal-backdrop');
    if (subBackdrop) {
        subModalBackdropHandler = () => closeSubscriptionModal();
        subBackdrop.addEventListener('click', subModalBackdropHandler);
    }

    const closeManageModalBtn = document.getElementById('closeManageModalBtn');
    if (closeManageModalBtn) {
        closeManageModalBtnHandler = () => closeManageModal();
        closeManageModalBtn.addEventListener('click', closeManageModalBtnHandler);
    }

    const manageBackdrop = document.querySelector('#proManageModal .pro-modal-backdrop');
    if (manageBackdrop) {
        manageModalBackdropHandler = () => closeManageModal();
        manageBackdrop.addEventListener('click', manageModalBackdropHandler);
    }

    // Setup Drag / Swipe Gestures on Bottom Sheets
    const subModal = document.getElementById('proSubscriptionModal');
    if (subModal) {
        cleanupSubSheetDrag = setupBottomSheetDrag(subModal, () => closeSubscriptionModal());
    }

    const manageModal = document.getElementById('proManageModal');
    if (manageModal) {
        cleanupManageSheetDrag = setupBottomSheetDrag(manageModal, () => closeManageModal());
    }

    // Plan Selection Radio Cards
    const planCards = document.querySelectorAll('.pro-plan-card');
    planCardClickHandlers = [];
    planCards.forEach((card) => {
        const handler = () => {
            if (isModalGestureActive) return;
            planCards.forEach((c) => {
                c.classList.remove('is-selected');
                c.setAttribute('aria-checked', 'false');
            });
            card.classList.add('is-selected');
            card.setAttribute('aria-checked', 'true');

            selectedPlanData = {
                id: card.dataset.planId || 'individual',
                name: card.dataset.planName || 'Individual Monthly',
                price: card.dataset.planPrice || 'Rp 29.000'
            };
        };
        card.addEventListener('click', handler);
        planCardClickHandlers.push({ el: card, fn: handler });
    });

    // Activate PRO Subscription (7-Day Trial)
    const activateProTrialBtn = document.getElementById('activateProTrialBtn');
    if (activateProTrialBtn) {
        activateTrialBtnHandler = async () => {
            const user = auth.currentUser;
            if (!user) {
                showToast('Silakan login terlebih dahulu');
                return;
            }

            try {
                activateProTrialBtn.disabled = true;
                activateProTrialBtn.innerHTML = '<span>Mengaktifkan PRO...</span>';

                await setUserPremiumStatus(user.uid, true, {
                    planName: `Spotiwind PRO ${selectedPlanData.name}`,
                    price: selectedPlanData.price,
                    since: Date.now(),
                    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
                });

                closeSubscriptionModal();
                showToast(`Selamat! Akun Anda kini aktif sebagai Spotiwind PRO 👑`);
            } catch (err) {
                console.error("Failed to activate PRO:", err);
                showToast('Gagal mengaktifkan paket, coba lagi');
            } finally {
                activateProTrialBtn.disabled = false;
                activateProTrialBtn.innerHTML = `
                    <span>Mulai Uji Coba Gratis 7 Hari</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                `;
            }
        };
        activateProTrialBtn.addEventListener('click', activateTrialBtnHandler);
    }

    // Cancel PRO Subscription
    const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
    if (cancelSubscriptionBtn) {
        cancelSubBtnHandler = async () => {
            const user = auth.currentUser;
            if (!user) return;

            const confirmCancel = window.confirm("Apakah Anda yakin ingin membatalkan langganan Spotiwind PRO?");
            if (!confirmCancel) return;

            try {
                cancelSubscriptionBtn.disabled = true;
                cancelSubscriptionBtn.textContent = 'Membatalkan...';

                await setUserPremiumStatus(user.uid, false);
                closeManageModal();
                showToast('Langganan Spotiwind PRO telah dinonaktifkan.');
            } catch (err) {
                console.error("Failed to cancel PRO:", err);
                showToast('Gagal membatalkan langganan');
            } finally {
                cancelSubscriptionBtn.disabled = false;
                cancelSubscriptionBtn.textContent = 'Batalkan Langganan PRO';
            }
        };
        cancelSubscriptionBtn.addEventListener('click', cancelSubBtnHandler);
    }

    // Klik item statistik (Playlists, Followers, Following, Likes)
    document.querySelectorAll('.account-stats-card .stat-item').forEach((item) => {
        item.addEventListener('click', () => {
            const statType = item.dataset.stat;
            const label = item.querySelector('.stat-label')?.textContent || 'Statistik';
            if (statType === 'playlists' || statType === 'likes') {
                if (typeof window.navigateToLibraryPage === 'function') {
                    window.navigateToLibraryPage(statType === 'playlists' ? 'playlists' : 'likes');
                } else {
                    showToast(`${label} dipilih`);
                }
            } else {
                showToast(`${label} akan segera hadir`);
            }
        });
    });

    // Klik avatar di halaman account untuk membuka modal preview kotak besar di tengah
    const avatarWrapper = document.querySelector('.account-avatar-wrapper');
    if (avatarWrapper) {
        avatarClickHandler = (e) => {
            if (e.target.closest('.avatar-camera-badge')) {
                showToast('Ubah foto profil akan segera hadir');
                return;
            }
            openAvatarPreview();
        };
        avatarWrapper.addEventListener('click', avatarClickHandler);
    }

    // Tombol Kembali di Header Dark Preview
    const backBtn = document.getElementById('avatarPreviewBackBtn');
    if (backBtn) {
        previewBackBtnHandler = () => closeAvatarPreview();
        backBtn.addEventListener('click', previewBackBtnHandler);
    }

    // Tombol Edit Foto di Header Dark Preview
    const editBtn = document.getElementById('avatarPreviewEditBtn');
    if (editBtn) {
        previewEditBtnHandler = () => {
            showToast('Ubah foto profil akan segera hadir');
        };
        editBtn.addEventListener('click', previewEditBtnHandler);
    }

    // Tombol Bagikan Foto di Header Dark Preview
    const shareBtn = document.getElementById('avatarPreviewShareBtn');
    if (shareBtn) {
        previewShareBtnHandler = async () => {
            const previewImg = document.getElementById('avatarPreviewImg');
            const photoUrl = previewImg?.src || window.location.href;
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Foto Profil Spotiwind',
                        text: 'Lihat foto profil saya di Spotiwind',
                        url: photoUrl
                    });
                } catch {
                    // Ignored / user cancelled
                }
            } else if (navigator.clipboard) {
                try {
                    await navigator.clipboard.writeText(photoUrl);
                    showToast('Tautan foto profil disalin ke clipboard');
                } catch {
                    showToast('Bagikan foto profil');
                }
            } else {
                showToast('Bagikan foto profil');
            }
        };
        shareBtn.addEventListener('click', previewShareBtnHandler);
    }

    // Render Recently Played Section
    renderAccountRecentlyPlayed();

    if (recentlyPlayedUpdateHandler) {
        window.removeEventListener('recently-played-updated', recentlyPlayedUpdateHandler);
    }
    recentlyPlayedUpdateHandler = () => {
        renderAccountRecentlyPlayed();
        renderAccountTopArtists();
    };
    window.addEventListener('recently-played-updated', recentlyPlayedUpdateHandler, { passive: true });

    // Render Top Artists Section
    renderAccountTopArtists();

    // Tombol See all pada Recently Played Section
    const seeAllRecentBtn = document.getElementById('seeAllAccountRecentBtn');
    if (seeAllRecentBtn) {
        seeAllRecentBtnHandler = (e) => {
            e.preventDefault();
            const libraryNav = document.querySelector('.mobile-bottom-nav .nav-item[data-target="library-mobile.html"]');
            if (libraryNav) {
                libraryNav.click();
            } else if (typeof window.navigateToLibraryPage === 'function') {
                window.navigateToLibraryPage('overview');
            }
        };
        seeAllRecentBtn.addEventListener('click', seeAllRecentBtnHandler);
    }

    // Tombol See all pada Top Artists Section
    const seeAllArtistsBtn = document.getElementById('seeAllAccountArtistsBtn');
    if (seeAllArtistsBtn) {
        seeAllArtistsBtnHandler = (e) => {
            e.preventDefault();
            const searchNav = document.querySelector('.mobile-bottom-nav .nav-item[data-target="search-mobile.html"]');
            if (searchNav) {
                searchNav.click();
            }
        };
        seeAllArtistsBtn.addEventListener('click', seeAllArtistsBtnHandler);
    }

    keydownHandler = (e) => {
        if (e.key === 'Escape') {
            closeAvatarPreview();
            closeSubscriptionModal();
            closeManageModal();
        }
    };
    document.addEventListener('keydown', keydownHandler);
};

/**
 * Render Recently Played songs on the account page
 */
const renderAccountRecentlyPlayed = () => {
    const container = document.getElementById('accountRecentList');
    if (!container) return;

    try {
        const raw = localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]';
        const list = JSON.parse(raw);
        const validList = Array.isArray(list) ? list : [];

        if (validList.length === 0) {
            container.innerHTML = `
                <div class="account-recent-empty">
                    <div class="account-recent-empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <h3 class="account-recent-empty-title">No recently played songs</h3>
                    <p class="account-recent-empty-desc">Songs you've recently played will appear here.</p>
                </div>
            `;
            return;
        }

        const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

        const currentSong = window.spotiwind?.mobile?.getCurrentSongData?.() || 
                            window.__currentSongData || 
                            (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : null);
        const activeAudio = window.__activeAudio || document.querySelector('audio');
        const isAudioPlaying = Boolean(activeAudio && activeAudio.src && !activeAudio.paused && !activeAudio.ended);

        const recentSongs = validList.slice(0, 10);

        container.innerHTML = recentSongs.map(song => {
            const safeName = (song.name || song.title || 'Untitled').replace(/"/g, '&quot;');
            const safeArtist = (song.artist || 'Unknown Artist').replace(/"/g, '&quot;');
            const cover = song.cover || '../../public/Elemen/Logo/Spotiwind.webp';
            const audio = song.audio || '';
            const duration = song.duration || 0;

            const isSame = currentSong && (typeof window.areSameSongs === 'function'
                ? window.areSameSongs(currentSong, song)
                : (String(currentSong.id) === String(song.id) || (audio && currentSong.audio === audio)));
            const isActive = Boolean(isSame);
            const isPaused = isActive && Boolean(activeAudio?.paused);

            return `
                <div class="song-card ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${song.id}" data-audio="${audio}">
                    <div class="song-cover">
                        <img src="${cover}" alt="${safeName}" width="148" height="111" style="width:100%; height:100%; object-fit:cover; aspect-ratio:4/3;" loading="lazy">
                        <button class="play-overlay" aria-label="Play ${safeName}" 
                            data-audio="${audio}" data-name="${safeName}" data-artist="${safeArtist}" 
                            data-cover="${cover}" data-duration="${duration}" data-context="account-recent">
                            ${isActive && isAudioPlaying ? PAUSE_ICON : PLAY_ICON}
                        </button>
                    </div>
                    <div class="song-info">
                        <h3 class="song-name">${safeName}</h3>
                        <p class="song-artist">${safeArtist}</p>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }
    } catch (e) {
        console.warn("Failed to render recently played songs on account page:", e);
    }
};

/**
 * Render Top Artists on the account page (Hybrid Smart: Aggregates played songs, or shows empty state)
 */
const renderAccountTopArtists = async () => {
    const container = document.getElementById('accountArtistsList');
    if (!container) return;

    try {
        const raw = localStorage.getItem('recently_played_songs') || localStorage.getItem('recentlyPlayed') || '[]';
        const list = JSON.parse(raw);
        const validList = Array.isArray(list) ? list : [];

        if (validList.length === 0) {
            container.innerHTML = `
                <div class="account-artists-empty">
                    <div class="account-artists-empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <h3 class="account-artists-empty-title">No top artists yet</h3>
                    <p class="account-artists-empty-desc">Play your favorite songs to see your top artists here.</p>
                </div>
            `;
            return;
        }

        // Hitung frekuensi artis dari daftar lagu yang diputar
        const artistCounts = {};
        const artistSongMap = {};

        validList.forEach((song) => {
            const rawArtist = (song.artist || '').trim();
            if (!rawArtist) return;

            const mainArtist = rawArtist.split(/[,&]/)[0].trim();
            if (!mainArtist) return;

            artistCounts[mainArtist] = (artistCounts[mainArtist] || 0) + 1;
            if (!artistSongMap[mainArtist]) {
                artistSongMap[mainArtist] = song;
            }
        });

        const sortedArtistNames = Object.keys(artistCounts).sort((a, b) => artistCounts[b] - artistCounts[a]);

        if (sortedArtistNames.length === 0) {
            container.innerHTML = `
                <div class="account-artists-empty">
                    <div class="account-artists-empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <p class="account-artists-empty-title">No top artists yet</p>
                    <p class="account-artists-empty-desc">Play your favorite songs to see your top artists here.</p>
                </div>
            `;
            return;
        }

        // Ambil data katalog lokal untuk mencocokkan foto artis berkualitas tinggi
        let catalogArtists = [];
        try {
            const catalog = await loadLocalCatalog();
            catalogArtists = catalog.artists || [];
        } catch {
            // Ignored
        }

        const topArtistsData = sortedArtistNames.slice(0, 10).map((artistName) => {
            const matched = catalogArtists.find(
                (a) => a.name.toLowerCase() === artistName.toLowerCase()
            );

            const sampleSong = artistSongMap[artistName];
            const fallbackPhoto = sampleSong?.cover || `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=7D19F5&color=fff&bold=true&size=512`;

            return {
                id: matched?.id || artistName.toLowerCase().replace(/\s+/g, '-'),
                name: matched?.name || artistName,
                photo: matched?.photo || fallbackPhoto
            };
        });

        container.innerHTML = topArtistsData.map((artist) => {
            const safeName = artist.name.replace(/"/g, '&quot;');
            return `
                <div class="artist-card" data-artist-id="${artist.id}" data-artist-name="${safeName}" data-artist-photo="${artist.photo}">
                    <div class="artist-photo" style="background-image: url('${artist.photo}')"></div>
                    <span class="artist-name">${safeName}</span>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.warn("Failed to render top artists on account page:", e);
    }
};

export const initAccountPage = async () => {
    let user = auth.currentUser;
    if (!user && typeof auth.authStateReady === 'function') {
        try {
            await Promise.race([
                auth.authStateReady(),
                new Promise((resolve) => setTimeout(resolve, 350))
            ]);
            user = auth.currentUser;
        } catch {
            // Ignored
        }
    }

    if (user) {
        // Pre-fetch profile & PRO status immediately before dark transition screen fades out
        try {
            const profile = await Promise.race([
                getProfileByUid(user.uid),
                new Promise((resolve) => setTimeout(() => resolve(null), 800))
            ]);
            if (profile) {
                currentProfileData = profile;
                const isPro = profile.isPremium === true;
                updateProBannerUI(isPro);
                const badge = document.getElementById('accountProBadge');
                const avatarWrapper = document.querySelector('.account-avatar-wrapper');
                const profileHeader = document.querySelector('.account-profile-header');
                if (isPro) {
                    badge?.classList.remove('hidden');
                    avatarWrapper?.classList.add('is-pro');
                    profileHeader?.classList.add('is-pro');
                } else {
                    badge?.classList.add('hidden');
                    avatarWrapper?.classList.remove('is-pro');
                    profileHeader?.classList.remove('is-pro');
                }
            }
        } catch (err) {
            console.warn("Preloading user profile on account page:", err);
        }
        updateAccountUserInfo(user);
    } else {
        updateAccountUserInfo(null);
    }

    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = onAuthStateChanged(auth, updateAccountUserInfo);
    bindAccountInteractions();
};

export const cleanupAccountPage = () => {
    unsubscribeAccountAuth?.();
    unsubscribeAccountAuth = null;

    unsubscribePlaylists?.();
    unsubscribePlaylists = null;

    unsubscribeLikedSongs?.();
    unsubscribeLikedSongs = null;

    unsubscribeFollowers?.();
    unsubscribeFollowers = null;

    unsubscribeFollowing?.();
    unsubscribeFollowing = null;

    unsubscribeProfile?.();
    unsubscribeProfile = null;

    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn && editProfileBtnHandler) {
        editProfileBtn.removeEventListener('click', editProfileBtnHandler);
    }
    editProfileBtnHandler = null;

    const managePlanBtn = document.getElementById('managePlanBtn');
    if (managePlanBtn && managePlanBtnHandler) {
        managePlanBtn.removeEventListener('click', managePlanBtnHandler);
    }
    managePlanBtnHandler = null;

    const accountCodeWrapper = document.getElementById('accountCodeWrapper');
    if (accountCodeWrapper && accountCodeClickHandler) {
        accountCodeWrapper.removeEventListener('click', accountCodeClickHandler);
    }
    accountCodeClickHandler = null;

    const avatarWrapper = document.querySelector('.account-avatar-wrapper');
    if (avatarWrapper && avatarClickHandler) {
        avatarWrapper.removeEventListener('click', avatarClickHandler);
    }
    avatarClickHandler = null;

    const backBtn = document.getElementById('avatarPreviewBackBtn');
    if (backBtn && previewBackBtnHandler) {
        backBtn.removeEventListener('click', previewBackBtnHandler);
    }
    previewBackBtnHandler = null;

    const editBtn = document.getElementById('avatarPreviewEditBtn');
    if (editBtn && previewEditBtnHandler) {
        editBtn.removeEventListener('click', previewEditBtnHandler);
    }
    previewEditBtnHandler = null;

    const shareBtn = document.getElementById('avatarPreviewShareBtn');
    if (shareBtn && previewShareBtnHandler) {
        shareBtn.removeEventListener('click', previewShareBtnHandler);
    }
    previewShareBtnHandler = null;

    const seeAllRecentBtn = document.getElementById('seeAllAccountRecentBtn');
    if (seeAllRecentBtn && seeAllRecentBtnHandler) {
        seeAllRecentBtn.removeEventListener('click', seeAllRecentBtnHandler);
    }
    seeAllRecentBtnHandler = null;

    const seeAllArtistsBtn = document.getElementById('seeAllAccountArtistsBtn');
    if (seeAllArtistsBtn && seeAllArtistsBtnHandler) {
        seeAllArtistsBtn.removeEventListener('click', seeAllArtistsBtnHandler);
    }
    seeAllArtistsBtnHandler = null;

    if (recentlyPlayedUpdateHandler) {
        window.removeEventListener('recently-played-updated', recentlyPlayedUpdateHandler);
        recentlyPlayedUpdateHandler = null;
    }

    const closeSubModalBtn = document.getElementById('closeSubscriptionModalBtn');
    if (closeSubModalBtn && closeSubModalBtnHandler) {
        closeSubModalBtn.removeEventListener('click', closeSubModalBtnHandler);
    }
    closeSubModalBtnHandler = null;

    const subBackdrop = document.querySelector('#proSubscriptionModal .pro-modal-backdrop');
    if (subBackdrop && subModalBackdropHandler) {
        subBackdrop.removeEventListener('click', subModalBackdropHandler);
    }
    subModalBackdropHandler = null;

    const closeManageModalBtn = document.getElementById('closeManageModalBtn');
    if (closeManageModalBtn && closeManageModalBtnHandler) {
        closeManageModalBtn.removeEventListener('click', closeManageModalBtnHandler);
    }
    closeManageModalBtnHandler = null;

    const manageBackdrop = document.querySelector('#proManageModal .pro-modal-backdrop');
    if (manageBackdrop && manageModalBackdropHandler) {
        manageBackdrop.removeEventListener('click', manageModalBackdropHandler);
    }
    manageModalBackdropHandler = null;

    if (cleanupSubSheetDrag) {
        cleanupSubSheetDrag();
        cleanupSubSheetDrag = null;
    }
    if (cleanupManageSheetDrag) {
        cleanupManageSheetDrag();
        cleanupManageSheetDrag = null;
    }

    planCardClickHandlers.forEach(({ el, fn }) => {
        el.removeEventListener('click', fn);
    });
    planCardClickHandlers = [];

    const activateProTrialBtn = document.getElementById('activateProTrialBtn');
    if (activateProTrialBtn && activateTrialBtnHandler) {
        activateProTrialBtn.removeEventListener('click', activateTrialBtnHandler);
    }
    activateTrialBtnHandler = null;

    const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
    if (cancelSubscriptionBtn && cancelSubBtnHandler) {
        cancelSubscriptionBtn.removeEventListener('click', cancelSubBtnHandler);
    }
    cancelSubBtnHandler = null;

    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
    }
    keydownHandler = null;
    previousActiveElement = null;
    currentProfileData = null;
    document.body.classList.remove('pro-modal-open');
    document.body.style.overflow = '';
};
