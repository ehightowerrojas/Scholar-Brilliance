// ------------------------------------------------------------------
// Application Tracker logic
// ------------------------------------------------------------------

let currentUserId = null;

function outcomeBadge(outcome) {
  if (outcome === 'won') return '<span class="kanban-badge won">Won</span>';
  if (outcome === 'not_selected') return '<span class="kanban-badge not-selected">Not selected</span>';
  return '';
}

// Urgency is computed relative to today (not fixed calendar months),
// so it stays meaningful all year round rather than only working for
// whatever month a hardcoded example happened to use.
function urgencyClass(deadline) {
  if (!deadline) return '';
  const days = (new Date(deadline) - new Date(new Date().toDateString())) / 86400000;
  if (days < 0) return 'urgency-overdue';
  if (days <= 14) return 'urgency-soon';
  if (days <= 30) return 'urgency-month';
  if (days <= 60) return 'urgency-later';
  return '';
}

function fundingTierBadge(amount) {
  if (amount == null) return '';
  if (amount >= 5000) return '<span class="funding-tier-badge tier-high">High value</span>';
  if (amount >= 1000) return '<span class="funding-tier-badge tier-mid">Mid value</span>';
  return '';
}

function renderCard(row) {
  const isSubmitted = row.status === 'submitted';
  const outcomeControls = isSubmitted && !row.outcome ? `
    <div class="kanban-card-actions">
      <button class="achv-demo-btn" data-outcome-btn="won" data-id="${row.id}">Mark won</button>
      <button class="achv-demo-btn" data-outcome-btn="not_selected" data-id="${row.id}">Not selected</button>
    </div>` : '';

  const fundsControl = (isSubmitted && row.outcome === 'won') ? `
    <div class="kanban-card-actions">
      <button class="achv-demo-btn" data-confirm-funds="${row.id}">✓ Confirm funds received</button>
    </div>` : '';

  const fundsBadge = row.status === 'funds_received'
    ? '<span class="kanban-badge funds-received">Funds Received</span>'
    : outcomeBadge(row.outcome);

  const essayPromptHtml = row.essay_prompt
    ? `<p class="kanban-card-prompt">"${escapeHtml(row.essay_prompt.length > 90 ? row.essay_prompt.slice(0, 90) + '…' : row.essay_prompt)}"</p>`
    : '';

  const recLettersHtml = (row.rec_letters_needed != null && row.rec_letters_needed > 0)
    ? `<span class="kanban-rec-letters">✉️ ${row.rec_letters_needed} rec. letter${row.rec_letters_needed === 1 ? '' : 's'}</span>`
    : '';

  return `
    <div class="kanban-card ${urgencyClass(row.deadline)}" draggable="true" data-id="${row.id}">
      <div class="kanban-card-top">
        <h4>${escapeHtml(row.title)}</h4>
        <button class="kanban-delete" data-delete="${row.id}" aria-label="Delete">×</button>
      </div>
      <div class="kanban-card-meta">
        ${row.amount != null ? `<span>${fmtMoney(row.amount)}</span>` : ''}
        ${row.deadline ? `<span>${fmtDateLong(row.deadline)}</span>` : ''}
        ${fundingTierBadge(row.amount)}
      </div>
      ${essayPromptHtml}
      ${recLettersHtml}
      <div>
        ${safeLink(row.website, 'Website ↗', 'target="_blank" rel="noopener" class="kanban-link"')}
        <a href="essays.html?scholarship=${row.id}" class="kanban-link" style="margin-left:12px;">Essay →</a>
        <a href="application.html?scholarship=${row.id}" class="kanban-link" style="margin-left:12px;">Build Application →</a>
      </div>
      ${fundsBadge}
      ${outcomeControls}
      ${fundsControl}
    </div>
  `;
}

async function populateGoalDropdown() {
  const { data: goals, error } = await supabaseClient
    .from('goals')
    .select('id, name')
    .eq('student_id', currentUserId)
    .order('created_at');

  if (error) {
    console.error(error);
    return;
  }

  const select = document.getElementById('s-goal');
  const current = select.value;
  select.innerHTML = '<option value="">No specific goal</option>' +
    (goals || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  select.value = current;
}

async function loadBoard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  currentUserId = session.user.id;

  populateGoalDropdown();

  const { data, error } = await supabaseClient
    .from('scholarships')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  ['backlog', 'researching', 'writing', 'in_review', 'submitted', 'funds_received'].forEach(status => {
    const rows = data
      .filter(r => r.status === status)
      .sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      });
    document.getElementById(`col-${status}`).innerHTML = rows.map(renderCard).join('');
    document.getElementById(`count-${status}`).textContent = rows.length;
  });

  const submittedCount = data.filter(r => r.status === 'submitted' || r.status === 'funds_received').length;
  await checkApplicationMilestones(submittedCount, currentUserId);

  wireCardEvents();
}

function wireCardEvents() {
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      await supabaseClient.from('scholarships').delete().eq('id', id).eq('user_id', currentUserId);
      loadBoard();
    });
  });

  document.querySelectorAll('[data-outcome-btn]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const outcome = btn.dataset.outcomeBtn;
      await supabaseClient.from('scholarships').update({ outcome }).eq('id', id).eq('user_id', currentUserId);
      if (outcome === 'won' && typeof ScholarSound !== 'undefined') ScholarSound.won();
      if (outcome === 'won' && typeof celebrateCompanion === 'function') celebrateCompanion();
      loadBoard();
    });
  });

  document.querySelectorAll('[data-confirm-funds]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.confirmFunds;
      await supabaseClient.from('scholarships').update({ status: 'funds_received' }).eq('id', id).eq('user_id', currentUserId);
      loadBoard();
    });
  });
}

