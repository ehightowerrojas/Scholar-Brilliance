// ------------------------------------------------------------------
// Account Settings logic
// ------------------------------------------------------------------

let accountUserId = null;

function showMsg(elId, text, isError) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.style.display = 'block';
  el.style.color = isError ? 'var(--ink)' : 'var(--teal)';
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  accountUserId = session.user.id;
  const role = session.user.user_metadata?.role || 'student';

  document.getElementById('email-display').value = session.user.email;
  document.getElementById('role-display').value = role === 'staff' ? 'School staff' : 'Student';
  document.getElementById('full-name-input').value = session.user.user_metadata?.full_name || '';

  if (role === 'staff') {
    document.getElementById('privacy-card').style.display = 'none';
    document.getElementById('appinfo-card').style.display = 'none';
    document.getElementById('avatar-card').style.display = 'none';
  } else {
    loadAvatarSection();
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('org_id, leaderboard_visible, phone, address_line1, city, state, zip_code, school_name, graduation_year, gpa, major')
    .eq('id', accountUserId)
    .single();

  if (role !== 'staff') {
    document.getElementById('leaderboard-visible-input').checked = profile?.leaderboard_visible !== false;
    document.getElementById('appinfo-phone').value = profile?.phone || '';
    document.getElementById('appinfo-address').value = profile?.address_line1 || '';
    document.getElementById('appinfo-city').value = profile?.city || '';
    document.getElementById('appinfo-state').value = profile?.state || '';
    document.getElementById('appinfo-zip').value = profile?.zip_code || '';
    document.getElementById('appinfo-school').value = profile?.school_name || '';
    document.getElementById('appinfo-gradyear').value = profile?.graduation_year || '';
    document.getElementById('appinfo-gpa').value = profile?.gpa || '';
    document.getElementById('appinfo-major').value = profile?.major || '';
  }

  if (profile?.org_id) {
    const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', profile.org_id).single();
    if (org) {
      document.getElementById('org-field').style.display = 'block';
      document.getElementById('org-display').value = org.name;
    }
  }
}

document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const fullName = document.getElementById('full-name-input').value.trim();
  if (!fullName) return;

  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true;

  const [{ error: authErr }, { error: profileErr }] = await Promise.all([
    supabaseClient.auth.updateUser({ data: { full_name: fullName } }),
    supabaseClient.from('profiles').update({ full_name: fullName }).eq('id', accountUserId),
  ]);

  btn.disabled = false;
  showMsg('profile-msg', authErr || profileErr ? 'Could not save — try again.' : 'Saved ✓', Boolean(authErr || profileErr));
});

