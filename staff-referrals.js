// ------------------------------------------------------------------
// Add Students logic — referral codes (original), plus classes,
// named invites, and CSV bulk import (Phase 1 of the access-control
// redesign). Seat purchasing/billing itself is a separate phase not
// built here — seats_purchased is a plain number for now, not tied
// to any payment processor yet.
// ------------------------------------------------------------------

let staffProfile = null;
let orgClasses = [];

function randomCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function codeStatus(row) {
  if (!row.active) return { label: 'Inactive', className: 'not-selected' };
  if (row.expires_at && row.expires_at < new Date().toISOString().slice(0, 10)) return { label: 'Expired', className: 'not-selected' };
  return { label: 'Active', className: 'won' };
}

// ------------------------------------------------------------------
// Seats
// ------------------------------------------------------------------
async function loadSeats() {
  const el = document.getElementById('seats-content');
  const { data: org } = await supabaseClient.from('organizations').select('seats_purchased').eq('id', staffProfile.org_id).single();

  const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', staffProfile.org_id).eq('is_org_member', true),
    supabaseClient.from('pending_students').select('id', { count: 'exact', head: true }).eq('org_id', staffProfile.org_id).eq('status', 'invited'),
  ]);

  const used = (activeCount ?? 0) + (pendingCount ?? 0);
  const total = org?.seats_purchased;

  if (total == null) {
    el.innerHTML = `<p class="dash-empty">No seat limit set yet — ${used} student${used === 1 ? '' : 's'} currently in your org (active + pending invites). Contact us to purchase a seat pool when you're ready to cap this.</p>`;
    return;
  }

  const available = Math.max(0, total - used);
  el.innerHTML = `
    <div style="display:flex; align-items:baseline; gap:18px; flex-wrap:wrap;">
      <span style="font-family:var(--font-accent); font-weight:800; font-size:28px; color:${available > 0 ? 'var(--teal-deep)' : '#c62828'};">${available}</span>
      <span style="font-size:13.5px; color:var(--muted);">of ${total} seats available</span>
    </div>
    <div style="height:8px; border-radius:999px; background:var(--card-soft); overflow:hidden; margin-top:10px;">
      <div style="width:${Math.min(100, (used / total) * 100)}%; height:100%; background:${available > 0 ? 'var(--teal)' : '#c62828'}; border-radius:999px;"></div>
    </div>
  `;
}

// ------------------------------------------------------------------
// Classes
// ------------------------------------------------------------------
async function loadClasses() {
  const { data, error } = await supabaseClient
    .from('classes')
    .select('*')
    .eq('org_id', staffProfile.org_id)
    .order('created_at', { ascending: false });

  const el = document.getElementById('classes-list');
  if (error) {
    console.error(error);
    el.innerHTML = `<p class="dash-empty">Could not load classes.</p>`;
    return;
  }
  orgClasses = data || [];

  if (orgClasses.length === 0) {
    el.innerHTML = `<p class="dash-empty">No classes yet. Create one to organize your roster.</p>`;
  } else {
    el.innerHTML = orgClasses.map(c => `
      <div style="padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
        <strong style="color:var(--ink);">${escapeHtml(c.name)}</strong>
        ${c.term ? `<span class="dash-empty"> · ${escapeHtml(c.term)}</span>` : ''}
      </div>
    `).join('');
  }

  const options = '<option value="">No specific class</option>' +
    orgClasses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('invite-class-select').innerHTML = options;
  document.getElementById('csv-class-select').innerHTML = options;
}

document.getElementById('create-class-btn').addEventListener('click', async () => {
  const name = document.getElementById('class-name-input').value.trim();
  const term = document.getElementById('class-term-input').value.trim() || null;
  const msg = document.getElementById('create-class-msg');
  if (!name) return;

  const { error } = await supabaseClient.from('classes').insert({
    org_id: staffProfile.org_id,
    counselor_id: staffProfile.id,
    name,
    term,
  });

  msg.style.display = 'block';
  if (error) {
    console.error(error);
    msg.style.color = '#c62828';
    msg.textContent = `Could not create class: ${error.message}`;
    return;
  }
  msg.style.color = 'var(--teal-deep)';
  msg.textContent = 'Class created ✓';
  document.getElementById('class-name-input').value = '';
  document.getElementById('class-term-input').value = '';
  loadClasses();
});

