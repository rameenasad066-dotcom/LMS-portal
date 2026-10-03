-- Study With Rameen · students keep seeing their own past grades (2026-10-04)
--
-- "Students can view their cohort's assignments" (subject-enrolment.sql)
-- only matches the student's CURRENT cohort and subjects. Marks and
-- submissions don't move with them, so after a cohort shift or a course
-- being removed, a student's own graded work pointed at assignments they
-- could no longer read — My Grades got a null `assignments` embed (which
-- used to crash the whole student portal; it's now skipped client-side,
-- but the grade simply vanished from their history).
--
-- This adds a second, additive SELECT policy: a student can also read any
-- assignment they personally have a mark or a submission on. Policies are
-- OR'd, so nothing currently visible is hidden. It exposes only that
-- assignment's own row (title, due date, max marks) to the one student who
-- did the work. The Assignments page still filters to the current cohort +
-- subjects client-side, so old-cohort work doesn't reappear there as
-- something to submit.
--
-- No recursion risk: the student policies on marks/submissions only compare
-- student_id = auth.uid() and never reference assignments.
--
-- Safe to re-run.

drop policy if exists "Students can view assignments they were graded on" on public.assignments;
create policy "Students can view assignments they were graded on"
  on public.assignments for select
  using (
    exists (
      select 1 from public.marks
      where marks.assignment_id = assignments.id
      and marks.student_id = auth.uid()
    )
    or exists (
      select 1 from public.submissions
      where submissions.assignment_id = assignments.id
      and submissions.student_id = auth.uid()
    )
  );
