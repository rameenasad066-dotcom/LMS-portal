-- Study With Rameen · full ranked scoreboard list (2026-09-04)
--
-- get_scoreboard() only ever returned the top-3 "podium" plus the caller's
-- own rank — by original design, so a student could never see another
-- student's exact rank. She's now asked for the opposite: every student's
-- rank (never their raw marks/percentage) visible on both portals, not
-- just a top-3 highlight. Adds a `fullList` field alongside the existing
-- `top3`/`yourRank` so nothing that already reads those two breaks.

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
      'yourRank', (select rnk from ranked where id = auth.uid()),
      'fullList', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'initials', initials, 'rank', rnk) order by rnk)
        from ranked
        where pct is not null
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.get_scoreboard(text, date) to authenticated;
