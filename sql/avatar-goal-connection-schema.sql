-- ============================================================
-- Scholar Brilliance — Connect avatar progression to goal completion
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Previously, avatar species unlocked based on how many applications
-- a student had submitted — a metric tied to the old quest-map
-- concept, which has since been removed. Now that Goals are the
-- single central progress system, species unlocking is driven by
-- how many goals a student has fully completed instead.
--
-- The old unlock_applications column is left in place (not dropped)
-- rather than destructively removed — it's just no longer read by
-- the app going forward.

alter table public.avatar_species add column if not exists unlock_goals_completed integer not null default 0;

update public.avatar_species set unlock_goals_completed = 0 where id in ('raptor', 'longneck');
update public.avatar_species set unlock_goals_completed = 1 where id in ('armored', 'horned');
update public.avatar_species set unlock_goals_completed = 3 where id in ('plated', 'heavyjaw');
update public.avatar_species set unlock_goals_completed = 5 where id in ('flyer', 'sailback');
