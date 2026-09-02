// ------------------------------------------------------------------
// Browse Scholarships logic
// ------------------------------------------------------------------

let browseUserId = null;
let catalogItems = [];

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  browseUserId = session.user.id;
  await loadInterests();
  await loadRecommendations();
  await loadCatalog();
}

const INTEREST_OPTIONS = [
  'STEM', 'Arts & Design', 'Community Service', 'Leadership', 'Athletics',
  'First-Generation', 'Business & Entrepreneurship', 'Healthcare',
  'Environmental', 'Writing & Journalism', 'Music', 'Social Justice',
];
let selectedInterests = new Set();

function renderInterestTags() {
  const container = document.getElementById('interests-tags');
  container.innerHTML = INTEREST_OPTIONS.map(tag => `
    <button type="button" class="interest-tag" data-tag="${escapeHtml(tag)}" aria-pressed="${selectedInterests.has(tag)}">${escapeHtml(tag)}</button>
  `).join('');

  container.querySelectorAll('.interest-tag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tag = btn.dataset.tag;
      if (selectedInterests.has(tag)) selectedInterests.delete(tag);
      else selectedInterests.add(tag);
      btn.setAttribute('aria-pressed', selectedInterests.has(tag));

      const { error } = await supabaseClient.from('profiles')
        .update({ interests: [...selectedInterests].join(', ') })
        .eq('id', browseUserId);

      const msg = document.getElementById('interests-saved-msg');
      if (!error) {
        msg.style.display = 'flex';
        clearTimeout(msg._hideTimer);
        msg._hideTimer = setTimeout(() => { msg.style.display = 'none'; }, 2500);
      }
    });
  });
}

async function loadInterests() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('interests')
    .eq('id', browseUserId)
    .single();
  if (!error && data?.interests) {
    selectedInterests = new Set(data.interests.split(',').map(s => s.trim()).filter(Boolean));
  }
  renderInterestTags();
}

async function loadRecommendations() {
  const { data, error } = await supabaseClient
    .from('scholarship_recommendations')
    .select('*, scholarships_catalog(*)')
    .eq('student_id', browseUserId);

  if (error || !data || data.length === 0) return;

  const section = document.getElementById('recommended-section');
  const list = document.getElementById('recommended-list');
  section.style.display = 'block';

  list.innerHTML = data.map(rec => {
    const item = rec.scholarships_catalog;
    if (!item) return '';
    return `
      <div class="catalog-card" style="border-color:var(--amber);">
        <div class="catalog-card-top">
          <h4>⭐ ${escapeHtml(item.title)}</h4>
          <span class="catalog-amount">${fmtMoney(item.amount)}</span>
        </div>
        <p class="catalog-desc">${escapeHtml(item.description || '')}</p>
        <div class="catalog-card-meta">
          ${item.deadline ? `<span>Deadline: ${fmtDateLong(item.deadline)}</span>` : ''}
          <span>Recommended by ${escapeHtml(item.org_name)}</span>
        </div>
        <div class="catalog-card-actions">
          ${safeLink(item.website, 'Visit Website', 'target="_blank" rel="noopener" class="btn btn-line" style="padding:8px 16px; font-size:13px;"')}
          <button class="btn btn-gold" style="padding:8px 16px; font-size:13px;" data-add-catalog="${item.id}">Add to Tracker</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-add-catalog]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = data.find(r => r.scholarships_catalog?.id === btn.dataset.addCatalog)?.scholarships_catalog;
      if (item) addCatalogItemToTracker(item.id, btn, item);
    });
  });
}

async function loadCatalog() {
  const { data, error } = await supabaseClient
    .from('scholarships_catalog')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) {
    console.error(error);
    document.getElementById('catalog-list').innerHTML = `<p class="dash-empty">Could not load scholarships right now.</p>`;
    return;
  }

  catalogItems = data;
  renderCatalog(catalogItems);
}

function renderCatalog(items) {
  const el = document.getElementById('catalog-list');
  if (items.length === 0) {
    el.innerHTML = `<p class="dash-empty">No scholarships match your search.</p>`;
    return;
  }
  el.innerHTML = items.map(item => `
    <div class="catalog-card">
      <div class="catalog-card-top">
        <h4>${escapeHtml(item.title)}</h4>
        <span class="catalog-amount">${fmtMoney(item.amount)}</span>
      </div>
      <p class="catalog-desc">${escapeHtml(item.description || '')}</p>
      <div class="catalog-card-meta">
        ${item.deadline ? `<span>Deadline: ${fmtDateLong(item.deadline)}</span>` : ''}
        <span>${escapeHtml(item.org_name)}</span>
      </div>
      <div class="catalog-card-actions">
        ${safeLink(item.website, 'Visit Website', 'target="_blank" rel="noopener" class="btn btn-line" style="padding:8px 16px; font-size:13px;"')}
        <button class="btn btn-gold" style="padding:8px 16px; font-size:13px;" data-add-catalog="${item.id}">Add to Tracker</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-add-catalog]').forEach(btn => {
    btn.addEventListener('click', () => addCatalogItemToTracker(btn.dataset.addCatalog, btn));
  });
}

