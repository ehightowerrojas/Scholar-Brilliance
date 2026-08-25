// ------------------------------------------------------------------
// Scholarship Manager logic
// ------------------------------------------------------------------

let staffOrgId = null;

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
    el.innerHTML = `<p class="dash-empty">No scholarships added yet — use "Add New Scholarship" above.</p>`;
    return;
  }

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
      <div class="catalog-card-actions">
        <button class="achv-demo-btn" data-toggle-active="${item.id}" data-active="${item.active}">
          ${item.active ? 'Mark Inactive' : 'Mark Active'}
        </button>
        <button class="achv-demo-btn" data-delete-scholarship="${item.id}">Delete</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-toggle-active]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggleActive;
      const isActive = btn.dataset.active === 'true';
      await supabaseClient.from('scholarships_catalog').update({ active: !isActive }).eq('id', id);
      loadScholarships();
    });
  });

  document.querySelectorAll('[data-delete-scholarship]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteScholarship;
      await supabaseClient.from('scholarships_catalog').delete().eq('id', id);
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

  const { error } = await supabaseClient.from('scholarships_catalog').insert({
    org_id: staffOrgId,
    title,
    description: document.getElementById('s-description').value.trim() || null,
    amount: document.getElementById('s-amount').value || null,
    deadline: document.getElementById('s-deadline').value || null,
    website: document.getElementById('s-website').value.trim() || null,
  });

  if (error) {
    console.error(error);
    return;
  }
  addForm.reset();
  addForm.style.display = 'none';
  loadScholarships();
});

(async () => {
  const ctx = await requireStaffProfile();
  if (!ctx) return;
  staffOrgId = ctx.profile.org_id;

  if (!staffOrgId) {
    document.getElementById('scholarships-list').innerHTML = `<p class="dash-empty">Your account isn't linked to an organization yet.</p>`;
    document.getElementById('add-toggle-btn').disabled = true;
    return;
  }
  loadScholarships();
})();
