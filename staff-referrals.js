// ------------------------------------------------------------------
// Referral Codes logic
// ------------------------------------------------------------------

let staffProfile = null;

function randomCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function fmtDate(d) {
  if (!d) return 'No expiration';
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function codeStatus(row) {
  if (!row.active) return { label: 'Inactive', className: 'not-selected' };
  if (row.expires_at && row.expires_at < new Date().toISOString().slice(0, 10)) return { label: 'Expired', className: 'not-selected' };
  return { label: 'Active', className: 'won' };
}

async function loadCodes() {
  const { data, error } = await supabaseClient
    .from('referral_codes')
    .select('*')
    .eq('org_id', staffProfile.org_id)
    .order('created_at', { ascending: false });

  const el = document.getElementById('codes-list');
  if (error) {
    console.error(error);
    el.innerHTML = `<p class="dash-empty">Could not load referral codes.</p>`;
    return;
  }
  if (data.length === 0) {
    el.innerHTML = `<p class="dash-empty">No referral codes yet — generate your first one.</p>`;
    return;
  }

  el.innerHTML = data.map(row => {
    const status = codeStatus(row);
    return `
      <div class="code-row">
        <div>
          <div class="code-value">${row.code}</div>
          <div class="dash-empty" style="font-size:11.5px;">Expires: ${fmtDate(row.expires_at)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="kanban-badge ${status.className}">${status.label}</span>
          <button class="achv-demo-btn" data-toggle-code="${row.id}" data-active="${row.active}">
            ${row.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-toggle-code]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggleCode;
      const isActive = btn.dataset.active === 'true';
      await supabaseClient.from('referral_codes').update({ active: !isActive }).eq('id', id);
      loadCodes();
    });
  });
}

document.getElementById('generate-btn').addEventListener('click', async () => {
  const expiresInput = document.getElementById('expires-input').value || null;
  const code = randomCode();

  const { error } = await supabaseClient.from('referral_codes').insert({
    org_id: staffProfile.org_id,
    code,
    created_by: staffProfile.id,
    expires_at: expiresInput,
  });

  const resultEl = document.getElementById('generate-result');
  if (error) {
    console.error(error);
    resultEl.innerHTML = `<p class="dash-empty">Could not generate a code — try again.</p>`;
    return;
  }
  resultEl.innerHTML = `<p class="dash-empty">Created code: <strong style="color:var(--fg);">${code}</strong></p>`;
  document.getElementById('expires-input').value = '';
  loadCodes();
});

(async () => {
  const ctx = await requireStaffProfile();
  if (!ctx) return;
  staffProfile = ctx.profile;

  if (!staffProfile.org_id) {
    document.getElementById('codes-list').innerHTML = `<p class="dash-empty">Your account isn't linked to an organization yet.</p>`;
    document.getElementById('generate-btn').disabled = true;
    return;
  }
  loadCodes();
})();