async function addCatalogItemToTracker(catalogId, btn, itemOverride) {
  const item = itemOverride || catalogItems.find(i => i.id === catalogId);
  if (!item) return;

  btn.disabled = true;
  btn.textContent = 'Adding…';

  const { error } = await supabaseClient.from('scholarships').insert({
    user_id: browseUserId,
    title: item.title,
    amount: item.amount,
    deadline: item.deadline,
    website: item.website,
    status: 'backlog',
  });

  if (error) {
    console.error(error);
    btn.textContent = 'Try again';
    btn.disabled = false;
    return;
  }

  await awardAchievement('tracker_starter', browseUserId);
  btn.textContent = 'Added ✓';
}

document.getElementById('catalog-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = q
    ? catalogItems.filter(i => i.title.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
    : catalogItems;
  renderCatalog(filtered);
});

// ---- URL extractor ----
document.getElementById('extract-btn').addEventListener('click', async () => {
  const url = document.getElementById('extract-url').value.trim();
  const resultEl = document.getElementById('extract-result');
  if (!url) return;

  resultEl.innerHTML = `<p class="dash-empty">Extracting…</p>`;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const resp = await fetch(`/api/extract?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await resp.json();

    if (data.error) {
      resultEl.innerHTML = `<p class="dash-empty">${data.error}</p>`;
      return;
    }
    if (!data.extracted) {
      resultEl.innerHTML = `<p class="dash-empty">Couldn't find any scholarship details on that page. Try adding it manually from the Tracker instead.</p>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="catalog-card">
        <div class="catalog-card-top">
          <h4>${escapeHtml(data.title) || 'Untitled scholarship'}</h4>
          ${data.amount ? `<span class="catalog-amount">$${Number(data.amount).toLocaleString()}</span>` : ''}
        </div>
        <div class="catalog-card-meta">
          ${data.deadlineText ? `<span>Possible deadline: ${escapeHtml(data.deadlineText)}</span>` : '<span>No deadline detected</span>'}
        </div>
        <div class="catalog-card-actions">
          ${safeLink(data.source, 'Visit Page', 'target="_blank" rel="noopener" class="btn btn-line" style="padding:8px 16px; font-size:13px;"')}
          <button class="btn btn-gold" style="padding:8px 16px; font-size:13px;" id="add-extracted-btn">Add to Tracker</button>
        </div>
      </div>
    `;

    document.getElementById('add-extracted-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Adding…';
      const { error } = await supabaseClient.from('scholarships').insert({
        user_id: browseUserId,
        title: data.title || 'Untitled scholarship',
        amount: data.amount || null,
        website: data.source,
        status: 'backlog',
      });
      if (error) {
        console.error(error);
        e.target.textContent = 'Try again';
        e.target.disabled = false;
        return;
      }
      await awardAchievement('tracker_starter', browseUserId);
      e.target.textContent = 'Added ✓';
    });
  } catch (err) {
    console.error(err);
    resultEl.innerHTML = `<p class="dash-empty">Something went wrong reaching that page.</p>`;
  }
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

init();
