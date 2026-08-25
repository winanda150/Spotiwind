import { searchCatalogData } from '../../services/searchService.js';
import {
    getRecentSearches,
    saveRecentSearch,
    clearRecentSearches
} from '../../services/recentSearchService.js';
import { subscribePopularSearches, recordSearchSelection } from '../../services/searchPopularityService.js';

export const initSearchPage = ({
    debounce,
    activeAudio,
    getCurrentSongData,
    getSongs,
    getArtists,
    navigateToArtistPage,
    setHomeScrollPosition,
    getLastSearchQuery,
    setLastSearchQuery,
    setSearchPlaylist
}) => {
    const searchInput = document.getElementById('searchInput');
    const searchDropdown = document.getElementById('searchDropdown');
    const clearSearchBtn = document.getElementById('clearSearch');
    const recentSearchesList = document.getElementById('recentSearchesList');
    const clearRecentSearchesBtn = document.getElementById('clearRecentSearches');
    const popularSearchTabs = document.querySelectorAll('[data-popular-tab]');
    const popularSearchContent = document.getElementById('popularSearchContent');
    const popularSearchActiveIndicator = document.querySelector('.popular-search-active-indicator');
    const microphoneButton = document.querySelector('.microphone-btn');

    if (!searchInput || !searchDropdown || !clearSearchBtn || microphoneButton?.dataset.initialized === 'true') {
        return;
    }

    window.handleArtistClick = async (id, name, photo) => {
        await recordSearchSelection('artists', { id, name, photo });
        searchDropdown.classList.remove('active');
        searchInput.blur();
        setHomeScrollPosition(document.documentElement.scrollTop);
        navigateToArtistPage({ id, name, photo });
    };

    window.handleSongSearchClick = async (audio, name, artist, cover, id, duration) => {
        await recordSearchSelection('songs', { id, name, artist, cover, audio, duration });
        window.playFromSearch(audio, name, artist, cover, id);
    };

    window.handleAlbumSearchClick = async (id, name, artist, cover) => {
        await recordSearchSelection('albums', { id, name, artist, cover });
        searchDropdown.classList.remove('active');
    };

    const lastSearchQuery = getLastSearchQuery();
    if (lastSearchQuery) {
        searchInput.value = lastSearchQuery;
        clearSearchBtn.classList.toggle('visible', lastSearchQuery.length > 0);
    }

    let searchAbortController = null;
    let popularSearchData = { songs: [], artists: [], albums: [] };
    let activePopularTab = 'top';

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const renderPopularCards = (items, type) => items.length > 0
        ? items.map((item) => {
            const itemType = item.resultType || type;
            const status = itemType === 'songs' ? 'Song' : itemType === 'artists' ? 'Artist' : 'Album';
            const duration = itemType === 'songs' && item.duration ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` : '';
            const currentSong = getCurrentSongData();
            const isActiveSong = itemType === 'songs' && currentSong && (String(item.id) === String(currentSong.id) || item.audio === currentSong.audio);
            const statusLabel = isActiveSong ? 'Now playing' : status;
            const artistBadge = itemType === 'artists'
                ? '<svg class="popular-search-verified" viewBox="0 0 256 256" aria-label="Verified"><path fill="#0095f6" d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14-3.25 1.36-8.69 1.44-13.94 1.52-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57 1.36 3.27 1.44 8.69 1.52 13.94.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52 3.56 1.47 7.63 5.37 11.57 9.14 6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14 3.27-1.36 8.69-1.44 13.94-1.52 9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94 1.47-3.56 5.37-7.63 9.14-11.57 6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18M173.66 109.66l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32Z"/></svg>'
                : '';
            const subtitle = itemType === 'artists' ? '' : item.artist || '';
            const statusMarkup = itemType === 'songs'
                ? `<span class="popular-search-song-status">Song${duration ? ` - <i>${duration}</i>` : ''}</span>`
                : `<span>${statusLabel}</span>`;
            return `<article class="popular-search-card ${isActiveSong ? 'is-active-song' : ''}" data-id="${escapeHtml(item.id)}" data-audio="${escapeHtml(item.audio)}" data-popular-type="${itemType}" data-popular-id="${escapeHtml(item.id)}"><img class="popular-search-cover" src="${escapeHtml(item.cover || item.photo)}" alt=""><div class="popular-search-info"><div class="popular-search-title-row"><strong>${escapeHtml(item.name)}</strong>${artistBadge}</div>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}<small>${statusMarkup}</small></div><button class="popular-search-menu" type="button" aria-label="More options" title="More options"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg></button></article>`;
        }).join('')
        : '<p class="popular-search-empty">No popular searches yet.</p>';

    const renderPopularSearches = () => {
        if (!popularSearchContent) return;
        const items = activePopularTab === 'top'
            ? [...popularSearchData.songs.map((item) => ({ ...item, resultType: 'songs' })), ...popularSearchData.artists.map((item) => ({ ...item, resultType: 'artists' })), ...popularSearchData.albums.map((item) => ({ ...item, resultType: 'albums' }))].sort((left, right) => (right.searchCount || 0) - (left.searchCount || 0)).slice(0, 9)
            : popularSearchData[activePopularTab];
        popularSearchContent.innerHTML = renderPopularCards(items, activePopularTab);
    };

    const movePopularSearchIndicator = (tab) => {
        if (!tab || !popularSearchActiveIndicator) return;
        popularSearchActiveIndicator.style.width = `${tab.offsetWidth}px`;
        popularSearchActiveIndicator.style.transform = `translateX(${tab.offsetLeft}px)`;
    };

    const popularSearchUnsubscribers = ['songs', 'artists', 'albums'].map((type) => subscribePopularSearches(type, (items) => {
        popularSearchData[type] = items;
        renderPopularSearches();
    }));

    popularSearchTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            activePopularTab = tab.dataset.popularTab;
            movePopularSearchIndicator(tab);
            popularSearchTabs.forEach((item) => {
                const isActive = item === tab;
                item.classList.toggle('is-active', isActive);
                item.setAttribute('aria-selected', String(isActive));
            });
            renderPopularSearches();
        });
    });

    movePopularSearchIndicator(document.querySelector('[data-popular-tab].is-active'));
    window.addEventListener('resize', debounce(() => {
        movePopularSearchIndicator(document.querySelector(`[data-popular-tab="${activePopularTab}"]`));
    }, 150));

    popularSearchContent?.addEventListener('click', (event) => {
        if (event.target.closest('.popular-search-menu')) return;
        const card = event.target.closest('[data-popular-type]');
        if (!card) return;
        const item = popularSearchData[card.dataset.popularType]?.find((entry) => String(entry.id) === card.dataset.popularId);
        if (!item) return;
        if (card.dataset.popularType === 'artists') {
            searchDropdown.classList.remove('active');
            navigateToArtistPage({ id: item.id, name: item.name, photo: item.photo });
        } else if (card.dataset.popularType === 'songs') {
            window.playFromSearch(item.audio, item.name, item.artist, item.cover, item.id);
        }
    });

    const renderRecentSearches = async () => {
        if (!recentSearchesList) return;

        const recentSearches = await getRecentSearches();
        recentSearchesList.innerHTML = recentSearches.length > 0
            ? recentSearches.map((query) => `<button class="recent-search-card" type="button" data-recent-query="${query.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"><span class="recent-search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg></span><span class="recent-search-name">${query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></button>`).join('')
            : '<p class="recent-searches-empty">Your recent searches will appear here.</p>';
    };

    renderRecentSearches();

    recentSearchesList?.addEventListener('click', (event) => {
        const recentCard = event.target.closest('[data-recent-query]');
        if (!recentCard) return;

        const query = recentCard.dataset.recentQuery;
        searchInput.value = query;
        clearSearchBtn.classList.add('visible');
        setLastSearchQuery(query);
        updateSearchDropdownHeight();
        searchDropdown.classList.add('active');
        fetchDropdownResults(query);
    });

    clearRecentSearchesBtn?.addEventListener('click', async () => {
        await clearRecentSearches();
        renderRecentSearches();
    });

    const updateSearchDropdownHeight = () => {
        const heroCard = document.querySelector('.hero-card');
        const searchBox = document.querySelector('.search-box');

        if (!heroCard || !searchBox || !searchDropdown) return;

        if (heroCard) {
            const heroRect = heroCard.getBoundingClientRect();
            const searchRect = searchBox.getBoundingClientRect();
            const distanceToBottom = heroRect.bottom - searchRect.bottom;
            const dropdownStyle = window.getComputedStyle(searchDropdown);
            const marginTop = parseFloat(dropdownStyle.marginTop) || 0;
            searchDropdown.style.setProperty('--search-dropdown-height', `${Math.max(0, distanceToBottom - marginTop)}px`);
        }
    };

    const fetchDropdownResults = async (query) => {
        if (searchAbortController) searchAbortController.abort();
        searchAbortController = new AbortController();
        searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">Searching...</div>';

        try {
            const catalog = await searchCatalogData(query.trim().toLowerCase(), getSongs(), getArtists(), 10);
            const finalItems = [...catalog.artists, ...catalog.songs, ...catalog.albums]
                .sort((left, right) => right.searchRank - left.searchRank)
                .slice(0, 10);
            const fullMappedResults = finalItems.filter((item) => item.type === 'song');

            if (finalItems.length > 0) {
                setSearchPlaylist(fullMappedResults.slice(0, 20));
                const dropdownItems = finalItems.slice(0, 7);
                window.lastSearchResults = dropdownItems.filter((item) => item.type === 'song');

                searchDropdown.innerHTML = dropdownItems.map((item) => {
                    if (item.type === 'artist') {
                        const safeName = item.name.replace(/'/g, "\\'");
                        const safePhoto = item.photo.replace(/'/g, "\\'");
                        return `<div class="dropdown-item dropdown-item-artist" onclick="window.handleArtistClick('${item.id}', '${safeName}', '${safePhoto}')"><div class="dropdown-cover-wrapper"><img src="${item.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div><div class="dropdown-track-info" style="flex: 1; min-width: 0; justify-content: center;"><div class="dropdown-info-name" style="font-size: 0.8rem; font-weight: 600; display: flex; align-items: center;"><span>${item.name}</span><svg xmlns="http://www.w3.org/2000/svg" class="verified-badge-icon" width="1em" height="1em" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="#0095f6" d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57c-1.36-3.27-1.44-8.69-1.52-13.94c-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52c-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14c-3.25 1.36-8.69 1.44-13.94 1.52c-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94c-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57c1.36 3.27 1.44 8.69 1.52 13.94c.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52c3.56 1.47 7.63 5.37 11.57 9.14c6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14c3.27-1.36 8.69-1.44 13.94-1.52c9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94c1.47-3.56 5.37-7.63 9.14-11.57c6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18m-52.2 6.84l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32" /></svg></div><div class="dropdown-artist-label">Artist</div></div></div>`;
                    }

                    if (item.type === 'album') {
                        const safeName = item.name.replace(/'/g, "\\'");
                        const safeArtist = (item.artist || 'Unknown artist').replace(/'/g, "\\'");
                        return `<div class="dropdown-item dropdown-item-album" onclick="window.handleAlbumSearchClick('${item.id}', '${safeName}', '${safeArtist}', '${item.cover}')"><div class="dropdown-cover-wrapper"><img src="${item.cover}" style="width: 100%; height: 100%; object-fit: cover;"></div><div class="dropdown-track-info" style="flex: 1; min-width: 0;"><div class="dropdown-info-name" style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div><div class="dropdown-song-artist" style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.artist || 'Album'}</div></div></div>`;
                    }

                    const song = item;
                    const currentSongData = getCurrentSongData();
                    const normalizeAudio = (audio) => audio?.replace(/^https?:/, '').replace(/\/$/, '');
                    const isActive = currentSongData && (
                        String(song.id) === String(currentSongData.id) ||
                        normalizeAudio(song.audio) === normalizeAudio(currentSongData.audio)
                    );
                    const isPaused = isActive && activeAudio.paused;
                    return `<div class="dropdown-item ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${song.id || ''}" data-audio="${song.audio || ''}" onclick="handleSongSearchClick('${song.audio}', '${song.name.replace(/'/g, "\\'")}', '${song.artist.replace(/'/g, "\\'")}', '${song.cover}', '${song.id}', '${song.duration || 0}')"><div class="dropdown-cover-wrapper"><img src="${song.cover}" style="width: 100%; height: 100%; object-fit: cover;"></div><div class="dropdown-track-info" style="flex: 1; min-width: 0;"><div class="dropdown-info-name" style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; width: 100%;"><span class="dropdown-song-name" style="overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${song.name}</span><div class="equalizer" style="margin-left: auto;"><span></span><span></span><span></span></div></div><div class="dropdown-song-artist" style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.artist}</div></div></div>`;
                }).join('');
            } else {
                searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">No results.</div>';
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">Error.</div>';
        }
    };

    window.addEventListener('resize', debounce(updateSearchDropdownHeight, 250));
    searchInput.addEventListener('input', (event) => {
        const value = event.target.value;
        clearSearchBtn.classList.toggle('visible', value.length > 0);
        setLastSearchQuery(value);
        if (searchAbortController) searchAbortController.abort();
        searchDropdown.classList.remove('active');
    });
    let lastSubmittedQuery = '';
    let lastSubmittedAt = 0;

    const submitSearch = () => {
        const query = searchInput.value.trim();
        if (query.length < 2) return;
        const now = Date.now();
        if (query === lastSubmittedQuery && now - lastSubmittedAt < 500) return;
        lastSubmittedQuery = query;
        lastSubmittedAt = now;

        saveRecentSearch(query);
        renderRecentSearches();
        updateSearchDropdownHeight();
        searchDropdown.classList.add('active');
        fetchDropdownResults(query);
    };

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitSearch();
        }
    });
    searchInput.addEventListener('search', submitSearch);
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        setLastSearchQuery('');
        if (searchAbortController) searchAbortController.abort();
        clearSearchBtn.classList.remove('visible');
        searchDropdown.classList.remove('active');
        searchInput.focus();
    });
    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !searchDropdown.contains(event.target)) {
            searchDropdown.classList.remove('active');
        }
    });

    if (microphoneButton) {
        microphoneButton.dataset.initialized = 'true';
        microphoneButton.addEventListener('click', () => searchInput.focus());
    }
};
