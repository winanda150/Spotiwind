/**
 * Spotiwind — Core Audio Engine (Singleton)
 * Framework-agnostic audio playback controller with queue management,
 * offline blob resolution, MediaSession API, and event pub/sub.
 */

import { areSameSongs, normalizeAudio } from '../utils/audioUtils.js';
import { getCachedAudioBlobUrl } from '../services/offlineAudioService.js';
import { recordRecentlyPlayed } from '../services/recentlyPlayedService.js';
import { recordTrackPlay } from '../services/popularTrackService.js';
import { recordArtistPlay } from '../services/topArtistService.js';
import { updateMyActivity } from '../services/activityService.js';

class AudioEngine {
    constructor() {
        if (AudioEngine.instance) {
            return AudioEngine.instance;
        }
        AudioEngine.instance = this;

        this.audio = new Audio();
        this.currentSong = null;
        this.currentPlaylist = [];
        this.unshuffledPlaylist = [];
        this.currentIndex = -1;
        this.currentContext = null;
        this.activeMixId = null;

        this.isPlaying = false;
        this.isShuffle = false;
        this.isRepeat = false;
        this.isDragging = false;
        this.volume = 1.0;

        this.listeners = new Set();
        this.activityUpdateTimeout = null;
        this.lastRecordedSongKey = '';

        this._setupAudioListeners();
        this._setupMediaSession();
    }

