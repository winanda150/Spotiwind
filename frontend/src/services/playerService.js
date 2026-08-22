let currentPlaylist = [];
let currentSongIndex = -1;
let currentSongData = null;
let isShuffle = false;
let isRepeat = false;

const shuffleRemaining = (items) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
};

export const setPlaylist = (playlist = [], startIndex = 0) => {
    currentPlaylist = Array.isArray(playlist) ? playlist : [];
    currentSongIndex = currentPlaylist.length > 0 ? Math.max(0, Math.min(startIndex, currentPlaylist.length - 1)) : -1;
    currentSongData = currentSongIndex >= 0 ? currentPlaylist[currentSongIndex] : null;
    return currentSongData;
};

export const getPlaylist = () => [...currentPlaylist];

export const setContextPlaylist = (playlist = [], selectedSongId = null) => {
    const source = Array.isArray(playlist) ? playlist : [];
    const selected = source.find((song) => String(song.id) === String(selectedSongId));
    const remaining = source.filter((song) => String(song.id) !== String(selectedSongId));
    currentPlaylist = isShuffle && selected ? [selected, ...shuffleRemaining(remaining)] : source;
    currentSongIndex = selected ? 0 : -1;
    currentSongData = selected || null;
    return getPlaybackState();
};

export const syncQueueState = (playlist, song, index) => {
    currentPlaylist = Array.isArray(playlist) ? [...playlist] : [];
    currentSongData = song || null;
    currentSongIndex = Number.isInteger(index) ? index : -1;
    return getPlaybackState();
};

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

export const setPlaybackModes = ({ shuffle = isShuffle, repeat = isRepeat } = {}) => {
    isShuffle = Boolean(shuffle);
    isRepeat = Boolean(repeat);
    return { isShuffle, isRepeat };
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
