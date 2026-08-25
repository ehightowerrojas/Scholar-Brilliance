// ------------------------------------------------------------------
// Shared "quest map" renderer, used on the homepage (demo numbers)
// and the dashboard (real progress). The gold progress line is
// positioned by measuring the actual on-screen curve length via
// SVG geometry APIs — not a hand-picked percentage guess — so it is
// mathematically guaranteed to land exactly on the dotted path.
// ------------------------------------------------------------------

function renderQuestMap(svg, currentIndex) {
  const segments = [0, 1, 2].map(i => svg.querySelector(`#${svg.id}-seg-${i}`));
  if (segments.some(s => !s)) return; // markup not ready

  const lengths = segments.map(seg => seg.getTotalLength());
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const doneLength = lengths.slice(0, currentIndex).reduce((a, b) => a + b, 0);
  const fraction = totalLength > 0 ? doneLength / totalLength : 0;

  const fill = svg.querySelector('.quest-path-fill');
  const fillLength = fill.getTotalLength();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  fill.style.strokeDasharray = `${fillLength}`;

  if (reduceMotion) {
    fill.style.strokeDashoffset = `${fillLength * (1 - fraction)}`;
  } else {
    fill.style.strokeDashoffset = `${fillLength}`; // start fully hidden
    fill.getBoundingClientRect(); // force reflow so the transition below actually animates
    fill.style.transition = 'stroke-dashoffset 1.6s ease';
    requestAnimationFrame(() => {
      fill.style.strokeDashoffset = `${fillLength * (1 - fraction)}`;
    });
  }

  svg.querySelectorAll('.quest-node').forEach((node, i) => {
    node.classList.remove('is-done', 'is-live', 'is-next');
    node.classList.add(i < currentIndex ? 'is-done' : i === currentIndex ? 'is-live' : 'is-next');
  });
}

// Auto-init the homepage's demo quest map if it's present on this page.
// Keeping this here (rather than an inline <script> in index.html)
// means no page needs inline JavaScript, which lets the site run a
// much stricter Content-Security-Policy.
document.addEventListener('DOMContentLoaded', () => {
  const homeSvg = document.getElementById('quest-svg-home');
  if (homeSvg) renderQuestMap(homeSvg, 1); // demo: currently on "Apply"
});
