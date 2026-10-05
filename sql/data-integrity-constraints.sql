-- ============================================================
-- Scholar Brilliance — Data integrity constraints
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Everything so far has only been validated in the browser (an
-- input's min="0", a form requiring a title, etc). That's UX, not
-- security — anyone can call the Supabase REST API directly and
-- insert whatever they want, bypassing the page entirely. These
-- constraints enforce sane bounds at the database layer itself,
-- where nothing can bypass them. Bounds are intentionally generous
-- so no real data should ever hit them.

-- Scholarships (the student tracker)
alter table public.scholarships drop constraint if exists scholarships_amount_check;
alter table public.scholarships add constraint scholarships_amount_check
  check (amount is null or (amount >= 0 and amount <= 1000000));

alter table public.scholarships drop constraint if exists scholarships_title_check;
alter table public.scholarships add constraint scholarships_title_check
  check (length(title) > 0 and length(title) <= 300);

-- Scholarship catalog (staff-managed listings)
alter table public.scholarships_catalog drop constraint if exists catalog_amount_check;
alter table public.scholarships_catalog add constraint catalog_amount_check
  check (amount is null or (amount >= 0 and amount <= 1000000));

alter table public.scholarships_catalog drop constraint if exists catalog_title_check;
alter table public.scholarships_catalog add constraint catalog_title_check
  check (length(title) > 0 and length(title) <= 300);

alter table public.scholarships_catalog drop constraint if exists catalog_description_check;
alter table public.scholarships_catalog add constraint catalog_description_check
  check (description is null or length(description) <= 5000);

-- Essays — generous limit (well beyond any real scholarship essay)
-- to stop obvious abuse while never truncating legitimate writing.
alter table public.essays drop constraint if exists essays_title_check;
alter table public.essays add constraint essays_title_check
  check (length(title) > 0 and length(title) <= 300);

alter table public.essays drop constraint if exists essays_content_check;
alter table public.essays add constraint essays_content_check
  check (length(content) <= 50000);

-- Profiles
alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles add constraint profiles_goal_check
  check (financial_goal is null or (financial_goal > 0 and financial_goal <= 1000000));

alter table public.profiles drop constraint if exists profiles_full_name_check;
alter table public.profiles add constraint profiles_full_name_check
  check (full_name is null or length(full_name) <= 150);

alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add constraint profiles_interests_check
  check (interests is null or length(interests) <= 500);

-- Organizations
alter table public.organizations drop constraint if exists organizations_name_check;
alter table public.organizations add constraint organizations_name_check
  check (length(name) > 0 and length(name) <= 200);
