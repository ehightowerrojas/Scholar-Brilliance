-- ============================================================
-- Scholar Brilliance — CRITICAL FIX: profiles had no UPDATE policy
-- Run this immediately in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- The profiles table only ever had SELECT policies (view own profile,
-- staff view org profiles). There was no UPDATE policy at all, which
-- means RLS silently blocked every write to your own profile row:
--   - Applicant info (phone, address, city, state, zip, school,
--     graduation year, GPA, major) — the reported "did not save" bug
--   - Avatar equipping
--   - The leaderboard visibility toggle
--   - The profiles.full_name column specifically (name changes look
--     like they partially work only because account.js also updates
--     your auth account's own metadata in a separate call)
--
-- This adds the missing policy: a user can update their own row,
-- and only their own row.

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
