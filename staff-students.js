// ------------------------------------------------------------------
// Student Progress logic
// ------------------------------------------------------------------

let allStudents = [];
let currentFilter = 'all';
let orgCatalog = [];
let staffId = null;

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

  const catalogOptions = orgCatalog.map(c => `<option value="${c.id}">${c.title}</option>`).join('');

  el.innerHTML = list.map(s => `
    <div class="catalog-card">
      <div class="catalog-card-top">
        <h4>${s.full_name || '(No name set)'}</h4>
        <span class="dash-empty" style="font-size:11.5px;">Joined ${new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      ${s.interests ? `<p class="catalog-desc"><strong>Interests:</strong> ${s.interests}</p>` : `<p class="dash-empty" style="margin-top:6px;">No interests set yet.</p>`}
      <div class="stat-grid-mini" style="margin-top:14px; grid-template-columns:repeat(4, 1fr);">
        <div><strong>${s.stats.saved}</strong><span>Saved</span></div>
        <div><strong>${s.stats.working}</strong><span>Working</span></div>
        <div><strong>${s.stats.submitted}</strong><span>Submitted</span></div>
        <div><strong>${s.stats.won}</strong><span>Won</span></div>
      </div>

      ${s.recommendations.length > 0 ? `
        <div style="margin-top:12px;">
          ${s.recommendations.map(r => `<span class="kanban-badge" style="margin-right:6px;">⭐ ${r}</span>`).join('')}
        </div>` : ''}

      <div class="catalog-card-actions" style="margin-top:14px;">
        <select id="rec-select-${s.id}" style="flex:1; padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--white); color:var(--ink); font-size:13px;">
          <option value="">Recommend a scholarship…</option>
          ${catalogOptions}
        </select>
        <button class="btn btn-teal" style="padding:8px 16px; font-size:13px;" data-recommend="${s.id}">Recommend</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-recommend]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const studentId = btn.dataset.recommend;
      const select = document.getElementById(`rec-select-${studentId}`);
      const catalogId = select.value;
      if (!catalogId) return;

      btn.disabled = true;
      const { error } = await supabaseClient.from('scholarship_recommendations').insert({
        student_id: studentId,
        catalog_id: catalogId,
        recommended_by: staffId,
      });
      btn.disabled = false;

      if (error) {
        console.error(error);
        return;
      }
      select.value = '';
      loadStudents();
    });
  });
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

async function loadStudents() {
  const { data: students, error: studentsErr } = await supabaseClient
    .from('profiles')
    .select('id, full_name, created_at, interests')
    .eq('org_id', currentOrgId)
    .eq('role', 'student')
    .order('created_at', { ascending: false });

  if (studentsErr) {
    console.error(studentsErr);
    document.getElementById('students-list').innerHTML = `<p class="dash-empty">Could not load students.</p>`;
    return;
  }

  const studentIds = students.map(s => s.id);
  let scholarships = [];
  let recommendations = [];

  if (studentIds.length > 0) {
    const [{ data: schData, error: schErr }, { data: recData, error: recErr }] = await Promise.all([
      supabaseClient.from('scholarships').select('user_id, status, outcome').in('user_id', studentIds),
      supabaseClient.from('scholarship_recommendations').select('student_id, scholarships_catalog(title)').in('student_id', studentIds),
    ]);
    if (schErr) console.error(schErr); else scholarships = schData;
    if (recErr) console.error(recErr); else recommendations = recData;
  }

  allStudents = students.map(s => {
    const own = scholarships.filter(row => row.user_id === s.id);
    const recs = recommendations.filter(r => r.student_id === s.id).map(r => r.scholarships_catalog?.title).filter(Boolean);
    return {
      ...s,
      recommendations: recs,
      stats: {
        saved: own.filter(r => r.status === 'saved').length,
        working: own.filter(r => r.status === 'working').length,
        submitted: own.filter(r => r.status === 'submitted' && !r.outcome).length,
        won: own.filter(r => r.outcome === 'won' || r.status === 'funds_received').length,
        total: own.length,
      },
    };
  });

  renderStudents();
}

let currentOrgId = null;

(async () => {
  const ctx = await requireStaffProfile();
  if (!ctx) return;
  const { profile } = ctx;
  staffId = profile.id;
  currentOrgId = profile.org_id;

  if (!profile.org_id) {
    document.getElementById('students-list').innerHTML = `<p class="dash-empty">Your account isn't linked to an organization yet.</p>`;
    return;
  }

  const { data: catalog, error: catalogErr } = await supabaseClient
    .from('scholarships_catalog')
    .select('id, title')
    .eq('org_id', profile.org_id);
  if (catalogErr) console.error(catalogErr);
  else orgCatalog = catalog;

  loadStudents();
})();