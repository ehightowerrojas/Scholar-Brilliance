-- ============================================================
-- Scholar Brilliance — Avatar System
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Two separate progress dimensions drive an avatar's appearance:
--   1. SPECIES (which character) — unlocked by submitting more
--      scholarship applications. This is the "collectible" layer.
--   2. EVOLUTION TIER (how developed it looks) — driven by the
--      student's existing achievement level (levels table), so it
--      reuses gamification you already have rather than a second
--      parallel XP system.

create table if not exists public.avatar_species (
  id text primary key,
  name text not null,
  color_hex text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','legendary')),
  unlock_applications integer not null default 0,
  sort_order integer not null
);

alter table public.avatar_species enable row level security;
drop policy if exists "Avatar species catalog is readable by any authenticated user" on public.avatar_species;
create policy "Avatar species catalog is readable by any authenticated user"
  on public.avatar_species for select to authenticated
  using (true);

insert into public.avatar_species (id, name, color_hex, rarity, unlock_applications, sort_order) values
  ('raptor',   'Raptor',    '#C62828', 'common',    0,  1),
  ('longneck', 'Long-neck', '#F9A825', 'common',    0,  2),
  ('armored',  'Armored',   '#5E35B1', 'uncommon',  3,  3),
  ('horned',   'Horned',    '#43A047', 'uncommon',  3,  4),
  ('plated',   'Plated',    '#D81B60', 'rare',      8,  5),
  ('heavyjaw', 'Heavy-jaw', '#BF5B04', 'rare',      8,  6),
  ('flyer',    'Flyer',     '#F4511E', 'legendary', 15, 7),
  ('sailback', 'Sail-back', '#1E88E5', 'legendary', 15, 8)
on conflict (id) do nothing;

-- Which species the student currently has equipped (defaults to the
-- starter Raptor). Evolution tier is computed on the fly from their
-- existing achievement level, not stored.
alter table public.profiles add column if not exists avatar_species_id text references public.avatar_species(id) default 'raptor';

-- ------------------------------------------------------------
-- Extend the leaderboard function (from leaderboard-schema.sql) to
-- also return each student's equipped avatar species, so the
-- Leaderboard page can render avatars next to names. This is safe to
-- run even if you haven't touched leaderboard-schema.sql's version —
-- it fully replaces the function.
-- ------------------------------------------------------------
create or replace function public.get_org_leaderboard()
returns table(student_id uuid, display_name text, total_points bigint, is_anonymous boolean, avatar_species_id text)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.full_name,
      p.leaderboard_visible,
      p.created_at,
      p.avatar_species_id,
      coalesce(sum(a.points), 0) as total_points
    from public.profiles p
    left join public.user_achievements ua on ua.user_id = p.id
    left join public.achievements a on a.id = ua.achievement_id
    where p.role = 'student'
      and p.org_id is not null
      and p.org_id = (select org_id from public.profiles where id = auth.uid())
    group by p.id, p.full_name, p.leaderboard_visible, p.created_at, p.avatar_species_id
  ),
  numbered as (
    select
      base.*,
      row_number() over (
        partition by (leaderboard_visible = false)
        order by created_at
      ) as anon_num
    from base
  )
  select
    id as student_id,
    case when leaderboard_visible = false then 'Student #' || anon_num else full_name end as display_name,
    total_points,
    (leaderboard_visible = false) as is_anonymous,
    avatar_species_id
  from numbered
  order by total_points desc, full_name asc nulls last;
$$;

grant execute on function public.get_org_leaderboard() to authenticated;
