/**
 * Spotiwind — Pro Subscription Modal Component
 * Reusable modal for upgrading to Spotiwind PRO from any page (Library, Account, Home, etc.)
 */

import { auth } from '../../assets/js/firebase-config.js';
import { setUserPremiumStatus } from '../../services/profileService.js';
import { showToast } from '../../utils/domUtils.js';

let previousActiveElement = null;
let cleanupDrag = null;
let onSubscribedCallback = null;
let onClosedCallback = null;
let isModalGestureActive = false;
let isActivatingPro = false;

let selectedPlanData = {
    id: 'individual',
    name: 'Individual Monthly',
    price: 'Rp 29.000'
};

const PRO_MODAL_HTML = `
<div id="proSubscriptionModal" class="pro-subscription-modal hidden" aria-hidden="true" inert>
    <div class="pro-modal-backdrop"></div>
    <div class="pro-modal-sheet" role="dialog" aria-labelledby="proModalTitle">
        <div class="pro-modal-handle-bar" aria-hidden="true"></div>
        
        <header class="pro-modal-header">
            <div class="pro-modal-crown" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h14a1 1 0 0 0 1-1L21 6l-4.5 4L12 3 7.5 10 3 6l1 9a1 1 0 0 0 1 1zm-1 2a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2H4z"/>
                </svg>
            </div>
            <h2 id="proModalTitle" class="pro-modal-title">Spotiwind PRO</h2>
            <p class="pro-modal-subtitle">Nikmati pengalaman mendengarkan musik premium tanpa batas.</p>
            <button id="closeSubscriptionModalBtn" class="pro-modal-close-btn" type="button" aria-label="Tutup">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </header>

        <!-- Benefits List -->
        <ul class="pro-benefits-list">
            <li class="pro-benefit-item">
                <span class="pro-check-icon">✓</span>
                <span>Badge PRO & Avatar Ring gradasi eksklusif</span>
            </li>
            <li class="pro-benefit-item">
                <span class="pro-check-icon">✓</span>
                <span>Banner profil eksklusif (Exclusive Hero Banner)</span>
            </li>
            <li class="pro-benefit-item">
                <span class="pro-check-icon">✓</span>
                <span>Download offline & dengarkan kapan saja</span>
            </li>
        </ul>

        <!-- Plans Cards -->
        <div class="pro-plans-container" role="radiogroup" aria-label="Pilihan Paket Langganan">
            <!-- Plan 1: Individual Monthly -->
            <div class="pro-plan-card is-selected" role="radio" aria-checked="true" tabindex="0" data-plan-id="individual" data-plan-name="Individual Monthly" data-plan-price="Rp 29.000">
                <div class="pro-plan-badge">Populer</div>
                <div class="pro-plan-info">
                    <h3 class="pro-plan-name">Individual</h3>
                    <p class="pro-plan-desc">1 Akun • Bebas batal kapan saja</p>
                </div>
                <div class="pro-plan-pricing">
                    <span class="pro-price">Rp 29.000</span>
                    <span class="pro-period">/ bulan</span>
                </div>
            </div>

            <!-- Plan 2: Student -->
            <div class="pro-plan-card" role="radio" aria-checked="false" tabindex="0" data-plan-id="student" data-plan-name="Student Plan" data-plan-price="Rp 15.000">
                <div class="pro-plan-badge badge-student">Pelajar</div>
                <div class="pro-plan-info">
                    <h3 class="pro-plan-name">Student (Pelajar)</h3>
                    <p class="pro-plan-desc">1 Akun • Untuk pelajar & mahasiswa</p>
                </div>
                <div class="pro-plan-pricing">
                    <span class="pro-price">Rp 15.000</span>
                    <span class="pro-period">/ bulan</span>
                </div>
            </div>

            <!-- Plan 3: Annual Best Value -->
            <div class="pro-plan-card" role="radio" aria-checked="false" tabindex="0" data-plan-id="annual" data-plan-name="Annual Best Value" data-plan-price="Rp 249.000">
                <div class="pro-plan-badge badge-annual">Hemat 28%</div>
                <div class="pro-plan-info">
                    <h3 class="pro-plan-name">Annual (1 Tahun)</h3>
                    <p class="pro-plan-desc">1 Akun • Bayar 1x untuk 12 bulan</p>
                </div>
                <div class="pro-plan-pricing">
                    <span class="pro-price">Rp 249.000</span>
                    <span class="pro-period">/ tahun</span>
                </div>
            </div>
        </div>

        <!-- Footer Action -->
        <div class="pro-modal-footer">
            <button id="activateProTrialBtn" class="pro-modal-subscribe-btn" type="button">
                <span>Mulai Uji Coba Gratis 7 Hari</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
            <p class="pro-footer-note">Gratis 7 hari pertama, batalkan kapan saja sebelum masa trial berakhir.</p>
        </div>
    </div>
</div>
`;

