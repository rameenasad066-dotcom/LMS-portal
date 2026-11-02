-- Study With Rameen · Assignments: a question or a PDF, and a last upload date (2026-11-02)
--
-- An assignment can now carry
--   question          the question or instructions, typed by Miss Rameen
--   file_path         an assignment PDF (private bucket `assignment-files`)
--   last_upload_date  the last day students can upload; after it, uploads are closed
-- `due_date` stays as it was: work uploaded after it is flagged Late, and is still
-- accepted until the last upload date (when one is set).
--
-- Weekly tests keep their own section. Their hidden `assignments` rows (type = 'test')
-- only carry the marks into My Grades and the scoreboard; the Assignments pages no
-- longer list them.
--
-- Safe to re-run.

-- ------------------------------------------------------------ new fields

alter table public.assignments
  add column if not exists question text,
  add column if not exists file_path text,
  add column if not exists last_upload_date date;

-- ------------------------------------------------- the last upload date, server side
-- The upload form is also hidden on the page, but this check is the real boundary:
-- once the last upload date is over (midnight at the end of that day, Pakistan time),
-- the insert is refused whatever the browser sends. No date = never closes, as before.
--
-- The question "is this assignment still open?" is asked through a tiny SECURITY DEFINER
-- function instead of a sub-select inside the policy. The assignments policies already
-- look back at submissions (assignments-retain-graded.sql); a submissions policy that
-- also reads assignments directly would be one step from Postgres's "infinite recursion
-- detected in policy" error. The function reads the one row as its owner, so it can't
-- loop, and it only ever answers yes or no.
create or replace function public.assignment_uploads_open(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.assignments a
    where a.id = target_assignment
    and a.last_upload_date is not null
    and now() >= ((a.last_upload_date + 1)::timestamp at time zone 'Asia/Karachi')
  );
$$;

grant execute on function public.assignment_uploads_open(uuid) to authenticated;

drop policy if exists "Students can submit their own work" on public.submissions;
create policy "Students can submit their own work"
  on public.submissions for insert
  with check (
    student_id = auth.uid()
    and public.assignment_uploads_open(assignment_id)
  );

-- ------------------------------------------------------- private bucket for the PDFs
-- Same shape as the `weekly-tests` bucket: only the teacher writes; a student can read
-- a file only when it belongs to an assignment of their own cohort and course.
insert into storage.buckets (id, name, public)
values ('assignment-files', 'assignment-files', false)
on conflict (id) do nothing;

drop policy if exists "Teacher can upload assignment files" on storage.objects;
create policy "Teacher can upload assignment files"
  on storage.objects for insert
  with check (bucket_id = 'assignment-files' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can delete assignment files" on storage.objects;
create policy "Teacher can delete assignment files"
  on storage.objects for delete
  using (bucket_id = 'assignment-files' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can read all assignment files" on storage.objects;
create policy "Teacher can read all assignment files"
  on storage.objects for select
  using (bucket_id = 'assignment-files' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Students can read their assignment files" on storage.objects;
create policy "Students can read their assignment files"
  on storage.objects for select
  using (
    bucket_id = 'assignment-files'
    and exists (
      select 1 from public.assignments a
      join public.students s on s.cohort_id = a.cohort_id and s.subjects && a.subjects
      where a.file_path = storage.objects.name
      and s.id = auth.uid()
    )
  );
