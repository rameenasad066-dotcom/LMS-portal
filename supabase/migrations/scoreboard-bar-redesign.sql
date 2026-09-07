-- Study With Rameen · scoreboard bar redesign (2026-09-04)
--
-- The new bar-chart Scoreboard needs two things per ranked student that
-- get_scoreboard() didn't return before:
--   - score: the rounded aggregate percentage (equal-thirds average, same
--     number already computed internally for ranking) — used ONLY to size
--     each row's bar proportionally. Never rendered as a number in the UI.
--     This is a deliberate, explicit design choice (not the same as
--     exposing a raw per-assessment mark, which still never happens) —
--     confirmed with her before building.
--   - prevRank: that student's rank in the calendar month immediately
--     before the one being viewed, so the UI can show a ▲/▼/– movement
--     arrow. Computed by running the exact same ranking logic one month
--     earlier and joining on student id.
--
-- top3/yourRank are unchanged — the Dashboard's mini-podium widget still
-- reads top3 and doesn't need touching.

create or replace function public.get_scoreboard(target_cohort text, target_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', coalesce(target_month, now()));
  prev_month_start date := month_start - interval '1 month';
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
    ),
    prev_monthly_marks as (
      select m.student_id, a.type, m.marks, a.max_marks
      from public.marks m
      join public.assignments a on a.id = m.assignment_id
      where date_trunc('month', a.due_date) = prev_month_start
    ),
    prev_category_pct as (
      select student_id, type,
             100.0 * sum(marks) / sum(max_marks) as pct
      from prev_monthly_marks
      group by student_id, type
    ),
    prev_student_scores as (
      select s.id,
             (
               select round(avg(cp.pct), 1)
               from prev_category_pct cp
               where cp.student_id = s.id
             ) as pct
      from public.students s
      where s.cohort_id = target_cohort
    ),
    prev_ranked as (
      select *, rank() over (order by pct desc nulls last) as rnk
      from prev_student_scores
      where pct is not null
    )
    select jsonb_build_object(
      'top3', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'initials', initials) order by rnk)
        from ranked
        where rnk <= 3 and pct is not null
      ), '[]'::jsonb),
      'yourRank', (select rnk from ranked where id = auth.uid()),
      'fullList', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'initials', r.initials,
          'rank', r.rnk,
          'score', round(r.pct),
          'prevRank', pr.rnk
        ) order by r.rnk)
        from ranked r
        left join prev_ranked pr on pr.id = r.id
        where r.pct is not null
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.get_scoreboard(text, date) to authenticated;
