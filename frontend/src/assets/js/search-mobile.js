import { auth } from './firebase-config.js';
import { searchCatalogData } from '../../services/searchService.js';
import {
    getRecentSearches,
    saveRecentSearch,
    clearRecentSearches
} from '../../services/recentSearchService.js';
import { subscribePopularSearches, recordSearchSelection } from '../../services/searchPopularityService.js';
import { findUserByCode, followUser, unfollowUser, getUserFollowing } from '../../services/userService.js';

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

    if (!searchInput || !searchDropdown || !clearSearchBtn || searchInput.dataset.initialized === 'true') {
        return;
    }
    searchInput.dataset.initialized = 'true';

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

    window.handleUserFollowClick = async (targetUid, targetName, targetPhoto, buttonEl) => {
        const user = auth.currentUser;
        if (!user) {
            if (typeof window.navigateToAuthPage === 'function') {
                window.navigateToAuthPage('login');
            } else if (typeof window.showToast === 'function') {
                window.showToast('Silakan login terlebih dahulu untuk mengikuti akun');
            }
            return;
        }

        if (user.uid === targetUid) {
            if (typeof window.showToast === 'function') {
                window.showToast('Ini adalah ID Akun Anda sendiri');
            }
            return;
        }

        const isCurrentlyFollowing = buttonEl?.dataset?.following === 'true';
        if (isCurrentlyFollowing) {
            await unfollowUser(targetUid);
            if (buttonEl) {
                buttonEl.dataset.following = 'false';
                buttonEl.textContent = 'Follow';
                buttonEl.style.background = 'linear-gradient(135deg, #F12E77, #B91EC9)';
            }
            if (typeof window.showToast === 'function') {
                window.showToast(`Berhenti mengikuti ${targetName}`);
            }
        } else {
            await followUser(targetUid, { displayName: targetName, photoURL: targetPhoto });
            if (buttonEl) {
                buttonEl.dataset.following = 'true';
                buttonEl.textContent = 'Following';
                buttonEl.style.background = 'rgba(255, 255, 255, 0.16)';
            }
            if (typeof window.showToast === 'function') {
                window.showToast(`Mulai mengikuti ${targetName}!`);
            }
        }
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
            const currentSong = getCurrentSongData?.() || window.__currentSongData || (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : null);
            const cleanAudio = item.audio;
            const isSame = itemType === 'songs' && currentSong && (typeof window.areSameSongs === 'function'
                ? window.areSameSongs(currentSong, item)
                : (String(item.id) === String(currentSong.id) || (cleanAudio && cleanAudio === currentSong.audio)));
            const isActiveSong = Boolean(isSame);
            const isPaused = isActiveSong && Boolean(activeAudio?.paused);
            const statusLabel = isActiveSong ? (isPaused ? 'Paused' : 'Now playing') : status;
            const artistBadge = itemType === 'artists'
                ? '<svg class="popular-search-verified" viewBox="0 0 256 256" aria-label="Verified"><path fill="#0095f6" d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14-3.25 1.36-8.69 1.44-13.94 1.52-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57c1.36 3.27 1.44 8.69 1.52 13.94c.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52c3.56 1.47 7.63 5.37 11.57 9.14c6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14c3.27-1.36 8.69-1.44 13.94-1.52c9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94c1.47-3.56 5.37-7.63 9.14-11.57c6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18M173.66 109.66l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32Z"/></svg>'
                : '';
            const subtitle = itemType === 'artists' ? '' : item.artist || '';
            const statusMarkup = itemType === 'songs'
                ? `<span class="popular-search-song-status">Song${duration ? ` - <i>${duration}</i>` : ''}</span>`
                : `<span>${statusLabel}</span>`;
            const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : 'rank-default';
            const cleanCover = item.cover || item.photo || '';
            const playIconHtml = itemType === 'songs' ? `
                <div class="popular-search-play-icon" aria-hidden="true">
                    ${isActiveSong && !isPaused ? `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    ` : `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                    `}
                </div>
            ` : '';
            return `<article class="popular-search-card ${isActiveSong ? 'is-active-song' : ''} ${isPaused ? 'is-paused' : ''}" data-id="${escapeHtml(item.id)}" data-audio="${escapeHtml(cleanAudio)}" data-popular-type="${itemType}" data-popular-id="${escapeHtml(item.id)}"><span class="popular-search-rank ${rankClass}">${rank}</span><div class="popular-search-cover-wrapper"><img class="popular-search-cover" src="${escapeHtml(cleanCover)}" alt="${escapeHtml(item.name)}" width="52" height="52" loading="lazy">${playIconHtml}</div><div class="popular-search-info"><div class="popular-search-title-row"><strong>${escapeHtml(item.name)}</strong>${artistBadge}</div>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}<small>${statusMarkup}</small></div><button class="popular-search-menu" type="button" aria-label="More options" title="More options"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg></button></article>`;
        }).join('')
        : getPopularEmptyStateHTML(type);

    const getPopularEmptyStateHTML = (type) => {
        let iconSvg = '';
        let title = '';
        let desc = '';

        if (type === 'songs') {
            iconSvg = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
            title = 'No popular songs yet';
            desc = 'Popular tracks will appear here as they are played and discovered.';
        } else if (type === 'artists') {
            iconSvg = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            title = 'No popular artists yet';
            desc = 'Popular artists will appear here as listeners explore music.';
        } else if (type === 'albums') {
            iconSvg = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>`;
            title = 'No popular albums yet';
            desc = 'Popular albums and releases will be listed here.';
        } else {
            iconSvg = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
            title = 'No top results yet';
            desc = 'Top searches across songs, artists, and albums will appear here.';
        }

        return `
            <div class="search-empty-state">
                <div class="search-empty-icon">
                    ${iconSvg}
                </div>
                <h3 class="search-empty-title">${title}</h3>
                <p class="search-empty-desc">${desc}</p>
            </div>
        `;
    };

    const sortPopularItems = (list = []) => {
        return [...list].sort((left, right) => {
            const countLeft = Number(left.searchCount) || 0;
            const countRight = Number(right.searchCount) || 0;
            if (countRight !== countLeft) {
                return countRight - countLeft;
            }
            const timeLeft = left.updatedAt?.toMillis ? left.updatedAt.toMillis() : (typeof left.updatedAt?.seconds === 'number' ? left.updatedAt.seconds * 1000 : 0);
            const timeRight = right.updatedAt?.toMillis ? right.updatedAt.toMillis() : (typeof right.updatedAt?.seconds === 'number' ? right.updatedAt.seconds * 1000 : 0);
            return timeLeft - timeRight;
        });
    };

    const renderPopularSearches = () => {
        if (!popularSearchContent) return;
        let items = [];
        if (activePopularTab === 'top') {
            items = sortPopularItems([
                ...popularSearchData.songs.map((item) => ({ ...item, resultType: 'songs' })),
                ...popularSearchData.artists.map((item) => ({ ...item, resultType: 'artists' })),
                ...popularSearchData.albums.map((item) => ({ ...item, resultType: 'albums' }))
            ]).slice(0, 10);
        } else {
            items = sortPopularItems([...popularSearchData[activePopularTab]]).slice(0, 10);
        }

        // Sinkron daftar LAGU yang sedang ditampilkan ke buffer popularPlaylist
        const songItems = items.filter((item) => (item.resultType || activePopularTab) === 'songs');
        if (typeof setPopularPlaylist === 'function') {
            setPopularPlaylist(songItems.map((s) => ({
                id: s.id,
                audio: s.audio,
                name: s.name,
                artist: s.artist || '',
                cover: s.cover || s.photo || '',
                duration: s.duration || 0
            })));
        }
        popularSearchContent.innerHTML = renderPopularCards(items, activePopularTab);
        if (typeof window.syncActiveSongUI === 'function') {
            window.syncActiveSongUI();
        }
    };

    const movePopularSearchIndicator = (tab) => {
        if (!tab || !popularSearchActiveIndicator) return;
        popularSearchActiveIndicator.style.width = `${tab.offsetWidth}px`;
        popularSearchActiveIndicator.style.transform = `translateX(${tab.offsetLeft}px)`;
        const tabsContainer = tab.closest('.popular-search-tabs');
        if (tabsContainer) {
            const containerWidth = tabsContainer.clientWidth;
            const tabLeft = tab.offsetLeft;
            const tabWidth = tab.offsetWidth;
            const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
            tabsContainer.scrollTo({
                left: Math.max(0, targetScrollLeft),
                behavior: 'smooth'
            });
        }
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

    const initialActiveTab = document.querySelector('[data-popular-tab].is-active');
    movePopularSearchIndicator(initialActiveTab);
    requestAnimationFrame(() => {
        movePopularSearchIndicator(document.querySelector(`[data-popular-tab="${activePopularTab}"]`) || initialActiveTab);
    });
    window.addEventListener('resize', debounce(() => {
        movePopularSearchIndicator(document.querySelector(`[data-popular-tab="${activePopularTab}"]`));
    }, 150));

    // Popular Searches cards click handler (Direct from Firebase)
    popularSearchContent?.addEventListener('click', (event) => {
        if (event.target.closest('.popular-search-menu')) return;
        const card = event.target.closest('[data-popular-type]');
        if (!card) return;
        const pType = card.dataset.popularType;
        const pId = card.dataset.popularId;
        const rawList = popularSearchData[pType] || [];
        const item = rawList.find((entry) => String(entry.id) === pId || String(entry.docId) === pId || String(entry.name) === pId);
        if (!item) return;

        if (pType === 'artists') {
            searchDropdown.classList.remove('active');
            navigateToArtistPage({ id: item.id, name: item.name, photo: item.photo || item.cover || '' });
        } else if (pType === 'songs') {
            const currentSong = getCurrentSongData?.() || window.__currentSongData || (typeof window.getCurrentSongData === 'function' ? window.getCurrentSongData() : null);
            const isSameActiveSong = currentSong && (typeof window.areSameSongs === 'function'
                ? window.areSameSongs(currentSong, item)
                : String(currentSong.id) === String(item.id)) && activeAudio && activeAudio.src;
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
        } else if (pType === 'albums') {
            searchDropdown.classList.remove('active');
            searchInput.value = item.name;
            submitSearch();
        }
    });

    const renderRecentSearches = async () => {
        if (!recentSearchesList) return;

        const recentSearches = await getRecentSearches();
        if (clearRecentSearchesBtn) {
            clearRecentSearchesBtn.style.display = recentSearches.length > 0 ? '' : 'none';
        }

        recentSearchesList.innerHTML = recentSearches.length > 0
            ? recentSearches.map((query) => `<button class="recent-search-card" type="button" data-recent-query="${query.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"><span class="recent-search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg></span><span class="recent-search-name">${query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></button>`).join('')
            : `
                <div class="search-empty-state">
                    <div class="search-empty-icon">
                        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <h3 class="search-empty-title">No recent searches yet</h3>
                    <p class="search-empty-desc">Search for songs, artists, or albums to see your history here.</p>
                </div>
            `;
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

        const cleanQuery = query.trim();
        const isCodeSearch = cleanQuery.startsWith('#') || cleanQuery.toUpperCase().startsWith('SPW-');

        try {
            const [catalog, foundUser] = await Promise.all([
                searchCatalogData(cleanQuery.toLowerCase(), getSongs(), getArtists(), 15),
                isCodeSearch ? findUserByCode(cleanQuery).catch(() => null) : Promise.resolve(null)
            ]);

            const finalItems = [...catalog.artists, ...catalog.songs, ...catalog.albums]
                .sort((left, right) => right.searchRank - left.searchRank)
                .slice(0, 15);
            const fullMappedResults = finalItems.filter((item) => item.type === 'song');

            let userItemHtml = '';
            if (foundUser) {
                const currentUser = auth.currentUser;
                const isSelf = currentUser && currentUser.uid === foundUser.uid;
                let isFollowing = false;
                if (currentUser && !isSelf) {
                    try {
                        const followingList = await getUserFollowing(currentUser.uid);
                        isFollowing = followingList.some((f) => f.id === foundUser.uid || f.uid === foundUser.uid);
                    } catch {
                        isFollowing = false;
                    }
                }

                const userDisplayName = escapeHtml(foundUser.displayName || 'User');
                const userPhoto = escapeHtml(foundUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName)}&background=B91EC9&color=fff&bold=true`);
                const userCodeText = escapeHtml(foundUser.userCode);
                const isPro = Boolean(foundUser.isPremium);

                userItemHtml = `
                    <div class="dropdown-item dropdown-item-user ${isPro ? 'is-pro-user' : ''}" data-user-uid="${escapeHtml(foundUser.uid)}" style="cursor: default;">
                        <div class="dropdown-cover-wrapper ${isPro ? 'user-is-pro' : ''}">
                            <img src="${userPhoto}" alt="${userDisplayName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" referrerpolicy="no-referrer">
                        </div>
                        <div class="dropdown-track-info" style="flex: 1; min-width: 0; justify-content: center;">
                            <div class="dropdown-info-name" style="font-size: 0.88rem; font-weight: 600; display: flex; align-items: center; gap: 0.4rem;">
                                <span>${userDisplayName}</span>
                                ${isPro ? '<span class="pro-badge" style="font-size: 0.58rem; padding: 0.1rem 0.35rem;">PRO</span>' : ''}
                            </div>
                            <div class="dropdown-user-code-label" style="font-size: 0.74rem; color: #38bdf8; font-weight: 600; font-family: monospace;">
                                ${userCodeText} <span style="color: var(--text-muted); font-weight: 400; font-family: inherit;">• Pengguna</span>
                            </div>
                        </div>
                        ${!isSelf ? `
                            <button class="dropdown-user-follow-btn" type="button" data-following="${isFollowing ? 'true' : 'false'}" style="${isFollowing ? 'background: rgba(255, 255, 255, 0.22);' : ''}" onclick="event.stopPropagation(); window.handleUserFollowClick('${escapeHtml(foundUser.uid)}', '${userDisplayName.replace(/'/g, "\\'")}', '${userPhoto.replace(/'/g, "\\'")}', this)">
                                ${isFollowing ? 'Following' : 'Follow'}
                            </button>
                        ` : `<span style="font-size: 0.72rem; color: ${isPro ? '#f472b6' : 'var(--text-muted)'}; padding: 0.3rem 0.6rem; font-weight: 600;">Anda</span>`}
                    </div>
                `;
            }

            if (foundUser || finalItems.length > 0) {
                if (fullMappedResults.length > 0) {
                    setSearchPlaylist(fullMappedResults.slice(0, 30));
                }
                const dropdownItems = finalItems.slice(0, foundUser ? 6 : 8);
                window.lastSearchResults = dropdownItems.filter((item) => item.type === 'song');

                const musicItemsHtml = dropdownItems.map((item) => {
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

                searchDropdown.innerHTML = `${userItemHtml}${musicItemsHtml}`;

                if (typeof window.syncActiveSongUI === 'function') {
                    window.syncActiveSongUI();
                }

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
                if (isCodeSearch) {
                    searchDropdown.innerHTML = `<div style="padding: 1.25rem 1rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);"><span style="color: #38bdf8; font-weight: 600; font-family: monospace;">${escapeHtml(cleanQuery)}</span> tidak ditemukan.<br><span style="font-size: 0.74rem; opacity: 0.8;">Pastikan ID Akun sama persis (tanpa typo).</span></div>`;
                } else {
                    searchDropdown.innerHTML = '<div style="padding: 1rem; text-align: center; font-size: 0.75rem;">No results.</div>';
                }
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
};