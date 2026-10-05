-- ============================================================
-- Scholar Brilliance — Add "Funds Received" tracker stage
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

alter table public.scholarships drop constraint if exists scholarships_status_check;
alter table public.scholarships add constraint scholarships_status_check
  check (status in ('saved','working','submitted','funds_received'));
