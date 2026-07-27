-- Study With Rameen · progress system, Phase 2
-- Scoreboard is computed server-side and returns only what's safe to show:
-- the top 3 names for the whole cohort (a "highlight," same as before), and
-- the CALLER's own numeric rank. Raw marks/percentages never leave this
-- function — that's the whole reason it's SECURITY DEFINER instead of just
-- letting the client read `marks` directly and compute a rank itself,
-- which would require exposing every student's marks to every other
-- student.
--
-- Equal-thirds category weighting (updated 2026-07-22, replacing the
-- original "everything counts" pooled-points version): a student's monthly
-- score is the average of up to three category percentages — homework,
-- assignment, test (`assignments.type`) — each computed as that category's
-- own total-points-earned / total-points-possible. A category with zero
-- graded items this month is skipped entirely rather than counted as 0%,
-- per Rameen's call — a student isn't penalized for a test that hasn't
-- happened yet. This means one test now counts as much as five homeworks,
-- rather than being drowned out by homework's larger point pool.

create or replace function public.get_scoreboard(target_cohort text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    with monthly_marks as (
      select m.student_id, a.type, m.marks, a.max_marks
      from public.marks m
      join public.assignments a on a.id = m.assignment_id
      where date_trunc('month', a.due_date) = date_trunc('month', now())
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

grant execute on function public.get_scoreboard(text) to authenticated;
