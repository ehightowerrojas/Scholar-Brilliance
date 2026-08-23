-- ============================================================
-- Scholar Brilliance — Achievements schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

-- Catalog of every badge that exists
create table if not exists public.achievements (
  id text primary key,
  category text not null check (category in ('early_wins','application_milestones')),
  title text not null,
  description text not null,
  points integer not null,
  icon text not null,
  sort_order integer not null
);

-- Which badges a given user has actually earned
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

-- Level thresholds and titles
create table if not exists public.levels (
  level_number integer primary key,
  title text not null,
  xp_threshold integer not null
);

-- ------------------------------------------------------------
-- Row Level Security: the catalog tables are readable by any
-- logged-in user; user_achievements is scoped to its owner.
-- ------------------------------------------------------------
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.levels enable row level security;

drop policy if exists "Achievements catalog is readable by any authenticated user" on public.achievements;
create policy "Achievements catalog is readable by any authenticated user"
  on public.achievements for select
  to authenticated
  using (true);

drop policy if exists "Levels catalog is readable by any authenticated user" on public.levels;
create policy "Levels catalog is readable by any authenticated user"
  on public.levels for select
  to authenticated
  using (true);

drop policy if exists "Users can view their own achievements" on public.user_achievements;
create policy "Users can view their own achievements"
  on public.user_achievements for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can earn achievements for themselves" on public.user_achievements;
create policy "Users can earn achievements for themselves"
  on public.user_achievements for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own achievements" on public.user_achievements;
create policy "Users can remove their own achievements"
  on public.user_achievements for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Seed data — matches the badge list and points from the deck
-- ------------------------------------------------------------
insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('goal_setter',            'early_wins',             'Goal Setter',             'Set your first financial goal',                    25,  'target', 1),
  ('profile_builder',        'early_wins',             'Profile Builder',         'Complete your student profile',                    25,  'user',   2),
  ('tracker_starter',        'early_wins',             'Tracker Starter',         'Add your first scholarship to tracker',            25,  'plus',   3),
  ('organizer',              'early_wins',             'Organizer',               'Move a scholarship between Kanban columns',        25,  'grid',   4),
  ('draft_master',           'early_wins',             'Draft Master',            'Start your first essay draft',                     25,  'pencil', 5),
  ('document_ready',         'early_wins',             'Document Ready',          'Upload your first essay',                          25,  'file',   6),
  ('first_submission',       'early_wins',             'First Submission',        'Submit your very first scholarship application',   50,  'send',   7),
  ('application_apprentice', 'application_milestones', 'Application Apprentice',  'Submit 3 scholarship applications',                75,  'badge',  1),
  ('application_achiever',   'application_milestones', 'Application Achiever',    'Submit 5 scholarship applications',                100, 'badge',  2),
  ('application_expert',     'application_milestones', 'Application Expert',      'Submit 10 scholarship applications',               150, 'badge',  3),
  ('application_master',     'application_milestones', 'Application Master',      'Submit 20 scholarship applications',               200, 'crown',  4),
  ('application_legend',     'application_milestones', 'Application Legend',      'Submit 50+ scholarship applications',              300, 'trophy', 5)
on conflict (id) do nothing;

-- Thresholds are set so 2,540 XP lands exactly on Level 6 with
-- 1,460 XP to go — matching the numbers shown in the deck.
insert into public.levels (level_number, title, xp_threshold) values
  (1, 'Scholarship Rookie',      0),
  (2, 'Scholarship Seeker',      150),
  (3, 'Scholarship Scout',       400),
  (4, 'Scholarship Explorer',    800),
  (5, 'Scholarship Tactician',   1400),
  (6, 'Scholarship Strategist',  2100),
  (7, 'Scholarship Master',      4000),
  (8, 'Scholarship Legend',      7000)
on conflict (level_number) do nothing;
