// ------------------------------------------------------------------
// Homepage motion: content settles into place as it scrolls into
// view, and headline stats count up from zero. Built with layered
// fallbacks so it degrades safely rather than ever leaving content
// invisible:
//   1. .reveal only starts hidden once .js-ready is added below —
//      if this script fails to run at all, content stays visible.
//   2. IntersectionObserver is the primary trigger.
//   3. A manual scroll-position check runs as backup, in case
//      IntersectionObserver itself doesn't fire in a given browser.
//   4. A hard timeout reveals everything regardless, so nothing can
//      stay invisible indefinitely no matter what goes wrong above.
// ------------------------------------------------------------------

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js-ready');

  const revealEls = Array.from(document.querySelectorAll('.reveal'));

  function revealAll() {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  function isInView(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
  }

  function manualCheck() {
    revealEls.forEach(el => {
      if (!el.classList.contains('is-visible') && isInView(el)) {
        el.classList.add('is-visible');
      }
    });
  }

  if (reduceMotion) {
    revealAll();
  } else {
    // Primary: IntersectionObserver.
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      revealEls.forEach(el => revealObserver.observe(el));
    }

    // Backup: manual check on scroll/resize, in case the observer
    // above doesn't fire for any reason in a given browser.
    window.addEventListener('scroll', manualCheck, { passive: true });
    window.addEventListener('resize', manualCheck, { passive: true });
    manualCheck(); // catch anything already in view at load

    // Last resort: never leave content invisible indefinitely.
    setTimeout(revealAll, 4000);
  }

  // Animated stat counters
  const counters = document.querySelectorAll('[data-count-to]');
  if (reduceMotion) {
    counters.forEach(el => { el.textContent = el.dataset.countTo; });
    return;
  }

  function animateCounter(el) {
    const target = Number(el.dataset.countTo);
    const duration = 1300;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const countedFlag = new WeakSet();
  function countAnyVisible() {
    counters.forEach(el => {
      if (!countedFlag.has(el) && isInView(el)) {
        countedFlag.add(el);
        animateCounter(el);
      }
    });
  }

  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !countedFlag.has(entry.target)) {
          countedFlag.add(entry.target);
          counterObserver.unobserve(entry.target);
          animateCounter(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(el => counterObserver.observe(el));
  }

  window.addEventListener('scroll', countAnyVisible, { passive: true });
  countAnyVisible();

  // Last resort for counters too.
  setTimeout(() => {
    counters.forEach(el => {
      if (!countedFlag.has(el)) {
        countedFlag.add(el);
        el.textContent = el.dataset.countTo;
      }
    });
  }, 4000);
})();
