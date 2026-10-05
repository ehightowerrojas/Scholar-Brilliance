-- ============================================================
-- Scholar Brilliance — Fix unreachable level thresholds
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- The maximum XP achievable by earning every single one-time
-- achievement in the system is 1,430 — but Level 6 required 2,100,
-- Level 7 required 4,000, and Level 8 required 7,000. All three were
-- mathematically unreachable through normal use. Rebalanced so
-- Level 8 (the max) is achievable by fully engaging with the
-- platform, with sensible pacing in between.
--
-- Uses explicit UPDATE statements, not just INSERT ... ON CONFLICT
-- DO NOTHING, since these rows already exist on any database that's
-- run the levels seed before — an insert-only approach would
-- silently skip updating them.

update public.levels set xp_threshold = 0    where level_number = 1;
update public.levels set xp_threshold = 100  where level_number = 2;
update public.levels set xp_threshold = 250  where level_number = 3;
update public.levels set xp_threshold = 450  where level_number = 4;
update public.levels set xp_threshold = 700  where level_number = 5;
update public.levels set xp_threshold = 950  where level_number = 6;
update public.levels set xp_threshold = 1200 where level_number = 7;
update public.levels set xp_threshold = 1430 where level_number = 8;
