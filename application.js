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
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  appUserId = session.user.id;
  appUserEmail = session.user.email;

  const params = new URLSearchParams(window.location.search);
  const scholarshipId = params.get('scholarship');

  if (!scholarshipId) {
    await showScholarshipPicker();
    return;
  }

  const [{ data: scholarship, error: schErr }, { data: profile }, { data: essays }, { data: questions }] = await Promise.all([
    supabaseClient.from('scholarships').select('*').eq('id', scholarshipId).eq('user_id', appUserId).single(),
    supabaseClient.from('profiles').select('*').eq('id', appUserId).single(),
    supabaseClient.from('essays').select('*').eq('scholarship_id', scholarshipId).eq('user_id', appUserId).order('updated_at', { ascending: false }).limit(1),
    supabaseClient.from('scholarship_questions').select('*').eq('scholarship_id', scholarshipId).eq('user_id', appUserId).order('sort_order'),
  ]);

  if (schErr || !scholarship) {
    document.getElementById('scholarship-not-found').style.display = 'block';
    return;
  }

  currentScholarship = scholarship;
  currentProfile = profile;
  currentEssay = essays?.[0] || null;
  currentQuestions = questions || [];

  document.getElementById('scholarship-title').textContent = scholarship.title;
  document.getElementById('scholarship-sub').textContent = scholarship.amount
    ? `$${Number(scholarship.amount).toLocaleString()}${scholarship.deadline ? ' · Deadline: ' + new Date(scholarship.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
    : '';
  document.getElementById('scholarship-title').style.borderBottomColor = scholarship.color && COLOR_HEX[scholarship.color] ? COLOR_HEX[scholarship.color] : 'transparent';
  document.getElementById('import-url-input').value = scholarship.website || '';

  document.getElementById('builder-content').style.display = 'block';

  renderInfo();
  renderEssay();
  renderQuestions();

  const visitBtn = document.getElementById('visit-site-btn');
  if (scholarship.website) {
    visitBtn.href = scholarship.website;
  } else {
    visitBtn.style.display = 'none';
  }
}

// Same color keys/hex values as the Tracker's .color-* CSS classes,
// kept in sync manually since this list renders as .dash-card rather
// than .kanban-card and so can't just reuse those classes directly.
const COLOR_HEX = {
  tomato: '#e57373', tangerine: '#ffb74d', banana: '#dbc400', sage: '#66bb6a',
  peacock: '#26a69a', blueberry: '#5c9ce6', lavender: '#9575cd', graphite: '#78909c',
};

let currentQuestions = [];

document.getElementById('import-toggle-btn').addEventListener('click', () => {
  const panel = document.getElementById('import-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('import-fetch-btn').addEventListener('click', async () => {
  const url = document.getElementById('import-url-input').value.trim();
  const resultEl = document.getElementById('import-result');
  if (!url) return;

  resultEl.innerHTML = `<p class="dash-empty">Fetching…</p>`;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const resp = await fetch(`/api/extract?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await resp.json();

    if (data.error) {
      resultEl.innerHTML = `<p class="dash-empty">${escapeHtml(data.error)}</p>`;
      return;
    }
    if (!data.extracted) {
      resultEl.innerHTML = `<p class="dash-empty">Couldn't find any details on that page.</p>`;
      return;
    }

    resultEl.innerHTML = `
      <div style="background:var(--card-soft); border-radius:var(--radius-sm); padding:12px;">
        <p style="font-size:13px; color:var(--ink);"><strong>${escapeHtml(data.title) || 'Untitled'}</strong>${data.amount ? ` · $${Number(data.amount).toLocaleString()}` : ''}</p>
        ${data.deadlineText ? `<p class="dash-empty" style="margin-top:2px;">Possible deadline: ${escapeHtml(data.deadlineText)}</p>` : ''}
        <button class="btn btn-gold" id="apply-import-btn" style="margin-top:10px; padding:8px 16px; font-size:13px;">Apply these details</button>
      </div>
    `;

    document.getElementById('apply-import-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Applying…';

      const updates = { website: url };
      if (data.title) updates.title = data.title;
      if (data.amount) updates.amount = data.amount;

      const { error } = await supabaseClient.from('scholarships').update(updates).eq('id', currentScholarship.id).eq('user_id', appUserId);
      if (error) {
        console.error(error);
        e.target.textContent = 'Could not apply, try again';
        e.target.disabled = false;
        return;
      }

      Object.assign(currentScholarship, updates);
      document.getElementById('scholarship-title').textContent = currentScholarship.title;
      document.getElementById('scholarship-sub').textContent = currentScholarship.amount
        ? `$${Number(currentScholarship.amount).toLocaleString()}${currentScholarship.deadline ? ' · Deadline: ' + new Date(currentScholarship.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
        : '';
      const visitBtn = document.getElementById('visit-site-btn');
      visitBtn.href = url;
      visitBtn.style.display = '';

      e.target.textContent = 'Applied ✓';
      awardAchievement('first_import', appUserId);
    });
  } catch (err) {
    console.error(err);
    resultEl.innerHTML = `<p class="dash-empty">Something went wrong reaching that page.</p>`;
  }
});

let pickerScholarships = [];

// Shown when Application Builder is opened directly from the sidebar,
// with no specific scholarship picked yet — lets the student choose
// which one to work on, same role the old "My Essays" list used to
// serve, but scoped to scholarships rather than standalone essays.
async function showScholarshipPicker() {
  document.getElementById('scholarship-title').textContent = 'Which scholarship are you working on?';
  document.getElementById('scholarship-picker').style.display = 'block';
  const listEl = document.getElementById('scholarship-picker-list');

  const { data: scholarships, error } = await supabaseClient
    .from('scholarships')
    .select('id, title, amount, deadline, status, color')
    .eq('user_id', appUserId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    listEl.innerHTML = `<p class="dash-empty">Could not load your scholarships right now.</p>`;
    return;
  }
  if (!scholarships || scholarships.length === 0) {
    listEl.innerHTML = `<p class="dash-empty">You haven't added any scholarships yet. <a href="tracker.html" style="color:var(--purple); font-weight:600;">Add one in your Tracker →</a></p>`;
    return;
  }

  pickerScholarships = scholarships;
  renderScholarshipPickerList(scholarships);
}

