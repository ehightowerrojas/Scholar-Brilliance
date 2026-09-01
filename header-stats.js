// ------------------------------------------------------------------
// Populates the header's streak/XP stats on every authenticated page
// except the dashboard (which already computes these itself from
// data it fetches anyway — running this there too would just be a
// redundant duplicate query). Kept as its own shared script so this
// logic exists in one place rather than being copy-pasted into every
// page's individual .js file.
// ------------------------------------------------------------------
(async function () {
  const streakEl = document.getElementById('header-streak');
  const xpEl = document.getElementById('header-xp');
  if (!streakEl || !xpEl) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;
  const userId = session.user.id;

  const todayStr = new Date().toISOString().slice(0, 10);
  await supabaseClient.from('daily_activity').upsert(
    { user_id: userId, activity_date: todayStr },
    { onConflict: 'user_id,activity_date', ignoreDuplicates: true }
  );

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [{ data: activityRows }, { data: earnedRows }, { data: achievements }] = await Promise.all([
    supabaseClient.from('daily_activity').select('activity_date').eq('user_id', userId).gte('activity_date', sixtyDaysAgo.toISOString().slice(0, 10)),
    supabaseClient.from('user_achievements').select('achievement_id').eq('user_id', userId),
    supabaseClient.from('achievements').select('id, points'),
  ]);

  const activeDates = new Set((activityRows || []).map(r => r.activity_date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  function dateStr(d) { return d.toISOString().slice(0, 10); }

  let streak = 0;
  const cursor = new Date(today);
  while (activeDates.has(dateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const pointsMap = Object.fromEntries((achievements || []).map(a => [a.id, a.points]));
  const totalXP = (earnedRows || []).reduce((sum, r) => sum + (pointsMap[r.achievement_id] || 0), 0);

  streakEl.textContent = `${streak} day${streak === 1 ? '' : 's'}`;
  xpEl.textContent = totalXP.toLocaleString();
})();
