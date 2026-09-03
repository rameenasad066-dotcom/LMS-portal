-- Study With Rameen · scoreboard month history (2026-09-04)
-- get_scoreboard() was hard-coded to date_trunc('month', now()) — a student
-- could only ever see THIS month's ranking, even after it had been marked
-- and finished. Once the month rolled over, that scoreboard was gone for
-- good, with no way for a student (or Rameen) to look back at it.
--
-- Adds an optional target_month param (defaults to the current month, so
-- every existing caller keeps working unchanged) and a companion function
-- that lists which months actually have a scoreboard for a cohort, so the
-- UI can offer a real "previous months" picker instead of guessing.

create or replace function public.get_scoreboard(target_cohort text, target_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', coalesce(target_month, now()));
begin
  return (
    with monthly_marks as (
      select m.student_id, a.type, m.marks, a.max_marks
      from public.marks m
      join public.assignments a on a.id = m.assignment_id
      where date_trunc('month', a.due_date) = month_start
    ),
    category_pct as (
      select student_id, type,
             100.0 * sum(marks) / sum(max_marks) as pct
      from monthly_marks
      group by student_id, type
    ),
    student_scores as (
      select s.id, s.name, s.initials,
             (
               select round(avg(cp.pct), 1)
               from category_pct cp
               where cp.student_id = s.id
             ) as pct
      from public.students s
      where s.cohort_id = target_cohort
    ),
    ranked as (
      select *, rank() over (order by pct desc nulls last) as rnk
      from student_scores
    )
    select jsonb_build_object(
      'top3', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'initials', initials) order by rnk)
        from ranked
        where rnk <= 3 and pct is not null
      ), '[]'::jsonb),
      'yourRank', (select rnk from ranked where id = auth.uid())
    )
  );
end;
$$;

grant execute on function public.get_scoreboard(text, date) to authenticated;

-- Every calendar month a cohort has at least one graded item, newest first.
-- The current month is always included even with nothing graded yet, so
-- "this month, not yet ranked" stays selectable rather than disappearing.
create or replace function public.get_scoreboard_months(target_cohort text)
returns table(month_start date)
language sql
security definer
set search_path = public
as $$
  select distinct month_start from (
    select date_trunc('month', a.due_date)::date as month_start
    from public.assignments a
    where a.cohort_id = target_cohort
    union
    select date_trunc('month', now())::date
  ) months
  order by month_start desc;
$$;

grant execute on function public.get_scoreboard_months(text) to authenticated;
