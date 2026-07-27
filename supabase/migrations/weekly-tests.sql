-- Study With Rameen · Weekly Test rebuild
-- Replaces the old current.json + WhatsApp-submission flow with a real,
-- cohort-scoped weekly test: Miss Rameen posts a PDF + a hard cutoff time,
-- students upload photos of their paper on the portal itself, and uploads
-- are rejected outright once the cutoff passes — enforced here in Postgres,
-- not just hidden in the UI, so a student can't get around it by tampering
-- with the page. Mirrors the assignments/submissions RLS pattern.

create table if not exists public.weekly_tests (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  title text not null,
  pdf_path text not null,
  closes_at timestamptz not null,
  created_at timestamptz default now()
);

alter table public.weekly_tests enable row level security;

drop policy if exists "Students can view their cohort's weekly tests" on public.weekly_tests;
create policy "Students can view their cohort's weekly tests"
  on public.weekly_tests for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = weekly_tests.cohort_id
    )
  );

drop policy if exists "Teacher can manage weekly tests" on public.weekly_tests;
create policy "Teacher can manage weekly tests"
  on public.weekly_tests for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.weekly_tests to authenticated;
grant all on table public.weekly_tests to service_role;

create table if not exists public.weekly_test_submissions (
  id uuid default gen_random_uuid() primary key,
  weekly_test_id uuid not null references public.weekly_tests(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  file_paths text[] not null default '{}',
  submitted_at timestamptz default now(),
  unique (weekly_test_id, student_id)
);

alter table public.weekly_test_submissions enable row level security;

-- The actual cheat-prevention: the insert is rejected once closes_at has
-- passed, regardless of what the client sends. The UI also hides the upload
-- form after the cutoff, but this check is the real boundary.
drop policy if exists "Students can submit before the cutoff" on public.weekly_test_submissions;
create policy "Students can submit before the cutoff"
  on public.weekly_test_submissions for insert
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.weekly_tests wt
      where wt.id = weekly_test_submissions.weekly_test_id
      and now() < wt.closes_at
    )
  );

drop policy if exists "Students can view their own weekly test submissions" on public.weekly_test_submissions;
create policy "Students can view their own weekly test submissions"
  on public.weekly_test_submissions for select
  using (student_id = auth.uid());

drop policy if exists "Teacher can view all weekly test submissions" on public.weekly_test_submissions;
create policy "Teacher can view all weekly test submissions"
  on public.weekly_test_submissions for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert on table public.weekly_test_submissions to authenticated;
grant all on table public.weekly_test_submissions to service_role;

-- Private bucket for the teacher's test-paper PDFs, mirroring the notes
-- bucket exactly. Student photo uploads reuse the existing 'submissions'
-- bucket (path <student uid>/wt-<weekly_test id>/<timestamp>-<filename>) —
-- its policies already key off the first path segment being the uploader's
-- own uid, so no new storage policy is needed for that part.
insert into storage.buckets (id, name, public)
values ('weekly-tests', 'weekly-tests', false)
on conflict (id) do nothing;

drop policy if exists "Teacher can upload weekly test files" on storage.objects;
create policy "Teacher can upload weekly test files"
  on storage.objects for insert
  with check (bucket_id = 'weekly-tests' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can delete weekly test files" on storage.objects;
create policy "Teacher can delete weekly test files"
  on storage.objects for delete
  using (bucket_id = 'weekly-tests' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can read all weekly test files" on storage.objects;
create policy "Teacher can read all weekly test files"
  on storage.objects for select
  using (bucket_id = 'weekly-tests' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

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
    )
  );
