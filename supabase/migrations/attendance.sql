-- Study With Rameen · progress system, Phase 4
-- Manual attendance — one row per (class_date, student). Rameen marks the
-- whole cohort present/absent/late for a given day's class (Zoom/WhatsApp
-- happens outside the portal; this is just the record of who showed up).
-- Same RLS shape as `marks`: teacher manages everything, a student sees
-- only their own rows.

create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  class_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late')),
  marked_at timestamptz default now(),
  unique (class_date, student_id)
);

alter table public.attendance enable row level security;

drop policy if exists "Teacher can manage attendance" on public.attendance;
create policy "Teacher can manage attendance"
  on public.attendance for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (student_id = auth.uid());

grant select, insert, update, delete on table public.attendance to authenticated;
grant all on table public.attendance to service_role;
