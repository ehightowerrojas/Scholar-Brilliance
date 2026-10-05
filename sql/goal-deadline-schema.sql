-- ============================================================
-- Scholar Brilliance — Goal deadlines
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

alter table public.goals add column if not exists target_date date;
