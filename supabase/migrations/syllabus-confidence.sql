-- Study With Rameen · Syllabus checklist with confidence (2026-11-01)
--
-- One row per (student, syllabus topic): how confident the student says they
-- are. level 0 = not started, 1 = shaky, 2 = confident. A topic with no row
-- counts as not started. The "topics" are the existing chapters/sub-chapters,
-- so nothing new has to be authored.
--
-- Students read and write only their own rows; the teacher reads everyone's
-- (that is what powers her class-wide view). The portal saves with upsert(),
-- which Postgres plans as INSERT .. ON CONFLICT DO UPDATE, so select, insert
-- AND update all have to be granted (the watched_lectures lesson).
--
-- Safe to re-run.

create table if not exists public.syllabus_confidence (
  student_id uuid not null references public.students(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  level smallint not null check (level between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (student_id, chapter_id)
);

create index if not exists syllabus_confidence_chapter_idx on public.syllabus_confidence (chapter_id);

alter table public.syllabus_confidence enable row level security;

drop policy if exists "Students can view their own syllabus confidence" on public.syllabus_confidence;
create policy "Students can view their own syllabus confidence"
  on public.syllabus_confidence for select
  using (student_id = auth.uid());

drop policy if exists "Students can add their own syllabus confidence" on public.syllabus_confidence;
create policy "Students can add their own syllabus confidence"
  on public.syllabus_confidence for insert
  with check (student_id = auth.uid());

drop policy if exists "Students can change their own syllabus confidence" on public.syllabus_confidence;
create policy "Students can change their own syllabus confidence"
  on public.syllabus_confidence for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "Teacher can manage syllabus confidence" on public.syllabus_confidence;
create policy "Teacher can manage syllabus confidence"
  on public.syllabus_confidence for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

revoke all on table public.syllabus_confidence from anon, authenticated;
grant select, insert, update on table public.syllabus_confidence to authenticated;
grant all on table public.syllabus_confidence to service_role;

notify pgrst, 'reload schema';
