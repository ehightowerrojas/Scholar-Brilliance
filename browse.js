// ------------------------------------------------------------------
// Browse Scholarships logic
// ------------------------------------------------------------------

let browseUserId = null;
let catalogItems = [];

function fmtAmount(n) {
  return n != null ? `$${Number(n).toLocaleString()}` : '';
}
function fmtDeadline(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  browseUserId = session.user.id;
  await loadCatalog();
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
        <h4>${item.title}</h4>
        <span class="catalog-amount">${fmtAmount(item.amount)}</span>
      </div>
      <p class="catalog-desc">${item.description || ''}</p>
      <div class="catalog-card-meta">
        ${item.deadline ? `<span>Deadline: ${fmtDeadline(item.deadline)}</span>` : ''}
        <span>${item.org_name}</span>
      </div>
      <div class="catalog-card-actions">
        ${item.website ? `<a href="${item.website}" target="_blank" rel="noopener" class="btn btn-line" style="padding:8px 16px; font-size:13px;">Visit Website</a>` : ''}
        <button class="btn btn-gold" style="padding:8px 16px; font-size:13px;" data-add-catalog="${item.id}">Add to Tracker</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-add-catalog]').forEach(btn => {
    btn.addEventListener('click', () => addCatalogItemToTracker(btn.dataset.addCatalog, btn));
  });
}

async function addCatalogItemToTracker(catalogId, btn) {
  const item = catalogItems.find(i => i.id === catalogId);
  if (!item) return;

  btn.disabled = true;
  btn.textContent = 'Adding…';

  const { error } = await supabaseClient.from('scholarships').insert({
    user_id: browseUserId,
    title: item.title,
    amount: item.amount,
    deadline: item.deadline,
    website: item.website,
    status: 'saved',
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
    const resp = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
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
          <h4>${data.title || 'Untitled scholarship'}</h4>
          ${data.amount ? `<span class="catalog-amount">$${Number(data.amount).toLocaleString()}</span>` : ''}
        </div>
        <div class="catalog-card-meta">
          ${data.deadlineText ? `<span>Possible deadline: ${data.deadlineText}</span>` : '<span>No deadline detected</span>'}
        </div>
        <div class="catalog-card-actions">
          <a href="${data.source}" target="_blank" rel="noopener" class="btn btn-line" style="padding:8px 16px; font-size:13px;">Visit Page</a>
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
        status: 'saved',
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
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
});

init();
