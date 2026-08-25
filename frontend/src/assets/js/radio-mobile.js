const showRadioToast = (message) => {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 2200);
};

export const initRadioPage = () => {
    const stationCards = document.querySelectorAll('.radio-station-card');
    stationCards.forEach((card) => {
        card.addEventListener('click', () => {
            const stationName = card.dataset.station || 'Radio station';
            showRadioToast(`${stationName} is playing`);
        });
    });
};