-- ============================================================
-- Scholar Brilliance — New kanban column: Won, Awaiting Funds
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Adds a new status between Submitted and Funds Received, so a
-- scholarship that's been marked won gets its own visual column
-- instead of staying in Submitted with just a button to confirm
-- funds later.

alter table public.scholarships drop constraint if exists scholarships_status_check;
alter table public.scholarships add constraint scholarships_status_check
  check (status in ('backlog','researching','writing','in_review','submitted','won_awaiting_funds','funds_received'));

-- Existing rows already marked won move to the new column, so it
-- isn't empty for anyone who already has scholarships in this state.
update public.scholarships set status = 'won_awaiting_funds' where status = 'submitted' and outcome = 'won';
