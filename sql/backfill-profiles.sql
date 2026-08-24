-- ============================================================
-- Scholar Brilliance — Backfill profiles for pre-existing accounts
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- Safe to run more than once — it only touches accounts that
-- don't already have a profiles row.
-- ============================================================
--
-- Why this is needed: the trigger in staff-schema.sql only fires
-- on NEW signups. Any account created before that trigger existed
-- has no row in public.profiles, so it silently can't be seen by
-- any org-scoped feature (staff dashboard, student progress, etc).
-- This script mirrors the trigger's exact logic — reading the same
-- role / org_name / referral_code metadata that was captured at
-- signup time — and applies it retroactively.
-- ============================================================

do $$
declare
  r record;
  v_org_id uuid;
begin
  for r in
    select u.id, u.raw_user_meta_data as meta
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    v_org_id := null;

    if coalesce(r.meta->>'role', 'student') = 'staff' then
      if r.meta->>'org_name' is not null and length(trim(r.meta->>'org_name')) > 0 then
        insert into public.organizations (name, created_by)
        values (trim(r.meta->>'org_name'), r.id)
        returning id into v_org_id;
      end if;
    else
      if r.meta->>'referral_code' is not null and length(trim(r.meta->>'referral_code')) > 0 then
        select org_id into v_org_id
          from public.referral_codes
          where code = trim(r.meta->>'referral_code')
            and active = true
          limit 1;
      end if;
    end if;

    insert into public.profiles (id, full_name, role, org_id)
    values (r.id, r.meta->>'full_name', coalesce(r.meta->>'role', 'student'), v_org_id);
  end loop;
end $$;

-- Quick check afterward: this should return 0 rows if everything
-- now has a profile.
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
