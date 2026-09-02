-- ============================================================
-- Scholar Brilliance — Prevent streak fabrication
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- The daily_activity insert policy only checked who was inserting
-- (their own user_id), not which date. A technically savvy student
-- could bypass the UI entirely and call the Supabase API directly to
-- insert arbitrary past dates — e.g. 30 backdated rows in one go —
-- instantly fabricating a 30-day streak and claiming "Unstoppable"
-- (200 XP) without ever actually being active.
--
-- This adds a table-level CHECK constraint (enforced regardless of
-- role, unlike RLS policies) limiting activity_date to today or the
-- last 7 days, never future-dated. A 7-day window still allows minor
-- legitimate corrections while making the worst-case abuse (claiming
-- a 30-day streak in one shot) impossible — at most a week could
-- ever be fabricated in a single burst.

alter table public.daily_activity drop constraint if exists daily_activity_date_range_check;
alter table public.daily_activity add constraint daily_activity_date_range_check
  check (activity_date <= current_date and activity_date >= current_date - interval '7 days');

-- Also closing a smaller gap while auditing date fields: goal
-- deadlines had no sanity bound at all, matching the pattern already
-- used for graduation_year elsewhere in the schema.
alter table public.goals drop constraint if exists goals_target_date_check;
alter table public.goals add constraint goals_target_date_check
  check (target_date is null or (target_date >= '2020-01-01' and target_date <= '2050-12-31'));
