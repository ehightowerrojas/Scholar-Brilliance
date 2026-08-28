// ------------------------------------------------------------------
// The header is fully transparent, always — no background, at any
// scroll position. Its logo text and "Log in" link are white, which
// reads fine over the dark hero but would go unreadable once
// scrolled over the site's lighter sections below. Rather than
// adding a background back in, this swaps just that text to dark ink
// once scrolled far enough, keeping the header itself see-through
// the whole time.
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