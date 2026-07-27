-- Study With Rameen · re-apply the teacher policy + grants on assignments
-- Targeted fix for "new row violates row-level security policy for table
-- assignments" — safe to run, just re-asserts what should already be there.

drop policy if exists "Teacher can manage assignments" on public.assignments;
create policy "Teacher can manage assignments"
  on public.assignments for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.assignments to authenticated;
grant all on table public.assignments to service_role;
