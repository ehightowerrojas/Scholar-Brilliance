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

// Application Milestones tiers, checked against however many scholarships
// currently sit in "Submitted" status (idempotent — safe to call every
// time the Tracker loads, since awardAchievement no-ops on repeats).
const APPLICATION_MILESTONES = [
  { count: 3, id: 'application_apprentice' },
  { count: 5, id: 'application_achiever' },
  { count: 10, id: 'application_expert' },
  { count: 20, id: 'application_master' },
  { count: 50, id: 'application_legend' },
];

async function checkApplicationMilestones(submittedCount, userId) {
  for (const tier of APPLICATION_MILESTONES) {
    if (submittedCount >= tier.count) {
      await awardAchievement(tier.id, userId);
    }
  }
}