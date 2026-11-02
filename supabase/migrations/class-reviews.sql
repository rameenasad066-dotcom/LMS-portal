-- Study With Rameen · Class reviews (2026-11-02)
--
-- Students leave a private review of their classes (a 1–5 rating, what they
-- think, anything they'd like changed). Only the teacher can read them; a
-- student sees just their own. read_at drives the "new review" card on the
-- teacher dashboard.
--
-- A student can only file a review as themselves and for their own cohort,
-- and can't edit or delete it afterwards. The teacher can only change read_at
-- (column-level grant) or delete. Safe to re-run.

create table if not exists public.class_reviews (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  cohort_id text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  change_request text check (char_length(change_request) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists class_reviews_cohort_idx on public.class_reviews (cohort_id, created_at desc);
create index if not exists class_reviews_unread_idx on public.class_reviews (created_at) where read_at is null;

alter table public.class_reviews enable row level security;

drop policy if exists "Students can add their own review" on public.class_reviews;
create policy "Students can add their own review"
  on public.class_reviews for insert
  with check (
    student_id = auth.uid()
    and cohort_id = (select s.cohort_id from public.students s where s.id = auth.uid())
    and read_at is null
  );

drop policy if exists "Students can view their own reviews" on public.class_reviews;
create policy "Students can view their own reviews"
  on public.class_reviews for select using (student_id = auth.uid());

drop policy if exists "Teacher can view reviews" on public.class_reviews;
create policy "Teacher can view reviews"
  on public.class_reviews for select
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can mark reviews read" on public.class_reviews;
create policy "Teacher can mark reviews read"
  on public.class_reviews for update
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

drop policy if exists "Teacher can delete reviews" on public.class_reviews;
create policy "Teacher can delete reviews"
  on public.class_reviews for delete
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

revoke all on table public.class_reviews from anon, authenticated;
grant select, insert, delete on table public.class_reviews to authenticated;
grant update (read_at) on table public.class_reviews to authenticated;
grant all on table public.class_reviews to service_role;

notify pgrst, 'reload schema';
