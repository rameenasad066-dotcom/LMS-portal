-- Study With Rameen · Single-device login enforcement (students only)
-- One row per student holding whichever random token their most recent
-- login/password-reset generated. session-guard.js compares this to the
-- token in the browser's localStorage; a mismatch means another device
-- has since logged in, so the older device gets signed out. The teacher
-- account is deliberately not covered by this table or its policy.

create table if not exists public.active_sessions (
  student_id uuid primary key references public.students(id) on delete cascade,
  session_token uuid not null,
  updated_at timestamptz default now()
);

alter table public.active_sessions enable row level security;

drop policy if exists "Students can manage their own session token" on public.active_sessions;
create policy "Students can manage their own session token"
  on public.active_sessions for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

grant select, insert, update on table public.active_sessions to authenticated;
grant all on table public.active_sessions to service_role;