// ------------------------------------------------------------------
// Seat availability check — shared by both the named-invite and CSV
// paths, since both need to reject upfront rather than partially
// succeed when there aren't enough seats.
// ------------------------------------------------------------------
async function seatsAvailable() {
  const { data: org } = await supabaseClient.from('organizations').select('seats_purchased').eq('id', staffProfile.org_id).single();
  if (org?.seats_purchased == null) return Infinity; // no limit set

  const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', staffProfile.org_id).eq('is_org_member', true),
    supabaseClient.from('pending_students').select('id', { count: 'exact', head: true }).eq('org_id', staffProfile.org_id).eq('status', 'invited'),
  ]);
  return org.seats_purchased - (activeCount ?? 0) - (pendingCount ?? 0);
}

// ------------------------------------------------------------------
// Named invite (single student)
// ------------------------------------------------------------------
document.getElementById('send-invite-btn').addEventListener('click', async () => {
  const name = document.getElementById('invite-name-input').value.trim() || null;
  const email = document.getElementById('invite-email-input').value.trim();
  const classId = document.getElementById('invite-class-select').value || null;
  const msg = document.getElementById('invite-msg');
  if (!email) return;

  const btn = document.getElementById('send-invite-btn');
  btn.disabled = true;
  msg.style.display = 'none';

  const available = await seatsAvailable();
  if (available <= 0) {
    btn.disabled = false;
    msg.style.display = 'block';
    msg.style.color = '#c62828';
    msg.textContent = 'No seats available. Free one up or contact us to add more before inviting another student.';
    return;
  }

  const { data, error } = await supabaseClient.from('pending_students').insert({
    org_id: staffProfile.org_id,
    counselor_id: staffProfile.id,
    class_id: classId,
    email,
    full_name: name,
  }).select().single();

  btn.disabled = false;
  msg.style.display = 'block';
  if (error) {
    console.error(error);
    msg.style.color = '#c62828';
    msg.textContent = `Could not send invite: ${error.message}`;
    return;
  }

  const inviteLink = `${window.location.origin}/login.html?invite=${data.invite_token}`;
  msg.style.color = 'var(--teal-deep)';
  msg.innerHTML = `Invite created ✓ Share this link with the student: <br><strong style="word-break:break-all; color:var(--ink);">${inviteLink}</strong>`;
  document.getElementById('invite-name-input').value = '';
  document.getElementById('invite-email-input').value = '';
  loadSeats();
  loadPendingInvites();
});

