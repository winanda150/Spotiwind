/**
 * Spotiwind Offline Audio & File Service
 * Manages CacheStorage for In-App Offline Playback and Device MP3 Export
 */

export const OFFLINE_CACHE_NAME = 'spotiwind-offline-audio-v1';

/**
 * Cache song audio and cover into browser CacheStorage for 100% offline playback
 * @param {Object} song - Song metadata
 * @param {Function} [onProgress] - Optional callback receiving progress percentage (0 - 100)
 * @returns {Promise<boolean>}
 */
export const cacheSongAudio = async (song, onProgress = null) => {
    if (!song || !song.audio) return false;
    if (!('caches' in window)) return false;

    const reportProgress = (pct) => {
        if (typeof onProgress === 'function') {
            try {
                onProgress(Math.max(0, Math.min(100, Math.round(pct))));
            } catch (e) {}
        }
    };

    reportProgress(0);

    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);

        // 1. Fetch & cache cover image concurrently
        if (song.cover && !song.cover.startsWith('data:')) {
            fetch(song.cover)
                .then((res) => {
                    if (res.ok || res.type === 'opaque') {
                        cache.put(song.cover, res.clone()).catch(() => {});
                    }
                })
                .catch(() => {});
        }

        // 2. Fetch audio with real-time byte stream reading
        const res = await fetch(song.audio);
        if (!res.ok && res.type !== 'opaque') {
            throw new Error(`Failed to fetch audio stream: ${res.status}`);
        }

        const contentLength = res.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

        if (res.body && totalBytes > 0) {
            const reader = res.body.getReader();
            let receivedBytes = 0;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedBytes += value.length;
                const percent = Math.round((receivedBytes / totalBytes) * 100);
                reportProgress(percent);
            }

            const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'audio/mpeg' });
            const cachedResponse = new Response(blob, {
                status: 200,
                headers: res.headers
            });
            await cache.put(song.audio, cachedResponse);
        } else {
            // Fallback for chunked streams without content-length header
            reportProgress(20);
            const blob = await res.blob();
            reportProgress(90);
            const cachedResponse = new Response(blob, {
                status: 200,
                headers: res.headers
            });
            await cache.put(song.audio, cachedResponse);
        }

        reportProgress(100);
        return true;
    } catch (error) {
        console.error('Failed to cache song offline:', error);
        reportProgress(0);
        return false;
    }
};

/**
 * Remove a song's audio and cover from browser CacheStorage
 * @param {Object} song - Song metadata
 * @returns {Promise<boolean>}
 */
export const removeSongAudioFromCache = async (song) => {
    if (!song || !song.audio) return false;
    if (!('caches' in window)) return false;

    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        if (song.audio) {
            await cache.delete(song.audio).catch(() => {});
        }
        if (song.cover) {
            await cache.delete(song.cover).catch(() => {});
        }
        return true;
    } catch (error) {
        console.error('Failed to remove song from offline cache:', error);
        return false;
    }
};

/**
 * Retrieve cached audio Blob Object URL for offline playback
 * @param {string} audioUrl - Original audio URL
 * @returns {Promise<string|null>} - Blob URL or null if not cached
 */
export const getCachedAudioBlobUrl = async (audioUrl) => {
    if (!audioUrl || !('caches' in window)) return null;

    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cachedResponse = await cache.match(audioUrl);
        if (cachedResponse) {
            const blob = await cachedResponse.blob();
            return URL.createObjectURL(blob);
        }
        return null;
    } catch (error) {
        console.warn('Error fetching cached audio blob:', error);
        return null;
    }
};

/**
 * Export / Download actual MP3 file directly to user device's storage
 * @param {Object} song - Song metadata
 */
export const downloadMp3ToDevice = async (song) => {
    if (!song || !song.audio) {
        throw new Error('Invalid song audio URL');
    }

    const artistName = (song.artist || 'Spotiwind').replace(/[\\/:*?"<>|]/g, '');
    const songName = (song.name || song.title || 'Track').replace(/[\\/:*?"<>|]/g, '');
    const filename = `${artistName} - ${songName}.mp3`;

    try {
        let blob = null;

        // 1. Try to get from offline cache first (fastest)
        if ('caches' in window) {
            const cache = await caches.open(OFFLINE_CACHE_NAME);
            const cachedResponse = await cache.match(song.audio);
            if (cachedResponse) {
                blob = await cachedResponse.blob();
            }
        }

        // 2. If not in cache, fetch directly
        if (!blob) {
            const response = await fetch(song.audio);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            blob = await response.blob();
        }

        // 3. Trigger native browser file download
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        }, 1200);

        return true;
    } catch (error) {
        console.error('Direct MP3 download to device failed:', error);
        // Fallback: open link in new tab or trigger direct anchor
        const fallbackA = document.createElement('a');
        fallbackA.href = song.audio;
        fallbackA.download = filename;
        fallbackA.target = '_blank';
        fallbackA.click();
        return true;
    }
};
