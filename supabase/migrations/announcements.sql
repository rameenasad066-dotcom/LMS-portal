-- Study With Rameen · announcements table
-- Cohort-scoped broadcasts. Students only ever see announcements for their
-- own cohort; only the teacher can post.

create table public.announcements (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  tag text not null default 'info',
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

alter table public.announcements enable row level security;

-- Students can read only announcements for their own cohort
create policy "Students can view their cohort's announcements"
  on public.announcements for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = announcements.cohort_id
    )
  );

-- Teacher can read everything, across all cohorts
create policy "Teacher can view all announcements"
  on public.announcements for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

-- Only the teacher can post
create policy "Teacher can insert announcements"
  on public.announcements for insert
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

-- Base table grants — learned the hard way that Supabase doesn't always
-- auto-grant these; RLS above still restricts to the policies.
grant select, insert on table public.announcements to authenticated;
grant all on table public.announcements to service_role;
