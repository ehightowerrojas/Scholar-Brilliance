// ------------------------------------------------------------------
// Dashboard logic
// ------------------------------------------------------------------

let userId = null;

function showToast(message) {
  let toast = document.getElementById('dash-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'dash-toast';
    toast.className = 'dash-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}
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

  const todayStr = new Date().toISOString().slice(0, 10);
  await supabaseClient.from('daily_activity').upsert(
    { user_id: userId, activity_date: todayStr },
    { onConflict: 'user_id,activity_date', ignoreDuplicates: true }
  );

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [{ data: scholarships, error: schErr }, { data: earnedRows }, { data: achievements }, { data: levels }, { data: profile }, { data: goals }, { data: activityRows }] =
    await Promise.all([
      supabaseClient.from('scholarships').select('*').eq('user_id', userId),
      supabaseClient.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId).order('earned_at', { ascending: false }),
      supabaseClient.from('achievements').select('*'),
      supabaseClient.from('levels').select('*').order('level_number'),
      supabaseClient.from('profiles').select('avatar_species_id').eq('id', userId).single(),
      supabaseClient.from('goals').select('*').eq('student_id', userId).order('created_at'),
      supabaseClient.from('daily_activity').select('activity_date').eq('user_id', userId).gte('activity_date', sixtyDaysAgo.toISOString().slice(0, 10)),
    ]);

  if (schErr) console.error(schErr);
  const rows = scholarships || [];
  const goalRows = goals || [];

  renderWelcomeAvatar(profile, earnedRows || [], achievements || [], levels || []);
  renderWelcomeSubtext(rows);
  renderNextStep(goalRows, rows);
  renderGoal(goalRows, rows);
  renderActivityStreak(activityRows || []);
  renderStats(rows);
  renderDeadlines(rows);
  renderAchievements(earnedRows || [], achievements || [], levels || []);
  renderActivity(rows);
}

