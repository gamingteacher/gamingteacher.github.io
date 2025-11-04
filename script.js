document.addEventListener('DOMContentLoaded', function () {
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active', 'text-red', 'border-red'));
            tabs.forEach(t => t.classList.add('text-grey', 'hover:border-red', 'hover:text-red', 'border-transparent'));

            // Add active class to the clicked tab
            this.classList.add('active', 'text-red', 'border-red');
            this.classList.remove('text-grey', 'hover:border-red', 'hover:text-red', 'border-transparent');

            // Hide all tab contents
            tabContents.forEach(content => {
                content.classList.add('hidden');
            });

            // Show the corresponding tab content
            const tabId = this.getAttribute('data-tab');
            const activeContent = document.getElementById(tabId);
            if (activeContent) {
                activeContent.classList.remove('hidden');
            }
        });
    });

    // Show the first tab by default
    const defaultTab = document.querySelector('.tab-button[data-tab="gaming-teacher"]');
    if (defaultTab) {
        defaultTab.click();
    }
});