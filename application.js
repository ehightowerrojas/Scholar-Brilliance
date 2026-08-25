// ------------------------------------------------------------------
// Application Builder logic
// ------------------------------------------------------------------

let appUserId = null;
let currentScholarship = null;
let currentProfile = null;
let currentEssay = null;

const INFO_FIELDS = [
  ['Full name', p => p.full_name],
  ['Email', () => appUserEmail],
  ['Phone', p => p.phone],
  ['Address', p => [p.address_line1, p.city, p.state, p.zip_code].filter(Boolean).join(', ')],
  ['School', p => p.school_name],
  ['Graduation year', p => p.graduation_year],
  ['GPA', p => p.gpa],
  ['Intended major', p => p.major],
];

let appUserEmail = '';

async function init() {
  const params = new URLSearchParams(window.location.search);
  const scholarshipId = params.get('scholarship');
  if (!scholarshipId) {
    document.getElementById('scholarship-title').textContent = 'No scholarship selected';
    document.getElementById('scholarship-sub').textContent = 'Open this page from a scholarship card in your Tracker.';
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  appUserId = session.user.id;
  appUserEmail = session.user.email;

  const [{ data: scholarship, error: schErr }, { data: profile }, { data: essays }] = await Promise.all([
    supabaseClient.from('scholarships').select('*').eq('id', scholarshipId).eq('user_id', appUserId).single(),
    supabaseClient.from('profiles').select('*').eq('id', appUserId).single(),
    supabaseClient.from('essays').select('*').eq('scholarship_id', scholarshipId).eq('user_id', appUserId).order('updated_at', { ascending: false }).limit(1),
  ]);

  if (schErr || !scholarship) {
    document.getElementById('scholarship-title').textContent = 'Scholarship not found';
    document.getElementById('scholarship-sub').textContent = "This scholarship isn't in your tracker, or you don't have access to it.";
    return;
  }

  currentScholarship = scholarship;
  currentProfile = profile;
  currentEssay = essays?.[0] || null;

  document.getElementById('scholarship-title').textContent = scholarship.title;
  document.getElementById('scholarship-sub').textContent = scholarship.amount
    ? `$${Number(scholarship.amount).toLocaleString()}${scholarship.deadline ? ' · Deadline: ' + new Date(scholarship.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
    : '';

  renderInfo();
  renderEssay();
  document.getElementById('notes-input').value = scholarship.application_notes || '';

  const visitBtn = document.getElementById('visit-site-btn');
  if (scholarship.website) {
    visitBtn.href = scholarship.website;
  } else {
    visitBtn.style.display = 'none';
  }
}

function renderInfo() {
  const el = document.getElementById('appinfo-content');
  const rows = INFO_FIELDS.map(([label, getter]) => {
    const value = getter(currentProfile || {});
    return { label, value: value || '—' };
  });

  const missing = rows.filter(r => r.value === '—').length;

  el.innerHTML = `
    ${missing > 0 ? `<p class="dash-empty" style="margin-bottom:10px;">${missing} field${missing > 1 ? 's are' : ' is'} empty — <a href="account.html" style="color:var(--purple); font-weight:600;">fill them in on Account Settings →</a></p>` : ''}
    ${rows.map(r => `
      <div class="deadline-row">
        <span>${r.label}</span>
        <span class="dash-empty" style="font-weight:600; color:var(--ink);">${escapeHtml(String(r.value))}</span>
      </div>
    `).join('')}
  `;
}

function renderEssay() {
  const el = document.getElementById('essay-content');
  const link = document.getElementById('edit-essay-link');

  if (!currentEssay) {
    el.innerHTML = `<p class="dash-empty">No essay linked to this scholarship yet.</p>`;
    link.href = `essays.html?scholarship=${currentScholarship.id}`;
    link.textContent = 'Write one in My Essays →';
    return;
  }

  link.href = `essays.html?scholarship=${currentScholarship.id}`;
  const preview = (currentEssay.content || '').slice(0, 300);
  el.innerHTML = `
    <p style="font-weight:600; color:var(--ink); margin-bottom:6px;">${escapeHtml(currentEssay.title)}</p>
    <p class="dash-empty">${escapeHtml(preview)}${currentEssay.content.length > 300 ? '…' : ''}</p>
  `;
}

function buildApplicationText() {
  const lines = [];
  lines.push(`Application: ${currentScholarship.title}`);
  lines.push('');
  lines.push('--- Your Info ---');
  INFO_FIELDS.forEach(([label, getter]) => {
    lines.push(`${label}: ${getter(currentProfile || {}) || ''}`);
  });
  lines.push('');
  lines.push('--- Essay ---');
  lines.push(currentEssay ? `${currentEssay.title}\n\n${currentEssay.content}` : '(No essay linked yet)');
  const notes = document.getElementById('notes-input').value.trim();
  if (notes) {
    lines.push('');
    lines.push('--- Additional Notes ---');
    lines.push(notes);
  }
  return lines.join('\n');
}

document.getElementById('copy-info-btn').addEventListener('click', async () => {
  const text = INFO_FIELDS.map(([label, getter]) => `${label}: ${getter(currentProfile || {}) || ''}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copy-info-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = original; }, 2000);
  } catch (err) {
    console.error(err);
  }
});

