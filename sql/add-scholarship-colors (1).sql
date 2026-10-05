-- ============================================================
-- Scholar Brilliance — Add scholarship color tags
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Replaces the automatic deadline-urgency color-coding on Tracker
-- cards with a manual, student-chosen color tag (Google Calendar
-- style). Stores a named key rather than a raw hex value, so the
-- actual shades can be tuned later purely on the frontend without
-- needing another data migration.

alter table public.scholarships add column if not exists color text;
alter table public.scholarships drop constraint if exists scholarships_color_check;
alter table public.scholarships add constraint scholarships_color_check
  check (color is null or color in ('tomato','tangerine','banana','sage','peacock','blueberry','lavender','graphite'));
