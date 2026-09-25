// ------------------------------------------------------------------
// Shared guard for staff pages. Every staff-*.html page loads this
// before its own script and calls requireStaffProfile().
// ------------------------------------------------------------------

async function requireStaffProfile() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  if (session.user.user_metadata?.role !== 'staff') {
    window.location.href = 'dashboard.html';
    return null;
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    console.error(error);
    return null;
  }

  return { session, profile };
}

function wireLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch (err) {
      console.error('Sign out failed, forcing local logout:', err);
    } finally {
      // Belt-and-suspenders: explicitly clear any Supabase session
      // keys directly, on top of signOut() above. Guards against a
      // stale session persisting into the next login on this device
      // (e.g. from a multi-tab sync quirk), which could otherwise
      // show one account's data under a different one that just
      // logged in.
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-')) localStorage.removeItem(key);
      });
      window.location.href = 'login.html';
    }
  });
}
wireLogout();
