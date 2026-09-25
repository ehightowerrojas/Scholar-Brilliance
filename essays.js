// ------------------------------------------------------------------
// My Essays logic
// ------------------------------------------------------------------

let essayUserId = null;
let allEssays = [];
let userScholarships = [];

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function essayStatus(essay) {
  const s = essay.scholarship;
  if (!s) return { key: 'working', label: 'Working On' };
  if (s.status === 'funds_received') return { key: 'funds_received', label: 'Funds Received' };
  if (s.outcome === 'won') return { key: 'won', label: 'Won' };
  if (s.outcome === 'not_selected') return { key: 'not_selected', label: 'Not Selected' };
  if (s.status === 'submitted') return { key: 'submitted', label: 'Submitted' };
  return { key: 'working', label: 'Working On' };
}

function badgeClass(key) {
  if (key === 'won') return 'won';
  if (key === 'funds_received') return 'funds-received';
  if (key === 'not_selected') return 'not-selected';
  return '';
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  essayUserId = session.user.id;

  const [{ data: essays, error: essaysErr }, { data: scholarships }] = await Promise.all([
    supabaseClient.from('essays').select('*').eq('user_id', essayUserId).order('updated_at', { ascending: false }),
    supabaseClient.from('scholarships').select('id, title, status, outcome, essay_prompt').eq('user_id', essayUserId),
  ]);

  if (essaysErr) {
    console.error(essaysErr);
    document.getElementById('essays-list').innerHTML = `<p class="dash-empty">Could not load essays.</p>`;
    return;
  }

  userScholarships = scholarships || [];
  const scholarshipMap = Object.fromEntries(userScholarships.map(s => [s.id, s]));
  allEssays = essays.map(e => ({ ...e, scholarship: e.scholarship_id ? scholarshipMap[e.scholarship_id] : null }));

  populateScholarshipDropdown();
  renderStats();
  applyFiltersAndRender();

  // Arriving from the Tracker with ?scholarship=<id> should show that
  // scholarship's essays, nothing more — not pop open a new-essay
  // form. Reuses the existing search box, which already matches
  // against scholarship title.
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('scholarship');
  if (preselect && scholarshipMap[preselect]) {
    document.getElementById('essay-search').value = scholarshipMap[preselect].title;
    applyFiltersAndRender();

    const banner = document.getElementById('filter-confirm-banner');
    banner.style.display = 'block';
    banner.innerHTML = `Showing essays for <strong>${escapeHtml(scholarshipMap[preselect].title)}</strong>. <button id="clear-filter-btn" style="background:none; border:none; text-decoration:underline; cursor:pointer; color:var(--purple); font-weight:600; padding:0;">Show all essays</button>`;
    document.getElementById('clear-filter-btn').addEventListener('click', () => {
      document.getElementById('essay-search').value = '';
      banner.style.display = 'none';
      applyFiltersAndRender();
    });
  }
}

function populateScholarshipDropdown() {
  const select = document.getElementById('essay-scholarship');
  select.innerHTML = '<option value="">Not linked yet, standalone draft</option>' +
    userScholarships.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('');
}

function renderStats() {
  const withStatus = allEssays.map(e => essayStatus(e));
  document.getElementById('stat-total').textContent = allEssays.length;
  document.getElementById('stat-won').textContent = withStatus.filter(s => s.key === 'won').length;
  document.getElementById('stat-submitted').textContent = withStatus.filter(s => s.key === 'submitted').length;
  document.getElementById('stat-working').textContent = withStatus.filter(s => s.key === 'working').length;
}

function applyFiltersAndRender() {
  const q = document.getElementById('essay-search').value.trim().toLowerCase();
  const filter = document.getElementById('essay-filter').value;

  let list = allEssays;
  if (filter !== 'all') {
    list = list.filter(e => essayStatus(e).key === filter);
  }
  if (q) {
    list = list.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.content || '').toLowerCase().includes(q) ||
      (e.scholarship?.title || '').toLowerCase().includes(q)
    );
  }
  renderEssays(list);
}

