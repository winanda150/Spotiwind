const libraryCollections = {
    playlists: [
        {
            name: 'Liked Songs',
            details: 'Playlist • 123 songs',
            type: 'Playlist',
            featured: true,
            coverType: 'gradient',
            gradient: 'linear-gradient(135deg, #ff7a18 0%, #ff4d9a 45%, #7d5cf4 100%)',
            icon: 'heart',
        },
        {
            name: 'My Awesome Mix',
            details: 'Playlist • Winanda',
            type: 'Playlist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'Indie Vibes',
            details: 'Playlist • Winanda',
            type: 'Playlist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'Night Drive',
            details: 'Playlist • 48 songs',
            type: 'Playlist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1493225457124-cac638e3d7a0?auto=format&fit=crop&w=300&q=80',
        },
    ],
    artists: [
        {
            name: 'Ariana Grande',
            details: 'Artist • 124 tracks',
            type: 'Artist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'The Weeknd',
            details: 'Artist • 89 tracks',
            type: 'Artist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'Doja Cat',
            details: 'Artist • 67 tracks',
            type: 'Artist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'Billie Eilish',
            details: 'Artist • 95 tracks',
            type: 'Artist',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=300&q=80',
        },
    ],
    albums: [
        {
            name: 'Future Nostalgia',
            details: 'Album • Dua Lipa',
            type: 'Album',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'After Hours',
            details: 'Album • The Weeknd',
            type: 'Album',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'Amala',
            details: 'Album • Doja Cat',
            type: 'Album',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=300&q=80',
        },
        {
            name: 'When We All Fall Asleep',
            details: 'Album • Billie Eilish',
            type: 'Album',
            coverType: 'image',
            image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80',
        },
    ],
};

const libraryPageState = {
    listeners: [],
};

function createCoverMarkup(item) {
    if (item.coverType === 'gradient') {
        return `
            <div class="library-item__cover library-item__cover--gradient" style="background: ${item.gradient || 'linear-gradient(135deg, #ff7a18 0%, #ff4d9a 45%, #7d5cf4 100%)'};">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
                </svg>
            </div>
        `;
    }

    return `
        <img
            src="${item.image || ''}"
            alt="${item.name}"
            class="library-item__cover"
            loading="lazy"
        >
    `;
}

function createLibraryCard(item) {
    const badge = item.type ? `<span class="library-item__badge">${item.type}</span>` : '';
    const featuredClass = item.featured ? 'library-item--featured' : '';

    return `
        <article class="library-item ${featuredClass}" tabindex="0" aria-label="${item.name}">
            ${createCoverMarkup(item)}
            <div class="library-item__info">
                <div class="library-item__header">
                    <span class="library-item__name">${item.name}</span>
                    ${badge}
                </div>
                <span class="library-item__details">${item.details}</span>
            </div>
        </article>
    `;
}

function renderLibraryContent(filter = 'playlists') {
    const container = document.getElementById('libraryContent');
    if (!container) return;

    const selectedItems = libraryCollections[filter] || libraryCollections.playlists;
    container.innerHTML = selectedItems.map(createLibraryCard).join('');
}

function initializeFilterButtons() {
    const filterButtons = document.querySelectorAll('.library-filters .filter-btn');
    const onFilterClick = (event) => {
        const selectedButton = event.currentTarget;
        const filter = selectedButton.dataset.filter;

        filterButtons.forEach((button) => {
            button.classList.toggle('active', button === selectedButton);
        });

        renderLibraryContent(filter);
    };

    filterButtons.forEach((button) => {
        button.removeEventListener('click', onFilterClick);
        button.addEventListener('click', onFilterClick);
        libraryPageState.listeners.push({ element: button, handler: onFilterClick });
    });

    const addPlaylistButton = document.querySelector('.add-playlist-btn');
    if (addPlaylistButton && !addPlaylistButton.dataset.libraryBound) {
        addPlaylistButton.dataset.libraryBound = 'true';
        const onCreatePlaylistClick = () => {
            if (typeof window.showToast === 'function') {
                window.showToast('Playlist baru siap dibuat.');
            }
        };
        addPlaylistButton.addEventListener('click', onCreatePlaylistClick);
        libraryPageState.listeners.push({ element: addPlaylistButton, handler: onCreatePlaylistClick });
    }

    renderLibraryContent('playlists');
}

export function initLibraryPage() {
    initializeFilterButtons();
}

export function cleanupLibraryPage() {
    libraryPageState.listeners.forEach(({ element, handler }) => {
        if (element) {
            element.removeEventListener('click', handler);
        }
    });
    libraryPageState.listeners = [];
}
