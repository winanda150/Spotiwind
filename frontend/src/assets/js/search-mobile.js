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
    setSearchPlaylist,
    setPopularPlaylist
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
        // Hanya beri ranking jika lagu berbeda atau lagu yang sama sudah selesai
        if (canRecordRanking(id)) {
            lastRankedSongId = String(id);
            await recordSearchSelection('songs', { id, name, artist, cover, audio, duration });
        }
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
    // Guard: menyimpan ID lagu terakhir yang sudah diberi ranking dalam sesi ini
    // Ranking baru hanya diberikan jika lagu berbeda ATAU lagu yang sama sudah selesai (ended)
    let lastRankedSongId = null;

    const canRecordRanking = (songId) => {
        const currentSong = getCurrentSongData();
        const isSameSong = currentSong && (String(currentSong.id) === String(songId));
        // Jika lagu yang sama masih diputar (belum ended) → JANGAN beri ranking lagi
        if (isSameSong && activeAudio && !activeAudio.ended && lastRankedSongId === String(songId)) {
            return false;
        }
        return true;
    };

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const renderPopularCards = (items, type) => items.length > 0
        ? items.map((item, index) => {
            const rank = index + 1;
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
            // Badge nomor urut ranking: #1 berwarna emas, #2 perak, #3 perunggu, sisanya abu
            const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : 'rank-default';
            return `<article class="popular-search-card ${isActiveSong ? 'is-active-song' : ''}" data-id="${escapeHtml(item.id)}" data-audio="${escapeHtml(item.audio)}" data-popular-type="${itemType}" data-popular-id="${escapeHtml(item.id)}"><span class="popular-search-rank ${rankClass}">${rank}</span><img class="popular-search-cover" src="${escapeHtml(item.cover || item.photo)}" alt=""><div class="popular-search-info"><div class="popular-search-title-row"><strong>${escapeHtml(item.name)}</strong>${artistBadge}</div>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}<small>${statusMarkup}</small></div><button class="popular-search-menu" type="button" aria-label="More options" title="More options"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg></button></article>`;
        }).join('')
        : '<p class="popular-search-empty">No popular searches yet.</p>';

    const sortPopularItems = (list = []) => {
        return [...list].sort((left, right) => {
            const countLeft = Number(left.searchCount) || 0;
            const countRight = Number(right.searchCount) || 0;
            // 1. Urutkan dari jumlah pencarian terbanyak ke tersedikit (descending)
            if (countRight !== countLeft) {
                return countRight - countLeft;
            }
            // 2. Jika jumlah pencarian sama, item yang dicapai lebih awal tetap di atas, yang baru mulai nilai 1 berada di bawah
            const timeLeft = left.updatedAt?.toMillis ? left.updatedAt.toMillis() : (typeof left.updatedAt?.seconds === 'number' ? left.updatedAt.seconds * 1000 : 0);
            const timeRight = right.updatedAt?.toMillis ? right.updatedAt.toMillis() : (typeof right.updatedAt?.seconds === 'number' ? right.updatedAt.seconds * 1000 : 0);
            return timeLeft - timeRight;
        });
    };

    const renderPopularSearches = () => {
        if (!popularSearchContent) return;
        let items;
        if (activePopularTab === 'top') {
            // Gabungkan semua kategori, urutkan dari searchCount terbesar ke terkecil, ambil 10 teratas
            items = sortPopularItems([
                ...popularSearchData.songs.map((item) => ({ ...item, resultType: 'songs' })),
                ...popularSearchData.artists.map((item) => ({ ...item, resultType: 'artists' })),
                ...popularSearchData.albums.map((item) => ({ ...item, resultType: 'albums' }))
            ]).slice(0, 10);
        } else {
            // Tab individual: urutkan dari searchCount terbesar ke terkecil, ambil 10 teratas
            items = sortPopularItems([...popularSearchData[activePopularTab]]).slice(0, 10);
        }
        // Sinkron daftar LAGU yang sedang ditampilkan ke buffer popularPlaylist
        // agar Up Next terisi saat user memutar lagu dari Popular Searches
        const songItems = items.filter((item) => (item.resultType || activePopularTab) === 'songs');
        if (typeof setPopularPlaylist === 'function') {
            setPopularPlaylist(songItems.map((s) => ({
                id: s.id,
                audio: s.audio,
                name: s.name,
                artist: s.artist || '',
                cover: s.cover || '',
                duration: s.duration || 0
            })));
        }
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

    // Popular Searches cards: hanya play/navigate, TIDAK memberikan ranking
    // Ranking hanya diberikan saat memilih dari dropdown pencarian (handleSongSearchClick, handleArtistClick, handleAlbumSearchClick)
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
            // Gunakan context 'popular' agar Up Next terisi dari lagu-lagu Popular Searches
            const isSameActiveSong = getCurrentSongData() &&
                String(getCurrentSongData().id) === String(item.id) &&
                activeAudio && activeAudio.src;
            window.playPreview(
                null,
                item.audio,
                item.name,
                item.artist,
                item.cover,
                item.id,
                item.duration || 0,
                isSameActiveSong ? null : 'popular'
            );
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

    const fetchDropdownResults = async (query, autoPlay = false) => {
        if (searchAbortController) searchAbortController.abort();
        searchAbortController = new AbortController();
        searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">Searching...</div>';

        try {
            const catalog = await searchCatalogData(query.trim().toLowerCase(), getSongs(), getArtists(), 15);
            const finalItems = [...catalog.artists, ...catalog.songs, ...catalog.albums]
                .sort((left, right) => right.searchRank - left.searchRank)
                .slice(0, 15);
            const fullMappedResults = finalItems.filter((item) => item.type === 'song');

            if (finalItems.length > 0) {
                setSearchPlaylist(fullMappedResults.slice(0, 30));
                const dropdownItems = finalItems.slice(0, 8);
                window.lastSearchResults = dropdownItems.filter((item) => item.type === 'song');

                searchDropdown.innerHTML = dropdownItems.map((item) => {
                    if (item.type === 'artist') {
                        const safeName = item.name.replace(/'/g, "\\'");
                        const safePhoto = item.photo.replace(/'/g, "\\'");
                        return `<div class="dropdown-item dropdown-item-artist" onclick="window.handleArtistClick('${item.id}', '${safeName}', '${safePhoto}')"><div class="dropdown-cover-wrapper"><img src="${item.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div><div class="dropdown-track-info" style="flex: 1; min-width: 0; justify-content: center;"><div class="dropdown-info-name" style="font-size: 0.85rem; font-weight: 600; display: flex; align-items: center;"><span>${item.name}</span><svg xmlns="http://www.w3.org/2000/svg" class="verified-badge-icon" width="1em" height="1em" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="#0095f6" d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57c-1.36-3.27-1.44-8.69-1.52-13.94c-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52c-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14c-3.25 1.36-8.69 1.44-13.94 1.52c-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57c1.36 3.27 1.44 8.69 1.52 13.94c.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52c3.56 1.47 7.63 5.37 11.57 9.14c6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14c3.27-1.36 8.69-1.44 13.94-1.52c9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94c1.47-3.56 5.37-7.63 9.14-11.57c6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18m-52.2 6.84l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32" /></svg></div><div class="dropdown-artist-label">Artist</div></div></div>`;
                    }

                    if (item.type === 'album') {
                        const safeName = item.name.replace(/'/g, "\\'");
                        const safeArtist = (item.artist || 'Unknown artist').replace(/'/g, "\\'");
                        return `<div class="dropdown-item dropdown-item-album" onclick="window.handleAlbumSearchClick('${item.id}', '${safeName}', '${safeArtist}', '${item.cover}')"><div class="dropdown-cover-wrapper"><img src="${item.cover}" style="width: 100%; height: 100%; object-fit: cover;"></div><div class="dropdown-track-info" style="flex: 1; min-width: 0;"><div class="dropdown-info-name" style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div><div class="dropdown-song-artist" style="font-size: 0.76rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.artist || 'Album'}</div></div></div>`;
                    }

                    const song = item;
                    const currentSongData = getCurrentSongData();
                    const normalizeAudio = (audio) => audio?.replace(/^https?:/, '').replace(/\/$/, '');
                    const isActive = currentSongData && (
                        String(song.id) === String(currentSongData.id) ||
                        normalizeAudio(song.audio) === normalizeAudio(currentSongData.audio)
                    );
                    const isPaused = isActive && activeAudio.paused;
                    return `<div class="dropdown-item ${isActive ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${song.id || ''}" data-audio="${song.audio || ''}" onclick="handleSongSearchClick('${song.audio}', '${song.name.replace(/'/g, "\\'")}', '${song.artist.replace(/'/g, "\\'")}', '${song.cover}', '${song.id}', '${song.duration || 0}')"><div class="dropdown-cover-wrapper"><img src="${song.cover}" style="width: 100%; height: 100%; object-fit: cover;"></div><div class="dropdown-track-info" style="flex: 1; min-width: 0;"><div class="dropdown-info-name" style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; width: 100%;"><span class="dropdown-song-name" style="overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${song.name}</span><div class="equalizer" style="margin-left: auto;"><span></span><span></span><span></span></div></div><div class="dropdown-song-artist" style="font-size: 0.76rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.artist}</div></div></div>`;
                }).join('');

                // Auto-play lagu teratas jika perintah suara mengandung perintah putar (playIntent)
                if (autoPlay && fullMappedResults.length > 0) {
                    const topSong = fullMappedResults[0];
                    if (topSong && topSong.audio && typeof window.handleSongSearchClick === 'function') {
                        window.handleSongSearchClick(
                            topSong.audio,
                            topSong.name,
                            topSong.artist || '',
                            topSong.cover || '',
                            topSong.id,
                            topSong.duration || 0
                        );
                    }
                }
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

    const submitSearch = (autoPlay = false) => {
        const query = searchInput.value.trim();
        if (query.length < 2) return;
        const now = Date.now();
        if (!autoPlay && query === lastSubmittedQuery && now - lastSubmittedAt < 500) return;
        lastSubmittedQuery = query;
        lastSubmittedAt = now;

        saveRecentSearch(query);
        renderRecentSearches();
        updateSearchDropdownHeight();
        searchDropdown.classList.add('active');
        fetchDropdownResults(query, autoPlay);
    };

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitSearch();
        }
    });
    searchInput.addEventListener('search', submitSearch);

    // Tombol panah kanan: submit pencarian
    const searchSubmitBtn = document.getElementById('searchSubmitBtn');
    if (searchSubmitBtn) {
        searchSubmitBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // jangan tutup dropdown
            if (searchInput.value.trim().length < 1) {
                searchInput.focus(); // jika kosong, fokus ke input saja
                return;
            }
            submitSearch();
        });
    }

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        setLastSearchQuery('');
        if (searchAbortController) searchAbortController.abort();
        clearSearchBtn.classList.remove('visible');
        searchDropdown.classList.remove('active');
        searchInput.focus();
    });
    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !searchDropdown.contains(event.target) && event.target !== searchSubmitBtn && !searchSubmitBtn?.contains(event.target)) {
            searchDropdown.classList.remove('active');
        }
    });

    // ==========================================
    // SMART VOICE SEARCH PIPELINE & AI MATCHER
    // ==========================================

    const calculateSimilarity = (str1, str2) => {
        if (!str1 || !str2) return 0;
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        if (s1 === s2) return 1.0;
        if (s1.includes(s2) || s2.includes(s1)) return 0.85;

        const m = s1.length;
        const n = s2.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }

        const distance = dp[m][n];
        const maxLen = Math.max(m, n);
        return maxLen === 0 ? 1.0 : (1.0 - distance / maxLen);
    };

    // =========================================================================
    // SMART VOICE AI ENGINE: PHONETICS & CATALOG MATCHER
    // =========================================================================    

    // 1. Algoritma Metaphone & Fonetik Skeleton Bahasa Indonesia / Inggris
    const toPhoneticSkeleton = (str) => {
        if (!str) return '';
        let s = str.toLowerCase().trim();

        // Bersihkan simbol & tanda baca
        s = s.replace(/[^a-z0-9\s]/g, ' ');

        // Reduksi huruf vokal beruntun & diftong
        s = s
            .replace(/ea|ee|ei|ie|ey/g, 'i')
            .replace(/oo|ou|ow/g, 'u')
            .replace(/oa/g, 'o')
            .replace(/ai|ay/g, 'e')
            .replace(/au|aw/g, 'o');

        // Konsonan yang sering tertukar dalam speech-to-text
        s = s
            .replace(/f|v|ph/g, 'p')
            .replace(/c(?=[eiy])/g, 's')
            .replace(/c/g, 'k')
            .replace(/q/g, 'k')
            .replace(/x/g, 'ks')
            .replace(/z|j/g, 's')
            .replace(/th/g, 't')
            .replace(/dh/g, 'd')
            .replace(/gh/g, 'g')
            .replace(/kh/g, 'k')
            .replace(/sy|sh/g, 's');

        // Kompresi karakter kembar (misal: "fiiist" -> "fist")
        s = s.replace(/(.)\1+/g, '$1');

        return s.replace(/\s+/g, ' ').trim();
    };

    // Helper untuk membersihkan tanda baca dan spasi di awal/akhir
    const cleanPunct = (s) => (s || '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').trim();
    // 2. Kamus Fonetik & Normalisasi Musik Ekstensif (Huruf Kecil Alami)
    const normalizeCommonMusicTerms = (text) => {
        if (!text) return '';
        return text
            // .Feast & variasi fonetik
            .replace(/\b(dot\s+feast|titik\s+feast|\.feast|feast|fist|feest|pist|vist|pest|fis|fiss|feis|feist|peist|dist)\b/gi, 'feast')
            // Sheila On 7 & angka Indonesia/Inggris
            .replace(/\b(sheila|sela|seila)\s+on\s+(seven|7|sefen|sepen|tujuh)\b/gi, 'sheila on 7')
            .replace(/\bso7\b/gi, 'sheila on 7')
            // Hindia
            .replace(/\b(india|hinda|hindya|hindia)\b/gi, 'hindia')
            // Raim Laode
            .replace(/\b(raim\s+laode|raim\s+la\s+ode|raim\s+laude|rayem\s+laode|rahim\s+laode|rhyme\s+laode)\b/gi, 'raim laode')
            // Juicy Luicy
            .replace(/\b(jusi\s+luisi|jusi\s+luici|juicy\s+luisy|jucy\s+luci|juisi\s+luisi)\b/gi, 'juicy luicy')
            // Sal Priadi
            .replace(/\b(sal\s+priyadi|sal\s+priadi|sal\s+pribadi)\b/gi, 'sal priadi')
            // Bernadya
            .replace(/\b(bernadia|bernadya|bernadhia)\b/gi, 'bernadya')
            // Mahalini
            .replace(/\b(maha\s+lini|mahalini)\b/gi, 'mahalini')
            // Nadin Amizah
            .replace(/\b(nadin\s+hamzah|nadin\s+amizah|nadin\s+amijah)\b/gi, 'nadin amizah')
            // Vierra / Vierratale
            .replace(/\b(viera|vierra|vieratal|vieratale)\b/gi, 'vierra')
            // For Revenge
            .replace(/\b(for\s+rivens|for\s+revenge|por\s+ripens)\b/gi, 'for revenge')
            // Bilal Indrajaya
            .replace(/\b(bilal\s+indra\s+jaya|bilal\s+indrajaya)\b/gi, 'bilal indrajaya')
            // Feby Putri
            .replace(/\b(febi\s+putri|feby\s+putri)\b/gi, 'feby putri')
            // Fiersa Besari
            .replace(/\b(pirsa\s+besari|fiersa\s+besari)\b/gi, 'fiersa besari')
            // Barasuara
            .replace(/\bbara\s+suara\b/gi, 'barasuara')
            // DHOT DESIGN
            .replace(/\b(dhot|dot)\s+(desain|design)\b/gi, 'dhot design')
            // Guyon Waton & Denny Caknan
            .replace(/\bguyon\s+waton\b/gi, 'guyon waton')
            .replace(/\b(deni|denny)\s+caknan\b/gi, 'denny caknan')
            // Radiohead & Lagu Radiohead
            .replace(/\b(rediohed|redio\s+hed|radio\s+hed|radiohead)\b/gi, 'radiohead')
            .replace(/\b(krip|klip|crip)\b/gi, 'creep')
            .replace(/\bkarma\s+polis\b/gi, 'karma police')
            .replace(/\bno\s+(seprais|serpres|surpres)\b/gi, 'no surprises')
            .replace(/\bol\s+ai\s+nid\b/gi, 'all i need')
            .replace(/\blet\s+(dawn|don|daun)\b/gi, 'let down')
            // Backstreet Boys
            .replace(/\b(bekstrit\s+bois|bekstrit\s+boy|back\s+street\s+boys)\b/gi, 'backstreet boys')
            .replace(/\bsep\s+of\s+mai\s+hart\b/gi, 'shape of my heart')
            // Western Bands & Angka
            .replace(/\bmaroon\s+(five|5|lima)\b/gi, 'maroon 5')
            .replace(/\bblink\s+(one\s+eighty\s+two|182|seratus\s+delapan\s+puluh\s+dua)\b/gi, 'blink-182')
            .replace(/\b(twenty\s+one|21|dua\s+puluh\s+satu)\s+pilots\b/gi, 'twenty one pilots')
            .replace(/\bone\s+direction\b/gi, 'one direction')
            .replace(/\bthe\s+(1975|nineteen\s+seventy\s+five|sembilan\s+belas\s+tujuh\s+puluh\s+lima)\b/gi, 'the 1975')
            // Normalisasi Judul Album Populer
            .replace(/\bmembangun\s+(dan|\&)\s+menghancurkan\b/gi, 'membangun & menghancurkan')
            .replace(/\bmenari\s+dengan\s+bayangan\b/gi, 'menari dengan bayangan')
            .replace(/\bduka\s+bersama\b/gi, 'duka bersama')
            .replace(/\bkisah\s+klasik\s+(untuk\s+masa\s+depan)?\b/gi, 'kisah klasik untuk masa depan')
            .replace(/\bpejantan\s+tangguh\b/gi, 'pejantan tangguh')
            // Normalisasi Judul Lagu Populer
            .replace(/\b(evaluasi|epaluasi)\b/gi, 'evaluasi')
            .replace(/\b(komang|koma)\b/gi, 'komang')
            .replace(/\b(nina|nyna)\b/gi, 'nina')
            .replace(/\bsecukupnya\b/gi, 'secukupnya')
            .replace(/\brumah\s+ke\s+rumah\b/gi, 'rumah ke rumah')
            .replace(/\btarian\s+penghancur\s+raya\b/gi, 'tarian penghancur raya')
            .replace(/\bperadaban\b/gi, 'peradaban')
            .replace(/\bsephia\b/gi, 'sephia')
            .replace(/\bmelompat\s+lebih\s+tinggi\b/gi, 'melompat lebih tinggi')
            .replace(/\bsebuah\s+kisah\s+klasik\b/gi, 'sebuah kisah klasik')
            .replace(/\bsahabat\s+sejati\b/gi, 'sahabat sejati')
            .replace(/\blapang\s+dada\b/gi, 'lapang dada')
            .replace(/\bgala\s+bunga\s+matahari\b/gi, 'gala bunga matahari')
            .replace(/\buntungnya\s+hidup\s+harus\s+tetap\s+berjalan\b/gi, 'untungnya hidup harus tetap berjalan')
            .replace(/\bruntuh\b/gi, 'runtuh')
            .replace(/\bserana\b/gi, 'serana')
            .replace(/\brayuan\s+perempuan\s+gila\b/gi, 'rayuan perempuan gila')
            .replace(/\bbertaut\b/gi, 'bertaut');
    };

    // 3. Pembersih & Normalisasi Perintah Suara
    const cleanVoiceQuery = (rawText) => {
        if (!rawText) return '';
        let text = rawText.trim();

        // 1. Bersihkan tanda baca di awal/akhir/tengah kecuali titik pada .Feast
        text = text.replace(/[\,\?\!\;\"\“\”\‘\’\:]+/g, ' ').replace(/\s+/g, ' ').trim();

        // 2. Normalisasi ejaan band / istilah populer
        text = normalizeCommonMusicTerms(text);

        // 3. Bersihkan kata awalan perintah suara multi-bahasa (Indonesia, English, Español, dll.)
        const commandPrefixPattern = /^(tolong\s+)?(putarkan|putar|puterin|mainkan|setelkan|setel|dengarkan|dengerin|bunyikan|nyalakan|play|carikan|cari|temukan|search|buka|lihat|tampilkan|buscar|reproducir|escuchar|listen\s+to)\s*(kan\s+)?(semua|seluruh|semuanya|koleksi|daftar|all|todos)?\s*(lagu-lagu|lagu|musik|track|songs|music|cancion|canciones|musica)?\s*(dari|punya|milik|oleh|artis|penyanyi|musisi|band|album|judul|tentang|for|by|from|de|por)?\s*/i;
        text = text.replace(commandPrefixPattern, '').trim();

        // 4. Bersihkan kata pengisi di akhir
        text = text.replace(/\s+(dong|ya|tolong|please|deh|nih|yah|por\s+favor)$/i, '').trim();
        return text;
    };

    // 4. Ekstraktor Pola 'Lagu [X] dari Artis [Y]' (Multi-Language)
    const parseSongAndArtist = (query) => {
        if (!query) return null;

        // Contoh: "Nina dari Feast", "Dan oleh Sheila On 7", "Creep by Radiohead", "Despacito de Luis Fonsi"
        const separatorPattern = /\s+(dari|oleh|milik|punya|ciptaan|by|from|feat\.?|ft\.?|de|por)\s+/i;
        if (separatorPattern.test(query)) {
            const parts = query.split(separatorPattern);
            if (parts.length >= 3) {
                return {
                    song: parts[0].trim(),
                    artist: parts[2].trim()
                };
            }
        }

        // Contoh: "Hindia yang judulnya Rumah Ke Rumah", "Sheila On 7 lagunya Sephia"
        const yangJudulnyaPattern = /\s+(yang\s+judulnya|yang\s+nyanyi|lagunya)\s+/i;
        if (yangJudulnyaPattern.test(query)) {
            const parts = query.split(yangJudulnyaPattern);
            if (parts.length >= 3) {
                return {
                    artist: parts[0].trim(),
                    song: parts[2].trim()
                };
            }
        }

        return null;
    };

    // 5. Pengambil SEMUA Lagu Berdasarkan Artis
    const getAllSongsByArtist = async (artistQuery, artistItem = null) => {
        const localSongs = typeof getSongs === 'function' ? getSongs() : [];
        let targetName = artistQuery || '';
        if (artistItem) {
            targetName = artistItem.type === 'artist' && artistItem.name ? artistItem.name : (artistItem.artist || artistItem.name || targetName);
        }
        targetName = targetName.toLowerCase().trim();
        const targetNorm = cleanPunct(targetName);
        const targetPhon = toPhoneticSkeleton(targetName);

        // 1. Ambil dari katalog lagu lokal yang artisnya cocok
        const matchedLocal = localSongs.filter((song) => {
            if (!song.artist) return false;
            const sArtist = song.artist.toLowerCase().trim();
            const sNorm = cleanPunct(sArtist);
            const sPhon = toPhoneticSkeleton(sArtist);

            return (
                sArtist === targetName ||
                sNorm === targetNorm ||
                sPhon === targetPhon ||
                sArtist.includes(targetName) ||
                targetName.includes(sArtist) ||
                (targetPhon.length >= 3 && (sPhon.includes(targetPhon) || targetPhon.includes(sPhon)))
            );
        });

        // 2. Jika artis juga punya lagu di catalog remote/Jamendo, cari dan gabungkan
        let allSongs = [...matchedLocal];
        try {
            const catalog = await searchCatalogData(targetName, getSongs(), getArtists(), 30);
            const catalogSongs = (catalog.songs || []).filter((s) => {
                const sArtist = (s.artist || '').toLowerCase();
                return sArtist.includes(targetName) || targetName.includes(sArtist);
            });

            const seen = new Set(allSongs.map((s) => String(s.id)));
            for (const cs of catalogSongs) {
                if (!seen.has(String(cs.id))) {
                    seen.add(String(cs.id));
                    allSongs.push(cs);
                }
            }
        } catch (e) {
            console.warn('Error fetching catalog artist songs:', e);
        }

        return allSongs;
    };

    // 5. Multi-Stage Intelligent Catalog Matcher (Local Data & Jamendo Global API Integration)
    const findSmartCatalogMatch = async (candidates = []) => {
        const pool = [];

        // 1. Kumpulkan data lagu, artis, dan album lokal
        const localSongs = typeof getSongs === 'function' ? getSongs() : [];
        (localSongs || []).forEach((s) => {
            if (s.name) pool.push({ name: s.name, type: 'song', item: s });
            if (s.artist) pool.push({ name: s.artist, type: 'artist', item: { id: `artist-${s.artist}`, name: s.artist, photo: s.cover, type: 'artist' } });
            if (s.album) pool.push({ name: s.album, type: 'album', item: { id: `album-${s.album}`, name: s.album, cover: s.cover, type: 'album' } });
            if (s.name && s.artist) pool.push({ name: s.name, combined: `${s.name} ${s.artist}`, type: 'song', item: s });
        });

        // 2. Kumpulkan data artis lokal
        const localArtists = typeof getArtists === 'function' ? getArtists() : [];
        (localArtists || []).forEach((a) => {
            if (a.name) pool.push({ name: a.name, type: 'artist', item: a });
        });

        // 3. Kumpulkan data popular searches
        (popularSearchData.songs || []).forEach((s) => {
            if (s.name) pool.push({ name: s.name, type: 'song', item: s });
            if (s.artist) pool.push({ name: s.artist, type: 'artist', item: { id: `artist-${s.artist}`, name: s.artist, photo: s.cover, type: 'artist' } });
            if (s.name && s.artist) pool.push({ name: s.name, combined: `${s.name} ${s.artist}`, type: 'song', item: s });
        });
        (popularSearchData.artists || []).forEach((a) => {
            if (a.name) pool.push({ name: a.name, type: 'artist', item: a });
        });
        (popularSearchData.albums || []).forEach((al) => {
            if (al.name) pool.push({ name: al.name, type: 'album', item: al });
        });

        for (const rawCandidate of candidates) {
            const cleaned = cleanVoiceQuery(rawCandidate);
            if (!cleaned) continue;

            const lowerCleaned = cleaned.toLowerCase();
            const normCleaned = cleanPunct(cleaned);
            const phonCleaned = toPhoneticSkeleton(cleaned);

            // A. Cek pola 'Lagu [Song] dari [Artist]'
            const parsed = parseSongAndArtist(cleaned);
            if (parsed) {
                const normSong = cleanPunct(parsed.song);
                const normArtist = cleanPunct(parsed.artist);
                const phonSong = toPhoneticSkeleton(parsed.song);
                const phonArtist = toPhoneticSkeleton(parsed.artist);

                for (const entry of pool) {
                    if (entry.type === 'song' && entry.item) {
                        const songName = cleanPunct(entry.item.name);
                        const songArtist = cleanPunct(entry.item.artist);
                        const songPhonName = toPhoneticSkeleton(entry.item.name);
                        const songPhonArtist = toPhoneticSkeleton(entry.item.artist);

                        const isSongMatch = songName.includes(normSong) || normSong.includes(songName) || songPhonName === phonSong;
                        const isArtistMatch = songArtist.includes(normArtist) || normArtist.includes(songArtist) || songPhonArtist === phonArtist;

                        if (isSongMatch && isArtistMatch) {
                            return { text: entry.item.name.toLowerCase(), score: 1.0, isMatch: true, item: entry.item, type: 'song' };
                        }
                    }
                }
            }

            // B. Pencocokan ke entitas katalog lokal & populer (Hanya untuk exact/typo mirip)
            for (const entry of pool) {
                const entryName = entry.name;
                const lowerEntry = entryName.toLowerCase();
                const normEntry = cleanPunct(entryName);
                const phonEntry = toPhoneticSkeleton(entryName);

                // 1. Exact Match Teks
                if (lowerCleaned === lowerEntry || normCleaned === normEntry) {
                    return { text: lowerEntry, score: 1.0, isMatch: true, item: entry.item, type: entry.type };
                }

                // 2. Exact Phonetic Match (hanya jika panjang kata mirip, misal "fist" -> "feast", "koma" -> "komang")
                if (phonCleaned === phonEntry && Math.abs(normCleaned.length - normEntry.length) <= 3) {
                    return { text: lowerEntry, score: 1.0, isMatch: true, item: entry.item, type: entry.type };
                }

                // 3. Typo fuzzy similarity tinggi pada kata yang setara
                const textSim = calculateSimilarity(normCleaned, normEntry);
                const phonSim = calculateSimilarity(phonCleaned, phonEntry);
                const bestSim = Math.max(textSim, phonSim);

                if (bestSim >= 0.85 && Math.abs(normCleaned.length - normEntry.length) <= 2) {
                    return { text: lowerEntry, score: bestSim, isMatch: true, item: entry.item, type: entry.type };
                }
            }

            // C. Pencocokan ke Jamendo Remote Catalog API (Lagu, Artis, & Album Mancanegara)
            try {
                if (typeof searchCatalogData === 'function' && lowerCleaned.length >= 2) {
                    const remoteData = await searchCatalogData(lowerCleaned, localSongs, localArtists, 5);
                    const remoteEntries = [
                        ...(remoteData.artists || []).map((a) => ({ name: a.name, type: 'artist', item: a })),
                        ...(remoteData.songs || []).map((s) => ({ name: s.name, type: 'song', item: s })),
                        ...(remoteData.albums || []).map((al) => ({ name: al.name, type: 'album', item: al }))
                    ];

                    for (const rentry of remoteEntries) {
                        const rName = (rentry.name || '').toLowerCase();
                        const rNorm = cleanPunct(rName);
                        const rPhon = toPhoneticSkeleton(rName);

                        if (lowerCleaned === rName || normCleaned === rNorm) {
                            return { text: rName, score: 1.0, isMatch: true, item: rentry.item, type: rentry.type };
                        }
                        if (phonCleaned === rPhon && Math.abs(normCleaned.length - rNorm.length) <= 3) {
                            return { text: rName, score: 1.0, isMatch: true, item: rentry.item, type: rentry.type };
                        }
                    }
                }
            } catch (err) {
                console.warn('Voice Jamendo Catalog match lookup error:', err);
            }

            // Jika tidak ada exact/typo match pada entitas penuh, gunakan kueri asli user dalam huruf kecil
            if (lowerCleaned.length >= 1) {
                return { text: lowerCleaned, score: 1.0, isMatch: false, item: null, type: null };
            }
        }

        // Default jika tidak ada match katalog: gunakan apa yang diucapkan user dalam huruf kecil
        const defaultCleaned = cleanVoiceQuery(candidates[0] || '');
        return { text: (defaultCleaned || (candidates[0] || '')).toLowerCase().trim(), score: 0, isMatch: false, item: null, type: null };
    };

    if (microphoneButton) {
        microphoneButton.dataset.initialized = 'true';

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            microphoneButton.title = 'Voice search not supported on this browser';
            microphoneButton.addEventListener('click', () => searchInput.focus());
        } else {
            const recognition = new SpeechRecognition();
            // Default ke id-ID (sangat peka terhadap bahasa Indonesia & judul internasional)
            const getAppLanguage = () => localStorage.getItem('app_language') || localStorage.getItem('user_language') || 'id-ID';
            recognition.lang = getAppLanguage();
            recognition.interimResults = true;  // Real-time visual feedback
            recognition.maxAlternatives = 5;    // Analisis 5 kandidat suara teratas dari browser AI
            recognition.continuous = false;

            let isListening = false;
            let lastCandidates = [];

            const startListening = () => {
                try {
                    recognition.lang = getAppLanguage();
                    lastCandidates = [];
                    recognition.start();
                } catch (e) {
                    // Abaikan jika recognition sudah berjalan
                }
            };

            const stopListening = () => {
                try {
                    recognition.stop();
                } catch (e) { /* abaikan */ }
            };

            // Saat mulai mendengarkan: bersihkan input dan tampilkan status listening
            recognition.addEventListener('start', () => {
                isListening = true;
                microphoneButton.classList.add('is-listening');
                microphoneButton.setAttribute('aria-label', 'Stop voice search');
                microphoneButton.title = 'Listening... Speak now';
                searchInput.value = '';
                clearSearchBtn.classList.remove('visible');
                searchDropdown.classList.remove('active');
                searchInput.placeholder = 'Listening... Speak song, artist, or album 🎙️';
            });

            // Hasil suara masuk: rekam kalimat penuh dan alternatif suara di latar belakang
            recognition.addEventListener('result', (event) => {
                const candidates = [];

                // 1. Ambil transcript utama dari gabungan seluruh segmen
                const fullSentence = Array.from(event.results)
                    .map((r) => (r[0] ? r[0].transcript : ''))
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (fullSentence) {
                    candidates.push(fullSentence);
                }

                // 2. Ambil alternatif lain dari neural speech engine
                for (let i = 0; i < event.results.length; i++) {
                    const res = event.results[i];
                    for (let alt = 1; alt < Math.min(res.length, 5); alt++) {
                        const altText = res[alt]?.transcript?.trim();
                        if (altText && !candidates.includes(altText)) {
                            candidates.push(altText);
                        }
                    }
                }

                if (candidates.length > 0) {
                    lastCandidates = candidates;
                }
            });

            // Saat user SELESAI berbicara: selesaikan dengan matching cerdas & buka dropdown hasil pencarian (tanpa auto-play)
            recognition.addEventListener('end', async () => {
                isListening = false;
                microphoneButton.classList.remove('is-listening');
                microphoneButton.setAttribute('aria-label', 'Search by voice');
                microphoneButton.title = 'Search by voice';
                searchInput.placeholder = 'Search songs, artists, albums...';

                if (lastCandidates.length > 0) {
                    const smartResult = await findSmartCatalogMatch(lastCandidates);
                    const finalQuery = (smartResult.text && smartResult.text.trim().length >= 2)
                        ? smartResult.text
                        : cleanVoiceQuery(lastCandidates[0] || '');

                    if (finalQuery && finalQuery.trim().length >= 1) {
                        // Ketikkan teks yang sudah dibersihkan/dikenali ke kotak pencarian
                        searchInput.value = finalQuery;
                        clearSearchBtn.classList.add('visible');
                        setLastSearchQuery(finalQuery);

                        // Tampilkan hasil pencarian di dropdown secara murni TANPA auto-play
                        submitSearch(false);
                    } else if (finalQuery) {
                        searchInput.value = finalQuery;
                        clearSearchBtn.classList.toggle('visible', finalQuery.length > 0);
                    }
                } else if (searchInput.value.trim().length > 0) {
                    // Fallback jika ada teks interim yang tertulis
                    const fallbackQuery = cleanVoiceQuery(searchInput.value);
                    if (fallbackQuery) {
                        searchInput.value = fallbackQuery;
                        setLastSearchQuery(fallbackQuery);
                        submitSearch(false);
                    }
                }
            });

            // Error handling dengan pesan ramah pengguna
            recognition.addEventListener('error', (event) => {
                isListening = false;
                microphoneButton.classList.remove('is-listening');
                microphoneButton.setAttribute('aria-label', 'Search by voice');
                microphoneButton.title = 'Search by voice';
                searchInput.placeholder = 'Search songs, artists, albums...';

                if (event.error === 'not-allowed') {
                    searchInput.placeholder = 'Microphone access denied.';
                    setTimeout(() => {
                        searchInput.placeholder = 'Search songs, artists, albums...';
                    }, 3000);
                } else if (event.error === 'no-speech') {
                    searchInput.placeholder = 'No speech detected. Try again.';
                    setTimeout(() => {
                        searchInput.placeholder = 'Search songs, artists, albums...';
                    }, 2500);
                }
            });

            // Toggle listen / stop
            microphoneButton.addEventListener('click', () => {
                if (isListening) {
                    stopListening();
                } else {
                    startListening();
                }
            });
        }
    }
};