document.getElementById('save-notes-btn').addEventListener('click', async () => {
  const notes = document.getElementById('notes-input').value;
  const btn = document.getElementById('save-notes-btn');
  btn.disabled = true;

  const { error } = await supabaseClient.from('scholarships')
    .update({ application_notes: notes })
    .eq('id', currentScholarship.id)
    .eq('user_id', appUserId);

  btn.disabled = false;
  const msg = document.getElementById('notes-msg');
  msg.style.display = 'block';
  msg.textContent = error ? 'Could not save — try again.' : 'Saved ✓';
});

document.getElementById('send-extension-btn').addEventListener('click', () => {
  const payload = {
    scholarshipId: currentScholarship.id,
    scholarshipTitle: currentScholarship.title,
    website: currentScholarship.website || '',
    fullName: currentProfile?.full_name || '',
    email: appUserEmail,
    phone: currentProfile?.phone || '',
    address: currentProfile?.address_line1 || '',
    city: currentProfile?.city || '',
    state: currentProfile?.state || '',
    zip: currentProfile?.zip_code || '',
    school: currentProfile?.school_name || '',
    graduationYear: currentProfile?.graduation_year || '',
    gpa: currentProfile?.gpa || '',
    major: currentProfile?.major || '',
    essay: currentEssay?.content || '',
    notes: document.getElementById('notes-input').value || '',
  };

  const btn = document.getElementById('send-extension-btn');
  const msgEl = document.getElementById('extension-msg');
  msgEl.style.display = 'none';
  let received = false;

  const listener = (event) => {
    if (event.source !== window || event.data?.type !== 'SCHOLAR_BRILLIANCE_APP_DATA_RECEIVED') return;
    received = true;
    window.removeEventListener('message', listener);
    btn.textContent = 'Sent to extension ✓';
    setTimeout(() => { btn.textContent = 'Send to Extension'; }, 2500);
  };
  window.addEventListener('message', listener);

  window.postMessage({ type: 'SCHOLAR_BRILLIANCE_APP_DATA', payload }, window.location.origin);

  setTimeout(() => {
    if (!received) {
      window.removeEventListener('message', listener);
      msgEl.style.display = 'block';
      msgEl.textContent = "No extension detected — install the Scholar Brilliance Autofill extension first, or use the PDF/Copy options instead.";
    }
  }, 800);
});

document.getElementById('export-pdf-btn').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 50;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(`Application: ${currentScholarship.title}`, pageWidth - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 20 + 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(buildApplicationText(), pageWidth - margin * 2);
  const lineHeight = 15;

  bodyLines.forEach(line => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  });

  const filename = currentScholarship.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${filename}-application.pdf`);
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Sign out failed, forcing local logout:', err);
  } finally {
    window.location.href = 'login.html';
  }
});

init();
