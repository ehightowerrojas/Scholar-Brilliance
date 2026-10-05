-- ============================================================
-- Scholar Brilliance — Application Builder
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- These are fields most scholarship applications ask for, entered
-- once and reused across every application a student builds, so
-- they don't retype the same information every time.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists zip_code text;
alter table public.profiles add column if not exists school_name text;
alter table public.profiles add column if not exists graduation_year integer;
alter table public.profiles add column if not exists gpa numeric;
alter table public.profiles add column if not exists major text;

-- Reasonable bounds, consistent with the data-integrity-constraints.sql
-- pattern used elsewhere.
alter table public.profiles drop constraint if exists profiles_gpa_check;
alter table public.profiles add constraint profiles_gpa_check
  check (gpa is null or (gpa >= 0 and gpa <= 5.0));

alter table public.profiles drop constraint if exists profiles_grad_year_check;
alter table public.profiles add constraint profiles_grad_year_check
  check (graduation_year is null or (graduation_year >= 2020 and graduation_year <= 2035));

-- Free-form space for short answers a scholarship's own form asks
-- for that don't warrant a full essay (household income, activities
-- list, etc.) — scoped per scholarship, alongside its linked essay.
alter table public.scholarships add column if not exists application_notes text;
alter table public.scholarships drop constraint if exists scholarships_notes_check;
alter table public.scholarships add constraint scholarships_notes_check
  check (application_notes is null or length(application_notes) <= 10000);
