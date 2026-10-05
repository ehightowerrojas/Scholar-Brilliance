-- ============================================================
-- Scholar Brilliance — Add referral codes post account creation
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Lets a student validate a referral code they type in after signup
-- (on Account Settings), without granting staff-level access to the
-- table. Scoped to active codes only.

drop policy if exists "Any authenticated user can look up an active code" on public.referral_codes;
create policy "Any authenticated user can look up an active code"
  on public.referral_codes for select to authenticated
  using (active = true);
