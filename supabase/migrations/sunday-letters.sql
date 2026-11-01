-- Study With Rameen · Sunday Letter (2026-11-02)
--
-- A short weekly letter the teacher writes to one cohort. Students see the
-- newest one as a pink banner on their dashboard, plus a one-time pop-up when
-- it's new, and can re-read earlier ones.
--
--   sunday_letters   one row per letter (title, one-line preview, body)
--   letter_views     per student per letter: when the pop-up was seen and
--                    when the letter was opened (powers "pop up once" and
--                    the teacher's "opened by N students")
--
-- Students read only their own cohort's letters and only their own view rows;
-- the teacher writes letters and reads everything. Safe to re-run.

create table if not exists public.sunday_letters (
  id uuid default gen_random_uuid() primary key,
  cohort_id text not null,
  title text not null check (char_length(title) between 1 and 120),
  preview text not null check (char_length(preview) between 1 and 200),
  body text not null check (char_length(body) between 1 and 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sunday_letters_cohort_idx on public.sunday_letters (cohort_id, created_at desc);

create table if not exists public.letter_views (
  letter_id uuid not null references public.sunday_letters(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  seen_at timestamptz not null default now(),
  opened_at timestamptz,
  primary key (letter_id, student_id)
);

alter table public.sunday_letters enable row level security;
alter table public.letter_views enable row level security;

drop policy if exists "Students can read their cohort's letters" on public.sunday_letters;
create policy "Students can read their cohort's letters"
  on public.sunday_letters for select
  using (cohort_id = (select s.cohort_id from public.students s where s.id = auth.uid()));

drop policy if exists "Teacher can manage letters" on public.sunday_letters;
create policy "Teacher can manage letters"
  on public.sunday_letters for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Students can view their own letter views" on public.letter_views;
create policy "Students can view their own letter views"
  on public.letter_views for select using (student_id = auth.uid());

drop policy if exists "Students can add their own letter views" on public.letter_views;
create policy "Students can add their own letter views"
  on public.letter_views for insert
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.sunday_letters l where l.id = letter_id)
  );

drop policy if exists "Students can update their own letter views" on public.letter_views;
create policy "Students can update their own letter views"
  on public.letter_views for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "Teacher can view letter views" on public.letter_views;
create policy "Teacher can view letter views"
  on public.letter_views for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

revoke all on table public.sunday_letters, public.letter_views from anon, authenticated;
grant select, insert, update, delete on table public.sunday_letters to authenticated;
-- upsert() needs insert AND update (the watched_lectures lesson).
grant select, insert, update on table public.letter_views to authenticated;
grant all on table public.sunday_letters, public.letter_views to service_role;

notify pgrst, 'reload schema';
