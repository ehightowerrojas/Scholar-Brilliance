// ------------------------------------------------------------------
// The header is fully transparent by default so it blends seamlessly
// with the hero behind it. But its logo/link text is white — once
// the user scrolls past the dark hero into the site's lighter
// sections, a transparent header would make that white text
// unreadable. This adds a solid background once scrolled far enough
// that legibility would otherwise break, removing it again if the
// user scrolls back to the top.
// ------------------------------------------------------------------

(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  function onScroll() {
    if (window.scrollY > 80) {
      nav.classList.add('is-scrolled');
    } else {
      nav.classList.remove('is-scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
