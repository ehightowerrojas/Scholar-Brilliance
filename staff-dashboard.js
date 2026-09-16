// ------------------------------------------------------------------
// Staff Dashboard logic
// ------------------------------------------------------------------

(async () => {
  const ctx = await requireStaffProfile();
  if (!ctx) return;
  const { session, profile } = ctx;

  document.getElementById('welcome-heading').textContent =
    `Welcome back, ${profile.full_name || session.user.email}.`;

  if (!profile.org_id) {
    document.getElementById('org-sub').textContent =
      "Your account isn't linked to an organization yet. Organization setup happens at signup.";
    return;
  }

  const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', profile.org_id).single();
  document.getElementById('org-sub').textContent = org ? org.name : '';

  const [{ count: studentCount }, { count: codeCount }, { count: scholarshipCount }, { data: orgStudents }] = await Promise.all([
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id).eq('role', 'student'),
    supabaseClient.from('referral_codes').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id).eq('active', true),
    supabaseClient.from('scholarships_catalog').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id),
    supabaseClient.from('profiles').select('id, full_name').eq('org_id', profile.org_id).eq('role', 'student'),
  ]);

  document.getElementById('stat-students').textContent = studentCount ?? 0;
  document.getElementById('stat-codes').textContent = codeCount ?? 0;
  document.getElementById('stat-scholarships').textContent = scholarshipCount ?? 0;

  const studentIds = (orgStudents || []).map(s => s.id);
  if (studentIds.length > 0) {
    const { data: orgScholarships } = await supabaseClient
      .from('scholarships')
      .select('title, amount, outcome, status, updated_at, user_id')
      .in('user_id', studentIds);

    const won = (orgScholarships || []).filter(s => s.outcome === 'won' || s.status === 'funds_received');
    const totalRaised = won.reduce((sum, s) => sum + Number(s.amount || 0), 0);

    document.getElementById('stat-won').textContent = won.length;
    document.getElementById('stat-raised').textContent = `$${totalRaised.toLocaleString()}`;

    const recentEl = document.getElementById('recent-applications');
    if (recentEl) {
      const nameMap = Object.fromEntries((orgStudents || []).map(s => [s.id, s.full_name || 'A student']));
      const recent = (orgScholarships || [])
        .filter(s => ['submitted', 'won_awaiting_funds', 'funds_received'].includes(s.status))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 8);

      if (recent.length === 0) {
        recentEl.innerHTML = `<p class="dash-empty">No submissions yet from your students.</p>`;
      } else {
        recentEl.innerHTML = recent.map(s => `
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
            <span>${escapeHtml(nameMap[s.user_id])} submitted <strong>${escapeHtml(s.title)}</strong>${s.outcome === 'won' ? ' 🏆' : ''}</span>
            <span class="dash-empty">${fmtDateShort(s.updated_at)}</span>
          </div>
        `).join('');
      }
    }
  } else {
    document.getElementById('stat-won').textContent = 0;
    document.getElementById('stat-raised').textContent = '$0';
  }
})();
