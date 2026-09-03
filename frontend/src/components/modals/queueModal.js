/**
 * Spotiwind — Up Next / Queue Modal & Sidebar Component
 */

import { audioEngine } from '../../core/audioEngine.js';
import { formatTime } from '../../utils/formatters.js';

let isTransitioningUpNext = false;

export const renderUpNextQueue = (containerId = 'upNextList', customState = null) => {
    const listContainer = document.getElementById(containerId);
    if (!listContainer) return;

    const engineState = (typeof audioEngine !== 'undefined' && audioEngine.getState) ? audioEngine.getState() : {};
    
    const currentPlaylist = customState?.currentPlaylist 
        || (window.__spotiwindCurrentPlaylist && window.__spotiwindCurrentPlaylist.length > 0 ? window.__spotiwindCurrentPlaylist : null)
        || (Array.isArray(window.currentPlaylist) && window.currentPlaylist.length > 0 ? window.currentPlaylist : null)
        || (engineState.currentPlaylist && engineState.currentPlaylist.length > 0 ? engineState.currentPlaylist : null)
        || [];

    const currentIndex = customState?.currentIndex 
        ?? (window.__spotiwindCurrentIndex !== undefined && window.__spotiwindCurrentIndex !== -1 
            ? window.__spotiwindCurrentIndex 
            : (window.currentSongIndex !== undefined ? window.currentSongIndex : (engineState.currentIndex ?? -1)));

    const currentSong = customState?.currentSong 
        || window.__spotiwindCurrentSong 
        || window.currentSongData 
        || engineState.currentSong;

    const context = customState?.context 
        || window.__spotiwindContext 
        || window.activePlaylistContext 
        || engineState.context 
        || '';

    const activeMixId = customState?.activeMixId 
        || window.__spotiwindActiveMixId 
        || window.activeMixId 
        || engineState.activeMixId 
        || '';

    if (!currentPlaylist || currentPlaylist.length === 0 || currentIndex === -1) {
        listContainer.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">No upcoming songs</p>';
        return;
    }

    const nextSongs = [];
    const maxItems = Math.min(currentPlaylist.length, 5);
    const seenIds = new Set();

    for (let i = 0; i < currentPlaylist.length && nextSongs.length < maxItems; i++) {
        const idx = (currentIndex + i) % currentPlaylist.length;
        const song = currentPlaylist[idx];
        if (song && !seenIds.has(song.id || song.audio)) {
            nextSongs.push({ ...song, originalIndex: idx });
            seenIds.add(song.id || song.audio);
        }
    }

    const html = nextSongs.map((song, idx) => {
        const isActive = idx === 0;
        const safeTitle = (song.name || song.title || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeArtist = (song.artist || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");

        return `
        <div class="up-next-item ${isActive ? 'active' : ''}" 
            style="animation-delay: ${idx * 0.05}s; view-transition-name: up-next-item-${song.id};" 
            onclick="window.playPreview(null, '${song.audio}', '${safeTitle}', '${safeArtist}', '${song.cover}', '${song.id}', ${song.duration || 0}, '${context || ''}', null, '${activeMixId || ''}')">
            <img src="${song.cover}" class="up-next-cover" alt="${song.name || song.title}">
            <div class="up-next-info">
                <div class="up-next-name">${song.name || song.title}</div>
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
    `;
    }).join('');

    if (document.startViewTransition && !isTransitioningUpNext && !document.hidden) {
        isTransitioningUpNext = true;
        try {
            const transition = document.startViewTransition(() => {
                listContainer.innerHTML = html;
            });
            transition.finished.finally(() => {
                isTransitioningUpNext = false;
            });
        } catch (e) {
            isTransitioningUpNext = false;
            listContainer.innerHTML = html;
        }
    } else {
        listContainer.innerHTML = html;
    }
};

export const initQueueModal = () => {
    // Re-render up-next on player queue change
    audioEngine.subscribe((event) => {
        if (event === 'songchange' || event === 'queuechange' || event === 'play' || event === 'pause') {
            renderUpNextQueue('upNextList');
        }
    });

    window.renderUpNext = () => renderUpNextQueue('upNextList');
};
