-- Study With Rameen · per-student subject enrolment
-- Some students take Pakistan Studies only, some Islamiyat only, some both.
-- A student now carries the list of portal subjects they're enrolled in, and
-- only sees content for those subjects.
--
-- Note the two levels of naming: Rameen SELLS two courses (Pakistan Studies,
-- Islamiyat) but the portal STORES three subjects (history, geography,
-- islamiyat) because Pak Studies is two papers. The course -> subject
-- expansion happens once in the UI (see COURSES in supabase-config.js);
-- everything below works purely in subject ids, which is what all the
-- content tables are already keyed by.
--
-- Both new columns default to all three subjects, so every existing student
-- and assignment keeps exactly today's behaviour until it's changed
-- deliberately. That makes this script safe to run before the new front-end
-- ships — there is no window where anything breaks.

-- ---------------------------------------------------------------- students

alter table public.students
  add column if not exists subjects text[] not null default '{history,geography,islamiyat}';

-- Column-scoped, matching the existing pattern from roster-management.sql /
-- student-settings.sql — the teacher may edit cohort + subjects, nothing else.
-- Grants are additive per column, so this keeps the cohort columns too.
grant update (cohort_id, cohort_name, subjects) on public.students to authenticated;

-- ------------------------------------------------------------- assignments
-- Which subjects an assignment is aimed at. All three = "everyone", which is
-- also the backfill for every assignment posted before this feature existed.
-- Every student has at least one subject, so an all-three assignment always
-- overlaps and stays visible to the whole cohort — no NULL special case.

alter table public.assignments
  add column if not exists subjects text[] not null default '{history,geography,islamiyat}';

-- Students only see assignments aimed at a subject they're enrolled in.
-- `&&` is the array-overlap operator.
drop policy if exists "Students can view their cohort's assignments" on public.assignments;
create policy "Students can view their cohort's assignments"
  on public.assignments for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = assignments.cohort_id
      and students.subjects && assignments.subjects
    )
  );

-- ------------------------------------------------------- notes & lectures
-- Enrolment is enforced here, not just hidden in the UI: a student who isn't
-- enrolled in a subject cannot fetch its rows at all, even by tampering with
-- the page.

drop policy if exists "Students can view their cohort's notes" on public.notes;
create policy "Students can view their cohort's notes"
  on public.notes for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = notes.cohort_id
      and notes.subject = any(students.subjects)
    )
  );

drop policy if exists "Students can view their cohort's lectures" on public.lectures;
create policy "Students can view their cohort's lectures"
  on public.lectures for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = lectures.cohort_id
      and lectures.subject = any(students.subjects)
    )
  );

-- The note PDFs themselves, so an unenrolled student can't pull a file even
-- with a known storage path.
drop policy if exists "Students can read their cohort's note files" on storage.objects;
create policy "Students can read their cohort's note files"
  on storage.objects for select
  using (
    bucket_id = 'notes'
    and exists (
      select 1 from public.notes n
      join public.students s on s.cohort_id = n.cohort_id
      where n.storage_path = storage.objects.name
      and s.id = auth.uid()
      and n.subject = any(s.subjects)
    )
  );