function renderEssays(list) {
  const el = document.getElementById('essays-list');
  if (list.length === 0) {
    el.innerHTML = `<p class="dash-empty">No essays match here yet.</p>`;
    return;
  }

  el.innerHTML = list.map(e => {
    const status = essayStatus(e);
    const preview = (e.content || '').slice(0, 160);
    return `
      <div class="catalog-card">
        <div class="catalog-card-top">
          <h4>${escapeHtml(e.scholarship?.title) || 'Standalone draft'}</h4>
          <span class="kanban-badge ${badgeClass(status.key)}">${status.label}</span>
        </div>
        <p class="dash-empty" style="margin-top:4px; font-weight:600; color:var(--fg);">${escapeHtml(e.title)}</p>
        ${e.scholarship?.essay_prompt ? `<p style="font-size:13px; font-style:italic; color:var(--muted); background:var(--card-soft); padding:8px 10px; border-radius:var(--radius-sm); margin-top:8px;"><strong style="font-style:normal;">Prompt:</strong> ${escapeHtml(e.scholarship.essay_prompt)}</p>` : ''}
        <p class="catalog-desc" id="preview-${e.id}">${escapeHtml(preview)}${e.content.length > 160 ? '…' : ''}</p>
        <div class="catalog-card-meta">
          <span>${wordCount(e.content)} words</span>
          <span>Updated ${new Date(e.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div class="catalog-card-actions">
          <button class="achv-demo-btn" data-view="${e.id}">View Full Essay</button>
          <button class="achv-demo-btn" data-pdf="${e.id}">Download PDF</button>
          <button class="achv-demo-btn" data-edit="${e.id}">Edit</button>
          <button class="achv-demo-btn" data-delete="${e.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const essay = allEssays.find(x => x.id === btn.dataset.view);
      const previewEl = document.getElementById(`preview-${essay.id}`);
      const expanded = previewEl.dataset.expanded === 'true';
      previewEl.textContent = expanded ? (essay.content.slice(0, 160) + (essay.content.length > 160 ? '…' : '')) : essay.content;
      previewEl.dataset.expanded = String(!expanded);
      btn.textContent = expanded ? 'View Full Essay' : 'Collapse';
    });
  });

  document.querySelectorAll('[data-pdf]').forEach(btn => {
    btn.addEventListener('click', () => {
      const essay = allEssays.find(x => x.id === btn.dataset.pdf);
      downloadEssayPDF(essay.title, essay.content);
    });
  });

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const essay = allEssays.find(x => x.id === btn.dataset.edit);
      openForm(essay);
    });
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabaseClient.from('essays').delete().eq('id', btn.dataset.delete).eq('user_id', essayUserId);
      init();
    });
  });
}

// ---- Add/Edit form ----
const form = document.getElementById('essay-form');
function updatePromptReference() {
  const scholarshipId = document.getElementById('essay-scholarship').value;
  const box = document.getElementById('essay-prompt-reference');
  const text = document.getElementById('essay-prompt-reference-text');
  const scholarship = userScholarships.find(s => s.id === scholarshipId);

  if (scholarship?.essay_prompt) {
    box.style.display = 'block';
    text.textContent = scholarship.essay_prompt;
  } else {
    box.style.display = 'none';
  }
}
document.getElementById('essay-scholarship').addEventListener('change', updatePromptReference);

function openForm(essay) {
  form.style.display = 'block';
  document.getElementById('essay-id').value = essay?.id || '';
  document.getElementById('essay-title').value = essay?.title || '';
  document.getElementById('essay-scholarship').value = essay?.scholarship_id || '';
  document.getElementById('essay-content').value = essay?.content || '';
  document.getElementById('essay-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
  updatePromptReference();
}
document.getElementById('add-toggle-btn').addEventListener('click', () => {
  if (form.style.display === 'none') openForm();
  else { form.style.display = 'none'; form.reset(); }
});
document.getElementById('cancel-essay-btn').addEventListener('click', () => {
  form.style.display = 'none';
  form.reset();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('essay-id').value;
  const title = document.getElementById('essay-title').value.trim();
  const scholarshipId = document.getElementById('essay-scholarship').value || null;
  const content = document.getElementById('essay-content').value;
  if (!title) return;

  const msg = document.getElementById('essay-save-msg');
  msg.style.display = 'none';

  if (id) {
    const { error } = await supabaseClient.from('essays')
      .update({ title, scholarship_id: scholarshipId, content })
      .eq('id', id).eq('user_id', essayUserId);
    if (error) {
      console.error(error);
      msg.style.display = 'block';
      msg.style.color = '#c62828';
      msg.textContent = `Could not save: ${error.message}`;
      return;
    }
  } else {
    const { error } = await supabaseClient.from('essays')
      .insert({ user_id: essayUserId, title, scholarship_id: scholarshipId, content });
    if (error) {
      console.error(error);
      msg.style.display = 'block';
      msg.style.color = '#c62828';
      msg.textContent = `Could not save: ${error.message}`;
      return;
    }
    await awardAchievement('draft_master', essayUserId);
  }

  if (content.trim().length > 0) {
    await awardAchievement('document_ready', essayUserId);
  }

  celebrateCompanion();
  if (typeof ScholarSound !== 'undefined') ScholarSound.achievement();

  form.style.display = 'none';
  form.reset();
  init();
});

document.getElementById('essay-search').addEventListener('input', applyFiltersAndRender);
document.getElementById('essay-filter').addEventListener('change', applyFiltersAndRender);

// ---- PDF export ----
function downloadEssayPDF(title, content) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 50;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(title || 'Untitled essay', pageWidth - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 20 + 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(content || '(No content yet)', pageWidth - margin * 2);
  const lineHeight = 15;

  bodyLines.forEach(line => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  });

  const filename = (title || 'essay').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${filename}.pdf`);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Sign out failed, forcing local logout:', err);
  } finally {
    // Always redirect, even if the server-side sign-out call failed —
    // otherwise a network hiccup makes the button look completely broken.
    // Belt-and-suspenders: explicitly clear any Supabase session
    // keys directly, on top of signOut() above. Guards against a
    // stale session persisting into the next login on this device,
    // which could otherwise show one account's data under a
    // different one that just logged in.
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    window.location.href = 'login.html';
  }
});

init();