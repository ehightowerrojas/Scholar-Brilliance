// ------------------------------------------------------------------
// Dashboard logic
// ------------------------------------------------------------------

let userId = null;
let userSession = null;

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

  const [{ data: scholarships, error: schErr }, { data: earnedRows }, { data: achievements }, { data: levels }, { data: profile }] =
    await Promise.all([
      supabaseClient.from('scholarships').select('*').eq('user_id', userId),
      supabaseClient.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId).order('earned_at', { ascending: false }),
      supabaseClient.from('achievements').select('*'),
      supabaseClient.from('levels').select('*').order('level_number'),
      supabaseClient.from('profiles').select('financial_goal, goal_source, avatar_species_id').eq('id', userId).single(),
    ]);

  if (schErr) console.error(schErr);
  const rows = scholarships || [];

  renderWelcomeAvatar(profile, earnedRows || [], achievements || [], levels || []);
  renderWelcomeSubtext(rows);
  renderNextStep(profile, rows);
  renderQuestSection(rows, earnedRows || [], achievements || []);
  renderGoal(profile, rows);
  renderStats(rows);
  renderDeadlines(rows);
  renderAchievements(earnedRows || [], achievements || [], levels || []);
  renderActivity(rows);
}

// ---- Encouraging one-liner under the heading ----
function renderWelcomeAvatar(profile, earnedRows, achievements, levels) {
  const pointsMap = Object.fromEntries(achievements.map(a => [a.id, a.points]));
  const totalXP = earnedRows.reduce((sum, r) => sum + (pointsMap[r.achievement_id] || 0), 0);
  let currentLevel = { level_number: 1 };
  levels.forEach(l => { if (totalXP >= l.xp_threshold) currentLevel = l; });
  const tier = evolutionTierFromLevel(currentLevel.level_number);
  document.getElementById('welcome-avatar').innerHTML = renderAvatarSVG(profile?.avatar_species_id || 'raptor', tier, 56);
}

function renderWelcomeSubtext(rows) {
  const won = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').length;
  const inFlight = rows.filter(s => s.status === 'submitted' || s.status === 'funds_received').length;
  const el = document.getElementById('welcome-subtext');

  if (won > 0) {
    el.textContent = `You've won ${won} scholarship${won > 1 ? 's' : ''} so far — that momentum is real. Let's keep it going.`;
  } else if (inFlight > 0) {
    el.textContent = `You have ${inFlight} application${inFlight > 1 ? 's' : ''} waiting on a decision. Nice work getting them in.`;
  } else if (rows.length > 0) {
    el.textContent = `You're building your pipeline — every scholarship you add is a step closer to funding.`;
  } else {
    el.textContent = `Let's find your first scholarship match and get your pipeline started.`;
  }
}

// ---- Smart, contextual "next step" CTA ----
function renderNextStep(profile, rows) {
  const goal = profile?.financial_goal;
  const total = rows.length;
  const savedOrWorking = rows.filter(s => s.status === 'saved' || s.status === 'working').length;
  const inFlight = rows.filter(s => s.status === 'submitted' || s.status === 'funds_received').length;
  const won = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').length;

  let step;
  if (!goal) {
    step = {
      title: 'Set your first financial goal',
      body: "Give yourself a target — it turns every application into visible progress toward something real.",
      cta: 'Set a goal',
      href: '#goal-content',
    };
  } else if (total === 0) {
    step = {
      title: 'Find your first scholarship',
      body: "Nothing in your tracker yet. Browse a few matches to get your pipeline started.",
      cta: 'Browse scholarships',
      href: 'browse.html',
    };
  } else if (savedOrWorking > 0 && inFlight === 0) {
    step = {
      title: `You have ${savedOrWorking} application${savedOrWorking > 1 ? 's' : ''} ready to move`,
      body: "Submitting is the biggest step in the whole process — even one this week keeps things moving.",
      cta: 'Open your tracker',
      href: 'tracker.html',
    };
  } else if (inFlight > 0 && won === 0) {
    step = {
      title: `${inFlight} application${inFlight > 1 ? 's are' : ' is'} pending a decision`,
      body: "While you wait to hear back, it's a great time to add a few more scholarships to your pipeline.",
      cta: 'Browse more scholarships',
      href: 'browse.html',
    };
  } else {
    step = {
      title: `🎉 You've won ${won} scholarship${won > 1 ? 's' : ''}!`,
      body: "Keep the streak going — find your next match and add it to your tracker.",
      cta: 'Browse scholarships',
      href: 'browse.html',
    };
  }

  document.getElementById('next-step-title').textContent = step.title;
  document.getElementById('next-step-body').textContent = step.body;
  const ctaEl = document.getElementById('next-step-cta');
  ctaEl.textContent = step.cta;
  ctaEl.href = step.href;
}

// ---- Quest map: real progress computed from actual tracker data ----
function renderQuestSection(rows, earnedRows, achievements) {
  const catalog = Object.fromEntries(achievements.map(a => [a.id, a]));
  const totalXP = earnedRows.reduce((sum, r) => sum + (catalog[r.achievement_id]?.points || 0), 0);
  document.getElementById('quest-xp').textContent = `${totalXP.toLocaleString()} XP`;

  const inProgress = rows.filter(s => s.status === 'saved' || s.status === 'working').length;
  const submitted = rows.filter(s => s.status === 'submitted' && !s.outcome).length;
  const won = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received');
  const wonAmount = won.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  document.getElementById('quest-in-progress').textContent = `${inProgress} in progress`;
  document.getElementById('quest-won').textContent = `${won.length} won · ${fmtMoney(wonAmount)} raised`;

  // -1 = nothing tracked yet at all — no node should glow as "live"
  // before the student has actually started their first quest.
  // 0 = Explore, 1 = Apply, 2 = Win (waiting), 3 = Fund (already won)
  let step = rows.length === 0 ? -1 : 0;
  if (won.length > 0) step = 3;
  else if (submitted > 0) step = 2;
  else if (inProgress > 0) step = 1;

  renderQuestMap(document.getElementById('quest-svg-dashboard'), step);

  const startPrompt = document.getElementById('quest-start-prompt');
  if (startPrompt) startPrompt.style.display = rows.length === 0 ? 'flex' : 'none';
}

