-- Study With Rameen · notes table + storage bucket
-- Real, cohort-scoped PDF notes. Students only see/download their own
-- cohort's notes; only the teacher can upload.

create table if not exists public.notes (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  subject text not null,
  chapter text not null,
  title text not null,
  storage_path text not null,
  size_bytes bigint,
  created_at timestamptz default now()
);

alter table public.notes enable row level security;

drop policy if exists "Students can view their cohort's notes" on public.notes;
create policy "Students can view their cohort's notes"
  on public.notes for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = notes.cohort_id
    )
  );

drop policy if exists "Teacher can view all notes" on public.notes;
create policy "Teacher can view all notes"
  on public.notes for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can insert notes" on public.notes;
create policy "Teacher can insert notes"
  on public.notes for insert
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can delete notes" on public.notes;
create policy "Teacher can delete notes"
  on public.notes for delete
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, delete on table public.notes to authenticated;
grant all on table public.notes to service_role;

-- Storage bucket for the actual PDF files. Private (not public) — access is
-- controlled entirely by the storage policies below, mirroring the notes
-- table's cohort scoping.
insert into storage.buckets (id, name, public)
values ('notes', 'notes', false)
on conflict (id) do nothing;

drop policy if exists "Teacher can upload note files" on storage.objects;
create policy "Teacher can upload note files"
  on storage.objects for insert
  with check (bucket_id = 'notes' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can delete note files" on storage.objects;
create policy "Teacher can delete note files"
  on storage.objects for delete
  using (bucket_id = 'notes' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can read all note files" on storage.objects;
create policy "Teacher can read all note files"
  on storage.objects for select
  using (bucket_id = 'notes' and auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

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
    )
  );
