-- ============================================================
-- Scholar Brilliance — Application Tracker schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric,
  deadline date,
  website text,
  status text not null default 'saved' check (status in ('saved','working','submitted')),
  outcome text check (outcome in ('won','not_selected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current on every change
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_scholarships_updated_at on public.scholarships;
create trigger set_scholarships_updated_at
  before update on public.scholarships
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: every student only ever sees their own rows
-- ------------------------------------------------------------
alter table public.scholarships enable row level security;

drop policy if exists "Users can view their own scholarships" on public.scholarships;
create policy "Users can view their own scholarships"
  on public.scholarships for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own scholarships" on public.scholarships;
create policy "Users can add their own scholarships"
  on public.scholarships for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own scholarships" on public.scholarships;
create policy "Users can update their own scholarships"
  on public.scholarships for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own scholarships" on public.scholarships;
create policy "Users can delete their own scholarships"
  on public.scholarships for delete
  to authenticated
  using (auth.uid() = user_id);
