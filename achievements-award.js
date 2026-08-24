// ------------------------------------------------------------------
// Shared achievement-awarding helper.
// Safe to call repeatedly — upsert with ignoreDuplicates means
// re-awarding an already-earned badge is a harmless no-op.
// ------------------------------------------------------------------

async function awardAchievement(achievementId, userId) {
  try {
    let uid = userId;
    if (!uid) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      uid = session.user.id;
    }
    await supabaseClient.from('user_achievements').upsert(
      { user_id: uid, achievement_id: achievementId },
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
    );
  } catch (err) {
    console.error('awardAchievement failed:', err);
  }
}
