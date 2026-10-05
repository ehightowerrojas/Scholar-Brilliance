-- ============================================================
-- Scholar Brilliance — Scholarship Catalog schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

create table if not exists public.scholarships_catalog (
  id uuid primary key default gen_random_uuid(),
  org_name text not null default 'Scholar Brilliance',
  title text not null,
  description text,
  amount numeric,
  deadline date,
  website text,
  created_at timestamptz not null default now()
);

alter table public.scholarships_catalog enable row level security;

-- Any logged-in student can browse the catalog. Inserting/editing
-- catalog entries is reserved for the staff/admin side (not yet
-- built) — for now this table is seeded manually below.
drop policy if exists "Catalog is readable by any authenticated user" on public.scholarships_catalog;
create policy "Catalog is readable by any authenticated user"
  on public.scholarships_catalog for select
  to authenticated
  using (true);

insert into public.scholarships_catalog (org_name, title, description, amount, deadline, website) values
  ('Sample Educational Foundation', 'Future Leaders Scholarship', 'Support for students demonstrating exceptional leadership skills and community involvement.', 4500, '2027-09-01', 'https://example.org/future-leaders'),
  ('Sample Educational Foundation', 'First-Generation College Student Grant', 'Financial aid for students who are the first in their family to attend college.', 6000, '2027-07-15', 'https://example.org/first-gen-grant')
on conflict do nothing;
