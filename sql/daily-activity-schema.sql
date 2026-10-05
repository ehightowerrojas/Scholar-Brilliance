-- ============================================================
-- Scholar Brilliance — Daily activity log (real streak tracking)
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- The dashboard's "This Week's Activity" widget previously derived
-- activity from scattered timestamps (scholarship created_at, when
-- an achievement was earned), which only shows the last 7 days and
-- can't reliably answer "how many days in a row." This table logs
-- one row per user per day they visited the dashboard, letting us
-- compute a real, ongoing streak.

create table if not exists public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, activity_date)
);

alter table public.daily_activity enable row level security;

drop policy if exists "Users can view their own activity log" on public.daily_activity;
create policy "Users can view their own activity log"
  on public.daily_activity for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can log their own activity" on public.daily_activity;
create policy "Users can log their own activity"
  on public.daily_activity for insert to authenticated
  with check (user_id = auth.uid());