    /**
     * Subscribe to player events
     * @param {Function} callback - fn(eventType, state, payload)
     * @returns {Function} unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _notify(event, payload = {}) {
        const state = this.getState();
        this.listeners.forEach((cb) => {
            try {
                cb(event, state, payload);
            } catch (err) {
                console.error(`AudioEngine listener error on [${event}]:`, err);
            }
        });
    }

    getState() {
        return {
            currentSong: this.currentSong,
            isPlaying: this.isPlaying,
            currentTime: this.audio.currentTime || 0,
            duration: this.audio.duration || 0,
            volume: this.audio.volume,
            isShuffle: this.isShuffle,
            isRepeat: this.isRepeat,
            isDragging: this.isDragging,
            currentPlaylist: [...this.currentPlaylist],
            currentIndex: this.currentIndex,
            context: this.currentContext,
            activeMixId: this.activeMixId
        };
    }

    _setupAudioListeners() {
        const audio = this.audio;

        audio.addEventListener('play', () => {
            this.isPlaying = true;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            this._notify('play');
        });

        audio.addEventListener('pause', () => {
            this.isPlaying = false;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            this._notify('pause');
        });

        audio.addEventListener('timeupdate', () => {
            if (!this.isDragging) {
                this._notify('timeupdate', {
                    currentTime: audio.currentTime,
                    duration: audio.duration || 0,
                    percent: audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
                });
            }
        });

        audio.addEventListener('loadedmetadata', () => {
            this._notify('loadedmetadata', {
                duration: audio.duration || 0
            });
        });

        audio.addEventListener('waiting', () => {
            this._notify('waiting');
        });

        audio.addEventListener('playing', () => {
            this._notify('playing');
        });

        audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this._notify('ended');
            if (this.isRepeat) {
                this.playSong(this.currentSong, this.currentPlaylist, this.currentContext, this.activeMixId);
            } else if (this.currentPlaylist.length > 0) {
                this.next();
            }
        });

        audio.addEventListener('error', (e) => {
            this.isPlaying = false;
            console.error('Audio playback error:', e);
            this._notify('error', { error: e });
        });
    }

    _setupMediaSession() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
        try {
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined && this.audio.duration) {
                    this.seek(details.seekTime);
                }
            });
        } catch (e) {}
    }

    _updateMediaMetadata(song) {
        if (!('mediaSession' in navigator) || !song) return;

        const cover = song.cover || song.coverUrl || '../../public/Elemen/Logo/Spotiwind.webp';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.name || song.title || 'Untitled Track',
            artist: song.artist || song.artist_name || 'Unknown Artist',
            album: 'Spotiwind',
            artwork: [
                { src: cover, sizes: '96x96', type: 'image/webp' },
                { src: cover, sizes: '128x128', type: 'image/webp' },
                { src: cover, sizes: '256x256', type: 'image/webp' },
                { src: cover, sizes: '512x512', type: 'image/webp' }
            ]
        });
    }

    _recordPlayback(song) {
        if (!song) return;
        try {
            recordRecentlyPlayed(song);
            recordTrackPlay(song);
            recordArtistPlay(song);
        } catch (e) {
            console.warn('Error recording song analytics:', e);
        }

        // Debounce activity record (5s)
        const songKey = String(song.name || song.title || '').trim().toLowerCase();
        if (songKey && songKey !== this.lastRecordedSongKey) {
            if (this.activityUpdateTimeout) clearTimeout(this.activityUpdateTimeout);
            this.activityUpdateTimeout = setTimeout(async () => {
                try {
                    await updateMyActivity(song.name || song.title || '');
                    this.lastRecordedSongKey = songKey;
                } catch (err) {
                    console.error('Failed to update activity to Firestore:', err);
                }
            }, 5000);
        }
    }

    /**
     * Play a specific song and optionally update the queue context
     */
    async playSong(song, playlist = null, context = null, mixId = null) {
        if (!song || (!song.audio && !song.audioUrl && !song.songAudio)) {
            console.warn('playSong called with empty audio URL', song);
            return;
        }

        const songId = String(song.id || song.songId || '');
        const rawAudioUrl = song.audio || song.audioUrl || song.songAudio;
        const normalizedSong = {
            id: songId,
            name: song.name || song.title || 'Untitled Track',
            artist: song.artist || song.artist_name || 'Unknown Artist',
            cover: song.cover || song.coverUrl || '../../public/Elemen/Logo/Spotiwind.webp',
            audio: rawAudioUrl,
            duration: Number(song.duration) || 0
        };

        // If a new playlist was provided or context changed, rebuild queue
        if (Array.isArray(playlist) && playlist.length > 0) {
            this.unshuffledPlaylist = [...playlist];
            if (this.isShuffle) {
                const current = this.unshuffledPlaylist.find(s => areSameSongs(s, normalizedSong));
                const others = this.unshuffledPlaylist.filter(s => !areSameSongs(s, normalizedSong));
                for (let i = others.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [others[i], others[j]] = [others[j], others[i]];
                }
                this.currentPlaylist = current ? [current, ...others] : others;
            } else {
                this.currentPlaylist = [...playlist];
            }
        } else if (!this.currentPlaylist.some(s => areSameSongs(s, normalizedSong))) {
            this.currentPlaylist = [normalizedSong];
            this.unshuffledPlaylist = [normalizedSong];
        }

        this.currentIndex = this.currentPlaylist.findIndex(s => areSameSongs(s, normalizedSong));
        this.currentSong = normalizedSong;
        this.currentContext = context || this.currentContext;
        this.activeMixId = mixId !== undefined ? mixId : this.activeMixId;

        this._updateMediaMetadata(normalizedSong);
        this._recordPlayback(normalizedSong);

        // Check if cached offline in Cache Storage
        let playbackUrl = rawAudioUrl;
        try {
            const cachedBlobUrl = await getCachedAudioBlobUrl(songId);
            if (cachedBlobUrl) {
                playbackUrl = cachedBlobUrl;
            }
        } catch (e) {
            console.warn('Could not read cached audio:', e);
        }

        const isSameSource = isSameAudio(this.audio.src, playbackUrl);
        if (!isSameSource || !this.audio.src) {
            this.audio.src = playbackUrl;
        }

        this._notify('songchange', { song: normalizedSong });

        try {
            await this.audio.play();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Audio playback failed:', err);
                this._notify('error', { error: err });
            }
        }
    }

    async togglePlayPause() {
        if (this.audio.src && this.audio.src !== '') {
            try {
                if (this.audio.paused) {
                    await this.audio.play();
                } else {
                    this.audio.pause();
                }
            } catch (err) {
                console.error('Toggle play error:', err);
            }
        } else if (this.currentPlaylist.length > 0) {
            this.playSong(this.currentPlaylist[0], this.currentPlaylist, this.currentContext, this.activeMixId);
        }
    }

    async play() {
        if (this.audio.src) {
            try {
                await this.audio.play();
            } catch (err) {
                console.error('Play error:', err);
            }
        }
    }

    pause() {
        if (this.audio.src) {
            this.audio.pause();
        }
    }

    next() {
        if (!this.currentPlaylist.length) return;
        let nextIdx = this.currentIndex + 1;
        if (nextIdx >= this.currentPlaylist.length) nextIdx = 0;
        const nextSong = this.currentPlaylist[nextIdx];
        if (nextSong) {
            this.playSong(nextSong, this.currentPlaylist, this.currentContext, this.activeMixId);
        }
    }

    previous() {
        if (!this.currentPlaylist.length) return;
        let prevIdx = this.currentIndex - 1;
        if (prevIdx < 0) prevIdx = this.currentPlaylist.length - 1;
        const prevSong = this.currentPlaylist[prevIdx];
        if (prevSong) {
            this.playSong(prevSong, this.currentPlaylist, this.currentContext, this.activeMixId);
        }
    }

    seek(timeInSeconds) {
        if (!this.audio.duration || isNaN(this.audio.duration)) return;
        const target = Math.max(0, Math.min(this.audio.duration, timeInSeconds));
        this.audio.currentTime = target;
        this._notify('timeupdate', {
            currentTime: target,
            duration: this.audio.duration,
            percent: (target / this.audio.duration) * 100
        });
    }

    seekByPercent(percent) {
        if (!this.audio.duration || isNaN(this.audio.duration)) return;
        const clamped = Math.max(0, Math.min(100, percent));
        const target = (clamped / 100) * this.audio.duration;
        this.seek(target);
    }

    setVolume(value) {
        const clamped = Math.max(0, Math.min(1, value));
        this.audio.volume = clamped;
        this.volume = clamped;
        this._notify('volumechange', { volume: clamped });
    }

    setShuffle(enabled) {
        this.isShuffle = Boolean(enabled);
        if (this.isShuffle) {
            this.isRepeat = false;
            if (this.unshuffledPlaylist.length > 1 && this.currentSong) {
                const current = this.unshuffledPlaylist.find(s => areSameSongs(s, this.currentSong));
                const others = this.unshuffledPlaylist.filter(s => !areSameSongs(s, this.currentSong));
                for (let i = others.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [others[i], others[j]] = [others[j], others[i]];
                }
                this.currentPlaylist = current ? [current, ...others] : others;
                this.currentIndex = 0;
            }
        } else {
            this.currentPlaylist = [...this.unshuffledPlaylist];
            this.currentIndex = this.currentPlaylist.findIndex(s => areSameSongs(s, this.currentSong));
        }
        this._notify('modechange', { isShuffle: this.isShuffle, isRepeat: this.isRepeat });
    }

    toggleShuffle() {
        this.setShuffle(!this.isShuffle);
        return this.isShuffle;
    }

    setRepeat(enabled) {
        this.isRepeat = Boolean(enabled);
        if (this.isRepeat) {
            this.isShuffle = false;
        }
        this._notify('modechange', { isShuffle: this.isShuffle, isRepeat: this.isRepeat });
    }

    toggleRepeat() {
        this.setRepeat(!this.isRepeat);
        return this.isRepeat;
    }

    setDragging(isDragging) {
        this.isDragging = Boolean(isDragging);
    }

    setQueue(playlist) {
        this.unshuffledPlaylist = Array.isArray(playlist) ? [...playlist] : [];
        this.currentPlaylist = [...this.unshuffledPlaylist];
        if (this.currentSong) {
            this.currentIndex = this.currentPlaylist.findIndex(s => areSameSongs(s, this.currentSong));
        }
        this._notify('queuechange', { playlist: this.currentPlaylist });
    }
}

export const audioEngine = new AudioEngine();
export default audioEngine;
