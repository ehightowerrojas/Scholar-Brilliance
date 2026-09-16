-- ============================================================
-- Scholar Brilliance — Complete switch: daily streak → weekly streak
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Renames daily_activity → weekly_activity and activity_date →
-- week_start, normalizes any existing daily rows onto their week's
-- Monday (deduplicating collisions), updates the anti-fabrication
-- constraint to a weekly window, and rebalances the three streak
-- achievement thresholds from days to weeks.
--
-- NOTE: after running this, do not re-run the older standalone files
-- prevent-streak-fabrication.sql or staff-activity-visibility-schema.sql
-- on their own — they reference the old daily_activity table name,
-- which no longer exists once this rename runs. The updated
-- 00-master-setup.sql already has the correct weekly version of both.

alter table if exists public.daily_activity rename to weekly_activity;
alter table if exists public.weekly_activity rename column activity_date to week_start;

-- Drop the OLD constraints FIRST, before touching any data — renaming
-- a table/column doesn't drop its constraints, and two separate
-- issues would otherwise surface:
--
--  1. The old date-range CHECK still enforces "today or last 7 days"
--     after the rename, so normalizing older rows would violate it.
--  2. The original unique(user_id, activity_date) constraint checks
--     uniqueness row-by-row during an UPDATE — the instant two rows
--     from the same user in the same week both get set to that
--     week's Monday, the second one collides with the first, before
--     the later dedup step ever gets a chance to run.
--
-- (Third bug found in this one migration — each fix so far addressed
-- a real failure but missed the next one down the line. Dropping
-- both constraints up front, then normalizing + deduplicating with
-- nothing in the way, then re-adding both at the end, is the version
-- that actually works start to finish.)
alter table public.weekly_activity drop constraint if exists daily_activity_date_range_check;
alter table public.weekly_activity drop constraint if exists daily_activity_user_id_activity_date_key;

update public.weekly_activity set week_start = date_trunc('week', week_start)::date;
delete from public.weekly_activity a using public.weekly_activity b
  where a.ctid < b.ctid and a.user_id = b.user_id and a.week_start = b.week_start;

-- Re-add uniqueness now that duplicates are gone, so the app's own
-- upsert(onConflict: 'user_id,week_start') keeps working correctly.
-- Safe without NOT VALID here (unlike the date-range check below) —
-- the dedup step above already guarantees no real duplicates remain,
-- so this validates cleanly against existing data.
alter table public.weekly_activity drop constraint if exists weekly_activity_user_id_week_start_key;
alter table public.weekly_activity add constraint weekly_activity_user_id_week_start_key unique (user_id, week_start);

-- Added as NOT VALID: a plain ADD CONSTRAINT validates against every
-- existing row by default, and real historical activity data
-- (anything more than a week old — which will definitely exist)
-- would fail that check even though it predates the constraint
-- entirely. NOT VALID enforces the rule for every new write going
-- forward without retroactively rejecting rows that came before the
-- rule existed.
alter table public.weekly_activity drop constraint if exists weekly_activity_date_range_check;
alter table public.weekly_activity add constraint weekly_activity_date_range_check
  check (week_start <= date_trunc('week', current_date)::date
     and week_start >= date_trunc('week', current_date)::date - interval '7 days')
  not valid;

update public.achievements set description = 'Visit 2 weeks in a row' where id = 'streak_3';
update public.achievements set title = 'Consistent Effort', description = 'Visit 4 weeks in a row' where id = 'streak_7';
update public.achievements set description = 'Visit 10 weeks in a row' where id = 'streak_30';
