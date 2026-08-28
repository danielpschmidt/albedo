(function () {
    'use strict';

    function getStoredTheme() {
        try { return localStorage.getItem('theme'); } catch (e) { return null; }
    }
    function setStoredTheme(theme) {
        try { localStorage.setItem('theme', theme); } catch (e) { /* ignore */ }
    }
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    // Sofort anwenden, bevor die Seite gerendert wird (verhindert Aufblitzen).
    applyTheme(getStoredTheme() === 'dark' ? 'dark' : 'light');

    document.addEventListener('DOMContentLoaded', function () {
        const toggle = document.getElementById('themeToggle');
        if (!toggle) return;

        toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

        toggle.addEventListener('change', function () {
            const theme = toggle.checked ? 'dark' : 'light';
            applyTheme(theme);
            setStoredTheme(theme);
            document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
        });
    });
})();
