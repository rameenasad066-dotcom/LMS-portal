-- Study With Rameen · fix ambiguous get_scoreboard overload (2026-09-04)
-- scoreboard-monthly-history.sql used `create or replace function
-- get_scoreboard(target_cohort text, target_month date default null)` —
-- but a different parameter LIST means Postgres treats that as a brand new
-- overload, not a replacement. The original single-argument
-- get_scoreboard(text) was left behind, so calling it with just a cohort
-- (as every existing caller does) is now ambiguous between the two.
-- Drop the old one-argument version; the two-argument version's
-- target_month default already covers every "just give me the cohort" call.

drop function if exists public.get_scoreboard(text);
