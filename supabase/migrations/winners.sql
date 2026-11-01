-- Study With Rameen · Monthly winner notices (2026-11-01)
--
-- One row per winner notice. A student with an unseen row gets the full-screen
-- celebration when they open the portal; pressing "Continue" stamps seen_at so
-- it never shows again, on any device. Students can read their own rows and
-- stamp seen_at on them, nothing else: they can't create a notice for
-- themselves, change the prize, or see anyone else's. Only the teacher (or the
-- SQL editor) adds notices, so "only show on these accounts" is enforced by the
-- data itself, not by a name check in the page.
--
-- Safe to re-run.

create table if not exists public.winners (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  month_label text not null,
  prize_amount int not null check (prize_amount > 0),
  created_at timestamptz default now(),
  seen_at timestamptz
);

create index if not exists winners_unseen_idx on public.winners (student_id) where seen_at is null;

alter table public.winners enable row level security;

drop policy if exists "Students can view their own winner notices" on public.winners;
create policy "Students can view their own winner notices"
  on public.winners for select
  using (student_id = auth.uid());

drop policy if exists "Students can mark their own winner notices seen" on public.winners;
create policy "Students can mark their own winner notices seen"
  on public.winners for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "Teacher can manage winner notices" on public.winners;
create policy "Teacher can manage winner notices"
  on public.winners for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

-- Column-level: through the API an update can only ever touch seen_at, so a
-- student can't edit their own prize even though the row is theirs.
revoke all on table public.winners from anon, authenticated;
grant select, insert, delete on table public.winners to authenticated;
grant update (seen_at) on table public.winners to authenticated;
grant all on table public.winners to service_role;

notify pgrst, 'reload schema';
