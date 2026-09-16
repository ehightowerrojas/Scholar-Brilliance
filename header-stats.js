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

  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - daysSinceMonday);
  const mondayStr = monday.toISOString().slice(0, 10);
  await supabaseClient.from('weekly_activity').upsert(
    { user_id: userId, week_start: mondayStr },
    { onConflict: 'user_id,week_start', ignoreDuplicates: true }
  );

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const [{ data: activityRows }, { data: earnedRows }, { data: achievements }] = await Promise.all([
    supabaseClient.from('weekly_activity').select('week_start').eq('user_id', userId).gte('week_start', twelveWeeksAgo.toISOString().slice(0, 10)),
    supabaseClient.from('user_achievements').select('achievement_id').eq('user_id', userId),
    supabaseClient.from('achievements').select('id, points'),
  ]);

  function weekStr(d) {
    const date = new Date(d);
    const dow = date.getDay();
    const sinceMonday = dow === 0 ? 6 : dow - 1;
    date.setDate(date.getDate() - sinceMonday);
    return date.toISOString().slice(0, 10);
  }

  const activeWeeks = new Set((activityRows || []).map(r => r.week_start));
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const cursor = new Date(today);
  while (activeWeeks.has(weekStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }

  const pointsMap = Object.fromEntries((achievements || []).map(a => [a.id, a.points]));
  const totalXP = (earnedRows || []).reduce((sum, r) => sum + (pointsMap[r.achievement_id] || 0), 0);

  streakEl.textContent = `${streak} week${streak === 1 ? '' : 's'}`;
  xpEl.textContent = totalXP.toLocaleString();
})();
