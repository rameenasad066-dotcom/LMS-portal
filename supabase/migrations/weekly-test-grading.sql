-- Study With Rameen · Weekly Test grading (2026-08-15)
-- Lets Miss Rameen enter marks + feedback directly on a weekly test, and has
-- those marks flow into My Grades, the marks-over-time chart, recent graded
-- work, and the scoreboard's test-category weighting — without any of the
-- downstream student-side code having to change.
--
-- Approach: each weekly test that gets marked lazily gets a paired
-- "shadow" row in `assignments` (type='test'), and the marks go into the
-- existing `marks` table pointing at that assignment. weekly_tests carries
-- the FK; deleting a weekly test therefore doesn't cascade the assignment,
-- but the app code deletes the paired assignment right after, which does
-- cascade its marks.

alter table public.weekly_tests
  add column if not exists max_marks integer,
  add column if not exists assignment_id uuid references public.assignments(id) on delete set null;
