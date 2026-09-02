// ------------------------------------------------------------------
// Rotating scholarship globe. Purely decorative/illustrative — the
// dots are not real geographic data, just an evenly-distributed
// sphere (Fibonacci distribution) with a random subset highlighted
// amber to represent "a scholarship." A DOM label tracks whichever
// highlighted dot is currently active, following its on-screen
// position as the globe rotates, then moves to a different dot every
// few seconds — making clear the amber dots represent something,
// not just decoration.
// ------------------------------------------------------------------

(function () {
  const canvas = document.getElementById('scholarship-globe');
  const label = document.getElementById('globe-tracking-label');
  if (!canvas || !label) return;
  const ctx = canvas.getContext('2d');

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

  const N = 500;
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }

  const labelPool = [
    '$5,000 STEM Award', '$2,500 First-Gen Grant', '$10,000 Merit Scholarship',
    '$1,000 Community Award', '$7,500 Leadership Fund', '$3,000 Arts Scholarship',
    '$15,000 National Award', '$2,000 Local Rotary Grant', '$4,500 Future Leaders',
    '$6,000 Women in STEM', '$1,500 Essay Contest', '$8,000 Athletic Scholarship',
  ];

  const highlightMap = {};
  const usedIndices = new Set();
  while (usedIndices.size < labelPool.length) {
    const idx = Math.floor(Math.random() * N);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      highlightMap[idx] = labelPool[usedIndices.size - 1];
    }
  }
  const highlightIdx = Object.keys(highlightMap).map(Number);

  let activeSlot = 0;
  let lastSwitch = 0;
  const SWITCH_MS = 2400;
  let angle = 0;
  let currentHighlightPositions = [];

  function drawFrame(now) {
    if (!lastSwitch) lastSwitch = now;
    if (now - lastSwitch > SWITCH_MS) {
      activeSlot = (activeSlot + 1) % highlightIdx.length;
      lastSwitch = now;
    }

    ctx.clearRect(0, 0, w, h);
    angle += 0.004;

    const R = Math.min(w, h) / 2 - 10;
    const cx = w / 2, cy = h / 2;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const activeI = highlightIdx[activeSlot];
    let activePx = null, activePy = null, activeVisible = false;
    currentHighlightPositions = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = p.x * cosA - p.z * sinA;
      const z = p.x * sinA + p.z * cosA;
      const yv = p.y;
      if (z < -0.15) continue;
      const px = cx + x * R, py = cy - yv * R;
      const depth = (z + 1) / 2;
      const isHighlight = !!highlightMap[i];
      const sz = isHighlight ? 3.5 : (1 + 1.3 * depth);
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle = isHighlight
        ? `rgba(255,193,7,${0.55 + 0.45 * depth})`
        : `rgba(255,255,255,${0.15 + 0.35 * depth})`;
      ctx.fill();
      if (isHighlight) currentHighlightPositions.push({ px, py, label: highlightMap[i] });
      if (i === activeI) { activePx = px; activePy = py; activeVisible = z >= -0.15; }
    }

    if (activeVisible) {
      label.textContent = highlightMap[activeI];
      label.style.display = 'block';
      const labelW = label.offsetWidth || 160;
      let left = activePx - labelW / 2;
      left = Math.max(4, Math.min(left, w - labelW - 4));
      let top = activePy - 56;
      if (top < 4) top = activePy + 20;
      label.style.left = left + 'px';
      label.style.top = top + 'px';
    } else {
      label.style.display = 'none';
    }

    requestAnimationFrame(drawFrame);
  }

  function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function findNearbyDot(x, y) {
    const HIT_RADIUS = 14;
    return currentHighlightPositions.find(d => Math.hypot(d.px - x, d.py - y) < HIT_RADIUS);
  }

  canvas.addEventListener('mousemove', (e) => {
    const pos = getEventPos(e);
    canvas.style.cursor = findNearbyDot(pos.x, pos.y) ? 'pointer' : 'default';
  });

  canvas.addEventListener('click', (e) => {
    const pos = getEventPos(e);
    const hit = findNearbyDot(pos.x, pos.y);
    if (hit) window.location.href = 'login.html';
  });

  requestAnimationFrame(drawFrame);
})();