// ---- Progress toward financial goal ----
function renderGoal(profile, rows) {
  const goal = profile?.financial_goal;
  const goalSource = profile?.goal_source;
  const wonAmount = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const inProgressAmount = rows.filter(s => s.status === 'saved' || s.status === 'working').reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const submittedAmount = rows.filter(s => s.status === 'submitted' && !s.outcome).reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const el = document.getElementById('goal-content');

  function showEditor(currentValue) {
    el.innerHTML = `
      <p style="color:var(--muted); font-size:13.5px; margin-bottom:14px;">Set a target so you can track progress toward it. You can change this any time.</p>
      <div style="display:flex; gap:8px;">
        <input type="number" id="goal-input" placeholder="35000" min="0" value="${currentValue || ''}" style="flex:1; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--white); color:var(--ink);">
        <button class="btn btn-gold" id="save-goal-btn" style="padding:10px 18px;">${currentValue ? 'Save' : 'Set'}</button>
        ${currentValue ? '<button class="btn btn-line" id="cancel-goal-edit-btn" style="padding:10px 18px;">Cancel</button>' : ''}
      </div>
    `;
    document.getElementById('save-goal-btn').addEventListener('click', async () => {
      const val = Number(document.getElementById('goal-input').value);
      if (!val || val <= 0) return;
      await supabaseClient.from('profiles').update({ financial_goal: val, goal_source: 'self' }).eq('id', userId);
      await awardAchievement('goal_setter', userId);
      loadDashboard();
    });
    const cancelBtn = document.getElementById('cancel-goal-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => loadDashboard());
  }

  if (!goal) {
    showEditor(null);
    return;
  }

  const pct = Math.min(100, (wonAmount / goal) * 100);
  const sourceNote = goalSource === 'staff'
    ? '<span class="dash-empty" style="display:block; margin-top:10px;">🎓 Set by your school</span>'
    : '';

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:26px; flex-wrap:wrap;">
      <div style="position:relative; width:120px; height:120px; flex-shrink:0;">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="${radius}" fill="none" stroke="var(--line)" stroke-width="12"/>
          <circle cx="60" cy="60" r="${radius}" fill="none" stroke="var(--amber)" stroke-width="12"
            stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 1s ease;"/>
        </svg>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column;">
          <span style="font-family:var(--font-accent); font-weight:800; font-size:26px; color:var(--ink);">${Math.round(pct)}%</span>
        </div>
      </div>
      <div style="flex:1; min-width:180px;">
        <span class="goal-hero-of">of the way to ${fmtMoney(goal)}</span>
        ${sourceNote}
        <div class="goal-chip-row" style="margin-top:14px;">
          <div class="goal-chip"><span>In Progress</span><strong>${fmtMoney(inProgressAmount)}</strong></div>
          <div class="goal-chip"><span>Submitted</span><strong>${fmtMoney(submittedAmount)}</strong></div>
          <div class="goal-chip"><span>Won</span><strong>${fmtMoney(wonAmount)}</strong></div>
        </div>
      </div>
      <button class="achv-demo-btn" id="edit-goal-btn" style="width:auto; white-space:nowrap;">Edit goal</button>
    </div>
  `;
  document.getElementById('edit-goal-btn').addEventListener('click', () => showEditor(goal));
}

// ---- Compact stats strip ----
function renderStats(rows) {
  const inProgress = rows.filter(s => s.status === 'saved' || s.status === 'working').length;
  const submitted = rows.filter(s => s.status === 'submitted' && !s.outcome).length;
  const won = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').length;
  const notSelected = rows.filter(s => s.outcome === 'not_selected').length;
  const decided = won + notSelected;
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

  document.getElementById('stats-content').innerHTML = `
    <div class="stat-chip purple"><strong>${inProgress}</strong><span>In Progress</span></div>
    <div class="stat-chip purple"><strong>${submitted}</strong><span>Submitted</span></div>
    <div class="stat-chip teal"><strong>${won}</strong><span>Won</span></div>
    <div class="stat-chip amber"><strong>${winRate}%</strong><span>Win Rate</span></div>
  `;
}

// ---- Upcoming deadlines ----
function renderDeadlines(rows) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows
    .filter(s => (s.status === 'saved' || s.status === 'working') && s.deadline && s.deadline >= today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 4);

  const el = document.getElementById('deadlines-content');
  if (upcoming.length === 0) {
    el.innerHTML = `<p class="dash-empty">No upcoming deadlines at the moment.</p>`;
    return;
  }
  el.innerHTML = upcoming.map(s => `
    <div class="deadline-row">
      <span>${escapeHtml(s.title)}</span>
      <span class="deadline-date">${fmtDateShort(s.deadline)}</span>
    </div>
  `).join('');
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
function renderActivity(rows) {
  const recent = rows
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
    const verb = isNew ? 'Added' : (s.status === 'funds_received' ? 'Received funds for' : s.status === 'submitted' ? 'Submitted' : 'Updated');
    return `<div class="activity-row"><span>${verb} <strong>${escapeHtml(s.title)}</strong></span></div>`;
  }).join('');
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Sign out failed, forcing local logout:', err);
  } finally {
    window.location.href = 'login.html';
  }
});

loadDashboard();