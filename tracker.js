// ------------------------------------------------------------------
// Application Tracker logic
// ------------------------------------------------------------------

let currentUserId = null;

function outcomeBadge(outcome) {
  if (outcome === 'won') return '<span class="kanban-badge won">Won</span>';
  if (outcome === 'not_selected') return '<span class="kanban-badge not-selected">Not selected</span>';
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

  return `
    <div class="kanban-card" draggable="true" data-id="${row.id}">
      <div class="kanban-card-top">
        <h4>${escapeHtml(row.title)}</h4>
        <button class="kanban-delete" data-delete="${row.id}" aria-label="Delete">×</button>
      </div>
      <div class="kanban-card-meta">
        ${row.amount != null ? `<span>${fmtMoney(row.amount)}</span>` : ''}
        ${row.deadline ? `<span>${fmtDateLong(row.deadline)}</span>` : ''}
      </div>
      ${safeLink(row.website, 'Website ↗', 'target="_blank" rel="noopener" class="kanban-link"')}
      <a href="essays.html?scholarship=${row.id}" class="kanban-link" style="margin-left:12px;">Essay →</a>
      <a href="application.html?scholarship=${row.id}" class="kanban-link" style="margin-left:12px;">Build Application →</a>
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

  ['saved', 'working', 'submitted', 'funds_received'].forEach(status => {
    const rows = data.filter(r => r.status === status);
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
        update.outcome = null; // moving back to saved/working clears outcome
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
  const goalId = document.getElementById('s-goal').value || null;

  if (!title) return;

  const { error } = await supabaseClient.from('scholarships').insert({
    user_id: currentUserId,
    title,
    amount,
    deadline,
    website,
    goal_id: goalId,
    status: 'saved',
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
