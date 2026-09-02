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
      "Your account isn't linked to an organization yet — organization setup happens at signup.";
    return;
  }

  const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', profile.org_id).single();
  document.getElementById('org-sub').textContent = org ? org.name : '';

  const [{ count: studentCount }, { count: codeCount }, { count: scholarshipCount }, { data: orgStudents }] = await Promise.all([
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id).eq('role', 'student'),
    supabaseClient.from('referral_codes').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id).eq('active', true),
    supabaseClient.from('scholarships_catalog').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id),
    supabaseClient.from('profiles').select('id').eq('org_id', profile.org_id).eq('role', 'student'),
  ]);

  document.getElementById('stat-students').textContent = studentCount ?? 0;
  document.getElementById('stat-codes').textContent = codeCount ?? 0;
  document.getElementById('stat-scholarships').textContent = scholarshipCount ?? 0;

  const studentIds = (orgStudents || []).map(s => s.id);
  if (studentIds.length > 0) {
    const { data: orgScholarships } = await supabaseClient
      .from('scholarships')
      .select('amount, outcome, status')
      .in('user_id', studentIds);

    const won = (orgScholarships || []).filter(s => s.outcome === 'won' || s.status === 'funds_received');
    const totalRaised = won.reduce((sum, s) => sum + Number(s.amount || 0), 0);

    document.getElementById('stat-won').textContent = won.length;
    document.getElementById('stat-raised').textContent = `$${totalRaised.toLocaleString()}`;
  } else {
    document.getElementById('stat-won').textContent = 0;
    document.getElementById('stat-raised').textContent = '$0';
  }
})();
