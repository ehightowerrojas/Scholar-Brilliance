// ------------------------------------------------------------------
// The header itself is fully transparent, always — no background
// behind the row as a whole, at any scroll position. But its logo
// and Log in/Get started group are white text on a transparent
// backdrop, which reads fine over the dark hero but wouldn't over
// the site's lighter sections below. Rather than giving the whole
// header a background, each piece gets its own small rounded pill
// once scrolled far enough: a purple pill behind the logo, a white
// pill behind Log in/Get started — keeping the header itself
// see-through while each piece stays independently legible.
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