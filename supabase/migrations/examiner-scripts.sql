-- Study With Rameen · Examiner Scripts (2026-10-25)
--
-- Marked examiner scripts the teacher uploads as one PDF each, shown to
-- students as cards (subject, marks, grade) that open inside the portal.
-- Visible to every student in the script's cohort who takes its course —
-- the same rule notes use — and enforced here, not just hidden in the page.
--
-- `subjects` holds expanded subject ids (a course = its subjects, see COURSES
-- in supabase-config.js), so the visibility test is the same overlap used for
-- assignments and weekly tests.
--
-- Safe to re-run.

create table if not exists public.examiner_scripts (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  subjects text[] not null,
  title text not null,
  session text,
  marks int not null check (marks >= 0),
  max_marks int not null check (max_marks > 0),
  grade text not null check (grade in ('A*', 'A', 'B', 'C', 'D', 'E', 'U')),
  pdf_path text not null,
  size_bytes bigint,
  created_at timestamptz default now(),
  check (marks <= max_marks)
);

create index if not exists examiner_scripts_cohort_idx on public.examiner_scripts (cohort_id, created_at desc);

alter table public.examiner_scripts enable row level security;

drop policy if exists "Students can view their cohort's examiner scripts" on public.examiner_scripts;
create policy "Students can view their cohort's examiner scripts"
  on public.examiner_scripts for select
  using (
    exists (
      select 1 from public.students s
      where s.id = auth.uid()
        and s.cohort_id = examiner_scripts.cohort_id
        and s.subjects && examiner_scripts.subjects
    )
  );

drop policy if exists "Teacher can manage examiner scripts" on public.examiner_scripts;
create policy "Teacher can manage examiner scripts"
  on public.examiner_scripts for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.examiner_scripts to authenticated;
grant all on table public.examiner_scripts to service_role;

-- Private bucket for the PDFs. Reading follows the table's own rule via the
-- script row that points at the file, so a student can only fetch a file for
-- a script they're allowed to see.
insert into storage.buckets (id, name, public)
values ('examiner-scripts', 'examiner-scripts', false)
on conflict (id) do nothing;

drop policy if exists "Teacher can upload examiner script files" on storage.objects;
create policy "Teacher can upload examiner script files"
  on storage.objects for insert
  with check (bucket_id = 'examiner-scripts' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can delete examiner script files" on storage.objects;
create policy "Teacher can delete examiner script files"
  on storage.objects for delete
  using (bucket_id = 'examiner-scripts' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can read all examiner script files" on storage.objects;
create policy "Teacher can read all examiner script files"
  on storage.objects for select
  using (bucket_id = 'examiner-scripts' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Students can read their examiner script files" on storage.objects;
create policy "Students can read their examiner script files"
  on storage.objects for select
  using (
    bucket_id = 'examiner-scripts'
    and exists (
      select 1 from public.examiner_scripts es
      join public.students s on s.cohort_id = es.cohort_id and s.subjects && es.subjects
      where es.pdf_path = storage.objects.name
        and s.id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