// ---- Encouraging one-liner under the heading ----
function renderWelcomeAvatar(profile, earnedRows, achievements, levels) {
  const pointsMap = Object.fromEntries(achievements.map(a => [a.id, a.points]));
  const totalXP = earnedRows.reduce((sum, r) => sum + (pointsMap[r.achievement_id] || 0), 0);
  let currentLevel = { level_number: 1, title: 'Scholarship Rookie' };
  levels.forEach(l => { if (totalXP >= l.xp_threshold) currentLevel = l; });
  const tier = evolutionTierFromLevel(currentLevel.level_number);

  document.getElementById('welcome-avatar').innerHTML = `
    ${renderAvatarSVG(profile?.avatar_species_id || 'raptor', tier, 88)}
    <span style="position:absolute; bottom:-4px; right:-4px; background:var(--amber); color:var(--ink); font-family:var(--font-accent); font-weight:800; font-size:13px; border-radius:999px; padding:3px 9px; border:3px solid var(--paper); box-shadow:var(--shadow-soft);">Lv ${currentLevel.level_number}</span>
  `;

  const levelBadge = document.getElementById('welcome-level-badge');
  if (levelBadge) levelBadge.textContent = `Level ${currentLevel.level_number}: ${currentLevel.title}`;
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
function renderNextStep(goalRows, rows) {
  const goal = goalRows.length > 0;
  const total = rows.length;
  const savedOrWorking = rows.filter(s => s.status === 'saved' || s.status === 'working').length;
  const inFlight = rows.filter(s => s.status === 'submitted' || s.status === 'funds_received').length;
  const won = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').length;

  let step;
  if (!goal) {
    step = {
      title: 'Set your first goal',
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

// ---- This week's activity + real consecutive-day streak ----
function renderActivityStreak(activityRows) {
  const activeDates = new Set(activityRows.map(r => r.activity_date));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function dateStr(d) { return d.toISOString().slice(0, 10); }

  // Walk backward from today, counting consecutive active days. Since
  // today was just logged by loadDashboard, this always includes
  // today itself — a streak only breaks once a full day passes with
  // no visit at all.
  let streak = 0;
  const cursor = new Date(today);
  while (activeDates.has(dateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak ever within the fetched window — walks every date
  // present (not just the trailing-from-today run), so a past streak
  // that's since broken still shows up here for context.
  const sortedDates = [...activeDates].sort();
  let longest = 0;
  let running = 0;
  let prevDate = null;
  for (const d of sortedDates) {
    if (prevDate) {
      const gapDays = (new Date(d) - new Date(prevDate)) / 86400000;
      running = gapDays === 1 ? running + 1 : 1;
    } else {
      running = 1;
    }
    longest = Math.max(longest, running);
    prevDate = d;
  }

  checkStreakMilestones(streak, userId);

  const headerStreak = document.getElementById('header-streak');
  if (headerStreak) headerStreak.textContent = `${streak} day${streak === 1 ? '' : 's'}`;

  // Fixed Monday-Sunday week, not a rolling 7-day window — find this
  // week's Monday (getDay() is 0=Sun..6=Sat, so Sunday needs special
  // handling since it's 6 days after Monday, not -1 days before it).
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - daysSinceMonday);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  document.getElementById('streak-content').innerHTML = `
    <div style="display:flex; align-items:baseline; gap:18px; margin-bottom:14px; flex-wrap:wrap;">
      <div style="display:flex; align-items:baseline; gap:8px;">
        <span style="font-family:var(--font-accent); font-weight:800; font-size:28px; color:var(--amber-deep);">${streak}</span>
        <span style="font-size:13.5px; color:var(--muted);">day${streak === 1 ? '' : 's'} in a row</span>
      </div>
      ${longest > streak ? `<span class="dash-empty" style="font-size:12px;">🏆 Longest streak: ${longest} days</span>` : ''}
    </div>
    <div style="display:flex; justify-content:space-between; gap:8px;">
      ${days.map(day => {
        const active = activeDates.has(dateStr(day));
        const isToday = dateStr(day) === dateStr(today);
        return `
          <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
            <div style="width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:${active ? 'var(--teal)' : 'var(--card-soft)'}; ${isToday ? 'box-shadow:0 0 0 2px var(--amber);' : ''} transition:background .3s ease;">
              ${active ? '<span style="color:white; font-size:14px; font-weight:700;">✓</span>' : ''}
            </div>
            <span style="font-size:10.5px; color:var(--muted); font-weight:${isToday ? '700' : '400'};">${dayLabels[(day.getDay() + 6) % 7]}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---- Progress toward financial goal ----
function renderGoal(goalRows, rows) {
  const el = document.getElementById('goal-content');
  const wonAmount = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').reduce((sum, s) => sum + Number(s.amount || 0), 0);

  // Progress toward each individual goal comes only from scholarships
  // explicitly tagged to it — untagged scholarships still count
  // toward the aggregate ring below, just not any specific goal.
  function goalProgress(goal) {
    return rows
      .filter(s => s.goal_id === goal.id && (s.outcome === 'won' || s.status === 'funds_received'))
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);
  }

  // Check for any goal that just crossed its own target and hasn't
  // been marked complete yet — award the bonus once, quietly.
  goalRows.forEach(async (goal) => {
    if (!goal.completed_at && goalProgress(goal) >= goal.target_amount) {
      await supabaseClient.from('goals').update({ completed_at: new Date().toISOString() }).eq('id', goal.id);
      await awardAchievement('goal_crusher', userId);
    }
  });

  function showAddForm() {
    el.innerHTML = `
      <p style="color:var(--ink); font-size:15px; font-weight:600; margin-bottom:14px;">🎯 Set your first goal and watch every scholarship you win count toward it.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:2; min-width:160px;">
          <label style="display:block; font-size:11.5px; color:var(--muted); margin-bottom:4px;">Goal name</label>
          <input type="text" id="goal-name-input" placeholder="e.g. STEM scholarships" style="width:100%; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--white); color:var(--ink);">
        </div>
        <div style="flex:1; min-width:100px;">
          <label style="display:block; font-size:11.5px; color:var(--muted); margin-bottom:4px;">Target ($)</label>
          <input type="number" id="goal-amount-input" placeholder="5000" min="0" style="width:100%; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--white); color:var(--ink);">
        </div>
        <div style="flex:1; min-width:140px;">
          <label style="display:block; font-size:11.5px; color:var(--muted); margin-bottom:4px;">Deadline (optional)</label>
          <input type="date" id="goal-deadline-input" style="width:100%; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--white); color:var(--ink);">
        </div>
        <button class="btn btn-gold" id="save-goal-btn" style="padding:10px 18px;">Add goal</button>
        ${goalRows.length > 0 ? '<button class="btn btn-line" id="cancel-goal-edit-btn" style="padding:10px 18px;">Cancel</button>' : ''}
      </div>
    `;
    document.getElementById('save-goal-btn').addEventListener('click', async () => {
      const name = document.getElementById('goal-name-input').value.trim();
      const amount = Number(document.getElementById('goal-amount-input').value);
      const deadline = document.getElementById('goal-deadline-input').value || null;
      if (!name || !amount || amount <= 0) return;

      const btn = document.getElementById('save-goal-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';

      const { error } = await supabaseClient.from('goals').insert({ student_id: userId, name, target_amount: amount, target_date: deadline, source: 'self' });

      if (error) {
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Add goal';
        let msg = el.querySelector('.goal-form-error');
        if (!msg) {
          msg = document.createElement('p');
          msg.className = 'goal-form-error';
          msg.style.cssText = 'color:#c62828; font-size:12.5px; margin-top:8px;';
          document.getElementById('save-goal-btn').closest('div').after(msg);
        }
        msg.textContent = 'Could not save your goal — please try again in a moment.';
        return;
      }

      await awardAchievement('goal_setter', userId);
      loadDashboard();
      showToast('Goal set ✓');
    });
    const cancelBtn = document.getElementById('cancel-goal-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => loadDashboard());
  }

  if (goalRows.length === 0) {
    showAddForm();
    return;
  }

  const totalTarget = goalRows.reduce((sum, g) => sum + Number(g.target_amount), 0);
  const aggregatePct = totalTarget > 0 ? Math.min(100, (wonAmount / totalTarget) * 100) : 0;

  const goalRowsHtml = goalRows.map(goal => {
    const progress = goalProgress(goal);
    const pct = Math.min(100, (progress / goal.target_amount) * 100);
    const isDone = progress >= goal.target_amount;
    const sourceLabel = goal.source === 'staff' ? 'set by your school' : 'set by you';
    let deadlineLabel = '';
    if (goal.target_date) {
      const overdue = !isDone && new Date(goal.target_date) < new Date(new Date().toDateString());
      const formatted = fmtDateShort(goal.target_date);
      deadlineLabel = overdue
        ? ` · <span style="color:#c62828; font-weight:600;">was due ${formatted}</span>`
        : ` · due ${formatted}`;
    }
    return `
      <div style="display:flex; align-items:center; gap:14px; padding:12px; border:1px solid var(--line); border-radius:var(--radius-sm); margin-bottom:8px;">
        <div style="width:40px; height:40px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-family:var(--font-accent); font-weight:700; font-size:11px; background:${isDone ? 'var(--teal)' : 'var(--card-soft)'}; color:${isDone ? 'var(--white)' : 'var(--ink)'};">
          ${isDone ? '✓' : Math.round(pct) + '%'}
        </div>
        <div style="flex:1; min-width:0;">
          <p style="font-size:14px; font-weight:600; color:var(--ink); margin:0;">${escapeHtml(goal.name)}</p>
          <p style="font-size:12px; color:var(--muted); margin:2px 0 0;">${fmtMoney(progress)} of ${fmtMoney(goal.target_amount)} · ${sourceLabel}${deadlineLabel}</p>
        </div>
        <button class="kanban-delete" data-delete-goal="${goal.id}" aria-label="Delete goal" style="flex-shrink:0;">×</button>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
        <span style="font-size:13px; color:var(--muted);">Total progress across all goals</span>
        <span style="font-size:13px; font-weight:700; color:var(--amber-deep);">${Math.round(aggregatePct)}%</span>
      </div>
      <div class="level-track"><div class="level-fill" style="width:${aggregatePct}%;"></div></div>
    </div>
    ${goalRowsHtml}
    <button class="achv-demo-btn" id="add-goal-btn" style="margin-top:4px;">+ Add a goal</button>
  `;
  document.getElementById('add-goal-btn').addEventListener('click', showAddForm);
  el.querySelectorAll('[data-delete-goal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this goal? This can\'t be undone.')) return;
      await supabaseClient.from('goals').delete().eq('id', btn.dataset.deleteGoal);
      loadDashboard();
    });
  });
}

// ---- Compact stats strip ----
function renderStats(rows) {
  const inProgress = rows.filter(s => s.status === 'saved' || s.status === 'working').length;
  const submitted = rows.filter(s => s.status === 'submitted' && !s.outcome).length;
  const won = rows.filter(s => s.outcome === 'won' || s.status === 'funds_received').length;

  document.getElementById('stats-content').innerHTML = `
    <div class="stat-chip purple"><strong>${inProgress}</strong><span>In Progress</span></div>
    <div class="stat-chip purple"><strong>${submitted}</strong><span>Submitted</span></div>
    <div class="stat-chip teal"><strong>${won}</strong><span>Won</span></div>
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

  const headerXP = document.getElementById('header-xp');
  if (headerXP) headerXP.textContent = totalXP.toLocaleString();

  const recent = earnedRows.slice(0, 4);
  const earnedIds = new Set(earnedRows.map(r => r.achievement_id));
  const upNext = achievements
    .filter(a => !earnedIds.has(a.id))
    .sort((a, b) => a.points - b.points)
    .slice(0, 3);

  const el = document.getElementById('achievements-content');
  const levelLine = `<div class="level-line">Level ${current.level_number}: <strong>${current.title.toUpperCase()}</strong> · ${totalXP.toLocaleString()} pts</div>`;

  const upNextHtml = upNext.length > 0 ? `
    <p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:14px 0 6px;">Up next</p>
    ${upNext.map(a => `
      <div class="recent-achv-row" style="opacity:0.65;">
        <span>${a.title} <span style="font-weight:400; color:var(--muted);">— ${a.description}</span></span>
        <span class="recent-achv-pts">+${a.points}</span>
      </div>
    `).join('')}
    <a href="achievements.html" style="display:block; font-size:12px; margin-top:8px; color:var(--purple); font-weight:600;">See all achievements →</a>
  ` : '';

  if (recent.length === 0) {
    el.innerHTML = levelLine + `<p class="dash-empty">No badges earned yet — start by adding a scholarship to your tracker!</p>` + upNextHtml;
    return;
  }

  el.innerHTML = levelLine + recent.map(r => {
    const a = catalog[r.achievement_id];
    if (!a) return '';
    return `<div class="recent-achv-row"><span>${a.title}</span><span class="recent-achv-pts">+${a.points}</span></div>`;
  }).join('') + upNextHtml;
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