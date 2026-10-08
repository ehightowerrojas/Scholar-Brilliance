// ------------------------------------------------------------------
// Scholar Brilliance — dark mode toggle
// The theme itself is already applied before this file loads, by a
// tiny inline script in <head> (reads localStorage, falls back to
// the OS preference) — that's what avoids a flash of the wrong
// theme on load. This file only wires up the click handler on any
// #theme-toggle button present on the page, and persists the choice.
// ------------------------------------------------------------------

(function () {
  const STORAGE_KEY = 'sb-theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      // Private browsing / storage disabled — theme still applies for this page view.
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  });
})();
