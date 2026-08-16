-- Study With Rameen · watched lectures (2026-08-17)
--
-- The Syllabus Tracker's "watched" state was localStorage-only (swr_student
-- blob, key w_<id>) — a per-device flag with no server record at all. That
-- meant it never synced across a student's own devices, and it was
-- ALWAYS 0% when Rameen checked from her own browser (dashboard or
-- "View as a student" preview), since preview mode runs in her browser,
-- which never had any student's local watch history. This makes "watched"
-- real: one row per (student, lecture), readable by the teacher too.

create table if not exists public.watched_lectures (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  watched_at timestamptz default now(),
  unique (student_id, lecture_id)
);

alter table public.watched_lectures enable row level security;

drop policy if exists "Students can view their own watched lectures" on public.watched_lectures;
create policy "Students can view their own watched lectures"
  on public.watched_lectures for select
  using (student_id = auth.uid());

drop policy if exists "Students can mark their own lectures watched" on public.watched_lectures;
create policy "Students can mark their own lectures watched"
  on public.watched_lectures for insert
  with check (student_id = auth.uid());

drop policy if exists "Teacher can view all watched lectures" on public.watched_lectures;
create policy "Teacher can view all watched lectures"
  on public.watched_lectures for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert on table public.watched_lectures to authenticated;
grant all on table public.watched_lectures to service_role;
