// ------------------------------------------------------------------
// Dashboard logic
// ------------------------------------------------------------------

let userId = null;
let userSession = null;

function fmtMoney(n) {
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function daysAgo(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / 86400000;
}

async function loadDashboard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  userSession = session;
  userId = session.user.id;

  const name = session.user.user_metadata?.full_name || session.user.email;
  document.getElementById('welcome-heading').textContent = `Welcome back, ${name}.`;

  if (session.user.user_metadata?.full_name) {
    awardAchievement('profile_builder', userId);
  }

  const [{ data: scholarships, error: schErr }, { data: earnedRows }, { data: achievements }, { data: levels }] =
    await Promise.all([
      supabaseClient.from('scholarships').select('*').eq('user_id', userId),
      supabaseClient.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId).order('earned_at', { ascending: false }),
      supabaseClient.from('achievements').select('*'),
      supabaseClient.from('levels').select('*').order('level_number'),
    ]);

  if (schErr) console.error(schErr);

  renderGoal(session, scholarships || []);
  renderDeadlines(scholarships || []);
  renderStats(scholarships || []);
  renderAchievements(earnedRows || [], achievements || [], levels || []);
  renderActivity(scholarships || []);
}

// ---- Progress toward financial goal ----
function renderGoal(session, scholarships) {
  const goal = session.user.user_metadata?.financial_goal;
  const wonAmount = scholarships.filter(s => s.outcome === 'won').reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const inProgressAmount = scholarships.filter(s => s.status !== 'submitted').reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const submittedAmount = scholarships.filter(s => s.status === 'submitted' && !s.outcome).reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const el = document.getElementById('goal-content');

  if (!goal) {
    el.innerHTML = `
      <p style="color:var(--muted); font-size:13.5px; margin-bottom:14px;">Set a target so you can track progress toward it.</p>
      <div style="display:flex; gap:8px;">
        <input type="number" id="goal-input" placeholder="35000" min="0" style="flex:1; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--bg); color:var(--fg);">
        <button class="btn btn-gold" id="save-goal-btn" style="padding:10px 18px;">Set</button>
      </div>
    `;
    document.getElementById('save-goal-btn').addEventListener('click', async () => {
      const val = Number(document.getElementById('goal-input').value);
      if (!val || val <= 0) return;
      await supabaseClient.auth.updateUser({ data: { financial_goal: val } });
      await awardAchievement('goal_setter', userId);
      loadDashboard();
    });
    return;
  }

  const pct = Math.min(100, (wonAmount / goal) * 100);
  el.innerHTML = `
    <div style="font-family:var(--font-mono); font-size:13px; color:var(--muted); display:flex; justify-content:space-between;">
      <span>Current: ${fmtMoney(wonAmount)}</span><span>Goal: ${fmtMoney(goal)}</span>
    </div>
    <div class="level-track" style="margin-top:10px;"><div class="level-fill" style="width:${pct}%;"></div></div>
    <div class="goal-chip-row">
      <div class="goal-chip"><span>In Progress</span><strong>${fmtMoney(inProgressAmount)}</strong></div>
      <div class="goal-chip"><span>Submitted</span><strong>${fmtMoney(submittedAmount)}</strong></div>
      <div class="goal-chip"><span>Won</span><strong>${fmtMoney(wonAmount)}</strong></div>
    </div>
  `;
}

// ---- Upcoming deadlines ----
function renderDeadlines(scholarships) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = scholarships
    .filter(s => s.status !== 'submitted' && s.deadline && s.deadline >= today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 4);

  const el = document.getElementById('deadlines-content');
  if (upcoming.length === 0) {
    el.innerHTML = `<p class="dash-empty">No upcoming deadlines at the moment.</p>`;
    return;
  }
  el.innerHTML = upcoming.map(s => `
    <div class="deadline-row">
      <span>${s.title}</span>
      <span class="deadline-date">${fmtDate(s.deadline)}</span>
    </div>
  `).join('');
}

// ---- Quick stats ----
function renderStats(scholarships) {
  const inProgress = scholarships.filter(s => s.status !== 'submitted').length;
  const submitted = scholarships.filter(s => s.status === 'submitted' && !s.outcome).length;
  const won = scholarships.filter(s => s.outcome === 'won').length;
  const notSelected = scholarships.filter(s => s.outcome === 'not_selected').length;
  const decided = won + notSelected;
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

  document.getElementById('stats-content').innerHTML = `
    <div class="stat-grid-mini">
      <div><strong>${inProgress}</strong><span>In Progress</span></div>
      <div><strong>${submitted}</strong><span>Submitted</span></div>
      <div><strong>${won}</strong><span>Won</span></div>
      <div><strong>${winRate}%</strong><span>Win Rate</span></div>
    </div>
  `;
}

// ---- Recent achievements + level ----
function renderAchievements(earnedRows, achievements, levels) {
  const catalog = Object.fromEntries(achievements.map(a => [a.id, a]));
  const totalXP = earnedRows.reduce((sum, r) => sum + (catalog[r.achievement_id]?.points || 0), 0);

  let current = levels[0] || { level_number: 1, title: 'Scholarship Rookie' };
  for (const lvl of levels) if (totalXP >= lvl.xp_threshold) current = lvl;

  const recent = earnedRows.slice(0, 4);
  const el = document.getElementById('achievements-content');

  const levelLine = `<div class="level-line">Level ${current.level_number}: <strong>${current.title.toUpperCase()}</strong> · ${totalXP.toLocaleString()} pts</div>`;

  if (recent.length === 0) {
    el.innerHTML = levelLine + `<p class="dash-empty">No badges earned yet — start by adding a scholarship to your tracker!</p>`;
    return;
  }

  el.innerHTML = levelLine + recent.map(r => {
    const a = catalog[r.achievement_id];
    if (!a) return '';
    return `<div class="recent-achv-row"><span>${a.title}</span><span class="recent-achv-pts">+${a.points}</span></div>`;
  }).join('');
}

// ---- Recent activity ----
function renderActivity(scholarships) {
  const recent = scholarships
    .filter(s => daysAgo(s.updated_at) <= 14)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  const el = document.getElementById('activity-content');
  if (recent.length === 0) {
    el.innerHTML = `<p class="dash-empty">No recent activity in the last 14 days. Start by saving or applying to scholarships!</p>`;
    return;
  }

  el.innerHTML = recent.map(s => {
    const isNew = Math.abs(new Date(s.created_at) - new Date(s.updated_at)) < 2000;
    const verb = isNew ? 'Added' : (s.status === 'submitted' ? 'Submitted' : 'Updated');
    return `<div class="activity-row"><span>${verb} <strong>${s.title}</strong></span></div>`;
  }).join('');
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
});

loadDashboard();
