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
    // .select() lets us tell a genuinely new award apart from a
    // re-check of one already earned — ignoreDuplicates means an
    // already-existing row comes back empty, not re-inserted. Sound
    // should only play the first time, not every dashboard load.
    const { data } = await supabaseClient.from('user_achievements').upsert(
      { user_id: uid, achievement_id: achievementId },
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
    ).select();

    if (data && data.length > 0 && typeof ScholarSound !== 'undefined') {
      if (achievementId === 'goal_crusher') ScholarSound.goalComplete();
      else ScholarSound.achievement();
    }
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

// Streak Milestones, checked against the real consecutive-week streak
// (idempotent — safe to call every time the dashboard loads). IDs
// kept as streak_3/7/30 even though the thresholds are now weeks, not
// days, to avoid touching every place in the app that awards them.
const STREAK_MILESTONES = [
  { count: 2, id: 'streak_3' },
  { count: 4, id: 'streak_7' },
  { count: 10, id: 'streak_30' },
  { count: 20, id: 'streak_20' },
  { count: 52, id: 'streak_52' },
];

async function checkStreakMilestones(streakCount, userId) {
  for (const tier of STREAK_MILESTONES) {
    if (streakCount >= tier.count) {
      await awardAchievement(tier.id, userId);
    }
  }
}

// How many scholarships are sitting in the tracker at once (any
// status), distinct from how many have been submitted.
const SCHOLARSHIP_COLLECTOR_MILESTONES = [
  { count: 5, id: 'scholarship_collector_5' },
  { count: 15, id: 'scholarship_collector_15' },
  { count: 30, id: 'scholarship_collector_30' },
];

async function checkScholarshipCollectorMilestones(trackedCount, userId) {
  for (const tier of SCHOLARSHIP_COLLECTOR_MILESTONES) {
    if (trackedCount >= tier.count) {
      await awardAchievement(tier.id, userId);
    }
  }
}

const ESSAY_WRITER_MILESTONES = [
  { count: 5, id: 'essay_writer_5' },
  { count: 15, id: 'essay_writer_15' },
];

async function checkEssayWriterMilestones(essayCount, userId) {
  for (const tier of ESSAY_WRITER_MILESTONES) {
    if (essayCount >= tier.count) {
      await awardAchievement(tier.id, userId);
    }
  }
}

const GOAL_GETTER_MILESTONES = [
  { count: 3, id: 'goal_getter_3' },
  { count: 10, id: 'goal_getter_10' },
];

async function checkGoalGetterMilestones(completedGoalsCount, userId) {
  for (const tier of GOAL_GETTER_MILESTONES) {
    if (completedGoalsCount >= tier.count) {
      await awardAchievement(tier.id, userId);
    }
  }
}

// Total dollars won across every scholarship marked 'won', regardless
// of whether funds have actually been received yet.
const FINANCIAL_MILESTONES = [
  { amount: 1, id: 'first_win' },
  { amount: 1000, id: 'earner_1k' },
  { amount: 5000, id: 'earner_5k' },
  { amount: 10000, id: 'earner_10k' },
  { amount: 25000, id: 'earner_25k' },
  { amount: 50000, id: 'earner_50k' },
];

async function checkFinancialMilestones(totalWonAmount, userId) {
  for (const tier of FINANCIAL_MILESTONES) {
    if (totalWonAmount >= tier.amount) {
      await awardAchievement(tier.id, userId);
    }
  }
}
