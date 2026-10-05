-- ============================================================
-- Scholar Brilliance — Essays schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- Run AFTER tracker-schema.sql (essays link to scholarships).
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

-- Staff can view (not edit) essays belonging to students in their org,
-- matching the same pattern used for the scholarships table.
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
