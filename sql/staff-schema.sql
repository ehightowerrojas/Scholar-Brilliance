-- ============================================================
-- Scholar Brilliance — Staff/Admin schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- Run AFTER achievements-schema.sql, tracker-schema.sql, and
-- catalog-schema.sql already exist.
-- ============================================================

-- ------------------------------------------------------------
-- Organizations (schools / nonprofits)
-- ------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Profiles: one row per account, created automatically at signup.
-- This is what lets staff query "students in my org" — something
-- you can't do against auth.users directly.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'student' check (role in ('student','staff')),
  org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Referral codes: staff generate these; students redeem one at
-- signup to get linked to that organization.
-- ------------------------------------------------------------
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  expires_at date,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Auto-create a profile whenever someone signs up.
-- Runs as SECURITY DEFINER so it can look up referral codes and
-- create organizations regardless of the new user's own RLS access.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Add org scoping to the scholarship catalog (previously global).
-- Existing seeded rows stay org_id = null, meaning "visible to
-- everyone" — org-specific scholarships are only visible to that
-- org's own students.
-- ------------------------------------------------------------
alter table public.scholarships_catalog add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.scholarships_catalog add column if not exists active boolean not null default true;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.referral_codes enable row level security;

-- Profiles
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

-- Organizations
drop policy if exists "Staff can view own organization" on public.organizations;
create policy "Staff can view own organization"
  on public.organizations for select to authenticated
  using (id = (select org_id from public.profiles where id = auth.uid() and role = 'staff'));

-- Referral codes
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

-- Scholarship catalog: staff can manage their org's listings
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

-- Update the catalog's read policy: everyone sees global (org_id
-- null) listings, plus their own org's listings.
drop policy if exists "Catalog is readable by any authenticated user" on public.scholarships_catalog;
create policy "Catalog is readable by matching org or global listings"
  on public.scholarships_catalog for select to authenticated
  using (
    org_id is null
    or org_id = (select org_id from public.profiles where id = auth.uid())
  );

-- Scholarships (the student tracker table): staff can view — but
-- not edit — the scholarships of students in their own org.
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
