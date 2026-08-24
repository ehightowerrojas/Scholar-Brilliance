-- ============================================================
-- Scholar Brilliance — Scholarship Recommendations
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

-- Students can record their interests; staff use this to decide
-- what to recommend.
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
