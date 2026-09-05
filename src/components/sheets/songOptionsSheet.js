/**
 * Spotiwind — Song Options & Download Actions Sheet Component
 */

import { auth } from '../../assets/js/firebase-config.js';
import { cacheSongAudio, removeSongAudioFromCache, downloadMp3ToDevice } from '../../services/offlineAudioService.js';
import { getProfileByUid } from '../../services/profileService.js';
import { showToast } from '../../utils/domUtils.js';
import { openProSubscriptionModal } from '../modals/proSubscriptionModal.js';

export const isSongDownloaded = (songId) => {
    if (!songId) return false;
    try {
        const saved = JSON.parse(localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]');
        return Array.isArray(saved) && saved.some(s => String(s.id) === String(songId));
    } catch {
        return false;
    }
};

export const toggleDownloadSong = async (song) => {
    const user = auth.currentUser;
    if (!user) {
        showToast("Silakan login terlebih dahulu untuk mengunduh lagu.");
        if (typeof window.navigateToAuthPage === 'function') {
            window.navigateToAuthPage('login');
        }
        return false;
    }

    if (!song || !song.id) {
        showToast("Lagu tidak valid untuk diunduh.");
        return false;
    }

    try {
        const raw = localStorage.getItem('downloaded_songs') || localStorage.getItem('spotiwind_downloads') || '[]';
        let list = JSON.parse(raw);
        if (!Array.isArray(list)) list = [];

        const index = list.findIndex(s => String(s.id) === String(song.id));
        const isAlreadyDownloaded = index > -1;

        if (isAlreadyDownloaded) {
            list.splice(index, 1);
            localStorage.setItem('downloaded_songs', JSON.stringify(list));
            await removeSongAudioFromCache(song);
            if (typeof window.updateSidebarMusicCounts === 'function') {
                window.updateSidebarMusicCounts();
            }
            showToast(`Menghapus "${song.name || song.title || 'Lagu'}" dari unduhan.`);
            window.dispatchEvent(new CustomEvent('downloads-updated', { detail: { list } }));
            return false;
        }

        // Check if user is PRO
        let isPro = false;
        if (user.uid) {
            try {
                const profile = await getProfileByUid(user.uid);
                if (profile?.isPremium === true) {
                    isPro = true;
                }
            } catch (err) {
                console.warn("Check user premium status on download:", err);
            }
        }

        if (!isPro) {
            showToast("Fitur Download Offline eksklusif untuk pelanggan Spotiwind PRO.");
            if (typeof openProSubscriptionModal === 'function') {
                openProSubscriptionModal();
            } else if (typeof window.openProSubscriptionModal === 'function') {
                window.openProSubscriptionModal();
            }
            return false;
        }

        const newDownloadItem = {
            id: String(song.id),
            name: song.name || song.title || 'Unknown Track',
            artist: song.artist || 'Unknown Artist',
            cover: song.cover || '',
            audio: song.audio || '',
            duration: song.duration || 0,
            downloadStatus: 'downloading',
            downloadProgress: 10,
            isCachedOffline: false,
            downloadedAt: Date.now()
        };

        list.unshift(newDownloadItem);
        localStorage.setItem('downloaded_songs', JSON.stringify(list));
        if (typeof window.updateSidebarMusicCounts === 'function') {
            window.updateSidebarMusicCounts();
        }
        window.dispatchEvent(new CustomEvent('downloads-updated', { detail: { list } }));

        showToast(`Mengunduh "${song.name || song.title || 'Lagu'}" untuk pemutaran offline...`);

        const success = await cacheSongAudio(song, (progress) => {
            newDownloadItem.downloadProgress = progress;
            if (progress >= 100) {
                newDownloadItem.downloadStatus = 'completed';
                newDownloadItem.isCachedOffline = true;
            }
            localStorage.setItem('downloaded_songs', JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('download-progress', {
                detail: { songId: String(song.id), progress, status: newDownloadItem.downloadStatus }
            }));
        });

        if (success) {
            newDownloadItem.downloadStatus = 'completed';
            newDownloadItem.downloadProgress = 100;
            newDownloadItem.isCachedOffline = true;
            localStorage.setItem('downloaded_songs', JSON.stringify(list));
            if (typeof window.updateSidebarMusicCounts === 'function') {
                window.updateSidebarMusicCounts();
            }
            showToast(`Berhasil mengunduh "${song.name || song.title || 'Lagu'}" untuk didengarkan offline.`);
            window.dispatchEvent(new CustomEvent('download-progress', {
                detail: { songId: String(song.id), progress: 100, status: 'completed' }
            }));
            window.dispatchEvent(new CustomEvent('downloads-updated', { detail: { list } }));
            return true;
        } else {
            showToast("Gagal mengunduh audio lagu.");
            return false;
        }
    } catch (e) {
        console.error("Error toggling download:", e);
        showToast("Gagal memperbarui unduhan.");
        return false;
    }
};

export const initSongOptionsSheet = () => {
    window.isSongDownloaded = isSongDownloaded;
    window.toggleDownloadSong = toggleDownloadSong;
    window.downloadMp3ToDevice = downloadMp3ToDevice;
};
