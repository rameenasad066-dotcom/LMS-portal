-- Study With Rameen · notification bell — unread announcements (2026-10-04)
--
-- The student topnav bell was a demo button with a hardcoded "2 unread"
-- badge. It now counts announcements posted after the student last opened
-- the bell. One row per student; student-notifications.js sets
-- last_seen_at to the newest announcement's created_at (never the device
-- clock) whenever the panel is opened.
--
-- Safe to re-run.

create table if not exists public.announcement_reads (
  student_id uuid primary key references public.students(id) on delete cascade,
  last_seen_at timestamptz not null
);

alter table public.announcement_reads enable row level security;

drop policy if exists "Students can view their own announcement reads" on public.announcement_reads;
create policy "Students can view their own announcement reads"
  on public.announcement_reads for select
  using (student_id = auth.uid());

drop policy if exists "Students can insert their own announcement reads" on public.announcement_reads;
create policy "Students can insert their own announcement reads"
  on public.announcement_reads for insert
  with check (student_id = auth.uid());

-- upsert() plans as INSERT ... ON CONFLICT DO UPDATE, which needs UPDATE
-- privilege + policy even for a first-ever row — the watched_lectures bug.
drop policy if exists "Students can update their own announcement reads" on public.announcement_reads;
create policy "Students can update their own announcement reads"
  on public.announcement_reads for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Read-only for the teacher, so "View as a student" shows that student's
-- real unread state. Preview mode never writes.
drop policy if exists "Teacher can view all announcement reads" on public.announcement_reads;
create policy "Teacher can view all announcement reads"
  on public.announcement_reads for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update on table public.announcement_reads to authenticated;
grant all on table public.announcement_reads to service_role;
