-- Study With Rameen · progress system, Phase 1
-- Assignments + student submissions + marks, all cohort-scoped with the
-- same RLS pattern proven on notes/announcements: students see only their
-- own rows, only the teacher creates/marks. Also gives the teacher SELECT
-- on the whole students table — needed by the marking queue (and until now
-- only the Edge Function's service role could list students).

create table if not exists public.assignments (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  type text not null default 'homework',
  title text not null,
  due_date date not null,
  max_marks int not null,
  created_at timestamptz default now()
);

alter table public.assignments enable row level security;

drop policy if exists "Students can view their cohort's assignments" on public.assignments;
create policy "Students can view their cohort's assignments"
  on public.assignments for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = assignments.cohort_id
    )
  );

drop policy if exists "Teacher can manage assignments" on public.assignments;
create policy "Teacher can manage assignments"
  on public.assignments for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.assignments to authenticated;
grant all on table public.assignments to service_role;

create table if not exists public.submissions (
  id uuid default gen_random_uuid() primary key,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  file_paths text[] not null default '{}',
  submitted_at timestamptz default now(),
  unique (assignment_id, student_id)
);

alter table public.submissions enable row level security;

drop policy if exists "Students can submit their own work" on public.submissions;
create policy "Students can submit their own work"
  on public.submissions for insert
  with check (student_id = auth.uid());

drop policy if exists "Students can view their own submissions" on public.submissions;
create policy "Students can view their own submissions"
  on public.submissions for select
  using (student_id = auth.uid());

drop policy if exists "Teacher can view all submissions" on public.submissions;
create policy "Teacher can view all submissions"
  on public.submissions for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert on table public.submissions to authenticated;
grant all on table public.submissions to service_role;

-- Marks live separately from submissions so the teacher can enter a mark
-- even when there was no portal upload (e.g. weekly tests submitted on
-- WhatsApp).
create table if not exists public.marks (
  id uuid default gen_random_uuid() primary key,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  marks numeric not null,
  feedback text,
  marked_at timestamptz default now(),
  unique (assignment_id, student_id)
);

alter table public.marks enable row level security;

drop policy if exists "Students can view their own marks" on public.marks;
create policy "Students can view their own marks"
  on public.marks for select
  using (student_id = auth.uid());

drop policy if exists "Teacher can manage marks" on public.marks;
create policy "Teacher can manage marks"
  on public.marks for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.marks to authenticated;
grant all on table public.marks to service_role;

drop policy if exists "Teacher can view all students" on public.students;
create policy "Teacher can view all students"
  on public.students for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

-- Private bucket for submission photos/PDFs. Path convention is
-- <student uid>/<assignment id>/<timestamp>-<filename>, so the first path
-- segment is the uploader's own uid — that's what the policies check.
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

drop policy if exists "Students can upload their own submission files" on storage.objects;
create policy "Students can upload their own submission files"
  on storage.objects for insert
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Students can read their own submission files" on storage.objects;
create policy "Students can read their own submission files"
  on storage.objects for select
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Teacher can read all submission files" on storage.objects;
create policy "Teacher can read all submission files"
  on storage.objects for select
  using (bucket_id = 'submissions' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);
