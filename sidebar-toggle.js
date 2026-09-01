// ------------------------------------------------------------------
// Mobile sidebar toggle — shared across every authenticated page so
// this logic exists in exactly one place instead of being duplicated
// in every page's own script.
// ------------------------------------------------------------------
(function () {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('app-sidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => sidebar.classList.toggle('is-open'));
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('is-open') && !sidebar.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
      sidebar.classList.remove('is-open');
    }
  });
})();