function renderScholarshipPickerList(scholarships) {
  const listEl = document.getElementById('scholarship-picker-list');
  if (scholarships.length === 0) {
    listEl.innerHTML = `<p class="dash-empty">No matches.</p>`;
    return;
  }
  listEl.innerHTML = scholarships.map(s => `
    <a href="application.html?scholarship=${s.id}" style="display:block; margin-bottom:10px; text-decoration:none; transition:border-color .15s ease; background:#fbf6ec; border:1px solid #e8dfc8; border-radius:var(--radius-sm); padding:14px 18px;">
      <p style="font-weight:600; color:var(--ink); margin:0; padding-bottom:8px; margin-bottom:8px; border-bottom:3px solid ${s.color && COLOR_HEX[s.color] ? COLOR_HEX[s.color] : 'transparent'};">${escapeHtml(s.title)}</p>
      <p class="dash-empty" style="margin-top:0;">${s.amount ? '$' + Number(s.amount).toLocaleString() : 'No amount set'}${s.deadline ? ' · due ' + new Date(s.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</p>
    </a>
  `).join('');
}

document.getElementById('scholarship-picker-search').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? pickerScholarships.filter(s => s.title.toLowerCase().includes(term)) : pickerScholarships;
  renderScholarshipPickerList(filtered);
});

function renderInfo() {
  const el = document.getElementById('appinfo-content');
  const rows = INFO_FIELDS.map(([label, getter]) => {
    const value = getter(currentProfile || {});
    return { label, value: value || '—' };
  });

  const missing = rows.filter(r => r.value === '—').length;

  el.innerHTML = `
    ${missing > 0 ? `<p class="dash-empty" style="margin-bottom:10px;">${missing} field${missing > 1 ? 's are' : ' is'} empty. <a href="account.html" style="color:var(--purple); font-weight:600;">Fill them in on Account Settings →</a></p>` : ''}
    ${rows.map(r => `
      <div class="deadline-row">
        <span>${r.label}</span>
        <span class="dash-empty" style="font-weight:600; color:var(--ink);">${escapeHtml(String(r.value))}</span>
      </div>
    `).join('')}
  `;
}

// Populates the inline essay editor with whatever's already saved for
// this scholarship (if anything) - writing now happens directly here
// rather than linking out to a separate page.
function renderEssay() {
  document.getElementById('essay-title-input').value = currentEssay?.title || '';
  document.getElementById('essay-content-input').value = currentEssay?.content || '';
}