function wireColumnDrops() {
  document.querySelectorAll('.kanban-drop').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const newStatus = col.closest('.kanban-col').dataset.status;

      const update = { status: newStatus };
      if (newStatus === 'funds_received') {
        update.outcome = 'won'; // only won scholarships end up here
      } else if (newStatus !== 'submitted') {
        update.outcome = null; // moving back to an earlier stage clears any outcome
      }

      await supabaseClient.from('scholarships').update(update).eq('id', id).eq('user_id', currentUserId);
      await awardAchievement('organizer', currentUserId);
      if (newStatus === 'submitted') await awardAchievement('first_submission', currentUserId);
      loadBoard();
    });
  });
}

// ---- Add scholarship form ----
const addToggleBtn = document.getElementById('add-toggle-btn');
const addForm = document.getElementById('add-form');
const cancelAddBtn = document.getElementById('cancel-add-btn');

addToggleBtn.addEventListener('click', () => {
  addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
});
cancelAddBtn.addEventListener('click', () => {
  addForm.style.display = 'none';
  addForm.reset();
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('s-title').value.trim();
  const amount = document.getElementById('s-amount').value || null;
  const deadline = document.getElementById('s-deadline').value || null;
  const website = document.getElementById('s-website').value.trim() || null;
  const essayPrompt = document.getElementById('s-essay-prompt').value.trim() || null;
  const recLetters = document.getElementById('s-rec-letters').value || null;
  const goalId = document.getElementById('s-goal').value || null;

  if (!title) return;

  const { error } = await supabaseClient.from('scholarships').insert({
    user_id: currentUserId,
    title,
    amount,
    deadline,
    website,
    essay_prompt: essayPrompt,
    rec_letters_needed: recLetters,
    goal_id: goalId,
    status: 'backlog',
  });

  if (error) {
    console.error(error);
    return;
  }

  await awardAchievement('tracker_starter', currentUserId);

  addForm.reset();
  addForm.style.display = 'none';
  loadBoard();
});

document.getElementById('import-captured-btn').addEventListener('click', () => {
  const picker = document.getElementById('captured-picker');
  const btn = document.getElementById('import-captured-btn');
  btn.disabled = true;
  btn.textContent = 'Checking extension…';

  const listener = (event) => {
    if (event.source !== window || event.data?.type !== 'SCHOLAR_BRILLIANCE_CAPTURED_QUESTIONS') return;
    window.removeEventListener('message', listener);
    btn.disabled = false;
    btn.textContent = '📋 Import from extension';

    const pages = event.data.capturedPages || [];
    if (pages.length === 0) {
      picker.style.display = 'block';
      picker.innerHTML = `<p class="dash-empty" style="font-size:12px;">No captured questions yet — open a scholarship's application page, click the Scholar Brilliance Autofill extension icon, then "Capture this page's questions."</p>`;
      return;
    }

    picker.style.display = 'block';
    picker.innerHTML = pages.map((page, pi) => `
      <div style="border:1px solid var(--line); border-radius:var(--radius-sm); padding:8px 10px; margin-bottom:6px;">
        <p style="font-size:12.5px; font-weight:600; margin:0 0 6px;">${escapeHtml(page.title || page.url)}</p>
        ${page.questions.map((q, qi) => `
          <button type="button" class="btn btn-line" data-page="${pi}" data-q="${qi}" style="display:block; width:100%; text-align:left; padding:6px 10px; font-size:12px; margin-bottom:4px; white-space:normal;">${escapeHtml(q.question.length > 100 ? q.question.slice(0, 100) + '…' : q.question)}</button>
        `).join('')}
      </div>
    `).join('');

    picker.querySelectorAll('[data-page]').forEach((qBtn) => {
      qBtn.addEventListener('click', () => {
        const page = pages[qBtn.dataset.page];
        const question = page.questions[qBtn.dataset.q];
        document.getElementById('s-essay-prompt').value = question.question;
        if (!document.getElementById('s-website').value) {
          document.getElementById('s-website').value = page.url;
        }
        picker.style.display = 'none';
      });
    });
  };
  window.addEventListener('message', listener);
  window.postMessage({ type: 'SCHOLAR_BRILLIANCE_REQUEST_CAPTURED_QUESTIONS' }, window.location.origin);

  setTimeout(() => {
    if (btn.disabled) {
      window.removeEventListener('message', listener);
      btn.disabled = false;
      btn.textContent = '📋 Import from extension';
      picker.style.display = 'block';
      picker.innerHTML = `<p class="dash-empty" style="font-size:12px; color:#c62828;">No extension detected — install the Scholar Brilliance Autofill extension first.</p>`;
    }
  }, 800);
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Sign out failed, forcing local logout:', err);
  } finally {
    // Always redirect, even if the server-side sign-out call failed —
    // otherwise a network hiccup makes the button look completely broken.
    window.location.href = 'login.html';
  }
});

wireColumnDrops();
loadBoard();
