// ------------------------------------------------------------------
// Student Progress logic
// ------------------------------------------------------------------

let allStudents = [];
let currentFilter = 'all';

function daysAgo(ts) {
  return (Date.now() - new Date(ts).getTime()) / 86400000;
}

function renderStudents() {
  let list = allStudents;
  if (currentFilter === 'active') list = list.filter(s => s.stats.total > 0);
  if (currentFilter === 'new') list = list.filter(s => daysAgo(s.created_at) <= 7);

  const el = document.getElementById('students-list');
  if (list.length === 0) {
    el.innerHTML = `<p class="dash-empty">No students match this view yet.</p>`;
    return;
  }

  el.innerHTML = list.map(s => `
    <div class="catalog-card">
      <div class="catalog-card-top">
        <h4>${s.full_name || '(No name set)'}</h4>
        <span class="dash-empty" style="font-size:11.5px;">Joined ${new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <div class="stat-grid-mini" style="margin-top:14px; grid-template-columns:repeat(4, 1fr);">
        <div><strong>${s.stats.saved}</strong><span>Saved</span></div>
        <div><strong>${s.stats.working}</strong><span>Working</span></div>
        <div><strong>${s.stats.submitted}</strong><span>Submitted</span></div>
        <div><strong>${s.stats.won}</strong><span>Won</span></div>
      </div>
    </div>
  `).join('');
}

document.getElementById('tab-all').addEventListener('click', () => setFilter('all'));
document.getElementById('tab-active').addEventListener('click', () => setFilter('active'));
document.getElementById('tab-new').addEventListener('click', () => setFilter('new'));

function setFilter(filter) {
  currentFilter = filter;
  ['all', 'active', 'new'].forEach(f => {
    document.getElementById(`tab-${f}`).setAttribute('aria-pressed', String(f === filter));
  });
  renderStudents();
}

(async () => {
  const ctx = await requireStaffProfile();
  if (!ctx) return;
  const { profile } = ctx;

  if (!profile.org_id) {
    document.getElementById('students-list').innerHTML = `<p class="dash-empty">Your account isn't linked to an organization yet.</p>`;
    return;
  }

  const { data: students, error: studentsErr } = await supabaseClient
    .from('profiles')
    .select('id, full_name, created_at')
    .eq('org_id', profile.org_id)
    .eq('role', 'student')
    .order('created_at', { ascending: false });

  if (studentsErr) {
    console.error(studentsErr);
    document.getElementById('students-list').innerHTML = `<p class="dash-empty">Could not load students.</p>`;
    return;
  }

  const studentIds = students.map(s => s.id);
  let scholarships = [];
  if (studentIds.length > 0) {
    const { data, error } = await supabaseClient
      .from('scholarships')
      .select('user_id, status, outcome')
      .in('user_id', studentIds);
    if (error) console.error(error);
    else scholarships = data;
  }

  allStudents = students.map(s => {
    const own = scholarships.filter(row => row.user_id === s.id);
    return {
      ...s,
      stats: {
        saved: own.filter(r => r.status === 'saved').length,
        working: own.filter(r => r.status === 'working').length,
        submitted: own.filter(r => r.status === 'submitted' && !r.outcome).length,
        won: own.filter(r => r.outcome === 'won').length,
        total: own.length,
      },
    };
  });

  renderStudents();
})();