async function loadAvatarSection() {
  const grid = document.getElementById('avatar-grid');

  let species, profile, goals, earnedRows, achievements, levels;
  try {
    const results = await Promise.all([
      supabaseClient.from('avatar_species').select('*').order('sort_order'),
      supabaseClient.from('profiles').select('avatar_species_id').eq('id', accountUserId).single(),
      supabaseClient.from('goals').select('completed_at').eq('student_id', accountUserId),
      supabaseClient.from('user_achievements').select('achievement_id').eq('user_id', accountUserId),
      supabaseClient.from('achievements').select('id, points'),
      supabaseClient.from('levels').select('*').order('level_number'),
    ]);

    const firstError = results.find(r => r.error)?.error;
    if (firstError) throw firstError;

    [{ data: species }, { data: profile }, { data: goals }, { data: earnedRows }, { data: achievements }, { data: levels }] = results;
  } catch (err) {
    console.error('Could not load avatar section:', err);
    grid.innerHTML = '';
    grid.insertAdjacentHTML('beforebegin', '<p class="dash-empty" style="color:#c62828;">Could not load your avatars right now — please refresh the page.</p>');
    return;
  }

  const completedGoalsCount = (goals || []).filter(g => g.completed_at).length;
  const pointsMap = Object.fromEntries((achievements || []).map(a => [a.id, a.points]));
  const totalXP = (earnedRows || []).reduce((sum, r) => sum + (pointsMap[r.achievement_id] || 0), 0);
  let currentLevel = { level_number: 1 };
  (levels || []).forEach(l => { if (totalXP >= l.xp_threshold) currentLevel = l; });
  const tier = evolutionTierFromLevel(currentLevel.level_number);

  const equippedId = profile?.avatar_species_id || 'raptor';

  grid.innerHTML = (species || []).map(s => {
    const unlocked = completedGoalsCount >= s.unlock_goals_completed;
    const isEquipped = s.id === equippedId;
    const svg = renderAvatarSVG(s.id, unlocked ? tier : 1, 72);
    return `
      <div style="text-align:center; opacity:${unlocked ? 1 : 0.4};">
        <div style="position:relative; display:inline-block;">
          ${svg}
          ${isEquipped ? '<div style="position:absolute; top:-4px; right:-4px; background:var(--teal); color:white; border-radius:50%; width:20px; height:20px; font-size:11px; display:flex; align-items:center; justify-content:center;">✓</div>' : ''}
        </div>
        <p style="font-size:11.5px; font-weight:600; margin-top:4px; color:var(--ink);">${s.name}</p>
        <p style="font-size:10px; color:var(--muted); text-transform:capitalize;">${s.rarity}</p>
        ${unlocked
          ? (isEquipped ? '' : `<button class="achv-demo-btn" data-equip="${s.id}" style="width:auto; padding:4px 10px; font-size:11px; margin-top:2px;">Equip</button>`)
          : `<p style="font-size:10px; color:var(--muted);">${s.unlock_goals_completed} goal${s.unlock_goals_completed === 1 ? '' : 's'} completed to unlock</p>`}
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-equip]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await supabaseClient.from('profiles').update({ avatar_species_id: btn.dataset.equip }).eq('id', accountUserId);
      const msg = document.getElementById('avatar-msg');
      msg.style.display = 'block';
      msg.textContent = error ? 'Could not equip — try again.' : 'Avatar updated ✓';
      if (!error) loadAvatarSection();
    });
  });
}

document.getElementById('save-appinfo-btn').addEventListener('click', async () => {
  const btn = document.getElementById('save-appinfo-btn');
  btn.disabled = true;

  const { error } = await supabaseClient.from('profiles').update({
    phone: document.getElementById('appinfo-phone').value.trim() || null,
    address_line1: document.getElementById('appinfo-address').value.trim() || null,
    city: document.getElementById('appinfo-city').value.trim() || null,
    state: document.getElementById('appinfo-state').value.trim() || null,
    zip_code: document.getElementById('appinfo-zip').value.trim() || null,
    school_name: document.getElementById('appinfo-school').value.trim() || null,
    graduation_year: document.getElementById('appinfo-gradyear').value || null,
    gpa: document.getElementById('appinfo-gpa').value || null,
    major: document.getElementById('appinfo-major').value.trim() || null,
  }).eq('id', accountUserId);

  btn.disabled = false;
  showMsg('appinfo-msg', error ? 'Could not save — try again.' : 'Saved ✓', Boolean(error));
});

document.getElementById('leaderboard-visible-input').addEventListener('change', async (e) => {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ leaderboard_visible: e.target.checked })
    .eq('id', accountUserId);

  showMsg('privacy-msg', error ? 'Could not save — try again.' : 'Saved ✓', Boolean(error));
});

document.getElementById('change-email-btn').addEventListener('click', async () => {
  const newEmail = document.getElementById('new-email-input').value.trim();
  if (!newEmail) return;

  const btn = document.getElementById('change-email-btn');
  btn.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({ email: newEmail });
  btn.disabled = false;

  if (error) {
    showMsg('email-msg', error.message, true);
    return;
  }
  showMsg('email-msg', `Confirmation link sent to ${newEmail}. Your email won't change until you click it.`, false);
  document.getElementById('new-email-input').value = '';
});

document.getElementById('change-password-btn').addEventListener('click', async () => {
  const pw = document.getElementById('new-password-input').value;
  const confirm = document.getElementById('confirm-password-input').value;

  if (pw.length < 6) {
    showMsg('password-msg', 'Password must be at least 6 characters.', true);
    return;
  }
  if (pw !== confirm) {
    showMsg('password-msg', "Passwords don't match.", true);
    return;
  }

  const btn = document.getElementById('change-password-btn');
  btn.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({ password: pw });
  btn.disabled = false;

  if (error) {
    showMsg('password-msg', error.message, true);
    return;
  }
  showMsg('password-msg', 'Password updated ✓', false);
  document.getElementById('new-password-input').value = '';
  document.getElementById('confirm-password-input').value = '';
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