function renderQuestions() {
  const listEl = document.getElementById('questions-list');
  if (currentQuestions.length === 0) {
    listEl.innerHTML = `<p class="dash-empty" style="margin-bottom:12px;">No questions added yet.</p>`;
    return;
  }
  listEl.innerHTML = currentQuestions.map(q => `
    <div class="field" data-question-id="${q.id}" style="border:1px solid var(--line); border-radius:var(--radius-sm); padding:14px; margin-bottom:12px;">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <input type="text" class="question-text-input" value="${escapeHtml(q.question)}" placeholder="e.g. List your extracurricular activities" style="flex:1; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line); background:var(--white); color:var(--ink); font-weight:600;">
        <button class="delete-question-btn" aria-label="Delete question" style="background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px; padding:4px 8px; flex-shrink:0;">×</button>
      </div>
      <textarea class="question-answer-input" rows="3" placeholder="Your answer…" style="width:100%; margin-top:8px; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line); background:var(--white); color:var(--ink); font-family:var(--font-body); font-size:13.5px; resize:vertical;">${escapeHtml(q.answer)}</textarea>
    </div>
  `).join('');

  listEl.querySelectorAll('[data-question-id]').forEach(row => {
    const id = row.dataset.questionId;
    const questionInput = row.querySelector('.question-text-input');
    const answerInput = row.querySelector('.question-answer-input');
    const saveField = async (field, value) => {
      const q = currentQuestions.find(q => q.id === id);
      if (q) q[field] = value;
      await supabaseClient.from('scholarship_questions').update({ [field]: value }).eq('id', id).eq('user_id', appUserId);
    };
    questionInput.addEventListener('blur', () => saveField('question', questionInput.value.trim()));
    answerInput.addEventListener('blur', () => saveField('answer', answerInput.value));
    row.querySelector('.delete-question-btn').addEventListener('click', async () => {
      await supabaseClient.from('scholarship_questions').delete().eq('id', id).eq('user_id', appUserId);
      currentQuestions = currentQuestions.filter(q => q.id !== id);
      renderQuestions();
    });
  });
}

document.getElementById('add-question-btn').addEventListener('click', async () => {
  const sortOrder = currentQuestions.length;
  const { data, error } = await supabaseClient.from('scholarship_questions')
    .insert({ scholarship_id: currentScholarship.id, user_id: appUserId, question: '', answer: '', sort_order: sortOrder })
    .select().single();
  if (error) { console.error(error); return; }
  currentQuestions.push(data);
  renderQuestions();
  await awardAchievement('first_question', appUserId);
  // Focus the newly added question's text field so the student can
  // start typing immediately rather than hunting for it.
  const newRow = document.querySelector(`[data-question-id="${data.id}"] .question-text-input`);
  if (newRow) newRow.focus();
});

document.getElementById('save-essay-btn').addEventListener('click', async () => {
  const title = document.getElementById('essay-title-input').value.trim();
  const content = document.getElementById('essay-content-input').value;
  const msg = document.getElementById('essay-msg');
  if (!title) return;

  const btn = document.getElementById('save-essay-btn');
  btn.disabled = true;
  msg.style.display = 'none';

  let error;
  if (currentEssay) {
    ({ error } = await supabaseClient.from('essays')
      .update({ title, content })
      .eq('id', currentEssay.id).eq('user_id', appUserId));
    if (!error) {
      currentEssay.title = title;
      currentEssay.content = content;
    }
  } else {
    const { data, error: insertError } = await supabaseClient.from('essays')
      .insert({ user_id: appUserId, title, content, scholarship_id: currentScholarship.id })
      .select().single();
    error = insertError;
    if (!error) {
      currentEssay = data;
      await awardAchievement('draft_master', appUserId);
      const { count } = await supabaseClient.from('essays').select('id', { count: 'exact', head: true }).eq('user_id', appUserId);
      if (count) await checkEssayWriterMilestones(count, appUserId);
    }
  }

  btn.disabled = false;
  msg.style.display = 'block';
  if (error) {
    console.error(error);
    msg.style.color = '#c62828';
    msg.textContent = `Could not save: ${error.message}`;
    return;
  }

  msg.style.color = 'var(--teal-deep)';
  msg.textContent = 'Saved ✓';
  if (content.trim().length > 0) await awardAchievement('document_ready', appUserId);
  if (typeof celebrateCompanion === 'function') celebrateCompanion();
  if (typeof ScholarSound !== 'undefined') ScholarSound.achievement();
});

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
  if (currentQuestions.length > 0) {
    lines.push('');
    lines.push('--- Questions ---');
    currentQuestions.forEach(q => {
      if (q.question.trim()) lines.push(`${q.question}\n${q.answer}\n`);
    });
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
    questions: currentQuestions.map(q => ({ question: q.question, answer: q.answer })),
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
    awardAchievement('first_autofill', appUserId);
    setTimeout(() => { btn.textContent = 'Send to Extension'; }, 2500);
  };
  window.addEventListener('message', listener);

  window.postMessage({ type: 'SCHOLAR_BRILLIANCE_APP_DATA', payload }, window.location.origin);

  setTimeout(() => {
    if (!received) {
      window.removeEventListener('message', listener);
      msgEl.style.display = 'block';
      msgEl.innerHTML = `No extension detected on this page. If you've already downloaded it: downloading the file alone doesn't install it — it needs to be loaded as an unpacked extension in <code>chrome://extensions</code> (enable Developer mode, then "Load unpacked"). Also try refreshing this tab, since the extension only activates on pages loaded after it was installed. Otherwise, use the PDF/Copy options instead.`;
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
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-application.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  awardAchievement('first_pdf', appUserId);
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Sign out failed, forcing local logout:', err);
  } finally {
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