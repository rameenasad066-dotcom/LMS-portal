-- Study With Rameen · Video Lectures (real) — replaces the hardcoded demo
-- LECTURES array in data.js. Videos live on Rameen's own Google Drive
-- (shared "Anyone with the link can view"); this table just stores the
-- link + metadata, same shape/RLS pattern as `notes`. chapter_id is a real
-- FK into `chapters`, same as notes.chapter_id.

create table if not exists public.lectures (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  subject text not null,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  title text not null,
  video_url text not null,
  duration text,
  created_at timestamptz default now()
);

alter table public.lectures enable row level security;

drop policy if exists "Students can view their cohort's lectures" on public.lectures;
create policy "Students can view their cohort's lectures"
  on public.lectures for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = lectures.cohort_id
    )
  );

drop policy if exists "Teacher can manage lectures" on public.lectures;
create policy "Teacher can manage lectures"
  on public.lectures for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.lectures to authenticated;
grant all on table public.lectures to service_role;
