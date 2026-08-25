-- ============================================================
-- Scholar Brilliance — Goal setting (student or staff assigned)
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

-- Moving the goal here (rather than auth user_metadata) because
-- staff need to be able to set it too, and the client SDK can only
-- ever update the currently-logged-in user's own auth metadata —
-- there's no way for a staff account to write to a student's
-- metadata directly. profiles is a normal table we control, so RLS
-- can grant staff write access scoped to their own org's students.
alter table public.profiles add column if not exists financial_goal numeric;
alter table public.profiles add column if not exists goal_source text check (goal_source in ('self','staff'));

-- If you migrated from the old auth-metadata goal and want to carry
-- existing values over, uncomment and run this once:
-- update public.profiles p
-- set financial_goal = (u.raw_user_meta_data->>'financial_goal')::numeric,
--     goal_source = 'self'
-- from auth.users u
-- where u.id = p.id
--   and u.raw_user_meta_data->>'financial_goal' is not null
--   and p.financial_goal is null;

drop policy if exists "Staff can update profiles in their org" on public.profiles;
create policy "Staff can update profiles in their org"
  on public.profiles for update to authenticated
  using (
    org_id is not null
    and org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff')
  )
  with check (
    org_id is not null
    and org_id = (select org_id from public.profiles where id = auth.uid() and role = 'staff')
  );
