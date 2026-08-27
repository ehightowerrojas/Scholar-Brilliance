// ------------------------------------------------------------------
// Ambient constellation canvas for the hero background. Nodes fade
// in with a staggered delay, connect to nearby nodes with faint
// lines, then settle into a slow, restrained pulse. Purely
// decorative — sits behind the hero content, never intercepts
// clicks (pointer-events:none is set in CSS).
// ------------------------------------------------------------------

(function () {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w, h, dpr;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.offsetWidth;
    h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const NODE_COUNT = 26;
  const MAX_DIST = 170;
  const nodes = Array.from({ length: NODE_COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h * 0.8,
    r: Math.random() * 1.6 + 1.4,
    delay: Math.random() * 1200,
    phase: Math.random() * Math.PI * 2,
    born: reduceMotion, // reduced motion: everything is already "born", no stagger
  }));

  function drawFrame(elapsed) {
    ctx.clearRect(0, 0, w, h);

    nodes.forEach(n => { if (elapsed > n.delay) n.born = true; });

    // Connecting lines between nearby, already-visible nodes.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (!a.born || !b.born) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const op = (1 - dist / MAX_DIST) * 0.16;
          ctx.strokeStyle = `rgba(255,255,255,${op})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Nodes themselves, in amber, with a gentle pop-in and pulse.
    nodes.forEach(n => {
      if (!n.born) return;
      const age = elapsed - n.delay;
      const pop = reduceMotion ? 1 : Math.min(age / 400, 1);
      const pulse = reduceMotion ? 0.75 : Math.sin(elapsed / 1400 + n.phase) * 0.35 + 0.65;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * pop, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,193,7,${0.5 * pop * pulse + 0.2})`;
      ctx.fill();
    });
  }

  if (reduceMotion) {
    // Draw once and stop — no continuous animation loop for users who
    // have asked their system to reduce motion.
    drawFrame(999999);
    return;
  }

  const start = performance.now();
  function loop(now) {
    drawFrame(now - start);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
