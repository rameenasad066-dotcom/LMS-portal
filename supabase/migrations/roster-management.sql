-- Study With Rameen · roster management (shift cohort + remove student)
-- Lets the teacher move a student between cohorts and remove a student
-- account entirely from the Teacher Portal, without opening the Supabase
-- dashboard. Mirrors the existing column-scoped grant pattern from
-- student-settings.sql: only the two cohort columns are writable by the
-- teacher, not a blanket grant.
--
-- Removing a student is handled by a new Edge Function (remove-student),
-- not by client-side SQL — deleting the auth.users login requires the
-- service-role key. Deleting that row cascades to the matching `students`
-- row (and everything referencing it: marks, submissions, attendance,
-- quiz_attempts, weekly_test_submissions, active_sessions) automatically,
-- the same cascade already relied on by remove-mj26-cohort.sql.

drop policy if exists "Teacher can update student cohort" on public.students;
create policy "Teacher can update student cohort"
  on public.students for update
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant update (cohort_id, cohort_name) on public.students to authenticated;
