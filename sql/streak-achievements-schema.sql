-- ============================================================
-- Scholar Brilliance — Streak achievements
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Adds a third achievement category (alongside early_wins and
-- application_milestones) for streak-based badges, tied to the real
-- consecutive-day streak from daily-activity-schema.sql.

alter table public.achievements drop constraint if exists achievements_category_check;
alter table public.achievements add constraint achievements_category_check
  check (category in ('early_wins', 'application_milestones', 'streak_milestones'));

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('streak_3',  'streak_milestones', 'On a Roll',      'Visit 3 days in a row',  30,  'flame', 1),
  ('streak_7',  'streak_milestones', 'Week Warrior',   'Visit 7 days in a row',  75,  'flame', 2),
  ('streak_30', 'streak_milestones', 'Unstoppable',    'Visit 30 days in a row', 200, 'flame', 3)
on conflict (id) do nothing;
