// ------------------------------------------------------------------
// Scholarship Manager logic
// ------------------------------------------------------------------

let staffOrgId = null;
let staffId = null;
let orgStudents = [];

async function loadScholarships() {
  const { data, error } = await supabaseClient
    .from('scholarships_catalog')
    .select('*')
    .eq('org_id', staffOrgId)
    .order('created_at', { ascending: false });

  const el = document.getElementById('scholarships-list');
  if (error) {
    console.error(error);
    el.innerHTML = `<p class="dash-empty">Could not load scholarships.</p>`;
    return;
  }
  if (data.length === 0) {
    el.innerHTML = `<p class="dash-empty">No scholarships added yet. Use "Add New Scholarship" above.</p>`;
    return;
  }

  const studentOptions = orgStudents.map(s => `<option value="${s.id}">${escapeHtml(s.full_name || 'Unnamed student')}</option>`).join('');

  el.innerHTML = data.map(item => `
    <div class="catalog-card">
      <div class="catalog-card-top">
        <h4>${escapeHtml(item.title)}</h4>
        <span class="catalog-amount">${fmtMoney(item.amount)}</span>
      </div>
      <p class="catalog-desc">${escapeHtml(item.description || '')}</p>
      <div class="catalog-card-meta">
        ${item.deadline ? `<span>Deadline: ${fmtDateLong(item.deadline)}</span>` : '<span>No deadline set</span>'}
        <span class="kanban-badge ${item.active ? 'won' : 'not-selected'}">${item.active ? 'Active' : 'Inactive'}</span>
      </div>
      ${orgStudents.length > 0 ? `
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <select id="recommend-select-${item.id}" style="flex:1; min-width:160px; padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--line-strong); background:var(--white); color:var(--ink); font-size:13px;">
          <option value="">Recommend to a student…</option>
          ${studentOptions}
        </select>
        <button class="achv-demo-btn" style="width:auto; padding:8px 16px;" data-recommend-catalog="${item.id}">Recommend</button>
      </div>
      <p class="dash-empty" id="recommend-msg-${item.id}" style="margin-top:6px; display:none; font-size:12px;"></p>
      ` : ''}
      <div class="catalog-card-actions">
        <button class="achv-demo-btn" data-toggle-active="${item.id}" data-active="${item.active}">
          ${item.active ? 'Mark Inactive' : 'Mark Active'}
        </button>
        <button class="achv-demo-btn" data-delete-scholarship="${item.id}">Delete</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-recommend-catalog]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scholarshipId = btn.dataset.recommendCatalog;
      const select = document.getElementById(`recommend-select-${scholarshipId}`);
      const studentId = select.value;
      const msg = document.getElementById(`recommend-msg-${scholarshipId}`);
      if (!studentId) return;

      btn.disabled = true;
      const { error } = await supabaseClient.from('scholarship_recommendations').insert({
        student_id: studentId,
        catalog_id: scholarshipId,
        recommended_by: staffId,
      });
      btn.disabled = false;

      msg.style.display = 'block';
      if (error) {
        msg.textContent = 'Could not send recommendation, try again.';
        msg.style.color = '#c62828';
      } else {
        msg.textContent = 'Recommended ✓';
        msg.style.color = 'var(--teal-deep)';
        select.value = '';
      }
    });
  });

  document.querySelectorAll('[data-toggle-active]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggleActive;
      const isActive = btn.dataset.active === 'true';
      const { error } = await supabaseClient.from('scholarships_catalog').update({ active: !isActive }).eq('id', id);
      if (error) {
        console.error(error);
        alert(`Could not update: ${error.message}`);
        return;
      }
      loadScholarships();
    });
  });

  document.querySelectorAll('[data-delete-scholarship]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteScholarship;
      const { error } = await supabaseClient.from('scholarships_catalog').delete().eq('id', id);
      if (error) {
        console.error(error);
        alert(`Could not delete: ${error.message}`);
        return;
      }
      loadScholarships();
    });
  });
}

const addToggleBtn = document.getElementById('add-toggle-btn');
const addForm = document.getElementById('add-form');
document.getElementById('cancel-add-btn').addEventListener('click', () => {
  addForm.style.display = 'none';
  addForm.reset();
});
addToggleBtn.addEventListener('click', () => {
  addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('s-title').value.trim();
  if (!title) return;

  const msg = document.getElementById('add-scholarship-msg');
  const submitBtn = addForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  msg.style.display = 'none';

  const { error } = await supabaseClient.from('scholarships_catalog').insert({
    org_id: staffOrgId,
    title,
    description: document.getElementById('s-description').value.trim() || null,
    amount: document.getElementById('s-amount').value || null,
    deadline: document.getElementById('s-deadline').value || null,
    website: document.getElementById('s-website').value.trim() || null,
    min_gpa: document.getElementById('s-min-gpa').value || null,
  });

  submitBtn.disabled = false;

  if (error) {
    console.error(error);
    msg.style.display = 'block';
    msg.style.color = '#c62828';
    msg.textContent = `Could not save: ${error.message}`;
    return;
  }

  msg.style.display = 'block';
  msg.style.color = 'var(--teal-deep)';
  msg.textContent = 'Saved ✓';
  addForm.reset();
  setTimeout(() => {
    addForm.style.display = 'none';
    msg.style.display = 'none';
  }, 900);
  loadScholarships();
});

(async () => {
  const ctx = await requireStaffProfile();
  if (!ctx) return;
  staffOrgId = ctx.profile.org_id;
  staffId = ctx.session.user.id;

  if (!staffOrgId) {
    document.getElementById('scholarships-list').innerHTML = `<p class="dash-empty">Your account isn't linked to an organization yet.</p>`;
    document.getElementById('add-toggle-btn').disabled = true;
    return;
  }
  const { data: students } = await supabaseClient
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', staffOrgId)
    .eq('role', 'student');
  orgStudents = students || [];

  loadScholarships();
})();
