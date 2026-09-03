/**
 * Spotiwind — Made For You Mix Detail Sheet Component
 */

import { audioEngine } from '../../core/audioEngine.js';
import { areSameSongs } from '../../utils/audioUtils.js';
import { PLAY_ICON, PAUSE_ICON } from '../../constants/icons.js';

let activeDetailMix = null;
let isMixDetailTransitioning = false;

export const openMixDetailModal = async (mixId, madeForYouMixes = []) => {
    if (isMixDetailTransitioning) return;
    const modal = document.getElementById('mixDetailModal');
    const header = document.getElementById('mixDetailHeader');
    const tracklist = document.getElementById('mixDetailTracklist');
    if (!modal || !header || !tracklist) return;

    const mixes = (Array.isArray(madeForYouMixes) && madeForYouMixes.length > 0)
        ? madeForYouMixes
        : (window.__spotiwindMadeForYouMixes || []);
    const targetMix = mixes.find(m => String(m.id) === String(mixId)) || activeDetailMix;
    if (!targetMix) return;

    activeDetailMix = targetMix;

    const totalSec = targetMix.songs.reduce((acc, s) => acc + (Number(s.duration) || 0), 0);
    const totalMin = Math.round(totalSec / 60);

    const imgs = targetMix.coverImages || (targetMix.cover ? [targetMix.cover] : []);
    let coverContent;
    if (imgs.length >= 2) {
        const cells = [imgs[0], imgs[1], imgs[2] || imgs[0], imgs[3] || imgs[1]];
        coverContent = `
            <div class="mix-collage">
                ${cells.map(src => `<div class="mix-collage-cell"><img src="${src}" alt="" width="90" height="67" loading="lazy"></div>`).join('')}
            </div>`;
    } else {
        coverContent = `<img src="${imgs[0] || targetMix.cover || '../../public/Elemen/Logo/Spotiwind.webp'}" alt="${targetMix.title}" width="180" height="135" style="width:100%; height:100%; object-fit:cover; aspect-ratio:4/3;" loading="lazy">`;
    }

    header.innerHTML = `
        <div class="mix-detail-header-content">
            <div class="mix-detail-hero-cover-wrapper" style="background: ${targetMix.gradient};">
                ${coverContent}
                <div class="mix-overlay-gradient"></div>
                <div class="mix-color-strip" style="background: ${targetMix.accentColor};"></div>
            </div>
            <span class="mix-detail-hero-badge">${targetMix.tag}</span>
            <h1 class="mix-detail-hero-title">${targetMix.title}</h1>
            <p class="mix-detail-hero-desc">${targetMix.subtitle}</p>
            <div class="mix-detail-hero-meta">
                <span>Spotiwind</span> • <span>${targetMix.songs.length} songs</span> • <span>~${totalMin} min</span>
            </div>
        </div>
    `;

    const state = audioEngine.getState();
    const isMixActive = state.activeMixId ? String(targetMix.id) === String(state.activeMixId) : false;

    tracklist.innerHTML = targetMix.songs.map((song, idx) => {
        const isCurrent = isMixActive && state.currentSong && areSameSongs(state.currentSong, song);
        const isPlaying = isCurrent && state.isPlaying;
        const isPaused = isCurrent && !state.isPlaying;
        const min = Math.floor((song.duration || 0) / 60);
        const sec = String((song.duration || 0) % 60).padStart(2, '0');
        return `
        <div class="mix-track-row ${isCurrent ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" 
             data-song-id="${song.id}"
             data-song-audio="${song.audio}"
             data-song-name="${song.name}"
             data-song-artist="${song.artist}"
             data-song-cover="${song.cover}"
             data-song-duration="${song.duration || 0}"
             data-mix-id="${targetMix.id}"
             data-song-idx="${idx}">
            <span class="mix-track-idx">${idx + 1}</span>
            <div class="mix-track-cover-wrapper">
                <img src="${song.cover}" alt="${song.name}" class="mix-track-cover" width="44" height="44" loading="lazy">
                <div class="mix-track-play-icon" aria-hidden="true">
                    ${isCurrent && isPlaying ? PAUSE_ICON : PLAY_ICON}
                </div>
            </div>
            <div class="mix-track-info">
                <h4 class="mix-track-name">${song.name}</h4>
                <p class="mix-track-artist">${song.artist}</p>
            </div>
            <span class="mix-track-duration">${min}:${sec}</span>
        </div>`;
    }).join('');

    isMixDetailTransitioning = true;
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        appContainer.style.opacity = '0';
        await new Promise(res => setTimeout(res, 200));
    }

    modal.style.transition = 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s';
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    document.body.classList.add('mix-detail-open');
    document.body.style.overflow = 'hidden';
    
    if (appContainer) {
        // Prepare home page underneath so it's ready when modal fades out
        appContainer.style.opacity = '1';
    }
    isMixDetailTransitioning = false;

    const closeBtn = modal.querySelector('#closeMixDetailBtn');
    if (closeBtn) closeBtn.focus();
    const shuffleBtn = modal.querySelector('#mixDetailShuffleBtn');
    if (shuffleBtn) {
        const isShuffle = typeof window.getPlaybackShuffle === 'function'
            ? window.getPlaybackShuffle()
            : Boolean(window.__spotiwindIsShuffle);
        shuffleBtn.classList.toggle('is-active', isShuffle);
    }

    if (typeof window.syncActiveSongUI === 'function') {
        window.syncActiveSongUI();
    }
};

export const closeMixDetailModal = async () => {
    if (isMixDetailTransitioning) return;
    const modal = document.getElementById('mixDetailModal');
    if (!modal) return;
    document.activeElement?.blur();
    
    isMixDetailTransitioning = true;
    const appContainer = document.querySelector('.app-container');
    
    if (appContainer) {
        // Fade both modal and background out to black
        appContainer.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        appContainer.style.opacity = '0';
        modal.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.2s';
        modal.classList.add('hidden');
        await new Promise(res => setTimeout(res, 200));
        
        modal.setAttribute('inert', '');
        document.body.classList.remove('mix-detail-open');
        document.body.style.overflow = '';
        
        // Fade home page back in
        appContainer.style.opacity = '1';
    } else {
        modal.classList.add('hidden');
        modal.setAttribute('inert', '');
        document.body.classList.remove('mix-detail-open');
        document.body.style.overflow = '';
    }
    isMixDetailTransitioning = false;
};

/**
 * Force-close the mix detail modal instantly without transition or guard.
 * Use this when navigating away from the page (bottom nav, sidebar nav)
 * to avoid async transition conflicts with the page loader.
 */
export const forceCloseMixDetailModal = () => {
    isMixDetailTransitioning = false; // Reset guard to prevent deadlock
    const modal = document.getElementById('mixDetailModal');
    if (!modal) return;
    modal.style.transition = 'none';
    modal.style.opacity = '0';
    modal.classList.add('hidden');
    modal.setAttribute('inert', '');
    document.body.classList.remove('mix-detail-open');
    document.body.style.overflow = '';
    // Clean up inline styles after a tick
    requestAnimationFrame(() => {
        modal.style.transition = '';
        modal.style.opacity = '';
    });
};

export const initMixDetailSheet = () => {
    window.openMixDetailModal = openMixDetailModal;
    window.closeMixDetailModal = closeMixDetailModal;
    window.forceCloseMixDetailModal = forceCloseMixDetailModal;
};
