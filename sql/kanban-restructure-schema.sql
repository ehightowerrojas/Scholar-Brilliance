-- ============================================================
-- Scholar Brilliance — Kanban Tracker Restructure
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Replaces the old 4-status flow (saved/working/submitted/
-- funds_received) with a 6-column workflow: Backlog, Researching &
-- Eligibility, Writing & Drafting, In Review, Submitted, Funds
-- Received. Also adds two new card fields (essay_prompt,
-- rec_letters_needed) for standardized card templates.

-- Widen the constraint FIRST so it accepts both the old and new
-- values at once — only then is it safe to migrate existing rows.
-- Getting this order backwards (migrate first, tighten after) fails
-- immediately: the old constraint doesn't allow 'backlog' yet, so
-- updating a row to that value while it's still active gets rejected.
alter table public.scholarships drop constraint if exists scholarships_status_check;
alter table public.scholarships add constraint scholarships_status_check
  check (status in ('saved','working','backlog','researching','writing','in_review','submitted','funds_received'));

update public.scholarships set status = 'backlog' where status = 'saved';
update public.scholarships set status = 'writing' where status = 'working';

-- Now that every row has a valid new-style value, tighten to the
-- final 6-status list, dropping the old ones.
alter table public.scholarships drop constraint if exists scholarships_status_check;
alter table public.scholarships add constraint scholarships_status_check
  check (status in ('backlog','researching','writing','in_review','submitted','funds_received'));

alter table public.scholarships add column if not exists essay_prompt text;
alter table public.scholarships drop constraint if exists scholarships_essay_prompt_check;
alter table public.scholarships add constraint scholarships_essay_prompt_check
  check (essay_prompt is null or length(essay_prompt) <= 3000);

alter table public.scholarships add column if not exists rec_letters_needed integer;
alter table public.scholarships drop constraint if exists scholarships_rec_letters_check;
alter table public.scholarships add constraint scholarships_rec_letters_check
  check (rec_letters_needed is null or (rec_letters_needed >= 0 and rec_letters_needed <= 10));
