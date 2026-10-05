-- ============================================================
-- Scholar Brilliance — Staff visibility into student engagement
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Lets staff see their own org's students' daily_activity rows, so
-- the Student Progress page can show each student's current streak.
-- Uses the safe current_staff_org_id() function (not an inline
-- subquery on profiles) to avoid reintroducing the infinite-
-- recursion bug fixed in 00-master-setup.sql.

drop policy if exists "Staff can view activity for their org's students" on public.daily_activity;
create policy "Staff can view activity for their org's students"
  on public.daily_activity for select to authenticated
  using (
    public.current_staff_org_id() is not null
    and exists (
      select 1 from public.profiles student
      where student.id = daily_activity.user_id
        and student.org_id = public.current_staff_org_id()
    )
  );
