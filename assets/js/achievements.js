// ------------------------------------------------------------------
// Achievements page logic
// ------------------------------------------------------------------

const ICONS = {
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  user:   '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  grid:   '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/>',
  file:   '<path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/>',
  send:   '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
  badge:  '<circle cx="12" cy="9" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/>',
  crown:  '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z"/>',
  trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4z"/><path d="M6 6H4a2 2 0 0 0 2 4"/><path d="M18 6h2a2 2 0 0 1-2 4"/><path d="M10 15h4v3h-4z"/><path d="M8 21h8"/>',
};

function iconSvg(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ICONS.badge}</svg>`;
}

function renderCard(achievement, earned) {
  return `
    <div class="achv-card ${earned ? 'earned' : 'locked'}" data-id="${achievement.id}">
      <div class="achv-icon">${iconSvg(achievement.icon)}</div>
      <h3>${achievement.title}</h3>
      <p>${achievement.description}</p>
      <div class="achv-foot">
        <span>${achievement.points} pts</span>
        <span class="achv-badge-earned">${earned ? 'Earned ✓' : 'Locked'}</span>
      </div>
      <button class="achv-demo-btn" data-toggle="${achievement.id}">
        ${earned ? 'Un-earn (demo)' : 'Mark earned (demo)'}
      </button>
    </div>
  `;
}

async function loadAchievements() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  const userId = session.user.id;

  const [{ data: achievements, error: achErr }, { data: earnedRows, error: earnedErr }, { data: levels, error: levelErr }] =
    await Promise.all([
      supabaseClient.from('achievements').select('*').order('sort_order'),
      supabaseClient.from('user_achievements').select('achievement_id').eq('user_id', userId),
      supabaseClient.from('levels').select('*').order('level_number'),
    ]);

  if (achErr || earnedErr || levelErr) {
    console.error(achErr || earnedErr || levelErr);
    document.getElementById('level-heading').textContent = 'Could not load achievements.';
    return;
  }

  const earnedIds = new Set((earnedRows || []).map(r => r.achievement_id));
  const totalXP = achievements
    .filter(a => earnedIds.has(a.id))
    .reduce((sum, a) => sum + a.points, 0);

  renderLevel(totalXP, levels);
  renderGrids(achievements, earnedIds);
  wireDemoButtons(userId);
}

function renderLevel(totalXP, levels) {
  let current = levels[0];
  let next = null;
  for (let i = 0; i < levels.length; i++) {
    if (totalXP >= levels[i].xp_threshold) {
      current = levels[i];
      next = levels[i + 1] || null;
    }
  }

  document.getElementById('level-heading').textContent = `Level ${current.level_number}: ${current.title.toUpperCase()}`;
  document.getElementById('level-xp').textContent = `${totalXP.toLocaleString()} points`;

  if (next) {
    const remaining = next.xp_threshold - totalXP;
    document.getElementById('level-remaining').textContent = `${remaining.toLocaleString()} points to Level ${next.level_number}`;
    const span = next.xp_threshold - current.xp_threshold;
    const progressed = totalXP - current.xp_threshold;
    document.getElementById('level-fill').style.width = `${Math.min(100, (progressed / span) * 100)}%`;
  } else {
    document.getElementById('level-remaining').textContent = 'Max level reached';
    document.getElementById('level-fill').style.width = '100%';
  }
}

function renderGrids(achievements, earnedIds) {
  const earlyWins = achievements.filter(a => a.category === 'early_wins');
  const milestones = achievements.filter(a => a.category === 'application_milestones');

  document.getElementById('early-wins-grid').innerHTML =
    earlyWins.map(a => renderCard(a, earnedIds.has(a.id))).join('');
  document.getElementById('milestones-grid').innerHTML =
    milestones.map(a => renderCard(a, earnedIds.has(a.id))).join('');
}

function wireDemoButtons(userId) {
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const achievementId = btn.dataset.toggle;
      const card = btn.closest('.achv-card');
      const isEarned = card.classList.contains('earned');

      btn.disabled = true;
      if (isEarned) {
        await supabaseClient.from('user_achievements')
          .delete()
          .eq('user_id', userId)
          .eq('achievement_id', achievementId);
      } else {
        await supabaseClient.from('user_achievements')
          .insert({ user_id: userId, achievement_id: achievementId });
      }
      loadAchievements(); // reload everything so XP/level stay in sync
    });
  });
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
});

loadAchievements();
