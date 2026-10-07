-- ============================================================
-- Scholar Brilliance — Add scholarship-specific questions
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================
--
-- Replaces the single "Additional Notes" free-text field in
-- Application Builder with structured, per-scholarship questions
-- (e.g. "List your extracurricular activities", "What is your
-- financial need?"), each with its own answer. A student can add as
-- many as a given scholarship's form actually asks for.

create table if not exists public.scholarship_questions (
  id uuid primary key default gen_random_uuid(),
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scholarship_questions_scholarship_idx on public.scholarship_questions(scholarship_id);

drop trigger if exists set_scholarship_questions_updated_at on public.scholarship_questions;
create trigger set_scholarship_questions_updated_at
  before update on public.scholarship_questions
  for each row execute function public.set_updated_at();

alter table public.scholarship_questions enable row level security;

drop policy if exists "Users manage their own scholarship questions" on public.scholarship_questions;
create policy "Users manage their own scholarship questions"
  on public.scholarship_questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