// ------------------------------------------------------------------
// CSV bulk import
// ------------------------------------------------------------------
document.getElementById('csv-upload-btn').addEventListener('click', () => {
  const fileInput = document.getElementById('csv-file-input');
  const classId = document.getElementById('csv-class-select').value || null;
  const msgEl = document.getElementById('csv-msg');
  const file = fileInput.files[0];
  if (!file) return;

  const btn = document.getElementById('csv-upload-btn');
  btn.disabled = true;
  msgEl.innerHTML = '';

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const rows = (results.data || [])
        .map(r => {
          const normalized = {};
          Object.keys(r).forEach(key => { normalized[key.trim().toLowerCase()] = r[key]; });
          return {
            email: (normalized.email || '').trim(),
            full_name: (normalized.name || normalized.full_name || '').trim() || null,
          };
        })
        .filter(r => r.email);

      if (rows.length === 0) {
        btn.disabled = false;
        msgEl.innerHTML = `<p class="dash-empty" style="color:#c62828;">No valid rows found. Make sure your CSV has a "name" and "email" column.</p>`;
        return;
      }

      const available = await seatsAvailable();
      if (available < rows.length) {
        btn.disabled = false;
        const displayAvailable = Math.max(0, available === Infinity ? 0 : available);
        const shortfall = available === Infinity ? 0 : rows.length - available;
        msgEl.innerHTML = `<p class="dash-empty" style="color:#c62828;">You have ${displayAvailable} seat${displayAvailable === 1 ? '' : 's'} left, this file has ${rows.length} row${rows.length === 1 ? '' : 's'} (${shortfall} too many). Nothing was imported — free up seats or trim the file and try again.</p>`;
        return;
      }

      const { error } = await supabaseClient.from('pending_students').insert(
        rows.map(r => ({
          org_id: staffProfile.org_id,
          counselor_id: staffProfile.id,
          class_id: classId,
          email: r.email,
          full_name: r.full_name,
        }))
      );

      btn.disabled = false;
      if (error) {
        console.error(error);
        msgEl.innerHTML = `<p class="dash-empty" style="color:#c62828;">Could not import: ${error.message}</p>`;
        return;
      }

      msgEl.innerHTML = `<p class="dash-empty" style="color:var(--teal-deep);">Imported ${rows.length} student${rows.length === 1 ? '' : 's'} ✓ Each one has a pending invite below.</p>`;
      fileInput.value = '';
      loadSeats();
      loadPendingInvites();
    },
    error: (err) => {
      btn.disabled = false;
      console.error(err);
      msgEl.innerHTML = `<p class="dash-empty" style="color:#c62828;">Could not read that file. Make sure it's a valid CSV.</p>`;
    },
  });
});

// ------------------------------------------------------------------
// Pending invites list
// ------------------------------------------------------------------
async function loadPendingInvites() {
  const { data, error } = await supabaseClient
    .from('pending_students')
    .select('*, classes(name)')
    .eq('org_id', staffProfile.org_id)
    .eq('status', 'invited')
    .order('created_at', { ascending: false });

  const el = document.getElementById('pending-list');
  if (error) {
    console.error(error);
    el.innerHTML = `<p class="dash-empty">Could not load pending invites.</p>`;
    return;
  }
  if (data.length === 0) {
    el.innerHTML = `<p class="dash-empty">No pending invites — everyone you've invited has joined.</p>`;
    return;
  }

  el.innerHTML = data.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px; flex-wrap:wrap; gap:8px;">
      <div>
        <strong style="color:var(--ink);">${escapeHtml(p.full_name || p.email)}</strong>
        <span class="dash-empty"> · ${escapeHtml(p.email)}${p.classes ? ' · ' + escapeHtml(p.classes.name) : ''}</span>
      </div>
      <button class="achv-demo-btn" style="width:auto; padding:6px 14px;" data-cancel-invite="${p.id}">Cancel</button>
    </div>
  `).join('');

  document.querySelectorAll('[data-cancel-invite]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await supabaseClient.from('pending_students').delete().eq('id', btn.dataset.cancelInvite);
      if (error) {
        console.error(error);
        alert(`Could not cancel: ${error.message}`);
        return;
      }
      loadSeats();
      loadPendingInvites();
    });
  });
}

// ------------------------------------------------------------------
// Referral codes (unchanged from before)
// ------------------------------------------------------------------
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
    el.innerHTML = `<p class="dash-empty">No referral codes yet. Generate your first one.</p>`;
    return;
  }

  el.innerHTML = data.map(row => {
    const status = codeStatus(row);
    return `
      <div class="code-row">
        <div>
          <div class="code-value">${row.code}</div>
          <div class="dash-empty" style="font-size:11.5px;">Expires: ${row.expires_at ? fmtDateLong(row.expires_at) : 'No expiration'}</div>
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
      const { error } = await supabaseClient.from('referral_codes').update({ active: !isActive }).eq('id', id);
      if (error) {
        console.error(error);
        alert(`Could not update: ${error.message}`);
        return;
      }
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
    resultEl.innerHTML = `<p class="dash-empty">Could not generate a code: ${error.message}</p>`;
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
  loadSeats();
  loadClasses();
  loadPendingInvites();
  loadCodes();
})();
