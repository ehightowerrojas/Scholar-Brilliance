// ------------------------------------------------------------------
// Shared avatar companion widget — a small floating avatar that
// idles with a continuous dance loop and bursts into a bigger
// celebration animation on command. Used on any page with an
// #avatar-companion element (Dashboard, Tracker, My Essays).
//
// Loaded once at page load, independent of each page's own data
// refresh cycle (e.g. dashboard.js/tracker.js reload their own data
// repeatedly — re-fetching/re-rendering the companion every time
// would be wasteful and could interrupt a celebration mid-play).
// ------------------------------------------------------------------

function renderCompanionFromData() {
  const el = document.getElementById('avatar-companion');
  if (!el || !window.__sbAvatarData) return;
  el.innerHTML = renderAvatarSVG(window.__sbAvatarData.speciesId, window.__sbAvatarData.tier, 64);
}

async function loadCompanionAvatar() {
  const el = document.getElementById('avatar-companion');
  if (!el) return;

  // If dashboard.js is on this page, it already fetches everything
  // this widget needs and will call renderCompanionFromData() itself
  // once its own data is ready — fetching independently here too
  // would just duplicate the same profile/achievements/levels
  // queries a second time on the same page load.
  if (window.__sbHasDashboardAvatarData) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;
  const uid = session.user.id;

  const [{ data: profile }, { data: earnedRows }, { data: achievements }, { data: levels }] = await Promise.all([
    supabaseClient.from('profiles').select('avatar_species_id').eq('id', uid).single(),
    supabaseClient.from('user_achievements').select('achievement_id').eq('user_id', uid),
    supabaseClient.from('achievements').select('id, points'),
    supabaseClient.from('levels').select('*').order('level_number'),
  ]);

  const pointsMap = Object.fromEntries((achievements || []).map(a => [a.id, a.points]));
  const totalXP = (earnedRows || []).reduce((sum, r) => sum + (pointsMap[r.achievement_id] || 0), 0);
  let currentLevel = { level_number: 1 };
  (levels || []).forEach(l => { if (totalXP >= l.xp_threshold) currentLevel = l; });
  const tier = evolutionTierFromLevel(currentLevel.level_number);

  el.innerHTML = renderAvatarSVG(profile?.avatar_species_id || 'raptor', tier, 64);
}

function celebrateCompanion() {
  const el = document.getElementById('avatar-companion');
  if (!el) return;
  el.classList.add('is-celebrating');
  setTimeout(() => el.classList.remove('is-celebrating'), 1400);
}

loadCompanionAvatar();
