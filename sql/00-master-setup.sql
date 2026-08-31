-- ============================================================
-- Scholar Brilliance — MASTER SETUP SCRIPT
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- This consolidates every individual migration file in sql/ into
-- one correctly-ordered script. It supersedes running each file
-- separately — running THIS instead avoids the "which file did I
-- already run" confusion that caused several errors along the way.
--
-- Safe to run on a completely fresh database, and safe to re-run on
-- a database that already has some or all of this applied — every
-- statement uses "if not exists" / "on conflict do nothing" /
-- "drop ... if exists" patterns throughout, so nothing here can fail
-- with a duplicate-object error or double-insert seed data.
--
-- NOT included here (kept as separate, situational scripts):
--   • goal-setting-schema.sql — the old single-goal system, fully
--     superseded by the Goals system below. Only relevant if you
--     already ran it before this consolidation existed.
--   • backfill-profiles.sql — a repair script for accounts created
--     before the signup trigger existed. Only needed if you have
--     such accounts; safe to run separately, any time, as needed.
--
-- A few real bugs were fixed while merging these files together:
--   • staff-schema.sql's policies for scholarships_catalog/
--     scholarships require those tables to exist first — its own
--     header said so, but the previously-recommended run order had
--     it going first. Fixed by reordering below.
--   • The scholarships_catalog seed data used "on conflict do
--     nothing" with no actual unique constraint to match against,
--     meaning re-running it would have silently duplicated the two
--     sample rows every time. Replaced with a "where not exists"
--     guard that actually works.
--   • data-integrity-constraints.sql's profiles_goal_check
--     referenced financial_goal, a column that no longer exists
--     now that the Goals table has replaced it. Dropped from this
--     consolidated version.
-- ============================================================


-- ============================================================
-- SECTION 1 — Core: organizations, profiles, referral codes
-- ============================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'student' check (role in ('student','staff')),
  org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  expires_at date,
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role text;
  v_org_name text;
  v_referral_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_org_name := new.raw_user_meta_data->>'org_name';
  v_referral_code := new.raw_user_meta_data->>'referral_code';

  if v_role = 'staff' then
    if v_org_name is not null and length(trim(v_org_name)) > 0 then
      insert into public.organizations (name, created_by)
      values (trim(v_org_name), new.id)
      returning id into v_org_id;
    end if;
  else
    if v_referral_code is not null and length(trim(v_referral_code)) > 0 then
      select org_id into v_org_id
        from public.referral_codes
        where code = trim(v_referral_code)
          and active = true
          and (expires_at is null or expires_at >= current_date)
        limit 1;
    end if;
  end if;

  insert into public.profiles (id, full_name, role, org_id)
  values (new.id, new.raw_user_meta_data->>'full_name', v_role, v_org_id);

  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.referral_codes enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Staff can view profiles in their org" on public.profiles;
create policy "Staff can view profiles in their org"
  on public.profiles for select to authenticated
  using (
    org_id is not null
    and org_id = (select p.org_id from public.profiles p where p.id = auth.uid() and p.role = 'staff')
  );

