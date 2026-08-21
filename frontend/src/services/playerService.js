let currentPlaylist = [];
let currentSongIndex = -1;
let currentSongData = null;
let isShuffle = false;
let isRepeat = false;

export const setPlaylist = (playlist = [], startIndex = 0) => {
    currentPlaylist = Array.isArray(playlist) ? playlist : [];
    currentSongIndex = currentPlaylist.length > 0 ? Math.max(0, Math.min(startIndex, currentPlaylist.length - 1)) : -1;
    currentSongData = currentSongIndex >= 0 ? currentPlaylist[currentSongIndex] : null;
    return currentSongData;
};

export const getPlaylist = () => [...currentPlaylist];

export const setCurrentSong = (song, index = -1) => {
    currentSongData = song;
    if (song && index >= 0) currentSongIndex = index;
    return currentSongData;
};

export const getCurrentSong = () => currentSongData;

export const getCurrentIndex = () => currentSongIndex;

export const nextSong = () => {
    if (!currentPlaylist.length) return null;

    let nextIndex = currentSongIndex + 1;
    if (nextIndex >= currentPlaylist.length) nextIndex = 0;

    currentSongIndex = nextIndex;
    currentSongData = currentPlaylist[nextIndex];
    return currentSongData;
};

export const previousSong = () => {
    if (!currentPlaylist.length) return null;

    let prevIndex = currentSongIndex - 1;
    if (prevIndex < 0) prevIndex = currentPlaylist.length - 1;

    currentSongIndex = prevIndex;
    currentSongData = currentPlaylist[prevIndex];
    return currentSongData;
};

export const playSongByIndex = (index) => {
    if (!currentPlaylist.length || index < 0 || index >= currentPlaylist.length) return null;

    currentSongIndex = index;
    currentSongData = currentPlaylist[index];
    return currentSongData;
};

export const toggleShuffle = () => {
    isShuffle = !isShuffle;
    return isShuffle;
};

export const toggleRepeat = () => {
    isRepeat = !isRepeat;
    return isRepeat;
};

export const getPlaybackState = () => ({
    playlist: [...currentPlaylist],
    currentIndex: currentSongIndex,
    currentSong: currentSongData,
    isShuffle,
    isRepeat
});

export const clearPlaylist = () => {
    currentPlaylist = [];
    currentSongIndex = -1;
    currentSongData = null;
    isShuffle = false;
    isRepeat = false;
};
