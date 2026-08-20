/**
 * library-mobile.js
 * 
 * Handles all interactive logic for the Library page.
 * This module is dynamically imported by mobile-script.js
 * when the user navigates to the library page.
 */

/**
 * Initializes the Library page functionality.
 * Sets up filter button click handlers and any future library-specific logic.
 */
export function initLibraryPage() {
    initializeFilterButtons();
}

/**
 * Sets up click event listeners on the library filter buttons (Playlists, Artists, Albums).
 * Toggles the 'active' class between filter buttons.
 */
function initializeFilterButtons() {
    const filterButtons = document.querySelectorAll('.library-filters .filter-btn');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove 'active' from all filter buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Set 'active' on the clicked button
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            // Future: filter library content based on the selected filter
            console.log(`Library filter selected: ${filter}`);
        });
    });
}

/**
 * Cleanup function to be called when navigating away from the library page.
 * Currently a placeholder for future cleanup needs (e.g., removing listeners, 
 * cancelling ongoing requests).
 */
export function cleanupLibraryPage() {
    // Placeholder for future cleanup logic
}
