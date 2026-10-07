-- ============================================================
-- Scholar Brilliance — Achievement expansion
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

alter table public.achievements drop constraint if exists achievements_category_check;
alter table public.achievements add constraint achievements_category_check
  check (category in ('early_wins','application_milestones','streak_milestones','financial_milestones'));

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('first_import',     'early_wins', 'Web Scout',        'Imported a scholarship''s details from its website for the first time',  25, 'link',     8),
  ('first_question',   'early_wins', 'Prepared',         'Added your first scholarship-specific question',                        25, 'message',  9),
  ('first_color',      'early_wins', 'Color Coded',      'Gave a scholarship its first color tag',                                 25, 'droplet',  10),
  ('first_autofill',   'early_wins', 'Autofill Rookie',  'Sent your first application to the Autofill extension',                 25, 'zap',      11),
  ('first_pdf',        'early_wins', 'Paper Trail',      'Downloaded your first application as a PDF',                            25, 'download', 12),
  ('avatar_swapped',   'early_wins', 'New Look',         'Selected a different avatar for the first time',                        25, 'star',     13),
  ('early_bird',       'early_wins', 'Early Bird',       'Submitted an application 30+ days before its deadline',                 50, 'target',   14),
  ('speed_demon',      'early_wins', 'Speed Demon',      'Submitted an application within 24 hours of adding it to your tracker', 50, 'zap',      15)
on conflict (id) do nothing;

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('scholarship_collector_5',  'application_milestones', 'Collector',         'Track 5 scholarships at once',   50,  'plus',   7),
  ('scholarship_collector_15', 'application_milestones', 'Super Collector',   'Track 15 scholarships at once',  100, 'plus',   8),
  ('scholarship_collector_30', 'application_milestones', 'Master Collector',  'Track 30 scholarships at once',  175, 'crown',  9),
  ('essay_writer_5',           'application_milestones', 'Wordsmith',         'Write 5 essays',                 75,  'pencil', 10),
  ('essay_writer_15',          'application_milestones', 'Prolific Writer',   'Write 15 essays',                150, 'pencil', 11),
  ('goal_getter_3',            'application_milestones', 'Goal Getter',       'Fully complete 3 goals',         100, 'target', 12),
  ('goal_getter_10',           'application_milestones', 'Goal Machine',      'Fully complete 10 goals',        200, 'trophy', 13)
on conflict (id) do nothing;

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('first_win',  'financial_milestones', 'First Win',       'Win your first scholarship',        75,  'dollar', 1),
  ('earner_1k',  'financial_milestones', 'Four Figures',    'Win $1,000 or more in total',       100, 'dollar', 2),
  ('earner_5k',  'financial_milestones', 'Big Earner',      'Win $5,000 or more in total',       150, 'dollar', 3),
  ('earner_10k', 'financial_milestones', 'Major League',    'Win $10,000 or more in total',      225, 'trophy', 4),
  ('earner_25k', 'financial_milestones', 'Quarter Century', 'Win $25,000 or more in total',      300, 'crown',  5),
  ('earner_50k', 'financial_milestones', 'Half Century',    'Win $50,000 or more in total',      400, 'crown',  6)
on conflict (id) do nothing;

insert into public.achievements (id, category, title, description, points, icon, sort_order) values
  ('streak_20', 'streak_milestones', 'Dedicated',     'Visit 20 weeks in a row', 300, 'flame', 4),
  ('streak_52', 'streak_milestones', 'A Full Year',   'Visit 52 weeks in a row', 500, 'flame', 5)
on conflict (id) do nothing;
