-- ============================================================
-- Scholar Brilliance — Remove fake/demo scholarship catalog entries
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- "Future Leaders Scholarship" and "First-Generation College Student
-- Grant" from "Sample Educational Foundation" were demo/placeholder
-- data seeded early in the project for testing. They were inserted
-- with no org_id, which the catalog's RLS policy treats as a
-- "global listing" visible to every student regardless of school —
-- an intentional feature for real global scholarships, but not
-- something fake demo data should ever have been using.
--
-- Scoped to org_id is null so this can never touch a real
-- counselor's own catalog entry, even in the unlikely case they
-- named their org the same thing.

delete from public.scholarships_catalog where org_name = 'Sample Educational Foundation' and org_id is null;
