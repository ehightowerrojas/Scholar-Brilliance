-- ============================================================
-- Scholar Brilliance — Add goal types (money vs. scholarship count)
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Goals previously only tracked a dollar target (target_amount).
-- This adds a second type — tracking a number of scholarships
-- applied to, rather than money won — so students can set goals
-- like "apply to 10 scholarships" without it being misread as a
-- $10 target. Existing goals are untouched and keep working exactly
-- as before (goal_type defaults to 'money', matching what they
-- already were).

alter table public.goals alter column target_amount drop not null;
alter table public.goals add column if not exists target_count integer;
alter table public.goals add column if not exists goal_type text not null default 'money';

alter table public.goals drop constraint if exists goals_target_count_check;
alter table public.goals add constraint goals_target_count_check
  check (target_count is null or (target_count > 0 and target_count <= 1000));

alter table public.goals drop constraint if exists goals_goal_type_check;
alter table public.goals add constraint goals_goal_type_check
  check (goal_type in ('money','count'));

-- Exactly one of target_amount/target_count must be set, matching
-- the goal's declared type - keeps the two fields from drifting out
-- of sync with goal_type.
alter table public.goals drop constraint if exists goals_target_matches_type_check;
alter table public.goals add constraint goals_target_matches_type_check
  check (
    (goal_type = 'money' and target_amount is not null and target_count is null)
    or (goal_type = 'count' and target_count is not null and target_amount is null)
  );
