-- Study With Rameen · separate Pakistan Studies and Islamiyat (2026-10-07)
--
-- Weekly tests and assignments are now posted to ONE course, and the
-- scoreboard ranks each course on its own.
--
-- Assignments already carry `subjects text[]` (subject-enrolment.sql) — the
-- expanded subject ids of the course they're for, which RLS already keys
-- on — so they need no new column. Weekly tests get the same column here.
--
-- Items posted before this (assignments sent to "All students", and every
-- weekly test so far) hold all three subjects. Rameen chose to count those
-- on BOTH course scoreboards until she re-tags each one to a single course
-- from the teacher portal; the overlap test (&&) below does exactly that
-- with no special case.
--
-- Safe to re-run.

-- ------------------------------------------------------------ weekly tests

alter table public.weekly_tests
  add column if not exists subjects text[] not null default '{history,geography,islamiyat}';

-- A student only sees (and so can only submit to, since the submissions
-- insert policy looks the test up under the student's own RLS) weekly tests
-- for a course they take.
drop policy if exists "Students can view their cohort's weekly tests" on public.weekly_tests;
create policy "Students can view their cohort's weekly tests"
  on public.weekly_tests for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = weekly_tests.cohort_id
      and students.subjects && weekly_tests.subjects
    )
  );

drop policy if exists "Students can read their cohort's weekly test files" on storage.objects;
create policy "Students can read their cohort's weekly test files"
  on storage.objects for select
  using (
    bucket_id = 'weekly-tests'
    and exists (
      select 1 from public.weekly_tests wt
      join public.students s on s.cohort_id = wt.cohort_id
      where wt.pdf_path = storage.objects.name
      and s.id = auth.uid()
      and s.subjects && wt.subjects
    )
  );

-- ------------------------------------------------------------- scoreboard

-- Mirrors COURSES in supabase-config.js.
create or replace function public.course_subjects(course text)
returns text[]
language sql
immutable
as $$
  select case course
    when 'pakstudies' then '{history,geography}'::text[]
    when 'islamiyat' then '{islamiyat}'::text[]
  end;
$$;

-- Adding a parameter creates a new overload rather than replacing, and two
-- overloads would make every existing rpc() call ambiguous — drop first.
drop function if exists public.get_scoreboard(text, date);
drop function if exists public.get_scoreboard_months(text);

-- Same function as scoreboard-unranked.sql, plus target_course. With a
-- course: only students enrolled in it are ranked or listed as unranked,
-- and only marks on work aimed at it count. Without one (null), it behaves
-- exactly as before, so a page still on the old code keeps working.
create or replace function public.get_scoreboard(
  target_cohort text,
  target_month date default null,
  target_course text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', coalesce(target_month, now()));
  prev_month_start date := month_start - interval '1 month';
  course_subj text[] := public.course_subjects(target_course);
begin
  if target_course is not null and course_subj is null then
    raise exception 'Unknown course: %', target_course;
  end if;

  return (
    with cohort_students as (
      select s.id, s.name, s.initials
      from public.students s
      where s.cohort_id = target_cohort
      and (course_subj is null or s.subjects @> course_subj)
    ),
    monthly_marks as (
      select m.student_id, a.type, m.marks, a.max_marks
      from public.marks m
      join public.assignments a on a.id = m.assignment_id
      where date_trunc('month', a.due_date) = month_start
      and (course_subj is null or a.subjects && course_subj)
    ),
    category_pct as (
      select student_id, type,
             100.0 * sum(marks) / sum(max_marks) as pct
      from monthly_marks
      group by student_id, type
    ),
    student_scores as (
      select cs.id, cs.name, cs.initials,
             (
               select round(avg(cp.pct), 1)
               from category_pct cp
               where cp.student_id = cs.id
             ) as pct
      from cohort_students cs
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
      and (course_subj is null or a.subjects && course_subj)
    ),
    prev_category_pct as (
      select student_id, type,
             100.0 * sum(marks) / sum(max_marks) as pct
      from prev_monthly_marks
      group by student_id, type
    ),
    prev_student_scores as (
      select cs.id,
             (
               select round(avg(cp.pct), 1)
               from prev_category_pct cp
               where cp.student_id = cs.id
             ) as pct
      from cohort_students cs
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
      ), '[]'::jsonb),
      'unranked', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'initials', initials) order by name)
        from ranked
        where pct is null
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.get_scoreboard(text, date, text) to authenticated;

create or replace function public.get_scoreboard_months(target_cohort text, target_course text default null)
returns table(month_start date)
language sql
security definer
set search_path = public
as $$
  select distinct month_start from (
    select date_trunc('month', a.due_date)::date as month_start
    from public.assignments a
    where a.cohort_id = target_cohort
    and (target_course is null or a.subjects && public.course_subjects(target_course))
    union
    select date_trunc('month', now())::date
  ) months
  order by month_start desc;
$$;

grant execute on function public.get_scoreboard_months(text, text) to authenticated;
