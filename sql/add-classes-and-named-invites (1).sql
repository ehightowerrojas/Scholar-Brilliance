-- ============================================================
-- Scholar Brilliance — Classes, Named Invites & Seat Pools (Phase 1)
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Phase 1 of the org/counselor/student access-control redesign:
-- classes, named invites (and CSV bulk invites, which reuse this
-- same table), and seat tracking. Deliberately does NOT include
-- actual seat purchasing, org subscription billing, or the
-- automated grace-period/lapse workflow — those need Stripe (or an
-- equivalent) wired up first, which is a separate phase.
--
-- Referral codes still work exactly as before, unchanged — this
-- adds a second, more controlled path alongside them, matching the
-- original recommendation to keep both options available.

-- SECTION 12 — Classes, Named Invites & Seat Pools (Phase 1)
-- ============================================================
-- Phase 1 covers everything that doesn't require live payment
-- processing: the data model, classes, named invites, CSV-driven
-- bulk invites, and seat tracking. Actual seat purchasing, org
-- subscription billing, and the automated grace-period/lapse
-- workflow (Workflow 4) need Stripe (or similar) wired up first —
-- that's Phase 2, deliberately not built here.

-- Seat pool: nullable on purpose. Existing orgs have no seat concept
-- yet, and null means "no limit set" so nothing breaks for them
-- until a real number is entered.
alter table public.organizations add column if not exists seats_purchased integer;
alter table public.organizations drop constraint if exists organizations_seats_check;
alter table public.organizations add constraint organizations_seats_check
  check (seats_purchased is null or seats_purchased >= 0);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  counselor_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  term text,
  created_at timestamptz not null default now()
);

alter table public.classes drop constraint if exists classes_name_check;
alter table public.classes add constraint classes_name_check
  check (length(name) > 0 and length(name) <= 150);

alter table public.classes enable row level security;

drop policy if exists "Staff can manage classes in their own org" on public.classes;
create policy "Staff can manage classes in their own org"
  on public.classes for all to authenticated
  using (org_id = public.current_staff_org_id())
  with check (org_id = public.current_staff_org_id());

-- Student-side additions. class_id/is_org_member are the
-- "who coached this student" facts — kept separate from billing so
-- Phase 2's lapse workflow can flip is_org_member without ever
-- touching roster/attribution history (the core design principle
-- from the source proposal: attribution and billing are two
-- separate fields, never conflated).
alter table public.profiles add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.profiles add column if not exists is_org_member boolean not null default true;
alter table public.profiles add column if not exists coverage_at_risk boolean not null default false;

create table if not exists public.pending_students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  counselor_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  email text not null,
  full_name text,
  invite_token uuid not null default gen_random_uuid() unique,
  status text not null default 'invited' check (status in ('invited','accepted')),
  created_at timestamptz not null default now()
);

alter table public.pending_students drop constraint if exists pending_students_email_check;
alter table public.pending_students add constraint pending_students_email_check
  check (length(email) > 0 and length(email) <= 255);

alter table public.pending_students enable row level security;

drop policy if exists "Staff can manage pending students in their own org" on public.pending_students;
create policy "Staff can manage pending students in their own org"
  on public.pending_students for all to authenticated
  using (org_id = public.current_staff_org_id())
  with check (org_id = public.current_staff_org_id());

-- Extend the signup trigger to also resolve an invite_token (named
-- invite / CSV row), the same server-side way it already resolves a
-- referral_code — no client-side RLS lookup needed for an
-- unauthenticated visitor, since this runs security definer at
-- signup time. An invite_token sets org_id, counselor_id, AND
-- class_id all at once (a referral code only ever set org_id),
-- and marks the pending_students row accepted.
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_counselor_id uuid;
  v_class_id uuid;
  v_role text;
  v_org_name text;
  v_referral_code text;
  v_invite_token text;
  v_pending_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_org_name := new.raw_user_meta_data->>'org_name';
  v_referral_code := new.raw_user_meta_data->>'referral_code';
  v_invite_token := new.raw_user_meta_data->>'invite_token';

  if v_role = 'staff' then
    if v_org_name is not null and length(trim(v_org_name)) > 0 then
      insert into public.organizations (name, created_by)
      values (trim(v_org_name), new.id)
      returning id into v_org_id;
    end if;
  else
    if v_invite_token is not null and v_invite_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id, org_id, counselor_id, class_id
        into v_pending_id, v_org_id, v_counselor_id, v_class_id
        from public.pending_students
        where invite_token = trim(v_invite_token)::uuid
          and status = 'invited'
        limit 1;

      if v_pending_id is not null then
        update public.pending_students set status = 'accepted' where id = v_pending_id;
      end if;
    elsif v_referral_code is not null and length(trim(v_referral_code)) > 0 then
      select org_id into v_org_id
        from public.referral_codes
        where code = trim(v_referral_code)
          and active = true
          and (expires_at is null or expires_at >= current_date)
        limit 1;
    end if;
  end if;

  insert into public.profiles (id, full_name, role, org_id, class_id)
  values (new.id, new.raw_user_meta_data->>'full_name', v_role, v_org_id, v_class_id);

  return new;
end;
$$ language plpgsql;
