// Load sidebar component into all pages
document.addEventListener('DOMContentLoaded', function() {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (sidebarContainer) {
        fetch('sidebar.html')
            .then(response => response.text())
            .then(html => {
                sidebarContainer.innerHTML = html;
            })
            .catch(error => {
                console.error('Error loading sidebar:', error);
            });
    }
    
    // Highlight active navigation button based on current page
    highlightActiveNav();
});

function highlightActiveNav() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navButtons = document.querySelectorAll('.nav-button');
    
    navButtons.forEach(button => {
        const href = button.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}
