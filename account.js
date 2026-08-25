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

  document.getElementById('back-link').href = role === 'staff' ? 'staff-dashboard.html' : 'dashboard.html';
  document.getElementById('email-display').value = session.user.email;
  document.getElementById('role-display').value = role === 'staff' ? 'School staff' : 'Student';
  document.getElementById('full-name-input').value = session.user.user_metadata?.full_name || '';

  if (role === 'staff') {
    document.getElementById('privacy-card').style.display = 'none';
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('org_id, leaderboard_visible')
    .eq('id', accountUserId)
    .single();

  if (role !== 'staff') {
    document.getElementById('leaderboard-visible-input').checked = profile?.leaderboard_visible !== false;
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
