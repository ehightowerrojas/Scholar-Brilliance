-- ============================================================
-- Scholar Brilliance — Applicant info matching: min GPA
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Adds an optional minimum GPA field to the catalog, so students can
-- see a clear qualification indicator on Browse based on their own
-- profile GPA, rather than guessing whether they meet a scholarship's
-- criteria.

alter table public.scholarships_catalog add column if not exists min_gpa numeric;
alter table public.scholarships_catalog drop constraint if exists scholarships_catalog_min_gpa_check;
alter table public.scholarships_catalog add constraint scholarships_catalog_min_gpa_check
  check (min_gpa is null or (min_gpa >= 0 and min_gpa <= 5.0));