/**
 * Make sure #proSubscriptionModal exists in the DOM.
 */
export const ensureProModalInDOM = () => {
    let modal = document.getElementById('proSubscriptionModal');
    if (!modal) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = PRO_MODAL_HTML.trim();
        modal = tempDiv.firstElementChild;
        document.body.appendChild(modal);
    }
    return modal;
};

/**
 * Setup drag gesture for bottom sheet swipe down dismissal
 */
const setupSheetDrag = (modal, onClose) => {
    const sheet = modal.querySelector('.pro-modal-sheet');
    const backdrop = modal.querySelector('.pro-modal-backdrop');
    const handleBar = modal.querySelector('.pro-modal-handle-bar');
    const header = modal.querySelector('.pro-modal-header');
    if (!sheet) return () => {};

    let startY = 0;
    let startX = 0;
    let currentY = 0;
    let startTime = 0;
    let isDragging = false;
    let initialSheetHeight = 0;
    let canExpandToFullscreen = false;
    let isTouchOnHandleOrHeader = false;
    let isListeningWindow = false;

    const resetDragStyles = () => {
        isDragging = false;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
        if (backdrop) backdrop.style.opacity = '';
        setTimeout(() => { isModalGestureActive = false; }, 80);
    };

    const removeWindowListeners = () => {
        if (isListeningWindow) {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            isListeningWindow = false;
        }
    };

    const onPointerMove = (e) => {
        if (!isListeningWindow) return;
        currentY = e.clientY;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (Math.abs(deltaY) > 8) {
            isModalGestureActive = true;
        }

        const isFullscreen = sheet.classList.contains('is-fullscreen');

        if (!isDragging && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
            return;
        }

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
        } else if (deltaY > 0) {
            const sheetHeight = sheet.offsetHeight || 380;
            if (isTouchOnHandleOrHeader) {
                if (deltaY > 12) {
                    if (!isDragging) {
                        isDragging = true;
                        sheet.classList.add('is-dragging');
                    }
                    sheet.style.height = '';
                    sheet.style.maxHeight = '';
                    sheet.style.transform = `translateY(${deltaY}px)`;
                    if (backdrop && !isFullscreen) {
                        const opacity = Math.max(0, 1 - (deltaY / (sheetHeight * 0.95)));
                        backdrop.style.opacity = String(opacity);
                    }
                    if (e.cancelable) e.preventDefault();
                }
            } else if (sheet.scrollTop <= 0 && deltaY > 28) {
                if (!isDragging) {
                    isDragging = true;
                    sheet.classList.add('is-dragging');
                }
                sheet.style.height = '';
                sheet.style.maxHeight = '';
                sheet.style.transform = `translateY(${deltaY - 28}px)`;
                if (backdrop && !isFullscreen) {
                    const opacity = Math.max(0, 1 - ((deltaY - 28) / (sheetHeight * 0.95)));
                    backdrop.style.opacity = String(opacity);
                }
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

        if (!isDragging && Math.abs(deltaY) < 12) {
            resetDragStyles();
            return;
        }

        isDragging = false;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';

        if (deltaY < -40 || (velocityY < -0.45 && deltaY < -20)) {
            if (!isFullscreen && canExpandToFullscreen && isTouchOnHandleOrHeader) {
                sheet.classList.add('is-fullscreen');
            }
            setTimeout(() => { isModalGestureActive = false; }, 80);
            return;
        }

        if (isFullscreen) {
            const collapseThreshold = isTouchOnHandleOrHeader ? 70 : 100;
            const isFlick = (velocityY > 0.65 && deltaY >= 35);
            if (deltaY > collapseThreshold || isFlick) {
                sheet.classList.remove('is-fullscreen');
                sheet.scrollTop = 0;
            }
        } else {
            const sheetHeight = sheet.offsetHeight || 380;
            const dismissDistance = Math.max(115, sheetHeight * 0.35);
            const isIntentionalSwipe = (velocityY > 0.65 && deltaY >= 45);
            if (deltaY >= dismissDistance || isIntentionalSwipe) {
                if (backdrop) backdrop.style.opacity = '0';
                if (typeof onClose === 'function') {
                    onClose();
                }
            } else {
                if (backdrop) backdrop.style.opacity = '1';
            }
        }

        setTimeout(() => { isModalGestureActive = false; }, 80);
    };

    const onPointerCancel = () => {
        resetDragStyles();
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        if (e.target.closest('button, a, input, [role="button"]')) return;

        startX = e.clientX;
        startY = e.clientY;
        currentY = e.clientY;
        startTime = Date.now();
        initialSheetHeight = sheet.offsetHeight;
        isModalGestureActive = false;

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

/**
 * Open the PRO Subscription bottom sheet modal
 */
export const openProSubscriptionModal = (options = {}) => {
    const { onSubscribed, onClosed } = options;
    onSubscribedCallback = onSubscribed || null;
    onClosedCallback = onClosed || null;

    const modal = ensureProModalInDOM();
    if (!modal) return;

    previousActiveElement = document.activeElement;

    const sheet = modal.querySelector('.pro-modal-sheet');
    if (sheet) {
        sheet.classList.remove('is-fullscreen');
        sheet.style.transform = '';
        sheet.style.height = '';
        sheet.style.maxHeight = '';
    }

    // Bind Plan Selection Cards
    const planCards = modal.querySelectorAll('.pro-plan-card');
    planCards.forEach((card) => {
        card.onclick = () => {
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
    });

    // Close button & backdrop handlers
    const closeBtn = modal.querySelector('#closeSubscriptionModalBtn');
    if (closeBtn) {
        closeBtn.onclick = () => closeProSubscriptionModal();
    }

    const backdrop = modal.querySelector('.pro-modal-backdrop');
    if (backdrop) {
        backdrop.onclick = () => closeProSubscriptionModal();
    }

    // Activate PRO Subscription Button
    const activateBtn = modal.querySelector('#activateProTrialBtn');
    if (activateBtn) {
        activateBtn.onclick = async () => {
            if (isActivatingPro) return;
            const user = auth.currentUser;
            if (!user) {
                showToast('Silakan login terlebih dahulu');
                return;
            }

            try {
                isActivatingPro = true;
                activateBtn.disabled = true;
                activateBtn.innerHTML = '<span>Mengaktifkan PRO...</span>';

                await setUserPremiumStatus(user.uid, true, {
                    planName: `Spotiwind PRO ${selectedPlanData.name}`,
                    price: selectedPlanData.price,
                    since: Date.now(),
                    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
                });

                closeProSubscriptionModal();
                showToast(`Selamat! Akun Anda kini aktif sebagai Spotiwind PRO 👑`);

                if (typeof onSubscribedCallback === 'function') {
                    onSubscribedCallback({ plan: selectedPlanData });
                }
            } catch (err) {
                console.error("Failed to activate PRO:", err);
                showToast('Gagal mengaktifkan paket, coba lagi');
            } finally {
                isActivatingPro = false;
                activateBtn.disabled = false;
                activateBtn.innerHTML = `
                    <span>Mulai Uji Coba Gratis 7 Hari</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                `;
            }
        };
    }

    // Setup Drag Gestures
    if (cleanupDrag) {
        cleanupDrag();
        cleanupDrag = null;
    }
    cleanupDrag = setupSheetDrag(modal, () => closeProSubscriptionModal());

    // Show modal
    document.body.classList.add('pro-modal-open');
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    void modal.offsetWidth;
    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

/**
 * Close the PRO Subscription modal
 */
export const closeProSubscriptionModal = () => {
    const modal = document.getElementById('proSubscriptionModal');
    if (!modal || modal.classList.contains('hidden')) return;

    if (modal.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        try { previousActiveElement.focus(); } catch {}
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

    if (cleanupDrag) {
        cleanupDrag();
        cleanupDrag = null;
    }

    if (typeof onClosedCallback === 'function') {
        onClosedCallback();
        onClosedCallback = null;
    }

    setTimeout(() => {
        if (!modal.classList.contains('is-active')) {
            modal.classList.add('hidden');
        }
    }, 320);
};

// Global expose for compatibility
if (typeof window !== 'undefined') {
    window.openProSubscriptionModal = openProSubscriptionModal;
    window.closeProSubscriptionModal = closeProSubscriptionModal;
}
