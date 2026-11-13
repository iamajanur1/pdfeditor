// Paprify appearance preferences are independent of PDF editing state.
(() => {
    const STORAGE_KEY = 'paprify.color-theme';
    const root = document.documentElement;
    const toggles = document.querySelectorAll('.paprify-theme-toggle');
    const browserTheme = window.matchMedia('(prefers-color-scheme: dark)');

    function storedTheme() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            // The editor remains usable when the browser blocks storage.
            return null;
        }
    }

    function saveTheme(theme) {
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            // Appearance is still updated for the current page.
        }
    }

    function applyTheme(theme) {
        const isDark = theme === 'dark';
        root.dataset.theme = isDark ? 'dark' : 'light';
        root.style.colorScheme = isDark ? 'dark' : 'light';

        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', isDark ? '#15263f' : '#ffffff');

        toggles.forEach((toggle) => {
            const nextMode = isDark ? 'light' : 'dark';
            const label = `Switch to ${nextMode} mode`;

            toggle.setAttribute('aria-label', label);
            toggle.setAttribute('title', label);
            toggle.setAttribute('aria-pressed', String(isDark));
            toggle.querySelector('.paprify-theme-toggle__icon').textContent = isDark ? '☀' : '☾';
        });
    }

    const saved = storedTheme();
    applyTheme(saved === 'light' || saved === 'dark'
        ? saved
        : browserTheme.matches ? 'dark' : 'light');

    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
            saveTheme(nextTheme);
        });
    });

    // Respect system preference until the user chooses a mode explicitly.
    browserTheme.addEventListener?.('change', (event) => {
        if (!storedTheme()) {
            applyTheme(event.matches ? 'dark' : 'light');
        }
    });
})();
