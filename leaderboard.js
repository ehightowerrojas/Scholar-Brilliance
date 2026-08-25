// ------------------------------------------------------------------
// Leaderboard logic
// ------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉'];

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  const userId = session.user.id;

  const { data, error } = await supabaseClient.rpc('get_org_leaderboard');
  const el = document.getElementById('leaderboard-content');

  if (error) {
    console.error(error);
    el.innerHTML = `<p class="dash-empty">Could not load the leaderboard right now.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = `<p class="dash-empty">Leaderboards are available once you're connected to a school — use a referral code from your counselor to join one.</p>`;
    return;
  }

  el.innerHTML = data.map((row, i) => {
    const rank = i + 1;
    const isMe = row.student_id === userId;
    const isTop3 = rank <= 3;
    const rowClasses = ['leaderboard-row'];
    if (isMe) rowClasses.push('is-me');
    if (isTop3) rowClasses.push('is-top');

    return `
      <div class="${rowClasses.join(' ')}">
        <span class="leaderboard-rank">${isTop3 ? MEDALS[rank - 1] : `#${rank}`}</span>
        <span class="leaderboard-name">${escapeHtml(row.display_name) || 'Unnamed student'}${isMe ? ' <span class="leaderboard-you-tag">You</span>' : ''}</span>
        <span class="leaderboard-points">${Number(row.total_points).toLocaleString()} pts</span>
      </div>
    `;
  }).join('');
}

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
