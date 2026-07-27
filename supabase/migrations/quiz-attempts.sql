-- Study With Rameen · Practice Quiz tracking
-- Deliberately its own isolated table, with zero foreign keys into
-- `assignments`/`marks` and zero use anywhere in get_scoreboard(),
-- equalThirdsAvg(), or attendancePct() — practice quizzes are informal
-- self-testing and must never affect a student's real grade, band, or
-- average. This table exists purely so Rameen can see who is practising
-- and how they're doing, separately from real grading.
--
-- One row per completed attempt (retakes insert a new row, never overwrite,
-- so she sees the full practice history). `answers` stores a full
-- question-by-question breakdown, including the student's own typed text
-- for short-answer questions — those are self-marked by the student
-- clicking "I got it right/wrong", which isn't fully reliable, so she asked
-- to be able to see their actual answer and spot-check it herself.

create table if not exists public.quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  quiz_id text not null,
  quiz_title text not null,
  subject text not null,
  score int not null,
  total int not null,
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz default now()
);

alter table public.quiz_attempts enable row level security;

drop policy if exists "Students can record their own quiz attempts" on public.quiz_attempts;
create policy "Students can record their own quiz attempts"
  on public.quiz_attempts for insert
  with check (student_id = auth.uid());

drop policy if exists "Students can view their own quiz attempts" on public.quiz_attempts;
create policy "Students can view their own quiz attempts"
  on public.quiz_attempts for select
  using (student_id = auth.uid());

drop policy if exists "Teacher can view all quiz attempts" on public.quiz_attempts;
create policy "Teacher can view all quiz attempts"
  on public.quiz_attempts for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert on table public.quiz_attempts to authenticated;
grant all on table public.quiz_attempts to service_role;
