-- ============================================================
-- Scholar Brilliance — Multi-Goal System
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Replaces the single profiles.financial_goal with a full goals
-- table: students can have multiple active goals (self-chosen or
-- staff-assigned), and scholarships can optionally be tagged to a
-- specific goal. Untagged scholarships still count toward the
-- overall aggregate total, just not any individual goal.

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

-- Staff can view and create goals for students in their own org
-- (mirrors the existing "staff can update profiles in their org"
-- pattern from goal-setting-schema.sql).
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

-- Optional per-scholarship goal tag.
alter table public.scholarships add column if not exists goal_id uuid references public.goals(id) on delete set null;

-- Migrate any existing single financial_goal into a real goal row,
-- so no one's existing progress is lost. Guarded to only run if that
-- legacy column actually exists on this project — some projects
-- never had it (goal-setting-schema.sql wasn't run, or this is a
-- fresh database), in which case there's nothing to migrate and this
-- step is safely skipped.
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

-- New achievement for fully funding a goal.
insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('goal_crusher', 'application_milestones', 'Goal Crusher', 'Fully fund one of your goals', 100, 'trophy', 6)
on conflict (id) do nothing;