drop policy if exists "Staff can view own organization" on public.organizations;
create policy "Staff can view own organization"
  on public.organizations for select to authenticated
  using (id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

drop policy if exists "Staff can view own org referral codes" on public.referral_codes;
create policy "Staff can view own org referral codes"
  on public.referral_codes for select to authenticated
  using (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

drop policy if exists "Staff can create referral codes for own org" on public.referral_codes;
create policy "Staff can create referral codes for own org"
  on public.referral_codes for insert to authenticated
  with check (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

drop policy if exists "Staff can update own org referral codes" on public.referral_codes;
create policy "Staff can update own org referral codes"
  on public.referral_codes for update to authenticated
  using (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'))
  with check (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));


-- ============================================================
-- SECTION 2 — Application Tracker (scholarships)
-- Status already includes 'funds_received' from the start (the
-- original tracker-schema.sql didn't have this yet; the later
-- funds-received-migration.sql added it — merged directly here).
-- ============================================================

create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric,
  deadline date,
  website text,
  status text not null default 'saved' check (status in ('saved','working','submitted','funds_received')),
  outcome text check (outcome in ('won','not_selected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Explicit standalone ALTER, not just relying on the CHECK inside
-- CREATE TABLE above — that inline version is silently skipped if
-- this table already existed from an earlier partial migration
-- (exactly what caused the achievements_category_check error).
alter table public.scholarships drop constraint if exists scholarships_status_check;
alter table public.scholarships add constraint scholarships_status_check
  check (status in ('saved','working','submitted','funds_received'));

drop trigger if exists set_scholarships_updated_at on public.scholarships;
create trigger set_scholarships_updated_at
  before update on public.scholarships
  for each row execute function public.set_updated_at();

alter table public.scholarships enable row level security;

drop policy if exists "Users can view their own scholarships" on public.scholarships;
create policy "Users can view their own scholarships"
  on public.scholarships for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own scholarships" on public.scholarships;
create policy "Users can add their own scholarships"
  on public.scholarships for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own scholarships" on public.scholarships;
create policy "Users can update their own scholarships"
  on public.scholarships for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own scholarships" on public.scholarships;
create policy "Users can delete their own scholarships"
  on public.scholarships for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Staff can view scholarships of their org's students" on public.scholarships;
create policy "Staff can view scholarships of their org's students"
  on public.scholarships for select to authenticated
  using (
    exists (
      select 1 from public.profiles sp
      where sp.id = scholarships.user_id
        and sp.org_id is not null
        and sp.org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff')
    )
  );


-- ============================================================
-- SECTION 3 — Achievements, levels
-- Category constraint already includes 'streak_milestones' from the
-- start (streak-achievements-schema.sql added this later — merged
-- directly here). The streak achievement rows themselves are seeded
-- in Section 10, alongside the rest of the streak feature.
-- ============================================================

create table if not exists public.achievements (
  id text primary key,
  category text not null check (category in ('early_wins','application_milestones','streak_milestones')),
  title text not null,
  description text not null,
  points integer not null,
  icon text not null,
  sort_order integer not null
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table if not exists public.levels (
  level_number integer primary key,
  title text not null,
  xp_threshold integer not null
);

-- Explicit standalone ALTER — same reasoning as scholarships.status
-- above. This is the exact constraint that failed before this fix.
alter table public.achievements drop constraint if exists achievements_category_check;
alter table public.achievements add constraint achievements_category_check
  check (category in ('early_wins','application_milestones','streak_milestones'));

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.levels enable row level security;

drop policy if exists "Achievements catalog is readable by any authenticated user" on public.achievements;
create policy "Achievements catalog is readable by any authenticated user"
  on public.achievements for select to authenticated
  using (true);

drop policy if exists "Levels catalog is readable by any authenticated user" on public.levels;
create policy "Levels catalog is readable by any authenticated user"
  on public.levels for select to authenticated
  using (true);

drop policy if exists "Users can view their own achievements" on public.user_achievements;
create policy "Users can view their own achievements"
  on public.user_achievements for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can earn achievements for themselves" on public.user_achievements;
create policy "Users can earn achievements for themselves"
  on public.user_achievements for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own achievements" on public.user_achievements;
create policy "Users can remove their own achievements"
  on public.user_achievements for delete to authenticated
  using (auth.uid() = user_id);

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


-- ============================================================
-- SECTION 4 — Scholarship Catalog + staff org-scoping
-- Defined with its final shape (org_id, active) from the start,
-- rather than creating it minimally and altering later — this
-- avoids the exact ordering trap that caused an error before
-- (staff-schema.sql's policies needed this table to already exist).
-- ============================================================

create table if not exists public.scholarships_catalog (
  id uuid primary key default gen_random_uuid(),
  org_name text not null default 'Scholar Brilliance',
  title text not null,
  description text,
  amount numeric,
  deadline date,
  website text,
  org_id uuid references public.organizations(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.scholarships_catalog enable row level security;

drop policy if exists "Catalog is readable by any authenticated user" on public.scholarships_catalog;
drop policy if exists "Catalog is readable by matching org or global listings" on public.scholarships_catalog;
create policy "Catalog is readable by matching org or global listings"
  on public.scholarships_catalog for select to authenticated
  using (
    org_id is null
    or org_id = (select org_id from public.profiles where id = auth.uid())
  );

drop policy if exists "Staff can insert catalog items for own org" on public.scholarships_catalog;
create policy "Staff can insert catalog items for own org"
  on public.scholarships_catalog for insert to authenticated
  with check (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

drop policy if exists "Staff can update catalog items for own org" on public.scholarships_catalog;
create policy "Staff can update catalog items for own org"
  on public.scholarships_catalog for update to authenticated
  using (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'))
  with check (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

drop policy if exists "Staff can delete catalog items for own org" on public.scholarships_catalog;
create policy "Staff can delete catalog items for own org"
  on public.scholarships_catalog for delete to authenticated
  using (org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

-- Sample seed data — fixed to actually be idempotent. The original
-- version used "on conflict do nothing" with no unique constraint to
-- match against, meaning it would have silently duplicated on every
-- re-run; this uses a real existence check instead.
insert into public.scholarships_catalog (org_name, title, description, amount, deadline, website)
select 'Sample Educational Foundation', 'Future Leaders Scholarship', 'Support for students demonstrating exceptional leadership skills and community involvement.', 4500, '2027-09-01', 'https://example.org/future-leaders'
where not exists (select 1 from public.scholarships_catalog where title = 'Future Leaders Scholarship');

insert into public.scholarships_catalog (org_name, title, description, amount, deadline, website)
select 'Sample Educational Foundation', 'First-Generation College Student Grant', 'Financial aid for students who are the first in their family to attend college.', 6000, '2027-07-15', 'https://example.org/first-gen-grant'
where not exists (select 1 from public.scholarships_catalog where title = 'First-Generation College Student Grant');


-- ============================================================
-- SECTION 5 — Essays
-- ============================================================

create table if not exists public.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id uuid references public.scholarships(id) on delete set null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_essays_updated_at on public.essays;
create trigger set_essays_updated_at
  before update on public.essays
  for each row execute function public.set_updated_at();

alter table public.essays enable row level security;

drop policy if exists "Users can view their own essays" on public.essays;
create policy "Users can view their own essays"
  on public.essays for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own essays" on public.essays;
create policy "Users can add their own essays"
  on public.essays for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own essays" on public.essays;
create policy "Users can update their own essays"
  on public.essays for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own essays" on public.essays;
create policy "Users can delete their own essays"
  on public.essays for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Staff can view essays of their org's students" on public.essays;
create policy "Staff can view essays of their org's students"
  on public.essays for select to authenticated
  using (
    exists (
      select 1 from public.profiles sp
      where sp.id = essays.user_id
        and sp.org_id is not null
        and sp.org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff')
    )
  );


-- ============================================================
-- SECTION 6 — Scholarship Recommendations
-- ============================================================

alter table public.profiles add column if not exists interests text;

create table if not exists public.scholarship_recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  catalog_id uuid not null references public.scholarships_catalog(id) on delete cascade,
  recommended_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (student_id, catalog_id)
);

alter table public.scholarship_recommendations enable row level security;

drop policy if exists "Students can view their own recommendations" on public.scholarship_recommendations;
create policy "Students can view their own recommendations"
  on public.scholarship_recommendations for select to authenticated
  using (auth.uid() = student_id);

drop policy if exists "Staff can view recommendations for their org's students" on public.scholarship_recommendations;
create policy "Staff can view recommendations for their org's students"
  on public.scholarship_recommendations for select to authenticated
  using (
    exists (
      select 1 from public.profiles sp
      where sp.id = scholarship_recommendations.student_id
        and sp.org_id is not null
        and sp.org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff')
    )
  );

drop policy if exists "Staff can recommend scholarships to their org's students" on public.scholarship_recommendations;
create policy "Staff can recommend scholarships to their org's students"
  on public.scholarship_recommendations for insert to authenticated
  with check (
    recommended_by = auth.uid()
    and exists (
      select 1 from public.profiles sp
      where sp.id = scholarship_recommendations.student_id
        and sp.org_id is not null
        and sp.org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff')
    )
  );

drop policy if exists "Staff can remove their own recommendations" on public.scholarship_recommendations;
create policy "Staff can remove their own recommendations"
  on public.scholarship_recommendations for delete to authenticated
  using (recommended_by = auth.uid());


-- ============================================================
-- SECTION 7 — Application Builder profile fields
-- ============================================================

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists zip_code text;
alter table public.profiles add column if not exists school_name text;
alter table public.profiles add column if not exists graduation_year integer;
alter table public.profiles add column if not exists gpa numeric;
alter table public.profiles add column if not exists major text;

alter table public.profiles drop constraint if exists profiles_gpa_check;
alter table public.profiles add constraint profiles_gpa_check
  check (gpa is null or (gpa >= 0 and gpa <= 5.0));

alter table public.profiles drop constraint if exists profiles_grad_year_check;
alter table public.profiles add constraint profiles_grad_year_check
  check (graduation_year is null or (graduation_year >= 2020 and graduation_year <= 2035));

alter table public.scholarships add column if not exists application_notes text;
alter table public.scholarships drop constraint if exists scholarships_notes_check;
alter table public.scholarships add constraint scholarships_notes_check
  check (application_notes is null or length(application_notes) <= 10000);


-- ============================================================
-- SECTION 8 — Avatar System + Leaderboard
-- Species catalog uses unlock_goals_completed directly (the final,
-- goal-connected version) rather than the original submission-count
-- version that was later replaced — no reason to carry forward a
-- column the app never reads.
-- ============================================================

alter table public.profiles add column if not exists leaderboard_visible boolean not null default true;

create table if not exists public.avatar_species (
  id text primary key,
  name text not null,
  color_hex text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','legendary')),
  unlock_goals_completed integer not null default 0,
  sort_order integer not null
);

-- Explicit standalone ADD COLUMN — same reasoning as above. Covers
-- the case where avatar_species already existed (from an earlier
-- partial run of the original avatar-system-schema.sql) without
-- this column, which only avatar-goal-connection-schema.sql added.
alter table public.avatar_species add column if not exists unlock_goals_completed integer not null default 0;

alter table public.avatar_species enable row level security;
drop policy if exists "Avatar species catalog is readable by any authenticated user" on public.avatar_species;
create policy "Avatar species catalog is readable by any authenticated user"
  on public.avatar_species for select to authenticated
  using (true);

insert into public.avatar_species (id, name, color_hex, rarity, unlock_goals_completed, sort_order) values
  ('raptor',   'Raptor',    '#C62828', 'common',    0, 1),
  ('longneck', 'Long-neck', '#F9A825', 'common',    0, 2),
  ('armored',  'Armored',   '#5E35B1', 'uncommon',  1, 3),
  ('horned',   'Horned',    '#43A047', 'uncommon',  1, 4),
  ('plated',   'Plated',    '#D81B60', 'rare',      3, 5),
  ('heavyjaw', 'Heavy-jaw', '#BF5B04', 'rare',      3, 6),
  ('flyer',    'Flyer',     '#F4511E', 'legendary', 5, 7),
  ('sailback', 'Sail-back', '#1E88E5', 'legendary', 5, 8)
on conflict (id) do nothing;

-- Explicit UPDATE, since the insert above only sets these values for
-- brand-new rows — "on conflict do nothing" means a row that already
-- existed (e.g. from an earlier partial run, before unlock_goals_
-- completed existed) would otherwise keep whatever the column's
-- DEFAULT gave it, not the value it's actually supposed to have.
update public.avatar_species set unlock_goals_completed = 0 where id in ('raptor', 'longneck');
update public.avatar_species set unlock_goals_completed = 1 where id in ('armored', 'horned');
update public.avatar_species set unlock_goals_completed = 3 where id in ('plated', 'heavyjaw');
update public.avatar_species set unlock_goals_completed = 5 where id in ('flyer', 'sailback');

alter table public.profiles add column if not exists avatar_species_id text references public.avatar_species(id) default 'raptor';

create or replace function public.get_org_leaderboard()
returns table(student_id uuid, display_name text, total_points bigint, is_anonymous boolean, avatar_species_id text)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.full_name,
      p.leaderboard_visible,
      p.created_at,
      p.avatar_species_id,
      coalesce(sum(a.points), 0) as total_points
    from public.profiles p
    left join public.user_achievements ua on ua.user_id = p.id
    left join public.achievements a on a.id = ua.achievement_id
    where p.role = 'student'
      and p.org_id is not null
      and p.org_id = (select org_id from public.profiles where id = auth.uid())
    group by p.id, p.full_name, p.leaderboard_visible, p.created_at, p.avatar_species_id
  ),
  numbered as (
    select
      base.*,
      row_number() over (
        partition by (leaderboard_visible = false)
        order by created_at
      ) as anon_num
    from base
  )
  select
    id as student_id,
    case when leaderboard_visible = false then 'Student #' || anon_num else full_name end as display_name,
    total_points,
    (leaderboard_visible = false) as is_anonymous,
    avatar_species_id
  from numbered
  order by total_points desc, full_name asc nulls last;
$$;

grant execute on function public.get_org_leaderboard() to authenticated;


-- ============================================================
-- SECTION 9 — Multi-Goal System
-- ============================================================

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) > 0 and length(name) <= 120),
  target_amount numeric not null check (target_amount > 0 and target_amount <= 1000000),
  source text not null default 'self' check (source in ('self','staff')),
  created_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;

drop policy if exists "Students can view their own goals" on public.goals;
create policy "Students can view their own goals"
  on public.goals for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "Students can manage their own goals" on public.goals;
create policy "Students can manage their own goals"
  on public.goals for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "Staff can view goals for their org's students" on public.goals;
create policy "Staff can view goals for their org's students"
  on public.goals for select to authenticated
  using (
    exists (
      select 1 from public.profiles staff, public.profiles student
      where staff.id = auth.uid() and staff.role = 'staff'
        and student.id = goals.student_id
        and student.org_id = staff.org_id
        and staff.org_id is not null
    )
  );

drop policy if exists "Staff can create goals for their org's students" on public.goals;
create policy "Staff can create goals for their org's students"
  on public.goals for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles staff, public.profiles student
      where staff.id = auth.uid() and staff.role = 'staff'
        and student.id = goals.student_id
        and student.org_id = staff.org_id
        and staff.org_id is not null
    )
  );

alter table public.scholarships add column if not exists goal_id uuid references public.goals(id) on delete set null;

-- Migrate any pre-existing single financial_goal into a real goal
-- row. Guarded to only run if that legacy column actually exists —
-- on a fresh database it never will, so this safely no-ops.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'financial_goal'
  ) then
    insert into public.goals (student_id, name, target_amount, source, created_at)
    select p.id, 'My financial goal', p.financial_goal, coalesce(p.goal_source, 'self'), now()
    from public.profiles p
    where p.financial_goal is not null
      and not exists (
        select 1 from public.goals g where g.student_id = p.id and g.name = 'My financial goal'
      );
  end if;
end $$;

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('goal_crusher', 'application_milestones', 'Goal Crusher', 'Fully fund one of your goals', 100, 'trophy', 6)
on conflict (id) do nothing;


-- ============================================================
-- SECTION 10 — Daily Activity Log + Streak Achievements
-- ============================================================

create table if not exists public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, activity_date)
);

alter table public.daily_activity enable row level security;

drop policy if exists "Users can view their own activity log" on public.daily_activity;
create policy "Users can view their own activity log"
  on public.daily_activity for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can log their own activity" on public.daily_activity;
create policy "Users can log their own activity"
  on public.daily_activity for insert to authenticated
  with check (user_id = auth.uid());

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('streak_3',  'streak_milestones', 'On a Roll',      'Visit 3 days in a row',  30,  'flame', 1),
  ('streak_7',  'streak_milestones', 'Week Warrior',   'Visit 7 days in a row',  75,  'flame', 2),
  ('streak_30', 'streak_milestones', 'Unstoppable',    'Visit 30 days in a row', 200, 'flame', 3)
on conflict (id) do nothing;


-- ============================================================
-- SECTION 11 — Data Integrity Constraints
-- (profiles_goal_check omitted — it referenced financial_goal, a
-- column that no longer exists now that Goals has replaced it)
-- ============================================================

alter table public.scholarships drop constraint if exists scholarships_amount_check;
alter table public.scholarships add constraint scholarships_amount_check
  check (amount is null or (amount >= 0 and amount <= 1000000));

alter table public.scholarships drop constraint if exists scholarships_title_check;
alter table public.scholarships add constraint scholarships_title_check
  check (length(title) > 0 and length(title) <= 300);

alter table public.scholarships_catalog drop constraint if exists catalog_amount_check;
alter table public.scholarships_catalog add constraint catalog_amount_check
  check (amount is null or (amount >= 0 and amount <= 1000000));

alter table public.scholarships_catalog drop constraint if exists catalog_title_check;
alter table public.scholarships_catalog add constraint catalog_title_check
  check (length(title) > 0 and length(title) <= 300);

alter table public.scholarships_catalog drop constraint if exists catalog_description_check;
alter table public.scholarships_catalog add constraint catalog_description_check
  check (description is null or length(description) <= 5000);

alter table public.essays drop constraint if exists essays_title_check;
alter table public.essays add constraint essays_title_check
  check (length(title) > 0 and length(title) <= 300);

alter table public.essays drop constraint if exists essays_content_check;
alter table public.essays add constraint essays_content_check
  check (length(content) <= 50000);

alter table public.profiles drop constraint if exists profiles_full_name_check;
alter table public.profiles add constraint profiles_full_name_check
  check (full_name is null or length(full_name) <= 150);

alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add constraint profiles_interests_check
  check (interests is null or length(interests) <= 500);

alter table public.organizations drop constraint if exists organizations_name_check;
alter table public.organizations add constraint organizations_name_check
  check (length(name) > 0 and length(name) <= 200);

-- ============================================================
-- Done. Kept separate on purpose:
--   • backfill-profiles.sql — run only if you have accounts that
--     predate the signup trigger above.
-- ============================================================
