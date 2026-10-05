-- ============================================================
-- Scholar Brilliance — Leaderboard
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Students currently can't see each other's profiles or points at
-- all — every existing policy scopes visibility to "your own row"
-- or "staff viewing their org." A leaderboard genuinely needs
-- cross-student visibility, so rather than loosening profiles' RLS
-- (which would expose everything on that row to every classmate),
-- this uses a narrow SECURITY DEFINER function that returns only
-- what a leaderboard needs: a name and a point total, scoped to
-- students in the caller's own organization.
--
-- Name privacy: leaderboard_visible defaults to true (opt-out model,
-- same as most classroom leaderboards). A student who turns it off
-- still appears, ranked by their real points — only their displayed
-- name changes, to a stable "Student #N" label. Their own real name
-- is never hidden from themselves; this only affects what classmates
-- see. If your students are younger or your school prefers privacy
-- by default, flip the column default to false below.
-- ============================================================

alter table public.profiles add column if not exists leaderboard_visible boolean not null default true;

create or replace function public.get_org_leaderboard()
returns table(student_id uuid, display_name text, total_points bigint, is_anonymous boolean)
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
      coalesce(sum(a.points), 0) as total_points
    from public.profiles p
    left join public.user_achievements ua on ua.user_id = p.id
    left join public.achievements a on a.id = ua.achievement_id
    where p.role = 'student'
      and p.org_id is not null
      and p.org_id = (select org_id from public.profiles where id = auth.uid())
    group by p.id, p.full_name, p.leaderboard_visible, p.created_at
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
    (leaderboard_visible = false) as is_anonymous
  from numbered
  order by total_points desc, full_name asc nulls last;
$$;

grant execute on function public.get_org_leaderboard() to authenticated;
