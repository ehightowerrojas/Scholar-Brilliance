-- ============================================================
-- Scholar Brilliance — Billing (Stripe) schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- Run AFTER 00-master-setup.sql (references organizations, and
-- reuses the set_updated_at() trigger function defined there).
-- ============================================================
--
-- This is the shared plumbing underneath BOTH billing workflows —
-- an individual student's own subscription, and an org's seat-pool
-- subscription. A row belongs to exactly one of user_id/org_id,
-- never both. Attribution (which counselor/class a student belongs
-- to) lives on profiles/classes and is never touched by this table —
-- same separation principle as add-classes-and-named-invites.sql,
-- so a lapsed org subscription can later flip billing status without
-- ever disturbing roster history.
--
-- Nothing here is ever written by a logged-in user's own client —
-- every write comes from the Worker's Stripe webhook handler using
-- the Supabase service_role key, which bypasses RLS entirely. The
-- policies below are read-only, just so a student or staff member
-- can see their own billing status in the app.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete' check (
    status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  seats integer,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_owner_check check (
    (user_id is not null and org_id is null) or (user_id is null and org_id is not null)
  )
);

-- One Stripe customer should only ever map to one of our rows, and
-- the webhook upserts on stripe_subscription_id (see worker.js).
create unique index if not exists subscriptions_customer_unique on public.subscriptions (stripe_customer_id);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Idempotency log — Stripe retries a webhook delivery on anything
-- but a 2xx response, so without this a retried delivery could
-- double-apply (e.g. re-run logic keyed off a one-time event). The
-- Worker inserts the event id here before processing and skips if
-- it's already present.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
-- stripe_events has no policies at all on purpose — it's never read
-- or written by any authenticated client, only by the Worker's
-- service_role key, which bypasses RLS entirely regardless. RLS is
-- still enabled so a future policy mistake can't accidentally expose
-- it.

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription"
  on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Staff can view their org's subscription" on public.subscriptions;
create policy "Staff can view their org's subscription"
  on public.subscriptions for select to authenticated
  using (org_id = public.current_staff_org_id());
